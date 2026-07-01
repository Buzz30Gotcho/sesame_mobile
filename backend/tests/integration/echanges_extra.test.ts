import request from 'supertest';
import { app, registerAmbassadeur, seedOffre, db } from '../helpers/api';

// Compléments echanges : données manquantes, page /info (bon utilisé/expiré), QR code (ownEchangeParam).

describe('POST /creer — données manquantes', () => {
    it('400 si offre_id manquant', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/echanges/creer').set(u.auth).send({ ambassadeur_id: u.ambassadeur_id });
        expect(res.status).toBe(400);
    });
});

describe('GET /info — états du bon', () => {
    async function bon(statut: string, expireAt: string | null) {
        const u = await registerAmbassadeur();
        const { fournisseurId, offreId } = await seedOffre();
        const token = `TOK-${Math.random().toString(36).slice(2, 10)}`;
        await db().query(
            `INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut, expire_at)
             VALUES ($7,$1,$2,$3,5,$4,$5,$6)`,
            [u.ambassadeur_id, offreId, fournisseurId, token, statut, expireAt, `BON-${token}`]
        );
        return token;
    }

    it('bon déjà utilisé → 400 statut=utilise', async () => {
        const token = await bon('utilise', null);
        const res = await request(app).get('/api/echanges/info').query({ token });
        expect(res.status).toBe(400);
        expect(res.body.statut).toBe('utilise');
    });

    it('bon expiré (date passée) → 400 statut=expire', async () => {
        const token = await bon('valide', '2000-01-01T00:00:00Z');
        const res = await request(app).get('/api/echanges/info').query({ token });
        expect(res.status).toBe(400);
        expect(res.body.statut).toBe('expire');
    });

    it('bon valide → 200', async () => {
        const token = await bon('valide', '2999-01-01T00:00:00Z');
        const res = await request(app).get('/api/echanges/info').query({ token });
        expect(res.status).toBe(200);
        expect(res.body.reference).toBeTruthy();
    });
});

describe('GET /:id/qrcode — propriété du bon', () => {
    async function makeBon(u: any, statut: string) {
        const { fournisseurId, offreId } = await seedOffre();
        const r = await db().query(
            `INSERT INTO echanges(ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut)
             VALUES ($1,$2,$3,5,$4,$5) RETURNING id`,
            [u.ambassadeur_id, offreId, fournisseurId, `Q-${Math.random().toString(36).slice(2, 8)}`, statut]
        );
        return r.rows[0].id;
    }

    it('renvoie le QR pour un bon validé du propriétaire (200)', async () => {
        const u = await registerAmbassadeur();
        const id = await makeBon(u, 'valide');
        const res = await request(app).get(`/api/echanges/${id}/qrcode`).set(u.auth);
        expect(res.status).toBe(200);
        expect(res.body.token_qr).toBeTruthy();
    });

    it('404 si le bon n\'est pas au statut valide', async () => {
        const u = await registerAmbassadeur();
        const id = await makeBon(u, 'en_attente_admin');
        const res = await request(app).get(`/api/echanges/${id}/qrcode`).set(u.auth);
        expect(res.status).toBe(404);
    });

    it('403 si le bon appartient à un autre ambassadeur', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const id = await makeBon(u1, 'valide');
        const res = await request(app).get(`/api/echanges/${id}/qrcode`).set(u2.auth);
        expect(res.status).toBe(403);
    });
});
