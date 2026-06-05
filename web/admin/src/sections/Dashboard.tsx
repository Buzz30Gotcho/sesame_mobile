import { useEffect, useState, useCallback } from 'react';
import { getDashboard, getSanctionsEnAttente } from '../api';
import type { DashboardStats, Sanction } from '../api';
import KpiCard from '../components/KpiCard';
import Spinner from '../components/Spinner';
import Badge, { getStatusVariant } from '../components/Badge';

function exportCSV(type: 'ambassadeurs' | 'courses') {
  window.open(`http://localhost:4001/api/admin/${type}/export`, '_blank');
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [sanctions, setSanctions] = useState<Sanction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [d, s] = await Promise.allSettled([getDashboard(), getSanctionsEnAttente()]);
      if (d.status === 'fulfilled') setStats(d.value);
      if (s.status === 'fulfilled') setSanctions(s.value);
      if (d.status === 'rejected') setError('Impossible de charger les données du tableau de bord. Vérifiez que le backend est démarré.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner size="lg" />;

  const days = stats?.coursesParJour ?? [];
  const maxCount = Math.max(...days.map(d => d.count), 1);

  const top5 = stats?.top5Ambassadeurs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Vue Générale</h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV('ambassadeurs')}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Export Ambassadeurs CSV
          </button>
          <button
            onClick={() => exportCSV('courses')}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            Export Courses CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="CA Brut Total"
          value={stats?.caBrut !== undefined ? `${stats.caBrut.toFixed(2)} €` : '—'}
          color="#C9A84C"
          icon="💰"
        />
        <KpiCard
          label="Courses Totales"
          value={stats?.totalCourses ?? '—'}
          sub={[
            stats?.coursesEnCours !== undefined ? `${stats.coursesEnCours} en cours` : '',
            stats?.coursesTerminees !== undefined ? `${stats.coursesTerminees} terminées` : '',
            stats?.coursesAnnulees !== undefined ? `${stats.coursesAnnulees} annulées` : '',
          ].filter(Boolean).join(' · ')}
          color="#4A9EFF"
          icon="🚗"
        />
        <KpiCard
          label="Ambassadeurs Actifs"
          value={stats?.totalAmbassadeurs ?? '—'}
          color="#4CAF82"
          icon="👤"
        />
        <KpiCard
          label="Bons en Attente"
          value={stats?.pendingExchanges ?? '—'}
          color="#FF9A3C"
          icon="🎁"
          badge={stats?.pendingExchanges ?? 0}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graphique 7 jours */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Courses — 7 derniers jours</h3>
          {days.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucune donnée disponible</p>
          ) : (
            <div className="space-y-2">
              {days.map((day) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 w-24 shrink-0">
                    {new Date(day.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                    <div
                      className="h-full rounded-full flex items-center pl-2 text-xs font-medium text-white transition-all duration-500"
                      style={{
                        width: `${Math.max((day.count / maxCount) * 100, 5)}%`,
                        backgroundColor: '#C9A84C',
                      }}
                    >
                      {day.count}
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-6 text-right">{day.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 Ambassadeurs */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-800 mb-4">Top 5 Ambassadeurs</h3>
          {top5.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">Aucune donnée disponible</p>
          ) : (
            <div className="space-y-3">
              {top5.map((amb, i) => (
                <div key={amb.id} className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ backgroundColor: i === 0 ? '#C9A84C' : i === 1 ? '#9E9E9E' : i === 2 ? '#CD7F32' : '#4A9EFF' }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {amb.prenom} {amb.nom}
                    </p>
                    <p className="text-xs text-gray-400">{amb.type}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>
                    {amb.points ?? '—'} pts
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alertes actives */}
      <div className="bg-white rounded-xl shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
          Alertes Actives
          {sanctions.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {sanctions.length}
            </span>
          )}
        </h3>
        {sanctions.length === 0 ? (
          <p className="text-gray-400 text-sm">Aucune alerte en attente</p>
        ) : (
          <div className="space-y-2">
            {sanctions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    Course {s.course_reference ?? `#${s.course_id ?? s.id}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {s.ambassadeur_nom && `Amb. ${s.ambassadeur_nom}`}
                    {s.chauffeur_nom && ` · Chauf. ${s.chauffeur_nom}`}
                  </p>
                </div>
                <Badge label={s.statut ?? 'en attente'} variant={getStatusVariant(s.statut ?? 'en_attente')} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
