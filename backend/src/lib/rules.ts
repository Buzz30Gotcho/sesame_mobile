export type VehicleType = 'berline' | 'van';
export type AmbassadorLevel = 'starter' | 'pro' | 'elite' | 'black';

export function calculatePoints(amount: number): number {
    return Math.max(0, Math.floor(amount / 10));
}

export function calculateVehiclePrice(
    vehicleType: VehicleType,
    kilometers: number,
    params?: {
        berline_forfait?: number;
        berline_seuil_km?: number;
        berline_prix_km?: number;
        van_forfait?: number;
        van_seuil_km?: number;
        van_prix_km?: number;
    }
): number {
    const isVan = vehicleType === 'van';
    const base = isVan ? (params?.van_forfait ?? 12.0) : (params?.berline_forfait ?? 12.0);
    const threshold = isVan ? (params?.van_seuil_km ?? 6) : (params?.berline_seuil_km ?? 6);
    const rate = isVan ? (params?.van_prix_km ?? 3.0) : (params?.berline_prix_km ?? 2.0);

    if (kilometers <= threshold) {
        return Number(base.toFixed(2));
    }

    return Number((base + (kilometers - threshold) * rate).toFixed(2));
}

export function nextAmbassadorLevel(points: number): AmbassadorLevel {
    if (points >= 5000) return 'black';
    if (points >= 2000) return 'elite';
    if (points >= 500) return 'pro';
    return 'starter';
}

export function formatPrice(amount: number): string {
    return amount.toFixed(2);
}
