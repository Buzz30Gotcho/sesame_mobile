import axios from 'axios';
import Constants from 'expo-constants';
import type {
    AmbassadorDashboard,
    AmbassadorProfile,
    BoutiqueOffer,
    ExchangeBon,
    ChauffeurDashboard,
    ChauffeurProfile,
    CourseRow,
    UserRole,
    ChatMessage,
    ChauffeurDocument,
    Filleul,
    EquipeEmployee,
    CommissionMois,
} from '../types';

const manifest: any = (Constants.expoConfig ?? Constants.manifest) || {};
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? manifest.extra?.BACKEND_URL ?? 'http://localhost:4000';

export const api = axios.create({
    baseURL: BACKEND_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
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

export async function getChauffeurBillingPortal(chauffeurId: string) {
    return api.get<{ url: string }>(`/api/chauffeurs/${chauffeurId}/billing-portal`);
}

export async function demanderResetMotDePasse(telephone: string) {
    return api.post('/api/auth/mot-de-passe-oublie', { telephone });
}

export async function reinitialiserMotDePasse(telephone: string, code: string, nouveau_mot_de_passe: string) {
    return api.post('/api/auth/reinitialiser-mot-de-passe', { telephone, code, nouveau_mot_de_passe });
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
export async function getAdminParameters() {
    return api.get<{ cle: string; valeur: string }[]>('/api/admin/parametres');
}

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

export async function cancelCourse(courseId: string) {
    return api.put(`/api/courses/${courseId}/annuler`, { raison: 'ambassadeur' });
}

export async function getCoursesHistory(ambassadorId: string) {
    return api.get('/api/courses/historique', { params: { ambassadeur_id: ambassadorId } });
}

// Chauffeur
export async function getChauffeurDashboard(chauffeurId: string) {
    return api.get<ChauffeurDashboard>(`/api/chauffeurs/${chauffeurId}/dashboard`);
}

export async function getChauffeurProfile(chauffeurId: string) {
    return api.get<ChauffeurProfile>(`/api/chauffeurs/${chauffeurId}/profile`);
}

export async function updateChauffeurProfile(chauffeurId: string, data: { prenom?: string; nom?: string; telephone?: string; iban?: string; siret?: string }) {
    return api.put(`/api/chauffeurs/${chauffeurId}/profile`, data);
}

export async function setChauffeurAvailability(chauffeurId: string, disponible: boolean) {
    return api.put(`/api/chauffeurs/${chauffeurId}/availability`, { disponible });
}

export async function getChauffeurCourses(chauffeurId: string) {
    return api.get<CourseRow[]>(`/api/chauffeurs/${chauffeurId}/courses`);
}

export async function getCoursesDisponibles(chauffeurId: string) {
    return api.get(`/api/chauffeurs/${chauffeurId}/courses-disponibles`);
}

export async function acceptChauffeurCourse(chauffeurId: string, courseId: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/accept-course`, { course_id: courseId });
}

export async function signalerClientAbsent(chauffeurId: string, courseId: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/client-absent`, { course_id: courseId });
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

export async function uploadChauffeurDocument(
    chauffeurId: string,
    docType: string,
    side: 'recto' | 'verso',
    fileUri: string,
): Promise<ChauffeurDocument> {
    const mimeType = fileUri.endsWith('.pdf') ? 'application/pdf'
        : fileUri.endsWith('.png') ? 'image/png'
        : 'image/jpeg';
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';

    const formData = new FormData();
    formData.append('file', { uri: fileUri, type: mimeType, name: `${docType}_${side}.${ext}` } as any);
    formData.append('type', docType);
    formData.append('side', side);

    const token = api.defaults.headers.common['Authorization'];
    const baseURL = api.defaults.baseURL;
    const res = await fetch(`${baseURL}/api/chauffeurs/${chauffeurId}/documents/upload`, {
        method: 'POST',
        headers: {
            'Authorization': String(token),
            'Content-Type': 'multipart/form-data',
        },
        body: formData,
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur upload');
    }
    return res.json();
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
