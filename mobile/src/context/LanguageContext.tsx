import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Lang = 'fr' | 'en' | 'it' | 'es';

const translations: Record<Lang, Record<string, string>> = {
    fr: {
        commander: 'Commander',
        reserver: 'Réserver à l\'avance',
        boutique: 'Boutique',
        mes_bons: 'Mes bons cadeaux',
        parrainage: 'Parrainage',
        niveaux: 'Niveaux',
        profil: 'Profil',
        equipe: 'Mon équipe',
        commissions: 'Commissions',
        revenus: 'Revenus',
        deconnexion: 'Déconnexion',
        connexion: 'Connexion',
        inscription: 'Inscription',
        envoyer: 'Envoyer',
        annuler: 'Annuler',
        confirmer: 'Confirmer',
        chargement: 'Chargement...',
        erreur: 'Une erreur est survenue',
        points: 'points',
        courses: 'courses',
        disponible: 'Disponible',
        hors_ligne: 'Hors ligne',
        theme: 'Thème',
        langue: 'Langue',
        nocturne: 'Nocturne',
        clair: 'Clair',
        auto: 'Automatique',
        bonne_route: 'Bonne route. - SESAME',
    },
    en: {
        commander: 'Order now',
        reserver: 'Book in advance',
        boutique: 'Shop',
        mes_bons: 'My gift vouchers',
        parrainage: 'Referral',
        niveaux: 'Levels',
        profil: 'Profile',
        equipe: 'My team',
        commissions: 'Commissions',
        revenus: 'Earnings',
        deconnexion: 'Logout',
        connexion: 'Login',
        inscription: 'Sign up',
        envoyer: 'Send',
        annuler: 'Cancel',
        confirmer: 'Confirm',
        chargement: 'Loading...',
        erreur: 'An error occurred',
        points: 'points',
        courses: 'rides',
        disponible: 'Available',
        hors_ligne: 'Offline',
        theme: 'Theme',
        langue: 'Language',
        nocturne: 'Dark',
        clair: 'Light',
        auto: 'Automatic',
        bonne_route: 'Safe travels. - SESAME',
    },
    it: {
        commander: 'Ordina ora',
        reserver: 'Prenota in anticipo',
        boutique: 'Negozio',
        mes_bons: 'I miei buoni regalo',
        parrainage: 'Referral',
        niveaux: 'Livelli',
        profil: 'Profilo',
        equipe: 'Il mio team',
        commissions: 'Commissioni',
        revenus: 'Guadagni',
        deconnexion: 'Disconnetti',
        connexion: 'Accesso',
        inscription: 'Registrati',
        envoyer: 'Invia',
        annuler: 'Annulla',
        confirmer: 'Conferma',
        chargement: 'Caricamento...',
        erreur: 'Si è verificato un errore',
        points: 'punti',
        courses: 'corse',
        disponible: 'Disponibile',
        hors_ligne: 'Non disponibile',
        theme: 'Tema',
        langue: 'Lingua',
        nocturne: 'Scuro',
        clair: 'Chiaro',
        auto: 'Automatico',
        bonne_route: 'Buon viaggio. - SESAME',
    },
    es: {
        commander: 'Pedir ahora',
        reserver: 'Reservar con antelación',
        boutique: 'Tienda',
        mes_bons: 'Mis bonos regalo',
        parrainage: 'Referidos',
        niveaux: 'Niveles',
        profil: 'Perfil',
        equipe: 'Mi equipo',
        commissions: 'Comisiones',
        revenus: 'Ingresos',
        deconnexion: 'Cerrar sesión',
        connexion: 'Iniciar sesión',
        inscription: 'Registrarse',
        envoyer: 'Enviar',
        annuler: 'Cancelar',
        confirmer: 'Confirmar',
        chargement: 'Cargando...',
        erreur: 'Se ha producido un error',
        points: 'puntos',
        courses: 'viajes',
        disponible: 'Disponible',
        hors_ligne: 'Desconectado',
        theme: 'Tema',
        langue: 'Idioma',
        nocturne: 'Oscuro',
        clair: 'Claro',
        auto: 'Automático',
        bonne_route: 'Buen viaje. - SESAME',
    },
};

interface LanguageContextValue {
    lang: Lang;
    setLang: (l: Lang) => void;
    t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue>({
    lang: 'fr',
    setLang: () => {},
    t: (k) => k,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [lang, setLangState] = useState<Lang>('fr');

    useEffect(() => {
        AsyncStorage.getItem('sesame_lang').then(v => {
            if (v === 'fr' || v === 'en' || v === 'it' || v === 'es') setLangState(v);
        });
    }, []);

    const setLang = (l: Lang) => {
        setLangState(l);
        AsyncStorage.setItem('sesame_lang', l);
    };

    const t = (key: string) => translations[lang][key] ?? translations['fr'][key] ?? key;

    return (
        <LanguageContext.Provider value={{ lang, setLang, t }}>
            {children}
        </LanguageContext.Provider>
    );
}

export function useLang() {
    return useContext(LanguageContext);
}
