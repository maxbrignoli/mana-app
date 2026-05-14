import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAIProvider } from '../../_lib/ai/index.js';
import {
  buildSystemPromptManaGuesses,
  buildSystemPromptUserGuesses,
} from '../../_lib/ai/prompts/single-game.js';
import type { Message } from '../../_lib/ai/types.js';
import { requireAuth } from '../../_lib/auth/require-auth.js';
import { decrypt, decryptOrNull, encrypt } from '../../_lib/crypto/encryption.js';
import { getSupabaseAdmin } from '../../_lib/db/supabase.js';
import { addRageEvent, recordSingleMove } from '../../_lib/game/rpc.js';
import { moveSingleGameBodySchema } from '../../_lib/game/schemas.js';
import type { AnswerValue, SingleGameRow } from '../../_lib/game/types.js';
import {
  badRequest,
  forbidden,
  HttpError,
  notFound,
  sendError,
} from '../../_lib/http/errors.js';
import { allowMethods } from '../../_lib/http/methods.js';
import { parseBody } from '../../_lib/http/parse-body.js';
import { logger } from '../../_lib/logging/logger.js';
import { enforceRateLimit } from '../../_lib/rate-limit/enforce.js';
import { checkInputSafety, type SafetyVerdict } from '../../_lib/safety/pipeline.js';

