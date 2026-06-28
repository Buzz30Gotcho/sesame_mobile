// Exécuté avant le chargement des modules de chaque fichier de test.
// Fournit les secrets minimaux pour que config.ts ne refuse pas de démarrer,
// SANS pointer vers une vraie base : les tests d'intégration ici ne touchent pas la DB.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_at_least_32_chars_long_xxx';
