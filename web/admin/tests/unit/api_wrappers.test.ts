import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock d'axios : create() renvoie une instance singleton mockée que l'on récupère
// dans les tests pour asserter les appels (méthode + URL + payload).
vi.mock('axios', () => {
    const inst = {
        get: vi.fn(() => Promise.resolve({ data: {} })),
        post: vi.fn(() => Promise.resolve({ data: {} })),
        put: vi.fn(() => Promise.resolve({ data: {} })),
        delete: vi.fn(() => Promise.resolve({ data: {} })),
        interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
    };
    const mockAxios = { create: () => inst, post: vi.fn(() => Promise.resolve({ data: {} })) };
    return { default: mockAxios, ...mockAxios };
});

import axios from 'axios';
import * as API from '../../src/api';

const inst: any = (axios as any).create();

beforeEach(() => {
    inst.get.mockClear(); inst.post.mockClear(); inst.put.mockClear(); inst.delete.mockClear();
    inst.get.mockResolvedValue({ data: {} });
    inst.post.mockResolvedValue({ data: {} });
    inst.put.mockResolvedValue({ data: {} });
    inst.delete.mockResolvedValue({ data: {} });
});

const lastUrl = (m: any) => m.mock.calls.at(-1)![0];
const lastBody = (m: any) => m.mock.calls.at(-1)![1];

describe('api admin — GET', () => {
    it.each<[string, () => Promise<any>, string]>([
        ['getAdmins', () => API.getAdmins(), '/admin/admins'],
        ['get2faStatus', () => API.get2faStatus(), '/admin/2fa/status'],
        ['getDashboard', () => API.getDashboard(), '/admin/dashboard'],
        ['getAmbassadeurs', () => API.getAmbassadeurs(), '/admin/ambassadeurs'],
        ['getChauffeurs', () => API.getChauffeurs(), '/admin/chauffeurs'],
        ['getChauffeurDocuments', () => API.getChauffeurDocuments('c1'), '/admin/chauffeurs/c1/documents'],
        ['getControleIdentite', () => API.getControleIdentite('c1'), '/admin/chauffeurs/c1/controle-identite'],
        ['getCourses', () => API.getCourses(), '/admin/courses'],
        ['getEchangesEnAttente', () => API.getEchangesEnAttente(), '/admin/echanges/en-attente'],
        ['getBlacklist', () => API.getBlacklist(), '/admin/blacklist'],
        ['getBlacklistPropositions', () => API.getBlacklistPropositions(), '/admin/blacklist/propositions'],
        ['getSanctionsEnAttente', () => API.getSanctionsEnAttente(), '/admin/sanctions'],
        ['getLitiges', () => API.getLitiges(), '/admin/litiges'],
        ['getTickets', () => API.getTickets(), '/admin/support/tickets'],
        ['getTicketMessages', () => API.getTicketMessages('t1'), '/admin/support/tickets/t1/messages'],
        ['getParametres', () => API.getParametres(), '/admin/parametres'],
        ['getCommissionsMoraux', () => API.getCommissionsMoraux(), '/admin/commissions/moraux'],
        ['getChatMessages', () => API.getChatMessages(5), '/chat/5/messages'],
        ['getFournisseurs', () => API.getFournisseurs(), '/admin/fournisseurs'],
        ['getOffres', () => API.getOffres('f1'), '/admin/fournisseurs/f1/offres'],
        ['getPaiementsFournisseur', () => API.getPaiementsFournisseur('f1'), '/admin/fournisseurs/f1/paiements'],
    ])('%s → GET %s', async (_n, fn, url) => {
        await fn();
        expect(lastUrl(inst.get)).toBe(url);
    });

    it('getTickets et getLitiges passent le statut en params', async () => {
        await API.getTickets('resolu' as any);
        expect(inst.get.mock.calls.at(-1)![1]).toEqual({ params: { statut: 'resolu' } });
        await API.getCommissionsMoraux('2026-06');
        expect(inst.get.mock.calls.at(-1)![1]).toEqual({ params: { mois: '2026-06' } });
    });
});

