import { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import OffresModal from './OffresModal';
import HistoriqueModal from './HistoriqueModal';
import {
  getFournisseurs, createFournisseur, updateFournisseur, envoyerContratFournisseur,
  annulerContratFournisseur, getContratPreviewUrl, exporterSepaFournisseurs,
  type FournisseurRow, type FournisseurInput,
} from '../api';

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400';
const labelCls = 'block text-xs font-medium text-gray-600 mb-1';

const emptyForm: FournisseurInput = {
  nom_societe: '', siret: '', iban: '',
  legal_prenom: '', legal_nom: '', legal_email: '', legal_telephone: '',
  legal_adresse: '', legal_cp: '', legal_ville: '',
  prest_prenom: '', prest_nom: '', prest_telephone: '', prest_email: '',
  prest_adresse: '', prest_cp: '', prest_ville: '',
  memes_coordonnees: false, option_paiement: 'c',
};

// Champs obligatoires selon les specs §6.2 (SIRET, IBAN et email de prestation = optionnels).
// Retourne le libellé du premier champ manquant, ou null si tout est rempli.
const CHAMPS_REQUIS: [keyof FournisseurInput, string][] = [
  ['nom_societe', 'Raison sociale'],
  ['legal_prenom', 'Prénom du responsable légal'],
  ['legal_nom', 'Nom du responsable légal'],
  ['legal_email', 'Email du responsable légal'],
  ['legal_telephone', 'Téléphone du responsable légal'],
  ['legal_adresse', 'Adresse du siège social'],
  ['legal_cp', 'Code postal du siège social'],
  ['legal_ville', 'Ville du siège social'],
  ['prest_prenom', 'Prénom du contact prestation'],
  ['prest_nom', 'Nom du contact prestation'],
  ['prest_telephone', 'Téléphone du contact prestation'],
  ['prest_adresse', 'Adresse du lieu de prestation'],
  ['prest_cp', 'Code postal du lieu de prestation'],
  ['prest_ville', 'Ville du lieu de prestation'],
];
const champManquant = (f: FournisseurInput): string | null => {
  for (const [key, label] of CHAMPS_REQUIS) {
    if (!String(f[key] ?? '').trim()) return label;
  }
  return null;
};

// Email : un seul @, partie locale et domaine non vides, TLD ≥ 2.
const emailValide = (email: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
// Téléphone FR : 10 chiffres (0X…) ou +33 / 0033. Tolère espaces/points/tirets.
const telephoneValide = (tel: string): boolean => {
  const s = tel.replace(/[\s.\-()]/g, '');
  return /^(?:(?:\+33|0033)[1-9]\d{8}|0[1-9]\d{8})$/.test(s);
};
// Clé de Luhn (checksum SIRET).
const luhn = (s: string): boolean => {
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    let d = parseInt(s[s.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};
// SIRET = 14 chiffres + Luhn.
const siretValide = (siret: string): boolean => {
  const s = siret.replace(/\s/g, '');
  return /^\d{14}$/.test(s) && luhn(s);
};
// IBAN = format + clé mod 97 (ISO 13616).
const ibanValide = (iban: string): boolean => {
  const s = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{1,30}$/.test(s)) return false;
  const numeric = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
  let r = 0;
  for (const d of numeric) r = (r * 10 + Number(d)) % 97;
  return r === 1;
};

export default function Fournisseurs() {
  const [fournisseurs, setFournisseurs] = useState<FournisseurRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [signingId, setSigningId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // Fournisseur dont on gère la boutique (offres)
  const [offresFournisseur, setOffresFournisseur] = useState<FournisseurRow | null>(null);
  // Fournisseur dont on consulte l'historique des paiements
  const [histoFournisseur, setHistoFournisseur] = useState<FournisseurRow | null>(null);
  const [exporting, setExporting] = useState(false);

  // Formulaire création / édition
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FournisseurInput>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // Vrai si la fiche en cours d'édition a déjà un contrat signé (→ bandeau d'avertissement).
  const [editContratSigne, setEditContratSigne] = useState(false);
  const [annulId, setAnnulId] = useState<string | null>(null);
  const [suspendId, setSuspendId] = useState<string | null>(null);
  // Code secret généré à la création (à communiquer au responsable légal)
  const [codeSecret, setCodeSecret] = useState<{ societe: string; code: string; emailEnvoye: boolean } | null>(null);

  const load = async () => {
    try {
      setFournisseurs(await getFournisseurs());
    } catch {
      setMsg({ type: 'err', text: 'Impossible de charger les fournisseurs.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const set = (k: keyof FournisseurInput, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const openCreate = () => {
    setEditId(null);
    setEditContratSigne(false);
    setForm(emptyForm);
    setFormError('');
    setFormOpen(true);
  };

  const openEdit = (f: FournisseurRow) => {
    setEditId(f.id);
    setEditContratSigne(!!f.contrat_signe);
    setForm({
      nom_societe: f.nom_societe, siret: f.siret ?? '', iban: f.iban ?? '',
      legal_prenom: f.legal_prenom ?? '', legal_nom: f.legal_nom ?? '',
      legal_email: f.legal_email ?? '', legal_telephone: f.legal_telephone ?? '',
      legal_adresse: f.legal_adresse ?? '', legal_cp: f.legal_cp ?? '', legal_ville: f.legal_ville ?? '',
      prest_prenom: f.prest_prenom ?? '', prest_nom: f.prest_nom ?? '',
      prest_telephone: f.prest_telephone ?? '', prest_email: f.prest_email ?? '',
      prest_adresse: f.prest_adresse ?? '', prest_cp: f.prest_cp ?? '', prest_ville: f.prest_ville ?? '',
      memes_coordonnees: f.memes_coordonnees, option_paiement: f.option_paiement ?? 'c',
    });
    setFormError('');
    setFormOpen(true);
  };

  // Recopie les coordonnées légales dans les coordonnées de prestation.
  const copyLegalToPrest = () => setForm(f => ({
    ...f,
    prest_prenom: f.legal_prenom, prest_nom: f.legal_nom,
    prest_telephone: f.legal_telephone, prest_email: f.legal_email,
    prest_adresse: f.legal_adresse, prest_cp: f.legal_cp, prest_ville: f.legal_ville,
  }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = form.memes_coordonnees
      ? { ...form, prest_prenom: form.legal_prenom, prest_nom: form.legal_nom, prest_telephone: form.legal_telephone, prest_email: form.legal_email, prest_adresse: form.legal_adresse, prest_cp: form.legal_cp, prest_ville: form.legal_ville }
      : form;
    // Champs obligatoires (specs §6.2). SIRET, IBAN et email de prestation restent optionnels.
    const manquant = champManquant(payload);
    if (manquant) { setFormError(`Champ obligatoire manquant : ${manquant}.`); return; }
    if (!emailValide(payload.legal_email ?? '')) { setFormError('Email du responsable légal invalide.'); return; }
    if (String(payload.prest_email ?? '').trim() && !emailValide(payload.prest_email!)) { setFormError('Email du contact prestation invalide.'); return; }
    if (!telephoneValide(payload.legal_telephone ?? '')) { setFormError('Téléphone du responsable légal invalide (ex. 06 12 34 56 78).'); return; }
    if (!telephoneValide(payload.prest_telephone ?? '')) { setFormError('Téléphone du contact prestation invalide (ex. 06 12 34 56 78).'); return; }
    if (String(payload.siret ?? '').trim() && !siretValide(payload.siret!)) { setFormError('SIRET invalide (14 chiffres).'); return; }
    if (String(payload.iban ?? '').trim() && !ibanValide(payload.iban!)) { setFormError('IBAN invalide (vérifiez le format).'); return; }
    setSubmitting(true);
    setFormError('');
    try {
      if (editId) {
        await updateFournisseur(editId, payload);
        setMsg({ type: 'ok', text: 'Fournisseur mis à jour.' });
      } else {
        const res = await createFournisseur(payload);
        setMsg({ type: 'ok', text: `Fournisseur « ${res.nom_societe} » créé.` });
        setCodeSecret({ societe: res.nom_societe, code: res.code_secret_temporaire, emailEnvoye: res.email_envoye });
      }
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || "Échec de l'enregistrement.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnvoyer = async (f: FournisseurRow) => {
    setSendingId(f.id);
    setMsg(null);
    try {
      const res = await envoyerContratFournisseur(f.id);
      setMsg({ type: 'ok', text: res.message || `Contrat envoyé à ${f.nom_societe}.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || "Échec de l'envoi du contrat." });
    } finally {
      setSendingId(null);
    }
  };

  // Génère + télécharge le fichier SEPA de tous les virements fournisseurs en attente.
  const handleExportSepa = async () => {
    if (!confirm('Générer le fichier SEPA de tous les virements fournisseurs en attente ?\n\nLes bons inclus seront marqués « payés » (le fichier vaut ordre de paiement). Chargez-le ensuite sur la banque Winween.')) return;
    setExporting(true);
    setMsg(null);
    try {
      await exporterSepaFournisseurs();
      setMsg({ type: 'ok', text: 'Fichier SEPA téléchargé. Chargez-le sur l\'espace bancaire de Winween pour exécuter les virements.' });
      await load();
    } catch (e: any) {
      // En responseType blob, le message d'erreur JSON arrive sous forme de Blob.
      let text = "Échec de l'export SEPA.";
      try {
        const blob = e?.response?.data;
        if (blob && typeof blob.text === 'function') text = JSON.parse(await blob.text()).error || text;
      } catch { /* garde le message par défaut */ }
      setMsg({ type: 'err', text });
    } finally {
      setExporting(false);
    }
  };

  // Ouvre le contrat généré (PDF) dans un nouvel onglet pour vérification.
  const handlePreviewContrat = async (f: FournisseurRow) => {
    setPreviewId(f.id);
    setMsg(null);
    try {
      const url = await getContratPreviewUrl(f.id);
      window.open(url, '_blank');
      // Libère l'URL blob après ouverture
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || "Impossible de générer le contrat." });
    } finally {
      setPreviewId(null);
    }
  };

  // Repli manuel (sans webhook) : marquer le contrat comme signé → débloque la boutique.
  const handleMarkSigned = async (f: FournisseurRow) => {
    if (!confirm(`Marquer le contrat de « ${f.nom_societe} » comme signé ? La boutique sera débloquée.`)) return;
    setSigningId(f.id);
    setMsg(null);
    try {
      await updateFournisseur(f.id, { contrat_signe: true });
      setMsg({ type: 'ok', text: `Contrat de ${f.nom_societe} marqué comme signé.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || 'Échec de la mise à jour.' });
    } finally {
      setSigningId(null);
    }
  };

  // Suspendre / réactiver un fournisseur (specs §6.1 — statut « Suspendu »).
  // Suspendu = boutique coupée (plus de nouveaux bons) ; historique et bons émis conservés.
  const handleToggleSuspension = async (f: FournisseurRow) => {
    const suspendre = f.statut !== 'suspendu';
    const next = suspendre ? 'suspendu' : 'actif';
    if (suspendre && !confirm(`Suspendre « ${f.nom_societe} » ?\n\nSa boutique sera coupée (plus de nouveaux bons). L'historique et les bons déjà émis sont conservés. Réversible.`)) return;
    setSuspendId(f.id);
    setMsg(null);
    try {
      await updateFournisseur(f.id, { statut: next });
      setMsg({ type: 'ok', text: suspendre ? `${f.nom_societe} suspendu.` : `${f.nom_societe} réactivé.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || 'Échec de la mise à jour du statut.' });
    } finally {
      setSuspendId(null);
    }
  };

  // Annuler le contrat (specs §6.1) → repasse à non signé, la boutique se rebloque.
  const handleAnnulerContrat = async (f: FournisseurRow) => {
    if (!confirm(`Annuler le contrat de « ${f.nom_societe} » ?\n\nLe fournisseur repassera « non signé » et sa boutique sera de nouveau bloquée. Il faudra renvoyer / re-signer un contrat pour la rouvrir.`)) return;
    setAnnulId(f.id);
    setMsg(null);
    try {
      await annulerContratFournisseur(f.id);
      setMsg({ type: 'ok', text: `Contrat de ${f.nom_societe} annulé. Boutique rebloquée.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || "Échec de l'annulation du contrat." });
    } finally {
      setAnnulId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Fournisseurs</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportSepa}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            title="Exporter les virements fournisseurs en attente (fichier SEPA pour la banque)"
          >
            {exporting ? 'Export…' : '💶 Exporter les virements (SEPA)'}
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#C9A84C' }}
          >
            + Ajouter un fournisseur
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl p-4 flex items-start gap-3 border ${msg.type === 'ok' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <span className="text-xl">{msg.type === 'ok' ? '✓' : '⚠️'}</span>
          <p className={`text-sm ${msg.type === 'ok' ? 'text-green-800' : 'text-red-800'}`}>{msg.text}</p>
          <button onClick={() => setMsg(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                {['Société', 'Responsable légal', 'Contrat', 'Statut', 'Action'].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-16">Chargement…</td></tr>
              ) : fournisseurs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-16">
                    <p className="text-3xl mb-3">🏪</p>
                    <p className="font-medium">Aucun fournisseur enregistré</p>
                  </td>
                </tr>
              ) : fournisseurs.map(f => (
                <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{f.nom_societe}</td>
                  <td className="px-4 py-3 text-gray-500">{f.legal_email || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {f.contrat_signe ? (
                      <span className="text-green-600 font-medium">✓ Signé</span>
                    ) : (
                      <Badge label="En attente" variant="warning" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={f.statut} variant="info" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => openEdit(f)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100"
                      >
                        Éditer
                      </button>
                      <button
                        onClick={() => setOffresFournisseur(f)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100"
                        title={f.contrat_signe ? 'Gérer les offres' : 'Préparer les offres (invisibles en boutique tant que le contrat n\'est pas signé)'}
                      >
                        🏪 Boutique
                      </button>
                      <button
                        onClick={() => setHistoFournisseur(f)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100"
                        title="Historique des paiements"
                      >
                        📊 Historique
                      </button>
                      <button
                        onClick={() => handlePreviewContrat(f)}
                        disabled={previewId === f.id}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        title="Télécharger / vérifier le contrat généré"
                      >
                        {previewId === f.id ? '…' : '📄 Contrat'}
                      </button>
                      {!f.contrat_signe && (
                        <>
                          <button
                            onClick={() => handleEnvoyer(f)}
                            disabled={sendingId === f.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ backgroundColor: '#C9A84C' }}
                          >
                            {sendingId === f.id ? 'Envoi…' : 'Envoyer le contrat'}
                          </button>
                          <button
                            onClick={() => handleMarkSigned(f)}
                            disabled={signingId === f.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
                            title="Repli manuel sans webhook (utile en local)"
                          >
                            {signingId === f.id ? '…' : 'Marquer signé'}
                          </button>
                        </>
                      )}
                      {f.contrat_signe && (
                        <button
                          onClick={() => handleAnnulerContrat(f)}
                          disabled={annulId === f.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
                          title="Annuler le contrat → repasse non signé, reblocage de la boutique"
                        >
                          {annulId === f.id ? '…' : 'Annuler le contrat'}
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleSuspension(f)}
                        disabled={suspendId === f.id}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 ${f.statut === 'suspendu' ? 'border-green-300 text-green-700 hover:bg-green-50' : 'border-orange-300 text-orange-700 hover:bg-orange-50'}`}
                        title={f.statut === 'suspendu' ? 'Réactiver le fournisseur' : 'Suspendre le fournisseur (boutique coupée, historique conservé)'}
                      >
                        {suspendId === f.id ? '…' : f.statut === 'suspendu' ? 'Réactiver' : 'Suspendre'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Formulaire création / édition */}
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editId ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{formError}</p>}
          {editContratSigne && (
            <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              ⚠️ <strong>Contrat déjà signé.</strong> Modifier l'identité légale, le SIRET, l'IBAN ou l'option de paiement crée un écart avec le document signé. Pour changer un terme engageant, renvoyez un nouveau contrat.
            </p>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-gray-800 mb-2">Société</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>Raison sociale *</label>
                <input className={inputCls} value={form.nom_societe ?? ''} onChange={e => set('nom_societe', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>SIRET</label>
                <input className={inputCls} value={form.siret ?? ''} onChange={e => set('siret', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>IBAN</label>
                <input className={inputCls} value={form.iban ?? ''} onChange={e => set('iban', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Option de paiement du fournisseur</label>
                <select className={inputCls} value={form.option_paiement ?? 'c'} onChange={e => set('option_paiement', e.target.value)}>
                  <option value="a">A — Paiement à l'ajout en boutique (SÉSAME paie le stock d'avance)</option>
                  <option value="b">B — Paiement à la récupération du QR code par l'Ambassadeur</option>
                  <option value="c">C — Paiement au scan du QR code (recommandé : payé = prestation faite)</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {form.option_paiement === 'a'
                    ? "Trésorerie immobilisée, mais permet de négocier des tarifs plus bas. Idéal gros volumes."
                    : form.option_paiement === 'b'
                      ? "Bon compromis : SÉSAME paie quand l'Ambassadeur récupère son bon valide."
                      : "Meilleure trésorerie pour SÉSAME : on ne paie que lorsque la prestation est effectivement consommée."}
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-gray-800 mb-2">Responsable légal <span className="font-normal text-gray-400">(signataire du contrat)</span></legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Prénom *</label>
                <input className={inputCls} value={form.legal_prenom ?? ''} onChange={e => set('legal_prenom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nom *</label>
                <input className={inputCls} value={form.legal_nom ?? ''} onChange={e => set('legal_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Email * <span className="text-gray-400">(pour la signature)</span></label>
                <input type="email" className={inputCls} value={form.legal_email ?? ''} onChange={e => set('legal_email', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Téléphone *</label>
                <input className={inputCls} value={form.legal_telephone ?? ''} onChange={e => set('legal_telephone', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Adresse (siège social) *</label>
                <input className={inputCls} value={form.legal_adresse ?? ''} onChange={e => set('legal_adresse', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Code postal *</label>
                <input className={inputCls} value={form.legal_cp ?? ''} onChange={e => set('legal_cp', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Ville *</label>
                <input className={inputCls} value={form.legal_ville ?? ''} onChange={e => set('legal_ville', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <div className="flex items-center justify-between mb-2">
              <legend className="text-sm font-semibold text-gray-800">Contact lieu de prestation <span className="font-normal text-gray-400">(validation QR)</span></legend>
              <label className="flex items-center gap-2 text-xs text-gray-600">
                <input type="checkbox" checked={!!form.memes_coordonnees} onChange={e => { set('memes_coordonnees', e.target.checked); if (e.target.checked) copyLegalToPrest(); }} />
                Mêmes coordonnées que le responsable légal
              </label>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${form.memes_coordonnees ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <label className={labelCls}>Prénom *</label>
                <input className={inputCls} value={form.prest_prenom ?? ''} onChange={e => set('prest_prenom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Nom *</label>
                <input className={inputCls} value={form.prest_nom ?? ''} onChange={e => set('prest_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Email <span className="text-gray-400">(optionnel)</span></label>
                <input type="email" className={inputCls} value={form.prest_email ?? ''} onChange={e => set('prest_email', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Téléphone *</label>
                <input className={inputCls} value={form.prest_telephone ?? ''} onChange={e => set('prest_telephone', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Adresse (lieu de prestation) *</label>
                <input className={inputCls} value={form.prest_adresse ?? ''} onChange={e => set('prest_adresse', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Code postal *</label>
                <input className={inputCls} value={form.prest_cp ?? ''} onChange={e => set('prest_cp', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Ville *</label>
                <input className={inputCls} value={form.prest_ville ?? ''} onChange={e => set('prest_ville', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-100">
              Annuler
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
              {submitting ? 'Enregistrement…' : editId ? 'Enregistrer' : 'Créer le fournisseur'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Boutique / offres du fournisseur (invisibles en boutique tant que contrat non signé) */}
      <OffresModal fournisseur={offresFournisseur} onClose={() => setOffresFournisseur(null)} />

      {/* Historique des paiements du fournisseur */}
      <HistoriqueModal fournisseur={histoFournisseur} onClose={() => setHistoFournisseur(null)} />

      {/* Code secret généré à la création — affiché une seule fois */}
      <Modal open={!!codeSecret} onClose={() => setCodeSecret(null)} title="Code secret du fournisseur" maxWidth="max-w-md">
        {codeSecret && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Code secret à 4 chiffres pour <strong>{codeSecret.societe}</strong> (sert à valider les bons QR).
              <strong> Il ne sera plus affiché ensuite.</strong>
            </p>
            <p className={`text-sm rounded-lg px-3 py-2 ${codeSecret.emailEnvoye ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'}`}>
              {codeSecret.emailEnvoye
                ? '✓ Envoyé par email au responsable légal.'
                : '⚠️ Email non envoyé (pas d\'email légal, ou échec). Communiquez le code manuellement.'}
            </p>
            <div className="text-center">
              <span className="inline-block font-mono text-3xl tracking-[0.4em] bg-gray-100 text-gray-900 rounded-xl px-6 py-4">
                {codeSecret.code}
              </span>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setCodeSecret(null)} className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-80" style={{ backgroundColor: '#C9A84C' }}>
                {codeSecret.emailEnvoye ? 'Fermer' : "J'ai noté le code"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
