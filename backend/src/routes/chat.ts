import express from 'express';
import { query } from '../db';
import { broadcastChatMessage } from '../index';
import { sendPushNotification } from '../lib/pushNotifications';

const router = express.Router();

router.get('/:courseId/messages', async (req, res) => {
    const result = await query('SELECT * FROM messages_chat WHERE course_id = $1 ORDER BY envoye_at ASC', [req.params.courseId]);
    res.json(result.rows);
});

router.post('/:courseId/messages', async (req, res) => {
    const { expediteur_type, expediteur_id, contenu } = req.body;
    if (!expediteur_type || !expediteur_id || !contenu) {
        return res.status(400).json({ error: 'Données de message manquantes' });
    }

    const result = await query(
        'INSERT INTO messages_chat(course_id, expediteur_type, expediteur_id, contenu) VALUES ($1,$2,$3,$4) RETURNING *',
        [req.params.courseId, expediteur_type, expediteur_id, contenu]
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
                    contenu.length > 80 ? contenu.slice(0, 77) + '…' : contenu,
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
                    contenu.length > 80 ? contenu.slice(0, 77) + '…' : contenu,
                    { type: 'chat', course_id: req.params.courseId }
                );
            }
        }
    } catch { /* Non bloquant */ }

    res.status(201).json(message);
});

export default router;
