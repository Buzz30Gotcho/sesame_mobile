/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Config de test séparée de vite.config.ts pour ne pas alourdir le build.
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,          // describe/it/expect sans import
        environment: 'jsdom',   // DOM + localStorage pour les composants React
        setupFiles: ['./tests/setup.ts'],
        // Tous les tests vivent dans tests/ (unit + integration), séparés du code (src/).
        include: ['tests/**/*.test.{ts,tsx}'],
        coverage: {
            provider: 'v8',
            include: ['src/**/*.{ts,tsx}'],
            // Exclus : point d'entrée, dictionnaire i18n (3200 l de chaînes statiques),
            // et déclarations de types (pas de logique exécutable).
            exclude: ['src/main.tsx', 'src/prefs.tsx', 'src/**/*.d.ts', 'src/vite-env.d.ts'],
        },
    },
});
