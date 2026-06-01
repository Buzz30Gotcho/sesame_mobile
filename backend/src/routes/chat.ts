import express from 'express';
import { query } from '../db';

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

    res.status(201).json(result.rows[0]);
});

export default router;
