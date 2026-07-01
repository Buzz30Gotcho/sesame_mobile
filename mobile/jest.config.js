/** @type {import('jest').Config} */
module.exports = {
    // Preset officiel Expo : transforme TSX/RN, fournit les mocks des modules natifs.
    preset: 'jest-expo',
    setupFilesAfterEnv: ['@testing-library/jest-native/extend-expect', '<rootDir>/tests/nativeMocks.js'],
    // Les tests vivent dans tests/ ; on inclut aussi src/ dans les roots pour que la
    // couverture instrumente TOUT le code applicatif (même les fichiers non encore importés
    // par un test — sinon les écrans non testés n'apparaîtraient pas dans le rapport).
    roots: ['<rootDir>/tests', '<rootDir>/src'],
    // Laisse Babel transpiler les paquets RN/Expo livrés en ESM (sinon "unexpected token import").
    transformIgnorePatterns: [
        'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@react-navigation/.*|react-native-svg))',
    ],
    testMatch: ['**/*.test.ts', '**/*.test.tsx'],
    // Couverture mesurée sur tout le code applicatif (pas seulement les fichiers importés),
    // pour refléter la vraie progression écran par écran.
    collectCoverageFrom: [
        'src/**/*.{ts,tsx}',
        '!src/**/*.d.ts',
        '!src/types.ts',
        '!src/lib/supabase.ts',
    ],
};
