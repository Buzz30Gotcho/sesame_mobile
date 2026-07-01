import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const dashboardAmb = {
    points_solde: 120, niveau: 'starter', next_level: 'pro', next_level_target: 500, points_to_next_level: 380,
    active_course_count: 0, pending_bons_count: 0, nb_annulations_30j: 0, courses_semaine: 1, courses_mois: 2, points_semaine: 5,
    prenom: 'Alex', code_parrainage: 'ABC123', metier: 'Barbier', etablissement: 'Chez Alex', active_courses: [],
};
const dashboardChf = {
    prenom: 'Chris', disponible: false, documents_valides: true, carte_enregistree: true,
    vehicule_marque: 'Tesla', vehicule_couleur: 'Noir', vehicule_immat: 'AA-123-BB',
    ca_jour: 0, courses_jour: 0, current_course: null, active_courses_count: 0,
};
const profileAmb = {
    prenom: 'Alex', nom: 'Martin', email: 'a@t.fr', telephone: '0600000000', metier: 'Barbier', etablissement: 'Chez Alex',
    type_ambassadeur: 'physique', siret: null, iban: null, code_parrainage: 'ABC123', points_solde: 120, niveau: 'starter', is_sous_compte: false,
};
const profileChf = { prenom: 'Chris', nom: 'Bee', email: 'c@t.fr', telephone: '0600000000', disponible: false, iban: null, siret: null,
    vehicule_type: 'berline', vehicule_marque: 'Tesla', vehicule_modele: 'Model 3', vehicule_couleur: 'Noir', vehicule_immat: 'AA-123-BB' };

jest.mock('../../src/services/api', () => ({
    getChatMessages: jest.fn(() => Promise.resolve({ data: [] })),
    sendChatMessage: jest.fn(() => Promise.resolve({ data: {} })),
    getWsUrl: jest.fn(() => 'ws://x/ws/chat/co1?token='),
    getAmbassadorDashboard: jest.fn(() => Promise.resolve({ data: dashboardAmb })),
    getAdminParameters: jest.fn(() => Promise.resolve({ data: { mode_course_immediate: 'true' } })),
    getCommissions: jest.fn(() => Promise.resolve({ data: { mois: [], taux_pct: 10, total_commission: 0 } })),
    getEquipe: jest.fn(() => Promise.resolve({ data: [] })),
    getAmbassadorProfile: jest.fn(() => Promise.resolve({ data: profileAmb })),
    getFilleuls: jest.fn(() => Promise.resolve({ data: [] })),
    getCoursesHistory: jest.fn(() => Promise.resolve({ data: [] })),
    cancelCourse: jest.fn(() => Promise.resolve({ data: {} })),
    createCourse: jest.fn(() => Promise.resolve({ data: { id: 'co1' } })),
    estimerCourse: jest.fn(() => Promise.resolve({ kilometrage: 10, prix_berline: 20, prix_van: 24 })),
    getChauffeurProfile: jest.fn(() => Promise.resolve({ data: profileChf })),
    getChauffeurDocuments: jest.fn(() => Promise.resolve({ data: [] })),
    getChauffeurDashboard: jest.fn(() => Promise.resolve({ data: dashboardChf })),
    getCoursesDisponibles: jest.fn(() => Promise.resolve({ data: [] })),
    getChauffeurSetupCard: jest.fn(() => Promise.resolve({ data: { url: 'https://x' } })),
    setChauffeurAvailability: jest.fn(() => Promise.resolve({ data: {} })),
    updateChauffeurProfile: jest.fn(() => Promise.resolve({ data: profileChf })),
    uploadChauffeurDocument: jest.fn(() => Promise.resolve({ id: 'd1' })),
    acceptChauffeurCourse: jest.fn(() => Promise.resolve({ data: {} })),
    markChauffeurArrived: jest.fn(() => Promise.resolve({ data: {} })),
    finishChauffeurCourse: jest.fn(() => Promise.resolve({ data: {} })),
    signalerClientAbsent: jest.fn(() => Promise.resolve({ data: {} })),
    validateCourseCode: jest.fn(() => Promise.resolve({ data: {} })),
    updateChauffeurPosition: jest.fn(() => Promise.resolve({ data: {} })),
    register: jest.fn(() => Promise.resolve({ data: { token: 'jwt', userId: 'u1', role: 'chauffeur', chauffeur_id: 'c1' } })),
    setAuthToken: jest.fn(),
}));

