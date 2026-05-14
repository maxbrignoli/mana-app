import Anthropic from '@anthropic-ai/sdk';
import {
  AIClientError,
  AINetworkError,
  AIRateLimitError,
  AIServerError,
} from './errors.js';
import type { AIError } from './errors.js';

/**
 * Mappa un errore lanciato dall'SDK Anthropic in un AIError tipizzato.
 *
 * L'SDK Anthropic ha una gerarchia di errori simile a quella OpenAI:
 * - APIConnectionError / APIConnectionTimeoutError: rete
 * - RateLimitError (429)
 * - InternalServerError (5xx)
 * - AuthenticationError, BadRequestError, NotFoundError, ecc. (4xx)
 */
export function mapAnthropicError(error: unknown): AIError {
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AINetworkError('Anthropic connection timeout', error);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AINetworkError('Anthropic connection error', error);
  }

  if (error instanceof Anthropic.RateLimitError) {
    const retryAfter = readRetryAfterHeader(error.headers);
    return new AIRateLimitError(
      'Anthropic rate limit exceeded',
      retryAfter,
      summarize(error),
    );
  }

  if (error instanceof Anthropic.InternalServerError) {
    return new AIServerError(`Anthropic server error: ${error.status}`, summarize(error));
  }

  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError ||
    error instanceof Anthropic.NotFoundError ||
    error instanceof Anthropic.BadRequestError ||
    error instanceof Anthropic.UnprocessableEntityError ||
    error instanceof Anthropic.ConflictError
  ) {
    return new AIClientError(
      `Anthropic client error ${error.status}: ${error.message}`,
      summarize(error),
    );
  }

  if (error instanceof Anthropic.APIError) {
    if (error.status && error.status >= 500) {
      return new AIServerError(
        `Anthropic server error: ${error.status}`,
        summarize(error),
      );
    }
    return new AIClientError(`Anthropic API error: ${error.message}`, summarize(error));
  }

  const message = error instanceof Error ? error.message : String(error);
  return new AINetworkError(`Unknown error during Anthropic call: ${message}`, error);
}

function readRetryAfterHeader(headers: unknown): number | undefined {
  if (!headers || typeof headers !== 'object') return undefined;
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

function summarize(error: { status?: number; message?: string }): {
  status?: number;
  message?: string;
} {
  return { status: error.status, message: error.message };
}
