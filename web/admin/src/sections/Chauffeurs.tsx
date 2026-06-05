import { useEffect, useState, useCallback } from 'react';
import { getChauffeurs, updateChauffeurTaux } from '../api';
import type { Chauffeur } from '../api';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';

export default function Chauffeurs() {
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTaux, setEditingTaux] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getChauffeurs();
      setChauffeurs(data);
    } catch {
      setError('Impossible de charger les chauffeurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleTauxChange = (id: number, val: string) => {
    setEditingTaux(prev => ({ ...prev, [id]: val }));
  };

  const handleSaveTaux = async (id: number) => {
    const val = editingTaux[id];
    if (val === undefined) return;
    const taux = parseFloat(val);
    if (isNaN(taux) || taux < 0 || taux > 100) {
      showToast('Taux invalide (0–100%)');
      return;
    }
    setSaving(id);
    try {
      await updateChauffeurTaux(id, taux);
      showToast('Taux mis à jour');
      const updated = { ...editingTaux };
      delete updated[id];
      setEditingTaux(updated);
      load();
    } catch {
      showToast('Erreur lors de la mise à jour');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Chauffeurs</h2>

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
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Prénom Nom', 'Véhicule', 'Disponible', 'Documents', 'Taux Commission', 'Action'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chauffeurs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-10">Aucun chauffeur trouvé</td>
                  </tr>
                ) : chauffeurs.map(ch => {
                  const currentTaux = editingTaux[ch.id] ?? String(ch.taux_commission ?? '');
                  const isEditing = editingTaux[ch.id] !== undefined;

                  return (
                    <tr key={ch.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{ch.prenom} {ch.nom}</p>
                        {ch.telephone && <p className="text-xs text-gray-400">{ch.telephone}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ch.vehicule ?? '—'}</td>
                      <td className="px-4 py-3">
                        <Badge
                          label={ch.disponible ? 'Disponible' : 'Indisponible'}
                          variant={ch.disponible ? 'success' : 'gray'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {ch.documents_complets === undefined ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <Badge
                            label={ch.documents_complets ? 'Complet' : 'Incomplet'}
                            variant={ch.documents_complets ? 'success' : 'danger'}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.5"
                            value={currentTaux}
                            onChange={e => handleTauxChange(ch.id, e.target.value)}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-yellow-400"
                            placeholder="0"
                          />
                          <span className="text-gray-500 text-sm">%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <button
                            onClick={() => handleSaveTaux(ch.id)}
                            disabled={saving === ch.id}
                            className="px-3 py-1 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                            style={{ backgroundColor: '#4CAF82' }}
                          >
                            {saving === ch.id ? '…' : 'Sauvegarder'}
                          </button>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {chauffeurs.length} chauffeur{chauffeurs.length > 1 ? 's' : ''} au total
          </div>
        </div>
      )}
    </div>
  );
}
