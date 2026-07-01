import request from 'supertest';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { app, adminToken, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';

// Compléments courses : estimation impossible (422), restrictions/limites de commande,
// historique, sanctions d'annulation (avertissement / restriction 24h / suspension +
// blacklist), compensation + notifications à l'annulation par le chauffeur, réservation.

async function insertAnnulledCourses(ambassadeurId: string, n: number) {
    for (let i = 0; i < n; i++) {
        await db().query(
            `INSERT INTO courses(ambassadeur_id, statut, adresse_depart, adresse_destination, annule_par, date_annulation)
             VALUES ($1,'annulee','A','B','ambassadeur', now() - interval '1 day')`,
            [ambassadeurId]
        );
    }
}

describe('POST /estimer — distance impossible (422)', () => {
    it('renvoie 422 si les adresses ne géocodent pas', async () => {
        const u = await registerAmbassadeur();
        (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }));
        const res = await request(app).post('/api/courses/estimer').set(u.auth)
            .send({ adresse_depart: 'Nulle part 999', adresse_destination: 'Ailleurs 999' });
        expect(res.status).toBe(422);
    });
});

describe('POST /creer — restriction de commande', () => {
    it('403 si l\'ambassadeur est sous restriction', async () => {
        const u = await registerAmbassadeur();
        await db().query("UPDATE ambassadeurs SET restriction_commande_jusqu_au = now() + interval '2 hours' WHERE id=$1", [u.ambassadeur_id]);
        const res = await request(app).post('/api/courses/creer').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 5, type_course: 'immediate',
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/suspendue/i);
    });

    it('notifie les chauffeurs disponibles à la création', async () => {
        const u = await registerAmbassadeur();
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET disponible=true, push_token='ExpoDispo' WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        await createCourse(u);
        await new Promise(r => setTimeout(r, 150)); // laisse la notif fire-and-forget se déclencher
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[0] === 'ExpoDispo')).toBe(true);
    });
});

describe('GET /historique', () => {
    it('renvoie l\'historique de l\'ambassadeur', async () => {
        const u = await registerAmbassadeur();
        await db().query("INSERT INTO courses(ambassadeur_id, statut, adresse_depart, adresse_destination, date_fin) VALUES ($1,'terminee','A','B',now())", [u.ambassadeur_id]);
        const res = await request(app).get('/api/courses/historique').query({ ambassadeur_id: u.ambassadeur_id }).set(u.auth);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
    });

    it('un admin voit l\'historique global', async () => {
        const u = await registerAmbassadeur();
        await db().query("INSERT INTO courses(ambassadeur_id, statut, adresse_depart, adresse_destination, date_fin) VALUES ($1,'terminee','A','B',now())", [u.ambassadeur_id]);
        const res = await request(app).get('/api/courses/historique').set(adminToken().auth);
        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
});

describe('PUT /:id/annuler — sanctions ambassadeur', () => {
    it('1re annulation → avertissement', async () => {
        const u = await registerAmbassadeur();
        const course = await createCourse(u);
        const res = await request(app).put(`/api/courses/${course.id}/annuler`).set(u.auth).send({});
        expect(res.status).toBe(200);
        expect(res.body.sanction).toBe('avertissement');
    });

    it('3 annulations en 30j → restriction 24h', async () => {
        const u = await registerAmbassadeur();
        await insertAnnulledCourses(u.ambassadeur_id!, 2);
        const course = await createCourse(u);
        const res = await request(app).put(`/api/courses/${course.id}/annuler`).set(u.auth).send({});
        expect(res.body.sanction).toBe('restriction_24h');
        const a = await db().query('SELECT restriction_commande_jusqu_au FROM ambassadeurs WHERE id=$1', [u.ambassadeur_id]);
        expect(a.rows[0].restriction_commande_jusqu_au).not.toBeNull();
    });

    it('5 annulations en 30j → suspension + proposition blacklist', async () => {
        const u = await registerAmbassadeur();
        await insertAnnulledCourses(u.ambassadeur_id!, 5);
        const course = await createCourse(u);
        const res = await request(app).put(`/api/courses/${course.id}/annuler`).set(u.auth).send({});
        expect(res.body.sanction).toBe('suspension');
        const stat = await db().query('SELECT statut FROM utilisateurs WHERE id=$1', [u.userId]);
        expect(stat.rows[0].statut).toBe('suspendu');
        const prop = await db().query('SELECT count(*)::int n FROM blacklist_propositions WHERE ambassadeur_id=$1', [u.ambassadeur_id]);
        expect(prop.rows[0].n).toBe(1);
    });
});

describe('PUT /:id/annuler — annulation chauffeur (compensation + notifs)', () => {
    it('compense l\'ambassadeur (code validé) et notifie', async () => {
        const parrain = await registerAmbassadeur();
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        await db().query('UPDATE ambassadeurs SET parrain_id=$1, push_token=$2 WHERE id=$3', [parrain.ambassadeur_id, 'ExpoAmbAnn', amb.ambassadeur_id]);
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='code_valide', code_valide_at=now(), montant=100 WHERE id=$2", [chf.chauffeur_id, course.id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).put(`/api/courses/${course.id}/annuler`).set(chf.auth).send({ raison: 'chauffeur' });
        expect(res.status).toBe(200);
        const a = await db().query('SELECT points_solde FROM ambassadeurs WHERE id=$1', [amb.ambassadeur_id]);
        expect(Number(a.rows[0].points_solde)).toBe(10); // 100 € → 10 pts compensés
        const types = (sendPushNotification as jest.Mock).mock.calls.map((c: any[]) => c[3]?.type);
        expect(types).toEqual(expect.arrayContaining(['CHAUFFEUR_ANNULE']));
        const comp = await db().query('SELECT compensation FROM courses WHERE id=$1', [course.id]);
        expect(comp.rows[0].compensation).toBe(true);
    });
});

describe('POST /reserver — validations', () => {
    it('champs manquants → 400', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/courses/reserver').set(u.auth).send({ ambassadeur_id: u.ambassadeur_id });
        expect(res.status).toBe(400);
    });

    it('restriction active → 403', async () => {
        const u = await registerAmbassadeur();
        await db().query("UPDATE ambassadeurs SET restriction_commande_jusqu_au = now() + interval '2 hours' WHERE id=$1", [u.ambassadeur_id]);
        const res = await request(app).post('/api/courses/reserver').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 5, date_reservation: new Date(Date.now() + 7200000).toISOString(),
        });
        expect(res.status).toBe(403);
    });

    it('au-delà de 5 courses actives → 403 LIMIT_5_COURSES', async () => {
        const u = await registerAmbassadeur();
        for (let i = 0; i < 5; i++) {
            await db().query("INSERT INTO courses(ambassadeur_id, statut, adresse_depart, adresse_destination) VALUES ($1,'recherche','A','B')", [u.ambassadeur_id]);
        }
        const res = await request(app).post('/api/courses/reserver').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 5, date_reservation: new Date(Date.now() + 7200000).toISOString(),
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('LIMIT_5_COURSES');
    });
});
