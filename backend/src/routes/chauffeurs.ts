import express from 'express';
import multer from 'multer';
import { randomInt } from 'crypto';
import { query } from '../db';
import { calculatePoints, nextAmbassadorLevel } from '../lib/rules';
import { crediterPaliersParrainage, executerSanctionsEnAttente, checkAndSuspendExpiredDocsChauffeur } from '../lib/courseHelpers';
import { sendPushNotification } from '../lib/pushNotifications';
import { stripe } from '../lib/stripeClient';
import { ownChauffeurParam } from '../middleware/auth';
import { codeLimiter } from '../middleware/rateLimit';

const router = express.Router();

// Propriété : :id doit être le chauffeur du token (sinon 403).
router.param('id', ownChauffeurParam);

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
            c.iban,
            c.siret,
            c.taux_commission_override,
            c.stripe_customer_id,
            c.documents_valides
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
            c.taux_commission_override,
            c.documents_valides
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
        `SELECT c.id, c.reference, c.statut, c.type_course, c.adresse_depart, c.adresse_destination, c.montant, c.date_reservation, c.date_acceptation,
                u.telephone AS ambassadeur_telephone, u.prenom AS ambassadeur_prenom
         FROM courses c
         LEFT JOIN ambassadeurs a ON a.id = c.ambassadeur_id
         LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
         WHERE c.chauffeur_id = $1 AND c.statut IN ($2,$3,$4,$5,$6)
         ORDER BY c.date_acceptation DESC NULLS LAST`,
        [req.params.id, 'recherche', 'acceptee', 'en_route', 'code_valide', 'en_cours']
    );

    const activeCount = assignedCourses.rows.length;
    const nextCourse = assignedCourses.rows[0] || null;

    const statsJour = await query(
        `SELECT count(*) AS nb_courses, coalesce(sum(montant), 0) AS ca_jour
         FROM courses
         WHERE chauffeur_id = $1 AND statut = 'terminee' AND date_fin::date = CURRENT_DATE`,
        [req.params.id]
    );

    res.json({
        ...profile,
        active_courses_count: activeCount,
        current_course: nextCourse,
        courses_jour: Number(statsJour.rows[0]?.nb_courses || 0),
        ca_jour: Number(statsJour.rows[0]?.ca_jour || 0),
    });
});

