import { rateLimit } from 'express-rate-limit';

// Anti-brute-force sur l'authentification (connexion, mot de passe oublié/réinitialisation).
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

// Anti-brute-force sur le login admin (compte le plus privilégié) — le plus strict.
export const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});

// Anti-brute-force sur la validation du code 4 chiffres (pivot juridique) — plus strict.
export const codeLimiter = rateLimit({
    windowMs: 10 * 60 * 1000, // 10 min
    limit: 15,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: "Trop d'essais de code. Réessayez dans quelques minutes." },
});

// Anti-spam sur la création de comptes (inscription) — limite par IP.
export const inscriptionLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 h
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives de création de compte. Réessayez plus tard.' },
});

// Validation des bons côté fournisseur (endpoint public, page web sans login) —
// limite par IP pour empêcher l'énumération de token_qr et l'abus du verrouillage fournisseur.
export const fournisseurLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
});
