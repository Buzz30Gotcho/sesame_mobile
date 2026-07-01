import request from 'supertest';
import { app, registerAmbassadeur, registerChauffeur, createCourse, setParam, db } from '../helpers/api';

// Route courses : estimation/tarif, création, périmètre, annulation (compensation +
// sanctions), réservation, validation du code pivot. Règles métier §1, §3, §4.

describe('POST /api/courses/estimer', () => {
    it('renvoie le kilométrage et les deux tarifs (200)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/courses/estimer').set(u.auth)
            .send({ adresse_depart: 'A', adresse_destination: 'B' });
        expect(res.status).toBe(200);
        // fetch mocké → 10 km ; berline = 12 + (10-6)*2 = 20, van = 12 + (10-6)*3 = 24
        expect(res.body.kilometrage).toBe(10);
        expect(res.body.prix_berline).toBe(20);
        expect(res.body.prix_van).toBe(24);
    });

    it('refuse sans adresses (400)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/courses/estimer').set(u.auth).send({});
        expect(res.status).toBe(400);
    });

    it('exige une authentification (401)', async () => {
        const res = await request(app).post('/api/courses/estimer').send({ adresse_depart: 'A', adresse_destination: 'B' });
        expect(res.status).toBe(401);
    });
});

describe('POST /api/courses/creer', () => {
    it('crée une course en recherche avec montant et points calculés (201)', async () => {
        const u = await registerAmbassadeur();
        const course = await createCourse(u);
        expect(course.statut).toBe('recherche');
        expect(Number(course.montant)).toBe(20);
        expect(course.points_attribues).toBe(2); // 20 € → 2 points
        expect(course.reference).toMatch(/^CRS-/);
    });

    it('refuse des données incomplètes (400)', async () => {
        const u = await registerAmbassadeur();
        const res = await request(app).post('/api/courses/creer').set(u.auth)
            .send({ ambassadeur_id: u.ambassadeur_id });
        expect(res.status).toBe(400);
    });

    it('bloque la création immédiate si le mode est désactivé (403)', async () => {
        const u = await registerAmbassadeur();
        await setParam('mode_course_immediate', 'false');
        const res = await request(app).post('/api/courses/creer').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 10, type_course: 'immediate',
        });
        expect(res.status).toBe(403);
    });

    it('refuse d\'agir pour un autre ambassadeur que celui du token (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const res = await request(app).post('/api/courses/creer').set(u1.auth).send({
            ambassadeur_id: u2.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 10,
        });
        expect(res.status).toBe(403);
    });

    it('bloque au-delà de 5 courses simultanées (403 LIMIT_5_COURSES)', async () => {
        const u = await registerAmbassadeur();
        for (let i = 0; i < 5; i++) await createCourse(u);
        const res = await request(app).post('/api/courses/creer').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 10,
        });
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('LIMIT_5_COURSES');
    });
});

describe('GET /api/courses/active & /historique', () => {
    it('ne renvoie que les courses de l\'ambassadeur du token', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        await createCourse(u1);
        const res = await request(app).get('/api/courses/active').set(u2.auth);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]); // u2 n'a aucune course
    });

    it('liste les courses actives de l\'ambassadeur', async () => {
        const u = await registerAmbassadeur();
        await createCourse(u);
        const res = await request(app).get('/api/courses/active').set(u.auth);
        expect(res.body.length).toBe(1);
    });
});

describe('GET /api/courses/:id (propriété)', () => {
    it('autorise le propriétaire (200)', async () => {
        const u = await registerAmbassadeur();
        const course = await createCourse(u);
        const res = await request(app).get(`/api/courses/${course.id}`).set(u.auth);
        expect(res.status).toBe(200);
    });

    it('refuse un tiers (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(u1);
        // Course assignée à un chauffeur → l'ambassadeur tiers n'est partie ni comme
        // ambassadeur ni comme chauffeur (évite l'angle mort null===null, cf. ci-dessous).
        await db().query('UPDATE courses SET chauffeur_id=$1 WHERE id=$2', [chf.chauffeur_id, course.id]);
        const res = await request(app).get(`/api/courses/${course.id}`).set(u2.auth);
        expect(res.status).toBe(403);
    });

    // Régression (faille null===null corrigée) : un tiers ne doit PAS lire une course
    // NON assignée d'autrui (chauffeur_id NULL). Les gardes non-null de ownCourseParam bloquent.
    it('refuse un tiers sur une course non assignée (403)', async () => {
        const u1 = await registerAmbassadeur();
        const u2 = await registerAmbassadeur();
        const course = await createCourse(u1);
        const res = await request(app).get(`/api/courses/${course.id}`).set(u2.auth);
        expect(res.status).toBe(403);
    });
});

