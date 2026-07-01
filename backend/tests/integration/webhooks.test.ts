import request from 'supertest';
import { app, registerChauffeur, db } from '../helpers/api';

// Webhooks Stripe (réactivation paiement, enregistrement carte) et Yousign (contrat signé
// → boutique débloquée). Signatures non vérifiées en test (secrets absents) ; corps brut.

describe('POST /api/stripe/webhook', () => {
    function send(event: object) {
        return request(app).post('/api/stripe/webhook')
            .set('Content-Type', 'application/json')
            .set('stripe-signature', 'test')
            .send(JSON.stringify(event));
    }

    it('invoice.paid réactive le chauffeur suspendu', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE utilisateurs SET statut='suspendu' WHERE id=$1", [chf.userId]);
        await db().query("UPDATE chauffeurs SET stripe_customer_id='cus_abc' WHERE id=$1", [chf.chauffeur_id]);

        const res = await send({ type: 'invoice.paid', data: { object: { customer: 'cus_abc' } } });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT statut FROM utilisateurs WHERE id=$1', [chf.userId]);
        expect(r.rows[0].statut).toBe('actif');
    });

    it('checkout.session.completed (setup) enregistre la carte par défaut', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET stripe_customer_id='cus_card' WHERE id=$1", [chf.chauffeur_id]);

        const res = await send({
            type: 'checkout.session.completed',
            data: { object: { mode: 'setup', setup_intent: 'seti_1', customer: 'cus_card' } },
        });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT carte_enregistree FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(r.rows[0].carte_enregistree).toBe(true);
    });

    it('ignore un type d\'événement non géré (200)', async () => {
        const res = await send({ type: 'customer.created', data: { object: {} } });
        expect(res.status).toBe(200);
    });
});

describe('POST /api/yousign/webhook', () => {
    function send(payload: string) {
        return request(app).post('/api/yousign/webhook')
            .set('Content-Type', 'application/json')
            .send(payload);
    }

    it('signature_request.done débloque le contrat fournisseur', async () => {
        const f = await db().query(
            `INSERT INTO fournisseurs(nom_societe, contrat_signe, statut) VALUES ('ACME', false, 'en_configuration') RETURNING id`
        );
        const fournisseurId = f.rows[0].id;

        const res = await send(JSON.stringify({
            event_name: 'signature_request.done',
            data: { signature_request: { external_id: fournisseurId } },
        }));
        expect(res.status).toBe(200);
        const r = await db().query('SELECT contrat_signe FROM fournisseurs WHERE id=$1', [fournisseurId]);
        expect(r.rows[0].contrat_signe).toBe(true);
    });

    it('refuse un JSON invalide (400)', async () => {
        const res = await send('ceci-n-est-pas-du-json');
        expect(res.status).toBe(400);
    });

    it('ignore un autre événement (200)', async () => {
        const res = await send(JSON.stringify({ event_name: 'signature_request.activated' }));
        expect(res.status).toBe(200);
    });
});
