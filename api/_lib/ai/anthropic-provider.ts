import Anthropic from '@anthropic-ai/sdk';
import { getEnv } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { mapAnthropicError } from './error-mapping-anthropic.js';
import { estimateCostUsd } from './pricing.js';
import { withRetry } from './retry.js';
import { withTimeout } from './timeout.js';
import type { AIProvider, ChatParams, ChatResponse, FinishReason } from './types.js';

/**
 * Provider Anthropic. Supporta i modelli Claude (Haiku, Sonnet, Opus).
 *
 * Il caching del system prompt e' esplicito: marchiamo il system con
 * cache_control = ephemeral. Le chiamate successive con stesso system pagano
 * la tariffa cached.
 *
 * Usa client.beta.messages perche' prompt caching e' ancora in beta nell'SDK.
 *
 * Resilienza: ogni chat() e' wrappato con timeout e retry, identico a OpenAI.
 */
export class AnthropicProvider implements AIProvider {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.name = `anthropic-${model}`;
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async chat(params: ChatParams): Promise<ChatResponse> {
    const env = getEnv();

    return withRetry(
      () => withTimeout(this.callOnce(params), env.AI_TIMEOUT_MS),
      {
        maxAttempts: env.AI_MAX_RETRIES,
        onRetry: ({ attempt, error, delayMs }) => {
          logger.warn('ai retry', {
            provider: this.name,
            attempt,
            kind: error.kind,
            message: error.message,
            delayMs,
          });
        },
      },
    );
  }

  private async callOnce(params: ChatParams): Promise<ChatResponse> {
    let response;
    try {
      response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 0.7,
        system: [
          {
            type: 'text',
            text: params.systemPrompt,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: params.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });
    } catch (error) {
      throw mapAnthropicError(error);
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    const content = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    const inputTokens = response.usage.input_tokens;
    const cachedInputTokens = response.usage.cache_read_input_tokens ?? 0;
    const outputTokens = response.usage.output_tokens;

    return {
      content,
      usage: {
        inputTokens,
        cachedInputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(this.model, inputTokens, cachedInputTokens, outputTokens),
      },
      finishReason: this.mapFinishReason(response.stop_reason),
      providerName: this.name,
    };
  }

  private mapFinishReason(reason: string | null): FinishReason {
    switch (reason) {
      case 'end_turn':
      case 'stop_sequence':
        return 'stop';
      case 'max_tokens':
        return 'length';
      default:
        return 'error';
    }
  }
}
