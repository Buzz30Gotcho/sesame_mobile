-- ============================================================
-- SESAME — Schema complet (reset total)
-- Coller dans Supabase SQL Editor pour repartir de zéro
-- ⚠ Supprime TOUTES les données existantes
-- ============================================================

-- ─── 1. SUPPRESSION (ordre inverse des dépendances) ─────────
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS admin_securite CASCADE;
DROP TABLE IF EXISTS ticket_messages CASCADE;
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS litiges CASCADE;
DROP TABLE IF EXISTS controles_identite CASCADE;
DROP TABLE IF EXISTS virements_commissions CASCADE;
DROP TABLE IF EXISTS commissions_moraux CASCADE;
DROP TABLE IF EXISTS blacklist_propositions CASCADE;
DROP TABLE IF EXISTS parrainage_paliers CASCADE;
DROP TABLE IF EXISTS messages_chat CASCADE;

DROP TABLE IF EXISTS points_historique CASCADE;

DROP TABLE IF EXISTS sanctions_en_attente CASCADE;

DROP TABLE IF EXISTS echanges CASCADE;

DROP TABLE IF EXISTS offres_boutique CASCADE;

DROP TABLE IF EXISTS documents_chauffeur CASCADE;

DROP TABLE IF EXISTS sous_comptes_employes CASCADE;

DROP TABLE IF EXISTS courses CASCADE;

DROP TABLE IF EXISTS chauffeurs CASCADE;

DROP TABLE IF EXISTS ambassadeurs CASCADE;

DROP TABLE IF EXISTS utilisateurs CASCADE;

DROP TABLE IF EXISTS fournisseurs CASCADE;

DROP TABLE IF EXISTS blacklist CASCADE;

DROP TABLE IF EXISTS parametres_systeme CASCADE;

DROP TYPE IF EXISTS utilisateur_type CASCADE;

DROP TYPE IF EXISTS utilisateur_statut CASCADE;

DROP TYPE IF EXISTS theme_type CASCADE;

DROP TYPE IF EXISTS langue_type CASCADE;

DROP TYPE IF EXISTS type_ambassadeur CASCADE;

DROP TYPE IF EXISTS amb_niveau CASCADE;

DROP TYPE IF EXISTS sous_compte_statut CASCADE;

DROP TYPE IF EXISTS vehicule_type CASCADE;

DROP TYPE IF EXISTS doc_type CASCADE;

DROP TYPE IF EXISTS document_statut CASCADE;

DROP TYPE IF EXISTS course_statut CASCADE;

DROP TYPE IF EXISTS course_type CASCADE;

DROP TYPE IF EXISTS annule_par_type CASCADE;

DROP TYPE IF EXISTS option_paiement_type CASCADE;

DROP TYPE IF EXISTS fournisseur_statut CASCADE;

DROP TYPE IF EXISTS offre_statut CASCADE;

DROP TYPE IF EXISTS echange_statut CASCADE;

DROP TYPE IF EXISTS blacklist_type_utilisateur CASCADE;

DROP TYPE IF EXISTS points_type CASCADE;

DROP TYPE IF EXISTS sanctions_statut CASCADE;

-- ─── 2. EXTENSION ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 3. TYPES ENUM ───────────────────────────────────────────
CREATE TYPE utilisateur_type AS ENUM ('ambassadeur', 'chauffeur', 'admin');

CREATE TYPE utilisateur_statut AS ENUM ('actif', 'suspendu', 'blackliste');

CREATE TYPE theme_type AS ENUM ('nocturne', 'clair', 'auto');

CREATE TYPE langue_type AS ENUM ('fr', 'en', 'it', 'es');

CREATE TYPE type_ambassadeur AS ENUM ('physique', 'moral');

CREATE TYPE amb_niveau AS ENUM ('starter', 'pro', 'elite', 'black');

CREATE TYPE sous_compte_statut AS ENUM ('actif', 'suspendu');

CREATE TYPE vehicule_type AS ENUM ('berline', 'van');

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

CREATE TYPE document_statut AS ENUM ('en_attente', 'valide', 'refuse', 'expire');

