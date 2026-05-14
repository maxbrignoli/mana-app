import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { getEnv } from '../config/env.js';

/**
 * Cifratura simmetrica AES-256-GCM per i campi sensibili.
 *
 * AES-256-GCM e' uno standard moderno autenticato: oltre a cifrare,
 * verifica l'integrita' del ciphertext (rifiuta payload manipolati).
 *
 * Formato binario di output (sempre): [IV (12 byte)] [AUTH_TAG (16 byte)] [CIPHERTEXT]
 *
 * La chiave e' a 32 byte (256 bit), letta da env var ENCRYPTION_KEY codificata
 * in base64. La chiave non vive mai nel DB ne' nel client: solo nelle env vars
 * del backend Vercel.
 *
 * Per generare una nuova chiave:
 *   openssl rand -base64 32
 */

const IV_LENGTH = 12; // bytes (96 bit, standard per GCM)
const TAG_LENGTH = 16; // bytes (128 bit, default GCM)
const KEY_LENGTH = 32; // bytes (256 bit per AES-256)

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = getEnv();
  const decoded = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (decoded.length !== KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH} bytes (got ${decoded.length}). ` +
        `Generate one with: openssl rand -base64 32`,
    );
  }
  cachedKey = decoded;
  return cachedKey;
}

/**
 * Cifra un testo UTF-8 in AES-256-GCM.
 * Ritorna un Uint8Array nel formato [IV || tag || ciphertext], adatto al
 * tipo bytea PostgreSQL.
 */
export function encrypt(plaintext: string): Uint8Array {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Output: IV (12) || tag (16) || ciphertext
  return Buffer.concat([iv, authTag, ciphertext]);
}

/**
 * Decifra un payload AES-256-GCM nel formato prodotto da encrypt().
 * Lancia un errore se il tag non valida (payload manipolato o chiave sbagliata).
 */
export function decrypt(payload: Uint8Array): string {
  const buf = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);

  if (buf.length < IV_LENGTH + TAG_LENGTH) {
    throw new Error('Invalid ciphertext: payload too short');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/**
 * Variante non-throw: ritorna null su input null/undefined o errore di decrypt.
 * Utile per la decifratura di campi facoltativi delle partite.
 */
export function decryptOrNull(payload: Uint8Array | null | undefined): string | null {
  if (!payload) return null;
  try {
    return decrypt(payload);
  } catch {
    return null;
  }
}

/**
 * Reset cache, principalmente per test.
 */
export function resetEncryptionKeyCache(): void {
  cachedKey = null;
}
