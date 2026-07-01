import request from 'supertest';
import { app, adminToken, registerAmbassadeur, db } from '../helpers/api';

// Route admin (suite 2) : fournisseurs (CRUD + contrat), offres boutique, paiements,
// exports SEPA (fournisseurs + commissions Moraux) et comptes admin. Specs §6.

const admin = () => adminToken('super_admin').auth;

beforeAll(() => {
    process.env.SESAME_IBAN = 'FR1420041010050500013M02606';
    process.env.SESAME_SOCIETE = 'SAS WINWEEN';
});

const fournisseurValide = {
    nom_societe: 'ACME SARL',
    legal_prenom: 'Jean', legal_nom: 'Dupont', legal_email: 'jean@acme.fr', legal_telephone: '0612345678',
    legal_adresse: '1 rue de Paris', legal_cp: '75001', legal_ville: 'Paris',
    memes_coordonnees: true, option_paiement: 'c',
};

async function creerFournisseur(overrides: Record<string, any> = {}) {
    const res = await request(app).post('/api/admin/fournisseurs').set(admin())
        .send({ ...fournisseurValide, ...overrides });
    if (res.status !== 201) throw new Error(`création fournisseur KO (${res.status}): ${JSON.stringify(res.body)}`);
    return res.body; // { id, nom_societe, statut, code_secret_temporaire, ... }
}

describe('Fournisseurs CRUD', () => {
    it('crée un fournisseur et renvoie un code secret temporaire (201)', async () => {
        const f = await creerFournisseur();
        expect(f.id).toBeTruthy();
        expect(f.statut).toBe('en_configuration');
        expect(f.code_secret_temporaire).toMatch(/^\d{4}$/);
    });

    it('refuse un champ obligatoire manquant (400)', async () => {
        const res = await request(app).post('/api/admin/fournisseurs').set(admin())
            .send({ ...fournisseurValide, nom_societe: '' });
        expect(res.status).toBe(400);
    });

    it('refuse un email légal invalide (400)', async () => {
        const res = await request(app).post('/api/admin/fournisseurs').set(admin())
            .send({ ...fournisseurValide, legal_email: 'pas-un-email' });
        expect(res.status).toBe(400);
    });

    it('refuse un SIRET invalide (400)', async () => {
        const res = await request(app).post('/api/admin/fournisseurs').set(admin())
            .send({ ...fournisseurValide, siret: '123' });
        expect(res.status).toBe(400);
    });

    it('modifie un fournisseur (200)', async () => {
        const f = await creerFournisseur();
        const res = await request(app).put(`/api/admin/fournisseurs/${f.id}`).set(admin())
            .send({ nom_societe: 'ACME 2' });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT nom_societe FROM fournisseurs WHERE id=$1', [f.id]);
        expect(r.rows[0].nom_societe).toBe('ACME 2');
    });

    it('régénère le code secret et débloque le fournisseur', async () => {
        const f = await creerFournisseur();
        await db().query('UPDATE fournisseurs SET bloque=true, nb_tentatives_echouees=3 WHERE id=$1', [f.id]);
        const res = await request(app).post(`/api/admin/fournisseurs/${f.id}/regenerer-code`).set(admin()).send();
        expect(res.status).toBe(200);
        expect(res.body.code_secret_temporaire).toMatch(/^\d{4}$/);
        const r = await db().query('SELECT bloque FROM fournisseurs WHERE id=$1', [f.id]);
        expect(r.rows[0].bloque).toBe(false);
    });
});

