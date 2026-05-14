import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAIProvider } from '../../_lib/ai/index.js';
import { chatWithLengthRecovery } from '../../_lib/ai/length-recovery.js';
import {
  buildCharacterChoicePrompt,
  buildSystemPromptManaGuesses,
} from '../../_lib/ai/prompts/single-game.js';
import type { ChatResponse } from '../../_lib/ai/types.js';
import { requireAuth } from '../../_lib/auth/require-auth.js';
import { encrypt } from '../../_lib/crypto/encryption.js';
import { getSupabaseAdmin } from '../../_lib/db/supabase.js';
import {
  recordSingleMove,
  refundSingleGameGem,
  startSingleGame,
} from '../../_lib/game/rpc.js';
import { startSingleGameBodySchema } from '../../_lib/game/schemas.js';
import { HttpError, sendError } from '../../_lib/http/errors.js';
import { allowMethods } from '../../_lib/http/methods.js';
import { parseBody } from '../../_lib/http/parse-body.js';
import { logger } from '../../_lib/logging/logger.js';
import { enforceRateLimit } from '../../_lib/rate-limit/enforce.js';

/**
 * POST /api/games/single/start
 *
 * Crea una nuova partita single player. Scala 1 gemma all'utente, poi
 * inizializza la partita in base alla modalita':
 *
 * - mode = "mana_guesses": Mana genera la prima domanda di apertura,
 *   che viene persistita come prima mossa. Il client la mostra all'utente.
 * - mode = "user_guesses": Mana sceglie segretamente un personaggio
 *   (chiamata AI separata), cifra e salva il nome in target_character.
 *   Il client non riceve mai il nome; vede solo "partita pronta".
 *
 * REFUND AUTOMATICO: se la chiamata AI fallisce DOPO che la gemma e' stata
 * scalata da startSingleGame, tentiamo un refund best-effort prima di
 * rilanciare l'errore al client. Cosi' l'utente non paga per un nostro
 * problema tecnico.
 *
 * Authentication: richiesta.
 * Rate limit: 'game'.
 *
 * Body: { mode, domains, difficulty, culture, maxQuestions?, dailyChallengeId? }
 *
 * Response 201:
 *   {
 *     game: { ...riga single_games... },
 *     firstManaMove?: { id, move_number, content }  // solo per mana_guesses
 *   }
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

    // 1) Creazione atomica della partita (scala 1 gemma)
    const game = await startSingleGame({
      userId: user.id,
      mode: body.mode,
      domains: body.domains,
      difficulty: body.difficulty,
      culture: body.culture,
      maxQuestions: body.maxQuestions,
      dailyChallengeId: body.dailyChallengeId ?? null,
    });

    // Da qui in poi se qualcosa fallisce, dobbiamo tentare il refund:
    // la gemma e' gia' stata scalata. Wrappiamo il resto in un try
    // con catch dedicato che fa refund best-effort e rilancia.
    try {
      // 2) Carico eta' utente dal profilo per personalizzare il prompt
      const supabase = getSupabaseAdmin();
      const { data: profile } = await supabase
        .from('profiles')
        .select('age')
        .eq('id', user.id)
        .maybeSingle();
      const age = profile?.age ?? null;

      const ai = getAIProvider();

      if (body.mode === 'mana_guesses') {
        // Genera prima domanda di apertura
        const systemPrompt = buildSystemPromptManaGuesses({
          mode: 'mana_guesses',
          age,
          difficulty: body.difficulty,
          cultures: body.culture,
          domains: body.domains,
          maxQuestions: game.max_questions,
        });

        const aiResponse = await chatWithLengthRecovery(ai, {
          systemPrompt,
          messages: [
            {
              role: 'user',
              content: 'Inizia la partita: fai la tua prima domanda.',
            },
          ],
          maxTokens: 100,
          temperature: 0.7,
        });

        assertNotContentFiltered(aiResponse, { gameId: game.id, phase: 'first_question' });

        const questionText = aiResponse.content.trim();

        if (!questionText) {
          logger.error('ai returned empty content', {
            gameId: game.id,
            provider: aiResponse.providerName,
            finishReason: aiResponse.finishReason,
          });
          throw new HttpError(502, 'INTERNAL_ERROR', 'AI returned an empty response');
        }

        // Persisto la prima mossa di Mana (actor='mana', incrementa questions_used)
        const move = await recordSingleMove({
          gameId: game.id,
          userId: user.id,
          actor: 'mana',
          questionText: encrypt(questionText),
        });

        logger.info('single game started (mana_guesses)', {
          gameId: game.id,
          userId: user.id,
          provider: aiResponse.providerName,
          cost: aiResponse.usage.estimatedCostUsd,
        });

        res.status(201).json({
          game,
          firstManaMove: {
            id: move.move_id,
            move_number: move.move_number,
            content: questionText,
          },
        });
        return;
      }

      // mode = 'user_guesses' → Mana sceglie un personaggio segreto
      const choicePrompt = buildCharacterChoicePrompt({
        mode: 'user_guesses',
        age,
        difficulty: body.difficulty,
        cultures: body.culture,
        domains: body.domains,
        maxQuestions: game.max_questions,
      });

      const choiceResponse = await chatWithLengthRecovery(
        ai,
        {
          systemPrompt: choicePrompt,
          messages: [{ role: 'user', content: 'Scegli ora.' }],
          maxTokens: 30,
          temperature: 0.9,
        },
        { maxTokensCap: 60 },
      );

      assertNotContentFiltered(choiceResponse, { gameId: game.id, phase: 'character_choice' });

      const character = choiceResponse.content.trim();

      if (!character) {
        logger.error('ai returned empty character choice', {
          gameId: game.id,
          provider: choiceResponse.providerName,
          finishReason: choiceResponse.finishReason,
        });
        throw new HttpError(502, 'INTERNAL_ERROR', 'AI did not choose a character');
      }

      // Persisto il personaggio cifrato in target_character
      const { error: updateError } = await supabase
        .from('single_games')
        .update({ target_character: encrypt(character) })
        .eq('id', game.id);

      if (updateError) {
        logger.error('failed to save target_character', {
          gameId: game.id,
          error: updateError.message,
        });
        throw new Error('Database error saving secret character');
      }

      logger.info('single game started (user_guesses)', {
        gameId: game.id,
        userId: user.id,
        provider: choiceResponse.providerName,
        cost: choiceResponse.usage.estimatedCostUsd,
        // Non logghiamo il personaggio in chiaro (e' segreto per definizione)
      });

      res.status(201).json({ game });
    } catch (postStartError) {
      // Refund best-effort. Non blocchiamo la propagazione dell'errore:
      // se il refund fallisce, loggiamo ma rilanciamo l'errore originale.
      const reason =
        postStartError instanceof Error ? postStartError.message : String(postStartError);
      try {
        const refund = await refundSingleGameGem({
          gameId: game.id,
          userId: user.id,
          reason: `start_failed: ${reason.slice(0, 200)}`,
        });
        logger.warn('single game start failed, gem refunded', {
          gameId: game.id,
          userId: user.id,
          refunded: refund.refunded,
          newBalance: refund.newBalance,
          originalError: reason,
        });
      } catch (refundError) {
        logger.error('refund failed after start failure', {
          gameId: game.id,
          userId: user.id,
          originalError: reason,
          refundError:
            refundError instanceof Error ? refundError.message : String(refundError),
        });
      }
      throw postStartError;
    }
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'HttpError') {
      logger.error('unexpected error in /api/games/single/start', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    sendError(res, error);
  }
}

/**
 * Verifica che la risposta AI non sia stata bloccata dal content filter.
 * Su rifiuto categorico, non c'e' senso ritentare: ritorniamo errore al client.
 */
function assertNotContentFiltered(
  response: ChatResponse,
  context: { gameId: string; phase: string },
): void {
  if (response.finishReason !== 'content_filter') return;

  logger.error('ai content filter triggered', {
    gameId: context.gameId,
    phase: context.phase,
    provider: response.providerName,
  });

  throw new HttpError(
    502,
    'INTERNAL_ERROR',
    'The AI provider refused to generate a response. The game cannot proceed.',
  );
}
