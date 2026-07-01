import { generateWeeklyInvoices, sendBillingReminders, suspendUnpaidChauffeurs, runBillingCycle } from '../../src/lib/billing';
import { stripe } from '../../src/lib/stripeClient';
import { sendPushNotification } from '../../src/lib/pushNotifications';
import { registerChauffeur, query } from '../helpers/api';

// Facturation Stripe hebdomadaire (specs §7.1) — le cœur « argent » qui prélève les 20 %
// et suspend les impayés. Stripe est mocké (setupAfterEnv), la base est réelle.

// Crée une course terminée + validée la semaine PASSÉE (fenêtre du cron) pour un chauffeur.
async function courseSemainePassee(chauffeurId: string, montant: number) {
    await query(
        `INSERT INTO courses(chauffeur_id, statut, adresse_depart, adresse_destination, montant, code_valide_at)
         VALUES ($1, 'terminee', 'A', 'B', $2, date_trunc('week', now()) - interval '2 days')`,
        [chauffeurId, montant]
    );
}

describe('generateWeeklyInvoices — prélèvement des frais SÉSAME', () => {
    it('facture CA × taux (20% par défaut) en centimes', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_bill' WHERE id=$1", [chf.chauffeur_id]);
        await courseSemainePassee(chf.chauffeur_id!, 100); // CA 100 € → frais 20 € = 2000 centimes

        await generateWeeklyInvoices();

        expect(stripe.invoiceItems.create).toHaveBeenCalledTimes(1);
        expect((stripe.invoiceItems.create as jest.Mock).mock.calls[0][0]).toMatchObject({ amount: 2000, currency: 'eur' });
        expect(stripe.invoices.create).toHaveBeenCalled();
        expect(stripe.invoices.finalizeInvoice).toHaveBeenCalled();
    });

    it('applique le taux override individuel du chauffeur', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_o', taux_commission_override=10 WHERE id=$1", [chf.chauffeur_id]);
        await courseSemainePassee(chf.chauffeur_id!, 100); // 100 € × 10% = 1000 centimes

        await generateWeeklyInvoices();
        expect((stripe.invoiceItems.create as jest.Mock).mock.calls[0][0]).toMatchObject({ amount: 1000 });
    });

    it('utilise une clé d\'idempotence (anti double-facture)', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_idem' WHERE id=$1", [chf.chauffeur_id]);
        await courseSemainePassee(chf.chauffeur_id!, 50);

        await generateWeeklyInvoices();
        const opts = (stripe.invoiceItems.create as jest.Mock).mock.calls[0][1];
        expect(opts.idempotencyKey).toContain(chf.chauffeur_id);
    });

    it('ne facture pas un chauffeur sans carte Stripe', async () => {
        const chf = await registerChauffeur();
        await query('UPDATE chauffeurs SET stripe_customer_id=NULL WHERE id=$1', [chf.chauffeur_id]);
        await courseSemainePassee(chf.chauffeur_id!, 100);

        await generateWeeklyInvoices();
        expect(stripe.invoiceItems.create).not.toHaveBeenCalled();
    });

    it('ne facture pas un chauffeur sans CA la semaine passée', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_noca' WHERE id=$1", [chf.chauffeur_id]);
        // Course de CETTE semaine (hors fenêtre) → ne compte pas
        await query(
            `INSERT INTO courses(chauffeur_id, statut, adresse_depart, adresse_destination, montant, code_valide_at)
             VALUES ($1,'terminee','A','B',100, now())`,
            [chf.chauffeur_id]
        );

        await generateWeeklyInvoices();
        expect(stripe.invoiceItems.create).not.toHaveBeenCalled();
    });

    it('échec Stripe sur un chauffeur → non bloquant (avale l\'erreur)', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_err' WHERE id=$1", [chf.chauffeur_id]);
        await courseSemainePassee(chf.chauffeur_id!, 100);
        (stripe.invoiceItems.create as jest.Mock).mockRejectedValueOnce(new Error('card_declined'));

        await expect(generateWeeklyInvoices()).resolves.toBeUndefined();
    });
});

