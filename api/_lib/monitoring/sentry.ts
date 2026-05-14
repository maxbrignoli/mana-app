import * as Sentry from '@sentry/node';
import { getEnv } from '../config/env.js';

/**
 * Wrapper opzionale di Sentry per error tracking.
 *
 * Sentry e' attivo solo se SENTRY_DSN e' settato. Quando non configurato,
 * tutti gli helper sono no-op silenziosi: niente dipendenza obbligatoria,
 * niente errori se manca la chiave.
 *
 * Inizializzazione lazy a primo uso, singleton per processo (cold start).
 *
 * Free tier Sentry: 5.000 errori al mese, ampiamente sufficiente in fase MVP.
 */

let initialized = false;
let active = false;

function init(): void {
  if (initialized) return;
  initialized = true;

  let env;
  try {
    env = getEnv();
  } catch {
    // Se l'env non e' validata, lasciamo Sentry spento (non vogliamo che un
    // problema di config lo aggravi nascondendone le tracce).
    return;
  }

  if (!env.SENTRY_DSN) {
    return; // No-op mode
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    // Tracing campionato basso: monitoraggio errori e' la priorita', non APM.
    tracesSampleRate: 0.0,
  });

  active = true;
}

/**
 * Invia un errore a Sentry. No-op se Sentry non e' configurato.
 *
 * Il logger strutturato continua a registrare l'errore separatamente: Sentry
 * e' complementare, non sostitutivo, dei log Vercel.
 */
export function captureException(error: unknown, context?: Record<string, unknown>): void {
  init();
  if (!active) return;

  if (context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        scope.setExtra(key, value);
      }
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

/**
 * Forza il flush degli eventi in coda. In ambiente serverless, ogni invocazione
 * puo' terminare bruscamente: chiamare flush() prima di rispondere garantisce
 * che gli eventi non si perdano.
 *
 * @param timeoutMs millisecondi prima di rinunciare. Default 1500 (sotto i 2s
 *   di soft-deadline Vercel)
 */
export async function flushSentry(timeoutMs = 1500): Promise<void> {
  init();
  if (!active) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    // ignore
  }
}

/**
 * True se Sentry e' attivo. Utile per i test.
 */
export function isSentryActive(): boolean {
  init();
  return active;
}
