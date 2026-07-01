import request from 'supertest';
import { app, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';

// Route chat de course : propriété (participants uniquement), identité de l'expéditeur
// dérivée du token (anti-usurpation).

async function courseAvecParties() {
    const amb = await registerAmbassadeur();
    const chf = await registerChauffeur();
    const course = await createCourse(amb);
    await db().query('UPDATE courses SET chauffeur_id=$1 WHERE id=$2', [chf.chauffeur_id, course.id]);
    return { amb, chf, course };
}

describe('POST /api/chat/:courseId/messages', () => {
    it('l\'ambassadeur partie de la course envoie un message (201)', async () => {
        const { amb, course } = await courseAvecParties();
        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(amb.auth)
            .send({ contenu: 'Bonjour' });
        expect(res.status).toBe(201);
        expect(res.body.expediteur_type).toBe('ambassadeur');
    });

    it('le chauffeur assigné envoie un message (201)', async () => {
        const { chf, course } = await courseAvecParties();
        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(chf.auth)
            .send({ contenu: 'En route' });
        expect(res.status).toBe(201);
        expect(res.body.expediteur_type).toBe('chauffeur');
    });

    it('refuse un message vide (400)', async () => {
        const { amb, course } = await courseAvecParties();
        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(amb.auth)
            .send({ contenu: '   ' });
        expect(res.status).toBe(400);
    });

    it('refuse un tiers non partie de la course (403)', async () => {
        const { course } = await courseAvecParties();
        const tiers = await registerChauffeur();
        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(tiers.auth)
            .send({ contenu: 'Coucou' });
        expect(res.status).toBe(403);
    });
});

describe('GET /api/chat/:courseId/messages', () => {
    it('renvoie les messages dans l\'ordre chronologique', async () => {
        const { amb, course } = await courseAvecParties();
        await request(app).post(`/api/chat/${course.id}/messages`).set(amb.auth).send({ contenu: 'M1' });
        await request(app).post(`/api/chat/${course.id}/messages`).set(amb.auth).send({ contenu: 'M2' });
        const res = await request(app).get(`/api/chat/${course.id}/messages`).set(amb.auth);
        expect(res.status).toBe(200);
        expect(res.body.map((m: any) => m.contenu)).toEqual(['M1', 'M2']);
    });

    it('refuse un tiers (403)', async () => {
        const { course } = await courseAvecParties();
        const tiers = await registerAmbassadeur();
        const res = await request(app).get(`/api/chat/${course.id}/messages`).set(tiers.auth);
        expect(res.status).toBe(403);
    });
});
