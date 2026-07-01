import request from 'supertest';
import { authenticator } from 'otplib';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { app, adminToken, registerAmbassadeur, createCourse, seedOffre, db } from '../helpers/api';

// 3e lot admin : chemins d'authentification (login 2FA, config incomplète, token invalide)
// et quelques notifications / validations restantes.

const A = adminToken().auth;
const FOUNDER = 'founder-2fa@test.fr';
const FOUNDER_PWD = 'founderpass123';

describe('Login admin — configuration & 2FA', () => {
    const OLD = { email: process.env.ADMIN_EMAIL, pwd: process.env.ADMIN_PASSWORD, hash: process.env.ADMIN_PASSWORD_HASH };
    afterAll(() => {
        process.env.ADMIN_EMAIL = OLD.email; process.env.ADMIN_PASSWORD = OLD.pwd;
        if (OLD.hash === undefined) delete process.env.ADMIN_PASSWORD_HASH; else process.env.ADMIN_PASSWORD_HASH = OLD.hash;
    });

    it('500 si la configuration admin est incomplète', async () => {
        delete process.env.ADMIN_EMAIL; delete process.env.ADMIN_PASSWORD; delete process.env.ADMIN_PASSWORD_HASH;
        const res = await request(app).post('/api/admin/login').send({ email: 'x@y.fr', password: 'zzz' });
        expect(res.status).toBe(500);
    });

    describe('avec 2FA activée', () => {
        beforeEach(() => {
            process.env.ADMIN_EMAIL = FOUNDER; process.env.ADMIN_PASSWORD = FOUNDER_PWD;
            delete process.env.ADMIN_PASSWORD_HASH;
        });
        async function enable2fa(): Promise<string> {
            const secret = authenticator.generateSecret();
            await db().query('INSERT INTO admin_securite(id, totp_secret, totp_enabled) VALUES (1,$1,true) ON CONFLICT (id) DO UPDATE SET totp_secret=$1, totp_enabled=true', [secret]);
            return secret;
        }

        it('exige le code 2FA (401 require2fa)', async () => {
            await enable2fa();
            const res = await request(app).post('/api/admin/login').send({ email: FOUNDER, password: FOUNDER_PWD });
            expect(res.status).toBe(401);
            expect(res.body.require2fa).toBe(true);
        });

        it('refuse un code 2FA incorrect (401)', async () => {
            await enable2fa();
            const res = await request(app).post('/api/admin/login').send({ email: FOUNDER, password: FOUNDER_PWD, code: '000000' });
            expect(res.status).toBe(401);
        });

        it('accepte un code 2FA valide (200)', async () => {
            const secret = await enable2fa();
            const code = authenticator.generate(secret);
            const res = await request(app).post('/api/admin/login').send({ email: FOUNDER, password: FOUNDER_PWD, code });
            expect(res.status).toBe(200);
            expect(res.body.token).toBeTruthy();
        });
    });
});

describe('requireAdmin — token invalide', () => {
    it('rejette un token illisible (401)', async () => {
        const res = await request(app).get('/api/admin/dashboard').set({ Authorization: 'Bearer not-a-jwt' });
        expect(res.status).toBe(401);
    });
});

describe('Notifications restantes', () => {
    it('valider un bon notifie l\'ambassadeur (BON_VALIDE)', async () => {
        const amb = await registerAmbassadeur();
        await db().query("UPDATE ambassadeurs SET push_token='ExpoBon' WHERE id=$1", [amb.ambassadeur_id]);
        const { fournisseurId, offreId } = await seedOffre();
        const e = await db().query(
            "INSERT INTO echanges(ambassadeur_id, offre_id, fournisseur_id, points_deduits, statut) VALUES ($1,$2,$3,5,'en_attente_admin') RETURNING id",
            [amb.ambassadeur_id, offreId, fournisseurId]
        );
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).put(`/api/admin/echanges/${e.rows[0].id}/valider`).set(A).send({});
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'BON_VALIDE')).toBe(true);
    });

    it('arbitrage avec solde suffisant + push → notif SANCTION_POINTS', async () => {
        const amb = await registerAmbassadeur();
        const course = await createCourse(amb);
        await db().query("UPDATE ambassadeurs SET points_solde=50, push_token='ExpoS' WHERE id=$1", [amb.ambassadeur_id]);
        const s = await db().query(
            "INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, course_id, statut) VALUES ($1,0,'Client absent signalé par chauffeur',$2,'en_attente') RETURNING id",
            [amb.ambassadeur_id, course.id]
        );
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/admin/alertes/${s.rows[0].id}/arbitrer`).set(A).send({ points: 10 });
        expect(res.status).toBe(200);
        expect(res.body.sanction).toBe('execute');
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'SANCTION_POINTS')).toBe(true);
    });
});

describe('POST fournisseur — SIRET & IBAN invalides', () => {
    const valid = {
        nom_societe: 'ACME', legal_prenom: 'J', legal_nom: 'D', legal_email: 'j@d.fr', legal_telephone: '0612345678',
        legal_adresse: 'r', legal_cp: '75001', legal_ville: 'Paris', memes_coordonnees: true,
    };
    it('SIRET invalide → 400', async () => {
        expect((await request(app).post('/api/admin/fournisseurs').set(A).send({ ...valid, siret: '123' })).status).toBe(400);
    });
    it('IBAN invalide → 400', async () => {
        expect((await request(app).post('/api/admin/fournisseurs').set(A).send({ ...valid, iban: 'XX00' })).status).toBe(400);
    });
});