router.put('/:id/profile', async (req, res) => {
    const { prenom, nom, telephone, iban, siret } = req.body;
    const profileResult = await query('SELECT utilisateur_id FROM chauffeurs WHERE id = $1', [req.params.id]);
    if (!profileResult.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    const utilisateurId = profileResult.rows[0].utilisateur_id;

    await query(
        `UPDATE utilisateurs SET
            prenom = COALESCE($1, prenom),
            nom = COALESCE($2, nom),
            telephone = COALESCE($3, telephone)
         WHERE id = $4`,
        [prenom || null, nom || null, telephone || null, utilisateurId]
    );
    await query(
        `UPDATE chauffeurs SET
            iban = COALESCE($1, iban),
            siret = COALESCE($2, siret)
         WHERE id = $3`,
        [iban || null, siret || null, req.params.id]
    );

    const updated = await query(
        `SELECT c.id AS chauffeur_id, u.prenom, u.nom, u.email, u.telephone, c.iban, c.siret
         FROM chauffeurs c JOIN utilisateurs u ON u.id = c.utilisateur_id WHERE c.id = $1`,
        [req.params.id]
    );
    res.json(updated.rows[0]);
});

router.get('/:id/courses', async (req, res) => {
    const result = await query(
        `SELECT id, reference, statut, type_course, adresse_depart, adresse_destination, montant, taux_commission_applique, date_reservation, date_acceptation, date_fin, annule_par
         FROM courses
         WHERE chauffeur_id = $1
         ORDER BY date_acceptation DESC NULLS LAST, date_fin DESC NULLS LAST`,
        [req.params.id]
    );
    res.json(result.rows);
});

router.get('/:id/courses-disponibles', async (req, res) => {
    const chauffeurResult = await query(
        'SELECT vehicule_type, disponible FROM chauffeurs WHERE id = $1',
        [req.params.id]
    );
    const chauffeur = chauffeurResult.rows[0];
    if (!chauffeur) return res.status(404).json({ error: 'Chauffeur introuvable' });
    if (!chauffeur.disponible) return res.json([]);

    const result = await query(
        `SELECT id, reference, adresse_depart, adresse_destination, vehicule_type, montant, type_course, date_reservation
         FROM courses
         WHERE statut = 'recherche'
           AND vehicule_type = $1
           AND chauffeur_id IS NULL
         ORDER BY date_acceptation DESC NULLS LAST
         LIMIT 1`,
        [chauffeur.vehicule_type]
    );
    res.json(result.rows);
});

router.put('/:id/availability', async (req, res) => {
    const { disponible } = req.body;
    if (disponible == null) return res.status(400).json({ error: 'disponible requis' });

    if (disponible) {
        const check = await query('SELECT documents_valides, iban FROM chauffeurs WHERE id = $1', [req.params.id]);
        if (!check.rows[0]?.documents_valides) {
            return res.status(403).json({ error: 'Vos documents doivent être validés par SÉSAME avant de vous mettre en ligne.' });
        }
        if (!check.rows[0]?.iban) {
            return res.status(403).json({ error: 'Veuillez renseigner votre IBAN dans votre profil avant de vous mettre en ligne.' });
        }
    }

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

    const code = randomInt(1000, 10000).toString();

    // Sauvegarder le taux override individuel du chauffeur au moment de l'acceptation (specs §1)
    const tauxRes = await query(
        `SELECT c.taux_commission_override, p.valeur AS taux_global
         FROM chauffeurs c
         CROSS JOIN parametres_systeme p
         WHERE c.id = $1 AND p.cle = 'taux_commission_global'`,
        [req.params.id]
    );
    const tauxApplique = tauxRes.rows[0]?.taux_commission_override ?? Number(tauxRes.rows[0]?.taux_global ?? 20);

    await query(
        'UPDATE courses SET chauffeur_id = $1, statut = $2, date_acceptation = now(), code_validation = $3, taux_commission_applique = $4 WHERE id = $5',
        [req.params.id, 'acceptee', code, tauxApplique, course_id]
    );
    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);

    // Notification push à l'ambassadeur
    try {
        const chauffeurResult = await query('SELECT u.prenom FROM chauffeurs c JOIN utilisateurs u ON u.id = c.utilisateur_id WHERE c.id = $1', [req.params.id]);
        const chauffeurPrenom = chauffeurResult.rows[0]?.prenom || 'Votre chauffeur';
        const ambTokenResult = await query(
            'SELECT a.push_token FROM ambassadeurs a JOIN courses c ON c.ambassadeur_id = a.id WHERE c.id = $1',
            [course_id]
        );
        const ambToken = ambTokenResult.rows[0]?.push_token;
        if (ambToken) {
            // Notification persistante — code visible tant que course active (specs §9.0)
            await sendPushNotification(
                ambToken,
                'Chauffeur trouvé !',
                `Code : ${code}. ${chauffeurPrenom} arrive dans quelques minutes.`,
                { course_id, code, type: 'CHAUFFEUR_ACCEPTE' },
                true
            );
        }
    } catch {
        // Non bloquant
    }

    res.json(updated.rows[0]);
});

