import axios from 'axios';

// URL de l'API : configurable au build via VITE_API_URL (prod), défaut localhost (dev).
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4001/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Injecte le token admin dans chaque requête
api.interceptors.request.use(config => {
  const token = localStorage.getItem('admin_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si 401 → déconnexion
api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('admin_token');
      window.location.reload();
    }
    return Promise.reject(err);
  }
);

export async function adminLogin(email: string, password: string, code?: string): Promise<string> {
  const res = await axios.post(`${BASE_URL}/admin/login`, { email, password, code });
  if (res.data.adminRole) localStorage.setItem('admin_role', res.data.adminRole);
  return res.data.token;
}

// Rôle de l'admin connecté (pour adapter l'UI ; le backend reste l'autorité).
export const getAdminRole = (): string => localStorage.getItem('admin_role') || 'super_admin';

// Comptes admin & rôles (specs §5.4) — réservé au Super admin
export type AdminRole = 'super_admin' | 'operateur' | 'lecteur';
export interface AdminAccount {
  id: string;
  email: string;
  nom?: string | null;
  role: AdminRole;
  actif: boolean;
  created_at: string;
}
export const getAdmins = () =>
  api.get<{ fondateur: string | null; comptes: AdminAccount[] }>('/admin/admins').then(r => r.data);
export const createAdmin = (payload: { email: string; password: string; nom?: string; role: AdminRole }) =>
  api.post<AdminAccount>('/admin/admins', payload).then(r => r.data);
export const updateAdmin = (id: string, payload: { role?: AdminRole; actif?: boolean; password?: string }) =>
  api.put<{ success: boolean }>(`/admin/admins/${id}`, payload).then(r => r.data);
export const deleteAdmin = (id: string) =>
  api.delete<{ success: boolean }>(`/admin/admins/${id}`).then(r => r.data);

// 2FA admin (specs §5.4)
export const get2faStatus = () => api.get<{ enabled: boolean }>('/admin/2fa/status').then(r => r.data);
export const setup2fa = () => api.post<{ qr: string; secret: string }>('/admin/2fa/setup').then(r => r.data);
export const activate2fa = (code: string) => api.post<{ success: boolean }>('/admin/2fa/activate', { code }).then(r => r.data);
export const disable2fa = (code: string) => api.post<{ success: boolean }>('/admin/2fa/disable', { code }).then(r => r.data);

// Types
export interface DashboardStats {
  totalCourses: number;
  totalAmbassadeurs: number;
  totalChauffeurs: number;
  chauffeursActifs?: number;
  pendingExchanges: number;
  ambassadeursSuspendus?: number;
  kbis_expiring_soon?: number;
  litigesOuverts?: number;
  ticketsOuverts?: number;
  coursesEnCours?: number;
  coursesTerminees?: number;
  coursesAnnulees?: number;
  caBrut?: number;
  top5Ambassadeurs?: Ambassadeur[];
  sanctionsEnAttente?: Sanction[];
  coursesParJour?: { date: string; count: number }[];
}

export interface Ambassadeur {
  id: number;
  utilisateur_id?: string;
  prenom: string;
  nom: string;
  type: 'physique' | 'moral' | 'sous_compte';
  niveau?: string;
  points?: number;
  commission?: number;
  telephone?: string;
  email?: string;
  statut?: string;
  compte_statut?: 'actif' | 'suspendu' | 'blackliste';
  societe?: string;
  note_interne?: string;
  created_at?: string;
  contrat_moral_signe?: boolean;
  entreprise_nom?: string;
  entreprise_id?: number;
  siret?: string;
  iban?: string;
  responsable_legal_nom?: string;
}

export interface Chauffeur {
  id: number;
  prenom: string;
  nom: string;
  vehicule?: string;
  disponible?: boolean;
  taux_commission?: number;
  documents_complets?: boolean;
  documents_valides?: boolean;
  telephone?: string;
  compte_statut?: 'actif' | 'suspendu' | 'blackliste';
  utilisateur_id?: string;
  note_interne?: string;
}

