-- SESAME database schema for Supabase
-- Alignement complet avec le cahier des charges Mai 2026

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- TYPES & ENUMS
CREATE TYPE utilisateur_type AS ENUM ('ambassadeur', 'chauffeur', 'admin');
CREATE TYPE utilisateur_statut AS ENUM ('actif', 'suspendu', 'blackliste');
CREATE TYPE theme_type AS ENUM ('nocturne', 'clair', 'auto');
CREATE TYPE langue_type AS ENUM ('fr', 'en', 'it', 'es');
CREATE TYPE type_ambassadeur AS ENUM ('physique', 'moral');
CREATE TYPE amb_statut_commande AS ENUM ('libre', 'restreint', 'suspendu');
CREATE TYPE amb_niveau AS ENUM ('starter', 'pro', 'elite', 'black');
CREATE TYPE sous_compte_statut AS ENUM ('actif', 'suspendu');
CREATE TYPE vehicule_type AS ENUM ('berline', 'van');
CREATE TYPE doc_type AS ENUM ('carte_identite', 'carte_vtc', 'revtc', 'kbis', 'permis', 'rir', 'rc_pro', 'rc_circulation', 'carte_grise', 'certificat_medical', 'photo_profil');
CREATE TYPE document_statut AS ENUM ('en_attente', 'valide', 'refuse', 'expire');
CREATE TYPE course_statut AS ENUM ('recherche', 'acceptee', 'en_route', 'code_valide', 'en_cours', 'terminee', 'annulee');
CREATE TYPE course_type AS ENUM ('immediate', 'reservation');
CREATE TYPE annule_par_type AS ENUM ('ambassadeur', 'chauffeur', 'admin');
CREATE TYPE points_type AS ENUM ('gain', 'depense', 'compensation', 'sanction', 'parrainage', 'expiration');
CREATE TYPE sanctions_statut AS ENUM ('en_attente', 'execute');
CREATE TYPE option_paiement_type AS ENUM ('a', 'b', 'c');
CREATE TYPE fournisseur_statut AS ENUM ('actif', 'inactif', 'suspendu', 'en_configuration');
CREATE TYPE offre_statut AS ENUM ('en_ligne', 'hors_ligne');
CREATE TYPE echange_statut AS ENUM ('en_attente_admin', 'valide', 'refuse', 'utilise', 'expire');
CREATE TYPE blacklist_type_utilisateur AS ENUM ('ambassadeur', 'chauffeur');

-- TABLES
CREATE TABLE IF NOT EXISTS utilisateurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type utilisateur_type NOT NULL,
    prenom varchar(100) NOT NULL,
    nom varchar(100) NOT NULL,
    email varchar(255) UNIQUE NOT NULL,
    telephone varchar(20) UNIQUE NOT NULL,
    mot_de_passe_hash varchar(255) NOT NULL,
    date_naissance date,
    lieu_naissance varchar(100),
    pays_naissance varchar(100),
    statut utilisateur_statut NOT NULL DEFAULT 'actif',
    theme theme_type NOT NULL DEFAULT 'nocturne',
    langue langue_type NOT NULL DEFAULT 'fr',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ambassadeurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id uuid REFERENCES utilisateurs(id),
    type_ambassadeur type_ambassadeur NOT NULL,
    etablissement varchar(200),
    metier varchar(100),
    siret varchar(14),
    iban varchar(50),
    responsable_legal_nom varchar(200),
    code_parrainage varchar(10) UNIQUE,
    parrain_id uuid REFERENCES ambassadeurs(id),
    points_solde integer DEFAULT 0,
    niveau amb_niveau NOT NULL DEFAULT 'starter',
    contrat_moral_signe boolean DEFAULT FALSE,
    contrat_moral_signe_at timestamp with time zone
);

CREATE TABLE IF NOT EXISTS sous_comptes_employes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_moral_id uuid REFERENCES ambassadeurs(id),
    utilisateur_id uuid REFERENCES utilisateurs(id),
    metier varchar(100),
    statut sous_compte_statut NOT NULL DEFAULT 'actif',
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chauffeurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id uuid REFERENCES utilisateurs(id),
    disponible boolean DEFAULT FALSE,
    vehicule_type vehicule_type,
    vehicule_marque varchar(100),
    vehicule_modele varchar(100),
    vehicule_couleur varchar(50),
    vehicule_immat varchar(20),
    taux_commission_override decimal(5,2),
    iban varchar(50),
    siret varchar(14),
    stripe_customer_id varchar(100),
    documents_valides boolean DEFAULT FALSE,
    note_moyenne decimal(3,2)
);

CREATE TABLE IF NOT EXISTS documents_chauffeur (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chauffeur_id uuid REFERENCES chauffeurs(id),
    type doc_type NOT NULL,
    fichier_recto_url varchar(500),
    fichier_verso_url varchar(500),
    date_expiration date,
    statut document_statut NOT NULL DEFAULT 'en_attente',
    valide_par_admin_id uuid,
    uploaded_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference varchar(20) UNIQUE,
    ambassadeur_id uuid REFERENCES ambassadeurs(id),
    chauffeur_id uuid REFERENCES chauffeurs(id),
    statut course_statut,
    type course_type,
    adresse_depart text NOT NULL,
    adresse_destination text NOT NULL,
    vehicule_type vehicule_type,
    montant decimal(10,2),
    distance_km decimal(10,2),
    taux_commission_applique decimal(5,2),
    code_validation varchar(4),
    code_valide_at timestamp with time zone,
    points_attribues integer DEFAULT 0,
    compensation boolean DEFAULT FALSE,
    date_reservation timestamp with time zone,
    date_acceptation timestamp with time zone,
    date_fin timestamp with time zone,
    date_annulation timestamp with time zone,
    annule_par annule_par_type,
    note_interne text
);

