import { z } from 'zod';

/**
 * Variabili d'ambiente del backend, validate con Zod a startup.
 *
 * Se manca una variabile obbligatoria o ha un formato non valido, lanciamo
 * un errore esplicito invece di fallire silenziosamente piu' avanti durante
 * una chiamata API. Cosi' i problemi di configurazione si scoprono subito.
 *
 * Le variabili sono lette da process.env. Su Vercel sono configurate via UI
 * o CLI; in locale tramite un file .env letto dalla Vercel CLI o dotenv.
 */

const envSchema = z.object({
  // AI provider
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  AI_MODEL: z.string().default('gpt-5.4-mini'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Supabase
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Upstash Redis (per rate limiting)
  UPSTASH_REDIS_REST_URL: z.string().url(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1),

  // Cifratura simmetrica per campi sensibili (AES-256-GCM)
  // 32 byte in base64 = 44 caratteri.
  ENCRYPTION_KEY: z.string().min(40),

  // Runtime
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

/**
 * Restituisce la configurazione validata. Lazy + memoized: la validazione
 * avviene una sola volta per processo (i.e. per cold start della function).
 *
 * Lancia un errore descrittivo se la configurazione e' invalida.
 */
export function getEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid backend environment configuration:\n${issues}\n\n` +
        `Check that all required variables are set in Vercel or your local .env file.`,
    );
  }

  // Validazione cross-field: il provider scelto deve avere la sua API key
  const env = parsed.data;
  if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
    throw new Error('AI_PROVIDER is "openai" but OPENAI_API_KEY is not set.');
  }
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set.');
  }

  cachedEnv = env;
  return cachedEnv;
}

/**
 * Reset della cache di env. Usata principalmente nei test per simulare
 * configurazioni diverse. In produzione non viene chiamata.
 */
export function resetEnvCache(): void {
  cachedEnv = null;
}
