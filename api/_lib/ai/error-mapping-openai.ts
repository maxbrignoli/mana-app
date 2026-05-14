import OpenAI from 'openai';
import {
  AIClientError,
  AINetworkError,
  AIRateLimitError,
  AIServerError,
} from './errors.js';
import type { AIError } from './errors.js';

/**
 * Mappa un errore lanciato dall'SDK OpenAI in un AIError tipizzato.
 *
 * I tipi dell'SDK OpenAI sono distinti per categoria HTTP:
 * - APIConnectionError / APIConnectionTimeoutError: problemi di rete
 * - RateLimitError (429): rate limit del provider
 * - AuthenticationError (401), PermissionDeniedError (403), NotFoundError (404),
 *   BadRequestError (400), UnprocessableEntityError (422): errori 4xx
 *   client-side che non hanno senso ritentare
 * - InternalServerError (5xx): errori provider transitori
 *
 * Vedi: node_modules/openai/error.d.ts
 *
 * NB: il content filter di OpenAI in chat.completions e' segnalato via
 * finish_reason='content_filter' nella response (non come errore). Quel
 * caso e' gestito nel provider, non qui.
 */
export function mapOpenAIError(error: unknown): AIError {
  // Network o timeout di connessione: l'SDK usa una classe dedicata
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return new AINetworkError('OpenAI connection timeout', error);
  }
  if (error instanceof OpenAI.APIConnectionError) {
    return new AINetworkError('OpenAI connection error', error);
  }

  // 429 rate limit
  if (error instanceof OpenAI.RateLimitError) {
    const retryAfterHeader = readRetryAfterHeader(error.headers);
    return new AIRateLimitError(
      'OpenAI rate limit exceeded',
      retryAfterHeader,
      summarize(error),
    );
  }

  // 5xx server errors
  if (error instanceof OpenAI.InternalServerError) {
    return new AIServerError(`OpenAI server error: ${error.status}`, summarize(error));
  }

  // 4xx client errors (auth, validation, ecc.) — NON retryable
  if (
    error instanceof OpenAI.AuthenticationError ||
    error instanceof OpenAI.PermissionDeniedError ||
    error instanceof OpenAI.NotFoundError ||
    error instanceof OpenAI.BadRequestError ||
    error instanceof OpenAI.UnprocessableEntityError ||
    error instanceof OpenAI.ConflictError
  ) {
    return new AIClientError(
      `OpenAI client error ${error.status}: ${error.message}`,
      summarize(error),
    );
  }

  // APIError generico (fallback): inferiamo retryable dal codice se possibile
  if (error instanceof OpenAI.APIError) {
    if (error.status && error.status >= 500) {
      return new AIServerError(
        `OpenAI server error: ${error.status}`,
        summarize(error),
      );
    }
    return new AIClientError(
      `OpenAI API error: ${error.message}`,
      summarize(error),
    );
  }

  // Non e' un errore OpenAI riconosciuto: lo wrappiamo come network (tendenzialmente retryable)
  const message = error instanceof Error ? error.message : String(error);
  return new AINetworkError(`Unknown error during OpenAI call: ${message}`, error);
}

/**
 * Mappa un errore lanciato dall'SDK Anthropic in un AIError tipizzato.
 *
 * Vedi: node_modules/@anthropic-ai/sdk/error.d.ts
 */
// Importiamo Anthropic dinamicamente nel chiamante per evitare import circolari
// e per non legare openai-provider al modulo Anthropic. Qui esponiamo solo la
// funzione, che il provider Anthropic chiamera' passando il proprio modulo.
// In pratica i due provider hanno mapper separati, vedi anthropic-provider.

function readRetryAfterHeader(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
  // L'SDK espone gli header come Headers Web o oggetto plain
  const get = (headers as { get?: (k: string) => string | null }).get;
  const raw =
    typeof get === 'function'
      ? get.call(headers, 'retry-after')
      : (headers as Record<string, string | undefined>)['retry-after'];
  if (!raw) return undefined;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds > 0) return Math.round(seconds * 1000);
  return undefined;
}

function summarize(error: { status?: number; message?: string; code?: string | null }): {
  status?: number;
  message?: string;
  code?: string | null;
} {
  return { status: error.status, message: error.message, code: error.code };
}
