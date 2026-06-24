import React, { useState, useEffect, useCallback } from 'react';
import { getDashboard, adminLogin } from './api';
import { usePrefs, LANGS } from './prefs';
import type { ThemeMode } from './prefs';

// Sections
import Dashboard from './sections/Dashboard';
import Courses from './sections/Courses';
import Echanges from './sections/Echanges';
import Ambassadeurs from './sections/Ambassadeurs';
import Chauffeurs from './sections/Chauffeurs';
import Fournisseurs from './sections/Fournisseurs';
import Blacklist from './sections/Blacklist';
import Litiges from './sections/Litiges';
import Alertes from './sections/Alertes';
import Support from './sections/Support';
import Tickets from './sections/Tickets';
import CommissionsMoraux from './sections/CommissionsMoraux';
import Parametres from './sections/Parametres';

type SectionKey =
  | 'dashboard'
  | 'courses'
  | 'echanges'
  | 'ambassadeurs'
  | 'chauffeurs'
  | 'fournisseurs'
  | 'blacklist'
  | 'litiges'
  | 'alertes'
  | 'support'
  | 'tickets'
  | 'commissions'
  | 'parametres';

interface NavItem {
  key: SectionKey;
  tkey: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', tkey: 'nav.dashboard', icon: '📊' },
  { key: 'courses', tkey: 'nav.courses', icon: '🚗' },
  { key: 'echanges', tkey: 'nav.echanges', icon: '🎁' },
  { key: 'ambassadeurs', tkey: 'nav.ambassadeurs', icon: '👤' },
  { key: 'commissions', tkey: 'nav.commissions', icon: '💶' },
  { key: 'chauffeurs', tkey: 'nav.chauffeurs', icon: '🚘' },
  { key: 'fournisseurs', tkey: 'nav.fournisseurs', icon: '🏪' },
  { key: 'blacklist', tkey: 'nav.blacklist', icon: '🔕' },
  { key: 'litiges', tkey: 'nav.litiges', icon: '⚖️' },
  { key: 'alertes', tkey: 'nav.alertes', icon: '⚠️' },
  { key: 'tickets', tkey: 'nav.tickets', icon: '🎫' },
  { key: 'support', tkey: 'nav.support', icon: '💬' },
  { key: 'parametres', tkey: 'nav.parametres', icon: '⚙️' },
];

