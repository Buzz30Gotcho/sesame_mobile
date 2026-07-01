import express from 'express';
import { query } from '../db';
import { broadcastChatMessage } from '../ws/chatHub';
import { sendPushNotification } from '../lib/pushNotifications';
import { ownCourseParam, resolveIdentity, AuthedRequest } from '../middleware/auth';

const router = express.Router();

// Longueur maximale d'un message (anti-DoS stockage / abus).
const MAX_MESSAGE_LENGTH = 2000;

// Sentinelle pour les messages émis par l'admin (compte partagé, pas d'id par opérateur).
// messages_chat.expediteur_id est NOT NULL → on ne peut pas y mettre null.
const ADMIN_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

// Propriété : seul un participant de la course (ambassadeur ou chauffeur) peut lire/écrire le chat.
router.param('courseId', ownCourseParam);

router.get('/:courseId/messages', async (req, res) => {
    const result = await query('SELECT * FROM messages_chat WHERE course_id = $1 ORDER BY envoye_at ASC', [req.params.courseId]);
    res.json(result.rows);
});

router.post('/:courseId/messages', async (req, res) => {
    const r = req as AuthedRequest;
    const { contenu } = req.body;
    if (!contenu || typeof contenu !== 'string' || !contenu.trim()) {
        return res.status(400).json({ error: 'Message vide' });
    }
    const texte = contenu.slice(0, MAX_MESSAGE_LENGTH);

    // L'identité de l'expéditeur est dérivée du token, JAMAIS du body (anti-usurpation).
    let expediteur_type: string;
    let expediteur_id: string;
    if (r.isAdmin) {
        expediteur_type = 'admin';
        expediteur_id = ADMIN_ACTOR_ID;
    } else {
        const ident = await resolveIdentity(r);
        const courseRow = await query('SELECT ambassadeur_id, chauffeur_id FROM courses WHERE id = $1', [req.params.courseId]);
        const c = courseRow.rows[0];
        if (ident.ambassadeurId && c?.ambassadeur_id === ident.ambassadeurId) {
            expediteur_type = 'ambassadeur';
            expediteur_id = ident.ambassadeurId;
        } else if (ident.chauffeurId && c?.chauffeur_id === ident.chauffeurId) {
            expediteur_type = 'chauffeur';
            expediteur_id = ident.chauffeurId;
        } else {
            return res.status(403).json({ error: 'Accès refusé' });
        }
    }

    const result = await query(
        'INSERT INTO messages_chat(course_id, expediteur_type, expediteur_id, contenu) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.params.courseId, expediteur_type, expediteur_id, texte]
    );

    const message = result.rows[0];
    broadcastChatMessage(req.params.courseId, message);

    // Push FCM vers le destinataire (l'autre partie)
    try {
        if (expediteur_type === 'ambassadeur') {
            // Notifie le chauffeur
            const row = await query(
                `SELECT ch.push_token FROM courses co JOIN chauffeurs ch ON ch.id = co.chauffeur_id WHERE co.id = $1`,
                [req.params.courseId]
            );
            const pushToken = row.rows[0]?.push_token;
            if (pushToken) {
                await sendPushNotification(
                    pushToken,
                    'Nouveau message',
                    texte.length > 80 ? texte.slice(0, 77) + '…' : texte,
                    { type: 'chat', course_id: req.params.courseId }
                );
            }
        } else if (expediteur_type === 'chauffeur') {
            // Notifie l'ambassadeur
            const row = await query(
                `SELECT a.push_token FROM courses co JOIN ambassadeurs a ON a.id = co.ambassadeur_id WHERE co.id = $1`,
                [req.params.courseId]
            );
            const pushToken = row.rows[0]?.push_token;
            if (pushToken) {
                await sendPushNotification(
                    pushToken,
                    'Nouveau message',
                    texte.length > 80 ? texte.slice(0, 77) + '…' : texte,
                    { type: 'chat', course_id: req.params.courseId }
                );
            }
        }
    } catch { /* Non bloquant */ }

    res.status(201).json(message);
});

export default router;
