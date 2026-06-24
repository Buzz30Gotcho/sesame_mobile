import express from 'express';
import { calculatePoints, calculateVehiclePrice, nextAmbassadorLevel } from '../lib/rules';
import { query } from '../db';
import { getSystemParameters, getSystemParameter } from '../lib/params';
import { sendPushNotification } from '../lib/pushNotifications';

import { randomInt } from 'crypto';
import { crediterPaliersParrainage, executerSanctionsEnAttente, distanceRoutiereKm } from '../lib/courseHelpers';
import { ownCourseParam, ownActorBodyQuery, resolveIdentity, AuthedRequest } from '../middleware/auth';
import { codeLimiter } from '../middleware/rateLimit';

async function notifyChauffeursDisponibles(vehicule_type: string, adresse_depart: string, adresse_destination: string, montant: number) {
    const result = await query(
        `SELECT push_token FROM chauffeurs WHERE disponible = true AND vehicule_type = $1 AND push_token IS NOT NULL`,
        [vehicule_type]
    );
    const body = `${adresse_depart} → ${adresse_destination} · ${Number(montant).toFixed(2)} €`;
    for (const row of result.rows) {
        await sendPushNotification(row.push_token, 'Nouvelle course', body).catch(() => {});
    }
}

const router = express.Router();

// Propriété : pour /:id et /:id/annuler, le token doit être partie de la course.
router.param('id', ownCourseParam);
// Cohérence : l'ambassadeur_id / chauffeur_id envoyé (body/query) doit être celui du token.
router.use(ownActorBodyQuery);

function makeReference(prefix: string) {
    const ts = Date.now().toString().slice(-8);
    const rand = randomInt(10000).toString().padStart(4, '0');
    return `${prefix}-${ts}-${rand}`;
}

// Paramètres de tarification (forfaits, seuils, prix/km) lus depuis les paramètres système.
function buildPricingParams(sysParams: Record<string, any>) {
    return {
        berline_forfait: Number(sysParams.berline_forfait),
        berline_seuil_km: Number(sysParams.berline_seuil_km),
        berline_prix_km: Number(sysParams.berline_prix_km),
        van_forfait: Number(sysParams.van_forfait),
        van_seuil_km: Number(sysParams.van_seuil_km),
        van_prix_km: Number(sysParams.van_prix_km),
    };
}

// Estimation distance + prix CÔTÉ SERVEUR (géocodage BAN + distance OSRM).
// Appelée par l'app pendant la saisie : elle n'appelle plus OSRM directement.
router.post('/estimer', async (req, res) => {
    const { adresse_depart, adresse_destination } = req.body;
    if (!adresse_depart || !adresse_destination) {
        return res.status(400).json({ error: 'Adresses de départ et de destination requises' });
    }
    const kilometrage = await distanceRoutiereKm(adresse_depart, adresse_destination);
    if (kilometrage == null) {
        return res.status(422).json({ error: 'Impossible de calculer la distance pour ces adresses' });
    }
    const pricingParams = buildPricingParams(await getSystemParameters());
    res.json({
        kilometrage,
        prix_berline: calculateVehiclePrice('berline', kilometrage, pricingParams),
        prix_van: calculateVehiclePrice('van', kilometrage, pricingParams),
    });
});

