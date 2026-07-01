import request from 'supertest';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { app, adminToken, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';

// Vérifie que l'admin peut poster dans le chat d'une course (régression du bug
// expediteur_id NULL → 500) et que le message est bien attribué au type 'admin'.

describe('POST /api/chat/:courseId/messages — admin', () => {
    it('l\'admin peut intervenir dans le chat (201, expediteur=admin)', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query('UPDATE courses SET chauffeur_id=$1 WHERE id=$2', [chf.chauffeur_id, course.id]);

        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(adminToken().auth)
            .send({ contenu: 'Bonjour, SÉSAME ici.' });
        expect(res.status).toBe(201);
        expect(res.body.expediteur_type).toBe('admin');

        const msgs = await request(app).get(`/api/chat/${course.id}/messages`).set(amb.auth);
        expect(msgs.body.some((m: any) => m.expediteur_type === 'admin')).toBe(true);
    });
});

describe('POST /api/chat/:courseId/messages — notifications push', () => {
    const longMsg = 'x'.repeat(120); // > 80 → déclenche la troncature du corps de la notif

    it('un message de l\'ambassadeur notifie le chauffeur', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1 WHERE id=$2", [chf.chauffeur_id, course.id]);
        await db().query("UPDATE chauffeurs SET push_token='ExpoChat' WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(amb.auth).send({ contenu: longMsg });
        expect(res.status).toBe(201);
        const call = (sendPushNotification as jest.Mock).mock.calls.find((c: any[]) => c[0] === 'ExpoChat');
        expect(call).toBeTruthy();
        expect(call[2].endsWith('…')).toBe(true); // corps tronqué
    });

    it('un message du chauffeur notifie l\'ambassadeur', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query("UPDATE courses SET chauffeur_id=$1 WHERE id=$2", [chf.chauffeur_id, course.id]);
        await db().query("UPDATE ambassadeurs SET push_token='ExpoChatAmb' WHERE id=$1", [amb.ambassadeur_id]);
        (sendPushNotification as jest.Mock).mockClear();
        const res = await request(app).post(`/api/chat/${course.id}/messages`).set(chf.auth).send({ contenu: 'Court' });
        expect(res.status).toBe(201);
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[0] === 'ExpoChatAmb')).toBe(true);
    });
});
