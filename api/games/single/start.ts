import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from '../../_lib/auth/require-auth.js';
import { startSingleGameBodySchema } from '../../_lib/game/schemas.js';
import { startSingleGame } from '../../_lib/game/rpc.js';
import { sendError } from '../../_lib/http/errors.js';
import { allowMethods } from '../../_lib/http/methods.js';
import { parseBody } from '../../_lib/http/parse-body.js';
import { logger } from '../../_lib/logging/logger.js';
import { enforceRateLimit } from '../../_lib/rate-limit/enforce.js';

/**
 * POST /api/games/single/start
 *
 * Crea una nuova partita single player. Scala 1 gemma all'utente.
 *
 * Authentication: richiesta.
 * Rate limit: 'game' (30 req/min per utente).
 *
 * Body: { mode, domains, difficulty, culture, maxQuestions?, dailyChallengeId? }
 *
 * Response 201:
 *   {
 *     game: {
 *       id, mode, domain_selected, difficulty, culture, max_questions,
 *       questions_used, hints_used, result, gems_spent, started_at, ...
 *     }
 *   }
 *
 * NOTA: questo endpoint non chiama ancora il modello AI. Nel PR successivo
 * sara' aggiunta la prima risposta di Mana (mode=mana_guesses) o la scelta
 * del personaggio segreto (mode=user_guesses).
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (!allowMethods(req, res, ['POST'])) return;

  try {
    const user = await requireAuth(req);
    await enforceRateLimit(req, res, 'game', user.id);

    const body = parseBody(req, startSingleGameBodySchema);

    const game = await startSingleGame({
      userId: user.id,
      mode: body.mode,
      domains: body.domains,
      difficulty: body.difficulty,
      culture: body.culture,
      maxQuestions: body.maxQuestions,
      dailyChallengeId: body.dailyChallengeId ?? null,
    });

    logger.info('single game started', {
      gameId: game.id,
      userId: user.id,
      mode: game.mode,
      difficulty: game.difficulty,
    });

    res.status(201).json({ game });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'HttpError') {
      logger.error('unexpected error in /api/games/single/start', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    sendError(res, error);
  }
}
