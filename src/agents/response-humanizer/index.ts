import type { RouteResult, UserType } from "../../types/index.js";
import { getLLMClient } from "../../tools/llm-client.js";

export async function humanizeResponse(
  intent: string,
  result: RouteResult,
  userType: UserType,
): Promise<string> {
  if (result.type === "USER_ERROR" || result.type === "SYSTEM_ERROR") {
    return result.message ?? "Có lỗi xảy ra. Vui lòng thử lại sau.";
  }

  if (result.type === "SUCCESS" && result.data) {
    const data = result.data as Record<string, unknown>;
    const templateResult = formatIntentResponse(intent, data, userType);

    // Fall through to the template if it produced a good result and isn't generic JSON
    if (templateResult && !templateResult.startsWith("{") && !templateResult.startsWith("[")) {
      return templateResult;
    }

    // Complex/unusual response → use LLM to humanize
    return humanizeWithLLM(intent, data, userType);
  }

  return "Đã xử lý yêu cầu của bạn.";
}

async function humanizeWithLLM(
  intent: string,
  data: Record<string, unknown>,
  userType: UserType,
): Promise<string> {
  try {
    const llm = getLLMClient();
    const userTypeLabel = USER_TYPE_LABELS[userType] ?? "sinh viên";

    const prompt = `Chuyển đổi phản hồi API có cấu trúc thành câu tiếng Việt tự nhiên, thân thiện.

Người dùng: ${userTypeLabel}
Loại yêu cầu: ${intent}
Dữ liệu API: ${JSON.stringify(data, null, 2)}

Quy tắc:
- Không đề cập đến "API", "hệ thống", "cơ sở dữ liệu", "mã lỗi"
- Định dạng tiền tệ: X.XXX.XXX đồng hoặc X triệu X trăm nghìn đồng
- Định dạng ngày: ngày X tháng X năm XXXX
- Giữ câu trả lời dưới 3 câu cho truy vấn đơn giản
- ${userType === "elderly" ? "Sử dụng ngôn ngữ trang trọng, kính ngữ (dạ, thưa, ạ)" : ""}
Trả lời bằng tiếng Việt.`;

    const response = await llm.complete("Bạn là trợ lý đại học Việt Nam, chuyên chuyển đổi dữ liệu thành câu trả lời tự nhiên.", prompt, {
      temperature: 0.3,
      maxTokens: 300,
    });

    return response.trim() || JSON.stringify(data);
  } catch {
    return JSON.stringify(data);
  }
}

const USER_TYPE_LABELS: Record<UserType, string> = {
  student: "sinh viên",
  staff: "cán bộ / giảng viên",
  citizen: "người dân",
  elderly: "người cao tuổi",
  visitor: "khách",
};

function formatIntentResponse(
  intent: string,
  data: Record<string, unknown>,
  userType: UserType,
): string {
  switch (intent) {
    case "QUERY_TUITION_SEMESTER":
      return formatTuitionResponse(data, userType);
    case "QUERY_TUITION_DEADLINE":
      return formatDeadlineResponse(data, userType);
    case "QUERY_TUITION_DISCOUNT":
      return formatDiscountResponse(data, userType);
    case "REGISTER_COURSE_NEW":
      return formatRegisterResponse(data, userType);
    case "CANCEL_COURSE_REGISTRATION":
      return formatCancelResponse(data, userType);
    case "QUERY_COURSE_SCHEDULE":
      return formatScheduleResponse(data, userType);
    case "QUERY_GRADUATION_REQUIREMENTS":
      return formatGraduationResponse(data, userType);
    case "QUERY_ACADEMIC_TRANSCRIPT":
      return formatTranscriptResponse(data, userType);
    case "QUERY_ACADEMIC_POLICY":
      return formatPolicyResponse(data, userType);
    case "REQUEST_DOCUMENT_ENROLLMENT":
      return formatDocumentRequestResponse(data, userType);
    case "QUERY_DOCUMENT_STATUS":
      return formatDocumentStatusResponse(data, userType);
    case "QUERY_GENERAL_INFO":
      return formatGeneralInfoResponse(data, userType);
    default:
      return JSON.stringify(data);
  }
}

function formatTuitionResponse(data: Record<string, unknown>, userType: UserType): string {
  const amount = Number(data.amount ?? 0);
  const paid = data.paid;
  const deadline = data.deadline;
  const discount = Number(data.discount ?? 0);
  const semester = data.semester_name ?? "";

  const amountStr = formatVND(amount, userType);

  let response = `${semester}, bạn cần đóng ${amountStr}.`;

  if (deadline) {
    response += ` Hạn nộp: ngày ${formatDate(String(deadline))}.`;
  }

  if (paid) {
    response += " ✅ Bạn đã đóng học phí rồi.";
  } else {
    response += " ⚠️ Bạn chưa đóng học phí.";
  }

  if (discount > 0) {
    response += ` Bạn được giảm ${formatVND(discount, userType)} (${data.discount_reason ?? "chính sách"}).`;
  }

  return response;
}

function formatDeadlineResponse(data: Record<string, unknown>, userType: UserType): string {
  const deadline = String(data.deadline ?? "");
  const semester = data.semester_name ?? "";
  return `Hạn nộp học phí ${semester} là ngày ${formatDate(deadline)}. ${data.grace_period ? `Gia hạn đến ngày ${formatDate(String(data.grace_period))}.` : ""}`;
}

