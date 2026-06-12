import 'dotenv/config';
import http from 'http';
import jwt from 'jsonwebtoken';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app';
import { query } from './db';
import { sendPushNotification } from './lib/pushNotifications';
import { stripe } from './lib/stripeClient';

import { JWT_SECRET } from './config';

const port = process.env.PORT || 4000;

const server = http.createServer(app);

// WebSocket server — /ws/chat/:courseId
// Pas d'option `path` : ws ferait un match EXACT (`/ws/chat`) et rejetterait `/ws/chat/<id>`.
// Le handler de connexion valide lui-même le chemin (courseId) et le token.
const wss = new WebSocketServer({ server });

// Map courseId → Set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

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
        if (!rooms.has(courseId)) rooms.set(courseId, new Set());
        rooms.get(courseId)!.add(ws);

        ws.on('close', () => {
            rooms.get(courseId)?.delete(ws);
            if (rooms.get(courseId)?.size === 0) rooms.delete(courseId);
        });

        ws.on('error', () => ws.close());
    } catch {
        ws.close(1011, 'Erreur serveur');
    }
});

// Broadcast helper used by the chat route
export function broadcastChatMessage(courseId: string, message: object) {
    const clients = rooms.get(courseId);
    if (!clients) return;
    const payload = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
}

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
        await sendPushNotification(bon.push_token, 'Bon expire dans 7 jours', `${bon.nom_offre} expire le ${dateStr} à ${heureStr}.`).catch(() => {});
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
        await sendPushNotification(bon.push_token, 'Bon expire DEMAIN', `${bon.nom_offre} expire demain à ${heureStr} exactement !`).catch(() => {});
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

// Facturation Stripe — cycle lundi 01h00 / 13h00 / mardi 01h00
const billingRan = new Set<string>();

async function runBillingCycle() {
    const now = new Date();
    const day = now.getDay(); // 0=dim, 1=lun, 2=mar
    const hour = now.getHours();

    // Lundi 01h00 — génération des factures
    const keyGen = `gen-${now.toISOString().slice(0, 10)}`;
    if (day === 1 && hour === 1 && !billingRan.has(keyGen)) {
        billingRan.add(keyGen);
        await generateWeeklyInvoices();
    }

    // Lundi 13h00 — relance push
    const keyRelance = `relance-${now.toISOString().slice(0, 10)}`;
    if (day === 1 && hour === 13 && !billingRan.has(keyRelance)) {
        billingRan.add(keyRelance);
        await sendBillingReminders();
    }

    // Mardi 01h00 — suspension des impayés
    const keySuspend = `suspend-${now.toISOString().slice(0, 10)}`;
    if (day === 2 && hour === 1 && !billingRan.has(keySuspend)) {
        billingRan.add(keySuspend);
        await suspendUnpaidChauffeurs();
    }
}

async function generateWeeklyInvoices() {
    // CA de la semaine passée (lundi 00:00 → dimanche 23:59)
    const chauffeurs = await query(`
        SELECT
            c.id,
            c.stripe_customer_id,
            c.taux_commission_override,
            u.prenom,
            u.nom,
            COALESCE(SUM(co.montant), 0) AS ca_semaine
        FROM chauffeurs c
        JOIN utilisateurs u ON u.id = c.utilisateur_id
        LEFT JOIN courses co ON co.chauffeur_id = c.id
            AND co.statut = 'terminee'
            AND co.code_valide_at >= date_trunc('week', now() - interval '7 days')
            AND co.code_valide_at < date_trunc('week', now())
        WHERE c.stripe_customer_id IS NOT NULL
          AND u.statut = 'actif'
        GROUP BY c.id, c.stripe_customer_id, c.taux_commission_override, u.prenom, u.nom
        HAVING COALESCE(SUM(co.montant), 0) > 0
    `);

    for (const ch of chauffeurs.rows) {
        const taux = Number(ch.taux_commission_override ?? 20);
        const frais = Math.round(Number(ch.ca_semaine) * taux / 100 * 100); // centimes
        if (frais <= 0) continue;

        const weekLabel = new Date(Date.now() - 7 * 24 * 3600 * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });

        try {
            await stripe.invoiceItems.create({
                customer: ch.stripe_customer_id,
                amount: frais,
                currency: 'eur',
                description: `Frais SÉSAME — semaine du ${weekLabel}`,
            }, { idempotencyKey: `sesame-${ch.id}-${weekLabel}` });

            const invoice = await stripe.invoices.create({
                customer: ch.stripe_customer_id,
                auto_advance: true,
                collection_method: 'charge_automatically',
            }, { idempotencyKey: `sesame-inv-${ch.id}-${weekLabel}` });

            await stripe.invoices.finalizeInvoice(invoice.id);
        } catch { /* Non bloquant — sera relancé */ }
    }
}

