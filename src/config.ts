import "dotenv/config";
import type { AppConfig, DeploymentMode } from "./types/index.js";

export function loadConfig(): AppConfig {
  return {
    deploymentMode: (process.env.DEPLOYMENT_MODE as DeploymentMode) || "hybrid",
    port: parseInt(process.env.PORT || "3000", 10),
    host: process.env.HOST || "0.0.0.0",
    mlInferenceUrl: process.env.ML_INFERENCE_URL || "http://localhost:8001",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-20241022",
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
    ollamaModel: process.env.OLLAMA_MODEL || "llama3.1:8b",
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    chromaUrl: process.env.CHROMA_URL || "http://localhost:8000",
    chromaCollection: process.env.CHROMA_COLLECTION || "intent-translator-kb",
    offlineMode: process.env.OFFLINE_MODE === "true",
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || "30", 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10),
  };
}

let cachedConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!cachedConfig) {
    cachedConfig = loadConfig();
  }
  return cachedConfig;
}