export interface Course {
  id: number;
  reference?: string;
  statut: string;
  type?: string;
  ambassadeur_nom?: string;
  ambassadeur_prenom?: string;
  chauffeur_nom?: string;
  chauffeur_prenom?: string;
  adresse_depart?: string;
  adresse_destination?: string;
  montant?: number;
  created_at?: string;
  annulable?: boolean;
}

export interface Echange {
  id: number;
  offre_nom?: string;
  ambassadeur_nom?: string;
  ambassadeur_prenom?: string;
  points_deduits?: number;
  statut?: string;
  created_at?: string;
  date_demande?: string;
  remis_at?: string;
}

export interface BlacklistEntry {
  id?: number;
  nom: string;
  prenom: string;
  date_naissance: string;
  lieu_naissance: string;
  telephone: string;
  motif: string;
  type_utilisateur: 'ambassadeur' | 'chauffeur';
  created_at?: string;
}

export interface Sanction {
  id: number;
  course_id?: number;
  course_reference?: string;
  ambassadeur_nom?: string;
  chauffeur_nom?: string;
  type?: string;
  statut?: string;
  created_at?: string;
}

export interface Parametre {
  cle: string;
  valeur: string;
  description?: string;
}

export interface CommissionMoral {
  mois: string;
  nb_courses: number;
  ca_brut: number;
  commission: number;
  statut_virement?: string;
}

export interface ChatMessage {
  id?: number;
  role: 'ambassadeur' | 'chauffeur' | 'admin';
  contenu: string;
  created_at?: string;
  auteur_nom?: string;
}

// Dashboard
export const getDashboard = () => api.get<DashboardStats>('/admin/dashboard').then(r => r.data);

// Ambassadeurs
export const getAmbassadeurs = () => api.get<Ambassadeur[]>('/admin/ambassadeurs').then(r => r.data);

// Chauffeurs
export const getChauffeurs = () => api.get<Chauffeur[]>('/admin/chauffeurs').then(r => r.data);
export const getChauffeurDocuments = (id: string) => api.get(`/admin/chauffeurs/${id}/documents`).then(r => r.data);
export const validerDocument = (id: string, date_expiration?: string, rc_circulation_mention_valide?: boolean) =>
  api.put(`/admin/documents/${id}/valider`, { date_expiration: date_expiration || null, rc_circulation_mention_valide }).then(r => r.data);
export const refuserDocument = (id: string, motif?: string) => api.put(`/admin/documents/${id}/refuser`, { motif }).then(r => r.data);
export const updateChauffeurTaux = (id: number, taux: number) =>
  api.put(`/admin/chauffeurs/${id}/taux`, { taux }).then(r => r.data);
export const updateChauffeurStatut = (utilisateur_id: string, statut: 'actif' | 'suspendu') =>
  api.put(`/admin/utilisateurs/${utilisateur_id}/statut`, { statut }).then(r => r.data);
export const updateChauffeurNote = (id: number, note: string) =>
  api.put(`/admin/chauffeurs/${id}/note`, { note }).then(r => r.data);

// Contrôle d'identité chauffeur (specs §5.1 / §9.1)
export interface ControleIdentite {
  id: string;
  prenom: string;
  nom: string;
  telephone?: string;
  compte_statut?: string;
  vehicule_type?: string;
  vehicule_marque?: string;
  vehicule_modele?: string;
  vehicule_couleur?: string;
  vehicule_immat?: string;
  photo_profil_url: string | null;
  historique: { id: string; resultat: string; note?: string; created_at: string }[];
}
export const getControleIdentite = (id: string) =>
  api.get<ControleIdentite>(`/admin/chauffeurs/${id}/controle-identite`).then(r => r.data);
export const enregistrerControleIdentite = (id: string, resultat: 'conforme' | 'non_conforme', note?: string) =>
  api.post<{ success: boolean; suspendu: boolean }>(`/admin/chauffeurs/${id}/controle-identite`, { resultat, note }).then(r => r.data);
export const deleteAmbassadeur = (id: number) =>
  api.delete(`/admin/ambassadeurs/${id}`);

export const updateAmbassadeurNote = (id: number, note: string) =>
  api.put(`/admin/ambassadeurs/${id}/note`, { note }).then(r => r.data);

export const validerAmbassadeurMoral = (id: string) =>
  api.put(`/admin/ambassadeurs/${id}/valider-moral`).then(r => r.data);

