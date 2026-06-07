import React, { useState, useEffect, useCallback } from 'react';
import { getDashboard, adminLogin } from './api';

// Sections
import Dashboard from './sections/Dashboard';
import Courses from './sections/Courses';
import Echanges from './sections/Echanges';
import Ambassadeurs from './sections/Ambassadeurs';
import Chauffeurs from './sections/Chauffeurs';
import Fournisseurs from './sections/Fournisseurs';
import Blacklist from './sections/Blacklist';
import Alertes from './sections/Alertes';
import Support from './sections/Support';
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
  | 'alertes'
  | 'support'
  | 'commissions'
  | 'parametres';

interface NavItem {
  key: SectionKey;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'Vue générale', icon: '📊' },
  { key: 'courses', label: 'Courses', icon: '🚗' },
  { key: 'echanges', label: 'Échanges', icon: '🎁' },
  { key: 'ambassadeurs', label: 'Ambassadeurs', icon: '👤' },
  { key: 'chauffeurs', label: 'Chauffeurs', icon: '🚘' },
  { key: 'fournisseurs', label: 'Fournisseurs', icon: '🏪' },
  { key: 'blacklist', label: 'Blacklist', icon: '🔕' },
  { key: 'alertes', label: 'Alertes', icon: '⚠️' },
  { key: 'support', label: 'Support', icon: '💬' },
  { key: 'parametres', label: 'Paramètres', icon: '⚙️' },
];

const SECTION_COMPONENTS: Record<SectionKey, React.ComponentType> = {
  dashboard: Dashboard,
  courses: Courses,
  echanges: Echanges,
  ambassadeurs: Ambassadeurs,
  chauffeurs: Chauffeurs,
  fournisseurs: Fournisseurs,
  blacklist: Blacklist,
  alertes: Alertes,
  support: Support,
  commissions: CommissionsMoraux,
  parametres: Parametres,
};

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const token = await adminLogin(email, password);
      localStorage.setItem('admin_token', token);
      onLogin();
    } catch {
      setError('Email ou mot de passe incorrect.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F2F2F7' }}>
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mb-3" style={{ backgroundColor: '#C9A84C' }}>S</div>
          <h1 className="text-xl font-bold text-gray-900">SESAME</h1>
          <p className="text-sm text-gray-500">Administration</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-yellow-400"
          />
          <input
            type="password" placeholder="Mot de passe" value={password} onChange={e => setPassword(e.target.value)} required
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-yellow-400"
          />
          {error && <p className="text-red-500 text-sm text-center">{error}</p>}
          <button
            type="submit" disabled={loading}
            className="py-3 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
            style={{ backgroundColor: '#C9A84C' }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('admin_token'));
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [badges, setBadges] = useState({ echanges: 0, alertes: 0 });

  const loadBadges = useCallback(async () => {
    try {
      const data = await getDashboard();
      setBadges({
        echanges: data.pendingExchanges ?? 0,
        alertes: data.sanctionsEnAttente?.length ?? 0,
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
    return 0;
  };

  const sidebarWidth = sidebarExpanded ? '240px' : '64px';

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: '#F2F2F7' }}>
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
          fixed top-0 left-0 h-full z-50 bg-white shadow-lg flex flex-col transition-all duration-300
          md:relative md:translate-x-0
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
        style={{ width: sidebarWidth }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 p-4 border-b border-gray-100 shrink-0"
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
              <p className="font-bold text-gray-900 text-sm leading-tight">SESAME</p>
              <p className="text-xs text-gray-400">Administration</p>
            </div>
          )}
          <button
            onClick={() => setSidebarExpanded(e => !e)}
            className="hidden md:flex ml-auto w-6 h-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors text-xs"
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
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors relative"
                style={{
                  backgroundColor: isActive ? '#FFF8EC' : 'transparent',
                  color: isActive ? '#C9A84C' : '#6B7280',
                  borderRight: isActive ? '3px solid #C9A84C' : '3px solid transparent',
                  fontWeight: isActive ? 600 : 400,
                }}
              >
                <span className="text-base shrink-0 w-6 text-center">{item.icon}</span>
                {sidebarExpanded && (
                  <span className="truncate">{item.label}</span>
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

        {/* Footer */}
        {sidebarExpanded && (
          <div className="p-4 border-t border-gray-100 shrink-0">
            <p className="text-xs text-gray-400 text-center">SESAME Admin v1.0</p>
            <p className="text-xs text-gray-300 text-center mt-0.5">© 2026</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="bg-white shadow-sm shrink-0 flex items-center gap-4 px-6 h-16">
          <button
            onClick={() => setMobileOpen(m => !m)}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-colors"
          >
            <span className="text-xl">☰</span>
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {NAV_ITEMS.find(n => n.key === activeSection)?.label ?? 'Administration'}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {badges.echanges > 0 && (
              <button
                onClick={() => navigate('echanges')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: '#FF9A3C' }}
              >
                🎁 {badges.echanges} bon{badges.echanges > 1 ? 's' : ''} en attente
              </button>
            )}
            {badges.alertes > 0 && (
              <button
                onClick={() => navigate('alertes')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium text-white"
                style={{ backgroundColor: '#FF6464' }}
              >
                ⚠️ {badges.alertes} alerte{badges.alertes > 1 ? 's' : ''}
              </button>
            )}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ backgroundColor: '#C9A84C' }}
            >
              A
            </div>
            <button
              onClick={() => { localStorage.removeItem('admin_token'); setIsAuthenticated(false); }}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
            >
              Déconnexion
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
