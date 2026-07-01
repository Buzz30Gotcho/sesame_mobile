import request from 'supertest';
import { app, registerAmbassadeur } from '../helpers/api';

// Route tickets (support §10) : création + messages + propriété stricte.

async function creerTicket(user: any, message = 'Bonjour, un souci') {
    const res = await request(app).post('/api/tickets').set(user.auth)
        .send({ categorie: 'question_compte', sujet: 'Test', message });
    return res;
}

describe('POST /api/tickets', () => {
    it('crée un ticket avec son premier message (201)', async () => {
        const u = await registerAmbassadeur();
        const res = await creerTicket(u);
        expect(res.status).toBe(201);
        expect(res.body.id).toBeTruthy();
    });

    it('refuse une catégorie invalide (400)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/tickets').set(u.auth)
            .send({ categorie: 'n_importe_quoi', message: 'x' });
        expect(res.status).toBe(400);
    });

    it('refuse un message vide (400)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/tickets').set(u.auth)
            .send({ categorie: 'autre', message: '   ' });
        expect(res.status).toBe(400);
    });

    it('exige une authentification (401)', async () => {
        const res = await request(app).post('/api/tickets').send({ categorie: 'autre', message: 'x' });
        expect(res.status).toBe(401);
    });
});

describe('GET /api/tickets', () => {
    it('ne liste que les tickets de l\'utilisateur', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        await creerTicket(u1);
        const r1 = await request(app).get('/api/tickets').set(u1.auth);
        const r2 = await request(app).get('/api/tickets').set(u2.auth);
        expect(r1.body.length).toBe(1);
        expect(r2.body.length).toBe(0);
    });
});

describe('Messages de ticket + propriété', () => {
    it('liste les messages de son ticket et y répond (rouvre si résolu)', async () => {
        const u = await registerAmbassadeur();
        const t = await creerTicket(u);
        const ticketId = t.body.id;

        const msgs = await request(app).get(`/api/tickets/${ticketId}/messages`).set(u.auth);
        expect(msgs.status).toBe(200);
        expect(msgs.body.length).toBe(1);

        const rep = await request(app).post(`/api/tickets/${ticketId}/messages`).set(u.auth)
            .send({ contenu: 'Une précision' });
        expect(rep.status).toBe(201);

        const msgs2 = await request(app).get(`/api/tickets/${ticketId}/messages`).set(u.auth);
        expect(msgs2.body.length).toBe(2);
    });

    it('refuse l\'accès aux messages d\'un ticket d\'autrui (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const t = await creerTicket(u1);
        const res = await request(app).get(`/api/tickets/${t.body.id}/messages`).set(u2.auth);
        expect(res.status).toBe(403);
    });

    it('renvoie 404 pour un ticket inexistant', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app)
            .get('/api/tickets/00000000-0000-0000-0000-000000000000/messages').set(u.auth);
        expect(res.status).toBe(404);
    });
});
