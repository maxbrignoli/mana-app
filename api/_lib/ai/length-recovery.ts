import type { AIProvider, ChatParams, ChatResponse } from './types.js';
import { logger } from '../logging/logger.js';

/**
 * Chiama l'AI con una sola "remediation" se la risposta arriva troncata
 * (finishReason === 'length').
 *
 * Approccio:
 * 1. Esegue una prima chiamata con i parametri dati.
 * 2. Se finishReason === 'length', ritenta UNA volta sola raddoppiando
 *    maxTokens (cap a `maxTokensCap`). Logga il retry come warn.
 * 3. Se anche il retry e' troncato, ritorna comunque la risposta troncata
 *    con un log warn esplicito: meglio dare al giocatore qualcosa che
 *    fallire del tutto.
 *
 * Per finishReason === 'content_filter' lasciamo che sia il chiamante
 * a gestirlo (di solito significa rifiutare la mossa senza salvarla in DB).
 */
export async function chatWithLengthRecovery(
  ai: AIProvider,
  params: ChatParams,
  options: { maxTokensCap?: number } = {},
): Promise<ChatResponse> {
  const maxTokensCap = options.maxTokensCap ?? 800;

  const first = await ai.chat(params);

  if (first.finishReason !== 'length') {
    return first;
  }

  const firstMaxTokens = params.maxTokens ?? 1024;
  const retryMaxTokens = Math.min(firstMaxTokens * 2, maxTokensCap);

  // Se non c'e' margine reale per ritentare (gia' al cap), restituiamo
  // la risposta troncata cosi' com'e' con un log esplicito.
  if (retryMaxTokens <= firstMaxTokens) {
    logger.warn('ai response truncated, no headroom to retry', {
      provider: first.providerName,
      maxTokensUsed: firstMaxTokens,
    });
    return first;
  }

  logger.warn('ai response truncated, retrying with higher maxTokens', {
    provider: first.providerName,
    firstMaxTokens,
    retryMaxTokens,
  });

  const second = await ai.chat({ ...params, maxTokens: retryMaxTokens });

  if (second.finishReason === 'length') {
    logger.warn('ai response truncated even after retry', {
      provider: second.providerName,
      retryMaxTokens,
    });
  }

  return second;
}
