import request from 'supertest';
import { app, registerAmbassadeur, registerChauffeur, createCourse, db } from '../helpers/api';

// Compléments ambassadeurs : ETA live du dashboard, gestion d'équipe (403 non-principal,
// 400 champs manquants / statut invalide, 404 employé inconnu).

// Crée un Moral principal (réactivé) et renvoie son user.
async function moralPrincipal() {
    const m = await registerAmbassadeur({ ambassador_type: 'moral', raison_sociale: 'ACME' });
    await db().query("UPDATE utilisateurs SET statut='actif' WHERE id=$1", [m.userId]);
    return m;
}

describe('GET /:id/dashboard — ETA live', () => {
    it('expose eta_minutes pour une course acceptée avec position fraîche', async () => {
        const amb = await registerAmbassadeur();
        const chf = await registerChauffeur();
        const course = await createCourse(amb);
        await db().query(
            "UPDATE courses SET chauffeur_id=$1, statut='acceptee', date_acceptation=now() WHERE id=$2",
            [chf.chauffeur_id, course.id]
        );
        await db().query(
            "UPDATE chauffeurs SET derniere_lat=48.85, derniere_lon=2.35, position_maj_at=now() WHERE id=$1",
            [chf.chauffeur_id]
        );
        const res = await request(app).get(`/api/ambassadeurs/${amb.ambassadeur_id}/dashboard`).set(amb.auth);
        expect(res.status).toBe(200);
        const c = res.body.active_courses.find((x: any) => x.id === course.id);
        expect(c.eta_minutes).toBe(15);
        // Les coordonnées brutes ne doivent jamais fuiter côté client.
        expect(c.derniere_lat).toBeUndefined();
    });
});

describe('Équipe (Moral) — branches d\'erreur', () => {
    it('POST équipe : non-principal → 403', async () => {
        const amb = await registerAmbassadeur(); // physique, pas principal
        const res = await request(app).post(`/api/ambassadeurs/${amb.ambassadeur_id}/equipe`).set(amb.auth)
            .send({ prenom: 'E', nom: 'F', email: 'e@f.fr', telephone: '0612345678', mot_de_passe: 'password123' });
        expect(res.status).toBe(403);
    });

    it('POST équipe : champs manquants → 400', async () => {
        const m = await moralPrincipal();
        const res = await request(app).post(`/api/ambassadeurs/${m.ambassadeur_id}/equipe`).set(m.auth)
            .send({ prenom: 'E' });
        expect(res.status).toBe(400);
    });

    it('PUT statut équipe : statut invalide → 400 ; employé inconnu → 404', async () => {
        const m = await moralPrincipal();
        const bad = await request(app).put(`/api/ambassadeurs/${m.ambassadeur_id}/equipe/00000000-0000-0000-0000-000000000000/statut`).set(m.auth)
            .send({ statut: 'nope' });
        expect(bad.status).toBe(400);
        const notFound = await request(app).put(`/api/ambassadeurs/${m.ambassadeur_id}/equipe/00000000-0000-0000-0000-000000000000/statut`).set(m.auth)
            .send({ statut: 'suspendu' });
        expect(notFound.status).toBe(404);
    });

    it('PUT statut équipe : non-principal → 403', async () => {
        const amb = await registerAmbassadeur();
        const res = await request(app).put(`/api/ambassadeurs/${amb.ambassadeur_id}/equipe/00000000-0000-0000-0000-000000000000/statut`).set(amb.auth)
            .send({ statut: 'actif' });
        expect(res.status).toBe(403);
    });
});
