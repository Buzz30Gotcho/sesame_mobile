import { useEffect, useState, useCallback } from 'react';
import { getAmbassadeurs, updateChauffeurStatut, updateAmbassadeurNote } from '../api';
import type { Ambassadeur } from '../api';
import Badge, { getStatusVariant } from '../components/Badge';
import Spinner from '../components/Spinner';

type TypeFilter = 'tous' | 'nouveaux';

export default function Ambassadeurs() {
  const [ambassadeurs, setAmbassadeurs] = useState<Ambassadeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('tous');
  const [niveauFilter, setNiveauFilter] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteModal, setNoteModal] = useState<Ambassadeur | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

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

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleToggleStatut = async (amb: Ambassadeur) => {
    if (!amb.utilisateur_id) return;
    const newStatut = amb.compte_statut === 'actif' ? 'suspendu' : 'actif';
    setActionLoading(`statut-${amb.id}`);
    try {
      await updateChauffeurStatut(amb.utilisateur_id, newStatut);
      showToast(newStatut === 'actif' ? 'Compte activé' : 'Compte suspendu');
      load();
    } catch { showToast('Erreur'); }
    finally { setActionLoading(null); }
  };

  const openNote = (amb: Ambassadeur) => { setNoteModal(amb); setNoteText(amb.note_interne ?? ''); };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    setNoteSaving(true);
    try {
      await updateAmbassadeurNote(noteModal.id, noteText);
      showToast('Note sauvegardée');
      setNoteModal(null);
      load();
    } catch { showToast('Erreur lors de la sauvegarde'); }
    finally { setNoteSaving(false); }
  };

  const niveaux = [...new Set(ambassadeurs.map(a => a.niveau).filter(Boolean))] as string[];

  const sept_jours_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const nbNouveaux = ambassadeurs.filter(a => a.created_at && new Date(a.created_at) >= sept_jours_ago).length;

  const filtered = ambassadeurs.filter(a => {
    if (typeFilter === 'nouveaux') {
      if (!a.created_at || new Date(a.created_at) < sept_jours_ago) return false;
    }
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
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {/* Modal note interne */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Note interne</h3>
                <p className="text-sm text-gray-500">{noteModal.prenom} {noteModal.nom}</p>
              </div>
              <button onClick={() => setNoteModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              rows={5}
              placeholder="Ex : parrainage en attente, litige cours…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">Annuler</button>
              <button
                onClick={handleSaveNote}
                disabled={noteSaving}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#C9A84C' }}
              >
                {noteSaving ? 'Sauvegarde…' : 'Sauvegarder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setTypeFilter('tous')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
            typeFilter === 'tous'
              ? 'text-white border-transparent'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
          style={typeFilter === 'tous' ? { backgroundColor: '#1C1C2E' } : {}}
        >
          Tous
        </button>
        <button
          onClick={() => setTypeFilter('nouveaux')}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border flex items-center gap-1.5 ${
            typeFilter === 'nouveaux'
              ? 'text-white border-transparent'
              : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
          }`}
          style={typeFilter === 'nouveaux' ? { backgroundColor: '#4CAF82' } : {}}
        >
          Nouveaux 7j
          {nbNouveaux > 0 && (
            <span
              className="text-xs font-bold rounded-full flex items-center justify-center"
              style={{
                minWidth: '18px', height: '18px', padding: '0 4px',
                backgroundColor: typeFilter === 'nouveaux' ? 'rgba(255,255,255,0.3)' : '#4CAF82',
                color: typeFilter === 'nouveaux' ? 'white' : 'white',
              }}
            >
              {nbNouveaux}
            </span>
          )}
        </button>

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
                  {['Prénom Nom', 'Niveau', 'Points', 'Téléphone', 'Statut compte', 'Actions'].map(h => (
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
                      {amb.created_at && new Date(amb.created_at) >= sept_jours_ago && (
                        <p className="text-xs font-medium" style={{ color: '#4CAF82' }}>
                          Inscrit le {new Date(amb.created_at).toLocaleDateString('fr-FR')}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{amb.niveau ?? '—'}</td>
                    <td className="px-4 py-3">
                      {amb.points !== undefined
                        ? <span className="font-medium" style={{ color: '#C9A84C' }}>{amb.points} pts</span>
                        : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600">{amb.telephone ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge
                        label={amb.compte_statut === 'suspendu' ? 'Suspendu' : 'Actif'}
                        variant={amb.compte_statut === 'suspendu' ? 'danger' : 'success'}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleToggleStatut(amb)}
                          disabled={actionLoading === `statut-${amb.id}`}
                          className="px-2 py-1 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                          style={{ backgroundColor: amb.compte_statut === 'suspendu' ? '#4CAF82' : '#FF9A3C' }}
                        >
                          {actionLoading === `statut-${amb.id}` ? '…' : amb.compte_statut === 'suspendu' ? 'Activer' : 'Suspendre'}
                        </button>
                        <button
                          onClick={() => openNote(amb)}
                          title={amb.note_interne ?? 'Ajouter une note'}
                          className="px-2 py-1 text-xs rounded-lg border transition-colors hover:bg-gray-50"
                          style={{
                            borderColor: amb.note_interne ? '#C9A84C' : '#E5E7EB',
                            color: amb.note_interne ? '#C9A84C' : '#9CA3AF',
                            fontWeight: amb.note_interne ? 600 : 400,
                          }}
                        >
                          {amb.note_interne ? '📝 Note' : '+ Note'}
                        </button>
                      </div>
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
