import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, ChatParams, ChatResponse, FinishReason } from './types.js';
import { estimateCostUsd } from './pricing.js';

/**
 * Provider Anthropic. Supporta i modelli Claude (Haiku, Sonnet, Opus).
 *
 * Il caching del system prompt e' esplicito in Anthropic: marchiamo il system
 * con cache_control = ephemeral, cosi' il provider lo memorizza per ~5 minuti
 * e le chiamate successive con lo stesso system pagano la tariffa cached.
 *
 * NOTA: usiamo client.beta.messages perche' prompt caching e' ancora in beta
 * nell'SDK attuale.
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
    const response = await this.client.beta.messages.create({
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
