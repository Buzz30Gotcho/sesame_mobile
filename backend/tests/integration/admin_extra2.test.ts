import request from 'supertest';
import { authenticator } from 'otplib';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { app, adminToken, registerAmbassadeur, registerChauffeur, db } from '../helpers/api';

// 2e lot de couverture admin : contrôle d'identité (GET + notif suspension), 2FA disable,
// notifications KYC (docs validés/refusés), validations PUT fournisseur, parseOffre.

const A = adminToken().auth;

describe('Contrôle identité (GET modale)', () => {
    it('renvoie infos + photo signée + historique', async () => {
        const chf = await registerChauffeur();
        await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url) VALUES ($1,'photo_profil','photo.jpg')", [chf.chauffeur_id]);
        await db().query("INSERT INTO controles_identite(chauffeur_id, resultat, note) VALUES ($1,'conforme','ok')", [chf.chauffeur_id]);
        (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ signedURL: '/storage/v1/object/sign/x?token=q' }) }));
        const res = await request(app).get(`/api/admin/chauffeurs/${chf.chauffeur_id}/controle-identite`).set(A);
        expect(res.status).toBe(200);
        expect(res.body.photo_profil_url).toContain('token=q');
        expect(res.body.historique.length).toBe(1);
    });

    it('404 pour un chauffeur inconnu', async () => {
        const res = await request(app).get('/api/admin/chauffeurs/00000000-0000-0000-0000-000000000000/controle-identite').set(A);
        expect(res.status).toBe(404);
    });

    it('POST non_conforme avec push_token → suspend + notifie', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET push_token='ExpoCh' WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/admin/chauffeurs/${chf.chauffeur_id}/controle-identite`).set(A)
            .send({ resultat: 'non_conforme', note: 'flou' });
        expect(res.status).toBe(200);
        expect(res.body.suspendu).toBe(true);
        expect(sendPushNotification).toHaveBeenCalled();
    });
});

describe('2FA disable', () => {
    it('désactive la 2FA avec un code valide', async () => {
        const secret = authenticator.generateSecret();
        await db().query(
            'INSERT INTO admin_securite(id, totp_secret, totp_enabled) VALUES (1,$1,true) ON CONFLICT (id) DO UPDATE SET totp_secret=$1, totp_enabled=true',
            [secret]
        );
        const code = authenticator.generate(secret);
        const res = await request(app).post('/api/admin/2fa/disable').set(A).send({ code });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT totp_enabled FROM admin_securite WHERE id=1');
        expect(r.rows[0].totp_enabled).toBe(false);
    });

    it('refuse la désactivation sans code valide (400)', async () => {
        const secret = authenticator.generateSecret();
        await db().query(
            'INSERT INTO admin_securite(id, totp_secret, totp_enabled) VALUES (1,$1,true) ON CONFLICT (id) DO UPDATE SET totp_secret=$1, totp_enabled=true',
            [secret]
        );
        const res = await request(app).post('/api/admin/2fa/disable').set(A).send({ code: '000000' });
        expect(res.status).toBe(400);
    });

    it('sans 2FA active → succès idempotent', async () => {
        await db().query("INSERT INTO admin_securite(id, totp_enabled) VALUES (1,false) ON CONFLICT (id) DO UPDATE SET totp_enabled=false");
        const res = await request(app).post('/api/admin/2fa/disable').set(A).send({});
        expect(res.status).toBe(200);
    });
});

describe('Notifications KYC (validation/refus documents)', () => {
    async function chauffeurAvecPush() {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET push_token='ExpoKyc' WHERE id=$1", [chf.chauffeur_id]);
        return chf;
    }

    it('valide un doc isolé → notification "Document approuvé"', async () => {
        const chf = await chauffeurAvecPush();
        const d = await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, statut) VALUES ($1,'permis','en_attente') RETURNING id", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).put(`/api/admin/documents/${d.rows[0].id}/valider`).set(A).send({});
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'kyc_doc_valide')).toBe(true);
    });

    it('valide le 4e doc obligatoire → notification "Profil validé"', async () => {
        const chf = await chauffeurAvecPush();
        for (const t of ['carte_identite', 'carte_vtc', 'permis']) {
            await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, statut) VALUES ($1,$2,'valide')", [chf.chauffeur_id, t]);
        }
        const d = await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, statut) VALUES ($1,'carte_grise','en_attente') RETURNING id", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).put(`/api/admin/documents/${d.rows[0].id}/valider`).set(A).send({});
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'kyc_valide')).toBe(true);
        const c = await db().query('SELECT documents_valides FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(c.rows[0].documents_valides).toBe(true);
    });

    it('refuse un doc → notification "Document refusé" + docs invalidés', async () => {
        const chf = await chauffeurAvecPush();
        const d = await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, statut) VALUES ($1,'permis','en_attente') RETURNING id", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).put(`/api/admin/documents/${d.rows[0].id}/refuser`).set(A).send({ motif: 'illisible' });
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'kyc_doc_refuse')).toBe(true);
    });
});

describe('PUT fournisseur — validations de format', () => {
    let id: string;
    beforeEach(async () => {
        const create = await request(app).post('/api/admin/fournisseurs').set(A).send({
            nom_societe: 'ACME', legal_prenom: 'J', legal_nom: 'D', legal_email: 'j@d.fr', legal_telephone: '0612345678',
            legal_adresse: 'r', legal_cp: '75001', legal_ville: 'Paris', memes_coordonnees: true,
        });
        id = create.body.id;
    });

    it('email légal invalide → 400', async () => {
        expect((await request(app).put(`/api/admin/fournisseurs/${id}`).set(A).send({ legal_email: 'x' })).status).toBe(400);
    });
    it('email prestation invalide → 400', async () => {
        expect((await request(app).put(`/api/admin/fournisseurs/${id}`).set(A).send({ prest_email: 'x' })).status).toBe(400);
    });
    it('téléphone légal invalide → 400', async () => {
        expect((await request(app).put(`/api/admin/fournisseurs/${id}`).set(A).send({ legal_telephone: '12' })).status).toBe(400);
    });
    it('téléphone prestation invalide → 400', async () => {
        expect((await request(app).put(`/api/admin/fournisseurs/${id}`).set(A).send({ prest_telephone: '12' })).status).toBe(400);
    });
    it('SIRET invalide → 400', async () => {
        expect((await request(app).put(`/api/admin/fournisseurs/${id}`).set(A).send({ siret: '123' })).status).toBe(400);
    });
});

describe('parseOffre — branches de validation', () => {
    let fid: string;
    beforeEach(async () => {
        const create = await request(app).post('/api/admin/fournisseurs').set(A).send({
            nom_societe: 'ACME', legal_prenom: 'J', legal_nom: 'D', legal_email: 'j@d.fr', legal_telephone: '0612345678',
            legal_adresse: 'r', legal_cp: '75001', legal_ville: 'Paris', memes_coordonnees: true,
        });
        fid = create.body.id;
    });

    const base = { nom: 'Bon', pts_requis: 5, validite_bon_mois: 6 };

    it('validité non entière → 400', async () => {
        const res = await request(app).post(`/api/admin/fournisseurs/${fid}/offres`).set(A).send({ ...base, validite_bon_mois: 0 });
        expect(res.status).toBe(400);
    });
    it('stock négatif → 400', async () => {
        const res = await request(app).post(`/api/admin/fournisseurs/${fid}/offres`).set(A).send({ ...base, stock: -1 });
        expect(res.status).toBe(400);
    });
    it('tarif HT négatif → 400', async () => {
        const res = await request(app).post(`/api/admin/fournisseurs/${fid}/offres`).set(A).send({ ...base, tarif_fournisseur_ht: -5 });
        expect(res.status).toBe(400);
    });
    it('offre valide avec stock illimité + description → 201', async () => {
        const res = await request(app).post(`/api/admin/fournisseurs/${fid}/offres`).set(A)
            .send({ ...base, stock: '', description: 'Une offre', statut: 'en_ligne' });
        expect(res.status).toBe(201);
        expect(res.body.stock).toBeNull();
    });
});

describe('Comptes admin — email fondateur & mot de passe', () => {
    it('refuse la création avec l\'email fondateur (400)', async () => {
        const OLD = process.env.ADMIN_EMAIL;
        process.env.ADMIN_EMAIL = 'founder-uniq@test.fr';
        const res = await request(app).post('/api/admin/admins').set(A)
            .send({ email: 'founder-uniq@test.fr', password: 'password123', role: 'operateur' });
        process.env.ADMIN_EMAIL = OLD;
        expect(res.status).toBe(400);
    });

    it('refuse un mot de passe trop court (400)', async () => {
        const res = await request(app).post('/api/admin/admins').set(A)
            .send({ email: 'court@test.fr', password: 'abc', role: 'operateur' });
        expect(res.status).toBe(400);
    });
});
