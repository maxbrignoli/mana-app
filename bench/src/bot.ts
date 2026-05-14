/**
 * Agenti del self-play harness: il bot utente e l'agente Mana.
 *
 * Entrambi sono wrapper sottili intorno a chatWithLengthRecovery che
 * mantengono la propria cronologia conversazionale interna. Il runner
 * coordina i loro turni; loro non si parlano direttamente, il runner
 * passa l'output di uno come input all'altro.
 *
 * Il system prompt di Mana viene preso direttamente da
 * api/_lib/ai/prompts/single-game.ts (gli STESSI prompt che usa il
 * backend reale). Il system prompt del bot utente vive in questo
 * modulo, perche' e' codice specifico del bench.
 */

import { getAIProvider } from '../../api/_lib/ai/index.js';
import { chatWithLengthRecovery } from '../../api/_lib/ai/length-recovery.js';
import {
  buildSystemPromptManaGuesses,
  buildSystemPromptUserGuesses,
  buildCharacterChoicePrompt,
} from '../../api/_lib/ai/prompts/single-game.js';
import type { ChatResponse, Message } from '../../api/_lib/ai/types.js';
import {
  buildUserBotPromptManaGuesses,
  buildUserBotPromptUserGuesses,
} from './prompts/user-bot.js';
import type { Scenario } from './types.js';

/**
 * Risultato di un singolo turno di un agente. Include sia il testo sia i
 * dati di telemetria utili per il trace (latenza, costo, troncamento).
 */
export interface AgentTurnResult {
  text: string;
  latencyMs: number;
  estimatedCostUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  truncated: boolean;
  providerName: string;
}

/**
 * Helper: chiama l'AI con timing wall-clock e produce un AgentTurnResult.
 *
 * Centralizza la gestione di chatWithLengthRecovery + telemetria per
 * entrambi gli agenti. Cosi' eventuali tweak (es. log strutturato,
 * metriche custom) sono in un posto solo.
 */
async function runAgentCall(args: {
  systemPrompt: string;
  history: Message[];
  maxTokens: number;
  temperature: number;
}): Promise<AgentTurnResult> {
  const ai = getAIProvider();
  const t0 = Date.now();

  let response: ChatResponse;
  try {
    response = await chatWithLengthRecovery(ai, {
      systemPrompt: args.systemPrompt,
      messages: args.history,
      maxTokens: args.maxTokens,
      temperature: args.temperature,
    });
  } finally {
    // niente: il timing va misurato anche su error. Lo facciamo dopo
    // l'eventuale rethrow al chiamante.
  }

  const latencyMs = Date.now() - t0;

  return {
    text: response.content.trim(),
    latencyMs,
    estimatedCostUsd: response.usage.estimatedCostUsd,
    inputTokens: response.usage.inputTokens,
    cachedInputTokens: response.usage.cachedInputTokens,
    outputTokens: response.usage.outputTokens,
    truncated: response.finishReason === 'length',
    providerName: response.providerName,
  };
}

/**
 * Agente "Mana". Wrappa il prompt builder appropriato (uno per modalita')
 * e mantiene la propria history conversazionale dal punto di vista di
 * Mana (Mana = assistant, utente = user, come fa il backend reale).
 */
export class ManaAgent {
  private readonly systemPrompt: string;
  private readonly history: Message[] = [];

  constructor(scenario: Scenario, resolvedTargetCharacter?: string) {
    if (scenario.mode === 'mana_guesses') {
      this.systemPrompt = buildSystemPromptManaGuesses({
        mode: 'mana_guesses',
        age: scenario.age,
        difficulty: scenario.difficulty,
        cultures: scenario.cultures,
        domains: scenario.domains,
        maxQuestions: scenario.maxQuestions,
      });
    } else {
      if (!resolvedTargetCharacter) {
        throw new Error(
          'ManaAgent in user_guesses mode requires resolvedTargetCharacter',
        );
      }
      this.systemPrompt = buildSystemPromptUserGuesses({
        mode: 'user_guesses',
        age: scenario.age,
        difficulty: scenario.difficulty,
        cultures: scenario.cultures,
        domains: scenario.domains,
        maxQuestions: scenario.maxQuestions,
        secretCharacter: resolvedTargetCharacter,
      });
    }
  }

  /** Aggiunge un messaggio user (cioe' input dal bot utente) alla history. */
  pushUserMessage(content: string): void {
    this.history.push({ role: 'user', content });
  }

  /**
   * Mana parla: chiama l'AI, salva la risposta in history come assistant,
   * ritorna il risultato del turno.
   */
  async speak(opts: { maxTokens?: number; temperature?: number } = {}): Promise<AgentTurnResult> {
    const result = await runAgentCall({
      systemPrompt: this.systemPrompt,
      history: [...this.history],
      maxTokens: opts.maxTokens ?? 100,
      temperature: opts.temperature ?? 0.7,
    });
    this.history.push({ role: 'assistant', content: result.text });
    return result;
  }
}

/**
 * Agente "Bot utente". Specchio simmetrico di ManaAgent: dal suo punto di
 * vista, il bot e' assistant e Mana e' user. La history e' separata.
 *
 * Differisce da ManaAgent perche' il prompt e' diverso e perche' usa una
 * temperatura piu' bassa: vogliamo che il bot risponda in modo coerente
 * e prevedibile, non creativo.
 */
export class UserBot {
  private readonly systemPrompt: string;
  private readonly history: Message[] = [];

  constructor(scenario: Scenario, targetCharacter?: string) {
    if (scenario.mode === 'mana_guesses') {
      if (!targetCharacter) {
        throw new Error('UserBot in mana_guesses mode requires targetCharacter');
      }
      this.systemPrompt = buildUserBotPromptManaGuesses(scenario, targetCharacter);
    } else {
      this.systemPrompt = buildUserBotPromptUserGuesses(scenario);
    }
  }

  /** Aggiunge un messaggio di Mana (input per il bot) alla history. */
  pushManaMessage(content: string): void {
    this.history.push({ role: 'user', content });
  }

  /**
   * Il bot parla. In mana_guesses produce una delle 6 risposte canoniche;
   * in user_guesses produce una domanda libera (o un guess esplicito).
   *
   * Temperatura bassa (0.3) per coerenza. Max 100 token, sufficienti per
   * sia "Sì" sia una domanda di 15 parole sia un guess "È Maradona?".
   */
  async speak(opts: { maxTokens?: number; temperature?: number } = {}): Promise<AgentTurnResult> {
    const result = await runAgentCall({
      systemPrompt: this.systemPrompt,
      history: [...this.history],
      maxTokens: opts.maxTokens ?? 100,
      temperature: opts.temperature ?? 0.3,
    });
    this.history.push({ role: 'assistant', content: result.text });
    return result;
  }
}

/**
 * Helper: fa scegliere a Mana un personaggio segreto, come fa il backend
 * reale in /api/games/single/start per la modalita' user_guesses.
 * Restituisce il nome del personaggio scelto (in chiaro, ovviamente:
 * siamo nel bench).
 */
export async function pickSecretCharacter(scenario: Scenario): Promise<AgentTurnResult> {
  const systemPrompt = buildCharacterChoicePrompt({
    mode: 'user_guesses',
    age: scenario.age,
    difficulty: scenario.difficulty,
    cultures: scenario.cultures,
    domains: scenario.domains,
    maxQuestions: scenario.maxQuestions,
  });
  return runAgentCall({
    systemPrompt,
    history: [{ role: 'user', content: 'Scegli ora.' }],
    maxTokens: 30,
    temperature: 0.9,
  });
}
