import Redis from "ioredis";
import type { SessionContext, ConversationTurn, Domain, UserType, PendingIntent, SlotValue } from "../../types/index.js";

const SESSION_TTL_SECONDS = 3600;
const MAX_HISTORY_TURNS = 20;

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on("error", (err) => {
      console.warn(`[context-manager] Redis error (falling back to memory): ${err.message}`);
    });

    redis.on("connect", () => {
      console.log("[context-manager] Redis connected");
    });
  }
  return redis;
}

function sessionKey(sessionId: string): string {
  return `session:${sessionId}`;
}

function serializeSession(session: SessionContext): string {
  return JSON.stringify(session);
}

function deserializeSession(data: string | null): SessionContext | undefined {
  if (!data) return undefined;
  const parsed = JSON.parse(data) as SessionContext;
  parsed.createdAt = new Date(parsed.createdAt);
  parsed.expiresAt = new Date(parsed.expiresAt);
  parsed.history = (parsed.history ?? []).map((t) => ({
    ...t,
    timestamp: new Date(t.timestamp),
  }));
  return parsed;
}

export async function createSession(
  sessionId: string,
  domain: Domain,
  userType: UserType = "visitor",
): Promise<SessionContext> {
  const now = new Date();
  const session: SessionContext = {
    sessionId,
    domain,
    userType,
    language: "vi",
    history: [],
    resolvedEntities: {},
    createdAt: now,
    expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000),
  };

  try {
    const r = getRedis();
    await r.setex(sessionKey(sessionId), SESSION_TTL_SECONDS, serializeSession(session));
  } catch {
    // Redis unavailable — session stored in-memory fallback below
  }

  memoryFallback.set(sessionId, session);
  return session;
}

const memoryFallback = new Map<string, SessionContext>();

export async function getSession(sessionId: string): Promise<SessionContext | undefined> {
  try {
    const r = getRedis();
    const data = await r.get(sessionKey(sessionId));
    if (data) {
      await r.expire(sessionKey(sessionId), SESSION_TTL_SECONDS);
      return deserializeSession(data);
    }
  } catch {
    // Fall through to memory
  }

  const session = memoryFallback.get(sessionId);
  if (session && new Date() > session.expiresAt) {
    memoryFallback.delete(sessionId);
    return undefined;
  }
  return session;
}

export async function updateSession(sessionId: string, updates: Partial<SessionContext>): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  Object.assign(session, updates);
  memoryFallback.set(sessionId, session);

  try {
    const r = getRedis();
    await r.setex(sessionKey(sessionId), SESSION_TTL_SECONDS, serializeSession(session));
  } catch {
    // Redis save failed, memory-only is fine
  }
}

export async function addTurn(
  sessionId: string,
  role: "user" | "agent",
  text: string,
  metadata?: { intent?: string; slots_filled?: Record<string, SlotValue> },
): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;

  const turn: ConversationTurn = {
    role,
    text,
    timestamp: new Date(),
    intent: metadata?.intent,
    slots_filled: metadata?.slots_filled,
  };

  session.history.push(turn);
  if (session.history.length > MAX_HISTORY_TURNS) {
    session.history = session.history.slice(-MAX_HISTORY_TURNS);
  }

  memoryFallback.set(sessionId, session);
  try {
    const r = getRedis();
    await r.setex(sessionKey(sessionId), SESSION_TTL_SECONDS, serializeSession(session));
  } catch {
    // ok
  }
}

export async function setPendingIntent(sessionId: string, pending: PendingIntent): Promise<void> {
  await updateSession(sessionId, { pendingIntent: pending });
}

export async function clearPendingIntent(sessionId: string): Promise<void> {
  await updateSession(sessionId, { pendingIntent: undefined });
}

export async function getPendingIntent(sessionId: string): Promise<PendingIntent | undefined> {
  const session = await getSession(sessionId);
  return session?.pendingIntent;
}

export async function setEntity(sessionId: string, key: string, value: string): Promise<void> {
  const session = await getSession(sessionId);
  if (!session) return;
  session.resolvedEntities[key] = value;
  memoryFallback.set(sessionId, session);
  try {
    const r = getRedis();
    await r.setex(sessionKey(sessionId), SESSION_TTL_SECONDS, serializeSession(session));
  } catch {
    // ok
  }
}

export async function getEntity(sessionId: string, key: string): Promise<string | undefined> {
  const session = await getSession(sessionId);
  return session?.resolvedEntities[key];
}

export function detectUserType(text: string, explicitType?: UserType): UserType {
  if (explicitType) return explicitType;

  const lower = text.toLowerCase();

  if (/(người cao tuổi|người già|hưu trí|tuổi già|lớn tuổi)/i.test(lower)) return "elderly";
  if (/(giảng viên|giáo viên|cán bộ|nhân viên|quản lý|admin)/i.test(lower)) return "staff";
  if (/(thưa|kính|dạ|vui lòng|xin phép|quý|kính thưa)/i.test(lower)) return "visitor";

  return "student";
}

export function resolveVietnamesePronouns(text: string, session: SessionContext | undefined): string {
  if (!session) return text;

  let resolved = text;
  const pronounMap: Record<string, string> = {
    "nó": "course_name",
    "đó": "last_mentioned",
    "môn đó": "course_name",
    "môn này": "course_name",
    "cái đó": "last_mentioned",
    "cái này": "last_mentioned",
  };

  for (const [pronoun, entityKey] of Object.entries(pronounMap)) {
    if (resolved.toLowerCase().includes(pronoun)) {
      const referent = session.resolvedEntities[entityKey];
      if (referent) {
        resolved = resolved.replace(new RegExp(pronoun, "gi"), referent);
      }
    }
  }

  return resolved;
}

export async function endSession(sessionId: string): Promise<void> {
  memoryFallback.delete(sessionId);
  try {
    const r = getRedis();
    await r.del(sessionKey(sessionId));
  } catch {
    // ok
  }
}

export async function disconnectRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
