-- Migration : ajout colonne type_course + activation mode course immédiate
-- À exécuter dans la console SQL Supabase

-- 1. Créer le type enum course_type s'il n'existe pas
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'course_type') THEN
        CREATE TYPE course_type AS ENUM ('immediate', 'reservation');
    END IF;
END $$;

-- 2. Ajouter la colonne type_course à la table courses si elle n'existe pas
ALTER TABLE courses ADD COLUMN IF NOT EXISTS type_course course_type;

-- 3. Activer le mode course immédiate
UPDATE parametres_systeme
SET
    valeur = 'true',
    updated_at = now()
WHERE
    cle = 'mode_course_immediate';