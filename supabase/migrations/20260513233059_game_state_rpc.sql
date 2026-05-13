-- Mana — Game state RPC
-- Aggiunge le stored procedure (funzioni PL/pgSQL) che incapsulano le
-- operazioni atomiche di gioco. Ogni operazione e' una transazione: o tutto
-- riesce, o tutto viene annullato.
--
-- Tutte le funzioni sono SECURITY DEFINER per poter operare su tabelle con
-- RLS attiva senza richiedere che l'utente abbia permessi diretti di scrittura.
-- I controlli di ownership e di stato sono fatti dentro le funzioni stesse.

-- =====================================================
-- start_single_game
-- =====================================================
-- Crea una nuova partita single player.
-- Atomicamente: verifica gemme disponibili, ne scala 1, crea il record partita.
-- Restituisce la riga di single_games appena creata.

CREATE OR REPLACE FUNCTION public.start_single_game(
    p_user_id            UUID,
    p_mode               TEXT,
    p_domains            TEXT[],
    p_difficulty         TEXT,
    p_culture            TEXT[],
    p_max_questions      SMALLINT DEFAULT 20,
    p_daily_challenge_id UUID DEFAULT NULL
)
RETURNS public.single_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_balance INT;
    v_game public.single_games;
BEGIN
    -- Validazione input
    IF p_mode NOT IN ('mana_guesses', 'user_guesses') THEN
        RAISE EXCEPTION 'invalid_mode: %', p_mode USING ERRCODE = 'check_violation';
    END IF;
    IF p_difficulty NOT IN ('easy', 'medium', 'hard') THEN
        RAISE EXCEPTION 'invalid_difficulty: %', p_difficulty USING ERRCODE = 'check_violation';
    END IF;

    -- Lock della riga gemme (FOR UPDATE) per evitare race condition tra
    -- chiamate concorrenti dello stesso utente.
    SELECT balance INTO v_balance
        FROM public.gems_balance
        WHERE user_id = p_user_id
        FOR UPDATE;

    IF v_balance IS NULL THEN
        RAISE EXCEPTION 'gems_balance_not_found' USING ERRCODE = 'no_data_found';
    END IF;

    IF v_balance < 1 THEN
        RAISE EXCEPTION 'insufficient_gems: balance=%', v_balance USING ERRCODE = 'check_violation';
    END IF;

    -- Scala una gemma e incrementa lifetime_spent
    UPDATE public.gems_balance
        SET balance = balance - 1,
            lifetime_spent = lifetime_spent + 1
        WHERE user_id = p_user_id;

    -- Crea il record partita
    INSERT INTO public.single_games (
        user_id, mode, domain_selected, difficulty, culture,
        max_questions, gems_spent, daily_challenge_id
    )
    VALUES (
        p_user_id, p_mode, p_domains, p_difficulty, p_culture,
        p_max_questions, 1, p_daily_challenge_id
    )
    RETURNING * INTO v_game;

    RETURN v_game;
END;
$$;

COMMENT ON FUNCTION public.start_single_game IS
    'Crea atomicamente una partita single player scalando 1 gemma. Errori: gems_balance_not_found, insufficient_gems, invalid_mode, invalid_difficulty.';

-- =====================================================
-- record_single_move
-- =====================================================
-- Registra una mossa in una partita single player.
-- Verifica ownership e stato 'in_progress'. Incrementa questions_used quando
-- la mossa e' una domanda/guess dell'utente.

