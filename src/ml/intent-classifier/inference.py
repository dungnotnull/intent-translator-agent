"""
ML Inference Server (FastAPI) — serves local SLM for intent classification and Vietnamese NER.

Model loading strategy:
  - Primary: fine-tuned SetFit model from models/{domain}-v1/
  - Fallback: zero-shot classification with multilingual-e5-small
  - If no models downloaded: server starts in passthrough mode (returns rule-based results)

All models loaded at startup. Graceful degradation if models aren't downloaded yet.
"""

import os
import sys
import json
import logging
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from contextlib import asynccontextmanager

logger = logging.getLogger("uvicorn")

MODEL_VERSION = os.getenv("ML_MODEL_VERSION", "0.1.0")
MODEL_DIR = Path(os.getenv("ML_MODEL_DIR", str(ROOT / "src" / "ml" / "intent-classifier" / "models")))
DOMAIN = os.getenv("ML_DOMAIN", "university")

classifier = None
classifier_type = "none"
intent_labels = []
ner_pipeline = None


def _load_classifier():
    """Try to load the intent classifier. Returns the model or None."""
    global classifier, classifier_type, intent_labels

    model_path = MODEL_DIR / f"{DOMAIN}-v1"

    if model_path.exists() and (model_path / "config.json").exists():
        try:
            from setfit import SetFitModel
            classifier = SetFitModel.from_pretrained(str(model_path))
            classifier_type = "setfit_finetuned"

            metadata_path = model_path / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                    intent_labels = metadata.get("intents", [])

            logger.info(f"Loaded fine-tuned SetFit model from {model_path} ({len(intent_labels)} intents)")
            return
        except Exception as e:
            logger.warning(f"Failed to load fine-tuned model: {e}")

    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np

        model = SentenceTransformer("intfloat/multilingual-e5-small")
        classifier = model
        classifier_type = "zero_shot_e5"
        logger.info("Loaded multilingual-e5-small for zero-shot classification")
        return
    except Exception as e:
        logger.warning(f"Failed to load multilingual-e5-small: {e}")

    try:
        from transformers import AutoTokenizer, AutoModel
        import torch

        tokenizer = AutoTokenizer.from_pretrained("vinai/phobert-base-v2")
        model = AutoModel.from_pretrained("vinai/phobert-base-v2")
        classifier = {"tokenizer": tokenizer, "model": model}
        classifier_type = "phobert_raw"
        logger.info("Loaded PhoBERT (raw, no classification head)")
        return
    except Exception as e:
        logger.warning(f"Failed to load PhoBERT: {e}")

    classifier_type = "none"
    logger.warning("No ML models available — server running in passthrough mode")


def _load_ner():
    """Load Vietnamese NER pipeline."""
    global ner_pipeline

    try:
        from underthesea import ner, word_tokenize

        ner_pipeline = {
            "ner": ner,
            "word_tokenize": word_tokenize,
        }
        logger.info("Loaded underthesea NER pipeline")
    except Exception as e:
        logger.warning(f"Failed to load underthesea: {e}. NER will use regex-only fallback.")
        ner_pipeline = None


class ReloadRequest(BaseModel):
    model_path: str = Field(default="", description="Path to model directory, or empty to reload default")


class ReloadResponse(BaseModel):
    status: str
    previous_type: str
    new_type: str
    message: str


@asynccontextmanager
async def lifespan(app: FastAPI):
    _load_classifier()
    _load_ner()
    yield


app = FastAPI(
    title="intent-translator-agent — ML Inference",
    version="0.1.0",
    lifespan=lifespan,
)


# ═══════════════════════════════════════════════════════════════
# Request/Response Models
# ═══════════════════════════════════════════════════════════════

class ClassifyRequest(BaseModel):
    text: str = Field(..., min_length=1)
    domain: str = Field(default="university")
    top_k: int = Field(default=3, ge=1, le=10)


