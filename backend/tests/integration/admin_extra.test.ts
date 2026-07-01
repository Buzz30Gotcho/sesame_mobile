import request from 'supertest';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { isYousignConfigured, envoyerContratFournisseur } from '../../src/lib/yousignClient';
import { app, adminToken, registerAmbassadeur, registerChauffeur, createCourse, seedOffre, db } from '../helpers/api';

// Compléments de couverture route admin : endpoints et branches non couverts par
// admin.test / admin_ops.test / admin_fournisseurs.test (listings, arbitrage, KYC,
// blacklist propositions, exports, notes/suppressions, contrat Yousign, SEPA commissions,
// support). Auth super_admin (toutes écritures permises).

const A = adminToken().auth;

// Fournisseur valide créé via la vraie route admin (renvoie son id).
async function createFournisseur(overrides: Record<string, any> = {}): Promise<string> {
    const body = {
        nom_societe: 'ACME SARL',
        legal_prenom: 'Jean', legal_nom: 'Dupont', legal_email: 'jean@acme.fr', legal_telephone: '0612345678',
        legal_adresse: '1 rue A', legal_cp: '75001', legal_ville: 'Paris',
        memes_coordonnees: true, option_paiement: 'c',
        ...overrides,
    };
    const res = await request(app).post('/api/admin/fournisseurs').set(A).send(body);
    if (res.status !== 201) throw new Error(`createFournisseur ${res.status}: ${JSON.stringify(res.body)}`);
    return res.body.id;
}

