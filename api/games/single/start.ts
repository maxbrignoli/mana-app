import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAIProvider } from '../../_lib/ai/index.js';
import {
  buildCharacterChoicePrompt,
  buildSystemPromptManaGuesses,
} from '../../_lib/ai/prompts/single-game.js';
import { requireAuth } from '../../_lib/auth/require-auth.js';
import { encrypt } from '../../_lib/crypto/encryption.js';
import { getSupabaseAdmin } from '../../_lib/db/supabase.js';
import { recordSingleMove, startSingleGame } from '../../_lib/game/rpc.js';
import { startSingleGameBodySchema } from '../../_lib/game/schemas.js';
import { sendError } from '../../_lib/http/errors.js';
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
 * Authentication: richiesta.
 * Rate limit: 'game'.
 *
 * Body: { mode, domains, difficulty, culture, maxQuestions?, dailyChallengeId?, age? }
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

      const aiResponse = await ai.chat({
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

      const questionText = aiResponse.content.trim();

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

    const choiceResponse = await ai.chat({
      systemPrompt: choicePrompt,
      messages: [{ role: 'user', content: 'Scegli ora.' }],
      maxTokens: 30,
      temperature: 0.9, // un po' di varieta' nelle scelte
    });

    const character = choiceResponse.content.trim();

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
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'HttpError') {
      logger.error('unexpected error in /api/games/single/start', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    sendError(res, error);
  }
}
