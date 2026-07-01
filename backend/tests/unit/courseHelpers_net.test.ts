import {
    geocodeAddress,
    distanceRoutiereKm,
    etaChauffeurVersAdresse,
} from '../../src/lib/courseHelpers';

// Branches réseau (erreurs, cache, repli) des helpers géo/ETA.
// setupAfterEnv installe un fetch mocké déterministe en beforeEach ; ici on le
// surcharge ponctuellement pour simuler pannes / réponses dégradées.

describe('geocodeAddress — cas dégradés', () => {
    it('renvoie null si la BAN ne renvoie aucune feature', async () => {
        (global as any).fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ features: [] }) }));
        expect(await geocodeAddress('Adresse introuvable BAN xyz')).toBeNull();
    });

    it('renvoie null si fetch lève (réseau HS)', async () => {
        (global as any).fetch = jest.fn(async () => { throw new Error('network down'); });
        expect(await geocodeAddress('Adresse reseau HS abc')).toBeNull();
    });

    it('met en cache : deux appels identiques → un seul fetch', async () => {
        const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ features: [{ geometry: { coordinates: [1.1, 2.2] } }] }) }));
        (global as any).fetch = fetchMock;
        const a = await geocodeAddress('Adresse cache unique 42');
        const b = await geocodeAddress('Adresse cache unique 42');
        expect(a).toEqual({ lat: 2.2, lon: 1.1 });
        expect(b).toEqual(a);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});

describe('distanceRoutiereKm — cas dégradés', () => {
    it("renvoie null si OSRM ne renvoie pas de route (code != Ok)", async () => {
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            return { ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) };
        });
        expect(await distanceRoutiereKm('Dep NoRoute 1', 'Arr NoRoute 1')).toBeNull();
    });

    it('renvoie null si OSRM lève', async () => {
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            throw new Error('osrm down');
        });
        expect(await distanceRoutiereKm('Dep osrm hs 1', 'Arr osrm hs 1')).toBeNull();
    });

    it('renvoie null si une adresse ne géocode pas', async () => {
        (global as any).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ features: [] }) }));
        expect(await distanceRoutiereKm('Dep sansgeo', 'Arr sansgeo')).toBeNull();
    });

    it('met le kilométrage en cache (un seul aller-retour réseau)', async () => {
        const fetchMock = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            return { ok: true, json: async () => ({ code: 'Ok', routes: [{ distance: 8200 }] }) };
        });
        (global as any).fetch = fetchMock;
        const km1 = await distanceRoutiereKm('Dep cache km 7', 'Arr cache km 7');
        const callsAfterFirst = fetchMock.mock.calls.length;
        const km2 = await distanceRoutiereKm('Dep cache km 7', 'Arr cache km 7');
        expect(km1).toBe(8); // 8200 m → arrondi à 8 km
        expect(km2).toBe(8);
        expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // pas de nouvel appel
    });
});

describe('etaChauffeurVersAdresse — repli & cache', () => {
    it('renvoie null si coordonnées non finies', async () => {
        expect(await etaChauffeurVersAdresse(NaN, 2.35, 'Adresse eta nan')).toBeNull();
    });

    it("repli OSRM quand TomTom n'a pas de clé", async () => {
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            return { ok: true, json: async () => ({ code: 'Ok', routes: [{ duration: 600 }] }) };
        });
        expect(await etaChauffeurVersAdresse(48.80, 2.30, 'Adresse eta osrm repli')).toBe(10); // 600 s → 10 min
    });

    it('renvoie null si OSRM répond sans route', async () => {
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            return { ok: true, json: async () => ({ code: 'NoRoute', routes: [] }) };
        });
        expect(await etaChauffeurVersAdresse(48.81, 2.31, 'Adresse eta sans route')).toBeNull();
    });

    it('renvoie null si le repli OSRM lève (catch)', async () => {
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            throw new Error('osrm eta down');
        });
        expect(await etaChauffeurVersAdresse(48.83, 2.33, 'Adresse eta osrm throw')).toBeNull();
    });

    it('sert le cache pendant le TTL (pas de second appel)', async () => {
        const fetchMock = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            return { ok: true, json: async () => ({ code: 'Ok', routes: [{ duration: 300 }] }) };
        });
        (global as any).fetch = fetchMock;
        const e1 = await etaChauffeurVersAdresse(48.82, 2.32, 'Adresse eta cache ttl');
        const nbAppels = fetchMock.mock.calls.length;
        const e2 = await etaChauffeurVersAdresse(48.82, 2.32, 'Adresse eta cache ttl');
        expect(e1).toBe(5);
        expect(e2).toBe(5);
        expect(fetchMock.mock.calls.length).toBe(nbAppels);
    });
});

describe('etaChauffeurVersAdresse — chemin TomTom (clé configurée)', () => {
    const OLD = process.env.TOMTOM_API_KEY;
    afterEach(() => { process.env.TOMTOM_API_KEY = OLD; });

    it('utilise TomTom (trafic) en priorité quand une clé est présente', async () => {
        jest.resetModules();
        process.env.TOMTOM_API_KEY = 'tt_key_test';
        const fetchMock = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, status: 200, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            if (url.includes('api.tomtom.com')) return { ok: true, status: 200, json: async () => ({ routes: [{ summary: { travelTimeInSeconds: 480 } }] }) };
            return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ duration: 999 }] }) };
        });
        (global as any).fetch = fetchMock;
        // Réimport isolé pour relire TOMTOM_API_KEY au chargement du module.
        const mod = require('../../src/lib/courseHelpers');
        const eta = await mod.etaChauffeurVersAdresse(48.90, 2.40, 'Adresse tomtom trafic unique');
        expect(eta).toBe(8); // 480 s → 8 min (TomTom, pas OSRM)
        expect(fetchMock.mock.calls.some((c: any[]) => String(c[0]).includes('api.tomtom.com'))).toBe(true);
    });

    it('replie sur OSRM si TomTom lève (catch)', async () => {
        jest.resetModules();
        process.env.TOMTOM_API_KEY = 'tt_key_test';
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, status: 200, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            if (url.includes('api.tomtom.com')) throw new Error('tomtom down');
            return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ duration: 360 }] }) };
        });
        const mod = require('../../src/lib/courseHelpers');
        const eta = await mod.etaChauffeurVersAdresse(48.92, 2.42, 'Adresse tomtom throw repli osrm');
        expect(eta).toBe(6); // repli OSRM : 360 s → 6 min
    });

    it('replie sur OSRM si TomTom renvoie une réponse HTTP non-ok', async () => {
        jest.resetModules();
        process.env.TOMTOM_API_KEY = 'tt_key_test';
        (global as any).fetch = jest.fn(async (input: any) => {
            const url = String(input);
            if (url.includes('api-adresse')) return { ok: true, status: 200, json: async () => ({ features: [{ geometry: { coordinates: [2.35, 48.85] } }] }) };
            if (url.includes('api.tomtom.com')) return { ok: false, status: 500, json: async () => ({}) };
            return { ok: true, status: 200, json: async () => ({ code: 'Ok', routes: [{ duration: 720 }] }) };
        });
        const mod = require('../../src/lib/courseHelpers');
        const eta = await mod.etaChauffeurVersAdresse(48.91, 2.41, 'Adresse tomtom ko repli osrm');
        expect(eta).toBe(12); // repli OSRM : 720 s → 12 min
    });
});
