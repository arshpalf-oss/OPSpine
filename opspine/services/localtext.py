"""Deterministic local text tools.

These run entirely offline and are *not* an AI model. They are classical text
operations — counting, casing, de-duplication, and a frequency-based extractive
summary. The UI labels every result with the tool that produced it so a result
is never passed off as a language model's answer.
"""
from __future__ import annotations

import re
from collections import Counter
from typing import Dict, List

_WORD = re.compile(r"[A-Za-z0-9'’\-]+")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "if", "then", "than", "that", "this",
    "these", "those", "is", "are", "was", "were", "be", "been", "being", "to",
    "of", "in", "on", "for", "with", "as", "at", "by", "from", "it", "its",
    "we", "you", "they", "he", "she", "i", "not", "no", "do", "does", "did",
    "so", "such", "can", "could", "would", "should", "will", "may", "might",
    "have", "has", "had", "there", "their", "our", "your", "my", "me", "them",
    "about", "into", "over", "after", "before", "more", "most", "also", "when",
    "what", "which", "who", "how", "why", "where", "up", "out", "all", "any",
}

#: Tools the API will accept. Each maps to a callable below.
TOOLS = {
    "stats": "Statistics",
    "uppercase": "Uppercase",
    "lowercase": "Lowercase",
    "title_case": "Title case",
    "sentence_case": "Sentence case",
    "bullets": "Turn sentences into bullets",
    "dedupe_lines": "Remove duplicate lines",
    "sort_lines": "Sort lines A–Z",
    "strip_blank": "Collapse blank lines",
    "slug": "URL slug",
    "summary": "Extractive summary",
    "key_terms": "Key terms",
}


class ToolError(Exception):
    """Raised when a tool cannot process its input."""


def word_count(value: str) -> int:
    return len(_WORD.findall(value or ""))


def stats(value: str) -> Dict[str, object]:
    value = value or ""
    words = _WORD.findall(value)
    sentences = [s for s in _SENTENCE.split(value.strip()) if s.strip()]
    paragraphs = [p for p in re.split(r"\n\s*\n", value.strip()) if p.strip()]
    reading = round(len(words) / 200, 1) if words else 0.0
    return {
        "characters": len(value),
        "words": len(words),
        "sentences": len(sentences),
        "paragraphs": len(paragraphs),
        "reading_minutes": reading,
        "avg_words_per_sentence": (
            round(len(words) / len(sentences), 1) if sentences else 0.0
        ),
        "longest_word": max(words, key=len) if words else "",
    }


def _sentences(value: str) -> List[str]:
    return [s.strip() for s in _SENTENCE.split((value or "").strip()) if s.strip()]


def summary(value: str, *, max_sentences: int = 4) -> str:
    """Extractive summary: highest-scoring sentences, kept in original order."""
    sentences = _sentences(value)
    if not sentences:
        raise ToolError("There is no text to summarise.")
    if len(sentences) <= max_sentences:
        return " ".join(sentences)

    frequencies = Counter(
        w.lower() for w in _WORD.findall(value) if w.lower() not in _STOPWORDS
    )
    if not frequencies:
        raise ToolError(
            "This text has no distinct keywords to summarise. Add more content."
        )

    peak = max(frequencies.values())
    scored = []
    for index, sentence in enumerate(sentences):
        words = [w.lower() for w in _WORD.findall(sentence)]
        if not words:
            continue
        score = sum(frequencies[w] for w in words if w in frequencies) / peak
        score /= max(len(words), 1) ** 0.5  # do not favour very long sentences
        scored.append((score, index, sentence))

    best = sorted(scored, reverse=True)[:max_sentences]
    return " ".join(s for _, _, s in sorted(best, key=lambda item: item[1]))


def key_terms(value: str, *, limit: int = 8) -> List[str]:
    words = [w.lower() for w in _WORD.findall(value) if len(w) > 3]
    ranked = Counter(w for w in words if w not in _STOPWORDS).most_common(limit)
    return [word for word, _ in ranked]


def bullets(value: str) -> str:
    sentences = _sentences(value)
    if not sentences:
        raise ToolError("There is no text to convert into bullets.")
    lines = value.strip().splitlines()
    if all(line.strip().startswith(("-", "*", "•")) for line in lines if line.strip()):
        raise ToolError("This text is already a bullet list.")
    return "\n".join(f"- {s}" for s in sentences)


def dedupe_lines(value: str) -> str:
    seen, out = set(), []
    for line in (value or "").splitlines():
        key = line.strip().lower()
        if key and key in seen:
            continue
        seen.add(key)
        out.append(line)
    if len(out) == len((value or "").splitlines()):
        raise ToolError("No duplicate lines were found.")
    return "\n".join(out)


def sort_lines(value: str) -> str:
    lines = [ln for ln in (value or "").splitlines() if ln.strip()]
    if not lines:
        raise ToolError("There are no lines to sort.")
    return "\n".join(sorted(lines, key=lambda ln: ln.strip().lower()))


def strip_blank(value: str) -> str:
    collapsed = re.sub(r"\n{3,}", "\n\n", (value or "").strip())
    if collapsed == (value or "").strip():
        raise ToolError("There are no extra blank lines to collapse.")
    return collapsed


def slug(value: str, *, limit: int = 80) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    if not cleaned:
        raise ToolError("This text has no letters or digits to make a slug from.")
    return cleaned[:limit].strip("-")


def sentence_case(value: str) -> str:
    lowered = (value or "").lower()
    if not lowered.strip():
        raise ToolError("There is no text to convert.")
    out = []
    for block in lowered.split("\n"):
        stripped = block.strip()
        if not stripped:
            out.append("")
            continue
        out.append(stripped[0].upper() + stripped[1:])
    return "\n".join(out)


def run(tool: str, value: str) -> Dict[str, object]:
    """Execute a named local tool. Returns display-ready output."""
    if tool not in TOOLS:
        raise ToolError(f"Unknown tool: {tool}")
    if tool != "stats" and not (value or "").strip():
        raise ToolError("Enter some text first.")

    if tool == "stats":
        return {"tool": tool, "kind": "stats", "result": stats(value)}
    if tool == "uppercase":
        result = value.upper()
    elif tool == "lowercase":
        result = value.lower()
    elif tool == "title_case":
        result = value.title()
    elif tool == "sentence_case":
        result = sentence_case(value)
    elif tool == "bullets":
        result = bullets(value)
    elif tool == "dedupe_lines":
        result = dedupe_lines(value)
    elif tool == "sort_lines":
        result = sort_lines(value)
    elif tool == "strip_blank":
        result = strip_blank(value)
    elif tool == "slug":
        result = slug(value)
    elif tool == "summary":
        result = summary(value)
    elif tool == "key_terms":
        return {"tool": tool, "kind": "terms", "result": key_terms(value)}
    else:  # pragma: no cover - unreachable
        raise ToolError(f"Tool not implemented: {tool}")

    # A transform that produces identical text is a real no-op for most tools,
    # but an extractive summary of already-short text is a valid result.
    if tool != "summary" and result.strip() == (value or "").strip():
        raise ToolError("This tool would not change the text.")
    return {"tool": tool, "kind": "text", "result": result}
