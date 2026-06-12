import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import jwt from 'jsonwebtoken';
import 'express-async-errors';
import { query } from './db';
import { JWT_SECRET, IS_PROD } from './config';
import authRoutes from './routes/auth';
import ambassadeursRoutes from './routes/ambassadeurs';
import coursesRoutes from './routes/courses';
import boutiqueRoutes from './routes/boutique';
import echangesRoutes from './routes/echanges';
import fournisseursRoutes from './routes/fournisseurs';
import chatRoutes from './routes/chat';
import chauffeursRoutes from './routes/chauffeurs';
import adminRoutes from './routes/admin';
import stripeWebhookRoutes from './routes/stripeWebhook';
import yousignWebhookRoutes from './routes/yousignWebhook';
import { requireAuth } from './middleware/auth';
import { authLimiter, adminLimiter, inscriptionLimiter } from './middleware/rateLimit';

const app = express();

// Derrière un proxy (Railway/Render/Vercel) : nécessaire pour obtenir la vraie IP (rate-limit).
app.set('trust proxy', 1);

// Routes silencieuses (polling fréquent — inutile de loguer)
const SILENT_ROUTES = ['/api/admin/dashboard', '/api/admin/alertes'];

// En-têtes de sécurité HTTP. CSP désactivée car la page fournisseur est un HTML autonome avec styles inline.
app.use(helmet({ contentSecurityPolicy: false }));

// CORS : restreint aux origines déclarées (CORS_ORIGINS="https://a.com,https://b.com").
// Sans la variable → toutes origines (pratique en dev ; à définir en prod).
const corsOrigins = process.env.CORS_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean);
if (IS_PROD && !(corsOrigins && corsOrigins.length)) {
    console.warn(
        '[SÉCURITÉ] CORS_ORIGINS non défini en production : toutes les origines sont acceptées. ' +
        'Définissez CORS_ORIGINS="https://votre-admin.com,https://..." pour restreindre.'
    );
}
app.use(cors(corsOrigins && corsOrigins.length ? { origin: corsOrigins } : {}));

app.use((req, _res, next) => {
    if (SILENT_ROUTES.includes(req.path)) { next(); return; }

    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) {
        try {
            const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
            if (payload.role === 'admin') {
                console.log(`[${req.method}] ${req.path} — [ADMIN]`);
            } else if (payload.sub) {
                // En prod : ne pas loguer les données personnelles (PII).
                if (IS_PROD) {
                    console.log(`[${req.method}] ${req.path} — [user ${payload.sub}]`);
                } else {
                    query(
                        `SELECT u.prenom, u.nom, u.type, u.email FROM utilisateurs u WHERE u.id = $1`,
                        [payload.sub]
                    ).then(r => {
                        const u = r.rows[0];
                        if (u) {
                            const role = u.type === 'chauffeur' ? '[CHAUFFEUR]' : '[AMBASSADEUR]';
                            console.log(`[${req.method}] ${req.path} — ${role} ${u.prenom} ${u.nom} (${u.email})`);
                        }
                    }).catch(() => {});
                }
            }
        } catch {
            console.log(`[${req.method}] ${req.path} — [token invalide]`);
        }
    } else {
        console.log(`[${req.method}] ${req.path} — anonyme`);
    }
    next();
});
// Webhooks (corps brut requis pour vérifier les signatures) — enregistrés avant express.json()
app.use('/api/stripe', stripeWebhookRoutes);
app.use('/api/yousign', yousignWebhookRoutes);
app.use(express.json());

// Anti-brute-force sur les points d'authentification sensibles.
app.use('/api/auth/connexion', authLimiter);
app.use('/api/auth/mot-de-passe-oublie', authLimiter);
app.use('/api/auth/reinitialiser-mot-de-passe', authLimiter);
// Anti-spam sur la création de comptes.
app.use('/api/auth/inscription', inscriptionLimiter);
app.use('/api/auth', authRoutes);
// Anti-brute-force sur le login admin (compte le plus privilégié).
app.use('/api/admin/login', adminLimiter);
// Routes mobiles protégées : un token utilisateur valide est obligatoire (401 sinon).
app.use('/api/ambassadeurs', requireAuth, ambassadeursRoutes);
app.use('/api/courses', requireAuth, coursesRoutes);
app.use('/api/boutique', requireAuth, boutiqueRoutes);
// echanges : /info reste public (page web fournisseur) → requireAuth posé route par route dans le routeur.
app.use('/api/echanges', echangesRoutes);
// fournisseurs : public (page web fournisseur, sans login).
app.use('/api/fournisseurs', fournisseursRoutes);
app.use('/api/chat', requireAuth, chatRoutes);
app.use('/api/chauffeurs', requireAuth, chauffeursRoutes);
app.use('/api/admin', adminRoutes);

// Paramètres publics lisibles par l'app mobile (sans auth admin)
app.get('/api/app/parametres', async (_req, res) => {
    const result = await query(
        `SELECT cle, valeur FROM parametres_systeme WHERE cle = ANY($1)`,
        [['mode_course_immediate']]
    );
    const p: Record<string, string> = {};
    result.rows.forEach((r: any) => { p[r.cle] = r.valeur; });
    res.json(p);
});

app.get('/valider', (req, res) => {
    res.sendFile(path.join(__dirname, '../../web/fournisseur/index.html'));
});

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    const status = err.status || 500;
    // En prod, ne pas divulguer les détails internes pour une erreur 500.
    const message = IS_PROD && status >= 500 ? 'Erreur serveur' : (err.message || 'Internal server error');
    res.status(status).json({ error: message });
});

export default app;
