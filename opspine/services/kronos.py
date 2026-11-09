"""Event storage plus a deterministic natural-language date parser.

The parser is deliberately conservative: it extracts what it can recognise and
reports its confidence. The UI shows the interpreted date and time for
confirmation before anything is saved. OPSpine has no background scheduler, so
no code here implies notifications will fire.
"""
from __future__ import annotations

import re
import time
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from dateutil import parser as dateparser
from dateutil.relativedelta import FR, MO, SA, SU, TH, TU, WE

from .. import db

WEEKDAYS = {
    "monday": MO, "mon": MO, "tuesday": TU, "tue": TU, "tues": TU,
    "wednesday": WE, "wed": WE, "thursday": TH, "thu": TH, "thur": TH,
    "friday": FR, "fri": FR, "saturday": SA, "sat": SA,
    "sunday": SU, "sun": SU,
}

PERIODS = {
    "morning": (9, 0), "noon": (12, 0), "midday": (12, 0),
    "afternoon": (14, 0), "evening": (18, 0), "night": (20, 0),
    "tonight": (20, 0), "lunchtime": (12, 30), "midnight": (0, 0),
}

UNITS = {
    "minute": 1, "minutes": 1, "min": 1, "mins": 1, "m": 1,
    "hour": 60, "hours": 60, "hr": 60, "hrs": 60, "h": 60,
    "day": 1440, "days": 1440,
}

DURATION_WORDS = {
    "half an hour": 30, "half hour": 30, "an hour": 60, "one hour": 60,
    "two hours": 120, "three hours": 180,
}

STATUS_VALUES = ("todo", "in_progress", "done")
PRIORITY_VALUES = ("low", "normal", "high")


def _clean_title(text: str) -> str:
    """Strip recognised time expressions out of the event title."""
    junk = [
        r"\b(today|tonight|tomorrow|yesterday)\b",
        r"\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week|month)\b",
        r"\b(on\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b",
        r"\b(at|from|by)\s+\d{1,2}(:\d{2})?\s*(am|pm)?\b",
        r"\b\d{1,2}(:\d{2})?\s*(am|pm)\b",
        r"\bfor\s+\d+\s*(minutes?|mins?|hours?|hrs?|days?)\b",
        r"\bfor\s+(half an hour|half hour|an hour|one hour|two hours|three hours)\b",
        r"\bin the (morning|afternoon|evening)\b",
        r"\b(at|around)\s+(noon|midday|midnight|lunchtime|morning|afternoon|evening|night)\b",
        r"\b\d{4}-\d{2}-\d{2}\b",
        r"\bon\s+\d{1,2}/\d{1,2}(/\d{2,4})?\b",
        r"\b(remind me to|reminder:?|add an? event( to)?|schedule|create an? event( to)?)\b",
    ]
    out = text
    for pattern in junk:
        out = re.sub(pattern, " ", out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out).strip(" ,.-–—")
    return out


