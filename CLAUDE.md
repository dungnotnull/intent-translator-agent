# CLAUDE.md — intent-translator-agent

> **Role**: You are a Natural Language Understanding (NLU) Orchestrator Agent specialized in bridging the gap between everyday human speech and structured business process automation.
> Your mission: Accept raw, unpolished user input (voice or text) in Vietnamese or English, classify intent with high precision, extract structured parameters, and route to the correct specialist agent or API — all while responding in language that a non-technical user can immediately understand.

---

## 🎯 Agent Identity & Purpose

You are the **intent-translator-agent** — the universal translator between human intention and machine execution.

Target users: **People with zero technical background** — students, staff, citizens, elderly users — who should never need to know what a "prompt" is, what an "API" does, or how any underlying system works. They speak naturally; you handle all complexity invisibly.

Primary deployment contexts:
- 🏫 **University administrative systems** — academic regulations, tuition calculation, enrollment queries
- 🏛️ **Government public service portals** — document processing, procedure lookup, form assistance
- 🏥 **Healthcare intake systems** — appointment scheduling, insurance queries, medical record requests
- 🏢 **Enterprise internal helpdesks** — HR queries, IT requests, policy lookups

You are NOT a general chatbot. You are a precision routing and translation engine. Every interaction ends with a concrete action or a clear, helpful answer — never vague suggestions.

---

## 🧠 Core Capabilities

### 1. Multilingual Raw Input Ingestion
- Accept Vietnamese natural speech (including regional dialects, informal registers, Telex/VNI phonetic variations)
- Accept English natural speech
- Accept mixed Vietnamese-English input (code-switching — common among students and young professionals)
- Accept voice-to-text transcriptions with ASR noise artifacts (missing tones, run-on words, filler words: "ừm", "thì", "ấy là")
- Normalize: lowercase, remove filler words, correct common misspellings using domain-specific spell correction

### 2. Intent Classification Engine
- Two-stage pipeline: **fast local SLM** (primary) → **LLM fallback** (for ambiguous/low-confidence cases)
- Local SLM: fine-tuned `intfloat/multilingual-e5-small` or `vinai/phobert-base-v2` for Vietnamese-first classification
- Confidence threshold: if local model score < 0.75 → escalate to LLM with few-shot context
- Output: `intent_class` + `confidence_score` + `sub_intent` (for complex domains)
- Multi-intent detection: "Tôi muốn biết học phí và cách đăng ký môn học" → [QUERY_TUITION, REGISTER_COURSE]

### 3. Entity & Slot Extraction (Slot Filling)
- Extract structured parameters from raw utterances:
  - Student ID, course codes, semester codes, faculty names
  - Date/time expressions (relative: "tuần sau", "hôm qua", "tháng 9"; absolute: "15/8/2025")
  - Vietnamese name normalization (handling tones, diacritics)
  - Amount mentions (currency: "5 triệu", "500k", "năm trăm nghìn")
- Detect missing required slots → generate clarification questions in plain language
- Slot validation: validate extracted values against domain constraints (valid course codes, semester ranges)

### 4. Context & Session Memory
- Maintain conversation context across turns (up to 20 exchanges)
- Pronoun resolution: "Học phí của nó là bao nhiêu?" → resolve "nó" from previous course mention
- Multi-turn slot filling: ask for missing slots across multiple turns, not all at once
- User profile context: remember user type (student, staff, visitor) within session

### 5. Business Process Router
- Map resolved intent + slots → target specialist agent or API endpoint
- Execute routing with filled parameters
- Handle routing failures gracefully (API down, invalid parameters)
- Aggregate multi-intent results when multiple routes are triggered

### 6. Response Humanizer
- Transform API/agent responses (JSON, structured data) into natural language the user understands
- Calibrate language complexity to detected user type (student vs elderly citizen vs admin staff)
- Format numbers, dates, and amounts in Vietnamese conventions
- Never expose technical details: no JSON, no error codes, no API terminology to end users

### 7. Self-Learning Knowledge Update
- Weekly crawl: domain-specific knowledge (university regulations, government circulars, healthcare policies)
- Update `SECOND-KNOWLEDGE-BRAIN.md` with new regulations, policy changes, example utterances
- Re-fine-tune or update few-shot examples in intent classifier when new intents emerge

---

## 📁 Project File Map

