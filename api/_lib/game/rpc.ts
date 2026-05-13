import { getSupabaseAdmin } from '../db/supabase.js';
import { badRequest, forbidden, HttpError, notFound } from '../http/errors.js';
import type {
  AnswerValue,
  Difficulty,
  GameMode,
  MoveActor,
  RageContextGameType,
  RageEventResult,
  RageEventType,
  RecordMoveResult,
  SingleGameRow,
} from './types.js';

/**
 * Wrapper tipizzato delle RPC PostgreSQL relative al game state.
 *
 * Le RPC vivono nel database (migration game_state_rpc.sql) e gestiscono
 * atomicamente le operazioni di gioco: scalare gemme, creare partite, registrare
 * mosse, applicare penalita' rage.
 *
 * Tutti i metodi traducono gli errori specifici delle RPC (riconosciuti dal
 * messaggio o dal SQLSTATE) in HttpError semantici, cosi' che i chiamanti
 * possano gestirli uniformemente.
 */

/** Mapping degli errori sollevati dalle RPC su HttpError. */
function mapRpcError(error: { message: string; code?: string; details?: string | null }): HttpError {
  const msg = error.message ?? '';

  if (msg.includes('insufficient_gems')) {
    return badRequest('Insufficient gems to start the game.', { reason: 'insufficient_gems' });
  }
  if (msg.includes('gems_balance_not_found') || msg.includes('profile_not_found')) {
    return notFound('User profile or gems balance not found.');
  }
  if (msg.includes('game_not_found')) {
    return notFound('Game not found.');
  }
  if (msg.includes('game_ownership_mismatch')) {
    return forbidden('You do not own this game.');
  }
  if (msg.includes('game_not_in_progress')) {
    return badRequest('Game is not in progress.', { reason: 'game_not_in_progress' });
  }
  if (msg.startsWith('invalid_')) {
    return badRequest(`Invalid argument: ${msg}`);
  }

  // Fallback: errore generico, il chiamante decide se loggare/rilanciare
  return new HttpError(500, 'INTERNAL_ERROR', `RPC error: ${msg}`);
}

/**
 * Crea una nuova partita single player. Scala 1 gemma all'utente.
 */
export async function startSingleGame(args: {
  userId: string;
  mode: GameMode;
  domains: string[];
  difficulty: Difficulty;
  culture: string[];
  maxQuestions?: number;
  dailyChallengeId?: string | null;
}): Promise<SingleGameRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('start_single_game', {
    p_user_id: args.userId,
    p_mode: args.mode,
    p_domains: args.domains,
    p_difficulty: args.difficulty,
    p_culture: args.culture,
    p_max_questions: args.maxQuestions ?? 20,
    p_daily_challenge_id: args.dailyChallengeId ?? null,
  });

  if (error) {
    throw mapRpcError(error);
  }
  return data as SingleGameRow;
}

/**
 * Registra una mossa in una partita single player. La RPC incrementa
 * questions_used automaticamente quando appropriato.
 */
export async function recordSingleMove(args: {
  gameId: string;
  userId: string;
  actor: MoveActor;
  questionText?: Uint8Array | null;
  answerValue?: AnswerValue | null;
  guessCharacter?: Uint8Array | null;
  wasCorrect?: boolean | null;
  flaggedOffensive?: boolean;
}): Promise<RecordMoveResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('record_single_move', {
    p_game_id: args.gameId,
    p_user_id: args.userId,
    p_actor: args.actor,
    p_question_text: args.questionText ?? null,
    p_answer_value: args.answerValue ?? null,
    p_guess_character: args.guessCharacter ?? null,
    p_was_correct: args.wasCorrect ?? null,
    p_flagged_offensive: args.flaggedOffensive ?? false,
  });

  if (error) {
    throw mapRpcError(error);
  }
  // La RPC restituisce un singolo record in una TABLE; supabase-js lo serializza
  // come array di lunghezza 1.
  const rows = data as RecordMoveResult[];
  if (!rows[0]) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'record_single_move returned no row');
  }
  return rows[0];
}

/**
 * Chiude una partita single player con il risultato finale.
 */
export async function endSingleGame(args: {
  gameId: string;
  userId: string;
  result: 'user_won' | 'user_lost' | 'abandoned';
}): Promise<SingleGameRow> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('end_single_game', {
    p_game_id: args.gameId,
    p_user_id: args.userId,
    p_result: args.result,
  });

  if (error) {
    throw mapRpcError(error);
  }
  return data as SingleGameRow;
}

/**
 * Registra un evento di linguaggio offensivo, incrementando rage_level
 * (max 4) e scalando la penalty in gemme.
 */
export async function addRageEvent(args: {
  userId: string;
  eventType: RageEventType;
  contextGameId?: string | null;
  contextGameType?: RageContextGameType;
}): Promise<RageEventResult> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('add_rage_event', {
    p_user_id: args.userId,
    p_event_type: args.eventType,
    p_context_game_id: args.contextGameId ?? null,
    p_context_game_type: args.contextGameType ?? 'outside_game',
  });

  if (error) {
    throw mapRpcError(error);
  }
  const rows = data as RageEventResult[];
  if (!rows[0]) {
    throw new HttpError(500, 'INTERNAL_ERROR', 'add_rage_event returned no row');
  }
  return rows[0];
}

/**
 * Applica il decay del rage level: decrementa di 1 per ogni utente senza
 * rage_events negli ultimi 14 giorni. Da chiamare periodicamente da un job.
 */
export async function applyRageDecay(): Promise<{ updatedProfiles: number }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('apply_rage_decay');

  if (error) {
    throw mapRpcError(error);
  }
  return { updatedProfiles: (data as number) ?? 0 };
}
