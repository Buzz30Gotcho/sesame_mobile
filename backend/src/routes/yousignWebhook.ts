import express from 'express';
import crypto from 'crypto';
import { query } from '../db';

const router = express.Router();

// Webhook Yousign — corps brut requis pour vérifier la signature HMAC.
// À la fin de la signature, on passe le contrat à signé → la boutique se débloque
// (le verrou `boutique.ts` lit `contrat_signe`).
router.post('/webhook', express.raw({ type: '*/*' }), async (req, res) => {
    const secret = process.env.YOUSIGN_WEBHOOK_SECRET || '';
    const raw = req.body as Buffer;

    if (secret) {
        const provided = (req.headers['x-yousign-signature-256'] as string || '').replace(/^sha256=/, '');
        const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
        const ok = provided.length === expected.length &&
            crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
        if (!ok) return res.status(401).json({ error: 'Signature webhook invalide' });
    }

    let event: any;
    try {
        event = JSON.parse(raw.toString('utf8'));
    } catch {
        return res.status(400).json({ error: 'JSON invalide' });
    }

    if (event?.event_name === 'signature_request.done') {
        // external_id = id du fournisseur (posé à l'envoi) → on retrouve le fournisseur par son id.
        const externalId = event?.data?.signature_request?.external_id;
        const isUuid = typeof externalId === 'string' && /^[0-9a-f-]{36}$/i.test(externalId);
        if (isUuid) {
            await query(
                `UPDATE fournisseurs
                 SET contrat_signe = true,
                     contrat_signe_at = COALESCE(contrat_signe_at, now())
                 WHERE id = $1`,
                [externalId]
            );
        }
    }

    res.json({ received: true });
});

export default router;
