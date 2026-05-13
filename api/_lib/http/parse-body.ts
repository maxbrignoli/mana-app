import type { VercelRequest } from '@vercel/node';
import type { z } from 'zod';
import { validationError } from './errors.js';

/**
 * Parsa e valida il body della richiesta contro uno schema Zod.
 *
 * Su payload non valido lancia HttpError(400, VALIDATION_ERROR) con un
 * details strutturato che il client puo' usare per evidenziare errori
 * sui singoli campi.
 *
 * Si presume che il body sia gia' stato parsato come JSON da Vercel
 * (lo fa automaticamente se Content-Type e' application/json).
 */
export function parseBody<T>(req: VercelRequest, schema: z.ZodType<T>): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
      code: issue.code,
    }));
    throw validationError('Request body validation failed', { issues: details });
  }
  return result.data;
}