router.post('/creer', async (req, res) => {
    const { ambassadeur_id, adresse_depart, adresse_destination, vehicule_type, kilometrage, type_course } = req.body;
    if (!ambassadeur_id || !adresse_depart || !adresse_destination || !vehicule_type || kilometrage == null) {
        return res.status(400).json({ error: 'Données de course incomplètes' });
    }

    const courseType = type_course || 'immediate';

    // Check if immediate mode is allowed
    if (courseType === 'immediate') {
        const isImmediateEnabled = await getSystemParameter('mode_course_immediate', false);
        if (!isImmediateEnabled) {
            return res.status(403).json({ error: 'Le mode course immédiate est actuellement désactivé par l\'administration. Veuillez utiliser le mode réservation.' });
        }
    }

    // Vérifier restriction de commande
    const restrictionResult = await query(
        'SELECT restriction_commande_jusqu_au FROM ambassadeurs WHERE id = $1',
        [ambassadeur_id]
    );
    const restriction = restrictionResult.rows[0]?.restriction_commande_jusqu_au;
    if (restriction && new Date(restriction) > new Date()) {
        const dateStr = new Date(restriction).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return res.status(403).json({ error: `Commande suspendue jusqu'au ${dateStr}. Trop d'annulations récentes.` });
    }

    // Vérifier limite 5 courses simultanées
    const activeLimitResult = await query(
        `SELECT count(*) AS count FROM courses
         WHERE ambassadeur_id = $1 AND statut IN ('recherche','acceptee','en_route','code_valide','en_cours')`,
        [ambassadeur_id]
    );
    if (Number(activeLimitResult.rows[0]?.count) >= 5) {
        return res.status(403).json({ error: 'LIMIT_5_COURSES' });
    }

    const sysParams = await getSystemParameters();
    const pricingParams = buildPricingParams(sysParams);

    // Kilométrage recalculé côté serveur (anti-fraude) ; repli sur la valeur envoyée
    // par l'app si OSRM/géocodage est momentanément indisponible.
    const kmServeur = await distanceRoutiereKm(adresse_depart, adresse_destination);
    const kmFinal = kmServeur ?? Number(kilometrage);

    const montant = calculateVehiclePrice(vehicule_type, kmFinal, pricingParams);
    const distanceKm = Number.isFinite(kmFinal) ? Math.round(kmFinal * 10) / 10 : null;
    const reference = makeReference('CRS');
    const points_attribues = calculatePoints(montant);

    const tauxGlobal = Number(sysParams.taux_commission_global ?? 20);

    const result = await query(
        'INSERT INTO courses(reference, ambassadeur_id, statut, type_course, adresse_depart, adresse_destination, vehicule_type, montant, distance_km, points_attribues, taux_commission_applique) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [reference, ambassadeur_id, 'recherche', courseType, adresse_depart, adresse_destination, vehicule_type, montant, distanceKm, points_attribues, tauxGlobal]
    );

    notifyChauffeursDisponibles(vehicule_type, adresse_depart, adresse_destination, montant).catch(() => {});

    res.status(201).json(result.rows[0]);
});

// Routes statiques AVANT /:id pour éviter la capture par le paramètre dynamique
router.get('/active', async (req, res) => {
    const r = req as AuthedRequest;
    let { ambassadeur_id, chauffeur_id } = req.query as { ambassadeur_id?: string; chauffeur_id?: string };
    // Non-admin : le périmètre est TOUJOURS borné à l'identité du token (jamais « toutes les courses »).
    if (!r.isAdmin) {
        const ident = await resolveIdentity(r);
        ambassadeur_id = ident.ambassadeurId ?? undefined;
        chauffeur_id = ident.chauffeurId ?? undefined;
        if (!ambassadeur_id && !chauffeur_id) return res.json([]);
    }
    let sql = `SELECT * FROM courses WHERE statut IN ('recherche','acceptee','en_route','code_valide','en_cours')`;
    const params: any[] = [];
    if (ambassadeur_id) { params.push(ambassadeur_id); sql += ` AND ambassadeur_id = $${params.length}`; }
    if (chauffeur_id) { params.push(chauffeur_id); sql += ` AND chauffeur_id = $${params.length}`; }
    const result = await query(sql, params);
    res.json(result.rows);
});

router.get('/historique', async (req, res) => {
    const r = req as AuthedRequest;
    let { ambassadeur_id } = req.query as { ambassadeur_id?: string };
    // Non-admin : périmètre borné à l'ambassadeur du token (sinon on exposerait l'historique global).
    if (!r.isAdmin) {
        const ident = await resolveIdentity(r);
        ambassadeur_id = ident.ambassadeurId ?? undefined;
        if (!ambassadeur_id) return res.json([]);
    }
    let sql = `SELECT * FROM courses WHERE statut IN ('terminee','annulee') ORDER BY date_fin DESC NULLS LAST, date_annulation DESC NULLS LAST LIMIT 100`;
    const params: any[] = [];
    if (ambassadeur_id) {
        sql = `SELECT * FROM courses WHERE statut IN ('terminee','annulee') AND ambassadeur_id = $1 ORDER BY date_fin DESC NULLS LAST, date_annulation DESC NULLS LAST LIMIT 100`;
        params.push(ambassadeur_id);
    }
    const result = await query(sql, params);
    res.json(result.rows);
});

router.get('/:id', async (req, res) => {
    const result = await query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Course introuvable' });
    res.json(result.rows[0]);
});

