import { useEffect, useState, useCallback } from 'react';
import {
  getBlacklist, addBlacklist, deleteBlacklist,
  getBlacklistPropositions, confirmerBlacklistProposition, rejeterBlacklistProposition,
} from '../api';
import type { BlacklistEntry, BlacklistProposition } from '../api';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

const emptyForm: BlacklistEntry = {
  nom: '',
  prenom: '',
  date_naissance: '',
  lieu_naissance: '',
  telephone: '',
  motif: '',
  type_utilisateur: 'ambassadeur',
};

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

export default function Blacklist() {
  const { t, lang } = usePrefs();
  const [list, setList] = useState<BlacklistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<BlacklistEntry>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [formError, setFormError] = useState('');
  const [propositions, setPropositions] = useState<BlacklistProposition[]>([]);
  const [propProcessing, setPropProcessing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [data, props] = await Promise.allSettled([getBlacklist(), getBlacklistPropositions()]);
      if (data.status === 'fulfilled') setList(data.value);
      if (props.status === 'fulfilled') setPropositions(props.value);
      if (data.status === 'rejected') setError(t('bl.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleConfirmProp = async (p: BlacklistProposition) => {
    if (!confirm(`${t('bl.confirmProp1')} ${p.prenom} ${p.nom} ?\n\n${t('bl.confirmProp2')}`)) return;
    setPropProcessing(p.id);
    try {
      await confirmerBlacklistProposition(p.id, p.motif);
      showToast(t('bl.propConfirmed'));
      load();
    } catch {
      showToast(t('bl.propConfirmError'));
    } finally {
      setPropProcessing(null);
    }
  };

  const handleRejectProp = async (p: BlacklistProposition) => {
    setPropProcessing(p.id);
    try {
      await rejeterBlacklistProposition(p.id);
      showToast(t('bl.propRejected'));
      load();
    } catch {
      showToast(t('bl.propRejectError'));
    } finally {
      setPropProcessing(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('bl.confirmDelete'))) return;
    try {
      await deleteBlacklist(id);
      showToast(t('bl.deleted'));
      load();
    } catch {
      showToast(t('bl.deleteError'));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
    setFormError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const required: (keyof BlacklistEntry)[] = ['nom', 'prenom', 'date_naissance', 'telephone', 'motif'];
    for (const field of required) {
      if (!form[field]?.toString().trim()) {
        setFormError(`${t('bl.fieldRequired')} "${field.replace('_', ' ')}"`);
        return;
      }
    }
    setSubmitting(true);
    try {
      await addBlacklist(form);
      showToast(t('bl.added'));
      setForm(emptyForm);
      load();
    } catch {
      showToast(t('bl.addError'));
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = 'w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400';
  const labelCls = 'block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('bl.title')}</h2>

      {/* Bannière alerte */}
      <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl shrink-0">🔕</span>
        <div>
          <p className="text-sm font-bold text-red-800 dark:text-red-300">{t('bl.bannerTitle')}</p>
          <p className="text-sm text-red-700 dark:text-red-300/80 mt-0.5">
            {t('bl.bannerText')}
          </p>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Propositions automatiques (5 annulations) — confirmation manuelle obligatoire (specs §9.0) */}
      {propositions.length > 0 && (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden border border-orange-200 dark:border-orange-500/30">
          <div className="px-5 py-3 bg-orange-50 dark:bg-orange-500/10 border-b border-orange-100 dark:border-orange-500/20 flex items-center gap-2">
            <span className="text-lg">⚡</span>
            <p className="text-sm font-semibold text-orange-800 dark:text-orange-300">
              {propositions.length} {t('bl.propTitle')}
            </p>
            <span className="text-xs text-orange-600 dark:text-orange-400 ml-1">{t('bl.propSubtitle')}</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-white/5">
            {propositions.map(p => (
              <div key={p.id} className="flex items-center justify-between px-5 py-3 gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {p.nom.toUpperCase()} {p.prenom}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p.motif} · {p.nb_annulations} {t('bl.cancellations')}
                    {p.telephone && ` · ${p.telephone}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleConfirmProp(p)}
                    disabled={propProcessing === p.id}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: '#FF6464' }}
                  >
                    {propProcessing === p.id ? '…' : t('bl.confirmBlocage')}
                  </button>
                  <button
                    onClick={() => handleRejectProp(p)}
                    disabled={propProcessing === p.id}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 disabled:opacity-50"
                  >
                    {t('bl.reject')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulaire d'ajout */}
      <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">{t('bl.addPersonTitle')}</h3>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t('bl.nom')}</label>
              <input type="text" name="nom" value={form.nom} onChange={handleChange} placeholder={t('bl.nomPlaceholder')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('bl.prenom')}</label>
              <input type="text" name="prenom" value={form.prenom} onChange={handleChange} placeholder={t('bl.prenomPlaceholder')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('bl.dob')}</label>
              <input type="date" name="date_naissance" value={form.date_naissance} onChange={handleChange} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('bl.pob')}</label>
              <input type="text" name="lieu_naissance" value={form.lieu_naissance} onChange={handleChange} placeholder={t('bl.pobPlaceholder')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('bl.tel')}</label>
              <input type="tel" name="telephone" value={form.telephone} onChange={handleChange} placeholder={t('bl.telPlaceholder')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>{t('bl.typeReq')}</label>
              <select name="type_utilisateur" value={form.type_utilisateur} onChange={handleChange} className={inputCls}>
                <option value="ambassadeur">{t('bl.optAmbassadeur')}</option>
                <option value="chauffeur">{t('bl.optChauffeur')}</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>{t('bl.motif')}</label>
              <textarea
                name="motif"
                value={form.motif}
                onChange={handleChange}
                placeholder={t('bl.motifPlaceholder')}
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>
          </div>

          {formError && (
            <p className="text-red-600 dark:text-red-400 text-sm mt-3">{formError}</p>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: '#FF6464' }}
            >
              {submitting ? t('bl.adding') : t('bl.addBtn')}
            </button>
          </div>
        </form>
      </div>

      {/* Liste */}
      <div>
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-3">
          {t('bl.blockedPersons')} ({list.length})
        </h3>
        {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm mb-3">{error}</div>}
        {loading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-8 text-center text-gray-400">
            <p className="text-3xl mb-2">🔒</p>
            <p>{t('bl.emptyList')}</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 dark:border-white/10">
                    {[t('bl.colNomPrenom'), t('bl.colDob'), t('bl.colPob'), t('common.phone'), t('common.type'), t('bl.colMotif'), t('bl.colAddedOn'), ''].map((h, idx) => (
                      <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map((entry, i) => (
                    <tr key={entry.id ?? i} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                        {entry.nom.toUpperCase()} {entry.prenom}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{entry.date_naissance}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{entry.lieu_naissance}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{entry.telephone}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={entry.type_utilisateur}
                          variant={entry.type_utilisateur === 'chauffeur' ? 'info' : 'or'}
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate">{entry.motif}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {entry.created_at ? new Date(entry.created_at).toLocaleDateString(LOCALES[lang]) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleDelete(entry.id!)}
                          className="text-red-400 hover:text-red-600 transition-colors text-lg"
                          title={t('common.delete')}
                        >🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
