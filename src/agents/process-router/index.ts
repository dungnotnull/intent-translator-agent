import type { Domain, SlotValue, RouteResult } from "../../types/index.js";
import { getIntentById } from "../../routing/registry-loader.js";
import { getSISAdapter } from "../../routing/api-adapters/university-sis.js";
import { searchKB, generalSearchKB } from "../knowledge-updater/index.js";

const RETRY_DELAY_MS = 500;
const MAX_RETRIES = 1;

export async function executeRoute(
  intent: string,
  slots: Record<string, SlotValue>,
  domain: Domain,
): Promise<RouteResult> {
  const intentDef = getIntentById(domain, intent);
  if (!intentDef) {
    return {
      type: "SYSTEM_ERROR",
      message: "Hệ thống chưa được cấu hình cho yêu cầu này. Vui lòng liên hệ quản trị viên.",
    };
  }

  const slotValues = mapSlots(slots);
  const route = intentDef.route;

  try {
    const result = await executeWithRetry(route, slotValues, domain);
    return result;
  } catch {
    return fallbackForRoute(route, slotValues, domain);
  }
}

function mapSlots(slots: Record<string, SlotValue>): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [key, val] of Object.entries(slots)) {
    mapped[key] = String(val.value);
  }
  return mapped;
}

async function executeWithRetry(
  route: string,
  slots: Record<string, string>,
  domain: Domain,
  attempt = 0,
): Promise<RouteResult> {
  try {
    return await executeOnce(route, slots, domain);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      console.warn(`[router] Retry ${attempt + 1}/${MAX_RETRIES} for ${route}: ${(err as Error).message}`);
      await sleep(RETRY_DELAY_MS * (attempt + 1));
      return executeWithRetry(route, slots, domain, attempt + 1);
    }
    throw err;
  }
}

async function executeOnce(
  route: string,
  slots: Record<string, string>,
  domain: Domain,
): Promise<RouteResult> {
  switch (route) {
    case "university_sis.get_tuition":
      return getSISAdapter().getTuition(slots.student_id ?? "", slots.semester ?? "HK1");

    case "university_sis.get_tuition_deadline":
      return getSISAdapter().getTuitionDeadline(slots.semester ?? "HK1");

    case "university_sis.get_scholarship_info":
      return getSISAdapter().getScholarshipInfo(slots.student_id ?? "");

    case "university_sis.register_course":
      return getSISAdapter().registerCourse(
        slots.student_id ?? "",
        slots.course_code ?? "",
        slots.semester ?? "HK1",
      );

    case "university_sis.cancel_course":
      return getSISAdapter().cancelCourse(
        slots.student_id ?? "",
        slots.course_code ?? "",
        slots.semester ?? "HK1",
      );

    case "university_sis.get_schedule":
      return getSISAdapter().getSchedule(slots.student_id ?? "", slots.week);

    case "university_sis.get_graduation_requirements":
      return getSISAdapter().getGraduationRequirements(slots.student_id ?? "");

    case "university_sis.get_transcript":
      return getSISAdapter().getTranscript(slots.student_id ?? "", slots.semester);

    case "knowledge_base.query_policy":
      return handleQueryPolicy(slots);

    case "university_sis.request_document":
      return getSISAdapter().requestDocument(slots.student_id ?? "", slots.purpose ?? "other");

    case "university_sis.get_document_status":
      return getSISAdapter().getDocumentStatus(slots.student_id ?? "");

    case "knowledge_base.general_search":
      return handleGeneralSearch(slots);

    case "dialogue_manager.ask_clarification":
      return {
        type: "USER_ERROR",
        message: "Xin lỗi, mình chưa hiểu rõ ý của bạn. Bạn có thể nói rõ hơn được không?",
      };

    default:
      return {
        type: "SYSTEM_ERROR",
        message: `Route ${route} chưa được triển khai. Vui lòng liên hệ quản trị viên.`,
      };
  }
}

