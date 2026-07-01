import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer } from 'ws';
import app from './app';
import { joinRoom, leaveRoom } from './ws/chatHub';
import { query } from './db';
import { sendPushNotification } from './lib/pushNotifications';
import { stripe } from './lib/stripeClient';
import { runBillingCycle } from './lib/billing';

import { JWT_SECRET } from './config';

const port = process.env.PORT || 4001;

const server = http.createServer(app);

// WebSocket server — /ws/chat/:courseId
// Pas d'option `path` : ws ferait un match EXACT (`/ws/chat`) et rejetterait `/ws/chat/<id>`.
// Le handler de connexion valide lui-même le chemin (courseId) et le token.
const wss = new WebSocketServer({ server });

wss.on('connection', async (ws, req) => {
    try {
        // URL attendue : /ws/chat/<courseId>?token=<JWT>
        const [pathPart, queryPart] = (req.url ?? '').split('?');
        const courseId = pathPart.split('/ws/chat/')[1] ?? '';
        const token = new URLSearchParams(queryPart ?? '').get('token') ?? '';
        if (!courseId || !token) { ws.close(4001, 'Authentification requise'); return; }

        // 1) Vérifier le token
        let userId: string | undefined;
        let isAdmin = false;
        try {
            const payload = jwt.verify(token, JWT_SECRET) as { sub?: string; role?: string };
            userId = payload.sub;
            isAdmin = payload.role === 'admin';
        } catch {
            ws.close(4001, 'Token invalide ou expiré');
            return;
        }

        // 2) Vérifier que l'utilisateur est partie de la course (admin exempté)
        if (!isAdmin) {
            const r = await query(
                `SELECT 1 FROM courses c
                 WHERE c.id = $1 AND (
                     c.ambassadeur_id = (SELECT id FROM ambassadeurs WHERE utilisateur_id = $2 LIMIT 1)
                  OR c.chauffeur_id  = (SELECT id FROM chauffeurs  WHERE utilisateur_id = $2 LIMIT 1)
                 )`,
                [courseId, userId]
            );
            if (!r.rowCount) { ws.close(4003, 'Accès refusé'); return; }
        }

        // 3) OK — rejoindre la room
        joinRoom(courseId, ws);

        ws.on('close', () => leaveRoom(courseId, ws));

        ws.on('error', () => ws.close());
    } catch {
        ws.close(1011, 'Erreur serveur');
    }
});

