import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Capture le callback passé à defineTask pour l'invoquer manuellement.
let taskCallback: any;
jest.mock('expo-task-manager', () => ({
    defineTask: jest.fn((_name: string, fn: any) => { taskCallback = fn; }),
}));
jest.mock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn(),
    requestBackgroundPermissionsAsync: jest.fn(),
    hasStartedLocationUpdatesAsync: jest.fn(),
    startLocationUpdatesAsync: jest.fn(),
    stopLocationUpdatesAsync: jest.fn(),
    Accuracy: { High: 4 },
}));
jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

import { startBackgroundLocation, stopBackgroundLocation, LOCATION_TASK_NAME } from '../../src/services/locationTask';

const granted = { status: 'granted' };
const denied = { status: 'denied' };

describe('startBackgroundLocation', () => {
    beforeEach(() => jest.clearAllMocks());

    it('foreground refusé → denied', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(denied);
        expect(await startBackgroundLocation()).toBe('denied');
    });

    it('background refusé → foreground', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue(denied);
        expect(await startBackgroundLocation()).toBe('foreground');
    });

    it('tout accordé → background et démarre le suivi', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
        expect(await startBackgroundLocation()).toBe('background');
        expect(Location.startLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME, expect.any(Object));
    });

    it('déjà démarré → ne relance pas le suivi', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);
        expect(await startBackgroundLocation()).toBe('background');
        expect(Location.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('échec au démarrage → foreground (repli)', async () => {
        (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
        (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
        (Location.startLocationUpdatesAsync as jest.Mock).mockRejectedValue(new Error('boom'));
        expect(await startBackgroundLocation()).toBe('foreground');
    });
});

describe('stopBackgroundLocation', () => {
    beforeEach(() => jest.clearAllMocks());

    it('arrête le suivi s\'il est actif', async () => {
        (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(true);
        await stopBackgroundLocation();
        expect(Location.stopLocationUpdatesAsync).toHaveBeenCalledWith(LOCATION_TASK_NAME);
    });

    it('ne fait rien si inactif', async () => {
        (Location.hasStartedLocationUpdatesAsync as jest.Mock).mockResolvedValue(false);
        await stopBackgroundLocation();
        expect(Location.stopLocationUpdatesAsync).not.toHaveBeenCalled();
    });
});

describe('tâche de fond (callback defineTask)', () => {
    beforeEach(() => { jest.clearAllMocks(); (global as any).fetch = jest.fn(async () => ({ ok: true })); });

    it('pousse la position quand token + chauffeur présents', async () => {
        await AsyncStorage.setItem('sesame_token', 'jwt');
        await AsyncStorage.setItem('sesame_chauffeur_id', 'c1');
        await taskCallback({ data: { locations: [{ coords: { latitude: 48.85, longitude: 2.35 } }] }, error: null });
        expect((global as any).fetch).toHaveBeenCalled();
        const [url, opts] = (global as any).fetch.mock.calls[0];
        expect(url).toContain('/api/chauffeurs/c1/position');
        expect(JSON.parse(opts.body)).toEqual({ lat: 48.85, lon: 2.35 });
    });

    it('ignore en cas d\'erreur de tâche', async () => {
        await taskCallback({ data: {}, error: new Error('gps') });
        expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('ignore sans localisation', async () => {
        await taskCallback({ data: { locations: [] }, error: null });
        expect((global as any).fetch).not.toHaveBeenCalled();
    });

    it('n\'envoie rien sans token', async () => {
        await AsyncStorage.clear();
        await taskCallback({ data: { locations: [{ coords: { latitude: 1, longitude: 2 } }] }, error: null });
        expect((global as any).fetch).not.toHaveBeenCalled();
    });
});
