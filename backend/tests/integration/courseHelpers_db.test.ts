import {
    crediterPaliersParrainage,
    executerSanctionsEnAttente,
    checkAndSuspendExpiredDocsChauffeur,
} from '../../src/lib/courseHelpers';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { registerAmbassadeur, registerChauffeur, query } from '../helpers/api';

// Fonctions de courseHelpers qui touchent la base (paliers parrainage, sanctions
// différées, suspension sur doc expiré). DB de test réelle (Postgres Docker).

async function creerCourseTerminee(ambassadeurId: string): Promise<string> {
    const r = await query(
        `INSERT INTO courses(ambassadeur_id, statut, adresse_depart, adresse_destination, code_valide_at)
         VALUES ($1, 'terminee', 'A', 'B', now()) RETURNING id`,
        [ambassadeurId]
    );
    return r.rows[0].id;
}

describe('crediterPaliersParrainage', () => {
    it('crédite palier1 (5 courses validées) : +5 points, historique et palier enregistrés', async () => {
        const parrain = await registerAmbassadeur();
        const filleul = await registerAmbassadeur();
        // 5 courses terminées + validées pour le filleul → palier1 atteint
        let courseId = '';
        for (let i = 0; i < 5; i++) courseId = await creerCourseTerminee(filleul.ambassadeur_id!);

        await crediterPaliersParrainage(filleul.ambassadeur_id!, parrain.ambassadeur_id!, 0, 'starter', courseId);

        const p = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [parrain.ambassadeur_id]);
        expect(Number(p.rows[0].points_solde)).toBe(5);
        const h = await query("SELECT * FROM points_historique WHERE ambassadeur_id = $1 AND type = 'parrainage'", [parrain.ambassadeur_id]);
        expect(h.rows).toHaveLength(1);
        expect(h.rows[0].montant).toBe(5);
        const pal = await query('SELECT cle FROM parrainage_paliers WHERE filleul_id = $1', [filleul.ambassadeur_id]);
        expect(pal.rows.map((r: any) => r.cle)).toContain('palier1');
    });

    it("n'attribue pas palier1 si moins de 5 courses validées", async () => {
        const parrain = await registerAmbassadeur();
        const filleul = await registerAmbassadeur();
        let courseId = '';
        for (let i = 0; i < 3; i++) courseId = await creerCourseTerminee(filleul.ambassadeur_id!);

        await crediterPaliersParrainage(filleul.ambassadeur_id!, parrain.ambassadeur_id!, 0, 'starter', courseId);

        const p = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [parrain.ambassadeur_id]);
        expect(Number(p.rows[0].points_solde)).toBe(0);
    });

    it('crédite palier2 quand le filleul atteint le niveau pro (+10)', async () => {
        const parrain = await registerAmbassadeur();
        const filleul = await registerAmbassadeur();
        const courseId = await creerCourseTerminee(filleul.ambassadeur_id!);

        await crediterPaliersParrainage(filleul.ambassadeur_id!, parrain.ambassadeur_id!, 0, 'pro', courseId);

        const p = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [parrain.ambassadeur_id]);
        expect(Number(p.rows[0].points_solde)).toBe(10);
    });

    it('idempotent : un palier déjà accordé n\'est pas recrédité', async () => {
        const parrain = await registerAmbassadeur();
        const filleul = await registerAmbassadeur();
        const courseId = await creerCourseTerminee(filleul.ambassadeur_id!);

        await crediterPaliersParrainage(filleul.ambassadeur_id!, parrain.ambassadeur_id!, 0, 'pro', courseId);
        await crediterPaliersParrainage(filleul.ambassadeur_id!, parrain.ambassadeur_id!, 0, 'pro', courseId);

        const p = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [parrain.ambassadeur_id]);
        expect(Number(p.rows[0].points_solde)).toBe(10); // toujours 10, pas 20
    });

    it('ignore silencieusement un parrain inexistant', async () => {
        const filleul = await registerAmbassadeur();
        const courseId = await creerCourseTerminee(filleul.ambassadeur_id!);
        await expect(
            crediterPaliersParrainage(filleul.ambassadeur_id!, '00000000-0000-0000-0000-000000000000', 0, 'pro', courseId)
        ).resolves.toBeUndefined();
    });
});

