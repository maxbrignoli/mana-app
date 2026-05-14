import type { VercelRequest } from '@vercel/node';
import { getSupabaseAdmin } from '../db/supabase.js';
import { forbidden } from '../http/errors.js';
import { requireAuth, type AuthUser } from './require-auth.js';

/**
 * Verifica che l'utente autenticato abbia il flag is_admin in profiles.
 *
 * Lancia HttpError(401) se non autenticato (delegato a requireAuth).
 * Lancia HttpError(403) se autenticato ma non admin.
 *
 * Il flag is_admin viene settato manualmente via SQL — non c'e' modo per
 * un utente di promuoversi via API.
 */
export async function requireAdmin(req: VercelRequest): Promise<AuthUser> {
  const user = await requireAuth(req);
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to verify admin role: ${error.message}`);
  }

  if (!data?.is_admin) {
    throw forbidden('Admin access required');
  }

  return user;
}
