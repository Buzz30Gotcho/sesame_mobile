import request from 'supertest';
import { app, adminToken, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';

// Route admin (suite) : opérations métier — alertes/arbitrage, contrôle identité,
// validation documents (KYC), sanctions, litiges, blacklist, exports CSV, 2FA, support.

const admin = () => adminToken('super_admin').auth;

describe('Alertes client-absent & arbitrage', () => {
    async function alerteCliemtAbsent() {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='en_route', date_arrivee=now() WHERE id=$2", [chf.chauffeur_id, course.id]);
        await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/client-absent`).set(chf.auth)
            .send({ course_id: course.id, minutes: 10 });
        const s = await db().query("SELECT id FROM sanctions_en_attente WHERE ambassadeur_id=$1", [amb.ambassadeur_id]);
        return { amb, sanctionId: s.rows[0].id };
    }

    it('liste les alertes en attente', async () => {
        await alerteCliemtAbsent();
        const res = await request(app).get('/api/admin/alertes').set(admin());
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
    });

    it('arbitre avec pénalité de points (prélèvement immédiat si solde suffisant)', async () => {
        const { amb, sanctionId } = await alerteCliemtAbsent();
        await db().query('UPDATE ambassadeurs SET points_solde=50 WHERE id=$1', [amb.ambassadeur_id]);
        const res = await request(app).post(`/api/admin/alertes/${sanctionId}/arbitrer`).set(admin())
            .send({ action: 'penalite', points: 10, indemnisation: 5 });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT points_solde FROM ambassadeurs WHERE id=$1', [amb.ambassadeur_id]);
        expect(Number(r.rows[0].points_solde)).toBe(40);
    });

    it('arbitre sans pénalité → clôt l\'alerte', async () => {
        const { sanctionId } = await alerteCliemtAbsent();
        const res = await request(app).post(`/api/admin/alertes/${sanctionId}/arbitrer`).set(admin())
            .send({ action: 'rien', points: 0 });
        expect(res.status).toBe(200);
        expect(res.body.sanction).toBe('execute');
    });
});

describe('Contrôle identité chauffeur', () => {
    it('conforme → enregistre le contrôle sans suspension (200)', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/admin/chauffeurs/${chf.chauffeur_id}/controle-identite`).set(admin())
            .send({ resultat: 'conforme', note: 'OK' });
        expect(res.status).toBe(200);
        expect(res.body.suspendu).toBe(false);
        const c = await db().query('SELECT count(*)::int AS n FROM controles_identite WHERE chauffeur_id=$1', [chf.chauffeur_id]);
        expect(c.rows[0].n).toBe(1);
    });

    it('non conforme → suspend le chauffeur + crée un litige', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/admin/chauffeurs/${chf.chauffeur_id}/controle-identite`).set(admin())
            .send({ resultat: 'non_conforme', note: 'photo floue' });
        expect(res.status).toBe(200);
        expect(res.body.suspendu).toBe(true);
        const u = await db().query('SELECT statut FROM utilisateurs WHERE id=$1', [chf.userId]);
        expect(u.rows[0].statut).toBe('suspendu');
        const l = await db().query('SELECT count(*)::int AS n FROM litiges WHERE chauffeur_id=$1', [chf.chauffeur_id]);
        expect(l.rows[0].n).toBe(1);
    });

    it('refuse un résultat invalide (400, validé avant la requête)', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/admin/chauffeurs/${chf.chauffeur_id}/controle-identite`).set(admin())
            .send({ resultat: 'peut_etre' });
        expect(res.status).toBe(400);
    });
});

