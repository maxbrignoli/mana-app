/**
 * Listini prezzi noti dei modelli supportati, in USD per milione di token.
 *
 * Aggiornare quando i provider cambiano prezzi. I prezzi qui sono usati solo
 * per stimare il costo di una chiamata: il calcolo accurato e' lato provider.
 *
 * Fonti:
 * - OpenAI: https://platform.openai.com/docs/pricing
 * - Anthropic: https://www.anthropic.com/pricing
 */

export interface ModelPricing {
  /** USD per milione di token input non-cached. */
  inputPerMillion: number;
  /** USD per milione di token input serviti da cache. */
  cachedInputPerMillion: number;
  /** USD per milione di token output. */
  outputPerMillion: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // OpenAI GPT-5.4 family
  'gpt-5.4-mini': {
    inputPerMillion: 0.75,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 4.5,
  },
  'gpt-5.4-nano': {
    inputPerMillion: 0.2,
    cachedInputPerMillion: 0.02,
    outputPerMillion: 1.25,
  },
  'gpt-5.4': {
    inputPerMillion: 2.5,
    cachedInputPerMillion: 0.25,
    outputPerMillion: 15.0,
  },

  // Anthropic Claude
  'claude-haiku-4-5': {
    inputPerMillion: 1.0,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 5.0,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3.0,
    cachedInputPerMillion: 0.3,
    outputPerMillion: 15.0,
  },
  'claude-opus-4-5': {
    inputPerMillion: 5.0,
    cachedInputPerMillion: 0.5,
    outputPerMillion: 25.0,
  },
};

export function estimateCostUsd(
  model: string,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model];
  if (!pricing) {
    return 0; // modello non in tabella -> non stimiamo (loggheremo warning lato chiamante)
  }

  const nonCachedInput = Math.max(0, inputTokens - cachedInputTokens);
  return (
    (nonCachedInput * pricing.inputPerMillion) / 1_000_000 +
    (cachedInputTokens * pricing.cachedInputPerMillion) / 1_000_000 +
    (outputTokens * pricing.outputPerMillion) / 1_000_000
  );
}
