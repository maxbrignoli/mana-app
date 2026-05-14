import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth } from '../../_lib/auth/require-auth.js';
import { getSupabaseAdmin } from '../../_lib/db/supabase.js';
import { forbidden, notFound } from '../../_lib/http/errors.js';
import { allowMethods } from '../../_lib/http/methods.js';
import { logger } from '../../_lib/logging/logger.js';
import { withErrorHandling } from '../../_lib/monitoring/with-error-handling.js';
import { enforceRateLimit } from '../../_lib/rate-limit/enforce.js';

const idSchema = z.string().uuid();

/**
 * GET /api/games/single/[id]
 *
 * Restituisce lo stato corrente di una partita single player.
 *
 * Authentication: richiesta.
 * Rate limit: 'game'.
 *
 * Path param: id (UUID della partita)
 *
 * Response 200: { game, moves } dove moves e' la lista delle mosse in ordine.
 *
 * Errori:
 *   - 404 se la partita non esiste
 *   - 403 se la partita non appartiene all'utente
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET'])) return;

  const user = await requireAuth(req);
  await enforceRateLimit(req, res, 'game', user.id);

  const idResult = idSchema.safeParse(req.query.id);
  if (!idResult.success) {
    throw notFound('Invalid game id');
  }
  const gameId = idResult.data;

  const supabase = getSupabaseAdmin();

  const { data: game, error: gameError } = await supabase
    .from('single_games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();

  if (gameError) {
    logger.error('failed to load single game', { gameId, error: gameError.message });
    throw new Error('Database error');
  }
  if (!game) {
    throw notFound('Game not found');
  }
  if (game.user_id !== user.id) {
    throw forbidden('You do not own this game');
  }

  const { data: moves, error: movesError } = await supabase
    .from('single_game_moves')
    .select('id, move_number, actor, answer_value, was_correct, flagged_as_offensive, created_at')
    .eq('game_id', gameId)
    .order('move_number', { ascending: true });

  if (movesError) {
    logger.error('failed to load moves', { gameId, error: movesError.message });
    throw new Error('Database error');
  }

  // NOTA: i campi cifrati (question_text, guess_character) non vengono
  // restituiti qui in chiaro. Per il momento il client riceve solo i
  // metadati. La decifratura per il replay sara' gestita in un endpoint
  // dedicato quando servira'.

  res.status(200).json({ game, moves: moves ?? [] });
}

export default withErrorHandling('/api/games/single/[id]', handler);
