import request from 'supertest';
import { app, setParam } from '../helpers/api';

// Compléments app.ts : paramètres publics mobile, page retour Stripe (HTML), gestionnaire d'erreurs.

describe('GET /api/app/parametres', () => {
    it('renvoie les paramètres publics whitelistés', async () => {
        await setParam('mode_course_immediate', 'true');
        const res = await request(app).get('/api/app/parametres');
        expect(res.status).toBe(200);
        expect(res.body.mode_course_immediate).toBe('true');
    });
});

describe('GET /retour-stripe', () => {
    it('page succès (carte enregistrée)', async () => {
        const res = await request(app).get('/retour-stripe').query({ carte: 'ok' });
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.text).toMatch(/enregistrée/);
    });

    it('page annulation', async () => {
        const res = await request(app).get('/retour-stripe').query({ carte: 'annule' });
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/annulé/i);
    });
});