async function handleQueryPolicy(slots: Record<string, string>): Promise<RouteResult> {
  const topic = slots.policy_topic ?? "";
  const kbResult = await searchKB(topic, "university");

  if (kbResult.length > 0) {
    const entry = kbResult[0]!;
    return {
      type: "SUCCESS",
      data: {
        policy_text: entry.content,
        source: entry.source,
        last_updated: entry.last_updated.toISOString(),
        entry_id: entry.id,
      },
    };
  }

  return {
    type: "SUCCESS",
    data: {
      policy_text: getStaticPolicyText(topic),
      source: "Quy chế đào tạo đại học (Thông tư 08/2021/TT-BGDĐT)",
      last_updated: "2024-08-15",
    },
  };
}

async function handleGeneralSearch(slots: Record<string, string>): Promise<RouteResult> {
  const query = slots.query ?? "";
  const kbResult = await generalSearchKB(query, "university");

  if (kbResult.length > 0) {
    return {
      type: "SUCCESS",
      data: {
        results: kbResult.map((e) => ({ title: e.title, snippet: e.content.slice(0, 200) })),
      },
    };
  }

  return {
    type: "SUCCESS",
    data: {
      results: [
        { title: "Lịch nghỉ Tết Nguyên Đán 2025", snippet: "Nghỉ từ ngày 20/01/2025 đến 02/02/2025" },
        { title: "Giờ mở cửa thư viện", snippet: "Thứ 2 - Thứ 7: 7:00 - 21:00" },
      ],
    },
  };
}

function fallbackForRoute(route: string, slots: Record<string, string>, domain: Domain): RouteResult {
  if (route.startsWith("knowledge_base.")) {
    return handleKnowledgeFallback(route, slots);
  }

  return {
    type: "SYSTEM_ERROR",
    message: "Hệ thống đang bận, bạn vui lòng thử lại sau 5 phút hoặc liên hệ phòng đào tạo: 028.xxxx.xxxx.",
    fallback: {
      phone: "028.xxxx.xxxx",
      email: "daotao@truong.edu.vn",
      location: "Phòng A.101, Tòa A",
      hours: "8:00 - 17:00, Thứ 2 - Thứ 6",
    },
  };
}

function handleKnowledgeFallback(route: string, slots: Record<string, string>): RouteResult {
  return {
    type: "SUCCESS",
    data: {
      policy_text: getStaticPolicyText(slots.policy_topic ?? ""),
      source: "Quy chế đào tạo đại học (Thông tư 08/2021/TT-BGDĐT)",
      last_updated: "2024-08-15",
    },
  };
}

function getStaticPolicyText(topic: string): string {
  const lower = topic.toLowerCase();
  if (lower.includes("thi lại") || lower.includes("thi lai")) {
    return "Sinh viên được phép thi lại tối đa 2 lần cho mỗi học phần. Điểm thi lại được tính theo lần thi cao nhất. Sinh viên phải đăng ký thi lại trong thời gian quy định của nhà trường.";
  }
  if (lower.includes("cảnh báo") || lower.includes("đình chỉ") || lower.includes("buộc thôi")) {
    return "Sinh viên bị cảnh báo học vụ khi điểm trung bình chung tích lũy dưới 1.2 (năm 1), 1.4 (năm 2), 1.6 (năm 3+). Sau 2 lần cảnh báo liên tiếp, sinh viên bị buộc thôi học.";
  }
  if (lower.includes("học phí") || lower.includes("tuition")) {
    return "Học phí được tính theo tín chỉ. Mức học phí cụ thể phụ thuộc vào nhóm ngành và quy định của trường. Sinh viên thuộc diện chính sách được miễn/giảm theo quy định.";
  }
  return "Vui lòng liên hệ phòng đào tạo để được tư vấn chi tiết về quy chế học vụ. Số điện thoại: 028.xxxx.xxxx.";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
