import { useEffect, useState, useCallback } from 'react';
import { getAmbassadeurs } from '../api';
import type { Ambassadeur } from '../api';
import Badge, { getStatusVariant } from '../components/Badge';
import Spinner from '../components/Spinner';

type TypeFilter = 'tous' | 'physique' | 'moral';

export default function Ambassadeurs() {
  const [ambassadeurs, setAmbassadeurs] = useState<Ambassadeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tous');
  const [niveauFilter, setNiveauFilter] = useState('');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAmbassadeurs();
      setAmbassadeurs(data);
    } catch {
      setError('Impossible de charger les ambassadeurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const niveaux = [...new Set(ambassadeurs.map(a => a.niveau).filter(Boolean))] as string[];

  const filtered = ambassadeurs.filter(a => {
    if (typeFilter !== 'tous' && a.type !== typeFilter) return false;
    if (niveauFilter && a.niveau !== niveauFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        (a.nom ?? '').toLowerCase().includes(q) ||
        (a.prenom ?? '').toLowerCase().includes(q) ||
        (a.telephone ?? '').includes(q) ||
        (a.societe ?? '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Ambassadeurs</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        {(['tous', 'physique', 'moral'] as TypeFilter[]).map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border capitalize ${
              typeFilter === t
                ? 'text-white border-transparent'
                : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
            style={typeFilter === t ? {
              backgroundColor: t === 'tous' ? '#1C1C2E' : t === 'physique' ? '#C9A84C' : '#4A9EFF'
            } : {}}
          >
            {t}
          </button>
        ))}

        {niveaux.length > 0 && (
          <select
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400"
            value={niveauFilter}
            onChange={e => setNiveauFilter(e.target.value)}
          >
            <option value="">Tous niveaux</option>
            {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <input
          type="text"
          placeholder="Rechercher…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-56"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Prénom Nom', 'Type', 'Niveau', 'Points / Commission', 'Téléphone', 'Statut'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-10">Aucun ambassadeur trouvé</td>
                  </tr>
                ) : filtered.map(amb => (
                  <tr key={amb.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{amb.prenom} {amb.nom}</p>
                      {amb.societe && <p className="text-xs text-gray-400">{amb.societe}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        label={amb.type === 'physique' ? 'Physique' : 'Moral'}
                        variant={amb.type === 'physique' ? 'or' : 'info'}
                      />
                    </td>
                    <td className="px-4 py-3 text-gray-600">{amb.niveau ?? '—'}</td>
                    <td className="px-4 py-3">
                      {amb.points !== undefined && (
                        <span className="font-medium" style={{ color: '#C9A84C' }}>{amb.points} pts</span>
                      )}
                      {amb.commission !== undefined && (
                        <span className="text-xs text-gray-500 ml-1">/ {amb.commission}%</span>
                      )}
                      {amb.points === undefined && amb.commission === undefined && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{amb.telephone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge label={amb.statut ?? 'actif'} variant={getStatusVariant(amb.statut ?? 'actif')} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {filtered.length} ambassadeur{filtered.length > 1 ? 's' : ''} affiché{filtered.length > 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
