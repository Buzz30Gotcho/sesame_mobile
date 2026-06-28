import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PasswordInput from '../../src/components/PasswordInput';

// Test d'intégration (composant) : on monte réellement le composant React Native
// et on simule une interaction utilisateur. Le bouton œil bascule l'affichage.
describe('PasswordInput', () => {
    it('masque le texte par défaut et l\'affiche après un tap sur l\'œil', () => {
        const { getByLabelText, getByPlaceholderText } = render(
            <PasswordInput placeholder="Mot de passe" />
        );

        const input = getByPlaceholderText('Mot de passe');
        // secureTextEntry actif au départ
        expect(input.props.secureTextEntry).toBe(true);

        // Tap sur le bouton « Afficher le mot de passe »
        fireEvent.press(getByLabelText('Afficher le mot de passe'));
        expect(input.props.secureTextEntry).toBe(false);

        // Le libellé d'accessibilité bascule
        fireEvent.press(getByLabelText('Masquer le mot de passe'));
        expect(input.props.secureTextEntry).toBe(true);
    });
});
