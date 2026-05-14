import { AITimeoutError } from './errors.js';

/**
 * Wrappa una Promise con un timer di timeout.
 *
 * Se la promessa risolve entro `timeoutMs`, la sua risoluzione e' restituita.
 * Altrimenti viene rifiutata con AITimeoutError.
 *
 * NB: il task originale continua a girare in background dopo il timeout
 * (Promise.race non cancella nulla). Per chiamate HTTP usare anche un
 * AbortController lato provider quando possibile. Qui abbiamo solo la garanzia
 * che il nostro handler ritorna entro il timeout.
 */
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AITimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