/**
 * POST /api/games/single/move
 *
 * L'utente fa una mossa nella partita single player. La logica dipende
 * dalla modalita':
 *
 * - mode = "mana_guesses": l'utente fornisce answerValue (sì/no/...) alla
 *   domanda precedente di Mana. Persistiamo la risposta dell'utente come
 *   mossa N, poi chiamiamo AI per generare la prossima domanda di Mana e
 *   la persistiamo come mossa N+1.
 *
 * - mode = "user_guesses": l'utente fornisce userMessage (testo libero).
 *   Persistiamo come mossa N, poi chiamiamo AI per generare la risposta
 *   sì/no/... di Mana sul personaggio segreto, e la persistiamo come N+1.
 *
 * Authentication: richiesta.
 * Rate limit: 'game' (30 req/min per utente).
 *
 * Body: { gameId, answerValue?, userMessage? }
 *
 * Response 200:
 *   {
 *     userMove: { id, move_number },
 *     manaMove: { id, move_number, content },
 *     questionsUsed: number
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

    const body = parseBody(req, moveSingleGameBodySchema);

    // 1) Carica partita e verifica ownership/stato
    const supabase = getSupabaseAdmin();
    const { data: game, error: gameError } = await supabase
      .from('single_games')
      .select('*')
      .eq('id', body.gameId)
      .maybeSingle<SingleGameRow>();

    if (gameError) {
      logger.error('failed to load game', { gameId: body.gameId, error: gameError.message });
      throw new Error('Database error loading game');
    }
    if (!game) throw notFound('Game not found');
    if (game.user_id !== user.id) throw forbidden('You do not own this game');
    if (game.result !== 'in_progress') {
      throw badRequest('Game is not in progress', { reason: 'game_not_in_progress' });
    }

    // 2) Carica il profilo per l'eta'
    const { data: profile } = await supabase
      .from('profiles')
      .select('age')
      .eq('id', user.id)
      .maybeSingle();
    const age = profile?.age ?? null;

    // 3) Carica history mosse decifrate, per costruire la conversazione AI
    const { data: moves, error: movesError } = await supabase
      .from('single_game_moves')
      .select('id, move_number, actor, question_text, answer_value, guess_character, was_correct')
      .eq('game_id', game.id)
      .order('move_number', { ascending: true });

    if (movesError) {
      logger.error('failed to load moves', { gameId: game.id, error: movesError.message });
      throw new Error('Database error loading moves');
    }

    const history: Message[] = (moves ?? []).map((m) => {
      const text = decryptOrNull(m.question_text as Uint8Array | null);
      const isManaTurn = m.actor === 'mana';
      // La conversazione AI alterna user/assistant. Mappa actor sul ruolo:
      // - mode mana_guesses: Mana e' assistant, utente e' user
      // - mode user_guesses: Mana e' assistant, utente e' user
      // (in entrambi i casi, Mana = assistant, utente = user)
      const content = text ?? (m.answer_value ?? '(no content)');
      return {
        role: isManaTurn ? 'assistant' : 'user',
        content,
      };
    });

    const ai = getAIProvider();

    if (game.mode === 'mana_guesses') {
      // Validazione: deve esserci answerValue
      if (!body.answerValue) {
        throw badRequest('answerValue is required for mana_guesses mode');
      }

      // Persisto la risposta dell'utente come mossa
      const userMove = await recordSingleMove({
        gameId: game.id,
        userId: user.id,
        actor: 'user',
        answerValue: body.answerValue,
      });

      // Costruisco system prompt
      const systemPrompt = buildSystemPromptManaGuesses({
        mode: 'mana_guesses',
        age,
        difficulty: game.difficulty,
        cultures: game.culture ?? [],
        domains: game.domain_selected ?? [],
        maxQuestions: game.max_questions,
      });

      // History + risposta dell'utente
      const messages: Message[] = [
        ...history,
        { role: 'user', content: answerValueLabel(body.answerValue) },
      ];

      const aiResponse = await ai.chat({
        systemPrompt,
        messages,
        maxTokens: 100,
        temperature: 0.7,
      });

      const manaText = aiResponse.content.trim();

      const manaMove = await recordSingleMove({
        gameId: game.id,
        userId: user.id,
        actor: 'mana',
        questionText: encrypt(manaText),
      });

      logger.info('single game move (mana_guesses)', {
        gameId: game.id,
        userId: user.id,
        userMoveNumber: userMove.move_number,
        manaMoveNumber: manaMove.move_number,
        provider: aiResponse.providerName,
        cost: aiResponse.usage.estimatedCostUsd,
      });

      res.status(200).json({
        userMove: { id: userMove.move_id, move_number: userMove.move_number },
        manaMove: {
          id: manaMove.move_id,
          move_number: manaMove.move_number,
          content: manaText,
        },
        questionsUsed: manaMove.questions_used,
      });
      return;
    }

    // mode = 'user_guesses'
    if (!body.userMessage) {
      throw badRequest('userMessage is required for user_guesses mode');
    }

    // Safety pipeline: classifichiamo l'input prima di passarlo al modello
    // di gioco. Rifiuti in 3 forme:
    // - reject_neutral: rimbalzo cortese senza penalita'
    // - reject_offensive_no_question: insulto puro -> rage event + penalita'
    // - reject_offensive_question: domanda offensiva -> rage event + penalita'
    const safety = await checkInputSafety(body.userMessage, 'game_move');

    if (safety.verdict !== 'allow') {
      const safetyOutcome = await handleSafetyRejection({
        verdict: safety.verdict,
        userId: user.id,
        gameId: game.id,
      });

      logger.info('single game move rejected by safety', {
        gameId: game.id,
        userId: user.id,
        verdict: safety.verdict,
        classifierCategory: safety.classifierCategory,
        moderationCategories: safety.moderationCategories,
        moderationMaxScore: safety.moderationMaxScore,
        reason: safety.reason,
        gemPenalty: safetyOutcome.gemPenalty,
        newRageLevel: safetyOutcome.newRageLevel,
      });

      res.status(400).json({
        rejected: true,
        verdict: safety.verdict,
        message: safetyOutcome.userMessage,
        ...(safetyOutcome.gemPenalty > 0
          ? {
              gemPenalty: safetyOutcome.gemPenalty,
              newRageLevel: safetyOutcome.newRageLevel,
              gemsRemaining: safetyOutcome.gemsRemaining,
            }
          : {}),
      });
      return;
    }

    // Recupero personaggio segreto
    const secretCipher = game.target_character as unknown as Uint8Array | null;
    if (!secretCipher) {
      throw new HttpError(500, 'INTERNAL_ERROR', 'Secret character missing for user_guesses game');
    }
    const secret = decrypt(secretCipher);

    // Persisto la domanda dell'utente come mossa (cifrata)
    const userMove = await recordSingleMove({
      gameId: game.id,
      userId: user.id,
      actor: 'user',
      questionText: encrypt(body.userMessage),
    });

    const systemPrompt = buildSystemPromptUserGuesses({
      mode: 'user_guesses',
      age,
      difficulty: game.difficulty,
      cultures: game.culture ?? [],
      domains: game.domain_selected ?? [],
      maxQuestions: game.max_questions,
      secretCharacter: secret,
    });

    const messages: Message[] = [
      ...history,
      { role: 'user', content: body.userMessage },
    ];

    const aiResponse = await ai.chat({
      systemPrompt,
      messages,
      maxTokens: 100,
      temperature: 0.4, // piu' bassa: vogliamo risposte deterministiche su un personaggio noto
    });

    const manaText = aiResponse.content.trim();

    // Heuristic: se la risposta inizia per "Sì! Hai indovinato", segniamo was_correct=true
    // (il prompt istruisce Mana a usare quella frase). Conferma vera vincita.
    const wasGuessCorrect = /^s[ìi]!?\s*hai indovinato/i.test(manaText);

    const manaMove = await recordSingleMove({
      gameId: game.id,
      userId: user.id,
      actor: 'mana',
      questionText: encrypt(manaText),
      wasCorrect: wasGuessCorrect ? true : undefined,
    });

    logger.info('single game move (user_guesses)', {
      gameId: game.id,
      userId: user.id,
      userMoveNumber: userMove.move_number,
      manaMoveNumber: manaMove.move_number,
      provider: aiResponse.providerName,
      cost: aiResponse.usage.estimatedCostUsd,
      guessedCorrect: wasGuessCorrect,
    });

    res.status(200).json({
      userMove: { id: userMove.move_id, move_number: userMove.move_number },
      manaMove: {
        id: manaMove.move_id,
        move_number: manaMove.move_number,
        content: manaText,
      },
      questionsUsed: manaMove.questions_used,
      guessedCorrect: wasGuessCorrect,
    });
  } catch (error) {
    if (!(error instanceof Error) || error.name !== 'HttpError') {
      logger.error('unexpected error in /api/games/single/move', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    sendError(res, error);
  }
}

/**
 * Trasforma una answerValue nel testo italiano che l'AI vedra' come messaggio
 * "user" nella conversazione.
 */