describe('sendBillingReminders', () => {
    it('relance par push les chauffeurs actifs avec carte', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_r', push_token='ExpoR' WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();

        await sendBillingReminders();
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'billing_reminder')).toBe(true);
    });

    it('ne relance pas un chauffeur sans push_token', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_np', push_token=NULL WHERE id=$1", [chf.chauffeur_id]);
        (sendPushNotification as jest.Mock).mockClear();

        await sendBillingReminders();
        expect(sendPushNotification).not.toHaveBeenCalled();
    });
});

describe('suspendUnpaidChauffeurs — suspension des impayés', () => {
    it('suspend le chauffeur dont la facture a été tentée et a échoué (attempt_count ≥ 1)', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_imp', push_token='ExpoS' WHERE id=$1", [chf.chauffeur_id]);
        (stripe.invoices.list as jest.Mock).mockResolvedValueOnce({ data: [{ attempt_count: 1 }] });
        (sendPushNotification as jest.Mock).mockClear();

        await suspendUnpaidChauffeurs();

        const u = await query('SELECT statut FROM utilisateurs WHERE id=$1', [chf.userId]);
        expect(u.rows[0].statut).toBe('suspendu');
        expect((sendPushNotification as jest.Mock).mock.calls.some((c: any[]) => c[3]?.type === 'account_suspended')).toBe(true);
    });

    it('ne suspend PAS si le prélèvement n\'a pas encore été tenté (attempt_count = 0, anti-race)', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_wait' WHERE id=$1", [chf.chauffeur_id]);
        (stripe.invoices.list as jest.Mock).mockResolvedValueOnce({ data: [{ attempt_count: 0 }] });

        await suspendUnpaidChauffeurs();

        const u = await query('SELECT statut FROM utilisateurs WHERE id=$1', [chf.userId]);
        expect(u.rows[0].statut).toBe('actif');
    });

    it('ne suspend pas sans facture ouverte', async () => {
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_ok' WHERE id=$1", [chf.chauffeur_id]);
        (stripe.invoices.list as jest.Mock).mockResolvedValueOnce({ data: [] });

        await suspendUnpaidChauffeurs();
        const u = await query('SELECT statut FROM utilisateurs WHERE id=$1', [chf.userId]);
        expect(u.rows[0].statut).toBe('actif');
    });
});

describe('runBillingCycle — aiguillage horaire', () => {
    // On ne fake QUE l'horloge (Date) — pas setTimeout & co, sinon les requêtes pg se bloquent.
    const NO_TIMERS = ['setTimeout', 'setInterval', 'setImmediate', 'clearTimeout', 'clearInterval',
        'clearImmediate', 'nextTick', 'queueMicrotask', 'hrtime', 'performance',
        'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback'];
    afterEach(() => jest.useRealTimers());

    it('lundi 01h → déclenche la génération des factures', async () => {
        // 2026-06-01 est un lundi
        jest.useFakeTimers({ now: new Date('2026-06-01T01:30:00'), doNotFake: NO_TIMERS as any });
        const chf = await registerChauffeur();
        await query("UPDATE chauffeurs SET stripe_customer_id='cus_cycle' WHERE id=$1", [chf.chauffeur_id]);
        await courseSemainePassee(chf.chauffeur_id!, 80);
        (stripe.invoiceItems.create as jest.Mock).mockClear();

        await runBillingCycle();
        expect(stripe.invoiceItems.create).toHaveBeenCalled();
    });

    it('hors créneau (mercredi) → ne facture rien', async () => {
        jest.useFakeTimers({ now: new Date('2026-06-03T10:00:00'), doNotFake: NO_TIMERS as any }); // mercredi
        (stripe.invoiceItems.create as jest.Mock).mockClear();
        await runBillingCycle();
        expect(stripe.invoiceItems.create).not.toHaveBeenCalled();
    });
});