router.post('/:id/validate-code', codeLimiter, async (req, res) => {
    const { course_id, code } = req.body;
    if (!course_id || !code) return res.status(400).json({ error: 'course_id et code requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1 AND chauffeur_id = $2', [course_id, req.params.id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    if (!course.code_validation || course.code_validation !== code) {
        return res.status(400).json({ error: 'Code invalide — contactez l\'Ambassadeur' });
    }

    await query('UPDATE courses SET statut = $1, code_valide_at = now() WHERE id = $2', ['code_valide', course_id]);

    // Notification CODE_VALIDE à l'ambassadeur
    try {
        const ambTokenResult = await query(
            'SELECT a.push_token FROM ambassadeurs a JOIN courses c ON c.ambassadeur_id = a.id WHERE c.id = $1',
            [course_id]
        );
        const ambToken = ambTokenResult.rows[0]?.push_token;
        if (ambToken) {
            await sendPushNotification(ambToken, 'Course démarrée', 'Votre client est à bord.', { course_id });
        }
    } catch { /* Non bloquant */ }

    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    res.json(updated.rows[0]);
});

router.post('/:id/finish-course', async (req, res) => {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1 AND chauffeur_id = $2', [course_id, req.params.id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });
    if (!['code_valide', 'en_cours'].includes(course.statut)) {
        return res.status(400).json({ error: 'Seules les courses en cours peuvent être terminées' });
    }

    await query('UPDATE courses SET statut = $1, date_fin = now() WHERE id = $2', ['terminee', course_id]);

    // Créditer les points UNIQUEMENT si : code pivot validé + Ambassadeur Physique INDÉPENDANT.
    // Un employé (sous-compte d'un Moral) est 'physique' mais ne gagne PAS de points : la course
    // qu'il prescrit génère la commission du Moral, pas de points personnels (specs §1.5 + §1 Moral).
    if (course.code_valide_at && course.ambassadeur_id && course.montant) {
        const ambResult = await query(
            `SELECT a.points_solde, a.type_ambassadeur, a.parrain_id, a.niveau, a.push_token,
                    EXISTS(SELECT 1 FROM sous_comptes_employes s WHERE s.utilisateur_id = a.utilisateur_id) AS est_sous_compte
             FROM ambassadeurs a WHERE a.id = $1`,
            [course.ambassadeur_id]
        );
        const amb = ambResult.rows[0];

        if (amb && amb.type_ambassadeur !== 'moral' && !amb.est_sous_compte) {
            const pts = calculatePoints(Number(course.montant));
            if (pts > 0) {
                const solde_avant = Number(amb.points_solde || 0);
                const solde_apres = solde_avant + pts;
                const newLevel = nextAmbassadorLevel(solde_apres);

                await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, course.ambassadeur_id]);
                await query(
                    'INSERT INTO points_historique(ambassadeur_id, type, montant, solde_avant, solde_apres, course_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                    [course.ambassadeur_id, 'gain', pts, solde_avant, solde_apres, course_id, `Points gagnés pour la course ${course.reference}`]
                );
                await query('UPDATE courses SET points_attribues = $1 WHERE id = $2', [pts, course_id]);

                // Parrainage — 4 paliers cumulatifs (specs §1.4)
                if (amb.parrain_id) {
                    await crediterPaliersParrainage(course.ambassadeur_id, amb.parrain_id, solde_apres, newLevel, course_id).catch(() => {});
                }

                // Sanctions différées (specs §3.6) — met à jour le niveau si déduction
                await executerSanctionsEnAttente(course.ambassadeur_id).catch(() => {});

                // Notification COURSE_TERMINEE
                if (amb.push_token) {
                    await sendPushNotification(amb.push_token, 'Course terminée', `+${pts} points crédités.`, { type: 'COURSE_TERMINEE', course_id }).catch(() => {});
                }
            }
        }
    }

    // Document expiré pendant la course → suspendre maintenant (specs §9.1)
    await checkAndSuspendExpiredDocsChauffeur(req.params.id).catch(() => {});

    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    res.json(updated.rows[0]);
});

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUCKET = 'documents-kyc_sesame_chauffeur';

// Whitelist des types de documents (empêche tout chemin de stockage arbitraire / traversal).
const VALID_DOC_TYPES = new Set([
    'carte_identite', 'carte_vtc', 'revtc', 'kbis', 'permis', 'rir',
    'rc_pro', 'rc_circulation', 'carte_grise', 'certificat_medical', 'photo_profil',
]);
const VALID_SIDES = new Set(['recto', 'verso']);

const ALLOWED_DOC_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        // Restreint aux types attendus (le mimetype reste déclaré par le client, mais on bloque l'évident).
        cb(null, ALLOWED_DOC_TYPES.includes(file.mimetype));
    },
});

