import { useEffect, useState, useCallback } from 'react';
import { getDashboard, getSanctionsEnAttente } from '../api';
import type { DashboardStats, Sanction } from '../api';
import KpiCard from '../components/KpiCard';
import Spinner from '../components/Spinner';
import Badge, { getStatusVariant } from '../components/Badge';
import { usePrefs } from '../prefs';

function exportCSV(type: 'ambassadeurs' | 'courses') {
  window.open(`http://localhost:4001/api/admin/${type}/export`, '_blank');
}

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

export default function Dashboard() {
  const { t, lang } = usePrefs();
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
      if (d.status === 'rejected') setError(t('dash.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Spinner size="lg" />;

  const days = stats?.coursesParJour ?? [];
  const maxCount = Math.max(...days.map(d => d.count), 1);

  const top5 = stats?.top5Ambassadeurs ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('dash.title')}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => exportCSV('ambassadeurs')}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            {t('dash.exportAmb')}
          </button>
          <button
            onClick={() => exportCSV('courses')}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
          >
            {t('dash.exportCourses')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('dash.kpiCaBrut')}
          value={stats?.caBrut !== undefined ? `${stats.caBrut.toFixed(2)} €` : '—'}
          color="#C9A84C"
          icon="💰"
        />
        <KpiCard
          label={t('dash.kpiCourses')}
          value={stats?.totalCourses ?? '—'}
          sub={[
            stats?.coursesEnCours !== undefined ? `${stats.coursesEnCours} ${t('dash.enCours')}` : '',
            stats?.coursesTerminees !== undefined ? `${stats.coursesTerminees} ${t('dash.terminees')}` : '',
            stats?.coursesAnnulees !== undefined ? `${stats.coursesAnnulees} ${t('dash.annulees')}` : '',
          ].filter(Boolean).join(' · ')}
          color="#4A9EFF"
          icon="🚗"
        />
        <KpiCard
          label={t('dash.kpiAmbActifs')}
          value={stats?.totalAmbassadeurs ?? '—'}
          color="#4CAF82"
          icon="👤"
        />
        <KpiCard
          label={t('dash.kpiChauffeurs')}
          value={stats?.chauffeursActifs ?? stats?.totalChauffeurs ?? '—'}
          color="#4A9EFF"
          icon="🚘"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Graphique 7 jours */}
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">{t('dash.chart7j')}</h3>
          {days.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">{t('common.noData')}</p>
          ) : (
            <div className="space-y-2">
              {days.map((day) => (
                <div key={day.date} className="flex items-center gap-3">
                  <span className="text-xs text-gray-500 dark:text-gray-400 w-24 shrink-0">
                    {new Date(day.date).toLocaleDateString(LOCALES[lang], { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <div className="flex-1 bg-gray-100 dark:bg-white/10 rounded-full h-6 overflow-hidden">
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
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-6 text-right">{day.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 5 Ambassadeurs */}
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">{t('dash.top5')}</h3>
          {top5.length === 0 ? (
            <p className="text-gray-400 text-sm text-center py-8">{t('common.noData')}</p>
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
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                      {amb.prenom} {amb.nom}
                    </p>
                    <p className="text-xs text-gray-400">{amb.type}</p>
                  </div>
                  <span className="text-sm font-bold" style={{ color: '#C9A84C' }}>
                    {amb.points ?? '—'} {t('common.points')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Alertes actives */}
      <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm p-5">
        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
          {t('dash.alertesActives')}
          {sanctions.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full px-2 py-0.5">
              {sanctions.length}
            </span>
          )}
        </h3>
        {sanctions.length === 0 ? (
          <p className="text-gray-400 text-sm">{t('dash.noAlerte')}</p>
        ) : (
          <div className="space-y-2">
            {sanctions.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-500/10 rounded-lg border border-orange-100 dark:border-orange-500/30">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {t('dash.course')} {s.course_reference ?? `#${s.course_id ?? s.id}`}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {s.ambassadeur_nom && `${t('dash.amb')} ${s.ambassadeur_nom}`}
                    {s.chauffeur_nom && ` · ${t('dash.chauf')} ${s.chauffeur_nom}`}
                  </p>
                </div>
                <Badge label={s.statut ?? t('common.pending')} variant={getStatusVariant(s.statut ?? 'en_attente')} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