CREATE TABLE IF NOT EXISTS messages_chat (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id uuid REFERENCES courses(id),
    expediteur_type utilisateur_type NOT NULL,
    expediteur_id uuid,
    contenu text NOT NULL,
    envoye_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS points_historique (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id uuid REFERENCES ambassadeurs(id),
    type points_type,
    montant integer NOT NULL,
    solde_avant integer NOT NULL,
    solde_apres integer NOT NULL,
    course_id uuid,
    description varchar(500),
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sanctions_en_attente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id uuid REFERENCES ambassadeurs(id),
    points integer NOT NULL,
    motif text,
    course_id uuid,
    decide_at timestamp with time zone NOT NULL DEFAULT now(),
    execute_at timestamp with time zone,
    statut sanctions_statut NOT NULL DEFAULT 'en_attente'
);

CREATE TABLE IF NOT EXISTS fournisseurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom_societe varchar(200) NOT NULL,
    siret varchar(14),
    iban varchar(50),
    legal_prenom varchar(100),
    legal_nom varchar(100),
    legal_email varchar(255),
    legal_telephone varchar(20),
    legal_adresse text,
    prest_prenom varchar(100),
    prest_nom varchar(100),
    prest_telephone varchar(20),
    prest_email varchar(255),
    prest_adresse text,
    memes_coordonnees boolean DEFAULT FALSE,
    code_secret varchar(4),
    code_secret_hash varchar(255),
    nb_tentatives_echouees integer DEFAULT 0,
    bloque boolean DEFAULT FALSE,
    contrat_signe boolean DEFAULT FALSE,
    contrat_signe_at timestamp with time zone,
    option_paiement option_paiement_type NOT NULL DEFAULT 'c',
    statut fournisseur_statut NOT NULL DEFAULT 'en_configuration'
);

CREATE TABLE IF NOT EXISTS offres_boutique (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fournisseur_id uuid REFERENCES fournisseurs(id),
    reference varchar(20) UNIQUE,
    nom varchar(200) NOT NULL,
    description text,
    stock integer,
    pts_requis integer NOT NULL,
    tarif_fournisseur decimal(10,2),
    validite_bon_mois integer NOT NULL,
    statut offre_statut NOT NULL DEFAULT 'hors_ligne'
);

CREATE TABLE IF NOT EXISTS echanges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference varchar(20) UNIQUE,
    ambassadeur_id uuid REFERENCES ambassadeurs(id),
    offre_id uuid REFERENCES offres_boutique(id),
    fournisseur_id uuid REFERENCES fournisseurs(id),
    points_deduits integer NOT NULL,
    token_qr varchar(255) UNIQUE,
    token_expire boolean DEFAULT FALSE,
    statut echange_statut,
    remis_at timestamp with time zone,
    expire_at timestamp with time zone,
    utilise_at timestamp with time zone,
    valide_par_admin_id uuid
);

CREATE TABLE IF NOT EXISTS blacklist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom_prenom varchar(100) NOT NULL,
    date_naissance date NOT NULL,
    lieu_naissance varchar(100) NOT NULL,
    telephone varchar(20) NOT NULL,
    motif text,
    type_utilisateur blacklist_type_utilisateur,
    ajoute_par_admin_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    tentatives_reinscription jsonb NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS parametres_systeme (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cle varchar(100) UNIQUE NOT NULL,
    valeur text NOT NULL,
    description text,
    updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- INITIAL PARAMETERS
INSERT INTO parametres_systeme (cle, valeur, description) VALUES
    ('taux_commission_global', '20', 'Taux SESAME en pourcentage'),
    ('mode_course_immediate', 'true', 'true = activé / false = désactivé'),
    ('delai_minimum_reservation_heures', '1', 'Délai minimum pour une réservation'),
    ('berline_forfait', '12.00', 'Prix minimum Berline'),
    ('berline_seuil_km', '6', 'KM inclus dans le forfait Berline'),
    ('berline_prix_km', '2.00', 'Prix au KM après seuil Berline'),
    ('van_forfait', '12.00', 'Prix minimum Van'),
    ('van_seuil_km', '6', 'KM inclus dans le forfait Van'),
    ('van_prix_km', '3.00', 'Prix au KM après seuil Van')
ON CONFLICT (cle) DO UPDATE SET valeur = EXCLUDED.valeur;

-- RLS (Optionnel si tu gères via l'API, mais recommandé pour Supabase)
ALTER TABLE utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ambassadeurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sous_comptes_employes ENABLE ROW LEVEL SECURITY;
ALTER TABLE chauffeurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents_chauffeur ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE points_historique ENABLE ROW LEVEL SECURITY;
ALTER TABLE sanctions_en_attente ENABLE ROW LEVEL SECURITY;
ALTER TABLE fournisseurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE offres_boutique ENABLE ROW LEVEL SECURITY;
ALTER TABLE echanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres_systeme ENABLE ROW LEVEL SECURITY;
