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
    } catch (err) {
        console.error('[stripe-webhook] Signature invalide:', (err as Error).message);
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

    // Échec du prélèvement automatique des frais SÉSAME → prévenir le chauffeur tout de suite
    // (Stripe retentera ; la suspension effective reste gérée par le cron du mardi).
    if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object as { customer: string };
        try {
            const result = await query(
                `SELECT c.push_token
                 FROM chauffeurs c
                 WHERE c.stripe_customer_id = $1`,
                [invoice.customer]
            );
            if (result.rows.length > 0 && result.rows[0].push_token) {
                await sendPushNotification(
                    result.rows[0].push_token,
                    'Échec du prélèvement',
                    'Le règlement de vos frais SÉSAME a échoué. Vérifiez votre carte dans l\'app pour éviter la suspension.',
                    { type: 'payment_failed' }
                ).catch(() => {});
            }
        } catch (err) {
            console.error('[stripe-webhook] invoice.payment_failed:', (err as Error).message);
        }
    }

    // Carte enregistrée via Checkout (mode setup) → la définir comme moyen de paiement
    // par défaut pour le prélèvement auto des frais SÉSAME (specs §7.1).
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as { mode?: string; setup_intent?: string; customer?: string };
        if (session.mode === 'setup' && session.setup_intent && session.customer) {
            try {
                const si = await stripe.setupIntents.retrieve(session.setup_intent);
                const pm = si.payment_method as string | null;
                if (pm) {
                    await stripe.customers.update(session.customer, {
                        invoice_settings: { default_payment_method: pm },
                    });
                    await query(
                        'UPDATE chauffeurs SET carte_enregistree = true WHERE stripe_customer_id = $1',
                        [session.customer]
                    );
                }
            } catch (err) {
                console.error('[stripe-webhook] checkout.session.completed (setup):', (err as Error).message);
            }
        }
    }

    res.json({ received: true });
});

export default router;