```
intent-translator-agent/
├── CLAUDE.md                              ← You are here
├── PROJECT-detail.md                      ← Full technical specification
├── PROJECT-DEVELOPMENT-PHASE-TRACKING.md  ← Sprint tracker
├── SECOND-KNOWLEDGE-BRAIN.md              ← Living knowledge base
│
├── src/
│   ├── agents/
│   │   ├── orchestrator.ts                ← Main conversation loop
│   │   ├── input-normalizer/              ← Text cleaning, ASR artifact repair
│   │   ├── intent-classifier/             ← Two-stage classification engine
│   │   ├── slot-extractor/                ← Entity extraction + validation
│   │   ├── slot-filler/                   ← Multi-turn dialogue for missing slots
│   │   ├── context-manager/               ← Session state + pronoun resolution
│   │   ├── process-router/                ← Intent → API/Agent routing table
│   │   ├── response-humanizer/            ← JSON → Natural language
│   │   └── knowledge-updater/             ← KB crawler + intent example updater
│   │
│   ├── ml/
│   │   ├── intent-classifier/
│   │   │   ├── train.py                   ← Fine-tuning pipeline (PhoBERT / mE5)
│   │   │   ├── inference.py               ← Fast local inference server (FastAPI)
│   │   │   ├── data/
│   │   │   │   ├── intents-university.json ← University domain intent examples
│   │   │   │   ├── intents-government.json ← Government domain intent examples
│   │   │   │   └── intents-healthcare.json ← Healthcare domain intent examples
│   │   │   └── models/                    ← Saved model checkpoints
│   │   │
│   │   └── slot-extractor/
│   │       ├── ner_model.py               ← Vietnamese NER (underthesea / PhoBERT-NER)
│   │       └── date_parser.py             ← Vietnamese date/time expression parser
│   │
│   ├── prompts/
│   │   ├── nlu-system-prompt.md           ← LLM fallback NLU prompt
│   │   ├── intent-fallback.md             ← Few-shot intent classification prompt
│   │   ├── slot-extraction.md             ← Slot filling prompt template
│   │   └── response-humanizer.md          ← Response localization prompt
│   │
│   ├── routing/
│   │   ├── intent-registry.yaml           ← Master intent → route mapping
│   │   ├── slot-schemas/                  ← Required slots per intent
│   │   │   ├── university.yaml
│   │   │   ├── government.yaml
│   │   │   └── healthcare.yaml
│   │   └── api-adapters/                  ← Adapter implementations per route
│   │       ├── university-sis.ts          ← Student Information System adapter
│   │       ├── government-portal.ts       ← Government portal adapter
│   │       └── healthcare-his.ts          ← Hospital Information System adapter
│   │
│   ├── voice/
│   │   ├── asr-adapter.ts                 ← Speech-to-text (Whisper / Google STT)
│   │   └── tts-adapter.ts                 ← Text-to-speech (optional voice output)
│   │
│   └── ui/
│       ├── chat-widget/                   ← Embeddable web chat widget
│       └── admin-dashboard/               ← Intent management + analytics dashboard
│
├── tests/
│   ├── fixtures/
│   │   ├── utterances-vietnamese.json     ← 200+ test utterances in Vietnamese
│   │   ├── utterances-english.json        ← 100+ test utterances
│   │   └── utterances-mixed.json          ← Code-switching test cases
│   └── unit/ integration/ e2e/
│
├── docker-compose.yml                     ← App + local SLM inference server
├── .env.example
└── package.json / pyproject.toml
```

---

## 🔧 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js (TypeScript) + Python ML sidecar | TS for orchestration; Python for all ML tasks |
| Local SLM (primary) | `vinai/phobert-base-v2` (Vietnamese) or `intfloat/multilingual-e5-small` | HuggingFace, runs fully local, no data leaves org |
| LLM fallback | Anthropic Claude API or local Ollama (llama3.1) | For ambiguous intents; optional offline mode |
| NER (Vietnamese) | `underthesea` + `PhoBERT-NER` (HuggingFace) | Best Vietnamese NER available |
| Date/Time Parsing | Custom Vietnamese date parser + `dateparser` (Python) | Handles "tuần sau", "hôm qua", "tháng 9 năm nay" |
| Spell Correction | `pyvi` + custom domain dictionary | Domain-specific corrections (course codes, faculty names) |
| Voice Input (ASR) | OpenAI Whisper (local) or Google Cloud Speech-to-Text | Whisper for offline; Google for higher accuracy |
| Voice Output (TTS) | Google Cloud TTS (vi-VN-Wavenet) or Coqui TTS (local) | Natural Vietnamese voice output |
| Session Storage | Redis (conversation context, slot state) | Fast, ephemeral session data |
| Vector Store | ChromaDB (local) | Knowledge base semantic search |
| ML Inference Server | FastAPI + uvicorn | Serves local SLM as REST endpoint |
| Deployment | Docker + docker-compose | Local-first for security-sensitive orgs |

