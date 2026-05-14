/**
 * Tipi del trace prodotto dal self-play harness.
 *
 * Una partita auto-giocata produce un GameTrace, che e' un oggetto serializzabile
 * con tutte le informazioni necessarie per:
 * - misurare metriche aggregate (% vittorie, durata, costi)
 * - fare diagnosi qualitativa (rileggere a posteriori cosa hanno detto i due agenti)
 * - alimentare tuning iterativo dei prompt
 *
 * Tutti i campi sono in chiaro: il bench non passa da DB ne' da crittografia.
 */

import type { Difficulty, GameMode } from '../../api/_lib/game/types.js';
import type { ManaAnswerKind, ParseConfidence } from '../../api/_lib/ai/output/answer-parser.js';

/**
 * Esito finale di una partita self-played.
 * - mana_won/user_won: chi ha indovinato per primo (a seconda della mode)
 * - timeout: max questions raggiunte senza indovinare
 * - error: la partita si e' interrotta per un errore tecnico (es. AI down)
 */
export type GameOutcome = 'mana_won' | 'user_won' | 'timeout' | 'error';

/**
 * Una "mossa" del trace, abbastanza ricca da poter rileggere la partita.
 */
export interface TraceMove {
  /** Indice progressivo, 1-based per leggibilita'. */
  index: number;
  /** Chi parla in questo turno. */
  actor: 'mana' | 'user_bot';
  /** Testo grezzo prodotto dall'agente. */
  text: string;
  /**
   * Solo per mosse di Mana in modalita' user_guesses: l'output del parser
   * applicato al testo. Permette di valutare a posteriori la solidita' del
   * classificatore.
   */
  parsedKind?: ManaAnswerKind;
  parsedConfidence?: ParseConfidence;
  /**
   * Latenza della chiamata AI per questo turno (ms). Solo per turni che
   * hanno richiesto una chiamata AI (entrambi gli agenti, in pratica).
   */
  latencyMs?: number;
  /** Costo stimato in USD per questo turno. */
  estimatedCostUsd?: number;
  /** Token consumati per questo turno, se disponibili dal provider. */
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  /**
   * Se la risposta AI e' arrivata troncata (finishReason='length').
   * Indica che il length-recovery e' scattato o che il limite era troppo basso.
   */
  truncated?: boolean;
  /** Errori durante questo turno (rari ma possibili). */
  error?: string;
}

/**
 * Lo scenario definisce la configurazione della partita: cosa giochiamo
 * e con quali parametri. Negli scenari piu' avanzati conterra' anche
 * un personaggio target esplicito (per riproducibilita').
 */
export interface Scenario {
  /** Id univoco usato in log e report. */
  id: string;
  /** Modalita' di gioco. */
  mode: GameMode;
  /**
   * Personaggio target. Obbligatorio per mana_guesses (il bot utente deve
   * saperlo). Opzionale per user_guesses: se omesso, lasciamo che Mana lo
   * scelga; se valorizzato, sovrascriviamo la scelta di Mana per avere un
   * test riproducibile.
   */
  targetCharacter?: string;
  /** Domini ammessi per la partita. */
  domains: string[];
  difficulty: Difficulty;
  /** Culture target (es. ['italian', 'global']). */
  cultures: string[];
  /** Eta' simulata dell'utente. Se null, prompt senza personalizzazione. */
  age: number | null;
  /** Massimo numero di domande consentite. */
  maxQuestions: number;
}

/**
 * Trace completo prodotto da una partita auto-giocata. E' l'unita' di output
 * del runner: serializzabile a JSON, leggibile direttamente, aggregabile.
 */
export interface GameTrace {
  /** Id univoco del run (timestamp + random). */
  runId: string;
  /** Lo scenario eseguito. */
  scenario: Scenario;
  /** Quale modello/provider abbiamo usato (snapshot per riproducibilita'). */
  provider: string;
  /** Personaggio target effettivo (resolved). Per user_guesses senza target,
   *  questo e' il personaggio scelto da Mana al PR start. */
  resolvedTargetCharacter: string;
  /** Esito finale. */
  outcome: GameOutcome;
  /** Numero di domande di Mana usate (corrisponde a questions_used). */
  questionsUsed: number;
  /** Ordine cronologico delle mosse. */
  moves: TraceMove[];
  /** Durata totale wall-clock della partita (ms). */
  totalDurationMs: number;
  /** Costo totale stimato in USD (somma di tutti i turni). */
  totalCostUsd: number;
  /** Timestamp di inizio (ISO). */
  startedAt: string;
  /** Timestamp di fine (ISO). */
  endedAt: string;
  /** Se outcome='error', il messaggio dell'errore. */
  errorMessage?: string;
}
