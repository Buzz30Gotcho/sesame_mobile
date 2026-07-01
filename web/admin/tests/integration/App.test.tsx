import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

vi.mock('../../src/api', () => ({
    adminLogin: vi.fn(() => Promise.resolve('tok')),
    getDashboard: vi.fn(() => Promise.resolve({
        totalCourses: 0, totalAmbassadeurs: 0, totalChauffeurs: 0, chauffeursActifs: 0, pendingExchanges: 0,
        ambassadeursSuspendus: 0, kbis_expiring_soon: 0, litigesOuverts: 0, ticketsOuverts: 0, caBrut: 0,
        coursesEnCours: 0, coursesTerminees: 0, coursesAnnulees: 0, coursesParJour: [], top5Ambassadeurs: [],
    })),
    getSanctionsEnAttente: vi.fn(() => Promise.resolve([])),
    // fns référencées par les sections importées (non rendues ici) — présence suffit
    getCourses: vi.fn(() => Promise.resolve([])), getEchangesEnAttente: vi.fn(() => Promise.resolve([])),
    getAmbassadeurs: vi.fn(() => Promise.resolve([])), getChauffeurs: vi.fn(() => Promise.resolve([])),
    getFournisseurs: vi.fn(() => Promise.resolve([])), getBlacklist: vi.fn(() => Promise.resolve([])),
    getBlacklistPropositions: vi.fn(() => Promise.resolve([])), getLitiges: vi.fn(() => Promise.resolve([])),
    getTickets: vi.fn(() => Promise.resolve([])), getCommissionsMoraux: vi.fn(() => Promise.resolve({ taux_pct: 10, ambassadeurs: [] })),
    getParametres: vi.fn(() => Promise.resolve([])), getAdmins: vi.fn(() => Promise.resolve({ fondateur: null, comptes: [] })),
    getAdminRole: vi.fn(() => 'super_admin'),
}));

import App from '../../src/App';
import { PrefsProvider } from '../../src/prefs';

const renderApp = () => render(<PrefsProvider><App /></PrefsProvider>);

beforeEach(() => { localStorage.clear(); });

describe('<App>', () => {
    it('affiche la page de connexion sans token', () => {
        const { container } = renderApp();
        // Un champ de saisie (email/mot de passe) est présent sur l'écran de login.
        expect(container.querySelector('input')).toBeTruthy();
    });

    it('affiche le shell + la vue générale quand un token est présent', async () => {
        localStorage.setItem('admin_token', 'tok');
        renderApp();
        await waitFor(() => expect(screen.getAllByText('Vue générale').length).toBeGreaterThan(0));
    });
});
