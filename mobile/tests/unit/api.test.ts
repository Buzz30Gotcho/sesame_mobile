import {
    api,
    setAuthToken,
    getWsUrl,
    createCourse,
    estimerCourse,
    BACKEND_URL,
} from '../../src/services/api';

// Client API mobile : gestion du token, URL WebSocket, sélection d'endpoint, et
// rafraîchissement AUTOMATIQUE du JWT par l'intercepteur axios. On mocke l'adaptateur
// axios pour ne dépendre d'aucun serveur.

// Construit un JWT minimal (header.payload.signature) avec une expiration donnée.
function b64url(obj: object): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function makeJwt(expSeconds: number): string {
    return `eyJ.${b64url({ sub: 'u1', exp: expSeconds })}.sig`;
}

// Adaptateur axios mocké : enregistre les requêtes et renvoie des réponses canned.
let calls: { url?: string; data?: any }[] = [];
let freshToken: string;

beforeEach(() => {
    calls = [];
    freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
    api.defaults.adapter = async (config) => {
        calls.push({ url: config.url, data: config.data });
        const body = config.url?.includes('/auth/refresh') ? { token: freshToken } : { ok: true };
        return { data: body, status: 200, statusText: 'OK', headers: {}, config } as any;
    };
    setAuthToken(null);
});

describe('setAuthToken', () => {
    it('positionne puis retire l\'en-tête Authorization', () => {
        setAuthToken('abc');
        expect(api.defaults.headers.common.Authorization).toBe('Bearer abc');
        setAuthToken(null);
        expect(api.defaults.headers.common.Authorization).toBeUndefined();
    });
});

describe('getWsUrl', () => {
    it('construit l\'URL ws avec le token en query', () => {
        setAuthToken('tok123');
        const url = getWsUrl('course-9');
        expect(url.startsWith('ws')).toBe(true);
        expect(url).toContain('/ws/chat/course-9');
        expect(url).toContain('token=tok123');
    });

    it('dérive le host du BACKEND_URL', () => {
        const url = getWsUrl('c1');
        expect(url).toBe(`${BACKEND_URL.replace(/^http/, 'ws')}/ws/chat/c1?token=`);
    });
});

describe('createCourse — sélection d\'endpoint', () => {
    const base = {
        ambassadeur_id: 'a1', adresse_depart: 'A', adresse_destination: 'B',
        vehicule_type: 'berline', kilometrage: 10,
    };

    it('utilise /creer pour une course immédiate', async () => {
        await createCourse({ ...base, type_course: 'immediate' });
        expect(calls.at(-1)!.url).toBe('/api/courses/creer');
    });

    it('utilise /reserver pour une réservation', async () => {
        await createCourse({ ...base, type_course: 'reservation', date_reservation: '2030-01-01' });
        expect(calls.at(-1)!.url).toBe('/api/courses/reserver');
    });
});

describe('estimerCourse', () => {
    it('retourne directement le corps de la réponse', async () => {
        freshToken = makeJwt(Math.floor(Date.now() / 1000) + 3600);
        api.defaults.adapter = async (config) => ({
            data: { kilometrage: 10, prix_berline: 20, prix_van: 24 },
            status: 200, statusText: 'OK', headers: {}, config,
        } as any);
        const r = await estimerCourse('A', 'B');
        expect(r).toEqual({ kilometrage: 10, prix_berline: 20, prix_van: 24 });
    });
});

describe('Rafraîchissement automatique du token (intercepteur)', () => {
    it('rafraîchit un token quasi expiré avant la requête', async () => {
        setAuthToken(makeJwt(Math.floor(Date.now() / 1000) + 10)); // expire dans 10s (< 60s)
        await api.get('/api/ambassadeurs/a1/profile');
        // Un appel /auth/refresh a été émis et le token courant est le nouveau
        expect(calls.some(c => c.url?.includes('/auth/refresh'))).toBe(true);
        expect(api.defaults.headers.common.Authorization).toBe(`Bearer ${freshToken}`);
    });

    it('ne rafraîchit pas un token encore valide', async () => {
        setAuthToken(makeJwt(Math.floor(Date.now() / 1000) + 3600)); // valide 1h
        await api.get('/api/ambassadeurs/a1/profile');
        expect(calls.some(c => c.url?.includes('/auth/refresh'))).toBe(false);
    });
});
