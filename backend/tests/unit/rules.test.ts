import {
    calculatePoints,
    calculateVehiclePrice,
    nextAmbassadorLevel,
    formatPrice,
} from '../../src/lib/rules';

// Règles métier §3 des specs (points, tarification, niveaux ambassadeur).
// Fonctions pures → tests rapides, sans base de données.

describe('calculatePoints', () => {
    it('attribue 1 point par tranche de 10€', () => {
        expect(calculatePoints(10)).toBe(1);
        expect(calculatePoints(25)).toBe(2); // arrondi au plancher
        expect(calculatePoints(100)).toBe(10);
    });

    it('ne descend jamais sous 0', () => {
        expect(calculatePoints(5)).toBe(0);
        expect(calculatePoints(0)).toBe(0);
        expect(calculatePoints(-50)).toBe(0);
    });
});

describe('calculateVehiclePrice', () => {
    it('applique le forfait sous le seuil de km (berline)', () => {
        expect(calculateVehiclePrice('berline', 6)).toBe(12.0);
        expect(calculateVehiclePrice('berline', 3)).toBe(12.0);
    });

    it('ajoute le prix au km au-delà du seuil (berline : 2€/km)', () => {
        // 12 + (10 - 6) * 2 = 20
        expect(calculateVehiclePrice('berline', 10)).toBe(20.0);
    });

    it('utilise le tarif van (3€/km) au-delà du seuil', () => {
        // 12 + (10 - 6) * 3 = 24
        expect(calculateVehiclePrice('van', 10)).toBe(24.0);
    });

    it('respecte les paramètres système surchargés', () => {
        const price = calculateVehiclePrice('berline', 10, {
            berline_forfait: 15,
            berline_seuil_km: 5,
            berline_prix_km: 1,
        });
        // 15 + (10 - 5) * 1 = 20
        expect(price).toBe(20.0);
    });
});

describe('nextAmbassadorLevel', () => {
    it('renvoie le palier correspondant aux points', () => {
        expect(nextAmbassadorLevel(0)).toBe('starter');
        expect(nextAmbassadorLevel(499)).toBe('starter');
        expect(nextAmbassadorLevel(500)).toBe('pro');
        expect(nextAmbassadorLevel(2000)).toBe('elite');
        expect(nextAmbassadorLevel(5000)).toBe('black');
    });
});

describe('formatPrice', () => {
    it('formate avec deux décimales', () => {
        expect(formatPrice(12)).toBe('12.00');
        expect(formatPrice(20.5)).toBe('20.50');
    });
});
