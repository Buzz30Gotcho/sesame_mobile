import { useEffect, useState, useCallback } from 'react';
import { getChauffeurs, updateChauffeurTaux, getChauffeurDocuments, validerDocument, refuserDocument, updateChauffeurStatut, updateChauffeurNote } from '../api';
import type { Chauffeur } from '../api';
import Badge from '../components/Badge';
import Spinner from '../components/Spinner';

const DOC_LABELS: Record<string, string> = {
  carte_identite: "Carte d'identité",
  carte_vtc: 'Carte VTC',
  permis: 'Permis de conduire',
  carte_grise: 'Carte grise',
  kbis: 'Kbis',
  rc_pro: 'RC Professionnelle',
  rc_circulation: 'RC Circulation',
  revtc: 'REVTC',
  certificat_medical: 'Certificat médical',
  photo_profil: 'Photo profil',
};

export default function Chauffeurs() {
  const [chauffeurs, setChauffeurs] = useState<Chauffeur[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingTaux, setEditingTaux] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [selectedChauffeur, setSelectedChauffeur] = useState<Chauffeur | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [refusModal, setRefusModal] = useState<any | null>(null);
  const [motifRefus, setMotifRefus] = useState('');
  const [validerModal, setValiderModal] = useState<any | null>(null);
  const [dateExpiration, setDateExpiration] = useState('');
  const [viewDocsModal, setViewDocsModal] = useState<Chauffeur | null>(null);
  const [viewDocuments, setViewDocuments] = useState<any[]>([]);
  const [viewDocsLoading, setViewDocsLoading] = useState(false);
  const [noteModal, setNoteModal] = useState<Chauffeur | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getChauffeurs();
      setChauffeurs(data);
    } catch {
      setError('Impossible de charger les chauffeurs.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleTauxChange = (id: string, val: string) => {
    setEditingTaux(prev => ({ ...prev, [id]: val }));
  };

  const handleSaveTaux = async (id: string) => {
    const val = editingTaux[id];
    if (val === undefined) return;
    const taux = parseFloat(val);
    if (isNaN(taux) || taux < 0 || taux > 100) { showToast('Taux invalide (0–100%)'); return; }
    setSaving(id);
    try {
      await updateChauffeurTaux(Number(id), taux);
      showToast('Taux mis à jour');
      const updated = { ...editingTaux };
      delete updated[id];
      setEditingTaux(updated);
      load();
    } catch {
      showToast('Erreur lors de la mise à jour');
    } finally {
      setSaving(null);
    }
  };

  const openDocs = async (ch: Chauffeur) => {
    setSelectedChauffeur(ch);
    setDocsLoading(true);
    try {
      const data = await getChauffeurDocuments(String(ch.id));
      setDocuments(data);
    } catch {
      showToast('Erreur chargement documents');
    } finally {
      setDocsLoading(false);
    }
  };

  // Docs sans expiration selon les specs (Interfaces Catalogue v4 §2)
  const DOCS_SANS_EXPIRATION = ['carte_grise', 'photo_profil', 'rir'];

  const openViewDocs = async (ch: Chauffeur) => {
    setViewDocsModal(ch);
    setViewDocsLoading(true);
    try {
      const data = await getChauffeurDocuments(String(ch.id));
      setViewDocuments(data);
    } catch {
      showToast('Erreur chargement documents');
    } finally {
      setViewDocsLoading(false);
    }
  };

  const openValiderModal = (doc: any) => {
    setValiderModal(doc);
    setDateExpiration('');
    setRcMentionValide(false);
  };

  const [rcMentionValide, setRcMentionValide] = useState(false);

  const confirmValider = async () => {
    if (!validerModal) return;
    setActionLoading(validerModal.id);
    try {
      await validerDocument(validerModal.id, dateExpiration || undefined, validerModal.type === 'rc_circulation' ? rcMentionValide : undefined);
      showToast('Document validé');
      setValiderModal(null);
      if (selectedChauffeur) {
        const data = await getChauffeurDocuments(String(selectedChauffeur.id));
        setDocuments(data);
        load();
      }
    } catch { showToast('Erreur'); }
    finally { setActionLoading(null); }
  };

  const openNote = (ch: Chauffeur) => {
    setNoteModal(ch);
    setNoteText(ch.note_interne ?? '');
  };

  const handleSaveNote = async () => {
    if (!noteModal) return;
    setNoteSaving(true);
    try {
      await updateChauffeurNote(noteModal.id, noteText);
      showToast('Note sauvegardée');
      setNoteModal(null);
      load();
    } catch { showToast('Erreur lors de la sauvegarde'); }
    finally { setNoteSaving(false); }
  };

  const handleToggleStatut = async (ch: Chauffeur) => {
    if (!ch.utilisateur_id) return;
    const newStatut = ch.compte_statut === 'actif' ? 'suspendu' : 'actif';
    setActionLoading(`statut-${ch.id}`);
    try {
      await updateChauffeurStatut(ch.utilisateur_id, newStatut);
      showToast(newStatut === 'actif' ? 'Compte activé' : 'Compte suspendu');
      load();
    } catch { showToast('Erreur'); }
    finally { setActionLoading(null); }
  };

  const handleRefuse = (doc: any) => {
    setRefusModal(doc);
    setMotifRefus('');
  };

  const confirmRefuse = async () => {
    if (!refusModal) return;
    setActionLoading(refusModal.id);
    try {
      await refuserDocument(refusModal.id, motifRefus);
      showToast('Document refusé');
      setRefusModal(null);
      if (selectedChauffeur) {
        const data = await getChauffeurDocuments(String(selectedChauffeur.id));
        setDocuments(data);
        load();
      }
    } catch { showToast('Erreur'); }
    finally { setActionLoading(null); }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Chauffeurs</h2>

      {/* Modal lecture documents — vue seule */}
      {viewDocsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Documents — {viewDocsModal.prenom} {viewDocsModal.nom}</h3>
                <p className="text-xs text-gray-400 mt-0.5">Statut et dates d'expiration</p>
              </div>
              <button onClick={() => setViewDocsModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              {viewDocsLoading ? <Spinner /> : viewDocuments.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucun document envoyé</p>
              ) : (
                <div className="space-y-2">
                  {viewDocuments.map((doc: any) => (
                    <div key={doc.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{DOC_LABELS[doc.type] || doc.type}</p>
                        {doc.date_expiration && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Expire le {new Date(doc.date_expiration).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        doc.statut === 'valide' ? 'bg-green-100 text-green-700' :
                        doc.statut === 'refuse' ? 'bg-red-100 text-red-700' :
                        doc.statut === 'expire' ? 'bg-gray-200 text-gray-500' :
                        'bg-orange-100 text-orange-700'
                      }`}>
                        {doc.statut === 'valide' ? '✓ Validé' :
                         doc.statut === 'refuse' ? '✗ Refusé' :
                         doc.statut === 'expire' ? '⌛ Expiré' :
                         '⏳ En attente'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal validation document */}
      {validerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Valider le document</h3>
                <p className="text-sm text-gray-500">{DOC_LABELS[validerModal.type] || validerModal.type}</p>
              </div>
              <button onClick={() => setValiderModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            {(validerModal.fichier_recto_url || validerModal.fichier_verso_url) && (
              <div className="flex gap-3">
                {validerModal.fichier_recto_url && (
                  <a href={validerModal.fichier_recto_url} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">Voir recto</a>
                )}
                {validerModal.fichier_verso_url && (
                  <a href={validerModal.fichier_verso_url} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">Voir verso</a>
                )}
              </div>
            )}
            {validerModal.type === 'rc_circulation' && (
              <label className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-orange-500"
                  checked={rcMentionValide}
                  onChange={e => setRcMentionValide(e.target.checked)}
                />
                <span className="text-sm text-orange-700">
                  Je confirme que la RC Circulation mentionne bien <strong>"transport passagers à titre onéreux"</strong>
                </span>
              </label>
            )}
            {!DOCS_SANS_EXPIRATION.includes(validerModal.type) && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {validerModal.type === 'kbis'
                    ? 'Date d\'expiration — lire la date d\'émission sur le Kbis, ajouter 6 mois'
                    : 'Date d\'expiration (inscrite sur le document)'}
                </label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-green-400"
                  value={dateExpiration}
                  onChange={e => setDateExpiration(e.target.value)}
                />
                {validerModal.type === 'kbis' && (
                  <p className="text-xs text-orange-500 mt-1">Ex : Kbis émis le 01/04/2026 → saisir 01/10/2026. Alerte admin automatique à J-30.</p>
                )}
              </div>
            )}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setValiderModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={confirmValider}
                disabled={actionLoading === validerModal.id}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#4CAF82' }}
              >
                {actionLoading === validerModal.id ? 'Validation…' : '✓ Confirmer la validation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal motif de refus */}
      {refusModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Refuser le document</h3>
                <p className="text-sm text-gray-500">{DOC_LABELS[refusModal.type] || refusModal.type}</p>
              </div>
              <button onClick={() => setRefusModal(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            {(refusModal.fichier_recto_url || refusModal.fichier_verso_url) && (
              <div className="flex gap-3">
                {refusModal.fichier_recto_url && (
                  <a href={refusModal.fichier_recto_url} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">📄 Voir recto</a>
                )}
                {refusModal.fichier_verso_url && (
                  <a href={refusModal.fichier_verso_url} target="_blank" rel="noreferrer" className="flex-1 text-center py-2 text-sm text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50">📄 Voir verso</a>
                )}
              </div>
            )}
            {refusModal.statut === 'valide' && (
              <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-xl px-4 py-3">
                <span className="text-orange-500 text-lg leading-none mt-0.5">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-orange-700">Document déjà validé</p>
                  <p className="text-xs text-orange-600 mt-0.5">En refusant ce document, le chauffeur sera <strong>immédiatement mis hors ligne</strong> et ne pourra plus recevoir de courses.</p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Motif du refus (optionnel)</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-red-400 resize-none"
                rows={3}
                placeholder="Ex : Photo floue, document expiré, mauvais document…"
                value={motifRefus}
                onChange={e => setMotifRefus(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRefusModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Annuler
              </button>
              <button
                onClick={confirmRefuse}
                disabled={actionLoading === refusModal.id}
                className="px-4 py-2 text-sm rounded-lg text-white font-medium disabled:opacity-50"
                style={{ backgroundColor: '#FF6464' }}
              >
                {actionLoading === refusModal.id ? 'Refus…' : 'Confirmer le refus'}
              </button>
            </div>
          </div>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">{error}</div>}

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
              placeholder="Ex : doit 150€ depuis mars, en attente nouveau permis…"
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
            />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setNoteModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50">
                Annuler
              </button>
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

      {toast && (
        <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-5 py-3 rounded-xl shadow-lg z-50 text-sm">{toast}</div>
      )}

      {/* Modal documents */}
      {selectedChauffeur && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Documents — {selectedChauffeur.prenom} {selectedChauffeur.nom}</h3>
                <p className="text-sm text-gray-500 mt-0.5">Validez ou refusez chaque document</p>
              </div>
              <button onClick={() => setSelectedChauffeur(null)} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400">✕</button>
            </div>
            <div className="overflow-y-auto flex-1 p-6">
              {docsLoading ? (
                <Spinner />
              ) : documents.length === 0 ? (
                <p className="text-center text-gray-400 py-8">Aucun document envoyé</p>
              ) : (
                <div className="space-y-3">
                  {documents.map((doc: any) => (
                    <div key={doc.id} className="bg-gray-50 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{DOC_LABELS[doc.type] || doc.type}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              doc.statut === 'valide' ? 'bg-green-100 text-green-700' :
                              doc.statut === 'refuse' ? 'bg-red-100 text-red-700' :
                              doc.statut === 'expire' ? 'bg-gray-200 text-gray-500' :
                              'bg-orange-100 text-orange-700'
                            }`}>
                              {doc.statut === 'valide' ? '✓ Validé' :
                               doc.statut === 'refuse' ? '✗ Refusé' :
                               doc.statut === 'expire' ? '⌛ Expiré' :
                               '⏳ En attente'}
                            </span>
                            {doc.date_expiration && doc.statut === 'valide' && (
                              <span className="text-xs text-gray-400">
                                expire le {new Date(doc.date_expiration).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                            {doc.fichier_recto_url && (
                              <a href={doc.fichier_recto_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">📄 Voir recto</a>
                            )}
                            {doc.fichier_verso_url && (
                              <a href={doc.fichier_verso_url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">📄 Voir verso</a>
                            )}
                          </div>
                          {doc.statut === 'refuse' && doc.motif_refus && (
                            <p className="text-xs text-red-500 mt-1">Motif : {doc.motif_refus}</p>
                          )}
                        </div>
                        <div className="flex gap-2 ml-4">
                          {doc.statut === 'valide' ? (
                            <div className="flex flex-col items-end gap-1">
                              {doc.date_expiration ? (
                                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                                  ✓ Expire le {new Date(doc.date_expiration).toLocaleDateString('fr-FR')}
                                </span>
                              ) : (
                                <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-lg">
                                  ✓ Validé
                                </span>
                              )}
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => openValiderModal(doc)}
                                disabled={actionLoading === doc.id}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#4CAF82' }}
                              >
                                {actionLoading === doc.id ? '…' : '✓ Valider'}
                              </button>
                              <button
                                onClick={() => handleRefuse(doc)}
                                disabled={actionLoading === doc.id}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                                style={{ backgroundColor: '#FF6464' }}
                              >
                                {actionLoading === doc.id ? '…' : '✗ Refuser'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {['Prénom Nom', 'Véhicule', 'Statut compte', 'Disponible', 'Documents', 'Taux Commission', 'Note', 'Action'].map(h => (
                    <th key={h} className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chauffeurs.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-10">Aucun chauffeur trouvé</td></tr>
                ) : chauffeurs.map(ch => {
                  const id = String(ch.id);
                  const currentTaux = editingTaux[id] ?? String(ch.taux_commission ?? '');
                  const isEditing = editingTaux[id] !== undefined;

                  return (
                    <tr key={ch.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{ch.prenom} {ch.nom}</p>
                        {ch.telephone && <p className="text-xs text-gray-400">{ch.telephone}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{ch.vehicule ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            label={ch.compte_statut === 'suspendu' ? 'Suspendu' : 'Actif'}
                            variant={ch.compte_statut === 'suspendu' ? 'danger' : 'success'}
                          />
                          <button
                            onClick={() => handleToggleStatut(ch)}
                            disabled={actionLoading === `statut-${ch.id}`}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-white disabled:opacity-40 transition-opacity hover:opacity-80"
                            style={{ backgroundColor: ch.compte_statut === 'suspendu' ? '#4CAF82' : '#FF9A3C' }}
                          >
                            {actionLoading === `statut-${ch.id}` ? '…' : ch.compte_statut === 'suspendu' ? 'Activer' : 'Suspendre'}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={ch.disponible ? 'Disponible' : 'Indisponible'} variant={ch.disponible ? 'success' : 'gray'} />
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDocs(ch)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:opacity-80"
                          style={{
                            backgroundColor: ch.documents_valides ? '#E8F5EE' : '#FFF3E0',
                            color: ch.documents_valides ? '#4CAF82' : '#FF9A3C',
                          }}
                        >
                          📋 Documents
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="number" min="0" max="100" step="0.5"
                            value={currentTaux}
                            onChange={e => handleTauxChange(id, e.target.value)}
                            className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm outline-none focus:border-yellow-400"
                            placeholder="20"
                          />
                          <span className="text-gray-500 text-sm">%</span>
                          {!currentTaux && <span className="text-xs text-gray-400">(défaut)</span>}
                        </div>
                      </td>
                      {/* Colonne Note */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1.5 w-[140px]">
                          {ch.note_interne && (
                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1.5">
                              <p className="text-xs text-gray-700 whitespace-pre-wrap break-words leading-4">
                                {ch.note_interne}
                              </p>
                            </div>
                          )}
                          <button
                            onClick={() => openNote(ch)}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-white transition-opacity hover:opacity-80 whitespace-nowrap"
                            style={{ backgroundColor: ch.note_interne ? '#C9A84C' : '#9CA3AF' }}
                          >
                            {ch.note_interne ? '✏️ Modifier' : '+ Note'}
                          </button>
                        </div>
                      </td>

                      {/* Colonne Action */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {isEditing && (
                            <button
                              onClick={() => handleSaveTaux(id)}
                              disabled={saving === id}
                              className="px-3 py-1 text-xs font-medium rounded-lg text-white transition-opacity hover:opacity-80 disabled:opacity-50"
                              style={{ backgroundColor: '#4CAF82' }}
                            >
                              {saving === id ? '…' : 'Sauvegarder'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 text-xs text-gray-400">
            {chauffeurs.length} chauffeur{chauffeurs.length > 1 ? 's' : ''} au total
          </div>
        </div>
      )}
    </div>
  );
}
