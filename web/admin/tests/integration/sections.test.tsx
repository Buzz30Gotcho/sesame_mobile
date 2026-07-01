import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React from 'react';

// Mock du client API : chaque section charge ses données au montage. On renvoie des
// formes minimales valides pour couvrir le rendu sans backend.
vi.mock('../../src/api', () => ({
    getCommissionsMoraux: vi.fn(() => Promise.resolve({ taux_pct: 10, mois: '2026-06', ambassadeurs: [] })),
    exporterSepaCommissions: vi.fn(() => Promise.resolve()),
    getParametres: vi.fn(() => Promise.resolve([])),
    updateParametre: vi.fn(() => Promise.resolve({})),
    getAdmins: vi.fn(() => Promise.resolve({ fondateur: 'f@t.fr', comptes: [] })),
    getAdminRole: vi.fn(() => 'super_admin'),
    createAdmin: vi.fn(() => Promise.resolve({})),
    updateAdmin: vi.fn(() => Promise.resolve({})),
    deleteAdmin: vi.fn(() => Promise.resolve({})),
    getFournisseurs: vi.fn(() => Promise.resolve([])),
    createFournisseur: vi.fn(() => Promise.resolve({})),
    updateFournisseur: vi.fn(() => Promise.resolve({})),
    envoyerContratFournisseur: vi.fn(() => Promise.resolve({})),
    annulerContratFournisseur: vi.fn(() => Promise.resolve({})),
    regenererCodeFournisseur: vi.fn(() => Promise.resolve({ code_secret_temporaire: '1234' })),
    getContratPreviewUrl: vi.fn(() => Promise.resolve('blob:x')),
    exporterSepaFournisseurs: vi.fn(() => Promise.resolve()),
    getChauffeurs: vi.fn(() => Promise.resolve([])),
    updateChauffeurTaux: vi.fn(() => Promise.resolve({})),
    getChauffeurDocuments: vi.fn(() => Promise.resolve([])),
    validerDocument: vi.fn(() => Promise.resolve({})),
    refuserDocument: vi.fn(() => Promise.resolve({})),
    updateChauffeurStatut: vi.fn(() => Promise.resolve({})),
    updateChauffeurNote: vi.fn(() => Promise.resolve({})),
    getControleIdentite: vi.fn(() => Promise.resolve({ historique: [] })),
    enregistrerControleIdentite: vi.fn(() => Promise.resolve({ suspendu: false })),
    getPaiementsFournisseur: vi.fn(() => Promise.resolve({ kpis: { paye_ce_mois: 0, en_attente: 0, bons_valides: 0, prix_moyen: 0 }, transactions: [] })),
    marquerPaiementPaye: vi.fn(() => Promise.resolve({})),
    getDashboard: vi.fn(() => Promise.resolve({
        totalCourses: 0, totalAmbassadeurs: 0, totalChauffeurs: 0, chauffeursActifs: 0, pendingExchanges: 0,
        ambassadeursSuspendus: 0, kbis_expiring_soon: 0, litigesOuverts: 0, ticketsOuverts: 0, caBrut: 0,
        coursesEnCours: 0, coursesTerminees: 0, coursesAnnulees: 0, coursesParJour: [], top5Ambassadeurs: [],
    })),
    getSanctionsEnAttente: vi.fn(() => Promise.resolve([])),
    getAmbassadeurs: vi.fn(() => Promise.resolve([])),
    validerAmbassadeurMoral: vi.fn(() => Promise.resolve({})),
    getCourses: vi.fn(() => Promise.resolve([])),
    annulerCourse: vi.fn(() => Promise.resolve({})),
    assignerChauffeur: vi.fn(() => Promise.resolve({})),
    getEchangesEnAttente: vi.fn(() => Promise.resolve([])),
    refuserEchange: vi.fn(() => Promise.resolve({})),
    validerEchange: vi.fn(() => Promise.resolve({})),
    arbitrerAlerte: vi.fn(() => Promise.resolve({})),
    getBlacklist: vi.fn(() => Promise.resolve([])),
    getBlacklistPropositions: vi.fn(() => Promise.resolve([])),
    addBlacklist: vi.fn(() => Promise.resolve({})),
    deleteBlacklist: vi.fn(() => Promise.resolve({})),
    confirmerBlacklistProposition: vi.fn(() => Promise.resolve({})),
    rejeterBlacklistProposition: vi.fn(() => Promise.resolve({})),
    getLitiges: vi.fn(() => Promise.resolve([])),
    creerLitige: vi.fn(() => Promise.resolve({})),
    updateLitige: vi.fn(() => Promise.resolve({})),
    getChatMessages: vi.fn(() => Promise.resolve([])),
    sendChatMessage: vi.fn(() => Promise.resolve({})),
    getTickets: vi.fn(() => Promise.resolve([])),
    getTicketMessages: vi.fn(() => Promise.resolve([])),
    repondreTicket: vi.fn(() => Promise.resolve({})),
    updateTicketStatut: vi.fn(() => Promise.resolve({})),
    getOffres: vi.fn(() => Promise.resolve([])),
    createOffre: vi.fn(() => Promise.resolve({})),
    updateOffre: vi.fn(() => Promise.resolve({})),
    deleteOffre: vi.fn(() => Promise.resolve({})),
}));

