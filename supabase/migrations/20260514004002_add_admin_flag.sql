-- Aggiunge flag is_admin a profiles per limitare l'accesso a endpoint admin.
-- L'admin si setta manualmente via SQL dopo il signup del proprio account.

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Indice parziale: pochissimi admin (~1-3), query frequente "questo utente e' admin?".
CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
    ON public.profiles(id)
    WHERE is_admin = TRUE;

COMMENT ON COLUMN public.profiles.is_admin IS
    'Flag per accesso a endpoint amministrativi. Settato manualmente via SQL.';
