# Hướng dẫn cho Chuyên viên Nghiệp vụ — Thêm Intent & Utterance

**Dành cho**: Cán bộ phòng đào tạo / chuyên viên nghiệp vụ — không cần biết code
**Mục đích**: Tự thêm intent mới, cập nhật câu hỏi mẫu mà không cần lập trình viên

---

## 1. Cấu trúc Intent

Mỗi intent định nghĩa một loại câu hỏi người dùng có thể hỏi:

```yaml
- id: QUERY_TUITION_SEMESTER       # Mã định danh (viết HOA, dùng _)
  name: "Tra cứu học phí theo kỳ"  # Tên hiển thị tiếng Việt
  examples:                        # Các cách người dùng có thể hỏi
    - "học phí kỳ này bao nhiêu"
    - "cho hỏi học phí HK2"
    - "tiền học kỳ này là mấy"
  required_slots: [student_id, semester]  # Thông tin bắt buộc
  route: university_sis.get_tuition       # API sẽ gọi
```

## 2. Cách Thêm Intent Mới

### Bước 1: Mở file
```
src/routing/intent-registry.yaml
```

### Bước 2: Copy mẫu dưới đây và dán vào cuối phần `intents:`

```yaml
  - id: YOUR_INTENT_ID
    name: "Tên intent bằng tiếng Việt"
    examples:
      - "cách hỏi 1"
      - "cách hỏi 2"
      - "cách hỏi 3"
      - "cách hỏi 4"
      - "cách hỏi 5"
    required_slots: []
    optional_slots: []
    route: knowledge_base.general_search
    confirmation_required: false
```

### Bước 3: Điền thông tin
- **YOUR_INTENT_ID**: Viết HOA, dùng `_` thay khoảng trắng. Format: `VERB_OBJECT_QUALIFIER`
  - VERB: `QUERY` (hỏi), `REGISTER` (đăng ký), `CANCEL` (hủy), `SCHEDULE` (đặt lịch)
  - Ví dụ: `QUERY_LIBRARY_HOURS`, `REGISTER_DORMITORY`, `SCHEDULE_ADVISOR_MEETING`
- **examples**: CÀNG NHIỀU CÀNG TỐT. Viết ≥ 5 cách khác nhau. Viết như sinh viên thực sự nói:
  - ✅ "học phí kỳ này bao nhiêu" (tự nhiên)
  - ✅ "cho em hỏi học phí với ạ" (lịch sự)
  - ✅ "học phí bao nhiêu tiền vậy" (thân mật)
  - ❌ "sinh viên muốn tra cứu thông tin học phí" (quá formal, không ai nói vậy)

### Bước 4: Lưu file và thông báo cho CNTT restart server

## 3. Các Slot (Thông tin cần thiết)

Slot là thông tin hệ thống cần để trả lời. Các slot có sẵn:

| Slot | Mô tả | Ví dụ |
|------|-------|-------|
| `student_id` | Mã số sinh viên | 20210001 |
| `semester` | Học kỳ | HK1, HK2, HK3 |
| `course_code` | Mã môn học | CS301, MATH201 |
| `academic_year` | Năm học | 2024-2025 |
| `purpose` | Mục đích | vay vốn, xin việc |
| `major` | Ngành học | CNTT, KHMT |
| `policy_topic` | Chủ đề quy chế | thi lại, cảnh báo |

Nếu intent mới cần slot mới, thêm vào `src/routing/slot-schemas/university.yaml`:

```yaml
  your_new_slot:
    type: string              # string | enum | date | number | free_text
    prompt_vi: "mô tả slot"  # Câu hỏi khi thiếu thông tin này
    example: "ví dụ"
```

## 4. Quy tắc Viết Examples Tốt

- **Đa dạng cách nói**: Mỗi người hỏi một kiểu, viết ít nhất 5 kiểu
- **Bao gồm tiếng lóng**: Sinh viên nói "học phí", "tiền học", "học phí", "đóng tiền"
- **Bao gồm lỗi chính tả phổ biến**: "dang ky", "hoc phi", "dang ki"
- **Bao gồm tiếng Anh pha trộn**: "tuition", "deadline", "register"
- **Viết như nói**: Không cần đúng ngữ pháp 100%, ưu tiên tự nhiên

## 5. Kiểm tra Intent Mới

Sau khi CNTT restart server:
1. Vào Admin Dashboard → tab "Intent Registry"
2. Tìm intent mới trong danh sách
3. Chat thử: gửi một trong các examples đã viết
4. Nếu trả lời sai → thêm examples đa dạng hơn

## 6. Cập nhật Intent Hiện Có

Muốn cải thiện intent đã có:
1. Tìm intent trong `intent-registry.yaml`
2. Thêm examples mới vào danh sách `examples:`
3. Lưu file, CNTT restart server
4. Hệ thống sẽ học từ examples mới trong lần retrain tiếp theo

---

**Cần hỗ trợ?** Liên hệ bộ phận CNTT — hoặc mở issue trên GitHub repository.
