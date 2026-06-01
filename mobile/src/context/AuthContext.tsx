import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';
import { setAuthToken } from '../services/api';
import type { UserRole } from '../types';

export type AuthContextData = {
    userId: string | null;
    token: string | null;
    email: string | null;
    role: UserRole | null;
    ambassadorId: string | null;
    chauffeurId: string | null;
    adminId: string | null;
    setAuth: (params: {
        token: string;
        userId: string;
        email: string;
        role: UserRole;
        ambassadorId?: string | null;
        chauffeurId?: string | null;
        adminId?: string | null;
    }) => void;
    logout: () => void;
};

const AuthContext = createContext<AuthContextData | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [token, setToken] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [role, setRole] = useState<UserRole | null>(null);
    const [ambassadorId, setAmbassadorId] = useState<string | null>(null);
    const [chauffeurId, setChauffeurId] = useState<string | null>(null);
    const [adminId, setAdminId] = useState<string | null>(null);

    const setAuth = ({ token: newToken, userId: newUserId, email: newEmail, role: newRole, ambassadorId: newAmbassadorId = null, chauffeurId: newChauffeurId = null, adminId: newAdminId = null }: {
        token: string;
        userId: string;
        email: string;
        role: UserRole;
        ambassadorId?: string | null;
        chauffeurId?: string | null;
        adminId?: string | null;
    }) => {
        setToken(newToken);
        setUserId(newUserId);
        setEmail(newEmail);
        setRole(newRole);
        setAmbassadorId(newAmbassadorId ?? null);
        setChauffeurId(newChauffeurId ?? null);
        setAdminId(newAdminId ?? null);
        setAuthToken(newToken);
    };

    const logout = () => {
        setToken(null);
        setUserId(null);
        setEmail(null);
        setRole(null);
        setAmbassadorId(null);
        setChauffeurId(null);
        setAdminId(null);
        setAuthToken(null);
    };

    const value = useMemo(
        () => ({ userId, token, email, role, ambassadorId, chauffeurId, adminId, setAuth, logout }),
        [userId, token, email, role, ambassadorId, chauffeurId, adminId]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within AuthProvider');
    }
    return context;
}
