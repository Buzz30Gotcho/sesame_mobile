import { query } from '../db';
import { sendPushNotification } from './pushNotifications';
import { stripe } from './stripeClient';

// ─── Facturation Stripe hebdomadaire (specs §7.1) ─────────────────────────────
// Extrait d'index.ts pour être importable/testable sans démarrer le serveur ni les
// crons (même motif que ws/chatHub.ts). index.ts ne fait plus qu'appeler runBillingCycle
// dans un setInterval. Comportement en prod inchangé.
//
// Cycle : lundi 01h00 = génération des factures (frais SÉSAME = CA semaine × taux),
//         lundi 13h00 = relance push, mardi 01h00 = suspension des impayés.

const billingRan = new Set<string>();

export async function runBillingCycle(): Promise<void> {
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

export async function generateWeeklyInvoices(): Promise<void> {
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
        } catch (err) {
            // Non bloquant — sera relancé au prochain cycle. On loggue pour pouvoir diagnostiquer
            // (carte refusée, customer supprimé, clé Stripe invalide…).
            console.error(`[billing] Échec génération facture chauffeur ${ch.id}:`, (err as Error).message);
        }
    }
}

export async function sendBillingReminders(): Promise<void> {
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

export async function suspendUnpaidChauffeurs(): Promise<void> {
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
                limit: 10,
            });
            // Anti-race : ne suspendre que si le prélèvement automatique a réellement été
            // tenté au moins une fois et a échoué (attempt_count >= 1). Une facture juste
            // finalisée dont la charge est encore en cours a attempt_count = 0 → on attend.
            const impayee = invoices.data.some(inv => (inv.attempt_count ?? 0) >= 1);
            if (!impayee) continue;

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
        } catch (err) {
            console.error(`[billing] Échec contrôle/suspension chauffeur ${ch.id}:`, (err as Error).message);
        }
    }
}
