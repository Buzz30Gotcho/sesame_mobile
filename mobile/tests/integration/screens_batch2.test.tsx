import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

const dashboard = {
    points_solde: 120, niveau: 'starter', next_level: 'pro', next_level_target: 500, points_to_next_level: 380,
    active_course_count: 0, pending_bons_count: 0, nb_annulations_30j: 0, courses_semaine: 1, courses_mois: 2, points_semaine: 5,
    prenom: 'Alex', code_parrainage: 'ABC123', metier: 'Barbier', etablissement: 'Chez Alex', active_courses: [],
};
const profile = {
    prenom: 'Alex', nom: 'Martin', email: 'a@t.fr', telephone: '0600000000', metier: 'Barbier', etablissement: 'Chez Alex',
    type_ambassadeur: 'physique', siret: null, iban: null, code_parrainage: 'ABC123', points_solde: 120, niveau: 'starter', is_sous_compte: false,
};

jest.mock('../../src/services/api', () => ({
    getChauffeurCourses: jest.fn(() => Promise.resolve({ data: [] })),
    acceptChauffeurCourse: jest.fn(() => Promise.resolve({ data: {} })),
    finishChauffeurCourse: jest.fn(() => Promise.resolve({ data: {} })),
    getEquipe: jest.fn(() => Promise.resolve({ data: [] })),
    addEquipeEmployee: jest.fn(() => Promise.resolve({ data: {} })),
    updateEmployeStatut: jest.fn(() => Promise.resolve({ data: {} })),
    getBonList: jest.fn(() => Promise.resolve({ data: [] })),
    getOffers: jest.fn(() => Promise.resolve({ data: [] })),
    createExchange: jest.fn(() => Promise.resolve({ data: {} })),
    getAmbassadorDashboard: jest.fn(() => Promise.resolve({ data: dashboard })),
    getAmbassadorProfile: jest.fn(() => Promise.resolve({ data: profile })),
    updateAmbassadorProfile: jest.fn(() => Promise.resolve({ data: profile })),
    FOURNISSEUR_VALIDER_URL: 'https://x/valider',
}));

const authValue: any = { current: {} };
jest.mock('../../src/context/AuthContext', () => ({
    useAuth: () => authValue.current,
    AuthProvider: ({ children }: any) => children,
}));
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), addListener: jest.fn(() => jest.fn()) }),
    useRoute: () => ({ params: { bonId: 'b1' } }),
    useIsFocused: () => true,
    useFocusEffect: (cb: any) => { const React = require('react'); React.useEffect(() => { const r = cb(); return typeof r === 'function' ? r : undefined; }, []); },
}));

import ChauffeurCoursesScreen from '../../src/screens/ChauffeurCoursesScreen';
import AmbassadorEquipeScreen from '../../src/screens/AmbassadorEquipeScreen';
import AmbassadorQRCodeScreen from '../../src/screens/AmbassadorQRCodeScreen';
import AmbassadorBoutiqueScreen from '../../src/screens/AmbassadorBoutiqueScreen';
import AmbassadorNiveauxScreen from '../../src/screens/AmbassadorNiveauxScreen';
import AmbassadorProfilScreen from '../../src/screens/AmbassadorProfilScreen';
import AmbassadorBonsCadeauxScreen from '../../src/screens/AmbassadorBonsCadeauxScreen';
import { getChauffeurCourses, getEquipe, getAmbassadorDashboard, getAmbassadorProfile, getBonList } from '../../src/services/api';

const physique = { ambassadorId: 'a1', chauffeurId: 'c1', typeAmbassadeur: 'physique', isSousCompte: false, email: 'a@t.fr' };
const moral = { ambassadorId: 'a1', chauffeurId: null, typeAmbassadeur: 'moral', isSousCompte: false, email: 'a@t.fr' };

describe('Écrans — lot 2', () => {
    it('ChauffeurCoursesScreen charge les courses', async () => {
        authValue.current = physique;
        const { toJSON } = render(<ChauffeurCoursesScreen />);
        await waitFor(() => expect(getChauffeurCourses).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorEquipeScreen (Moral) charge l\'équipe', async () => {
        authValue.current = moral;
        const { toJSON } = render(<AmbassadorEquipeScreen />);
        await waitFor(() => expect(getEquipe).toHaveBeenCalledWith('a1'));
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorQRCodeScreen charge les bons', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorQRCodeScreen {...({ route: { params: { bonId: 'b1' } }, navigation: {} } as any)} />);
        await waitFor(() => expect(getBonList).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorBoutiqueScreen charge offres + solde', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorBoutiqueScreen />);
        await waitFor(() => expect(getAmbassadorDashboard).toHaveBeenCalled());
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorNiveauxScreen charge le dashboard', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorNiveauxScreen />);
        await waitFor(() => expect(getAmbassadorDashboard).toHaveBeenCalledWith('a1'));
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorProfilScreen charge le profil', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorProfilScreen />);
        await waitFor(() => expect(getAmbassadorProfile).toHaveBeenCalledWith('a1'));
        expect(toJSON()).toBeTruthy();
    });

    it('AmbassadorBonsCadeauxScreen charge les bons', async () => {
        authValue.current = physique;
        const { toJSON } = render(<AmbassadorBonsCadeauxScreen />);
        await waitFor(() => expect(getBonList).toHaveBeenCalledWith('a1'));
        expect(toJSON()).toBeTruthy();
    });
});
