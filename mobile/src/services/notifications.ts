import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from './api';

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

export async function registerForPushNotifications(params: { ambassadorId?: string; chauffeurId?: string }): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;
    if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;

    const token = (await Notifications.getExpoPushTokenAsync()).data;

    if (params.ambassadorId) {
        await api.put(`/api/ambassadeurs/${params.ambassadorId}/push-token`, { push_token: token }).catch(() => {});
    } else if (params.chauffeurId) {
        await api.put(`/api/chauffeurs/${params.chauffeurId}/push-token`, { push_token: token }).catch(() => {});
    }

    return token;
}

export function usePushNotificationListener(
    onNotification: (notification: Notifications.Notification) => void
) {
    return Notifications.addNotificationReceivedListener(onNotification);
}

export function usePushResponseListener(
    onResponse: (response: Notifications.NotificationResponse) => void
) {
    return Notifications.addNotificationResponseReceivedListener(onResponse);
}
