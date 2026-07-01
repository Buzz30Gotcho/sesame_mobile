import request from 'supertest';
import { stripe } from '../../src/lib/stripeClient';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { app, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';
import { checkAndSuspendExpiredDocsChauffeur } from '../../src/lib/courseHelpers';

// Compléments de couverture route chauffeurs : profil (PUT), courses, courses
// disponibles + ETA, position GPS, documents (upload/list Supabase), push-token,
// relance après refus, client absent (minutes calculées), branches d'erreur.

describe('PUT /api/chauffeurs/:id/profile', () => {
    it('met à jour prénom/IBAN/SIRET et renvoie le profil', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/profile`).set(chf.auth)
            .send({ prenom: 'Nouveau', iban: 'FR7612345', siret: '12345678901234' });
        expect(res.status).toBe(200);
        expect(res.body.prenom).toBe('Nouveau');
        expect(res.body.iban).toBe('FR7612345');
    });
});

describe('GET /api/chauffeurs/:id/courses', () => {
    it('renvoie les courses assignées au chauffeur', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='terminee', date_fin=now() WHERE id=$2", [chf.chauffeur_id, course.id]);
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/courses`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe(course.id);
    });
});

describe('GET /api/chauffeurs/:id/courses-disponibles', () => {
    it('renvoie [] si le chauffeur est hors ligne', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/courses-disponibles`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });

    it('renvoie la course en recherche + ETA si position fraîche', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        await createCourse(amb); // course en 'recherche', berline, sans chauffeur
        await db().query(
            "UPDATE chauffeurs SET disponible=true, derniere_lat=48.85, derniere_lon=2.35, position_maj_at=now() WHERE id=$1",
            [chf.chauffeur_id]
        );
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/courses-disponibles`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].eta_minutes).toBe(15); // OSRM mocké = 15 min
    });
});

describe('POST /api/chauffeurs/:id/position', () => {
    it('enregistre la position GPS', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/position`).set(chf.auth)
            .send({ lat: 48.85, lon: 2.35 });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT derniere_lat FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(Number(r.rows[0].derniere_lat)).toBeCloseTo(48.85);
    });

    it('rejette une position invalide (400)', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/position`).set(chf.auth)
            .send({ lat: 'x', lon: null });
        expect(res.status).toBe(400);
    });
});

describe('accept-course — notification ETA à l\'ambassadeur', () => {
    it('notifie l\'ambassadeur avec ETA quand sa position est fraîche', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE ambassadeurs SET push_token='ExpoAmb' WHERE id=$1", [amb.ambassadeur_id]);
        await db().query(
            "UPDATE chauffeurs SET derniere_lat=48.85, derniere_lon=2.35, position_maj_at=now() WHERE id=$1",
            [chf.chauffeur_id]
        );
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/accept-course`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(200);
        expect(sendPushNotification).toHaveBeenCalled();
        const [, titre, corps] = (sendPushNotification as jest.Mock).mock.calls[0];
        expect(titre).toMatch(/Chauffeur trouvé/);
        expect(corps).toMatch(/arrive dans ~15 min/);
    });
});

describe('branches d\'erreur du cycle de course', () => {
    async function acceptedCourse() {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        const acc = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/accept-course`).set(chf.auth)
            .send({ course_id: course.id });
        return { amb, chf, course, code: acc.body.code_validation };
    }

    it('arrived refuse si la course n\'est pas acceptée (400)', async () => {
        const { chf, course } = await acceptedCourse();
        await db().query("UPDATE courses SET statut='terminee' WHERE id=$1", [course.id]);
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/arrived`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(400);
    });

    it('validate-code rejette un mauvais code (400)', async () => {
        const { chf, course } = await acceptedCourse();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/validate-code`).set(chf.auth)
            .send({ course_id: course.id, code: '0000' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Code invalide/);
    });

    it('validate-code notifie l\'ambassadeur (CODE_VALIDE)', async () => {
        const { amb, chf, course, code } = await acceptedCourse();
        await db().query("UPDATE ambassadeurs SET push_token='ExpoAmb2' WHERE id=$1", [amb.ambassadeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/validate-code`).set(chf.auth)
            .send({ course_id: course.id, code });
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'CODE_VALIDE')).toBe(true);
    });

    it('finish-course refuse une course pas en cours (400)', async () => {
        const { chf, course } = await acceptedCourse();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/finish-course`).set(chf.auth)
            .send({ course_id: course.id, lat: 48.8566, lon: 2.3522 });
        expect(res.status).toBe(400);
    });
});

