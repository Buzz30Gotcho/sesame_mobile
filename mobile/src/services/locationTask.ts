import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BACKEND_URL } from './api';

// Tâche de localisation en arrière-plan (specs §7.2 + §9.2) — pousse la position
// du chauffeur même app fermée / en fond, pour l'ETA temps réel côté Ambassadeur.
export const LOCATION_TASK_NAME = 'sesame-background-location';
export const AUTH_TOKEN_KEY = 'sesame_token';
export const CHAUFFEUR_ID_KEY = 'sesame_chauffeur_id';

// La tâche tourne HORS de React (contexte « headless ») : elle relit le token et
// l'id chauffeur depuis AsyncStorage et envoie la position en fetch brut.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
    if (error) return;
    const { locations } = (data || {}) as { locations?: Location.LocationObject[] };
    const loc = locations?.[locations.length - 1];
    if (!loc) return;
    try {
        const [token, chauffeurId] = await Promise.all([
            AsyncStorage.getItem(AUTH_TOKEN_KEY),
            AsyncStorage.getItem(CHAUFFEUR_ID_KEY),
        ]);
        if (!token || !chauffeurId) return;
        await fetch(`${BACKEND_URL}/api/chauffeurs/${chauffeurId}/position`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'ngrok-skip-browser-warning': 'true',
            },
            body: JSON.stringify({ lat: loc.coords.latitude, lon: loc.coords.longitude }),
        });
    } catch {
        // silencieux — réessai au prochain point GPS
    }
});

// Démarre le suivi. Retourne le mode obtenu :
//  - 'background' : suivi continu même app fermée (permission « Toujours » accordée)
//  - 'foreground' : permission seulement « quand active » → repli, l'écran pousse la position
//  - 'denied'     : aucune autorisation GPS
export async function startBackgroundLocation(): Promise<'background' | 'foreground' | 'denied'> {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') return 'denied';

    let bgGranted = false;
    try {
        const bg = await Location.requestBackgroundPermissionsAsync();
        bgGranted = bg.status === 'granted';
    } catch {
        bgGranted = false;
    }
    if (!bgGranted) return 'foreground';

    try {
        const already = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!already) {
            await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
                accuracy: Location.Accuracy.High,
                timeInterval: 5000,
                distanceInterval: 10,
                pausesUpdatesAutomatically: false,
                showsBackgroundLocationIndicator: true, // iOS : barre bleue
                foregroundService: {
                    // Android : notification permanente obligatoire pendant le service
                    notificationTitle: 'Course en cours',
                    notificationBody: 'SÉSAME partage votre position pendant la course.',
                    notificationColor: '#C9A84C',
                },
            });
        }
        return 'background';
    } catch {
        return 'foreground';
    }
}

export async function stopBackgroundLocation(): Promise<void> {
    try {
        const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    } catch {
        // silencieux
    }
}