import { PrefsProvider } from '../../src/prefs';
import CommissionsMoraux from '../../src/sections/CommissionsMoraux';
import Parametres from '../../src/sections/Parametres';
import Fournisseurs from '../../src/sections/Fournisseurs';
import Chauffeurs from '../../src/sections/Chauffeurs';
import HistoriqueModal from '../../src/sections/HistoriqueModal';
import Dashboard from '../../src/sections/Dashboard';
import Ambassadeurs from '../../src/sections/Ambassadeurs';
import Courses from '../../src/sections/Courses';
import Echanges from '../../src/sections/Echanges';
import Alertes from '../../src/sections/Alertes';
import Blacklist from '../../src/sections/Blacklist';
import Litiges from '../../src/sections/Litiges';
import Support from '../../src/sections/Support';
import Tickets from '../../src/sections/Tickets';
import OffresModal from '../../src/sections/OffresModal';
import {
    getCommissionsMoraux, getParametres, getFournisseurs, getChauffeurs, getPaiementsFournisseur,
    getDashboard, getAmbassadeurs, getCourses, getEchangesEnAttente, getSanctionsEnAttente,
    getBlacklist, getLitiges, getTickets, getOffres,
} from '../../src/api';

const withPrefs = (ui: React.ReactElement) => render(<PrefsProvider>{ui}</PrefsProvider>);

beforeEach(() => { localStorage.clear(); });

describe('Sections admin (rendu + chargement)', () => {
    it('CommissionsMoraux charge les commissions du mois', async () => {
        const { container } = withPrefs(<CommissionsMoraux />);
        await waitFor(() => expect(getCommissionsMoraux).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Parametres charge paramètres + comptes admin', async () => {
        const { container } = withPrefs(<Parametres />);
        await waitFor(() => expect(getParametres).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Fournisseurs charge la liste', async () => {
        const { container } = withPrefs(<Fournisseurs />);
        await waitFor(() => expect(getFournisseurs).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Chauffeurs charge la liste', async () => {
        const { container } = withPrefs(<Chauffeurs />);
        await waitFor(() => expect(getChauffeurs).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('HistoriqueModal charge les paiements du fournisseur', async () => {
        const onClose = vi.fn();
        const { container } = withPrefs(
            <HistoriqueModal fournisseur={{ id: 'f1', nom_societe: 'ACME' } as any} onClose={onClose} />
        );
        await waitFor(() => expect(getPaiementsFournisseur).toHaveBeenCalledWith('f1'));
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Dashboard charge KPIs + sanctions', async () => {
        const { container } = withPrefs(<Dashboard />);
        await waitFor(() => expect(getDashboard).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Ambassadeurs charge la liste', async () => {
        const { container } = withPrefs(<Ambassadeurs />);
        await waitFor(() => expect(getAmbassadeurs).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Courses charge la liste', async () => {
        const { container } = withPrefs(<Courses />);
        await waitFor(() => expect(getCourses).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Echanges charge les bons en attente', async () => {
        const { container } = withPrefs(<Echanges />);
        await waitFor(() => expect(getEchangesEnAttente).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Alertes charge les sanctions en attente', async () => {
        const { container } = withPrefs(<Alertes />);
        await waitFor(() => expect(getSanctionsEnAttente).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Blacklist charge liste + propositions', async () => {
        const { container } = withPrefs(<Blacklist />);
        await waitFor(() => expect(getBlacklist).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Litiges charge la liste', async () => {
        const { container } = withPrefs(<Litiges />);
        await waitFor(() => expect(getLitiges).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('Support charge les courses', async () => {
        const { container } = withPrefs(<Support />);
        await waitFor(() => expect(container).not.toBeEmptyDOMElement());
    });

    it('Tickets charge la liste', async () => {
        const { container } = withPrefs(<Tickets />);
        await waitFor(() => expect(getTickets).toHaveBeenCalled());
        expect(container).not.toBeEmptyDOMElement();
    });

    it('OffresModal charge les offres du fournisseur', async () => {
        const { container } = withPrefs(
            <OffresModal fournisseur={{ id: 'f1', nom_societe: 'ACME' } as any} onClose={vi.fn()} />
        );
        await waitFor(() => expect(getOffres).toHaveBeenCalledWith('f1'));
        expect(container).not.toBeEmptyDOMElement();
    });
});