describe('Documents Supabase (upload / liste)', () => {
    it('upload un document (transfert Supabase mocké)', async () => {
        const chf = await registerChauffeur();
        (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({}) }));
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents/upload`).set(chf.auth)
            .field('type', 'permis').field('side', 'recto')
            .attach('file', Buffer.from('img'), { filename: 'p.jpg', contentType: 'image/jpeg' });
        expect(res.status).toBe(200);
        expect(res.body.fichier_recto_url).toContain('permis_recto');
    });

    it('upload : type invalide → 400', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents/upload`).set(chf.auth)
            .field('type', 'hack').field('side', 'recto')
            .attach('file', Buffer.from('img'), { filename: 'p.jpg', contentType: 'image/jpeg' });
        expect(res.status).toBe(400);
    });

    it('upload : fichier manquant → 400', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents/upload`).set(chf.auth)
            .field('type', 'permis').field('side', 'recto');
        expect(res.status).toBe(400);
    });

    it('liste les documents avec URLs signées', async () => {
        const chf = await registerChauffeur();
        await db().query(
            "INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url) VALUES ($1,'permis','path/recto.jpg')",
            [chf.chauffeur_id]
        );
        (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ signedURL: '/storage/v1/object/sign/x?token=abc' }) }));
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/documents`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body[0].fichier_recto_url).toContain('token=abc');
    });

    it('POST /documents sans type → 400', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents`).set(chf.auth)
            .send({ fichier_recto_url: 'x' });
        expect(res.status).toBe(400);
    });
});

describe('push-token', () => {
    it('enregistre le token push', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/push-token`).set(chf.auth)
            .send({ push_token: 'ExpoTok123' });
        expect(res.status).toBe(200);
        const r = await db().query('SELECT push_token FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(r.rows[0].push_token).toBe('ExpoTok123');
    });

    it('refuse un token vide (400)', async () => {
        const chf = await registerChauffeur();
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/push-token`).set(chf.auth).send({});
        expect(res.status).toBe(400);
    });
});

describe('refuse-course — relance vers les autres chauffeurs', () => {
    it('notifie les autres chauffeurs disponibles du même type', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const autre = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='acceptee' WHERE id=$2", [chf.chauffeur_id, course.id]);
        await db().query("UPDATE chauffeurs SET disponible=true, push_token='ExpoAutre' WHERE id=$1", [autre.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/refuse-course`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[0] === 'ExpoAutre')).toBe(true);
    });
});

describe('refuse-course — garde-fou code validé', () => {
    it('refuse un refus après validation du code (400, anti-contournement suspension)', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='code_valide', code_valide_at=now() WHERE id=$2", [chf.chauffeur_id, course.id]);
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/refuse-course`).set(chf.auth)
            .send({ course_id: course.id });
        expect(res.status).toBe(400);
        // La course n'a PAS été remise en recherche (le chauffeur reste assigné)
        const c = await db().query('SELECT statut, chauffeur_id FROM courses WHERE id=$1', [course.id]);
        expect(c.rows[0].statut).toBe('code_valide');
        expect(c.rows[0].chauffeur_id).toBe(chf.chauffeur_id);
    });
});

describe('checkAndSuspendExpiredDocsChauffeur — blocage sur doc expiré (specs §2 / §9.1)', () => {
    async function setDocValide(chauffeurId: string) {
        await db().query('UPDATE chauffeurs SET documents_valides = true WHERE id = $1', [chauffeurId]);
    }
    async function insertDocExpire(chauffeurId: string, type: string) {
        await db().query(
            "INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url, statut) VALUES ($1,$2,'x.jpg','expire')",
            [chauffeurId, type]
        );
    }

    it.each(['rc_pro', 'rc_circulation', 'revtc', 'certificat_medical', 'carte_identite', 'carte_vtc', 'permis'])(
        'bloque le chauffeur (documents_valides=false) quand %s est expiré',
        async (type) => {
            const chf = await registerChauffeur();
            const id = chf.chauffeur_id!;
            await setDocValide(id);
            await insertDocExpire(id, type);
            await checkAndSuspendExpiredDocsChauffeur(id);
            const c = await db().query('SELECT documents_valides FROM chauffeurs WHERE id=$1', [id]);
            expect(c.rows[0].documents_valides).toBe(false);
        }
    );

    it.each(['carte_grise', 'photo_profil', 'rir', 'kbis'])(
        'NE bloque PAS quand %s est expiré (hors cycle d\'expiration auto)',
        async (type) => {
            const chf = await registerChauffeur();
            const id = chf.chauffeur_id!;
            await setDocValide(id);
            await insertDocExpire(id, type);
            await checkAndSuspendExpiredDocsChauffeur(id);
            const c = await db().query('SELECT documents_valides FROM chauffeurs WHERE id=$1', [id]);
            expect(c.rows[0].documents_valides).toBe(true);
        }
    );
});

describe('client-absent — minutes calculées & notification', () => {
    it('calcule les minutes depuis date_arrivee si non fournies et notifie', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE ambassadeurs SET push_token='ExpoAmb3' WHERE id=$1", [amb.ambassadeur_id]);
        await db().query(
            "UPDATE courses SET chauffeur_id=$1, statut='en_route', date_arrivee=now() - interval '7 minutes' WHERE id=$2",
            [chf.chauffeur_id, course.id]
        );
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/client-absent`).set(chf.auth)
            .send({ course_id: course.id }); // pas de minutes → calcul serveur
        expect(res.status).toBe(200);
        const call = (sendPushNotification as jest.Mock).mock.calls.find((c: any[]) => c[3]?.type === 'CHAUFFEUR_ATTEND');
        expect(call).toBeTruthy();
        expect(call[2]).toMatch(/depuis \d+ min/);
    });
});

