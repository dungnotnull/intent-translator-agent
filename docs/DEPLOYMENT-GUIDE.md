# Hướng dẫn Triển khai cho Bộ phận CNTT Trường Đại học

**Dành cho**: Cán bộ CNTT không chuyên về AI/ML
**Thời gian triển khai dự kiến**: 1 ngày
**Yêu cầu**: Máy chủ Ubuntu 22.04+ hoặc tương đương, 16GB RAM, 50GB disk

---

## 1. Chuẩn bị Môi trường

```bash
# Cài đặt Docker & Docker Compose
sudo apt update && sudo apt install -y docker.io docker-compose-v2

# Cài đặt Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Cài đặt Python 3.11+
sudo apt install -y python3.11 python3.11-venv python3-pip
```

## 2. Tải và Cấu hình

```bash
git clone <repo-url> /opt/intent-translator-agent
cd /opt/intent-translator-agent

# Tạo file cấu hình từ mẫu
cp .env.example .env
```

**Sửa file `.env`** — các biến bắt buộc:
```env
DEPLOYMENT_MODE=hybrid          # local | hybrid | cloud
ANTHROPIC_API_KEY=sk-ant-...    # Bắt buộc với hybrid/cloud
OFFLINE_MODE=false              # true nếu muốn chạy hoàn toàn offline
```

## 3. Tải Models ML (One-time)

```bash
# Cài Python dependencies
pip install -r requirements.txt

# Tải tất cả models (~2GB)
python src/ml/setup_models.py --domain university
```

## 4. Khởi động

```bash
# Cách 1: Docker Compose (khuyến nghị)
docker compose up -d

# Cách 2: Chạy thủ công
npm install
npm run build
python src/ml/intent-classifier/inference.py &
npm start
```

## 5. Kiểm tra

```bash
# Health check
curl http://localhost:3000/health

# Test chat
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"học phí kỳ này bao nhiêu","domain":"university"}'

# Admin dashboard
# Mở http://localhost:3000/admin trong trình duyệt
```

## 6. Cấu hình Trường

### Kết nối Hệ thống SIS (Student Information System)

Sửa URL API trong `.env`:
```env
UNIVERSITY_SIS_API_URL=http://your-sis-server:8080/api
UNIVERSITY_SIS_API_KEY=your-api-key
```

`src/routing/api-adapters/university-sis.ts` đã có sẵn cấu trúc adapter. Mỗi trường có thể customize phương thức `get`/`post` để khớp với API riêng.

### Thêm Intent Mới

1. Mở `src/routing/intent-registry.yaml`
2. Thêm intent mới:
```yaml
- id: YOUR_NEW_INTENT
  name: "Mô tả intent"
  examples:
    - "ví dụ câu hỏi 1"
    - "ví dụ câu hỏi 2"
  required_slots: [slot_name]
  route: your_route
```
3. Restart server — không cần retrain model

## 7. Troubleshooting

| Vấn đề | Giải pháp |
|--------|----------|
| ML server không khởi động | `pip install -r requirements.txt` và chạy lại `setup_models.py` |
| Redis không kết nối | `docker compose up redis -d` |
| Chat trả về chậm | Kiểm tra `ML_INFERENCE_URL` trong `.env` |
| Out of memory | Giảm `ANTHROPIC_MODEL` thành `claude-3-5-haiku` hoặc chuyển `DEPLOYMENT_MODE=local` |

---

## 8. Bảo trì Định kỳ

- **Hàng tuần**: Cập nhật knowledge base (tự động Monday 06:00 nếu dùng hybrid/cloud)
- **Mỗi học kỳ**: Cập nhật biểu học phí, quy chế mới trong `intent-registry.yaml`
- **Khi có quy chế mới**: Thêm PDF vào `docs/regulations/` và chạy lại `seedKnowledge()`
