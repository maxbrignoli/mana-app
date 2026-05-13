-- Mana — Initial schema migration
-- Creates all 18 tables, indexes, and RLS policies described in docs/schema-db.md.
--
-- Reference document: docs/schema-db.md
-- Generated: 2026-05-13

-- =====================================================
-- Extensions
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- 1. profiles
-- =====================================================

CREATE TABLE IF NOT EXISTS public.profiles (
    id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    private_id               BIGINT NOT NULL UNIQUE CHECK (private_id BETWEEN 100000000 AND 999999999),
    display_name             TEXT,
    email                    TEXT,
    age                      SMALLINT CHECK (age >= 0 AND age <= 120),
    country_code             TEXT,
    cultures                 TEXT[] DEFAULT ARRAY['it']::TEXT[],
    preferred_language       TEXT DEFAULT 'it',
    preferred_difficulty     TEXT DEFAULT 'medium' CHECK (preferred_difficulty IN ('easy', 'medium', 'hard')),
    avatar_id                TEXT DEFAULT 'avatar_default',
    rage_level               SMALLINT DEFAULT 0 CHECK (rage_level BETWEEN 0 AND 4),
    abandoned_games_count    INT DEFAULT 0,
    created_at               TIMESTAMPTZ DEFAULT now(),
    deleted_at               TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_profiles_country_code ON public.profiles(country_code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON public.profiles(deleted_at);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- INSERT and DELETE only via service_role (server-side)

-- =====================================================
-- 2. user_settings
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_settings (
    user_id                          UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    active_domains                   TEXT[] DEFAULT ARRAY['disney','pixar','marvel','starwars','anime','videogames','books','animals','history','cinema','sports','music','italian']::TEXT[],
    notifications_friends            BOOLEAN DEFAULT TRUE,
    notifications_own_matches        BOOLEAN DEFAULT TRUE,
    notifications_daily_challenge    BOOLEAN DEFAULT FALSE,
    marketing_consent                BOOLEAN DEFAULT FALSE,
    updated_at                       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_settings_select_own ON public.user_settings;
CREATE POLICY user_settings_select_own ON public.user_settings
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_settings_update_own ON public.user_settings;
CREATE POLICY user_settings_update_own ON public.user_settings
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS user_settings_insert_own ON public.user_settings;
CREATE POLICY user_settings_insert_own ON public.user_settings
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 3. gems_balance
-- =====================================================

CREATE TABLE IF NOT EXISTS public.gems_balance (
    user_id              UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    balance              INT DEFAULT 10 CHECK (balance >= 0),
    last_regen_at        TIMESTAMPTZ DEFAULT now(),
    lifetime_purchased   INT DEFAULT 0,
    lifetime_spent       INT DEFAULT 0,
    lifetime_penalty     INT DEFAULT 0
);

ALTER TABLE public.gems_balance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gems_balance_select_own ON public.gems_balance;
CREATE POLICY gems_balance_select_own ON public.gems_balance
    FOR SELECT USING (auth.uid() = user_id);

-- UPDATE/INSERT only via service_role (mai dal client)

-- =====================================================
-- 4. single_games
-- =====================================================

CREATE TABLE IF NOT EXISTS public.single_games (
    id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id              UUID NOT NULL REFERENCES public.profiles(id),
    mode                 TEXT NOT NULL CHECK (mode IN ('mana_guesses', 'user_guesses')),
    target_character     BYTEA,
    domain_selected      TEXT[],
    difficulty           TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard')),
    culture              TEXT[],
    max_questions        SMALLINT NOT NULL DEFAULT 20,
    questions_used       SMALLINT NOT NULL DEFAULT 0,
    hints_used           SMALLINT NOT NULL DEFAULT 0,
    result               TEXT NOT NULL DEFAULT 'in_progress' CHECK (result IN ('user_won', 'user_lost', 'abandoned', 'in_progress')),
    gems_spent           INT NOT NULL DEFAULT 0,
    started_at           TIMESTAMPTZ DEFAULT now(),
    ended_at             TIMESTAMPTZ,
    ai_model_used        TEXT,
    daily_challenge_id   UUID
);

CREATE INDEX IF NOT EXISTS idx_single_games_user_id ON public.single_games(user_id);
CREATE INDEX IF NOT EXISTS idx_single_games_started_at ON public.single_games(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_single_games_daily_challenge_id ON public.single_games(daily_challenge_id) WHERE daily_challenge_id IS NOT NULL;

ALTER TABLE public.single_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS single_games_select_own ON public.single_games;
CREATE POLICY single_games_select_own ON public.single_games
    FOR SELECT USING (auth.uid() = user_id);

-- INSERT/UPDATE only via service_role

-- =====================================================
-- 5. single_game_moves
-- =====================================================

CREATE TABLE IF NOT EXISTS public.single_game_moves (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id                  UUID NOT NULL REFERENCES public.single_games(id) ON DELETE CASCADE,
    move_number              SMALLINT NOT NULL,
    actor                    TEXT NOT NULL CHECK (actor IN ('user', 'mana')),
    question_text            BYTEA,
    answer_value             TEXT CHECK (answer_value IN ('yes', 'no', 'maybe_yes', 'maybe_no', 'dont_know', 'guess')),
    guess_character          BYTEA,
    was_correct              BOOLEAN,
    flagged_as_offensive     BOOLEAN DEFAULT FALSE,
    created_at               TIMESTAMPTZ DEFAULT now(),
    UNIQUE (game_id, move_number)
);

CREATE INDEX IF NOT EXISTS idx_single_game_moves_game_id ON public.single_game_moves(game_id, move_number);

ALTER TABLE public.single_game_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS single_game_moves_select_own ON public.single_game_moves;
CREATE POLICY single_game_moves_select_own ON public.single_game_moves
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.single_games sg
            WHERE sg.id = single_game_moves.game_id
            AND sg.user_id = auth.uid()
        )
    );

-- INSERT/UPDATE only via service_role

-- =====================================================
-- 6. multiplayer_games
-- =====================================================

CREATE TABLE IF NOT EXISTS public.multiplayer_games (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mode                        TEXT NOT NULL CHECK (mode IN ('duel', 'race')),
    player1_id                  UUID NOT NULL REFERENCES public.profiles(id),
    player2_id                  UUID NOT NULL REFERENCES public.profiles(id),
    target_character_p1         BYTEA,
    target_character_p2         BYTEA,
    target_character_shared     BYTEA,
    state                       TEXT NOT NULL DEFAULT 'waiting_p1' CHECK (state IN ('waiting_p1', 'waiting_p2', 'in_progress', 'finished', 'abandoned_by_p1', 'abandoned_by_p2')),
    current_turn                TEXT CHECK (current_turn IN ('p1', 'p2')),
    current_turn_expires_at     TIMESTAMPTZ,
    winner_id                   UUID REFERENCES public.profiles(id),
    elo_change_p1               INT,
    elo_change_p2               INT,
    started_at                  TIMESTAMPTZ DEFAULT now(),
    ended_at                    TIMESTAMPTZ,
    CHECK (player1_id <> player2_id)
);

CREATE INDEX IF NOT EXISTS idx_multiplayer_games_player1 ON public.multiplayer_games(player1_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_player2 ON public.multiplayer_games(player2_id);
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_state ON public.multiplayer_games(state);
CREATE INDEX IF NOT EXISTS idx_multiplayer_games_turn_expires ON public.multiplayer_games(current_turn_expires_at)
    WHERE state IN ('waiting_p1', 'waiting_p2', 'in_progress');

ALTER TABLE public.multiplayer_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS multiplayer_games_select_involved ON public.multiplayer_games;
CREATE POLICY multiplayer_games_select_involved ON public.multiplayer_games
    FOR SELECT USING (auth.uid() IN (player1_id, player2_id));

-- =====================================================
-- 7. multiplayer_moves
-- =====================================================

CREATE TABLE IF NOT EXISTS public.multiplayer_moves (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    game_id                  UUID NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
    actor_id                 UUID NOT NULL REFERENCES public.profiles(id),
    move_number              SMALLINT NOT NULL,
    question_text            BYTEA,
    answer_value             TEXT CHECK (answer_value IN ('yes', 'no', 'maybe_yes', 'maybe_no', 'dont_know', 'guess')),
    guess_character          BYTEA,
    was_correct              BOOLEAN,
    flagged_as_offensive     BOOLEAN DEFAULT FALSE,
    created_at               TIMESTAMPTZ DEFAULT now(),
    UNIQUE (game_id, move_number)
);

CREATE INDEX IF NOT EXISTS idx_multiplayer_moves_game ON public.multiplayer_moves(game_id, move_number);

ALTER TABLE public.multiplayer_moves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS multiplayer_moves_select_involved ON public.multiplayer_moves;
CREATE POLICY multiplayer_moves_select_involved ON public.multiplayer_moves
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.multiplayer_games mg
            WHERE mg.id = multiplayer_moves.game_id
            AND auth.uid() IN (mg.player1_id, mg.player2_id)
        )
    );

-- =====================================================
-- 8. friendships
-- =====================================================

CREATE TABLE IF NOT EXISTS public.friendships (
    user_a_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_a_id, user_b_id),
    CHECK (user_a_id < user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_a ON public.friendships(user_a_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_b ON public.friendships(user_b_id);

ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friendships_select_involved ON public.friendships;
CREATE POLICY friendships_select_involved ON public.friendships
    FOR SELECT USING (auth.uid() IN (user_a_id, user_b_id));

DROP POLICY IF EXISTS friendships_delete_involved ON public.friendships;
CREATE POLICY friendships_delete_involved ON public.friendships
    FOR DELETE USING (auth.uid() IN (user_a_id, user_b_id));

-- =====================================================
-- 9. friend_requests
-- =====================================================

CREATE TABLE IF NOT EXISTS public.friend_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requester_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ DEFAULT now(),
    UNIQUE (requester_id, target_id),
    CHECK (requester_id <> target_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_target ON public.friend_requests(target_id);

ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS friend_requests_select_involved ON public.friend_requests;
CREATE POLICY friend_requests_select_involved ON public.friend_requests
    FOR SELECT USING (auth.uid() IN (requester_id, target_id));

DROP POLICY IF EXISTS friend_requests_insert_own ON public.friend_requests;
CREATE POLICY friend_requests_insert_own ON public.friend_requests
    FOR INSERT WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS friend_requests_delete_involved ON public.friend_requests;
CREATE POLICY friend_requests_delete_involved ON public.friend_requests
    FOR DELETE USING (auth.uid() IN (requester_id, target_id));

-- =====================================================
-- 10. elo_ratings
-- =====================================================

CREATE TABLE IF NOT EXISTS public.elo_ratings (
    user_id           UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    elo_country       INT DEFAULT 1200,
    elo_global        INT DEFAULT 1200,
    last_updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elo_ratings_global ON public.elo_ratings(elo_global DESC);
CREATE INDEX IF NOT EXISTS idx_elo_ratings_country ON public.elo_ratings(elo_country DESC);

ALTER TABLE public.elo_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS elo_ratings_select_all ON public.elo_ratings;
CREATE POLICY elo_ratings_select_all ON public.elo_ratings
    FOR SELECT USING (TRUE);

-- =====================================================
-- 11. elo_history
-- =====================================================

CREATE TABLE IF NOT EXISTS public.elo_history (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_id                  UUID REFERENCES public.multiplayer_games(id),
    elo_country_before       INT,
    elo_country_after        INT,
    elo_global_before        INT,
    elo_global_after         INT,
    created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_elo_history_user ON public.elo_history(user_id, created_at DESC);

ALTER TABLE public.elo_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS elo_history_select_own ON public.elo_history;
CREATE POLICY elo_history_select_own ON public.elo_history
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- 12. user_achievements
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_achievements (
    user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    achievement_key          TEXT NOT NULL,
    current_level            SMALLINT DEFAULT 0 CHECK (current_level BETWEEN 0 AND 4),
    unlocked_at_level_1      TIMESTAMPTZ,
    unlocked_at_level_2      TIMESTAMPTZ,
    unlocked_at_level_3      TIMESTAMPTZ,
    unlocked_at_level_4      TIMESTAMPTZ,
    PRIMARY KEY (user_id, achievement_key)
);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_achievements_select_own ON public.user_achievements;
CREATE POLICY user_achievements_select_own ON public.user_achievements
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- 13. rage_events
-- =====================================================

CREATE TABLE IF NOT EXISTS public.rage_events (
    id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_type               TEXT NOT NULL CHECK (event_type IN ('insult_no_question', 'insult_in_question', 'inappropriate_character_choice')),
    rage_level_at_event      SMALLINT NOT NULL,
    gem_penalty              INT NOT NULL,
    context_game_id          UUID,
    context_game_type        TEXT CHECK (context_game_type IN ('single', 'multi', 'outside_game')),
    created_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rage_events_user ON public.rage_events(user_id, created_at DESC);

ALTER TABLE public.rage_events ENABLE ROW LEVEL SECURITY;

-- No SELECT policy: server-side only

-- =====================================================
-- 14. abandoned_games_log
-- =====================================================

CREATE TABLE IF NOT EXISTS public.abandoned_games_log (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_id      UUID NOT NULL REFERENCES public.multiplayer_games(id) ON DELETE CASCADE,
    created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_games_log_user ON public.abandoned_games_log(user_id);

ALTER TABLE public.abandoned_games_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 15. daily_challenges
-- =====================================================

CREATE TABLE IF NOT EXISTS public.daily_challenges (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    challenge_date              DATE NOT NULL UNIQUE,
    theme_key                   TEXT NOT NULL,
    forced_domain               TEXT[],
    forced_difficulty           TEXT CHECK (forced_difficulty IN ('easy', 'medium', 'hard')),
    bonus_elo_for_winners       INT DEFAULT 10,
    created_at                  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_challenges_date ON public.daily_challenges(challenge_date DESC);

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_challenges_select_all ON public.daily_challenges;
CREATE POLICY daily_challenges_select_all ON public.daily_challenges
    FOR SELECT USING (TRUE);

-- =====================================================
-- 16. daily_challenge_results
-- =====================================================

CREATE TABLE IF NOT EXISTS public.daily_challenge_results (
    challenge_id      UUID NOT NULL REFERENCES public.daily_challenges(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    game_id           UUID REFERENCES public.single_games(id),
    result            TEXT NOT NULL CHECK (result IN ('won', 'lost')),
    questions_used    SMALLINT,
    completed_at      TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_challenge_results_user ON public.daily_challenge_results(user_id);

ALTER TABLE public.daily_challenge_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS daily_challenge_results_select_own ON public.daily_challenge_results;
CREATE POLICY daily_challenge_results_select_own ON public.daily_challenge_results
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- 17. gem_purchases
-- =====================================================

CREATE TABLE IF NOT EXISTS public.gem_purchases (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    package_key                 TEXT NOT NULL,
    gems_purchased              INT NOT NULL,
    price_cents                 INT NOT NULL,
    currency                    TEXT NOT NULL DEFAULT 'EUR',
    platform                    TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
    platform_transaction_id     TEXT,
    status                      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'refunded', 'failed')),
    created_at                  TIMESTAMPTZ DEFAULT now(),
    completed_at                TIMESTAMPTZ,
    refunded_at                 TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gem_purchases_user ON public.gem_purchases(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gem_purchases_platform_txn ON public.gem_purchases(platform_transaction_id) WHERE platform_transaction_id IS NOT NULL;

ALTER TABLE public.gem_purchases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gem_purchases_select_own ON public.gem_purchases;
CREATE POLICY gem_purchases_select_own ON public.gem_purchases
    FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- 18. audit_log
-- =====================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    actor_user_id       UUID REFERENCES public.profiles(id),
    actor_type          TEXT NOT NULL CHECK (actor_type IN ('user', 'admin', 'system', 'external_request')),
    event_type          TEXT NOT NULL,
    target_user_id      UUID REFERENCES public.profiles(id),
    details             JSONB,
    ip_address          INET
);

-- Self-heal: if a previous partial migration left audit_log without event_at column, add it
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS event_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON public.audit_log(event_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor_user ON public.audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_target_user ON public.audit_log(target_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON public.audit_log(event_type);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- audit_log is server-side only. No SELECT/INSERT/UPDATE/DELETE policies for clients.
-- Even service_role should never UPDATE or DELETE (append-only by convention).

-- =====================================================
-- Cross-table FK for daily_challenge_id in single_games
-- (added at end because of forward reference)
-- =====================================================

DO $$ BEGIN
    ALTER TABLE public.single_games
        ADD CONSTRAINT fk_single_games_daily_challenge
        FOREIGN KEY (daily_challenge_id) REFERENCES public.daily_challenges(id);
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================
-- End of initial schema
-- =====================================================
