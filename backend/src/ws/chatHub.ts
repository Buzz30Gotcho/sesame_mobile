import { WebSocket } from 'ws';

// Hub WebSocket du chat de course, isolé du démarrage serveur (src/index.ts).
// But : permettre aux routes (chat.ts) d'émettre des messages SANS importer index.ts,
// ce qui éviterait de déclencher server.listen() + les setInterval au simple import
// (indispensable pour importer l'app dans les tests sans lancer le serveur ni les crons).

// Map courseId → ensemble des clients connectés à la room.
const rooms = new Map<string, Set<WebSocket>>();

export function joinRoom(courseId: string, ws: WebSocket): void {
    if (!rooms.has(courseId)) rooms.set(courseId, new Set());
    rooms.get(courseId)!.add(ws);
}

export function leaveRoom(courseId: string, ws: WebSocket): void {
    rooms.get(courseId)?.delete(ws);
    if (rooms.get(courseId)?.size === 0) rooms.delete(courseId);
}

// Diffuse un message à tous les clients d'une course (utilisé par la route chat).
export function broadcastChatMessage(courseId: string, message: object): void {
    const clients = rooms.get(courseId);
    if (!clients) return;
    const payload = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
}