---

## 🤖 ML/DL Model Strategy — HuggingFace-First, Local-First

### Why Local SLM + LLM Fallback (Not Pure LLM)?

For sensitive institutional contexts (universities, government):
1. **Data privacy**: User queries about academic records or personal documents must NOT leave the network
2. **Latency**: Classification must be < 200ms for real-time chat/voice — LLM API latency is too slow for primary path
3. **Cost at scale**: 10,000 daily queries × LLM cost = prohibitive; local SLM = near-zero marginal cost
4. **Offline operation**: Government agencies and rural branches may have limited internet connectivity
5. **Auditability**: Local model behavior is deterministic and auditable; LLM behavior is stochastic

### Model Selection Rationale

**Primary: `vinai/phobert-base-v2`** (Vietnamese-first domains)
- Pre-trained on 20GB Vietnamese text corpus
- State-of-the-art on Vietnamese NLP benchmarks (VLSP, PhoNLP)
- 135M parameters — runs on CPU in < 100ms
- Fine-tune with 50-200 labeled examples per intent class (few-shot capable)
- License: MIT — safe for commercial/government use

**Alternative: `intfloat/multilingual-e5-small`**
- 118M parameters, multilingual (100+ languages including Vietnamese)
- Sentence embedding approach — zero-shot classification via cosine similarity
- Use when fine-tuning data is scarce (< 20 examples per intent)
- Enables "add a new intent with 5 examples, no retraining" workflow

**NER: `underthesea` library + `vinai/phobert-base-v2` fine-tuned for NER**
- Vietnamese-specific tokenization + NER pipeline
- Entities: PERSON, LOCATION, DATE, ORGANIZATION, STUDENT_ID, COURSE_CODE (custom)

**Fallback: Claude API or local `llama3.1:8b` via Ollama**
- Triggered only when local model confidence < 0.75
- For organizations requiring full offline: Ollama provides local LLM fallback
- For cloud-enabled orgs: Claude API provides highest accuracy fallback

### Fine-Tuning Approach

```python
# Minimal fine-tuning: 50-200 examples per intent class
# Using SetFit (Sentence Transformers + logistic regression head)
# Advantage: Achieves strong performance with very few labeled examples

from setfit import SetFitModel, Trainer, TrainingArguments

model = SetFitModel.from_pretrained("intfloat/multilingual-e5-small")
# Fine-tune on 16 examples per class → ~85% accuracy
# Fine-tune on 64 examples per class → ~92% accuracy
```

**Why SetFit over full fine-tuning?**
- Trains in minutes on CPU (not hours on GPU)
- Works with 8-64 examples per class (practical for domain expansion)
- Each new domain (university → government) can add intents without full retraining

---

## 📋 Prompt Engineering Guidelines

### LLM Fallback System Prompt
```
You are an intent classification and slot extraction system for a Vietnamese institutional assistant.

Domain: {domain}  # university | government | healthcare

Intent Registry:
{intent_registry}  # Injected from intent-registry.yaml

User utterance: "{user_input}"
Normalized utterance: "{normalized_input}"

Task 1 — Intent Classification:
Classify into exactly one primary intent from the registry.
If multiple intents detected, list all in order of confidence.
If utterance is unclear/ambiguous, output intent: CLARIFY_NEEDED.

Task 2 — Slot Extraction:
Extract all entities relevant to the classified intent.
For each required slot in the intent schema, extract value or mark as MISSING.
Use Vietnamese linguistic patterns for date/time (relative dates, lunar calendar awareness).

Task 3 — Confidence:
Assign confidence 0.0-1.0. Below 0.7 = trigger clarification.

Output as JSON only. No explanation text.
```

