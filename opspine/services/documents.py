"""Document production for Forge.

Every generator writes a real file with a real library and returns the stored
metadata. Content comes from the user's text — this module never invents
material and presents it as if it came from them.
"""
from __future__ import annotations

import io
import json
import re
import time
from typing import Any, Dict, List, Optional

from .. import db, safety

SUPPORTED = {
    "pdf": "PDF document",
    "docx": "Word document",
    "pptx": "PowerPoint deck",
    "xlsx": "Excel workbook",
    "md": "Markdown file",
    "png": "PNG image",
}

MAX_BODY = 60_000


class DocumentError(Exception):
    """A generation problem with a message safe to show the user."""


# --------------------------------------------------------------------------- #
# Parsing user content into a structure
# --------------------------------------------------------------------------- #
def split_lines(body: str) -> List[str]:
    return [ln.strip() for ln in (body or "").splitlines() if ln.strip()]


def split_sections(body: str) -> List[Dict[str, Any]]:
    """Treat a line starting with '#' or ending with ':' as a section heading."""
    sections: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    for raw in (body or "").splitlines():
        line = raw.rstrip()
        heading = None
        stripped = line.strip()
        if stripped.startswith("#"):
            heading = stripped.lstrip("#").strip()
        elif stripped.endswith(":") and len(stripped) <= 80 and not stripped.startswith("-"):
            heading = stripped[:-1].strip()
        if heading:
            current = {"heading": heading, "lines": []}
            sections.append(current)
        elif stripped:
            if current is None:
                current = {"heading": "", "lines": []}
                sections.append(current)
            current["lines"].append(stripped)
    return sections or [{"heading": "", "lines": []}]


def split_rows(body: str) -> List[List[str]]:
    """Parse CSV-like rows (comma, tab, or pipe separated)."""
    rows = []
    for line in split_lines(body):
        if "|" in line:
            cells = [c.strip() for c in line.strip("|").split("|")]
        elif "\t" in line:
            cells = [c.strip() for c in line.split("\t")]
        else:
            cells = [c.strip() for c in line.split(",")]
        rows.append(cells)
    return rows


# --------------------------------------------------------------------------- #
# Generators
# --------------------------------------------------------------------------- #
def _pdf(title: str, body: str, options: Dict[str, Any]) -> bytes:
    from reportlab.lib.pagesizes import A4, LETTER
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.lib.enums import TA_LEFT
    from reportlab.platypus import (
        ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
    )

    page = A4 if (options.get("page_size") or "A4").upper() == "A4" else LETTER
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=page,
        leftMargin=22 * mm, rightMargin=22 * mm,
        topMargin=20 * mm, bottomMargin=20 * mm,
        title=title,
    )
    styles = getSampleStyleSheet()
    heading = ParagraphStyle(
        "OpsHeading", parent=styles["Heading1"], fontSize=20, leading=26,
        spaceAfter=10, alignment=TA_LEFT,
    )
    sub = ParagraphStyle(
        "OpsSub", parent=styles["Heading2"], fontSize=13, leading=18,
        spaceBefore=10, spaceAfter=4,
    )
    body_style = ParagraphStyle(
        "OpsBody", parent=styles["BodyText"], fontSize=10.5, leading=16,
    )

    story: List[Any] = [Paragraph(_escape(title) or "Untitled", heading)]
    if options.get("author"):
        story.append(Paragraph(_escape(str(options["author"])), body_style))
    story.append(Spacer(1, 8))

    bullet_style = ParagraphStyle(
        "OpsBullet", parent=body_style, fontSize=10.5, leading=15,
    )

    def flush_bullets(items: List[str]) -> None:
        if not items:
            return
        story.append(
            ListFlowable(
                [
                    ListItem(Paragraph(_escape(item), bullet_style))
                    for item in items
                ],
                bulletType="bullet",
                start="\u2022",
                leftIndent=16,
            )
        )
        story.append(Spacer(1, 4))

    for section in split_sections(body):
        if section["heading"]:
            story.append(Paragraph(_escape(section["heading"]), sub))
        bullets: List[str] = []
        for line in section["lines"]:
            if line.startswith(("-", "*", "\u2022")):
                bullets.append(line.lstrip("-*\u2022 ").strip())
                continue
            if bullets:
                flush_bullets(bullets)
                bullets = []
            story.append(Paragraph(_escape(line), body_style))
            story.append(Spacer(1, 4))
        flush_bullets(bullets)

    doc.build(story)
    return buffer.getvalue()


