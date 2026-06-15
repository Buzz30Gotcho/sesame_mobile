import { query } from '../db';
import { nextAmbassadorLevel } from './rules';
import { sendPushNotification } from './pushNotifications';

// ─── Géofencing « Terminer course » (specs §7.2 + §4.2) ───────────────────────
// Le bouton Terminer n'est actif qu'à 300 m de la destination. Vérification CÔTÉ
// SERVEUR : le chauffeur transmet sa position, le serveur géocode la destination
// (Base Adresse Nationale, même source que l'app) et compare la distance.
export const GEOFENCE_RADIUS_M = 300;
// Marge pour l'imprécision GPS + le géocodage : on ne bloque pas un chauffeur
// réellement sur place pour quelques mètres d'écart.
const GEOFENCE_TOLERANCE_M = 100;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // rayon terrestre en mètres
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

// Géocodage serveur via la Base Adresse Nationale (même source que l'app mobile).
// Cache mémoire : une adresse géocode toujours pareil, inutile de rappeler la BAN.
const geocodeCache = new Map<string, { lat: number; lon: number }>();
export async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
    const key = address.trim().toLowerCase();
    const cached = geocodeCache.get(key);
    if (cached) return cached;
    try {
        const url = `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}&limit=1`;
        const res = await fetch(url);
        const data = (await res.json()) as { features?: { geometry: { coordinates: [number, number] } }[] };
        const feat = data.features?.[0];
        if (!feat) return null;
        const [lon, lat] = feat.geometry.coordinates;
        const coords = { lat, lon };
        geocodeCache.set(key, coords);
        return coords;
    } catch {
        return null;
    }
}

// ─── Distance routière pour la tarification (specs §4.1) ─────────────────────
// Calculée CÔTÉ SERVEUR à partir des deux adresses : géocodage BAN puis distance
// routière OSRM. L'app n'appelle plus OSRM elle-même et ne décide plus du
// kilométrage (donc du prix) → un seul point de calcul, source de confiance.
//
// URL de base du service OSRM. Par défaut le serveur de démo public (gratuit mais
// sans garantie). En production, pointer OSRM_BASE_URL vers une instance
// auto-hébergée (ex. http://localhost:5000) pour s'affranchir des quotas/coupures.
const OSRM_BASE_URL = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');

const distanceCache = new Map<string, number>();
export async function distanceRoutiereKm(
    adresseDepart: string | null | undefined,
    adresseDestination: string | null | undefined
): Promise<number | null> {
    if (!adresseDepart || !adresseDestination) return null;
    const key = `${adresseDepart.trim().toLowerCase()}|${adresseDestination.trim().toLowerCase()}`;
    const cached = distanceCache.get(key);
    if (cached != null) return cached;

    const [from, to] = await Promise.all([
        geocodeAddress(adresseDepart),
        geocodeAddress(adresseDestination),
    ]);
    if (!from || !to) return null;

    try {
        const url = `${OSRM_BASE_URL}/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=false`;
        const res = await fetch(url);
        const data = (await res.json()) as { code?: string; routes?: { distance: number }[] };
        if (data.code !== 'Ok' || !data.routes?.length) return null;
        const km = Math.max(1, Math.round(data.routes[0].distance / 1000));
        distanceCache.set(key, km);
        return km;
    } catch {
        return null;
    }
}

// ─── ETA temps réel (specs §7.2 + §9.2) ───────────────────────────────────────
// Stratégie : TomTom (trafic temps réel) si une clé est configurée, sinon repli OSRM
// (gratuit, sans trafic). TomTom n'est utilisé QUE pour l'ETA (petit volume + cache 15 s)
// → reste très loin du quota gratuit.
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || '';

