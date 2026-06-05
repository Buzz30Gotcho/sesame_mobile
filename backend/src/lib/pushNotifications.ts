import https from 'https';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
): Promise<void> {
    if (!token || !token.startsWith('ExponentPushToken')) {
        return;
    }

    const payload = JSON.stringify({
        to: token,
        title,
        body,
        data: data ?? {},
        sound: 'default',
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
        req.on('error', () => resolve()); // Non bloquant — notifications optionnelles
        req.write(payload);
        req.end();
    });
}