def _escape(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _docx(title: str, body: str, options: Dict[str, Any]) -> bytes:
    from docx import Document
    from docx.shared import Pt

    document = Document()
    document.core_properties.title = title
    if options.get("author"):
        document.core_properties.author = str(options["author"])

    document.add_heading(title or "Untitled", level=0)
    for section in split_sections(body):
        if section["heading"]:
            document.add_heading(section["heading"], level=2)
        for line in section["lines"]:
            if line.startswith(("-", "*", "•")):
                document.add_paragraph(line.lstrip("-*• ").strip(), style="List Bullet")
            else:
                paragraph = document.add_paragraph(line)
                paragraph.runs[0].font.size = Pt(11)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def _pptx(title: str, body: str, options: Dict[str, Any]) -> bytes:
    from pptx import Presentation
    from pptx.util import Inches, Pt

    deck = Presentation()
    deck.slide_width = Inches(13.333)
    deck.slide_height = Inches(7.5)

    cover = deck.slides.add_slide(deck.slide_layouts[0])
    cover.shapes.title.text = title or "Untitled"
    if len(cover.placeholders) > 1:
        subtitle = options.get("subtitle") or options.get("author") or ""
        cover.placeholders[1].text = str(subtitle)

    sections = split_sections(body)
    for section in sections:
        if not section["heading"] and not section["lines"]:
            continue
        slide = deck.slides.add_slide(deck.slide_layouts[1])
        slide.shapes.title.text = section["heading"] or title or "Untitled"
        frame = slide.placeholders[1].text_frame
        frame.word_wrap = True
        lines = section["lines"][:9] or [""]
        first = True
        for line in lines:
            paragraph = frame.paragraphs[0] if first else frame.add_paragraph()
            paragraph.text = line.lstrip("-*• ").strip()[:220]
            paragraph.font.size = Pt(18)
            first = False

    buffer = io.BytesIO()
    deck.save(buffer)
    return buffer.getvalue()


def _xlsx(title: str, body: str, options: Dict[str, Any]) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    rows = split_rows(body)
    if not rows:
        raise DocumentError(
            "An Excel sheet needs rows. Add at least one line of comma-separated values."
        )
    width = max(len(r) for r in rows)
    if width == 0:
        raise DocumentError("The data has no columns.")

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = (title or "Sheet1")[:31] or "Sheet1"

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1E2A4A")
    for column, value in enumerate(rows[0], start=1):
        cell = sheet.cell(row=1, column=column, value=value)
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="left", vertical="center")

    for row_index, row in enumerate(rows[1:], start=2):
        for column, value in enumerate(row, start=1):
            cell = sheet.cell(row=row_index, column=column, value=value)
            cell.alignment = Alignment(vertical="top", wrap_text=True)

    for column in range(1, width + 1):
        sheet.column_dimensions[sheet.cell(row=1, column=column).column_letter].width = 26
    sheet.freeze_panes = "A2"

    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


def _md(title: str, body: str, options: Dict[str, Any]) -> bytes:
    parts = [f"# {title or 'Untitled'}", ""]
    if options.get("author"):
        parts += [f"*{options['author']}*", ""]
    parts.append(body.strip())
    return ("\n".join(parts).rstrip() + "\n").encode("utf-8")


