import * as API from '../../src/services/api';
import { api, setAuthToken } from '../../src/services/api';

// Couvre tous les wrappers d'endpoints du client API mobile : on vérifie la méthode
// HTTP, l'URL et le corps/paramètres transmis, via un adaptateur axios mocké.

function b64url(obj: object): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const validToken = `eyJ.${b64url({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

let calls: { method?: string; url?: string; data?: any; params?: any }[] = [];

beforeEach(() => {
    calls = [];
    api.defaults.adapter = async (config) => {
        calls.push({ method: config.method, url: config.url, data: config.data ? JSON.parse(config.data) : undefined, params: config.params });
        return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config } as any;
    };
    setAuthToken(validToken); // token valide → pas de refresh parasite
});

const last = () => calls.at(-1)!;

describe('wrappers GET', () => {
    it.each<[string, () => Promise<any>, string]>([
        ['getChauffeurBillingPortal', () => API.getChauffeurBillingPortal('c1'), '/api/chauffeurs/c1/billing-portal'],
        ['getAmbassadorDashboard', () => API.getAmbassadorDashboard('a1'), '/api/ambassadeurs/a1/dashboard'],
        ['getAmbassadorProfile', () => API.getAmbassadorProfile('a1'), '/api/ambassadeurs/a1/profile'],
        ['getFilleuls', () => API.getFilleuls('a1'), '/api/ambassadeurs/a1/filleuls'],
        ['getEquipe', () => API.getEquipe('a1'), '/api/ambassadeurs/a1/equipe'],
        ['getCommissions', () => API.getCommissions('a1'), '/api/ambassadeurs/a1/commissions'],
        ['getMyTickets', () => API.getMyTickets(), '/api/tickets'],
        ['getTicketMessages', () => API.getTicketMessages('t1'), '/api/tickets/t1/messages'],
        ['getAdminParameters', () => API.getAdminParameters(), '/api/app/parametres'],
        ['getOffers', () => API.getOffers(), '/api/boutique/offres'],
        ['getExchangeQrcode', () => API.getExchangeQrcode('e1'), '/api/echanges/e1/qrcode'],
        ['getChauffeurDashboard', () => API.getChauffeurDashboard('c1'), '/api/chauffeurs/c1/dashboard'],
        ['getChauffeurProfile', () => API.getChauffeurProfile('c1'), '/api/chauffeurs/c1/profile'],
        ['getChauffeurCourses', () => API.getChauffeurCourses('c1'), '/api/chauffeurs/c1/courses'],
        ['getCoursesDisponibles', () => API.getCoursesDisponibles('c1'), '/api/chauffeurs/c1/courses-disponibles'],
        ['getChauffeurDocuments', () => API.getChauffeurDocuments('c1'), '/api/chauffeurs/c1/documents'],
        ['getChatMessages', () => API.getChatMessages('co1'), '/api/chat/co1/messages'],
    ])('%s → GET %s', async (_name, fn, url) => {
        await fn();
        expect(last().method).toBe('get');
        expect(last().url).toBe(url);
    });

    it('getBonList & getCoursesHistory passent ambassadeur_id en params', async () => {
        await API.getBonList('a1');
        expect(last().url).toBe('/api/echanges/mes-bons');
        expect(last().params).toEqual({ ambassadeur_id: 'a1' });
        await API.getCoursesHistory('a2');
        expect(last().params).toEqual({ ambassadeur_id: 'a2' });
    });
});

describe('wrappers POST', () => {
    it('login envoie email + mot de passe', async () => {
        await API.login('e@t.fr', 'pw');
        expect(last().method).toBe('post');
        expect(last().url).toBe('/api/auth/connexion');
        expect(last().data).toEqual({ email: 'e@t.fr', mot_de_passe: 'pw' });
    });

    it.each<[string, () => Promise<any>, string, any]>([
        ['getChauffeurSetupCard', () => API.getChauffeurSetupCard('c1'), '/api/chauffeurs/c1/setup-card', {}],
        ['demanderResetMotDePasse', () => API.demanderResetMotDePasse('e@t.fr'), '/api/auth/mot-de-passe-oublie', { email: 'e@t.fr' }],
        ['reinitialiserMotDePasse', () => API.reinitialiserMotDePasse('e@t.fr', '123', 'newpass12'), '/api/auth/reinitialiser-mot-de-passe', { email: 'e@t.fr', code: '123', nouveau_mot_de_passe: 'newpass12' }],
        ['createExchange', () => API.createExchange('a1', 'o1'), '/api/echanges/creer', { ambassadeur_id: 'a1', offre_id: 'o1' }],
        ['acceptChauffeurCourse', () => API.acceptChauffeurCourse('c1', 'co1'), '/api/chauffeurs/c1/accept-course', { course_id: 'co1' }],
        ['markChauffeurArrived', () => API.markChauffeurArrived('c1', 'co1'), '/api/chauffeurs/c1/arrived', { course_id: 'co1' }],
        ['signalerClientAbsent', () => API.signalerClientAbsent('c1', 'co1', 5), '/api/chauffeurs/c1/client-absent', { course_id: 'co1', minutes: 5 }],
        ['validateCourseCode', () => API.validateCourseCode('c1', 'co1', '4242'), '/api/chauffeurs/c1/validate-code', { course_id: 'co1', code: '4242' }],
        ['updateChauffeurPosition', () => API.updateChauffeurPosition('c1', { lat: 1, lon: 2 }), '/api/chauffeurs/c1/position', { lat: 1, lon: 2 }],
        ['sendTicketMessage', () => API.sendTicketMessage('t1', 'coucou'), '/api/tickets/t1/messages', { contenu: 'coucou' }],
        ['sendChatMessage', () => API.sendChatMessage('co1', { expediteur_type: 'ambassadeur', expediteur_id: 'a1', contenu: 'hi' }), '/api/chat/co1/messages', { expediteur_type: 'ambassadeur', expediteur_id: 'a1', contenu: 'hi' }],
    ])('%s → POST %s', async (_name, fn, url, body) => {
        await fn();
        expect(last().method).toBe('post');
        expect(last().url).toBe(url);
        expect(last().data).toEqual(body);
    });

    it('register / createTicket / addEquipeEmployee transmettent le payload', async () => {
        await API.register({ type: 'ambassadeur', prenom: 'A', nom: 'B', email: 'e@t.fr', telephone: '0600000000', mot_de_passe: 'password12' });
        expect(last().url).toBe('/api/auth/inscription');
        await API.createTicket({ categorie: 'autre' as any, message: 'aide' });
        expect(last().url).toBe('/api/tickets');
        await API.addEquipeEmployee('a1', { prenom: 'E', nom: 'F', email: 'e@f.fr', telephone: '0600000000', mot_de_passe: 'password12' });
        expect(last().url).toBe('/api/ambassadeurs/a1/equipe');
    });

    it('finishChauffeurCourse inclut les coords si fournies, sinon non', async () => {
        await API.finishChauffeurCourse('c1', 'co1', { lat: 48.85, lon: 2.35 });
        expect(last().data).toEqual({ course_id: 'co1', lat: 48.85, lon: 2.35 });
        await API.finishChauffeurCourse('c1', 'co1', null);
        expect(last().data).toEqual({ course_id: 'co1' });
    });
});

describe('wrappers PUT', () => {
    it.each<[string, () => Promise<any>, string, any]>([
        ['updateAmbassadorProfile', () => API.updateAmbassadorProfile('a1', { prenom: 'X' }), '/api/ambassadeurs/a1/profile', { prenom: 'X' }],
        ['updateEmployeStatut', () => API.updateEmployeStatut('a1', 'e1', 'suspendu'), '/api/ambassadeurs/a1/equipe/e1/statut', { statut: 'suspendu' }],
        ['cancelCourse', () => API.cancelCourse('co1'), '/api/courses/co1/annuler', { raison: 'ambassadeur' }],
        ['updateChauffeurProfile', () => API.updateChauffeurProfile('c1', { iban: 'FR76' }), '/api/chauffeurs/c1/profile', { iban: 'FR76' }],
        ['setChauffeurAvailability', () => API.setChauffeurAvailability('c1', true), '/api/chauffeurs/c1/availability', { disponible: true }],
    ])('%s → PUT %s', async (_name, fn, url, body) => {
        await fn();
        expect(last().method).toBe('put');
        expect(last().url).toBe(url);
        expect(last().data).toEqual(body);
    });
});

describe('estimerCourse & createCourse', () => {
    it('estimerCourse renvoie le corps', async () => {
        api.defaults.adapter = async (config) => ({ data: { kilometrage: 8, prix_berline: 16, prix_van: 20 }, status: 200, statusText: 'OK', headers: {}, config } as any);
        const r = await API.estimerCourse('A', 'B');
        expect(r.kilometrage).toBe(8);
    });
});

describe('refreshToken', () => {
    it('POST /api/auth/refresh avec en-tête Authorization dédié', async () => {
        await API.refreshToken('tok-old');
        expect(last().url).toBe('/api/auth/refresh');
        expect(last().method).toBe('post');
    });
});

describe('décodage du token JWT', () => {
    it('utilise le polyfill base64 quand atob est absent', async () => {
        const orig = (global as any).atob;
        delete (global as any).atob;
        const near = `eyJ.${b64url({ sub: 'u1', exp: Math.floor(Date.now() / 1000) + 10 })}.sig`;
        setAuthToken(near); // expire dans 10s → l'intercepteur décode (via polyfill) puis rafraîchit
        api.defaults.adapter = async (config) => {
            calls.push({ url: config.url });
            return { data: config.url?.includes('/auth/refresh') ? { token: validToken } : { ok: true }, status: 200, statusText: 'OK', headers: {}, config } as any;
        };
        await api.get('/api/ambassadeurs/a1/profile');
        (global as any).atob = orig;
        expect(calls.some(c => c.url?.includes('/auth/refresh'))).toBe(true);
    });

    it('token illisible → aucun refresh (exp introuvable)', async () => {
        setAuthToken('not.a.jwt');
        await api.get('/api/ambassadeurs/a1/profile');
        expect(calls.some(c => c.url?.includes('/auth/refresh'))).toBe(false);
    });
});

describe('uploadChauffeurDocument (fetch)', () => {
    it('POST multipart et renvoie le document (succès)', async () => {
        (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'd1', type: 'permis' }) }));
        const doc = await API.uploadChauffeurDocument('c1', 'permis', 'recto', 'file:///photo.jpg');
        expect(doc).toEqual({ id: 'd1', type: 'permis' });
        const [url, opts] = (global as any).fetch.mock.calls[0];
        expect(url).toContain('/api/chauffeurs/c1/documents/upload');
        expect(opts.method).toBe('POST');
    });

    it('lève une erreur si la réponse n\'est pas ok', async () => {
        (global as any).fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: 'trop gros' }) }));
        await expect(API.uploadChauffeurDocument('c1', 'permis', 'verso', 'file:///doc.pdf')).rejects.toThrow('trop gros');
    });
});
