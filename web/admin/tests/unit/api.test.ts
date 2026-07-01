import { describe, it, expect, vi, beforeEach } from 'vitest';
import axios from 'axios';
import { adminLogin, getAdminRole } from '../../src/api';

// Client API admin : rôle stocké localement + login. Le backend reste l'autorité ;
// le rôle local ne sert qu'à adapter l'UI.

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe('getAdminRole', () => {
    it('renvoie super_admin par défaut', () => {
        expect(getAdminRole()).toBe('super_admin');
    });

    it('reflète le rôle stocké', () => {
        localStorage.setItem('admin_role', 'lecteur');
        expect(getAdminRole()).toBe('lecteur');
    });
});

describe('adminLogin', () => {
    it('mémorise le rôle renvoyé et retourne le token', async () => {
        vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 'tok-xyz', adminRole: 'operateur' } });
        const token = await adminLogin('a@b.fr', 'secret', '123456');
        expect(token).toBe('tok-xyz');
        expect(localStorage.getItem('admin_role')).toBe('operateur');
    });

    it('transmet email, password et code 2FA', async () => {
        const spy = vi.spyOn(axios, 'post').mockResolvedValue({ data: { token: 't' } });
        await adminLogin('a@b.fr', 'secret', '999999');
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('/admin/login'), {
            email: 'a@b.fr', password: 'secret', code: '999999',
        });
    });
});
