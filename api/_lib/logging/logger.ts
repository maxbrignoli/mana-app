import { getEnv } from '../config/env.js';

/**
 * Logger strutturato che emette JSON su stdout/stderr.
 *
 * Vercel cattura automaticamente console.log e console.error e li indicizza.
 * Emettendo JSON strutturato (timestamp, level, message, context), abbiamo:
 * - log filtrabili per livello e contesto
 * - integrazione futura con Sentry o servizi di log aggregation senza riscrivere
 *
 * Livelli: debug < info < warn < error.
 * I log sotto LOG_LEVEL configurato sono droppati.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
}

function shouldLog(level: LogLevel): boolean {
  try {
    const env = getEnv();
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[env.LOG_LEVEL];
  } catch {
    // Se l'env non e' ancora caricata, lasciamo passare tutto (vogliamo vedere
    // gli errori di startup).
    return true;
  }
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && Object.keys(context).length > 0 ? { context } : {}),
  };

  const serialized = JSON.stringify(entry);

  if (level === 'error' || level === 'warn') {
    console.error(serialized);
  } else {
    console.log(serialized);
  }
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    emit('debug', message, context);
  },
  info(message: string, context?: LogContext): void {
    emit('info', message, context);
  },
  warn(message: string, context?: LogContext): void {
    emit('warn', message, context);
  },
  error(message: string, context?: LogContext): void {
    emit('error', message, context);
  },
};