const authValue: any = { current: {} };
jest.mock('../../src/context/AuthContext', () => ({
    useAuth: () => authValue.current,
    AuthProvider: ({ children }: any) => children,
}));
jest.mock('../../src/services/notifications', () => ({ registerForPushNotifications: jest.fn(() => Promise.resolve()) }));
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
    useRoute: () => ({ params: { courseId: 'co1', senderRole: 'ambassadeur', senderId: 'a1', courseRef: 'CRS-1' } }),
    useIsFocused: () => true,
    useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => { const r = cb(); return typeof r === 'function' ? r : undefined; }, []); },
}));

// WebSocket minimal pour ChatScreen
(global as any).WebSocket = class { close = jest.fn(); send = jest.fn(); onopen: any; onmessage: any; onerror: any; onclose: any; };

import ChatScreen from '../../src/screens/ChatScreen';
import AmbassadorAccueilScreen from '../../src/screens/AmbassadorAccueilScreen';
import AmbassadorParrainageScreen from '../../src/screens/AmbassadorParrainageScreen';
import AmbassadorVTCScreen from '../../src/screens/AmbassadorVTCScreen';
import AmbassadorCommanderScreen from '../../src/screens/AmbassadorCommanderScreen';
import ChauffeurProfileScreen from '../../src/screens/ChauffeurProfileScreen';
import ChauffeurHomeScreen from '../../src/screens/ChauffeurHomeScreen';
import RegisterScreen from '../../src/screens/RegisterScreen';
import { getChatMessages, getAmbassadorDashboard, getFilleuls, getCoursesHistory, getChauffeurProfile, getChauffeurDashboard } from '../../src/services/api';

const physique = { ambassadorId: 'a1', chauffeurId: null, typeAmbassadeur: 'physique', isSousCompte: false, email: 'a@t.fr' };
const chauffeur = { ambassadorId: null, chauffeurId: 'c1', typeAmbassadeur: null, isSousCompte: false, email: 'c@t.fr' };

describe('Écrans — lot 3 (lourds)', () => {
    it('ChatScreen se connecte et charge les messages', async () => {
        authValue.current = physique;
        const { toJSON } = render(<ChatScreen />);
        await waitFor(() => expect(getChatMessages).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorAccueilScreen charge le dashboard', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorAccueilScreen />);
        await waitFor(() => expect(getAmbassadorDashboard).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorParrainageScreen charge profil + filleuls', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorParrainageScreen />);
        await waitFor(() => expect(getFilleuls).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorVTCScreen charge dashboard + historique', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorVTCScreen />);
        await waitFor(() => expect(getCoursesHistory).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorCommanderScreen se rend', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorCommanderScreen />);
        await waitFor(() => expect(toJSON()).toBeTruthy());
    });

    it('ChauffeurProfileScreen charge le profil', async () => {
        authValue.current = chauffeur;
        const { toJSON } = render(<ChauffeurProfileScreen />);
        await waitFor(() => expect(getChauffeurProfile).toHaveBeenCalledWith('c1'));
        expect(toJSON()).toBeTruthy();
    });

    it('ChauffeurHomeScreen charge le dashboard', async () => {
        authValue.current = chauffeur;
        const { toJSON } = render(<ChauffeurHomeScreen />);
        await waitFor(() => expect(getChauffeurDashboard).toHaveBeenCalledWith('c1'));
        expect(toJSON()).toBeTruthy();
    });

    it('RegisterScreen se rend (prop navigation/route)', () => {
        authValue.current = physique;
        const navigation: any = { replace: jest.fn(), navigate: jest.fn(), goBack: jest.fn() };
        const { toJSON } = render(<RegisterScreen navigation={navigation} route={{ key: 'r', name: 'Register', params: { initialRole: 'chauffeur' } } as any} />);
        expect(toJSON()).toBeTruthy();
    });
});
