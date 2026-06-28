import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/app';

// Tests d'intégration HTTP via supertest.
// On cible volontairement des comportements qui NE touchent PAS la base de données
// (le middleware requireAuth rejette en 401 avant toute requête SQL), pour que la
// suite tourne sans DB. Les tests nécessitant la DB iront dans un fichier séparé
// avec une base de test dédiée (voir tests/README.md).

describe('Protection des routes mobiles (requireAuth)', () => {
    it('refuse une route protégée sans token (401)', async () => {
        const res = await request(app).get('/api/courses');
        expect(res.status).toBe(401);
        expect(res.body.error).toBeDefined();
    });

    it('refuse un token malformé (401)', async () => {
        const res = await request(app)
            .get('/api/courses')
            .set('Authorization', 'Bearer pas-un-vrai-token');
        expect(res.status).toBe(401);
    });

    it('refuse un token signé avec un mauvais secret (401)', async () => {
        const faux = jwt.sign({ sub: 'user-1' }, 'mauvais_secret');
        const res = await request(app)
            .get('/api/courses')
            .set('Authorization', `Bearer ${faux}`);
        expect(res.status).toBe(401);
    });

    it('refuse un token expiré (401)', async () => {
        const expire = jwt.sign({ sub: 'user-1' }, process.env.JWT_SECRET!, {
            expiresIn: '-1h',
        });
        const res = await request(app)
            .get('/api/courses')
            .set('Authorization', `Bearer ${expire}`);
        expect(res.status).toBe(401);
    });
});
