-- SESAME database schema — 13 tables + messages_chat

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'utilisateur_type') THEN
        CREATE TYPE utilisateur_type AS ENUM ('ambassadeur', 'chauffeur', 'admin');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'utilisateur_statut') THEN
        CREATE TYPE utilisateur_statut AS ENUM ('actif', 'suspendu', 'blackliste');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'theme_type') THEN
        CREATE TYPE theme_type AS ENUM ('nocturne', 'clair', 'auto');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'langue_type') THEN
        CREATE TYPE langue_type AS ENUM ('fr', 'en', 'it', 'es');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'type_ambassadeur') THEN
        CREATE TYPE type_ambassadeur AS ENUM ('physique', 'moral');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'amb_niveau') THEN
        CREATE TYPE amb_niveau AS ENUM ('starter', 'pro', 'elite', 'black');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sous_compte_statut') THEN
        CREATE TYPE sous_compte_statut AS ENUM ('actif', 'suspendu');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vehicule_type') THEN
        CREATE TYPE vehicule_type AS ENUM ('berline', 'van');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doc_type') THEN
        CREATE TYPE doc_type AS ENUM (
            'carte_identite',
            'carte_vtc',
            'revtc',
            'kbis',
            'permis',
            'rir',
            'rc_pro',
            'rc_circulation',
            'carte_grise',
            'certificat_medical',
            'photo_profil'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_statut') THEN
        CREATE TYPE document_statut AS ENUM ('en_attente', 'valide', 'refuse', 'expire');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_statut') THEN
        CREATE TYPE course_statut AS ENUM (
            'recherche',
            'acceptee',
            'en_route',
            'code_valide',
            'en_cours',
            'terminee',
            'annulee'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_type') THEN
        CREATE TYPE course_type AS ENUM ('immediate', 'reservation');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'annule_par_type') THEN
        CREATE TYPE annule_par_type AS ENUM ('ambassadeur', 'chauffeur', 'admin');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'option_paiement_type') THEN
        CREATE TYPE option_paiement_type AS ENUM ('a', 'b', 'c');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'fournisseur_statut') THEN
        CREATE TYPE fournisseur_statut AS ENUM ('actif', 'inactif', 'suspendu', 'en_configuration');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offre_statut') THEN
        CREATE TYPE offre_statut AS ENUM ('en_ligne', 'hors_ligne');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'echange_statut') THEN
        CREATE TYPE echange_statut AS ENUM (
            'en_attente_admin',
            'valide',
            'refuse',
            'utilise',
            'expire'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blacklist_type_utilisateur') THEN
        CREATE TYPE blacklist_type_utilisateur AS ENUM ('ambassadeur', 'chauffeur');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'points_type') THEN
        CREATE TYPE points_type AS ENUM (
            'gain',
            'depense',
            'compensation',
            'sanction',
            'parrainage',
            'expiration'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sanctions_statut') THEN
        CREATE TYPE sanctions_statut AS ENUM ('en_attente', 'execute');
    END IF;
END $$;

-- 3.1 utilisateurs
CREATE TABLE IF NOT EXISTS utilisateurs (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type                utilisateur_type NOT NULL,
    prenom              varchar(100) NOT NULL,
    nom                 varchar(100) NOT NULL,
    email               varchar(255) UNIQUE NOT NULL,
    telephone           varchar(20) UNIQUE NOT NULL,
    mot_de_passe_hash   varchar(255) NOT NULL,
    date_naissance      date,
    lieu_naissance      varchar(100),
    pays_naissance      varchar(100),
    statut              utilisateur_statut NOT NULL DEFAULT 'actif',
    theme               theme_type NOT NULL DEFAULT 'nocturne',
    langue              langue_type NOT NULL DEFAULT 'fr',
    created_at          timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.2 ambassadeurs
CREATE TABLE IF NOT EXISTS ambassadeurs (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id          uuid REFERENCES utilisateurs (id),
    type_ambassadeur        type_ambassadeur NOT NULL DEFAULT 'physique',
    etablissement           varchar(200),
    metier                  varchar(100),
    siret                   varchar(14),
    iban                    varchar(50),
    responsable_legal_nom   varchar(200),
    code_parrainage         varchar(10) UNIQUE,
    parrain_id              uuid REFERENCES ambassadeurs (id),
    points_solde            integer DEFAULT 0,
    niveau                  amb_niveau NOT NULL DEFAULT 'starter',
    contrat_moral_signe     boolean DEFAULT FALSE,
    contrat_moral_signe_at  timestamp with time zone
);

-- 3.3 sous_comptes_employes
CREATE TABLE IF NOT EXISTS sous_comptes_employes (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_moral_id    uuid REFERENCES ambassadeurs (id),
    utilisateur_id          uuid REFERENCES utilisateurs (id),
    metier                  varchar(100),
    statut                  sous_compte_statut NOT NULL DEFAULT 'actif',
    created_at              timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.4 chauffeurs
CREATE TABLE IF NOT EXISTS chauffeurs (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id              uuid REFERENCES utilisateurs (id),
    disponible                  boolean NOT NULL DEFAULT false,
    vehicule_type               vehicule_type NOT NULL,
    vehicule_marque             varchar(100),
    vehicule_modele             varchar(100),
    vehicule_couleur            varchar(50),
    vehicule_immat              varchar(20),
    taux_commission_override    numeric(5, 2),
    iban                        varchar(50),
    siret                       varchar(14),
    stripe_customer_id          varchar(100),
    documents_valides           boolean NOT NULL DEFAULT false
);

-- 3.5 documents_chauffeur
CREATE TABLE IF NOT EXISTS documents_chauffeur (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chauffeur_id        uuid REFERENCES chauffeurs (id) ON DELETE CASCADE,
    type                doc_type NOT NULL,
    fichier_recto_url   varchar(500) NOT NULL,
    fichier_verso_url   varchar(500),
    date_expiration     date,
    statut              document_statut NOT NULL DEFAULT 'en_attente',
    valide_par_admin_id uuid,
    uploaded_at         timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.6 courses
CREATE TABLE IF NOT EXISTS courses (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference                   varchar(20) UNIQUE,
    ambassadeur_id              uuid REFERENCES ambassadeurs (id),
    chauffeur_id                uuid REFERENCES chauffeurs (id),
    statut                      course_statut,
    type_course                 course_type,
    adresse_depart              text NOT NULL,
    adresse_destination         text NOT NULL,
    vehicule_type               vehicule_type,
    montant                     decimal(10, 2),
    taux_commission_applique    decimal(5, 2),
    code_validation             varchar(4),
    code_valide_at              timestamp with time zone,
    points_attribues            integer DEFAULT 0,
    compensation                boolean DEFAULT FALSE,
    date_reservation            timestamp with time zone,
    date_acceptation            timestamp with time zone,
    date_fin                    timestamp with time zone,
    date_annulation             timestamp with time zone,
    annule_par                  annule_par_type,
    note_interne                text
);

-- 3.7 points_historique
CREATE TABLE IF NOT EXISTS points_historique (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id  uuid REFERENCES ambassadeurs (id),
    type            points_type NOT NULL,
    montant         integer NOT NULL,
    solde_avant     integer NOT NULL,
    solde_apres     integer NOT NULL,
    course_id       uuid REFERENCES courses (id),
    description     varchar(500),
    created_at      timestamp with time zone NOT NULL DEFAULT now()
);

-- 3.8 sanctions_en_attente
CREATE TABLE IF NOT EXISTS sanctions_en_attente (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id  uuid REFERENCES ambassadeurs (id),
    points          integer NOT NULL,
    motif           text NOT NULL,
    course_id       uuid REFERENCES courses (id),
    decide_at       timestamp with time zone NOT NULL DEFAULT now(),
    execute_at      timestamp with time zone,
    statut          sanctions_statut NOT NULL DEFAULT 'en_attente'
);

-- 3.9 fournisseurs
CREATE TABLE IF NOT EXISTS fournisseurs (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom_societe                 varchar(200) NOT NULL,
    siret                       varchar(14),
    iban                        varchar(50),
    legal_prenom                varchar(100),
    legal_nom                   varchar(100),
    legal_email                 varchar(255),
    legal_telephone             varchar(20),
    legal_adresse               text,
    legal_cp                    varchar(10),
    legal_ville                 varchar(100),
    prest_prenom                varchar(100),
    prest_nom                   varchar(100),
    prest_telephone             varchar(20),
    prest_email                 varchar(255),
    prest_adresse               text,
    prest_cp                    varchar(10),
    prest_ville                 varchar(100),
    memes_coordonnees           boolean NOT NULL DEFAULT false,
    code_secret_hash            varchar(255),
    nb_tentatives_echouees      integer NOT NULL DEFAULT 0,
    bloque                      boolean NOT NULL DEFAULT false,
    contrat_signe               boolean NOT NULL DEFAULT false,
    contrat_signe_at            timestamp with time zone,
    option_paiement             option_paiement_type NOT NULL DEFAULT 'c',
    statut                      fournisseur_statut NOT NULL DEFAULT 'en_configuration'
);

-- 3.10 offres_boutique
CREATE TABLE IF NOT EXISTS offres_boutique (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fournisseur_id          uuid REFERENCES fournisseurs (id),
    reference               varchar(20) UNIQUE,
    nom                     varchar(200) NOT NULL,
    description             text,
    stock                   integer,
    pts_requis              integer NOT NULL,
    tarif_fournisseur_ht    decimal(10, 2),
    validite_bon_mois       integer NOT NULL,
    statut                  offre_statut NOT NULL DEFAULT 'hors_ligne'
);

-- 3.11 echanges
CREATE TABLE IF NOT EXISTS echanges (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    reference           varchar(20) UNIQUE,
    ambassadeur_id      uuid REFERENCES ambassadeurs (id),
    offre_id            uuid REFERENCES offres_boutique (id),
    fournisseur_id      uuid REFERENCES fournisseurs (id),
    points_deduits      integer NOT NULL,
    token_qr            varchar(255) UNIQUE,
    statut              echange_statut,
    remis_at            timestamp with time zone,
    expire_at           timestamp with time zone,
    utilise_at          timestamp with time zone,
    valide_par_admin_id uuid
);

-- 3.12 blacklist
CREATE TABLE IF NOT EXISTS blacklist (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nom                         varchar(100) NOT NULL,
    prenom                      varchar(100) NOT NULL,
    date_naissance              date NOT NULL,
    lieu_naissance              varchar(100) NOT NULL,
    telephone                   varchar(20) NOT NULL,
    motif                       text,
    type_utilisateur            blacklist_type_utilisateur,
    ajoute_par_admin_id         uuid NOT NULL,
    created_at                  timestamp with time zone NOT NULL DEFAULT now(),
    tentatives_reinscription    jsonb NOT NULL DEFAULT '[]'
);

-- 3.13 parametres_systeme
CREATE TABLE IF NOT EXISTS parametres_systeme (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    cle         varchar(100) UNIQUE NOT NULL,
    valeur      text NOT NULL,
    description text,
    updated_at  timestamp with time zone NOT NULL DEFAULT now()
);

-- messages_chat (Specs Techniques 2.11 + API Chat)
CREATE TABLE IF NOT EXISTS messages_chat (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id       uuid REFERENCES courses (id) ON DELETE CASCADE,
    expediteur_type varchar(20) NOT NULL CHECK (expediteur_type IN ('ambassadeur', 'chauffeur', 'admin')),
    expediteur_id   uuid NOT NULL,
    contenu         text NOT NULL,
    envoye_at       timestamp with time zone NOT NULL DEFAULT now()
);

-- Valeurs initiales parametres_systeme
INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'taux_commission_global', '20', 'Taux SESAME en pourcentage (variable par admin)'
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'taux_commission_global');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'mode_course_immediate', 'false', 'false = reservation uniquement / true = 2 modes actifs'
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'mode_course_immediate');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'delai_minimum_reservation_heures', '1', 'Delai minimum en heures avant le depart'
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'delai_minimum_reservation_heures');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'indemnisation_chauffeur_defaut', '5.00', 'Montant en EUR pour client absent'
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'indemnisation_chauffeur_defaut');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'berline_forfait', '12.00', NULL
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'berline_forfait');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'berline_seuil_km', '6', NULL
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'berline_seuil_km');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'berline_prix_km', '2.00', NULL
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'berline_prix_km');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'van_forfait', '12.00', NULL
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'van_forfait');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'van_seuil_km', '6', NULL
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'van_seuil_km');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'van_prix_km', '3.00', NULL
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'van_prix_km');

INSERT INTO parametres_systeme (cle, valeur, description)
SELECT 'commission_ambassadeur_moral_pct', '10', 'Commission en % pour Ambassadeur Moral'
WHERE NOT EXISTS (SELECT 1 FROM parametres_systeme WHERE cle = 'commission_ambassadeur_moral_pct');

-- Row Level Security sur toutes les tables
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
ALTER TABLE messages_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametres_systeme ENABLE ROW LEVEL SECURITY;
