import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';

// Mocks : API, Supabase, identité. useTheme fonctionne sans provider (contexte a une valeur par défaut).
jest.mock('../../src/services/api', () => ({
    getMyTickets: jest.fn(() => Promise.resolve({ data: [] })),
    createTicket: jest.fn(() => Promise.resolve({ data: { id: 't1' } })),
    getTicketMessages: jest.fn(() => Promise.resolve({ data: [] })),
    sendTicketMessage: jest.fn(() => Promise.resolve({ data: { success: true } })),
    getChauffeurCourses: jest.fn(() => Promise.resolve({ data: [] })),
    getChauffeurBillingPortal: jest.fn(() => Promise.resolve({ data: { url: 'https://x' } })),
    getCommissions: jest.fn(() => Promise.resolve({ data: { mois: [], taux_pct: 10, total_commission: 0 } })),
}));
jest.mock('../../src/lib/supabase', () => ({
    supabase: { from: () => ({ select: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) },
}));
jest.mock('../../src/context/AuthContext', () => ({
    useAuth: () => ({ ambassadorId: 'a1', chauffeurId: 'c1', typeAmbassadeur: 'moral', isSousCompte: false, email: 'e@t.fr' }),
    AuthProvider: ({ children }: any) => children,
}));
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
    useRoute: () => ({ params: { ticketId: 't1', titre: 'Sujet test' } }),
    useIsFocused: () => true,
    useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => { const r = cb(); return typeof r === 'function' ? r : undefined; }, []); },
}));

import HomeScreen from '../../src/screens/HomeScreen';
import OnboardingScreen from '../../src/screens/OnboardingScreen';
import TicketsScreen from '../../src/screens/TicketsScreen';
import TicketDetailScreen from '../../src/screens/TicketDetailScreen';
import ChauffeurRevenusScreen from '../../src/screens/ChauffeurRevenusScreen';
import AmbassadorCommissionsScreen from '../../src/screens/AmbassadorCommissionsScreen';
import { getMyTickets, getChauffeurCourses, getCommissions } from '../../src/services/api';

describe('Écrans — lot 1 (rendu + chargement)', () => {
    it('HomeScreen affiche le titre', async () => {
        const { getByText } = render(<HomeScreen />);
        expect(getByText('Bienvenue sur SESAME')).toBeTruthy();
        await waitFor(() => expect(getByText(/Aucune course/)).toBeTruthy());
    });

    it('OnboardingScreen se rend sans crash', () => {
        expect(render(<OnboardingScreen />).toJSON()).toBeTruthy();
    });

    it('TicketsScreen charge la liste des tickets', async () => {
        const { toJSON } = render(<TicketsScreen />);
        await waitFor(() => expect(getMyTickets).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('TicketDetailScreen charge les messages du ticket', async () => {
        const { toJSON } = render(<TicketDetailScreen />);
        await waitFor(() => expect(toJSON()).toBeTruthy());
    });

    it('ChauffeurRevenusScreen charge les courses', async () => {
        const { toJSON } = render(<ChauffeurRevenusScreen />);
        await waitFor(() => expect(getChauffeurCourses).toHaveBeenCalledWith('c1'));
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorCommissionsScreen charge les commissions', async () => {
        const { toJSON } = render(<AmbassadorCommissionsScreen />);
        await waitFor(() => expect(getCommissions).toHaveBeenCalledWith('a1'));
        expect(toJSON()).toBeTruthy();
    });
});
