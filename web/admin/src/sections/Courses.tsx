import { useEffect, useState, useCallback } from 'react';
import { getCourses, getChauffeurs, annulerCourse, assignerChauffeur } from '../api';
import type { Course, Chauffeur } from '../api';
import Badge, { getStatusVariant } from '../components/Badge';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';

type FilterType = 'toutes' | 'en_cours' | 'terminee' | 'annulee';

const EN_COURS_STATUTS = ['recherche', 'acceptee', 'en_route', 'code_valide'];

function matchFilter(course: Course, filter: FilterType): boolean {
  if (filter === 'toutes') return true;
  if (filter === 'en_cours') return EN_COURS_STATUTS.includes(course.statut);
  if (filter === 'terminee') return course.statut === 'terminee';
  if (filter === 'annulee') return course.statut === 'annulee';
  return true;
}

function isAnnulable(course: Course): boolean {
  return ['recherche', 'acceptee'].includes(course.statut);
}

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterType>('toutes');
  const [search, setSearch] = useState('');
  const [annulerModal, setAnnulerModal] = useState<Course | null>(null);
  const [assignerModal, setAssignerModal] = useState<Course | null>(null);
  const [raison, setRaison] = useState('');
  const [selectedChauffeur, setSelectedChauffeur] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [c, ch] = await Promise.allSettled([getCourses(), getChauffeurs()]);
      if (c.status === 'fulfilled') setCourses(c.value);
      if (ch.status === 'fulfilled') setChauffeurs(ch.value);
      if (c.status === 'rejected') setError('Impossible de charger les courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleAnnuler = async () => {
    if (!annulerModal || !raison.trim()) return;
    setSubmitting(true);
    try {
      await annulerCourse(annulerModal.id, raison);
      showToast('Course annulée avec succès');
      setAnnulerModal(null);
      setRaison('');
      load();
    } catch {
      showToast('Erreur lors de l\'annulation');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssigner = async () => {
    if (!assignerModal || !selectedChauffeur) return;
    setSubmitting(true);
    try {
      await assignerChauffeur(assignerModal.id, parseInt(selectedChauffeur));
      showToast('Chauffeur assigné avec succès');
      setAssignerModal(null);
      setSelectedChauffeur('');
      load();
    } catch {
      showToast('Erreur lors de l\'assignation');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = courses
    .filter(c => matchFilter(c, filter))
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        (c.reference ?? '').toLowerCase().includes(q) ||
        (c.adresse_depart ?? '').toLowerCase().includes(q) ||
        (c.adresse_destination ?? '').toLowerCase().includes(q)
      );
    });

  const counts = {
    toutes: courses.length,
    en_cours: courses.filter(c => EN_COURS_STATUTS.includes(c.statut)).length,
    terminee: courses.filter(c => c.statut === 'terminee').length,
    annulee: courses.filter(c => c.statut === 'annulee').length,
  };

  const filters: { key: FilterType; label: string }[] = [
    { key: 'toutes', label: 'Toutes' },
    { key: 'en_cours', label: 'En cours' },
    { key: 'terminee', label: 'Terminées' },
    { key: 'annulee', label: 'Annulées' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Courses</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
          {toast}
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-2 flex-wrap">
          {filters.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                filter === f.key
                  ? 'text-white border-transparent'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
              style={filter === f.key ? {
                backgroundColor: f.key === 'toutes' ? '#1C1C2E' : f.key === 'en_cours' ? '#4A9EFF' : f.key === 'terminee' ? '#4CAF82' : '#FF6464'
              } : {}}
            >
              {f.label} <span className="opacity-70">({counts[f.key]})</span>
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Rechercher (référence, adresse…)"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-64"
        />
      </div>

      {/* Table */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Référence</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Statut</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Type</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Ambassadeur</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Chauffeur</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Trajet</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Montant</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-gray-400 py-10">Aucune course trouvée</td>
                  </tr>
                ) : filtered.map(course => (
                  <tr key={course.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700">
                      {course.reference ?? `#${course.id}`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={course.statut} variant={getStatusVariant(course.statut)} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{course.type ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {[course.ambassadeur_prenom, course.ambassadeur_nom].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {[course.chauffeur_prenom, course.chauffeur_nom].filter(Boolean).join(' ') || (
                        <span className="text-xs text-orange-400 italic">Non assigné</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-[200px]">
                      <div className="truncate text-xs">
                        {course.adresse_depart && <span className="text-green-600">→ </span>}{course.adresse_depart ?? ''}
                      </div>
                      <div className="truncate text-xs">
                        {course.adresse_destination && <span className="text-red-500">→ </span>}{course.adresse_destination ?? ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#C9A84C' }}>
                      {course.montant != null ? `${Number(course.montant).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {course.created_at ? new Date(course.created_at).toLocaleDateString('fr-FR') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isAnnulable(course) && (
                          <button
                            onClick={() => setAnnulerModal(course)}
                            className="px-2 py-1 text-xs rounded-lg text-white font-medium transition-opacity hover:opacity-80"
                            style={{ backgroundColor: '#FF6464' }}
                          >
                            Annuler
                          </button>
                        )}
                        {course.statut === 'recherche' && (
                          <button
                            onClick={() => { setAssignerModal(course); setSelectedChauffeur(''); }}
                            className="px-2 py-1 text-xs rounded-lg text-white font-medium transition-opacity hover:opacity-80"
                            style={{ backgroundColor: '#4A9EFF' }}
                          >
                            Assigner
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Annuler */}
      <Modal open={!!annulerModal} onClose={() => setAnnulerModal(null)} title="Annuler la course">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Course <strong>{annulerModal?.reference ?? `#${annulerModal?.id}`}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motif d'annulation *</label>
            <textarea
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              rows={3}
              placeholder="Indiquez le motif d'annulation…"
              value={raison}
              onChange={e => setRaison(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setAnnulerModal(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleAnnuler}
              disabled={submitting || !raison.trim()}
              className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: '#FF6464' }}
            >
              {submitting ? 'En cours…' : 'Confirmer l\'annulation'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Assigner chauffeur */}
      <Modal open={!!assignerModal} onClose={() => setAssignerModal(null)} title="Assigner un chauffeur">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Course <strong>{assignerModal?.reference ?? `#${assignerModal?.id}`}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Choisir un chauffeur</label>
            <select
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              value={selectedChauffeur}
              onChange={e => setSelectedChauffeur(e.target.value)}
            >
              <option value="">— Sélectionner —</option>
              {chauffeurs.map(ch => (
                <option key={ch.id} value={ch.id}>
                  {ch.prenom} {ch.nom} {ch.disponible === false ? '(indisponible)' : ''} — {ch.vehicule ?? 'véhicule non renseigné'}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setAssignerModal(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50"
            >
              Annuler
            </button>
            <button
              onClick={handleAssigner}
              disabled={submitting || !selectedChauffeur}
              className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: '#4A9EFF' }}
            >
              {submitting ? 'En cours…' : 'Assigner'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
