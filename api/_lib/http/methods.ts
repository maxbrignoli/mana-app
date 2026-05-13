import type { VercelRequest, VercelResponse } from '@vercel/node';
import { methodNotAllowed, sendError } from './errors.js';

/**
 * Verifica che il metodo della richiesta sia tra quelli permessi.
 *
 * Se il metodo non e' ammesso, invia 405 e ritorna false.
 * Il chiamante deve fare `return` se la funzione ritorna false.
 *
 * Esempio:
 *   if (!allowMethods(req, res, ['GET'])) return;
 */
export function allowMethods(
  req: VercelRequest,
  res: VercelResponse,
  methods: string[],
): boolean {
  if (!req.method || !methods.includes(req.method)) {
    sendError(res, methodNotAllowed(methods));
    return false;
  }
  return true;
}