// Upload document — reçoit le fichier du mobile, le transfère vers Supabase Storage
router.post('/:id/documents/upload', upload.single('file'), async (req: any, res) => {
    const { type, side } = req.body;
    if (!type || !side || !req.file) {
        return res.status(400).json({ error: 'type, side et fichier requis' });
    }
    // Bornage strict : type/side entrent dans le chemin de stockage Supabase → jamais de valeur libre.
    if (!VALID_DOC_TYPES.has(type) || !VALID_SIDES.has(side)) {
        return res.status(400).json({ error: 'type ou side invalide' });
    }
    const mimeType = req.file.mimetype;
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
    const storagePath = `${req.params.id}/${type}_${side}_${Date.now()}.${ext}`;

    try {
        const upRes = await fetch(
            `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    'Content-Type': mimeType,
                    'x-upsert': 'true',
                },
                body: req.file.buffer,
            }
        );
        if (!upRes.ok) {
            const err = await upRes.text();
            return res.status(500).json({ error: 'Erreur Supabase Storage', detail: err });
        }

        // Chercher si ce type de document existe déjà
        const existing = await query(
            'SELECT id FROM documents_chauffeur WHERE chauffeur_id = $1 AND type = $2',
            [req.params.id, type]
        );

        let doc;
        if (existing.rows.length > 0) {
            const col = side === 'recto' ? 'fichier_recto_url' : 'fichier_verso_url';
            const result = await query(
                `UPDATE documents_chauffeur SET ${col} = $1 WHERE id = $2 RETURNING *`,
                [storagePath, existing.rows[0].id]
            );
            doc = result.rows[0];
        } else {
            const rectoPath = side === 'recto' ? storagePath : null;
            const versoPath = side === 'verso' ? storagePath : null;
            const result = await query(
                'INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url, fichier_verso_url) VALUES ($1,$2,$3,$4) RETURNING *',
                [req.params.id, type, rectoPath, versoPath]
            );
            doc = result.rows[0];
        }
        res.json(doc);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/:id/documents', async (req, res) => {
    const result = await query(
        'SELECT * FROM documents_chauffeur WHERE chauffeur_id = $1 ORDER BY uploaded_at DESC',
        [req.params.id]
    );
    // Génère des URLs signées de lecture (valides 1h) pour les fichiers privés
    const docs = await Promise.all(result.rows.map(async (doc) => {
        const signUrl = async (storagePath: string | null) => {
            if (!storagePath) return null;
            try {
                const r = await fetch(
                    `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`,
                    {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ expiresIn: 3600 }),
                    }
                );
                if (!r.ok) return storagePath;
                const { signedURL } = await r.json() as { signedURL: string };
                const path = signedURL.startsWith('/storage/v1') ? signedURL : `/storage/v1${signedURL}`;
                return `${SUPABASE_URL}${path}`;
            } catch { return storagePath; }
        };
        return {
            ...doc,
            fichier_recto_url: await signUrl(doc.fichier_recto_url),
            fichier_verso_url: await signUrl(doc.fichier_verso_url),
        };
    }));
    res.json(docs);
});

router.post('/:id/documents', async (req, res) => {
    const { type, fichier_recto_url, fichier_verso_url, date_expiration } = req.body;
    if (!type || !fichier_recto_url) {
        return res.status(400).json({ error: 'type et fichier_recto_url requis' });
    }
    const result = await query(
        'INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url, fichier_verso_url, date_expiration) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [req.params.id, type, fichier_recto_url, fichier_verso_url || null, date_expiration || null]
    );
    res.status(201).json(result.rows[0]);
});

router.put('/:id/documents/:docId', async (req, res) => {
    const { fichier_recto_url, fichier_verso_url, date_expiration } = req.body;
    const result = await query(
        `UPDATE documents_chauffeur SET
            fichier_recto_url = COALESCE($1, fichier_recto_url),
            fichier_verso_url = COALESCE($2, fichier_verso_url),
            date_expiration   = COALESCE($3, date_expiration)
         WHERE id = $4 AND chauffeur_id = $5 RETURNING *`,
        [fichier_recto_url || null, fichier_verso_url || null, date_expiration || null, req.params.docId, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Document introuvable' });
    res.json(result.rows[0]);
});

router.put('/:id/push-token', async (req, res) => {
    const { push_token } = req.body;
    if (!push_token) return res.status(400).json({ error: 'push_token requis' });
    await query('UPDATE chauffeurs SET push_token = $1 WHERE id = $2', [push_token, req.params.id]);
    res.json({ success: true });
});

// Refus de course — AUCUNE sanction, règle juridique absolue
router.post('/:id/refuse-course', async (req, res) => {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requis' });
    // 0 sanction pour refus (specs §9 — règle juridique absolue)
    await query('UPDATE courses SET chauffeur_id = NULL, statut = $1, date_acceptation = NULL, code_validation = NULL WHERE id = $2 AND chauffeur_id = $3', ['recherche', course_id, req.params.id]);

    // Relance automatique vers les autres chauffeurs disponibles (specs §1.5)
    const course = await query('SELECT vehicule_type, adresse_depart, adresse_destination, montant FROM courses WHERE id = $1', [course_id]);
    if (course.rows[0]) {
        const { vehicule_type, adresse_depart, adresse_destination, montant } = course.rows[0];
        const chauffeurs = await query(
            `SELECT push_token FROM chauffeurs WHERE disponible = true AND vehicule_type = $1 AND push_token IS NOT NULL AND id != $2`,
            [vehicule_type, req.params.id]
        );
        const body = `${adresse_depart} → ${adresse_destination} · ${Number(montant).toFixed(2)} €`;
        for (const ch of chauffeurs.rows) {
            await sendPushNotification(ch.push_token, 'Nouvelle course', body, { course_id }).catch(() => {});
        }
    }

    res.json({ success: true, message: 'Course refusée sans sanction.' });
});

// Client absent — seul SESAME peut annuler, le chauffeur signale seulement
router.post('/:id/client-absent', async (req, res) => {
    const { course_id } = req.body;
    if (!course_id) return res.status(400).json({ error: 'course_id requis' });

    const courseResult = await query('SELECT * FROM courses WHERE id = $1 AND chauffeur_id = $2', [course_id, req.params.id]);
    const course = courseResult.rows[0];
    if (!course) return res.status(404).json({ error: 'Course introuvable' });

    // Créer une sanction en attente pour alerte admin — pas d'annulation automatique
    await query(
        "INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, course_id) VALUES ($1, 0, 'Client absent signalé par chauffeur', $2)",
        [course.ambassadeur_id, course_id]
    );

    // Notification CHAUFFEUR_ATTEND à l'ambassadeur
    try {
        const ambTokenResult = await query('SELECT push_token FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
        const ambToken = ambTokenResult.rows[0]?.push_token;
        if (ambToken) {
            await sendPushNotification(ambToken, 'Votre chauffeur vous attend !', 'Il attend depuis quelques minutes. Contactez-le.', { course_id });
        }
    } catch { /* Non bloquant */ }

    res.json({ success: true, message: 'Alerte client absent envoyée à l\'équipe SESAME. Un opérateur va intervenir.' });
});

// Portail de facturation Stripe
router.get('/:id/billing-portal', async (req, res) => {
    const result = await query(
        'SELECT stripe_customer_id FROM chauffeurs WHERE id = $1',
        [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });

    let customerId = result.rows[0].stripe_customer_id;

    // Créer le customer Stripe si inexistant (chauffeurs inscrits avant l'intégration)
    if (!customerId) {
        const profile = await query(
            'SELECT u.email, u.prenom, u.nom FROM chauffeurs c JOIN utilisateurs u ON u.id = c.utilisateur_id WHERE c.id = $1',
            [req.params.id]
        );
        const u = profile.rows[0];
        const customer = await stripe.customers.create({
            email: u.email,
            name: `${u.prenom} ${u.nom}`.trim(),
        });
        customerId = customer.id;
        await query('UPDATE chauffeurs SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.params.id]);
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.BACKEND_URL || 'http://localhost:4001'}/retour-stripe`,
    });

    res.json({ url: session.url });
});

export default router;
