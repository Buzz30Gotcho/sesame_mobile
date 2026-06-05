-- ============================================================
-- Migration 002 — [titre court de la modification]
-- Date : YYYY-MM-DD
-- Description : [ce que cette migration change et pourquoi]
-- ============================================================

-- Exemples de ce que tu peux mettre ici :

-- Ajouter une colonne :
-- ALTER TABLE courses ADD COLUMN IF NOT EXISTS latitude_depart numeric(10,7);

-- Ajouter une valeur à un ENUM :
-- ALTER TYPE course_statut ADD VALUE IF NOT EXISTS 'en_pause';

-- Ajouter un paramètre système :
-- INSERT INTO parametres_systeme (cle, valeur, description)
-- VALUES ('nouveau_param', '0', 'Description du paramètre')
-- ON CONFLICT (cle) DO NOTHING;

-- Modifier une valeur de paramètre :
-- UPDATE parametres_systeme SET valeur = 'nouvelle_valeur', updated_at = now()
-- WHERE cle = 'nom_du_parametre';

-- Créer un index :
-- CREATE INDEX IF NOT EXISTS idx_courses_ambassadeur ON courses(ambassadeur_id);
