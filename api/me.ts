import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z } from 'zod';
import { requireAuth } from './_lib/auth/require-auth.js';
import { getSupabaseAdmin } from './_lib/db/supabase.js';
import { notFound } from './_lib/http/errors.js';
import { allowMethods } from './_lib/http/methods.js';
import { parseBody } from './_lib/http/parse-body.js';
import { logger } from './_lib/logging/logger.js';
import { withErrorHandling } from './_lib/monitoring/with-error-handling.js';
import { enforceRateLimit } from './_lib/rate-limit/enforce.js';

/**
 * GET /api/me
 *
 * Restituisce profilo, balance gemme e statistiche aggregate dell'utente
 * autenticato. Le statistiche sono calcolate con query aggregate su
 * single_games + multiplayer_games.
 *
 * PATCH /api/me
 *
 * Aggiorna il profilo dell'utente autenticato. Per ora supporta:
 * - display_name: stringa 1-30 caratteri trim
 * - avatar_id: stringa, deve esistere nel set di avatar disponibili
 *   (validazione lato server: solo formato sintattico per ora, il set
 *   completo arrivera' in Fase 7)
 *
 * Altri campi del profilo (age, country_code, cultures, ...) NON sono
 * modificabili tramite questo endpoint: l'utente li imposta solo via
 * onboarding (PR #6 della Fase 6).
 *
 * Authentication: richiesta. Rate limit: 'profile' (60 req/min).
 */

const patchBodySchema = z
  .object({
    display_name: z
      .string()
      .trim()
      .min(1, 'display_name cannot be empty')
      .max(30, 'display_name max length is 30')
      .optional(),
    avatar_id: z
      .string()
      .trim()
      .regex(/^[a-z0-9_]{1,40}$/, 'avatar_id must match /^[a-z0-9_]{1,40}$/')
      .optional(),
  })
  .strict()
  .refine(
    (data) => data.display_name !== undefined || data.avatar_id !== undefined,
    'At least one field must be provided (display_name or avatar_id)',
  );

async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return;

  const user = await requireAuth(req);
  await enforceRateLimit(req, res, 'profile', user.id);

  if (req.method === 'PATCH') {
    await handlePatch(req, res, user.id);
    return;
  }

  await handleGet(req, res, user.id);
}

async function handleGet(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Carichiamo profilo, gemme e stats in parallelo per ridurre la latenza.
  // Le statistiche usano count: 'exact', head: true per non scaricare le righe.
  const [profileResult, gemsResult, singleTotal, singleWon] = await Promise.all([
    supabase
      .from('profiles')
      .select(
        'id, private_id, display_name, email, age, country_code, cultures, preferred_language, preferred_difficulty, avatar_id, rage_level, created_at',
      )
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle(),
    supabase
      .from('gems_balance')
      .select('balance, last_regen_at')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('single_games')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .neq('result', 'in_progress'),
    supabase
      .from('single_games')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('result', 'user_won'),
  ]);

  if (profileResult.error) {
    logger.error('failed to load profile', {
      userId,
      error: profileResult.error.message,
    });
    throw new Error('Database error loading profile');
  }

  if (!profileResult.data) {
    throw notFound('Profile not found. Complete onboarding first.');
  }

  if (gemsResult.error) {
    logger.error('failed to load gems balance', {
      userId,
      error: gemsResult.error.message,
    });
    throw new Error('Database error loading gems balance');
  }

  // Rilevazione paese via IP al primo /api/me. Se il profilo non ha
  // ancora country_code (e' appena stato creato dal trigger DB), proviamo
  // a popolarlo dall'header x-vercel-ip-country che Vercel popola
  // automaticamente sulle deploy production/preview. In dev locale
  // l'header non c'e' e country_code resta null finche' l'utente non lo
  // imposta manualmente.
  //
  // Una sola scrittura nella vita dell'utente: il check 'IS NULL' nel
  // filtro evita race condition se due GET arrivano in parallelo (il
  // secondo trova country_code gia' popolato e l'update fa 0 righe).
  let profileData = profileResult.data;
  if (profileData.country_code == null) {
    const detected = detectCountryCode(req);
    if (detected) {
      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update({ country_code: detected })
        .eq('id', userId)
        .is('country_code', null)
        .select(
          'id, private_id, display_name, email, age, country_code, cultures, preferred_language, preferred_difficulty, avatar_id, rage_level, created_at',
        )
        .maybeSingle();
      if (updateError) {
        // Non blocchiamo la response: il country_code e' un'informazione
        // di contorno, vale piu' rispondere con un profilo senza che
        // fallire il GET.
        logger.warn('failed to backfill country_code', {
          userId,
          error: updateError.message,
        });
      } else if (updated) {
        profileData = updated;
        logger.info('country_code backfilled', { userId, code: detected });
      }
    }
  }

  const totalSingle = singleTotal.count ?? 0;
  const wonSingle = singleWon.count ?? 0;

  res.status(200).json({
    profile: profileData,
    gems: gemsResult.data ?? { balance: 0, last_regen_at: null },
    stats: {
      single_games_total: totalSingle,
      single_games_won: wonSingle,
      // Win rate in percentuale 0-100 con 1 decimale. Se 0 partite, ritorniamo
      // null per distinguere "nessuna partita" da "0% di partite giocate".
      single_win_rate:
        totalSingle > 0
          ? Math.round((wonSingle / totalSingle) * 1000) / 10
          : null,
    },
  });
}

async function handlePatch(
  req: VercelRequest,
  res: VercelResponse,
  userId: string,
): Promise<void> {
  const body = parseBody(req, patchBodySchema);

  const supabase = getSupabaseAdmin();

  // Costruisce il payload solo con i campi forniti per non sovrascrivere
  // valori esistenti con undefined.
  const updates: Record<string, string> = {};
  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.avatar_id !== undefined) updates.avatar_id = body.avatar_id;

  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', userId)
    .is('deleted_at', null)
    .select(
      'id, private_id, display_name, email, age, country_code, cultures, preferred_language, preferred_difficulty, avatar_id, rage_level, created_at',
    )
    .maybeSingle();

  if (error) {
    logger.error('failed to update profile', {
      userId,
      error: error.message,
      fields: Object.keys(updates),
    });
    throw new Error('Database error updating profile');
  }

  if (!data) {
    throw notFound('Profile not found');
  }

  logger.info('profile updated', { userId, fields: Object.keys(updates) });

  res.status(200).json({ profile: data });
}

export default withErrorHandling('/api/me', handler);

/**
 * Rileva il codice paese ISO-3166 alpha-2 (es. 'IT', 'US') dall'header
 * x-vercel-ip-country, popolato automaticamente da Vercel sulle deploy
 * production/preview tramite la sua CDN.
 *
 * Ritorna null se l'header e' assente (dev locale), vuoto, o non
 * sembra un codice paese valido. Non facciamo validazione contro una
 * lista chiusa di paesi: ci fidiamo del valore Vercel ma applichiamo
 * un controllo sintattico minimo (2 caratteri alfabetici uppercase).
 *
 * Vercel docs:
 *   https://vercel.com/docs/edge-network/headers/request-headers#x-vercel-ip-country
 */
function detectCountryCode(req: VercelRequest): string | null {
  const raw = req.headers['x-vercel-ip-country'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  const upper = value.toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  return upper;
}
