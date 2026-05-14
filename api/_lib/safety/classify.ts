import OpenAI from 'openai';
import { getEnv } from '../config/env.js';

/**
 * Classificatore LLM "di seconda linea" per i casi che la Moderation API non
 * cattura: distinzione tra "domanda di gioco", "input neutro non offensivo",
 * e "input offensivo".
 *
 * Usiamo un modello economico (gpt-5.4-nano: $0.20/M input, $1.25/M output)
 * con risposta forzata in JSON per parsing affidabile.
 *
 * La chiamata e' molto breve (< 100 token output), quindi costa frazioni di
 * centesimo. Per evitare di consumare moderation_count anche per casi banali,
 * il chiamante prima fa la Moderation API, poi questo classificatore.
 */

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI {
  if (cachedClient) return cachedClient;
  const env = getEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for the safety classifier.');
  }
  cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return cachedClient;
}

const CLASSIFIER_MODEL = 'gpt-5.4-nano';

const CLASSIFIER_PROMPT = `Sei un classificatore di input utente per un gioco di indovina-il-personaggio chiamato "Mana".

Il giocatore puo' inviare:
1. Una DOMANDA DI GIOCO (es. "e' un personaggio italiano?", "vive in Italia?", "sei Pikachu?", "ha i baffi?"). Anche risposte sì/no a una domanda di Mana sono valide.
2. Un INPUT NEUTRO non offensivo (saluto, commento innocuo, frase senza senso, errore di battitura).
3. Un INPUT OFFENSIVO o DISCRIMINATORIO (insulto, parolaccia, hate speech, contenuto sessuale, razzista, omofobico, ecc.).
4. Una DOMANDA DI GIOCO MA FORMULATA IN MODO OFFENSIVO (es. "e' uno stronzo?", "e' un razzista di merda?").

Classifica l'input in una delle seguenti categorie:
- "game_question": una domanda valida sul personaggio, formulata in modo accettabile
- "neutral_non_question": qualcosa che non e' una domanda di gioco ma non e' offensivo
- "offensive_no_question": insulto puro o contenuto offensivo che non e' una domanda
- "offensive_question": una domanda di gioco con linguaggio offensivo

Rispondi UNICAMENTE con un oggetto JSON nella forma esatta:
{"category": "<una delle 4>", "reason": "<breve spiegazione in italiano max 10 parole>"}

Niente preambolo. Niente testo dopo il JSON.`;

export type SafetyCategory =
  | 'game_question'
  | 'neutral_non_question'
  | 'offensive_no_question'
  | 'offensive_question';

export interface ClassificationResult {
  category: SafetyCategory;
  reason: string;
}

/**
 * Classifica un input utente in una delle 4 categorie di safety.
 *
 * Usa gpt-5.4-nano con response_format JSON. In caso di parsing fallito
 * o errore di rete, restituisce 'neutral_non_question' come fallback
 * conservativo (non punisce l'utente per un nostro problema).
 */
export async function classifyInput(text: string): Promise<ClassificationResult> {
  const client = getClient();

  const completion = await client.chat.completions.create({
    model: CLASSIFIER_MODEL,
    messages: [
      { role: 'system', content: CLASSIFIER_PROMPT },
      { role: 'user', content: text },
    ],
    max_completion_tokens: 80,
    temperature: 0,
    response_format: { type: 'json_object' },
  });

  const content = completion.choices[0]?.message.content ?? '';

  try {
    const parsed = JSON.parse(content) as { category?: unknown; reason?: unknown };
    const category = parsed.category;
    const reason = typeof parsed.reason === 'string' ? parsed.reason : '';

    if (
      category === 'game_question' ||
      category === 'neutral_non_question' ||
      category === 'offensive_no_question' ||
      category === 'offensive_question'
    ) {
      return { category, reason };
    }
  } catch {
    // parsing fallito → fallback safe
  }

  return { category: 'neutral_non_question', reason: 'classifier_fallback' };
}

/**
 * Reset cache, per test.
 */
export function resetClassifierCache(): void {
  cachedClient = null;
}
