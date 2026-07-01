import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

// --- Mocks des dépendances lourdes / I/O ---------------------------------------
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 } }));
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// Évite d'importer tout l'arbre de AmbassadorAccueilScreen (expo-camera, etc.)
jest.mock('../../src/screens/AmbassadorAccueilScreen', () => ({ clearDashboardCache: jest.fn() }));
jest.mock('../../src/services/notifications', () => ({ registerForPushNotifications: jest.fn(() => Promise.resolve()) }));
jest.mock('../../src/services/api', () => ({
    login: jest.fn(),
    demanderResetMotDePasse: jest.fn(() => Promise.resolve()),
    reinitialiserMotDePasse: jest.fn(() => Promise.resolve()),
    setAuthToken: jest.fn(),
}));

import LoginScreen from '../../src/screens/LoginScreen';
import { AuthProvider } from '../../src/context/AuthContext';
import { login } from '../../src/services/api';

function renderLogin() {
    const navigation: any = { replace: jest.fn(), navigate: jest.fn() };
    const utils = render(
        <AuthProvider>
            <LoginScreen navigation={navigation} route={{ key: 'Login', name: 'Login' } as any} />
        </AuthProvider>
    );
    return { navigation, ...utils };
}

describe('LoginScreen', () => {
    beforeEach(() => jest.clearAllMocks());

    it('affiche le portail de choix de rôle', () => {
        const { getByText } = renderLogin();
        expect(getByText('SÉSAME')).toBeTruthy();
        expect(getByText('AMBASSADEUR')).toBeTruthy();
        expect(getByText('CHAUFFEUR')).toBeTruthy();
    });

    it('sélectionner un rôle affiche le formulaire', () => {
        const { getByText, getByPlaceholderText } = renderLogin();
        fireEvent.press(getByText('AMBASSADEUR'));
        expect(getByPlaceholderText('Email professionnel')).toBeTruthy();
        expect(getByText('SE CONNECTER')).toBeTruthy();
    });

    it('login sans identifiants → message d\'erreur', () => {
        const { getByText } = renderLogin();
        fireEvent.press(getByText('CHAUFFEUR'));
        fireEvent.press(getByText('SE CONNECTER'));
        expect(getByText('Email et mot de passe requis')).toBeTruthy();
    });

    it('login chauffeur réussi → navigation vers ChauffeurHome', async () => {
        (login as jest.Mock).mockResolvedValue({ data: { token: 'jwt', userId: 'u1', role: 'chauffeur', chauffeur_id: 'c1' } });
        const { getByText, getByPlaceholderText, navigation } = renderLogin();
        fireEvent.press(getByText('CHAUFFEUR'));
        fireEvent.changeText(getByPlaceholderText('Email professionnel'), 'chf@t.fr');
        fireEvent.changeText(getByPlaceholderText('Mot de passe'), 'password12');
        fireEvent.press(getByText('SE CONNECTER'));
        await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('ChauffeurHome'));
    });

    it('login en erreur → affiche le message backend', async () => {
        (login as jest.Mock).mockRejectedValue({ response: { data: { error: 'Identifiants invalides' } } });
        const { getByText, getByPlaceholderText } = renderLogin();
        fireEvent.press(getByText('AMBASSADEUR'));
        fireEvent.changeText(getByPlaceholderText('Email professionnel'), 'a@t.fr');
        fireEvent.changeText(getByPlaceholderText('Mot de passe'), 'password12');
        fireEvent.press(getByText('SE CONNECTER'));
        await waitFor(() => expect(getByText('Identifiants invalides')).toBeTruthy());
    });

    it('mot de passe oublié → étape 1 puis envoi du code passe à l\'étape 2', async () => {
        const { getByText, getByPlaceholderText } = renderLogin();
        fireEvent.press(getByText('AMBASSADEUR'));
        fireEvent.press(getByText('Mot de passe oublié ?'));
        expect(getByText('ENVOYER LE CODE')).toBeTruthy();
        fireEvent.changeText(getByPlaceholderText('votre@email.com'), 'a@t.fr');
        fireEvent.press(getByText('ENVOYER LE CODE'));
        await waitFor(() => expect(getByText('VÉRIFIER')).toBeTruthy());
    });

    it('login ambassadeur réussi → navigation vers AmbassadorAccueil', async () => {
        (login as jest.Mock).mockResolvedValue({ data: { token: 'jwt', userId: 'u1', role: 'ambassadeur', ambassadeur_id: 'a1' } });
        const { getByText, getByPlaceholderText, navigation } = renderLogin();
        fireEvent.press(getByText('AMBASSADEUR'));
        fireEvent.changeText(getByPlaceholderText('Email professionnel'), 'a@t.fr');
        fireEvent.changeText(getByPlaceholderText('Mot de passe'), 'password12');
        fireEvent.press(getByText('SE CONNECTER'));
        await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('AmbassadorAccueil'));
    });

    it('flux reset complet : email → code → nouveau mot de passe → succès', async () => {
        const { getByText, getByPlaceholderText, queryByText } = renderLogin();
        fireEvent.press(getByText('CHAUFFEUR'));
        fireEvent.press(getByText('Mot de passe oublié ?'));
        fireEvent.changeText(getByPlaceholderText('votre@email.com'), 'a@t.fr');
        fireEvent.press(getByText('ENVOYER LE CODE'));
        await waitFor(() => expect(getByText('VÉRIFIER')).toBeTruthy());
        fireEvent.changeText(getByPlaceholderText('000000'), '123456');
        fireEvent.press(getByText('VÉRIFIER'));
        await waitFor(() => expect(getByText('CONFIRMER')).toBeTruthy());
        fireEvent.changeText(getByPlaceholderText('Nouveau mot de passe'), 'newpassword12');
        fireEvent.press(getByText('CONFIRMER'));
        await waitFor(() => expect(getByText('Mot de passe modifié !')).toBeTruthy());
    });

    it('retour au choix de rôle réinitialise le formulaire', () => {
        const { getByText, queryByText } = renderLogin();
        fireEvent.press(getByText('AMBASSADEUR'));
        fireEvent.press(getByText('← Retour au choix'));
        expect(getByText('Choisissez votre espace pour commencer')).toBeTruthy();
    });

    it('S\'inscrire navigue vers Register', () => {
        const { getByText, navigation } = renderLogin();
        fireEvent.press(getByText('AMBASSADEUR'));
        fireEvent.press(getByText('S\'inscrire'));
        expect(navigation.navigate).toHaveBeenCalledWith('Register', expect.objectContaining({ initialRole: 'ambassadeur' }));
    });
});
