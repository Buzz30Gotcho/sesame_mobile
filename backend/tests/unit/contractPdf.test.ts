import { generateContractPdf } from '../../src/lib/contractPdf';

// Génération du contrat fournisseur PDF (pdfkit, specs §6.3). On vérifie qu'un PDF
// valide est produit avec les coordonnées du champ de signature.

const fournisseur = {
    id: 'f-1',
    nom_societe: 'ACME SARL',
    siret: '73282932000074',
    iban: 'FR1420041010050500013M02606',
    legal_prenom: 'Jean',
    legal_nom: 'Dupont',
    legal_email: 'jean@acme.fr',
    legal_telephone: '0612345678',
    legal_adresse: '1 rue de Paris',
    legal_cp: '75001',
    legal_ville: 'Paris',
    option_paiement: 'c',
};

const offres = [
    { nom: 'Bon 50€', description: 'Un bon', tarif_fournisseur_ht: 40, validite_bon_mois: 6 },
];

describe('generateContractPdf', () => {
    it('produit un buffer PDF valide avec position de signature', async () => {
        const result = await generateContractPdf(fournisseur, offres);
        expect(Buffer.isBuffer(result.buffer)).toBe(true);
        expect(result.buffer.length).toBeGreaterThan(500);
        // En-tête PDF
        expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-');
        // Coordonnées du champ de signature
        expect(result.signPage).toBeGreaterThanOrEqual(1);
        expect(typeof result.signX).toBe('number');
        expect(typeof result.signY).toBe('number');
    });

    it('fonctionne sans offre (contrat sans annexe)', async () => {
        const result = await generateContractPdf(fournisseur, []);
        expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    });
});
