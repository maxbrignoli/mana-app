/**
 * Errori HTTP tipizzati e helper di risposta consistenti.
 *
 * Tutti gli endpoint del backend restituiscono errori nello stesso formato:
 *
 *   { "error": { "code": "UNAUTHORIZED", "message": "...", "details"?: {...} } }
 *
 * I codici sono stringhe in SCREAMING_SNAKE_CASE per essere facilmente
 * gestibili lato client (es. switch sul codice per mostrare messaggi in lingua).
 */

import type { VercelResponse } from '@vercel/node';

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'METHOD_NOT_ALLOWED'
  | 'INTERNAL_ERROR';

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const unauthorized = (message = 'Authentication required'): HttpError =>
  new HttpError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'Access denied'): HttpError =>
  new HttpError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found'): HttpError =>
  new HttpError(404, 'NOT_FOUND', message);

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, 'BAD_REQUEST', message, details);

export const validationError = (message: string, details?: unknown): HttpError =>
  new HttpError(400, 'VALIDATION_ERROR', message, details);

export const methodNotAllowed = (allowed: string[]): HttpError =>
  new HttpError(405, 'METHOD_NOT_ALLOWED', `Method not allowed. Allowed: ${allowed.join(', ')}`);

export const internalError = (message = 'Internal server error'): HttpError =>
  new HttpError(500, 'INTERNAL_ERROR', message);

/**
 * Invia una risposta di errore standardizzata, gestendo sia HttpError sia
 * errori generici (mappati a 500 INTERNAL_ERROR senza esporre dettagli).
 */
export function sendError(res: VercelResponse, error: unknown): void {
  if (error instanceof HttpError) {
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
    });
    return;
  }

  // Errore inatteso: non esponiamo il messaggio originale per non leakare
  // dettagli interni al client. Va loggato dal chiamante.
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}
