import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomInt, timingSafeEqual } from 'crypto';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { query } from '../db';
import { sendPushNotification } from '../lib/pushNotifications';
import { getSystemParameter } from '../lib/params';

import { JWT_SECRET } from '../config';
import { isYousignConfigured, envoyerContratFournisseur } from '../lib/yousignClient';
import { generateContractPdf } from '../lib/contractPdf';
import { genererSepaXml } from '../lib/sepaXml';
import { sendCodeSecretFournisseur } from '../lib/mailer';
import { siretValide, ibanValide, telephoneValide, emailValide } from '../lib/validation';
import { nextAmbassadorLevel } from '../lib/rules';

const router = express.Router();

// UUID sentinelle pour l'attribution des actions admin (compte admin unique partagé — pas d'id par opérateur).
const ADMIN_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

// Signe une URL temporaire (1h) pour un fichier KYC chauffeur stocké sur Supabase Storage.
// Renvoie null si pas de chemin ou en cas d'échec (l'appelant gère l'absence d'image).
async function signKycUrl(storagePath: string | null): Promise<string | null> {
    if (!storagePath) return null;
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const BUCKET = 'documents-kyc_sesame_chauffeur';
    try {
        const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiresIn: 3600 }),
        });
        if (!r.ok) return null;
        const { signedURL } = await r.json() as { signedURL: string };
        const path = signedURL.startsWith('/storage/v1') ? signedURL : `/storage/v1${signedURL}`;
        return `${SUPABASE_URL}${path}`;
    } catch { return null; }
}

// Comparaison à temps constant (évite la fuite d'information par timing). Le différentiel de longueur
// reste observable mais n'aide pas à retrouver le secret.
function safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
}

// ─── IP whitelist admin (specs §5.4) ──────────────────────────────────────────
// Liste lue depuis parametres_systeme (admin_ip_whitelist), mise en cache 60s pour éviter
// un hit DB par requête. Vide = toutes les IP autorisées.
let ipCache: { list: string[]; at: number } = { list: [], at: 0 };
async function getIpWhitelist(): Promise<string[]> {
    if (Date.now() - ipCache.at < 60000) return ipCache.list;
    const raw = await getSystemParameter('admin_ip_whitelist', '');
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);
    ipCache = { list, at: Date.now() };
    return list;
}
// Normalise les variantes IPv6 de localhost / mappées IPv4.
function normalizeIp(ip: string): string {
    return ip.replace(/^::ffff:/, '').replace('::1', '127.0.0.1');
}
async function checkAdminIp(req: express.Request, res: express.Response): Promise<boolean> {
    const list = await getIpWhitelist();
    if (list.length === 0) return true; // pas de restriction
    const ip = normalizeIp(req.ip || '');
    if (list.map(normalizeIp).includes(ip)) return true;
    res.status(403).json({ error: 'Accès refusé depuis cette adresse IP.' });
    return false;
}

// Login admin
router.post('/login', async (req, res) => {
    if (!(await checkAdminIp(req, res))) return;
    const { email, password, code } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    const adminPasswordPlain = process.env.ADMIN_PASSWORD; // legacy (clair) — toléré le temps de migrer
    if (!adminEmail || (!adminPasswordHash && !adminPasswordPlain)) {
        console.error('[admin/login] ADMIN_EMAIL ou ADMIN_PASSWORD_HASH non défini — login admin désactivé.');
        return res.status(500).json({ error: 'Configuration serveur incomplète' });
    }
    // 1) Compte fondateur via .env (bootstrap anti-lockout) → toujours super_admin.
    const emailOk = safeEqual(email, adminEmail);
    const passwordOk = adminPasswordHash
        ? await bcrypt.compare(password, adminPasswordHash)
        : safeEqual(password, adminPasswordPlain as string);
    let adminRole: string | null = emailOk && passwordOk ? 'super_admin' : null;
    const isEnvAdmin = adminRole === 'super_admin';

    // 2) Sinon, compte additionnel en base (table admins) avec son rôle.
    if (!adminRole) {
        const acc = await query('SELECT password_hash, role FROM admins WHERE email = $1 AND actif = true', [email]);
        if (acc.rows.length && await bcrypt.compare(password, acc.rows[0].password_hash)) {
            adminRole = acc.rows[0].role;
        }
    }
    if (!adminRole) return res.status(401).json({ error: 'Identifiants incorrects' });

    // 2FA (specs §5.4) : seulement pour le compte fondateur (.env), qui configure la 2FA.
    if (isEnvAdmin) {
        const sec = await query('SELECT totp_secret, totp_enabled FROM admin_securite WHERE id = 1');
        const row = sec.rows[0];
        if (row?.totp_enabled && row.totp_secret) {
            if (!code) return res.status(401).json({ error: 'Code 2FA requis', require2fa: true });
            if (!authenticator.check(String(code), row.totp_secret)) {
                return res.status(401).json({ error: 'Code 2FA incorrect', require2fa: true });
            }
        }
    }
    const dureeH = await getSystemParameter('session_duree_heures', 4);
    const token = jwt.sign({ sub: 'admin', role: 'admin', adminRole }, JWT_SECRET, { expiresIn: `${dureeH}h` });
    res.json({ token, adminRole });
});

// Étend Request avec le rôle admin résolu depuis le token.
interface AdminReq extends express.Request { adminRole?: string }

// Middleware — protège toutes les routes admin suivantes (+ IP whitelist)
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
    try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET) as any;
        if (payload.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
        (req as AdminReq).adminRole = payload.adminRole || 'super_admin'; // anciens tokens = super_admin
        if (!(await checkAdminIp(req, res))) return;
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

router.use(requireAdmin);

// ─── Permissions par rôle (specs §5.4) ─────────────────────────────────────────
// lecteur  : lecture seule (aucune écriture).
// operateur: opérationnel, mais PAS les zones réservées au fondateur (réglages, comptes, argent, 2FA).
// super_admin : tout.
const SUPER_ONLY_PREFIXES = ['/parametres', '/admins', '/2fa', '/sepa', '/commissions/declencher'];
router.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const role = (req as AdminReq).adminRole;
    if (req.method === 'GET' || role === 'super_admin') return next();
    if (role === 'lecteur') {
        return res.status(403).json({ error: 'Accès en lecture seule (rôle Lecteur).' });
    }
    if (role === 'operateur' && SUPER_ONLY_PREFIXES.some(p => req.path.startsWith(p))) {
        return res.status(403).json({ error: 'Action réservée au Super admin.' });
    }
    next();
});

// ─── 2FA admin (specs §5.4) ────────────────────────────────────────────────────
// Statut de la 2FA.
router.get('/2fa/status', async (req, res) => {
    const r = await query('SELECT totp_enabled FROM admin_securite WHERE id = 1');
    res.json({ enabled: !!r.rows[0]?.totp_enabled });
});

// Démarre l'enrôlement : génère un secret (non encore activé) + renvoie le QR à scanner.
router.post('/2fa/setup', async (req, res) => {
    const secret = authenticator.generateSecret();
    const adminEmail = process.env.ADMIN_EMAIL || 'admin';
    const otpauth = authenticator.keyuri(adminEmail, 'SESAME Admin', secret);
    await query('UPDATE admin_securite SET totp_secret = $1, totp_enabled = false, updated_at = now() WHERE id = 1', [secret]);
    const qrDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ qr: qrDataUrl, secret });
});

// Active la 2FA après vérification d'un 1er code (preuve que le scan a réussi).
router.post('/2fa/activate', async (req, res) => {
    const { code } = req.body;
    const r = await query('SELECT totp_secret FROM admin_securite WHERE id = 1');
    const secret = r.rows[0]?.totp_secret;
    if (!secret) return res.status(400).json({ error: 'Aucun secret en attente. Relancez la configuration.' });
    if (!code || !authenticator.check(String(code), secret)) {
        return res.status(400).json({ error: 'Code incorrect. Vérifiez l\'heure de votre téléphone et réessayez.' });
    }
    await query('UPDATE admin_securite SET totp_enabled = true, updated_at = now() WHERE id = 1');
    res.json({ success: true });
});

// Désactive la 2FA (exige un code valide pour éviter une désactivation par session volée).
router.post('/2fa/disable', async (req, res) => {
    const { code } = req.body;
    const r = await query('SELECT totp_secret, totp_enabled FROM admin_securite WHERE id = 1');
    const row = r.rows[0];
    if (!row?.totp_enabled) return res.json({ success: true });
    if (!code || !authenticator.check(String(code), row.totp_secret)) {
        return res.status(400).json({ error: 'Code 2FA requis pour désactiver.' });
    }
    await query('UPDATE admin_securite SET totp_secret = NULL, totp_enabled = false, updated_at = now() WHERE id = 1');
    res.json({ success: true });
});

// ─── Comptes admin & rôles (specs §5.4) ────────────────────────────────────────
// Réservé au Super admin (chemin /admins protégé par le middleware de permissions pour les écritures ;
// on protège aussi la lecture ici car la liste des comptes est sensible).
const ADMIN_ROLES = ['super_admin', 'operateur', 'lecteur'];

router.get('/admins', async (req, res) => {
    if ((req as AdminReq).adminRole !== 'super_admin') return res.status(403).json({ error: 'Réservé au Super admin.' });
    const founder = process.env.ADMIN_EMAIL || null;
    const r = await query('SELECT id, email, nom, role, actif, created_at FROM admins ORDER BY created_at ASC');
    res.json({ fondateur: founder, comptes: r.rows });
});

router.post('/admins', async (req, res) => {
    const { email, password, nom, role } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis.' });
    if (!ADMIN_ROLES.includes(role)) return res.status(400).json({ error: `Rôle invalide (${ADMIN_ROLES.join(', ')}).` });
    if (String(password).length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min).' });
    if (process.env.ADMIN_EMAIL && safeEqual(email, process.env.ADMIN_EMAIL)) {
        return res.status(400).json({ error: 'Cet email est celui du compte fondateur.' });
    }
    const exists = await query('SELECT 1 FROM admins WHERE email = $1', [email]);
    if (exists.rows.length) return res.status(409).json({ error: 'Un compte avec cet email existe déjà.' });
    const hash = await bcrypt.hash(password, 10);
    const r = await query(
        'INSERT INTO admins (email, password_hash, nom, role) VALUES ($1,$2,$3,$4) RETURNING id, email, nom, role, actif, created_at',
        [email, hash, nom || null, role]
    );
    res.status(201).json(r.rows[0]);
});

