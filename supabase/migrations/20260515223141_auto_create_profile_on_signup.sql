-- Trigger: crea automaticamente profilo + balance gemme quando un utente
-- viene creato in auth.users (sia tramite signup classico, sia anonimo).
--
-- Motivazione: l'app permette di giocare subito come ospite (signInAnonymously()),
-- senza onboarding. Per far funzionare il backend (es. /api/me) serve subito
-- una riga in public.profiles e public.gems_balance. Invece di sparare insert
-- dal client (che richiederebbe RLS aperte e logica duplicata in piu' punti),
-- centralizziamo nel DB con un trigger SECURITY DEFINER.
--
-- Il private_id e' un BIGINT 9 cifre (100000000 - 999999999) unique. Per evitare
-- collisioni (rare con uno spazio di 900M valori, ma teoriche), il loop
-- riprova fino a 5 volte prima di lanciare un errore.
--
-- display_name iniziale: 'Ospite NNNN' dove NNNN sono le ultime 4 cifre del
-- private_id. Tipo "Ospite 4521". L'utente puo' poi cambiarlo dalla pagina
-- Account.

CREATE OR REPLACE FUNCTION public.create_profile_for_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_private_id BIGINT;
    v_display_name TEXT;
    v_attempt INT := 0;
    v_max_attempts CONSTANT INT := 5;
BEGIN
    -- Genera un private_id univoco a 9 cifre.
    LOOP
        v_attempt := v_attempt + 1;
        -- random() restituisce [0, 1); moltiplichiamo per 900M e shiftiamo a 100M.
        v_private_id := 100000000 + floor(random() * 900000000)::BIGINT;

        -- Verifica univocita'. Se libero, esce dal loop.
        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.profiles WHERE private_id = v_private_id
        );

        IF v_attempt >= v_max_attempts THEN
            RAISE EXCEPTION 'Failed to generate unique private_id after % attempts', v_max_attempts;
        END IF;
    END LOOP;

    -- display_name: "Ospite NNNN" con le ultime 4 cifre del private_id.
    v_display_name := 'Ospite ' || lpad((v_private_id % 10000)::TEXT, 4, '0');

    -- Inserisce il profilo. L'email puo' essere NULL per utenti anonimi.
    INSERT INTO public.profiles (id, private_id, display_name, email)
    VALUES (NEW.id, v_private_id, v_display_name, NEW.email);

    -- Inserisce il balance gemme (default = 10 dalla colonna DEFAULT).
    INSERT INTO public.gems_balance (user_id)
    VALUES (NEW.id);

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.create_profile_for_new_user IS
    'Trigger function: crea automaticamente profilo + gems_balance per ogni nuovo utente auth.users.';

-- Rimuove eventuali trigger precedenti con lo stesso nome (idempotenza).
DROP TRIGGER IF EXISTS create_profile_for_new_user ON auth.users;

CREATE TRIGGER create_profile_for_new_user
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_profile_for_new_user();
