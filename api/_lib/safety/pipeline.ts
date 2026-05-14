import { classifyInput, type SafetyCategory } from './classify.js';
import { moderate } from './moderate.js';

/**
 * Pipeline di safety completa per un input utente in una partita.
 *
 * Implementa la pipeline a 2 stadi descritta nel documento di progetto:
 * - Stadio 1: l'input e' una domanda di gioco? Se no, e' neutro o offensivo?
 * - Stadio 2: se e' una domanda di gioco, e' formulata in modo accettabile?
 *
 * Verdetto operativo (per il chiamante):
 * - 'allow': procede normalmente al gioco
 * - 'reject_neutral': rimbalzo cortese, niente penalita'
 * - 'reject_offensive_no_question': insulto puro, penalita' rage
 * - 'reject_offensive_question': domanda offensiva, penalita' rage
 *
 * Implementazione a due strati:
 * 1. Moderation API (gratis, ~50ms): se il testo e' chiaramente tossico
 *    (hate, sexual, violence), e' offensivo per definizione. Saltiamo
 *    il classificatore.
 * 2. Classifier LLM (gpt-5.4-nano): per gli altri input, distingue i 4
 *    casi possibili.
 *
 * In caso di errore nella pipeline (rete, quota, parsing), il fallback e'
 * conservativo: 'allow'. Non vogliamo che un nostro problema impedisca
 * all'utente di giocare. Se l'input era offensivo, al massimo verra'
 * catturato da Mana stessa o dalla moderation lato output.
 */

export type SafetyVerdict =
  | 'allow'
  | 'reject_neutral'
  | 'reject_offensive_no_question'
  | 'reject_offensive_question';

export interface SafetyCheckResult {
  verdict: SafetyVerdict;
  /** Categoria dettagliata dal classificatore, se chiamato. */
  classifierCategory?: SafetyCategory;
  /** Categorie moderation flaggate (solo se la moderation ha catturato). */
  moderationCategories?: string[];
  /** Score moderation (0-1) per analisi/logging. */
  moderationMaxScore?: number;
  /** Breve note testuale dal classificatore. */
  reason?: string;
}

/**
 * Verifica un input utente. Restituisce il verdetto operativo.
 *
 * @param text testo dell'utente da analizzare
 * @param context indica se siamo nel contesto di una mossa di gioco o di una
 *   verifica generale (puo' influenzare i futuri raffinamenti, per ora non usato)
 */
export async function checkInputSafety(
  text: string,
  context: 'game_move' | 'character_choice' = 'game_move',
): Promise<SafetyCheckResult> {
  const trimmed = text.trim();
  if (!trimmed) {
    return { verdict: 'reject_neutral', reason: 'empty_input' };
  }

  try {
    // Stadio 1a: moderation veloce
    const moderation = await moderate(trimmed);

    if (moderation.flagged) {
      // Catturato dalla moderation: per noi e' "offensive". Distinguere se
      // e' anche una domanda di gioco non e' essenziale: in entrambi i casi
      // la penalita' si applica. Marchiamo come 'offensive_no_question'
      // perche' nella maggior parte dei casi un insulto puro non e' una
      // domanda. Se invece era una domanda offensiva, il classificatore
      // l'avrebbe distinta — ma in caso di moderation positive saltiamo
      // il classificatore per risparmiare.
      return {
        verdict: 'reject_offensive_no_question',
        moderationCategories: moderation.categories,
        moderationMaxScore: moderation.maxScore,
        reason: `moderation: ${moderation.categories.join(', ')}`,
      };
    }

    // Stadio 1b/2: classificatore LLM per i casi piu' sfumati
    const classification = await classifyInput(trimmed);

    let verdict: SafetyVerdict;
    switch (classification.category) {
      case 'game_question':
        verdict = 'allow';
        break;
      case 'neutral_non_question':
        verdict = 'reject_neutral';
        break;
      case 'offensive_no_question':
        verdict = 'reject_offensive_no_question';
        break;
      case 'offensive_question':
        verdict = 'reject_offensive_question';
        break;
    }

    return {
      verdict,
      classifierCategory: classification.category,
      moderationMaxScore: moderation.maxScore,
      reason: classification.reason,
    };
  } catch (error) {
    // Fallback conservativo: lasciamo passare. Il chiamante puo' loggare.
    return {
      verdict: 'allow',
      reason: `pipeline_error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // Riferimento non usato per ora (context). Lo manteniamo per evoluzioni future.
  void context;
}
