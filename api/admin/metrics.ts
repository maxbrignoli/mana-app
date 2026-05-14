import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireAdmin } from '../_lib/auth/require-admin.js';
import { getSupabaseAdmin } from '../_lib/db/supabase.js';
import { allowMethods } from '../_lib/http/methods.js';
import { withErrorHandling } from '../_lib/monitoring/with-error-handling.js';
import { enforceRateLimit } from '../_lib/rate-limit/enforce.js';

/**
 * GET /api/admin/metrics
 *
 * Restituisce statistiche aggregate sullo stato del sistema. Da usare per
 * monitoring manuale: numero utenti attivi, partite in corso, gemme circolanti,
 * eventi rage di ieri, ecc.
 *
 * Authentication: richiesta + flag is_admin sul profilo.
 * Rate limit: 'public' (siamo admin, non ci serve un limite stretto).
 *
 * Non e' un endpoint analytics completo. Per analisi piu' approfondite
 * usare direttamente la dashboard Supabase con query custom.
 *
 * Response 200:
 *   {
 *     users: { total, active_last_7d, deleted },
 *     games: { single_in_progress, single_completed_today, multi_in_progress },
 *     gems: { circulating, lifetime_spent, lifetime_purchased, lifetime_penalty },
 *     rage: { events_last_24h, profiles_at_max_rage },
 *     timestamp
 *   }
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET'])) return;

  const user = await requireAdmin(req);
  await enforceRateLimit(req, res, 'public', user.id);

  const supabase = getSupabaseAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const startOfTodayUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();

  // Eseguo tutte le query in parallelo per ridurre la latenza.
  const [
    totalUsersR,
    activeUsersR,
    deletedUsersR,
    singleInProgressR,
    singleCompletedTodayR,
    multiInProgressR,
    gemsSumR,
    rageEventsR,
    rageMaxR,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase
      .from('single_games')
      .select('user_id', { count: 'exact', head: true })
      .gte('started_at', sevenDaysAgo),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .not('deleted_at', 'is', null),
    supabase
      .from('single_games')
      .select('*', { count: 'exact', head: true })
      .eq('result', 'in_progress'),
    supabase
      .from('single_games')
      .select('*', { count: 'exact', head: true })
      .neq('result', 'in_progress')
      .gte('ended_at', startOfTodayUtc),
    supabase
      .from('multiplayer_games')
      .select('*', { count: 'exact', head: true })
      .in('state', ['waiting_p1', 'waiting_p2', 'in_progress']),
    supabase.from('gems_balance').select('balance, lifetime_spent, lifetime_purchased, lifetime_penalty'),
    supabase
      .from('rage_events')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo),
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('rage_level', 4),
  ]);

  // Aggregazione gemme: sommo lato app perche' Supabase JS non fa SUM diretto.
  type GemsRow = {
    balance: number | null;
    lifetime_spent: number | null;
    lifetime_purchased: number | null;
    lifetime_penalty: number | null;
  };
  const gems = {
    circulating: 0,
    lifetime_spent: 0,
    lifetime_purchased: 0,
    lifetime_penalty: 0,
  };
  for (const row of (gemsSumR.data ?? []) as GemsRow[]) {
    gems.circulating += row.balance ?? 0;
    gems.lifetime_spent += row.lifetime_spent ?? 0;
    gems.lifetime_purchased += row.lifetime_purchased ?? 0;
    gems.lifetime_penalty += row.lifetime_penalty ?? 0;
  }

  res.status(200).json({
    users: {
      total: totalUsersR.count ?? 0,
      active_last_7d: activeUsersR.count ?? 0,
      deleted: deletedUsersR.count ?? 0,
    },
    games: {
      single_in_progress: singleInProgressR.count ?? 0,
      single_completed_today: singleCompletedTodayR.count ?? 0,
      multi_in_progress: multiInProgressR.count ?? 0,
    },
    gems,
    rage: {
      events_last_24h: rageEventsR.count ?? 0,
      profiles_at_max_rage: rageMaxR.count ?? 0,
    },
    timestamp: now.toISOString(),
  });
}

export default withErrorHandling('/api/admin/metrics', handler);
