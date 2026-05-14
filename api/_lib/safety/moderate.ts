import OpenAI from 'openai';
import { getEnv } from '../config/env.js';

/**
 * Pre-filtro veloce con OpenAI Moderation API.
 *
 * Gratuito, latenza ~50ms, identifica contenuti chiaramente abusivi:
 * harassment, hate, sexual, violence, self-harm, illicit, ecc.
 *
 * Lo usiamo come prima linea di difesa: se un input e' chiaramente tossico
 * non serve nemmeno chiamare il classificatore LLM piu' costoso.
 *
 * Riferimento: https://platform.openai.com/docs/guides/moderation
 */

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  // Usa la chiave OpenAI se disponibile. La moderation funziona anche con la
  // chiave del provider di gioco se e' OpenAI; se il provider e' Anthropic
  // o altro, abbiamo bisogno comunque della OPENAI_API_KEY per usare questa
  // funzione gratuita. La validazione e' a piu' livelli.
  if (!env.OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY is required for the moderation API. ' +
        'Set it even if AI_PROVIDER is not openai.',
    );
  }
  cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

export interface ModerationResult {
  /** True se il testo e' classificato come tossico in almeno una categoria. */
  flagged: boolean;
  /** Categorie attivate (es. ['harassment', 'hate/threatening']). */
  categories: string[];
  /** Score complessivo: massimo tra le categorie (0-1). */
  maxScore: number;
}

/**
 * Verifica un testo con la Moderation API.
 *
 * In caso di errore di rete o quota, restituisce flagged=false per non bloccare
 * il gioco. L'errore viene loggato dal chiamante se serve.
 */
export async function moderate(text: string): Promise<ModerationResult> {
  if (!text || text.trim().length === 0) {
    return { flagged: false, categories: [], maxScore: 0 };
  }

  const client = getClient();
  const response = await client.moderations.create({
    model: 'omni-moderation-latest',
    input: text,
  });

  const result = response.results[0];
  if (!result) {
    return { flagged: false, categories: [], maxScore: 0 };
  }

  const activeCategories: string[] = [];
  let maxScore = 0;

  for (const [category, isActive] of Object.entries(result.categories)) {
    if (isActive) {
      activeCategories.push(category);
    }
  }

  for (const score of Object.values(result.category_scores)) {
    if (typeof score === 'number' && score > maxScore) {
      maxScore = score;
    }
  }

  return {
    flagged: result.flagged,
    categories: activeCategories,
    maxScore,
  };
}

/**
 * Reset cache, per test.
 */
export function resetModerationCache(): void {
  cachedClient = null;
}