def _png(title: str, body: str, options: Dict[str, Any]) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    width = int(options.get("width") or 1280)
    height = int(options.get("height") or 720)
    accent = str(options.get("accent") or "#7b9cff")
    if not re.match(r"^#[0-9a-fA-F]{6}$", accent):
        accent = "#7b9cff"
    background = str(options.get("background") or "#0b1020")

    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)

    def font(size: int):
        for candidate in (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "C:\\Windows\\Fonts\\arial.ttf",
        ):
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                continue
        return ImageFont.load_default()

    # A calm top accent bar so the image reads as designed, not as a placeholder.
    draw.rectangle([0, 0, width, max(6, height // 120)], fill=accent)

    title_font = font(max(28, width // 22))
    body_font = font(max(16, width // 52))
    margin = max(40, width // 20)

    y = margin + height // 12
    draw.multiline_text(
        (margin, y), (title or "Untitled")[:90],
        font=title_font, fill="#f4f7ff", spacing=10,
    )
    y += title_font.size * 2

    wrapped: List[str] = []
    for line in split_lines(body)[:14]:
        words, current = line.split(), ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if draw.textlength(candidate, font=body_font) > width - margin * 2:
                wrapped.append(current)
                current = word
            else:
                current = candidate
        if current:
            wrapped.append(current)
        wrapped.append("")

    for line in wrapped[:18]:
        draw.text((margin, y), line, font=body_font, fill="#b9c6e6")
        y += body_font.size * 1.6
        if y > height - margin:
            break

    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


GENERATORS = {
    "pdf": _pdf,
    "docx": _docx,
    "pptx": _pptx,
    "xlsx": _xlsx,
    "md": _md,
    "png": _png,
}


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #
def generate(fmt: str, title: str, body: str, options: Dict[str, Any]) -> Dict[str, Any]:
    """Generate a file, store it, record metadata, and return that metadata."""
    fmt = (fmt or "").lower().lstrip(".")
    if fmt not in GENERATORS:
        raise DocumentError(
            f"Unsupported format '{fmt}'. Choose one of: {', '.join(SUPPORTED)}."
        )
    if len(body) > MAX_BODY:
        raise DocumentError(f"Content must be {MAX_BODY:,} characters or fewer.")
    if fmt in ("xlsx",) and not split_lines(body):
        raise DocumentError("Add some comma-separated rows for the spreadsheet.")

    try:
        blob = GENERATORS[fmt](title, body, options or {})
    except DocumentError:
        raise
    except Exception as exc:  # library-level failure: report, do not hide
        raise DocumentError(
            f"Could not build the {fmt.upper()} file: {exc.__class__.__name__}: {exc}"
        ) from exc

    if not blob:
        raise DocumentError("The generator produced an empty file. Nothing was saved.")

    filename = safety.build_filename(title or "document", fmt)
    target = safety.storage_dir() / filename
    target.write_bytes(blob)

    record = {
        "title": title or "Untitled",
        "format": fmt,
        "filename": filename,
        "bytes": len(blob),
        "options": json.dumps(options or {}),
        "created_at": time.time(),
    }
    doc_id = db.execute(
        "INSERT INTO documents (title, format, filename, bytes, options, created_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            record["title"], record["format"], record["filename"],
            record["bytes"], record["options"], record["created_at"],
        ),
    )
    record["id"] = doc_id
    record["options"] = options or {}
    return record


def list_documents(query: str = "") -> List[Dict[str, Any]]:
    if query:
        like = f"%{query}%"
        records = db.rows(
            "SELECT id, title, format, filename, bytes, created_at FROM documents "
            "WHERE title LIKE ? OR format LIKE ? ORDER BY created_at DESC",
            (like, like),
        )
    else:
        records = db.rows(
            "SELECT id, title, format, filename, bytes, created_at FROM documents "
            "ORDER BY created_at DESC"
        )
    for record in records:
        record["missing"] = safety.locate(record["filename"]) is None
    return records


def get_document(doc_id: int) -> Optional[Dict[str, Any]]:
    record = db.one(
        "SELECT id, title, format, filename, bytes, options, created_at "
        "FROM documents WHERE id = ?",
        (doc_id,),
    )
    if record:
        record["options"] = json.loads(record["options"] or "{}")
        record["missing"] = safety.locate(record["filename"]) is None
    return record


def delete_document(doc_id: int) -> bool:
    record = db.one("SELECT filename FROM documents WHERE id = ?", (doc_id,))
    if record is None:
        return False
    safety.delete(record["filename"])
    db.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    return True
