/**
 * Runner di una singola partita self-played.
 *
 * Coordina i turni tra ManaAgent e UserBot in base alla modalita',
 * costruisce il GameTrace via via, e ritorna il trace finale.
 *
 * Modalita' mana_guesses (Mana indovina):
 *   Turno 0:  Mana fa la prima domanda
 *   Turno 1:  Bot utente risponde (canonico)
 *   Turno 2:  Mana fa la prossima domanda (o un guess)
 *   Turno 3:  Bot utente risponde / conferma il guess
 *   ...
 *   Fine: il bot utente conferma un guess di Mana, oppure max_questions raggiunto.
 *
 * Modalita' user_guesses (Utente indovina):
 *   Turno 0:  Mana sceglie un personaggio (chiamata "off-loop", non e' nel trace
 *             come mossa visibile, ma il personaggio scelto e' in resolvedTargetCharacter)
 *   Turno 1:  Bot utente fa una domanda
 *   Turno 2:  Mana risponde
 *   Turno 3:  Bot utente fa la prossima domanda (o tenta guess)
 *   Turno 4:  Mana risponde, eventualmente con correct_guess/wrong_guess
 *   ...
 *   Fine: Mana risponde con parsedKind='correct_guess', oppure max_questions raggiunto.
 *
 * Conteggio delle "domande": come nel backend reale, consideriamo "domanda usata"
 * ogni turno in cui chi gioca (Mana in mana_guesses, bot in user_guesses) emette
 * un messaggio che ci si aspetta sia una domanda/guess. Quando il limite viene
 * raggiunto e ancora non c'e' stato un correct_guess, l'outcome e' 'timeout'.
 */

import { randomUUID } from 'node:crypto';
import { parseManaAnswer } from '../../api/_lib/ai/output/answer-parser.js';
import { ManaAgent, pickSecretCharacter, UserBot } from './bot.js';
import type { AgentTurnResult } from './bot.js';
import type { GameOutcome, GameTrace, Scenario, TraceMove } from './types.js';

/**
 * Detection: il messaggio del bot utente in mana_guesses contiene una
 * conferma di vittoria di Mana? (cioe' il bot ha risposto "Sì! Hai indovinato")
 * Usiamo il parser stesso che usa il backend reale per coerenza.
 */
function botConfirmsManaWon(botMessage: string): boolean {
  const parsed = parseManaAnswer(botMessage);
  return parsed.kind === 'correct_guess';
}

/**
 * Esegue una singola partita auto-giocata e ritorna il trace.
 *
 * NON lancia eccezioni per errori "di partita" (es. AI down): in quel caso
 * outcome='error' e errorMessage popolato. Lancia eccezioni solo per errori
 * di programmazione (scenari mal-formati).
 */
