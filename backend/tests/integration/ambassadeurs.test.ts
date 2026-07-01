import request from 'supertest';
import { app, registerAmbassadeur, crediterPoints, db } from '../helpers/api';

// Route ambassadeurs : profil, dashboard, filleuls, push-token, et sections réservées
// au responsable légal Moral (équipe + commissions). Specs §1.

// Crée un ambassadeur moral principal ACTIF (le moral est suspendu à l'inscription).
async function registerMoralActif() {
    const u = await registerAmbassadeur({ ambassador_type: 'moral', raison_sociale: 'ACME' });
    await db().query("UPDATE utilisateurs SET statut='actif' WHERE id=$1", [u.userId]);
    return u;
}

describe('GET /api/ambassadeurs/:id/profile', () => {
    it('renvoie le profil du propriétaire (200)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).get(`/api/ambassadeurs/${u.ambassadeur_id}/profile`).set(u.auth);
        expect(res.status).toBe(200);
        expect(res.body.ambassadeur_id).toBe(u.ambassadeur_id);
        expect(res.body.code_parrainage).toBeTruthy();
        expect(res.body.is_sous_compte).toBe(false);
    });

    it('refuse le profil d\'un autre ambassadeur (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const res = await request(app).get(`/api/ambassadeurs/${u1.ambassadeur_id}/profile`).set(u2.auth);
        expect(res.status).toBe(403);
    });
});

describe('PUT /api/ambassadeurs/:id/profile', () => {
    it('met à jour le prénom', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).put(`/api/ambassadeurs/${u.ambassadeur_id}/profile`).set(u.auth)
            .send({ prenom: 'Nouveau' });
        expect(res.status).toBe(200);
        expect(res.body.prenom).toBe('Nouveau');
    });
});

describe('GET /api/ambassadeurs/:id/dashboard', () => {
    it('renvoie les agrégats et la progression de niveau', async () => {
        const u = await registerAmbassadeur();
        await crediterPoints(u.ambassadeur_id!, 600);
        const res = await request(app).get(`/api/ambassadeurs/${u.ambassadeur_id}/dashboard`).set(u.auth);
        expect(res.status).toBe(200);
        expect(res.body.points_solde).toBe(600);
        // niveau stocké = 'starter' (non recalculé ici) → prochain palier 'pro' (500)
        expect(res.body.next_level).toBe('pro');
        expect(res.body.next_level_target).toBe(500);
        expect(Array.isArray(res.body.active_courses)).toBe(true);
    });

    it('refuse le dashboard d\'autrui (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const res = await request(app).get(`/api/ambassadeurs/${u1.ambassadeur_id}/dashboard`).set(u2.auth);
        expect(res.status).toBe(403);
    });
});

describe('GET /api/ambassadeurs/:id/filleuls', () => {
    it('liste les filleuls parrainés', async () => {
        const parrain = await registerAmbassadeur();
        // Récupère le code de parrainage du parrain
        const prof = await request(app).get(`/api/ambassadeurs/${parrain.ambassadeur_id}/profile`).set(parrain.auth);
        const code = prof.body.code_parrainage;
        await registerAmbassadeur({ code_parrainage_parrain: code });

        const res = await request(app).get(`/api/ambassadeurs/${parrain.ambassadeur_id}/filleuls`).set(parrain.auth);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
    });
});

describe('PUT /api/ambassadeurs/:id/push-token', () => {
    it('enregistre le token (200) et refuse vide (400)', async () => {
        const u = await registerAmbassadeur();
        const ok = await request(app).put(`/api/ambassadeurs/${u.ambassadeur_id}/push-token`).set(u.auth)
            .send({ push_token: 'expo-token-xyz' });
        expect(ok.status).toBe(200);
        const ko = await request(app).put(`/api/ambassadeurs/${u.ambassadeur_id}/push-token`).set(u.auth).send({});
        expect(ko.status).toBe(400);
    });
});

describe('Sections réservées au responsable légal Moral', () => {
    it('refuse l\'équipe à un ambassadeur physique (403)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).get(`/api/ambassadeurs/${u.ambassadeur_id}/equipe`).set(u.auth);
        expect(res.status).toBe(403);
    });

    it('refuse les commissions à un physique (403)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).get(`/api/ambassadeurs/${u.ambassadeur_id}/commissions`).set(u.auth);
        expect(res.status).toBe(403);
    });

    it('le Moral gère son équipe : ajout + listing + suspension', async () => {
        const moral = await registerMoralActif();

        const vide = await request(app).get(`/api/ambassadeurs/${moral.ambassadeur_id}/equipe`).set(moral.auth);
        expect(vide.status).toBe(200);
        expect(vide.body.length).toBe(0);

        const ajout = await request(app).post(`/api/ambassadeurs/${moral.ambassadeur_id}/equipe`).set(moral.auth)
            .send({ prenom: 'Emp', nom: 'Loye', email: `emp_${Date.now()}@test.fr`, telephone: '0788990011', metier: 'Vendeur', mot_de_passe: 'password123' });
        expect(ajout.status).toBe(201);
        const employeId = (await db().query(
            'SELECT id FROM sous_comptes_employes WHERE ambassadeur_moral_id=$1', [moral.ambassadeur_id]
        )).rows[0].id;

        const liste = await request(app).get(`/api/ambassadeurs/${moral.ambassadeur_id}/equipe`).set(moral.auth);
        expect(liste.body.length).toBe(1);

        const susp = await request(app).put(`/api/ambassadeurs/${moral.ambassadeur_id}/equipe/${employeId}/statut`).set(moral.auth)
            .send({ statut: 'suspendu' });
        expect(susp.status).toBe(200);
    });

    it('le Moral voit ses commissions (200, structure)', async () => {
        const moral = await registerMoralActif();
        const res = await request(app).get(`/api/ambassadeurs/${moral.ambassadeur_id}/commissions`).set(moral.auth);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('taux_pct');
        expect(res.body).toHaveProperty('total_commission');
    });
});