def parse(text: str, *, now: Optional[datetime] = None) -> Dict[str, Any]:
    """Interpret a phrase like "standup tomorrow at 9am for 20 minutes"."""
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Enter a description such as 'Dentist Tuesday at 3pm'.")

    now = now or datetime.now()
    today = datetime(year=now.year, month=now.month, day=now.day)
    lowered = raw.lower()

    day = today
    matched_date = False

    iso = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", raw)
    if iso:
        try:
            day = datetime.strptime(iso.group(1), "%Y-%m-%d")
            matched_date = True
        except ValueError:
            pass

    if not matched_date:
        if "tomorrow" in lowered:
            day, matched_date = today + timedelta(days=1), True
        elif "today" in lowered or "tonight" in lowered:
            day, matched_date = today, True
        else:
            m = re.search(
                r"\bnext\s+(" + "|".join(WEEKDAYS) + r")\b", lowered
            )
            if m:
                day, matched_date = today + timedelta(days=7), True
                day += timedelta(
                    days=(WEEKDAYS[m.group(1)].weekday - day.weekday()) % 7
                )
            else:
                m = re.search(r"\b(" + "|".join(WEEKDAYS) + r")\b", lowered)
                if m:
                    day, matched_date = today + timedelta(
                        days=(WEEKDAYS[m.group(1)].weekday - today.weekday()) % 7
                    ), True

    hour = minute = None
    m = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b", lowered)
    if m:
        hour, minute = int(m.group(1)) % 12, int(m.group(2) or 0)
        if m.group(3) == "pm":
            hour += 12
    else:
        m = re.search(r"\b(?:at\s+)?(\d{1,2}):(\d{2})\b", lowered)
        if m:
            hour, minute = int(m.group(1)), int(m.group(2))
        else:
            m = re.search(r"\bat\s+(\d{1,2})\b", lowered)
            if m:
                hour, minute = int(m.group(1)), 0
            else:
                for word, (h, mi) in PERIODS.items():
                    if re.search(rf"\b{word}\b", lowered):
                        hour, minute = h, mi
                        break

    if hour is None:
        hour, minute = 9, 0  # a clear, documented default

    duration_min = 60
    m = re.search(r"\bfor\s+(\d+)\s*(minutes?|mins?|hours?|hrs?|days?)\b", lowered)
    if m:
        unit = m.group(2)
        for key, factor in UNITS.items():
            if unit.startswith(key[:3]):
                duration_min = int(m.group(1)) * factor
                break
    else:
        for phrase, minutes in DURATION_WORDS.items():
            if phrase in lowered:
                duration_min = minutes
                break

    if hour > 23:
        hour = hour % 24
    start = day.replace(hour=hour, minute=min(minute, 59), second=0, microsecond=0)
    if not matched_date and start < now:
        # A time already past today most likely means tomorrow.
        start += timedelta(days=1)

    end = start + timedelta(minutes=max(duration_min, 5))
    title = _clean_title(raw)
    if not title:
        title = "Untitled event"

    confidence = 0.4
    if matched_date:
        confidence += 0.25
    if hour is not None:
        confidence += 0.2
    if duration_min != 60 or re.search(r"\bfor\s", lowered):
        confidence += 0.1

    return {
        "title": title[:120],
        "start_at": start.timestamp(),
        "end_at": end.timestamp(),
        "duration_min": int((end - start).total_seconds() // 60),
        "all_day": False,
        "matched_date": matched_date,
        "confidence": round(min(confidence, 0.95), 2),
    }


# --------------------------------------------------------------------------- #
# Storage
# --------------------------------------------------------------------------- #
def list_events(start: Optional[float] = None, end: Optional[float] = None) -> List[Dict[str, Any]]:
    if start is not None and end is not None:
        return db.rows(
            "SELECT * FROM events WHERE start_at < ? AND end_at > ? "
            "ORDER BY start_at",
            (end, start),
        )
    return db.rows("SELECT * FROM events ORDER BY start_at")


def get_event(event_id: int) -> Optional[Dict[str, Any]]:
    return db.one("SELECT * FROM events WHERE id = ?", (event_id,))


def create_event(payload: Dict[str, Any]) -> Dict[str, Any]:
    now = time.time()
    event_id = db.execute(
        "INSERT INTO events (title, notes, start_at, end_at, all_day, done, "
        "created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            payload["title"], payload.get("notes", ""), payload["start_at"],
            payload["end_at"], 1 if payload.get("all_day") else 0,
            1 if payload.get("done") else 0, now, now,
        ),
    )
    return get_event(event_id) or {}


def update_event(event_id: int, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if get_event(event_id) is None:
        return None
    db.execute(
        "UPDATE events SET title = ?, notes = ?, start_at = ?, end_at = ?, "
        "all_day = ?, done = ?, updated_at = ? WHERE id = ?",
        (
            payload["title"], payload.get("notes", ""), payload["start_at"],
            payload["end_at"], 1 if payload.get("all_day") else 0,
            1 if payload.get("done") else 0, time.time(), event_id,
        ),
    )
    return get_event(event_id)


def delete_event(event_id: int) -> bool:
    db.execute("DELETE FROM events WHERE id = ?", (event_id,))
    return get_event(event_id) is None


def find_clashes(start_at: float, end_at: float, exclude_id: Optional[int] = None) -> List[Dict[str, Any]]:
    if exclude_id:
        return db.rows(
            "SELECT id, title, start_at, end_at FROM events "
            "WHERE start_at < ? AND end_at > ? AND id != ? ORDER BY start_at",
            (end_at, start_at, exclude_id),
        )
    return db.rows(
        "SELECT id, title, start_at, end_at FROM events "
        "WHERE start_at < ? AND end_at > ? ORDER BY start_at",
        (end_at, start_at),
    )
