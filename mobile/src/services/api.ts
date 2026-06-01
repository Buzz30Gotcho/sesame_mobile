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
} from '../types';

const manifest: any = (Constants.expoConfig ?? Constants.manifest) || {};
const BACKEND_URL = process.env.BACKEND_URL ?? manifest.extra?.BACKEND_URL ?? 'http://localhost:4000';

export const api = axios.create({
    baseURL: BACKEND_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export function setAuthToken(token: string | null) {
    if (token) {
        api.defaults.headers.common.Authorization = `Bearer ${token}`;
    } else {
        delete api.defaults.headers.common.Authorization;
    }
}

export async function login(email: string, mot_de_passe: string) {
    return api.post('/api/auth/connexion', { email, mot_de_passe });
}

export async function getAmbassadorDashboard(ambassadorId: string) {
    return api.get<AmbassadorDashboard>(`/api/ambassadeurs/${ambassadorId}/dashboard`);
}

export async function getAmbassadorProfile(ambassadorId: string) {
    return api.get<AmbassadorProfile>(`/api/ambassadeurs/${ambassadorId}/profile`);
}

export async function updateAmbassadorProfile(ambassadorId: string, payload: Partial<AmbassadorProfile>) {
    return api.put<AmbassadorProfile>(`/api/ambassadeurs/${ambassadorId}/profile`, payload);
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

export async function createCourse(data: {
    ambassadeur_id: string;
    adresse_depart: string;
    adresse_destination: string;
    vehicule_type: string;
    kilometrage: number;
    type: 'immediate' | 'reservation';
    date_reservation?: string;
}) {
    const endpoint = data.type === 'reservation' ? '/api/courses/reserver' : '/api/courses/creer';
    return api.post(endpoint, data);
}

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

export async function getAdminDashboard() {
    return api.get<AdminKpis>('/api/admin/dashboard');
}

export async function getAdminAmbassadeurs() {
    return api.get<AdminAmbassadorRow[]>('/api/admin/ambassadeurs');
}

export async function getAdminChauffeurs() {
    return api.get<AdminChauffeurRow[]>('/api/admin/chauffeurs');
}

export async function getAdminCourses() {
    return api.get<AdminCourseRow[]>('/api/admin/courses');
}

export async function getAdminBlacklist() {
    return api.get<AdminBlacklistRow[]>('/api/admin/blacklist');
}

export async function getAdminParameters() {
    return api.get<any[]>('/api/admin/parametres');
}

export async function updateAdminParameter(cle: string, valeur: string) {
    return api.put(`/api/admin/parametres/${cle}`, { valeur });
}

export async function addAdminBlacklist(entry: {
    nom_prenom: string;
    date_naissance: string;
    lieu_naissance: string;
    telephone: string;
    motif: string;
    type_utilisateur: 'ambassadeur' | 'chauffeur';
}) {
    return api.post('/api/admin/blacklist', entry);
}
