import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '../config/env.js';

/**
 * Client Supabase per uso server-side.
 *
 * Usa la SERVICE_ROLE_KEY, che bypassa Row-Level Security (RLS).
 *
 * IMPORTANTE: questo client NON deve mai essere esposto al browser o al client
 * Flutter. Vive solo nelle Vercel functions. Il client mobile usa la chiave
 * anon/publishable e rispetta le RLS policy.
 *
 * Con la service_role, il backend e' responsabile di applicare a mano i
 * controlli di autorizzazione che con RLS verrebbero applicati dal DB:
 * - "questo utente puo' modificare questo record?"
 * - "questa partita appartiene a questo player?"
 * - ecc.
 *
 * Il middleware di autenticazione (PR successivo) caricara' l'utente dal JWT
 * e i nostri handler controlleranno i permessi prima di operare.
 */

let cachedClient: SupabaseClient | null = null;

/**
 * Restituisce il client Supabase server-side, creandolo al primo uso.
 *
 * Lazy + memoized: il client e' singleton per processo (cold start),
 * cosi' le chiamate successive nello stesso container Vercel riusano
 * la stessa istanza.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const env = getEnv();

  cachedClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return cachedClient;
}

/**
 * Reset della cache, principalmente per i test.
 */
export function resetSupabaseAdminCache(): void {
  cachedClient = null;
}
