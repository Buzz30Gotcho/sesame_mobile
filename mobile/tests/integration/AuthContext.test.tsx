import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import { api } from '../../src/services/api';

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
// AuthContext importe locationTask (constantes de clés), qui charge expo-task-manager
// (module natif absent en test) → on le neutralise.
jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('expo-location', () => ({ Accuracy: { High: 4 } }));

const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;

describe('AuthContext', () => {
    beforeEach(() => { (AsyncStorage.setItem as jest.Mock).mockClear?.(); });

    it('setAuth remplit l\'état, positionne le header axios et persiste le token', async () => {
        const { result } = renderHook(() => useAuth(), { wrapper });
        act(() => {
            result.current.setAuth({ token: 'jwt1', userId: 'u1', email: 'e@t.fr', role: 'chauffeur', chauffeurId: 'c1' });
        });
        expect(result.current.token).toBe('jwt1');
        expect(result.current.role).toBe('chauffeur');
        expect(result.current.chauffeurId).toBe('c1');
        expect(api.defaults.headers.common.Authorization).toBe('Bearer jwt1');
        await waitFor(() => expect(AsyncStorage.setItem).toHaveBeenCalledWith('sesame_token', 'jwt1'));
    });

    it('logout réinitialise tout et retire le header', () => {
        const { result } = renderHook(() => useAuth(), { wrapper });
        act(() => result.current.setAuth({ token: 'jwt1', userId: 'u1', email: 'e@t.fr', role: 'ambassadeur', ambassadorId: 'a1' }));
        act(() => result.current.logout());
        expect(result.current.token).toBeNull();
        expect(result.current.ambassadorId).toBeNull();
        expect(api.defaults.headers.common.Authorization).toBeUndefined();
    });

    it('useAuth hors AuthProvider lève une erreur', () => {
        expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    });
});
