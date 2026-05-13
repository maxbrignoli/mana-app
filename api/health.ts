import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAIProvider } from './_lib/ai/index.js';
import { getEnv } from './_lib/config/env.js';
import { getSupabaseAdmin } from './_lib/db/supabase.js';
import { logger } from './_lib/logging/logger.js';

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
 * - connessione a Supabase (query banale: SELECT 1)
 *
 * Non chiama il modello AI (per evitare costi a ogni health check).
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const result: HealthCheckResult = {
    status: 'ok',
    checks: {
      env: 'ok',
      ai_provider: 'ok',
      supabase: 'ok',
    },
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
    // Query banale solo per confermare che la connessione e' viva.
    // Non leggiamo dati reali. count=exact + limit 0 non scarica righe.
    const { error } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    if (error) {
      throw error;
    }
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

  const httpStatus = result.status === 'ok' ? 200 : result.status === 'degraded' ? 200 : 500;
  res.status(httpStatus).json(result);
}
