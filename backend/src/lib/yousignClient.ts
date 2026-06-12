import fs from 'fs';

// ─── Signature électronique des contrats fournisseurs (specs §6 — Yousign) ────
// Configurable : sans YOUSIGN_API_KEY + PDF de contrat, la fonctionnalité est
// inactive et l'admin garde le toggle manuel `contrat_signe`. 1 seul signataire
// = le responsable légal du fournisseur (specs : « date + signataire » au singulier).
const YOUSIGN_API_KEY = process.env.YOUSIGN_API_KEY || '';
// Défaut = environnement SANDBOX (gratuit, pour tester). Prod : https://api.yousign.app/v3
const YOUSIGN_BASE_URL = (process.env.YOUSIGN_BASE_URL || 'https://api-sandbox.yousign.app/v3').replace(/\/+$/, '');
// Chemin vers le PDF du contrat à faire signer (document juridique fourni par SÉSAME).
const YOUSIGN_CONTRACT_PDF = process.env.YOUSIGN_CONTRACT_PDF || '';
// Position du champ de signature sur le PDF (à ajuster selon le contrat réel).
const SIGN_PAGE = Number(process.env.YOUSIGN_SIGN_PAGE || 1);
const SIGN_X = Number(process.env.YOUSIGN_SIGN_X || 77);
const SIGN_Y = Number(process.env.YOUSIGN_SIGN_Y || 700);

export function isYousignConfigured(): boolean {
    return Boolean(YOUSIGN_API_KEY && YOUSIGN_CONTRACT_PDF);
}

export type FournisseurSignataire = {
    id: string;
    nom_societe: string;
    legal_prenom: string | null;
    legal_nom: string | null;
    legal_email: string | null;
    legal_telephone: string | null;
};

async function yousign(
    path: string,
    options: { method?: string; body?: unknown; form?: FormData } = {}
): Promise<any> {
    const headers: Record<string, string> = { Authorization: `Bearer ${YOUSIGN_API_KEY}` };
    let body: BodyInit | undefined;
    if (options.form) {
        body = options.form; // multipart : ne PAS fixer Content-Type (boundary auto)
    } else if (options.body !== undefined) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(options.body);
    }
    const res = await fetch(`${YOUSIGN_BASE_URL}${path}`, { method: options.method || 'GET', headers, body });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Yousign ${res.status}: ${txt.slice(0, 300)}`);
    }
    return res.json();
}

// Crée la demande de signature, attache le contrat, ajoute le fournisseur comme
// signataire unique, puis active (→ Yousign envoie l'email au responsable légal).
export async function envoyerContratFournisseur(f: FournisseurSignataire): Promise<{ signatureRequestId: string }> {
    if (!YOUSIGN_API_KEY) throw new Error('YOUSIGN_API_KEY non défini');
    if (!YOUSIGN_CONTRACT_PDF || !fs.existsSync(YOUSIGN_CONTRACT_PDF)) {
        throw new Error('Contrat PDF introuvable (définir YOUSIGN_CONTRACT_PDF)');
    }
    if (!f.legal_email) throw new Error('Email du responsable légal manquant');

    // 1) Créer la demande de signature.
    // external_id = id du fournisseur → renvoyé tel quel dans le webhook, ce qui permet de
    // retrouver le fournisseur SANS stocker l'id Yousign en base (pas de colonne dédiée).
    const sr = await yousign('/signature_requests', {
        method: 'POST',
        body: { name: `Contrat SÉSAME — ${f.nom_societe}`, delivery_mode: 'email', timezone: 'Europe/Paris', external_id: f.id },
    });

    // 2) Attacher le PDF du contrat
    const pdf = fs.readFileSync(YOUSIGN_CONTRACT_PDF);
    const form = new FormData();
    form.append('nature', 'signable_document');
    form.append('file', new Blob([pdf], { type: 'application/pdf' }), 'contrat-sesame.pdf');
    const doc = await yousign(`/signature_requests/${sr.id}/documents`, { method: 'POST', form });

    // 3) Ajouter le signataire unique = le responsable légal du fournisseur
    await yousign(`/signature_requests/${sr.id}/signers`, {
        method: 'POST',
        body: {
            info: {
                first_name: f.legal_prenom || 'Responsable',
                last_name: f.legal_nom || f.nom_societe,
                email: f.legal_email,
                ...(f.legal_telephone ? { phone_number: f.legal_telephone } : {}),
                locale: 'fr',
            },
            signature_level: 'electronic_signature',
            signature_authentication_mode: 'otp_email',
            fields: [{ document_id: doc.id, type: 'signature', page: SIGN_PAGE, x: SIGN_X, y: SIGN_Y }],
        },
    });

    // 4) Activer → envoi de l'email de signature au fournisseur
    await yousign(`/signature_requests/${sr.id}/activate`, { method: 'POST' });

    return { signatureRequestId: sr.id };
}
