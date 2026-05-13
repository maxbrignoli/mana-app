/**
 * Tipi pubblici delle operazioni di gioco.
 *
 * Rispecchiano i tipi delle tabelle e dei valori restituiti dalle RPC
 * lato Supabase. Mantenerli in sync con la migration e' responsabilita'
 * del developer (in Fase 4+ valuteremo type generation automatica dallo
 * schema con `supabase gen types`).
 */

export type GameMode = 'mana_guesses' | 'user_guesses';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type SingleGameResult = 'user_won' | 'user_lost' | 'abandoned' | 'in_progress';

export type MoveActor = 'user' | 'mana';

export type AnswerValue = 'yes' | 'no' | 'maybe_yes' | 'maybe_no' | 'dont_know' | 'guess';

export type RageEventType =
  | 'insult_no_question'
  | 'insult_in_question'
  | 'inappropriate_character_choice';

export type RageContextGameType = 'single' | 'multi' | 'outside_game';

/** Riga di public.single_games come restituita da start_single_game / end_single_game. */
export interface SingleGameRow {
  id: string;
  user_id: string;
  mode: GameMode;
  target_character: string | null; // bytea -> base64 quando arriva dal client Supabase
  domain_selected: string[] | null;
  difficulty: Difficulty;
  culture: string[] | null;
  max_questions: number;
  questions_used: number;
  hints_used: number;
  result: SingleGameResult;
  gems_spent: number;
  started_at: string;
  ended_at: string | null;
  ai_model_used: string | null;
  daily_challenge_id: string | null;
}

/** Risultato di record_single_move. */
export interface RecordMoveResult {
  move_id: string;
  move_number: number;
  questions_used: number;
}

/** Risultato di add_rage_event. */
export interface RageEventResult {
  new_rage_level: number;
  gem_penalty: number;
  gems_remaining: number;
}
