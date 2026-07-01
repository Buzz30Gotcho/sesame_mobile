/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // Les tests vivent dans tests/ (unit + integration), séparés du code de prod (src/).
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    // Variables d'env nécessaires AVANT le chargement des modules (ex. config.ts exige JWT_SECRET).
    setupFiles: ['<rootDir>/tests/setup.ts'],
    // Mocks I/O externes (Stripe, mail, push, fetch) + reset DB entre tests.
    setupFilesAfterEnv: ['<rootDir>/tests/setupAfterEnv.ts'],
    // Démarre/arrête le Postgres de test (Docker) + migrations, une fois pour toute la suite.
    globalSetup: '<rootDir>/tests/globalSetup.ts',
    globalTeardown: '<rootDir>/tests/globalTeardown.ts',
    // Les helpers ne sont pas des suites de test.
    testPathIgnorePatterns: ['/node_modules/', '<rootDir>/tests/helpers/'],
    clearMocks: true,
    // Base Postgres unique partagée : exécution en série pour éviter les courses
    // de données entre fichiers (le TRUNCATE d'un fichier impacterait un autre en parallèle).
    maxWorkers: 1,
    // bcrypt + requêtes conteneur : marge confortable.
    testTimeout: 30000,
    // Couverture mesurée sur la logique métier (lib), les routes, middlewares et le hub WS.
    // On exclut les scripts utilitaires one-shot (hors application) et le point d'entrée serveur.
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
        '!src/seed.ts',
        '!src/clean.ts',
        '!src/check_user.ts',
        '!src/genhash.ts',
        '!src/verify_pass.ts',
    ],
};
