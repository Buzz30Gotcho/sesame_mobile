import { query } from '../db';
import { nextAmbassadorLevel } from './rules';
import { sendPushNotification } from './pushNotifications';

// Paliers parrainage (specs §1.4) — uniquement Ambassadeur Physique
const PALIERS = [
    { key: 'palier1', bonus: 5,  check: async (filleulId: string) => {
        const r = await query(`SELECT count(*) FROM courses WHERE ambassadeur_id = $1 AND statut = 'terminee' AND code_valide_at IS NOT NULL`, [filleulId]);
        return Number(r.rows[0].count) >= 5;
    }},
    { key: 'palier2', bonus: 10, check: (_: string, niveau: string) => Promise.resolve(niveau === 'pro') },
    { key: 'palier3', bonus: 15, check: (_: string, niveau: string) => Promise.resolve(niveau === 'elite') },
    { key: 'palier4', bonus: 20, check: (_: string, niveau: string) => Promise.resolve(niveau === 'black') },
];

export async function crediterPaliersParrainage(filleulId: string, parrainId: string, _solde: number, niveau: string, courseId: string) {
    const done = await query(`SELECT cle FROM parrainage_paliers WHERE filleul_id = $1`, [filleulId]);
    const doneKeys = new Set(done.rows.map((r: any) => r.cle));

    for (const palier of PALIERS) {
        if (doneKeys.has(palier.key)) continue;
        const atteint = await palier.check(filleulId, niveau);
        if (!atteint) continue;

        const parrainResult = await query('SELECT points_solde, niveau FROM ambassadeurs WHERE id = $1', [parrainId]);
        const parrain = parrainResult.rows[0];
        if (!parrain) continue;

        const solde_avant = Number(parrain.points_solde || 0);
        const solde_apres = solde_avant + palier.bonus;
        const newLevel = nextAmbassadorLevel(solde_apres);
        await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, parrainId]);
        await query(
            'INSERT INTO points_historique(ambassadeur_id, type, montant, solde_avant, solde_apres, course_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [parrainId, 'parrainage', palier.bonus, solde_avant, solde_apres, courseId, `Bonus parrainage ${palier.key}`]
        );
        await query('INSERT INTO parrainage_paliers(filleul_id, parrain_id, cle) VALUES ($1,$2,$3)', [filleulId, parrainId, palier.key]);
    }
}

// Exécute les sanctions différées — met à jour le niveau après déduction (specs §3.3 + §3.6)
export async function executerSanctionsEnAttente(ambassadeurId: string) {
    const sanctions = await query(
        "SELECT * FROM sanctions_en_attente WHERE ambassadeur_id = $1 AND statut = 'en_attente' ORDER BY decide_at ASC",
        [ambassadeurId]
    );
    for (const sanction of sanctions.rows) {
        const current = await query('SELECT points_solde, push_token FROM ambassadeurs WHERE id = $1', [ambassadeurId]);
        const solde = Number(current.rows[0]?.points_solde || 0);
        if (solde >= sanction.points) {
            const solde_apres = solde - sanction.points;
            const newLevel = nextAmbassadorLevel(solde_apres);
            await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, ambassadeurId]);
            await query("UPDATE sanctions_en_attente SET statut = 'execute', execute_at = now() WHERE id = $1", [sanction.id]);
            const pushToken = current.rows[0]?.push_token;
            if (pushToken) {
                const date = new Date(sanction.decide_at).toLocaleDateString('fr-FR');
                await sendPushNotification(pushToken, `-${sanction.points} points prélevés`, `Suite à l'absence de votre client le ${date}.`).catch(() => {});
            }
        }
    }
}

// Vérifie si un doc obligatoire est expiré et suspend le chauffeur (specs §9.1)
export async function checkAndSuspendExpiredDocsChauffeur(chauffeurId: string) {
    if (!chauffeurId) return;
    const DOCS_OBLIGATOIRES = ['carte_identite', 'carte_vtc', 'permis', 'carte_grise'];
    const expired = await query(
        `SELECT id FROM documents_chauffeur WHERE chauffeur_id = $1 AND statut = 'expire' AND type = ANY($2)`,
        [chauffeurId, DOCS_OBLIGATOIRES]
    );
    if (expired.rows.length > 0) {
        await query('UPDATE chauffeurs SET documents_valides = false WHERE id = $1', [chauffeurId]);
    }
}
