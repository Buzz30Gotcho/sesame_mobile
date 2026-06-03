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

export async function registerForPushNotifications(userId: string, role: string): Promise<string | null> {
    if (Platform.OS === 'web') return null;

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token = tokenData.data;

    // Enregistrer le token côté backend
    try {
        await api.post('/api/auth/push-token', { user_id: userId, role, token });
    } catch {
        // Non bloquant — notifications optionnelles
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
