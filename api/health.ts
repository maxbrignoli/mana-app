import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAIProvider } from './_lib/ai/index.js';

/**
 * GET /api/health
 *
 * Endpoint di verifica salute del backend:
 * - server raggiungibile
 * - env vars caricate
 * - provider AI inizializzato correttamente
 *
 * Non chiama il modello AI (per evitare costi a ogni health check). Solo verifica
 * che il provider sia istanziabile. Per test end-to-end del modello, usare un
 * endpoint dedicato in fase di sviluppo.
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const provider = getAIProvider();
    res.status(200).json({
      status: 'ok',
      provider: provider.name,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({
      status: 'error',
      error: message,
    });
  }
}
