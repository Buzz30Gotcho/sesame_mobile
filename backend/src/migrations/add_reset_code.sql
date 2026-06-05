ALTER TABLE utilisateurs
    ADD COLUMN IF NOT EXISTS reset_code varchar(6),
    ADD COLUMN IF NOT EXISTS reset_code_expires_at timestamptz;
