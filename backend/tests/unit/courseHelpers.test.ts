import {
    haversineMeters,
    verifierGeofenceDestination,
    distanceRoutiereKm,
    etaChauffeurVersAdresse,
    GEOFENCE_RADIUS_M,
} from '../../src/lib/courseHelpers';

// Helpers géo / tarif / ETA. Le réseau (BAN, OSRM, TomTom) est mocké dans setupAfterEnv :
// toute adresse géocode à Paris (48.8566, 2.3522), toute route = 10 km / 15 min.

describe('haversineMeters', () => {
    it('renvoie 0 pour deux points identiques', () => {
        expect(haversineMeters(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0);
    });

    it('approxime correctement Paris → Lyon (~392 km)', () => {
        const d = haversineMeters(48.8566, 2.3522, 45.764, 4.8357);
        expect(d).toBeGreaterThan(380_000);
        expect(d).toBeLessThan(400_000);
    });
});

describe('verifierGeofenceDestination (verrou 300 m)', () => {
    it('autorise quand le chauffeur est sur la destination', async () => {
        const r = await verifierGeofenceDestination('1 rue de Paris', 48.8566, 2.3522);
        expect(r.ok).toBe(true);
    });

    it('bloque quand le chauffeur est loin de la destination', async () => {
        // ~5 km de Paris → au-delà du rayon + tolérance
        const r = await verifierGeofenceDestination('1 rue de Paris', 48.9, 2.35);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.distance).toBeGreaterThan(GEOFENCE_RADIUS_M);
    });

    it('mode dégradé : pas de position GPS → autorise (fail-open)', async () => {
        const r = await verifierGeofenceDestination('1 rue de Paris', undefined, undefined);
        expect(r.ok).toBe(true);
    });

    it('mode dégradé : pas d\'adresse → autorise', async () => {
        const r = await verifierGeofenceDestination(null, 48.8566, 2.3522);
        expect(r.ok).toBe(true);
    });
});

describe('distanceRoutiereKm', () => {
    it('renvoie le kilométrage routier (OSRM mocké = 10 km)', async () => {
        const km = await distanceRoutiereKm('Adresse depart unique 1', 'Adresse arrivee unique 1');
        expect(km).toBe(10);
    });

    it('renvoie null si une adresse manque', async () => {
        expect(await distanceRoutiereKm(null, 'B')).toBeNull();
    });
});

describe('etaChauffeurVersAdresse', () => {
    it('renvoie une ETA en minutes (15 min mockées)', async () => {
        const eta = await etaChauffeurVersAdresse(48.85, 2.35, 'Destination ETA unique');
        expect(eta).toBe(15);
    });

    it('renvoie null sans adresse', async () => {
        expect(await etaChauffeurVersAdresse(48.85, 2.35, null)).toBeNull();
    });
});