class ClassifyResponse(BaseModel):
    intent: str
    confidence: float
    alternatives: list[dict]
    model_version: str
    classifier_type: str


class ExtractRequest(BaseModel):
    text: str = Field(..., min_length=1)
    domain: str = Field(default="university")
    intent: str = Field(..., description="Classified intent ID for slot schema context")


class ExtractResponse(BaseModel):
    entities: list[dict]


class HealthResponse(BaseModel):
    status: str
    classifier_type: str
    ner_available: bool
    model_version: str
    domain: str


# ═══════════════════════════════════════════════════════════════
# Intent Label Registry (loaded from YAML at runtime)
# ═══════════════════════════════════════════════════════════════

def _load_intent_labels(domain: str) -> list[str]:
    """Load intent labels from the YAML registry."""
    if intent_labels:
        return intent_labels

    import yaml

    registry_path = ROOT / "src" / "routing" / "intent-registry.yaml"
    if registry_path.exists():
        with open(registry_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
            return [i["id"] for i in data.get("intents", [])]

    return []


# ═══════════════════════════════════════════════════════════════
# Classification Logic
# ═══════════════════════════════════════════════════════════════

def _classify_setfit(text: str, labels: list[str], top_k: int) -> tuple[str, float, list[dict]]:
    """Classify using fine-tuned SetFit model."""
    global classifier

    try:
        probas = classifier.predict_proba([text])[0]
        sorted_indices = sorted(range(len(probas)), key=lambda i: probas[i], reverse=True)

        top_intent = labels[sorted_indices[0]]
        top_conf = float(probas[sorted_indices[0]])

        alternatives = []
        for idx in sorted_indices[1:top_k]:
            alternatives.append({
                "intent": labels[idx],
                "confidence": float(probas[idx]),
            })

        return top_intent, top_conf, alternatives
    except Exception as e:
        logger.error(f"SetFit classification error: {e}")
        raise


def _classify_zero_shot(text: str, labels: list[str], top_k: int) -> tuple[str, float, list[dict]]:
    """Classify using zero-shot with multilingual-e5-small via cosine similarity."""
    global classifier

    import numpy as np

    model = classifier

    query_embed = model.encode([f"query: {text}"], normalize_embeddings=True)[0]
    label_embeds = model.encode(
        [f"passage: {label}" for label in labels],
        normalize_embeddings=True,
    )

    similarities = np.dot(label_embeds, query_embed)
    sorted_indices = np.argsort(similarities)[::-1]

    top_intent = labels[sorted_indices[0]]
    top_conf = float(similarities[sorted_indices[0]])

    alternatives = []
    for idx in sorted_indices[1:top_k]:
        alternatives.append({
            "intent": labels[idx],
            "confidence": float(similarities[idx]),
        })

    return top_intent, min(top_conf, 0.95), alternatives


def _classify_phobert_raw(text: str, labels: list[str], top_k: int) -> tuple[str, float, list[dict]]:
    """Classify using raw PhoBERT embeddings + cosine similarity to label examples."""
    global classifier

    import torch
    import numpy as np

    tokenizer = classifier["tokenizer"]
    model = classifier["model"]

    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=128)
    with torch.no_grad():
        outputs = model(**inputs)
        text_embed = outputs.last_hidden_state[:, 0, :].numpy()[0]

    label_embeddings = []
    for label in labels:
        label_inputs = tokenizer(label, return_tensors="pt", padding=True, truncation=True, max_length=32)
        with torch.no_grad():
            label_output = model(**label_inputs)
            label_embed = label_output.last_hidden_state[:, 0, :].numpy()[0]
        label_embeddings.append(label_embed)

    label_embeddings = np.array(label_embeddings)
    similarities = np.dot(label_embeddings, text_embed) / (
        np.linalg.norm(label_embeddings, axis=1) * np.linalg.norm(text_embed)
    )
    sorted_indices = np.argsort(similarities)[::-1]

    top_intent = labels[sorted_indices[0]]
    top_conf = float(similarities[sorted_indices[0]])

    alternatives = []
    for idx in sorted_indices[1:top_k]:
        alternatives.append({
            "intent": labels[idx],
            "confidence": float(similarities[idx]),
        })

    return top_intent, min(top_conf, 0.90), alternatives


