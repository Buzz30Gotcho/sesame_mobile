import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

// --- Mocks des dépendances natives / navigation ---------------------------------
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
    useNavigation: () => ({ navigate: mockNavigate }),
    useRoute: () => ({ name: 'AmbassadorAccueil' }),
}));
jest.mock('react-native-safe-area-context', () => {
    const React = require('react');
    return {
        SafeAreaView: ({ children }: any) => React.createElement(React.Fragment, null, children),
        SafeAreaProvider: ({ children }: any) => React.createElement(React.Fragment, null, children),
        useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    };
});
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 } }));
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import PointsRing from '../../src/components/PointsRing';
import ScreenTemplate from '../../src/components/ScreenTemplate';
import IncomingCourseModal from '../../src/components/IncomingCourseModal';
import AccessDenied from '../../src/components/AccessDenied';
import BottomNav from '../../src/components/BottomNav';
import { ThemeProvider } from '../../src/context/ThemeContext';
import { AuthProvider } from '../../src/context/AuthContext';

const Providers = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider><AuthProvider>{children}</AuthProvider></ThemeProvider>
);

describe('PointsRing', () => {
    it('affiche les points et le niveau', () => {
        const { getByText } = render(<PointsRing points={120} level="pro" nextLevelPoints={500} />);
        expect(getByText('120')).toBeTruthy();
        expect(getByText(/pro/i)).toBeTruthy();
    });

    it('borne la progression à 100% quand points ≥ objectif', () => {
        // nextLevelPoints=0 → progress = min(Infinity,1) = 1, ne doit pas planter
        expect(() => render(<PointsRing points={10} level="black" nextLevelPoints={0} />)).not.toThrow();
    });
});

describe('ScreenTemplate', () => {
    it('rend le titre, les sections et le pied de page', () => {
        const { getByText } = render(
            <ScreenTemplate title="Titre" subtitle="Sous-titre" footer="Pied"
                sections={[{ title: 'S1', description: 'D1' }, { title: 'S2', description: 'D2' }]} />
        );
        expect(getByText('Titre')).toBeTruthy();
        expect(getByText('S1')).toBeTruthy();
        expect(getByText('D2')).toBeTruthy();
        expect(getByText('Pied')).toBeTruthy();
    });

    it('appelle onBack au clic sur Retour', () => {
        const onBack = jest.fn();
        const { getByText } = render(<ScreenTemplate title="T" sections={[]} onBack={onBack} />);
        fireEvent.press(getByText('← Retour'));
        expect(onBack).toHaveBeenCalled();
    });
});

describe('IncomingCourseModal', () => {
    const course: any = { id: 'co1', adresse_depart: 'A', adresse_destination: 'B', montant: 20, vehicule_type: 'berline' };

    it('ne rend rien sans course', () => {
        const { toJSON } = render(<IncomingCourseModal course={null} onAccept={jest.fn()} onRefuse={jest.fn()} accepting={false} />);
        expect(toJSON()).toBeNull();
    });

    it('accepte la course au clic', async () => {
        const onAccept = jest.fn().mockResolvedValue(undefined);
        const { getByText } = render(<IncomingCourseModal course={course} onAccept={onAccept} onRefuse={jest.fn()} accepting={false} />);
        fireEvent.press(getByText(/accepter/i));
        expect(onAccept).toHaveBeenCalledWith('co1');
    });

    it('refuse la course au clic', () => {
        const onRefuse = jest.fn();
        const { getByText } = render(<IncomingCourseModal course={course} onAccept={jest.fn()} onRefuse={onRefuse} accepting={false} />);
        fireEvent.press(getByText(/refuser/i));
        expect(onRefuse).toHaveBeenCalledWith('co1');
    });
});

describe('AccessDenied', () => {
    it('affiche le message par défaut', () => {
        const { getByText } = render(<Providers><AccessDenied /></Providers>);
        expect(getByText('Accès réservé')).toBeTruthy();
    });

    it('affiche un message personnalisé', () => {
        const { getByText } = render(<Providers><AccessDenied message="Interdit ici" /></Providers>);
        expect(getByText('Interdit ici')).toBeTruthy();
    });
});

describe('BottomNav', () => {
    it('affiche les onglets chauffeur et navigue au clic', () => {
        const { getByText } = render(<Providers><BottomNav role="chauffeur" /></Providers>);
        expect(getByText('Revenus')).toBeTruthy();
        fireEvent.press(getByText('Courses'));
        expect(mockNavigate).toHaveBeenCalledWith('ChauffeurCourses');
    });

    it('affiche les onglets ambassadeur physique', () => {
        const { getByText } = render(<Providers><BottomNav role="ambassadeur" /></Providers>);
        expect(getByText('Boutique')).toBeTruthy();
        expect(getByText('Niveaux')).toBeTruthy();
    });
});