CREATE TYPE course_statut AS ENUM (
    'recherche',
    'acceptee',
    'en_route',
    'code_valide',
    'en_cours',
    'terminee',
    'annulee'
);

CREATE TYPE course_type AS ENUM ('immediate', 'reservation');

CREATE TYPE annule_par_type AS ENUM ('ambassadeur', 'chauffeur', 'admin');

CREATE TYPE option_paiement_type AS ENUM ('a', 'b', 'c');

CREATE TYPE fournisseur_statut AS ENUM ('actif', 'inactif', 'suspendu', 'en_configuration');

CREATE TYPE offre_statut AS ENUM ('en_ligne', 'hors_ligne');

CREATE TYPE echange_statut AS ENUM (
    'en_attente_admin',
    'valide',
    'refuse',
    'utilise',
    'expire'
);

CREATE TYPE blacklist_type_utilisateur AS ENUM ('ambassadeur', 'chauffeur');

CREATE TYPE points_type AS ENUM (
    'gain',
    'depense',
    'compensation',
    'sanction',
    'parrainage',
    'expiration'
);

CREATE TYPE sanctions_statut AS ENUM ('en_attente', 'execute');

-- ─── 4. TABLES ───────────────────────────────────────────────

-- 3.1 utilisateurs
CREATE TABLE utilisateurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
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
    reset_code varchar(6),
    reset_code_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2 ambassadeurs
CREATE TABLE ambassadeurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    utilisateur_id uuid REFERENCES utilisateurs (id),
    type_ambassadeur type_ambassadeur NOT NULL DEFAULT 'physique',
    etablissement varchar(200),
    metier varchar(100),
    siret varchar(14),
    iban varchar(50),
    responsable_legal_nom varchar(200),
    code_parrainage varchar(10) UNIQUE,
    parrain_id uuid REFERENCES ambassadeurs (id),
    points_solde integer DEFAULT 0,
    niveau amb_niveau NOT NULL DEFAULT 'starter',
    contrat_moral_signe boolean DEFAULT false,
    contrat_moral_signe_at timestamptz,
    push_token varchar(200),
    restriction_commande_jusqu_au timestamptz,
    note_interne text
);

-- 3.3 sous_comptes_employes
CREATE TABLE sous_comptes_employes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    ambassadeur_moral_id uuid REFERENCES ambassadeurs (id),
    utilisateur_id uuid REFERENCES utilisateurs (id),
    metier varchar(100),
    statut sous_compte_statut NOT NULL DEFAULT 'actif',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4 chauffeurs
CREATE TABLE chauffeurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    utilisateur_id uuid REFERENCES utilisateurs (id),
    disponible boolean NOT NULL DEFAULT false,
    vehicule_type vehicule_type NOT NULL,
    vehicule_marque varchar(100),
    vehicule_modele varchar(100),
    vehicule_couleur varchar(50),
    vehicule_immat varchar(20),
    taux_commission_override numeric(5, 2),
    iban varchar(50),
    siret varchar(14),
    stripe_customer_id varchar(100),
    documents_valides boolean NOT NULL DEFAULT false,
    push_token varchar(200),
    note_interne text,
    derniere_lat double precision,
    derniere_lon double precision,
    position_maj_at timestamptz,
    carte_enregistree boolean DEFAULT false
);

-- 3.5 documents_chauffeur
CREATE TABLE documents_chauffeur (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    chauffeur_id uuid REFERENCES chauffeurs (id) ON DELETE CASCADE,
    type doc_type NOT NULL,
    fichier_recto_url varchar(500),
    fichier_verso_url varchar(500),
    date_expiration date,
    statut document_statut NOT NULL DEFAULT 'en_attente',
    motif_refus text,
    valide_par_admin_id uuid,
    uploaded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (chauffeur_id, type)
);

