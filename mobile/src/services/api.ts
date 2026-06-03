import axios from 'axios';
import Constants from 'expo-constants';
import type {
    AmbassadorDashboard,
    AmbassadorProfile,
    BoutiqueOffer,
    ExchangeBon,
    ChauffeurDashboard,
    ChauffeurProfile,
    AdminKpis,
    AdminAmbassadorRow,
    AdminChauffeurRow,
    AdminCourseRow,
    AdminBlacklistRow,
    UserRole,
    ChatMessage,
    ChauffeurDocument,
    Filleul,
    EquipeEmployee,
    CommissionMois,
} from '../types';

const manifest: any = (Constants.expoConfig ?? Constants.manifest) || {};
const BACKEND_URL = process.env.BACKEND_URL ?? manifest.extra?.BACKEND_URL ?? 'http://localhost:4000';

export const api = axios.create({
    baseURL: BACKEND_URL,
    headers: { 'Content-Type': 'application/json' },
});

export function setAuthToken(token: string | null) {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common.Authorization;
    }
}

export function getWsUrl(courseId: string): string {
    const wsBase = BACKEND_URL.replace(/^http/, 'ws');
    return `${wsBase}/ws/chat/${courseId}`;
}

// Auth
export async function login(email: string, mot_de_passe: string) {
    return api.post('/api/auth/connexion', { email, mot_de_passe });
}

export async function register(data: {
    type: UserRole;
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    mot_de_passe: string;
}) {
    return api.post('/api/auth/inscription', data);
}

export async function refreshToken(token: string) {
    return api.post('/api/auth/refresh', {}, {
        headers: { Authorization: `Bearer ${token}` }
    });
}

// Ambassadeur
export async function getAmbassadorDashboard(ambassadorId: string) {
    return api.get<AmbassadorDashboard>(`/api/ambassadeurs/${ambassadorId}/dashboard`);
}

export async function getAmbassadorProfile(ambassadorId: string) {
    return api.get<AmbassadorProfile>(`/api/ambassadeurs/${ambassadorId}/profile`);
}

export async function updateAmbassadorProfile(ambassadorId: string, payload: Partial<AmbassadorProfile>) {
    return api.put<AmbassadorProfile>(`/api/ambassadeurs/${ambassadorId}/profile`, payload);
}

export async function getFilleuls(ambassadorId: string) {
    return api.get<Filleul[]>(`/api/ambassadeurs/${ambassadorId}/filleuls`);
}

export async function getEquipe(ambassadorId: string) {
    return api.get<EquipeEmployee[]>(`/api/ambassadeurs/${ambassadorId}/equipe`);
}

export async function addEquipeEmployee(ambassadorId: string, data: {
    prenom: string; nom: string; email: string; telephone: string; metier?: string; mot_de_passe: string;
}) {
    return api.post(`/api/ambassadeurs/${ambassadorId}/equipe`, data);
}

export async function getCommissions(ambassadorId: string) {
    return api.get<{ taux_pct: number; mois: CommissionMois[] }>(`/api/ambassadeurs/${ambassadorId}/commissions`);
}

// Boutique & échanges
export async function getOffers() {
    return api.get<BoutiqueOffer[]>('/api/boutique/offres');
}

export async function createExchange(ambassadorId: string, offerId: string) {
    return api.post('/api/echanges/creer', { ambassadeur_id: ambassadorId, offre_id: offerId });
}

export async function getBonList(ambassadorId: string) {
    return api.get<ExchangeBon[]>('/api/echanges/mes-bons', { params: { ambassadeur_id: ambassadorId } });
}

export async function getExchangeQrcode(exchangeId: string) {
    return api.get(`/api/echanges/${exchangeId}/qrcode`);
}

// Courses
export async function createCourse(data: {
    ambassadeur_id: string;
    adresse_depart: string;
    adresse_destination: string;
    vehicule_type: string;
    kilometrage: number;
    type_course: 'immediate' | 'reservation';
    date_reservation?: string;
}) {
    const endpoint = data.type_course === 'reservation' ? '/api/courses/reserver' : '/api/courses/creer';
    return api.post(endpoint, data);
}

