// Exécuté AVANT le chargement des modules de chaque fichier de test (setupFiles).
// Pointe la connexion vers le Postgres de test (conteneur Docker géré par globalSetup)
// et fournit les secrets minimaux pour que config.ts démarre.
import { TEST_DATABASE_URL } from './helpers/testConfig';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_at_least_32_chars_long_xxx';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';
