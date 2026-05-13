import OpenAI from 'openai';
import type { AIProvider, ChatParams, ChatResponse, FinishReason } from './types.js';
import { estimateCostUsd } from './pricing.js';

/**
 * Provider OpenAI. Supporta i modelli GPT-5.4-* (mini, nano, full).
 *
 * Il caching del system prompt e' automatico in OpenAI quando il prompt supera
 * i 1024 token. Il provider non richiede setup specifico per attivarlo.
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
    const completion = await this.client.chat.completions.create({
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

    const choice = completion.choices[0];
    if (!choice) {
      throw new Error('OpenAI response has no choices');
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