// Courses
export const getCourses = () => api.get<Course[]>('/admin/courses').then(r => r.data);
export const annulerCourse = (id: number, raison: string) =>
  api.put(`/admin/courses/${id}/annuler`, { raison }).then(r => r.data);
export const assignerChauffeur = (id: number, chauffeur_id: number) =>
  api.put(`/admin/courses/${id}/assigner`, { chauffeur_id }).then(r => r.data);

// Echanges
export const getEchangesEnAttente = () => api.get<Echange[]>('/admin/echanges/en-attente').then(r => r.data);
export const validerEchange = (id: number) => api.put(`/admin/echanges/${id}/valider`).then(r => r.data);
export const refuserEchange = (id: number) => api.put(`/admin/echanges/${id}/refuser`).then(r => r.data);

// Blacklist
export const getBlacklist = () => api.get<BlacklistEntry[]>('/admin/blacklist').then(r => r.data);
export const addBlacklist = (entry: BlacklistEntry) => api.post('/admin/blacklist', entry).then(r => r.data);
export const deleteBlacklist = (id: number) => api.delete(`/admin/blacklist/${id}`).then(r => r.data);

// Propositions blacklist automatiques (5 annulations) — à confirmer manuellement (specs §9.0)
export interface BlacklistProposition {
  id: string;
  motif: string;
  nb_annulations: number;
  created_at?: string;
  prenom: string;
  nom: string;
  email?: string;
  telephone?: string;
}
export const getBlacklistPropositions = () =>
  api.get<BlacklistProposition[]>('/admin/blacklist/propositions').then(r => r.data);
export const confirmerBlacklistProposition = (id: string, motif?: string) =>
  api.put(`/admin/blacklist/propositions/${id}/confirmer`, { motif }).then(r => r.data);
export const rejeterBlacklistProposition = (id: string) =>
  api.put(`/admin/blacklist/propositions/${id}/rejeter`).then(r => r.data);

// Alertes / Sanctions
export const getSanctionsEnAttente = () => api.get<Sanction[]>('/admin/sanctions').then(r => r.data);
export const arbitrerAlerte = (id: number, payload: { action: string; points_sanction?: number; montant_indemnisation?: number }) =>
  api.post(`/admin/alertes/${id}/arbitrer`, payload).then(r => r.data);

// Litiges (specs §9.2)
export type LitigeType = 'code_invalide' | 'course_non_effectuee' | 'comportement' | 'paiement_conteste' | 'annulation_litigieuse';
export type LitigeStatut = 'ouvert' | 'en_analyse' | 'clos';
export interface Litige {
  id: string;
  type: LitigeType;
  statut: LitigeStatut;
  origine: 'manuel' | 'auto';
  description?: string | null;
  decision?: string | null;
  created_at: string;
  closed_at?: string | null;
  course_reference?: string | null;
  ambassadeur_prenom?: string | null;
  ambassadeur_nom?: string | null;
  chauffeur_prenom?: string | null;
  chauffeur_nom?: string | null;
}
export const getLitiges = (statut?: LitigeStatut) =>
  api.get<Litige[]>('/admin/litiges', { params: statut ? { statut } : undefined }).then(r => r.data);
export const creerLitige = (payload: { type: LitigeType; description?: string }) =>
  api.post<{ success: boolean }>('/admin/litiges', payload).then(r => r.data);
export const updateLitige = (id: string, statut: LitigeStatut, decision?: string) =>
  api.put<{ success: boolean }>(`/admin/litiges/${id}`, { statut, decision }).then(r => r.data);

// Tickets support (specs §3.6 / §10)
export type TicketCategorie = 'probleme_course' | 'paiement_points' | 'document_refuse' | 'question_compte' | 'autre';
export type TicketStatut = 'ouvert' | 'en_cours' | 'resolu';
export interface Ticket {
  id: string;
  categorie: TicketCategorie;
  sujet?: string | null;
  statut: TicketStatut;
  course_id?: string | null;
  course_reference?: string | null;
  created_at: string;
  updated_at: string;
  prenom: string;
  nom: string;
  email?: string;
  utilisateur_type?: 'ambassadeur' | 'chauffeur' | 'admin';
  dernier_message?: string | null;
}
export interface TicketMessage {
  id: string;
  role: 'utilisateur' | 'admin';
  contenu: string;
  created_at: string;
}
export const getTickets = (statut?: TicketStatut) =>
  api.get<Ticket[]>('/admin/support/tickets', { params: statut ? { statut } : undefined }).then(r => r.data);
