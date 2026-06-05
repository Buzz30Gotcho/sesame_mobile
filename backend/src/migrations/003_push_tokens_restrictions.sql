ALTER TABLE ambassadeurs ADD COLUMN IF NOT EXISTS push_token varchar(200);
ALTER TABLE ambassadeurs ADD COLUMN IF NOT EXISTS restriction_commande_jusqu_au timestamptz;
ALTER TABLE chauffeurs ADD COLUMN IF NOT EXISTS push_token varchar(200);
