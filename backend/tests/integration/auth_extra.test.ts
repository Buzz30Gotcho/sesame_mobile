import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app, registerAmbassadeur, registerChauffeur, db } from '../helpers/api';

// Compléments auth : validations d'inscription (téléphone/SIRET/IBAN/blacklist/date FR),
// messages de connexion (suspendu/blacklisté), reset mot de passe, refresh (âge/statut).

const JWT_SECRET = process.env.JWT_SECRET!;

function inscription(body: Record<string, any>) {
    return request(app).post('/api/auth/inscription').send({
        type: 'ambassadeur', ambassador_type: 'physique', prenom: 'A', nom: 'B',
        email: `u_${Math.random().toString(36).slice(2)}@t.fr`, telephone: `06${Math.floor(10000000 + Math.random() * 89999999)}`,
        mot_de_passe: 'password123', ...body,
    });
}

describe('Inscription — validations', () => {
    it('téléphone invalide → 400', async () => {
        expect((await inscription({ telephone: '123' })).status).toBe(400);
    });
    it('SIRET invalide → 400', async () => {
        expect((await inscription({ siret: '123' })).status).toBe(400);
    });
    it('IBAN invalide → 400', async () => {
        expect((await inscription({ iban: 'FR00' })).status).toBe(400);
    });
    it('convertit une date FR JJ/MM/AAAA en ISO', async () => {
        const res = await inscription({ date_naissance: '05/11/1990', lieu_naissance: 'Lyon' });
        expect(res.status).toBe(201);
        const u = await db().query("SELECT to_char(date_naissance,'YYYY-MM-DD') AS d FROM utilisateurs WHERE id=$1", [res.body.userId]);
        expect(u.rows[0].d).toBe('1990-11-05');
    });
    it('bloque une identité blacklistée (même nom/prénom/date/lieu) → 400', async () => {
        await db().query(
            `INSERT INTO blacklist(nom, prenom, date_naissance, lieu_naissance, telephone, type_utilisateur, ajoute_par_admin_id)
             VALUES ('Doe','John','1985-03-02','Nice','0600000000','ambassadeur','00000000-0000-0000-0000-000000000000')`
        );
        const res = await inscription({ nom: 'Doe', prenom: 'John', date_naissance: '02/03/1985', lieu_naissance: 'Nice' });
        expect(res.status).toBe(400);
    });
});

describe('Connexion — statuts spéciaux', () => {
    it('email/mdp manquant → 400', async () => {
        expect((await request(app).post('/api/auth/connexion').send({ email: 'a@b.fr' })).status).toBe(400);
    });
    it('chauffeur suspendu → 403 message facture', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE utilisateurs SET statut='suspendu' WHERE id=$1", [chf.userId]);
        const res = await request(app).post('/api/auth/connexion').send({ email: chf.email, password: undefined, mot_de_passe: 'password123' });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/facture/i);
    });
    it('compte blacklisté → 403', async () => {
        const u = await registerAmbassadeur();
        await db().query("UPDATE utilisateurs SET statut='blackliste' WHERE id=$1", [u.userId]);
        const res = await request(app).post('/api/auth/connexion').send({ email: u.email, mot_de_passe: 'password123' });
        expect(res.status).toBe(403);
    });
});

describe('Déconnexion', () => {
    it('renvoie success', async () => {
        const res = await request(app).post('/api/auth/deconnexion').send({});
        expect(res.status).toBe(200);
    });
});

describe('Mot de passe oublié & réinitialisation', () => {
    it('email inconnu → réponse neutre (200)', async () => {
        const res = await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: 'inconnu@t.fr' });
        expect(res.status).toBe(200);
    });
    it('réinit : champs manquants → 400', async () => {
        expect((await request(app).post('/api/auth/reinitialiser-mot-de-passe').send({ email: 'a@b.fr' })).status).toBe(400);
    });
    it('réinit : mot de passe trop court → 400', async () => {
        expect((await request(app).post('/api/auth/reinitialiser-mot-de-passe').send({ email: 'a@b.fr', code: '123456', nouveau_mot_de_passe: 'abc' })).status).toBe(400);
    });
    it('réinit : code expiré → 400', async () => {
        const u = await registerAmbassadeur();
        await db().query("UPDATE utilisateurs SET reset_code='123456', reset_code_expires_at=now() - interval '1 hour' WHERE id=$1", [u.userId]);
        const res = await request(app).post('/api/auth/reinitialiser-mot-de-passe').send({ email: u.email, code: '123456', nouveau_mot_de_passe: 'newpassword1' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/expiré/i);
    });
});

describe('Refresh — âge & statut du token', () => {
    it('token plus vieux que 30 jours → 401', async () => {
        const u = await registerAmbassadeur();
        const oldIat = Math.floor(Date.now() / 1000) - 31 * 24 * 3600;
        const token = jwt.sign({ sub: u.userId, iat: oldIat }, JWT_SECRET);
        const res = await request(app).post('/api/auth/refresh').set({ Authorization: `Bearer ${token}` }).send({});
        expect(res.status).toBe(401);
    });
    it('compte non actif → 401', async () => {
        const u = await registerAmbassadeur();
        await db().query("UPDATE utilisateurs SET statut='suspendu' WHERE id=$1", [u.userId]);
        const res = await request(app).post('/api/auth/refresh').set(u.auth).send({});
        expect(res.status).toBe(401);
    });
    it('token illisible → 401', async () => {
        const res = await request(app).post('/api/auth/refresh').set({ Authorization: 'Bearer garbage' }).send({});
        expect(res.status).toBe(401);
    });
});