// Cron J-7 et J-1 — vérification toutes les heures, fenêtre 2h pour éviter les doublons
async function checkExpiringBons() {
    const j7 = await query(`
        SELECT o.nom AS nom_offre, e.expire_at, a.push_token
        FROM echanges e
        JOIN offres_boutique o ON o.id = e.offre_id
        JOIN ambassadeurs a ON a.id = e.ambassadeur_id
        WHERE e.statut = 'valide'
          AND a.push_token IS NOT NULL
          AND e.expire_at BETWEEN now() + interval '6 days 23 hours' AND now() + interval '7 days 1 hour'
    `);
    for (const bon of j7.rows) {
        const dateStr = new Date(bon.expire_at).toLocaleDateString('fr-FR');
        const heureStr = new Date(bon.expire_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        await sendPushNotification(bon.push_token, 'Bon expire dans 7 jours', `${bon.nom_offre} expire le ${dateStr} à ${heureStr}.`, { type: 'BON_EXPIRE_J7' }).catch(() => {});
    }

    const j1 = await query(`
        SELECT o.nom AS nom_offre, e.expire_at, a.push_token
        FROM echanges e
        JOIN offres_boutique o ON o.id = e.offre_id
        JOIN ambassadeurs a ON a.id = e.ambassadeur_id
        WHERE e.statut = 'valide'
          AND a.push_token IS NOT NULL
          AND e.expire_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours'
    `);
    for (const bon of j1.rows) {
        const heureStr = new Date(bon.expire_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        await sendPushNotification(bon.push_token, 'Bon expire DEMAIN', `${bon.nom_offre} expire demain à ${heureStr} exactement !`, { type: 'BON_EXPIRE_J1' }).catch(() => {});
    }
}

setInterval(() => checkExpiringBons().catch(() => {}), 60 * 60 * 1000); // toutes les heures

const DOC_LABELS: Record<string, string> = {
    carte_identite: "Carte d'identité",
    carte_vtc: 'Carte VTC',
    revtc: 'REVTC',
    kbis: 'Kbis',
    permis: 'Permis de conduire',
    rir: 'RIR',
    rc_pro: 'RC Pro',
    rc_circulation: 'RC Circulation',
    carte_grise: 'Carte grise',
    certificat_medical: 'Certificat médical',
    photo_profil: 'Photo de profil',
};

// Docs dont l'expiration bloque le chauffeur (documents_valides = false)
const DOCS_OBLIGATOIRES = ['carte_identite', 'carte_vtc', 'permis', 'carte_grise'];

// Alertes J-15, J-7, J-0 — documents chauffeur (specs Interfaces Catalogue v4 §2)
// Kbis géré séparément : alerte admin à J-30 via dashboard (pas de notif chauffeur)
async function checkExpiringDocuments() {
    const windows = [
        { days: 15, label: 'expire dans 15 jours', title: 'Document expire bientôt' },
        { days: 7,  label: 'expire dans 7 jours',  title: 'Document expire bientôt' },
        { days: 0,  label: 'expire aujourd\'hui',   title: 'Document expiré' },
    ];

    for (const { days, label, title } of windows) {
        const result = await query(`
            SELECT d.id, d.type, d.chauffeur_id, d.date_expiration, c.push_token
            FROM documents_chauffeur d
            JOIN chauffeurs c ON c.id = d.chauffeur_id
            JOIN utilisateurs u ON u.id = c.utilisateur_id
            WHERE d.statut = 'valide'
              AND d.date_expiration IS NOT NULL
              AND d.type != 'kbis'
              AND c.push_token IS NOT NULL
              AND u.statut = 'actif'
              AND d.date_expiration::date = (now() + interval '${days} days')::date
        `);

        for (const doc of result.rows) {
            const nom = DOC_LABELS[doc.type] || doc.type;
            await sendPushNotification(
                doc.push_token,
                title,
                `${nom} ${label}.`,
                { type: 'document_expiration', doc_type: doc.type }
            ).catch(() => {});
        }

        // J-0 : marquer expiré + bloquer chauffeur si doc obligatoire
        // Si chauffeur en course active : laisser terminer, la suspension se fait à la fin de course (specs §9.1)
        if (days === 0) {
            await query(`
                UPDATE documents_chauffeur SET statut = 'expire'
                WHERE statut = 'valide'
                  AND date_expiration IS NOT NULL
                  AND date_expiration::date = now()::date
            `);
            // Bloquer uniquement les chauffeurs qui ne sont PAS en course active
            await query(`
                UPDATE chauffeurs SET documents_valides = false
                WHERE id IN (
                    SELECT DISTINCT d.chauffeur_id FROM documents_chauffeur d
                    WHERE d.statut = 'expire' AND d.type = ANY($1)
                )
                AND id NOT IN (
                    SELECT chauffeur_id FROM courses
                    WHERE statut IN ('acceptee','en_route','code_valide','en_cours')
                      AND chauffeur_id IS NOT NULL
                )
            `, [DOCS_OBLIGATOIRES]);
        }
    }
}

setInterval(() => checkExpiringDocuments().catch(() => {}), 60 * 60 * 1000); // toutes les heures

// Facturation Stripe hebdo — logique dans lib/billing.ts (testable hors serveur).
setInterval(() => runBillingCycle().catch(() => {}), 30 * 60 * 1000); // toutes les 30 min

// Commissions Ambassadeurs Moraux — calcul et déclenchement le 1er du mois (specs §1 — Ambassadeur Moral)
const commissionsRan = new Set<string>();

async function runCommissionsMoraux() {
    const now = new Date();
    const key = `commissions-${now.getFullYear()}-${now.getMonth() + 1}`;
    if (now.getDate() !== 1 || now.getHours() !== 2 || commissionsRan.has(key)) return;
    commissionsRan.add(key);

    const tauxRes = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const taux = Number(tauxRes.rows[0]?.valeur ?? 10) / 100;

    // CA du mois précédent pour chaque Moral — inclut les courses des sous-comptes employés (specs §1)
    const moraux = await query(`
        SELECT
            a.id,
            a.iban,
            u.prenom,
            u.nom,
            u.email,
            COALESCE(SUM(c.montant), 0) AS ca_mois
        FROM ambassadeurs a
        JOIN utilisateurs u ON u.id = a.utilisateur_id
        LEFT JOIN courses c ON (
            c.ambassadeur_id = a.id
            OR c.ambassadeur_id IN (
                SELECT se.utilisateur_id FROM sous_comptes_employes se
                JOIN ambassadeurs asub ON asub.utilisateur_id = se.utilisateur_id
                WHERE se.ambassadeur_moral_id = a.id AND se.statut = 'actif'
            )
        )
            AND c.statut = 'terminee'
            AND c.code_valide_at >= date_trunc('month', now() - interval '1 month')
            AND c.code_valide_at < date_trunc('month', now())
        WHERE a.type_ambassadeur = 'moral'
          AND u.statut = 'actif'
        GROUP BY a.id, a.iban, u.prenom, u.nom, u.email
        HAVING COALESCE(SUM(c.montant), 0) > 0
    `);

    for (const moral of moraux.rows) {
        const commission = Math.round(Number(moral.ca_mois) * taux * 100) / 100;
        if (commission <= 0) continue;
        const moisLabel = new Date(Date.now() - 28 * 24 * 3600 * 1000).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        await query(
            `INSERT INTO commissions_moraux(ambassadeur_id, montant, ca_mois, taux, mois_reference, statut)
             VALUES ($1, $2, $3, $4, $5, 'en_attente')`,
            [moral.id, commission, moral.ca_mois, taux * 100, moisLabel]
        ).catch(() => {}); // table commissions_moraux créée via migrations 001/002
    }
}

setInterval(() => runCommissionsMoraux().catch(() => {}), 30 * 60 * 1000);

// Schéma géré entièrement par les migrations 001/002 (appliquées manuellement dans Supabase).
// Plus de runner auto au démarrage : toutes les tables + colonnes y sont définies.
server.listen(port, () => {
    console.log(`SESAME backend running on http://localhost:${port}`);
    console.log(`WebSocket available on ws://localhost:${port}/ws/chat/:courseId`);
});
