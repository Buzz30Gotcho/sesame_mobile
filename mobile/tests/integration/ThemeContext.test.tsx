import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import * as RN from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider, useTheme } from '../../src/context/ThemeContext';
import { Colors } from '../../src/theme';

jest.mock('@react-native-async-storage/async-storage', () =>
    require('@react-native-async-storage/async-storage/jest/async-storage-mock'));

const wrapper = ({ children }: { children: React.ReactNode }) => <ThemeProvider>{children}</ThemeProvider>;

describe('ThemeContext', () => {
    afterEach(() => jest.restoreAllMocks());

    it('mode nocturne par défaut (sombre)', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        expect(result.current.mode).toBe('nocturne');
        expect(result.current.isDark).toBe(true);
        expect(result.current.colors).toBe(Colors.nocturne);
    });

    it('setMode(clair) bascule en thème clair et persiste', () => {
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setMode('clair'));
        expect(result.current.isDark).toBe(false);
        expect(result.current.colors).toBe(Colors.clair);
        expect(AsyncStorage.setItem).toHaveBeenCalledWith('sesame_theme', 'clair');
    });

    it('mode auto suit le schéma système (light → clair)', () => {
        jest.spyOn(RN, 'useColorScheme').mockReturnValue('light');
        const { result } = renderHook(() => useTheme(), { wrapper });
        act(() => result.current.setMode('auto'));
        expect(result.current.isDark).toBe(false);
    });

    it('restaure le mode sauvegardé au montage', async () => {
        await AsyncStorage.setItem('sesame_theme', 'clair');
        const { result } = renderHook(() => useTheme(), { wrapper });
        await waitFor(() => expect(result.current.mode).toBe('clair'));
    });
});
