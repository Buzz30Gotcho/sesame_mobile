import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomInt, timingSafeEqual } from 'crypto';
import { query } from '../db';
import { sendPushNotification } from '../lib/pushNotifications';

import { JWT_SECRET } from '../config';
import { isYousignConfigured, envoyerContratFournisseur } from '../lib/yousignClient';

const router = express.Router();

// UUID sentinelle pour l'attribution des actions admin (compte admin unique partagé — pas d'id par opérateur).
const ADMIN_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

// Comparaison à temps constant (évite la fuite d'information par timing). Le différentiel de longueur
// reste observable mais n'aide pas à retrouver le secret.
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

// Login admin
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const adminPasswordPlain = process.env.ADMIN_PASSWORD; // legacy (clair) — toléré le temps de migrer
    if (!adminEmail || (!adminPasswordHash && !adminPasswordPlain)) {
        console.error('[admin/login] ADMIN_EMAIL ou ADMIN_PASSWORD_HASH non défini — login admin désactivé.');
        return res.status(500).json({ error: 'Configuration serveur incomplète' });
    }
    // Email comparé à temps constant. Mot de passe vérifié contre un hash bcrypt (ADMIN_PASSWORD_HASH,
    // recommandé) ou, à défaut, contre la valeur en clair héritée (ADMIN_PASSWORD).
    const emailOk = safeEqual(email, adminEmail);
    const passwordOk = adminPasswordHash
        ? await bcrypt.compare(password, adminPasswordHash)
        : safeEqual(password, adminPasswordPlain as string);
    if (!emailOk || !passwordOk) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign({ sub: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '4h' });
    res.json({ token });
});

// Middleware — protège toutes les routes admin suivantes
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
    try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

router.use(requireAdmin);

router.get('/dashboard', async (req, res) => {
    const kpis = {
        totalCourses: (await query('SELECT count(*) FROM courses')).rows[0].count,
        totalAmbassadeurs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'ambassadeur'")).rows[0].count,
        totalChauffeurs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'chauffeur'")).rows[0].count,
        pendingExchanges: (await query("SELECT count(*) FROM echanges WHERE statut = 'en_attente_admin'")).rows[0].count,
        ambassadeursSuspendus: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'ambassadeur' AND statut = 'suspendu'")).rows[0].count,
        kbis_expiring_soon: (await query(`
            SELECT count(*) FROM documents_chauffeur d
            JOIN chauffeurs c ON c.id = d.chauffeur_id
            JOIN utilisateurs u ON u.id = c.utilisateur_id
            WHERE d.type = 'kbis' AND d.statut = 'valide'
              AND d.date_expiration IS NOT NULL
              AND d.date_expiration::date <= (now() + interval '30 days')::date
              AND u.statut = 'actif'
        `)).rows[0].count,
    };
    res.json(kpis);
});

router.get('/echanges/en-attente', async (req, res) => {
    const result = await query('SELECT * FROM echanges WHERE statut = $1 ORDER BY remis_at DESC NULLS LAST', ['en_attente_admin']);
    res.json(result.rows);
});

router.put('/echanges/:id/valider', async (req, res) => {
    const { id } = req.params;
    const exchangeResult = await query(
        `SELECT e.*, o.validite_bon_mois FROM echanges e
         JOIN offres_boutique o ON o.id = e.offre_id
         WHERE e.id = $1`, [id]
    );
    if (!exchangeResult.rows.length) return res.status(404).json({ error: 'Bon introuvable' });
    const exchange = exchangeResult.rows[0];
    const months = Number(exchange.validite_bon_mois || 1);

    // Atomique : remis_at = now(), expire_at = remis_at + validite_bon_mois (même heure/minute exacte)
    await query(
        `UPDATE echanges SET statut = 'valide', remis_at = now(), expire_at = now() + ($1 || ' month')::interval WHERE id = $2`,
        [months, id]
    );

    // Notification BON_VALIDE à l'ambassadeur
    try {
        const tokenResult = await query(
            `SELECT a.push_token, o.nom AS nom_offre
             FROM echanges e
             JOIN ambassadeurs a ON a.id = e.ambassadeur_id
             JOIN offres_boutique o ON o.id = e.offre_id
             WHERE e.id = $1`,
            [id]
        );
        const row = tokenResult.rows[0];
        if (row?.push_token) {
            await sendPushNotification(row.push_token, 'Bon cadeau disponible !', 'Votre QR code est prêt.', { echange_id: id });
        }
    } catch { /* Non bloquant */ }

    res.json({ success: true });
});

router.put('/echanges/:id/refuser', async (req, res) => {
    const { id } = req.params;
    const exchangeResult = await query('SELECT * FROM echanges WHERE id = $1', [id]);
    const exchange = exchangeResult.rows[0];
    if (!exchange) return res.status(404).json({ error: 'Bon introuvable' });
    await query('UPDATE echanges SET statut = $1 WHERE id = $2', ['refuse', id]);
    await query('UPDATE ambassadeurs SET points_solde = points_solde + $1 WHERE id = $2', [exchange.points_deduits, exchange.ambassadeur_id]);
    res.json({ success: true });
});