router.put('/:id/annuler', async (req, res) => {
    const { raison } = req.body;
    const courseResult = await query('SELECT * FROM courses WHERE id = $1', [req.params.id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    const annulePar = raison || 'ambassadeur';
    await query('UPDATE courses SET statut = $1, date_annulation = now(), annule_par = $2 WHERE id = $3', ['annulee', annulePar, req.params.id]);

    // Compensation ambassadeur si code déjà validé (PIVOT JURIDIQUE — specs §1.5)
    if (course.code_valide_at && course.ambassadeur_id && course.montant && (annulePar === 'chauffeur' || annulePar === 'admin')) {
        const pts = calculatePoints(Number(course.montant));
        if (pts > 0) {
            const ambResult = await query(
                `SELECT a.points_solde, a.type_ambassadeur, a.parrain_id, a.niveau,
                        EXISTS(SELECT 1 FROM sous_comptes_employes s WHERE s.utilisateur_id = a.utilisateur_id) AS est_sous_compte
                 FROM ambassadeurs a WHERE a.id = $1`,
                [course.ambassadeur_id]
            );
            const amb = ambResult.rows[0];
            // Employé (sous-compte Moral) exclu : aucune compensation en points (specs §1 Moral).
            if (amb && amb.type_ambassadeur !== 'moral' && !amb.est_sous_compte) {
                const solde_avant = Number(amb.points_solde || 0);
                const solde_apres = solde_avant + pts;
                const newLevel = nextAmbassadorLevel(solde_apres);
                await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, course.ambassadeur_id]);
                await query(
                    'INSERT INTO points_historique(ambassadeur_id, type, montant, solde_avant, solde_apres, course_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                    [course.ambassadeur_id, 'compensation', pts, solde_avant, solde_apres, req.params.id, `Compensation annulation après code validé — course ${course.reference}`]
                );
                await query('UPDATE courses SET compensation = true WHERE id = $1', [req.params.id]);
                // Parrainage paliers sur la compensation
                if (amb.parrain_id) {
                    await crediterPaliersParrainage(course.ambassadeur_id, amb.parrain_id, solde_apres, newLevel, req.params.id);
                }
                // Vérifier sanctions différées sur le nouveau solde
                await executerSanctionsEnAttente(course.ambassadeur_id);
                try {
                    const tokenRes = await query('SELECT push_token FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
                    const token = tokenRes.rows[0]?.push_token;
                    if (token) await sendPushNotification(token, 'Course terminée', `+${pts} points crédités.`, { type: 'COURSE_TERMINEE' });
                } catch { /* Non bloquant */ }
            }
        }
    }

    // Notification CHAUFFEUR_ANNULE à l'ambassadeur si c'est le chauffeur qui annule
    if (annulePar === 'chauffeur' && course.ambassadeur_id) {
        try {
            const ambTokenResult = await query('SELECT push_token FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
            const ambToken = ambTokenResult.rows[0]?.push_token;
            if (ambToken) {
                await sendPushNotification(ambToken, 'Chauffeur annulé', 'Relance automatique en cours...', { course_id: req.params.id });
            }
        } catch { /* Non bloquant */ }
    }

    // Sanctions ambassadeur si annulation par l'ambassadeur
    if (annulePar === 'ambassadeur' && course.ambassadeur_id) {
        const countResult = await query(
            `SELECT count(*) AS count FROM courses
             WHERE ambassadeur_id = $1
               AND annule_par = 'ambassadeur'
               AND date_annulation > now() - interval '30 days'`,
            [course.ambassadeur_id]
        );
        const count = Number(countResult.rows[0]?.count || 0);

        if (count >= 5) {
            await query(
                "UPDATE utilisateurs SET statut = 'suspendu' WHERE id = (SELECT utilisateur_id FROM ambassadeurs WHERE id = $1)",
                [course.ambassadeur_id]
            );
            // Proposition blacklist — confirmation admin obligatoire (specs §9.0)
            await query(
                `INSERT INTO blacklist_propositions(ambassadeur_id, motif, nb_annulations, statut)
                 VALUES ($1, '5 annulations en 30 jours', $2, 'en_attente_admin')
                 ON CONFLICT (ambassadeur_id) DO UPDATE SET nb_annulations = $2, updated_at = now()`,
                [course.ambassadeur_id, count]
            ).catch(() => {}); // table créée via migration
            return res.json({ success: true, sanction: 'suspension' });
        } else if (count >= 3) {
            await query(
                "UPDATE ambassadeurs SET restriction_commande_jusqu_au = now() + interval '24 hours' WHERE id = $1",
                [course.ambassadeur_id]
            );
            return res.json({ success: true, sanction: 'restriction_24h' });
        } else if (count === 1) {
            return res.json({ success: true, sanction: 'avertissement' });
        }
    }

    res.json({ success: true });
});

router.post('/reserver', async (req, res) => {
    const { ambassadeur_id, adresse_depart, adresse_destination, vehicule_type, kilometrage, date_reservation } = req.body;
    if (!ambassadeur_id || !adresse_depart || !adresse_destination || !vehicule_type || kilometrage == null || !date_reservation) {
        return res.status(400).json({ error: 'Données de réservation incomplètes' });
    }

    // Vérifier restriction de commande
    const restrictionResv = await query(
        'SELECT restriction_commande_jusqu_au FROM ambassadeurs WHERE id = $1',
        [ambassadeur_id]
    );
    const restrictionResv2 = restrictionResv.rows[0]?.restriction_commande_jusqu_au;
    if (restrictionResv2 && new Date(restrictionResv2) > new Date()) {
        const dateStr = new Date(restrictionResv2).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return res.status(403).json({ error: `Commande suspendue jusqu'au ${dateStr}. Trop d'annulations récentes.` });
    }

    // Vérifier limite 5 courses simultanées
    const activeLimitResv = await query(
        `SELECT count(*) AS count FROM courses
         WHERE ambassadeur_id = $1 AND statut IN ('recherche','acceptee','en_route','code_valide','en_cours')`,
        [ambassadeur_id]
    );
    if (Number(activeLimitResv.rows[0]?.count) >= 5) {
        return res.status(403).json({ error: 'LIMIT_5_COURSES' });
    }

    // Validate 1h minimum delay
    const minDelayHours = await getSystemParameter('delai_minimum_reservation_heures', 1);
    const reservationDate = new Date(date_reservation);
    const now = new Date();
    const diffHours = (reservationDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    if (diffHours < minDelayHours) {
        return res.status(400).json({ error: `Le délai minimum pour une réservation est de ${minDelayHours} heure(s).` });
    }

    const sysParams = await getSystemParameters();
    const pricingParams = buildPricingParams(sysParams);

    // Kilométrage recalculé côté serveur (anti-fraude) ; repli sur la valeur client.
    const kmServeur = await distanceRoutiereKm(adresse_depart, adresse_destination);
    const kmFinal = kmServeur ?? Number(kilometrage);

    const montant = calculateVehiclePrice(vehicule_type, kmFinal, pricingParams);
    const distanceKm = Number.isFinite(kmFinal) ? Math.round(kmFinal * 10) / 10 : null;
    const reference = makeReference('CRS');
    const points_attribues = calculatePoints(montant);

    const result = await query(
        'INSERT INTO courses(reference, ambassadeur_id, statut, type_course, adresse_depart, adresse_destination, vehicule_type, montant, distance_km, points_attribues, date_reservation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *',
        [reference, ambassadeur_id, 'recherche', 'reservation', adresse_depart, adresse_destination, vehicule_type, montant, distanceKm, points_attribues, date_reservation]
    );

    notifyChauffeursDisponibles(vehicule_type, adresse_depart, adresse_destination, montant).catch(() => {});

    res.status(201).json(result.rows[0]);
});

router.post('/chauffeur/valider-code', codeLimiter, async (req, res) => {
    const r = req as AuthedRequest;
    const { course_id, code } = req.body;
    if (!course_id || !code) return res.status(400).json({ error: 'course_id et code requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    // Propriété : seul le chauffeur assigné (ou un admin) peut valider le code pivot de cette course.
    if (!r.isAdmin) {
        const ident = await resolveIdentity(r);
        if (!ident.chauffeurId || course.chauffeur_id !== ident.chauffeurId) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
    }

    if (!course.code_validation || course.code_validation !== code) {
        return res.status(400).json({ error: 'Code invalide — contactez l\'Ambassadeur' });
    }

    await query('UPDATE courses SET statut = $1, code_valide_at = now() WHERE id = $2', ['code_valide', course_id]);
    res.json({ success: true, courseId: course_id, statut: 'code_valide' });
});

export default router;
