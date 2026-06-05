import 'dotenv/config';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app';
import { query } from './db';
import { sendPushNotification } from './lib/pushNotifications';
import { stripe } from './lib/stripeClient';

const port = process.env.PORT || 4000;

const server = http.createServer(app);

// WebSocket server — /ws/chat/:courseId
const wss = new WebSocketServer({ server, path: '/ws/chat' });

// Map courseId → Set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
    const courseId = req.url?.split('/ws/chat/')[1] ?? '';
    if (!courseId) { ws.close(); return; }

    if (!rooms.has(courseId)) rooms.set(courseId, new Set());
    rooms.get(courseId)!.add(ws);

    ws.on('close', () => {
        rooms.get(courseId)?.delete(ws);
        if (rooms.get(courseId)?.size === 0) rooms.delete(courseId);
    });

    ws.on('error', () => ws.close());
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

server.listen(port, () => {
    console.log(`SESAME backend running on http://localhost:${port}`);
    console.log(`WebSocket available on ws://localhost:${port}/ws/chat/:courseId`);
});
