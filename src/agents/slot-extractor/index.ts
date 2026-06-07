import type { Domain, SlotExtractionResult, SlotValue } from "../../types/index.js";
import { getRequiredSlots } from "../../routing/registry-loader.js";

export async function extractSlots(
  text: string,
  domain: Domain,
  intentId: string,
): Promise<SlotExtractionResult> {
  const filled: Record<string, SlotValue> = {};
  const uncertain: string[] = [];
  const errors: string[] = [];

  // Try calling the Python NER endpoint
  const mlUrl = process.env.ML_INFERENCE_URL || "http://localhost:8001";
  let mlEntities: { text: string; label: string; confidence: number }[] = [];

  try {
    const response = await fetch(`${mlUrl}/extract-entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, domain, intent: intentId }),
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const data = (await response.json()) as { entities: { text: string; label: string; confidence: number }[] };
      mlEntities = data.entities;
    }
  } catch {
    // Fall through to regex-based extraction
  }

  // Map ML entity labels to slot names
  for (const ent of mlEntities) {
    const slotName = mapEntityLabelToSlot(ent.label);
    if (slotName && !filled[slotName]) {
      filled[slotName] = { value: ent.text, confidence: ent.confidence, source: "ner" };
    }
  }

  // Run local regex extractors as supplement
  const regexExtracted = extractAllSlotsByRegex(text);
  for (const [slot, val] of Object.entries(regexExtracted)) {
    if (!filled[slot] || val.confidence > (filled[slot]?.confidence ?? 0)) {
      filled[slot] = val;
    }
  }

  // Apply defaults for slots with default values
  const requiredSlots = getRequiredSlots(domain, intentId);
  const allMissing = requiredSlots.filter((s) => !filled[s]);

  const defaultsFilled = tryDefaultSlots(allMissing);
  for (const [slot, val] of Object.entries(defaultsFilled)) {
    filled[slot] = val;
  }

  const stillMissing = requiredSlots.filter((s) => !filled[s]);

  return { filled, missing: stillMissing, uncertain, validation_errors: errors };
}

function mapEntityLabelToSlot(label: string): string | null {
  const mapping: Record<string, string> = {
    STUDENT_ID: "student_id",
    COURSE_CODE: "course_code",
    SEMESTER: "semester",
    ACADEMIC_YEAR: "academic_year",
    PURPOSE: "purpose",
    AMOUNT_VND: "amount",
    DATE: "date",
  };
  return mapping[label] ?? null;
}

function extractAllSlotsByRegex(text: string): Record<string, SlotValue> {
  const lower = text.toLowerCase();
  const result: Record<string, SlotValue> = {};

  // Student ID — context-aware first, then standalone
  const studentIdCtx = /(?:mã\s*(?:số|sinh\s*viên)|mssv|student\s*id)\s*[:#]?\s*(\d{8,10})/i.exec(text);
  if (studentIdCtx) {
    result["student_id"] = { value: studentIdCtx[1]!, confidence: 0.92, source: "ner" };
  } else {
    const studentIdBare = /\b(\d{8,10})\b/.exec(text);
    if (studentIdBare) {
      const val = studentIdBare[1]!;
      if (!val.startsWith("0") && parseInt(val) >= 20000000 && parseInt(val) <= 9999999999) {
        result["student_id"] = { value: val, confidence: 0.60, source: "ner" };
      }
    }
  }

  // Course code
  const courseCode = /\b([A-Z]{2,6}\d{3,4})\b/.exec(text);
  if (courseCode) {
    result["course_code"] = { value: courseCode[1]!.toUpperCase(), confidence: 0.85, source: "ner" };
  }

  // Academic year
  const academicYear = /(\d{4})\s*[-–]\s*(\d{4})/.exec(text);
  if (academicYear) {
    result["academic_year"] = { value: `${academicYear[1]}-${academicYear[2]}`, confidence: 0.92, source: "ner" };
  }

  // Semester — complex patterns
  const semesterPatterns: Array<{ regex: RegExp; value: string }> = [
    { regex: /\bhk1\b/i, value: "HK1" },
    { regex: /\bhọc\s*kỳ\s*1\b/i, value: "HK1" },
    { regex: /\bhọc\s*kì\s*1\b/i, value: "HK1" },
    { regex: /\bkỳ\s*1\b/i, value: "HK1" },
    { regex: /\bky\s*1\b/i, value: "HK1" },
    { regex: /\bhk2\b/i, value: "HK2" },
    { regex: /\bhọc\s*kỳ\s*2\b/i, value: "HK2" },
    { regex: /\bhọc\s*kì\s*2\b/i, value: "HK2" },
    { regex: /\bkỳ\s*2\b/i, value: "HK2" },
    { regex: /\bky\s*2\b/i, value: "HK2" },
    { regex: /\bhk3\b/i, value: "HK3" },
    { regex: /\bhọc\s*kỳ\s*3\b/i, value: "HK3" },
  ];
  for (const { regex, value } of semesterPatterns) {
    if (regex.test(lower)) {
      result["semester"] = { value, confidence: 0.92, source: "ner" };
      break;
    }
  }

  // Purpose
  const purposes: Array<{ kw: string }> = [
    { kw: "học bổng" }, { kw: "vay vốn" }, { kw: "xin việc" },
    { kw: "xuất cảnh" }, { kw: "ngân hàng" }, { kw: "xin visa" },
  ];
  for (const { kw } of purposes) {
    if (lower.includes(kw)) {
      result["purpose"] = { value: kw, confidence: 0.82, source: "ner" };
      break;
    }
  }

  return result;
}

function tryDefaultSlots(missing: string[]): Record<string, SlotValue> {
  const result: Record<string, SlotValue> = {};
  for (const slot of missing) {
    if (slot === "semester") {
      result[slot] = { value: resolveCurrentSemester(), confidence: 0.50, source: "default" };
    } else if (slot === "academic_year") {
      result[slot] = { value: resolveCurrentAcademicYear(), confidence: 0.50, source: "default" };
    }
  }
  return result;
}

export function resolveCurrentSemester(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  if (month >= 8 && month <= 12) return "HK1";
  if (month >= 1 && month <= 5) return "HK2";
  return "HK3";
}

export function resolveCurrentAcademicYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() + 1 >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}
