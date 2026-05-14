import OpenAI from 'openai';
import { getEnv } from '../config/env.js';
import { logger } from '../logging/logger.js';
import { mapOpenAIError } from './error-mapping-openai.js';
import { estimateCostUsd } from './pricing.js';
import { withRetry } from './retry.js';
import { withTimeout } from './timeout.js';
import type { AIProvider, ChatParams, ChatResponse, FinishReason } from './types.js';

/**
 * Provider OpenAI. Supporta i modelli GPT-5.4-* (mini, nano, full).
 *
 * Il caching del system prompt e' automatico in OpenAI quando il prompt supera
 * i 1024 token.
 *
 * Resilienza: ogni chat() e' wrappato con timeout (default AI_TIMEOUT_MS) e
 * retry con backoff esponenziale (default AI_MAX_RETRIES). Gli errori SDK sono
 * mappati in AIError tipizzati; solo quelli retryable vengono ritentati.
 */
export class OpenAIProvider implements AIProvider {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(model: string, apiKey?: string) {
    this.model = model;
    this.name = `openai-${model}`;
    this.client = new OpenAI({ apiKey: apiKey ?? process.env.OPENAI_API_KEY });
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
    let completion;
    try {
      completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: params.systemPrompt },
          ...params.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        max_completion_tokens: params.maxTokens ?? 1024,
        temperature: params.temperature ?? 0.7,
        response_format:
          params.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      });
    } catch (error) {
      throw mapOpenAIError(error);
    }

    const choice = completion.choices[0];
    if (!choice) {
      // Risposta inattesa, no choices: trattiamo come server error retryable.
      throw mapOpenAIError(new Error('OpenAI response has no choices'));
    }

    const content = choice.message.content ?? '';
    const finishReason = this.mapFinishReason(choice.finish_reason);

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const cachedInputTokens = completion.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;

    return {
      content,
      usage: {
        inputTokens,
        cachedInputTokens,
        outputTokens,
        estimatedCostUsd: estimateCostUsd(this.model, inputTokens, cachedInputTokens, outputTokens),
      },
      finishReason,
      providerName: this.name,
    };
  }

  private mapFinishReason(reason: string | null | undefined): FinishReason {
    switch (reason) {
      case 'stop':
        return 'stop';
      case 'length':
        return 'length';
      case 'content_filter':
        return 'content_filter';
      default:
        return 'error';
    }
  }
}
