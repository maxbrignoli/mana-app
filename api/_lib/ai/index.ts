import type { AIProvider } from './types.js';
import { OpenAIProvider } from './openai-provider.js';
import { AnthropicProvider } from './anthropic-provider.js';

/**
 * Restituisce l'istanza configurata del provider AI.
 *
 * Le scelte di provider e modello sono guidate da variabili d'ambiente:
 * - AI_PROVIDER: 'openai' (default) | 'anthropic'
 * - AI_MODEL: nome del modello specifico, es. 'gpt-5.4-mini' o 'claude-haiku-4-5'
 *
 * Cambiare provider o modello in produzione richiede solo l'aggiornamento
 * delle env vars su Vercel. Nessun cambio al codice di business.
 */
export function getAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER ?? 'openai';
  const model = process.env.AI_MODEL ?? 'gpt-5.4-mini';

  switch (provider) {
    case 'openai':
      return new OpenAIProvider(model);
    case 'anthropic':
      return new AnthropicProvider(model);
    default:
      throw new Error(
        `Unknown AI provider: '${provider}'. Supported: 'openai', 'anthropic'.`,
      );
  }
}

// Re-export utili per chi consuma il modulo
export type { AIProvider, ChatParams, ChatResponse, Message, Usage } from './types.js';
