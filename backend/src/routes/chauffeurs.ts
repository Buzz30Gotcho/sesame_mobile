import express from 'express';
import { query } from '../db';
import { calculatePoints, nextAmbassadorLevel } from '../lib/rules';
import { sendPushNotification } from '../lib/pushNotifications';
import { stripe } from '../lib/stripeClient';

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
        `SELECT id, reference, statut, type_course, adresse_depart, adresse_destination, montant, date_reservation, date_acceptation
         FROM courses
         WHERE chauffeur_id = $1 AND statut IN ($2,$3,$4,$5,$6)
         ORDER BY date_acceptation DESC NULLS LAST`,
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
         ORDER BY date_annulation DESC NULLS LAST
         LIMIT 1`,
        [chauffeur.vehicule_type]
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
            await sendPushNotification(
                ambToken,
                'Chauffeur trouve !',
                `Code : ${code}. ${chauffeurPrenom} arrive dans quelques minutes.`,
                { course_id }
            );
        }
    } catch {
        // Non bloquant
    }

    res.json(updated.rows[0]);
});

router.post('/:id/validate-code', async (req, res) => {
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
    if (course.statut === 'terminee') return res.status(400).json({ error: 'Course déjà terminée' });

    await query('UPDATE courses SET statut = $1, date_fin = now() WHERE id = $2', ['terminee', course_id]);

    // Créditer les points Ambassadeur UNIQUEMENT si le code pivot a été validé (code_valide_at IS NOT NULL)
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

            // Vérifier les sanctions en attente
            const sanctions = await query(
                "SELECT * FROM sanctions_en_attente WHERE ambassadeur_id = $1 AND statut = 'en_attente' ORDER BY decide_at ASC",
                [course.ambassadeur_id]
            );
            for (const sanction of sanctions.rows) {
                const current = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
                const solde = Number(current.rows[0]?.points_solde || 0);
                if (solde >= sanction.points) {
                    await query('UPDATE ambassadeurs SET points_solde = points_solde - $1 WHERE id = $2', [sanction.points, course.ambassadeur_id]);
                    await query("UPDATE sanctions_en_attente SET statut = 'execute', execute_at = now() WHERE id = $1", [sanction.id]);

                    // Notification SANCTION_POINTS à l'ambassadeur
                    const sanctionTokenRes = await query('SELECT push_token FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
                    const sanctionToken = sanctionTokenRes.rows[0]?.push_token;
                    if (sanctionToken) {
                        const date = new Date(sanction.decide_at).toLocaleDateString('fr-FR');
                        await sendPushNotification(sanctionToken, `-${sanction.points} points prélevés`, `Suite à l'absence de votre client le ${date}.`).catch(() => {});
                    }
                }
            }

            // Notification push à l'ambassadeur — points crédités
            try {
                const ambTokenResult = await query('SELECT push_token FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
                const ambToken = ambTokenResult.rows[0]?.push_token;
                if (ambToken) {
                    await sendPushNotification(
                        ambToken,
                        'Course terminee',
                        `+${pts} points credites.`,
                        { course_id }
                    );
                }
            } catch {
                // Non bloquant
            }
        } else {
            // Pas de points — notifier quand même
            if (course.ambassadeur_id) {
                try {
                    const ambTokenResult = await query('SELECT push_token FROM ambassadeurs WHERE id = $1', [course.ambassadeur_id]);
                    const ambToken = ambTokenResult.rows[0]?.push_token;
                    if (ambToken) {
                        await sendPushNotification(ambToken, 'Course terminee', 'Course terminee.', { course_id });
                    }
                } catch {
                    // Non bloquant
                }
            }
        }
    }

    const updated = await query('SELECT * FROM courses WHERE id = $1', [course_id]);
    res.json(updated.rows[0]);
});

router.get('/:id/documents', async (req, res) => {
    const result = await query(
        'SELECT * FROM documents_chauffeur WHERE chauffeur_id = $1 ORDER BY uploaded_at DESC',
        [req.params.id]
    );
    res.json(result.rows);
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
    // Simplement ne pas assigner ce chauffeur, remettre en recherche
    await query('UPDATE courses SET chauffeur_id = NULL, statut = $1, date_acceptation = NULL, code_validation = NULL WHERE id = $2 AND chauffeur_id = $3', ['recherche', course_id, req.params.id]);
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
