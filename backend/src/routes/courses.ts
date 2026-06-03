import express from 'express';
import { calculatePoints, calculateVehiclePrice, nextAmbassadorLevel } from '../lib/rules';
import { query } from '../db';
import { getSystemParameters, getSystemParameter } from '../lib/params';

const router = express.Router();

function makeReference(prefix: string) {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
}

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

    const sysParams = await getSystemParameters();
    const pricingParams = {
        berline_forfait: Number(sysParams.berline_forfait),
        berline_seuil_km: Number(sysParams.berline_seuil_km),
        berline_prix_km: Number(sysParams.berline_prix_km),
        van_forfait: Number(sysParams.van_forfait),
        van_seuil_km: Number(sysParams.van_seuil_km),
        van_prix_km: Number(sysParams.van_prix_km),
    };

    const montant = calculateVehiclePrice(vehicule_type, Number(kilometrage), pricingParams);
    const reference = makeReference('CRS');
    const points_attribues = calculatePoints(montant);

    const result = await query(
        'INSERT INTO courses(reference, ambassadeur_id, statut, type_course, adresse_depart, adresse_destination, vehicule_type, montant, points_attribues) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [reference, ambassadeur_id, 'recherche', courseType, adresse_depart, adresse_destination, vehicule_type, montant, points_attribues]
    );

    res.status(201).json(result.rows[0]);
});

// Routes statiques AVANT /:id pour éviter la capture par le paramètre dynamique
router.get('/active', async (req, res) => {
    const { ambassadeur_id, chauffeur_id } = req.query;
    let sql = `SELECT * FROM courses WHERE statut IN ('recherche','acceptee','en_route','code_valide','en_cours')`;
    const params: any[] = [];
    if (ambassadeur_id) { params.push(ambassadeur_id); sql += ` AND ambassadeur_id = $${params.length}`; }
    if (chauffeur_id) { params.push(chauffeur_id); sql += ` AND chauffeur_id = $${params.length}`; }
    const result = await query(sql, params);
    res.json(result.rows);
});

router.get('/historique', async (req, res) => {
    const { ambassadeur_id } = req.query;
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

    await query('UPDATE courses SET statut = $1, date_annulation = now(), annule_par = $2 WHERE id = $3', ['annulee', raison || 'ambassadeur', req.params.id]);
    res.json({ success: true, courseId: req.params.id });
});

router.post('/reserver', async (req, res) => {
    const { ambassadeur_id, adresse_depart, adresse_destination, vehicule_type, kilometrage, date_reservation } = req.body;
    if (!ambassadeur_id || !adresse_depart || !adresse_destination || !vehicule_type || kilometrage == null || !date_reservation) {
        return res.status(400).json({ error: 'Données de réservation incomplètes' });
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
    const pricingParams = {
        berline_forfait: Number(sysParams.berline_forfait),
        berline_seuil_km: Number(sysParams.berline_seuil_km),
        berline_prix_km: Number(sysParams.berline_prix_km),
        van_forfait: Number(sysParams.van_forfait),
        van_seuil_km: Number(sysParams.van_seuil_km),
        van_prix_km: Number(sysParams.van_prix_km),
    };

    const montant = calculateVehiclePrice(vehicule_type, Number(kilometrage), pricingParams);
    const reference = makeReference('CRS');
    const points_attribues = calculatePoints(montant);

    const result = await query(
        'INSERT INTO courses(reference, ambassadeur_id, statut, type_course, adresse_depart, adresse_destination, vehicule_type, montant, points_attribues, date_reservation) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
        [reference, ambassadeur_id, 'recherche', 'reservation', adresse_depart, adresse_destination, vehicule_type, montant, points_attribues, date_reservation]
    );

    res.status(201).json(result.rows[0]);
});

router.post('/chauffeur/valider-code', async (req, res) => {
    const { course_id, code } = req.body;
    if (!course_id || !code) return res.status(400).json({ error: 'course_id et code requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    if (!course.code_validation || course.code_validation !== code) {
        return res.status(400).json({ error: 'Code invalide — contactez l\'Ambassadeur' });
    }

    await query('UPDATE courses SET statut = $1, code_valide_at = now() WHERE id = $2', ['code_valide', course_id]);
    res.json({ success: true, courseId: course_id, statut: 'code_valide' });
});

router.put('/chauffeur/terminer-course', async (req, res) => {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    if (course.statut === 'terminee') {
        return res.status(400).json({ error: 'Course déjà terminée' });
    }

    await query('UPDATE courses SET statut = $1, date_fin = now() WHERE id = $2', ['terminee', course_id]);

    // Créditer les points Ambassadeur UNIQUEMENT si le code pivot a été validé (PIVOT JURIDIQUE)
    if (course.code_valide_at && course.ambassadeur_id && course.montant) {
        const pts = calculatePoints(Number(course.montant));
        if (pts > 0) {
            const ambResult = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
            const solde_avant = Number(ambResult.rows[0]?.points_solde || 0);
            const solde_apres = solde_avant + pts;
            const newLevel = nextAmbassadorLevel(solde_apres);

            await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, course.ambassadeur_id]);
            await query(
                'INSERT INTO points_historique(ambassadeur_id, type, montant, solde_avant, solde_apres, course_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                [course.ambassadeur_id, 'gain', pts, solde_avant, solde_apres, course_id, `Points gagnés pour la course ${course.reference}`]
            );
            await query('UPDATE courses SET points_attribues = $1 WHERE id = $2', [pts, course_id]);
        }
    }

    res.json({ success: true });
});

export default router;
