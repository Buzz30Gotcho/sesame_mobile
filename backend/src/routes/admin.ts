import express from 'express';
import bcrypt from 'bcrypt';
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
        `SELECT c.id AS chauffeur_id, u.prenom, u.nom, u.email, u.telephone, c.disponible, c.vehicule_type, c.vehicule_marque, c.vehicule_modele, c.taux_commission_override, c.documents_valides
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY u.nom ASC`
    );
    res.json(result.rows);
});

router.get('/courses', async (req, res) => {
    const result = await query(
        `SELECT id, reference, ambassadeur_id, chauffeur_id, statut, type_course, adresse_depart, adresse_destination, montant, date_reservation, date_acceptation, date_fin
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
    const { nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, admin_id } = req.body;
    if (!nom || !prenom || !date_naissance || !lieu_naissance || !telephone || !type_utilisateur) {
        return res.status(400).json({ error: 'Données blacklist manquantes' });
    }
    const adminUuid = admin_id || '00000000-0000-0000-0000-000000000000';
    const result = await query(
        'INSERT INTO blacklist(nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, ajoute_par_admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [nom, prenom, date_naissance, lieu_naissance, telephone, motif || '', type_utilisateur, adminUuid]
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
    const code = Math.floor(1000 + Math.random() * 9000).toString();
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

// Régénérer le code secret d'un fournisseur
router.post('/fournisseurs/:id/regenerer-code', async (req, res) => {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const code_secret_hash = await bcrypt.hash(code, 10);
    await query('UPDATE fournisseurs SET code_secret_hash = $1, bloque = false, nb_tentatives_echouees = 0 WHERE id = $2', [code_secret_hash, req.params.id]);
    res.json({ success: true, code_secret_temporaire: code });
});

// Commissions Ambassadeurs Moraux
router.get('/commissions/moraux', async (req, res) => {
    const rateResult = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);
    const moisCourant = new Date();
    moisCourant.setDate(1);
    moisCourant.setHours(0, 0, 0, 0);

    const result = await query(
        `SELECT
            a.id AS ambassadeur_id,
            u.prenom, u.nom, u.email,
            count(c.id) AS nb_courses,
            COALESCE(sum(c.montant), 0) AS ca_brut_ttc,
            round(COALESCE(sum(c.montant), 0) * $1 / 100, 2) AS commission,
            a.iban
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         LEFT JOIN courses c ON c.ambassadeur_id = a.id
             AND c.statut = 'terminee'
             AND c.code_valide_at IS NOT NULL
             AND date_trunc('month', c.date_fin) = date_trunc('month', now())
         WHERE a.type_ambassadeur = 'moral'
         GROUP BY a.id, u.prenom, u.nom, u.email, a.iban
         ORDER BY ca_brut_ttc DESC`,
        [tauxPct]
    );
    res.json({ taux_pct: tauxPct, ambassadeurs: result.rows });
});

router.post('/commissions/declencher', async (req, res) => {
    // TODO: déclencher virements SEPA via Stripe/banque
    // Enregistre l'événement — l'intégration Stripe sera ajoutée ultérieurement
    res.json({ success: true, message: 'Ordre de virement déclenché. Intégration bancaire à configurer.' });
});

// Tickets support (stub — table à créer si fonctionnalité développée)
router.get('/support/tickets', async (req, res) => {
    res.json({ tickets: [], total: 0 });
});

export default router;