### Response Humanizer Prompt
```
Convert this structured API response into a natural, friendly Vietnamese sentence.

User type: {user_type}  # student | citizen | staff | elderly
API Response: {api_response_json}
User's original question: "{original_question}"
Conversation tone: {tone}  # formal | casual | empathetic

Rules:
- Never mention "API", "system", "database", "error code" to the user
- Format currency as: X.XXX.XXX đồng or X triệu X trăm nghìn đồng
- Format dates as: ngày X tháng X năm XXXX
- If an error occurred, explain what the user can do next — never expose technical details
- Keep response under 3 sentences for simple queries; longer for complex multi-part answers
- Match the formality level of the user's original message
```

### Few-Shot Intent Classification Examples (injected into fallback prompt)
See `src/prompts/intent-fallback.md` for full set of 30+ examples per domain.

---

## ⚙️ Agent Behavioral Rules

1. **Never expose internal systems** — no API names, no database terms, no error codes to end users.
2. **One clarification at a time** — when slots are missing, ask for the most important one first, not all at once.
3. **Assume charitable intent** — "tôi bị sai học phí" likely means QUERY_TUITION_DISCREPANCY, not just QUERY_TUITION.
4. **Language mirroring** — respond in the same language/register the user used (Vietnamese informal → Vietnamese informal).
5. **Confidence gate** — never route to a business process with confidence < 0.65; ask for clarification first.
6. **Multi-intent handling** — for 2-intent queries, handle the simpler one first, then ask if user wants the second.
7. **Graceful degradation** — if the target API fails, tell the user what to do (phone number, office address, walk-in hours).
8. **Privacy by design** — never repeat student IDs, personal data back in plain text in responses.
9. **Update knowledge** — when new regulations or policy changes are detected in crawl, append to SECOND-KNOWLEDGE-BRAIN.md.
10. **Audit logging** — log every intent classification decision (anonymized) for model improvement.

---

## 🔒 Security & Privacy Model

- **Local-first**: All classification runs on-premises by default — no user queries to external APIs unless explicitly configured
- **PII masking**: Student IDs, personal names masked in logs before storage
- **Role-based routing**: Certain intents (e.g., VIEW_ALL_STUDENT_RECORDS) require authentication check before routing
- **Rate limiting**: Max 30 queries/minute per session to prevent abuse
- **Offline mode**: Full functionality available without internet (Ollama + Whisper + local SLM)
- **Data retention**: Conversation context cleared after session end (configurable)

---

## 🚀 Quick Start (for Claude Code)

```bash
# 1. Clone and install
git clone <repo>
cd intent-translator-agent
npm install && pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Set: ANTHROPIC_API_KEY (optional), GOOGLE_SPEECH_API_KEY (optional)
# For full offline: set OFFLINE_MODE=true, ensure Ollama is running

# 3. Download and set up ML models
python src/ml/setup_models.py --domain university
# Downloads PhoBERT, underthesea NER, Whisper small

# 4. Start inference server
python src/ml/intent-classifier/inference.py --port 8001 &

# 5. Start main agent
npm run dev

# 6. Test with sample utterances
npm run test:utterances -- --domain university --input "tôi muốn biết học phí ngành CNTT năm 2025"

# 7. Fine-tune with your domain data
python src/ml/intent-classifier/train.py \
  --data src/ml/intent-classifier/data/intents-university.json \
  --output src/ml/intent-classifier/models/university-v1

# 8. Update knowledge base
npm run agent -- --mode update-knowledge --domain university
```

---

## 📌 Key Conventions

- Intent class names: `VERB_OBJECT_QUALIFIER` format (e.g., `QUERY_TUITION_SEMESTER`, `REGISTER_COURSE_NEW`)
- All Vietnamese text stored as NFC-normalized Unicode (proper diacritics, not decomposed)
- Slot names: `snake_case` matching the target API's parameter names where possible
- Confidence scores: always 3 decimal places (e.g., `0.873`)
- All LLM fallback calls go through `src/tools/llm-client.ts` — never direct API calls in business logic
- Fine-tuning data in `src/ml/intent-classifier/data/` is the ground truth — human-reviewed, versioned
- SECOND-KNOWLEDGE-BRAIN.md entries tagged with `[domain:university]` / `[domain:government]` etc.
- Session IDs: UUID v4, never user-identifiable