describe('POST /api/courses/reserver', () => {
    it('crée une réservation valide (201)', async () => {
        const u = await registerAmbassadeur();
        const dans2h = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const res = await request(app).post('/api/courses/reserver').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 10, date_reservation: dans2h,
        });
        expect(res.status).toBe(201);
        expect(res.body.type_course).toBe('reservation');
    });

    it('refuse un délai inférieur au minimum (400)', async () => {
        const u = await registerAmbassadeur();
        const dans10min = new Date(Date.now() + 10 * 60 * 1000).toISOString();
        const res = await request(app).post('/api/courses/reserver').set(u.auth).send({
            ambassadeur_id: u.ambassadeur_id, adresse_depart: 'A', adresse_destination: 'B',
            vehicule_type: 'berline', kilometrage: 10, date_reservation: dans10min,
        });
        expect(res.status).toBe(400);
    });
});

describe('POST /api/courses/chauffeur/valider-code (code pivot §1.5)', () => {
    async function courseAvecChauffeur() {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query(
            `UPDATE courses SET chauffeur_id = $1, statut = 'en_route', code_validation = '4242' WHERE id = $2`,
            [chf.chauffeur_id, course.id]
        );
        return { amb, chf, course };
    }

    it('valide le bon code et passe en code_valide (200)', async () => {
        const { chf, course } = await courseAvecChauffeur();
        const res = await request(app).post('/api/courses/chauffeur/valider-code').set(chf.auth)
            .send({ course_id: course.id, code: '4242' });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT statut, code_valide_at FROM courses WHERE id=$1', [course.id]);
        expect(r.rows[0].statut).toBe('code_valide');
        expect(r.rows[0].code_valide_at).not.toBeNull();
    });

    it('rejette un code erroné (400)', async () => {
        const { chf, course } = await courseAvecChauffeur();
        const res = await request(app).post('/api/courses/chauffeur/valider-code').set(chf.auth)
            .send({ course_id: course.id, code: '0000' });
        expect(res.status).toBe(400);
    });

    it('refuse un chauffeur non assigné à la course (403)', async () => {
        const { course } = await courseAvecChauffeur();
        const autre = await registerChauffeur();
        const res = await request(app).post('/api/courses/chauffeur/valider-code').set(autre.auth)
            .send({ course_id: course.id, code: '4242' });
        expect(res.status).toBe(403);
    });
});

describe('PUT /api/courses/:id/annuler', () => {
    it('annule par l\'ambassadeur et renvoie un avertissement à la 1re annulation', async () => {
        const u = await registerAmbassadeur();
        const course = await createCourse(u);
        const res = await request(app).put(`/api/courses/${course.id}/annuler`).set(u.auth)
            .send({ raison: 'ambassadeur' });
        expect(res.status).toBe(200);
        expect(res.body.sanction).toBe('avertissement');
        const r = await db().query('SELECT statut FROM courses WHERE id=$1', [course.id]);
        expect(r.rows[0].statut).toBe('annulee');
    });

    it('compense l\'ambassadeur en points si le chauffeur annule après code validé (§1.5)', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        // Simule un code déjà validé
        await db().query(
            `UPDATE courses SET chauffeur_id=$1, code_valide_at=now(), statut='code_valide' WHERE id=$2`,
            [chf.chauffeur_id, course.id]
        );
        const res = await request(app).put(`/api/courses/${course.id}/annuler`).set(chf.auth)
            .send({ raison: 'chauffeur' });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT points_solde FROM ambassadeurs WHERE id=$1', [amb.ambassadeur_id]);
        expect(Number(r.rows[0].points_solde)).toBe(2); // 20 € → 2 points de compensation
        const c = await db().query('SELECT compensation FROM courses WHERE id=$1', [course.id]);
        expect(c.rows[0].compensation).toBe(true);
    });
});
