import { useEffect, useState, useCallback } from 'react';
import { getCommissionsMoraux, declencherVirements } from '../api';
import Spinner from '../components/Spinner';
import Modal from '../components/Modal';

interface AmbassadeurCommission {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  iban?: string;
  nb_courses: number;
  ca_brut: number;
  commission: number;
}

export default function CommissionsMoraux() {
  const [ambassadeurs, setAmbassadeurs] = useState<AmbassadeurCommission[]>([]);
  const [tauxPct, setTauxPct] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await getCommissionsMoraux();
      setTauxPct(result.taux_pct);
      setAmbassadeurs(result.ambassadeurs);
    } catch {
      setError('Impossible de charger les commissions. Vérifiez que le backend est démarré.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 4000);
  };

  const handleDeclencher = async () => {
    setTriggering(true);
    try {
      await declencherVirements();
      showToast('Virements déclenchés avec succès');
      setShowConfirm(false);
    } catch {
      showToast('Erreur lors du déclenchement des virements');
    } finally {
      setTriggering(false);
    }
  };

  const totalCA = ambassadeurs.reduce((acc, a) => acc + a.ca_brut, 0);
  const totalCommissions = ambassadeurs.reduce((acc, a) => acc + a.commission, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Commissions Ambassadeurs Moraux</h2>
          <p className="text-sm text-gray-500 mt-1">Taux actuel : {tauxPct}% du CA TTC</p>
        </div>
        <button
          onClick={() => setShowConfirm(true)}
          className="px-5 py-2 text-sm font-bold rounded-xl text-white transition-opacity hover:opacity-80 flex items-center gap-2"
          style={{ backgroundColor: '#C9A84C' }}
        >
          💸 DÉCLENCHER LES VIREMENTS DU MOIS
        </button>
      </div>

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
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Commissions à verser</p>
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
          <p className="font-medium">Aucun ambassadeur moral avec des courses ce mois</p>
          <p className="text-sm mt-1">Les commissions s'affichent pour le mois en cours</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Ambassadeur', 'Email', 'IBAN', 'Nb Courses', 'CA Brut TTC', `Commission ${tauxPct}%`].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ambassadeurs.map(a => (
                  <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{a.prenom} {a.nom}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{a.email}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{a.iban || '—'}</td>
                    <td className="px-4 py-3 text-gray-700">{a.nb_courses}</td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#C9A84C' }}>{a.ca_brut.toFixed(2)} €</td>
                    <td className="px-4 py-3 font-bold" style={{ color: '#4CAF82' }}>{a.commission.toFixed(2)} €</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showConfirm} onClose={() => setShowConfirm(false)} title="Déclencher les virements">
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <p className="text-sm font-medium text-orange-800">⚠️ Action irréversible</p>
            <p className="text-sm text-orange-700 mt-1">
              Vous allez déclencher le virement des commissions du mois en cours pour {ambassadeurs.length} ambassadeur(s) moral/moraux.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Montant total à virer : <strong style={{ color: '#4CAF82' }}>{totalCommissions.toFixed(2)} €</strong>
          </p>
          <p className="text-xs text-gray-400 italic">Note : L'intégration bancaire (Stripe/SEPA) sera configurée ultérieurement.</p>
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
              {triggering ? 'Déclenchement…' : 'Confirmer'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