router.put('/courses/:id/annuler', async (req, res) => {
    const { id } = req.params;
    const { raison } = req.body;
    const check = await query('SELECT id FROM courses WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Course introuvable' });
    await query('UPDATE courses SET statut = $1, date_annulation = now(), annule_par = $2 WHERE id = $3', ['annulee', raison || 'admin', id]);
    res.json({ success: true });
});

router.put('/courses/:id/assigner', async (req, res) => {
    const { id } = req.params;
    const { chauffeur_id } = req.body;
    if (!chauffeur_id) return res.status(400).json({ error: 'chauffeur_id requis' });
    const checkCourse = await query('SELECT id FROM courses WHERE id = $1', [id]);
    if (!checkCourse.rows.length) return res.status(404).json({ error: 'Course introuvable' });
    const checkChauffeur = await query('SELECT id FROM chauffeurs WHERE id = $1', [chauffeur_id]);
    if (!checkChauffeur.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    await query('UPDATE courses SET chauffeur_id = $1, statut = $2 WHERE id = $3', [chauffeur_id, 'acceptee', id]);
    res.json({ success: true });
});

// Alertes client absent en attente d'arbitrage (specs §9.00)
router.get('/alertes', async (req, res) => {
    const result = await query(`
        SELECT
            s.id AS sanction_id,
            s.course_id,
            s.decide_at AS signale_at,
            c.reference,
            c.adresse_depart,
            c.adresse_destination,
            c.montant,
            EXTRACT(EPOCH FROM (now() - s.decide_at)) AS secondes_attente,
            u_amb.prenom AS amb_prenom,
            u_amb.nom AS amb_nom,
            u_amb.telephone AS amb_telephone,
            u_ch.prenom AS chauffeur_prenom,
            u_ch.nom AS chauffeur_nom,
            u_ch.telephone AS chauffeur_telephone
        FROM sanctions_en_attente s
        JOIN courses c ON c.id = s.course_id
        JOIN ambassadeurs a ON a.id = s.ambassadeur_id
        JOIN utilisateurs u_amb ON u_amb.id = a.utilisateur_id
        LEFT JOIN chauffeurs ch ON ch.id = c.chauffeur_id
        LEFT JOIN utilisateurs u_ch ON u_ch.id = ch.utilisateur_id
        WHERE s.statut = 'en_attente'
          AND s.points = 0
          AND s.motif = 'Client absent signalé par chauffeur'
        ORDER BY s.decide_at ASC
    `);
    res.json(result.rows);
});

router.post('/alertes/:id/arbitrer', async (req, res) => {
    const { id } = req.params;
    const { action, points, indemnisation } = req.body;
    await query('UPDATE sanctions_en_attente SET statut = $1, execute_at = now() WHERE id = $2', ['execute', id]);

    // Notification INDEMNISATION au chauffeur si indemnisation accordée
    if (Number(indemnisation) > 0) {
        try {
            const row = await query(
                `SELECT ch.push_token
                 FROM sanctions_en_attente s
                 JOIN courses c ON c.id = s.course_id
                 JOIN chauffeurs ch ON ch.id = c.chauffeur_id
                 WHERE s.id = $1`,
                [id]
            );
            const token = row.rows[0]?.push_token;
            if (token) {
                await sendPushNotification(token, `+${Number(indemnisation).toFixed(2)} EUR crédités`, 'Indemnisation attente injustifiée.', { sanction_id: id });
            }
        } catch { /* Non bloquant */ }
    }

    res.json({ success: true, action, points, indemnisation });
});

router.post('/chat/:courseId/intervenir', async (req, res) => {
    const { courseId } = req.params;
    const { contenu } = req.body;
    if (!contenu || typeof contenu !== 'string' || !contenu.trim()) return res.status(400).json({ error: 'Contenu requis' });
    const texte = contenu.slice(0, 2000);
    const result = await query('INSERT INTO messages_chat(course_id, expediteur_type, expediteur_id, contenu) VALUES ($1,$2,$3,$4) RETURNING *', [courseId, 'admin', null, texte]);
    res.status(201).json(result.rows[0]);
});

router.get('/ambassadeurs', async (req, res) => {
    const mainResult = await query(
        `SELECT a.id::text AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                a.points_solde AS points, a.niveau, a.type_ambassadeur::text AS type,
                a.contrat_moral_signe, u.statut AS compte_statut,
                COALESCE(a.note_interne, NULL) AS note_interne,
                a.etablissement AS societe, a.siret, a.iban,
                a.responsable_legal_nom, u.created_at,
                NULL::text AS entreprise_nom, NULL::text AS entreprise_id
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY u.created_at DESC`
    );

    let sousComptes: any[] = [];
    try {
        const scResult = await query(
            `SELECT s.id::text AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                    0 AS points, NULL::text AS niveau, 'sous_compte'::text AS type,
                    FALSE AS contrat_moral_signe, u.statut AS compte_statut, NULL::text AS note_interne,
                    s.metier AS societe, s.created_at,
                    COALESCE(a2.etablissement, u2.prenom || ' ' || u2.nom) AS entreprise_nom, a2.id::text AS entreprise_id
             FROM sous_comptes_employes s
             JOIN utilisateurs u ON u.id = s.utilisateur_id
             JOIN ambassadeurs a2 ON a2.id = s.ambassadeur_moral_id
             JOIN utilisateurs u2 ON u2.id = a2.utilisateur_id
             ORDER BY s.created_at DESC`
        );
        sousComptes = scResult.rows;
    } catch {
        // table sous_comptes_employes absente — ignoré
    }

    // Un sous-compte possède aussi une ligne `ambassadeurs` (pour pouvoir commander),
    // il apparaîtrait donc 2 fois. On retire ces doublons du listing principal
    // pour ne garder que l'entrée « sous_compte » (qui porte l'info entreprise).
    const sousCompteUserIds = new Set(sousComptes.map(s => s.utilisateur_id));
    const mainSansSousComptes = mainResult.rows.filter(r => !sousCompteUserIds.has(r.utilisateur_id));

    res.json([...mainSansSousComptes, ...sousComptes]);
});

router.get('/chauffeurs', async (req, res) => {
    const result = await query(
        `SELECT c.id AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                c.disponible,
                concat(c.vehicule_type, ' ', c.vehicule_marque, ' ', c.vehicule_modele) AS vehicule,
                c.vehicule_type, c.taux_commission_override AS taux_commission, c.documents_valides,
                u.statut AS compte_statut, c.note_interne
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY u.nom ASC`
    );
    res.json(result.rows);
});

router.get('/chauffeurs/:id/documents', async (req, res) => {
    const result = await query(
        `SELECT d.id, d.type, d.fichier_recto_url, d.fichier_verso_url,
                d.date_expiration, d.statut, d.motif_refus, d.uploaded_at
         FROM documents_chauffeur d
         WHERE d.chauffeur_id = $1
         ORDER BY d.uploaded_at DESC`,
        [req.params.id]
    );

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const BUCKET = 'documents-kyc_sesame_chauffeur';

    const signUrl = async (storagePath: string | null) => {
        if (!storagePath) return null;
        try {
            const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ expiresIn: 3600 }),
            });
            if (!r.ok) return null;
            const { signedURL } = await r.json() as { signedURL: string };
            const path = signedURL.startsWith('/storage/v1') ? signedURL : `/storage/v1${signedURL}`;
            return `${SUPABASE_URL}${path}`;
        } catch { return null; }
    };

    const docs = await Promise.all(result.rows.map(async (doc) => ({
        ...doc,
        fichier_recto_url: await signUrl(doc.fichier_recto_url),
        fichier_verso_url: await signUrl(doc.fichier_verso_url),
    })));

    res.json(docs);
});

