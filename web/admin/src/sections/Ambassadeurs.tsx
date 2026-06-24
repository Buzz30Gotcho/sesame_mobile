import { useEffect, useState, useCallback } from 'react';
import { getAmbassadeurs, updateChauffeurStatut, updateAmbassadeurNote, deleteAmbassadeur, validerAmbassadeurMoral } from '../api';
import type { Ambassadeur } from '../api';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';
import { usePrefs } from '../prefs';

type TypeFilter = 'tous' | 'nouveaux' | 'physique' | 'moral' | 'sous_compte';

const LOCALES: Record<string, string> = { fr: 'fr-FR', en: 'en-US', it: 'it-IT', es: 'es-ES' };

export default function Ambassadeurs() {
  const { t, lang } = usePrefs();
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
  const [detailMoral, setDetailMoral] = useState<Ambassadeur | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAmbassadeurs();
      setAmbassadeurs(data);
    } catch {
      setError(t('amb.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const handleToggleStatut = async (amb: Ambassadeur) => {
    if (!amb.utilisateur_id) return;
    setActionLoading(`statut-${amb.id}`);
    try {
      // Moral en attente → validation complète (statut + contrat_moral_signe)
      if (amb.type === 'moral' && amb.compte_statut === 'suspendu' && !amb.contrat_moral_signe) {
        await validerAmbassadeurMoral(String(amb.id));
        showToast(t('amb.moralValidated'));
      } else {
        const newStatut = amb.compte_statut === 'actif' ? 'suspendu' : 'actif';
        await updateChauffeurStatut(amb.utilisateur_id, newStatut);
        showToast(newStatut === 'actif' ? t('amb.activated') : t('amb.suspended'));
      }
      load();
    } catch { showToast(t('amb.error')); }
    finally { setActionLoading(null); }
  };

  const handleDelete = async (amb: Ambassadeur) => {
    if (!window.confirm(`${t('amb.confirmDelete1')} ${amb.prenom} ${amb.nom} ? ${t('amb.confirmDelete2')}`)) return;
    setActionLoading(`delete-${amb.id}`);
    try {
      await deleteAmbassadeur(amb.id);
      showToast(t('amb.deleted'));
      load();
    } catch { showToast(t('amb.deleteError')); }
    finally { setActionLoading(null); }
  };

  const openNote = (amb: Ambassadeur) => { setNoteModal(amb); setNoteText(amb.note_interne ?? ''); };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    setNoteSaving(true);
    try {
      await updateAmbassadeurNote(noteModal.id, noteText);
      showToast(t('amb.noteSaved'));
      setNoteModal(null);
      load();
    } catch { showToast(t('amb.saveError')); }
    finally { setNoteSaving(false); }
  };

  const niveaux = [...new Set(ambassadeurs.filter(a => a.type === 'physique').map(a => a.niveau).filter(Boolean))] as string[];

  const sept_jours_ago = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const nbNouveaux = ambassadeurs.filter(a => a.created_at && new Date(a.created_at) >= sept_jours_ago).length;
  const suspendus = ambassadeurs.filter(a => a.compte_statut === 'suspendu' && a.type !== 'moral');

  const nbPhysique = ambassadeurs.filter(a => a.type === 'physique').length;
  const nbMoral = ambassadeurs.filter(a => a.type === 'moral').length;
  const nbSousCompte = ambassadeurs.filter(a => a.type === 'sous_compte').length;

  const filtered = ambassadeurs.filter(a => {
    if (typeFilter === 'nouveaux') {
      if (!a.created_at || new Date(a.created_at) < sept_jours_ago) return false;
    }
    if (typeFilter === 'physique' && a.type !== 'physique') return false;
    if (typeFilter === 'moral' && a.type !== 'moral') return false;
    if (typeFilter === 'sous_compte' && a.type !== 'sous_compte') return false;
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

  const pillCls = (active: boolean) => `px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
    active ? 'text-white border-transparent' : 'bg-white dark:bg-[#161624] border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:border-gray-300'
  }`;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('amb.title')}</h2>

      {suspendus.length > 0 && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-300 dark:border-red-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="text-red-500 text-xl mt-0.5">🚨</span>
          <div className="flex-1">
            <p className="text-red-700 dark:text-red-300 font-bold text-sm">
              {suspendus.length} {t('amb.suspendedTitle')}
            </p>
            <p className="text-red-500 dark:text-red-400 text-xs mt-1">
              {t('amb.suspendedSub')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suspendus.map(a => (
                <span key={a.id} className="bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-300 text-xs font-semibold px-2 py-1 rounded-lg">
                  {a.prenom} {a.nom}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-300 rounded-xl p-4 text-sm">{error}</div>
      )}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 dark:bg-[#161624] text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {/* Modal note interne */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('amb.noteInterne')}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">{noteModal.prenom} {noteModal.nom}</p>
              </div>
              <button onClick={() => setNoteModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-white/10 text-gray-400">✕</button>
            </div>
            <textarea
              className="w-full border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-xl px-3 py-2 text-sm outline-none focus:border-yellow-400 resize-none"
              rows={5}
              placeholder={t('amb.notePlaceholder')}
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5">{t('common.cancel')}</button>
              <button
                onClick={handleSaveNote}
                disabled={noteSaving}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#C9A84C' }}
              >
                {noteSaving ? t('amb.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal dossier entreprise */}
      {detailMoral && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white dark:bg-[#161624] rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-white/10">
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('amb.dossierTitle')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{t('amb.dossierSub')}</p>
              </div>
              <button onClick={() => setDetailMoral(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('amb.respLegal')}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{detailMoral.responsable_legal_nom || `${detailMoral.prenom} ${detailMoral.nom}`}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('amb.raisonSociale')}</p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{detailMoral.societe || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('common.email')}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{detailMoral.email || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('common.phone')}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{detailMoral.telephone || '—'}</p>
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 space-y-3">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('amb.siret')}</p>
                  <p className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">{detailMoral.siret || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('amb.iban')}</p>
                  <p className="text-sm font-mono text-gray-700 dark:text-gray-200 break-all">{detailMoral.iban || '—'}</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1">{t('amb.inscritLe')}</p>
                <p className="text-sm text-gray-700 dark:text-gray-200">{detailMoral.created_at ? new Date(detailMoral.created_at).toLocaleDateString(LOCALES[lang], { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</p>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-gray-100 dark:border-white/10">
              <button
                onClick={() => setDetailMoral(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
              >
                {t('common.close')}
              </button>
              <button
                onClick={async () => {
                  await handleToggleStatut(detailMoral);
                  setDetailMoral(null);
                }}
                disabled={actionLoading === `statut-${detailMoral.id}`}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#4A9EFF' }}
              >
                {actionLoading === `statut-${detailMoral.id}` ? t('amb.validating') : t('amb.validerCompte')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap gap-3 items-center">
        <button
          onClick={() => setTypeFilter('tous')}
          className={pillCls(typeFilter === 'tous')}
          style={typeFilter === 'tous' ? { backgroundColor: '#1C1C2E' } : {}}
        >
          {t('amb.filterTous')}
        </button>
        <button
          onClick={() => setTypeFilter('nouveaux')}
          className={`${pillCls(typeFilter === 'nouveaux')} flex items-center gap-1.5`}
          style={typeFilter === 'nouveaux' ? { backgroundColor: '#4CAF82' } : {}}
        >
          {t('amb.filterNouveaux')}
          {nbNouveaux > 0 && (
            <span
              className="text-xs font-bold rounded-full flex items-center justify-center"
              style={{
                minWidth: '18px', height: '18px', padding: '0 4px',
                backgroundColor: typeFilter === 'nouveaux' ? 'rgba(255,255,255,0.3)' : '#4CAF82',
                color: 'white',
              }}
            >
              {nbNouveaux}
            </span>
          )}
        </button>

        <button
          onClick={() => setTypeFilter('physique')}
          className={`${pillCls(typeFilter === 'physique')} flex items-center gap-1.5`}
          style={typeFilter === 'physique' ? { backgroundColor: '#C9A84C' } : {}}
        >
          {t('amb.filterParticuliers')}
          <span className="text-xs font-bold rounded-full px-1" style={{ backgroundColor: typeFilter === 'physique' ? 'rgba(255,255,255,0.3)' : '#C9A84C20', color: typeFilter === 'physique' ? 'white' : '#C9A84C' }}>
            {nbPhysique}
          </span>
        </button>

        <button
          onClick={() => setTypeFilter('moral')}
          className={`${pillCls(typeFilter === 'moral')} flex items-center gap-1.5`}
          style={typeFilter === 'moral' ? { backgroundColor: '#4A9EFF' } : {}}
        >
          {t('amb.filterEntreprises')}
          <span className="text-xs font-bold rounded-full px-1" style={{ backgroundColor: typeFilter === 'moral' ? 'rgba(255,255,255,0.3)' : '#4A9EFF20', color: typeFilter === 'moral' ? 'white' : '#4A9EFF' }}>
            {nbMoral}
          </span>
        </button>

        <button
          onClick={() => setTypeFilter('sous_compte')}
          className={`${pillCls(typeFilter === 'sous_compte')} flex items-center gap-1.5`}
          style={typeFilter === 'sous_compte' ? { backgroundColor: '#9B59B6' } : {}}
        >
          {t('amb.filterEmployes')}
          <span className="text-xs font-bold rounded-full px-1" style={{ backgroundColor: typeFilter === 'sous_compte' ? 'rgba(255,255,255,0.3)' : '#9B59B620', color: typeFilter === 'sous_compte' ? 'white' : '#9B59B6' }}>
            {nbSousCompte}
          </span>
        </button>

        {niveaux.length > 0 && (
          <select
            className="border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400"
            value={niveauFilter}
            onChange={e => setNiveauFilter(e.target.value)}
          >
            <option value="">{t('amb.tousNiveaux')}</option>
            {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        )}

        <input
          type="text"
          placeholder={t('amb.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto border border-gray-200 dark:border-white/10 dark:bg-[#101018] dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-yellow-400 w-56"
        />
      </div>

      {loading ? (
        <Spinner />
      ) : (
        <div className="bg-white dark:bg-[#161624] rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/10">
                  {[t('amb.colNomPrenom'), t('common.type'), t('amb.colNiveau'), t('common.phone'), t('amb.colStatutCompte'), t('common.actions')].map((h, idx) => (
                    <th key={idx} className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-400 py-10">{t('amb.empty')}</td>
                  </tr>
                ) : filtered.map(amb => (
                  <tr key={amb.id} className="border-b border-gray-50 dark:border-white/5 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      {amb.type === 'moral' ? (
                        <>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{amb.societe || `${amb.prenom} ${amb.nom}`}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{t('amb.directeur')} {amb.prenom} {amb.nom}</p>
                          <p className="text-xs text-gray-400">{amb.email}</p>
                        </>
                      ) : amb.type === 'sous_compte' ? (
                        <>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{amb.prenom} {amb.nom}</p>
                          {amb.entreprise_nom && (
                            <p className="text-xs font-semibold mt-0.5 px-1.5 py-0.5 rounded inline-block" style={{ backgroundColor: '#9B59B615', color: '#9B59B6' }}>
                              🏢 {amb.entreprise_nom}
                            </p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className="font-medium text-gray-900 dark:text-gray-100">{amb.prenom} {amb.nom}</p>
                          {amb.societe && <p className="text-xs text-gray-400">{amb.societe}</p>}
                        </>
                      )}
                      {amb.created_at && new Date(amb.created_at) >= sept_jours_ago && (
                        <p className="text-xs font-medium mt-0.5" style={{ color: '#4CAF82' }}>
                          {t('amb.nouveau')} · {new Date(amb.created_at).toLocaleDateString(LOCALES[lang])}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-bold"
                        style={amb.type === 'moral'
                          ? { backgroundColor: '#4A9EFF20', color: '#4A9EFF' }
                          : amb.type === 'sous_compte'
                          ? { backgroundColor: '#9B59B620', color: '#9B59B6' }
                          : { backgroundColor: '#C9A84C20', color: '#C9A84C' }
                        }
                      >
                        {amb.type === 'moral' ? t('amb.typeEntreprise') : amb.type === 'sous_compte' ? t('amb.typeEmploye') : t('amb.typeParticulier')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {amb.type === 'moral'
                        ? <span className="text-xs text-gray-400 italic">{t('amb.voirCommissions')}</span>
                        : amb.points !== undefined
                          ? <><span className="font-medium" style={{ color: '#C9A84C' }}>{amb.points} {t('common.points')}</span>{amb.niveau && <span className="ml-2 text-xs text-gray-400">{amb.niveau}</span>}</>
                          : <span className="text-gray-400">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{amb.telephone ?? '—'}</td>
                    <td className="px-4 py-3">
                      {amb.type === 'moral' && amb.compte_statut === 'suspendu' && !amb.contrat_moral_signe
                        ? <Badge label={t('amb.enAttente')} variant="warning" />
                        : <Badge
                            label={amb.compte_statut === 'suspendu' ? t('amb.suspendu') : t('amb.actif')}
                            variant={amb.compte_statut === 'suspendu' ? 'danger' : 'success'}
                          />
                      }
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {amb.type === 'moral' && amb.compte_statut === 'suspendu' && !amb.contrat_moral_signe ? (
                          <div className="flex items-center gap-1">
                          <button
                            onClick={() => setDetailMoral(amb)}
                            className="px-2 py-1 text-xs font-semibold rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                            style={{ borderColor: '#4A9EFF', color: '#4A9EFF' }}
                          >
                            {t('amb.voirDossier')}
                          </button>
                          <button
                            onClick={() => handleToggleStatut(amb)}
                            disabled={actionLoading === `statut-${amb.id}`}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                            style={{ backgroundColor: '#4A9EFF' }}
                          >
                            {actionLoading === `statut-${amb.id}` ? '…' : t('common.validate')}
                          </button>
                          </div>
                        ) : (
                        <button
                          onClick={() => handleToggleStatut(amb)}
                          disabled={actionLoading === `statut-${amb.id}`}
                          className="px-2 py-1 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                          style={{ backgroundColor: amb.compte_statut === 'suspendu' ? '#4CAF82' : '#FF9A3C' }}
                        >
                          {actionLoading === `statut-${amb.id}` ? '…' : amb.compte_statut === 'suspendu' ? t('amb.activer') : t('amb.suspendre')}
                        </button>
                        )}
                        <button
                          onClick={() => openNote(amb)}
                          title={amb.note_interne ?? t('amb.addNoteTitle')}
                          className="px-2 py-1 text-xs rounded-lg border transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
                          style={{
                            borderColor: amb.note_interne ? '#C9A84C' : '#E5E7EB',
                            color: amb.note_interne ? '#C9A84C' : '#9CA3AF',
                            fontWeight: amb.note_interne ? 600 : 400,
                          }}
                        >
                          {amb.note_interne ? t('amb.noteBtn') : t('amb.addNote')}
                        </button>
                        <button
                          onClick={() => handleDelete(amb)}
                          disabled={actionLoading === `delete-${amb.id}`}
                          className="px-2 py-1 text-xs rounded-lg border border-red-200 dark:border-red-500/30 text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-40 transition-colors"
                        >
                          {actionLoading === `delete-${amb.id}` ? '…' : t('amb.suppr')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 dark:border-white/10 text-xs text-gray-400">
            {filtered.length} {t('amb.affichesCount')}
          </div>
        </div>
      )}
    </div>
  );
}
