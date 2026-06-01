import express from 'express';
import { query } from '../db';

const router = express.Router();

router.get('/:id/profile', async (req, res) => {
    const result = await query(
        `SELECT
            c.id AS chauffeur_id,
            u.id AS utilisateur_id,
            u.prenom,
            u.nom,
            u.email,
            u.telephone,
            c.disponible,
            c.vehicule_type,
            c.vehicule_marque,
            c.vehicule_modele,
            c.vehicule_couleur,
            c.vehicule_immat,
            c.note_moyenne,
            c.iban,
            c.siret,
            c.taux_commission
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         WHERE c.id = $1`,
        [req.params.id]
    );

    if (!result.rows.length) {
        return res.status(404).json({ error: 'Chauffeur introuvable' });
    }

    res.json(result.rows[0]);
});

router.get('/:id/dashboard', async (req, res) => {
    const profileResult = await query(
        `SELECT
            c.id AS chauffeur_id,
            u.prenom,
            u.nom,
            c.disponible,
            c.vehicule_type,
            c.vehicule_marque,
            c.vehicule_modele,
            c.vehicule_couleur,
            c.vehicule_immat,
            c.note_moyenne,
            c.taux_commission
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         WHERE c.id = $1`,
        [req.params.id]
    );

    if (!profileResult.rows.length) {
        return res.status(404).json({ error: 'Chauffeur introuvable' });
    }

    const profile = profileResult.rows[0];
    const assignedCourses = await query(
        `SELECT id, reference, statut, type, adresse_depart, adresse_destination, montant, date_reservation, date_acceptation
         FROM courses
         WHERE chauffeur_id = $1 AND statut IN ($2,$3,$4,$5,$6)
         ORDER BY date_acceptation DESC NULLS LAST`,
        [req.params.id, 'recherche', 'acceptee', 'en_route', 'code_valide', 'en_cours']
    );

    const activeCount = assignedCourses.rows.length;
    const nextCourse = assignedCourses.rows[0] || null;

    res.json({
        ...profile,
        active_courses_count: activeCount,
        current_course: nextCourse,
    });
});

router.get('/:id/courses', async (req, res) => {
    const result = await query(
        `SELECT id, reference, statut, type, adresse_depart, adresse_destination, montant, taux_commission_applique, date_reservation, date_acceptation, date_fin, annule_par
         FROM courses
         WHERE chauffeur_id = $1
         ORDER BY date_acceptation DESC NULLS LAST, date_fin DESC NULLS LAST`,
        [req.params.id]
    );
    res.json(result.rows);
});

router.put('/:id/availability', async (req, res) => {
    const { disponible } = req.body;
    if (disponible == null) return res.status(400).json({ error: 'disponible requis' });

    const result = await query('UPDATE chauffeurs SET disponible = $1 WHERE id = $2 RETURNING *', [disponible, req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json(result.rows[0]);
});

router.post('/:id/accept-course', async (req, res) => {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });
    if (course.statut !== 'recherche') return res.status(400).json({ error: 'Course non disponible pour acceptation' });

    const code = Math.floor(1000 + Math.random() * 9000).toString();

    await query('UPDATE courses SET chauffeur_id = $1, statut = $2, date_acceptation = now(), code_validation = $3 WHERE id = $4', [req.params.id, 'acceptee', code, course_id]);
    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    res.json(updated.rows[0]);
});

router.post('/:id/validate-code', async (req, res) => {
    const { course_id, code } = req.body;
    if (!course_id || !code) return res.status(400).json({ error: 'course_id et code requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1 AND chauffeur_id = $2', [course_id, req.params.id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });
    if (course.code_validation && course.code_validation !== code) {
        return res.status(400).json({ error: 'Code invalide' });
    }

    await query('UPDATE courses SET statut = $1, code_valide_at = now() WHERE id = $2', ['code_valide', course_id]);
    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    res.json(updated.rows[0]);
});

router.post('/:id/finish-course', async (req, res) => {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1 AND chauffeur_id = $2', [course_id, req.params.id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    await query('UPDATE courses SET statut = $1, date_fin = now() WHERE id = $2', ['terminee', course_id]);
    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    res.json(updated.rows[0]);
});

export default router;
