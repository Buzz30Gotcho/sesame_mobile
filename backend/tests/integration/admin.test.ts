import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, adminToken, registerAmbassadeur, registerChauffeur, seedOffre, crediterPoints, db } from '../helpers/api';

// Route admin : authentification (fondateur .env + comptes en base), garde requireAdmin,
// permissions par rôle (lecteur/operateur/super_admin), et endpoints clés. Specs §5.4.

const FOUNDER_EMAIL = 'founder@test.fr';
const FOUNDER_PASSWORD = 'founderpass123';

beforeAll(() => {
    process.env.ADMIN_EMAIL = FOUNDER_EMAIL;
    process.env.ADMIN_PASSWORD = FOUNDER_PASSWORD;
    // Le .env du projet définit ADMIN_PASSWORD_HASH (prioritaire) : on le retire pour
    // tester avec le mot de passe en clair contrôlé ci-dessus.
    delete process.env.ADMIN_PASSWORD_HASH;
});

describe('POST /api/admin/login', () => {
    it('connecte le compte fondateur (.env) en super_admin', async () => {
        const res = await request(app).post('/api/admin/login').send({ email: FOUNDER_EMAIL, password: FOUNDER_PASSWORD });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeTruthy();
        expect(res.body.adminRole).toBe('super_admin');
    });

    it('rejette un mauvais mot de passe (401)', async () => {
        const res = await request(app).post('/api/admin/login').send({ email: FOUNDER_EMAIL, password: 'faux' });
        expect(res.status).toBe(401);
    });

    it('exige email + mot de passe (400)', async () => {
        const res = await request(app).post('/api/admin/login').send({ email: FOUNDER_EMAIL });
        expect(res.status).toBe(400);
    });

    it('connecte un compte admin en base avec son rôle', async () => {
        const hash = await bcrypt.hash('password123', 4);
        await db().query(
            `INSERT INTO admins(email, password_hash, nom, role, actif) VALUES ('op@test.fr',$1,'Op','operateur',true)`,
            [hash]
        );
        const res = await request(app).post('/api/admin/login').send({ email: 'op@test.fr', password: 'password123' });
        expect(res.status).toBe(200);
        expect(res.body.adminRole).toBe('operateur');
    });
});

describe('Garde requireAdmin', () => {
    it('refuse sans token (401)', async () => {
        const res = await request(app).get('/api/admin/dashboard');
        expect(res.status).toBe(401);
    });

    it('refuse un token utilisateur non-admin (403)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).get('/api/admin/dashboard').set(u.auth);
        expect(res.status).toBe(403);
    });
});

describe('Permissions par rôle', () => {
    it('lecteur : écriture interdite (403)', async () => {
        const u = await registerChauffeur();
        const res = await request(app).put(`/api/admin/utilisateurs/${u.userId}/statut`)
            .set(adminToken('lecteur').auth).send({ statut: 'suspendu' });
        expect(res.status).toBe(403);
    });

    it('operateur : zones fondateur interdites (PUT /parametres → 403)', async () => {
        const res = await request(app).put('/api/admin/parametres/plateforme_nom')
            .set(adminToken('operateur').auth).send({ valeur: 'X' });
        expect(res.status).toBe(403);
    });

    it('operateur : action opérationnelle autorisée (statut utilisateur)', async () => {
        const u = await registerChauffeur();
        const res = await request(app).put(`/api/admin/utilisateurs/${u.userId}/statut`)
            .set(adminToken('operateur').auth).send({ statut: 'suspendu' });
        expect(res.status).toBe(200);
    });

    it('super_admin : paramètres autorisés', async () => {
        const res = await request(app).put('/api/admin/parametres/plateforme_nom')
            .set(adminToken('super_admin').auth).send({ valeur: 'SESAME 2' });
        expect(res.status).toBe(200);
    });
});

describe('Endpoints admin clés', () => {
    const admin = () => adminToken('super_admin').auth;

    it('GET /dashboard renvoie des données (200)', async () => {
        const res = await request(app).get('/api/admin/dashboard').set(admin());
        expect(res.status).toBe(200);
        expect(typeof res.body).toBe('object');
    });

    it('GET listings ambassadeurs / chauffeurs / courses / fournisseurs / parametres', async () => {
        for (const path of ['/ambassadeurs', '/chauffeurs', '/courses', '/fournisseurs', '/parametres']) {
            const res = await request(app).get(`/api/admin${path}`).set(admin());
            expect(res.status).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
        }
    });

    it('valide un bon en attente (en_attente_admin → valide avec expire_at)', async () => {
        const u = await registerAmbassadeur();
        const { offreId, fournisseurId } = await seedOffre({ pts_requis: 5 });
        const e = await db().query(
            `INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut)
             VALUES ('BON-A', $1, $2, $3, 5, 'TQA', 'en_attente_admin') RETURNING id`,
            [u.ambassadeur_id, offreId, fournisseurId]
        );
        const res = await request(app).put(`/api/admin/echanges/${e.rows[0].id}/valider`).set(admin()).send();
        expect(res.status).toBe(200);
        const r = await db().query('SELECT statut, expire_at FROM echanges WHERE id=$1', [e.rows[0].id]);
        expect(r.rows[0].statut).toBe('valide');
        expect(r.rows[0].expire_at).not.toBeNull();
    });

    it('refuse un bon et recrédite les points', async () => {
        const u = await registerAmbassadeur();
        await crediterPoints(u.ambassadeur_id!, 0);
        const { offreId, fournisseurId } = await seedOffre({ pts_requis: 5 });
        const e = await db().query(
            `INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut)
             VALUES ('BON-B', $1, $2, $3, 5, 'TQB', 'en_attente_admin') RETURNING id`,
            [u.ambassadeur_id, offreId, fournisseurId]
        );
        const res = await request(app).put(`/api/admin/echanges/${e.rows[0].id}/refuser`).set(admin()).send();
        expect(res.status).toBe(200);
        const r = await db().query('SELECT points_solde FROM ambassadeurs WHERE id=$1', [u.ambassadeur_id]);
        expect(Number(r.rows[0].points_solde)).toBe(5); // points rendus
    });

    it('met à jour un paramètre système', async () => {
        const res = await request(app).put('/api/admin/parametres/berline_forfait').set(admin()).send({ valeur: '15.00' });
        expect(res.status).toBe(200);
        const r = await db().query("SELECT valeur FROM parametres_systeme WHERE cle='berline_forfait'");
        expect(r.rows[0].valeur).toBe('15.00');
    });

    it('valide un ambassadeur moral (compte activé)', async () => {
        const u = await registerAmbassadeur({ ambassador_type: 'moral', raison_sociale: 'ACME' });
        const res = await request(app).put(`/api/admin/ambassadeurs/${u.ambassadeur_id}/valider-moral`).set(admin()).send();
        expect(res.status).toBe(200);
        const r = await db().query('SELECT statut FROM utilisateurs WHERE id=$1', [u.userId]);
        expect(r.rows[0].statut).toBe('actif');
    });

    it('suspend puis réactive un utilisateur', async () => {
        const u = await registerChauffeur();
        const susp = await request(app).put(`/api/admin/utilisateurs/${u.userId}/statut`).set(admin()).send({ statut: 'suspendu' });
        expect(susp.body.statut).toBe('suspendu');
        const bad = await request(app).put(`/api/admin/utilisateurs/${u.userId}/statut`).set(admin()).send({ statut: 'n_importe_quoi' });
        expect(bad.status).toBe(400);
    });
});