describe('api admin — POST', () => {
    it.each<[string, () => Promise<any>, string, any]>([
        ['createAdmin', () => API.createAdmin({ email: 'a@b.fr', password: 'password12', role: 'operateur' }), '/admin/admins', { email: 'a@b.fr', password: 'password12', role: 'operateur' }],
        ['setup2fa', () => API.setup2fa(), '/admin/2fa/setup', undefined],
        ['activate2fa', () => API.activate2fa('123456'), '/admin/2fa/activate', { code: '123456' }],
        ['disable2fa', () => API.disable2fa('123456'), '/admin/2fa/disable', { code: '123456' }],
        ['enregistrerControleIdentite', () => API.enregistrerControleIdentite('c1', 'non_conforme', 'flou'), '/admin/chauffeurs/c1/controle-identite', { resultat: 'non_conforme', note: 'flou' }],
        ['addBlacklist', () => API.addBlacklist({ nom: 'X' } as any), '/admin/blacklist', { nom: 'X' }],
        ['arbitrerAlerte', () => API.arbitrerAlerte(3, { action: 'penalite', points_sanction: 10 }), '/admin/alertes/3/arbitrer', { action: 'penalite', points_sanction: 10 }],
        ['creerLitige', () => API.creerLitige({ type: 'comportement', description: 'x' }), '/admin/litiges', { type: 'comportement', description: 'x' }],
        ['repondreTicket', () => API.repondreTicket('t1', 'coucou'), '/admin/support/tickets/t1/messages', { contenu: 'coucou' }],
        ['declencherVirements', () => API.declencherVirements('2026-06'), '/admin/commissions/declencher', { mois: '2026-06' }],
        ['sendChatMessage', () => API.sendChatMessage(5, 'hi'), '/chat/5/messages', { contenu: 'hi', role: 'admin' }],
        ['createFournisseur', () => API.createFournisseur({ nom_societe: 'ACME' } as any), '/admin/fournisseurs', { nom_societe: 'ACME' }],
        ['createOffre', () => API.createOffre('f1', { nom: 'Bon' } as any), '/admin/fournisseurs/f1/offres', { nom: 'Bon' }],
    ])('%s → POST %s', async (_n, fn, url, body) => {
        await fn();
        expect(lastUrl(inst.post)).toBe(url);
        if (body !== undefined) expect(lastBody(inst.post)).toEqual(body);
    });

    it('confirmer/rejeter blacklist proposition + contrats fournisseur', async () => {
        await API.confirmerBlacklistProposition('p1', 'motif');
        expect(lastUrl(inst.put)).toBe('/admin/blacklist/propositions/p1/confirmer');
        await API.rejeterBlacklistProposition('p1');
        expect(lastUrl(inst.put)).toBe('/admin/blacklist/propositions/p1/rejeter');
        await API.envoyerContratFournisseur('f1');
        expect(lastUrl(inst.post)).toBe('/admin/fournisseurs/f1/envoyer-contrat');
        await API.annulerContratFournisseur('f1');
        expect(lastUrl(inst.post)).toBe('/admin/fournisseurs/f1/annuler-contrat');
        await API.regenererCodeFournisseur('f1');
        expect(lastUrl(inst.post)).toBe('/admin/fournisseurs/f1/regenerer-code');
    });
});