-- 3.6 courses
CREATE TABLE courses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    reference varchar(20) UNIQUE,
    ambassadeur_id uuid REFERENCES ambassadeurs (id),
    chauffeur_id uuid REFERENCES chauffeurs (id),
    statut course_statut,
    type_course course_type,
    adresse_depart text NOT NULL,
    adresse_destination text NOT NULL,
    vehicule_type vehicule_type,
    montant decimal(10, 2),
    distance_km numeric(6, 1),
    taux_commission_applique decimal(5, 2),
    code_validation varchar(4),
    code_valide_at timestamptz,
    points_attribues integer DEFAULT 0,
    compensation boolean DEFAULT false,
    date_reservation timestamptz,
    date_acceptation timestamptz,
    date_arrivee timestamptz,
    date_fin timestamptz,
    date_annulation timestamptz,
    annule_par annule_par_type,
    note_interne text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7 points_historique
CREATE TABLE points_historique (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    ambassadeur_id uuid REFERENCES ambassadeurs (id),
    type points_type NOT NULL,
    montant integer NOT NULL,
    solde_avant integer NOT NULL,
    solde_apres integer NOT NULL,
    course_id uuid REFERENCES courses (id),
    description varchar(500),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.8 sanctions_en_attente
CREATE TABLE sanctions_en_attente (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    ambassadeur_id uuid REFERENCES ambassadeurs (id),
    points integer NOT NULL,
    motif text NOT NULL,
    course_id uuid REFERENCES courses (id),
    decide_at timestamptz NOT NULL DEFAULT now(),
    execute_at timestamptz,
    statut sanctions_statut NOT NULL DEFAULT 'en_attente'
);

-- 3.9 fournisseurs
CREATE TABLE fournisseurs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    nom_societe varchar(200) NOT NULL,
    siret varchar(14),
    iban varchar(50),
    legal_prenom varchar(100),
    legal_nom varchar(100),
    legal_email varchar(255),
    legal_telephone varchar(20),
    legal_adresse text,
    legal_cp varchar(10),
    legal_ville varchar(100),
    prest_prenom varchar(100),
    prest_nom varchar(100),
    prest_telephone varchar(20),
    prest_email varchar(255),
    prest_adresse text,
    prest_cp varchar(10),
    prest_ville varchar(100),
    memes_coordonnees boolean NOT NULL DEFAULT false,
    code_secret_hash varchar(255),
    nb_tentatives_echouees integer NOT NULL DEFAULT 0,
    bloque boolean NOT NULL DEFAULT false,
    contrat_signe boolean NOT NULL DEFAULT false,
    contrat_signe_at timestamptz,
    option_paiement option_paiement_type NOT NULL DEFAULT 'c',
    statut fournisseur_statut NOT NULL DEFAULT 'en_configuration'
);

-- 3.10 offres_boutique
CREATE TABLE offres_boutique (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    fournisseur_id uuid REFERENCES fournisseurs (id),
    reference varchar(20) UNIQUE,
    nom varchar(200) NOT NULL,
    description text,
    stock integer,
    pts_requis integer NOT NULL,
    tarif_fournisseur_ht decimal(10, 2),
    validite_bon_mois integer NOT NULL,
    statut offre_statut NOT NULL DEFAULT 'hors_ligne'
);

-- 3.11 echanges
CREATE TABLE echanges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    reference varchar(20) UNIQUE,
    ambassadeur_id uuid REFERENCES ambassadeurs (id),
    offre_id uuid REFERENCES offres_boutique (id),
    fournisseur_id uuid REFERENCES fournisseurs (id),
    points_deduits integer NOT NULL,
    token_qr varchar(255) UNIQUE,
    statut echange_statut,
    remis_at timestamptz,
    expire_at timestamptz,
    utilise_at timestamptz,
    valide_par_admin_id uuid,
    paiement_paye_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3.12 blacklist
CREATE TABLE blacklist (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    nom varchar(100) NOT NULL,
    prenom varchar(100) NOT NULL,
    date_naissance date NOT NULL,
    lieu_naissance varchar(100) NOT NULL,
    telephone varchar(20) NOT NULL,
    motif text,
    type_utilisateur blacklist_type_utilisateur,
    ajoute_par_admin_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    tentatives_reinscription jsonb NOT NULL DEFAULT '[]'
);