describe('executerSanctionsEnAttente', () => {
    it('déduit les points quand le solde est suffisant et notifie', async () => {
        const amb = await registerAmbassadeur();
        await query('UPDATE ambassadeurs SET points_solde = 30, push_token = $2 WHERE id = $1', [amb.ambassadeur_id, 'ExpoTok']);
        await query(
            `INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, statut) VALUES ($1, 10, 'absence client', 'en_attente')`,
            [amb.ambassadeur_id]
        );

        await executerSanctionsEnAttente(amb.ambassadeur_id!);

        const a = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [amb.ambassadeur_id]);
        expect(Number(a.rows[0].points_solde)).toBe(20);
        const s = await query('SELECT statut FROM sanctions_en_attente WHERE ambassadeur_id = $1', [amb.ambassadeur_id]);
        expect(s.rows[0].statut).toBe('execute');
        expect(sendPushNotification).toHaveBeenCalled();
    });

    it('ne déduit pas si le solde est insuffisant (sanction reste en attente)', async () => {
        const amb = await registerAmbassadeur();
        await query('UPDATE ambassadeurs SET points_solde = 3 WHERE id = $1', [amb.ambassadeur_id]);
        await query(
            `INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, statut) VALUES ($1, 10, 'absence', 'en_attente')`,
            [amb.ambassadeur_id]
        );

        await executerSanctionsEnAttente(amb.ambassadeur_id!);

        const a = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [amb.ambassadeur_id]);
        expect(Number(a.rows[0].points_solde)).toBe(3);
        const s = await query('SELECT statut FROM sanctions_en_attente WHERE ambassadeur_id = $1', [amb.ambassadeur_id]);
        expect(s.rows[0].statut).toBe('en_attente');
    });

    it('sans push_token : déduit sans notifier', async () => {
        const amb = await registerAmbassadeur();
        await query('UPDATE ambassadeurs SET points_solde = 15, push_token = NULL WHERE id = $1', [amb.ambassadeur_id]);
        await query(
            `INSERT INTO sanctions_en_attente(ambassadeur_id, points, motif, statut) VALUES ($1, 5, 'x', 'en_attente')`,
            [amb.ambassadeur_id]
        );

        await executerSanctionsEnAttente(amb.ambassadeur_id!);

        const a = await query('SELECT points_solde FROM ambassadeurs WHERE id = $1', [amb.ambassadeur_id]);
        expect(Number(a.rows[0].points_solde)).toBe(10);
    });
});

describe('checkAndSuspendExpiredDocsChauffeur', () => {
    it('invalide les documents du chauffeur si un doc obligatoire est expiré', async () => {
        const chf = await registerChauffeur();
        await query('UPDATE chauffeurs SET documents_valides = true WHERE id = $1', [chf.chauffeur_id]);
        await query(
            `INSERT INTO documents_chauffeur(chauffeur_id, type, statut) VALUES ($1, 'permis', 'expire')`,
            [chf.chauffeur_id]
        );

        await checkAndSuspendExpiredDocsChauffeur(chf.chauffeur_id!);

        const c = await query('SELECT documents_valides FROM chauffeurs WHERE id = $1', [chf.chauffeur_id]);
        expect(c.rows[0].documents_valides).toBe(false);
    });

    it('ne touche à rien si aucun doc obligatoire expiré', async () => {
        const chf = await registerChauffeur();
        await query('UPDATE chauffeurs SET documents_valides = true WHERE id = $1', [chf.chauffeur_id]);
        await query(
            `INSERT INTO documents_chauffeur(chauffeur_id, type, statut) VALUES ($1, 'permis', 'valide')`,
            [chf.chauffeur_id]
        );

        await checkAndSuspendExpiredDocsChauffeur(chf.chauffeur_id!);

        const c = await query('SELECT documents_valides FROM chauffeurs WHERE id = $1', [chf.chauffeur_id]);
        expect(c.rows[0].documents_valides).toBe(true);
    });

    it('sans chauffeurId : ne fait rien (garde)', async () => {
        await expect(checkAndSuspendExpiredDocsChauffeur('')).resolves.toBeUndefined();
    });
});
