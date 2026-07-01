import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { registerForPushNotifications, usePushNotificationListener, usePushResponseListener } from '../../src/services/notifications';
import { api } from '../../src/services/api';

jest.mock('expo-notifications', () => ({
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(),
    requestPermissionsAsync: jest.fn(),
    getExpoPushTokenAsync: jest.fn(),
    addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));

describe('registerForPushNotifications', () => {
    let puts: string[] = [];
    beforeEach(() => {
        puts = [];
        (Platform as any).OS = 'ios';
        api.defaults.adapter = async (config) => {
            if (config.method === 'put') puts.push(config.url!);
            return { data: {}, status: 200, statusText: 'OK', headers: {}, config } as any;
        };
        (Notifications.getExpoPushTokenAsync as jest.Mock).mockResolvedValue({ data: 'ExpoToken[abc]' });
    });

    it('web → null (pas de push)', async () => {
        (Platform as any).OS = 'web';
        expect(await registerForPushNotifications({ ambassadorId: 'a1' })).toBeNull();
    });

    it('permission refusée → null', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'denied' });
        expect(await registerForPushNotifications({ ambassadorId: 'a1' })).toBeNull();
    });

    it('accordée (déjà) → renvoie le token et l\'enregistre côté ambassadeur', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        const token = await registerForPushNotifications({ ambassadorId: 'a1' });
        expect(token).toBe('ExpoToken[abc]');
        expect(puts).toContain('/api/ambassadeurs/a1/push-token');
    });

    it('accordée après demande → enregistre côté chauffeur', async () => {
        (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'undetermined' });
        (Notifications.requestPermissionsAsync as jest.Mock).mockResolvedValue({ status: 'granted' });
        const token = await registerForPushNotifications({ chauffeurId: 'c1' });
        expect(token).toBe('ExpoToken[abc]');
        expect(puts).toContain('/api/chauffeurs/c1/push-token');
    });
});

describe('listeners', () => {
    it('branchent les callbacks expo-notifications', () => {
        const cb = jest.fn();
        usePushNotificationListener(cb);
        usePushResponseListener(cb);
        expect(Notifications.addNotificationReceivedListener).toHaveBeenCalled();
        expect(Notifications.addNotificationResponseReceivedListener).toHaveBeenCalled();
    });
});
