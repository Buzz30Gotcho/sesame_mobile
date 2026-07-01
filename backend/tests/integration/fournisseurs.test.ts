import request from 'supertest';
import bcrypt from 'bcrypt';
import { app, registerAmbassadeur, db } from '../helpers/api';

// Route fournisseur /valider-bon (page web fournisseur, publique) : les 5 vérifications
// du scan QR (specs §6.4) — bon existant, fournisseur autorisé, code secret, offre active,
// fenêtre de validité — + verrouillage après 3 échecs.

// Prépare un bon prêt à valider et renvoie {token_qr, code_secret, fournisseurId, echangeId}.
async function seedBon(opts: { code?: string; expireDansMs?: number; bloque?: boolean } = {}) {
    const code = opts.code ?? '1234';
    const amb = await registerAmbassadeur();
    const hash = await bcrypt.hash(code, 4);
    const f = await db().query(
        `INSERT INTO fournisseurs(nom_societe, contrat_signe, statut, code_secret_hash, bloque)
         VALUES ('ACME', true, 'actif', $1, $2) RETURNING id`,
        [hash, opts.bloque ?? false]
    );
    const fournisseurId = f.rows[0].id;
    const o = await db().query(
        `INSERT INTO offres_boutique(fournisseur_id, nom, pts_requis, validite_bon_mois, statut)
         VALUES ($1, 'Bon', 5, 6, 'en_ligne') RETURNING id`,
        [fournisseurId]
    );
    const expire = new Date(Date.now() + (opts.expireDansMs ?? 3600 * 1000));
    const e = await db().query(
        `INSERT INTO echanges(reference, ambassadeur_id, offre_id, fournisseur_id, points_deduits, token_qr, statut, remis_at, expire_at)
         VALUES ('BON-1', $1, $2, $3, 5, 'TOK-123', 'valide', now(), $4) RETURNING id`,
        [amb.ambassadeur_id, o.rows[0].id, fournisseurId, expire]
    );
    return { token_qr: 'TOK-123', code_secret: code, fournisseurId, echangeId: e.rows[0].id };
}

describe('POST /api/fournisseurs/valider-bon', () => {
    it('valide un bon avec le bon code (200) et le marque utilisé', async () => {
        const bon = await seedBon();
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        const r = await db().query('SELECT statut, utilise_at FROM echanges WHERE id=$1', [bon.echangeId]);
        expect(r.rows[0].statut).toBe('utilise');
        expect(r.rows[0].utilise_at).not.toBeNull();
    });

    it('exige token_qr et code_secret (400)', async () => {
        const res = await request(app).post('/api/fournisseurs/valider-bon').send({});
        expect(res.status).toBe(400);
    });

    it('renvoie 404 pour un token inconnu', async () => {
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: 'inconnu', code_secret: '1234' });
        expect(res.status).toBe(404);
    });

    it('refuse un code secret erroné (401)', async () => {
        const bon = await seedBon();
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: '0000' });
        expect(res.status).toBe(401);
    });

    it('bloque le fournisseur après 3 codes erronés', async () => {
        const bon = await seedBon();
        for (let i = 0; i < 3; i++) {
            await request(app).post('/api/fournisseurs/valider-bon')
                .send({ token_qr: bon.token_qr, code_secret: '0000' });
        }
        const r = await db().query('SELECT bloque FROM fournisseurs WHERE id=$1', [bon.fournisseurId]);
        expect(r.rows[0].bloque).toBe(true);
        // Même avec le bon code, le fournisseur bloqué est refusé (403)
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(403);
    });

    it('refuse un bon expiré (400) et le marque expiré', async () => {
        const bon = await seedBon({ expireDansMs: -1000 });
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(400);
        const r = await db().query('SELECT statut FROM echanges WHERE id=$1', [bon.echangeId]);
        expect(r.rows[0].statut).toBe('expire');
    });

    it('refuse un bon déjà utilisé (400)', async () => {
        const bon = await seedBon();
        await db().query("UPDATE echanges SET statut='utilise' WHERE id=$1", [bon.echangeId]);
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(400);
    });

    it('refuse si l\'offre n\'est plus en ligne (400)', async () => {
        const bon = await seedBon();
        await db().query("UPDATE offres_boutique SET statut='hors_ligne' WHERE fournisseur_id=$1", [bon.fournisseurId]);
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(400);
    });

    it('refuse un bon pas encore prêt (remis_at manquant) (400)', async () => {
        const bon = await seedBon();
        await db().query('UPDATE echanges SET remis_at=NULL WHERE id=$1', [bon.echangeId]);
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(400);
    });

    it('remet le compteur d\'échecs à zéro après une validation réussie', async () => {
        const bon = await seedBon();
        await db().query('UPDATE fournisseurs SET nb_tentatives_echouees=2 WHERE id=$1', [bon.fournisseurId]);
        const res = await request(app).post('/api/fournisseurs/valider-bon')
            .send({ token_qr: bon.token_qr, code_secret: bon.code_secret });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT nb_tentatives_echouees FROM fournisseurs WHERE id=$1', [bon.fournisseurId]);
        expect(r.rows[0].nb_tentatives_echouees).toBe(0);
    });
});