# ═══════════════════════════════════════════════════════════════
# Endpoints
# ═══════════════════════════════════════════════════════════════

@app.get("/health", response_model=HealthResponse)
async def health():
    return HealthResponse(
        status="ok",
        classifier_type=classifier_type,
        ner_available=ner_pipeline is not None,
        model_version=MODEL_VERSION,
        domain=DOMAIN,
    )


@app.post("/reload", response_model=ReloadResponse)
async def reload_model(req: ReloadRequest):
    global classifier, classifier_type, intent_labels

    previous = classifier_type

    if req.model_path:
        model_path = Path(req.model_path)
        if not model_path.exists():
            raise HTTPException(status_code=400, detail=f"Model path not found: {req.model_path}")
        MODEL_DIR = model_path.parent
        try:
            from setfit import SetFitModel
            classifier = SetFitModel.from_pretrained(str(model_path))
            classifier_type = "setfit_finetuned"
            metadata_path = model_path / "metadata.json"
            if metadata_path.exists():
                with open(metadata_path, "r", encoding="utf-8") as f:
                    metadata = json.load(f)
                    intent_labels = metadata.get("intents", [])
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load model: {e}")
    else:
        _load_classifier()

    new_type = classifier_type
    logger.info(f"Model reloaded: {previous} → {new_type}")
    return ReloadResponse(
        status="ok",
        previous_type=previous,
        new_type=new_type,
        message=f"Model reloaded: {previous} → {new_type} ({len(intent_labels)} intents)",
    )


@app.post("/classify", response_model=ClassifyResponse)
async def classify(req: ClassifyRequest):
    labels = _load_intent_labels(req.domain)

    if not labels:
        raise HTTPException(status_code=500, detail=f"No intent labels found for domain: {req.domain}")

    if classifier_type == "setfit_finetuned":
        try:
            intent, confidence, alternatives = _classify_setfit(req.text, labels, req.top_k)
            return ClassifyResponse(
                intent=intent,
                confidence=confidence,
                alternatives=alternatives,
                model_version=MODEL_VERSION,
                classifier_type="setfit_finetuned",
            )
        except Exception as e:
            logger.error(f"SetFit classification failed: {e}, falling through")

    if classifier_type == "zero_shot_e5":
        try:
            intent, confidence, alternatives = _classify_zero_shot(req.text, labels, req.top_k)
            return ClassifyResponse(
                intent=intent,
                confidence=confidence,
                alternatives=alternatives,
                model_version=MODEL_VERSION,
                classifier_type="zero_shot_e5",
            )
        except Exception as e:
            logger.error(f"Zero-shot classification failed: {e}, falling through")

    if classifier_type == "phobert_raw":
        try:
            intent, confidence, alternatives = _classify_phobert_raw(req.text, labels, req.top_k)
            return ClassifyResponse(
                intent=intent,
                confidence=confidence,
                alternatives=alternatives,
                model_version=MODEL_VERSION,
                classifier_type="phobert_raw",
            )
        except Exception as e:
            logger.error(f"PhoBERT classification failed: {e}, falling through")

    raise HTTPException(
        status_code=503,
        detail="No ML model available for classification. Run setup_models.py first.",
    )


@app.post("/extract-entities", response_model=ExtractResponse)
async def extract_entities(req: ExtractRequest):
    entities = _run_ner(req.text)

    entities.extend(_run_custom_entity_extractors(req.text))

    if not entities:
        entities.append({"text": req.text, "label": "RAW_TEXT", "confidence": 0.5})

    return ExtractResponse(entities=entities)


# ═══════════════════════════════════════════════════════════════
# NER — underthesea + custom entity recognizers
# ═══════════════════════════════════════════════════════════════

