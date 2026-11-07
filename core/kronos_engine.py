"""Kronos deterministic scheduling engine - parses natural language into events."""
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from dateutil import parser as dateparser
from dateutil.relativedelta import relativedelta, MO, TU, WE, TH, FR, SA, SU
import pytz


# Natural language patterns
DAYS = {
    "today": 0, "tomorrow": 1, "day after tomorrow": 2,
    "monday": MO, "mon": MO, "tuesday": TU, "tue": TU, "wednesday": WE, "wed": WE,
    "thursday": TH, "thu": TH, "friday": FR, "fri": FR, "saturday": SA, "sat": SA,
    "sunday": SU, "sun": SU,
}

TIMES = {
    "morning": (9, 0), "early morning": (7, 0), "late morning": (11, 0),
    "noon": (12, 0), "midday": (12, 0), "afternoon": (14, 0),
    "early afternoon": (13, 0), "late afternoon": (16, 0),
    "evening": (18, 0), "night": (20, 0), "tonight": (20, 0),
    "breakfast": (8, 0), "lunch": (12, 30), "dinner": (19, 0),
    "midnight": (0, 0),
}

DURATIONS = {
    "minute": 1, "minutes": 1, "min": 1, "mins": 1,
    "hour": 60, "hours": 60, "hr": 60, "hrs": 60,
    "day": 1440, "days": 1440,
}


def parse_duration(text: str) -> Optional[int]:
    """Parse duration from text. Returns minutes."""
    m = re.search(r'(\d+)\s*(min(?:ute)?s?|hr?s?|hours?|days?)', text.lower())
    if m:
        num = int(m.group(1))
        unit = m.group(2)
        for key, mins in DURATIONS.items():
            if key in unit:
                return num * mins
    return None


def get_next_weekday(base_date: datetime, weekday) -> datetime:
    """Get next occurrence of a weekday."""
    days_ahead = weekday.weekday - base_date.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return base_date + timedelta(days=days_ahead)


def parse_natural_language(text: str, tz_name: str = "UTC") -> Dict:
    """
    Parse a natural-language event description into structured event data.
    Fully deterministic, no LLM required.
    """
    t_lower = text.lower()
    now = datetime.now(pytz.timezone(tz_name))
    
    # Default: today, current hour, 60 min duration
    event_date = now.replace(minute=0, second=0, microsecond=0)
    start_hour = now.hour + 1
    start_min = 0
    duration_min = 60
    all_day = False
    recurring = None
    
    # Extract title (everything before time/date keywords as heuristic)
    title = text.strip()
    
    # Parse all-day keywords
    if any(w in t_lower for w in ["all day", "allday", "entire day"]):
        all_day = True
        start_hour = 0
        start_min = 0
        duration_min = 1440
    
    # Parse relative days
    if "today" in t_lower:
        event_date = now
    elif "tomorrow" in t_lower or "tmr" in t_lower:
        event_date = now + timedelta(days=1)
    elif "day after tomorrow" in t_lower:
        event_date = now + timedelta(days=2)
    else:
        # Check for named days
        for day_name, wd in DAYS.items():
            if day_name in t_lower and day_name not in ["today", "tomorrow", "day after tomorrow"]:
                event_date = get_next_weekday(now, wd)
                break
    
    # Parse relative dates: "in N days", "next week"
    m = re.search(r'in\s+(\d+)\s+days?', t_lower)
    if m:
        event_date = now + timedelta(days=int(m.group(1)))
    
    m = re.search(r'in\s+(\d+)\s+weeks?', t_lower)
    if m:
        event_date = now + timedelta(weeks=int(m.group(1)))
    
    if "next week" in t_lower:
        event_date = now + timedelta(weeks=1)
    
    # Parse time references
    # Named times
    for time_name, (h, m) in TIMES.items():
        if time_name in t_lower:
            start_hour = h
            start_min = m
            break
    
    # Explicit times (e.g., "3pm", "14:30", "9:00 am")
    time_patterns = [
        r'(\d{1,2})(?::(\d{2}))?\s*(am|pm|AM|PM)',
        r'(\d{1,2}):(\d{2})',
    ]
    for pat in time_patterns:
        m = re.search(pat, text)
        if m:
            h = int(m.group(1))
            mins = int(m.group(2)) if m.group(2) else 0
            ampm = m.group(3).lower() if len(m.groups()) > 2 and m.group(3) else None
            if ampm == "pm" and h < 12:
                h += 12
            if ampm == "am" and h == 12:
                h = 0
            start_hour = h
            start_min = mins
            break
    
    # Parse duration
    dur = parse_duration(text)
    if dur:
        duration_min = dur
    
    # Parse "for X time" vs "at X time" disambiguation
    m = re.search(r'for\s+(\d+)\s*(min(?:ute)?s?|hr?s?|hours?|days?)', t_lower)
    if m:
        num = int(m.group(1))
        unit = m.group(2)
        for key, mins in DURATIONS.items():
            if key in unit:
                duration_min = num * mins
                break
    
    # Parse recurrence
    if "every day" in t_lower or "daily" in t_lower:
        recurring = "daily"
    elif "every week" in t_lower or "weekly" in t_lower:
        recurring = "weekly"
    elif "every month" in t_lower or "monthly" in t_lower:
        recurring = "monthly"
    elif re.search(r'every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)', t_lower):
        recurring = "weekly"
    
    # Parse priority
    priority = "normal"
    if any(w in t_lower for w in ["urgent", "critical", "asap", "important", "priority"]):
        priority = "high"
    elif any(w in t_lower for w in ["whenever", "sometime", "low priority", "eventually"]):
        priority = "low"
    
    # Build datetime
    start_dt = event_date.replace(hour=start_hour, minute=start_min, second=0, microsecond=0)
    end_dt = start_dt + timedelta(minutes=duration_min)
    
    # Clean up title: remove parsed time/date words and time patterns
    clean_title = text
    # Remove explicit times first (before word removal to catch "at 2pm for 1 hour")
    clean_title = re.sub(r'\b(?:at|around|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b', '', clean_title)
    clean_title = re.sub(r'\b\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)\b', '', clean_title)
    clean_title = re.sub(r'\bfor\s+\d+\s+(?:min(?:ute)?s?|hr?s?|hours?|days?)\b', '', clean_title, flags=re.IGNORECASE)
    clean_title = re.sub(r'\bin\s+\d+\s+(?:min(?:ute)?s?|hr?s?|hours?|days?|weeks?)\b', '', clean_title, flags=re.IGNORECASE)
    
    words_to_remove = [
        "today", "tomorrow", "tmr", "day after tomorrow",
        "morning", "afternoon", "evening", "night", "tonight", "noon", "midday",
        "midnight", "early morning", "late morning", "early afternoon", "late afternoon",
        "breakfast", "lunch", "dinner",
        "every day", "daily", "every week", "weekly", "every month", "monthly",
        "all day", "allday", "entire day",
        "urgent", "critical", "asap", "important", "priority",
        "next week",
    ]
    for w in words_to_remove:
        clean_title = re.sub(r'\b' + re.escape(w) + r'\b', '', clean_title, flags=re.IGNORECASE)
    clean_title = re.sub(r'\s+', ' ', clean_title).strip(" ,.-")
    
    if not clean_title or len(clean_title) < 2:
        # Fallback: remove only clear time patterns
        clean_title = re.sub(r'\b(?:at|around|from)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm|AM|PM)?\b', '', text)
        clean_title = re.sub(r'\bfor\s+\d+\s+\w+\b', '', clean_title).strip(" ,.-")
        if not clean_title:
            clean_title = text.strip()[:80]
    
    return {
        "title": clean_title,
        "start_time": start_dt.timestamp(),
        "end_time": end_dt.timestamp(),
        "all_day": 1 if all_day else 0,
        "recurring": recurring,
        "priority": priority,
        "duration_min": duration_min,
        "parsed_at": now.timestamp(),
        "confidence": 0.85,
    }


