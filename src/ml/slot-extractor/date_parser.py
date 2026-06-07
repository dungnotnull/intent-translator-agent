"""
Vietnamese Date/Time Parser — handles relative and absolute Vietnamese date expressions.

Examples:
  "hôm nay" → today()
  "tuần sau" → today() + 7 days
  "kỳ này" → current_semester()
  "tháng 9" → September of current year
  "15/9/2024" → absolute date
"""

from datetime import date, datetime, timedelta
from typing import Optional, Union


def current_semester() -> str:
    """Determine current semester based on today's date."""
    today = date.today()
    if today.month >= 8 and today.month <= 12:
        return "HK1"
    elif today.month >= 1 and today.month <= 5:
        return "HK2"
    else:
        return "HK3"


def current_academic_year() -> str:
    """Determine current academic year based on today's date."""
    today = date.today()
    if today.month >= 8:
        return f"{today.year}-{today.year + 1}"
    else:
        return f"{today.year - 1}-{today.year}"


def resolve_relative_date(expression: str) -> Optional[Union[date, str]]:
    """Resolve a Vietnamese relative date expression to an absolute date or value.

    Returns None if the expression cannot be resolved.
    """
    expression = expression.strip().lower()

    relative_patterns = {
        "hôm nay": lambda: date.today(),
        "hôm qua": lambda: date.today() - timedelta(days=1),
        "ngày mai": lambda: date.today() + timedelta(days=1),
        "tuần sau": lambda: date.today() + timedelta(days=7),
        "tuần trước": lambda: date.today() - timedelta(days=7),
        "tuần này": lambda: date.today(),
        "tháng sau": lambda: date(date.today().year, (date.today().month % 12) + 1, 1),
        "tháng trước": lambda: date(date.today().year, ((date.today().month - 2) % 12) + 1, 1),
        "tháng này": lambda: date.today(),
        "năm sau": lambda: date(date.today().year + 1, 1, 1),
        "năm trước": lambda: date(date.today().year - 1, 1, 1),
        "năm nay": lambda: date.today(),
        "kỳ này": current_semester,
        "học kỳ này": current_semester,
        "kỳ tới": lambda: "HK2" if current_semester() == "HK1" else "HK1",
        "năm học này": current_academic_year,
    }

    for pattern, resolver in relative_patterns.items():
        if pattern in expression:
            return resolver()

    return None


def resolve_semester_alias(alias: str) -> Optional[str]:
    """Resolve semester aliases to canonical form (HK1, HK2, HK3)."""
    alias = alias.strip().lower()
    mapping = {
        "kỳ 1": "HK1", "ky 1": "HK1", "học kỳ 1": "HK1", "hoc ky 1": "HK1",
        "kỳ 2": "HK2", "ky 2": "HK2", "học kỳ 2": "HK2", "hoc ky 2": "HK2",
        "kỳ 3": "HK3", "ky 3": "HK3", "học kỳ 3": "HK3", "hoc ky 3": "HK3",
        "hk1": "HK1", "hk2": "HK2", "hk3": "HK3",
    }
    return mapping.get(alias)


_VIETNAMESE_TO_ENGLISH_MONTH = {
    "1": "January", "2": "February", "3": "March", "4": "April",
    "5": "May", "6": "June", "7": "July", "8": "August",
    "9": "September", "10": "October", "11": "November", "12": "December",
}

_LUNAR_TO_SOLAR_2026 = {
    "1/1": "2026-02-17",
    "15/1": "2026-03-03",
    "15/8": "2026-09-25",
    "23/12": "2026-01-26",
}

LUNAR_PATTERNS = {
    "tết nguyên đán": "2026-02-17",
    "tết tây": "2026-01-01",
    "tết dương lịch": "2026-01-01",
    "tết âm lịch": "2026-02-17",
    "mùng 1 tết": "2026-02-17",
    "mùng 2 tết": "2026-02-18",
    "mùng 3 tết": "2026-02-19",
    "tháng giêng": "2026-02-17",
    "rằm tháng giêng": "2026-03-03",
    "tết trung thu": "2026-09-25",
    "trung thu": "2026-09-25",
    "rằm tháng 8": "2026-09-25",
    "giỗ tổ hùng vương": "2026-04-07",
    "ngày giải phóng": "2026-04-30",
    "quốc tế lao động": "2026-05-01",
    "quốc khánh": "2026-09-02",
    "lễ quốc khánh": "2026-09-02",
    "noel": "2026-12-25",
    "giáng sinh": "2026-12-25",
    "ông công ông táo": "2026-02-03",
    "tết hàn thực": "2026-03-30",
    "tết đoan ngọ": "2026-06-19",
    "lễ vu lan": "2026-08-27",
}


def resolve_lunar_date(expression: str) -> Optional[date]:
    expression = expression.strip().lower()
    for keyword, iso_date in sorted(LUNAR_PATTERNS.items(), key=lambda x: -len(x[0])):
        if keyword in expression:
            return date.fromisoformat(iso_date)
    return None


def resolve_lunar_month(expression: str) -> Optional[str]:
    expression = expression.strip().lower()
    mapping = {
        "tháng giêng": "tháng 1", "tháng 1 âm": "tháng 1 âm lịch",
        "tháng chạp": "tháng 12", "tháng 12 âm": "tháng 12 âm lịch",
    }
    for k, v in sorted(mapping.items(), key=lambda x: -len(x[0])):
        if k in expression:
            return v
    return None


__all__ = ["current_semester", "current_academic_year", "resolve_relative_date", "resolve_semester_alias"]