// Chauffeur
export async function getChauffeurDashboard(chauffeurId: string) {
    return api.get<ChauffeurDashboard>(`/api/chauffeurs/${chauffeurId}/dashboard`);
}

export async function getChauffeurProfile(chauffeurId: string) {
    return api.get<ChauffeurProfile>(`/api/chauffeurs/${chauffeurId}/profile`);
}

export async function setChauffeurAvailability(chauffeurId: string, disponible: boolean) {
    return api.put(`/api/chauffeurs/${chauffeurId}/availability`, { disponible });
}

export async function getChauffeurCourses(chauffeurId: string) {
    return api.get<AdminCourseRow[]>(`/api/chauffeurs/${chauffeurId}/courses`);
}

export async function acceptChauffeurCourse(chauffeurId: string, courseId: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/accept-course`, { course_id: courseId });
}

export async function validateCourseCode(chauffeurId: string, courseId: string, code: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/validate-code`, { course_id: courseId, code });
}

export async function finishChauffeurCourse(chauffeurId: string, courseId: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/finish-course`, { course_id: courseId });
}

export async function getChauffeurDocuments(chauffeurId: string) {
    return api.get<ChauffeurDocument[]>(`/api/chauffeurs/${chauffeurId}/documents`);
}

export async function uploadChauffeurDocument(chauffeurId: string, data: {
    type: string; fichier_recto_url: string; fichier_verso_url?: string; date_expiration?: string;
}) {
    return api.post<ChauffeurDocument>(`/api/chauffeurs/${chauffeurId}/documents`, data);
}

// Admin
export async function getAdminDashboard() {
    return api.get<AdminKpis>('/api/admin/dashboard');
}

export async function getAdminAmbassadeurs() {
    return api.get<AdminAmbassadorRow[]>('/api/admin/ambassadeurs');
}

export async function getAdminChauffeurs() {
    return api.get<AdminChauffeurRow[]>('/api/admin/chauffeurs');
}

export async function updateChauffeurTaux(chauffeurId: string, taux: number | null) {
    return api.put(`/api/admin/chauffeurs/${chauffeurId}/taux`, { taux });
}

export async function getAdminCourses() {
    return api.get<AdminCourseRow[]>('/api/admin/courses');
}

export async function getAdminBlacklist() {
    return api.get<AdminBlacklistRow[]>('/api/admin/blacklist');
}

export async function addAdminBlacklist(entry: {
    nom: string;
    prenom: string;
    date_naissance: string;
    lieu_naissance: string;
    telephone: string;
    motif: string;
    type_utilisateur: 'ambassadeur' | 'chauffeur';
}) {
    return api.post('/api/admin/blacklist', entry);
}

export async function getAdminParameters() {
    return api.get<any[]>('/api/admin/parametres');
}

export async function updateAdminParameter(cle: string, valeur: string) {
    return api.put(`/api/admin/parametres/${cle}`, { valeur });
}

export async function createFournisseur(data: Record<string, any>) {
    return api.post('/api/admin/fournisseurs', data);
}

export async function updateFournisseur(id: string, data: Record<string, any>) {
    return api.put(`/api/admin/fournisseurs/${id}`, data);
}

export async function getCommissionsMoraux() {
    return api.get('/api/admin/commissions/moraux');
}

export async function declencherVirements() {
    return api.post('/api/admin/commissions/declencher');
}

// Chat
export async function getChatMessages(courseId: string) {
    return api.get<ChatMessage[]>(`/api/chat/${courseId}/messages`);
}

export async function sendChatMessage(courseId: string, data: {
    expediteur_type: string; expediteur_id: string; contenu: string;
}) {
    return api.post<ChatMessage>(`/api/chat/${courseId}/messages`, data);
}

// Fournisseur
export async function validateFournisseurBon(data: { token_qr: string; code_secret: string; }) {
    return api.post('/api/fournisseurs/valider-bon', data);
}