router.put('/admins/:id', async (req, res) => {
    const { role, actif, password } = req.body;
    if (role !== undefined && !ADMIN_ROLES.includes(role)) return res.status(400).json({ error: 'Rôle invalide.' });
    if (password !== undefined && String(password).length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 caractères min).' });
    const sets: string[] = [];
    const vals: any[] = [];
    if (role !== undefined) { sets.push(`role = $${sets.length + 1}`); vals.push(role); }
    if (actif !== undefined) { sets.push(`actif = $${sets.length + 1}`); vals.push(!!actif); }
    if (password !== undefined) { sets.push(`password_hash = $${sets.length + 1}`); vals.push(await bcrypt.hash(password, 10)); }
    if (!sets.length) return res.status(400).json({ error: 'Rien à modifier.' });
    vals.push(req.params.id);
    const r = await query(`UPDATE admins SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING id`, vals);
    if (!r.rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ success: true });
});

router.delete('/admins/:id', async (req, res) => {
    const r = await query('DELETE FROM admins WHERE id = $1 RETURNING id', [req.params.id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Compte introuvable.' });
    res.json({ success: true });
});

router.get('/dashboard', async (req, res) => {
    const kpis = {
        totalCourses: (await query('SELECT count(*) FROM courses')).rows[0].count,
        totalAmbassadeurs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'ambassadeur'")).rows[0].count,
        totalChauffeurs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'chauffeur'")).rows[0].count,
        chauffeursActifs: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'chauffeur' AND statut = 'actif'")).rows[0].count,
        pendingExchanges: (await query("SELECT count(*) FROM echanges WHERE statut = 'en_attente_admin'")).rows[0].count,
        ambassadeursSuspendus: (await query("SELECT count(*) FROM utilisateurs WHERE type = 'ambassadeur' AND statut = 'suspendu'")).rows[0].count,
        kbis_expiring_soon: (await query(`
            SELECT count(*) FROM documents_chauffeur d
            JOIN chauffeurs c ON c.id = d.chauffeur_id
            JOIN utilisateurs u ON u.id = c.utilisateur_id
            WHERE d.type = 'kbis' AND d.statut = 'valide'
              AND d.date_expiration IS NOT NULL
              AND d.date_expiration::date <= (now() + interval '30 days')::date
              AND u.statut = 'actif'
        `)).rows[0].count,
        litigesOuverts: (await query("SELECT count(*) FROM litiges WHERE statut <> 'clos'")).rows[0].count,
        ticketsOuverts: (await query("SELECT count(*) FROM tickets WHERE statut <> 'resolu'")).rows[0].count,
        // Vue générale (specs §6.3) : CA + répartition courses + graphique 7 jours + top 5
        caBrut: Number(
            (await query(
                "SELECT COALESCE(SUM(montant), 0) AS s FROM courses WHERE statut = 'terminee' AND code_valide_at IS NOT NULL"
            )).rows[0].s
        ),
        coursesEnCours: Number(
            (await query("SELECT count(*) FROM courses WHERE statut NOT IN ('terminee', 'annulee')")).rows[0].count
        ),
        coursesTerminees: Number(
            (await query("SELECT count(*) FROM courses WHERE statut = 'terminee'")).rows[0].count
        ),
        coursesAnnulees: Number(
            (await query("SELECT count(*) FROM courses WHERE statut = 'annulee'")).rows[0].count
        ),
        coursesParJour: (await query(`
            SELECT to_char(d.jour, 'YYYY-MM-DD') AS date,
                   COUNT(c.id)::int AS count
            FROM generate_series(now()::date - interval '6 days', now()::date, interval '1 day') AS d(jour)
            LEFT JOIN courses c ON c.created_at::date = d.jour
            GROUP BY d.jour
            ORDER BY d.jour
        `)).rows,
        top5Ambassadeurs: (await query(`
            SELECT a.id::text AS id, u.prenom, u.nom,
                   a.points_solde AS points, a.type_ambassadeur::text AS type
            FROM ambassadeurs a
            JOIN utilisateurs u ON u.id = a.utilisateur_id
            ORDER BY a.points_solde DESC
            LIMIT 5
        `)).rows,
    };
    res.json(kpis);
});

router.get('/echanges/en-attente', async (req, res) => {
    const result = await query(
        `SELECT e.*,
                u.prenom AS ambassadeur_prenom,
                u.nom    AS ambassadeur_nom,
                o.nom    AS offre_nom
         FROM echanges e
         LEFT JOIN ambassadeurs a ON a.id = e.ambassadeur_id
         LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
         LEFT JOIN offres_boutique o ON o.id = e.offre_id
         WHERE e.statut = $1
         ORDER BY e.reference DESC`,
        ['en_attente_admin']
    );
    res.json(result.rows);
});

router.put('/echanges/:id/valider', async (req, res) => {
    const { id } = req.params;
    const exchangeResult = await query(
        `SELECT e.*, o.validite_bon_mois FROM echanges e
         JOIN offres_boutique o ON o.id = e.offre_id
         WHERE e.id = $1`, [id]
    );
    if (!exchangeResult.rows.length) return res.status(404).json({ error: 'Bon introuvable' });
    const exchange = exchangeResult.rows[0];
    const months = Number(exchange.validite_bon_mois || 1);

    // Atomique : remis_at = now(), expire_at = remis_at + validite_bon_mois (même heure/minute exacte)
    await query(
        `UPDATE echanges SET statut = 'valide', remis_at = now(), expire_at = now() + ($1 || ' month')::interval WHERE id = $2`,
        [months, id]
    );

    // Notification BON_VALIDE à l'ambassadeur
    try {
        const tokenResult = await query(
            `SELECT a.push_token, o.nom AS nom_offre
             FROM echanges e
             JOIN ambassadeurs a ON a.id = e.ambassadeur_id
             JOIN offres_boutique o ON o.id = e.offre_id
             WHERE e.id = $1`,
            [id]
        );
        const row = tokenResult.rows[0];
        if (row?.push_token) {
            await sendPushNotification(row.push_token, 'Bon cadeau disponible !', 'Votre QR code est prêt.', { echange_id: id });
        }
    } catch { /* Non bloquant */ }

    res.json({ success: true });
});

router.put('/echanges/:id/refuser', async (req, res) => {
    const { id } = req.params;
    const exchangeResult = await query('SELECT * FROM echanges WHERE id = $1', [id]);
    const exchange = exchangeResult.rows[0];
    if (!exchange) return res.status(404).json({ error: 'Bon introuvable' });
    await query('UPDATE echanges SET statut = $1 WHERE id = $2', ['refuse', id]);
    await query('UPDATE ambassadeurs SET points_solde = points_solde + $1 WHERE id = $2', [exchange.points_deduits, exchange.ambassadeur_id]);
    res.json({ success: true });
});

router.put('/courses/:id/annuler', async (req, res) => {
    const { id } = req.params;
    const { raison } = req.body;
    const check = await query('SELECT id, ambassadeur_id, chauffeur_id FROM courses WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(404).json({ error: 'Course introuvable' });
    await query(
        "UPDATE courses SET statut = 'annulee', date_annulation = now(), annule_par = 'admin', note_interne = $1 WHERE id = $2",
        [raison || null, id]
    );
    // Litige auto (specs §9.2 : création auto lors d'une annulation admin)
    await creerLitige({
        type: 'annulation_litigieuse', origine: 'auto',
        description: raison ? `Annulation admin : ${raison}` : 'Annulation administrative',
        course_id: id, ambassadeur_id: check.rows[0].ambassadeur_id, chauffeur_id: check.rows[0].chauffeur_id,
    });
    res.json({ success: true });
});

router.put('/courses/:id/assigner', async (req, res) => {
    const { id } = req.params;
    const { chauffeur_id } = req.body;
    if (!chauffeur_id) return res.status(400).json({ error: 'chauffeur_id requis' });
    const checkCourse = await query('SELECT id FROM courses WHERE id = $1', [id]);
    if (!checkCourse.rows.length) return res.status(404).json({ error: 'Course introuvable' });
    const checkChauffeur = await query('SELECT id FROM chauffeurs WHERE id = $1', [chauffeur_id]);
    if (!checkChauffeur.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    await query('UPDATE courses SET chauffeur_id = $1, statut = $2 WHERE id = $3', [chauffeur_id, 'acceptee', id]);
    res.json({ success: true });
});

// Alertes client absent en attente d'arbitrage (specs §9.00)
router.get('/alertes', async (req, res) => {
    const result = await query(`
        SELECT
            s.id AS sanction_id,
            s.course_id,
            s.decide_at AS signale_at,
            c.reference,
            c.adresse_depart,
            c.adresse_destination,
            c.montant,
            EXTRACT(EPOCH FROM (now() - s.decide_at)) AS secondes_attente,
            u_amb.prenom AS amb_prenom,
            u_amb.nom AS amb_nom,
            u_amb.telephone AS amb_telephone,
            u_ch.prenom AS chauffeur_prenom,
            u_ch.nom AS chauffeur_nom,
            u_ch.telephone AS chauffeur_telephone
        FROM sanctions_en_attente s
        JOIN courses c ON c.id = s.course_id
        JOIN ambassadeurs a ON a.id = s.ambassadeur_id
        JOIN utilisateurs u_amb ON u_amb.id = a.utilisateur_id
        LEFT JOIN chauffeurs ch ON ch.id = c.chauffeur_id
        LEFT JOIN utilisateurs u_ch ON u_ch.id = ch.utilisateur_id
        WHERE s.statut = 'en_attente'
          AND s.points = 0
          AND s.motif = 'Client absent signalé par chauffeur'
        ORDER BY s.decide_at ASC
    `);
    res.json(result.rows);
});

router.post('/alertes/:id/arbitrer', async (req, res) => {
    const { id } = req.params;
    const { action, points, indemnisation } = req.body;
    const pts = Math.max(0, Math.floor(Number(points) || 0));

    // Récupère la sanction + le solde/push de l'ambassadeur visé
    const sRes = await query(
        `SELECT s.ambassadeur_id, s.decide_at, a.points_solde, a.push_token
         FROM sanctions_en_attente s
         JOIN ambassadeurs a ON a.id = s.ambassadeur_id
         WHERE s.id = $1`,
        [id]
    );
    const sanction = sRes.rows[0];
    if (!sanction) return res.status(404).json({ error: 'Sanction introuvable' });

    // Pénalité modulable côté Ambassadeur (specs §6.3) — appliquée selon la table §3.5/§3.6
    let sanctionStatut = 'execute';
    if (pts > 0) {
        // Enregistre la pénalité choisie par l'admin sur cette sanction
        await query(
            "UPDATE sanctions_en_attente SET points = $1, motif = 'Client absent - arbitrage admin' WHERE id = $2",
            [pts, id]
        );
        const solde = Number(sanction.points_solde || 0);
        if (solde >= pts) {
            // Solde suffisant : prélèvement immédiat + notification (§3.5)
            const solde_apres = solde - pts;
            const newLevel = nextAmbassadorLevel(solde_apres);
            await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, sanction.ambassadeur_id]);
            await query("UPDATE sanctions_en_attente SET statut = 'execute', execute_at = now() WHERE id = $1", [id]);
            if (sanction.push_token) {
                const date = new Date(sanction.decide_at).toLocaleDateString('fr-FR');
                await sendPushNotification(sanction.push_token, `-${pts} points prélevés`, `Suite à l'absence de votre client le ${date}.`, { sanction_id: id }).catch(() => {});
            }
        } else {
            // Solde insuffisant : différé silencieux, aucune notification (§3.6).
            // La sanction reste 'en_attente' → executerSanctionsEnAttente la prélèvera à un futur gain.
            sanctionStatut = 'en_attente';
        }
    } else {
        // Aucune pénalité décidée : on clôt simplement l'alerte
        await query("UPDATE sanctions_en_attente SET statut = 'execute', execute_at = now() WHERE id = $1", [id]);
    }

    // Notification INDEMNISATION au chauffeur si indemnisation accordée
    if (Number(indemnisation) > 0) {
        try {
            const row = await query(
                `SELECT ch.push_token
                 FROM sanctions_en_attente s
                 JOIN courses c ON c.id = s.course_id
                 JOIN chauffeurs ch ON ch.id = c.chauffeur_id
                 WHERE s.id = $1`,
                [id]
            );
            const token = row.rows[0]?.push_token;
            if (token) {
                await sendPushNotification(token, `+${Number(indemnisation).toFixed(2)} EUR crédités`, 'Indemnisation attente injustifiée.', { sanction_id: id });
            }
        } catch { /* Non bloquant */ }
    }

    res.json({ success: true, action, points: pts, indemnisation, sanction: sanctionStatut });
});

router.post('/chat/:courseId/intervenir', async (req, res) => {
    const { courseId } = req.params;
    const { contenu } = req.body;
    if (!contenu || typeof contenu !== 'string' || !contenu.trim()) return res.status(400).json({ error: 'Contenu requis' });
    const texte = contenu.slice(0, 2000);
    const result = await query('INSERT INTO messages_chat(course_id, expediteur_type, expediteur_id, contenu) VALUES ($1,$2,$3,$4) RETURNING *', [courseId, 'admin', null, texte]);
    res.status(201).json(result.rows[0]);
});

router.get('/ambassadeurs', async (req, res) => {
    const mainResult = await query(
        `SELECT a.id::text AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                a.points_solde AS points, a.niveau, a.type_ambassadeur::text AS type,
                a.contrat_moral_signe, u.statut AS compte_statut,
                COALESCE(a.note_interne, NULL) AS note_interne,
                a.etablissement AS societe, a.siret, a.iban,
                a.responsable_legal_nom, u.created_at,
                NULL::text AS entreprise_nom, NULL::text AS entreprise_id
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY u.created_at DESC`
    );

    let sousComptes: any[] = [];
    try {
        const scResult = await query(
            `SELECT s.id::text AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                    0 AS points, NULL::text AS niveau, 'sous_compte'::text AS type,
                    FALSE AS contrat_moral_signe, u.statut AS compte_statut, NULL::text AS note_interne,
                    s.metier AS societe, s.created_at,
                    COALESCE(a2.etablissement, u2.prenom || ' ' || u2.nom) AS entreprise_nom, a2.id::text AS entreprise_id
             FROM sous_comptes_employes s
             JOIN utilisateurs u ON u.id = s.utilisateur_id
             JOIN ambassadeurs a2 ON a2.id = s.ambassadeur_moral_id
             JOIN utilisateurs u2 ON u2.id = a2.utilisateur_id
             ORDER BY s.created_at DESC`
        );
        sousComptes = scResult.rows;
    } catch {
        // table sous_comptes_employes absente — ignoré
    }

    // Un sous-compte possède aussi une ligne `ambassadeurs` (pour pouvoir commander),
    // il apparaîtrait donc 2 fois. On retire ces doublons du listing principal
    // pour ne garder que l'entrée « sous_compte » (qui porte l'info entreprise).
    const sousCompteUserIds = new Set(sousComptes.map(s => s.utilisateur_id));
    const mainSansSousComptes = mainResult.rows.filter(r => !sousCompteUserIds.has(r.utilisateur_id));

    res.json([...mainSansSousComptes, ...sousComptes]);
});

router.get('/chauffeurs', async (req, res) => {
    const result = await query(
        `SELECT c.id AS id, u.id AS utilisateur_id, u.prenom, u.nom, u.email, u.telephone,
                c.disponible,
                concat(c.vehicule_type, ' ', c.vehicule_marque, ' ', c.vehicule_modele) AS vehicule,
                c.vehicule_type, c.taux_commission_override AS taux_commission, c.documents_valides,
                u.statut AS compte_statut, c.note_interne
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY u.nom ASC`
    );
    res.json(result.rows);
});

router.get('/chauffeurs/:id/documents', async (req, res) => {
    const result = await query(
        `SELECT d.id, d.type, d.fichier_recto_url, d.fichier_verso_url,
                d.date_expiration, d.statut, d.motif_refus, d.uploaded_at
         FROM documents_chauffeur d
         WHERE d.chauffeur_id = $1
         ORDER BY d.uploaded_at DESC`,
        [req.params.id]
    );

    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const BUCKET = 'documents-kyc_sesame_chauffeur';

    const signUrl = async (storagePath: string | null) => {
        if (!storagePath) return null;
        try {
            const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${storagePath}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ expiresIn: 3600 }),
            });
            if (!r.ok) return null;
            const { signedURL } = await r.json() as { signedURL: string };
            const path = signedURL.startsWith('/storage/v1') ? signedURL : `/storage/v1${signedURL}`;
            return `${SUPABASE_URL}${path}`;
        } catch { return null; }
    };

    const docs = await Promise.all(result.rows.map(async (doc) => ({
        ...doc,
        fichier_recto_url: await signUrl(doc.fichier_recto_url),
        fichier_verso_url: await signUrl(doc.fichier_verso_url),
    })));

    res.json(docs);
});

