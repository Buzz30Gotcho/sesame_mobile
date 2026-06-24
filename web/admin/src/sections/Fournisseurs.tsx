import { useEffect, useState } from 'react';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import OffresModal from './OffresModal';
import HistoriqueModal from './HistoriqueModal';
import {
  getFournisseurs, createFournisseur, updateFournisseur, envoyerContratFournisseur,
  annulerContratFournisseur, getContratPreviewUrl, exporterSepaFournisseurs,
  regenererCodeFournisseur,
  type FournisseurRow, type FournisseurInput,
} from '../api';
import { usePrefs } from '../prefs';

const inputCls = 'w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400';
const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

const emptyForm: FournisseurInput = {
  nom_societe: '', siret: '', iban: '',
  legal_prenom: '', legal_nom: '', legal_email: '', legal_telephone: '',
  legal_adresse: '', legal_cp: '', legal_ville: '',
  prest_prenom: '', prest_nom: '', prest_telephone: '', prest_email: '',
  prest_adresse: '', prest_cp: '', prest_ville: '',
  memes_coordonnees: false, option_paiement: 'c',
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
  const { t } = usePrefs();
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
  const [regenId, setRegenId] = useState<string | null>(null);
  // Code secret généré à la création (à communiquer au responsable légal)
  const [codeSecret, setCodeSecret] = useState<{ societe: string; code: string; emailEnvoye: boolean } | null>(null);

  // Champs obligatoires selon les specs §6.2 (SIRET, IBAN et email de prestation = optionnels).
  const CHAMPS_REQUIS: [keyof FournisseurInput, string][] = [
    ['nom_societe', t('fou.raisonSociale')],
    ['legal_prenom', t('fou.prenom')],
    ['legal_nom', t('fou.nom')],
    ['legal_email', t('fou.emailLegal')],
    ['legal_telephone', t('fou.tel')],
    ['legal_adresse', t('fou.adresseSiege')],
    ['legal_cp', t('fou.cp')],
    ['legal_ville', t('fou.ville')],
    ['prest_prenom', t('fou.prenom')],
    ['prest_nom', t('fou.nom')],
    ['prest_telephone', t('fou.tel')],
    ['prest_adresse', t('fou.adressePrest')],
    ['prest_cp', t('fou.cp')],
    ['prest_ville', t('fou.ville')],
  ];
  const champManquant = (f: FournisseurInput): string | null => {
    for (const [key, label] of CHAMPS_REQUIS) {
      if (!String(f[key] ?? '').trim()) return label;
    }
    return null;
  };

  const load = async () => {
    try {
      setFournisseurs(await getFournisseurs());
    } catch {
      setMsg({ type: 'err', text: t('fou.loadError') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

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
    if (manquant) { setFormError(`${t('fou.champManquant')} ${manquant}`); return; }
    if (!emailValide(payload.legal_email ?? '')) { setFormError(t('fou.emailLegalInvalid')); return; }
    if (String(payload.prest_email ?? '').trim() && !emailValide(payload.prest_email!)) { setFormError(t('fou.emailPrestInvalid')); return; }
    if (!telephoneValide(payload.legal_telephone ?? '')) { setFormError(t('fou.telLegalInvalid')); return; }
    if (!telephoneValide(payload.prest_telephone ?? '')) { setFormError(t('fou.telPrestInvalid')); return; }
    if (String(payload.siret ?? '').trim() && !siretValide(payload.siret!)) { setFormError(t('fou.siretInvalid')); return; }
    if (String(payload.iban ?? '').trim() && !ibanValide(payload.iban!)) { setFormError(t('fou.ibanInvalid')); return; }
    setSubmitting(true);
    setFormError('');
    try {
      if (editId) {
        await updateFournisseur(editId, payload);
        setMsg({ type: 'ok', text: t('fou.updated') });
      } else {
        const res = await createFournisseur(payload);
        setMsg({ type: 'ok', text: `${t('fou.createdPre')} ${res.nom_societe} ${t('fou.createdPost')}` });
        setCodeSecret({ societe: res.nom_societe, code: res.code_secret_temporaire, emailEnvoye: res.email_envoye });
      }
      setFormOpen(false);
      await load();
    } catch (err: any) {
      setFormError(err?.response?.data?.error || t('fou.saveFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEnvoyer = async (f: FournisseurRow) => {
    setSendingId(f.id);
    setMsg(null);
    try {
      const res = await envoyerContratFournisseur(f.id);
      setMsg({ type: 'ok', text: res.message || `${t('fou.contratSentPre')} ${f.nom_societe}.` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || t('fou.contratSendFailed') });
    } finally {
      setSendingId(null);
    }
  };

  // Génère + télécharge le fichier SEPA de tous les virements fournisseurs en attente.
  const handleExportSepa = async () => {
    if (!confirm(t('fou.confirmSepa'))) return;
    setExporting(true);
    setMsg(null);
    try {
      await exporterSepaFournisseurs();
      setMsg({ type: 'ok', text: t('fou.sepaDownloaded') });
      await load();
    } catch (e: any) {
      // En responseType blob, le message d'erreur JSON arrive sous forme de Blob.
      let text = t('fou.sepaFailed');
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
      setMsg({ type: 'err', text: e?.response?.data?.error || t('fou.previewFailed') });
    } finally {
      setPreviewId(null);
    }
  };

  // Repli manuel (sans webhook) : marquer le contrat comme signé → débloque la boutique.
  const handleMarkSigned = async (f: FournisseurRow) => {
    if (!confirm(`${t('fou.confirmMarkSigned1')} ${f.nom_societe} ${t('fou.confirmMarkSigned2')}`)) return;
    setSigningId(f.id);
    setMsg(null);
    try {
      await updateFournisseur(f.id, { contrat_signe: true });
      setMsg({ type: 'ok', text: `${t('fou.markedSignedPre')} ${f.nom_societe} ${t('fou.markedSignedPost')}` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || t('fou.updateFailed') });
    } finally {
      setSigningId(null);
    }
  };

  // Suspendre / réactiver un fournisseur (specs §6.1 — statut « Suspendu »).
  const handleToggleSuspension = async (f: FournisseurRow) => {
    const suspendre = f.statut !== 'suspendu';
    const next = suspendre ? 'suspendu' : 'actif';
    if (suspendre && !confirm(`${t('fou.confirmSuspend1')} ${f.nom_societe} ${t('fou.confirmSuspend2')}`)) return;
    setSuspendId(f.id);
    setMsg(null);
    try {
      await updateFournisseur(f.id, { statut: next });
      setMsg({ type: 'ok', text: `${f.nom_societe} ${suspendre ? t('fou.suspendedPost') : t('fou.reactivatedPost')}` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || t('fou.statutUpdateFailed') });
    } finally {
      setSuspendId(null);
    }
  };

  // Régénère le code secret 4 chiffres (specs §5.4).
  const handleRegenererCode = async (f: FournisseurRow) => {
    if (!confirm(`${t('fou.confirmRegen1')} ${f.nom_societe} ${t('fou.confirmRegen2')}`)) return;
    setRegenId(f.id);
    setMsg(null);
    try {
      const res = await regenererCodeFournisseur(f.id);
      setCodeSecret({ societe: f.nom_societe, code: res.code_secret_temporaire, emailEnvoye: false });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || t('fou.regenFailed') });
    } finally {
      setRegenId(null);
    }
  };

  // Annuler le contrat (specs §6.1) → repasse à non signé, la boutique se rebloque.
  const handleAnnulerContrat = async (f: FournisseurRow) => {
    if (!confirm(`${t('fou.confirmAnnul1')} ${f.nom_societe} ${t('fou.confirmAnnul2')}`)) return;
    setAnnulId(f.id);
    setMsg(null);
    try {
      await annulerContratFournisseur(f.id);
      setMsg({ type: 'ok', text: `${t('fou.contratAnnulePre')} ${f.nom_societe} ${t('fou.contratAnnulePost')}` });
      await load();
    } catch (e: any) {
      setMsg({ type: 'err', text: e?.response?.data?.error || t('fou.annulFailed') });
    } finally {
      setAnnulId(null);
    }
  };

  const actBtnCls = 'px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('fou.title')}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportSepa}
            disabled={exporting}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 disabled:opacity-50"
            title={t('fou.exportSepaTitle')}
          >
            {exporting ? t('fou.exporting') : t('fou.exportSepa')}
          </button>
          <button
            onClick={openCreate}
            className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#C9A84C' }}
          >
            {t('fou.add')}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl p-4 flex items-start gap-3 border ${msg.type === 'ok' ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30' : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30'}`}>
          <span className="text-xl">{msg.type === 'ok' ? '✓' : '⚠️'}</span>
          <p className={`text-sm ${msg.type === 'ok' ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>{msg.text}</p>
          <button onClick={() => setMsg(null)} className="ml-auto text-gray-400 hover:text-gray-600 text-sm">✕</button>
        </div>
      )}

      <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/10">
                {[t('fou.colSociete'), t('fou.colResp'), t('fou.colContrat'), t('common.status'), t('fou.colAction')].map((h, idx) => (
                  <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="text-center text-gray-400 py-16">{t('common.loading')}</td></tr>
              ) : fournisseurs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-gray-400 py-16">
                    <p className="text-3xl mb-3">🏪</p>
                    <p className="font-medium">{t('fou.empty')}</p>
                  </td>
                </tr>
              ) : fournisseurs.map(f => (
                <tr key={f.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{f.nom_societe}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{f.legal_email || <span className="text-gray-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {f.contrat_signe ? (
                      <span className="text-green-600 dark:text-green-400 font-medium">{t('fou.signed')}</span>
                    ) : (
                      <Badge label={t('fou.enAttente')} variant="warning" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge label={f.statut} variant="info" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => openEdit(f)} className={actBtnCls}>
                        {t('fou.editer')}
                      </button>
                      <button
                        onClick={() => setOffresFournisseur(f)}
                        className={actBtnCls}
                        title={f.contrat_signe ? t('fou.boutiqueTitleSigned') : t('fou.boutiqueTitleUnsigned')}
                      >
                        {t('fou.boutique')}
                      </button>
                      <button
                        onClick={() => setHistoFournisseur(f)}
                        className={actBtnCls}
                        title={t('fou.historiqueTitle')}
                      >
                        {t('fou.historique')}
                      </button>
                      <button
                        onClick={() => handlePreviewContrat(f)}
                        disabled={previewId === f.id}
                        className={`${actBtnCls} disabled:opacity-50`}
                        title={t('fou.contratTitle')}
                      >
                        {previewId === f.id ? '…' : t('fou.contrat')}
                      </button>
                      <button
                        onClick={() => handleRegenererCode(f)}
                        disabled={regenId === f.id}
                        className={`${actBtnCls} disabled:opacity-50`}
                        title={t('fou.regenCodeTitle')}
                      >
                        {regenId === f.id ? '…' : t('fou.regenCode')}
                      </button>
                      {!f.contrat_signe && (
                        <>
                          <button
                            onClick={() => handleEnvoyer(f)}
                            disabled={sendingId === f.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ backgroundColor: '#C9A84C' }}
                          >
                            {sendingId === f.id ? t('fou.envoi') : t('fou.envoyerContrat')}
                          </button>
                          <button
                            onClick={() => handleMarkSigned(f)}
                            disabled={signingId === f.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10 disabled:opacity-50"
                            title={t('fou.marquerSigneTitle')}
                          >
                            {signingId === f.id ? '…' : t('fou.marquerSigne')}
                          </button>
                        </>
                      )}
                      {f.contrat_signe && (
                        <button
                          onClick={() => handleAnnulerContrat(f)}
                          disabled={annulId === f.id}
                          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-300 dark:border-red-500/30 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50"
                          title={t('fou.annulerContratTitle')}
                        >
                          {annulId === f.id ? '…' : t('fou.annulerContrat')}
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleSuspension(f)}
                        disabled={suspendId === f.id}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-50 ${f.statut === 'suspendu' ? 'border-green-300 dark:border-green-500/30 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-500/10' : 'border-orange-300 dark:border-orange-500/30 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-500/10'}`}
                        title={f.statut === 'suspendu' ? t('fou.reactiverTitle') : t('fou.suspendreTitle')}
                      >
                        {suspendId === f.id ? '…' : f.statut === 'suspendu' ? t('fou.reactiver') : t('fou.suspendre')}
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
      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editId ? t('fou.modalEditTitle') : t('fou.modalCreateTitle')} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {formError && <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2">{formError}</p>}
          {editContratSigne && (
            <p className="text-sm text-orange-800 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg px-3 py-2">
              ⚠️ <strong>{t('fou.warnSignedStrong')}</strong> {t('fou.warnSignedRest')}
            </p>
          )}

          <fieldset>
            <legend className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('fou.legendSociete')}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('fou.raisonSociale')}</label>
                <input className={inputCls} value={form.nom_societe ?? ''} onChange={e => set('nom_societe', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.siret')}</label>
                <input className={inputCls} value={form.siret ?? ''} onChange={e => set('siret', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.iban')}</label>
                <input className={inputCls} value={form.iban ?? ''} onChange={e => set('iban', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('fou.optionPaiement')}</label>
                <select className={inputCls} value={form.option_paiement ?? 'c'} onChange={e => set('option_paiement', e.target.value)}>
                  <option value="a">{t('fou.optA')}</option>
                  <option value="b">{t('fou.optB')}</option>
                  <option value="c">{t('fou.optC')}</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {form.option_paiement === 'a' ? t('fou.optDescA') : form.option_paiement === 'b' ? t('fou.optDescB') : t('fou.optDescC')}
                </p>
              </div>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('fou.legendLegal')} <span className="font-normal text-gray-400">{t('fou.legendLegalSub')}</span></legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>{t('fou.prenom')}</label>
                <input className={inputCls} value={form.legal_prenom ?? ''} onChange={e => set('legal_prenom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.nom')}</label>
                <input className={inputCls} value={form.legal_nom ?? ''} onChange={e => set('legal_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.emailLegal')} <span className="text-gray-400">{t('fou.emailLegalSub')}</span></label>
                <input type="email" className={inputCls} value={form.legal_email ?? ''} onChange={e => set('legal_email', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.tel')}</label>
                <input className={inputCls} value={form.legal_telephone ?? ''} onChange={e => set('legal_telephone', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('fou.adresseSiege')}</label>
                <input className={inputCls} value={form.legal_adresse ?? ''} onChange={e => set('legal_adresse', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.cp')}</label>
                <input className={inputCls} value={form.legal_cp ?? ''} onChange={e => set('legal_cp', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.ville')}</label>
                <input className={inputCls} value={form.legal_ville ?? ''} onChange={e => set('legal_ville', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <fieldset>
            <div className="flex items-center justify-between mb-2">
              <legend className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('fou.legendPrest')} <span className="font-normal text-gray-400">{t('fou.legendPrestSub')}</span></legend>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={!!form.memes_coordonnees} onChange={e => { set('memes_coordonnees', e.target.checked); if (e.target.checked) copyLegalToPrest(); }} />
                {t('fou.memesCoord')}
              </label>
            </div>
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${form.memes_coordonnees ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <label className={labelCls}>{t('fou.prenom')}</label>
                <input className={inputCls} value={form.prest_prenom ?? ''} onChange={e => set('prest_prenom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.nom')}</label>
                <input className={inputCls} value={form.prest_nom ?? ''} onChange={e => set('prest_nom', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.emailOpt')} <span className="text-gray-400">{t('fou.emailOptSub')}</span></label>
                <input type="email" className={inputCls} value={form.prest_email ?? ''} onChange={e => set('prest_email', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.tel')}</label>
                <input className={inputCls} value={form.prest_telephone ?? ''} onChange={e => set('prest_telephone', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>{t('fou.adressePrest')}</label>
                <input className={inputCls} value={form.prest_adresse ?? ''} onChange={e => set('prest_adresse', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.cp')}</label>
                <input className={inputCls} value={form.prest_cp ?? ''} onChange={e => set('prest_cp', e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>{t('fou.ville')}</label>
                <input className={inputCls} value={form.prest_ville ?? ''} onChange={e => set('prest_ville', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={submitting} className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50" style={{ backgroundColor: '#C9A84C' }}>
              {submitting ? t('common.saving') : editId ? t('common.save') : t('fou.creer')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Boutique / offres du fournisseur (invisibles en boutique tant que contrat non signé) */}
      <OffresModal fournisseur={offresFournisseur} onClose={() => setOffresFournisseur(null)} />

      {/* Historique des paiements du fournisseur */}
      <HistoriqueModal fournisseur={histoFournisseur} onClose={() => setHistoFournisseur(null)} />

      {/* Code secret généré à la création — affiché une seule fois */}
      <Modal open={!!codeSecret} onClose={() => setCodeSecret(null)} title={t('fou.codeSecretTitle')} maxWidth="max-w-md">
        {codeSecret && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('fou.codeSecretDesc1')} <strong>{codeSecret.societe}</strong> {t('fou.codeSecretDesc2')}
              <strong> {t('fou.codeSecretDesc3')}</strong>
            </p>
            <p className={`text-sm rounded-lg px-3 py-2 ${codeSecret.emailEnvoye ? 'bg-green-50 dark:bg-green-500/10 text-green-800 dark:text-green-300' : 'bg-orange-50 dark:bg-orange-500/10 text-orange-800 dark:text-orange-300'}`}>
              {codeSecret.emailEnvoye ? t('fou.codeSentEmail') : t('fou.codeNotSent')}
            </p>
            <div className="text-center">
              <span className="inline-block font-mono text-3xl tracking-[0.4em] bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-gray-100 rounded-xl px-6 py-4">
                {codeSecret.code}
              </span>
            </div>
            <div className="flex justify-end">
              <button onClick={() => setCodeSecret(null)} className="px-4 py-2 text-sm font-medium rounded-lg text-white hover:opacity-80" style={{ backgroundColor: '#C9A84C' }}>
                {codeSecret.emailEnvoye ? t('common.close') : t('fou.codeNoted')}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
