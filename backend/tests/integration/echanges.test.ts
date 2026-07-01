import request from 'supertest';
import { app, registerAmbassadeur, seedOffre, crediterPoints, db } from '../helpers/api';

// Route echanges (boutique de points) : achat d'un bon, déduction de points atomique,
// stock, restrictions (Moral interdit), périmètre. Specs §1.4 + §6.3.

describe('POST /api/echanges/creer', () => {
    it('échange un bon et déduit les points (201)', async () => {
        const u = await registerAmbassadeur();
        const { offreId } = await seedOffre({ pts_requis: 5 });
        await crediterPoints(u.ambassadeur_id!, 10);

        const res = await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        expect(res.status).toBe(201);
        expect(res.body.statut).toBe('en_attente_admin');

        const r = await db().query('SELECT points_solde FROM ambassadeurs WHERE id=$1', [u.ambassadeur_id]);
        expect(Number(r.rows[0].points_solde)).toBe(5);
    });

    it('refuse si le solde de points est insuffisant (400)', async () => {
        const u = await registerAmbassadeur();
        const { offreId } = await seedOffre({ pts_requis: 50 });
        await crediterPoints(u.ambassadeur_id!, 10);
        const res = await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        expect(res.status).toBe(400);
    });

    it('interdit la boutique aux ambassadeurs moraux (403)', async () => {
        const u = await registerAmbassadeur({ ambassador_type: 'moral', raison_sociale: 'ACME' });
        // Compte moral suspendu à l'inscription → on le réactive pour isoler la règle boutique.
        await db().query("UPDATE utilisateurs SET statut='actif' WHERE id=$1", [u.userId]);
        const { offreId } = await seedOffre({ pts_requis: 1 });
        await crediterPoints(u.ambassadeur_id!, 100);
        const res = await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        expect(res.status).toBe(403);
    });

    it('refuse une offre hors ligne (404)', async () => {
        const u = await registerAmbassadeur();
        const { offreId } = await seedOffre({ pts_requis: 1, statut: 'hors_ligne' });
        await crediterPoints(u.ambassadeur_id!, 100);
        const res = await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        expect(res.status).toBe(404);
    });

    it('refuse d\'échanger pour un autre ambassadeur (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const { offreId } = await seedOffre({ pts_requis: 1 });
        const res = await request(app).post('/api/echanges/creer').set(u1.auth)
            .send({ ambassadeur_id: u2.ambassadeur_id, offre_id: offreId });
        expect(res.status).toBe(403);
    });

    it('épuise le stock : 2e échange refusé (409)', async () => {
        const u = await registerAmbassadeur();
        const { offreId } = await seedOffre({ pts_requis: 1, stock: 1 });
        await crediterPoints(u.ambassadeur_id!, 100);
        const ok = await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        expect(ok.status).toBe(201);
        const ko = await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        expect(ko.status).toBe(409);
    });
});

describe('GET /api/echanges/mes-bons', () => {
    it('liste les bons de l\'ambassadeur', async () => {
        const u = await registerAmbassadeur();
        const { offreId } = await seedOffre({ pts_requis: 1 });
        await crediterPoints(u.ambassadeur_id!, 10);
        await request(app).post('/api/echanges/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id, offre_id: offreId });
        const res = await request(app).get('/api/echanges/mes-bons').query({ ambassadeur_id: u.ambassadeur_id }).set(u.auth);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
    });
});

describe('GET /api/echanges/info (page fournisseur, public via token)', () => {
    it('renvoie 404 pour un token inconnu', async () => {
        const res = await request(app).get('/api/echanges/info').query({ token: 'inexistant' });
        expect(res.status).toBe(404);
    });

    it('exige un token (400)', async () => {
        const res = await request(app).get('/api/echanges/info');
        expect(res.status).toBe(400);
    });
});

describe('GET /api/boutique/offres', () => {
    it('ne liste que les offres en ligne de fournisseurs signés', async () => {
        const u = await registerAmbassadeur();
        await seedOffre({ pts_requis: 5 });                       // visible
        await seedOffre({ pts_requis: 5, statut: 'hors_ligne' }); // masquée
        const res = await request(app).get('/api/boutique/offres').set(u.auth);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
    });
});
