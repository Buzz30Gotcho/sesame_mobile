// Configuration centralisée + validation des secrets au démarrage.
// Refuse de démarrer si un secret critique manque (évite tout fallback faible en prod).

export const IS_PROD = process.env.NODE_ENV === 'production';

const secret = process.env.JWT_SECRET;
if (!secret || secret.length < 32) {
    throw new Error(
        'JWT_SECRET manquant ou trop court (>= 32 caractères requis). ' +
        'Définissez-le dans les variables d\'environnement — refus de démarrer pour raisons de sécurité.'
    );
}
export const JWT_SECRET: string = secret;
