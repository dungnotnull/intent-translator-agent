import type { ClassificationResult, Domain, RoutingDecision } from "../../types/index.js";
import { getLLMClient } from "../../tools/llm-client.js";
import { listIntentIds, getIntentById } from "../../routing/registry-loader.js";

const CONFIDENCE_THRESHOLD_LOCAL = 0.75;
const CONFIDENCE_THRESHOLD_EXECUTE = 0.85;
const CONFIDENCE_THRESHOLD_CLARIFY = 0.65;

const INTENT_DESCRIPTIONS_VI: Record<string, string> = {
  QUERY_TUITION_SEMESTER: "tra cứu học phí theo học kỳ",
  QUERY_TUITION_DEADLINE: "hỏi hạn nộp học phí",
  QUERY_TUITION_DISCOUNT: "hỏi về học bổng hoặc miễn giảm học phí",
  REGISTER_COURSE_NEW: "đăng ký môn học mới",
  CANCEL_COURSE_REGISTRATION: "hủy đăng ký môn học",
  QUERY_COURSE_SCHEDULE: "tra cứu lịch học",
  QUERY_GRADUATION_REQUIREMENTS: "hỏi điều kiện tốt nghiệp",
  QUERY_ACADEMIC_TRANSCRIPT: "xem bảng điểm",
  QUERY_ACADEMIC_POLICY: "hỏi quy chế học vụ",
  REQUEST_DOCUMENT_ENROLLMENT: "xin giấy xác nhận sinh viên",
  QUERY_DOCUMENT_STATUS: "kiểm tra trạng thái hồ sơ",
  QUERY_GENERAL_INFO: "hỏi thông tin chung",
  CLARIFY_NEEDED: "cần làm rõ yêu cầu",
};

export async function classifyLocalSLM(text: string, domain: Domain): Promise<ClassificationResult> {
  const mlUrl = process.env.ML_INFERENCE_URL || "http://localhost:8001";

  try {
    const response = await fetch(`${mlUrl}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, domain, top_k: 3 }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`ML server returned ${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
      intent: string;
      confidence: number;
      alternatives: { intent: string; confidence: number }[];
      model_version: string;
      classifier_type: string;
    };

    return {
      intent: data.intent,
      confidence: data.confidence,
      alternatives: data.alternatives,
      source: "local_slm",
      model_version: `${data.classifier_type}-${data.model_version}`,
    };
  } catch (err) {
    console.warn(`[classifier] ML server unavailable (${(err as Error).message}), using rule fallback`);
    return classifyByRules(text, domain);
  }
}

export async function classifyWithLLMFallback(
  text: string,
  domain: Domain,
  localResult: ClassificationResult,
): Promise<ClassificationResult> {
  try {
    const llm = getLLMClient();
    const intentIds = listIntentIds(domain);
    const intentDefs = intentIds.map((id) => {
      const def = getIntentById(domain, id);
      return { id, name: def?.name ?? id, route: def?.route };
    });
    return await llm.classifyWithFallback(text, domain, { intents: intentDefs }, localResult);
  } catch (err) {
    console.warn(`[classifier] LLM fallback failed: ${(err as Error).message}`);
    return localResult;
  }
}

export async function classifyIntent(text: string, domain: Domain): Promise<ClassificationResult> {
  const localResult = await classifyLocalSLM(text, domain);

  if (localResult.confidence >= CONFIDENCE_THRESHOLD_LOCAL) {
    return localResult;
  }

  return classifyWithLLMFallback(text, domain, localResult);
}

function hasWord(text: string, ...words: string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w));
}

export function classifyByRules(text: string, domain: Domain): ClassificationResult {
  const lower = text.toLowerCase();
  const alternatives = listIntentIds(domain).map((id) => ({ intent: id, confidence: 0 }));

  if (hasWord(lower, "học phí", "tuition", "tiền học") && hasWord(lower, "hạn", "deadline", "khi nào", "đến khi")) {
    return { intent: "QUERY_TUITION_DEADLINE", confidence: 0.78, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "học phí", "tuition", "tiền học") && hasWord(lower, "giảm", "học bổng", "chính sách", "miễn")) {
    return { intent: "QUERY_TUITION_DISCOUNT", confidence: 0.80, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "học phí", "tuition", "tiền học")) {
    return { intent: "QUERY_TUITION_SEMESTER", confidence: 0.85, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "đăng ký", "register", "dang ky", "dang ki")) {
    return { intent: "REGISTER_COURSE_NEW", confidence: 0.82, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "hủy", "drop", "rút môn", "cancel", "huy")) {
    return { intent: "CANCEL_COURSE_REGISTRATION", confidence: 0.82, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "lịch", "thời khóa biểu", "schedule", "thời khoá biểu")) {
    return { intent: "QUERY_COURSE_SCHEDULE", confidence: 0.82, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "tốt nghiệp", "ra trường", "graduation")) {
    return { intent: "QUERY_GRADUATION_REQUIREMENTS", confidence: 0.82, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "bảng điểm", "gpa", "transcript")) {
    return { intent: "QUERY_ACADEMIC_TRANSCRIPT", confidence: 0.88, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "quy chế", "quy định", "policy", "thi lại", "thi lai", "cảnh báo", "đình chỉ")) {
    return { intent: "QUERY_ACADEMIC_POLICY", confidence: 0.78, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "giấy", "xác nhận", "certificate")) {
    return { intent: "REQUEST_DOCUMENT_ENROLLMENT", confidence: 0.78, alternatives, source: "rule", model_version: "rule-v1" };
  }
  if (hasWord(lower, "trạng thái", "đã xử lý", "được duyệt", "status")) {
    return { intent: "QUERY_DOCUMENT_STATUS", confidence: 0.75, alternatives, source: "rule", model_version: "rule-v1" };
  }

  return { intent: "QUERY_GENERAL_INFO", confidence: 0.35, alternatives, source: "rule", model_version: "rule-v1" };
}

export function routeByConfidence(result: ClassificationResult): RoutingDecision {
  if (result.confidence >= CONFIDENCE_THRESHOLD_EXECUTE) {
    return { action: "EXECUTE", intent: result.intent };
  }

  if (result.confidence >= CONFIDENCE_THRESHOLD_CLARIFY) {
    const description = INTENT_DESCRIPTIONS_VI[result.intent] ?? result.intent;
    return { action: "CONFIRM_INTENT", intent: result.intent, message: `Bạn muốn ${description}, đúng không?` };
  }

  return { action: "CLARIFY", message: "Xin lỗi, mình chưa hiểu rõ ý của bạn. Bạn có thể nói rõ hơn được không?" };
}

export function detectMultiIntent(text: string, result: ClassificationResult): string[] {
  const conjunctions = ["và", "với", "cùng", "thêm", "nữa", "còn", "cũng", "also", "and"];
  const hasConjunction = conjunctions.some((c) => text.toLowerCase().includes(c));

  if (hasConjunction && result.alternatives[0] && result.alternatives[0].confidence > 0.60) {
    return [result.intent, result.alternatives[0].intent];
  }

  return [result.intent];
}