def detect_clashes(events: List[Dict], new_start: float, new_end: float, exclude_id: int = None) -> List[Dict]:
    """Detect scheduling conflicts."""
    clashes = []
    for ev in events:
        if exclude_id and ev.get("id") == exclude_id:
            continue
        if ev.get("all_day"):
            continue  # All-day events don't clash
        ev_start = ev["start_time"]
        ev_end = ev.get("end_time") or ev_start + 3600
        if (new_start < ev_end and new_end > ev_start):
            clashes.append(ev)
    return clashes


def suggest_times(events: List[Dict], duration_min: int = 60, day_start: int = 8, 
                  day_end: int = 20, start_from: float = None) -> List[Dict]:
    """Suggest available time slots."""
    import datetime as dt
    now = time.time()
    if start_from is None:
        start_from = now
    
    base = dt.datetime.fromtimestamp(start_from, tz=timezone.utc)
    base = base.replace(hour=day_start, minute=0, second=0, microsecond=0)
    
    suggestions = []
    day_events = []
    for ev in events:
        ev_start = dt.datetime.fromtimestamp(ev["start_time"], tz=timezone.utc)
        if ev_start.date() == base.date():
            day_events.append(ev)
    
    day_events.sort(key=lambda e: e["start_time"])
    
    # Check slots at 30-min intervals
    current = base
    for slot_hour in range(day_start, day_end):
        for slot_min in [0, 30]:
            slot_start = base.replace(hour=slot_hour, minute=slot_min)
            slot_end = slot_start + timedelta(minutes=duration_min)
            slot_start_ts = slot_start.timestamp()
            slot_end_ts = slot_end.timestamp()
            
            if slot_start_ts < now:
                continue
            
            clash = False
            for ev in day_events:
                ev_end = ev.get("end_time") or ev["start_time"] + 3600
                if slot_start_ts < ev_end and slot_end_ts > ev["start_time"]:
                    clash = True
                    break
            
            if not clash and slot_end.hour <= day_end:
                suggestions.append({
                    "start": slot_start_ts,
                    "end": slot_end_ts,
                    "label": slot_start.strftime("%I:%M %p"),
                })
                if len(suggestions) >= 5:
                    return suggestions
    
    return suggestions
