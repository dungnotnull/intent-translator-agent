# Slot Extraction Template

Extract all slots for intent: {intent_id}

Required slots: {required_slots}
Optional slots: {optional_slots}

User utterance: "{user_input}"

## Slots to extract:
{slot_descriptions}

## Vietnamese-specific patterns:
- Student ID: 8-10 digit numbers, often after "mã số", "MSSV"
- Semester: "kỳ 1", "kỳ 2", "HK1", "HK2", "học kỳ 1"
- Course code: uppercase letters + digits, e.g., "CS301", "MATH201"
- Dates: "hôm nay", "tuần sau", "tháng 9", "15/9/2024"
- Purposes: "vay vốn", "xin việc", "học bổng", "xuất cảnh"

Output as JSON. For each slot, provide:
- value: extracted value or null
- confidence: 0.0-1.0

Example output:
{
  "student_id": { "value": "20210001", "confidence": 0.95 },
  "semester": { "value": "HK1", "confidence": 0.85 }
}
