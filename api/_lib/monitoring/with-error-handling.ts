import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError, sendError } from '../http/errors.js';
import { logger } from '../logging/logger.js';
import { captureException, flushSentry } from './sentry.js';

/**
 * Wrapper standard per handler Vercel: gestisce errori in modo uniforme.
 *
 * Pattern centralizzato che sostituisce il try/catch ripetuto in ogni endpoint:
 * - HttpError: risposta standardizzata con sendError(). NON viene inviato a
 *   Sentry: sono errori "previsti" (auth, validation, rate limit, ecc.).
 * - Errori inattesi: loggati, inviati a Sentry, ritornati come 500 generico
 *   senza esporre dettagli interni al client.
 *
 * Flush Sentry a fine richiesta per evitare perdita eventi in serverless.
 *
 * Uso:
 *   export default withErrorHandling('/api/foo', async (req, res) => {
 *     // logica handler
 *   });
 */
export function withErrorHandling(
  routeName: string,
  handler: (req: VercelRequest, res: VercelResponse) => Promise<void>,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async function wrappedHandler(req, res) {
    try {
      await handler(req, res);
    } catch (error) {
      if (error instanceof HttpError) {
        // Errore previsto: solo log a livello info se 4xx, warn se 5xx
        if (error.status >= 500) {
          logger.warn('expected error 5xx', {
            route: routeName,
            status: error.status,
            code: error.code,
            message: error.message,
          });
        }
        sendError(res, error);
        return;
      }

      // Errore inatteso: log + Sentry + 500 generico
      logger.error('unhandled error', {
        route: routeName,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      captureException(error, { route: routeName });

      try {
        await flushSentry();
      } catch {
        // ignore
      }

      sendError(res, error);
    }
  };
}
