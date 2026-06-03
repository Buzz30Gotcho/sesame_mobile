import 'dotenv/config';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app';

const port = process.env.PORT || 4000;

const server = http.createServer(app);

// WebSocket server — /ws/chat/:courseId
const wss = new WebSocketServer({ server, path: '/ws/chat' });

// Map courseId → Set of connected clients
const rooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
    const courseId = req.url?.split('/ws/chat/')[1] ?? '';
    if (!courseId) { ws.close(); return; }

    if (!rooms.has(courseId)) rooms.set(courseId, new Set());
    rooms.get(courseId)!.add(ws);

    ws.on('close', () => {
        rooms.get(courseId)?.delete(ws);
        if (rooms.get(courseId)?.size === 0) rooms.delete(courseId);
    });

    ws.on('error', () => ws.close());
});

// Broadcast helper used by the chat route
export function broadcastChatMessage(courseId: string, message: object) {
    const clients = rooms.get(courseId);
    if (!clients) return;
    const payload = JSON.stringify(message);
    clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(payload);
    });
}

server.listen(port, () => {
    console.log(`SESAME backend running on http://localhost:${port}`);
    console.log(`WebSocket available on ws://localhost:${port}/ws/chat/:courseId`);
});