describe('Contrat fournisseur', () => {
    it('prévisualise le contrat en PDF (200)', async () => {
        const f = await creerFournisseur();
        const res = await request(app).get(`/api/admin/fournisseurs/${f.id}/contrat-preview`).set(admin());
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('renvoie 404 pour un fournisseur inconnu', async () => {
        const res = await request(app)
            .get('/api/admin/fournisseurs/00000000-0000-0000-0000-000000000000/contrat-preview').set(admin());
        expect(res.status).toBe(404);
    });

    it('envoyer-contrat : 400 si IBAN manquant', async () => {
        const f = await creerFournisseur(); // pas d'IBAN
        const res = await request(app).post(`/api/admin/fournisseurs/${f.id}/envoyer-contrat`).set(admin()).send();
        expect(res.status).toBe(400);
    });

    it('envoyer-contrat : 503 si Yousign non configuré', async () => {
        const f = await creerFournisseur({ iban: 'FR1420041010050500013M02606' });
        const res = await request(app).post(`/api/admin/fournisseurs/${f.id}/envoyer-contrat`).set(admin()).send();
        expect(res.status).toBe(503); // isYousignConfigured() mocké à false
    });

    it('annule un contrat → repasse non signé', async () => {
        const f = await creerFournisseur();
        await db().query("UPDATE fournisseurs SET contrat_signe=true, statut='actif' WHERE id=$1", [f.id]);
        const res = await request(app).post(`/api/admin/fournisseurs/${f.id}/annuler-contrat`).set(admin()).send();
        expect(res.status).toBe(200);
        const r = await db().query('SELECT contrat_signe FROM fournisseurs WHERE id=$1', [f.id]);
        expect(r.rows[0].contrat_signe).toBe(false);
    });
});

describe('Offres boutique (admin)', () => {
    const offreValide = { nom: 'Bon 50€', pts_requis: 5, validite_bon_mois: 6, statut: 'en_ligne' };

    it('crée, liste, modifie et supprime une offre', async () => {
        const f = await creerFournisseur();
        const create = await request(app).post(`/api/admin/fournisseurs/${f.id}/offres`).set(admin()).send(offreValide);
        expect(create.status).toBe(201);
        expect(create.body.reference).toBeTruthy();
        const offreId = create.body.id;

        const list = await request(app).get(`/api/admin/fournisseurs/${f.id}/offres`).set(admin());
        expect(list.body.length).toBe(1);

        const upd = await request(app).put(`/api/admin/offres/${offreId}`).set(admin())
            .send({ ...offreValide, nom: 'Bon 60€', pts_requis: 6 });
        expect(upd.status).toBe(200);
        expect(upd.body.nom).toBe('Bon 60€');

        const del = await request(app).delete(`/api/admin/offres/${offreId}`).set(admin());
        expect(del.status).toBe(200);
    });

    it('refuse une offre invalide (points non entiers positifs) (400)', async () => {
        const f = await creerFournisseur();
        const res = await request(app).post(`/api/admin/fournisseurs/${f.id}/offres`).set(admin())
            .send({ nom: 'X', pts_requis: 0, validite_bon_mois: 6 });
        expect(res.status).toBe(400);
    });

    it('refuse la suppression d\'une offre déjà échangée (409)', async () => {
        const f = await creerFournisseur();
        const o = await request(app).post(`/api/admin/fournisseurs/${f.id}/offres`).set(admin()).send(offreValide);
        const amb = await registerAmbassadeur();
        await db().query(
            `INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut)
             VALUES ('BON-X', $1, $2, $3, 5, 'TQX', 'valide')`,
            [amb.ambassadeur_id, o.body.id, f.id]
        );
        const del = await request(app).delete(`/api/admin/offres/${o.body.id}`).set(admin());
        expect(del.status).toBe(409);
    });
});

describe('Paiements fournisseur & SEPA', () => {
    // Crée un bon "utilisé" (option C) à payer pour un fournisseur avec IBAN.
    async function bonAPayer() {
        const f = await creerFournisseur({ iban: 'FR7630006000011234567890189' });
        await db().query("UPDATE fournisseurs SET option_paiement='c', contrat_signe=true WHERE id=$1", [f.id]);
        const amb = await registerAmbassadeur();
        const o = await db().query(
            `INSERT INTO offres_boutique(fournisseur_id, nom, pts_requis, validite_bon_mois, tarif_fournisseur_ht, statut)
             VALUES ($1,'Bon',5,6,40,'en_ligne') RETURNING id`, [f.id]
        );
        const e = await db().query(
            `INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut, utilise_at)
             VALUES ('BON-P', $1, $2, $3, 5, 'TQP', 'utilise', now()) RETURNING id`,
            [amb.ambassadeur_id, o.rows[0].id, f.id]
        );
        return { fournisseurId: f.id, echangeId: e.rows[0].id };
    }

    it('liste les paiements d\'un fournisseur', async () => {
        const { fournisseurId } = await bonAPayer();
        const res = await request(app).get(`/api/admin/fournisseurs/${fournisseurId}/paiements`).set(admin());
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('kpis');
        expect(Array.isArray(res.body.transactions)).toBe(true);
        expect(res.body.transactions.length).toBe(1); // le bon "utilisé" figure
    });

    it('marque un bon réglé puis refuse un double règlement (404)', async () => {
        const { echangeId } = await bonAPayer();
        const ok = await request(app).put(`/api/admin/echanges/${echangeId}/payer-fournisseur`).set(admin()).send();
        expect(ok.status).toBe(200);
        const again = await request(app).put(`/api/admin/echanges/${echangeId}/payer-fournisseur`).set(admin()).send();
        expect(again.status).toBe(404);
    });

    it('génère le fichier SEPA des virements fournisseurs (XML)', async () => {
        await bonAPayer();
        const res = await request(app).get('/api/admin/sepa/fournisseurs').set(admin());
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('xml');
        expect(res.text).toContain('pain.001.001.03');
    });

    it('SEPA fournisseurs : 400 si rien à exporter', async () => {
        const res = await request(app).get('/api/admin/sepa/fournisseurs').set(admin());
        expect(res.status).toBe(400);
    });
});

describe('Commissions Moraux', () => {
    it('liste les commissions du mois (structure)', async () => {
        const res = await request(app).get('/api/admin/commissions/moraux').set(admin());
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('taux_pct');
        expect(Array.isArray(res.body.ambassadeurs)).toBe(true);
    });

    it('déclenche les virements de commissions (idempotent)', async () => {
        const res = await request(app).post('/api/admin/commissions/declencher').set(admin()).send({ mois: '2026-06' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('nb_virements');
    });
});

describe('Comptes admin (super_admin uniquement)', () => {
    it('crée, liste, modifie et supprime un compte admin', async () => {
        const create = await request(app).post('/api/admin/admins').set(admin())
            .send({ email: `op_${Date.now()}@test.fr`, password: 'password123', nom: 'Opérateur', role: 'operateur' });
        expect(create.status).toBe(201);
        const id = create.body.id;

        const list = await request(app).get('/api/admin/admins').set(admin());
        expect(list.status).toBe(200);
        expect(list.body.comptes.length).toBe(1);

        const upd = await request(app).put(`/api/admin/admins/${id}`).set(admin()).send({ actif: false });
        expect(upd.status).toBe(200);

        const del = await request(app).delete(`/api/admin/admins/${id}`).set(admin());
        expect(del.status).toBe(200);
    });

    it('refuse un rôle invalide (400)', async () => {
        const res = await request(app).post('/api/admin/admins').set(admin())
            .send({ email: 'x@test.fr', password: 'password123', role: 'roi' });
        expect(res.status).toBe(400);
    });

    it('un opérateur ne peut pas accéder aux comptes admin (403)', async () => {
        const res = await request(app).post('/api/admin/admins').set(adminToken('operateur').auth)
            .send({ email: 'y@test.fr', password: 'password123', role: 'lecteur' });
        expect(res.status).toBe(403);
    });
});
