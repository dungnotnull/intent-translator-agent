import type { UserType, SlotValue } from "../../types/index.js";
import { getSlotPromptVi } from "../../routing/registry-loader.js";

const SLOT_QUESTIONS_VI: Record<string, Record<UserType, string>> = {
  student_id: {
    student: "Bạn cho mình biết mã số sinh viên của bạn nhé?",
    staff: "Vui lòng cung cấp mã sinh viên cần tra cứu.",
    citizen: "Bạn có thể cung cấp số định danh không ạ?",
    elderly: "Bạn có thể cho biết số thẻ sinh viên không ạ?",
    visitor: "Vui lòng cung cấp mã số sinh viên.",
  },
  semester: {
    student: "Bạn hỏi về học kỳ nào vậy? Kỳ 1 hay kỳ 2?",
    staff: "Học kỳ cần tra cứu?",
    citizen: "Học kỳ nào ạ?",
    elderly: "Bạn muốn biết học kỳ nào, kỳ 1 hay kỳ 2 ạ?",
    visitor: "Vui lòng cho biết học kỳ.",
  },
  course_code: {
    student: "Bạn muốn đăng ký môn gì? Cho mình biết tên hoặc mã môn học nhé.",
    staff: "Mã môn học?",
    citizen: "Môn học tên gì vậy bạn?",
    elderly: "Môn học tên gì vậy bạn?",
    visitor: "Vui lòng cung cấp mã môn học.",
  },
  purpose: {
    student: "Giấy xác nhận này dùng để làm gì? (ví dụ: vay vốn ngân hàng, xin việc, học bổng...)",
    staff: "Mục đích sử dụng giấy tờ?",
    citizen: "Bạn cần giấy này để làm gì ạ?",
    elderly: "Bạn cần giấy xác nhận để dùng làm gì ạ?",
    visitor: "Vui lòng cho biết mục đích sử dụng.",
  },
  academic_year: {
    student: "Bạn cần tra cứu cho năm học nào?",
    staff: "Năm học cần tra cứu?",
    citizen: "Năm học nào ạ?",
    elderly: "Bạn muốn tra cứu cho năm học nào ạ?",
    visitor: "Vui lòng cho biết năm học.",
  },
  policy_topic: {
    student: "Bạn muốn hỏi về quy định nào?",
    staff: "Chủ đề quy chế cần tra cứu?",
    citizen: "Bạn muốn hỏi về quy định gì ạ?",
    elderly: "Bạn muốn hỏi về quy định nào ạ?",
    visitor: "Vui lòng cho biết chủ đề cần tra cứu.",
  },
};

export function generateSlotQuestion(
  missingSlot: string,
  userType: UserType,
): string {
  const questions = SLOT_QUESTIONS_VI[missingSlot];
  if (questions) {
    return questions[userType] ?? questions.student;
  }

  const genericPrompt = getSlotPromptVi("university", missingSlot);
  const friendlyUserType = userType === "elderly" ? "ạ" : "";
  return `Bạn có thể cung cấp ${genericPrompt}${friendlyUserType}?`;
}

export function prioritizeMissingSlots(missingSlots: string[]): string[] {
  const priority: Record<string, number> = {
    student_id: 0,
    course_code: 1,
    semester: 2,
    academic_year: 3,
    purpose: 4,
    policy_topic: 5,
  };

  return [...missingSlots].sort((a, b) => (priority[a] ?? 99) - (priority[b] ?? 99));
}

export function mergeSlots(
  existing: Record<string, SlotValue>,
  newResults: Record<string, SlotValue>,
): Record<string, SlotValue> {
  const merged = { ...existing };
  for (const [key, value] of Object.entries(newResults)) {
    if (!merged[key] || value.confidence > (merged[key]?.confidence ?? 0)) {
      merged[key] = value;
    }
  }
  return merged;
}

export function shouldFillSlot(missingSlots: string[]): boolean {
  return missingSlots.length > 0;
}
