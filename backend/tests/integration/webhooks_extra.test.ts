import request from 'supertest';
import crypto from 'crypto';
import { stripe } from '../../src/lib/stripeClient';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { app, registerChauffeur, db } from '../helpers/api';

// Compléments webhooks : signature invalide, notifications push, échec de prélèvement,
// catch setup carte, et vérification HMAC Yousign.

describe('Stripe webhook — branches non couvertes', () => {
    function sendRaw(body: string) {
        return request(app).post('/api/stripe/webhook')
            .set('Content-Type', 'application/json')
            .set('stripe-signature', 'test')
            .send(body);
    }
    function send(event: object) { return sendRaw(JSON.stringify(event)); }

    it('corps illisible → signature invalide (400)', async () => {
        const res = await sendRaw('pas-du-json');
        expect(res.status).toBe(400);
    });

    it('invoice.paid notifie le chauffeur réactivé (push)', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE utilisateurs SET statut='suspendu' WHERE id=$1", [chf.userId]);
        await db().query("UPDATE chauffeurs SET stripe_customer_id='cus_paid', push_token='ExpoPaid' WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await send({ type: 'invoice.paid', data: { object: { customer: 'cus_paid' } } });
        expect(res.status).toBe(200);
        expect(sendPushNotification).toHaveBeenCalled();
    });

    it('invoice.payment_failed alerte le chauffeur (payment_failed)', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET stripe_customer_id='cus_fail', push_token='ExpoFail' WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await send({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_fail' } } });
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'payment_failed')).toBe(true);
    });

    it('checkout.session.completed : erreur Stripe interceptée (200)', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET stripe_customer_id='cus_err' WHERE id=$1", [chf.chauffeur_id]);
        (stripe.setupIntents.retrieve as jest.Mock).mockRejectedValueOnce(new Error('stripe down'));
        const res = await send({
            type: 'checkout.session.completed',
            data: { object: { mode: 'setup', setup_intent: 'seti_x', customer: 'cus_err' } },
        });
        expect(res.status).toBe(200); // erreur avalée, webhook acquitté
        const r = await db().query('SELECT carte_enregistree FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(r.rows[0].carte_enregistree).toBe(false);
    });
});

describe('Yousign webhook — vérification HMAC', () => {
    const OLD = process.env.YOUSIGN_WEBHOOK_SECRET;
    afterAll(() => { if (OLD === undefined) delete process.env.YOUSIGN_WEBHOOK_SECRET; else process.env.YOUSIGN_WEBHOOK_SECRET = OLD; });

    function sign(secret: string, body: string) {
        return crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
    }

    it('accepte une signature HMAC valide (200)', async () => {
        process.env.YOUSIGN_WEBHOOK_SECRET = 'sek_test';
        const f = await db().query("INSERT INTO fournisseurs(nom_societe, contrat_signe, statut) VALUES ('ACME', false, 'en_configuration') RETURNING id");
        const body = JSON.stringify({ event_name: 'signature_request.done', data: { signature_request: { external_id: f.rows[0].id } } });
        const res = await request(app).post('/api/yousign/webhook')
            .set('Content-Type', 'application/json')
            .set('x-yousign-signature-256', 'sha256=' + sign('sek_test', body))
            .send(body);
        expect(res.status).toBe(200);
        const r = await db().query('SELECT contrat_signe FROM fournisseurs WHERE id=$1', [f.rows[0].id]);
        expect(r.rows[0].contrat_signe).toBe(true);
    });

    it('rejette une signature HMAC invalide (401)', async () => {
        process.env.YOUSIGN_WEBHOOK_SECRET = 'sek_test';
        const body = JSON.stringify({ event_name: 'signature_request.done', data: {} });
        const res = await request(app).post('/api/yousign/webhook')
            .set('Content-Type', 'application/json')
            .set('x-yousign-signature-256', 'sha256=' + 'ab'.repeat(32))
            .send(body);
        expect(res.status).toBe(401);
    });
});
