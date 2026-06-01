import express from 'express';
import { query } from '../db';

const router = express.Router();

router.get('/dashboard', async (req, res) => {
    const kpis = {
        totalCourses: (await query('SELECT count(*) FROM courses')).rows[0].count,
        totalAmbassadeurs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'ambassadeur'")).rows[0].count,
        totalChauffeurs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'chauffeur'")).rows[0].count,
        pendingExchanges: (await query("SELECT count(*) FROM echanges WHERE statut = 'en_attente_admin'")).rows[0].count,
    };
    res.json(kpis);
});

router.get('/echanges/en-attente', async (req, res) => {
    const result = await query('SELECT * FROM echanges WHERE statut = $1 ORDER BY remis_at DESC NULLS LAST', ['en_attente_admin']);
    res.json(result.rows);
});

router.put('/echanges/:id/valider', async (req, res) => {
    const { id } = req.params;
    const exchangeResult = await query('SELECT * FROM echanges WHERE id = $1', [id]);
    if (!exchangeResult.rows.length) return res.status(404).json({ error: 'Bon introuvable' });
    const updateResult = await query("UPDATE echanges SET statut = $1, remis_at = now() WHERE id = $2 RETURNING offre_id", ['valide', id]);
    const offreId = updateResult.rows[0]?.offre_id;
    if (offreId) {
        const offre = await query('SELECT validite_bon_mois FROM offres_boutique WHERE id = $1', [offreId]);
        const months = offre.rows[0]?.validite_bon_mois || 0;
        await query("UPDATE echanges SET expire_at = now() + ($1 || ' month')::interval WHERE id = $2", [months, id]);
    }
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
    await query('UPDATE courses SET statut = $1, date_annulation = now(), annule_par = $2 WHERE id = $3', ['annulee', raison || 'admin', id]);
    res.json({ success: true });
});

router.put('/courses/:id/assigner', async (req, res) => {
    const { id } = req.params;
    const { chauffeur_id } = req.body;
    if (!chauffeur_id) return res.status(400).json({ error: 'chauffeur_id requis' });
    await query('UPDATE courses SET chauffeur_id = $1, statut = $2 WHERE id = $3', [chauffeur_id, 'acceptee', id]);
    res.json({ success: true });
});

router.post('/alertes/:id/arbitrer', async (req, res) => {
    const { id } = req.params;
    const { action, points, indemnisation } = req.body;
    await query('UPDATE sanctions_en_attente SET statut = $1, execute_at = now() WHERE id = $2', ['execute', id]);
    res.json({ success: true, action, points, indemnisation });
});

router.post('/chat/:courseId/intervenir', async (req, res) => {
    const { courseId } = req.params;
    const { contenu } = req.body;
    if (!contenu) return res.status(400).json({ error: 'Contenu requis' });
    const result = await query('INSERT INTO messages_chat(course_id, expediteur_type, expediteur_id, contenu) VALUES ($1,$2,$3,$4) RETURNING *', [courseId, 'admin', req.body.admin_id || null, contenu]);
    res.status(201).json(result.rows[0]);
});

router.get('/ambassadeurs', async (req, res) => {
    const result = await query(
        `SELECT a.id AS ambassadeur_id, u.prenom, u.nom, u.email, u.telephone, a.points_solde, a.niveau, a.contrat_moral_signe
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY a.points_solde DESC`
    );
    res.json(result.rows);
});

router.get('/chauffeurs', async (req, res) => {
    const result = await query(
        `SELECT c.id AS chauffeur_id, u.prenom, u.nom, u.email, u.telephone, c.disponible, c.vehicule_type, c.vehicule_marque, c.vehicule_modele, c.note_moyenne
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY u.nom ASC`
    );
    res.json(result.rows);
});

router.get('/courses', async (req, res) => {
    const result = await query(
        `SELECT id, reference, ambassadeur_id, chauffeur_id, statut, type, adresse_depart, adresse_destination, montant, date_reservation, date_acceptation, date_fin
         FROM courses
         ORDER BY date_acceptation DESC NULLS LAST, date_reservation DESC NULLS LAST`
    );
    res.json(result.rows);
});

router.get('/fournisseurs', async (req, res) => {
    const result = await query('SELECT id, nom_societe, statut, contrat_signe, bloque, legal_email FROM fournisseurs ORDER BY nom_societe ASC');
    res.json(result.rows);
});

router.get('/blacklist', async (req, res) => {
    const result = await query('SELECT * FROM blacklist ORDER BY id DESC');
    res.json(result.rows);
});

router.post('/blacklist', async (req, res) => {
    const { nom_prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur } = req.body;
    if (!nom_prenom || !date_naissance || !lieu_naissance || !telephone || !type_utilisateur) {
        return res.status(400).json({ error: 'Données blacklist manquantes' });
    }
    const result = await query('INSERT INTO blacklist(nom_prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *', [nom_prenom, date_naissance, lieu_naissance, telephone, motif || '', type_utilisateur]);
    res.status(201).json(result.rows[0]);
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

export default router;