export const getTicketMessages = (id: string) =>
  api.get<TicketMessage[]>(`/admin/support/tickets/${id}/messages`).then(r => r.data);
export const repondreTicket = (id: string, contenu: string) =>
  api.post<{ success: boolean }>(`/admin/support/tickets/${id}/messages`, { contenu }).then(r => r.data);
export const updateTicketStatut = (id: string, statut: TicketStatut) =>
  api.put<{ success: boolean }>(`/admin/support/tickets/${id}`, { statut }).then(r => r.data);

// Paramètres
export const getParametres = () => api.get<Parametre[]>('/admin/parametres').then(r => r.data);
export const updateParametre = (cle: string, valeur: string) =>
  api.put(`/admin/parametres/${cle}`, { valeur }).then(r => r.data);

// Commissions moraux — le backend retourne { taux_pct, mois, ambassadeurs: [...] }
// mois optionnel au format 'YYYY-MM' (défaut côté backend : mois courant).
export const getCommissionsMoraux = (mois?: string) =>
  api.get('/admin/commissions/moraux', { params: mois ? { mois } : undefined }).then(r => ({
    taux_pct: r.data?.taux_pct ?? 10,
    mois: r.data?.mois as string | undefined,
    ambassadeurs: (r.data?.ambassadeurs ?? []).map((a: any) => ({
      ...a,
      etablissement: (a.etablissement ?? null) as string | null,
      ca_brut: Number(a.ca_brut_ttc ?? 0),
      commission: Number(a.commission ?? 0),
      nb_courses: Number(a.nb_courses ?? 0),
      statut_versement: (a.statut_versement ?? null) as string | null,
      date_versement: (a.date_versement ?? null) as string | null,
    })),
  }));
export const declencherVirements = (mois?: string) =>
  api.post('/admin/commissions/declencher', mois ? { mois } : {}).then(r => r.data);

