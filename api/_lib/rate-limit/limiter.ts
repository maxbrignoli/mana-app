import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getEnv } from '../config/env.js';

/**
 * Rate limiting basato su Upstash Redis con algoritmo sliding window.
 *
 * Sliding window: a differenza di un fixed window (es. "10 richieste in 1
 * minuto, conteggio resetta a inizio minuto"), il sliding window considera
 * una finestra mobile. E' piu' equo e impedisce le raffiche al cambio finestra.
 *
 * Le istanze sono singleton per categoria perche' la libreria mantiene un
 * piccolo stato in-process (cache analytics, ecc.) e ricrearle ad ogni richiesta
 * sarebbe spreco.
 */

let redisClient: Redis | null = null;

function getRedis(): Redis {
  if (redisClient) return redisClient;
  const env = getEnv();
  redisClient = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return redisClient;
}

/**
 * Categorie di rate limit con i loro parametri.
 *
 * Sono dimensionate per essere generose con uso normale (un utente non dovrebbe
 * mai vederle in faccia) e restrittive con abusi (script, bot, attacchi).
 *
 * Numeri da rivedere dopo aver osservato il traffico reale.
 */
const LIMITS = {
  /** Endpoint di gioco (chiamate AI). Costoso, limite stringente. */
  game: { requests: 30, window: '1 m' as const },
  /** Endpoint di profilo (lettura/scrittura dati utente). Frequente ma leggero. */
  profile: { requests: 60, window: '1 m' as const },
  /** Health check e altre rotte pubbliche. Stringente per evitare DoS. */
  public: { requests: 120, window: '1 m' as const },
};

export type RateLimitCategory = keyof typeof LIMITS;

const limiterCache = new Map<RateLimitCategory, Ratelimit>();

function getLimiter(category: RateLimitCategory): Ratelimit {
  let limiter = limiterCache.get(category);
  if (limiter) return limiter;

  const config = LIMITS[category];
  limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(config.requests, config.window),
    analytics: true,
    prefix: `ratelimit:${category}`,
  });
  limiterCache.set(category, limiter);
  return limiter;
}

export interface RateLimitResult {
  /** True se la richiesta puo' procedere. False se l'identifier ha superato il limite. */
  success: boolean;
  /** Numero massimo di richieste consentite nella finestra. */
  limit: number;
  /** Richieste residue. 0 quando si e' al limite. */
  remaining: number;
  /** Timestamp (epoch ms) di quando si potranno fare nuove richieste. */
  reset: number;
}

/**
 * Verifica il limite per un identificatore (es. user_id o IP) nella categoria.
 *
 * Restituisce un oggetto con success, limit, remaining, reset. Il chiamante
 * (helper enforceRateLimit) traduce questo in HTTP 429 quando necessario.
 *
 * Identifier: usa l'user_id quando l'utente e' autenticato (limita per utente,
 * non per device), oppure l'IP per richieste anonime (es. health check).
 */
export async function checkRateLimit(
  category: RateLimitCategory,
  identifier: string,
): Promise<RateLimitResult> {
  const limiter = getLimiter(category);
  const result = await limiter.limit(identifier);
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

/**
 * Reset di tutta la cache, per test.
 */
export function resetRateLimitCache(): void {
  redisClient = null;
  limiterCache.clear();
}