function answerValueLabel(v: AnswerValue): string {
  switch (v) {
    case 'yes':
      return 'Sì';
    case 'no':
      return 'No';
    case 'maybe_yes':
      return 'Forse sì';
    case 'maybe_no':
      return 'Forse no';
    case 'dont_know':
      return 'Non lo so';
    case 'guess':
      return '(tentativo)';
  }
}

/**
 * Gestisce un input rifiutato dalla safety pipeline.
 *
 * - reject_neutral: nessuna penalita', solo messaggio di rimbalzo.
 *   Esempio: l'utente saluta o scrive una frase confusa. Mana lo invita a
 *   tornare al gioco senza punirlo.
 *
 * - reject_offensive_no_question / reject_offensive_question: chiamiamo
 *   addRageEvent che incrementa rage_level e scala la penalty in gemme
 *   (1/2/5/10 in base al nuovo livello). Ritorniamo il messaggio di Mana
 *   adattato al tipo di offesa.
 *
 * Se l'addRageEvent fallisce per qualche ragione, restituiamo penalty=0 e
 * solo il messaggio: meglio non bloccare il flusso.
 */
async function handleSafetyRejection(args: {
  verdict: Exclude<SafetyVerdict, 'allow'>;
  userId: string;
  gameId: string;
}): Promise<{
  userMessage: string;
  gemPenalty: number;
  newRageLevel: number;
  gemsRemaining: number;
}> {
  if (args.verdict === 'reject_neutral') {
    return {
      userMessage:
        'Non ho capito la tua domanda. Provami con una domanda sul personaggio: chiedi qualcosa di sì o no!',
      gemPenalty: 0,
      newRageLevel: 0,
      gemsRemaining: 0,
    };
  }

  const eventType =
    args.verdict === 'reject_offensive_no_question'
      ? 'insult_no_question'
      : 'insult_in_question';

  try {
    const rage = await addRageEvent({
      userId: args.userId,
      eventType,
      contextGameId: args.gameId,
      contextGameType: 'single',
    });

    const baseMsg =
      args.verdict === 'reject_offensive_question'
        ? 'Le domande devono essere rispettose. Riprova in modo gentile.'
        : 'Resta gentile, per favore. Torniamo al gioco?';

    const penaltyMsg = `Hai perso ${rage.gem_penalty} gemm${
      rage.gem_penalty === 1 ? 'a' : 'e'
    } (livello scortesia: ${rage.new_rage_level}/4).`;

    return {
      userMessage: `${baseMsg} ${penaltyMsg}`,
      gemPenalty: rage.gem_penalty,
      newRageLevel: rage.new_rage_level,
      gemsRemaining: rage.gems_remaining,
    };
  } catch (error) {
    logger.error('failed to add rage event', {
      userId: args.userId,
      gameId: args.gameId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      userMessage: 'Resta gentile, per favore. Torniamo al gioco?',
      gemPenalty: 0,
      newRageLevel: 0,
      gemsRemaining: 0,
    };
  }
}
