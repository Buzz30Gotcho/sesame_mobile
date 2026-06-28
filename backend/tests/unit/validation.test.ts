import {
    luhnCheck,
    siretValide,
    emailValide,
    telephoneValide,
    ibanValide,
} from '../../src/lib/validation';

describe('luhnCheck', () => {
    it('valide un numéro avec clé de Luhn correcte', () => {
        expect(luhnCheck('79927398713')).toBe(true);
    });
    it('rejette un numéro avec une faute de frappe', () => {
        expect(luhnCheck('79927398714')).toBe(false);
    });
});

describe('siretValide', () => {
    it('accepte un SIRET de 14 chiffres valide (clé de Luhn)', () => {
        // SIRET de test connu valide
        expect(siretValide('73282932000074')).toBe(true);
    });
    it('tolère les espaces', () => {
        expect(siretValide('732 829 320 00074')).toBe(true);
    });
    it('rejette une mauvaise longueur', () => {
        expect(siretValide('123')).toBe(false);
    });
    it('rejette une clé de Luhn invalide', () => {
        expect(siretValide('73282932000075')).toBe(false);
    });
});

describe('emailValide', () => {
    it('accepte un email bien formé', () => {
        expect(emailValide('jean.dupont@example.com')).toBe(true);
    });
    it('rejette les emails mal formés', () => {
        expect(emailValide('pas-un-email')).toBe(false);
        expect(emailValide('a@b')).toBe(false);
        expect(emailValide('a@@b.com')).toBe(false);
    });
});

describe('telephoneValide', () => {
    it('accepte un numéro FR à 10 chiffres', () => {
        expect(telephoneValide('0612345678')).toBe(true);
    });
    it('accepte les formats +33 / 0033 et la ponctuation', () => {
        expect(telephoneValide('+33 6 12 34 56 78')).toBe(true);
        expect(telephoneValide('0033612345678')).toBe(true);
        expect(telephoneValide('06.12.34.56.78')).toBe(true);
    });
    it('rejette les numéros invalides', () => {
        expect(telephoneValide('1234')).toBe(false);
        expect(telephoneValide('0012345678')).toBe(false); // commence par 00 après le 0
    });
});

describe('ibanValide', () => {
    it('accepte un IBAN FR valide (mod 97)', () => {
        expect(ibanValide('FR1420041010050500013M02606')).toBe(true);
    });
    it('tolère les espaces et la casse', () => {
        expect(ibanValide('fr14 2004 1010 0505 0001 3m02 606')).toBe(true);
    });
    it('rejette une clé de contrôle erronée', () => {
        expect(ibanValide('FR1420041010050500013M02607')).toBe(false);
    });
    it('rejette un format invalide', () => {
        expect(ibanValide('PAS-UN-IBAN')).toBe(false);
    });
});