export async function runSinglePlayerGame(scenario: Scenario): Promise<GameTrace> {
  validateScenario(scenario);

  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const moves: TraceMove[] = [];
  let totalCostUsd = 0;
  let providerName = '';

  try {
    if (scenario.mode === 'mana_guesses') {
      return await runManaGuessesGame({
        scenario,
        runId,
        startedAt,
        t0,
        moves,
        addCost: (c, p) => {
          totalCostUsd += c;
          if (p) providerName = p;
        },
      });
    }
    return await runUserGuessesGame({
      scenario,
      runId,
      startedAt,
      t0,
      moves,
      addCost: (c, p) => {
        totalCostUsd += c;
        if (p) providerName = p;
      },
    });
  } catch (error) {
    const endedAt = new Date().toISOString();
    return {
      runId,
      scenario,
      provider: providerName,
      resolvedTargetCharacter: scenario.targetCharacter ?? '(unknown)',
      outcome: 'error',
      questionsUsed: countManaQuestions(moves, scenario.mode),
      moves,
      totalDurationMs: Date.now() - t0,
      totalCostUsd,
      startedAt,
      endedAt,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

// ---------------------------------------------------------------------------
// Implementazioni modalita'
// ---------------------------------------------------------------------------

interface LoopContext {
  scenario: Scenario;
  runId: string;
  startedAt: string;
  t0: number;
  moves: TraceMove[];
  addCost: (cost: number, providerName?: string) => void;
}

async function runManaGuessesGame(ctx: LoopContext): Promise<GameTrace> {
  const { scenario, moves, addCost } = ctx;
  if (!scenario.targetCharacter) {
    throw new Error('mana_guesses scenario requires targetCharacter');
  }

  const mana = new ManaAgent(scenario);
  const bot = new UserBot(scenario, scenario.targetCharacter);

  // Kickoff: imita il comportamento di /api/games/single/start in mana_guesses,
  // dove diamo a Mana il messaggio "Inizia la partita: fai la tua prima domanda."
  mana.pushUserMessage('Inizia la partita: fai la tua prima domanda.');

  let outcome: GameOutcome = 'timeout';
  let providerSnapshot = '';

  for (let turn = 0; turn < scenario.maxQuestions; turn++) {
    // Turno di Mana: fa una domanda o un guess.
    const manaResult = await mana.speak({ maxTokens: 100, temperature: 0.7 });
    addCost(manaResult.estimatedCostUsd, manaResult.providerName);
    providerSnapshot = manaResult.providerName;
    moves.push(makeManaMove(moves.length + 1, manaResult));

    // Turno del bot utente: risponde.
    bot.pushManaMessage(manaResult.text);
    const botResult = await bot.speak({ maxTokens: 80, temperature: 0.3 });
    addCost(botResult.estimatedCostUsd, botResult.providerName);
    moves.push(makeBotMove(moves.length + 1, botResult));

    if (botConfirmsManaWon(botResult.text)) {
      outcome = 'mana_won';
      break;
    }

    // Aggiungi la risposta del bot alla history di Mana per il prossimo turno.
    mana.pushUserMessage(botResult.text);
  }

  if (outcome === 'timeout') {
    // Esauriti i turni senza che il bot abbia confermato un guess di Mana.
    outcome = 'user_won'; // dal punto di vista del bot utente
  }

  return finalize(ctx, outcome, scenario.targetCharacter, providerSnapshot);
}

async function runUserGuessesGame(ctx: LoopContext): Promise<GameTrace> {
  const { scenario, moves, addCost } = ctx;

  // Step pre-loop: Mana sceglie un personaggio segreto, se non fornito dallo scenario.
  let resolvedTarget: string;
  if (scenario.targetCharacter) {
    resolvedTarget = scenario.targetCharacter;
  } else {
    const choice = await pickSecretCharacter(scenario);
    addCost(choice.estimatedCostUsd, choice.providerName);
    resolvedTarget = choice.text;
    if (!resolvedTarget) {
      throw new Error('Mana failed to pick a secret character');
    }
  }

  const mana = new ManaAgent(scenario, resolvedTarget);
  const bot = new UserBot(scenario);

  let outcome: GameOutcome = 'timeout';
  let providerSnapshot = '';

  for (let turn = 0; turn < scenario.maxQuestions; turn++) {
    // Turno del bot utente: fa una domanda (o un guess).
    const botResult = await bot.speak({ maxTokens: 80, temperature: 0.5 });
    addCost(botResult.estimatedCostUsd, botResult.providerName);
    moves.push(makeBotMove(moves.length + 1, botResult));

    // Turno di Mana: risponde alla domanda.
    mana.pushUserMessage(botResult.text);
    const manaResult = await mana.speak({ maxTokens: 100, temperature: 0.4 });
    addCost(manaResult.estimatedCostUsd, manaResult.providerName);
    providerSnapshot = manaResult.providerName;

    // Classifica la risposta di Mana via il parser ufficiale.
    const parsed = parseManaAnswer(manaResult.text);
    moves.push({
      index: moves.length + 1,
      actor: 'mana',
      text: manaResult.text,
      parsedKind: parsed.kind,
      parsedConfidence: parsed.confidence,
      latencyMs: manaResult.latencyMs,
      estimatedCostUsd: manaResult.estimatedCostUsd,
      inputTokens: manaResult.inputTokens,
      cachedInputTokens: manaResult.cachedInputTokens,
      outputTokens: manaResult.outputTokens,
      truncated: manaResult.truncated,
    });

    if (parsed.kind === 'correct_guess') {
      outcome = 'user_won';
      break;
    }

    // Continua: feed la risposta di Mana al bot per il prossimo turno.
    bot.pushManaMessage(manaResult.text);
  }

  if (outcome === 'timeout') {
    outcome = 'mana_won'; // Mana ha "vinto" tenendo segreto il personaggio.
  }

  return finalize(ctx, outcome, resolvedTarget, providerSnapshot);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeManaMove(index: number, r: AgentTurnResult): TraceMove {
  return {
    index,
    actor: 'mana',
    text: r.text,
    latencyMs: r.latencyMs,
    estimatedCostUsd: r.estimatedCostUsd,
    inputTokens: r.inputTokens,
    cachedInputTokens: r.cachedInputTokens,
    outputTokens: r.outputTokens,
    truncated: r.truncated,
  };
}

function makeBotMove(index: number, r: AgentTurnResult): TraceMove {
  return {
    index,
    actor: 'user_bot',
    text: r.text,
    latencyMs: r.latencyMs,
    estimatedCostUsd: r.estimatedCostUsd,
    inputTokens: r.inputTokens,
    cachedInputTokens: r.cachedInputTokens,
    outputTokens: r.outputTokens,
    truncated: r.truncated,
  };
}

/** Conta le mosse di "chi sta indovinando" in funzione della modalita'. */
function countManaQuestions(moves: TraceMove[], mode: 'mana_guesses' | 'user_guesses'): number {
  const askerActor = mode === 'mana_guesses' ? 'mana' : 'user_bot';
  return moves.filter((m) => m.actor === askerActor).length;
}

function finalize(
  ctx: LoopContext,
  outcome: GameOutcome,
  resolvedTarget: string,
  providerSnapshot: string,
): GameTrace {
  const endedAt = new Date().toISOString();
  let totalCostUsd = 0;
  for (const m of ctx.moves) {
    totalCostUsd += m.estimatedCostUsd ?? 0;
  }
  return {
    runId: ctx.runId,
    scenario: ctx.scenario,
    provider: providerSnapshot,
    resolvedTargetCharacter: resolvedTarget,
    outcome,
    questionsUsed: countManaQuestions(ctx.moves, ctx.scenario.mode),
    moves: ctx.moves,
    totalDurationMs: Date.now() - ctx.t0,
    totalCostUsd,
    startedAt: ctx.startedAt,
    endedAt,
  };
}

function validateScenario(s: Scenario): void {
  if (!s.id) throw new Error('Scenario.id is required');
  if (!Number.isInteger(s.maxQuestions) || s.maxQuestions <= 0) {
    throw new Error('Scenario.maxQuestions must be a positive integer');
  }
  if (s.mode === 'mana_guesses' && !s.targetCharacter) {
    throw new Error('mana_guesses scenarios require targetCharacter');
  }
  if (s.domains.length === 0) throw new Error('Scenario.domains must not be empty');
}
