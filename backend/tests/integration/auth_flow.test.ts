import request from 'supertest';
import { app, registerAmbassadeur, registerChauffeur, PASSWORD, db } from '../helpers/api';

// Parcours d'authentification complet contre une vraie base (pg-mem) :
// inscription → connexion → refresh → reset mot de passe.

describe('POST /api/auth/inscription', () => {
    it('crée un ambassadeur physique et renvoie un token (201)', async () => {
        const u = await registerAmbassadeur();
        expect(u.role).toBe('ambassadeur');
        expect(u.ambassadeur_id).toBeTruthy();
        expect(u.token).toBeTruthy();
    });

    it('crée un chauffeur avec une ligne chauffeurs liée (201)', async () => {
        const u = await registerChauffeur();
        expect(u.chauffeur_id).toBeTruthy();
        const r = await db().query('SELECT vehicule_type FROM chauffeurs WHERE id=$1', [u.chauffeur_id]);
        expect(r.rows[0].vehicule_type).toBe('berline');
    });

    it('suspend un ambassadeur moral à l\'inscription (validation requise)', async () => {
        const u = await registerAmbassadeur({ ambassador_type: 'moral', raison_sociale: 'ACME' });
        const r = await db().query('SELECT statut FROM utilisateurs WHERE id=$1', [u.userId]);
        expect(r.rows[0].statut).toBe('suspendu');
    });

    it('refuse un email déjà utilisé (400)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/auth/inscription').send({
            type: 'ambassadeur', prenom: 'X', nom: 'Y', email: u.email,
            telephone: '0699999999', mot_de_passe: PASSWORD,
        });
        expect(res.status).toBe(400);
    });

    it('refuse un mot de passe trop court (400)', async () => {
        const res = await request(app).post('/api/auth/inscription').send({
            type: 'ambassadeur', email: 'court@test.fr', telephone: '0612345678', mot_de_passe: '123',
        });
        expect(res.status).toBe(400);
    });

    it('refuse un email invalide (400)', async () => {
        const res = await request(app).post('/api/auth/inscription').send({
            type: 'ambassadeur', email: 'pas-un-email', telephone: '0612345678', mot_de_passe: PASSWORD,
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/auth/connexion', () => {
    it('connecte un utilisateur valide (200)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/auth/connexion').send({ email: u.email, mot_de_passe: PASSWORD });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.ambassadeur_id).toBe(u.ambassadeur_id);
    });

    it('rejette un mauvais mot de passe (401)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/auth/connexion').send({ email: u.email, mot_de_passe: 'mauvais_mdp' });
        expect(res.status).toBe(401);
    });

    it('rejette un email inconnu (401)', async () => {
        const res = await request(app).post('/api/auth/connexion').send({ email: 'inconnu@test.fr', mot_de_passe: PASSWORD });
        expect(res.status).toBe(401);
    });

    it('bloque un ambassadeur moral non validé (403)', async () => {
        const u = await registerAmbassadeur({ ambassador_type: 'moral', raison_sociale: 'ACME' });
        const res = await request(app).post('/api/auth/connexion').send({ email: u.email, mot_de_passe: PASSWORD });
        expect(res.status).toBe(403);
    });
});

describe('POST /api/auth/refresh', () => {
    it('renvoie un nouveau token pour un compte actif (200)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/auth/refresh').set(u.auth).send();
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
    });

    it('refuse sans token (401)', async () => {
        const res = await request(app).post('/api/auth/refresh').send();
        expect(res.status).toBe(401);
    });
});

describe('POST /api/auth/mot-de-passe-oublie + reinitialiser', () => {
    it('réinitialise le mot de passe avec un code valide', async () => {
        const u = await registerAmbassadeur();
        const oubli = await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: u.email });
        expect(oubli.status).toBe(200);

        // Le code est stocké en base (l'envoi e-mail est mocké).
        const r = await db().query('SELECT reset_code FROM utilisateurs WHERE id=$1', [u.userId]);
        const code = r.rows[0].reset_code;
        expect(code).toBeTruthy();

        const reset = await request(app).post('/api/auth/reinitialiser-mot-de-passe')
            .send({ email: u.email, code, nouveau_mot_de_passe: 'nouveauMdp123' });
        expect(reset.status).toBe(200);

        // L'ancien mot de passe ne marche plus, le nouveau oui.
        const ko = await request(app).post('/api/auth/connexion').send({ email: u.email, mot_de_passe: PASSWORD });
        expect(ko.status).toBe(401);
        const ok = await request(app).post('/api/auth/connexion').send({ email: u.email, mot_de_passe: 'nouveauMdp123' });
        expect(ok.status).toBe(200);
    });

    it('rejette un code incorrect (400)', async () => {
        const u = await registerAmbassadeur();
        await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: u.email });
        const res = await request(app).post('/api/auth/reinitialiser-mot-de-passe')
            .send({ email: u.email, code: '000000', nouveau_mot_de_passe: 'nouveauMdp123' });
        expect(res.status).toBe(400);
    });
});
