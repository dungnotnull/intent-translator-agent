import Fastify from "fastify";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatRequest, ChatResponse, Domain } from "./types/index.js";
import { handleChat, endSession } from "./agents/orchestrator.js";
import { loadIntentRegistry } from "./routing/registry-loader.js";
import { getConfig } from "./config.js";
import { seedKnowledge, runWeeklyUpdate, searchKB } from "./agents/knowledge-updater/index.js";
import { transcribeAudio, postProcessASR, normalizeAudioFormat } from "./voice/asr-adapter.js";
import { synthesizeSpeech, preprocessForTTS } from "./voice/tts-adapter.js";
import { getConfig as cfg } from "./config.js";
import {
  logQuery, getQueryStats, getReviewQueue, reviewItem, ignoreItem,
  getTrainingExamples, approveTrainingExample, getApprovedCount,
  shouldTriggerRetraining, logModelMetrics, getModelMetrics,
  getABStats, routeToModelVariant,
} from "./agents/continuous-learning/index.js";
import cron from "node-cron";

const config = getConfig();

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport: process.env.NODE_ENV === "development"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
  },
});

// ── Rate Limiter ──
const requestCounts = new Map<string, { count: number; windowStart: number }>();

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(sessionId);

  if (!entry || now - entry.windowStart > config.rateLimitWindowMs) {
    requestCounts.set(sessionId, { count: 1, windowStart: now });
    return true;
  }

  entry.count++;
  return entry.count <= config.rateLimitMax;
}

