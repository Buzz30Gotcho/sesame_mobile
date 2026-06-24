import { useEffect, useState, useCallback } from 'react';
import { getEchangesEnAttente, validerEchange, refuserEchange } from '../api';
import type { Echange } from '../api';
import Spinner from '../components/Spinner';
import Badge, { getStatusVariant } from '../components/Badge';
import { usePrefs } from '../prefs';

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

export default function Echanges() {
  const { t, lang } = usePrefs();
  const [enAttente, setEnAttente] = useState<Echange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onglet, setOnglet] = useState<'attente' | 'tous'>('attente');
  const [toast, setToast] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);

  const formatDateTime = (value?: string) => {
    if (!value) return '—';
    return new Date(value).toLocaleString(LOCALES[lang], {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getEchangesEnAttente();
      setEnAttente(data);
    } catch {
      setError(t('common.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleValider = async (id: number) => {
    setProcessing(id);
    try {
      await validerEchange(id);
      showToast(t('ech.validated'));
      load();
    } catch {
      showToast(t('ech.validateError'));
    } finally {
      setProcessing(null);
    }
  };

  const handleRefuser = async (id: number) => {
    setProcessing(id);
    try {
      await refuserEchange(id);
      showToast(t('ech.refused'));
      load();
    } catch {
      showToast(t('ech.refuseError'));
    } finally {
      setProcessing(null);
    }
  };

  const estEnAttente = (e: Echange) => e.statut === 'en_attente_admin' || e.statut === 'en_attente' || !e.statut;
  const displayed = onglet === 'attente' ? enAttente.filter(estEnAttente) : enAttente;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('ech.title')}</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Onglets */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-white/10">
        <button
          onClick={() => setOnglet('attente')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
            onglet === 'attente'
              ? 'border-yellow-500 text-yellow-700 dark:text-yellow-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('ech.tabPending')}
          {enAttente.filter(estEnAttente).length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
              {enAttente.filter(estEnAttente).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setOnglet('tous')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            onglet === 'tous'
              ? 'border-yellow-500 text-yellow-700 dark:text-yellow-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('common.all')} ({enAttente.length})
        </button>
      </div>

      {loading ? (
        <Spinner />
      ) : displayed.length === 0 ? (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">🎁</p>
          <p className="text-gray-500 dark:text-gray-400 font-medium">
            {onglet === 'attente' ? t('ech.emptyPending') : t('ech.emptyAll')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {displayed.map(echange => {
            const enAttenteItem = estEnAttente(echange);
            return (
              <div
                key={echange.id}
                className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-5 border-l-4"
                style={{ borderLeftColor: enAttenteItem ? '#FF9A3C' : echange.statut === 'valide' ? '#4CAF82' : '#FF6464' }}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{echange.offre_nom ?? t('ech.giftCard')}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      {[echange.ambassadeur_prenom, echange.ambassadeur_nom].filter(Boolean).join(' ') || t('ech.unknownAmb')}
                    </p>
                  </div>
                  <Badge
                    label={echange.statut ?? 'en_attente'}
                    variant={getStatusVariant(echange.statut ?? 'en_attente')}
                  />
                </div>

                <div className="flex items-center justify-between mb-4">
                  <div className="text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-medium" style={{ color: '#C9A84C' }}>
                      {echange.points_deduits ?? '—'} {t('common.points')}
                    </span>
                    {' '}{t('ech.deducted')}
                  </div>
                  <div className="text-xs text-gray-400 text-right">
                    {(echange.date_demande || echange.created_at) && (
                      <div>{t('ech.requestedOn')} {formatDateTime(echange.date_demande || echange.created_at)}</div>
                    )}
                    {echange.remis_at && (
                      <div className="text-green-600 dark:text-green-400">{t('ech.validatedOn')} {formatDateTime(echange.remis_at)}</div>
                    )}
                  </div>
                </div>

                {enAttenteItem && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleValider(echange.id)}
                      disabled={processing === echange.id}
                      className="flex-1 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: '#4CAF82' }}
                    >
                      {processing === echange.id ? '…' : t('ech.btnValidate')}
                    </button>
                    <button
                      onClick={() => handleRefuser(echange.id)}
                      disabled={processing === echange.id}
                      className="flex-1 py-2 text-sm font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                      style={{ backgroundColor: '#FF6464' }}
                    >
                      {processing === echange.id ? '…' : t('ech.btnRefuse')}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