function formatDiscountResponse(data: Record<string, unknown>, userType: UserType): string {
  if (data.eligible) {
    return `Bạn thuộc diện được ${data.reason ?? "miễn giảm học phí"}. Mức giảm: ${data.discount_percent}% (${formatVND(Number(data.discount_amount ?? 0), userType)}).`;
  }
  return "Bạn không thuộc diện được miễn giảm học phí.";
}

function formatRegisterResponse(data: Record<string, unknown>, userType: UserType): string {
  if (data.success) {
    return `Đăng ký thành công môn ${data.course_name} (${data.course_code})! Lịch học: ${data.schedule}.`;
  }
  return `Không thể đăng ký môn ${data.course_name}. Lý do: ${data.error_message ?? "không xác định"}.`;
}

function formatCancelResponse(data: Record<string, unknown>, userType: UserType): string {
  if (data.success) {
    return `Đã hủy đăng ký môn ${data.course_code} thành công.`;
  }
  return "Không thể hủy đăng ký môn học. Vui lòng thử lại sau.";
}

function formatScheduleResponse(data: Record<string, unknown>, userType: UserType): string {
  const schedule = data.schedule as Array<{ day: string; courses: string[] }> | undefined;
  if (!schedule || schedule.length === 0) return "Không tìm thấy lịch học.";

  const lines = schedule.map(
    (day) => `${day.day}: ${day.courses.join(", ")}`,
  );
  return `Lịch học của bạn:\n${lines.join("\n")}`;
}

function formatGraduationResponse(data: Record<string, unknown>, userType: UserType): string {
  const total = Number(data.total_required ?? 0);
  const completed = Number(data.completed ?? 0);
  const remaining = Number(data.remaining ?? 0);
  const missing = data.missing_courses as string[] | undefined;
  const gpa = data.gpa;

  let response = `Bạn đã hoàn thành ${completed}/${total} tín chỉ. GPA hiện tại: ${gpa}.`;
  if (remaining > 0 && missing) {
    response += ` Bạn còn ${remaining} tín chỉ, bao gồm: ${missing.join(", ")}.`;
  }
  return response;
}

function formatTranscriptResponse(data: Record<string, unknown>, userType: UserType): string {
  const gpa = data.gpa;
  const credits = data.total_credits;
  const courses = data.courses as Array<{ name: string; grade: string }> | undefined;

  let response = `GPA: ${gpa}. Tổng tín chỉ đã tích lũy: ${credits}.`;
  if (courses) {
    response += `\nMột số môn gần đây:\n${courses.map((c) => `  ${c.name}: ${c.grade}`).join("\n")}`;
  }
  return response;
}

function formatPolicyResponse(data: Record<string, unknown>, userType: UserType): string {
  const policy = data.policy_text ?? "";
  const source = data.source ?? "";
  return `${policy}\n📎 Nguồn: ${source}.`;
}

function formatDocumentRequestResponse(data: Record<string, unknown>, userType: UserType): string {
  const id = data.request_id ?? "";
  const ready = data.estimated_ready ?? "";
  return `Đã ghi nhận yêu cầu. Mã yêu cầu: ${id}. Dự kiến có kết quả: ngày ${formatDate(String(ready))}.`;
}

function formatDocumentStatusResponse(data: Record<string, unknown>, userType: UserType): string {
  const status = data.status_text ?? data.status ?? "";
  const completion = data.estimated_completion ?? "";
  return `Trạng thái hồ sơ: ${status}. ${completion ? `Dự kiến hoàn thành: ngày ${formatDate(String(completion))}.` : ""}`;
}

function formatGeneralInfoResponse(data: Record<string, unknown>, userType: UserType): string {
  const results = data.results as Array<{ title: string; snippet: string }> | undefined;
  if (!results) return "Không tìm thấy thông tin phù hợp.";
  return results.map((r) => `${r.title}: ${r.snippet}`).join("\n\n");
}

// ── Formatting Helpers ──

function formatVND(amount: number, userType: UserType): string {
  if (amount >= 1_000_000) {
    const millions = Math.floor(amount / 1_000_000);
    const remainder = amount % 1_000_000;
    if (remainder === 0) {
      return userType === "student" ? `${millions} triệu đồng` : `${millions}.000.000 đồng`;
    }
    const thousands = Math.floor(remainder / 1_000);
    if (thousands > 0) {
      return `${millions} triệu ${thousands} nghìn đồng`;
    }
    return `${millions} triệu đồng`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1000).toFixed(0)} nghìn đồng`;
  }
  return `${amount} đồng`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return `ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

export function generateFollowUpSuggestions(intent: string): string[] {
  const suggestions: Record<string, string[]> = {
    QUERY_TUITION_SEMESTER: ["Bạn có muốn biết hạn nộp học phí không?"],
    QUERY_TUITION_DEADLINE: ["Bạn có muốn tra cứu học phí không?"],
    QUERY_COURSE_SCHEDULE: ["Bạn có muốn biết lịch thi không?"],
    QUERY_ACADEMIC_TRANSCRIPT: ["Bạn có muốn xem điều kiện tốt nghiệp không?"],
  };
  return suggestions[intent] ?? [];
}
