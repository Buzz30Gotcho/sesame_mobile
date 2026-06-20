import PDFDocument from 'pdfkit';

// ─── Génération dynamique du contrat partenaire (specs §6.3) ──────────────────
// Le contrat n'est PAS un PDF statique : il est généré à la volée et renseigné
// avec les données du fournisseur + ses offres. Structure imposée par les specs :
//   1. Parties (non modifiable)        — SÉSAME + Prestataire
//   2. Prestation (modifiable)         — nature, validité bon, conditions
//   3. Conditions financières          — tarif HT, mode de paiement, IBAN, délai
//                                        AUCUNE mention des points SÉSAME (confidentiel)
//   4. Durée & Résiliation             — durée, renouvellement, préavis
// On renvoie aussi la position du champ de signature pour Yousign (même repère
// haut-gauche, en points PDF, que pdfkit).

const OR = '#C9A84C'; // Or SÉSAME (charte §1.3)
const ENCRE = '#1C1C2E';
const GRIS = '#6A6680';

export type ContratFournisseur = {
    id: string;
    nom_societe: string;
    siret: string | null;
    iban: string | null;
    legal_prenom: string | null;
    legal_nom: string | null;
    legal_email: string | null;
    legal_telephone: string | null;
    legal_adresse: string | null;
    legal_cp: string | null;
    legal_ville: string | null;
    option_paiement: string | null;
};

export type ContratOffre = {
    nom: string;
    description: string | null;
    tarif_fournisseur_ht: number | string | null;
    validite_bon_mois: number;
};

// Identité de la société exploitante (partie au contrat côté « SÉSAME »).
// SÉSAME = nom du projet/marque ; la société qui signe est Winween (configurable par env).
const SESAME = {
    societe: process.env.SESAME_SOCIETE || 'Winween',
    adresse: process.env.SESAME_ADRESSE || '—',
    cp: process.env.SESAME_CP || '',
    ville: process.env.SESAME_VILLE || '',
    email: process.env.SESAME_EMAIL || 'contact@sesame-pro.com',
    tel: process.env.SESAME_TEL || '07 45 20 70 06',
    siret: process.env.SESAME_SIRET || '',
};

const PAIEMENT_LABEL: Record<string, string> = {
    a: "Option A — Paiement à l'ajout en boutique (paiement préalable).",
    b: "Option B — Paiement à la récupération du bon (QR code) par l'Ambassadeur.",
    c: 'Option C — Paiement au scan du QR code (paiement = prestation effectuée).',
};

// Fait générateur = l'événement qui déclenche le paiement (point de départ du délai de règlement).
const FAIT_GENERATEUR_LABEL: Record<string, string> = {
    a: "l'ajout de la prestation en boutique",
    b: "la récupération du bon (QR code) par l'Ambassadeur",
    c: 'le scan du QR code chez le Partenaire (prestation effectuée)',
};

const euros = (v: number | string | null): string =>
    v === null || v === undefined || v === '' ? '—' : `${Number(v).toFixed(2)} € HT`;

const ligne = (label: string, valeur: string | null | undefined): string =>
    `${label} : ${valeur && String(valeur).trim() ? valeur : '—'}`;

export type GeneratedContrat = {
    buffer: Buffer;
    signPage: number;
    signX: number;
    signY: number;
};

