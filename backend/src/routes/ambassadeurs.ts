import express from 'express';
import { query } from '../db';

const router = express.Router();

router.get('/:id/profile', async (req, res) => {
    const result = await query(
        `SELECT
            a.id AS ambassadeur_id,
            u.id AS utilisateur_id,
            u.prenom,
            u.nom,
            u.email,
            u.telephone,
            a.type_ambassadeur,
            a.etablissement,
            a.metier,
            a.siret,
            a.iban,
            a.responsable_legal_nom,
            a.code_parrainage,
            a.points_solde,
            a.niveau
        FROM ambassadeurs a
        JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE a.id = $1`,
        [req.params.id]
    );

    if (!result.rows.length) {
        return res.status(404).json({ error: 'Ambassadeur introuvable' });
    }

    res.json(result.rows[0]);
});

router.put('/:id/profile', async (req, res) => {
    const { prenom, nom, telephone, theme, langue, metier, etablissement } = req.body;
    const ambResult = await query('SELECT utilisateur_id FROM ambassadeurs WHERE id = $1', [req.params.id]);
    const ambassador = ambResult.rows[0];
    if (!ambassador) {
        return res.status(404).json({ error: 'Ambassadeur introuvable' });
    }

    await query(
        `UPDATE utilisateurs
         SET prenom = COALESCE($1, prenom),
             nom = COALESCE($2, nom),
             telephone = COALESCE($3, telephone),
             theme = COALESCE($4, theme),
             langue = COALESCE($5, langue)
         WHERE id = $6`,
        [prenom, nom, telephone, theme, langue, ambassador.utilisateur_id]
    );

    await query(
        `UPDATE ambassadeurs
         SET metier = COALESCE($1, metier),
             etablissement = COALESCE($2, etablissement)
         WHERE id = $3`,
        [metier, etablissement, req.params.id]
    );

    const profileResult = await query(
        `SELECT
            a.id AS ambassadeur_id,
            u.id AS utilisateur_id,
            u.prenom,
            u.nom,
            u.email,
            u.telephone,
            a.type_ambassadeur,
            a.etablissement,
            a.metier,
            a.siret,
            a.iban,
            a.responsable_legal_nom,
            a.code_parrainage,
            a.points_solde,
            a.niveau
        FROM ambassadeurs a
        JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE a.id = $1`,
        [req.params.id]
    );

    res.json(profileResult.rows[0]);
});

router.get('/:id/dashboard', async (req, res) => {
    const profileResult = await query(
        `SELECT
            a.id AS ambassadeur_id,
            u.prenom,
            u.nom,
            a.code_parrainage,
            a.points_solde,
            a.niveau
        FROM ambassadeurs a
        JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE a.id = $1`,
        [req.params.id]
    );

    if (!profileResult.rows.length) {
        return res.status(404).json({ error: 'Ambassadeur introuvable' });
    }

    const profile = profileResult.rows[0];
    const levelOrder = ['starter', 'pro', 'elite', 'black'];
    const levelThresholds: Record<string, number> = {
        starter: 0,
        pro: 500,
        elite: 2000,
        black: 5000,
    };

    const currentLevel = profile.niveau || 'starter';
    const currentPoints = Number(profile.points_solde || 0);
    const currentThreshold = levelThresholds[currentLevel] ?? 0;
    const nextLevelIndex = levelOrder.indexOf(currentLevel) + 1;
    const nextLevel = nextLevelIndex < levelOrder.length ? levelOrder[nextLevelIndex] : null;
    const nextLevelTarget = nextLevel ? levelThresholds[nextLevel] : null;
    const pointsToNextLevel = nextLevelTarget ? Math.max(0, nextLevelTarget - currentPoints) : 0;

    const coursesResult = await query(
        `SELECT id, reference, statut, type, adresse_depart, adresse_destination, vehicule_type, montant, points_attribues, date_reservation
         FROM courses
         WHERE ambassadeur_id = $1 AND statut IN ($2, $3, $4, $5, $6)
         ORDER BY date_acceptation DESC NULLS LAST
         LIMIT 5`,
        [req.params.id, 'recherche', 'acceptee', 'en_route', 'code_valide', 'en_cours']
    );

    const activeCountResult = await query(
        `SELECT count(*) AS count
         FROM courses
         WHERE ambassadeur_id = $1 AND statut IN ($2, $3, $4, $5, $6)`,
        [req.params.id, 'recherche', 'acceptee', 'en_route', 'code_valide', 'en_cours']
    );

    const pendingBonsResult = await query(
        'SELECT count(*) AS count FROM echanges WHERE ambassadeur_id = $1 AND statut = $2',
        [req.params.id, 'en_attente_admin']
    );

    const activeCourseCount = Number(activeCountResult.rows[0]?.count || 0);
    const pendingBonsCount = Number(pendingBonsResult.rows[0]?.count || 0);

    res.json({
        ambassadeur_id: profile.ambassadeur_id,
        prenom: profile.prenom,
        niveau: profile.niveau,
        points_solde: Number(profile.points_solde || 0),
        code_parrainage: profile.code_parrainage,
        active_course_count: activeCourseCount,
        pending_bons_count: pendingBonsCount,
        next_level: nextLevel,
        next_level_target: nextLevelTarget,
        points_to_next_level: pointsToNextLevel,
        active_courses: coursesResult.rows,
    });
});

export default router;
