import express from 'express';
import { query } from '../db';
import { AuthedRequest } from '../middleware/auth';

const router = express.Router();

// Catégories de ticket (specs §3.6 / §10).
const CATEGORIES = ['probleme_course', 'paiement_points', 'document_refuse', 'question_compte', 'autre'];
const MAX_MESSAGE_LENGTH = 2000;

// Vérifie que le ticket :id appartient bien à l'utilisateur du token (sinon 403/404).
async function ownTicket(req: AuthedRequest): Promise<{ ok: boolean; status?: number }> {
    const r = await query('SELECT utilisateur_id FROM tickets WHERE id = $1', [req.params.id]);
    if (!r.rows.length) return { ok: false, status: 404 };
    if (r.rows[0].utilisateur_id !== req.userId) return { ok: false, status: 403 };
    return { ok: true };
}

// Liste des tickets de l'utilisateur connecté (+ aperçu du dernier message).
router.get('/', async (req, res) => {
    const r = req as AuthedRequest;
    const result = await query(
        `SELECT t.id, t.categorie, t.sujet, t.statut, t.course_id, t.created_at, t.updated_at,
                c.reference AS course_reference,
                (SELECT contenu FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS dernier_message
         FROM tickets t
         LEFT JOIN courses c ON c.id = t.course_id
         WHERE t.utilisateur_id = $1
         ORDER BY t.updated_at DESC`,
        [r.userId]
    );
    res.json(result.rows);
});

// Création d'un ticket + premier message.
router.post('/', async (req, res) => {
    const r = req as AuthedRequest;
    const { categorie, sujet, course_id, message } = req.body;
    if (!CATEGORIES.includes(categorie)) {
        return res.status(400).json({ error: `Catégorie invalide (${CATEGORIES.join(', ')}).` });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Message vide' });
    }
    const ticket = await query(
        `INSERT INTO tickets (utilisateur_id, categorie, sujet, course_id)
         VALUES ($1,$2,$3,$4) RETURNING id`,
        [r.userId, categorie, (sujet || '').slice(0, 200) || null, course_id || null]
    );
    const ticketId = ticket.rows[0].id;
    await query(
        `INSERT INTO ticket_messages (ticket_id, role, contenu) VALUES ($1,'utilisateur',$2)`,
        [ticketId, message.slice(0, MAX_MESSAGE_LENGTH)]
    );
    res.status(201).json({ id: ticketId });
});

// Messages d'un ticket de l'utilisateur connecté.
router.get('/:id/messages', async (req, res) => {
    const r = req as AuthedRequest;
    const own = await ownTicket(r);
    if (!own.ok) return res.status(own.status!).json({ error: own.status === 404 ? 'Ticket introuvable' : 'Accès refusé' });
    const result = await query(
        'SELECT id, role, contenu, created_at FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
        [req.params.id]
    );
    res.json(result.rows);
});

// Réponse de l'utilisateur dans son ticket (rouvre le ticket s'il était résolu).
router.post('/:id/messages', async (req, res) => {
    const r = req as AuthedRequest;
    const own = await ownTicket(r);
    if (!own.ok) return res.status(own.status!).json({ error: own.status === 404 ? 'Ticket introuvable' : 'Accès refusé' });
    const { contenu } = req.body;
    if (!contenu || typeof contenu !== 'string' || !contenu.trim()) {
        return res.status(400).json({ error: 'Message vide' });
    }
    await query(
        `INSERT INTO ticket_messages (ticket_id, role, contenu) VALUES ($1,'utilisateur',$2)`,
        [req.params.id, contenu.slice(0, MAX_MESSAGE_LENGTH)]
    );
    await query(
        `UPDATE tickets SET updated_at = now(), statut = CASE WHEN statut = 'resolu' THEN 'ouvert' ELSE statut END WHERE id = $1`,
        [req.params.id]
    );
    res.status(201).json({ success: true });
});

export default router;
