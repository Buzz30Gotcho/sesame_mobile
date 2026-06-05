import express from 'express';
import { stripe } from '../lib/stripeClient';
import { query } from '../db';
import { sendPushNotification } from '../lib/pushNotifications';

const router = express.Router();

// Corps brut requis pour vérification signature Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

    let event: ReturnType<typeof stripe.webhooks.constructEvent>;
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch {
        return res.status(400).json({ error: 'Signature webhook invalide' });
    }

    if (event.type === 'invoice.paid') {
        const invoice = event.data.object as { customer: string };
        const customerId = invoice.customer;

        const result = await query(
            `UPDATE utilisateurs u
             SET statut = 'actif'
             FROM chauffeurs c
             WHERE c.utilisateur_id = u.id
               AND c.stripe_customer_id = $1
             RETURNING u.id, c.push_token`,
            [customerId]
        );

        if (result.rows.length > 0 && result.rows[0].push_token) {
            await sendPushNotification(
                result.rows[0].push_token,
                'Compte réactivé',
                'Votre paiement a été reçu. Votre compte est de nouveau actif.',
            ).catch(() => {});
        }
    }

    res.json({ received: true });
});

export default router;