-- 3.13 parametres_systeme
CREATE TABLE parametres_systeme (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    cle varchar(100) UNIQUE NOT NULL,
    valeur text NOT NULL,
    description text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- messages_chat
CREATE TABLE messages_chat (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
    course_id uuid REFERENCES courses (id) ON DELETE CASCADE,
    expediteur_type varchar(20) NOT NULL CHECK (
        expediteur_type IN (
            'ambassadeur',
            'chauffeur',
            'admin'
        )
    ),
    expediteur_id uuid NOT NULL,
    contenu text NOT NULL,
    envoye_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. VALEURS INITIALES ────────────────────────────────────
INSERT INTO
    parametres_systeme (cle, valeur, description)
VALUES (
        'taux_commission_global',
        '20',
        'Taux SESAME en pourcentage (variable par admin)'
    ),
    (
        'mode_course_immediate',
        'true',
        'false = reservation uniquement / true = 2 modes actifs'
    ),
    (
        'delai_minimum_reservation_heures',
        '1',
        'Delai minimum en heures avant le depart'
    ),
    (
        'indemnisation_chauffeur_defaut',
        '5.00',
        'Montant en EUR pour client absent'
    ),
    (
        'berline_forfait',
        '12.00',
        NULL
    ),
    ('berline_seuil_km', '6', NULL),
    (
        'berline_prix_km',
        '2.00',
        NULL
    ),
    ('van_forfait', '12.00', NULL),
    ('van_seuil_km', '6', NULL),
    ('van_prix_km', '3.00', NULL),
    (
        'commission_ambassadeur_moral_pct',
        '10',
        'Commission en % pour Ambassadeur Moral'
    ),
    -- Paramètres > Informations (specs §5.4)
    ('plateforme_nom', 'SESAME', 'Nom de la plateforme'),
    ('contact_email', 'contact@sesame-pro.com', 'Email de contact public'),
    ('contact_telephone', '07 45 20 70 06', 'Téléphone de contact public'),
    ('maintenance_active', 'false', 'Mode maintenance (true = app en pause)'),
    ('maintenance_message', '', 'Message affiché pendant la maintenance'),
    -- Paramètres > Notifications (specs §5.4)
    ('notif_push_active', 'true', 'Canal push global activé'),
    ('notif_email_active', 'true', 'Canal email global activé'),
    ('notif_sms_active', 'false', 'Canal SMS global activé'),
    ('alerte_doc_jours', '15,7,0', 'Jours avant expiration des alertes documents'),
    -- Paramètres > Sécurité (specs §5.4)
    ('session_duree_heures', '4', 'Durée de validité du token admin (heures)'),
    ('admin_ip_whitelist', '', 'IPs autorisées pour l''admin (séparées par virgule ; vide = toutes)');

-- ─── 6. ROW LEVEL SECURITY ───────────────────────────────────
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

-- Tables additionnelles
CREATE TABLE IF NOT EXISTS parrainage_paliers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    filleul_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
    parrain_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
    cle varchar(20) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(filleul_id, cle)
);

CREATE TABLE IF NOT EXISTS blacklist_propositions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE UNIQUE,
    motif text NOT NULL,
    nb_annulations integer NOT NULL DEFAULT 0,
    statut varchar(30) NOT NULL DEFAULT 'en_attente_admin',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commissions_moraux (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
    montant numeric(10,2) NOT NULL,
    ca_mois numeric(10,2) NOT NULL,
    taux numeric(5,2) NOT NULL,
    mois_reference varchar(50) NOT NULL,
    statut varchar(20) NOT NULL DEFAULT 'en_attente',
    created_at timestamptz NOT NULL DEFAULT now(),
    vire_at timestamptz
);

-- Trace des virements de commissions déclenchés par l'admin (specs : « statut versement »).
-- mois = premier jour du mois concerné. UNIQUE → un seul virement par entreprise et par mois.
CREATE TABLE IF NOT EXISTS virements_commissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassadeur_id uuid REFERENCES ambassadeurs(id) ON DELETE CASCADE,
    mois date NOT NULL,
    nb_courses integer NOT NULL DEFAULT 0,
    ca_brut_ttc numeric(10,2) NOT NULL DEFAULT 0,
    taux_pct numeric(5,2) NOT NULL,
    montant_commission numeric(10,2) NOT NULL DEFAULT 0,
    statut varchar(20) NOT NULL DEFAULT 'verse',
    date_versement timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(ambassadeur_id, mois)
);