router.put('/documents/:id/valider', async (req, res) => {
    const { date_expiration, rc_circulation_mention_valide } = req.body;
    // RC Circulation : vérification mention "transport passagers à titre onéreux" obligatoire (specs §2)
    const docCheck = await query('SELECT type FROM documents_chauffeur WHERE id = $1', [req.params.id]);
    if (docCheck.rows[0]?.type === 'rc_circulation' && !rc_circulation_mention_valide) {
        return res.status(400).json({ error: 'La mention "transport passagers à titre onéreux" doit être confirmée avant de valider la RC Circulation.' });
    }
    await query(
        `UPDATE documents_chauffeur SET statut = 'valide', date_expiration = COALESCE($2, date_expiration) WHERE id = $1`,
        [req.params.id, date_expiration || null]
    );
    const doc = await query('SELECT chauffeur_id FROM documents_chauffeur WHERE id = $1', [req.params.id]);
    const chauffeurId = doc.rows[0]?.chauffeur_id;
    if (chauffeurId) {
        const docsOblig = ['carte_identite', 'carte_vtc', 'permis', 'carte_grise'];
        const valid = await query(
            `SELECT type FROM documents_chauffeur WHERE chauffeur_id = $1 AND statut = 'valide' AND type = ANY($2)`,
            [chauffeurId, docsOblig]
        );
        const tousValides = docsOblig.every(t => valid.rows.some((r: any) => r.type === t));
        if (tousValides) {
            await query('UPDATE chauffeurs SET documents_valides = true WHERE id = $1', [chauffeurId]);
            // Notification KYC complet
            try {
                const tokenRow = await query('SELECT push_token FROM chauffeurs WHERE id = $1', [chauffeurId]);
                const pushToken = tokenRow.rows[0]?.push_token;
                if (pushToken) {
                    await sendPushNotification(
                        pushToken,
                        'Profil validé !',
                        'Tous vos documents ont été approuvés. Vous pouvez accepter des courses.',
                        { type: 'kyc_valide' }
                    );
                }
            } catch { /* Non bloquant */ }
        } else {
            // Notification document individuel validé
            try {
                const tokenRow = await query('SELECT push_token FROM chauffeurs WHERE id = $1', [chauffeurId]);
                const pushToken = tokenRow.rows[0]?.push_token;
                if (pushToken) {
                    await sendPushNotification(
                        pushToken,
                        'Document approuvé',
                        'Un de vos documents a été validé. Déposez les documents restants.',
                        { type: 'kyc_doc_valide' }
                    );
                }
            } catch { /* Non bloquant */ }
        }
    }
    res.json({ success: true });
});

