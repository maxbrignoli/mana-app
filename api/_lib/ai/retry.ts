import { isRetryableAIError } from './errors.js';
import type { AIError } from './errors.js';

/**
 * Logica di retry con backoff esponenziale + jitter, per chiamate AI.
 *
 * Strategia:
 * - max N tentativi totali (default 3)
 * - prima attesa baseDelayMs (default 500)
 * - ad ogni fallimento, attesa = min(base * 2^n + jitter, maxDelayMs)
 * - jitter random fino a +25% per evitare effetti di sincronizzazione
 *
 * Se l'errore non e' AIError "retryable", la prima eccezione viene rilanciata
 * subito (es. AIClientError 401, AIContentFilterError). Solo gli errori
 * transitori si ritentano.
 *
 * Se il provider fornisce retryAfterMs (es. header Retry-After in 429),
 * lo rispettiamo: attendiamo almeno quel valore.
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  onRetry?: (info: { attempt: number; error: AIError; delayMs: number }) => void;
}

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 5_000;

export async function withRetry<T>(
  task: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  let attempt = 0;
  // ESLint puo' lamentarsi del while(true): meglio un ciclo controllato.
  for (;;) {
    attempt += 1;
    try {
      return await task();
    } catch (error) {
      const isLastAttempt = attempt >= maxAttempts;
      if (isLastAttempt || !isRetryableAIError(error)) {
        throw error;
      }

      const aiError = error;
      const expBackoff = baseDelayMs * 2 ** (attempt - 1);
      const jitter = expBackoff * 0.25 * Math.random();
      const providerHint = aiError.retryAfterMs ?? 0;
      const delayMs = Math.min(Math.max(expBackoff + jitter, providerHint), maxDelayMs);

      options.onRetry?.({ attempt, error: aiError, delayMs });

      await sleep(delayMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