describe('Listings & filtres', () => {
    it('GET /echanges/en-attente liste les bons en attente admin', async () => {
        const amb = await registerAmbassadeur();
        const { fournisseurId, offreId } = await seedOffre();
        await db().query(
            `INSERT INTO echanges(ambassadeur_id, offre_id, fournisseur_id, points_deduits, statut)
             VALUES ($1,$2,$3,5,'en_attente_admin')`,
            [amb.ambassadeur_id, offreId, fournisseurId]
        );
        const res = await request(app).get('/api/admin/echanges/en-attente').set(A);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
    });

    it('GET /sanctions liste les sanctions en attente', async () => {
        const amb = await registerAmbassadeur();
        await db().query(
            "INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, statut) VALUES ($1,5,'x','en_attente')",
            [amb.ambassadeur_id]
        );
        const res = await request(app).get('/api/admin/sanctions').set(A);
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('GET /litiges?statut=clos filtre par statut', async () => {
        await request(app).post('/api/admin/litiges').set(A).send({ type: 'comportement', description: 'x' });
        const res = await request(app).get('/api/admin/litiges?statut=ouvert').set(A);
        expect(res.status).toBe(200);
        expect(res.body.every((l: any) => l.statut === 'ouvert')).toBe(true);
    });
});

describe('Courses admin : annulation & assignation', () => {
    it('annule une course → statut annulee + litige auto', async () => {
        const amb = await registerAmbassadeur();
        const course = await createCourse(amb);
        const res = await request(app).put(`/api/admin/courses/${course.id}/annuler`).set(A).send({ raison: 'test' });
        expect(res.status).toBe(200);
        const c = await db().query('SELECT statut FROM courses WHERE id=$1', [course.id]);
        expect(c.rows[0].statut).toBe('annulee');
        const l = await db().query("SELECT count(*)::int n FROM litiges WHERE course_id=$1 AND origine='auto'", [course.id]);
        expect(l.rows[0].n).toBe(1);
    });

    it('annuler une course inexistante → 404', async () => {
        const res = await request(app).put('/api/admin/courses/00000000-0000-0000-0000-000000000000/annuler').set(A).send({});
        expect(res.status).toBe(404);
    });

    it('assigne un chauffeur à une course', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        const res = await request(app).put(`/api/admin/courses/${course.id}/assigner`).set(A).send({ chauffeur_id: chf.chauffeur_id });
        expect(res.status).toBe(200);
        const c = await db().query('SELECT chauffeur_id, statut FROM courses WHERE id=$1', [course.id]);
        expect(c.rows[0].chauffeur_id).toBe(chf.chauffeur_id);
    });

    it('assigner sans chauffeur_id → 400 ; chauffeur inconnu → 404', async () => {
        const amb = await registerAmbassadeur();
        const course = await createCourse(amb);
        const r400 = await request(app).put(`/api/admin/courses/${course.id}/assigner`).set(A).send({});
        expect(r400.status).toBe(400);
        const r404 = await request(app).put(`/api/admin/courses/${course.id}/assigner`).set(A)
            .send({ chauffeur_id: '00000000-0000-0000-0000-000000000000' });
        expect(r404.status).toBe(404);
    });
});

describe('Arbitrage alerte — solde insuffisant & indemnisation', () => {
    it('pénalité > solde → sanction reste en_attente (différée)', async () => {
        const amb = await registerAmbassadeur();
        const course = await createCourse(amb);
        await db().query('UPDATE ambassadeurs SET points_solde=2 WHERE id=$1', [amb.ambassadeur_id]);
        const s = await db().query(
            "INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, course_id, statut) VALUES ($1,0,'Client absent signalé par chauffeur',$2,'en_attente') RETURNING id",
            [amb.ambassadeur_id, course.id]
        );
        const res = await request(app).post(`/api/admin/alertes/${s.rows[0].id}/arbitrer`).set(A)
            .send({ action: 'penalite', points: 10 });
        expect(res.status).toBe(200);
        expect(res.body.sanction).toBe('en_attente');
    });

    it('indemnisation chauffeur → notification INDEMNISATION', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1 WHERE id=$2", [chf.chauffeur_id, course.id]);
        await db().query("UPDATE chauffeurs SET push_token='ExpoCh' WHERE id=$1", [chf.chauffeur_id]);
        const s = await db().query(
            "INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, course_id, statut) VALUES ($1,0,'Client absent signalé par chauffeur',$2,'en_attente') RETURNING id",
            [amb.ambassadeur_id, course.id]
        );
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/admin/alertes/${s.rows[0].id}/arbitrer`).set(A)
            .send({ action: 'ok', points: 0, indemnisation: 15 });
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'INDEMNISATION')).toBe(true);
    });

    it('arbitrer une sanction inconnue → 404', async () => {
        const res = await request(app).post('/api/admin/alertes/00000000-0000-0000-0000-000000000000/arbitrer').set(A).send({ points: 0 });
        expect(res.status).toBe(404);
    });
});

describe('Chat admin intervenir', () => {
    it('insère un message admin (201)', async () => {
        const amb = await registerAmbassadeur();
        const course = await createCourse(amb);
        const res = await request(app).post(`/api/admin/chat/${course.id}/intervenir`).set(A).send({ contenu: 'Bonjour' });
        expect(res.status).toBe(201);
        expect(res.body.expediteur_type).toBe('admin');
    });

    it('refuse un contenu vide (400)', async () => {
        const amb = await registerAmbassadeur();
        const course = await createCourse(amb);
        const res = await request(app).post(`/api/admin/chat/${course.id}/intervenir`).set(A).send({ contenu: '   ' });
        expect(res.status).toBe(400);
    });
});

describe('KYC admin : documents chauffeur (URLs signées)', () => {
    it('GET /chauffeurs/:id/documents renvoie les docs avec URL signée', async () => {
        const chf = await registerChauffeur();
        await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url) VALUES ($1,'permis','p/recto.jpg')", [chf.chauffeur_id]);
        (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ signedURL: '/storage/v1/object/sign/x?token=z' }) }));
        const res = await request(app).get(`/api/admin/chauffeurs/${chf.chauffeur_id}/documents`).set(A);
        expect(res.status).toBe(200);
        expect(res.body[0].fichier_recto_url).toContain('token=z');
    });
});

describe('Blacklist propositions', () => {
    async function proposition() {
        const amb = await registerAmbassadeur();
        await db().query("UPDATE utilisateurs SET date_naissance='1990-01-01', lieu_naissance='Paris' WHERE id=(SELECT utilisateur_id FROM ambassadeurs WHERE id=$1)", [amb.ambassadeur_id]);
        const p = await db().query(
            "INSERT INTO blacklist_propositions(ambassadeur_id, motif, nb_annulations, statut) VALUES ($1,'5 annulations',5,'en_attente_admin') RETURNING id",
            [amb.ambassadeur_id]
        );
        return { amb, propId: p.rows[0].id };
    }

    it('liste, confirme (→ blacklist + utilisateur blackliste)', async () => {
        const { amb, propId } = await proposition();
        const list = await request(app).get('/api/admin/blacklist/propositions').set(A);
        expect(list.body.length).toBe(1);
        const res = await request(app).put(`/api/admin/blacklist/propositions/${propId}/confirmer`).set(A).send({});
        expect(res.status).toBe(200);
        const bl = await db().query('SELECT count(*)::int n FROM blacklist', []);
        expect(bl.rows[0].n).toBe(1);
        const u = await db().query("SELECT statut FROM utilisateurs WHERE id=(SELECT utilisateur_id FROM ambassadeurs WHERE id=$1)", [amb.ambassadeur_id]);
        expect(u.rows[0].statut).toBe('blackliste');
    });

    it('rejette une proposition', async () => {
        const { propId } = await proposition();
        const res = await request(app).put(`/api/admin/blacklist/propositions/${propId}/rejeter`).set(A).send({});
        expect(res.status).toBe(200);
        const p = await db().query('SELECT statut FROM blacklist_propositions WHERE id=$1', [propId]);
        expect(p.rows[0].statut).toBe('rejete');
    });

    it('confirmer une proposition inconnue → 404', async () => {
        const res = await request(app).put('/api/admin/blacklist/propositions/00000000-0000-0000-0000-000000000000/confirmer').set(A).send({});
        expect(res.status).toBe(404);
    });
});

describe('Export paiements CSV', () => {
    it('exporte les paiements chauffeur (CSV avec frais/net)', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='terminee', code_valide_at=now(), date_fin=now(), montant=100 WHERE id=$2", [chf.chauffeur_id, course.id]);
        const res = await request(app).get('/api/admin/export/paiements').set(A);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/csv');
        expect(res.text).toContain('Net chauffeur');
    });
});

describe('Taux, notes, suppressions', () => {
    it('modifie le taux commission chauffeur (+400 sans taux, +404 inconnu)', async () => {
        const chf = await registerChauffeur();
        const ok = await request(app).put(`/api/admin/chauffeurs/${chf.chauffeur_id}/taux`).set(A).send({ taux: 15 });
        expect(ok.status).toBe(200);
        const b400 = await request(app).put(`/api/admin/chauffeurs/${chf.chauffeur_id}/taux`).set(A).send({});
        expect(b400.status).toBe(400);
        const b404 = await request(app).put('/api/admin/chauffeurs/00000000-0000-0000-0000-000000000000/taux').set(A).send({ taux: 10 });
        expect(b404.status).toBe(404);
    });

    it('note ambassadeur & chauffeur (+404)', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        expect((await request(app).put(`/api/admin/ambassadeurs/${amb.ambassadeur_id}/note`).set(A).send({ note: 'n' })).status).toBe(200);
        expect((await request(app).put(`/api/admin/chauffeurs/${chf.chauffeur_id}/note`).set(A).send({ note: 'n' })).status).toBe(200);
        expect((await request(app).put('/api/admin/ambassadeurs/00000000-0000-0000-0000-000000000000/note').set(A).send({ note: 'n' })).status).toBe(404);
        expect((await request(app).put('/api/admin/chauffeurs/00000000-0000-0000-0000-000000000000/note').set(A).send({ note: 'n' })).status).toBe(404);
    });

    it('supprime un ambassadeur puis un chauffeur (+404)', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        expect((await request(app).delete(`/api/admin/ambassadeurs/${amb.ambassadeur_id}`).set(A)).status).toBe(200);
        expect((await request(app).delete(`/api/admin/chauffeurs/${chf.chauffeur_id}`).set(A)).status).toBe(200);
        expect((await request(app).delete('/api/admin/ambassadeurs/00000000-0000-0000-0000-000000000000').set(A)).status).toBe(404);
        expect((await request(app).delete('/api/admin/chauffeurs/00000000-0000-0000-0000-000000000000').set(A)).status).toBe(404);
    });
});

describe('Valider ambassadeur moral — notification', () => {
    it('active le compte et notifie via push (+404 inconnu)', async () => {
        const amb = await registerAmbassadeur();
        await db().query("UPDATE ambassadeurs SET type_ambassadeur='moral', push_token='ExpoMoral' WHERE id=$1", [amb.ambassadeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).put(`/api/admin/ambassadeurs/${amb.ambassadeur_id}/valider-moral`).set(A).send({});
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'compte_valide')).toBe(true);
        const r404 = await request(app).put('/api/admin/ambassadeurs/00000000-0000-0000-0000-000000000000/valider-moral').set(A).send({});
        expect(r404.status).toBe(404);
    });
});

describe('Fournisseur — validations & contrat Yousign', () => {
    it('POST refuse un téléphone légal invalide (400)', async () => {
        const res = await request(app).post('/api/admin/fournisseurs').set(A).send({
            nom_societe: 'X', legal_prenom: 'A', legal_nom: 'B', legal_email: 'a@b.fr', legal_telephone: '123',
            legal_adresse: 'r', legal_cp: '75001', legal_ville: 'Paris', memes_coordonnees: true,
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Téléphone/);
    });

    it('POST refuse un email de prestation invalide quand coordonnées distinctes (400)', async () => {
        const res = await request(app).post('/api/admin/fournisseurs').set(A).send({
            nom_societe: 'X', legal_prenom: 'A', legal_nom: 'B', legal_email: 'a@b.fr', legal_telephone: '0612345678',
            legal_adresse: 'r', legal_cp: '75001', legal_ville: 'Paris',
            memes_coordonnees: false,
            prest_prenom: 'P', prest_nom: 'Q', prest_telephone: '0611111111', prest_email: 'pas-un-email',
            prest_adresse: 'r2', prest_cp: '75002', prest_ville: 'Paris',
        });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/prestation/);
    });

    it('PUT refuse un IBAN invalide (400)', async () => {
        const id = await createFournisseur();
        const res = await request(app).put(`/api/admin/fournisseurs/${id}`).set(A).send({ iban: 'XX00INVALID' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/IBAN/);
    });

    it('envoyer-contrat : succès quand Yousign configuré', async () => {
        const id = await createFournisseur({ iban: 'FR7630006000011234567890189' });
        (isYousignConfigured as jest.Mock).mockReturnValueOnce(true);
        const res = await request(app).post(`/api/admin/fournisseurs/${id}/envoyer-contrat`).set(A).send({});
        expect(res.status).toBe(200);
        expect(envoyerContratFournisseur).toHaveBeenCalled();
    });

    it('envoyer-contrat : 502 si Yousign échoue', async () => {
        const id = await createFournisseur({ iban: 'FR7630006000011234567890189' });
        (isYousignConfigured as jest.Mock).mockReturnValueOnce(true);
        (envoyerContratFournisseur as jest.Mock).mockRejectedValueOnce(new Error('boom'));
        const res = await request(app).post(`/api/admin/fournisseurs/${id}/envoyer-contrat`).set(A).send({});
        expect(res.status).toBe(502);
    });
});

describe('SEPA commissions Moraux', () => {
    const OLD_IBAN = process.env.SESAME_IBAN;
    afterAll(() => { process.env.SESAME_IBAN = OLD_IBAN; });

    it('400 si IBAN Winween non configuré', async () => {
        delete process.env.SESAME_IBAN;
        const res = await request(app).get('/api/admin/sepa/commissions').set(A);
        expect(res.status).toBe(400);
    });

    it('400 si aucune commission à exporter', async () => {
        process.env.SESAME_IBAN = 'FR7630006000011234567890189';
        const res = await request(app).get('/api/admin/sepa/commissions').set(A);
        expect(res.status).toBe(400);
    });

    it('génère le XML et marque les virements versés', async () => {
        process.env.SESAME_IBAN = 'FR7630006000011234567890189';
        const amb = await registerAmbassadeur();
        await db().query("UPDATE ambassadeurs SET type_ambassadeur='moral', etablissement='Ent', iban='FR7630006000011234567890189' WHERE id=$1", [amb.ambassadeur_id]);
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET statut='terminee', code_valide_at=now(), date_fin=now(), montant=200 WHERE id=$1", [course.id]);
        const res = await request(app).get('/api/admin/sepa/commissions').set(A);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('xml');
        const v = await db().query('SELECT count(*)::int n FROM virements_commissions WHERE ambassadeur_id=$1', [amb.ambassadeur_id]);
        expect(v.rows[0].n).toBe(1);
    });
});

describe('Support tickets — 404 & notification', () => {
    async function ticket(pushToken?: string) {
        const amb = await registerAmbassadeur();
        if (pushToken) await db().query('UPDATE ambassadeurs SET push_token=$2 WHERE id=$1', [amb.ambassadeur_id, pushToken]);
        const uid = (await db().query('SELECT utilisateur_id FROM ambassadeurs WHERE id=$1', [amb.ambassadeur_id])).rows[0].utilisateur_id;
        const t = await db().query(
            "INSERT INTO tickets(utilisateur_id, categorie, sujet, statut) VALUES ($1,'autre','Sujet','ouvert') RETURNING id",
            [uid]
        );
        return t.rows[0].id;
    }

    it('messages d\'un ticket inconnu → 404', async () => {
        const res = await request(app).get('/api/admin/support/tickets/00000000-0000-0000-0000-000000000000/messages').set(A);
        expect(res.status).toBe(404);
    });

    it('répondre notifie l\'utilisateur par push', async () => {
        const id = await ticket('ExpoTicket');
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/admin/support/tickets/${id}/messages`).set(A).send({ contenu: 'Réponse' });
        expect(res.status).toBe(201);
        expect(sendPushNotification).toHaveBeenCalled();
    });

    it('répondre à un ticket inconnu → 404 ; contenu vide → 400', async () => {
        const id = await ticket();
        expect((await request(app).post(`/api/admin/support/tickets/${id}/messages`).set(A).send({ contenu: '' })).status).toBe(400);
        expect((await request(app).post('/api/admin/support/tickets/00000000-0000-0000-0000-000000000000/messages').set(A).send({ contenu: 'x' })).status).toBe(404);
    });

    it('changer le statut : invalide → 400 ; inconnu → 404', async () => {
        expect((await request(app).put('/api/admin/support/tickets/00000000-0000-0000-0000-000000000000').set(A).send({ statut: 'nope' })).status).toBe(400);
        expect((await request(app).put('/api/admin/support/tickets/00000000-0000-0000-0000-000000000000').set(A).send({ statut: 'resolu' })).status).toBe(404);
    });
});
