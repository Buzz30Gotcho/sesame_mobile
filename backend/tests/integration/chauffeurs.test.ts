import request from 'supertest';
import { stripe } from '../../src/lib/stripeClient';
import { app, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';

// Route chauffeurs : profil/dashboard, verrou mise en ligne (docs + IBAN + carte),
// cycle de course (accept → arrived → validate-code → finish + géofence + points),
// refus sans sanction, client absent, Stripe. Specs §6, §7, §8, §9.

describe('GET /api/chauffeurs/:id/profile & dashboard', () => {
    it('renvoie le profil du chauffeur propriétaire (200)', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/profile`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body.chauffeur_id).toBe(chf.chauffeur_id);
    });

    it('refuse le profil d\'un autre chauffeur (403)', async () => {
        const a = await registerChauffeur();
        const b = await registerChauffeur();
        const res = await request(app).get(`/api/chauffeurs/${a.chauffeur_id}/profile`).set(b.auth);
        expect(res.status).toBe(403);
    });

    it('dashboard renvoie les stats du jour', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/dashboard`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('active_courses_count');
        expect(res.body).toHaveProperty('ca_jour');
    });
});

describe('PUT /api/chauffeurs/:id/availability (verrou mise en ligne §7.1)', () => {
    it('refuse sans documents validés (403)', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/availability`).set(chf.auth)
            .send({ disponible: true });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/documents/i);
    });

    it('refuse sans IBAN (403)', async () => {
        const chf = await registerChauffeur();
        await db().query('UPDATE chauffeurs SET documents_valides=true WHERE id=$1', [chf.chauffeur_id]);
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/availability`).set(chf.auth)
            .send({ disponible: true });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/IBAN/i);
    });

    it('refuse sans carte enregistrée (403 NO_CARD)', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET documents_valides=true, iban='FR76...', stripe_customer_id='cus_x' WHERE id=$1", [chf.chauffeur_id]);
        // mock Stripe : pas de moyen de paiement par défaut
        (stripe.customers.retrieve as jest.Mock).mockResolvedValueOnce({ invoice_settings: {} });
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/availability`).set(chf.auth)
            .send({ disponible: true });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NO_CARD');
    });

    it('met en ligne quand tout est OK (200)', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET documents_valides=true, iban='FR76...', stripe_customer_id='cus_ok' WHERE id=$1", [chf.chauffeur_id]);
        (stripe.customers.retrieve as jest.Mock).mockResolvedValueOnce({ invoice_settings: { default_payment_method: 'pm_1' } });
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/availability`).set(chf.auth)
            .send({ disponible: true });
        expect(res.status).toBe(200);
        expect(res.body.disponible).toBe(true);
    });

    it('peut toujours se mettre hors ligne sans contrainte', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/availability`).set(chf.auth)
            .send({ disponible: false });
        expect(res.status).toBe(200);
        expect(res.body.disponible).toBe(false);
    });
});

describe('Cycle de course chauffeur', () => {
    // Crée une course en recherche prescrite par un ambassadeur, prête à être acceptée.
    async function setup() {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        return { amb, chf, course };
    }

    it('accepte une course → acceptee + code généré', async () => {
        const { chf, course } = await setup();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/accept-course`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(200);
        expect(res.body.statut).toBe('acceptee');
        expect(res.body.code_validation).toMatch(/^\d{4}$/);
    });

    it('refuse d\'accepter une course déjà prise (400)', async () => {
        const { chf, course } = await setup();
        await db().query("UPDATE courses SET statut='acceptee' WHERE id=$1", [course.id]);
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/accept-course`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(400);
    });

    it('déroule accept → arrived → validate-code → finish (terminee + points crédités)', async () => {
        const { amb, chf, course } = await setup();

        const acc = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/accept-course`).set(chf.auth)
            .send({ course_id: course.id });
        const code = acc.body.code_validation;

        const arr = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/arrived`).set(chf.auth)
            .send({ course_id: course.id });
        expect(arr.body.statut).toBe('en_route');

        const val = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/validate-code`).set(chf.auth)
            .send({ course_id: course.id, code });
        expect(val.body.statut).toBe('code_valide');

        // À destination (géocodage mocké = Paris) → géofence OK
        const fin = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/finish-course`).set(chf.auth)
            .send({ course_id: course.id, lat: 48.8566, lon: 2.3522 });
        expect(fin.status).toBe(200);
        expect(fin.body.statut).toBe('terminee');

        const r = await db().query('SELECT points_solde FROM ambassadeurs WHERE id=$1', [amb.ambassadeur_id]);
        expect(Number(r.rows[0].points_solde)).toBe(2); // 20 € → 2 points
    });

    it('géofence : bloque la fin de course si trop loin (403)', async () => {
        const { chf, course } = await setup();
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='code_valide', code_valide_at=now() WHERE id=$2", [chf.chauffeur_id, course.id]);
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/finish-course`).set(chf.auth)
            .send({ course_id: course.id, lat: 48.90, lon: 2.35 }); // ~5 km
        expect(res.status).toBe(403);
    });

    it('refuse une course SANS sanction et la remet en recherche', async () => {
        const { chf, course } = await setup();
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='acceptee' WHERE id=$2", [chf.chauffeur_id, course.id]);
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/refuse-course`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT statut, chauffeur_id FROM courses WHERE id=$1', [course.id]);
        expect(r.rows[0].statut).toBe('recherche');
        expect(r.rows[0].chauffeur_id).toBeNull();
    });

    it('signale un client absent → crée une sanction en attente (admin)', async () => {
        const { amb, chf, course } = await setup();
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='en_route', date_arrivee=now() WHERE id=$2", [chf.chauffeur_id, course.id]);
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/client-absent`).set(chf.auth)
            .send({ course_id: course.id, minutes: 10 });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT count(*)::int AS n FROM sanctions_en_attente WHERE ambassadeur_id=$1', [amb.ambassadeur_id]);
        expect(r.rows[0].n).toBe(1);
    });
});

describe('Documents & Stripe chauffeur', () => {
    it('ajoute puis met à jour un document (POST/PUT)', async () => {
        const chf = await registerChauffeur();
        const add = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents`).set(chf.auth)
            .send({ type: 'permis', fichier_recto_url: 'path/recto.jpg' });
        expect(add.status).toBe(201);
        const docId = add.body.id;
        const upd = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/documents/${docId}`).set(chf.auth)
            .send({ date_expiration: '2030-01-01' });
        expect(upd.status).toBe(200);
    });

    it('billing-portal renvoie une URL Stripe', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/billing-portal`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body.url).toContain('stripe.test');
    });

    it('setup-card renvoie une URL de Checkout', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/setup-card`).set(chf.auth).send();
        expect(res.status).toBe(200);
        expect(res.body.url).toContain('stripe.test');
    });
});
