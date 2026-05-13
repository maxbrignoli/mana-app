import type { VercelRequest } from '@vercel/node';
import { getSupabaseAdmin } from '../db/supabase.js';
import { unauthorized } from '../http/errors.js';

/**
 * Utente autenticato estratto dal JWT della richiesta.
 *
 * Nota: e' un sotto-insieme dei campi disponibili in auth.users. Carichiamo
 * solo cio' che ci serve nei handler. Per dati del profilo (display_name,
 * private_id, ecc.) servira' una query a public.profiles.
 */
export interface AuthUser {
  id: string;
  email: string | undefined;
}

/**
 * Verifica il JWT Supabase nell'header Authorization e ritorna l'utente.
 *
 * Lancia HttpError(401) in caso di:
 * - header Authorization mancante
 * - formato dell'header non valido (atteso "Bearer <token>")
 * - token non valido o scaduto
 *
 * La verifica e' delegata al client Supabase con SERVICE_ROLE_KEY, che chiama
 * internamente l'auth API per validare il JWT. Questo evita di reimplementare
 * la verifica firma/scadenza a mano.
 */
export async function requireAuth(req: VercelRequest): Promise<AuthUser> {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw unauthorized('Missing Authorization header');
  }

  const match = /^Bearer\s+(.+)$/.exec(authHeader);
  if (!match) {
    throw unauthorized('Invalid Authorization header format. Expected: "Bearer <token>"');
  }

  const token = match[1]!;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data.user) {
    throw unauthorized('Invalid or expired token');
  }

  return {
    id: data.user.id,
    email: data.user.email,
  };
}