async function sendBillingReminders() {
    const result = await query(`
        SELECT c.push_token
        FROM chauffeurs c
        JOIN utilisateurs u ON u.id = c.utilisateur_id
        WHERE u.statut = 'actif'
          AND c.push_token IS NOT NULL
          AND c.stripe_customer_id IS NOT NULL
    `);

    for (const ch of result.rows) {
        await sendPushNotification(
            ch.push_token,
            'Facture SÉSAME en attente',
            'Réglez votre facture avant demain 01h00 pour éviter la suspension.',
            { type: 'billing_reminder' }
        ).catch(() => {});
    }
}

async function suspendUnpaidChauffeurs() {
    // Chauffeurs avec factures Stripe ouvertes (non payées)
    const result = await query(`
        SELECT c.id, c.stripe_customer_id, c.push_token
        FROM chauffeurs c
        JOIN utilisateurs u ON u.id = c.utilisateur_id
        WHERE u.statut = 'actif'
          AND c.stripe_customer_id IS NOT NULL
    `);

    for (const ch of result.rows) {
        try {
            const invoices = await stripe.invoices.list({
                customer: ch.stripe_customer_id,
                status: 'open',
                limit: 1,
            });
            if (invoices.data.length === 0) continue;

            await query(
                `UPDATE utilisateurs SET statut = 'suspendu'
                 FROM chauffeurs c
                 WHERE c.utilisateur_id = utilisateurs.id AND c.id = $1`,
                [ch.id]
            );

            if (ch.push_token) {
                await sendPushNotification(
                    ch.push_token,
                    'Compte suspendu',
                    'Facture impayée. Réglez via l\'app pour réactiver votre compte.',
                    { type: 'account_suspended' }
                ).catch(() => {});
            }
        } catch { /* Non bloquant */ }
    }
}

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
        ).catch(() => {}); // table créée via migration ci-dessous
    }
}

setInterval(() => runCommissionsMoraux().catch(() => {}), 30 * 60 * 1000);

async function runMigrations() {
    const migrations = [
        `ALTER TABLE ambassadeurs ADD COLUMN IF NOT EXISTS note_interne text`,
        `ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS note_interne text`,
        `ALTER TABLE ambassadeurs ADD COLUMN IF NOT EXISTS contrat_moral_signe boolean DEFAULT false`,
        `ALTER TABLE ambassadeurs ADD COLUMN IF NOT EXISTS contrat_moral_signe_at timestamptz`,
        `ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS taux_commission_override numeric`,
        `ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS documents_valides boolean DEFAULT false`,
        // Position temps réel du chauffeur (specs §7.2 + §9.2) — pour l'ETA live côté Ambassadeur
        `ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS derniere_lat double precision`,
        `ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS derniere_lon double precision`,
        `ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS position_maj_at timestamptz`,
        `ALTER TABLE documents_chauffeur ADD COLUMN IF NOT EXISTS motif_refus text`,
        `CREATE TABLE IF NOT EXISTS parrainage_paliers (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            filleul_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
            parrain_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
            cle varchar(20) NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            UNIQUE(filleul_id, cle)
        )`,
        `CREATE TABLE IF NOT EXISTS blacklist_propositions (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            ambassadeur_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE UNIQUE,
            motif text NOT NULL,
            nb_annulations integer NOT NULL DEFAULT 0,
            statut varchar(30) NOT NULL DEFAULT 'en_attente_admin',
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )`,
        `CREATE TABLE IF NOT EXISTS commissions_moraux (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            ambassadeur_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
            montant numeric(10,2) NOT NULL,
            ca_mois numeric(10,2) NOT NULL,
            taux numeric(5,2) NOT NULL,
            mois_reference varchar(50) NOT NULL,
            statut varchar(20) NOT NULL DEFAULT 'en_attente',
            created_at timestamptz NOT NULL DEFAULT now(),
            vire_at timestamptz
        )`,
    ];
    for (const sql of migrations) {
        await query(sql).catch(e => console.warn('[migration]', e.message));
    }
}

runMigrations().then(() => {
    server.listen(port, () => {
        console.log(`SESAME backend running on http://localhost:${port}`);
        console.log(`WebSocket available on ws://localhost:${port}/ws/chat/:courseId`);
    });
});