router.put('/documents/:id/refuser', async (req, res) => {
    const { motif } = req.body;
    await query(
        `UPDATE documents_chauffeur SET statut = 'refuse', motif_refus = $1 WHERE id = $2`,
        [motif || null, req.params.id]
    );
    const doc = await query('SELECT chauffeur_id FROM documents_chauffeur WHERE id = $1', [req.params.id]);
    const chauffeurId = doc.rows[0]?.chauffeur_id;
    if (chauffeurId) {
        await query('UPDATE chauffeurs SET documents_valides = false WHERE id = $1', [chauffeurId]);
        // Notification document refusé
        try {
            const tokenRow = await query('SELECT push_token FROM chauffeurs WHERE id = $1', [chauffeurId]);
            const pushToken = tokenRow.rows[0]?.push_token;
            if (pushToken) {
                await sendPushNotification(
                    pushToken,
                    'Document refusé',
                    motif ? `Motif : ${motif}. Merci de déposer un nouveau document.` : 'Un document a été refusé. Merci de le soumettre à nouveau.',
                    { type: 'kyc_doc_refuse' }
                );
            }
        } catch { /* Non bloquant */ }
    }
    res.json({ success: true });
});

router.get('/courses', async (req, res) => {
    const result = await query(
        `SELECT c.id, c.reference, c.statut, c.type_course AS type,
                c.adresse_depart, c.adresse_destination,
                c.montant::float AS montant,
                c.date_acceptation, c.date_fin, c.date_annulation,
                ua.prenom AS ambassadeur_prenom, ua.nom AS ambassadeur_nom,
                uc.prenom AS chauffeur_prenom, uc.nom AS chauffeur_nom
         FROM courses c
         LEFT JOIN ambassadeurs a ON a.id = c.ambassadeur_id
         LEFT JOIN utilisateurs ua ON ua.id = a.utilisateur_id
         LEFT JOIN chauffeurs ch ON ch.id = c.chauffeur_id
         LEFT JOIN utilisateurs uc ON uc.id = ch.utilisateur_id
         ORDER BY c.date_acceptation DESC NULLS LAST, c.date_annulation DESC NULLS LAST`
    );
    res.json(result.rows);
});

router.get('/sanctions', async (req, res) => {
    const result = await query(
        `SELECT s.id, s.points, s.motif, s.statut, s.decide_at, s.execute_at,
                c.reference AS course_reference,
                ua.prenom AS ambassadeur_prenom, ua.nom AS ambassadeur_nom
         FROM sanctions_en_attente s
         LEFT JOIN courses c ON c.id = s.course_id
         LEFT JOIN ambassadeurs a ON a.id = s.ambassadeur_id
         LEFT JOIN utilisateurs ua ON ua.id = a.utilisateur_id
         WHERE s.statut = 'en_attente'
         ORDER BY s.decide_at DESC`
    );
    res.json(result.rows);
});

router.get('/fournisseurs', async (req, res) => {
    const result = await query('SELECT id, nom_societe, statut, contrat_signe, bloque, legal_email FROM fournisseurs ORDER BY nom_societe ASC');
    res.json(result.rows);
});

// Propositions blacklist en attente de confirmation admin (specs §9.0)
router.get('/blacklist/propositions', async (req, res) => {
    const result = await query(`
        SELECT bp.id, bp.motif, bp.nb_annulations, bp.created_at,
               u.prenom, u.nom, u.email, u.telephone
        FROM blacklist_propositions bp
        JOIN ambassadeurs a ON a.id = bp.ambassadeur_id
        JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE bp.statut = 'en_attente_admin'
        ORDER BY bp.created_at DESC
    `);
    res.json(result.rows);
});

router.put('/blacklist/propositions/:id/confirmer', async (req, res) => {
    const { motif } = req.body;
    const prop = await query(
        `SELECT bp.ambassadeur_id, u.nom, u.prenom, u.date_naissance, u.lieu_naissance, u.telephone
         FROM blacklist_propositions bp
         JOIN ambassadeurs a ON a.id = bp.ambassadeur_id
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         WHERE bp.id = $1`,
        [req.params.id]
    );
    const p = prop.rows[0];
    if (!p) return res.status(404).json({ error: 'Proposition introuvable' });

    await query(
        'INSERT INTO blacklist(nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, ajoute_par_admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [p.nom, p.prenom, p.date_naissance, p.lieu_naissance, p.telephone, motif || '5 annulations en 30 jours', 'ambassadeur', ADMIN_ACTOR_ID]
    );
    await query(`UPDATE blacklist_propositions SET statut = 'confirme' WHERE id = $1`, [req.params.id]);
    await query(`UPDATE utilisateurs SET statut = 'blackliste' WHERE id = (SELECT utilisateur_id FROM ambassadeurs WHERE id = (SELECT ambassadeur_id FROM blacklist_propositions WHERE id = $1))`, [req.params.id]);
    res.json({ success: true });
});

