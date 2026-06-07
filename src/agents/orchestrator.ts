import type {
  ChatRequest,
  ChatResponse,
  Domain,
  SlotValue,
  PendingIntent,
} from "../types/index.js";
import { normalizeInput } from "../agents/input-normalizer/index.js";
import {
  classifyIntent,
  routeByConfidence,
  detectMultiIntent,
} from "../agents/intent-classifier/index.js";
import { extractSlots } from "../agents/slot-extractor/index.js";
import {
  generateSlotQuestion,
  prioritizeMissingSlots,
  mergeSlots,
} from "../agents/slot-filler/index.js";
import {
  createSession,
  getSession,
  addTurn,
  setPendingIntent,
  clearPendingIntent,
  getPendingIntent,
  detectUserType,
  resolveVietnamesePronouns,
  setEntity,
  endSession,
} from "../agents/context-manager/index.js";
import { executeRoute } from "../agents/process-router/index.js";
import { humanizeResponse, generateFollowUpSuggestions } from "../agents/response-humanizer/index.js";
import { getIntentById } from "../routing/registry-loader.js";

const MAX_SLOT_FILL_TURNS = 5;
const CONFIRMATION_TIMEOUT_MS = 30_000;

export async function handleChat(req: ChatRequest): Promise<ChatResponse> {
  const domain: Domain = req.domain || "university";
  const sessionId = req.session_id || crypto.randomUUID();

  let session = await getSession(sessionId);
  if (!session) {
    session = await createSession(sessionId, domain, detectUserType(req.message, req.user_type));
  }

  const resolvedText = resolveVietnamesePronouns(req.message, session);
  await addTurn(sessionId, "user", req.message);

  const normalized = normalizeInput(resolvedText);

  const pending = await getPendingIntent(sessionId);
  if (pending && !pending.awaitingConfirmation) {
    return handleSlotFillingTurn(sessionId, normalized.text, domain, pending);
  }

  if (pending && pending.awaitingConfirmation) {
    return handleConfirmationTurn(sessionId, normalized.text, domain, pending);
  }

  const classification = await classifyIntent(normalized.text, domain);
  const routingDecision = routeByConfidence(classification);

  if (routingDecision.action === "CLARIFY") {
    const response = routingDecision.message ?? "Xin lỗi, mình chưa hiểu rõ ý của bạn.";
    await addTurn(sessionId, "agent", response, { intent: classification.intent });
    return buildResponse(sessionId, response, classification.intent, classification.confidence);
  }

  if (routingDecision.action === "CONFIRM_INTENT") {
    const response = routingDecision.message ?? `Bạn muốn ${classification.intent}?`;
    const intentDef = getIntentById(domain, routingDecision.intent ?? classification.intent);
    await setPendingIntent(sessionId, {
      intent: routingDecision.intent ?? classification.intent,
      filledSlots: {},
      missingSlots: intentDef?.required_slots ?? [],
      awaitingConfirmation: true,
    });
    await addTurn(sessionId, "agent", response, { intent: classification.intent });
    return buildResponse(sessionId, response, classification.intent, classification.confidence);
  }

  const intentId = classification.intent;
  const intents = detectMultiIntent(normalized.text, classification);

  if (intents.length > 1) {
    return executeIntent(sessionId, normalized.text, domain, intents[0]!);
  }

  return executeIntent(sessionId, normalized.text, domain, intentId);
}

async function executeIntent(
  sessionId: string,
  text: string,
  domain: Domain,
  intentId: string,
): Promise<ChatResponse> {
  const slotResult = await extractSlots(text, domain, intentId);

  if (slotResult.missing.length > 0) {
    const prioritized = prioritizeMissingSlots(slotResult.missing);
    await setPendingIntent(sessionId, {
      intent: intentId,
      filledSlots: slotResult.filled,
      missingSlots: prioritized,
      awaitingConfirmation: false,
    });

    const session = await getSession(sessionId);
    const userType = session?.userType ?? "student";
    const firstMissing = prioritized[0]!;
    const question = generateSlotQuestion(firstMissing, userType);
    await addTurn(sessionId, "agent", question, { intent: intentId, slots_filled: slotResult.filled });
    return buildResponse(sessionId, question, intentId, 0.9, serializeSlots(slotResult.filled));
  }

  const intentDef = getIntentById(domain, intentId);

  if (intentDef?.confirmation_required) {
    const confirmMsg = intentDef.confirmation_message
      ?.replace(/\{(\w+)\}/g, (_, key: string) => String(slotResult.filled[key]?.value ?? `{${key}}`))
      ?? "Xác nhận thực hiện?";
    await setPendingIntent(sessionId, {
      intent: intentId,
      filledSlots: slotResult.filled,
      missingSlots: [],
      awaitingConfirmation: true,
    });
    await addTurn(sessionId, "agent", confirmMsg, { intent: intentId, slots_filled: slotResult.filled });
    return buildResponse(sessionId, confirmMsg, intentId, 0.9, serializeSlots(slotResult.filled));
  }

  return finalizeAndExecute(sessionId, intentId, slotResult.filled, domain);
}

