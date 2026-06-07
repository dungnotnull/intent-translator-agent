"""
Vietnamese NER Pipeline — underthesea + custom domain entity recognizers.

Provides:
  - run_ner(text) -> List[Entity]         # Standard NER via underthesea
  - extract_domain_entities(text, domain) # Custom entities per domain
  - normalize_entities(entities)          # Merge overlapping spans
"""

from dataclasses import dataclass, field
from typing import Optional
import re


@dataclass
class Entity:
    text: str
    label: str
    confidence: float
    start: int = 0
    end: int = 0


# ═══════════════════════════════════════════════════════════════
# Underthesea NER
# ═══════════════════════════════════════════════════════════════

_ner_fn = None
_word_tokenize_fn = None


def _ensure_ner():
    global _ner_fn, _word_tokenize_fn
    if _ner_fn is None:
        try:
            from underthesea import ner, word_tokenize
            _ner_fn = ner
            _word_tokenize_fn = word_tokenize
        except ImportError:
            pass


def run_ner(text: str) -> list[Entity]:
    """Run underthesea NER. Returns empty list if not available."""
    _ensure_ner()
    if _ner_fn is None:
        return []

    try:
        raw = _ner_fn(text)
    except Exception:
        return []

    label_map = {
        "B-PER": "PERSON", "I-PER": "PERSON",
        "B-LOC": "LOCATION", "I-LOC": "LOCATION",
        "B-ORG": "ORGANIZATION", "I-ORG": "ORGANIZATION",
        "B-DATE": "DATE", "I-DATE": "DATE",
        "B-MISC": "MISC", "I-MISC": "MISC",
    }

    entities: list[Entity] = []
    current: Optional[Entity] = None
    pos = 0

    for token, tag in raw:
        mapped = label_map.get(tag)
        if mapped:
            if tag.startswith("B-") or current is None:
                if current:
                    entities.append(current)
                current = Entity(
                    text=token,
                    label=mapped,
                    confidence=0.88,
                    start=pos,
                    end=pos + len(token),
                )
            elif tag.startswith("I-"):
                current.text += " " + token
                current.end = pos + len(token)
                current.confidence = max(current.confidence, 0.82)
        else:
            if current:
                entities.append(current)
                current = None
        pos += len(token) + 1  # +1 for space

    if current:
        entities.append(current)

    return entities


# ═══════════════════════════════════════════════════════════════
# Custom Domain Entity Extractors
# ═══════════════════════════════════════════════════════════════

def extract_domain_entities(text: str, domain: str = "university") -> list[Entity]:
    """Extract domain-specific entities using regex + lookup tables."""
    lower = text.lower()
    entities: list[Entity] = []

    # ── STUDENT_ID ──
    student_id = _extract_student_id(lower)
    if student_id:
        entities.append(student_id)

    # ── COURSE_CODE ──
    course_code = _extract_course_code(text)
    if course_code:
        entities.append(course_code)

    # ── SEMESTER ──
    semester = _extract_semester(lower)
    if semester:
        entities.append(semester)

    # ── ACADEMIC_YEAR ──
    academic_year = _extract_academic_year(text)
    if academic_year:
        entities.append(academic_year)

    # ── PURPOSE ──
    purpose = _extract_purpose(lower)
    if purpose:
        entities.append(purpose)

    # ── AMOUNT_VND ──
    amount = _extract_vnd_amount(lower)
    if amount:
        entities.append(amount)

    # ── FACULTY_NAME ──
    faculty = _extract_faculty(lower)
    if faculty:
        entities.append(faculty)

    return entities


def _extract_student_id(lower: str) -> Optional[Entity]:
    """Extract student ID: context-aware + standalone 8-10 digit numbers."""
    match = re.search(r'(?:mã\s*(?:số|sinh\s*viên)|mssv|student\s*id)\s*[:#]?\s*(\d{8,10})', lower)
    if match:
        return Entity(text=match.group(1), label="STUDENT_ID", confidence=0.92)

    match = re.search(r'\b(\d{8,10})\b', lower)
    if match:
        val = match.group(1)
        if not val.startswith("0") and 20000000 <= int(val) <= 9999999999:
            return Entity(text=val, label="STUDENT_ID", confidence=0.65)
    return None


def _extract_course_code(text: str) -> Optional[Entity]:
    match = re.search(r'\b([A-Z]{2,6}\d{3,4})\b', text)
    if match:
        return Entity(text=match.group(1), label="COURSE_CODE", confidence=0.85)
    return None


