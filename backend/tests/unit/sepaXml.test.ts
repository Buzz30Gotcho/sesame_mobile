import { genererSepaXml, cleanIban } from '../../src/lib/sepaXml';

// Génération du fichier de virements SEPA (pain.001.001.03). Logique pure.

describe('cleanIban', () => {
    it('retire les espaces et met en majuscules', () => {
        expect(cleanIban('fr14 2004 1010 0505 0001 3m02 606')).toBe('FR1420041010050500013M02606');
    });
});

describe('genererSepaXml', () => {
    const input = {
        debtorName: 'Winween',
        debtorIban: 'FR1420041010050500013M02606',
        transfers: [
            { creditorName: 'Fournisseur A', creditorIban: 'FR7630006000011234567890189', amount: 100.5, endToEndId: 'PAY-1', label: 'Paiement A' },
            { creditorName: 'Fournisseur B', creditorIban: 'FR7630006000019876543210123', amount: 49.5, endToEndId: 'PAY-2', label: 'Paiement B' },
        ],
    };

    it('produit un XML SEPA valide avec en-tête pain.001.001.03', () => {
        const xml = genererSepaXml(input);
        expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
        expect(xml).toContain('urn:iso:std:iso:20022:tech:xsd:pain.001.001.03');
    });

    it('calcule le nombre de transactions et la somme de contrôle', () => {
        const xml = genererSepaXml(input);
        expect(xml).toContain('<NbOfTxs>2</NbOfTxs>');
        expect(xml).toContain('<CtrlSum>150.00</CtrlSum>'); // 100.50 + 49.50
    });

    it('inclut chaque bénéficiaire avec son IBAN nettoyé et son montant', () => {
        const xml = genererSepaXml(input);
        expect(xml).toContain('<Nm>Fournisseur A</Nm>');
        expect(xml).toContain('<IBAN>FR7630006000011234567890189</IBAN>');
        expect(xml).toContain('Ccy="EUR">100.50</InstdAmt>');
    });

    it('échappe les caractères XML dangereux (anti-injection)', () => {
        const xml = genererSepaXml({
            ...input,
            transfers: [{ creditorName: 'A & <B>', creditorIban: 'FR7630006000011234567890189', amount: 1, endToEndId: 'X', label: 'L' }],
        });
        expect(xml).toContain('A &amp; &lt;B&gt;');
        expect(xml).not.toContain('<B>');
    });
});