async function handleSlotFillingTurn(
  sessionId: string,
  text: string,
  domain: Domain,
  pending: PendingIntent,
): Promise<ChatResponse> {
  const slotResult = await extractSlots(text, domain, pending.intent);
  const mergedFilled = mergeSlots(pending.filledSlots, slotResult.filled);

  const intentDef = getIntentById(domain, pending.intent);
  const allRequired = intentDef?.required_slots ?? [];
  const stillMissing = allRequired.filter((s) => !mergedFilled[s]);

  const session = await getSession(sessionId);
  const turnsElapsed = session?.history.filter((t) => t.role === "user").length ?? 0;
  const slotFillTurns = Math.min(turnsElapsed, MAX_SLOT_FILL_TURNS);

  if (stillMissing.length === 0) {
    return finalizeAndExecute(sessionId, pending.intent, mergedFilled, domain);
  }

  if (slotFillTurns >= MAX_SLOT_FILL_TURNS) {
    const msg = "Mình chưa thể hoàn thành yêu cầu này. Vui lòng liên hệ phòng đào tạo để được hỗ trợ trực tiếp: 028.xxxx.xxxx.";
    await clearPendingIntent(sessionId);
    await addTurn(sessionId, "agent", msg);
    return buildResponse(sessionId, msg, pending.intent, 0.5);
  }

  const prioritized = prioritizeMissingSlots(stillMissing);
  await setPendingIntent(sessionId, {
    intent: pending.intent,
    filledSlots: mergedFilled,
    missingSlots: prioritized,
    awaitingConfirmation: false,
  });

  const userType = session?.userType ?? "student";
  const nextSlot = prioritized[0]!;
  const question = generateSlotQuestion(nextSlot, userType);
  await addTurn(sessionId, "agent", question, { intent: pending.intent, slots_filled: mergedFilled });

  return buildResponse(sessionId, question, pending.intent, 0.85, serializeSlots(mergedFilled));
}

async function handleConfirmationTurn(
  sessionId: string,
  text: string,
  domain: Domain,
  pending: PendingIntent,
): Promise<ChatResponse> {
  const lower = text.toLowerCase();
  const isConfirmed = /^(đúng|ừ|ok|yes|đồng ý|okay|có|được|oke|xác nhận)/i.test(lower);
  const isCanceled = /^(không|hủy|thôi|no|cancel|stop)/i.test(lower);

  const now = Date.now();
  const lastTurn = (await getSession(sessionId))?.history.at(-1);
  const elapsedSinceConfirm = lastTurn?.timestamp
    ? now - lastTurn.timestamp.getTime()
    : 0;

  if (elapsedSinceConfirm > CONFIRMATION_TIMEOUT_MS) {
    const msg = "Đã hết thời gian chờ xác nhận. Yêu cầu đã bị hủy.";
    await clearPendingIntent(sessionId);
    await addTurn(sessionId, "agent", msg);
    return buildResponse(sessionId, msg, pending.intent, 0.5);
  }

  if (isCanceled) {
    const msg = "Đã hủy yêu cầu. Bạn cần giúp gì thêm không?";
    await clearPendingIntent(sessionId);
    await addTurn(sessionId, "agent", msg);
    return buildResponse(sessionId, msg, pending.intent, 0.9);
  }

  if (isConfirmed) {
    return finalizeAndExecute(sessionId, pending.intent, pending.filledSlots, domain);
  }

  const msg = "Mình chưa hiểu. Bạn muốn xác nhận (đồng ý) hay hủy bỏ (không)?";
  await addTurn(sessionId, "agent", msg);
  return buildResponse(sessionId, msg, pending.intent, 0.5);
}

async function finalizeAndExecute(
  sessionId: string,
  intentId: string,
  filledSlots: Record<string, SlotValue>,
  domain: Domain,
): Promise<ChatResponse> {
  const routeResult = await executeRoute(intentId, filledSlots, domain);
  const session = await getSession(sessionId);
  const userType = session?.userType ?? "student";
  const response = await humanizeResponse(intentId, routeResult, userType);
  const followUps = generateFollowUpSuggestions(intentId);

  for (const [key, val] of Object.entries(filledSlots)) {
    await setEntity(sessionId, key, String(val.value));
  }

  await clearPendingIntent(sessionId);
  await addTurn(sessionId, "agent", response, { intent: intentId, slots_filled: filledSlots });

  return buildResponse(sessionId, response, intentId, 0.9, serializeSlots(filledSlots), followUps);
}

function serializeSlots(slots: Record<string, SlotValue>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(slots)) {
    result[key] = String(val.value);
  }
  return result;
}

function buildResponse(
  sessionId: string,
  response: string,
  intent?: string,
  confidence?: number,
  slots?: Record<string, string>,
  followUps?: string[],
): ChatResponse {
  return {
    session_id: sessionId,
    response,
    intent,
    confidence,
    slots_filled: slots,
    action_taken: intent ? "PROCESSED" : undefined,
    follow_up_suggestions: followUps,
  };
}

export { endSession };
