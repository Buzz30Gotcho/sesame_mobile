import { useEffect, useState, useCallback } from 'react';
import { getCommissionsMoraux, declencherVirements } from '../api';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';

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

// 'YYYY-MM' → « juin 2026 »
function formatMonth(mois: string): string {
  const [y, m] = mois.split('-').map(Number);
  if (!y || !m) return mois;
  return new Date(y, m - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

export default function CommissionsMoraux() {
  const [mois, setMois] = useState<string>(previousMonth());
  const [ambassadeurs, setAmbassadeurs] = useState<AmbassadeurCommission[]>([]);
  const [tauxPct, setTauxPct] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async (m: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await getCommissionsMoraux(m);
      setTauxPct(result.taux_pct);
      setAmbassadeurs(result.ambassadeurs);
    } catch {
      setError('Impossible de charger les commissions. Vérifiez que le backend est démarré.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(mois); }, [load, mois]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleDeclencher = async () => {
    setTriggering(true);
    try {
      const res = await declencherVirements(mois);
      showToast(`${res.nb_virements ?? 0} virement(s) enregistré(s) — ${Number(res.total ?? 0).toFixed(2)} €`);
      setShowConfirm(false);
      await load(mois);
    } catch {
      showToast('Erreur lors du déclenchement des virements');
    } finally {
      setTriggering(false);
    }
  };

  const moisLabel = formatMonth(mois);
  const isCurrentMonth = mois === currentMonth();
  const totalCA = ambassadeurs.reduce((acc, a) => acc + a.ca_brut, 0);
  const totalCommissions = ambassadeurs.reduce((acc, a) => acc + a.commission, 0);
  // Lignes avec du CA mais pas encore versées
  const aVerser = ambassadeurs.filter(a => a.ca_brut > 0 && !a.statut_versement);
  const dejaVerse = ambassadeurs.some(a => a.statut_versement);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            Commissions à régler — <span style={{ color: '#C9A84C' }}>{moisLabel}</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">Taux : {tauxPct}% du CA TTC · cumul de toutes les courses de l'entreprise et de ses employés</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-500">
            Mois :
            <input
              type="month"
              value={mois}
              max={currentMonth()}
              onChange={e => setMois(e.target.value || previousMonth())}
              className="ml-2 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400"
            />
          </label>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={aVerser.length === 0}
            title={aVerser.length === 0 ? 'Rien à verser pour ce mois' : `Verser ${aVerser.length} entreprise(s)`}
            className="px-5 py-2 text-sm font-bold rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
            style={{ backgroundColor: '#C9A84C' }}
          >
            💸 DÉCLENCHER LES VIREMENTS
          </button>
        </div>
      </div>

      {/* Bandeau pédagogique : explique le cycle de paiement à l'admin, en mots simples */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800 flex items-start gap-2">
        <span>ℹ️</span>
        <span>
          Chaque mois, vous payez aux entreprises les commissions du <strong>mois d'avant</strong>.
          Exemple : début juillet, vous payez juin. L'écran affiche donc <strong>{moisLabel}</strong>, le mois à payer.
          Le bouton marque les entreprises comme <strong>payées</strong> — une entreprise déjà payée ne l'est jamais deux fois.
        </span>
      </div>

      {/* Avertissement si l'admin consulte le mois en cours (pas encore fini, donc pas à payer) */}
      {isCurrentMonth && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <span>⏳</span>
          <span>
            Ce mois <strong>n'est pas encore fini</strong> : les montants vont encore bouger.
            On paie ce mois seulement au début du mois prochain.
          </span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {ambassadeurs.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">CA Brut Total</p>
            <p className="text-2xl font-bold mt-1" style={{ color: '#C9A84C' }}>{totalCA.toFixed(2)} €</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Commissions du mois</p>
            <p className="text-2xl font-bold mt-1" style={{ color: '#4CAF82' }}>{totalCommissions.toFixed(2)} €</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Ambassadeurs moraux</p>
            <p className="text-2xl font-bold mt-1 text-gray-900">{ambassadeurs.length}</p>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : ambassadeurs.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p className="text-3xl mb-3">📊</p>
          <p className="font-medium">Aucun ambassadeur moral pour {moisLabel}</p>
          <p className="text-sm mt-1">Sélectionnez un autre mois ou attendez des courses terminées.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Entreprise', 'Email', 'IBAN', 'Nb Courses', 'CA Brut TTC', `Commission ${tauxPct}%`, 'Statut versement'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadeurs.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{a.etablissement || '—'}</div>
                      <div className="text-xs text-gray-500">{a.prenom} {a.nom}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{a.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.iban || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{a.nb_courses}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#C9A84C' }}>{a.ca_brut.toFixed(2)} €</td>
                    <td className="px-4 py-3 font-bold" style={{ color: '#4CAF82' }}>{a.commission.toFixed(2)} €</td>
                    <td className="px-4 py-3">
                      {a.statut_versement ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#4CAF8220', color: '#2E7D5B' }}>
                          ✓ Versé{a.date_versement ? ` le ${new Date(a.date_versement).toLocaleDateString('fr-FR')}` : ''}
                        </span>
                      ) : a.ca_brut > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: '#FF9A3C20', color: '#B26A1A' }}>
                          À verser
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

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title={`Déclencher les virements — ${moisLabel}`}>
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-sm font-medium text-orange-800">Confirmation</p>
            <p className="text-sm text-orange-700 mt-1">
              Vous allez enregistrer le versement des commissions de <strong>{moisLabel}</strong> pour {aVerser.length} entreprise(s).
              {dejaVerse && ' Les entreprises déjà marquées « Versé » seront réactualisées.'}
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Montant total à verser : <strong style={{ color: '#4CAF82' }}>{aVerser.reduce((s, a) => s + a.commission, 0).toFixed(2)} €</strong>
          </p>
          <p className="text-xs text-gray-400 italic">
            Note : le statut « Versé » est enregistré en base. Le vrai virement bancaire (Stripe/SEPA) sera branché ultérieurement.
            {!isCurrentMonth && ' (Vous traitez un mois passé.)'}
          </p>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setShowConfirm(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
              Annuler
            </button>
            <button
              onClick={handleDeclencher}
              disabled={triggering}
              className="px-5 py-2 text-sm font-bold rounded-xl text-white disabled:opacity-50"
              style={{ backgroundColor: '#C9A84C' }}
            >
              {triggering ? 'Enregistrement…' : 'Confirmer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
