import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../_lib/auth/require-auth.js';
import { endSingleGameBodySchema } from '../../_lib/game/schemas.js';
import { endSingleGame } from '../../_lib/game/rpc.js';
import { sendError } from '../../_lib/http/errors.js';
import { allowMethods } from '../../_lib/http/methods.js';
import { parseBody } from '../../_lib/http/parse-body.js';
import { logger } from '../../_lib/logging/logger.js';
import { enforceRateLimit } from '../../_lib/rate-limit/enforce.js';

/**
 * POST /api/games/single/end
 *
 * Chiude una partita single player con il risultato finale.
 *
 * Authentication: richiesta. Il chiamante deve essere il proprietario
 * della partita (verificato dalla RPC).
 * Rate limit: 'game'.
 *
 * Body: { gameId, result }
 *   - gameId: UUID della partita
 *   - result: 'user_won' | 'user_lost' | 'abandoned'
 *
 * Response 200:
 *   { game: { ...stato finale completo... } }
 *
 * Errori comuni:
 *   - 404 NOT_FOUND: partita inesistente
 *   - 403 FORBIDDEN: la partita non appartiene all'utente
 *   - 400 BAD_REQUEST: partita gia' chiusa
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const user = await requireAuth(req);
    await enforceRateLimit(req, res, 'game', user.id);

    const body = parseBody(req, endSingleGameBodySchema);

    const game = await endSingleGame({
      gameId: body.gameId,
      userId: user.id,
      result: body.result,
    });

    logger.info('single game ended', {
      gameId: game.id,
      userId: user.id,
      result: game.result,
      questionsUsed: game.questions_used,
    });

    res.status(200).json({ game });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'HttpError') {
      logger.error('unexpected error in /api/games/single/end', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    sendError(res, error);
  }
}
