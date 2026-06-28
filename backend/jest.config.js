/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    // Les tests vivent dans tests/ (unit + integration), séparés du code de prod (src/).
    roots: ['<rootDir>/tests'],
    testMatch: ['**/*.test.ts'],
    // Variables d'env nécessaires AVANT le chargement des modules (ex. config.ts exige JWT_SECRET).
    setupFiles: ['<rootDir>/tests/setup.ts'],
    clearMocks: true,
    // Le Pool pg est instancié à l'import (sans se connecter) ; il laisse un handle ouvert.
    // forceExit évite l'avertissement "worker failed to exit" sans masquer de vraie fuite.
    forceExit: true,
    // Couverture mesurée sur la logique métier (lib) et les routes.
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};
