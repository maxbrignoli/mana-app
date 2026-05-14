import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAuth } from './_lib/auth/require-auth.js';
import { getSupabaseAdmin } from './_lib/db/supabase.js';
import { notFound } from './_lib/http/errors.js';
import { allowMethods } from './_lib/http/methods.js';
import { logger } from './_lib/logging/logger.js';
import { withErrorHandling } from './_lib/monitoring/with-error-handling.js';
import { enforceRateLimit } from './_lib/rate-limit/enforce.js';

/**
 * GET /api/me
 *
 * Restituisce profilo e balance gemme dell'utente autenticato.
 *
 * Authentication: richiesta. Header Authorization: Bearer <jwt-supabase>.
 * Rate limit: categoria 'profile' (60 req/min per utente).
 *
 * Response 200:
 *   {
 *     profile: { id, private_id, display_name, email, age, country_code,
 *                cultures, preferred_language, preferred_difficulty, avatar_id,
 *                rage_level, created_at },
 *     gems: { balance, last_regen_at }
 *   }
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET'])) return;

  const user = await requireAuth(req);
  await enforceRateLimit(req, res, 'profile', user.id);

  const supabase = getSupabaseAdmin();

  // Carichiamo profilo e gemme in parallelo per ridurre la latenza.
  const [profileResult, gemsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, private_id, display_name, email, age, country_code, cultures, preferred_language, preferred_difficulty, avatar_id, rage_level, created_at',
      )
      .eq('id', user.id)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('gems_balance')
      .select('balance, last_regen_at')
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (profileResult.error) {
    logger.error('failed to load profile', {
      userId: user.id,
      error: profileResult.error.message,
    });
    throw new Error('Database error loading profile');
  }

  if (!profileResult.data) {
    // L'utente esiste in auth.users (JWT valido) ma non ha un profilo
    // in public.profiles. Significa onboarding incompleto.
    throw notFound('Profile not found. Complete onboarding first.');
  }

  if (gemsResult.error) {
    logger.error('failed to load gems balance', {
      userId: user.id,
      error: gemsResult.error.message,
    });
    throw new Error('Database error loading gems balance');
  }

  res.status(200).json({
    profile: profileResult.data,
    gems: gemsResult.data ?? { balance: 0, last_regen_at: null },
  });
}

export default withErrorHandling('/api/me', handler);
