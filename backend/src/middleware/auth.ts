import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db';
import { JWT_SECRET } from '../config';

// Étend Request avec l'identité authentifiée (id utilisateur extrait du token + ids métier en cache).
export interface AuthedRequest extends express.Request {
    userId?: string;
    isAdmin?: boolean;
    _identity?: { ambassadeurId: string | null; chauffeurId: string | null };
}

// Exige un token JWT valide. Bloque (401) si absent/invalide/expiré.
// Accepte tout token signé : utilisateur (sub = id utilisateur) ou admin (role = 'admin').
export function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentification requise' });
    }
    try {
        const payload = jwt.verify(auth.slice(7), JWT_SECRET) as { sub?: string; role?: string };
        (req as AuthedRequest).userId = payload.sub;
        (req as AuthedRequest).isAdmin = payload.role === 'admin';
        next();
    } catch {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
}

// Résout (et met en cache) les ids métier (ambassadeur, chauffeur) liés à l'utilisateur du token.
export async function resolveIdentity(req: AuthedRequest) {
    if (req._identity) return req._identity;
    const r = await query(
        `SELECT (SELECT id FROM ambassadeurs WHERE utilisateur_id = $1 LIMIT 1) AS amb,
                (SELECT id FROM chauffeurs  WHERE utilisateur_id = $1 LIMIT 1) AS chf`,
        [req.userId]
    );
    req._identity = { ambassadeurId: r.rows[0]?.amb ?? null, chauffeurId: r.rows[0]?.chf ?? null };
    return req._identity;
}

// router.param('id') — :id = ambassadeur_id, doit appartenir au token.
// (try/catch : les callbacks router.param ne sont pas couverts par express-async-errors.)
export async function ownAmbassadeurParam(req: express.Request, res: express.Response, next: express.NextFunction, id: string) {
    try {
        const r = req as AuthedRequest;
        if (r.isAdmin) return next();
        const ident = await resolveIdentity(r);
        if (ident.ambassadeurId && ident.ambassadeurId === id) return next();
        return res.status(403).json({ error: 'Accès refusé' });
    } catch {
        return res.status(500).json({ error: 'Erreur de vérification' });
    }
}

// router.param('id') — :id = chauffeur_id, doit appartenir au token.
export async function ownChauffeurParam(req: express.Request, res: express.Response, next: express.NextFunction, id: string) {
    try {
        const r = req as AuthedRequest;
        if (r.isAdmin) return next();
        const ident = await resolveIdentity(r);
        if (ident.chauffeurId && ident.chauffeurId === id) return next();
        return res.status(403).json({ error: 'Accès refusé' });
    } catch {
        return res.status(500).json({ error: 'Erreur de vérification' });
    }
}

// router.param('id'|'courseId') — la course doit impliquer le token (en tant qu'ambassadeur OU chauffeur).
export async function ownCourseParam(req: express.Request, res: express.Response, next: express.NextFunction, courseId: string) {
    try {
        const r = req as AuthedRequest;
        if (r.isAdmin) return next();
        const ident = await resolveIdentity(r);
        const result = await query('SELECT ambassadeur_id, chauffeur_id FROM courses WHERE id = $1', [courseId]);
        const c = result.rows[0];
        if (!c) return res.status(404).json({ error: 'Course introuvable' });
        if (c.ambassadeur_id === ident.ambassadeurId || c.chauffeur_id === ident.chauffeurId) return next();
        return res.status(403).json({ error: 'Accès refusé' });
    } catch {
        return res.status(500).json({ error: 'Erreur de vérification' });
    }
}

// Middleware — l'ambassadeur_id / chauffeur_id fourni (body ou query) doit correspondre au token.
export async function ownActorBodyQuery(req: express.Request, res: express.Response, next: express.NextFunction) {
    const r = req as AuthedRequest;
    if (r.isAdmin) return next();
    const ident = await resolveIdentity(r);
    const ambId = (req.body && req.body.ambassadeur_id) || (req.query && req.query.ambassadeur_id);
    const chfId = (req.body && req.body.chauffeur_id) || (req.query && req.query.chauffeur_id);
    if (ambId && ambId !== ident.ambassadeurId) return res.status(403).json({ error: 'Accès refusé' });
    if (chfId && chfId !== ident.chauffeurId) return res.status(403).json({ error: 'Accès refusé' });
    next();
}

// Middleware — :id = echange (bon), doit appartenir au token.
export async function ownEchangeParam(req: express.Request, res: express.Response, next: express.NextFunction) {
    const r = req as AuthedRequest;
    if (r.isAdmin) return next();
    const ident = await resolveIdentity(r);
    const result = await query('SELECT ambassadeur_id FROM echanges WHERE id = $1', [req.params.id]);
    const e = result.rows[0];
    if (!e) return res.status(404).json({ error: 'Bon introuvable' });
    if (e.ambassadeur_id === ident.ambassadeurId) return next();
    return res.status(403).json({ error: 'Accès refusé' });
}
