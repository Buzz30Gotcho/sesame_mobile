/** @type {import('jest').Config} */
module.exports = {
    // Preset officiel Expo : transforme TSX/RN, fournit les mocks des modules natifs.
    preset: 'jest-expo',
    setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect'],
    // Tous les tests vivent dans tests/ (unit + integration), séparés du code (src/).
    roots: ['<rootDir>/tests'],
    // Laisse Babel transpiler les paquets RN/Expo livrés en ESM (sinon "unexpected token import").
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|react-native-svg))',
    ],
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
};
