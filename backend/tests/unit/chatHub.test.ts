import { WebSocket } from 'ws';
import { joinRoom, leaveRoom, broadcastChatMessage } from '../../src/ws/chatHub';

// Hub WebSocket du chat de course. On simule des clients WS minimalistes
// (readyState + send) sans ouvrir de vraie connexion.
function fakeWs(readyState: number = WebSocket.OPEN) {
    return { readyState, send: jest.fn() } as unknown as WebSocket & { send: jest.Mock };
}

describe('chatHub', () => {
    it("diffuse le message à tous les clients OPEN d'une room", () => {
        const courseId = 'course-a';
        const c1 = fakeWs();
        const c2 = fakeWs();
        joinRoom(courseId, c1);
        joinRoom(courseId, c2);

        broadcastChatMessage(courseId, { texte: 'coucou' });

        const payload = JSON.stringify({ texte: 'coucou' });
        expect((c1 as any).send).toHaveBeenCalledWith(payload);
        expect((c2 as any).send).toHaveBeenCalledWith(payload);

        leaveRoom(courseId, c1);
        leaveRoom(courseId, c2);
    });

    it("n'envoie pas aux clients non OPEN (CONNECTING/CLOSED)", () => {
        const courseId = 'course-b';
        const closed = fakeWs(WebSocket.CLOSED);
        joinRoom(courseId, closed);

        broadcastChatMessage(courseId, { texte: 'x' });

        expect((closed as any).send).not.toHaveBeenCalled();
        leaveRoom(courseId, closed);
    });

    it('ne fait rien pour une room inexistante', () => {
        expect(() => broadcastChatMessage('room-inconnue', { a: 1 })).not.toThrow();
    });

    it('isole les rooms entre elles (un message ne fuit pas)', () => {
        const a = fakeWs();
        const b = fakeWs();
        joinRoom('room-1', a);
        joinRoom('room-2', b);

        broadcastChatMessage('room-1', { m: 1 });

        expect((a as any).send).toHaveBeenCalledTimes(1);
        expect((b as any).send).not.toHaveBeenCalled();
        leaveRoom('room-1', a);
        leaveRoom('room-2', b);
    });

    it('leaveRoom supprime le client puis la room quand elle est vide', () => {
        const courseId = 'course-c';
        const c1 = fakeWs();
        joinRoom(courseId, c1);
        leaveRoom(courseId, c1);

        // La room a été supprimée : plus aucun envoi.
        broadcastChatMessage(courseId, { m: 1 });
        expect((c1 as any).send).not.toHaveBeenCalled();
    });

    it('leaveRoom sur une room inexistante est sans effet', () => {
        expect(() => leaveRoom('jamais-vue', fakeWs())).not.toThrow();
    });

    it('joinRoom deux fois le même client ne le duplique pas (Set)', () => {
        const courseId = 'course-d';
        const c1 = fakeWs();
        joinRoom(courseId, c1);
        joinRoom(courseId, c1);

        broadcastChatMessage(courseId, { m: 1 });
        expect((c1 as any).send).toHaveBeenCalledTimes(1);
        leaveRoom(courseId, c1);
    });
});
