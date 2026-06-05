import { useEffect, useState, useCallback, useRef } from 'react';
import { getCourses, getChatMessages, sendChatMessage } from '../api';
import type { Course, ChatMessage } from '../api';
import Spinner from '../components/Spinner';
import Badge, { getStatusVariant } from '../components/Badge';

const ACTIVE_STATUTS = ['recherche', 'acceptee', 'en_route', 'code_valide'];

export default function Support() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true);
    try {
      const data = await getCourses();
      setCourses(data.filter(c => ACTIVE_STATUTS.includes(c.statut)));
    } catch {
      setError('Impossible de charger les courses actives.');
    } finally {
      setLoadingCourses(false);
    }
  }, []);

  useEffect(() => { loadCourses(); }, [loadCourses]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const loadMessages = useCallback(async (courseId: number) => {
    setLoadingMessages(true);
    setMessages([]);
    try {
      const data = await getChatMessages(courseId);
      setMessages(data);
    } catch {
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    loadMessages(course.id);
  };

  const handleSend = async () => {
    if (!selectedCourse || !newMessage.trim()) return;
    setSending(true);
    try {
      await sendChatMessage(selectedCourse.id, newMessage.trim());
      setNewMessage('');
      loadMessages(selectedCourse.id);
    } catch {
      // silently ignore
    } finally {
      setSending(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const getRoleStyle = (role: string) => {
    switch (role) {
      case 'admin':
        return { bg: '#C9A84C', text: 'white', align: 'end' as const, label: 'SESAME Admin' };
      case 'chauffeur':
        return { bg: '#4A9EFF', text: 'white', align: 'start' as const, label: 'Chauffeur' };
      default:
        return { bg: '#F2F2F7', text: '#1C1C2E', align: 'start' as const, label: 'Ambassadeur' };
    }
  };

  return (
    <div className="space-y-0">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Support / Chat</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm mb-4">{error}</div>
      )}

      <div className="flex gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        {/* Liste courses */}
        <div className="w-72 shrink-0 bg-white rounded-xl shadow-sm overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700">Courses actives</p>
          </div>
          {loadingCourses ? (
            <Spinner size="sm" />
          ) : courses.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              <p className="text-2xl mb-2">🚗</p>
              Aucune course active en ce moment
            </div>
          ) : (
            <div>
              {courses.map(course => (
                <button
                  key={course.id}
                  onClick={() => handleSelectCourse(course)}
                  className={`w-full text-left p-4 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedCourse?.id === course.id ? 'bg-yellow-50 border-l-2' : ''
                  }`}
                  style={selectedCourse?.id === course.id ? { borderLeftColor: '#C9A84C' } : {}}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-mono font-medium text-gray-700 truncate">
                      {course.reference ?? `#${course.id}`}
                    </p>
                    <Badge label={course.statut} variant={getStatusVariant(course.statut)} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {[course.ambassadeur_prenom, course.ambassadeur_nom].filter(Boolean).join(' ') || 'Ambassadeur'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Zone chat */}
        <div className="flex-1 bg-white rounded-xl shadow-sm flex flex-col overflow-hidden">
          {!selectedCourse ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-4xl mb-3">💬</p>
                <p className="font-medium">Sélectionnez une course</p>
                <p className="text-sm mt-1">pour afficher la conversation</p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex items-center gap-3">
                <div>
                  <p className="font-semibold text-gray-900 text-sm">
                    Course {selectedCourse.reference ?? `#${selectedCourse.id}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {[selectedCourse.ambassadeur_prenom, selectedCourse.ambassadeur_nom].filter(Boolean).join(' ')}
                    {selectedCourse.adresse_depart && ` · ${selectedCourse.adresse_depart}`}
                  </p>
                </div>
                <Badge label={selectedCourse.statut} variant={getStatusVariant(selectedCourse.statut)} />
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingMessages ? (
                  <Spinner size="sm" />
                ) : messages.length === 0 ? (
                  <div className="text-center text-gray-400 text-sm py-8">
                    Aucun message dans cette conversation
                  </div>
                ) : (
                  messages.map((msg, i) => {
                    const style = getRoleStyle(msg.role);
                    return (
                      <div key={msg.id ?? i} className={`flex flex-col ${style.align === 'end' ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-1 mb-1">
                          <span className="text-xs font-medium text-gray-500">{msg.auteur_nom ?? style.label}</span>
                          {msg.role === 'admin' && (
                            <span className="text-xs font-bold px-1.5 py-0.5 rounded-full text-white" style={{ backgroundColor: '#C9A84C' }}>
                              SESAME
                            </span>
                          )}
                        </div>
                        <div
                          className="px-4 py-2.5 rounded-2xl text-sm max-w-[75%]"
                          style={{ backgroundColor: style.bg, color: style.text }}
                        >
                          {msg.contenu}
                        </div>
                        {msg.created_at && (
                          <span className="text-xs text-gray-400 mt-1">
                            {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-100 flex gap-3">
                <input
                  type="text"
                  placeholder="Message de l'équipe SESAME…"
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  onKeyDown={handleKey}
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2 text-sm outline-none focus:border-yellow-400"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !newMessage.trim()}
                  className="px-4 py-2 text-sm font-medium rounded-xl text-white transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-2"
                  style={{ backgroundColor: '#C9A84C' }}
                >
                  {sending ? '…' : (
                    <>
                      Envoyer
                      <span className="text-xs bg-white bg-opacity-30 px-1.5 py-0.5 rounded-full font-bold">SESAME</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
