import type { SlotValue, RouteResult } from "../../types/index.js";

export interface AdapterConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class BaseAdapter {
  protected baseUrl: string;
  protected apiKey?: string;
  protected timeoutMs: number;

  constructor(config: AdapterConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.timeoutMs = config.timeoutMs ?? 10000;
  }

  protected async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
      }
    }

    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(this.timeoutMs) });

    if (!res.ok) {
      throw new Error(`${this.constructor.name}: GET ${path} → ${res.status}`);
    }

    return (await res.json()) as T;
  }

  protected async post<T>(path: string, body: unknown): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!res.ok) {
      throw new Error(`${this.constructor.name}: POST ${path} → ${res.status}`);
    }

    return (await res.json()) as T;
  }
}