// Contrôle d'identité chauffeur (specs §5.1 / §9.1) — données pour la modale :
// photo profil format ID + véhicule + immatriculation + téléphone.
router.get('/chauffeurs/:id/controle-identite', async (req, res) => {
    const ch = await query(
        `SELECT c.id, u.prenom, u.nom, u.telephone, u.statut AS compte_statut,
                c.vehicule_type, c.vehicule_marque, c.vehicule_modele, c.vehicule_couleur, c.vehicule_immat
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         WHERE c.id = $1`,
        [req.params.id]
    );
    if (!ch.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });

    const photo = await query(
        `SELECT fichier_recto_url FROM documents_chauffeur
         WHERE chauffeur_id = $1 AND type = 'photo_profil'
         ORDER BY uploaded_at DESC LIMIT 1`,
        [req.params.id]
    );
    const historique = await query(
        `SELECT id, resultat, note, created_at FROM controles_identite
         WHERE chauffeur_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [req.params.id]
    );

    res.json({
        ...ch.rows[0],
        photo_profil_url: await signKycUrl(photo.rows[0]?.fichier_recto_url ?? null),
        historique: historique.rows,
    });
});

// Résultat d'un contrôle d'identité. 'non_conforme' → suspension immédiate du chauffeur
// + notification push (specs §9.1 : « Suspension immédiate + Ambassadeur notifié »).
router.post('/chauffeurs/:id/controle-identite', async (req, res) => {
    const { resultat, note } = req.body;
    if (resultat !== 'conforme' && resultat !== 'non_conforme') {
        return res.status(400).json({ error: 'Résultat invalide (conforme | non_conforme).' });
    }
    const ch = await query(
        `SELECT c.utilisateur_id, u.push_token FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id WHERE c.id = $1`,
        [req.params.id]
    );
    if (!ch.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });

    await query(
        'INSERT INTO controles_identite(chauffeur_id, admin_id, resultat, note) VALUES ($1,$2,$3,$4)',
        [req.params.id, ADMIN_ACTOR_ID, resultat, note || null]
    );

    let suspendu = false;
    if (resultat === 'non_conforme') {
        await query(`UPDATE utilisateurs SET statut = 'suspendu' WHERE id = $1`, [ch.rows[0].utilisateur_id]);
        suspendu = true;
        // Litige auto (specs §9.2 : création auto lors d'une suspension pour identité non conforme)
        await creerLitige({
            type: 'comportement', origine: 'auto',
            description: note ? `Contrôle identité non conforme : ${note}` : 'Contrôle identité non conforme',
            chauffeur_id: req.params.id,
        });
        const token = ch.rows[0].push_token;
        if (token) {
            try {
                await sendPushNotification(token, 'Compte suspendu',
                    "Votre identité n'a pas pu être confirmée. Contactez SESAME au 07 45 20 70 06.");
            } catch { /* push best-effort */ }
        }
    }
    res.json({ success: true, suspendu });
});

router.put('/documents/:id/valider', async (req, res) => {
    const { date_expiration, rc_circulation_mention_valide } = req.body;
    // RC Circulation : vérification mention "transport passagers à titre onéreux" obligatoire (specs §2)
    const docCheck = await query('SELECT type FROM documents_chauffeur WHERE id = $1', [req.params.id]);
    if (docCheck.rows[0]?.type === 'rc_circulation' && !rc_circulation_mention_valide) {
        return res.status(400).json({ error: 'La mention "transport passagers à titre onéreux" doit être confirmée avant de valider la RC Circulation.' });
    }
    await query(
        `UPDATE documents_chauffeur SET statut = 'valide', date_expiration = COALESCE($2, date_expiration) WHERE id = $1`,
        [req.params.id, date_expiration || null]
    );
    const doc = await query('SELECT chauffeur_id FROM documents_chauffeur WHERE id = $1', [req.params.id]);
    const chauffeurId = doc.rows[0]?.chauffeur_id;
    if (chauffeurId) {
        const docsOblig = ['carte_identite', 'carte_vtc', 'permis', 'carte_grise'];
        const valid = await query(
            `SELECT type FROM documents_chauffeur WHERE chauffeur_id = $1 AND statut = 'valide' AND type = ANY($2)`,
            [chauffeurId, docsOblig]
        );
        const tousValides = docsOblig.every(t => valid.rows.some((r: any) => r.type === t));
        if (tousValides) {
            await query('UPDATE chauffeurs SET documents_valides = true WHERE id = $1', [chauffeurId]);
            // Notification KYC complet
            try {
                const tokenRow = await query('SELECT push_token FROM chauffeurs WHERE id = $1', [chauffeurId]);
                const pushToken = tokenRow.rows[0]?.push_token;
                if (pushToken) {
                    await sendPushNotification(
                        pushToken,
                        'Profil validé !',
                        'Tous vos documents ont été approuvés. Vous pouvez accepter des courses.',
                        { type: 'kyc_valide' }
                    );
                }
            } catch { /* Non bloquant */ }
        } else {
            // Notification document individuel validé
            try {
                const tokenRow = await query('SELECT push_token FROM chauffeurs WHERE id = $1', [chauffeurId]);
                const pushToken = tokenRow.rows[0]?.push_token;
                if (pushToken) {
                    await sendPushNotification(
                        pushToken,
                        'Document approuvé',
                        'Un de vos documents a été validé. Déposez les documents restants.',
                        { type: 'kyc_doc_valide' }
                    );
                }
            } catch { /* Non bloquant */ }
        }
    }
    res.json({ success: true });
});

router.put('/documents/:id/refuser', async (req, res) => {
    const { motif } = req.body;
    await query(
        `UPDATE documents_chauffeur SET statut = 'refuse', motif_refus = $1 WHERE id = $2`,
        [motif || null, req.params.id]
    );
    const doc = await query('SELECT chauffeur_id FROM documents_chauffeur WHERE id = $1', [req.params.id]);
    const chauffeurId = doc.rows[0]?.chauffeur_id;
    if (chauffeurId) {
        await query('UPDATE chauffeurs SET documents_valides = false WHERE id = $1', [chauffeurId]);
        // Notification document refusé
        try {
            const tokenRow = await query('SELECT push_token FROM chauffeurs WHERE id = $1', [chauffeurId]);
            const pushToken = tokenRow.rows[0]?.push_token;
            if (pushToken) {
                await sendPushNotification(
                    pushToken,
                    'Document refusé',
                    motif ? `Motif : ${motif}. Merci de déposer un nouveau document.` : 'Un document a été refusé. Merci de le soumettre à nouveau.',
                    { type: 'kyc_doc_refuse' }
                );
            }
        } catch { /* Non bloquant */ }
    }
    res.json({ success: true });
});

router.get('/courses', async (req, res) => {
    const result = await query(
        `SELECT c.id, c.reference, c.statut, c.type_course AS type,
                c.adresse_depart, c.adresse_destination,
                c.montant::float AS montant,
                c.created_at, c.date_acceptation, c.date_fin, c.date_annulation,
                ua.prenom AS ambassadeur_prenom, ua.nom AS ambassadeur_nom,
                uc.prenom AS chauffeur_prenom, uc.nom AS chauffeur_nom
         FROM courses c
         LEFT JOIN ambassadeurs a ON a.id = c.ambassadeur_id
         LEFT JOIN utilisateurs ua ON ua.id = a.utilisateur_id
         LEFT JOIN chauffeurs ch ON ch.id = c.chauffeur_id
         LEFT JOIN utilisateurs uc ON uc.id = ch.utilisateur_id
         ORDER BY c.created_at DESC`
    );
    res.json(result.rows);
});

router.get('/sanctions', async (req, res) => {
    const result = await query(
        `SELECT s.id, s.points, s.motif, s.statut, s.decide_at, s.execute_at,
                c.reference AS course_reference,
                ua.prenom AS ambassadeur_prenom, ua.nom AS ambassadeur_nom
         FROM sanctions_en_attente s
         LEFT JOIN courses c ON c.id = s.course_id
         LEFT JOIN ambassadeurs a ON a.id = s.ambassadeur_id
         LEFT JOIN utilisateurs ua ON ua.id = a.utilisateur_id
         WHERE s.statut = 'en_attente'
         ORDER BY s.decide_at DESC`
    );
    res.json(result.rows);
});

// ─── Litiges / contentieux (specs §9.2) ───────────────────────────────────────
const LITIGE_TYPES = ['code_invalide', 'course_non_effectuee', 'comportement', 'paiement_conteste', 'annulation_litigieuse'];

// Crée un litige en base. Réutilisé par la création manuelle ET les créations automatiques
// (annulation admin, contrôle identité non conforme — specs §9.2 « création auto »).
async function creerLitige(opts: {
    type: string; origine?: 'manuel' | 'auto'; description?: string | null;
    course_id?: string | null; ambassadeur_id?: string | null; chauffeur_id?: string | null;
}): Promise<void> {
    await query(
        `INSERT INTO litiges (course_id, ambassadeur_id, chauffeur_id, type, origine, description)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [opts.course_id || null, opts.ambassadeur_id || null, opts.chauffeur_id || null,
         opts.type, opts.origine || 'auto', opts.description || null]
    );
}

