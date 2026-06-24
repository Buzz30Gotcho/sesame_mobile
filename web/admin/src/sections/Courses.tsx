import { useEffect, useState, useCallback } from 'react';
import { getCourses, getChauffeurs, annulerCourse, assignerChauffeur } from '../api';
import type { Course, Chauffeur } from '../api';
import Badge, { getStatusVariant } from '../components/Badge';
import Modal from '../components/Modal';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

type FilterType = 'toutes' | 'en_cours' | 'terminee' | 'annulee';

const EN_COURS_STATUTS = ['recherche', 'acceptee', 'en_route', 'code_valide'];
const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

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
  const { t, lang } = usePrefs();
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
      if (c.status === 'rejected') setError(t('crs.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      showToast(t('crs.cancelled'));
      setAnnulerModal(null);
      setRaison('');
      load();
    } catch {
      showToast(t('crs.cancelError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssigner = async () => {
    if (!assignerModal || !selectedChauffeur) return;
    setSubmitting(true);
    try {
      await assignerChauffeur(assignerModal.id, parseInt(selectedChauffeur));
      showToast(t('crs.assigned'));
      setAssignerModal(null);
      setSelectedChauffeur('');
      load();
    } catch {
      showToast(t('crs.assignError'));
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
    { key: 'toutes', label: t('crs.filterAll') },
    { key: 'en_cours', label: t('crs.filterEnCours') },
    { key: 'terminee', label: t('crs.filterTerminee') },
    { key: 'annulee', label: t('crs.filterAnnulee') },
  ];

  const th = 'text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3';

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('crs.title')}</h2>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">
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
                  : 'bg-white dark:bg-[#161624] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300'
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
          placeholder={t('crs.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-64"
        />
      </div>

      {/* Table */}
      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  <th className={th}>{t('crs.colRef')}</th>
                  <th className={th}>{t('common.status')}</th>
                  <th className={th}>{t('common.type')}</th>
                  <th className={th}>{t('crs.colAmb')}</th>
                  <th className={th}>{t('crs.colChauf')}</th>
                  <th className={th}>{t('crs.colTrajet')}</th>
                  <th className={th}>{t('common.amount')}</th>
                  <th className={th}>{t('common.date')}</th>
                  <th className={th}>{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center text-gray-400 py-10">{t('crs.empty')}</td>
                  </tr>
                ) : filtered.map(course => (
                  <tr key={course.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-gray-700 dark:text-gray-200">
                      {course.reference ?? `#${course.id}`}
                    </td>
                    <td className="px-4 py-3">
                      <Badge label={course.statut} variant={getStatusVariant(course.statut)} />
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize">{course.type ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      {[course.ambassadeur_prenom, course.ambassadeur_nom].filter(Boolean).join(' ') || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-200">
                      {[course.chauffeur_prenom, course.chauffeur_nom].filter(Boolean).join(' ') || (
                        <span className="text-xs text-orange-400 italic">{t('crs.notAssigned')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-[200px]">
                      <div className="truncate text-xs">
                        {course.adresse_depart && <span className="text-green-600 dark:text-green-400">→ </span>}{course.adresse_depart ?? ''}
                      </div>
                      <div className="truncate text-xs">
                        {course.adresse_destination && <span className="text-red-500 dark:text-red-400">→ </span>}{course.adresse_destination ?? ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: '#C9A84C' }}>
                      {course.montant != null ? `${Number(course.montant).toFixed(2)} €` : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                      {course.created_at ? new Date(course.created_at).toLocaleDateString(LOCALES[lang]) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        {isAnnulable(course) && (
                          <button
                            onClick={() => setAnnulerModal(course)}
                            className="px-2 py-1 text-xs rounded-lg text-white font-medium transition-opacity hover:opacity-80"
                            style={{ backgroundColor: '#FF6464' }}
                          >
                            {t('crs.actionCancel')}
                          </button>
                        )}
                        {course.statut === 'recherche' && (
                          <button
                            onClick={() => { setAssignerModal(course); setSelectedChauffeur(''); }}
                            className="px-2 py-1 text-xs rounded-lg text-white font-medium transition-opacity hover:opacity-80"
                            style={{ backgroundColor: '#4A9EFF' }}
                          >
                            {t('crs.actionAssign')}
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
      <Modal open={!!annulerModal} onClose={() => setAnnulerModal(null)} title={t('crs.modalCancelTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('crs.course')} <strong>{annulerModal?.reference ?? `#${annulerModal?.id}`}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('crs.motif')}</label>
            <textarea
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              rows={3}
              placeholder={t('crs.motifPlaceholder')}
              value={raison}
              onChange={e => setRaison(e.target.value)}
            />
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setAnnulerModal(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleAnnuler}
              disabled={submitting || !raison.trim()}
              className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: '#FF6464' }}
            >
              {submitting ? t('crs.inProgress') : t('crs.confirmCancel')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Assigner chauffeur */}
      <Modal open={!!assignerModal} onClose={() => setAssignerModal(null)} title={t('crs.modalAssignTitle')}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {t('crs.course')} <strong>{assignerModal?.reference ?? `#${assignerModal?.id}`}</strong>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">{t('crs.chooseChauffeur')}</label>
            <select
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none focus:border-yellow-400"
              value={selectedChauffeur}
              onChange={e => setSelectedChauffeur(e.target.value)}
            >
              <option value="">{t('crs.selectPlaceholder')}</option>
              {chauffeurs.map(ch => (
                <option key={ch.id} value={ch.id}>
                  {ch.prenom} {ch.nom} {ch.disponible === false ? t('crs.unavailable') : ''} — {ch.vehicule ?? t('crs.noVehicle')}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setAssignerModal(null)}
              className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleAssigner}
              disabled={submitting || !selectedChauffeur}
              className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
              style={{ backgroundColor: '#4A9EFF' }}
            >
              {submitting ? t('crs.inProgress') : t('crs.actionAssign')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