export function generateContractPdf(f: ContratFournisseur, offres: ContratOffre[]): Promise<GeneratedContrat> {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 56, bufferPages: true });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('error', reject);

        // Suivi du numéro de page (1-indexé) pour positionner le champ de signature.
        let pageNum = 1;
        doc.on('pageAdded', () => { pageNum += 1; });

        const M = doc.page.margins.left;
        const W = doc.page.width - M * 2;

        const titre = (t: string) => {
            doc.moveDown(0.8);
            doc.fillColor(OR).fontSize(12).font('Helvetica-Bold').text(t.toUpperCase());
            doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).strokeColor(OR).lineWidth(0.8).stroke();
            doc.moveDown(0.5);
            doc.fillColor(ENCRE).font('Helvetica').fontSize(10);
        };
        const para = (t: string) => { doc.fillColor(ENCRE).font('Helvetica').fontSize(10).text(t, { align: 'justify' }); doc.moveDown(0.3); };
        const item = (t: string) => { doc.fillColor(ENCRE).font('Helvetica').fontSize(10).text(`•  ${t}`); };

        // ── En-tête ───────────────────────────────────────────────────────────
        doc.fillColor(OR).fontSize(22).font('Helvetica-Bold').text('SÉSAME');
        doc.fillColor(GRIS).fontSize(10).font('Helvetica').text("Contrat d'apporteur d'affaires — Partenaire fournisseur");
        doc.fillColor(GRIS).fontSize(8).text(`Référence : SESAME-${f.id.slice(0, 8).toUpperCase()}  ·  Édité le ${new Date().toLocaleDateString('fr-FR')}`);
        doc.moveDown(0.5);

        // ── 1. Parties (non modifiable) ─────────────────────────────────────────
        titre('1. Parties');
        para("Le présent contrat est conclu entre les parties suivantes :");
        doc.font('Helvetica-Bold').text("SÉSAME (« la Société »)");
        doc.font('Helvetica');
        item(ligne('Société', SESAME.societe));
        item(ligne('Adresse', [SESAME.adresse, SESAME.cp, SESAME.ville].filter(Boolean).join(' ')));
        item(ligne('Email', SESAME.email));
        item(ligne('Téléphone', SESAME.tel));
        if (SESAME.siret) item(ligne('SIRET', SESAME.siret));
        doc.moveDown(0.4);
        doc.font('Helvetica-Bold').text("Le Prestataire (« le Partenaire »)");
        doc.font('Helvetica');
        item(ligne('Société', f.nom_societe));
        item(ligne('Responsable légal', [f.legal_prenom, f.legal_nom].filter(Boolean).join(' ')));
        item(ligne('Adresse du siège', [f.legal_adresse, f.legal_cp, f.legal_ville].filter(Boolean).join(' ')));
        item(ligne('Email', f.legal_email));
        item(ligne('Téléphone', f.legal_telephone));
        item(ligne('SIRET', f.siret));

        // ── 2. Prestation (modifiable) ──────────────────────────────────────────
        titre('2. Prestation');
        para("Le Partenaire met à disposition de la Société les prestations suivantes, exposées aux Ambassadeurs SÉSAME sous forme de bons cadeaux :");
        if (offres.length === 0) {
            doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(9)
                .text("Aucune prestation enregistrée à ce jour. Les prestations seront ajoutées en boutique après signature du présent contrat.");
            doc.fillColor(ENCRE).font('Helvetica').fontSize(10);
        } else {
            offres.forEach(o => {
                doc.font('Helvetica-Bold').text(`•  ${o.nom}`);
                doc.font('Helvetica').fontSize(9).fillColor(GRIS);
                if (o.description) doc.text(`    ${o.description}`);
                doc.text(`    Validité du bon : ${o.validite_bon_mois} mois à compter de la remise (horodatage à la minute exacte).`);
                doc.fillColor(ENCRE).fontSize(10);
            });
        }
        doc.moveDown(0.2);
        para("Réservation : selon les modalités communiquées par le Partenaire au lieu de prestation. Capacité d'accueil et conditions particulières : selon les disponibilités du Partenaire.");

        // ── 3. Conditions financières ───────────────────────────────────────────
        // IMPORTANT (specs) : ne JAMAIS mentionner les points SÉSAME, la marge ou la
        // valorisation boutique. Seul le tarif HT dû au Partenaire figure ici.
        titre('3. Conditions financières');
        para("La Société rémunère le Partenaire selon les tarifs hors taxes convenus ci-dessous, pour chaque bon validé :");
        if (offres.length > 0) {
            offres.forEach(o => item(`${o.nom} : ${euros(o.tarif_fournisseur_ht)}`));
        } else {
            item('Tarifs unitaires HT : définis lors de l\'ajout des prestations en boutique.');
        }
        doc.moveDown(0.2);
        const opt = (f.option_paiement || 'c').toLowerCase();
        item(`Mode de paiement : ${PAIEMENT_LABEL[opt] || PAIEMENT_LABEL.c}`);
        item(ligne('IBAN de règlement', f.iban));
        item(`Délai de règlement : 30 jours à compter du fait générateur, c'est-à-dire ${FAIT_GENERATEUR_LABEL[opt] || FAIT_GENERATEUR_LABEL.c}.`);

        // ── 4. Durée & Résiliation ──────────────────────────────────────────────
        titre('4. Durée & Résiliation');
        item('Durée : le contrat prend effet à la date de signature électronique ci-dessous.');
        item('Durée initiale : douze (12) mois.');
        item('Renouvellement : tacite reconduction par périodes successives de douze (12) mois.');
        item('Résiliation : par lettre recommandée avec un préavis de trente (30) jours avant l\'échéance.');

        // ── Signature ───────────────────────────────────────────────────────────
        titre('Signature');
        para("Fait pour servir et valoir ce que de droit. Le Partenaire reconnaît avoir pris connaissance de l'intégralité du présent contrat et l'accepte sans réserve.");
        doc.moveDown(0.5);

        // S'assurer qu'il reste assez de place pour la zone de signature ; sinon page suivante.
        if (doc.y > doc.page.height - 170) doc.addPage();

        doc.font('Helvetica-Bold').fontSize(10).fillColor(ENCRE)
            .text(`Le Partenaire — ${[f.legal_prenom, f.legal_nom].filter(Boolean).join(' ') || f.nom_societe}`);
        doc.moveDown(0.3);

        // Repère du champ de signature Yousign : on capture page + position courante,
        // dans le même repère haut-gauche / points PDF que Yousign.
        const signPage = pageNum;
        const signX = doc.x;
        const signY = doc.y;

        // Cadre visuel de la zone de signature.
        doc.rect(signX, signY, 220, 70).strokeColor(GRIS).lineWidth(0.5).dash(2, { space: 2 }).stroke().undash();
        doc.fillColor(GRIS).font('Helvetica-Oblique').fontSize(8)
            .text('Signature électronique', signX + 6, signY + 6);

        doc.end();

        doc.on('end', () => {
            resolve({ buffer: Buffer.concat(chunks), signPage, signX: Math.round(signX), signY: Math.round(signY) });
        });
    });
}