// Liste des litiges (filtre optionnel ?statut=ouvert|en_analyse|clos), avec parties + course.
router.get('/litiges', async (req, res) => {
    const statut = typeof req.query.statut === 'string' ? req.query.statut : null;
    const result = await query(
        `SELECT l.id, l.type, l.statut, l.origine, l.description, l.decision, l.created_at, l.closed_at,
                c.reference AS course_reference,
                ua.prenom AS ambassadeur_prenom, ua.nom AS ambassadeur_nom,
                uc.prenom AS chauffeur_prenom, uc.nom AS chauffeur_nom
         FROM litiges l
         LEFT JOIN courses c ON c.id = l.course_id
         LEFT JOIN ambassadeurs a ON a.id = l.ambassadeur_id
         LEFT JOIN utilisateurs ua ON ua.id = a.utilisateur_id
         LEFT JOIN chauffeurs ch ON ch.id = l.chauffeur_id
         LEFT JOIN utilisateurs uc ON uc.id = ch.utilisateur_id
         ${statut ? 'WHERE l.statut = $1' : ''}
         ORDER BY (l.statut = 'clos'), l.created_at DESC`,
        statut ? [statut] : []
    );
    res.json(result.rows);
});

// Création manuelle d'un litige par l'admin.
router.post('/litiges', async (req, res) => {
    const { type, description, course_id, ambassadeur_id, chauffeur_id } = req.body;
    if (!LITIGE_TYPES.includes(type)) {
        return res.status(400).json({ error: `Type de litige invalide (${LITIGE_TYPES.join(', ')}).` });
    }
    await creerLitige({ type, origine: 'manuel', description, course_id, ambassadeur_id, chauffeur_id });
    res.status(201).json({ success: true });
});

