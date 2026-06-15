// ─── Génération d'un fichier de virements SEPA (ISO 20022 — pain.001.001.03) ──
// Format universel des « virements par fichier » accepté par les banques FR/EU.
// On regroupe N virements (Winween → bénéficiaires) dans un seul .xml à charger
// sur l'espace bancaire. Le BIC est facultatif (les banques le déduisent de l'IBAN).

export type SepaTransfer = {
    creditorName: string;
    creditorIban: string;
    amount: number;          // en euros
    endToEndId: string;      // identifiant unique du virement (≤ 35 car.)
    label: string;           // libellé (motif) affiché au bénéficiaire
};

export type SepaInput = {
    debtorName: string;
    debtorIban: string;
    transfers: SepaTransfer[];
};

const esc = (s: string): string =>
    String(s).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]!));

const amt = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

// Nettoie un IBAN (sans espaces, majuscules).
export const cleanIban = (iban: string): string => String(iban).replace(/\s+/g, '').toUpperCase();

// Tronque + nettoie un identifiant SEPA (35 car. max, caractères autorisés).
const id35 = (s: string): string => s.replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, '').slice(0, 35) || 'NA';

export function genererSepaXml(input: SepaInput): string {
    const now = new Date();
    const creDtTm = now.toISOString().slice(0, 19);
    // Date d'exécution souhaitée : J+1 (la banque ajuste au prochain jour ouvré).
    const exec = new Date(now.getTime() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const msgId = id35(`SESAME-${now.getTime()}`);
    const total = input.transfers.reduce((s, t) => s + t.amount, 0);
    const nb = input.transfers.length;

    const tx = input.transfers.map(t => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${esc(id35(t.endToEndId))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${amt(t.amount)}</InstdAmt></Amt>
        <CdtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></CdtrAgt>
        <Cdtr><Nm>${esc(t.creditorName).slice(0, 70)}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${esc(cleanIban(t.creditorIban))}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${esc(t.label).slice(0, 140)}</Ustrd></RmtInf>
      </CdtTrfTxInf>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nb}</NbOfTxs>
      <CtrlSum>${amt(total)}</CtrlSum>
      <InitgPty><Nm>${esc(input.debtorName).slice(0, 70)}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nb}</NbOfTxs>
      <CtrlSum>${amt(total)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${exec}</ReqdExctnDt>
      <Dbtr><Nm>${esc(input.debtorName).slice(0, 70)}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${esc(cleanIban(input.debtorIban))}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${tx}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>`;
}