describe('finish-course — parrainage + notification points', () => {
    it('crédite le parrain et notifie l\'ambassadeur (COURSE_TERMINEE)', async () => {
        const parrain = await registerAmbassadeur();
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        // Le filleul a un parrain et un token push
        await db().query('UPDATE ambassadeurs SET parrain_id=$1, push_token=$2 WHERE id=$3', [parrain.ambassadeur_id, 'ExpoFilleul', amb.ambassadeur_id]);
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1, statut='code_valide', code_valide_at=now() WHERE id=$2", [chf.chauffeur_id, course.id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/finish-course`).set(chf.auth)
            .send({ course_id: course.id, lat: 48.8566, lon: 2.3522 });
        expect(res.status).toBe(200);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'COURSE_TERMINEE')).toBe(true);
    });
});

describe('Documents Supabase — branches erreur', () => {
    it('upload sur un document déjà existant → UPDATE de la face', async () => {
        const chf = await registerChauffeur();
        await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url) VALUES ($1,'permis','ancien.jpg')", [chf.chauffeur_id]);
        (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, text: async () => '', json: async () => ({}) }));
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents/upload`).set(chf.auth)
            .field('type', 'permis').field('side', 'verso')
            .attach('file', Buffer.from('img'), { filename: 'v.png', contentType: 'image/png' });
        expect(res.status).toBe(200);
        expect(res.body.fichier_verso_url).toContain('permis_verso');
        // une seule ligne pour ce type (UPDATE, pas INSERT)
        const r = await db().query("SELECT count(*)::int n FROM documents_chauffeur WHERE chauffeur_id=$1 AND type='permis'", [chf.chauffeur_id]);
        expect(r.rows[0].n).toBe(1);
    });

    it('upload : Supabase renvoie une erreur HTTP → 500', async () => {
        const chf = await registerChauffeur();
        (global as any).fetch = jest.fn(async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) }));
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents/upload`).set(chf.auth)
            .field('type', 'permis').field('side', 'recto')
            .attach('file', Buffer.from('img'), { filename: 'p.jpg', contentType: 'image/jpeg' });
        expect(res.status).toBe(500);
    });

    it('upload : exception réseau → 500', async () => {
        const chf = await registerChauffeur();
        (global as any).fetch = jest.fn(async () => { throw new Error('network'); });
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/documents/upload`).set(chf.auth)
            .field('type', 'permis').field('side', 'recto')
            .attach('file', Buffer.from('img'), { filename: 'p.jpg', contentType: 'image/jpeg' });
        expect(res.status).toBe(500);
    });

    it('liste : si la signature échoue, renvoie le chemin brut (repli)', async () => {
        const chf = await registerChauffeur();
        await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url) VALUES ($1,'permis','brut/recto.jpg')", [chf.chauffeur_id]);
        (global as any).fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({}) }));
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/documents`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body[0].fichier_recto_url).toBe('brut/recto.jpg');
    });

    it('liste : si fetch lève, renvoie le chemin brut (catch)', async () => {
        const chf = await registerChauffeur();
        await db().query("INSERT INTO documents_chauffeur(chauffeur_id, type, fichier_recto_url) VALUES ($1,'permis','catch/recto.jpg')", [chf.chauffeur_id]);
        (global as any).fetch = jest.fn(async () => { throw new Error('sign down'); });
        const res = await request(app).get(`/api/chauffeurs/${chf.chauffeur_id}/documents`).set(chf.auth);
        expect(res.status).toBe(200);
        expect(res.body[0].fichier_recto_url).toBe('catch/recto.jpg');
    });
});

describe('ensureStripeCustomer — création du client Stripe', () => {
    it('crée un customer Stripe et le persiste au premier setup-card', async () => {
        const chf = await registerChauffeur();
        // On simule un chauffeur sans customer Stripe (cas historique / pré-inscription Stripe).
        await db().query('UPDATE chauffeurs SET stripe_customer_id=NULL WHERE id=$1', [chf.chauffeur_id]);
        (stripe.customers.create as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chauffeurs/${chf.chauffeur_id}/setup-card`).set(chf.auth).send();
        expect(res.status).toBe(200);
        expect(stripe.customers.create).toHaveBeenCalled();
        const r = await db().query('SELECT stripe_customer_id FROM chauffeurs WHERE id=$1', [chf.chauffeur_id]);
        expect(r.rows[0].stripe_customer_id).toBe('cus_test');
    });
});

describe('availability — carte Stripe indisponible (retrieve échoue)', () => {
    it('renvoie NO_CARD si Stripe lève à la récupération du client', async () => {
        const chf = await registerChauffeur();
        await db().query("UPDATE chauffeurs SET documents_valides=true, iban='FR76', stripe_customer_id='cus_err' WHERE id=$1", [chf.chauffeur_id]);
        (stripe.customers.retrieve as jest.Mock).mockRejectedValueOnce(new Error('stripe down'));
        const res = await request(app).put(`/api/chauffeurs/${chf.chauffeur_id}/availability`).set(chf.auth)
            .send({ disponible: true });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('NO_CARD');
    });
});
