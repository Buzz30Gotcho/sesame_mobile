import axios from 'axios';

const BASE_URL = 'http://localhost:4001/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

// Types
export interface DashboardStats {
  totalCourses: number;
  totalAmbassadeurs: number;
  totalChauffeurs: number;
  pendingExchanges: number;
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
  prenom: string;
  nom: string;
  type: 'physique' | 'moral';
  niveau?: string;
  points?: number;
  commission?: number;
  telephone?: string;
  statut?: string;
  societe?: string;
}

export interface Chauffeur {
  id: number;
  prenom: string;
  nom: string;
  vehicule?: string;
  disponible?: boolean;
  taux_commission?: number;
  documents_complets?: boolean;
  telephone?: string;
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
export const getChauffeurDocuments = (id: number) => api.get(`/chauffeurs/${id}/documents`).then(r => r.data);
export const updateChauffeurTaux = (id: number, taux: number) =>
  api.put(`/admin/chauffeurs/${id}/taux`, { taux }).then(r => r.data);

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

// Alertes / Sanctions
export const getSanctionsEnAttente = () => api.get<Sanction[]>('/admin/sanctions').then(r => r.data);
export const arbitrerAlerte = (id: number, payload: { action: string; points_sanction?: number; montant_indemnisation?: number }) =>
  api.post(`/admin/alertes/${id}/arbitrer`, payload).then(r => r.data);

// Paramètres
export const getParametres = () => api.get<Parametre[]>('/admin/parametres').then(r => r.data);
export const updateParametre = (cle: string, valeur: string) =>
  api.put(`/admin/parametres/${cle}`, { valeur }).then(r => r.data);

// Commissions moraux — le backend retourne { taux_pct, ambassadeurs: [...] }
export const getCommissionsMoraux = () =>
  api.get('/admin/commissions/moraux').then(r => ({
    taux_pct: r.data?.taux_pct ?? 10,
    ambassadeurs: (r.data?.ambassadeurs ?? []).map((a: any) => ({
      ...a,
      ca_brut: Number(a.ca_brut_ttc ?? 0),
      commission: Number(a.commission ?? 0),
      nb_courses: Number(a.nb_courses ?? 0),
    })),
  }));
export const declencherVirements = () => api.post('/admin/commissions/declencher').then(r => r.data);

// Chat
export const getChatMessages = (courseId: number) =>
  api.get<ChatMessage[]>(`/chat/${courseId}/messages`).then(r => r.data);
export const sendChatMessage = (courseId: number, contenu: string) =>
  api.post(`/chat/${courseId}/messages`, { contenu, role: 'admin' }).then(r => r.data);

export default api;
