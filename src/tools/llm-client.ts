import Anthropic from "@anthropic-ai/sdk";
import type { ClassificationResult } from "../types/index.js";

export interface LLMClientConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
}

export class LLMClient {
  private anthropic: Anthropic | null = null;
  private config: LLMClientConfig;

  constructor(config: Partial<LLMClientConfig> = {}) {
    this.config = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
      maxTokens: Number(process.env.ANTHROPIC_MAX_TOKENS) || 200,
      temperature: Number(process.env.ANTHROPIC_TEMPERATURE) || 0.1,
      ...config,
    };

    if (this.config.apiKey) {
      this.anthropic = new Anthropic({ apiKey: this.config.apiKey });
    }
  }

  async complete(
    systemPrompt: string,
    userMessage: string,
    options: { temperature?: number; maxTokens?: number; responseFormat?: "json_object" } = {},
  ): Promise<string> {
    const temperature = options.temperature ?? this.config.temperature;
    const maxTokens = options.maxTokens ?? this.config.maxTokens;

    if (this.anthropic) {
      return this.callAnthropic(systemPrompt, userMessage, temperature, maxTokens);
    }

    return this.callOllama(systemPrompt, userMessage, temperature);
  }

  private async callAnthropic(
    systemPrompt: string,
    userMessage: string,
    temperature: number,
    maxTokens: number,
  ): Promise<string> {
    if (!this.anthropic) {
      throw new Error("Anthropic client not initialized — missing API key");
    }

    const start = Date.now();
    const msg = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const elapsed = Date.now() - start;
    const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join("");
    const usage = ((msg as unknown) as Record<string, unknown>).usage as { input_tokens?: number; output_tokens?: number } | undefined;

    console.log(
      `[llm-client] anthropic call: ${elapsed}ms, ` +
        `input=${usage?.input_tokens ?? "?"}, output=${usage?.output_tokens ?? "?"}, ` +
        `model=${this.config.model}`,
    );

    return text;
  }

  private async callOllama(
    systemPrompt: string,
    userMessage: string,
    temperature: number,
  ): Promise<string> {
    const baseUrl = this.config.baseUrl || process.env.OLLAMA_BASE_URL || "http://localhost:11434";
    const model = process.env.OLLAMA_MODEL || "llama3.1:8b";

    const start = Date.now();
    const res = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system: systemPrompt,
        prompt: userMessage,
        stream: false,
        options: { temperature },
      }),
    });

    if (!res.ok) {
      throw new Error(`Ollama call failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { response: string };
    const elapsed = Date.now() - start;

    console.log(`[llm-client] ollama call: ${elapsed}ms, model=${model}`);
    return data.response;
  }

  async classifyWithFallback(
    utterance: string,
    domain: string,
    intentRegistry: Record<string, unknown>,
    localResult: ClassificationResult,
  ): Promise<ClassificationResult> {
    const systemPrompt = `You are an intent classification system for a Vietnamese institutional assistant.
Classify the user utterance into exactly one intent from the provided registry.
Return ONLY valid JSON with fields: intent (string), confidence (number 0.0-1.0), alternatives (array of {intent, confidence}).`;

    const userMessage = `Domain: ${domain}
Intent Registry: ${JSON.stringify(intentRegistry)}
Local model predicted: ${localResult.intent} (confidence: ${localResult.confidence})
User utterance: "${utterance}"

Classify this utterance. Output JSON only.`;

    const text = await this.complete(systemPrompt, userMessage, { temperature: 0.1, maxTokens: 200 });

    try {
      const parsed = JSON.parse(text.trim()) as {
        intent: string;
        confidence: number;
        alternatives: { intent: string; confidence: number }[];
      };
      return {
        intent: parsed.intent,
        confidence: parsed.confidence,
        alternatives: parsed.alternatives,
        source: "llm_fallback",
        model_version: "llm",
      };
    } catch {
      return {
        ...localResult,
        source: "llm_fallback",
        model_version: "llm-parse-error",
      };
    }
  }
}

let defaultClient: LLMClient | null = null;

export function getLLMClient(config?: Partial<LLMClientConfig>): LLMClient {
  if (!defaultClient) {
    defaultClient = new LLMClient(config);
  }
  return defaultClient;
}