def _extract_semester(lower: str) -> Optional[Entity]:
    patterns = [
        (r'\bhk1\b', "HK1"), (r'\bhọc\s*kỳ\s*1\b', "HK1"), (r'\bhọc\s*kì\s*1\b', "HK1"),
        (r'\bkỳ\s*1\b', "HK1"), (r'\bky\s*1\b', "HK1"),
        (r'\bhk2\b', "HK2"), (r'\bhọc\s*kỳ\s*2\b', "HK2"), (r'\bhọc\s*kì\s*2\b', "HK2"),
        (r'\bkỳ\s*2\b', "HK2"), (r'\bky\s*2\b', "HK2"),
        (r'\bhk3\b', "HK3"), (r'\bhọc\s*kỳ\s*3\b', "HK3"),
        (r'\bkỳ\s*này\b', "CURRENT_SEMESTER"), (r'\bkì\s*này\b', "CURRENT_SEMESTER"),
        (r'\bhọc\s*kỳ\s*này\b', "CURRENT_SEMESTER"),
    ]
    for pattern, value in patterns:
        if re.search(pattern, lower):
            return Entity(text=value, label="SEMESTER", confidence=0.92)
    return None


def _extract_academic_year(text: str) -> Optional[Entity]:
    match = re.search(r'(\d{4})\s*[-–]\s*(\d{4})', text)
    if match:
        return Entity(text=f"{match.group(1)}-{match.group(2)}", label="ACADEMIC_YEAR", confidence=0.92)
    return None


def _extract_purpose(lower: str) -> Optional[Entity]:
    purposes = {
        "vay vốn": 0.82, "xin việc": 0.78, "học bổng": 0.85,
        "xuất cảnh": 0.80, "ngân hàng": 0.75, "xin visa": 0.80,
        "du học": 0.78, "bảo hiểm": 0.72,
    }
    for keyword, conf in purposes.items():
        if keyword in lower:
            return Entity(text=keyword, label="PURPOSE", confidence=conf)
    return None


def _extract_vnd_amount(lower: str) -> Optional[Entity]:
    # "5 triệu", "500k", "5.000.000 đồng"
    match = re.search(r'(\d+[.,]?\d*)\s*(triệu|trieu|tr)', lower)
    if match:
        amount = float(match.group(1).replace(",", ".")) * 1_000_000
        return Entity(text=str(int(amount)), label="AMOUNT_VND", confidence=0.88)

    match = re.search(r'(\d+)\s*k\b', lower)
    if match:
        amount = int(match.group(1)) * 1000
        return Entity(text=str(amount), label="AMOUNT_VND", confidence=0.85)

    match = re.search(r'(\d+)\s*(nghìn|ngan|ngàn)', lower)
    if match:
        amount = int(match.group(1)) * 1000
        return Entity(text=str(amount), label="AMOUNT_VND", confidence=0.85)

    match = re.search(r'(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?)\s*(đồng|dong|vnd|vnđ)', lower)
    if match:
        val = match.group(1).replace(".", "").replace(",", "")
        return Entity(text=val, label="AMOUNT_VND", confidence=0.90)

    return None


def _extract_faculty(lower: str) -> Optional[Entity]:
    faculties = [
        "công nghệ thông tin", "cntt", "khoa học máy tính", "kỹ thuật phần mềm",
        "hệ thống thông tin", "kỹ thuật máy tính", "trí tuệ nhân tạo", "an toàn thông tin",
        "điện tử viễn thông", "cơ khí", "xây dựng", "kiến trúc",
        "kinh tế", "quản trị kinh doanh", "luật", "ngoại ngữ",
    ]
    for fac in sorted(faculties, key=len, reverse=True):
        if fac in lower:
            return Entity(text=fac.upper(), label="FACULTY_NAME", confidence=0.82)
    return None


# ═══════════════════════════════════════════════════════════════
# Entity normalization — merge overlapping spans
# ═══════════════════════════════════════════════════════════════

def normalize_entities(entities: list[Entity]) -> list[Entity]:
    """Remove overlapping entities, keeping highest-confidence ones."""
    if len(entities) <= 1:
        return entities

    sorted_ents = sorted(entities, key=lambda e: (e.start, -e.confidence))
    result: list[Entity] = []

    for ent in sorted_ents:
        if not result:
            result.append(ent)
            continue

        last = result[-1]
        if ent.start >= last.end:
            result.append(ent)
        else:
            if ent.confidence > last.confidence:
                result[-1] = ent

    return result


def extract_all(text: str, domain: str = "university") -> list[Entity]:
    """Run full NER + domain extraction + normalization."""
    standard = run_ner(text)
    domain_ents = extract_domain_entities(text, domain)
    combined = standard + domain_ents
    return normalize_entities(combined)
