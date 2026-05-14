/**
 * Errori tipizzati delle chiamate AI.
 *
 * Servono per:
 * - distinguere errori retryable (transitori: rate limit, server, network,
 *   timeout) da non retryable (auth, validation, content filter)
 * - dare al chiamante informazioni strutturate (es. retry-after dal provider)
 * - permettere logging coerente con tipo dell'errore
 *
 * Gli errori SDK dei provider (OpenAI, Anthropic) vengono mappati in queste
 * classi dalle implementazioni concrete. Il resto del codice deve poter
 * lavorare con AIError senza conoscere il provider.
 */

export type AIErrorKind =
  | 'timeout'
  | 'rate_limit'
  | 'server_error'
  | 'network'
  | 'client_error'
  | 'content_filter'
  | 'unknown';

export class AIError extends Error {
  readonly kind: AIErrorKind;
  /** True se ha senso ritentare la chiamata. */
  readonly retryable: boolean;
  /** Dettagli grezzi del provider, utili per il log. */
  readonly providerDetails?: unknown;
  /** Suggerimento di attesa minima dal provider (millisecondi). */
  readonly retryAfterMs?: number;

  constructor(
    kind: AIErrorKind,
    message: string,
    options: {
      retryable: boolean;
      providerDetails?: unknown;
      retryAfterMs?: number;
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'AIError';
    this.kind = kind;
    this.retryable = options.retryable;
    this.providerDetails = options.providerDetails;
    this.retryAfterMs = options.retryAfterMs;
    if (options.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class AITimeoutError extends AIError {
  constructor(timeoutMs: number, cause?: unknown) {
    super('timeout', `AI request timed out after ${timeoutMs}ms`, {
      retryable: true,
      cause,
    });
    this.name = 'AITimeoutError';
  }
}

export class AIRateLimitError extends AIError {
  constructor(message: string, retryAfterMs?: number, providerDetails?: unknown) {
    super('rate_limit', message, {
      retryable: true,
      retryAfterMs,
      providerDetails,
    });
    this.name = 'AIRateLimitError';
  }
}

export class AIServerError extends AIError {
  constructor(message: string, providerDetails?: unknown) {
    super('server_error', message, {
      retryable: true,
      providerDetails,
    });
    this.name = 'AIServerError';
  }
}

export class AINetworkError extends AIError {
  constructor(message: string, cause?: unknown) {
    super('network', message, {
      retryable: true,
      cause,
    });
    this.name = 'AINetworkError';
  }
}

export class AIClientError extends AIError {
  constructor(message: string, providerDetails?: unknown) {
    super('client_error', message, {
      retryable: false,
      providerDetails,
    });
    this.name = 'AIClientError';
  }
}

export class AIContentFilterError extends AIError {
  constructor(message: string, providerDetails?: unknown) {
    super('content_filter', message, {
      retryable: false,
      providerDetails,
    });
    this.name = 'AIContentFilterError';
  }
}

/**
 * Type guard: vero se l'errore e' un AIError ritentabile.
 */
export function isRetryableAIError(error: unknown): error is AIError {
  return error instanceof AIError && error.retryable;
}