describe('Validation des documents (KYC §2)', () => {
    async function doc(chauffeurId: string, type: string) {
        const r = await db().query(
            `INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url, statut)
             VALUES ($1,$2,'path.jpg','en_attente') RETURNING id`,
            [chauffeurId, type]
        );
        return r.rows[0].id;
    }

    it('valide les 4 docs obligatoires → documents_valides = true', async () => {
        const chf = await registerChauffeur();
        for (const type of ['carte_identite', 'carte_vtc', 'permis', 'carte_grise']) {
            const id = await doc(chf.chauffeur_id!, type);
            const res = await request(app).put(`/api/admin/documents/${id}/valider`).set(admin()).send({});
            expect(res.status).toBe(200);
        }
        const r = await db().query('SELECT documents_valides FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(r.rows[0].documents_valides).toBe(true);
    });

    it('exige la mention RC Circulation avant validation (400)', async () => {
        const chf = await registerChauffeur();
        const id = await doc(chf.chauffeur_id!, 'rc_circulation');
        const res = await request(app).put(`/api/admin/documents/${id}/valider`).set(admin()).send({});
        expect(res.status).toBe(400);
    });

    it('refuse un document → documents_valides = false', async () => {
        const chf = await registerChauffeur();
        await db().query('UPDATE chauffeurs SET documents_valides=true WHERE id=$1', [chf.chauffeur_id]);
        const id = await doc(chf.chauffeur_id!, 'permis');
        const res = await request(app).put(`/api/admin/documents/${id}/refuser`).set(admin()).send({ motif: 'illisible' });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT documents_valides FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(r.rows[0].documents_valides).toBe(false);
    });
});

describe('Litiges', () => {
    it('crée, liste et clôt un litige', async () => {
        const create = await request(app).post('/api/admin/litiges').set(admin())
            .send({ type: 'comportement', description: 'Test litige' });
        expect(create.status).toBe(201);

        const list = await request(app).get('/api/admin/litiges').set(admin());
        expect(list.body.length).toBe(1);
        const litigeId = list.body[0].id;

        const close = await request(app).put(`/api/admin/litiges/${litigeId}`).set(admin())
            .send({ statut: 'clos', decision: 'Classé sans suite' });
        expect(close.status).toBe(200);
    });

    it('refuse un type de litige invalide (400)', async () => {
        const res = await request(app).post('/api/admin/litiges').set(admin()).send({ type: 'bidon' });
        expect(res.status).toBe(400);
    });
});

describe('Blacklist', () => {
    it('ajoute, liste puis supprime une entrée', async () => {
        const add = await request(app).post('/api/admin/blacklist').set(admin()).send({
            nom: 'Doe', prenom: 'John', date_naissance: '1990-01-01', lieu_naissance: 'Paris', telephone: '0600000000', type_utilisateur: 'ambassadeur',
        });
        expect(add.status).toBe(201);
        const id = add.body.id;

        const list = await request(app).get('/api/admin/blacklist').set(admin());
        expect(list.body.length).toBe(1);

        const del = await request(app).delete(`/api/admin/blacklist/${id}`).set(admin());
        expect(del.status).toBe(200);
    });

    it('refuse des données manquantes (400)', async () => {
        const res = await request(app).post('/api/admin/blacklist').set(admin()).send({ nom: 'X' });
        expect(res.status).toBe(400);
    });
});

describe('Exports CSV', () => {
    it('exporte ambassadeurs / courses / chauffeurs en CSV', async () => {
        await registerAmbassadeur();
        for (const [path, filename] of [['ambassadeurs', 'ambassadeurs.csv'], ['courses', 'courses.csv'], ['chauffeurs', 'chauffeurs.csv']]) {
            const res = await request(app).get(`/api/admin/export/${path}`).set(admin());
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('text/csv');
            expect(res.headers['content-disposition']).toContain(filename);
        }
    });
});

describe('2FA admin', () => {
    // Les routes 2FA opèrent sur admin_securite id=1 (ligne unique seedée en prod) ;
    // le TRUNCATE inter-test la supprime, on la recrée.
    beforeEach(async () => {
        await db().query('INSERT INTO admin_securite(id) VALUES (1) ON CONFLICT (id) DO NOTHING');
    });

    it('statut → setup → activate (cycle complet)', async () => {
        const otplib = require('otplib');
        const statut0 = await request(app).get('/api/admin/2fa/status').set(admin());
        expect(statut0.body.enabled).toBe(false);

        const setup = await request(app).post('/api/admin/2fa/setup').set(admin()).send();
        expect(setup.status).toBe(200);
        expect(setup.body.secret).toBeTruthy();

        const code = otplib.authenticator.generate(setup.body.secret);
        const activate = await request(app).post('/api/admin/2fa/activate').set(admin()).send({ code });
        expect(activate.status).toBe(200);

        const statut1 = await request(app).get('/api/admin/2fa/status').set(admin());
        expect(statut1.body.enabled).toBe(true);
    });

    it('refuse un code 2FA incorrect à l\'activation (400)', async () => {
        await request(app).post('/api/admin/2fa/setup').set(admin()).send();
        const res = await request(app).post('/api/admin/2fa/activate').set(admin()).send({ code: '000000' });
        expect(res.status).toBe(400);
    });
});

describe('Support tickets (admin)', () => {
    async function ticketUtilisateur() {
        const u = await registerAmbassadeur();
        const t = await request(app).post('/api/tickets').set(u.auth)
            .send({ categorie: 'autre', sujet: 'S', message: 'Aidez-moi' });
        return t.body.id;
    }

    it('liste les tickets, consulte les messages et change le statut', async () => {
        const ticketId = await ticketUtilisateur();

        const list = await request(app).get('/api/admin/support/tickets').set(admin());
        expect(list.body.length).toBe(1);

        const msgs = await request(app).get(`/api/admin/support/tickets/${ticketId}/messages`).set(admin());
        expect(msgs.status).toBe(200);
        expect(msgs.body.length).toBe(1);

        const close = await request(app).put(`/api/admin/support/tickets/${ticketId}`).set(admin())
            .send({ statut: 'resolu' });
        expect(close.status).toBe(200);

        const count = await request(app).get('/api/admin/support/tickets-count').set(admin());
        expect(count.body.count).toBe(0); // résolu → non compté
    });

    it('répond à un ticket (201) et le passe en cours', async () => {
        const ticketId = await ticketUtilisateur();
        const rep = await request(app).post(`/api/admin/support/tickets/${ticketId}/messages`).set(admin())
            .send({ contenu: 'Bonjour, on regarde' });
        expect(rep.status).toBe(201);
        const r = await db().query('SELECT statut FROM tickets WHERE id=$1', [ticketId]);
        expect(r.rows[0].statut).toBe('en_cours');
    });
});
