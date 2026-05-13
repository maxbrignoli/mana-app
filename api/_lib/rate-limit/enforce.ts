import type { VercelRequest, VercelResponse } from '@vercel/node';
import { HttpError } from '../http/errors.js';
import { checkRateLimit, type RateLimitCategory } from './limiter.js';

/**
 * Estrae un identificatore stabile per il rate limit dalla richiesta.
 *
 * - Se l'utente e' autenticato (user.id passato), usiamo l'user_id come chiave.
 *   In questo modo gli abusi sono limitati per account, non per device.
 * - Altrimenti usiamo l'IP, leggendolo dagli header che Vercel imposta:
 *   x-forwarded-for puo' contenere una catena di IP, il primo e' quello reale.
 *   Se nemmeno quello e' presente (es. test locale) usiamo un fallback fisso.
 */
function identifierFromRequest(req: VercelRequest, userId?: string): string {
  if (userId) return `user:${userId}`;

  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const firstIp = xff.split(',')[0]!.trim();
    return `ip:${firstIp}`;
  }

  return 'ip:unknown';
}

/**
 * Verifica il rate limit per la richiesta. Se l'identifier ha superato il
 * limite, imposta gli header standard (X-RateLimit-*) e lancia HttpError(429).
 *
 * Quando la verifica passa, imposta comunque gli header informativi sulla
 * response, cosi' il client puo' regolarsi (sapere quante richieste gli restano).
 *
 * Va chiamato dopo requireAuth se l'endpoint e' autenticato (cosi' l'userId
 * e' disponibile), o all'inizio del handler se e' pubblico.
 */
export async function enforceRateLimit(
  req: VercelRequest,
  res: VercelResponse,
  category: RateLimitCategory,
  userId?: string,
): Promise<void> {
  const identifier = identifierFromRequest(req, userId);
  const result = await checkRateLimit(category, identifier);

  // Header standard (X-RateLimit-*) tipici di GitHub, Stripe, ecc.
  res.setHeader('X-RateLimit-Limit', result.limit.toString());
  res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(result.reset / 1000).toString());

  if (!result.success) {
    const retryAfterSec = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    res.setHeader('Retry-After', retryAfterSec.toString());
    throw new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.', {
      retryAfterSeconds: retryAfterSec,
    });
  }
}