CREATE OR REPLACE FUNCTION public.record_single_move(
    p_game_id            UUID,
    p_user_id            UUID,
    p_actor              TEXT,
    p_question_text      BYTEA DEFAULT NULL,
    p_answer_value       TEXT DEFAULT NULL,
    p_guess_character    BYTEA DEFAULT NULL,
    p_was_correct        BOOLEAN DEFAULT NULL,
    p_flagged_offensive  BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (move_id UUID, move_number SMALLINT, questions_used SMALLINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game public.single_games;
    v_next_move_number SMALLINT;
    v_new_move_id UUID;
    v_increment_count BOOLEAN;
BEGIN
    -- Validazione actor
    IF p_actor NOT IN ('user', 'mana') THEN
        RAISE EXCEPTION 'invalid_actor: %', p_actor USING ERRCODE = 'check_violation';
    END IF;

    -- Lock partita e verifica ownership + stato
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

    IF v_game.result <> 'in_progress' THEN
        RAISE EXCEPTION 'game_not_in_progress: result=%', v_game.result USING ERRCODE = 'check_violation';
    END IF;

    -- Calcola il prossimo move_number
    SELECT COALESCE(MAX(m.move_number), 0) + 1 INTO v_next_move_number
        FROM public.single_game_moves m
        WHERE m.game_id = p_game_id;

    -- Inserisce la mossa
    INSERT INTO public.single_game_moves (
        game_id, move_number, actor, question_text, answer_value,
        guess_character, was_correct, flagged_as_offensive
    )
    VALUES (
        p_game_id, v_next_move_number, p_actor, p_question_text, p_answer_value,
        p_guess_character, p_was_correct, p_flagged_offensive
    )
    RETURNING id INTO v_new_move_id;

    -- Incrementa questions_used quando l'utente fa una domanda (mode=user_guesses)
    -- o quando Mana fa una domanda (mode=mana_guesses).
    -- In entrambi i casi: ogni mossa "domanda" da chi sta cercando di indovinare
    -- consuma una delle domande disponibili.
    v_increment_count := (
        (v_game.mode = 'user_guesses' AND p_actor = 'user') OR
        (v_game.mode = 'mana_guesses' AND p_actor = 'mana')
    );

    IF v_increment_count THEN
        UPDATE public.single_games
            SET questions_used = questions_used + 1
            WHERE id = p_game_id;
    END IF;

    RETURN QUERY
    SELECT v_new_move_id,
           v_next_move_number,
           (CASE WHEN v_increment_count THEN v_game.questions_used + 1 ELSE v_game.questions_used END)::SMALLINT;
END;
$$;

COMMENT ON FUNCTION public.record_single_move IS
    'Registra una mossa in una partita single player, incrementando questions_used se la mossa proviene dal lato che sta indovinando. Errori: game_not_found, game_ownership_mismatch, game_not_in_progress, invalid_actor.';

-- =====================================================
-- end_single_game
-- =====================================================
-- Chiude una partita single player impostando il risultato finale e
-- la timestamp di fine. Verifica ownership e che la partita sia in_progress.
-- I lati legati (achievement, ELO) NON vengono aggiornati qui — il backend
-- chiamera' le funzioni dedicate in PR successivi.

CREATE OR REPLACE FUNCTION public.end_single_game(
    p_game_id   UUID,
    p_user_id   UUID,
    p_result    TEXT
)
RETURNS public.single_games
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_game public.single_games;
BEGIN
    IF p_result NOT IN ('user_won', 'user_lost', 'abandoned') THEN
        RAISE EXCEPTION 'invalid_result: %', p_result USING ERRCODE = 'check_violation';
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

    IF v_game.result <> 'in_progress' THEN
        RAISE EXCEPTION 'game_not_in_progress: result=%', v_game.result USING ERRCODE = 'check_violation';
    END IF;

    UPDATE public.single_games
        SET result = p_result,
            ended_at = now()
        WHERE id = p_game_id
        RETURNING * INTO v_game;

    RETURN v_game;
END;
$$;

COMMENT ON FUNCTION public.end_single_game IS
    'Chiude una partita single player. Errori: invalid_result, game_not_found, game_ownership_mismatch, game_not_in_progress.';

-- =====================================================
-- add_rage_event
-- =====================================================
-- Registra un evento di linguaggio offensivo: incrementa rage_level (max 4),
-- calcola la penalita' in gemme (1, 2, 5, 10 in base al nuovo livello),
-- scala le gemme, inserisce il record in rage_events.
-- Ritorna i nuovi valori di rage_level e balance gemme.

CREATE OR REPLACE FUNCTION public.add_rage_event(
    p_user_id            UUID,
    p_event_type         TEXT,
    p_context_game_id    UUID DEFAULT NULL,
    p_context_game_type  TEXT DEFAULT 'outside_game'
)
RETURNS TABLE (new_rage_level SMALLINT, gem_penalty INT, gems_remaining INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_rage SMALLINT;
    v_new_rage SMALLINT;
    v_penalty INT;
    v_new_balance INT;
BEGIN
    IF p_event_type NOT IN ('insult_no_question', 'insult_in_question', 'inappropriate_character_choice') THEN
        RAISE EXCEPTION 'invalid_event_type: %', p_event_type USING ERRCODE = 'check_violation';
    END IF;
    IF p_context_game_type NOT IN ('single', 'multi', 'outside_game') THEN
        RAISE EXCEPTION 'invalid_context_game_type: %', p_context_game_type USING ERRCODE = 'check_violation';
    END IF;

    -- Lock profilo per evitare race condition
    SELECT rage_level INTO v_current_rage
        FROM public.profiles
        WHERE id = p_user_id
        FOR UPDATE;

    IF v_current_rage IS NULL THEN
        RAISE EXCEPTION 'profile_not_found' USING ERRCODE = 'no_data_found';
    END IF;

    -- Nuovo livello (cap a 4)
    v_new_rage := LEAST(v_current_rage + 1, 4);

    -- Penalita' in base al nuovo livello: 1, 2, 5, 10 (livello 4 e oltre = 10)
    v_penalty := CASE v_new_rage
        WHEN 1 THEN 1
        WHEN 2 THEN 2
        WHEN 3 THEN 5
        ELSE 10
    END;

    -- Aggiorna rage_level su profiles
    UPDATE public.profiles
        SET rage_level = v_new_rage
        WHERE id = p_user_id;

    -- Scala le gemme (non andare sotto zero)
    UPDATE public.gems_balance
        SET balance = GREATEST(balance - v_penalty, 0),
            lifetime_penalty = lifetime_penalty + v_penalty
        WHERE user_id = p_user_id
        RETURNING balance INTO v_new_balance;

    -- Registra l'evento
    INSERT INTO public.rage_events (
        user_id, event_type, rage_level_at_event, gem_penalty,
        context_game_id, context_game_type
    )
    VALUES (
        p_user_id, p_event_type, v_new_rage, v_penalty,
        p_context_game_id, p_context_game_type
    );

    RETURN QUERY SELECT v_new_rage, v_penalty, COALESCE(v_new_balance, 0);
END;
$$;

COMMENT ON FUNCTION public.add_rage_event IS
    'Registra evento offensivo: incrementa rage_level (max 4), scala penalty in gemme (1/2/5/10), logga in rage_events. Errori: invalid_event_type, profile_not_found.';

-- =====================================================
-- apply_rage_decay
-- =====================================================
-- Funzione "cron": scansiona profili con rage_level > 0 e nessun rage_event
-- negli ultimi 14 giorni, e decrementa rage_level di 1.
-- Da chiamare periodicamente (Vercel Cron o pg_cron) — la schedulazione
-- viene configurata in un PR successivo.
-- Ritorna il numero di profili modificati.

CREATE OR REPLACE FUNCTION public.apply_rage_decay()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    WITH eligible AS (
        SELECT p.id
            FROM public.profiles p
            WHERE p.rage_level > 0
              AND NOT EXISTS (
                  SELECT 1
                    FROM public.rage_events r
                    WHERE r.user_id = p.id
                      AND r.created_at >= now() - INTERVAL '14 days'
              )
    )
    UPDATE public.profiles
        SET rage_level = rage_level - 1
        WHERE id IN (SELECT id FROM eligible);

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.apply_rage_decay IS
    'Decay del rage_level: -1 per ogni utente senza offese negli ultimi 14 giorni. Da chiamare periodicamente da un job.';

-- =====================================================
-- Grant execute permissions
-- =====================================================
-- Le RPC sono chiamate dal backend con service_role, che bypassa GRANT.
-- Comunque concediamo execute al ruolo authenticated per permettere chiamate
-- dirette dal client (con check di auth.uid() che pero' NON e' implementato
-- internamente: il backend deve essere intermediario).
-- Per ora solo service_role: il client NON deve chiamare direttamente queste RPC.

REVOKE EXECUTE ON FUNCTION public.start_single_game FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.record_single_move FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.end_single_game FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_rage_event FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.apply_rage_decay FROM PUBLIC, anon, authenticated;