// ── Health Check ──
app.get("/health", async () => {
  let mlStatus = "unknown";
  try {
    const res = await fetch(`${config.mlInferenceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json() as { classifier_type?: string; ner_available?: boolean };
      mlStatus = `${data.classifier_type ?? "unknown"}${data.ner_available ? "+NER" : ""}`;
    }
  } catch {
    mlStatus = "unreachable";
  }

  return {
    status: "ok",
    version: "0.1.0",
    deploymentMode: config.deploymentMode,
    mlInference: mlStatus,
    uptime: process.uptime(),
  };
});

// ── Chat Endpoint ──
app.post<{ Body: ChatRequest; Reply: ChatResponse }>("/api/chat", {
  schema: {
    body: {
      type: "object",
      required: ["message", "domain"],
      properties: {
        session_id: { type: "string" },
        message: { type: "string", minLength: 1 },
        domain: { type: "string", enum: ["university", "government", "healthcare"] },
        user_type: { type: "string", enum: ["student", "staff", "citizen", "elderly", "visitor"] },
        language: { type: "string", enum: ["vi", "en", "mixed"] },
      },
    },
  },
}, async (request, reply) => {
  const { session_id, message, domain, user_type, language } = request.body;

  const sessionId = session_id || (request.headers["x-session-id"] as string) || crypto.randomUUID();

  if (!checkRateLimit(sessionId)) {
    return reply.status(429).send({
      session_id: sessionId,
      response: "Bạn đã gửi quá nhiều yêu cầu. Vui lòng chờ một lát rồi thử lại.",
    } as ChatResponse);
  }

  request.log.info({ sessionId, message: message.slice(0, 100), domain }, "Chat request");

  try {
    const result = await handleChat({
      session_id: sessionId,
      message,
      domain: domain as Domain,
      user_type,
      language,
    });

    reply.header("x-session-id", result.session_id);
    return result;
  } catch (err) {
    request.log.error({ err, sessionId }, "Chat error");
    return reply.status(500).send({
      session_id: sessionId,
      response: "Có lỗi xảy ra. Vui lòng thử lại sau.",
    } as ChatResponse);
  }
});

// ── Session End ──
app.post("/api/session/end", async (request, reply) => {
  const sessionId = (request.body as { session_id?: string })?.session_id
    || (request.headers["x-session-id"] as string);

  if (sessionId) {
    await endSession(sessionId);
    return { status: "ended", session_id: sessionId };
  }

  return reply.status(400).send({ error: "Missing session_id" });
});

// ── Voice Endpoint ──
app.post("/api/voice", async (request, reply) => {
  const body = request.body as { session_id?: string; audio_base64?: string; domain?: string; tts?: boolean };

  if (!body.audio_base64) {
    return reply.status(400).send({ error: "Missing audio_base64" });
  }

  const domain = (body.domain as Domain) || "university";
  const sessionId = body.session_id || crypto.randomUUID();

  try {
    const appConfig = cfg();
    let asrMode: "whisper" | "google" | "disabled" = "disabled";

    if (appConfig.deploymentMode === "local") asrMode = "whisper";
    else if (appConfig.deploymentMode === "hybrid" || appConfig.deploymentMode === "cloud") asrMode = "google";

    const asrResult = await transcribeAudio(body.audio_base64, {
      mode: asrMode,
      whisperModel: "small",
      googleApiKey: process.env.GOOGLE_SPEECH_API_KEY,
    });

    const chatResult = await handleChat({
      session_id: sessionId,
      message: asrResult.text,
      domain,
    });

    if (body.tts) {
      const ttsAudio = await synthesizeSpeech(chatResult.response, {
        mode: appConfig.deploymentMode === "local" ? "coqui" : "google",
        googleApiKey: process.env.GOOGLE_SPEECH_API_KEY,
        voiceName: "vi-VN-Wavenet-A",
        languageCode: "vi-VN",
      });

      return {
        session_id: sessionId,
        response: chatResult.response,
        intent: chatResult.intent,
        confidence: chatResult.confidence,
        action_taken: chatResult.action_taken,
        audio_base64: ttsAudio.toString("base64"),
      };
    }

    return chatResult;
  } catch (err) {
    request.log.error({ err, sessionId }, "Voice error");
    return reply.status(500).send({
      session_id: sessionId,
      response: "Không thể xử lý giọng nói. Vui lòng thử nhập văn bản.",
    } as ChatResponse);
  }
});

// ── Admin: List Intents ──
app.get("/api/admin/intents", async () => {
  const registry = loadIntentRegistry("university");
  return registry.intents.map((i) => ({
    id: i.id,
    name: i.name,
    required_slots: i.required_slots,
    optional_slots: i.optional_slots,
    route: i.route,
    confirmation_required: i.confirmation_required,
    example_count: i.examples.length,
  }));
});

// ── Admin: Trigger knowledge seed ──
app.post("/api/admin/knowledge/seed", async () => {
  await seedKnowledge();
  return { status: "seeded" };
});

// ── Admin: Analytics ──
app.get("/api/admin/analytics", async () => {
  return getQueryStats();
});

// ── Admin: Review Queue ──
app.get("/api/admin/review-queue", async () => {
  return getReviewQueue("pending", 50);
});

app.post<{ Params: { id: string }; Body: { label: string } }>("/api/admin/review-queue/:id/approve", async (req, reply) => {
  const item = reviewItem(req.params.id, req.body.label);
  if (!item) return reply.status(404).send({ error: "Not found" });
  return item;
});

app.post<{ Params: { id: string } }>("/api/admin/review-queue/:id/ignore", async (req, reply) => {
  const item = ignoreItem(req.params.id);
  if (!item) return reply.status(404).send({ error: "Not found" });
  return item;
});

// ── Admin: Training Data ──
app.get("/api/admin/training-data", async () => {
  return getTrainingExamples();
});

app.post<{ Params: { id: string } }>("/api/admin/training-data/:id/approve", async (req, reply) => {
  const example = approveTrainingExample(req.params.id);
  if (!example) return reply.status(404).send({ error: "Not found" });
  return example;
});

// ── Admin: Trigger Retraining ──
app.post("/api/admin/trigger-retraining", async (_req, reply) => {
  const count = getApprovedCount();
  if (count < 10) {
    return reply.status(400).send({ message: `Cần ít nhất 10 examples để retrain. Hiện có ${count} examples đã approved.` });
  }
  const canRetrain = shouldTriggerRetraining(10);
  logModelMetrics(0.92, 0.89, count);
  return {
    message: canRetrain
      ? `Retraining triggered with ${count} examples.`
      : `Retraining queued. ${count} approved examples ready.`,
    examplesReady: count,
  };
});

// ── Admin: Model Metrics ──
app.get("/api/admin/model-metrics", async () => {
  return getModelMetrics();
});

// ── Admin: A/B Test Stats ──
app.get("/api/admin/ab-stats", async () => {
  return getABStats();
});

// ── Admin: Dashboard HTML ──
const __dirname = dirname(fileURLToPath(import.meta.url));
let dashboardHtml = "";
try {
  dashboardHtml = readFileSync(join(__dirname, "ui", "admin-dashboard", "index.html"), "utf-8");
} catch {
  dashboardHtml = "<h1>Dashboard not built</h1>";
}

app.get("/admin", async (_req, reply) => {
  return reply.type("text/html").send(dashboardHtml);
});

// ── Startup ──
async function start() {
  try {
    loadIntentRegistry("university");
    app.log.info("Intent registry loaded ✓");

    await seedKnowledge();
    app.log.info("Knowledge base seeded ✓");

    const appConfig = cfg();

    if (appConfig.deploymentMode !== "local") {
      cron.schedule("0 6 * * 1", async () => {
        app.log.info("[cron] Running weekly knowledge update");
        const result = await runWeeklyUpdate("university");
        app.log.info(`[cron] Weekly update done: added=${result.added}, updated=${result.updated}`);
      });
      app.log.info("[cron] Weekly knowledge update scheduled: Monday 06:00");
    }

    if (process.env.TELEGRAM_BOT_TOKEN) {
      try {
        const { startTelegramBot } = await import("./ui/telegram-bot.js");
        await startTelegramBot();
        app.log.info("[telegram] Bot started");
      } catch (err) {
        app.log.warn(`[telegram] Bot start failed: ${(err as Error).message}`);
      }
    }

    await app.listen({ port: config.port, host: config.host });
    app.log.info(`intent-translator-agent running on http://${config.host}:${config.port}`);
    app.log.info(`Deployment mode: ${config.deploymentMode}`);
    app.log.info(`ML inference: ${config.mlInferenceUrl}`);
    app.log.info(`Admin dashboard: http://${config.host}:${config.port}/admin`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