// Export SEPA des commissions Moraux d'un mois → télécharge le .xml + marque versé côté serveur.
export const exporterSepaCommissions = async (mois?: string): Promise<void> => {
  const res = await api.get('/admin/sepa/commissions', { params: mois ? { mois } : undefined, responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `commissions-moraux-${mois || 'mois'}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

// Chat
export const getChatMessages = (courseId: number) =>
  api.get<ChatMessage[]>(`/chat/${courseId}/messages`).then(r => r.data);
export const sendChatMessage = (courseId: number, contenu: string) =>
  api.post(`/chat/${courseId}/messages`, { contenu, role: 'admin' }).then(r => r.data);

export interface FournisseurRow {
  id: string;
  nom_societe: string;
  statut: string;
  contrat_signe: boolean;
  contrat_signe_at?: string | null;
  bloque: boolean;
  siret: string | null;
  iban: string | null;
  legal_prenom: string | null;
  legal_nom: string | null;
  legal_email: string | null;
  legal_telephone: string | null;
  legal_adresse: string | null;
  legal_cp: string | null;
  legal_ville: string | null;
  prest_prenom: string | null;
  prest_nom: string | null;
  prest_telephone: string | null;
  prest_email: string | null;
  prest_adresse: string | null;
  prest_cp: string | null;
  prest_ville: string | null;
  memes_coordonnees: boolean;
  option_paiement: string | null;
}

// Champs modifiables d'un fournisseur (création + édition).
export type FournisseurInput = Partial<Omit<FournisseurRow, 'id' | 'contrat_signe_at' | 'bloque'>>;

export const getFournisseurs = () =>
  api.get<FournisseurRow[]>('/admin/fournisseurs').then(r => r.data);
export const createFournisseur = (payload: FournisseurInput) =>
  api.post<{ id: string; nom_societe: string; statut: string; code_secret_temporaire: string; email_envoye: boolean }>('/admin/fournisseurs', payload).then(r => r.data);
export const updateFournisseur = (id: string, payload: FournisseurInput) =>
  api.put<{ success: boolean }>(`/admin/fournisseurs/${id}`, payload).then(r => r.data);
export const envoyerContratFournisseur = (id: string) =>
  api.post<{ success: boolean; message?: string }>(`/admin/fournisseurs/${id}/envoyer-contrat`).then(r => r.data);
// Annule le contrat (specs §6.1) → repasse à non signé, reblocage de la boutique.
export const annulerContratFournisseur = (id: string) =>
  api.post<{ success: boolean }>(`/admin/fournisseurs/${id}/annuler-contrat`).then(r => r.data);
// Régénère le code secret 4 chiffres du fournisseur (specs §5.4 — fournisseur qui perd son code).
export const regenererCodeFournisseur = (id: string) =>
  api.post<{ success: boolean; code_secret_temporaire: string }>(`/admin/fournisseurs/${id}/regenerer-code`).then(r => r.data);

// Télécharge le contrat généré (PDF) → renvoie une URL blob à ouvrir / révoquer.
export const getContratPreviewUrl = (id: string) =>
  api.get(`/admin/fournisseurs/${id}/contrat-preview`, { responseType: 'blob' })
    .then(r => URL.createObjectURL(r.data as Blob));

// ─── Offres boutique d'un fournisseur (specs §6.3) ────────────────────────────
export interface OffreRow {
  id: string;
  reference: string;
  nom: string;
  description: string | null;
  stock: number | null;          // null = illimité
  pts_requis: number;
  tarif_fournisseur_ht: number | string | null;
  validite_bon_mois: number;
  statut: 'en_ligne' | 'hors_ligne';
}

export type OffreInput = {
  nom: string;
  description?: string | null;
  stock?: number | null;
  pts_requis: number;
  tarif_fournisseur_ht?: number | null;
  validite_bon_mois: number;
  statut: 'en_ligne' | 'hors_ligne';
};

export const getOffres = (fournisseurId: string) =>
  api.get<OffreRow[]>(`/admin/fournisseurs/${fournisseurId}/offres`).then(r => r.data);
export const createOffre = (fournisseurId: string, payload: OffreInput) =>
  api.post<OffreRow>(`/admin/fournisseurs/${fournisseurId}/offres`, payload).then(r => r.data);
export const updateOffre = (id: string, payload: OffreInput) =>
  api.put<OffreRow>(`/admin/offres/${id}`, payload).then(r => r.data);
export const deleteOffre = (id: string) =>
  api.delete<{ success: boolean }>(`/admin/offres/${id}`).then(r => r.data);

// ─── Historique des paiements fournisseur (specs §6.1) ────────────────────────
export interface PaiementRow {
  id: string;
  montant_ht: number | string | null;
  option_paiement: string | null;
  fait_generateur_at: string;
  echeance_at: string | null;
  statut: 'en_attente' | 'paye';
  paye_at: string | null;
  bon_reference: string | null;
  utilise_at: string | null;
  offre_nom: string | null;
  amb_prenom: string | null;
  amb_nom: string | null;
}

export interface PaiementsKpis {
  paye_ce_mois: number;
  en_attente: number;
  bons_valides: number;
  prix_moyen: number;
}

export const getPaiementsFournisseur = (fournisseurId: string) =>
  api.get<{ kpis: PaiementsKpis; transactions: PaiementRow[] }>(`/admin/fournisseurs/${fournisseurId}/paiements`).then(r => r.data);
// id = identifiant du bon (échange) ; le règlement est porté par echanges.paiement_paye_at.
export const marquerPaiementPaye = (id: string) =>
  api.put<{ success: boolean }>(`/admin/echanges/${id}/payer-fournisseur`).then(r => r.data);

// Export SEPA de tous les virements fournisseurs en attente → déclenche le téléchargement
// du fichier .xml. Les bons exportés sont marqués réglés côté serveur.
export const exporterSepaFournisseurs = async (): Promise<void> => {
  const res = await api.get('/admin/sepa/fournisseurs', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `virements-fournisseurs-${new Date().toISOString().slice(0, 10)}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};

export default api;
