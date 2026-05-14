-- RPC: refund_single_game_gem
--
-- Quando una partita single player fallisce per un nostro problema tecnico
-- (es. AI provider down dopo retry, content_filter del provider) dopo che
-- abbiamo gia' scalato la gemma in start_single_game, vogliamo restituire
-- la gemma all'utente: non e' colpa sua.
--
-- L'operazione e' atomica:
-- 1. Verifica che la partita esista, appartenga all'utente, sia in_progress.
-- 2. Marca la partita come 'abandoned' (con ended_at = now()).
-- 3. Restituisce 1 gemma al balance e decrementa lifetime_spent di 1.
-- 4. Inserisce un audit_log con event_type = 'gem_refunded_for_failure'
--    e details JSON con il motivo.
-- 5. Ritorna il nuovo balance gemme.
--
-- Se la partita era gia' in stato != in_progress, NON facciamo refund:
-- significa che il flusso ha gia' chiuso normalmente la partita altrove.
-- In quel caso restituiamo NULL come segnale (il chiamante puo' loggare).

CREATE OR REPLACE FUNCTION public.refund_single_game_gem(
    p_game_id   UUID,
    p_user_id   UUID,
    p_reason    TEXT
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game public.single_games;
    v_new_balance INT;
BEGIN
    IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
        RAISE EXCEPTION 'reason_required' USING ERRCODE = 'check_violation';
    END IF;

    SELECT * INTO v_game
        FROM public.single_games
        WHERE id = p_game_id
        FOR UPDATE;

    IF v_game.id IS NULL THEN
        RAISE EXCEPTION 'game_not_found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_game.user_id <> p_user_id THEN
        RAISE EXCEPTION 'game_ownership_mismatch' USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Se la partita non e' piu' in progress, NON facciamo refund:
    -- e' gia' stata chiusa in altro modo. Ritorniamo NULL come segnale.
    IF v_game.result <> 'in_progress' THEN
        RETURN NULL;
    END IF;

    -- Marca la partita come abandoned
    UPDATE public.single_games
        SET result = 'abandoned',
            ended_at = now()
        WHERE id = p_game_id;

    -- Restituisce la gemma. Coalesce per gestire utenti senza riga
    -- (caso teorico: non dovrebbe succedere se start_single_game e' passato).
    UPDATE public.gems_balance
        SET balance = balance + 1,
            lifetime_spent = GREATEST(lifetime_spent - 1, 0)
        WHERE user_id = p_user_id
        RETURNING balance INTO v_new_balance;

    -- Audit log
    INSERT INTO public.audit_log (
        actor_type, event_type, target_user_id, details
    )
    VALUES (
        'system',
        'gem_refunded_for_failure',
        p_user_id,
        jsonb_build_object(
            'game_id', p_game_id,
            'reason', p_reason,
            'new_balance', COALESCE(v_new_balance, 0)
        )
    );

    RETURN COALESCE(v_new_balance, 0);
END;
$$;

COMMENT ON FUNCTION public.refund_single_game_gem IS
    'Refund di 1 gemma quando una partita fallisce per problemi tecnici. Marca abandoned + audit log. Ritorna NULL se la partita non era piu in_progress.';

REVOKE EXECUTE ON FUNCTION public.refund_single_game_gem FROM PUBLIC, anon, authenticated;
