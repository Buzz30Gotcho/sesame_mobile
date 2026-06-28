import { BusinessRules } from '../../src/theme';

// Test unitaire : logique pure, aucun rendu.
// Les constantes métier embarquées dans l'app doivent rester alignées sur les
// specs §3 (et sur le backend, source de vérité du calcul).

describe('BusinessRules', () => {
    it('applique une commission de 20 %', () => {
        expect(BusinessRules.commission).toBe(0.2);
    });

    it('définit la tarification berline et van conforme aux specs', () => {
        const { berline, van } = BusinessRules.pricing;
        expect(berline).toMatchObject({ forfait: 12, threshold: 6, perKm: 2, passagers: 3 });
        expect(van).toMatchObject({ forfait: 12, threshold: 6, perKm: 3, passagers: 7 });
    });

    it('attribue 1 point par tranche de 10 €', () => {
        expect(BusinessRules.points.perTranche).toBe(10);
    });
});