describe('api admin — PUT / DELETE', () => {
    it('wrappers PUT', async () => {
        await API.updateAdmin('1', { role: 'lecteur' });
        expect(lastUrl(inst.put)).toBe('/admin/admins/1');
        await API.validerDocument('d1', '2030-01-01', true);
        expect(lastUrl(inst.put)).toBe('/admin/documents/d1/valider');
        await API.refuserDocument('d1', 'motif');
        expect(lastUrl(inst.put)).toBe('/admin/documents/d1/refuser');
        await API.updateChauffeurTaux(2, 15);
        expect(lastUrl(inst.put)).toBe('/admin/chauffeurs/2/taux');
        await API.updateChauffeurStatut('u1', 'suspendu');
        expect(lastUrl(inst.put)).toBe('/admin/utilisateurs/u1/statut');
        await API.validerAmbassadeurMoral('a1');
        expect(lastUrl(inst.put)).toBe('/admin/ambassadeurs/a1/valider-moral');
        await API.annulerCourse(3, 'raison');
        expect(lastUrl(inst.put)).toBe('/admin/courses/3/annuler');
        await API.assignerChauffeur(3, 4);
        expect(lastUrl(inst.put)).toBe('/admin/courses/3/assigner');
        await API.validerEchange(7);
        expect(lastUrl(inst.put)).toBe('/admin/echanges/7/valider');
        await API.updateLitige('l1', 'clos', 'décision');
        expect(lastBody(inst.put)).toEqual({ statut: 'clos', decision: 'décision' });
        await API.updateTicketStatut('t1', 'resolu' as any);
        expect(lastUrl(inst.put)).toBe('/admin/support/tickets/t1');
        await API.updateParametre('taux_commission_global', '20');
        expect(lastBody(inst.put)).toEqual({ valeur: '20' });
        await API.updateFournisseur('f1', { nom_societe: 'X' } as any);
        expect(lastUrl(inst.put)).toBe('/admin/fournisseurs/f1');
        await API.updateOffre('o1', { nom: 'X' } as any);
        expect(lastUrl(inst.put)).toBe('/admin/offres/o1');
        await API.marquerPaiementPaye('e1');
        expect(lastUrl(inst.put)).toBe('/admin/echanges/e1/payer-fournisseur');
    });

    it('notes chauffeur & ambassadeur', async () => {
        await API.updateChauffeurNote(2, 'note ch');
        expect(lastUrl(inst.put)).toBe('/admin/chauffeurs/2/note');
        expect(lastBody(inst.put)).toEqual({ note: 'note ch' });
        await API.updateAmbassadeurNote(5, 'note amb');
        expect(lastUrl(inst.put)).toBe('/admin/ambassadeurs/5/note');
    });

    it('wrappers DELETE', async () => {
        await API.deleteAdmin('1');
        expect(lastUrl(inst.delete)).toBe('/admin/admins/1');
        await API.deleteBlacklist(9);
        expect(lastUrl(inst.delete)).toBe('/admin/blacklist/9');
        await API.deleteAmbassadeur(5);
        expect(lastUrl(inst.delete)).toBe('/admin/ambassadeurs/5');
        await API.deleteOffre('o1');
        expect(lastUrl(inst.delete)).toBe('/admin/offres/o1');
    });
});

describe('Exports SEPA (téléchargement blob)', () => {
    beforeEach(() => {
        (URL as any).createObjectURL = vi.fn(() => 'blob:x');
        (URL as any).revokeObjectURL = vi.fn();
    });

    it('exporterSepaFournisseurs télécharge le XML', async () => {
        inst.get.mockResolvedValueOnce({ data: new Blob(['<xml/>']) });
        await API.exporterSepaFournisseurs();
        expect(lastUrl(inst.get)).toBe('/admin/sepa/fournisseurs');
        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('exporterSepaCommissions télécharge le XML du mois', async () => {
        inst.get.mockResolvedValueOnce({ data: new Blob(['<xml/>']) });
        await API.exporterSepaCommissions('2026-06');
        expect(lastUrl(inst.get)).toBe('/admin/sepa/commissions');
        expect(URL.createObjectURL).toHaveBeenCalled();
    });

    it('getContratPreviewUrl renvoie une URL blob', async () => {
        inst.get.mockResolvedValueOnce({ data: new Blob(['%PDF']) });
        const url = await API.getContratPreviewUrl('f1');
        expect(lastUrl(inst.get)).toBe('/admin/fournisseurs/f1/contrat-preview');
        expect(url).toBe('blob:x');
    });
});

describe('getCommissionsMoraux — normalisation des données', () => {
    it('mappe les montants et champs par défaut', async () => {
        inst.get.mockResolvedValueOnce({ data: { taux_pct: 12, mois: '2026-06', ambassadeurs: [{ id: 'a1', ca_brut_ttc: '200', commission: '24', nb_courses: '3' }] } });
        const r = await API.getCommissionsMoraux('2026-06');
        expect(r.taux_pct).toBe(12);
        expect(r.ambassadeurs[0].ca_brut).toBe(200);
        expect(r.ambassadeurs[0].commission).toBe(24);
        expect(r.ambassadeurs[0].nb_courses).toBe(3);
    });
});
