import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';

// Mock du module natif AsyncStorage (utilisé par LanguageContext pour mémoriser la langue).
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import { LanguageProvider, useLang } from '../../src/context/LanguageContext';

// i18n : la fonction t() traduit les clés connues et retombe sur la clé si inconnue.
function Probe({ keys }: { keys: string[] }) {
    const { t, locale } = useLang();
    return <Text>{keys.map(k => t(k)).join('|')}|{locale}</Text>;
}

describe('LanguageContext / t()', () => {
    it('traduit les clés connues (fr par défaut) et garde la clé si inconnue', () => {
        const { getByText } = render(
            <LanguageProvider>
                <Probe keys={['commander', 'boutique', 'cle_inexistante_xyz']} />
            </LanguageProvider>
        );
        // 'commander' → 'Commander', 'boutique' → 'Boutique', clé inconnue → elle-même
        expect(getByText('Commander|Boutique|cle_inexistante_xyz|fr-FR')).toBeTruthy();
    });
});
