import { useEffect, useState, useCallback } from 'react';
import { getSanctionsEnAttente, arbitrerAlerte } from '../api';
import type { Sanction } from '../api';
import Spinner from '../components/Spinner';

export default function Alertes() {
  const [alertes, setAlertes] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [details, setDetails] = useState<Record<number, { points?: string; montant?: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getSanctionsEnAttente();
      setAlertes(data);
    } catch {
      setError('Impossible de charger les alertes. Le backend est peut-être hors ligne.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  const handleArbitrage = async (id: number, action: string, extra?: { points_sanction?: number; montant_indemnisation?: number }) => {
    setProcessing(id);
    try {
      await arbitrerAlerte(id, { action, ...extra });
      showToast(`Action "${action}" appliquée avec succès`);
      load();
    } catch {
      showToast('Erreur lors de l\'arbitrage');
    } finally {
      setProcessing(null);
    }
  };

  const getDetail = (id: number) => details[id] ?? {};
  const setDetail = (id: number, key: 'points' | 'montant', val: string) => {
    setDetails(prev => ({ ...prev, [id]: { ...prev[id], [key]: val } }));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">
        Alertes
        {alertes.length > 0 && (
          <span className="ml-2 bg-red-500 text-white text-base font-bold rounded-full px-2.5 py-0.5">
            {alertes.length}
          </span>
        )}
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {loading ? (
        <Spinner />
      ) : alertes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-gray-500 font-medium">Aucune alerte en attente</p>
          <p className="text-sm text-gray-400 mt-1">Toutes les situations ont été traitées</p>
        </div>
      ) : (
        <div className="space-y-4">
          {alertes.map(alerte => {
            const det = getDetail(alerte.id);
            const isPending = processing === alerte.id;

            return (
              <div
                key={alerte.id}
                className="bg-white rounded-xl shadow-sm p-5 border-l-4"
                style={{ borderLeftColor: '#FF9A3C' }}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="font-semibold text-gray-900 flex items-center gap-2">
                      <span className="text-orange-500">⚠️</span>
                      Course {alerte.course_reference ?? `#${alerte.course_id ?? alerte.id}`}
                    </p>
                    <div className="text-sm text-gray-500 mt-1 space-x-3">
                      {alerte.ambassadeur_nom && (
                        <span>👤 Amb. <strong>{alerte.ambassadeur_nom}</strong></span>
                      )}
                      {alerte.chauffeur_nom && (
                        <span>🚗 Chauf. <strong>{alerte.chauffeur_nom}</strong></span>
                      )}
                    </div>
                    {alerte.type && (
                      <p className="text-xs text-gray-400 mt-1 capitalize">{alerte.type.replace(/_/g, ' ')}</p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {alerte.created_at ? new Date(alerte.created_at).toLocaleString('fr-FR') : ''}
                  </div>
                </div>

                {/* Boutons d'arbitrage */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* 1 - Délai */}
                  <button
                    onClick={() => handleArbitrage(alerte.id, 'delai')}
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    <span className="text-lg">⏱️</span>
                    <div className="text-left">
                      <div className="font-semibold">Accorder un délai</div>
                      <div className="text-xs opacity-70">Laisser plus de temps au client</div>
                    </div>
                  </button>

                  {/* 2 - Annuler sans pénalité */}
                  <button
                    onClick={() => handleArbitrage(alerte.id, 'annuler_sans_penalite')}
                    disabled={isPending}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium border-2 border-gray-200 text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <span className="text-lg">🚫</span>
                    <div className="text-left">
                      <div className="font-semibold">Annuler sans pénalité</div>
                      <div className="text-xs opacity-70">Clôturer sans sanction</div>
                    </div>
                  </button>

                  {/* 3 - Pénalité ambassadeur */}
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-orange-200 bg-orange-50">
                    <span className="text-lg">⚡</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-orange-800">Pénalité ambassadeur</div>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          min="0"
                          placeholder="Points"
                          value={det.points ?? ''}
                          onChange={e => setDetail(alerte.id, 'points', e.target.value)}
                          className="w-24 border border-orange-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-orange-400"
                        />
                        <span className="text-xs text-orange-700">pts</span>
                        <button
                          onClick={() => handleArbitrage(alerte.id, 'penalite', {
                            points_sanction: det.points ? parseInt(det.points) : 0
                          })}
                          disabled={isPending || !det.points}
                          className="px-3 py-1 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                          style={{ backgroundColor: '#FF9A3C' }}
                        >
                          Appliquer
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4 - Indemniser chauffeur */}
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-green-200 bg-green-50">
                    <span className="text-lg">💶</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-green-800">Indemniser le chauffeur</div>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          placeholder="5"
                          value={det.montant ?? ''}
                          onChange={e => setDetail(alerte.id, 'montant', e.target.value)}
                          className="w-24 border border-green-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-green-400"
                        />
                        <span className="text-xs text-green-700">€ (5€ défaut)</span>
                        <button
                          onClick={() => handleArbitrage(alerte.id, 'indemnisation', {
                            montant_indemnisation: det.montant ? parseFloat(det.montant) : 5
                          })}
                          disabled={isPending}
                          className="px-3 py-1 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                          style={{ backgroundColor: '#4CAF82' }}
                        >
                          Indemniser
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {isPending && (
                  <div className="mt-3 text-center text-sm text-gray-400">Traitement en cours…</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
