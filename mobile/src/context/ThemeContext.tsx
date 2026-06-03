import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useColorScheme } from 'react-native';
import { Colors } from '../theme';

type ThemeMode = 'nocturne' | 'clair' | 'auto';

interface ThemeContextValue {
    mode: ThemeMode;
    setMode: (m: ThemeMode) => void;
    colors: typeof Colors.nocturne;
    isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
    mode: 'nocturne',
    setMode: () => {},
    colors: Colors.nocturne,
    isDark: true,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const systemScheme = useColorScheme();
    const [mode, setModeState] = useState<ThemeMode>('nocturne');

    useEffect(() => {
        AsyncStorage.getItem('sesame_theme').then(v => {
            if (v === 'nocturne' || v === 'clair' || v === 'auto') setModeState(v);
        });
    }, []);

    const setMode = (m: ThemeMode) => {
        setModeState(m);
        AsyncStorage.setItem('sesame_theme', m);
    };

    const isDark = mode === 'nocturne' || (mode === 'auto' && systemScheme !== 'light');
    const colors = isDark ? Colors.nocturne : Colors.clair;

    return (
        <ThemeContext.Provider value={{ mode, setMode, colors, isDark }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
