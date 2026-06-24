import { useEffect, useState, useCallback } from 'react';
import { getCommissionsMoraux, exporterSepaCommissions } from '../api';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

interface AmbassadeurCommission {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  etablissement: string | null;
  iban?: string;
  nb_courses: number;
  ca_brut: number;
  commission: number;
  statut_versement: string | null;
  date_versement: string | null;
}

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

// 'YYYY-MM' du mois courant
function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// 'YYYY-MM' du mois précédent — on paie à terme échu (specs : « calcul au 1er du mois
// sur les courses du mois précédent »). Le 1er juillet → on règle juin.
function previousMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function CommissionsMoraux() {
  const { t, lang } = usePrefs();
  const [mois, setMois] = useState<string>(previousMonth());
  const [ambassadeurs, setAmbassadeurs] = useState<AmbassadeurCommission[]>([]);
  const [tauxPct, setTauxPct] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState('');

  // 'YYYY-MM' → « juin 2026 » (selon la langue active)
  const formatMonth = (m: string): string => {
    const [y, mo] = m.split('-').map(Number);
    if (!y || !mo) return m;
    return new Date(y, mo - 1).toLocaleDateString(LOCALES[lang], { month: 'long', year: 'numeric' });
  };

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await getCommissionsMoraux(m);
      setTauxPct(result.taux_pct);
      setAmbassadeurs(result.ambassadeurs);
    } catch {
      setError(t('common.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(mois); }, [load, mois]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleExportSepa = async () => {
    if (!confirm(`${t('com.confirmSepa1')} ${formatMonth(mois)} ?\n\n${t('com.confirmSepa2')}`)) return;
    setExporting(true);
    try {
      await exporterSepaCommissions(mois);
      showToast(t('com.sepaDownloaded'));
      await load(mois);
    } catch (e: any) {
      let text = t('com.sepaFailed');
      try {
        const blob = e?.response?.data;
        if (blob && typeof blob.text === 'function') text = JSON.parse(await blob.text()).error || text;
      } catch { /* message par défaut */ }
      showToast(text);
    } finally {
      setExporting(false);
    }
  };

  const moisLabel = formatMonth(mois);
  const isCurrentMonth = mois === currentMonth();
  const totalCA = ambassadeurs.reduce((acc, a) => acc + a.ca_brut, 0);
  const totalCommissions = ambassadeurs.reduce((acc, a) => acc + a.commission, 0);
  // Lignes avec du CA mais pas encore versées
  const aVerser = ambassadeurs.filter(a => a.ca_brut > 0 && !a.statut_versement);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {t('com.title')} <span style={{ color: '#C9A84C' }}>{moisLabel}</span>
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('com.subtitlePre')} {tauxPct}{t('com.subtitlePost')}</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500 dark:text-gray-400">
            {t('com.monthLabel')}
            <input
              type="month"
              value={mois}
              max={currentMonth()}
              onChange={e => setMois(e.target.value || previousMonth())}
              className="ml-2 border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400"
            />
          </label>
          <button
            onClick={handleExportSepa}
            disabled={exporting || aVerser.length === 0}
            title={aVerser.length === 0 ? t('com.exportTitleEmpty') : `${t('com.exportTitlePre')} ${aVerser.length} ${t('com.exportTitlePost')}`}
            className="px-5 py-2 text-sm font-bold rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: '#C9A84C' }}
          >
            {exporting ? t('com.exporting') : t('com.exportSepa')}
          </button>
        </div>
      </div>

      {/* Bandeau pédagogique : explique le cycle de paiement à l'admin, en mots simples */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-3 text-sm text-blue-800 dark:text-blue-300 flex items-start gap-2">
        <span>ℹ️</span>
        <span>
          {t('com.infoBanner1')}<strong>{moisLabel}</strong>{t('com.infoBanner2')}
        </span>
      </div>

      {/* Avertissement si l'admin consulte le mois en cours (pas encore fini, donc pas à payer) */}
      {isCurrentMonth && (
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
          <span>⏳</span>
          <span>{t('com.warnCurrentMonth')}</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {ambassadeurs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('com.kpiCA')}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: '#C9A84C' }}>{totalCA.toFixed(2)} €</p>
          </div>
          <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('com.kpiCommissions')}</p>
            <p className="text-2xl font-bold mt-1" style={{ color: '#4CAF82' }}>{totalCommissions.toFixed(2)} €</p>
          </div>
          <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide">{t('com.kpiMoraux')}</p>
            <p className="text-2xl font-bold mt-1 text-gray-900 dark:text-gray-100">{ambassadeurs.length}</p>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : ambassadeurs.length === 0 ? (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-medium">{t('com.emptyTitle')} {moisLabel}</p>
          <p className="text-sm mt-1">{t('com.emptySub')}</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  {[t('com.colEntreprise'), t('common.email'), t('com.colIban'), t('com.colNbCourses'), t('com.colCaBrut'), `${t('com.colCommission')} ${tauxPct}%`, t('com.colStatutVersement')].map((h, idx) => (
                    <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadeurs.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{a.etablissement || '—'}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{a.prenom} {a.nom}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{a.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">{a.iban || '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{a.nb_courses}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#C9A84C' }}>{a.ca_brut.toFixed(2)} €</td>
                    <td className="px-4 py-3 font-bold" style={{ color: '#4CAF82' }}>{a.commission.toFixed(2)} €</td>
                    <td className="px-4 py-3">
                      {a.statut_versement ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#4CAF8220', color: '#2E7D5B' }}>
                          ✓ {t('com.verse')}{a.date_versement ? ` ${t('com.le')} ${new Date(a.date_versement).toLocaleDateString(LOCALES[lang])}` : ''}
                        </span>
                      ) : a.ca_brut > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#FF9A3C20', color: '#B26A1A' }}>
                          {t('com.aVerser')}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