// ETA via TomTom Routing avec trafic. Renvoie null si pas de clé / erreur (→ repli OSRM).
// NB : TomTom attend les coordonnées en {lat},{lon} (OSRM les attend en {lon},{lat}).
async function getTomTomDurationMinutes(fromLat: number, fromLon: number, toLat: number, toLon: number): Promise<number | null> {
    if (!TOMTOM_API_KEY) return null;
    try {
        const url = `https://api.tomtom.com/routing/1/calculateRoute/${fromLat},${fromLon}:${toLat},${toLon}/json`
            + `?key=${TOMTOM_API_KEY}&traffic=true&travelMode=car`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = (await res.json()) as { routes?: { summary?: { travelTimeInSeconds?: number } }[] };
        const sec = data.routes?.[0]?.summary?.travelTimeInSeconds;
        if (typeof sec !== 'number') return null;
        return Math.max(1, Math.ceil(sec / 60));
    } catch {
        return null;
    }
}

// ETA via OSRM (repli gratuit, sans trafic). Renvoie null si indisponible.
async function getRouteDurationMinutes(fromLat: number, fromLon: number, toLat: number, toLon: number): Promise<number | null> {
    try {
        const url = `${OSRM_BASE_URL}/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
        const res = await fetch(url);
        const data = (await res.json()) as { code?: string; routes?: { duration: number }[] };
        if (data.code !== 'Ok' || !data.routes?.length) return null;
        return Math.max(1, Math.ceil(data.routes[0].duration / 60));
    } catch {
        return null;
    }
}

// ETA du chauffeur (position GPS) vers une adresse (ex. point de prise en charge).
// TomTom (trafic) en priorité, repli OSRM. Cache 15 s pour limiter les appels.
const etaCache = new Map<string, { eta: number | null; at: number }>();
const ETA_TTL_MS = 15000;
export async function etaChauffeurVersAdresse(
    fromLat: number,
    fromLon: number,
    adresse: string | null | undefined
): Promise<number | null> {
    if (!adresse || !Number.isFinite(fromLat) || !Number.isFinite(fromLon)) return null;
    const key = `${fromLat.toFixed(4)},${fromLon.toFixed(4)}|${adresse.trim().toLowerCase()}`;
    const cached = etaCache.get(key);
    if (cached && Date.now() - cached.at < ETA_TTL_MS) return cached.eta;

    const dest = await geocodeAddress(adresse);
    let eta: number | null = null;
    if (dest) {
        // TomTom (trafic) d'abord, sinon repli OSRM (sans trafic)
        eta = await getTomTomDurationMinutes(fromLat, fromLon, dest.lat, dest.lon);
        if (eta == null) eta = await getRouteDurationMinutes(fromLat, fromLon, dest.lat, dest.lon);
    }
    etaCache.set(key, { eta, at: Date.now() });
    return eta;
}

// Vérifie que le chauffeur est à <= 300 m de la destination.
// Mode dégradé (specs §7.2) : si la position n'est pas fournie (GPS refusé) ou si
// la destination n'est pas géocodable, on ne dispose pas de l'information → on
// n'empêche pas de terminer (fail-open), cohérent avec le comportement de l'app.
export async function verifierGeofenceDestination(
    adresseDestination: string | null | undefined,
    lat: unknown,
    lon: unknown
): Promise<{ ok: true } | { ok: false; distance: number }> {
    const latN = Number(lat);
    const lonN = Number(lon);
    if (!Number.isFinite(latN) || !Number.isFinite(lonN)) return { ok: true };
    if (!adresseDestination) return { ok: true };

    const dest = await geocodeAddress(adresseDestination);
    if (!dest) return { ok: true };

    const distance = Math.round(haversineMeters(latN, lonN, dest.lat, dest.lon));
    if (distance > GEOFENCE_RADIUS_M + GEOFENCE_TOLERANCE_M) return { ok: false, distance };
    return { ok: true };
}

// Paliers parrainage (specs §1.4) — uniquement Ambassadeur Physique
const PALIERS = [
    { key: 'palier1', bonus: 5,  check: async (filleulId: string) => {
        const r = await query(`SELECT count(*) FROM courses WHERE ambassadeur_id = $1 AND statut = 'terminee' AND code_valide_at IS NOT NULL`, [filleulId]);
        return Number(r.rows[0].count) >= 5;
    }},
    { key: 'palier2', bonus: 10, check: (_: string, niveau: string) => Promise.resolve(niveau === 'pro') },
    { key: 'palier3', bonus: 15, check: (_: string, niveau: string) => Promise.resolve(niveau === 'elite') },
    { key: 'palier4', bonus: 20, check: (_: string, niveau: string) => Promise.resolve(niveau === 'black') },
];

export async function crediterPaliersParrainage(filleulId: string, parrainId: string, _solde: number, niveau: string, courseId: string) {
    const done = await query(`SELECT cle FROM parrainage_paliers WHERE filleul_id = $1`, [filleulId]);
    const doneKeys = new Set(done.rows.map((r: any) => r.cle));

    for (const palier of PALIERS) {
        if (doneKeys.has(palier.key)) continue;
        const atteint = await palier.check(filleulId, niveau);
        if (!atteint) continue;

        const parrainResult = await query('SELECT points_solde, niveau FROM ambassadeurs WHERE id = $1', [parrainId]);
        const parrain = parrainResult.rows[0];
        if (!parrain) continue;

        const solde_avant = Number(parrain.points_solde || 0);
        const solde_apres = solde_avant + palier.bonus;
        const newLevel = nextAmbassadorLevel(solde_apres);
        await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, parrainId]);
        await query(
            'INSERT INTO points_historique(ambassadeur_id, type, montant, solde_avant, solde_apres, course_id, description) VALUES ($1,$2,$3,$4,$5,$6,$7)',
            [parrainId, 'parrainage', palier.bonus, solde_avant, solde_apres, courseId, `Bonus parrainage ${palier.key}`]
        );
        await query('INSERT INTO parrainage_paliers(filleul_id, parrain_id, cle) VALUES ($1,$2,$3)', [filleulId, parrainId, palier.key]);
    }
}

// Exécute les sanctions différées — met à jour le niveau après déduction (specs §3.3 + §3.6)
export async function executerSanctionsEnAttente(ambassadeurId: string) {
    const sanctions = await query(
        "SELECT * FROM sanctions_en_attente WHERE ambassadeur_id = $1 AND statut = 'en_attente' ORDER BY decide_at ASC",
        [ambassadeurId]
    );
    for (const sanction of sanctions.rows) {
        const current = await query('SELECT points_solde, push_token FROM ambassadeurs WHERE id = $1', [ambassadeurId]);
        const solde = Number(current.rows[0]?.points_solde || 0);
        if (solde >= sanction.points) {
            const solde_apres = solde - sanction.points;
            const newLevel = nextAmbassadorLevel(solde_apres);
            await query('UPDATE ambassadeurs SET points_solde = $1, niveau = $2 WHERE id = $3', [solde_apres, newLevel, ambassadeurId]);
            await query("UPDATE sanctions_en_attente SET statut = 'execute', execute_at = now() WHERE id = $1", [sanction.id]);
            const pushToken = current.rows[0]?.push_token;
            if (pushToken) {
                const date = new Date(sanction.decide_at).toLocaleDateString('fr-FR');
                await sendPushNotification(pushToken, `-${sanction.points} points prélevés`, `Suite à l'absence de votre client le ${date}.`).catch(() => {});
            }
        }
    }
}

// Vérifie si un doc obligatoire est expiré et suspend le chauffeur (specs §9.1)
export async function checkAndSuspendExpiredDocsChauffeur(chauffeurId: string) {
    if (!chauffeurId) return;
    const DOCS_OBLIGATOIRES = ['carte_identite', 'carte_vtc', 'permis', 'carte_grise'];
    const expired = await query(
        `SELECT id FROM documents_chauffeur WHERE chauffeur_id = $1 AND statut = 'expire' AND type = ANY($2)`,
        [chauffeurId, DOCS_OBLIGATOIRES]
    );
    if (expired.rows.length > 0) {
        await query('UPDATE chauffeurs SET documents_valides = false WHERE id = $1', [chauffeurId]);
    }
}
