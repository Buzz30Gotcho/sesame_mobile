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
    Ticket,
    TicketMessage,
    TicketCategorie,
} from '../types';

const manifest: any = (Constants.expoConfig ?? Constants.manifest) || {};
export const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? manifest.extra?.BACKEND_URL ?? 'http://localhost:4001';

export const FOURNISSEUR_VALIDER_URL = `${BACKEND_URL}/valider`;

export const api = axios.create({
    baseURL: BACKEND_URL,
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
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
    // Le WebSocket ne peut pas envoyer de header : on passe le token en query string.
    const authHeader = api.defaults.headers.common.Authorization as string | undefined;
    const token = authHeader?.replace('Bearer ', '') ?? '';
    return `${wsBase}/ws/chat/${courseId}?token=${encodeURIComponent(token)}`;
}

// Auth
export async function login(email: string, mot_de_passe: string) {
    return api.post('/api/auth/connexion', { email, mot_de_passe });
}

export async function getChauffeurBillingPortal(chauffeurId: string) {
    return api.get<{ url: string }>(`/api/chauffeurs/${chauffeurId}/billing-portal`);
}

export async function getChauffeurSetupCard(chauffeurId: string) {
    return api.post<{ url: string }>(`/api/chauffeurs/${chauffeurId}/setup-card`, {});
}

export async function demanderResetMotDePasse(email: string) {
    return api.post('/api/auth/mot-de-passe-oublie', { email });
}

export async function reinitialiserMotDePasse(email: string, code: string, nouveau_mot_de_passe: string) {
    return api.post('/api/auth/reinitialiser-mot-de-passe', { email, code, nouveau_mot_de_passe });
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

// --- Rafraîchissement automatique du token ---------------------------------
// Décode le champ `exp` (expiration, secondes Unix) d'un JWT, sans dépendance externe.
function base64UrlDecode(input: string): string {
    const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
    const g: any = globalThis as any;
    if (typeof g.atob === 'function') return g.atob(base64);
    // Polyfill atob minimal (ASCII) pour les moteurs JS sans atob
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const str = base64.replace(/=+$/, '');
    let output = '';
    for (let bc = 0, bs = 0, i = 0; i < str.length; i++) {
        const idx = chars.indexOf(str.charAt(i));
        if (idx === -1) continue;
        bs = bc % 4 ? bs * 64 + idx : idx;
        if (bc++ % 4) output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
    return output;
}

function getTokenExp(token: string): number | null {
    try {
        const payload = JSON.parse(base64UrlDecode(token.split('.')[1]));
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
}

// Un seul refresh en vol à la fois (le polling déclenche plusieurs requêtes simultanées).
let refreshPromise: Promise<void> | null = null;

api.interceptors.request.use(async (config) => {
    // Ne pas intercepter l'appel de rafraîchissement lui-même (évite la boucle infinie).
    if (config.url?.includes('/auth/refresh')) return config;

    const header = api.defaults.headers.common.Authorization as string | undefined;
    if (!header) return config;

    const token = header.replace('Bearer ', '');
    const exp = getTokenExp(token);
    // Rafraîchir si le token est expiré ou expire dans moins de 60s.
    if (exp && Date.now() / 1000 >= exp - 60) {
        if (!refreshPromise) {
            refreshPromise = refreshToken(token)
                .then(r => { setAuthToken(r.data.token); })
                .catch(() => { /* token trop vieux / refresh impossible : la requête partira avec l'ancien */ })
                .finally(() => { refreshPromise = null; });
        }
        await refreshPromise;
        const newHeader = api.defaults.headers.common.Authorization as string | undefined;
        if (newHeader) {
            (config.headers as any).Authorization = newHeader;
        }
    }
    return config;
});
// ---------------------------------------------------------------------------

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

export async function updateEmployeStatut(ambassadorId: string, employeId: string, statut: 'actif' | 'suspendu') {
    return api.put(`/api/ambassadeurs/${ambassadorId}/equipe/${employeId}/statut`, { statut });
}

export async function getCommissions(ambassadorId: string) {
    return api.get<{ taux_pct: number; mois: CommissionMois[]; total_commission: number; total_ca_brut_ttc: number; total_courses: number }>(`/api/ambassadeurs/${ambassadorId}/commissions`);
}

// Tickets support (specs §3.6 / §10) — l'utilisateur est identifié par son token.
export async function getMyTickets() {
    return api.get<Ticket[]>('/api/tickets');
}
export async function createTicket(data: { categorie: TicketCategorie; sujet?: string; course_id?: string; message: string }) {
    return api.post<{ id: string }>('/api/tickets', data);
}
export async function getTicketMessages(ticketId: string) {
    return api.get<TicketMessage[]>(`/api/tickets/${ticketId}/messages`);
}
export async function sendTicketMessage(ticketId: string, contenu: string) {
    return api.post<{ success: boolean }>(`/api/tickets/${ticketId}/messages`, { contenu });
}

// Boutique & échanges
export async function getAdminParameters() {
    return api.get<Record<string, string>>('/api/app/parametres');
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

export async function estimerCourse(adresse_depart: string, adresse_destination: string) {
    const res = await api.post('/api/courses/estimer', { adresse_depart, adresse_destination });
    return res.data as { kilometrage: number; prix_berline: number; prix_van: number };
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

export async function markChauffeurArrived(chauffeurId: string, courseId: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/arrived`, { course_id: courseId });
}

export async function signalerClientAbsent(chauffeurId: string, courseId: string, minutes?: number) {
    return api.post(`/api/chauffeurs/${chauffeurId}/client-absent`, { course_id: courseId, minutes });
}

export async function validateCourseCode(chauffeurId: string, courseId: string, code: string) {
    return api.post(`/api/chauffeurs/${chauffeurId}/validate-code`, { course_id: courseId, code });
}

export async function updateChauffeurPosition(chauffeurId: string, coords: { lat: number; lon: number }) {
    return api.post(`/api/chauffeurs/${chauffeurId}/position`, { lat: coords.lat, lon: coords.lon });
}

export async function finishChauffeurCourse(
    chauffeurId: string,
    courseId: string,
    coords?: { lat: number; lon: number } | null
) {
    return api.post(`/api/chauffeurs/${chauffeurId}/finish-course`, {
        course_id: courseId,
        ...(coords ? { lat: coords.lat, lon: coords.lon } : {}),
    });
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