-- Journal des contrôles d'identité chauffeur (specs §5.1 / §9.1 : « Log de chaque contrôle »).
-- resultat = 'conforme' (course continue) ou 'non_conforme' (suspension immédiate du chauffeur).
CREATE TABLE controles_identite (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    chauffeur_id uuid REFERENCES chauffeurs(id) ON DELETE CASCADE,
    admin_id     uuid,
    resultat     varchar(20) NOT NULL,
    note         text,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_controles_identite_chauffeur ON controles_identite(chauffeur_id, created_at DESC);

-- Litiges / dossiers de contentieux (specs §9.2). Création manuelle ou automatique
-- (annulation admin, suspension contrôle identité non conforme, Cas B course interrompue).
-- type   : code_invalide | course_non_effectuee | comportement | paiement_conteste | annulation_litigieuse
-- statut : ouvert | en_analyse | clos   |   origine : manuel | auto
CREATE TABLE litiges (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id      uuid REFERENCES courses(id) ON DELETE SET NULL,
    ambassadeur_id uuid REFERENCES ambassadeurs(id) ON DELETE SET NULL,
    chauffeur_id   uuid REFERENCES chauffeurs(id) ON DELETE SET NULL,
    type           varchar(30) NOT NULL,
    statut         varchar(20) NOT NULL DEFAULT 'ouvert',
    origine        varchar(20) NOT NULL DEFAULT 'manuel',
    description    text,
    decision       text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    closed_at      timestamptz
);
CREATE INDEX idx_litiges_statut ON litiges(statut, created_at DESC);

-- Tickets de support (specs §3.6 / §10). L'utilisateur (ambassadeur ou chauffeur) ouvre un ticket
-- depuis l'app ; l'admin répond depuis le dashboard. categorie : probleme_course | paiement_points
-- | document_refuse | question_compte | autre   ·   statut : ouvert | en_cours | resolu
CREATE TABLE tickets (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    utilisateur_id uuid REFERENCES utilisateurs(id) ON DELETE CASCADE,
    categorie      varchar(30) NOT NULL,
    course_id      uuid REFERENCES courses(id) ON DELETE SET NULL,
    sujet          varchar(200),
    statut         varchar(20) NOT NULL DEFAULT 'ouvert',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_statut ON tickets(statut, updated_at DESC);

-- Messages d'un ticket (conversation). role : utilisateur | admin
CREATE TABLE ticket_messages (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  uuid REFERENCES tickets(id) ON DELETE CASCADE,
    role       varchar(20) NOT NULL,
    contenu    text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id, created_at);

-- Sécurité admin (specs §5.4) — 2FA TOTP. Table mono-ligne (id=1) pour ne PAS exposer
-- le secret via /parametres. totp_enabled=false tant que l'admin n'a pas validé un 1er code.
CREATE TABLE admin_securite (
    id           integer PRIMARY KEY DEFAULT 1,
    totp_secret  text,
    totp_enabled boolean NOT NULL DEFAULT false,
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT admin_securite_single_row CHECK (id = 1)
);
INSERT INTO admin_securite (id) VALUES (1);

-- Comptes admin & rôles (specs §5.4) — Super admin / Opérateur / Lecteur.
-- Le compte fondateur reste défini via .env (bootstrap anti-lockout) ; cette table = comptes additionnels.
CREATE TABLE admins (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         varchar(255) UNIQUE NOT NULL,
    password_hash text NOT NULL,
    nom           varchar(120),
    role          varchar(20) NOT NULL DEFAULT 'operateur',  -- super_admin | operateur | lecteur
    actif         boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now()
);