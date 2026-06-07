# PROJECT-detail.md — intent-translator-agent

**Full Technical Specification**
Version: 1.0.0 | Last Updated: 2025-06
Status: Pre-Development → Design Finalized

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Solution Architecture](#3-solution-architecture)
4. [ML/DL Model Specifications](#4-mldl-model-specifications)
5. [Intent Registry Design](#5-intent-registry-design)
6. [Component Specifications](#6-component-specifications)
7. [Slot Schema System](#7-slot-schema-system)
8. [Business Process Routing](#8-business-process-routing)
9. [Voice Pipeline](#9-voice-pipeline)
10. [Multi-turn Dialogue Management](#10-multi-turn-dialogue-management)
11. [Data Flow (E2E)](#11-data-flow-e2e)
12. [API & Interface Design](#12-api--interface-design)
13. [Deployment Modes](#13-deployment-modes)
14. [Self-Learning Knowledge System](#14-self-learning-knowledge-system)
15. [Security & Privacy](#15-security--privacy)
16. [Performance Targets](#16-performance-targets)
17. [Risks & Mitigations](#17-risks--mitigations)
18. [Success Metrics](#18-success-metrics)

---

## 1. Project Overview

### 1.1 Name & Tagline
**intent-translator-agent** — *"Trợ lý chuyển đổi ý chí tự nhiên thành quy trình nghiệp vụ"*
The invisible bridge between a non-technical user's natural words and the institutional systems that serve them.

### 1.2 Target Users

**End Users (the humans who speak to the system):**
- Students with no technical background asking about tuition, courses, academic regulations
- Citizens interacting with government services who don't know procedure names
- Elderly users who struggle with digital forms and structured interfaces
- Staff making internal HR or administrative queries

**System Operators (the institutions deploying the agent):**
- University administrative offices (Student Affairs, Academic Affairs, Finance)
- Local government public service centers (bộ phận một cửa)
- Hospital/clinic intake and administrative departments
- Enterprise HR/IT helpdesk departments

### 1.3 Core Value Proposition

**The Problem in One Sentence**: Institutional digital systems require users to navigate menus, know procedure names, and fill structured forms — but most users just want to say what they need in plain language.

**The Solution in One Sentence**: This agent makes every institutional system as easy to use as talking to a knowledgeable colleague.

### 1.4 The Three Non-Negotiables
1. **Privacy-first**: For government and educational institutions, all classification must run locally. No student query about their academic record goes to a third-party cloud by default.
2. **Vietnamese-first**: Unlike most NLU systems trained primarily on English, this agent treats Vietnamese as the primary language with full linguistic support.
3. **Graceful failure**: When the agent doesn't understand, it asks one simple clarifying question — it never shows an error screen.

---

## 2. Problem Statement

### 2.1 The Non-Technical User's Digital Barrier

Current institutional digital systems present multiple layers of friction:

```
User wants: "Học phí của tôi học kỳ này là bao nhiêu?"
Current reality:
  1. Navigate to correct website (which one?)
  2. Find the right menu (often buried 3 levels deep)
  3. Know the name of the procedure ("Tra cứu thông tin tài chính sinh viên")
  4. Log in with student ID + password (forgotten)
  5. Navigate to the correct module
  6. Select semester from dropdown (know the semester code: "HK1_2024-2025")
  7. Read confusing table output
```

**With intent-translator-agent:**
```
User says: "học phí kỳ này của tao bao nhiêu vậy?"
Agent responds: "Học kỳ 1 năm học 2024-2025, bạn cần đóng 12.500.000 đồng, 
               hạn nộp ngày 15/9/2024. Bạn có muốn biết thêm gì không?"
```

### 2.2 Why Existing Solutions Fall Short

| Solution | Gap |
|----------|-----|
| Chatbot với kịch bản cứng (button-based) | Không hiểu ngôn ngữ tự nhiên; chỉ hoạt động với user đã biết cách dùng |
| Generic LLM (GPT, Claude direct) | Không biết chính sách thực tế của từng trường/cơ quan; không kết nối hệ thống; không đảm bảo quyền riêng tư |
| Traditional NLU (Rasa, Dialogflow) | Cần nhiều labeled data; Vietnamese support yếu; requires ML expertise to maintain |
| Rule-based keyword matching | Fails on Vietnamese synonyms, tone variations, colloquialisms |
| FAQ chatbot | Can answer questions but cannot execute processes (register, calculate, retrieve) |

### 2.3 The Vietnamese Language Challenge

Vietnamese NLU is significantly harder than English due to:
- **Tonal complexity**: 6 tones; "ma" (ghost), "má" (mother), "mà" (but), "mả" (tomb), "mã" (code), "mạ" (rice seedling) — same base, different meaning
- **No word boundaries in speech**: ASR transcriptions run words together
- **Regional dialects**: Northern (Hà Nội), Central (Huế), Southern (TP.HCM) — significantly different vocabulary and pronunciation
- **Formality registers**: Very formal (văn phòng), casual (sinh viên với nhau), informal (teen slang)
- **Code-switching**: Young users mix Vietnamese and English: "học kỳ này tôi cần register mấy môn?"

---

## 3. Solution Architecture

### 3.1 High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                        INPUT LAYER                                    │
│   Voice (Microphone)  │  Chat Widget  │  Telegram Bot  │  API Call   │
│         ↓                    ↓               ↓              ↓         │
│              ASR (Whisper/Google STT — optional)                      │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  Raw text (may have noise/typos/tones)
┌─────────────────────────────▼────────────────────────────────────────┐
│                    INPUT NORMALIZER                                    │
│  • Remove filler words (ừm, à, ấy là, thì)                           │
│  • Tone normalization (Telex/VNI → Unicode NFC)                       │
│  • Domain spell correction (course codes, faculty names)              │
│  • Language detection (VI / EN / mixed)                               │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  Cleaned text
┌─────────────────────────────▼────────────────────────────────────────┐
│                 TWO-STAGE INTENT CLASSIFIER                            │
│                                                                        │
│  Stage 1: Local SLM (PhoBERT / mE5-small)                             │
│    → confidence ≥ 0.75: proceed                                        │
│    → confidence < 0.75: escalate to Stage 2                            │
│                                                                        │
│  Stage 2: LLM Fallback (Claude API / Ollama llama3.1)                 │
│    → Few-shot prompt with intent registry                              │
│    → Always returns a result (or CLARIFY_NEEDED)                      │
└────────────────┬────────────────────────────────────────────────────┘
                 │  IntentResult: { intent, confidence, sub_intents[] }
┌────────────────▼────────────────────────────────────────────────────┐
│              SLOT EXTRACTOR + VALIDATOR                               │
│                                                                       │
│  • Vietnamese NER (underthesea + PhoBERT-NER)                         │
│  • Date/time parser (relative + absolute + lunar calendar)            │
│  • Domain entity validator (course code format, ID format)            │
│  • Output: FilledSlots + MissingRequiredSlots                         │
└────────────────┬────────────────────────────────────────────────────┘
                 │
    ┌────────────┴─────────────┐
    │ All required slots        │ Missing required slots
    │ filled?                   │
    │ YES                       │ NO
    ▼                           ▼
┌───────────┐         ┌────────────────────────┐
│  PROCESS  │         │   SLOT FILLER          │
│  ROUTER   │         │   (Multi-turn dialogue) │
│           │         │   Ask for missing slot  │
│ Intent →  │         │   in plain language     │
│ API/Agent │◄────────┤   → loop back to extractor
└─────┬─────┘         └────────────────────────┘
      │ API/Agent response (JSON/structured)
┌─────▼─────────────────────────────────────────────────────────────┐
│              RESPONSE HUMANIZER                                    │
│  JSON → Natural Vietnamese/English sentence                        │
│  Calibrated to: user type, formality, conversational context       │
└─────────────────────────────────────────────────────────────────-─┘
                              │
                    Plain language response
                    to user (text or TTS)
```

### 3.2 Deployment Topology

```
┌──────────────────────────────────────────────────────┐
│                  Institutional Server                 │
│  (On-premises — no internet required for core NLU)   │
│                                                       │
│  ┌─────────────────┐    ┌──────────────────────────┐  │
│  │  Node.js Agent  │───▶│  Python ML Sidecar       │  │
│  │  (Orchestrator) │    │  FastAPI on :8001         │  │
│  │  Port 3000      │    │  • PhoBERT classifier    │  │
│  └────────┬────────┘    │  • underthesea NER        │  │
│           │             │  • Date parser            │  │
│  ┌────────▼────────┐    │  • Whisper ASR (optional) │  │
│  │  Redis          │    └──────────────────────────┘  │
│  │  (Session store)│                                   │
│  └─────────────────┘    ┌──────────────────────────┐  │
│                         │  ChromaDB                │  │
│  Internal APIs:         │  (Knowledge base vector) │  │
│  ├── Student Info Sys.  └──────────────────────────┘  │
│  ├── Finance System                                    │
│  └── Academic Registry                                 │
└──────────────────────────────────────────────────────┘
         │ (only for LLM fallback — optional)
         ▼
   Claude API / Ollama
   (Internet or local)
```

---

## 4. ML/DL Model Specifications

### 4.1 Intent Classifier — Stage 1 (Local SLM)

#### Option A: PhoBERT Fine-tuned Classifier (Vietnamese-first)

**Model**: `vinai/phobert-base-v2`
**Task**: Multi-class text classification (N intents)
**Fine-tuning framework**: HuggingFace `Trainer` API + SetFit for few-shot

**Architecture:**
```python
from transformers import AutoTokenizer, AutoModelForSequenceClassification

tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base-v2")
model = AutoModelForSequenceClassification.from_pretrained(
    "vinai/phobert-base-v2",
    num_labels=len(intent_classes)
)
```

**Training Data Requirements:**
- Minimum: 20 examples per intent class (SetFit approach)
- Recommended: 64-128 examples per intent class (full fine-tuning)
- Format: `{ "text": "học phí kỳ này bao nhiêu", "label": "QUERY_TUITION_SEMESTER" }`

**Data Augmentation Strategy (to multiply training data):**
```python
# Paraphrase generation using LLM to expand 20 examples → 200
# Examples of augmentation for "QUERY_TUITION_SEMESTER":
# Original: "học phí học kỳ này là bao nhiêu?"
# Augmented:
# - "tôi cần biết tiền học kỳ 1 là mấy"
# - "kỳ này đóng bao nhiêu tiền học phí vậy"
# - "cho hỏi học phí HK1 2024 tổng cộng là bao tiền"
# - "mình chưa biết học phí kỳ này, giúp tôi với"
# - "học phí kỳ này của tôi"  (informal, short)
```

**Inference Performance:**
- CPU (Intel i5): ~80ms per classification
- GPU (NVIDIA T4): ~15ms per classification
- Memory: 500MB RAM (model loaded)

#### Option B: SetFit with multilingual-e5-small (Multilingual / Low-data)

**Use when**: Domain has < 20 examples per intent OR needs to add new intents on-the-fly

```python
from setfit import SetFitModel, Trainer, TrainingArguments
from datasets import Dataset

# Works with as few as 8 examples per class
model = SetFitModel.from_pretrained("intfloat/multilingual-e5-small")

train_dataset = Dataset.from_dict({
    "text": training_texts,
    "label": training_labels
})

trainer = Trainer(
    model=model,
    args=TrainingArguments(num_epochs=1, batch_size=16),
    train_dataset=train_dataset,
)
trainer.train()
```

**Key Advantage**: Adding a new intent = add 5-10 examples + retrain in 2 minutes on CPU. No GPU needed.

#### Inference Server

```python
# src/ml/intent-classifier/inference.py
from fastapi import FastAPI
from pydantic import BaseModel
import torch

app = FastAPI()
model = load_finetuned_model()

class ClassifyRequest(BaseModel):
    text: str
    domain: str  # "university" | "government" | "healthcare"
    top_k: int = 3

@app.post("/classify")
async def classify(req: ClassifyRequest):
    result = model.predict(req.text, domain=req.domain, top_k=req.top_k)
    return {
        "intent": result.top_intent,
        "confidence": result.top_score,
        "alternatives": result.alternatives,
        "model_version": MODEL_VERSION
    }
```

### 4.2 Vietnamese NER (Slot Extraction)

**Primary Tool**: `underthesea` — the standard Vietnamese NLP library

```python
from underthesea import ner

text = "Sinh viên Nguyễn Văn An mã số 20210001 hỏi về học phí ngành CNTT kỳ 2"
entities = ner(text)
# Output:
# [('Sinh viên', 'O'), ('Nguyễn Văn An', 'B-PER'), 
#  ('20210001', 'B-STUDENT_ID'), ('CNTT', 'B-MAJOR'),
#  ('kỳ 2', 'B-SEMESTER')]
```

**Custom Entity Types (domain-specific, extend underthesea):**
- `STUDENT_ID` — pattern: 8-10 digits, e.g., "20210001"
- `COURSE_CODE` — pattern: alpha+numeric, e.g., "CS101", "CNTT1234"
- `FACULTY_NAME` — lookup against domain dictionary
- `SEMESTER` — "kỳ 1", "kỳ 2", "HK1", "học kỳ 1/2024"
- `ACADEMIC_YEAR` — "năm học 2024-2025", "2024-25", "năm nay"
- `AMOUNT_VND` — "5 triệu", "500k", "5.000.000 đồng"
- `PROCEDURE_NAME` — lookup against domain dictionary

**Vietnamese Date/Time Parser:**
```python
# src/ml/slot-extractor/date_parser.py
RELATIVE_DATE_PATTERNS = {
    "hôm nay": lambda: today(),
    "hôm qua": lambda: today() - 1,
    "ngày mai": lambda: today() + 1,
    "tuần sau": lambda: today() + 7,
    "tuần trước": lambda: today() - 7,
    "tháng sau": lambda: next_month(),
    "tháng này": lambda: current_month(),
    "học kỳ này": lambda: current_semester(),
    "học kỳ tới": lambda: next_semester(),
    "năm học này": lambda: current_academic_year(),
    "kỳ 1": lambda year: Semester(1, year or current_year()),
    "kỳ 2": lambda year: Semester(2, year or current_year()),
}
```

### 4.3 Semantic Search for Knowledge Base

**Model**: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`
- 118M parameters, supports Vietnamese
- Used for: finding relevant KB entries for LLM context injection
- ChromaDB vector store: 5ms query time for < 10,000 entries

### 4.4 Model Registry & Versioning

```yaml
# src/ml/model-registry.yaml
models:
  intent_classifier:
    domain: university
    model_type: phobert_setfit
    version: "1.2.0"
    path: "src/ml/intent-classifier/models/university-v1.2.0"
    accuracy: 0.923
    intents_count: 24
    training_examples: 1847
    last_trained: "2025-06-01"

  ner:
    model_type: underthesea_extended
    version: "1.0.0"
    custom_entities: ["STUDENT_ID", "COURSE_CODE", "FACULTY_NAME", "SEMESTER"]

  embeddings:
    model_type: multilingual_minilm
    version: "paraphrase-multilingual-MiniLM-L12-v2"
    use_for: ["kb_search", "intent_similarity"]
```

---

## 5. Intent Registry Design

### 5.1 Intent Naming Convention

Format: `VERB_OBJECT_QUALIFIER`
- VERB: action the user wants (`QUERY`, `REGISTER`, `CANCEL`, `UPDATE`, `SUBMIT`, `CALCULATE`, `SCHEDULE`)
- OBJECT: target of the action (`TUITION`, `COURSE`, `DOCUMENT`, `APPOINTMENT`, `STATUS`, `POLICY`)
- QUALIFIER: additional specificity (optional) (`SEMESTER`, `DEADLINE`, `REFUND`, `NEW`, `EXISTING`)

### 5.2 University Domain Intent Registry

```yaml
# src/routing/intent-registry.yaml (university domain)
domain: university
version: "1.0.0"

intents:
  # ─── TUITION & FINANCE ───────────────────────────────────────
  - id: QUERY_TUITION_SEMESTER
    name: "Tra cứu học phí theo học kỳ"
    examples:
      - "học phí kỳ này bao nhiêu"
      - "tôi cần biết tiền học kỳ 1 là bao nhiêu"
      - "cho hỏi học phí HK2 tổng cộng là bao tiền"
      - "tuition this semester how much"
      - "học phí ngành CNTT năm 3 là bao nhiêu"
    required_slots: [student_id, semester]
    optional_slots: [academic_year]
    route: university_sis.get_tuition
    confirmation_required: false

  - id: QUERY_TUITION_DEADLINE
    name: "Hỏi hạn nộp học phí"
    examples:
      - "khi nào phải đóng học phí"
      - "hạn nộp học phí kỳ này là ngày mấy"
      - "deadline đóng tiền học là bao giờ"
    required_slots: [semester]
    optional_slots: [student_id]
    route: university_sis.get_tuition_deadline
    confirmation_required: false

  - id: QUERY_TUITION_DISCOUNT
    name: "Hỏi về học bổng/miễn giảm học phí"
    examples:
      - "tôi có được giảm học phí không"
      - "điều kiện xét học bổng là gì"
      - "tôi thuộc diện chính sách, được giảm bao nhiêu"
      - "scholarship conditions"
    required_slots: [student_id]
    optional_slots: [scholarship_type]
    route: university_sis.get_scholarship_info
    confirmation_required: false

  # ─── COURSE REGISTRATION ─────────────────────────────────────
  - id: REGISTER_COURSE_NEW
    name: "Đăng ký môn học"
    examples:
      - "tôi muốn đăng ký môn lập trình web"
      - "đăng ký học CS301 được không"
      - "cho tôi đăng ký thêm môn kỳ này"
      - "register for web programming course"
    required_slots: [student_id, course_code, semester]
    optional_slots: [class_section]
    route: university_sis.register_course
    confirmation_required: true  # Confirm before executing
    confirmation_message: "Bạn muốn đăng ký môn {course_name} ({course_code}), học kỳ {semester}?"

  - id: CANCEL_COURSE_REGISTRATION
    name: "Hủy đăng ký môn học"
    examples:
      - "tôi muốn hủy đăng ký môn toán"
      - "drop môn MATH201"
      - "rút môn học kỳ này"
    required_slots: [student_id, course_code, semester]
    route: university_sis.cancel_course
    confirmation_required: true

  - id: QUERY_COURSE_SCHEDULE
    name: "Tra cứu lịch học"
    examples:
      - "lịch học tuần sau của tôi như thế nào"
      - "môn lập trình học vào thứ mấy"
      - "thời khóa biểu kỳ này của tôi"
      - "my schedule next week"
    required_slots: [student_id]
    optional_slots: [week, course_code]
    route: university_sis.get_schedule

  # ─── ACADEMIC INFORMATION ────────────────────────────────────
  - id: QUERY_GRADUATION_REQUIREMENTS
    name: "Hỏi điều kiện tốt nghiệp"
    examples:
      - "tôi cần hoàn thành bao nhiêu tín chỉ để tốt nghiệp"
      - "điều kiện xét tốt nghiệp ngành CNTT là gì"
      - "graduation requirements for my major"
      - "tôi còn thiếu môn nào để ra trường"
    required_slots: [student_id]
    optional_slots: [major]
    route: university_sis.get_graduation_requirements

  - id: QUERY_ACADEMIC_TRANSCRIPT
    name: "Xem bảng điểm"
    examples:
      - "bảng điểm của tôi"
      - "điểm các môn tôi học kỳ trước"
      - "my transcript"
      - "GPA của tôi là bao nhiêu"
    required_slots: [student_id]
    optional_slots: [semester, academic_year]
    route: university_sis.get_transcript

  - id: QUERY_ACADEMIC_POLICY
    name: "Hỏi quy chế học vụ"
    examples:
      - "quy định về điểm thi lại là gì"
      - "sinh viên bị đình chỉ khi nào"
      - "academic probation rules"
      - "quy chế học vụ về nghỉ học"
      - "thi lại được mấy lần"
    required_slots: []
    optional_slots: [policy_topic]
    route: knowledge_base.query_policy
    # This routes to KB search, not a SIS API

  # ─── DOCUMENTS & PROCEDURES ──────────────────────────────────
  - id: REQUEST_DOCUMENT_ENROLLMENT
    name: "Xin giấy xác nhận sinh viên"
    examples:
      - "tôi cần giấy xác nhận đang học"
      - "xin giấy sinh viên để vay vốn ngân hàng"
      - "enrollment certificate request"
    required_slots: [student_id, purpose]
    optional_slots: [copies_count, pickup_date]
    route: university_sis.request_document
    confirmation_required: true

  - id: QUERY_DOCUMENT_STATUS
    name: "Kiểm tra trạng thái hồ sơ/giấy tờ"
    examples:
      - "giấy tờ tôi nộp hôm qua đã xử lý chưa"
      - "tình trạng đơn xin phép nghỉ học của tôi"
      - "status of my leave application"
    required_slots: [student_id]
    optional_slots: [document_type, submission_date]
    route: university_sis.get_document_status

  # ─── CATCH-ALL ───────────────────────────────────────────────
  - id: QUERY_GENERAL_INFO
    name: "Hỏi thông tin chung"
    examples:
      - "văn phòng khoa mở cửa mấy giờ"
      - "phòng thi ở đâu"
      - "lịch nghỉ tết năm nay"
    required_slots: []
    route: knowledge_base.general_search

  - id: CLARIFY_NEEDED
    name: "Cần làm rõ ý định"
    description: "Used when confidence < 0.65 or utterance is completely ambiguous"
    route: dialogue_manager.ask_clarification
```

### 5.3 Confidence Routing Logic

```typescript
function routeByConfidence(classificationResult: ClassificationResult): RoutingDecision {
  const { intent, confidence } = classificationResult;

  if (confidence >= 0.85) {
    return { action: 'EXECUTE', intent };
  } else if (confidence >= 0.65) {
    // Confirm intent before executing
    return { 
      action: 'CONFIRM_INTENT',
      message: `Bạn muốn ${INTENT_DESCRIPTIONS[intent]}, đúng không?`
    };
  } else {
    // Ask clarifying question
    return {
      action: 'CLARIFY',
      message: generateClarifyQuestion(classificationResult)
    };
  }
}
```

---

## 6. Component Specifications

### 6.1 Input Normalizer (`src/agents/input-normalizer/`)

**Processing Pipeline:**
```
Raw text
  ↓
1. Unicode normalization (NFC — proper Vietnamese diacritics)
2. Filler word removal: "ừm", "à", "ấy là", "thì", "ừ", "ơi"
3. Sentence boundary detection (split compound utterances)
4. Language detection (Vietnamese / English / mixed)
5. Domain-specific spell correction:
   - "học phi" → "học phí" (tone correction)
   - "dang ky" → "đăng ký" (missing diacritics, common in mobile input)
   - "CNTT" → keep as is (valid acronym)
   - "cs301" → "CS301" (normalize course codes to uppercase)
6. Number normalization: "5 triệu" → "5000000", "500k" → "500000"
→ Normalized text + metadata { language, original_text, corrections_made }
```

**Telex/VNI Conversion:**
```python
# Handle users who type without Vietnamese keyboard
# "hoc phi ky nay bao nhieu" (no diacritics) 
# → detect as likely Vietnamese without diacritics
# → apply tone-less Vietnamese tokenization path
# OR pass to LLM with note: "text may be Vietnamese without diacritics"
```

### 6.2 Two-Stage Intent Classifier (`src/agents/intent-classifier/`)

**Stage 1 — Local SLM:**
```typescript
async function classifyLocalSLM(
  text: string, 
  domain: string
): Promise<ClassificationResult> {
  const response = await fetch('http://localhost:8001/classify', {
    method: 'POST',
    body: JSON.stringify({ text, domain, top_k: 3 })
  });
  const result = await response.json();
  
  return {
    intent: result.intent,
    confidence: result.confidence,
    alternatives: result.alternatives,
    source: 'local_slm'
  };
}
```

**Stage 2 — LLM Fallback:**
```typescript
async function classifyLLMFallback(
  text: string,
  domain: string,
  localResult: ClassificationResult
): Promise<ClassificationResult> {
  // Inject: intent registry + few-shot examples + local model's best guess
  const prompt = buildFallbackPrompt(text, domain, intentRegistry, localResult);
  
  const response = await llmClient.complete(prompt, {
    temperature: 0.1,  // Deterministic for classification
    maxTokens: 200,    // Just the JSON output
  });
  
  return parseClassificationJSON(response);
}
```

**Multi-Intent Detection:**
```typescript
// "Tôi muốn biết học phí VÀ đăng ký môn học" → two intents
function detectMultiIntent(text: string, result: ClassificationResult): Intent[] {
  const conjunctions = ['và', 'với', 'cùng', 'thêm', 'nữa', 'also', 'and'];
  const hasConjunction = conjunctions.some(c => text.includes(c));
  
  if (hasConjunction && result.alternatives[0].confidence > 0.60) {
    return [result.intent, result.alternatives[0].intent];
  }
  return [result.intent];
}
```

### 6.3 Slot Extractor + Validator (`src/agents/slot-extractor/`)

**Extraction Pipeline:**
```typescript
interface SlotExtractionResult {
  filled: Record<string, SlotValue>;
  missing: string[];          // Required slots not found
  uncertain: string[];        // Slots extracted with low confidence
  validation_errors: string[]; // Invalid values (e.g., non-existent course code)
}

async function extractSlots(
  text: string,
  intentSchema: IntentSchema
): Promise<SlotExtractionResult> {
  // 1. Run Vietnamese NER (Python subprocess call to underthesea)
  const nerEntities = await runNER(text);
  
  // 2. Map NER entities to intent slot schema
  const mappedSlots = mapEntitiesToSlots(nerEntities, intentSchema);
  
  // 3. Run date/time parser for temporal slots
  const temporalSlots = parseTemporalExpressions(text);
  
  // 4. Validate extracted values against domain constraints
  const validationResult = await validateSlots({...mappedSlots, ...temporalSlots}, intentSchema);
  
  // 5. Return filled, missing, uncertain
  return buildExtractionResult(validationResult, intentSchema.required_slots);
}
```

**Slot Validation Examples:**
```typescript
const SLOT_VALIDATORS = {
  student_id: (value: string) => /^\d{8,10}$/.test(value),
  course_code: async (value: string) => await courseCodeExists(value),
  semester: (value: string) => VALID_SEMESTERS.includes(normalizeSemester(value)),
  amount_vnd: (value: number) => value > 0 && value < 1_000_000_000,
};
```

### 6.4 Multi-Turn Slot Filler (`src/agents/slot-filler/`)

**Design Principle**: Ask for one missing slot at a time, in plain language. Never show a form.

```typescript
function generateSlotQuestion(
  missingSlot: string,
  intentContext: string,
  userType: UserType
): string {
  const SLOT_QUESTIONS: Record<string, Record<UserType, string>> = {
    student_id: {
      student: "Bạn cho mình biết mã số sinh viên của bạn nhé?",
      staff: "Vui lòng cung cấp mã sinh viên cần tra cứu.",
      elderly: "Bạn có thể cho biết số thẻ sinh viên không ạ?"
    },
    semester: {
      student: "Bạn hỏi về học kỳ nào vậy? Kỳ 1 hay kỳ 2 năm nay?",
      staff: "Học kỳ cần tra cứu?",
      elderly: "Bạn muốn biết học kỳ nào, kỳ 1 hay kỳ 2 ạ?"
    },
    course_code: {
      student: "Bạn muốn đăng ký môn gì? Cho mình biết tên hoặc mã môn học nhé.",
      staff: "Mã môn học?",
      elderly: "Môn học tên gì vậy bạn?"
    },
    purpose: {
      student: "Giấy xác nhận này dùng để làm gì? (ví dụ: vay vốn ngân hàng, xin việc, học bổng...)",
      elderly: "Bạn cần giấy xác nhận để dùng làm gì ạ?"
    }
  };
  
  return SLOT_QUESTIONS[missingSlot]?.[userType] ?? 
         `Bạn có thể cung cấp thêm thông tin về ${SLOT_DISPLAY_NAMES[missingSlot]}?`;
}
```

### 6.5 Process Router (`src/agents/process-router/`)

**Routing Table Execution:**
```typescript
async function executeRoute(
  intent: string,
  slots: Record<string, SlotValue>,
  userContext: UserContext
): Promise<RouteResult> {
  
  const route = intentRegistry.getRoute(intent);
  
  // 1. Check if confirmation required
  if (route.confirmation_required && !userContext.confirmed) {
    return {
      type: 'CONFIRMATION_REQUIRED',
      message: fillTemplate(route.confirmation_message, slots)
    };
  }
  
  // 2. Authentication check for sensitive routes
  if (route.requires_auth && !userContext.authenticated) {
    return {
      type: 'AUTH_REQUIRED',
      message: "Bạn cần đăng nhập để thực hiện thao tác này."
    };
  }
  
  // 3. Execute the route
  try {
    const adapter = getAdapter(route.adapter);
    const apiResult = await adapter.execute(route.method, slots);
    return { type: 'SUCCESS', data: apiResult };
  } catch (error) {
    return handleRouteError(error, intent, route);
  }
}
```

**Error Handling — User-Friendly:**
```typescript
function handleRouteError(error: Error, intent: string, route: Route): RouteResult {
  if (error.type === 'NOT_FOUND') {
    return {
      type: 'USER_ERROR',
      message: generateNotFoundMessage(intent),  // "Không tìm thấy thông tin. Có thể mã sinh viên chưa đúng?"
    };
  }
  if (error.type === 'SERVICE_UNAVAILABLE') {
    return {
      type: 'SYSTEM_ERROR',
      message: "Hệ thống đang bận, bạn vui lòng thử lại sau 5 phút hoặc liên hệ phòng đào tạo: 028.xxxx.xxxx",
      fallback: { phone: OFFICE_PHONE, location: OFFICE_LOCATION, hours: OFFICE_HOURS }
    };
  }
}
```

### 6.6 Response Humanizer (`src/agents/response-humanizer/`)

**JSON-to-Natural-Language Templates:**
```typescript
// Template system for common response types
const RESPONSE_TEMPLATES = {
  QUERY_TUITION_SEMESTER: (data: TuitionData) => `
    Học kỳ ${data.semester_name}, bạn cần đóng ${formatVND(data.amount)}.
    Hạn nộp: ${formatDate(data.deadline)}.
    ${data.paid ? '✅ Bạn đã đóng học phí rồi.' : '⚠️ Bạn chưa đóng học phí.'}
    ${data.discount > 0 ? `Bạn được giảm ${formatVND(data.discount)} (${data.discount_reason}).` : ''}
  `,
  
  REGISTER_COURSE_NEW: (data: RegistrationData) => 
    data.success 
      ? `Đăng ký thành công môn ${data.course_name} (${data.course_code})! Lịch học: ${data.schedule}.`
      : `Không thể đăng ký môn ${data.course_name}. Lý do: ${REASON_VI[data.error_code]}.`,
      
  QUERY_ACADEMIC_POLICY: (data: PolicyData) => `
    ${data.policy_text}
    📎 Nguồn: ${data.source}, cập nhật ${formatDate(data.last_updated)}.
  `
};

function formatVND(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = Math.floor(amount / 1_000_000);
    const remainder = amount % 1_000_000;
    if (remainder === 0) return `${millions} triệu đồng`;
    return `${millions} triệu ${formatVND(remainder)}`;
  }
  return `${amount.toLocaleString('vi-VN')} đồng`;
}
```

---

## 7. Slot Schema System

### 7.1 Schema Definition Format

```yaml
# src/routing/slot-schemas/university.yaml

slots:
  student_id:
    type: string
    pattern: "^\\d{8,10}$"
    prompt_vi: "mã số sinh viên"
    prompt_en: "student ID"
    example: "20210001"
    privacy: true  # Never echo back in plain text logs

  semester:
    type: enum
    values: ["HK1", "HK2", "HK3"]
    aliases:
      "kỳ 1": "HK1"
      "kỳ 2": "HK2"
      "học kỳ 1": "HK1"
      "học kỳ 2": "HK2"
      "semester 1": "HK1"
    prompt_vi: "học kỳ"
    default: "current_semester()"  # Auto-fill if not specified

  academic_year:
    type: string
    pattern: "^\\d{4}-\\d{4}$"
    prompt_vi: "năm học"
    example: "2024-2025"
    default: "current_academic_year()"

  course_code:
    type: string
    pattern: "^[A-Z]{2,6}\\d{3,4}$"
    prompt_vi: "mã môn học"
    example: "CS301"
    validate_against: "course_catalog_api"  # Check if course exists

  purpose:
    type: free_text
    max_length: 200
    prompt_vi: "mục đích sử dụng giấy tờ"
    examples: ["vay vốn ngân hàng", "xin việc làm", "học bổng", "xuất cảnh"]
```

### 7.2 Slot Inheritance

Slots defined once can be inherited across intents and extended:
```yaml
intents:
  QUERY_TUITION_SEMESTER:
    inherits_slots: [student_id, semester]
    
  QUERY_TUITION_DEADLINE:
    inherits_slots: [semester]
    # student_id is optional here (deadline is same for everyone)
```

---

## 8. Business Process Routing

### 8.1 API Adapter Pattern

Each institutional system gets a typed adapter:
```typescript
// src/routing/api-adapters/university-sis.ts
export class UniversitySISAdapter {
  constructor(private config: SISConfig) {}
  
  async get_tuition(slots: { student_id: string; semester: string }): Promise<TuitionData> {
    // Translate normalized slot values → SIS-specific API parameters
    const response = await this.config.httpClient.get('/api/tuition', {
      params: {
        studentCode: slots.student_id,  // SIS uses 'studentCode', not 'student_id'
        termId: SEMESTER_TO_TERM_ID[slots.semester],  // Map HK1 → 20241
      }
    });
    
    // Normalize SIS response → standard schema
    return {
      amount: response.data.tongHocPhi,
      deadline: parseDate(response.data.hanNop),
      paid: response.data.daThanhToan,
      discount: response.data.giamTru ?? 0,
      semester_name: SEMESTER_DISPLAY_NAMES[slots.semester],
    };
  }
}
```

### 8.2 Multi-System Orchestration

For intents that require data from multiple systems:
```typescript
// "Tôi còn thiếu môn nào để tốt nghiệp?" requires:
// 1. Get student's completed courses (SIS)
// 2. Get graduation requirements for their major (Academic Registry)
// 3. Compute gap

async function handle_QUERY_GRADUATION_REQUIREMENTS(slots: GradSlots) {
  const [completedCourses, requirements] = await Promise.all([
    sisAdapter.getCompletedCourses(slots.student_id),
    academicAdapter.getGraduationRequirements(slots.major),
  ]);
  
  const missing = computeCoursGap(completedCourses, requirements);
  return formatGapReport(missing, requirements);
}
```

### 8.3 Fallback Chain

```
Route fails (API down) 
  → retry once (500ms delay)
    → still fails
      → check static KB for the answer (e.g., cached tuition schedule)
        → if KB has it: return KB answer with "updated as of [date]" note
          → if KB doesn't have it: return human-fallback response
            { phone, email, office_location, office_hours }
```

---

## 9. Voice Pipeline

### 9.1 Speech-to-Text (STT)

**Option A: OpenAI Whisper (local, offline)**
```python
import whisper

model = whisper.load_model("small")  # 244MB, good Vietnamese accuracy
# "medium" for better accuracy; "large" for production quality

def transcribe_audio(audio_file: bytes) -> str:
    result = model.transcribe(audio_file, language="vi", task="transcribe")
    return result["text"]
    # Apply post-processing: normalize tones, fix common ASR errors
```

**Option B: Google Cloud Speech-to-Text (cloud, higher accuracy)**
```python
# Better for noisy environments, phone calls
# Requires internet but achieves ~95% accuracy on Vietnamese
```

**ASR Post-Processing (handling common Vietnamese ASR errors):**
```python
ASR_CORRECTIONS = {
    "học phỉ": "học phí",
    "tín chỉ": "tín chỉ",  # Common tone error
    "đăng ki": "đăng ký",
    "thoi khoa bieu": "thời khóa biểu",
}
```

### 9.2 Text-to-Speech (TTS) — Optional

```typescript
// For voice-first interfaces (kiosk, phone IVR, elderly users)
async function speak(text: string): Promise<AudioBuffer> {
  // Google Cloud TTS with vi-VN-Wavenet-A voice
  // Most natural Vietnamese voice currently available
  const response = await ttsClient.synthesizeSpeech({
    input: { text },
    voice: { languageCode: 'vi-VN', name: 'vi-VN-Wavenet-A' },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 }
  });
  return response.audioContent;
}
```

---

## 10. Multi-Turn Dialogue Management

### 10.1 Session State Machine

```
States:
  INITIAL          → User sends first message
  CLASSIFYING      → Running intent classification
  EXTRACTING_SLOTS → Running NER/slot extraction
  FILLING_SLOTS    → Asking for missing slots (iterative)
  CONFIRMING       → Awaiting user confirmation for write operations
  EXECUTING        → Calling target API
  RESPONDING       → Generating/returning response
  FOLLOW_UP        → Awaiting potential follow-up question
  ENDED            → Session concluded
```

### 10.2 Context Manager

```typescript
interface SessionContext {
  sessionId: string;
  userId?: string;      // Set after auth
  userType: UserType;   // student | staff | visitor | elderly
  domain: string;       // university | government | healthcare
  language: 'vi' | 'en' | 'mixed';
  
  history: ConversationTurn[];  // Last 20 turns
  
  // Resolved entities persist across turns
  resolvedEntities: {
    student_id?: string;
    major?: string;
    academic_year?: string;
    // ... other frequently-referenced values
  };
  
  // Current in-progress intent
  pendingIntent?: {
    intent: string;
    filledSlots: Record<string, SlotValue>;
    missingSlots: string[];
    awaitingConfirmation: boolean;
  };
}
```

**Pronoun Resolution:**
```typescript
function resolvePronouns(text: string, context: SessionContext): string {
  // "học phí của nó bao nhiêu?" → "nó" refers to last mentioned course
  // "khi nào đóng tiền đó?" → "đó" refers to last mentioned payment
  
  const PRONOUNS_VI = ['nó', 'đó', 'này', 'kia', 'môn đó', 'môn này'];
  
  for (const pronoun of PRONOUNS_VI) {
    if (text.includes(pronoun)) {
      const referent = findMostRecentReferent(pronoun, context.history);
      if (referent) {
        text = text.replace(pronoun, referent);
      }
    }
  }
  return text;
}
```

---

## 11. Data Flow (E2E)

### 11.1 Happy Path — Single Intent, All Slots Available

```
User: "học phí kỳ này của sinh viên 20210001 là bao nhiêu?"
  ↓
Normalizer: "học phí kỳ này của sinh viên 20210001 là bao nhiêu" (clean)
  ↓
Stage 1 SLM: { intent: "QUERY_TUITION_SEMESTER", confidence: 0.94 }
  ↓
Slot Extractor:
  filled: { student_id: "20210001", semester: "HK1" (resolved from "kỳ này") }
  missing: []
  ↓
Process Router: 
  → university_sis.get_tuition({ student_id: "20210001", semester: "HK1" })
  → API returns: { amount: 12500000, deadline: "2024-09-15", paid: false }
  ↓
Response Humanizer:
  → "Học kỳ 1 năm học 2024-2025, bạn cần đóng 12 triệu 500 nghìn đồng.
     Hạn nộp: ngày 15 tháng 9 năm 2024. ⚠️ Bạn chưa đóng học phí."
  ↓
User sees: Plain Vietnamese response ✅
Total time: ~350ms (SLM 80ms + NER 50ms + API 150ms + humanizer 70ms)
```

### 11.2 Multi-Turn Slot Filling Path

```
User: "tôi muốn đăng ký môn học"
  ↓
Intent: REGISTER_COURSE_NEW (confidence: 0.91)
  missing: [student_id, course_code, semester]
  ↓
Agent: "Bạn muốn đăng ký môn gì? Cho mình biết tên hoặc mã môn học nhé."
  ↓
User: "môn lập trình web"
  ↓
Slot filled: course_code = "CS301" (resolved via course name → code lookup)
  remaining missing: [student_id, semester]
  ↓
Agent: "Bạn cho mình biết mã số sinh viên của bạn nhé?"
  ↓
User: "20210001"
  ↓
Slot filled: student_id = "20210001"
  remaining missing: [semester] — BUT semester has default = current_semester()
  → Auto-fill semester = "HK1" (current)
  ↓
Agent: "Bạn muốn đăng ký môn Lập Trình Web (CS301), học kỳ 1/2024-2025, đúng không?"
  ↓
User: "đúng rồi"
  ↓
Process Router: university_sis.register_course({...})
  ↓
Agent: "Đăng ký thành công môn Lập Trình Web (CS301)! Lịch học: Thứ 3, tiết 7-9, phòng B204."
```

---

## 12. API & Interface Design

### 12.1 REST API

```typescript
// POST /api/chat
// Chat endpoint — main entry point
{
  "session_id": "uuid",      // Omit for new session
  "message": "học phí kỳ này bao nhiêu",
  "domain": "university",
  "user_type": "student",   // Optional: "student" | "staff" | "visitor" | "elderly"
  "language": "vi"           // Optional: auto-detected
}

// Response:
{
  "session_id": "uuid",
  "response": "Học kỳ 1 năm học 2024-2025...",
  "intent": "QUERY_TUITION_SEMESTER",
  "confidence": 0.94,
  "slots_filled": { "semester": "HK1", "student_id": "REDACTED" },
  "action_taken": "API_CALLED",
  "follow_up_suggestions": ["Bạn muốn biết hạn nộp học phí không?"]
}

// POST /api/voice
// Voice endpoint — accepts audio, returns text + audio
{
  "session_id": "uuid",
  "audio_base64": "...",
  "domain": "university"
}

// POST /api/admin/intents
// Admin: Add new intent examples for retraining
// POST /api/admin/retrain
// Admin: Trigger model retraining
```

### 12.2 Embeddable Chat Widget

```html
<!-- One-line embed for any institutional website -->
<script 
  src="https://your-server/widget.js"
  data-domain="university"
  data-lang="vi"
  data-theme="blue"
  data-position="bottom-right"
></script>
```

### 12.3 Telegram Bot Integration

```typescript
// Institutions can deploy as a Telegram bot (popular in Vietnam)
bot.on('message', async (ctx) => {
  const response = await agentClient.chat({
    session_id: ctx.from.id.toString(),
    message: ctx.message.text,
    domain: 'university',
    user_type: 'student'
  });
  await ctx.reply(response.response);
});
```

### 12.4 Admin Dashboard

Features:
- Intent analytics: top intents by volume, by unresolved rate
- Low-confidence query review: human-review queue for uncertain classifications
- Training data management: add/edit/approve utterance examples
- Model performance dashboard: accuracy over time, confusion matrix
- API health: upstream system status, response times

---

## 13. Deployment Modes

### 13.1 Mode A — Fully Local (Air-gapped, Maximum Privacy)
- All ML: PhoBERT/mE5 local + Ollama (local LLM fallback) + Whisper (local ASR)
- No internet required
- Suitable for: government agencies, military, hospitals with strict data governance
- Hardware: 8GB RAM minimum, 16GB recommended

### 13.2 Mode B — Hybrid (Local NLU + Cloud LLM Fallback)
- Local: PhoBERT/mE5 for primary classification (90%+ of queries)
- Cloud: Claude API for low-confidence fallback only (~10% of queries)
- Suitable for: universities, enterprises — balances privacy and quality
- Recommended for most deployments

### 13.3 Mode C — Cloud (Maximum Quality, Lower Privacy)
- All ML via APIs: Claude API for NLU + Google STT + Google TTS
- Suitable for: public-facing services where speed/accuracy > privacy
- Not recommended for systems handling personal academic/health records

---

## 14. Self-Learning Knowledge System

### 14.1 Domain-Specific Knowledge Sources

| Source | Content | Frequency | Domain |
|--------|---------|-----------|--------|
| University regulation documents (PDF) | Quy chế học vụ, biểu học phí | Per semester | University |
| Ministry of Education circulars | Thông tư, quyết định | On release | University |
| Government procedure portal | Thủ tục hành chính, TTHC | Weekly | Government |
| Healthcare insurance regulations | BHYT, viện phí | On release | Healthcare |
| Internal FAQ updates | Câu hỏi thường gặp của từng đơn vị | Weekly | All |

### 14.2 Knowledge Update Flow

```
Trigger: Scheduled (Monday 06:00) OR admin push
  ↓
Crawler fetches new documents:
  ├── PDF regulations → pdfminer extraction → text chunks
  ├── Web pages → trafilatura → text chunks
  └── API (if source provides) → JSON → normalized text
  ↓
Relevance filter (TF-IDF against domain keyword list)
  ↓
LLM summarizer → 200-word summary + key facts extraction
  ↓
Append to SECOND-KNOWLEDGE-BRAIN.md (domain-tagged)
  ↓
Re-index ChromaDB vector store
  ↓
(If new intent examples detected) → Add to training data queue
  → Human review (admin approves examples) → Retrain SLM
```

### 14.3 Continuous Improvement Loop

```
Production queries → Anonymize + Store in analytics DB
  ↓
Weekly: Human review of low-confidence queries (< 0.75 confidence)
  ↓
Label correct intents for misclassified examples
  ↓
Add to training data → Trigger retraining
  ↓
A/B test new model vs old model (10% traffic to new model)
  ↓
If accuracy improved → Promote new model to production
```

---

## 15. Security & Privacy

### 15.1 Data Minimization
- Session context cleared after session end (configurable: 1h-24h TTL)
- Student IDs, names masked with hash in analytics logs
- Voice recordings never stored — only transcription (configurable)
- Conversation transcripts: opt-in only for quality improvement

### 15.2 Access Control
- Sensitive intents (view transcript, view personal data) require authentication
- Role-based routing: staff can query all students; student can only query themselves
- API key authentication for integration with institutional systems

### 15.3 Audit Trail
- All intent routing decisions logged (anonymized): timestamp + intent + confidence
- All API calls to institutional systems logged: timestamp + method + anonymized params
- No raw user text in audit logs (only normalized, anonymized version)

---

## 16. Performance Targets

| Metric | Target |
|--------|--------|
| Intent classification (local SLM) | < 100ms |
| Slot extraction (NER) | < 80ms |
| End-to-end response time (no voice) | < 800ms |
| End-to-end response time (with voice) | < 2s |
| Intent classification accuracy (university domain) | > 90% |
| Slot extraction F1 (student_id, course_code) | > 95% |
| Concurrent sessions supported | 500 (single server) |
| Model memory footprint (SLM) | < 600MB RAM |
| Knowledge base semantic search | < 200ms |

---

## 17. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Vietnamese ASR poor accuracy for dialects | High | Medium | Fine-tune Whisper on domain audio; allow text fallback |
| Low-confidence classification leads to wrong action | Medium | High | Confidence gate: < 0.75 always asks clarification before acting |
| Institutional API changes break adapters | Medium | High | Adapter version pinning + smoke tests; fallback to KB static data |
| Training data bias (Northern Vietnamese only) | Medium | Medium | Explicitly collect Southern/Central dialect examples |
| User provides wrong student ID | Medium | Medium | Validate against system before proceeding; confirm with last-name check |
| New regulation not yet in KB | Medium | Medium | Policy-fetch fallback: "Câu hỏi này tôi chưa có thông tin mới nhất, vui lòng liên hệ..." |
| Model retraining breaks production accuracy | Low | High | A/B testing + accuracy gate before promoting new model |

---

## 18. Success Metrics

### Technical KPIs
- [ ] Intent classification accuracy ≥ 90% on held-out test set (university domain)
- [ ] Slot extraction F1 ≥ 92% for critical slots (student_id, semester, course_code)
- [ ] End-to-end response latency p95 < 1 second (no voice)
- [ ] < 5% of sessions require fallback to human operator

### User Experience KPIs
- [ ] User task completion rate ≥ 85% (user gets the answer they needed)
- [ ] Average turns to complete a task ≤ 3 (for single-intent queries)
- [ ] User satisfaction score ≥ 4.0/5.0 (post-interaction survey)
- [ ] Elderly user completion rate ≥ 75% (must be usable without tech literacy)

### Knowledge System KPIs
- [ ] Knowledge base grows by 5-15 entries per week automatically
- [ ] New semester regulation reflected in KB within 48 hours of publication
- [ ] Model retraining cycle: new intents deployable within 1 business day after examples approved

---

*End of PROJECT-detail.md*
