import https from 'https';
import admin from 'firebase-admin';
import path from 'path';

// Initialisation Firebase Admin SDK
const serviceAccountPath = path.join(__dirname, '../../sesame-708a3-firebase-adminsdk-fbsvc-038ce93144.json');
try {
    if (!admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccountPath),
        });
    }
} catch {
    // Non bloquant — Firebase optionnel si fichier absent
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    persistent = false
): Promise<void> {
    if (!token) return;

    // Expo Push Token
    if (token.startsWith('ExponentPushToken')) {
        const payload = JSON.stringify({
            to: token,
            title,
            body,
            data: data ?? {},
            sound: 'default',
            ...(persistent ? { sticky: true, priority: 'high' } : {}),
        });
        return new Promise((resolve) => {
            const req = https.request(
                EXPO_PUSH_URL,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Accept: 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                    },
                },
                () => resolve()
            );
            req.on('error', () => resolve());
            req.write(payload);
            req.end();
        });
    }

    // FCM Token natif (production)
    try {
        await admin.messaging().send({
            token,
            notification: { title, body },
            data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : {},
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    ...(persistent ? { ongoing: true, sticky: true } : {}),
                },
            },
            apns: {
                payload: { aps: { sound: 'default', ...(persistent ? { 'content-available': 1 } : {}) } },
            },
        });
    } catch {
        // Non bloquant
    }
}
