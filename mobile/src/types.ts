export type RootStackParamList = {
    Login: undefined;
    Register: undefined;
    Onboarding: undefined;
    AmbassadorHome: undefined;
    AmbassadorAccueil: undefined;
    AmbassadorCommander: undefined;
    AmbassadorBoutique: undefined;
    AmbassadorBonsCadeaux: undefined;
    AmbassadorQRCode: undefined;
    AmbassadorParrainage: undefined;
    AmbassadorProfil: undefined;
    AmbassadorNiveaux: undefined;
    AmbassadorEquipe: undefined;
    AmbassadorCommissions: undefined;
    ChauffeurHome: undefined;
    ChauffeurCourses: undefined;
    ChauffeurProfile: undefined;
    ChauffeurRevenus: undefined;
    AdminDashboard: undefined;
    AdminAmbassadeurs: undefined;
    AdminChauffeurs: undefined;
    AdminCourses: undefined;
    AdminBlacklist: undefined;
    FournisseurValidation: undefined;
    Chat: { courseId: string; senderRole: 'ambassadeur' | 'chauffeur' | 'admin'; senderId: string; courseRef?: string; };
};

export type ChatMessage = {
    id: string;
    course_id: string;
    expediteur_type: string;
    expediteur_id: string;
    contenu: string;
    envoye_at: string;
};

export type ChauffeurDocument = {
    id: string;
    chauffeur_id: string;
    type: string;
    fichier_recto_url: string;
    fichier_verso_url?: string;
    date_expiration?: string;
    statut: 'en_attente' | 'valide' | 'refuse' | 'expire';
    uploaded_at: string;
};

export type Filleul = {
    prenom: string;
    nom: string;
    niveau: string;
    points_solde: number;
    created_at: string;
};

export type UserRole = 'ambassadeur' | 'chauffeur' | 'admin';

export type AmbassadorProfile = {
    ambassadeur_id: string;
    utilisateur_id: string;
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    type_ambassadeur: string;
    etablissement?: string;
    metier?: string;
    siret?: string;
    iban?: string;
    responsable_legal_nom?: string;
    code_parrainage?: string;
    points_solde: number;
    niveau: string;
};

export type ChauffeurProfile = {
    chauffeur_id: string;
    utilisateur_id: string;
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    disponible: boolean;
    vehicule_type: string;
    vehicule_marque?: string;
    vehicule_modele?: string;
    vehicule_couleur?: string;
    vehicule_immat?: string;
    iban?: string;
    siret?: string;
    taux_commission_override?: number | null;
    stripe_customer_id?: string | null;
    documents_valides?: boolean;
};

export type ActiveCourse = {
    id: string;
    reference?: string;
    statut?: string;
    type_course?: string;
    adresse_depart?: string;
    adresse_destination?: string;
    vehicule_type?: string;
    montant?: number;
    points_attribues?: number;
    code_validation?: string;
    code_valide_at?: string;
    date_reservation?: string;
    date_acceptation?: string;
    date_fin?: string;
    annule_par?: string;
    taux_commission_applique?: number;
};

export type AmbassadorDashboard = {
    ambassadeur_id: string;
    prenom: string;
    niveau: string;
    points_solde: number;
    code_parrainage?: string;
    active_course_count: number;
    pending_bons_count: number;
    next_level?: string | null;
    points_to_next_level: number;
    next_level_target?: number | null;
    active_courses: ActiveCourse[];
};

export type ChauffeurDashboard = {
    chauffeur_id: string;
    prenom: string;
    nom: string;
    disponible: boolean;
    vehicule_type: string;
    vehicule_marque?: string;
    vehicule_modele?: string;
    vehicule_couleur?: string;
    vehicule_immat?: string;
    taux_commission_override?: number | null;
    documents_valides?: boolean;
    active_courses_count: number;
    current_course?: ActiveCourse | null;
};

export type BoutiqueOffer = {
    id: string;
    reference?: string;
    nom: string;
    description?: string;
    pts_requis: number;
    stock?: number | null;
};

export type ExchangeBon = {
    id: string;
    reference?: string;
    offre_id: string;
    fournisseur_id: string;
    points_deduits: number;
    token_qr?: string;
    statut?: string;
    remis_at?: string;
    expire_at?: string;
};

export type AdminKpis = {
    totalCourses: number;
    totalAmbassadeurs: number;
    totalChauffeurs: number;
    pendingExchanges: number;
};

export type AdminAmbassadorRow = {
    ambassadeur_id: string;
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    points_solde: number;
    niveau: string;
    contrat_moral_signe: boolean;
};

export type AdminChauffeurRow = {
    chauffeur_id: string;
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    disponible: boolean;
    vehicule_type: string;
    vehicule_marque?: string;
    vehicule_modele?: string;
    taux_commission_override?: number | null;
    documents_valides?: boolean;
};

export type AdminCourseRow = ActiveCourse & {
    ambassadeur_id?: string;
    chauffeur_id?: string;
};

export type AdminBlacklistRow = {
    id: string;
    nom: string;
    prenom: string;
    date_naissance: string;
    lieu_naissance: string;
    telephone: string;
    motif: string;
    type_utilisateur: string;
    ajoute_par_admin_id: string;
    created_at: string;
};

export type EquipeEmployee = {
    id: string;
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    metier?: string;
    statut: 'actif' | 'suspendu';
    created_at: string;
    nb_courses: number;
};

export type CommissionMois = {
    mois: string;
    nb_courses: number;
    ca_brut_ttc: number;
    commission: number;
};
