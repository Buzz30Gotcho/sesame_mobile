import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { sendPushNotification } from '../lib/pushNotifications';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'sesame-secret';

// Login admin
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    const token = jwt.sign({ sub: 'admin', role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
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
    if (!contenu) return res.status(400).json({ error: 'Contenu requis' });
    const result = await query('INSERT INTO messages_chat(course_id, expediteur_type, expediteur_id, contenu) VALUES ($1,$2,$3,$4) RETURNING *', [courseId, 'admin', req.body.admin_id || null, contenu]);
    res.status(201).json(result.rows[0]);
});

router.get('/ambassadeurs', async (req, res) => {
    const result = await query(
        `SELECT a.id AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                a.points_solde AS points, a.niveau, a.type_ambassadeur AS type,
                a.contrat_moral_signe, u.statut AS compte_statut, a.note_interne,
                u.created_at
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
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
    await query(
        `UPDATE documents_chauffeur SET statut = 'valide' WHERE id = $1`,
        [req.params.id]
    );
    // Vérifie si tous les docs obligatoires sont validés
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

router.get('/blacklist', async (req, res) => {
    const result = await query('SELECT * FROM blacklist ORDER BY id DESC');
    res.json(result.rows);
});

router.post('/blacklist', async (req, res) => {
    const { nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, admin_id } = req.body;
    if (!nom || !prenom || !date_naissance || !telephone || !type_utilisateur) {
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
