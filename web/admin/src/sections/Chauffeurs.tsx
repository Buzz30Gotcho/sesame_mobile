import { useEffect, useState, useCallback } from 'react';
import { getChauffeurs, updateChauffeurTaux, getChauffeurDocuments, validerDocument, refuserDocument, updateChauffeurStatut, updateChauffeurNote, getControleIdentite, enregistrerControleIdentite } from '../api';
import type { Chauffeur, ControleIdentite } from '../api';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

// Docs sans expiration selon les specs (Interfaces Catalogue v4 §2)
const DOCS_SANS_EXPIRATION = ['carte_grise', 'photo_profil', 'rir'];
const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

export default function Chauffeurs() {
  const { t, lang } = usePrefs();
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTaux, setEditingTaux] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [selectedChauffeur, setSelectedChauffeur] = useState<Chauffeur | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refusModal, setRefusModal] = useState<any | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  const [validerModal, setValiderModal] = useState<any | null>(null);
  const [dateExpiration, setDateExpiration] = useState('');
  const [rcMentionValide, setRcMentionValide] = useState(false);
  const [noteModal, setNoteModal] = useState<Chauffeur | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  // Contrôle d'identité (specs §5.1 / §9.1)
  const [controleModal, setControleModal] = useState<Chauffeur | null>(null);
  const [controleData, setControleData] = useState<ControleIdentite | null>(null);
  const [controleLoading, setControleLoading] = useState(false);
  const [controleNote, setControleNote] = useState('');
  const [controleSaving, setControleSaving] = useState<string | null>(null);

  const docLabel = (type: string) => {
    const k = `chf.doc.${type}`;
    const v = t(k);
    return v === k ? type : v;
  };
  const docStatutLabel = (statut: string) => {
    switch (statut) {
      case 'valide': return t('chf.docStatut.valide');
      case 'refuse': return t('chf.docStatut.refuse');
      case 'expire': return t('chf.docStatut.expire');
      default: return t('chf.docStatut.en_attente');
    }
  };
  const docStatutCls = (statut: string) =>
    statut === 'valide' ? 'bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300' :
    statut === 'refuse' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' :
    statut === 'expire' ? 'bg-gray-200 text-gray-500 dark:bg-white/10 dark:text-gray-400' :
    'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300';
  const fmtDate = (v: string) => new Date(v).toLocaleDateString(LOCALES[lang]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getChauffeurs();
      setChauffeurs(data);
    } catch {
      setError(t('chf.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleTauxChange = (id: string, val: string) => {
    setEditingTaux(prev => ({ ...prev, [id]: val }));
  };

  const handleSaveTaux = async (id: string) => {
    const val = editingTaux[id];
    if (val === undefined) return;
    const taux = parseFloat(val);
    if (isNaN(taux) || taux < 0 || taux > 100) { showToast(t('chf.invalidTaux')); return; }
    setSaving(id);
    try {
      await updateChauffeurTaux(Number(id), taux);
      showToast(t('chf.tauxUpdated'));
      const updated = { ...editingTaux };
      delete updated[id];
      setEditingTaux(updated);
      load();
    } catch {
      showToast(t('chf.updateError'));
    } finally {
      setSaving(null);
    }
  };

  const openDocs = async (ch: Chauffeur) => {
    setSelectedChauffeur(ch);
    setDocsLoading(true);
    try {
      const data = await getChauffeurDocuments(String(ch.id));
      setDocuments(data);
    } catch {
      showToast(t('chf.docsLoadError'));
    } finally {
      setDocsLoading(false);
    }
  };

  const openValiderModal = (doc: any) => {
    setValiderModal(doc);
    setDateExpiration('');
    setRcMentionValide(false);
  };

  const confirmValider = async () => {
    if (!validerModal) return;
    setActionLoading(validerModal.id);
    try {
      await validerDocument(validerModal.id, dateExpiration || undefined, validerModal.type === 'rc_circulation' ? rcMentionValide : undefined);
      showToast(t('chf.docValidated'));
      setValiderModal(null);
      if (selectedChauffeur) {
        const data = await getChauffeurDocuments(String(selectedChauffeur.id));
        setDocuments(data);
        load();
      }
    } catch { showToast(t('chf.error')); }
    finally { setActionLoading(null); }
  };

  const openNote = (ch: Chauffeur) => {
    setNoteModal(ch);
    setNoteText(ch.note_interne ?? '');
  };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    setNoteSaving(true);
    try {
      await updateChauffeurNote(noteModal.id, noteText);
      showToast(t('chf.noteSaved'));
      setNoteModal(null);
      load();
    } catch { showToast(t('chf.saveError')); }
    finally { setNoteSaving(false); }
  };

  const handleToggleStatut = async (ch: Chauffeur) => {
    if (!ch.utilisateur_id) return;
    const newStatut = ch.compte_statut === 'actif' ? 'suspendu' : 'actif';
    setActionLoading(`statut-${ch.id}`);
    try {
      await updateChauffeurStatut(ch.utilisateur_id, newStatut);
      showToast(newStatut === 'actif' ? t('chf.activated') : t('chf.suspended'));
      load();
    } catch { showToast(t('chf.error')); }
    finally { setActionLoading(null); }
  };

  const openControle = async (ch: Chauffeur) => {
    setControleModal(ch);
    setControleData(null);
    setControleNote('');
    setControleLoading(true);
    try {
      setControleData(await getControleIdentite(String(ch.id)));
    } catch {
      showToast(t('chf.controleLoadError'));
    } finally {
      setControleLoading(false);
    }
  };

  const handleControle = async (resultat: 'conforme' | 'non_conforme') => {
    if (!controleModal) return;
    if (resultat === 'non_conforme' && !confirm(`${t('chf.confirmNonConforme1')} ${controleModal.prenom} ${controleModal.nom} ${t('chf.confirmNonConforme2')}`)) return;
    setControleSaving(resultat);
    try {
      const res = await enregistrerControleIdentite(String(controleModal.id), resultat, controleNote);
      showToast(resultat === 'conforme' ? t('chf.identConfirmed') : t('chf.chauffeurSuspended'));
      setControleModal(null);
      if (res.suspendu) load();
    } catch {
      showToast(t('chf.controleSaveError'));
    } finally {
      setControleSaving(null);
    }
  };

  const handleRefuse = (doc: any) => {
    setRefusModal(doc);
    setMotifRefus('');
  };

  const confirmRefuse = async () => {
    if (!refusModal) return;
    setActionLoading(refusModal.id);
    try {
      await refuserDocument(refusModal.id, motifRefus);
      showToast(t('chf.docRefused'));
      setRefusModal(null);
      if (selectedChauffeur) {
        const data = await getChauffeurDocuments(String(selectedChauffeur.id));
        setDocuments(data);
        load();
      }
    } catch { showToast(t('chf.error')); }
    finally { setActionLoading(null); }
  };

  const linkCls = 'flex-1 text-center py-2 text-sm text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('chf.title')}</h2>

      {/* Modal validation document */}
      {validerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('chf.validerTitle')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{docLabel(validerModal.type)}</p>
              </div>
              <button onClick={() => setValiderModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            {(validerModal.fichier_recto_url || validerModal.fichier_verso_url) && (
              <div className="flex gap-3">
                {validerModal.fichier_recto_url && (
                  <a href={validerModal.fichier_recto_url} target="_blank" rel="noreferrer" className={linkCls}>{t('chf.voirRecto')}</a>
                )}
                {validerModal.fichier_verso_url && (
                  <a href={validerModal.fichier_verso_url} target="_blank" rel="noreferrer" className={linkCls}>{t('chf.voirVerso')}</a>
                )}
              </div>
            )}
            {validerModal.type === 'rc_circulation' && (
              <label className="flex items-start gap-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-orange-500"
                  checked={rcMentionValide}
                  onChange={e => setRcMentionValide(e.target.checked)}
                />
                <span className="text-sm text-orange-700 dark:text-orange-300">
                  {t('chf.rcMention1')} <strong>{t('chf.rcMentionStrong')}</strong>
                </span>
              </label>
            )}
            {!DOCS_SANS_EXPIRATION.includes(validerModal.type) && (
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                  {validerModal.type === 'kbis' ? t('chf.dateExpKbis') : t('chf.dateExp')}
                </label>
                <input
                  type="date"
                  className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-400"
                  value={dateExpiration}
                  onChange={e => setDateExpiration(e.target.value)}
                />
                {validerModal.type === 'kbis' && (
                  <p className="text-xs text-orange-500 mt-1">{t('chf.kbisHint')}</p>
                )}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setValiderModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmValider}
                disabled={actionLoading === validerModal.id}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#4CAF82' }}
              >
                {actionLoading === validerModal.id ? t('chf.validating') : t('chf.confirmValidation')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal motif de refus */}
      {refusModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('chf.refusTitle')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{docLabel(refusModal.type)}</p>
              </div>
              <button onClick={() => setRefusModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            {(refusModal.fichier_recto_url || refusModal.fichier_verso_url) && (
              <div className="flex gap-3">
                {refusModal.fichier_recto_url && (
                  <a href={refusModal.fichier_recto_url} target="_blank" rel="noreferrer" className={linkCls}>{t('chf.docVoirRecto')}</a>
                )}
                {refusModal.fichier_verso_url && (
                  <a href={refusModal.fichier_verso_url} target="_blank" rel="noreferrer" className={linkCls}>{t('chf.docVoirVerso')}</a>
                )}
              </div>
            )}
            {refusModal.statut === 'valide' && (
              <div className="flex items-start gap-2 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl px-4 py-3">
                <span className="text-orange-500 text-lg leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-orange-700 dark:text-orange-300">{t('chf.dejaValide')}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">{t('chf.dejaValideText')}</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('chf.motifRefus')}</label>
              <textarea
                className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                rows={3}
                placeholder={t('chf.motifRefusPlaceholder')}
                value={motifRefus}
                onChange={e => setMotifRefus(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRefusModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">
                {t('common.cancel')}
              </button>
              <button
                onClick={confirmRefuse}
                disabled={actionLoading === refusModal.id}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#FF6464' }}
              >
                {actionLoading === refusModal.id ? t('chf.refusing') : t('chf.confirmRefus')}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>}

      {/* Modal note interne */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('chf.noteInterne')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{noteModal.prenom} {noteModal.nom}</p>
              </div>
              <button onClick={() => setNoteModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            <textarea
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              rows={5}
              placeholder={t('chf.notePlaceholder')}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveNote}
                disabled={noteSaving}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#C9A84C' }}
              >
                {noteSaving ? t('chf.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal contrôle d'identité (specs §5.1 / §9.1) */}
      {controleModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-white/10">
              <div>
                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{t('chf.controleTitle')}</h3>
                <p className="text-xs text-gray-400 mt-0.5">{controleModal.prenom} {controleModal.nom}</p>
              </div>
              <button onClick={() => setControleModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              {controleLoading || !controleData ? <Spinner /> : (
                <>
                  {/* Photo profil format ID en grand */}
                  <div className="flex justify-center">
                    {controleData.photo_profil_url ? (
                      <img
                        src={controleData.photo_profil_url}
                        alt={t('chf.doc.photo_profil')}
                        className="w-40 h-40 object-cover rounded-2xl border border-gray-200 dark:border-white/10"
                      />
                    ) : (
                      <div className="w-40 h-40 rounded-2xl bg-gray-100 dark:bg-white/10 flex items-center justify-center text-gray-300 text-4xl">👤</div>
                    )}
                  </div>

                  {/* Véhicule + immatriculation */}
                  <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('chf.vehicule')}</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">
                        {[controleData.vehicule_type, controleData.vehicule_marque, controleData.vehicule_modele].filter(Boolean).join(' ') || '—'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('chf.couleur')}</span>
                      <span className="font-medium text-gray-800 dark:text-gray-100">{controleData.vehicule_couleur || '—'}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-gray-400">{t('chf.immat')}</span>
                      <span className="font-mono font-bold text-white px-3 py-1 rounded-lg" style={{ backgroundColor: '#4A9EFF' }}>
                        {controleData.vehicule_immat || '—'}
                      </span>
                    </div>
                  </div>

                  {/* Mode opératoire + bouton WhatsApp Video Call */}
                  <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-300">
                    {t('chf.modeOperatoire')}
                  </div>
                  {controleData.telephone ? (
                    <a
                      href={`https://wa.me/${controleData.telephone.replace(/[^0-9]/g, '').replace(/^0/, '33')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                      style={{ backgroundColor: '#25D366' }}
                    >
                      {t('chf.appelWhatsApp')} ({controleData.telephone})
                    </a>
                  ) : (
                    <p className="text-xs text-center text-gray-400">{t('chf.noPhone')}</p>
                  )}

                  <textarea
                    className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
                    rows={2}
                    placeholder={t('chf.controleNotePlaceholder')}
                    value={controleNote}
                    onChange={e => setControleNote(e.target.value)}
                  />

                  {/* Historique des contrôles */}
                  {controleData.historique.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">{t('chf.historique')}</p>
                      <div className="space-y-1">
                        {controleData.historique.map(h => (
                          <div key={h.id} className="flex items-center justify-between text-xs py-1 border-b border-gray-50 dark:border-white/5 last:border-0">
                            <span className={h.resultat === 'conforme' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                              {h.resultat === 'conforme' ? t('chf.conforme') : t('chf.nonConforme')}
                              {h.note ? ` — ${h.note}` : ''}
                            </span>
                            <span className="text-gray-400">{new Date(h.created_at).toLocaleString(LOCALES[lang])}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-gray-100 dark:border-white/10">
              <button
                onClick={() => handleControle('non_conforme')}
                disabled={!!controleSaving || controleLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#FF6464' }}
              >
                {controleSaving === 'non_conforme' ? '…' : t('chf.nonConformeBtn')}
              </button>
              <button
                onClick={() => handleControle('conforme')}
                disabled={!!controleSaving || controleLoading}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#4CAF82' }}
              >
                {controleSaving === 'conforme' ? '…' : t('chf.identConforme')}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {/* Modal documents */}
      {selectedChauffeur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/10">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('chf.viewDocsTitle')} {selectedChauffeur.prenom} {selectedChauffeur.nom}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('chf.docsSub')}</p>
              </div>
              <button onClick={() => setSelectedChauffeur(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {docsLoading ? (
                <Spinner />
              ) : documents.length === 0 ? (
                <p className="text-center text-gray-400 py-8">{t('chf.noDocs')}</p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">{docLabel(doc.type)}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${docStatutCls(doc.statut)}`}>
                              {docStatutLabel(doc.statut)}
                            </span>
                            {doc.date_expiration && doc.statut === 'valide' && (
                              <span className="text-xs text-gray-400">
                                {t('chf.expireLeLower')} {fmtDate(doc.date_expiration)}
                              </span>
                            )}
                            {doc.fichier_recto_url && (
                              <a href={doc.fichier_recto_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">{t('chf.docVoirRecto')}</a>
                            )}
                            {doc.fichier_verso_url && (
                              <a href={doc.fichier_verso_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">{t('chf.docVoirVerso')}</a>
                            )}
                          </div>
                          {doc.statut === 'refuse' && doc.motif_refus && (
                            <p className="text-xs text-red-500 mt-1">{t('chf.motifPrefix')} {doc.motif_refus}</p>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          {doc.statut === 'valide' ? (
                            <div className="flex flex-col items-end gap-1">
                              {doc.date_expiration ? (
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-lg">
                                  {t('chf.expireLeShort')} {fmtDate(doc.date_expiration)}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 px-2 py-1 rounded-lg">
                                  {t('chf.docStatut.valide')}
                                </span>
                              )}
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openValiderModal(doc)}
                                disabled={actionLoading === doc.id}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#4CAF82' }}
                              >
                                {actionLoading === doc.id ? '…' : t('chf.valider')}
                              </button>
                              <button
                                onClick={() => handleRefuse(doc)}
                                disabled={actionLoading === doc.id}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#FF6464' }}
                              >
                                {actionLoading === doc.id ? '…' : t('chf.refuser')}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  {[t('chf.colNomPrenom'), t('chf.colVehicule'), t('chf.colStatutCompte'), t('chf.colDisponible'), t('chf.colDocuments'), t('chf.colTaux'), t('chf.colNote'), t('chf.colAction')].map((h, idx) => (
                    <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chauffeurs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-10">{t('chf.empty')}</td></tr>
                ) : chauffeurs.map(ch => {
                  const id = String(ch.id);
                  const currentTaux = editingTaux[id] ?? String(ch.taux_commission ?? '');
                  const isEditing = editingTaux[id] !== undefined;

                  return (
                    <tr key={ch.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{ch.prenom} {ch.nom}</p>
                        {ch.telephone && <p className="text-xs text-gray-400">{ch.telephone}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{ch.vehicule ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            label={ch.compte_statut === 'suspendu' ? t('chf.suspendu') : t('chf.actif')}
                            variant={ch.compte_statut === 'suspendu' ? 'danger' : 'success'}
                          />
                          <button
                            onClick={() => handleToggleStatut(ch)}
                            disabled={actionLoading === `statut-${ch.id}`}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                            style={{ backgroundColor: ch.compte_statut === 'suspendu' ? '#4CAF82' : '#FF9A3C' }}
                          >
                            {actionLoading === `statut-${ch.id}` ? '…' : ch.compte_statut === 'suspendu' ? t('chf.activer') : t('chf.suspendre')}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={ch.disponible ? t('chf.disponible') : t('chf.indisponible')} variant={ch.disponible ? 'success' : 'gray'} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 items-start">
                          <button
                            onClick={() => openDocs(ch)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                            style={{
                              backgroundColor: ch.documents_valides ? '#E8F5EE' : '#FFF3E0',
                              color: ch.documents_valides ? '#4CAF82' : '#FF9A3C',
                            }}
                          >
                            {t('chf.documentsBtn')}
                          </button>
                          <button
                            onClick={() => openControle(ch)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80 border border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400"
                            title={t('chf.controleBtnTitle')}
                          >
                            {t('chf.controleBtn')}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={currentTaux}
                            onChange={e => handleTauxChange(id, e.target.value)}
                            className="w-20 border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-2 py-1 text-sm outline-none focus:border-yellow-400"
                            placeholder="20"
                          />
                          <span className="text-gray-500 dark:text-gray-400 text-sm">%</span>
                          {!currentTaux && <span className="text-xs text-gray-400">{t('chf.defaut')}</span>}
                        </div>
                      </td>
                      {/* Colonne Note */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 w-[140px]">
                          {ch.note_interne && (
                            <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg px-2 py-1.5">
                              <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap break-words leading-4">
                                {ch.note_interne}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={() => openNote(ch)}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-80 whitespace-nowrap"
                            style={{ backgroundColor: ch.note_interne ? '#C9A84C' : '#9CA3AF' }}
                          >
                            {ch.note_interne ? t('chf.modifier') : t('chf.addNote')}
                          </button>
                        </div>
                      </td>

                      {/* Colonne Action */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isEditing && (
                            <button
                              onClick={() => handleSaveTaux(id)}
                              disabled={saving === id}
                              className="px-3 py-1 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                              style={{ backgroundColor: '#4CAF82' }}
                            >
                              {saving === id ? '…' : t('common.save')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 dark:border-white/10 text-xs text-gray-400">
            {chauffeurs.length} {t('chf.totalCount')}
          </div>
        </div>
      )}
    </div>
  );
}
