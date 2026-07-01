import React from 'react';
import { render, act } from '@testing-library/react-native';
import CountdownRing from '../../src/components/CountdownRing';

// Composant CountdownRing : décompte visuel + callback onComplete à la fin.
describe('CountdownRing', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('affiche la durée initiale en secondes', () => {
        const { getByText } = render(<CountdownRing duration={5} size={120} onComplete={() => {}} />);
        expect(getByText('5')).toBeTruthy();
    });

    it('appelle onComplete une fois le décompte écoulé', () => {
        const onComplete = jest.fn();
        render(<CountdownRing duration={1} size={120} onComplete={onComplete} />);
        act(() => { jest.advanceTimersByTime(1100); });
        expect(onComplete).toHaveBeenCalled();
    });
});