router.put('/blacklist/propositions/:id/rejeter', async (req, res) => {
    await query(`UPDATE blacklist_propositions SET statut = 'rejete' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

router.get('/blacklist', async (req, res) => {
    const result = await query('SELECT * FROM blacklist ORDER BY id DESC');
    res.json(result.rows);
});

router.post('/blacklist', async (req, res) => {
    const { nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur } = req.body;
    if (!nom || !prenom || !date_naissance || !telephone || !type_utilisateur) {
        return res.status(400).json({ error: 'Données blacklist manquantes' });
    }
    const result = await query(
        'INSERT INTO blacklist(nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, ajoute_par_admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [nom, prenom, date_naissance, lieu_naissance, telephone, motif || '', type_utilisateur, ADMIN_ACTOR_ID]
    );
    res.status(201).json(result.rows[0]);
});

router.delete('/blacklist/:id', async (req, res) => {
    const { id } = req.params;
    const result = await query('DELETE FROM blacklist WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Entrée blacklist introuvable' });
    res.json({ success: true, id });
});

router.get('/export/ambassadeurs', async (req, res) => {
    const result = await query(
        `SELECT u.prenom, u.nom, u.email, u.telephone, a.niveau, a.points_solde, a.contrat_moral_signe, u.created_at
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY a.points_solde DESC`
    );
    const header = 'Prénom,Nom,Email,Téléphone,Niveau,Points,Contrat signé,Date inscription\n';
    const rows = result.rows.map(r =>
        `${r.prenom},${r.nom},${r.email},${r.telephone},${r.niveau},${r.points_solde},${r.contrat_moral_signe ? 'Oui' : 'Non'},${new Date(r.created_at).toLocaleDateString('fr-FR')}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ambassadeurs.csv');
    res.send(header + rows);
});

router.get('/export/courses', async (req, res) => {
    const result = await query(
        `SELECT reference, statut, type_course, adresse_depart, adresse_destination, montant, points_attribues, date_reservation, date_acceptation, date_fin
         FROM courses
         ORDER BY date_acceptation DESC NULLS LAST`
    );
    const header = 'Référence,Statut,Type,Départ,Destination,Montant,Points,Date réservation,Date acceptation,Date fin\n';
    const rows = result.rows.map(r =>
        `${r.reference || ''},${r.statut},${r.type_course},${(r.adresse_depart || '').replace(/,/g, ' ')},${(r.adresse_destination || '').replace(/,/g, ' ')},${r.montant || ''},${r.points_attribues || 0},${r.date_reservation ? new Date(r.date_reservation).toLocaleDateString('fr-FR') : ''},${r.date_acceptation ? new Date(r.date_acceptation).toLocaleDateString('fr-FR') : ''},${r.date_fin ? new Date(r.date_fin).toLocaleDateString('fr-FR') : ''}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=courses.csv');
    res.send(header + rows);
});

router.get('/export/chauffeurs', async (req, res) => {
    const result = await query(
        `SELECT u.prenom, u.nom, u.email, u.telephone, u.statut,
                c.vehicule_type, c.vehicule_marque, c.vehicule_modele, c.vehicule_immat,
                c.documents_valides, c.taux_commission_override, u.created_at
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY u.created_at DESC`
    );
    const header = 'Prénom,Nom,Email,Téléphone,Statut,Véhicule,Marque,Modèle,Immat,Docs validés,Taux,Date inscription\n';
    const rows = result.rows.map((r: any) =>
        `${r.prenom},${r.nom},${r.email},${r.telephone},${r.statut},${r.vehicule_type},${r.vehicule_marque || ''},${r.vehicule_modele || ''},${r.vehicule_immat || ''},${r.documents_valides ? 'Oui' : 'Non'},${r.taux_commission_override || 'défaut'},${new Date(r.created_at).toLocaleDateString('fr-FR')}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=chauffeurs.csv');
    res.send(header + rows);
});

router.get('/export/paiements', async (req, res) => {
    const result = await query(
        `SELECT c.reference, u.prenom, u.nom,
                co.montant, co.code_valide_at, co.date_fin,
                co.taux_commission_override
         FROM courses co
         JOIN chauffeurs c ON c.id = co.chauffeur_id
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         WHERE co.statut = 'terminee' AND co.code_valide_at IS NOT NULL
         ORDER BY co.code_valide_at DESC`
    );
    const header = 'Référence course,Chauffeur prénom,Chauffeur nom,Montant,Taux,Frais SESAME,Net chauffeur,Date validation code,Date fin\n';
    const rows = result.rows.map((r: any) => {
        const taux = Number(r.taux_commission_override ?? 20) / 100;
        const frais = (Number(r.montant) * taux).toFixed(2);
        const net = (Number(r.montant) * (1 - taux)).toFixed(2);
        return `${r.reference || ''},${r.prenom},${r.nom},${r.montant},${(taux * 100).toFixed(1)}%,${frais},${net},${r.code_valide_at ? new Date(r.code_valide_at).toLocaleDateString('fr-FR') : ''},${r.date_fin ? new Date(r.date_fin).toLocaleDateString('fr-FR') : ''}`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=paiements.csv');
    res.send(header + rows);
});

router.get('/parametres', async (req, res) => {
    const result = await query('SELECT * FROM parametres_systeme ORDER BY cle ASC');
    res.json(result.rows);
});

router.put('/parametres/:cle', async (req, res) => {
    const { cle } = req.params;
    const { valeur } = req.body;
    await query('UPDATE parametres_systeme SET valeur = $1, updated_at = now() WHERE cle = $2', [valeur, cle]);
    res.json({ success: true, cle, valeur });
});

// Taux commission individuel chauffeur
router.put('/chauffeurs/:id/taux', async (req, res) => {
    const { taux } = req.body;
    if (taux === undefined) return res.status(400).json({ error: 'taux requis' });
    const result = await query(
        'UPDATE chauffeurs SET taux_commission_override = $1 WHERE id = $2 RETURNING id, taux_commission_override',
        [taux === null ? null : Number(taux), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json({ success: true, ...result.rows[0] });
});

router.put('/utilisateurs/:id/statut', async (req, res) => {
    const { statut } = req.body;
    if (!['actif', 'suspendu'].includes(statut)) return res.status(400).json({ error: 'statut invalide' });
    const result = await query(
        'UPDATE utilisateurs SET statut = $1 WHERE id = $2 RETURNING id, statut',
        [statut, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ success: true, ...result.rows[0] });
});

router.put('/ambassadeurs/:id/valider-moral', async (req, res) => {
    const { id } = req.params;
    const ambResult = await query('SELECT utilisateur_id, push_token FROM ambassadeurs WHERE id = $1', [id]);
    const amb = ambResult.rows[0];
    if (!amb) return res.status(404).json({ error: 'Ambassadeur introuvable' });

    await query('UPDATE utilisateurs SET statut = $1 WHERE id = $2', ['actif', amb.utilisateur_id]);
    await query('UPDATE ambassadeurs SET contrat_moral_signe = true, contrat_moral_signe_at = now() WHERE id = $1', [id]);

    if (amb.push_token) {
        await sendPushNotification(
            amb.push_token,
            'Compte validé !',
            'Votre compte entreprise SÉSAME a été validé. Vous pouvez maintenant vous connecter.',
            { type: 'compte_valide' }
        ).catch(() => {});
    }

    res.json({ success: true });
});

router.put('/ambassadeurs/:id/note', async (req, res) => {
    const { note } = req.body;
    const result = await query(
        'UPDATE ambassadeurs SET note_interne = $1 WHERE id = $2 RETURNING id',
        [note ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ambassadeur introuvable' });
    res.json({ success: true });
});

router.put('/chauffeurs/:id/note', async (req, res) => {
    const { note } = req.body;
    const result = await query(
        'UPDATE chauffeurs SET note_interne = $1 WHERE id = $2 RETURNING id',
        [note ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json({ success: true });
});

router.delete('/ambassadeurs/:ambassadeur_id', async (req, res) => {
    const { ambassadeur_id } = req.params;
    const amb = await query('SELECT utilisateur_id FROM ambassadeurs WHERE id = $1', [ambassadeur_id]);
    if (!amb.rows.length) return res.status(404).json({ error: 'Ambassadeur introuvable' });
    const utilisateur_id = amb.rows[0].utilisateur_id;
    await query('UPDATE courses SET ambassadeur_id = NULL WHERE ambassadeur_id = $1', [ambassadeur_id]);
    await query('DELETE FROM sous_comptes_employes WHERE ambassadeur_moral_id = $1', [ambassadeur_id]);
    await query('DELETE FROM ambassadeurs WHERE id = $1', [ambassadeur_id]);
    await query('DELETE FROM utilisateurs WHERE id = $1', [utilisateur_id]);
    res.json({ success: true });
});

router.delete('/chauffeurs/:chauffeur_id', async (req, res) => {
    const { chauffeur_id } = req.params;
    // Récupère l'utilisateur_id avant suppression
    const ch = await query('SELECT utilisateur_id FROM chauffeurs WHERE id = $1', [chauffeur_id]);
    if (!ch.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    const utilisateur_id = ch.rows[0].utilisateur_id;
    // Nullifie chauffeur_id dans les courses pour conserver l'historique
    await query('UPDATE courses SET chauffeur_id = NULL WHERE chauffeur_id = $1', [chauffeur_id]);
    // Supprime l'utilisateur (CASCADE supprime chauffeurs + documents_chauffeur)
    await query('DELETE FROM utilisateurs WHERE id = $1', [utilisateur_id]);
    res.json({ success: true });
});

// Créer un fournisseur
router.post('/fournisseurs', async (req, res) => {
    const {
        nom_societe, siret, iban,
        legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
        prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
        memes_coordonnees, option_paiement
    } = req.body;
    if (!nom_societe) return res.status(400).json({ error: 'nom_societe requis' });

    // Générer un code secret à 4 chiffres
    const code = randomInt(1000, 10000).toString();
    const code_secret_hash = await bcrypt.hash(code, 10);

    const result = await query(
        `INSERT INTO fournisseurs(
            nom_societe, siret, iban,
            legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
            prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
            memes_coordonnees, code_secret_hash, option_paiement, statut
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'en_configuration')
        RETURNING id, nom_societe, statut`,
        [
            nom_societe, siret || null, iban || null,
            legal_prenom || null, legal_nom || null, legal_email || null, legal_telephone || null,
            legal_adresse || null, legal_cp || null, legal_ville || null,
            prest_prenom || null, prest_nom || null, prest_telephone || null,
            prest_email || null, prest_adresse || null, prest_cp || null, prest_ville || null,
            memes_coordonnees ?? false, code_secret_hash, option_paiement || 'c'
        ]
    );

    // Retourner le code en clair une seule fois (à envoyer par email au responsable légal)
    res.status(201).json({ ...result.rows[0], code_secret_temporaire: code });
});

// Modifier un fournisseur
router.put('/fournisseurs/:id', async (req, res) => {
    const {
        nom_societe, siret, iban,
        legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
        prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
        memes_coordonnees, option_paiement, statut, contrat_signe
    } = req.body;

    await query(
        `UPDATE fournisseurs SET
            nom_societe = COALESCE($1, nom_societe),
            siret = COALESCE($2, siret),
            iban = COALESCE($3, iban),
            legal_prenom = COALESCE($4, legal_prenom),
            legal_nom = COALESCE($5, legal_nom),
            legal_email = COALESCE($6, legal_email),
            legal_telephone = COALESCE($7, legal_telephone),
            legal_adresse = COALESCE($8, legal_adresse),
            legal_cp = COALESCE($9, legal_cp),
            legal_ville = COALESCE($10, legal_ville),
            prest_prenom = COALESCE($11, prest_prenom),
            prest_nom = COALESCE($12, prest_nom),
            prest_telephone = COALESCE($13, prest_telephone),
            prest_email = COALESCE($14, prest_email),
            prest_adresse = COALESCE($15, prest_adresse),
            prest_cp = COALESCE($16, prest_cp),
            prest_ville = COALESCE($17, prest_ville),
            memes_coordonnees = COALESCE($18, memes_coordonnees),
            option_paiement = COALESCE($19, option_paiement),
            statut = COALESCE($20, statut),
            contrat_signe = COALESCE($21, contrat_signe),
            contrat_signe_at = CASE WHEN $21 = true AND contrat_signe = false THEN now() ELSE contrat_signe_at END
        WHERE id = $22`,
        [
            nom_societe, siret, iban,
            legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
            prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
            memes_coordonnees, option_paiement, statut, contrat_signe,
            req.params.id
        ]
    );
    res.json({ success: true });
});

// Envoyer le contrat à signer au fournisseur via Yousign (specs §6).
// Signataire unique = le responsable légal. La boutique se débloque au webhook « signé ».
router.post('/fournisseurs/:id/envoyer-contrat', async (req, res) => {
    const r = await query(
        'SELECT id, nom_societe, legal_prenom, legal_nom, legal_email, legal_telephone FROM fournisseurs WHERE id = $1',
        [req.params.id]
    );
    const f = r.rows[0];
    if (!f) return res.status(404).json({ error: 'Fournisseur introuvable' });
    if (!f.legal_email) {
        return res.status(400).json({ error: "Renseignez l'email du responsable légal avant d'envoyer le contrat." });
    }
    if (!isYousignConfigured()) {
        return res.status(503).json({ error: 'Signature électronique non configurée (YOUSIGN_API_KEY + contrat PDF). Validez le contrat manuellement en attendant.' });
    }
    try {
        await envoyerContratFournisseur(f);
        res.json({ success: true, message: `Contrat envoyé à ${f.legal_email}.` });
    } catch (e: any) {
        res.status(502).json({ error: `Échec de l'envoi Yousign : ${e.message}` });
    }
});

// Régénérer le code secret d'un fournisseur
router.post('/fournisseurs/:id/regenerer-code', async (req, res) => {
    const code = randomInt(1000, 10000).toString();
    const code_secret_hash = await bcrypt.hash(code, 10);
    await query('UPDATE fournisseurs SET code_secret_hash = $1, bloque = false, nb_tentatives_echouees = 0 WHERE id = $2', [code_secret_hash, req.params.id]);
    res.json({ success: true, code_secret_temporaire: code });
});

// Résout un paramètre mois 'YYYY-MM' vers le 1er jour du mois (date). Défaut : mois courant.
function resolveMois(raw: unknown): string {
    if (typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// CTE réutilisable : mappe chaque ambassadeur_id (moral lui-même OU employé sous-compte) vers son entreprise.
const AMB_TO_MORAL_CTE = `
    amb_to_moral AS (
        SELECT id AS ambassadeur_id, id AS moral_id
        FROM ambassadeurs
        WHERE type_ambassadeur = 'moral'
        UNION
        SELECT ae.id AS ambassadeur_id, s.ambassadeur_moral_id AS moral_id
        FROM sous_comptes_employes s
        JOIN ambassadeurs ae ON ae.utilisateur_id = s.utilisateur_id
    )`;

// Commissions Ambassadeurs Moraux — pour un mois donné (?mois=YYYY-MM, défaut mois courant).
// Le CA = courses de l'entreprise + celles de ses sous-comptes employés.
router.get('/commissions/moraux', async (req, res) => {
    const rateResult = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);
    const mois = resolveMois(req.query.mois);

    const result = await query(
        `WITH ${AMB_TO_MORAL_CTE}
         SELECT
            a.id AS ambassadeur_id,
            u.prenom, u.nom, u.email,
            a.etablissement,
            count(c.id) AS nb_courses,
            COALESCE(sum(c.montant), 0) AS ca_brut_ttc,
            round(COALESCE(sum(c.montant), 0) * $1 / 100, 2) AS commission,
            a.iban,
            v.statut AS statut_versement,
            v.date_versement
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         LEFT JOIN amb_to_moral m ON m.moral_id = a.id
         LEFT JOIN courses c ON c.ambassadeur_id = m.ambassadeur_id
             AND c.statut = 'terminee'
             AND c.code_valide_at IS NOT NULL
             AND date_trunc('month', c.date_fin) = $2::date
         LEFT JOIN virements_commissions v ON v.ambassadeur_id = a.id AND v.mois = $2::date
         WHERE a.type_ambassadeur = 'moral'
         GROUP BY a.id, u.prenom, u.nom, u.email, a.etablissement, a.iban, v.statut, v.date_versement
         ORDER BY ca_brut_ttc DESC`,
        [tauxPct, mois]
    );
    res.json({ taux_pct: tauxPct, mois: mois.slice(0, 7), ambassadeurs: result.rows });
});

// Déclenche (enregistre) les virements de commissions d'un mois donné.
// STRICT : ne traite que les entreprises pas encore versées ce mois (les déjà-versées restent intactes,
// leur date de versement n'est jamais écrasée). Garde-fou contre le double paiement.
// NB : pas encore de vrai virement SEPA (intégration bancaire à brancher), mais la trace est persistée.
router.post('/commissions/declencher', async (req, res) => {
    const rateResult = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);
    const mois = resolveMois(req.body?.mois);

    const result = await query(
        `WITH ${AMB_TO_MORAL_CTE},
         agg AS (
            SELECT
                a.id AS ambassadeur_id,
                count(c.id) AS nb_courses,
                COALESCE(sum(c.montant), 0) AS ca_brut_ttc,
                round(COALESCE(sum(c.montant), 0) * $1 / 100, 2) AS commission
            FROM ambassadeurs a
            LEFT JOIN amb_to_moral m ON m.moral_id = a.id
            LEFT JOIN courses c ON c.ambassadeur_id = m.ambassadeur_id
                AND c.statut = 'terminee'
                AND c.code_valide_at IS NOT NULL
                AND date_trunc('month', c.date_fin) = $2::date
            WHERE a.type_ambassadeur = 'moral'
              -- on ignore les entreprises déjà versées ce mois
              AND NOT EXISTS (
                  SELECT 1 FROM virements_commissions v
                  WHERE v.ambassadeur_id = a.id AND v.mois = $2::date
              )
            GROUP BY a.id
            HAVING COALESCE(sum(c.montant), 0) > 0
         )
         INSERT INTO virements_commissions
            (ambassadeur_id, mois, nb_courses, ca_brut_ttc, taux_pct, montant_commission, statut, date_versement)
         SELECT ambassadeur_id, $2::date, nb_courses, ca_brut_ttc, $1, commission, 'verse', now()
         FROM agg
         ON CONFLICT (ambassadeur_id, mois) DO NOTHING
         RETURNING montant_commission`,
        [tauxPct, mois]
    );

    const total = result.rows.reduce((s: number, r: any) => s + Number(r.montant_commission), 0);
    res.json({
        success: true,
        mois: mois.slice(0, 7),
        nb_virements: result.rowCount,
        total: Math.round(total * 100) / 100,
        message: `${result.rowCount} virement(s) enregistré(s) pour ${mois.slice(0, 7)}. Intégration bancaire SEPA à brancher.`,
    });
});

// Tickets support (stub — table à créer si fonctionnalité développée)
router.get('/support/tickets', async (req, res) => {
    res.json({ tickets: [], total: 0 });
});

export default router;
