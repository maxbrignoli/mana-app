/**
 * Tipi pubblici dell'astrazione AIProvider.
 *
 * Tutto il codice di business chiama un'istanza di AIProvider tramite getAIProvider().
 * I provider concreti (OpenAI, Anthropic, ...) implementano questa interfaccia.
 */

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatParams {
  /** System prompt (cacheable). Va inviato uguale tra chiamate per beneficiare del caching. */
  systemPrompt: string;
  /** Storia conversazione (escluso il system prompt). */
  messages: Message[];
  /** Limite token in output. Default: 1024. */
  maxTokens?: number;
  /** Temperatura 0-1. Default: 0.7. */
  temperature?: number;
  /** Forza risposta in formato JSON quando supportato. Default: 'text'. */
  responseFormat?: 'text' | 'json';
}

export interface Usage {
  inputTokens: number;
  /** Token serviti da cache (sconto provider). 0 se cache miss o provider che non supporta. */
  cachedInputTokens: number;
  outputTokens: number;
  /** Costo stimato in USD, calcolato dai listini noti del provider. */
  estimatedCostUsd: number;
}

export type FinishReason = 'stop' | 'length' | 'content_filter' | 'error';

export interface ChatResponse {
  content: string;
  usage: Usage;
  finishReason: FinishReason;
  /** Identificatore del provider+modello effettivo che ha servito la richiesta. */
  providerName: string;
}

export interface AIProvider {
  /** Identificatore univoco, es: 'openai-gpt-5.4-mini'. */
  readonly name: string;
  chat(params: ChatParams): Promise<ChatResponse>;
}
