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
    typeAmbassadeur: string | null;
    isSousCompte: boolean;
    setAuth: (params: {
        token: string;
        userId: string;
        email: string;
        role: UserRole;
        ambassadorId?: string | null;
        chauffeurId?: string | null;
        typeAmbassadeur?: string | null;
        isSousCompte?: boolean;
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
    const [typeAmbassadeur, setTypeAmbassadeur] = useState<string | null>(null);
    const [isSousCompte, setIsSousCompte] = useState<boolean>(false);

    const setAuth = ({
        token: newToken,
        userId: newUserId,
        email: newEmail,
        role: newRole,
        ambassadorId: newAmbassadorId = null,
        chauffeurId: newChauffeurId = null,
        typeAmbassadeur: newTypeAmbassadeur = null,
        isSousCompte: newIsSousCompte = false,
    }: {
        token: string;
        userId: string;
        email: string;
        role: UserRole;
        ambassadorId?: string | null;
        chauffeurId?: string | null;
        typeAmbassadeur?: string | null;
        isSousCompte?: boolean;
    }) => {
        setToken(newToken);
        setUserId(newUserId);
        setEmail(newEmail);
        setRole(newRole);
        setAmbassadorId(newAmbassadorId ?? null);
        setChauffeurId(newChauffeurId ?? null);
        setTypeAmbassadeur(newTypeAmbassadeur ?? null);
        setIsSousCompte(newIsSousCompte ?? false);
        setAuthToken(newToken);
    };

    const logout = () => {
        setToken(null);
        setUserId(null);
        setEmail(null);
        setRole(null);
        setAmbassadorId(null);
        setChauffeurId(null);
        setTypeAmbassadeur(null);
        setIsSousCompte(false);
        setAuthToken(null);
    };

    const value = useMemo(
        () => ({ userId, token, email, role, ambassadorId, chauffeurId, typeAmbassadeur, isSousCompte, setAuth, logout }),
        [userId, token, email, role, ambassadorId, chauffeurId, typeAmbassadeur, isSousCompte]
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
