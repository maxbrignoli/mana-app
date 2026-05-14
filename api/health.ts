import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAIProvider } from './_lib/ai/index.js';
import { getEnv } from './_lib/config/env.js';
import { getSupabaseAdmin } from './_lib/db/supabase.js';
import { allowMethods } from './_lib/http/methods.js';
import { logger } from './_lib/logging/logger.js';
import { withErrorHandling } from './_lib/monitoring/with-error-handling.js';
import { enforceRateLimit } from './_lib/rate-limit/enforce.js';

interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  checks: {
    env: 'ok' | 'error';
    ai_provider: 'ok' | 'error';
    supabase: 'ok' | 'error';
  };
  provider?: string;
  errors?: string[];
  timestamp: string;
}

/**
 * GET /api/health
 *
 * Verifica salute del backend:
 * - validazione env vars
 * - istanziazione provider AI
 * - connessione a Supabase (query banale)
 *
 * Non chiama il modello AI per evitare costi su ogni health check.
 *
 * I tre check sono *catturati a livello interno* per produrre un report
 * aggregato: anche con un check fallito, l'endpoint risponde 200 con
 * status='degraded'. Solo se tutti e tre falliscono ritorna 500.
 *
 * Errori inattesi al di fuori dei check interni sono gestiti dal wrapper
 * withErrorHandling (log + Sentry + 500 generico).
 */
async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!allowMethods(req, res, ['GET'])) return;
  await enforceRateLimit(req, res, 'public');

  const result: HealthCheckResult = {
    status: 'ok',
    checks: { env: 'ok', ai_provider: 'ok', supabase: 'ok' },
    timestamp: new Date().toISOString(),
  };
  const errors: string[] = [];

  // Check 1: env vars
  try {
    getEnv();
  } catch (error) {
    result.checks.env = 'error';
    errors.push(`env: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check 2: provider AI istanziabile
  try {
    const provider = getAIProvider();
    result.provider = provider.name;
  } catch (error) {
    result.checks.ai_provider = 'error';
    errors.push(`ai_provider: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Check 3: Supabase raggiungibile
  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    if (error) throw error;
  } catch (error) {
    result.checks.supabase = 'error';
    errors.push(`supabase: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Stato aggregato
  const failedChecks = Object.values(result.checks).filter((c) => c === 'error').length;
  if (failedChecks === 0) {
    result.status = 'ok';
  } else if (failedChecks < 3) {
    result.status = 'degraded';
  } else {
    result.status = 'error';
  }

  if (errors.length > 0) {
    result.errors = errors;
    logger.warn('health check failures', { errors, checks: result.checks });
  } else {
    logger.debug('health check ok', { provider: result.provider });
  }

  const httpStatus = result.status === 'error' ? 500 : 200;
  res.status(httpStatus).json(result);
}

export default withErrorHandling('/api/health', handler);
