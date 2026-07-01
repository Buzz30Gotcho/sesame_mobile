// Mocke les I/O externes (Stripe, mail, push, Yousign, réseau HTTP), neutralise le
// rate-limiting et réinitialise la base de test entre chaque test.
// La base est un vrai Postgres (conteneur Docker) géré par globalSetup/globalTeardown.

// ─── Rate-limiting désactivé en test (sinon 429 après quelques requêtes) ─────
jest.mock('../src/middleware/rateLimit', () => {
    const passthrough = (_req: any, _res: any, next: any) => next();
    return {
        authLimiter: passthrough,
        adminLimiter: passthrough,
        codeLimiter: passthrough,
        inscriptionLimiter: passthrough,
        fournisseurLimiter: passthrough,
    };
});

// ─── Stripe (aucun appel réseau) ─────────────────────────────────────────────
jest.mock('../src/lib/stripeClient', () => ({
    stripe: {
        customers: {
            create: jest.fn().mockResolvedValue({ id: 'cus_test' }),
            retrieve: jest.fn().mockResolvedValue({ id: 'cus_test', invoice_settings: {} }),
            update: jest.fn().mockResolvedValue({ id: 'cus_test' }),
        },
        checkout: {
            sessions: { create: jest.fn().mockResolvedValue({ id: 'cs_test', url: 'https://stripe.test/checkout' }) },
        },
        setupIntents: {
            retrieve: jest.fn().mockResolvedValue({ id: 'seti_test', payment_method: 'pm_test', status: 'succeeded' }),
        },
        billingPortal: {
            sessions: { create: jest.fn().mockResolvedValue({ url: 'https://stripe.test/portal' }) },
        },
        invoices: {
            create: jest.fn().mockResolvedValue({ id: 'in_test' }),
            finalizeInvoice: jest.fn().mockResolvedValue({ id: 'in_test', status: 'open' }),
            list: jest.fn().mockResolvedValue({ data: [] }),
        },
        invoiceItems: { create: jest.fn().mockResolvedValue({ id: 'ii_test' }) },
        // Pour les tests de webhook : pas de vérification de signature, on parse le corps brut
        // (Buffer fourni par express.raw, ou chaîne) en événement Stripe.
        webhooks: {
            constructEvent: jest.fn((body: any) => {
                if (Buffer.isBuffer(body)) return JSON.parse(body.toString('utf8'));
                if (typeof body === 'string') return JSON.parse(body);
                return body;
            }),
        },
    },
}));

// ─── E-mail (Resend / nodemailer) ────────────────────────────────────────────
jest.mock('../src/lib/mailer', () => ({
    sendEmail: jest.fn().mockResolvedValue(undefined),
    sendResetEmail: jest.fn().mockResolvedValue(undefined),
    sendCodeSecretFournisseur: jest.fn().mockResolvedValue(undefined),
}));

// ─── Notifications push (Firebase) ───────────────────────────────────────────
jest.mock('../src/lib/pushNotifications', () => ({
    sendPushNotification: jest.fn().mockResolvedValue(undefined),
}));

// ─── Yousign (signature contrat) ─────────────────────────────────────────────
jest.mock('../src/lib/yousignClient', () => ({
    isYousignConfigured: jest.fn(() => false),
    envoyerContratFournisseur: jest.fn().mockResolvedValue({ signatureRequestId: 'sr_test', signerUrl: 'https://yousign.test/sign' }),
}));

// ─── Réseau HTTP (géocodage BAN, distance OSRM, ETA TomTom) ───────────────────
// Réponses déterministes : Paris pour toute adresse, 10 km / 15 min pour toute route.
function jsonResponse(payload: unknown) {
    return { ok: true, status: 200, json: async () => payload } as unknown as Response;
}
beforeEach(() => {
    (global as any).fetch = jest.fn(async (input: any) => {
        const url = String(input);
        if (url.includes('api-adresse.data.gouv.fr')) {
            return jsonResponse({ features: [{ geometry: { coordinates: [2.3522, 48.8566] } }] });
        }
        if (url.includes('/route/v1/driving/')) {
            return jsonResponse({ code: 'Ok', routes: [{ distance: 10000, duration: 900 }] });
        }
        if (url.includes('api.tomtom.com')) {
            return jsonResponse({ routes: [{ summary: { travelTimeInSeconds: 900 } }] });
        }
        return jsonResponse({});
    });
});

// ─── Reset de la base entre chaque test (TRUNCATE, seed paramètres conservé) ──
afterEach(async () => {
    await require('./helpers/db').resetDb();
});

// Ferme le pool Postgres à la fin de la suite (sortie propre, pas de handle ouvert).
afterAll(async () => {
    await require('./helpers/db').pool.end();
});