// Mise à jour du statut / décision (timeline : ouvert → en_analyse → clos).
router.put('/litiges/:id', async (req, res) => {
    const { statut, decision } = req.body;
    if (!['ouvert', 'en_analyse', 'clos'].includes(statut)) {
        return res.status(400).json({ error: 'Statut invalide (ouvert | en_analyse | clos).' });
    }
    const closedAt = statut === 'clos' ? 'now()' : 'NULL';
    const result = await query(
        `UPDATE litiges SET statut = $1, decision = $2, closed_at = ${closedAt} WHERE id = $3 RETURNING id`,
        [statut, decision || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Litige introuvable' });
    res.json({ success: true });
});

router.get('/fournisseurs', async (req, res) => {
    const result = await query(
        `SELECT id, nom_societe, statut, contrat_signe, contrat_signe_at, bloque, siret, iban,
                legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
                prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
                memes_coordonnees, option_paiement
         FROM fournisseurs ORDER BY nom_societe ASC`
    );
    res.json(result.rows);
});

// Propositions blacklist en attente de confirmation admin (specs §9.0)
router.get('/blacklist/propositions', async (req, res) => {
    const result = await query(`
        SELECT bp.id, bp.motif, bp.nb_annulations, bp.created_at,
               u.prenom, u.nom, u.email, u.telephone
        FROM blacklist_propositions bp
        JOIN ambassadeurs a ON a.id = bp.ambassadeur_id
        JOIN utilisateurs u ON u.id = a.utilisateur_id
        WHERE bp.statut = 'en_attente_admin'
        ORDER BY bp.created_at DESC
    `);
    res.json(result.rows);
});

router.put('/blacklist/propositions/:id/confirmer', async (req, res) => {
    const { motif } = req.body;
    const prop = await query(
        `SELECT bp.ambassadeur_id, u.nom, u.prenom, u.date_naissance, u.lieu_naissance, u.telephone
         FROM blacklist_propositions bp
         JOIN ambassadeurs a ON a.id = bp.ambassadeur_id
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         WHERE bp.id = $1`,
        [req.params.id]
    );
    const p = prop.rows[0];
    if (!p) return res.status(404).json({ error: 'Proposition introuvable' });

    await query(
        'INSERT INTO blacklist(nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, ajoute_par_admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [p.nom, p.prenom, p.date_naissance, p.lieu_naissance, p.telephone, motif || '5 annulations en 30 jours', 'ambassadeur', ADMIN_ACTOR_ID]
    );
    await query(`UPDATE blacklist_propositions SET statut = 'confirme' WHERE id = $1`, [req.params.id]);
    await query(`UPDATE utilisateurs SET statut = 'blackliste' WHERE id = (SELECT utilisateur_id FROM ambassadeurs WHERE id = (SELECT ambassadeur_id FROM blacklist_propositions WHERE id = $1))`, [req.params.id]);
    res.json({ success: true });
});

router.put('/blacklist/propositions/:id/rejeter', async (req, res) => {
    await query(`UPDATE blacklist_propositions SET statut = 'rejete' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
});

router.get('/blacklist', async (req, res) => {
    const result = await query('SELECT * FROM blacklist ORDER BY id DESC');
    res.json(result.rows);
});

router.post('/blacklist', async (req, res) => {
    const { nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur } = req.body;
    if (!nom || !prenom || !date_naissance || !telephone || !type_utilisateur) {
        return res.status(400).json({ error: 'Données blacklist manquantes' });
    }
    const result = await query(
        'INSERT INTO blacklist(nom, prenom, date_naissance, lieu_naissance, telephone, motif, type_utilisateur, ajoute_par_admin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [nom, prenom, date_naissance, lieu_naissance, telephone, motif || '', type_utilisateur, ADMIN_ACTOR_ID]
    );
    res.status(201).json(result.rows[0]);
});

router.delete('/blacklist/:id', async (req, res) => {
    const { id } = req.params;
    const result = await query('DELETE FROM blacklist WHERE id = $1 RETURNING id', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Entrée blacklist introuvable' });
    res.json({ success: true, id });
});

router.get('/export/ambassadeurs', async (req, res) => {
    const result = await query(
        `SELECT u.prenom, u.nom, u.email, u.telephone, a.niveau, a.points_solde, a.contrat_moral_signe, u.created_at
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         ORDER BY a.points_solde DESC`
    );
    const header = 'Prénom,Nom,Email,Téléphone,Niveau,Points,Contrat signé,Date inscription\n';
    const rows = result.rows.map(r =>
        `${r.prenom},${r.nom},${r.email},${r.telephone},${r.niveau},${r.points_solde},${r.contrat_moral_signe ? 'Oui' : 'Non'},${new Date(r.created_at).toLocaleDateString('fr-FR')}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ambassadeurs.csv');
    res.send(header + rows);
});

router.get('/export/courses', async (req, res) => {
    const result = await query(
        `SELECT reference, statut, type_course, adresse_depart, adresse_destination, montant, points_attribues, date_reservation, date_acceptation, date_fin
         FROM courses
         ORDER BY date_acceptation DESC NULLS LAST`
    );
    const header = 'Référence,Statut,Type,Départ,Destination,Montant,Points,Date réservation,Date acceptation,Date fin\n';
    const rows = result.rows.map(r =>
        `${r.reference || ''},${r.statut},${r.type_course},${(r.adresse_depart || '').replace(/,/g, ' ')},${(r.adresse_destination || '').replace(/,/g, ' ')},${r.montant || ''},${r.points_attribues || 0},${r.date_reservation ? new Date(r.date_reservation).toLocaleDateString('fr-FR') : ''},${r.date_acceptation ? new Date(r.date_acceptation).toLocaleDateString('fr-FR') : ''},${r.date_fin ? new Date(r.date_fin).toLocaleDateString('fr-FR') : ''}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=courses.csv');
    res.send(header + rows);
});

router.get('/export/chauffeurs', async (req, res) => {
    const result = await query(
        `SELECT u.prenom, u.nom, u.email, u.telephone, u.statut,
                c.vehicule_type, c.vehicule_marque, c.vehicule_modele, c.vehicule_immat,
                c.documents_valides, c.taux_commission_override, u.created_at
         FROM chauffeurs c
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         ORDER BY u.created_at DESC`
    );
    const header = 'Prénom,Nom,Email,Téléphone,Statut,Véhicule,Marque,Modèle,Immat,Docs validés,Taux,Date inscription\n';
    const rows = result.rows.map((r: any) =>
        `${r.prenom},${r.nom},${r.email},${r.telephone},${r.statut},${r.vehicule_type},${r.vehicule_marque || ''},${r.vehicule_modele || ''},${r.vehicule_immat || ''},${r.documents_valides ? 'Oui' : 'Non'},${r.taux_commission_override || 'défaut'},${new Date(r.created_at).toLocaleDateString('fr-FR')}`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=chauffeurs.csv');
    res.send(header + rows);
});

router.get('/export/paiements', async (req, res) => {
    const result = await query(
        `SELECT c.reference, u.prenom, u.nom,
                co.montant, co.code_valide_at, co.date_fin,
                co.taux_commission_override
         FROM courses co
         JOIN chauffeurs c ON c.id = co.chauffeur_id
         JOIN utilisateurs u ON u.id = c.utilisateur_id
         WHERE co.statut = 'terminee' AND co.code_valide_at IS NOT NULL
         ORDER BY co.code_valide_at DESC`
    );
    const header = 'Référence course,Chauffeur prénom,Chauffeur nom,Montant,Taux,Frais SESAME,Net chauffeur,Date validation code,Date fin\n';
    const rows = result.rows.map((r: any) => {
        const taux = Number(r.taux_commission_override ?? 20) / 100;
        const frais = (Number(r.montant) * taux).toFixed(2);
        const net = (Number(r.montant) * (1 - taux)).toFixed(2);
        return `${r.reference || ''},${r.prenom},${r.nom},${r.montant},${(taux * 100).toFixed(1)}%,${frais},${net},${r.code_valide_at ? new Date(r.code_valide_at).toLocaleDateString('fr-FR') : ''},${r.date_fin ? new Date(r.date_fin).toLocaleDateString('fr-FR') : ''}`;
    }).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=paiements.csv');
    res.send(header + rows);
});

router.get('/parametres', async (req, res) => {
    const result = await query('SELECT * FROM parametres_systeme ORDER BY cle ASC');
    res.json(result.rows);
});

router.put('/parametres/:cle', async (req, res) => {
    const { cle } = req.params;
    const { valeur } = req.body;
    // Upsert : crée la clé si elle n'existe pas encore (nouvelles sous-sections Paramètres).
    await query(
        `INSERT INTO parametres_systeme (cle, valeur) VALUES ($1, $2)
         ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur, updated_at = now()`,
        [cle, valeur ?? '']
    );
    res.json({ success: true, cle, valeur });
});

// Taux commission individuel chauffeur
router.put('/chauffeurs/:id/taux', async (req, res) => {
    const { taux } = req.body;
    if (taux === undefined) return res.status(400).json({ error: 'taux requis' });
    const result = await query(
        'UPDATE chauffeurs SET taux_commission_override = $1 WHERE id = $2 RETURNING id, taux_commission_override',
        [taux === null ? null : Number(taux), req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json({ success: true, ...result.rows[0] });
});

router.put('/utilisateurs/:id/statut', async (req, res) => {
    const { statut } = req.body;
    if (!['actif', 'suspendu'].includes(statut)) return res.status(400).json({ error: 'statut invalide' });
    const result = await query(
        'UPDATE utilisateurs SET statut = $1 WHERE id = $2 RETURNING id, statut',
        [statut, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ success: true, ...result.rows[0] });
});

router.put('/ambassadeurs/:id/valider-moral', async (req, res) => {
    const { id } = req.params;
    const ambResult = await query('SELECT utilisateur_id, push_token FROM ambassadeurs WHERE id = $1', [id]);
    const amb = ambResult.rows[0];
    if (!amb) return res.status(404).json({ error: 'Ambassadeur introuvable' });

    await query('UPDATE utilisateurs SET statut = $1 WHERE id = $2', ['actif', amb.utilisateur_id]);
    await query('UPDATE ambassadeurs SET contrat_moral_signe = true, contrat_moral_signe_at = now() WHERE id = $1', [id]);

    if (amb.push_token) {
        await sendPushNotification(
            amb.push_token,
            'Compte validé !',
            'Votre compte entreprise SÉSAME a été validé. Vous pouvez maintenant vous connecter.',
            { type: 'compte_valide' }
        ).catch(() => {});
    }

    res.json({ success: true });
});

router.put('/ambassadeurs/:id/note', async (req, res) => {
    const { note } = req.body;
    const result = await query(
        'UPDATE ambassadeurs SET note_interne = $1 WHERE id = $2 RETURNING id',
        [note ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ambassadeur introuvable' });
    res.json({ success: true });
});

router.put('/chauffeurs/:id/note', async (req, res) => {
    const { note } = req.body;
    const result = await query(
        'UPDATE chauffeurs SET note_interne = $1 WHERE id = $2 RETURNING id',
        [note ?? null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    res.json({ success: true });
});

router.delete('/ambassadeurs/:ambassadeur_id', async (req, res) => {
    const { ambassadeur_id } = req.params;
    const amb = await query('SELECT utilisateur_id FROM ambassadeurs WHERE id = $1', [ambassadeur_id]);
    if (!amb.rows.length) return res.status(404).json({ error: 'Ambassadeur introuvable' });
    const utilisateur_id = amb.rows[0].utilisateur_id;
    await query('UPDATE courses SET ambassadeur_id = NULL WHERE ambassadeur_id = $1', [ambassadeur_id]);
    await query('DELETE FROM sous_comptes_employes WHERE ambassadeur_moral_id = $1', [ambassadeur_id]);
    await query('DELETE FROM ambassadeurs WHERE id = $1', [ambassadeur_id]);
    await query('DELETE FROM utilisateurs WHERE id = $1', [utilisateur_id]);
    res.json({ success: true });
});

router.delete('/chauffeurs/:chauffeur_id', async (req, res) => {
    const { chauffeur_id } = req.params;
    // Récupère l'utilisateur_id avant suppression
    const ch = await query('SELECT utilisateur_id FROM chauffeurs WHERE id = $1', [chauffeur_id]);
    if (!ch.rows.length) return res.status(404).json({ error: 'Chauffeur introuvable' });
    const utilisateur_id = ch.rows[0].utilisateur_id;
    // Nullifie chauffeur_id dans les courses pour conserver l'historique
    await query('UPDATE courses SET chauffeur_id = NULL WHERE chauffeur_id = $1', [chauffeur_id]);
    // Supprime l'utilisateur (CASCADE supprime chauffeurs + documents_chauffeur)
    await query('DELETE FROM utilisateurs WHERE id = $1', [utilisateur_id]);
    res.json({ success: true });
});

// Créer un fournisseur
router.post('/fournisseurs', async (req, res) => {
    const {
        nom_societe, siret, iban,
        legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
        prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
        memes_coordonnees, option_paiement
    } = req.body;

    // « Mêmes coordonnées » : le contact prestation reprend le contact légal.
    const p = memes_coordonnees
        ? { prenom: legal_prenom, nom: legal_nom, telephone: legal_telephone, email: legal_email, adresse: legal_adresse, cp: legal_cp, ville: legal_ville }
        : { prenom: prest_prenom, nom: prest_nom, telephone: prest_telephone, email: prest_email, adresse: prest_adresse, cp: prest_cp, ville: prest_ville };

    // Champs obligatoires (specs §6.2). SIRET, IBAN et email de prestation restent optionnels.
    const requis: [unknown, string][] = [
        [nom_societe, 'Raison sociale'],
        [legal_prenom, 'Prénom du responsable légal'], [legal_nom, 'Nom du responsable légal'],
        [legal_email, 'Email du responsable légal'], [legal_telephone, 'Téléphone du responsable légal'],
        [legal_adresse, 'Adresse du siège social'], [legal_cp, 'Code postal du siège social'], [legal_ville, 'Ville du siège social'],
        [p.prenom, 'Prénom du contact prestation'], [p.nom, 'Nom du contact prestation'],
        [p.telephone, 'Téléphone du contact prestation'],
        [p.adresse, 'Adresse du lieu de prestation'], [p.cp, 'Code postal du lieu de prestation'], [p.ville, 'Ville du lieu de prestation'],
    ];
    const manquant = requis.find(([v]) => !String(v ?? '').trim());
    if (manquant) return res.status(400).json({ error: `Champ obligatoire manquant : ${manquant[1]}.` });

    // Email légal (obligatoire) : format. Email prestation : seulement s'il est renseigné.
    if (!emailValide(legal_email)) {
        return res.status(400).json({ error: 'Email du responsable légal invalide.' });
    }
    if (String(p.email ?? '').trim() && !emailValide(p.email)) {
        return res.status(400).json({ error: 'Email du contact prestation invalide.' });
    }
    // Téléphones (obligatoires) : format FR.
    if (!telephoneValide(legal_telephone)) {
        return res.status(400).json({ error: 'Téléphone du responsable légal invalide (format FR attendu, ex. 06 12 34 56 78).' });
    }
    if (!telephoneValide(p.telephone)) {
        return res.status(400).json({ error: 'Téléphone du contact prestation invalide (format FR attendu, ex. 06 12 34 56 78).' });
    }
    // Format des numéros optionnels (uniquement s'ils sont renseignés).
    if (String(siret ?? '').trim() && !siretValide(siret)) {
        return res.status(400).json({ error: 'SIRET invalide (14 chiffres).' });
    }
    if (String(iban ?? '').trim() && !ibanValide(iban)) {
        return res.status(400).json({ error: 'IBAN invalide (vérifiez le format).' });
    }

    // Générer un code secret à 4 chiffres
    const code = randomInt(1000, 10000).toString();
    const code_secret_hash = await bcrypt.hash(code, 10);

    const result = await query(
        `INSERT INTO fournisseurs(
            nom_societe, siret, iban,
            legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
            prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
            memes_coordonnees, code_secret_hash, option_paiement, statut
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'en_configuration')
        RETURNING id, nom_societe, statut`,
        [
            nom_societe, siret || null, iban || null,
            legal_prenom || null, legal_nom || null, legal_email || null, legal_telephone || null,
            legal_adresse || null, legal_cp || null, legal_ville || null,
            p.prenom || null, p.nom || null, p.telephone || null,
            p.email || null, p.adresse || null, p.cp || null, p.ville || null,
            memes_coordonnees ?? false, code_secret_hash, option_paiement || 'c'
        ]
    );

    // Envoyer le code secret par email au responsable légal (specs : « envoyé par email »).
    // Non bloquant : si l'email échoue, l'admin garde le code affiché pour le communiquer.
    let email_envoye = false;
    if (legal_email) {
        try {
            await sendCodeSecretFournisseur(legal_email, nom_societe, code);
            email_envoye = true;
        } catch (e) {
            console.error('[fournisseur] envoi code secret échoué:', (e as Error).message);
        }
    }

    // Retourner le code en clair une seule fois (repli si l'email n'est pas parti)
    res.status(201).json({ ...result.rows[0], code_secret_temporaire: code, email_envoye });
});

// Modifier un fournisseur
router.put('/fournisseurs/:id', async (req, res) => {
    const {
        nom_societe, siret, iban,
        legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
        prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
        memes_coordonnees, option_paiement, statut, contrat_signe
    } = req.body;

    // Formats (uniquement si fournis dans la modification).
    if (String(legal_email ?? '').trim() && !emailValide(legal_email)) {
        return res.status(400).json({ error: 'Email du responsable légal invalide.' });
    }
    if (String(prest_email ?? '').trim() && !emailValide(prest_email)) {
        return res.status(400).json({ error: 'Email du contact prestation invalide.' });
    }
    if (String(legal_telephone ?? '').trim() && !telephoneValide(legal_telephone)) {
        return res.status(400).json({ error: 'Téléphone du responsable légal invalide (format FR attendu).' });
    }
    if (String(prest_telephone ?? '').trim() && !telephoneValide(prest_telephone)) {
        return res.status(400).json({ error: 'Téléphone du contact prestation invalide (format FR attendu).' });
    }
    if (String(siret ?? '').trim() && !siretValide(siret)) {
        return res.status(400).json({ error: 'SIRET invalide (14 chiffres).' });
    }
    if (String(iban ?? '').trim() && !ibanValide(iban)) {
        return res.status(400).json({ error: 'IBAN invalide (vérifiez le format).' });
    }

    await query(
        `UPDATE fournisseurs SET
            nom_societe = COALESCE($1, nom_societe),
            siret = COALESCE($2, siret),
            iban = COALESCE($3, iban),
            legal_prenom = COALESCE($4, legal_prenom),
            legal_nom = COALESCE($5, legal_nom),
            legal_email = COALESCE($6, legal_email),
            legal_telephone = COALESCE($7, legal_telephone),
            legal_adresse = COALESCE($8, legal_adresse),
            legal_cp = COALESCE($9, legal_cp),
            legal_ville = COALESCE($10, legal_ville),
            prest_prenom = COALESCE($11, prest_prenom),
            prest_nom = COALESCE($12, prest_nom),
            prest_telephone = COALESCE($13, prest_telephone),
            prest_email = COALESCE($14, prest_email),
            prest_adresse = COALESCE($15, prest_adresse),
            prest_cp = COALESCE($16, prest_cp),
            prest_ville = COALESCE($17, prest_ville),
            memes_coordonnees = COALESCE($18, memes_coordonnees),
            option_paiement = COALESCE($19, option_paiement),
            statut = COALESCE($20, statut),
            contrat_signe = COALESCE($21, contrat_signe),
            contrat_signe_at = CASE WHEN $21 = true AND contrat_signe = false THEN now() ELSE contrat_signe_at END
        WHERE id = $22`,
        [
            nom_societe, siret, iban,
            legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
            prest_prenom, prest_nom, prest_telephone, prest_email, prest_adresse, prest_cp, prest_ville,
            memes_coordonnees, option_paiement, statut, contrat_signe,
            req.params.id
        ]
    );
    res.json({ success: true });
});

// Champs du fournisseur nécessaires à la génération du contrat (specs §6.3).
const CONTRAT_FIELDS = `id, nom_societe, siret, iban,
    legal_prenom, legal_nom, legal_email, legal_telephone, legal_adresse, legal_cp, legal_ville,
    option_paiement`;

// Charge le fournisseur + ses offres pour bâtir le contrat dynamique.
async function chargerContrat(id: string) {
    const fr = await query(`SELECT ${CONTRAT_FIELDS} FROM fournisseurs WHERE id = $1`, [id]);
    const f = fr.rows[0];
    if (!f) return null;
    const or = await query(
        `SELECT nom, description, tarif_fournisseur_ht, validite_bon_mois
         FROM offres_boutique WHERE fournisseur_id = $1 ORDER BY nom ASC`,
        [id]
    );
    return { f, offres: or.rows };
}

// Prévisualiser / télécharger le contrat généré (specs §6.1 — bouton « Télécharger »).
router.get('/fournisseurs/:id/contrat-preview', async (req, res) => {
    const data = await chargerContrat(req.params.id);
    if (!data) return res.status(404).json({ error: 'Fournisseur introuvable' });
    const { buffer } = await generateContractPdf(data.f, data.offres);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="contrat-sesame-${data.f.nom_societe.replace(/[^\w-]+/g, '_')}.pdf"`);
    res.send(buffer);
});

// Envoyer le contrat à signer au fournisseur via Yousign (specs §6).
// Signataire unique = le responsable légal. La boutique se débloque au webhook « signé ».
router.post('/fournisseurs/:id/envoyer-contrat', async (req, res) => {
    const data = await chargerContrat(req.params.id);
    if (!data) return res.status(404).json({ error: 'Fournisseur introuvable' });
    const f = data.f;
    if (!f.legal_email) {
        return res.status(400).json({ error: "Renseignez l'email du responsable légal avant d'envoyer le contrat." });
    }
    // L'IBAN figure dans les conditions financières du contrat (specs §6.3) et sert à payer le fournisseur.
    if (!String(f.iban ?? '').trim()) {
        return res.status(400).json({ error: "Renseignez l'IBAN du fournisseur avant d'envoyer le contrat (il figure dans les conditions financières)." });
    }
    if (!isYousignConfigured()) {
        return res.status(503).json({ error: 'Signature électronique non configurée (YOUSIGN_API_KEY). Validez le contrat manuellement en attendant.' });
    }
    try {
        const pdf = await generateContractPdf(f, data.offres);
        await envoyerContratFournisseur(f, { pdf });
        res.json({ success: true, message: `Contrat envoyé à ${f.legal_email}.` });
    } catch (e: any) {
        res.status(502).json({ error: `Échec de l'envoi Yousign : ${e.message}` });
    }
});

// Annuler le contrat (specs §6.1 — bouton « Annuler » de l'onglet Contrat).
// Repasse le fournisseur à « non signé » → la boutique se rebloque automatiquement
// (le verrou boutique.ts lit contrat_signe). Pour réactiver : renvoyer/re-signer un contrat.
router.post('/fournisseurs/:id/annuler-contrat', async (req, res) => {
    const r = await query(
        `UPDATE fournisseurs
         SET contrat_signe = false, contrat_signe_at = NULL, statut = 'en_configuration'
         WHERE id = $1 RETURNING id`,
        [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Fournisseur introuvable' });
    res.json({ success: true });
});

// Régénérer le code secret d'un fournisseur
router.post('/fournisseurs/:id/regenerer-code', async (req, res) => {
    const code = randomInt(1000, 10000).toString();
    const code_secret_hash = await bcrypt.hash(code, 10);
    await query('UPDATE fournisseurs SET code_secret_hash = $1, bloque = false, nb_tentatives_echouees = 0 WHERE id = $2', [code_secret_hash, req.params.id]);
    res.json({ success: true, code_secret_temporaire: code });
});

// ─── Offres boutique d'un fournisseur (specs §6.3) ────────────────────────────
// Règle dure : aucune offre tant que le contrat n'est pas signé (boutique bloquée).

// Génère une référence unique (ex: KRT-30MIN-A1) à partir du nom de l'offre.
async function genererReferenceOffre(nom: string): Promise<string> {
    const base = (nom || 'OFFRE')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 14) || 'OFFRE';
    for (let i = 0; i < 12; i++) {
        const suffix = randomInt(0, 1296).toString(36).toUpperCase().padStart(2, '0');
        const ref = `${base}-${suffix}`.slice(0, 20);
        const exists = await query('SELECT 1 FROM offres_boutique WHERE reference = $1', [ref]);
        if (exists.rows.length === 0) return ref;
    }
    throw new Error('Impossible de générer une référence unique');
}

// Valide et normalise le corps d'une offre. Renvoie { error } ou les valeurs propres.
function parseOffre(body: any): { error: string } | {
    nom: string; description: string | null; stock: number | null;
    pts_requis: number; tarif_fournisseur_ht: number | null; validite_bon_mois: number;
    statut: 'en_ligne' | 'hors_ligne';
} {
    const nom = typeof body.nom === 'string' ? body.nom.trim() : '';
    if (!nom) return { error: "Le nom de l'offre est obligatoire." };
    const pts_requis = Number(body.pts_requis);
    if (!Number.isInteger(pts_requis) || pts_requis <= 0) return { error: 'Les points requis doivent être un entier positif.' };
    const validite_bon_mois = Number(body.validite_bon_mois);
    if (!Number.isInteger(validite_bon_mois) || validite_bon_mois <= 0) return { error: 'La validité (en mois) doit être un entier positif.' };
    // stock null = illimité
    let stock: number | null = null;
    if (body.stock !== null && body.stock !== undefined && body.stock !== '') {
        stock = Number(body.stock);
        if (!Number.isInteger(stock) || stock < 0) return { error: 'Le stock doit être un entier positif ou vide (illimité).' };
    }
    let tarif_fournisseur_ht: number | null = null;
    if (body.tarif_fournisseur_ht !== null && body.tarif_fournisseur_ht !== undefined && body.tarif_fournisseur_ht !== '') {
        tarif_fournisseur_ht = Number(body.tarif_fournisseur_ht);
        if (!Number.isFinite(tarif_fournisseur_ht) || tarif_fournisseur_ht < 0) return { error: 'Le tarif HT doit être un nombre positif.' };
    }
    const statut = body.statut === 'en_ligne' ? 'en_ligne' : 'hors_ligne';
    const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
    return { nom, description, stock, pts_requis, tarif_fournisseur_ht, validite_bon_mois, statut };
}

// Lister les offres d'un fournisseur
router.get('/fournisseurs/:id/offres', async (req, res) => {
    const r = await query(
        `SELECT id, reference, nom, description, stock, pts_requis, tarif_fournisseur_ht, validite_bon_mois, statut
         FROM offres_boutique WHERE fournisseur_id = $1 ORDER BY nom ASC`,
        [req.params.id]
    );
    res.json(r.rows);
});

// Créer une offre (specs §6.3).
// Option 1 retenue : on PEUT créer les offres avant signature (pour qu'elles figurent
// dans le contrat envoyé). Elles ne sont JAMAIS visibles dans la boutique publique tant
// que le contrat n'est pas signé — verrou appliqué dans boutique.ts (WHERE f.contrat_signe).
router.post('/fournisseurs/:id/offres', async (req, res) => {
    const fr = await query('SELECT id FROM fournisseurs WHERE id = $1', [req.params.id]);
    if (!fr.rows[0]) return res.status(404).json({ error: 'Fournisseur introuvable' });
    const parsed = parseOffre(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });

    const reference = await genererReferenceOffre(parsed.nom);
    const r = await query(
        `INSERT INTO offres_boutique
            (fournisseur_id, reference, nom, description, stock, pts_requis, tarif_fournisseur_ht, validite_bon_mois, statut)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, reference, nom, description, stock, pts_requis, tarif_fournisseur_ht, validite_bon_mois, statut`,
        [req.params.id, reference, parsed.nom, parsed.description, parsed.stock, parsed.pts_requis, parsed.tarif_fournisseur_ht, parsed.validite_bon_mois, parsed.statut]
    );
    res.status(201).json(r.rows[0]);
});

// Modifier une offre
router.put('/offres/:id', async (req, res) => {
    const parsed = parseOffre(req.body);
    if ('error' in parsed) return res.status(400).json({ error: parsed.error });
    const r = await query(
        `UPDATE offres_boutique SET
            nom = $1, description = $2, stock = $3, pts_requis = $4,
            tarif_fournisseur_ht = $5, validite_bon_mois = $6, statut = $7
         WHERE id = $8
         RETURNING id, reference, nom, description, stock, pts_requis, tarif_fournisseur_ht, validite_bon_mois, statut`,
        [parsed.nom, parsed.description, parsed.stock, parsed.pts_requis, parsed.tarif_fournisseur_ht, parsed.validite_bon_mois, parsed.statut, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Offre introuvable' });
    res.json(r.rows[0]);
});

// Supprimer une offre — refusée si des bons (échanges) y font référence (intégrité).
router.delete('/offres/:id', async (req, res) => {
    const used = await query('SELECT 1 FROM echanges WHERE offre_id = $1 LIMIT 1', [req.params.id]);
    if (used.rows.length > 0) {
        return res.status(409).json({ error: 'Offre déjà échangée : passez-la « hors ligne » plutôt que de la supprimer.' });
    }
    const r = await query('DELETE FROM offres_boutique WHERE id = $1 RETURNING id', [req.params.id]);
    if (r.rows.length === 0) return res.status(404).json({ error: 'Offre introuvable' });
    res.json({ success: true });
});

// ─── Historique des paiements d'un fournisseur (specs §6.1 onglet Historique) ─
// AUCUNE table dédiée : tout se déduit des tables existantes (echanges + offres +
// ambassadeurs). « À payer » = un bon dont le fait générateur est atteint selon
// l'option de paiement ; « payé » = `echanges.paiement_paye_at` renseigné.
router.get('/fournisseurs/:id/paiements', async (req, res) => {
    const r = await query(
        `SELECT e.id, e.reference AS bon_reference, e.utilise_at, e.remis_at, e.paiement_paye_at,
                o.nom AS offre_nom, o.tarif_fournisseur_ht AS montant_ht,
                f.option_paiement,
                u.prenom AS amb_prenom, u.nom AS amb_nom
         FROM echanges e
         JOIN fournisseurs f ON f.id = e.fournisseur_id
         LEFT JOIN offres_boutique o ON o.id = e.offre_id
         LEFT JOIN ambassadeurs a ON a.id = e.ambassadeur_id
         LEFT JOIN utilisateurs u ON u.id = a.utilisateur_id
         WHERE e.fournisseur_id = $1
           AND (
                (f.option_paiement = 'c' AND e.statut = 'utilise')   -- payé au scan
             OR (f.option_paiement IN ('a','b') AND e.remis_at IS NOT NULL)  -- payé à la remise / prépayé
           )
         ORDER BY COALESCE(e.utilise_at, e.remis_at) DESC`,
        [req.params.id]
    );

    const DELAI_J = Number(process.env.DELAI_REGLEMENT_FOURNISSEUR_JOURS || 30);
    const montant = (v: any) => Number(v) || 0;

    const transactions = r.rows.map(e => {
        const opt = (e.option_paiement || 'c').toLowerCase();
        // Option A = stock prépayé → considéré réglé d'office.
        const statut: 'paye' | 'en_attente' = e.paiement_paye_at || opt === 'a' ? 'paye' : 'en_attente';
        const fait = e.utilise_at || e.remis_at;
        const echeance = fait ? new Date(new Date(fait).getTime() + DELAI_J * 86400000) : null;
        return {
            id: e.id,
            bon_reference: e.bon_reference,
            offre_nom: e.offre_nom,
            amb_prenom: e.amb_prenom,
            amb_nom: e.amb_nom,
            montant_ht: e.montant_ht,
            option_paiement: opt,
            fait_generateur_at: fait,
            echeance_at: echeance,
            statut,
            paye_at: e.paiement_paye_at,
            utilise_at: e.utilise_at,
        };
    });

    const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
    const kpis = {
        paye_ce_mois: transactions
            .filter(p => p.statut === 'paye' && p.paye_at && new Date(p.paye_at) >= debutMois)
            .reduce((s, p) => s + montant(p.montant_ht), 0),
        en_attente: transactions
            .filter(p => p.statut === 'en_attente')
            .reduce((s, p) => s + montant(p.montant_ht), 0),
        bons_valides: transactions.length,
        prix_moyen: transactions.length ? transactions.reduce((s, p) => s + montant(p.montant_ht), 0) / transactions.length : 0,
    };
    res.json({ kpis, transactions });
});

// Export SEPA : génère un fichier .xml regroupant TOUS les bons fournisseurs en attente
// (tous fournisseurs), à charger sur la banque Winween. Les bons exportés sont marqués
// réglés (le fichier = l'ordre de paiement) pour éviter de les ré-exporter / payer 2 fois.
router.get('/sepa/fournisseurs', async (req, res) => {
    const debtorIban = process.env.SESAME_IBAN || '';
    const debtorName = process.env.SESAME_SOCIETE || 'SAS WINWEEN';
    if (!debtorIban) {
        return res.status(400).json({ error: "IBAN de Winween non configuré (SESAME_IBAN dans le .env). Renseignez-le pour générer le fichier SEPA." });
    }

    // Bons dûs (fait générateur atteint selon l'option) et non encore réglés.
    const r = await query(
        `SELECT e.id, e.reference, o.tarif_fournisseur_ht AS montant,
                f.nom_societe, f.iban AS f_iban
         FROM echanges e
         JOIN fournisseurs f ON f.id = e.fournisseur_id
         LEFT JOIN offres_boutique o ON o.id = e.offre_id
         WHERE e.paiement_paye_at IS NULL
           AND (
                (f.option_paiement = 'c' AND e.statut = 'utilise')
             OR (f.option_paiement = 'b' AND e.remis_at IS NOT NULL)
           )`
    );

    const aPayer = r.rows.filter(x => Number(x.montant) > 0);
    // Garde-fou : ne pas retirer en silence un fournisseur dû mais sans IBAN → on bloque en le nommant.
    const sansIban = [...new Set(aPayer.filter(x => !String(x.f_iban ?? '').trim()).map(x => x.nom_societe))];
    if (sansIban.length > 0) {
        return res.status(400).json({ error: `IBAN manquant pour : ${sansIban.join(', ')}. Renseignez-le avant d'exporter (sinon ces fournisseurs ne seraient pas payés).` });
    }
    const valides = aPayer.filter(x => x.f_iban);
    if (valides.length === 0) {
        return res.status(400).json({ error: "Aucun virement à exporter (rien en attente)." });
    }

    const xml = genererSepaXml({
        debtorName,
        debtorIban,
        transfers: valides.map(x => ({
            creditorName: x.nom_societe,
            creditorIban: x.f_iban,
            amount: Number(x.montant),
            endToEndId: x.reference || x.id.slice(0, 35),
            label: `SESAME bon ${x.reference || x.id.slice(0, 8)}`,
        })),
    });

    // Marquer les bons exportés comme réglés (ordre de paiement émis).
    await query('UPDATE echanges SET paiement_paye_at = now() WHERE id = ANY($1)', [valides.map(x => x.id)]);

    const jour = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="virements-fournisseurs-${jour}.xml"`);
    res.send(xml);
});

// Marquer un bon comme réglé au fournisseur (virement effectué hors app) → date sur l'échange.
router.put('/echanges/:id/payer-fournisseur', async (req, res) => {
    const r = await query(
        `UPDATE echanges SET paiement_paye_at = now()
         WHERE id = $1 AND paiement_paye_at IS NULL RETURNING id`,
        [req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Bon introuvable ou déjà réglé' });
    res.json({ success: true });
});

// Résout un paramètre mois 'YYYY-MM' vers le 1er jour du mois (date). Défaut : mois courant.
function resolveMois(raw: unknown): string {
    if (typeof raw === 'string' && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

// CTE réutilisable : mappe chaque ambassadeur_id (moral lui-même OU employé sous-compte) vers son entreprise.
const AMB_TO_MORAL_CTE = `
    amb_to_moral AS (
        SELECT id AS ambassadeur_id, id AS moral_id
        FROM ambassadeurs
        WHERE type_ambassadeur = 'moral'
        UNION
        SELECT ae.id AS ambassadeur_id, s.ambassadeur_moral_id AS moral_id
        FROM sous_comptes_employes s
        JOIN ambassadeurs ae ON ae.utilisateur_id = s.utilisateur_id
    )`;

// Commissions Ambassadeurs Moraux — pour un mois donné (?mois=YYYY-MM, défaut mois courant).
// Le CA = courses de l'entreprise + celles de ses sous-comptes employés.
// Export SEPA des commissions Moraux d'un mois : génère le fichier .xml des virements
// vers les entreprises (non encore versées) ET les marque versées (anti double-paiement).
// Même générateur que les fournisseurs (lib/sepaXml).
router.get('/sepa/commissions', async (req, res) => {
    const debtorIban = process.env.SESAME_IBAN || '';
    const debtorName = process.env.SESAME_SOCIETE || 'SAS WINWEEN';
    if (!debtorIban) {
        return res.status(400).json({ error: "IBAN de Winween non configuré (SESAME_IBAN dans le .env). Renseignez-le pour générer le fichier SEPA." });
    }

    const rateResult = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);
    const mois = resolveMois(req.query.mois);

    const r = await query(
        `WITH ${AMB_TO_MORAL_CTE},
         agg AS (
            SELECT a.id AS ambassadeur_id, a.iban, a.etablissement,
                   count(c.id) AS nb_courses,
                   COALESCE(sum(c.montant), 0) AS ca_brut_ttc,
                   round(COALESCE(sum(c.montant), 0) * $1 / 100, 2) AS commission
            FROM ambassadeurs a
            LEFT JOIN amb_to_moral m ON m.moral_id = a.id
            LEFT JOIN courses c ON c.ambassadeur_id = m.ambassadeur_id
                AND c.statut = 'terminee' AND c.code_valide_at IS NOT NULL
                AND date_trunc('month', c.date_fin) = $2::date
            WHERE a.type_ambassadeur = 'moral'
              AND NOT EXISTS (
                  SELECT 1 FROM virements_commissions v WHERE v.ambassadeur_id = a.id AND v.mois = $2::date
              )
            GROUP BY a.id, a.iban, a.etablissement
            HAVING COALESCE(sum(c.montant), 0) > 0
         )
         SELECT * FROM agg`,
        [tauxPct, mois]
    );

    const valides = r.rows.filter(x => x.iban && Number(x.commission) > 0);
    if (valides.length === 0) {
        return res.status(400).json({ error: "Aucune commission à exporter (rien en attente, ou IBAN entreprise manquant)." });
    }

    const moisLabel = mois.slice(0, 7);
    const xml = genererSepaXml({
        debtorName,
        debtorIban,
        transfers: valides.map(x => ({
            creditorName: x.etablissement || 'Entreprise',
            creditorIban: x.iban,
            amount: Number(x.commission),
            endToEndId: `COM-${moisLabel}-${x.ambassadeur_id.slice(0, 8)}`,
            label: `Commission SESAME ${moisLabel}`,
        })),
    });

    // Marque versées UNIQUEMENT les entreprises incluses dans le fichier (celles avec IBAN).
    await query(
        `INSERT INTO virements_commissions
            (ambassadeur_id, mois, nb_courses, ca_brut_ttc, taux_pct, montant_commission, statut, date_versement)
         SELECT v.ambassadeur_id, $2::date, v.nb_courses, v.ca_brut_ttc, $1, v.commission, 'verse', now()
         FROM jsonb_to_recordset($3::jsonb)
              AS v(ambassadeur_id uuid, nb_courses int, ca_brut_ttc numeric, commission numeric)
         ON CONFLICT (ambassadeur_id, mois) DO NOTHING`,
        [tauxPct, mois, JSON.stringify(valides.map(x => ({
            ambassadeur_id: x.ambassadeur_id, nb_courses: x.nb_courses, ca_brut_ttc: x.ca_brut_ttc, commission: x.commission,
        })))]
    );

    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="commissions-moraux-${moisLabel}.xml"`);
    res.send(xml);
});

router.get('/commissions/moraux', async (req, res) => {
    const rateResult = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);
    const mois = resolveMois(req.query.mois);

    const result = await query(
        `WITH ${AMB_TO_MORAL_CTE}
         SELECT
            a.id AS ambassadeur_id,
            u.prenom, u.nom, u.email,
            a.etablissement,
            count(c.id) AS nb_courses,
            COALESCE(sum(c.montant), 0) AS ca_brut_ttc,
            round(COALESCE(sum(c.montant), 0) * $1 / 100, 2) AS commission,
            a.iban,
            v.statut AS statut_versement,
            v.date_versement
         FROM ambassadeurs a
         JOIN utilisateurs u ON u.id = a.utilisateur_id
         LEFT JOIN amb_to_moral m ON m.moral_id = a.id
         LEFT JOIN courses c ON c.ambassadeur_id = m.ambassadeur_id
             AND c.statut = 'terminee'
             AND c.code_valide_at IS NOT NULL
             AND date_trunc('month', c.date_fin) = $2::date
         LEFT JOIN virements_commissions v ON v.ambassadeur_id = a.id AND v.mois = $2::date
         WHERE a.type_ambassadeur = 'moral'
         GROUP BY a.id, u.prenom, u.nom, u.email, a.etablissement, a.iban, v.statut, v.date_versement
         ORDER BY ca_brut_ttc DESC`,
        [tauxPct, mois]
    );
    res.json({ taux_pct: tauxPct, mois: mois.slice(0, 7), ambassadeurs: result.rows });
});

// Déclenche (enregistre) les virements de commissions d'un mois donné.
// STRICT : ne traite que les entreprises pas encore versées ce mois (les déjà-versées restent intactes,
// leur date de versement n'est jamais écrasée). Garde-fou contre le double paiement.
// NB : pas encore de vrai virement SEPA (intégration bancaire à brancher), mais la trace est persistée.
router.post('/commissions/declencher', async (req, res) => {
    const rateResult = await query("SELECT valeur FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct'");
    const tauxPct = Number(rateResult.rows[0]?.valeur ?? 10);
    const mois = resolveMois(req.body?.mois);

    const result = await query(
        `WITH ${AMB_TO_MORAL_CTE},
         agg AS (
            SELECT
                a.id AS ambassadeur_id,
                count(c.id) AS nb_courses,
                COALESCE(sum(c.montant), 0) AS ca_brut_ttc,
                round(COALESCE(sum(c.montant), 0) * $1 / 100, 2) AS commission
            FROM ambassadeurs a
            LEFT JOIN amb_to_moral m ON m.moral_id = a.id
            LEFT JOIN courses c ON c.ambassadeur_id = m.ambassadeur_id
                AND c.statut = 'terminee'
                AND c.code_valide_at IS NOT NULL
                AND date_trunc('month', c.date_fin) = $2::date
            WHERE a.type_ambassadeur = 'moral'
              -- on ignore les entreprises déjà versées ce mois
              AND NOT EXISTS (
                  SELECT 1 FROM virements_commissions v
                  WHERE v.ambassadeur_id = a.id AND v.mois = $2::date
              )
            GROUP BY a.id
            HAVING COALESCE(sum(c.montant), 0) > 0
         )
         INSERT INTO virements_commissions
            (ambassadeur_id, mois, nb_courses, ca_brut_ttc, taux_pct, montant_commission, statut, date_versement)
         SELECT ambassadeur_id, $2::date, nb_courses, ca_brut_ttc, $1, commission, 'verse', now()
         FROM agg
         ON CONFLICT (ambassadeur_id, mois) DO NOTHING
         RETURNING montant_commission`,
        [tauxPct, mois]
    );

    const total = result.rows.reduce((s: number, r: any) => s + Number(r.montant_commission), 0);
    res.json({
        success: true,
        mois: mois.slice(0, 7),
        nb_virements: result.rowCount,
        total: Math.round(total * 100) / 100,
        message: `${result.rowCount} virement(s) enregistré(s) pour ${mois.slice(0, 7)}. Intégration bancaire SEPA à brancher.`,
    });
});

// ─── Tickets support (specs §3.6 / §10) ───────────────────────────────────────
// Vue 3 colonnes côté admin : liste / conversation / détail. Filtre optionnel ?statut=.
router.get('/support/tickets', async (req, res) => {
    const statut = typeof req.query.statut === 'string' ? req.query.statut : null;
    const result = await query(
        `SELECT t.id, t.categorie, t.sujet, t.statut, t.course_id, t.created_at, t.updated_at,
                c.reference AS course_reference,
                u.prenom, u.nom, u.email, u.type AS utilisateur_type,
                (SELECT contenu FROM ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at DESC LIMIT 1) AS dernier_message
         FROM tickets t
         JOIN utilisateurs u ON u.id = t.utilisateur_id
         LEFT JOIN courses c ON c.id = t.course_id
         ${statut ? 'WHERE t.statut = $1' : ''}
         ORDER BY (t.statut = 'resolu'), t.updated_at DESC`,
        statut ? [statut] : []
    );
    res.json(result.rows);
});

// Messages d'un ticket.
router.get('/support/tickets/:id/messages', async (req, res) => {
    const t = await query('SELECT id FROM tickets WHERE id = $1', [req.params.id]);
    if (!t.rows.length) return res.status(404).json({ error: 'Ticket introuvable' });
    const result = await query(
        'SELECT id, role, contenu, created_at FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
        [req.params.id]
    );
    res.json(result.rows);
});

// Réponse de l'admin (passe le ticket en cours) + notification push à l'utilisateur.
router.post('/support/tickets/:id/messages', async (req, res) => {
    const { contenu } = req.body;
    if (!contenu || typeof contenu !== 'string' || !contenu.trim()) {
        return res.status(400).json({ error: 'Message vide' });
    }
    const t = await query(
        `SELECT t.id, u.push_token FROM tickets t JOIN utilisateurs u ON u.id = t.utilisateur_id WHERE t.id = $1`,
        [req.params.id]
    );
    if (!t.rows.length) return res.status(404).json({ error: 'Ticket introuvable' });
    await query(
        `INSERT INTO ticket_messages (ticket_id, role, contenu) VALUES ($1,'admin',$2)`,
        [req.params.id, contenu.slice(0, 2000)]
    );
    await query(
        `UPDATE tickets SET updated_at = now(), statut = CASE WHEN statut = 'ouvert' THEN 'en_cours' ELSE statut END WHERE id = $1`,
        [req.params.id]
    );
    const token = t.rows[0].push_token;
    if (token) {
        try { await sendPushNotification(token, 'Réponse du support SESAME', 'Vous avez une nouvelle réponse à votre ticket.'); }
        catch { /* push best-effort */ }
    }
    res.status(201).json({ success: true });
});

// Changement de statut (ouvert | en_cours | resolu).
router.put('/support/tickets/:id', async (req, res) => {
    const { statut } = req.body;
    if (!['ouvert', 'en_cours', 'resolu'].includes(statut)) {
        return res.status(400).json({ error: 'Statut invalide (ouvert | en_cours | resolu).' });
    }
    const result = await query(
        'UPDATE tickets SET statut = $1, updated_at = now() WHERE id = $2 RETURNING id',
        [statut, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Ticket introuvable' });
    res.json({ success: true });
});

// Compteur de tickets non résolus (badge dashboard).
router.get('/support/tickets-count', async (req, res) => {
    const r = await query("SELECT count(*) FROM tickets WHERE statut <> 'resolu'");
    res.json({ count: Number(r.rows[0].count) });
});

export default router;
