import { useEffect, useState, useCallback, useRef } from 'react';
import { getTickets, getTicketMessages, repondreTicket, updateTicketStatut } from '../api';
import type { Ticket, TicketMessage, TicketStatut, TicketCategorie } from '../api';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

const STATUT_COLORS: Record<TicketStatut, string> = {
  ouvert: '#FF6464',
  en_cours: '#FF9A3C',
  resolu: '#4CAF82',
};

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

type Filter = 'actifs' | TicketStatut;

export default function Tickets() {
  const { t, lang } = usePrefs();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('actifs');
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMsg, setLoadingMsg] = useState(false);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const catLabel = (c: TicketCategorie) => t(`tk.cat.${c}`);
  const statutLabel = (s: TicketStatut) => t(`tk.statut.${s}`);

  const formatDateTime = (value?: string) => {
    if (!value) return '';
    return new Date(value).toLocaleString(LOCALES[lang], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setTickets(await getTickets());
    } catch {
      setError(t('tk.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const openTicket = async (tk: Ticket) => {
    setSelected(tk);
    setReply('');
    setLoadingMsg(true);
    setMessages([]);
    try {
      setMessages(await getTicketMessages(tk.id));
    } catch {
      setMessages([]);
    } finally {
      setLoadingMsg(false);
    }
  };

  const handleSend = async () => {
    if (!selected || !reply.trim()) return;
    setSending(true);
    try {
      await repondreTicket(selected.id, reply.trim());
      setReply('');
      setMessages(await getTicketMessages(selected.id));
      await load();
    } catch {
      showToast(t('tk.sendError'));
    } finally {
      setSending(false);
    }
  };

  const handleStatut = async (statut: TicketStatut) => {
    if (!selected) return;
    try {
      await updateTicketStatut(selected.id, statut);
      setSelected({ ...selected, statut });
      showToast(t('tk.statusUpdated'));
      await load();
    } catch {
      showToast(t('tk.error'));
    }
  };

  const filtered = tickets.filter(tk =>
    filter === 'actifs' ? tk.statut !== 'resolu' : tk.statut === filter
  );

  const counts = {
    actifs: tickets.filter(tk => tk.statut !== 'resolu').length,
    ouvert: tickets.filter(tk => tk.statut === 'ouvert').length,
    en_cours: tickets.filter(tk => tk.statut === 'en_cours').length,
    resolu: tickets.filter(tk => tk.statut === 'resolu').length,
  };

  const filters: { key: Filter; label: string }[] = [
    { key: 'actifs', label: t('tk.filterActifs') },
    { key: 'ouvert', label: t('tk.filterOuvert') },
    { key: 'en_cours', label: t('tk.filterEnCours') },
    { key: 'resolu', label: t('tk.filterResolu') },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('tk.title')}</h2>

      {error && <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>}
      {toast && <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>}

      <div className="flex gap-2 flex-wrap">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
              filter === f.key ? 'text-white border-transparent' : 'bg-white dark:bg-[#161624] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300'
            }`}
            style={filter === f.key ? { backgroundColor: f.key === 'actifs' ? '#1C1C2E' : STATUT_COLORS[f.key as TicketStatut] } : {}}
          >
            {f.label} <span className="opacity-70">({counts[f.key]})</span>
          </button>
        ))}
      </div>

      <div className="flex gap-4 h-[calc(100vh-240px)] min-h-[480px]">
        {/* Colonne 1 — liste */}
        <div className="w-72 shrink-0 bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-y-auto">
          {loading ? <Spinner size="sm" /> : filtered.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm"><p className="text-2xl mb-2">💬</p>{t('tk.empty')}</div>
          ) : filtered.map(tk => (
            <button
              key={tk.id}
              onClick={() => openTicket(tk)}
              className={`w-full text-left p-3 border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${selected?.id === tk.id ? 'bg-yellow-50 dark:bg-yellow-500/10 border-l-2' : ''}`}
              style={selected?.id === tk.id ? { borderLeftColor: '#C9A84C' } : {}}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{tk.prenom} {tk.nom}</span>
                <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: STATUT_COLORS[tk.statut] }}>
                  {statutLabel(tk.statut)}
                </span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{catLabel(tk.categorie)}</p>
              {tk.dernier_message && <p className="text-xs text-gray-400 truncate mt-0.5">{tk.dernier_message}</p>}
            </button>
          ))}
        </div>

        {/* Colonne 2 — conversation */}
        <div className="flex-1 bg-white dark:bg-[#161624] rounded-xl shadow-sm flex flex-col overflow-hidden">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center"><p className="text-4xl mb-3">🎫</p><p className="font-medium">{t('tk.selectTicket')}</p></div>
            </div>
          ) : (
            <>
              <div className="p-4 border-b border-gray-100 dark:border-white/10 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{catLabel(selected.categorie)}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selected.prenom} {selected.nom}{selected.course_reference && ` · ${selected.course_reference}`}</p>
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: STATUT_COLORS[selected.statut] }}>
                  {statutLabel(selected.statut)}
                </span>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMsg ? <Spinner size="sm" /> : messages.map(m => {
                  const isAdmin = m.role === 'admin';
                  return (
                    <div key={m.id} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{isAdmin ? 'SESAME' : `${selected.prenom} ${selected.nom}`}</span>
                        {isAdmin && <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: '#C9A84C' }}>SESAME</span>}
                      </div>
                      <div className="px-4 py-2.5 rounded-2xl text-sm max-w-[75%]" style={isAdmin ? { backgroundColor: '#C9A84C', color: 'white' } : { backgroundColor: '#F2F2F7', color: '#1C1C2E' }}>
                        {m.contenu}
                      </div>
                      <span className="text-xs text-gray-400 mt-1">{formatDateTime(m.created_at)}</span>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              {selected.statut !== 'resolu' && (
                <div className="p-4 border-t border-gray-100 dark:border-white/10 flex gap-3">
                  <input
                    type="text"
                    placeholder={t('tk.replyPlaceholder')}
                    value={reply}
                    onChange={e => setReply(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    className="flex-1 border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-4 py-2 text-sm outline-none focus:border-yellow-400"
                  />
                  <button
                    onClick={handleSend}
                    disabled={sending || !reply.trim()}
                    className="px-4 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ backgroundColor: '#C9A84C' }}
                  >
                    {sending ? '…' : t('common.send')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Colonne 3 — détail / actions */}
        {selected && (
          <div className="w-64 shrink-0 bg-white dark:bg-[#161624] rounded-xl shadow-sm p-4 space-y-4 overflow-y-auto">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('tk.demandeur')}</p>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selected.prenom} {selected.nom}</p>
              {selected.email && <p className="text-xs text-gray-500 dark:text-gray-400">{selected.email}</p>}
              {selected.utilisateur_type && <p className="text-xs text-gray-400 capitalize">{selected.utilisateur_type}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('tk.categorie')}</p>
              <p className="text-sm text-gray-700 dark:text-gray-200">{catLabel(selected.categorie)}</p>
            </div>
            {selected.course_reference && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('tk.courseLiee')}</p>
                <p className="text-sm font-mono text-gray-700 dark:text-gray-200">{selected.course_reference}</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{t('tk.ouvertLe')}</p>
              <p className="text-sm text-gray-700 dark:text-gray-200">{formatDateTime(selected.created_at)}</p>
            </div>
            <div className="pt-2 border-t border-gray-100 dark:border-white/10 space-y-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{t('common.status')}</p>
              {(['ouvert', 'en_cours', 'resolu'] as TicketStatut[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleStatut(s)}
                  className={`w-full py-2 text-xs font-semibold rounded-lg transition-opacity hover:opacity-80 ${selected.statut === s ? 'text-white' : 'border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300'}`}
                  style={selected.statut === s ? { backgroundColor: STATUT_COLORS[s] } : {}}
                >
                  {statutLabel(s)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