def _run_ner(text: str) -> list[dict]:
    """Run underthesea NER on the input text."""
    if ner_pipeline is None:
        return []

    try:
        raw_entities = ner_pipeline["ner"](text)

        entity_map = {
            "B-PER": "PERSON",
            "I-PER": "PERSON",
            "B-LOC": "LOCATION",
            "I-LOC": "LOCATION",
            "B-ORG": "ORGANIZATION",
            "I-ORG": "ORGANIZATION",
            "B-DATE": "DATE",
            "I-DATE": "DATE",
        }

        entities = []
        current_entity = None

        for token, tag in raw_entities:
            mapped = entity_map.get(tag, None)
            if mapped:
                if tag.startswith("B-"):
                    if current_entity:
                        entities.append(current_entity)
                    current_entity = {"text": token, "label": mapped, "confidence": 0.85}
                elif tag.startswith("I-") and current_entity:
                    current_entity["text"] += " " + token
            else:
                if current_entity:
                    entities.append(current_entity)
                    current_entity = None

        if current_entity:
            entities.append(current_entity)

        return entities
    except Exception as e:
        logger.error(f"NER error: {e}")
        return []


def _run_custom_entity_extractors(text: str) -> list[dict]:
    """Run regex-based custom entity extractors for domain-specific entities."""
    import re

    entities = []
    lower = text.lower()

    student_id_pattern = r'(?:mã\s*(?:số|sinh\s*viên)|mssv|student\s*id)[\s:]*(\d{8,10})'
    student_id_match = re.search(student_id_pattern, lower)
    if not student_id_match:
        student_id_match = re.search(r'\b(\d{8,10})\b', lower)
    if student_id_match:
        entities.append({
            "text": student_id_match.group(1),
            "label": "STUDENT_ID",
            "confidence": 0.90 if "mssv" in lower or "mã" in lower else 0.65,
        })

    course_code_match = re.search(r'\b([A-Za-z]{2,6}\d{3,4})\b', text)
    if course_code_match:
        entities.append({
            "text": course_code_match.group(1).upper(),
            "label": "COURSE_CODE",
            "confidence": 0.85,
        })

    semester_map = {
        r'\bhk1\b': "HK1", r'\bhọc\s*kỳ\s*1\b': "HK1", r'\bhọc\s*kì\s*1\b': "HK1",
        r'\bkỳ\s*1\b': "HK1", r'\bky\s*1\b': "HK1",
        r'\bhk2\b': "HK2", r'\bhọc\s*kỳ\s*2\b': "HK2", r'\bhọc\s*kì\s*2\b': "HK2",
        r'\bkỳ\s*2\b': "HK2", r'\bky\s*2\b': "HK2",
        r'\bhk3\b': "HK3", r'\bhọc\s*kỳ\s*3\b': "HK3",
        r'\bkỳ\s*này\b': "CURRENT_SEMESTER", r'\bkì\s*này\b': "CURRENT_SEMESTER",
    }
    for pattern, value in semester_map.items():
        if re.search(pattern, lower):
            entities.append({
                "text": value,
                "label": "SEMESTER",
                "confidence": 0.90,
            })
            break

    academic_year_match = re.search(r'(\d{4})\s*[-–]\s*(\d{4})', text)
    if academic_year_match:
        entities.append({
            "text": f"{academic_year_match.group(1)}-{academic_year_match.group(2)}",
            "label": "ACADEMIC_YEAR",
            "confidence": 0.90,
        })

    purpose_keywords = ["vay vốn", "xin việc", "học bổng", "xuất cảnh", "ngân hàng"]
    for purpose in purpose_keywords:
        if purpose in lower:
            entities.append({
                "text": purpose,
                "label": "PURPOSE",
                "confidence": 0.75,
            })
            break

    return entities


# ═══════════════════════════════════════════════════════════════
# Entry point
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "8001"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run(app, host=host, port=port)