const SECTION_COMPONENTS: Record<SectionKey, React.ComponentType> = {
  dashboard: Dashboard,
  courses: Courses,
  echanges: Echanges,
  ambassadeurs: Ambassadeurs,
  chauffeurs: Chauffeurs,
  fournisseurs: Fournisseurs,
  blacklist: Blacklist,
  litiges: Litiges,
  alertes: Alertes,
  support: Support,
  tickets: Tickets,
  commissions: CommissionsMoraux,
  parametres: Parametres,
};

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const { t } = usePrefs();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [need2fa, setNeed2fa] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const token = await adminLogin(email, password, need2fa ? code : undefined);
      localStorage.setItem('admin_token', token);
      onLogin();
    } catch (err: any) {
      if (err?.response?.data?.require2fa) {
        setNeed2fa(true);
        setError(code ? t('login.error2fa') : '');
      } else {
        setError(t('login.errorCreds'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F2F2F7] dark:bg-[#101018]">
      <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-3" style={{ backgroundColor: '#C9A84C' }}>S</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">SESAME</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('login.title')}</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email" placeholder={t('login.email')} value={email} onChange={e => setEmail(e.target.value)} required
            className="border border-gray-200 dark:border-gray-700 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-yellow-400"
          />
          <input
            type="password" placeholder={t('login.password')} value={password} onChange={e => setPassword(e.target.value)} required
            disabled={need2fa}
            className="border border-gray-200 dark:border-gray-700 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-yellow-400 disabled:bg-gray-50 disabled:text-gray-400"
          />
          {need2fa && (
            <div>
              <input
                type="text" inputMode="numeric" autoFocus placeholder={t('login.code2fa')}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full border border-gray-200 dark:border-gray-700 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-4 py-3 text-sm outline-none focus:border-yellow-400 tracking-[0.3em] text-center font-mono"
              />
              <p className="text-xs text-gray-400 text-center mt-1">{t('login.code2faHint')}</p>
            </div>
          )}
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit" disabled={loading || (need2fa && code.length < 6)}
            className="py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#C9A84C' }}
          >
            {loading ? t('login.submitting') : need2fa ? t('login.validate') : t('login.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('admin_token'));
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState({ echanges: 0, alertes: 0, litiges: 0, tickets: 0 });

  const loadBadges = useCallback(async () => {
    try {
      const data = await getDashboard();
      setBadges({
        echanges: data.pendingExchanges ?? 0,
        alertes: data.sanctionsEnAttente?.length ?? 0,
        litiges: data.litigesOuverts ?? 0,
        tickets: data.ticketsOuverts ?? 0,
      });
    } catch {
      // Backend hors ligne — silencieux
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    loadBadges();
    const interval = setInterval(loadBadges, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, loadBadges]);

  if (!isAuthenticated) return <LoginPage onLogin={() => setIsAuthenticated(true)} />;

  const navigate = (key: SectionKey) => {
    setActiveSection(key);
    setMobileOpen(false);
  };

  const ActiveComponent = SECTION_COMPONENTS[activeSection];

  const getBadge = (key: SectionKey): number => {
    if (key === 'echanges') return badges.echanges;
    if (key === 'alertes') return badges.alertes;
    if (key === 'litiges') return badges.litiges;
    if (key === 'tickets') return badges.tickets;
    return 0;
  };

  const sidebarWidth = sidebarExpanded ? '240px' : '64px';
  const THEMES: { mode: ThemeMode; icon: string }[] = [
    { mode: 'clair', icon: '☀️' },
    { mode: 'nocturne', icon: '🌙' },
    { mode: 'auto', icon: '🌗' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#F2F2F7] dark:bg-[#101018]">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: 'rgba(28, 28, 46, 0.5)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full z-50 bg-white dark:bg-[#161624] shadow-lg flex flex-col transition-all duration-300
          md:relative md:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ width: sidebarWidth }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 p-4 border-b border-gray-100 dark:border-white/5 shrink-0"
          style={{ minHeight: '64px' }}
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: '#C9A84C' }}
          >
            S
          </div>
          {sidebarExpanded && (
            <div className="overflow-hidden">
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm leading-tight">SESAME</p>
              <p className="text-xs text-gray-400">{t('app.administration')}</p>
            </div>
          )}
          <button
            onClick={() => setSidebarExpanded(e => !e)}
            className="hidden md:flex ml-auto w-6 h-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-600 transition-colors text-xs"
          >
            {sidebarExpanded ? '◀' : '▶'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const badge = getBadge(item.key);
            const isActive = activeSection === item.key;
            return (
              <button
                key={item.key}
                onClick={() => navigate(item.key)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative ${isActive ? '' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                style={isActive ? {
                  backgroundColor: 'rgba(201,168,76,0.12)',
                  color: '#C9A84C',
                  borderRight: '3px solid #C9A84C',
                  fontWeight: 600,
                } : { borderRight: '3px solid transparent' }}
              >
                <span className="text-base shrink-0 w-6 text-center">{item.icon}</span>
                {sidebarExpanded && (
                  <span className="truncate">{t(item.tkey)}</span>
                )}
                {badge > 0 && (
                  <span
                    className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center shrink-0"
                    style={{ minWidth: '20px', height: '20px', padding: '0 4px' }}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer — sélecteur de langue (specs §5.4 : footer sidebar) */}
        {sidebarExpanded && (
          <div className="p-4 border-t border-gray-100 dark:border-white/5 shrink-0">
            <div className="flex items-center justify-center gap-1 mb-2">
              {LANGS.map(l => (
                <button
                  key={l.code}
                  onClick={() => setLang(l.code)}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${lang === l.code ? 'text-white' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                  style={lang === l.code ? { backgroundColor: '#C9A84C' } : {}}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 text-center">SESAME Admin v1.0</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white dark:bg-[#161624] shadow-sm shrink-0 flex items-center gap-4 px-6 h-16">
          <button
            onClick={() => setMobileOpen(m => !m)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-700 dark:text-gray-200"
          >
            <span className="text-xl">☰</span>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100 truncate">
              {t(NAV_ITEMS.find(n => n.key === activeSection)?.tkey ?? 'app.administration')}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {badges.echanges > 0 && (
              <button
                onClick={() => navigate('echanges')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: '#FF9A3C' }}
              >
                🎁 {badges.echanges} {t('badge.bonsAttente')}
              </button>
            )}
            {badges.alertes > 0 && (
              <button
                onClick={() => navigate('alertes')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: '#FF6464' }}
              >
                ⚠️ {badges.alertes} {t('badge.alertes')}
              </button>
            )}

            {/* Sélecteur de thème (specs §5.4 : menu utilisateur, haut à droite) */}
            <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-white/10 rounded-lg p-0.5">
              {THEMES.map(th => (
                <button
                  key={th.mode}
                  onClick={() => setTheme(th.mode)}
                  title={t(`theme.${th.mode}`)}
                  className={`w-7 h-7 flex items-center justify-center rounded-md text-sm transition-colors ${theme === th.mode ? 'bg-white dark:bg-[#161624] shadow' : 'opacity-50 hover:opacity-100'}`}
                >
                  {th.icon}
                </button>
              ))}
            </div>

            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#C9A84C' }}
            >
              A
            </div>
            <button
              onClick={() => { localStorage.removeItem('admin_token'); localStorage.removeItem('admin_role'); setIsAuthenticated(false); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              {t('app.logout')}
            </button>
          </div>
        </header>

        {/* Section content */}
        <main className="flex-1 overflow-y-auto p-6">
          <ActiveComponent />
        </main>
      </div>
    </div>
  );
}
