import { useEffect, useState, useCallback } from 'react';
import { getLitiges, creerLitige, updateLitige } from '../api';
import type { Litige, LitigeType, LitigeStatut } from '../api';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

const STATUT_COLORS: Record<LitigeStatut, string> = {
  ouvert: '#FF6464',
  en_analyse: '#FF9A3C',
  clos: '#4CAF82',
};

const TYPES: LitigeType[] = ['code_invalide', 'course_non_effectuee', 'comportement', 'paiement_conteste', 'annulation_litigieuse'];
const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

type Filter = 'tous' | LitigeStatut;

export default function Litiges() {
  const { t, lang } = usePrefs();
  const [litiges, setLitiges] = useState<Litige[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('tous');
  const [toast, setToast] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  // Modale clôture
  const [closeModal, setCloseModal] = useState<Litige | null>(null);
  const [decision, setDecision] = useState('');

  // Modale création manuelle
  const [createOpen, setCreateOpen] = useState(false);
  const [newType, setNewType] = useState<LitigeType>('comportement');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  const typeLabel = (ty: LitigeType) => t(`lit.type.${ty}`);
  const statutLabel = (s: LitigeStatut) => t(`lit.statut.${s}`);

  const formatDateTime = (value?: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString(LOCALES[lang], {
      day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLitiges(await getLitiges());
    } catch {
      setError(t('lit.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const handleStatut = async (l: Litige, statut: LitigeStatut, dec?: string) => {
    setProcessing(l.id);
    try {
      await updateLitige(l.id, statut, dec);
      showToast(t('lit.updated'));
      setCloseModal(null);
      setDecision('');
      load();
    } catch {
      showToast(t('lit.updateError'));
    } finally {
      setProcessing(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      await creerLitige({ type: newType, description: newDesc || undefined });
      showToast(t('lit.created'));
      setCreateOpen(false);
      setNewDesc('');
      setNewType('comportement');
      load();
    } catch {
      showToast(t('lit.createError'));
    } finally {
      setCreating(false);
    }
  };

  const counts = {
    tous: litiges.length,
    ouvert: litiges.filter(l => l.statut === 'ouvert').length,
    en_analyse: litiges.filter(l => l.statut === 'en_analyse').length,
    clos: litiges.filter(l => l.statut === 'clos').length,
  };

  const filtered = filter === 'tous' ? litiges : litiges.filter(l => l.statut === filter);

  const filters: { key: Filter; label: string }[] = [
    { key: 'tous', label: t('lit.filterTous') },
    { key: 'ouvert', label: t('lit.filterOuvert') },
    { key: 'en_analyse', label: t('lit.filterEnAnalyse') },
    { key: 'clos', label: t('lit.filterClos') },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('lit.title')}</h2>
        <button
          onClick={() => setCreateOpen(true)}
          className="px-4 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80"
          style={{ backgroundColor: '#C9A84C' }}
        >
          {t('lit.new')}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {/* Filtres */}
      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
              filter === f.key ? 'text-white border-transparent' : 'bg-white dark:bg-[#161624] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300'
            }`}
            style={filter === f.key ? { backgroundColor: f.key === 'tous' ? '#1C1C2E' : STATUT_COLORS[f.key as LitigeStatut] } : {}}
          >
            {f.label} <span className="opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">⚖️</p>
          <p className="text-gray-500 dark:text-gray-300 font-medium">{t('lit.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(l => (
            <div
              key={l.id}
              className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-5 border-l-4"
              style={{ borderLeftColor: STATUT_COLORS[l.statut] }}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{typeLabel(l.type)}</span>
                    <span
                      className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: STATUT_COLORS[l.statut] }}
                    >
                      {statutLabel(l.statut)}
                    </span>
                    {l.origine === 'auto' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400">{t('lit.auto')}</span>
                    )}
                    {l.course_reference && (
                      <span className="text-xs font-mono text-gray-400">{l.course_reference}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {[l.ambassadeur_prenom, l.ambassadeur_nom].filter(Boolean).join(' ') && (
                      <>👤 {[l.ambassadeur_prenom, l.ambassadeur_nom].filter(Boolean).join(' ')} </>
                    )}
                    {[l.chauffeur_prenom, l.chauffeur_nom].filter(Boolean).join(' ') && (
                      <>🚗 {[l.chauffeur_prenom, l.chauffeur_nom].filter(Boolean).join(' ')}</>
                    )}
                  </p>
                  {l.description && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{l.description}</p>}
                  {l.decision && (
                    <p className="text-sm mt-1 text-green-700 dark:text-green-400"><strong>{t('lit.decision')}</strong> {l.decision}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {t('lit.openedOn')} {formatDateTime(l.created_at)}
                    {l.closed_at && ` · ${t('lit.closedOn')} ${formatDateTime(l.closed_at)}`}
                  </p>
                </div>

                {l.statut !== 'clos' && (
                  <div className="flex items-center gap-2 shrink-0">
                    {l.statut === 'ouvert' && (
                      <button
                        onClick={() => handleStatut(l, 'en_analyse')}
                        disabled={processing === l.id}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                        style={{ backgroundColor: '#FF9A3C' }}
                      >
                        {processing === l.id ? '…' : t('lit.passEnAnalyse')}
                      </button>
                    )}
                    <button
                      onClick={() => { setCloseModal(l); setDecision(''); }}
                      disabled={processing === l.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: '#4CAF82' }}
                    >
                      {t('lit.cloturer')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modale clôture */}
      {closeModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('lit.modalCloseTitle')}</h3>
              <button onClick={() => setCloseModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{typeLabel(closeModal.type)}</p>
            <textarea
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              rows={3}
              placeholder={t('lit.decisionPlaceholder')}
              value={decision}
              onChange={e => setDecision(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCloseModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">{t('common.cancel')}</button>
              <button
                onClick={() => handleStatut(closeModal, 'clos', decision)}
                disabled={processing === closeModal.id}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#4CAF82' }}
              >
                {processing === closeModal.id ? '…' : t('lit.confirmClose')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modale création manuelle */}
      {createOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('lit.modalNewTitle')}</h3>
              <button onClick={() => setCreateOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('common.type')}</label>
              <select
                className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
                value={newType}
                onChange={e => setNewType(e.target.value as LitigeType)}
              >
                {TYPES.map(ty => (
                  <option key={ty} value={ty}>{typeLabel(ty)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{t('lit.descLabel')}</label>
              <textarea
                className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
                rows={3}
                placeholder={t('lit.descPlaceholder')}
                value={newDesc}
                onChange={e => setNewDesc(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setCreateOpen(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">{t('common.cancel')}</button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#C9A84C' }}
              >
                {creating ? t('lit.creating') : t('lit.createBtn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
