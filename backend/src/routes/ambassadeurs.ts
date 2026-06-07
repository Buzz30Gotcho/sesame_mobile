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

router.get('/:id/filleuls', async (req, res) => {
    const result = await query(
        `SELECT u.prenom, u.nom, a.niveau, a.points_solde, u.created_at,
                (SELECT count(*) FROM courses c
                 WHERE c.ambassadeur_id = a.id
                 AND c.statut = 'terminee'
                 AND c.code_valide_at IS NOT NULL) AS nb_courses
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         WHERE a.parrain_id = $1
         ORDER BY u.created_at DESC`,
        [req.params.id]
    );
    res.json(result.rows);
});

router.put('/:id/push-token', async (req, res) => {
    const { push_token } = req.body;
    if (!push_token) return res.status(400).json({ error: 'push_token requis' });
    await query('UPDATE ambassadeurs SET push_token = $1 WHERE id = $2', [push_token, req.params.id]);
    res.json({ success: true });
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

    console.log('[dashboard] id:', req.params.id, 'rows:', profileResult.rows.length, 'data:', profileResult.rows[0]);

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
        `SELECT c.id, c.reference, c.statut, c.type_course, c.adresse_depart, c.adresse_destination,
                c.vehicule_type, c.montant, c.points_attribues, c.date_reservation, c.code_validation,
                u.prenom AS chauffeur_prenom, u.nom AS chauffeur_nom, u.telephone AS chauffeur_telephone,
                ch.vehicule_marque, ch.vehicule_modele, ch.vehicule_couleur, ch.vehicule_immat
         FROM courses c
         LEFT JOIN chauffeurs ch ON ch.id = c.chauffeur_id
         LEFT JOIN utilisateurs u ON u.id = ch.utilisateur_id
         WHERE c.ambassadeur_id = $1 AND c.statut IN ($2, $3, $4, $5, $6)
         ORDER BY c.date_acceptation DESC NULLS LAST
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

// Sous-comptes employés (Ambassadeur Moral)
router.get('/:id/equipe', async (req, res) => {
    const result = await query(
        `SELECT s.id, u.prenom, u.nom, u.email, u.telephone, s.metier, s.statut, s.created_at,
                (SELECT count(*) FROM courses c WHERE c.ambassadeur_id = s.id) AS nb_courses
         FROM sous_comptes_employes s
         JOIN utilisateurs u ON u.id = s.utilisateur_id
         WHERE s.ambassadeur_moral_id = $1
         ORDER BY s.created_at DESC`,
        [req.params.id]
    );
    res.json(result.rows);
});

router.post('/:id/equipe', async (req, res) => {
    const { prenom, nom, email, telephone, metier, mot_de_passe } = req.body;
    if (!prenom || !nom || !email || !telephone || !mot_de_passe) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    const bcrypt = await import('bcrypt');
    const hashed = await bcrypt.hash(mot_de_passe, 10);
    const userResult = await query(
        `INSERT INTO utilisateurs(type, prenom, nom, email, telephone, mot_de_passe_hash)
         VALUES ('ambassadeur', $1, $2, $3, $4, $5) RETURNING id`,
        [prenom, nom, email, telephone, hashed]
    );
    const userId = userResult.rows[0].id;
    await query(
        `INSERT INTO sous_comptes_employes(ambassadeur_moral_id, utilisateur_id, metier)
         VALUES ($1, $2, $3)`,
        [req.params.id, userId, metier || null]
    );
    res.status(201).json({ success: true, utilisateur_id: userId });
});

// Commissions mensuelles (Ambassadeur Moral)
router.get('/:id/commissions', async (req, res) => {
    const rateResult = await query(
        "SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'"
    );
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);

    const result = await query(
        `SELECT
            to_char(date_trunc('month', c.date_fin), 'YYYY-MM') AS mois,
            count(*) AS nb_courses,
            sum(c.montant) AS ca_brut_ttc,
            round(sum(c.montant) * $1 / 100, 2) AS commission
         FROM courses c
         JOIN ambassadeurs a ON a.id = c.ambassadeur_id
         WHERE (a.id = $2 OR a.ambassadeur_moral_id = $2)
           AND c.statut = 'terminee'
           AND c.code_valide_at IS NOT NULL
           AND c.date_fin IS NOT NULL
         GROUP BY date_trunc('month', c.date_fin)
         ORDER BY date_trunc('month', c.date_fin) DESC
         LIMIT 12`,
        [tauxPct, req.params.id]
    );

    // Chercher aussi les sous-comptes
    const subResult = await query(
        `SELECT
            to_char(date_trunc('month', c.date_fin), 'YYYY-MM') AS mois,
            count(*) AS nb_courses,
            sum(c.montant) AS ca_brut_ttc,
            round(sum(c.montant) * $1 / 100, 2) AS commission
         FROM courses c
         JOIN ambassadeurs a ON a.id = c.ambassadeur_id
         JOIN sous_comptes_employes s ON s.id = a.id
         WHERE s.ambassadeur_moral_id = $2
           AND c.statut = 'terminee'
           AND c.code_valide_at IS NOT NULL
           AND c.date_fin IS NOT NULL
         GROUP BY date_trunc('month', c.date_fin)
         ORDER BY date_trunc('month', c.date_fin) DESC
         LIMIT 12`,
        [tauxPct, req.params.id]
    );

    res.json({ taux_pct: tauxPct, mois: result.rows, sous_comptes_mois: subResult.rows });
});

export default router;
