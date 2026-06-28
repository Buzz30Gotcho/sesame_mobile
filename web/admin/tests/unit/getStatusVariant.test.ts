import { getStatusVariant } from '../../src/components/Badge';

// Test unitaire : logique pure (statut → variante de couleur), aucun rendu.
describe('getStatusVariant', () => {
    it('mappe les statuts positifs vers "success"', () => {
        expect(getStatusVariant('terminee')).toBe('success');
        expect(getStatusVariant('VALIDE')).toBe('success'); // insensible à la casse
    });
    it('mappe les statuts en cours vers "info"', () => {
        expect(getStatusVariant('acceptee')).toBe('info');
        expect(getStatusVariant('actif')).toBe('info');
    });
    it('mappe les statuts négatifs vers "danger"', () => {
        expect(getStatusVariant('annulee')).toBe('danger');
        expect(getStatusVariant('suspendu')).toBe('danger');
    });
    it('distingue ambassadeur physique (or) et moral (blue)', () => {
        expect(getStatusVariant('physique')).toBe('or');
        expect(getStatusVariant('moral')).toBe('blue');
    });
    it('retombe sur "gray" pour un statut inconnu', () => {
        expect(getStatusVariant('inconnu')).toBe('gray');
        expect(getStatusVariant('')).toBe('gray');
    });
});
