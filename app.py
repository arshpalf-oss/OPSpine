"""OPSpine Flask Application - single backend serving all routes and API."""
import os
import sys
import json
import time
import io
import mimetypes
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_file, redirect, abort, g

sys.path.insert(0, str(Path(__file__).parent))

from core.db import (
    init_db, get_db, get_setting, set_setting, log_activity, record_visit,
    get_recent_activity, get_visits, backup_all, restore_all, DATA_DIR
)
from core.ai_core import ai_core
from core.forge_engine import generate as forge_generate, DOCS_DIR
from core.kronos_engine import parse_natural_language, detect_clashes, suggest_times

app = Flask(__name__, static_folder="static", template_folder="templates")
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB uploads

# Initialize DB on startup
init_db()

# ── Route manifest ──────────────────────────────────────────────────────────

# Layout modes:
#   "hub"       — Full-screen landing (Dashboard): no rail, no toolbar, tiles + entry point
#   "abyss"     — Chat-style: left history sidebar + right tools strip + center
#   "tool"      — Dedicated tool: left history sidebar (hideable) + right connectors (icon-min) + center
#   "system"    — Utility page (Library, Settings): collapsed rail + toolbar
ROUTES = [
    {"path": "/dashboard", "key": "dashboard", "label": "Dashboard", "icon": "home", "group": "parent", "layout": "hub"},
    {"path": "/abyss", "key": "home", "label": "Abyss", "icon": "sparkles", "shortcut": "1", "group": "workspace", "description": "Central AI router", "layout": "abyss"},
    {"path": "/scout", "key": "verify", "label": "Scout", "icon": "search", "shortcut": "2", "group": "workspace", "description": "Research & verification", "layout": "tool"},
    {"path": "/forge", "key": "studio", "label": "Forge", "icon": "hammer", "shortcut": "3", "group": "workspace", "description": "Document production", "layout": "tool"},
    {"path": "/quill", "key": "draft", "label": "Quill", "icon": "pen", "shortcut": "4", "group": "workspace", "description": "Writing & drafting", "layout": "tool"},
    {"path": "/kronos", "key": "cadence", "label": "Kronos", "icon": "calendar", "shortcut": "5", "group": "workspace", "description": "Calendar & reminders", "layout": "tool"},
    {"path": "/whiteboard", "key": "whiteboard", "label": "Whiteboard", "icon": "nodes", "shortcut": "6", "group": "workspace", "description": "Visual thinking", "layout": "tool"},
    {"path": "/dash", "key": "shortcuts", "label": "Dash", "icon": "zap", "shortcut": "7", "group": "workspace", "description": "Shortcuts & quick actions", "layout": "tool"},
    {"path": "/working-board", "key": "board", "label": "Working Board", "icon": "board", "shortcut": "8", "group": "workspace", "description": "Project execution", "layout": "tool"},
    {"path": "/library", "key": "vault", "label": "Library", "icon": "folder", "group": "system", "description": "Files & documents", "layout": "system"},
    {"path": "/settings", "key": "settings", "label": "Settings", "icon": "settings", "group": "system", "description": "Configuration", "layout": "system"},
]

WORKSPACE_PALETTES = {
    "dashboard": {
        "bg": "#0a0e1a", "ink": "#e8ecf8", "line": "rgba(255,255,255,.10)",
        "accent": "#7b9cff", "glass": "rgba(20,26,46,.72)", "glass2": "rgba(255,255,255,.06)",
        "ambient": "aurora", "ink_soft": "rgba(232,236,248,.72)", "ink_mute": "rgba(232,236,248,.45)"
    },
    "home": {  # Abyss
        "bg": "#060810", "ink": "#dfe6ff", "line": "rgba(140,170,255,.14)",
        "accent": "#8faeff", "glass": "rgba(14,20,40,.78)", "glass2": "rgba(143,174,255,.06)",
        "ambient": "hologram", "ink_soft": "rgba(223,230,255,.70)", "ink_mute": "rgba(223,230,255,.42)"
    },
    "verify": {  # Scout — Synecdoche sky-glass newsletter aesthetic
        "bg": "#3d74b8", "ink": "#ffffff", "line": "rgba(255,255,255,.22)",
        "accent": "#ffd166", "glass": "rgba(255,255,255,.16)", "glass2": "rgba(255,255,255,.08)",
        "ambient": "scout-sky", "ink_soft": "rgba(255,255,255,.85)", "ink_mute": "rgba(255,255,255,.6)"
    },
    "studio": {  # Forge — Spinlab RGB builder (pure black, hot pink glow, pixel grid)
        "bg": "#05060a", "ink": "#f5f5fa", "line": "rgba(255,255,255,.08)",
        "accent": "#ff2d6f", "glass": "rgba(18,20,28,.72)", "glass2": "rgba(255,45,111,.06)",
        "ambient": "forge-grid", "ink_soft": "rgba(245,245,250,.72)", "ink_mute": "rgba(245,245,250,.40)"
    },
    "draft": {  # Quill — YourSaaS landing (white/light blue, bold sans, blue CTA)
        "bg": "#f7f9ff", "ink": "#0a0e1a", "line": "rgba(10,30,80,.10)",
        "accent": "#2563eb", "glass": "rgba(255,255,255,.7)", "glass2": "rgba(37,99,235,.05)",
        "ambient": "quill-grid", "ink_soft": "rgba(10,14,26,.7)", "ink_mute": "rgba(10,14,26,.45)"
    },
    "cadence": {  # Kronos — Postcraft neobrutalist (white/lavender, thick black borders, chunky shadows)
        "bg": "#f4f0ff", "ink": "#0a0a0a", "line": "#000",
        "accent": "#0a0a0a", "glass": "#ffffff", "glass2": "rgba(0,0,0,.04)",
        "ambient": "brut", "ink_soft": "rgba(10,10,10,.7)", "ink_mute": "rgba(10,10,10,.5)"
    },
    "whiteboard": {  # Whiteboard — dark node graph (purple/orange accents on near-black)
        "bg": "#08090e", "ink": "#f0f0f8", "line": "rgba(255,255,255,.08)",
        "accent": "#a78bfa", "glass": "rgba(16,18,28,.82)", "glass2": "rgba(167,139,250,.05)",
        "ambient": "black", "ink_soft": "rgba(240,240,248,.7)", "ink_mute": "rgba(240,240,248,.4)"
    },
    "shortcuts": {  # Dash — Network Traffic Analyzer (near-black, mono title, neon stat accents)
        "bg": "#07090d", "ink": "#e4e8f0", "line": "rgba(255,255,255,.08)",
        "accent": "#22c55e", "glass": "rgba(20,22,30,.7)", "glass2": "rgba(34,197,94,.05)",
        "ambient": "telemetry", "ink_soft": "rgba(228,232,240,.68)", "ink_mute": "rgba(228,232,240,.38)"
    },
    "board": {  # Working Board — FlowForge canvas (dark dot grid, node connections)
        "bg": "#0a0b10", "ink": "#e8eaf2", "line": "rgba(255,255,255,.07)",
        "accent": "#f97316", "glass": "rgba(20,22,30,.8)", "glass2": "rgba(249,115,22,.05)",
        "ambient": "dots", "ink_soft": "rgba(232,234,242,.7)", "ink_mute": "rgba(232,234,242,.4)"
    },
    "vault": {  # Library (deep indigo)
        "bg": "#0c0f1d", "ink": "#d4dcf0", "line": "rgba(160,180,230,.10)",
        "accent": "#90b0ff", "glass": "rgba(18,22,38,.80)", "glass2": "rgba(144,176,255,.05)",
        "ambient": "deep", "ink_soft": "rgba(212,220,240,.68)", "ink_mute": "rgba(212,220,240,.40)"
    },
    "settings": {
        "bg": "#0c101c", "ink": "#d0d6e8", "line": "rgba(150,170,220,.10)",
        "accent": "#7b9cff", "glass": "rgba(18,22,36,.80)", "glass2": "rgba(123,156,255,.05)",
        "ambient": "deep", "ink_soft": "rgba(208,214,232,.68)", "ink_mute": "rgba(208,214,232,.40)"
    },
}

KEY_TO_PATH = {r["key"]: r["path"] for r in ROUTES}
PATH_TO_KEY = {r["path"]: r["key"] for r in ROUTES}


def get_workspace_key(path: str) -> str:
    """Resolve URL path to workspace key."""
    if path in ("/", ""):
        return "dashboard"
    return PATH_TO_KEY.get(path, "dashboard")


# ── Page routes ─────────────────────────────────────────────────────────────

@app.route("/")
def root():
    return redirect("/dashboard")

@app.route("/<path:subpath>")
def catch_all(subpath):
    """Single-page entry - serves the shell for all known routes."""
    path = "/" + subpath.rstrip("/")
    key = get_workspace_key(path)
    record_visit(key)
    
    # Build initial state for server render
    return render_template("index.html",
        routes=ROUTES,
        palettes=WORKSPACE_PALETTES,
        initial_path=path if path != "/" else "/dashboard",
        initial_key=key,
    )


# ── API: Meta ───────────────────────────────────────────────────────────────

@app.route("/api/routes")
def api_routes():
    return jsonify({
        "routes": ROUTES,
        "palettes": WORKSPACE_PALETTES,
        "keyToPath": KEY_TO_PATH,
        "pathToKey": PATH_TO_KEY,
    })

@app.route("/api/meta")
def api_meta():
    return jsonify({
        "version": "1.0.0",
        "name": "OPSpine",
        "local_mode": True,
        "time": time.time(),
        "timezone": get_setting("timezone", "UTC"),
    })


# ── API: Settings ───────────────────────────────────────────────────────────

@app.route("/api/settings", methods=["GET", "POST"])
def api_settings():
    if request.method == "GET":
        conn = get_db()
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        conn.close()
        settings = {}
        for r in rows:
            try:
                settings[r["key"]] = json.loads(r["value"])
            except json.JSONDecodeError:
                settings[r["key"]] = r["value"]
        
        # Mask API keys
        safe_settings = dict(settings)
        for k in list(safe_settings.keys()):
            if k.startswith("ai_") and k.endswith("_key") and safe_settings[k]:
                v = str(safe_settings[k])
                safe_settings[k] = v[:4] + "****" + v[-4:] if len(v) > 8 else "****"
        safe_settings["_provider_status"] = ai_core.get_provider_status()
        return jsonify(safe_settings)
    
    data = request.get_json(force=True)
    for key, value in data.items():
        # Only allow known settings keys
        if key.startswith("_"):
            continue
        set_setting(key, value)
    return jsonify({"success": True})


# ── API: Dashboard ──────────────────────────────────────────────────────────

@app.route("/api/dashboard")
def api_dashboard():
    visits = get_visits()
    activity = get_recent_activity(30)
    conn = get_db()
    
    # Stats
    brief_count = conn.execute("SELECT COUNT(*) FROM briefs").fetchone()[0]
    doc_count = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]
    task_count = conn.execute("SELECT COUNT(*) FROM tasks WHERE status != 'done'").fetchone()[0]
    event_count = conn.execute("SELECT COUNT(*) FROM events WHERE start_time > ? AND start_time < ?", 
                               (time.time(), time.time() + 86400*7)).fetchone()[0]
    board_count = conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0]
    conn.close()
    
    return jsonify({
        "greeting": _greeting(),
        "visits": visits,
        "activity": activity,
        "stats": {
            "briefs": brief_count,
            "documents": doc_count,
            "pending_tasks": task_count,
            "upcoming_events": event_count,
            "boards": board_count,
        },
        "providers": ai_core.get_provider_status(),
        "local_only": ai_core.is_local_only(),
    })


def _greeting() -> str:
    hour = time.localtime().tm_hour
    name = get_setting("user_name", "Operator")
    if hour < 5:
        return f"Working late, {name}"
    elif hour < 12:
        return f"Good morning, {name}"
    elif hour < 17:
        return f"Good afternoon, {name}"
    else:
        return f"Good evening, {name}"


# ── API: Commands ───────────────────────────────────────────────────────────

@app.route("/api/commands")
def api_commands():
    conn = get_db()
    rows = conn.execute("SELECT * FROM commands ORDER BY created_at").fetchall()
    conn.close()
    return jsonify({"commands": [dict(r) for r in rows]})

@app.route("/api/commands", methods=["POST"])
def api_add_command():
    data = request.get_json(force=True)
    conn = get_db()
    conn.execute(
        "INSERT INTO commands (name, shortcut, workspace, action, icon, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (data.get("name"), data.get("shortcut"), data.get("workspace"), 
         data.get("action"), data.get("icon", "zap"), time.time())
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ── API: Activity ───────────────────────────────────────────────────────────

@app.route("/api/activity")
def api_activity():
    limit = request.args.get("limit", 30, type=int)
    return jsonify({"activity": get_recent_activity(limit)})


# ── API: AI Core ────────────────────────────────────────────────────────────

@app.route("/api/ai/complete", methods=["POST"])
def api_ai_complete():
    data = request.get_json(force=True)
    task = data.get("task", "")
    opts = data.get("opts", {})
    result = ai_core.complete(task, opts)
    return jsonify(result)

@app.route("/api/ai/route", methods=["POST"])
def api_ai_route():
    data = request.get_json(force=True)
    prompt = data.get("prompt", "")
    result = ai_core.route_prompt(prompt)
    return jsonify(result)

@app.route("/api/ai/search", methods=["POST"])
def api_ai_search():
    data = request.get_json(force=True)
    query = data.get("query", "")
    opts = data.get("opts", {})
    result = ai_core.search(query, opts)
    return jsonify(result)

@app.route("/api/ai/verify", methods=["POST"])
def api_ai_verify():
    data = request.get_json(force=True)
    claim = data.get("claim", "")
    opts = data.get("opts", {})
    result = ai_core.verify_claim(claim, opts)
    return jsonify(result)

@app.route("/api/ai/status")
def api_ai_status():
    return jsonify({
        "local_only": ai_core.is_local_only(),
        "providers": ai_core.get_provider_status(),
    })

@app.route("/api/ai/usage")
def api_ai_usage():
    conn = get_db()
    rows = conn.execute("SELECT * FROM ai_usage ORDER BY created_at DESC LIMIT 100").fetchall()
    conn.close()
    return jsonify({"usage": [dict(r) for r in rows]})


# ── API: Scout ──────────────────────────────────────────────────────────────

@app.route("/api/briefs", methods=["GET"])
def api_briefs():
    conn = get_db()
    rows = conn.execute("SELECT * FROM briefs ORDER BY created_at DESC LIMIT 50").fetchall()
    conn.close()
    briefs = []
    for r in rows:
        b = dict(r)
        b["evidence"] = json.loads(b.get("evidence") or "[]")
        b["citations"] = json.loads(b.get("citations") or "[]")
        briefs.append(b)
    return jsonify({"briefs": briefs})

@app.route("/api/briefs", methods=["POST"])
def api_create_brief():
    data = request.get_json(force=True)
    query = data.get("query", "")
    mode = data.get("mode", "quick")
    
    # Do research
    search_result = ai_core.search(query, {"mode": mode})
    verification = ai_core.verify_claim(query, {"mode": mode})
    
    # Generate summary
    summary = ai_core.complete(f"Provide a concise summary of research findings for: {query}", {"module": "scout"})
    
    now = time.time()
    conn = get_db()
    cursor = conn.execute(
        """INSERT INTO briefs (title, query, mode, verdict, confidence, summary, evidence, citations, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (query[:80], query, mode, verification["verdict"], verification["confidence"],
         summary["text"], json.dumps(verification.get("evidence", [])),
         json.dumps([{"title": r.get("title"), "source": r.get("source", "local")} for r in search_result["results"]]),
         now, now)
    )
    brief_id = cursor.lastrowid
    conn.commit()
    
    log_activity("scout", "create_brief", f"Brief #{brief_id}: {query[:60]}")
    record_visit("verify")
    
    # Fetch and return
    row = conn.execute("SELECT * FROM briefs WHERE id = ?", (brief_id,)).fetchone()
    conn.close()
    brief = dict(row)
    brief["evidence"] = json.loads(brief.get("evidence") or "[]")
    brief["citations"] = json.loads(brief.get("citations") or "[]")
    brief["search_results"] = search_result["results"]
    brief["verification"] = verification
    
    return jsonify(brief)

@app.route("/api/briefs/<int:bid>")
def api_get_brief(bid):
    conn = get_db()
    row = conn.execute("SELECT * FROM briefs WHERE id = ?", (bid,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    brief = dict(row)
    brief["evidence"] = json.loads(brief.get("evidence") or "[]")
    brief["citations"] = json.loads(brief.get("citations") or "[]")
    return jsonify(brief)

@app.route("/api/briefs/<int:bid>", methods=["DELETE"])
def api_delete_brief(bid):
    conn = get_db()
    conn.execute("DELETE FROM briefs WHERE id = ?", (bid,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ── API: Forge ──────────────────────────────────────────────────────────────

@app.route("/api/documents", methods=["GET"])
def api_documents():
    conn = get_db()
    rows = conn.execute("SELECT * FROM documents ORDER BY created_at DESC LIMIT 100").fetchall()
    conn.close()
    return jsonify({"documents": [dict(r) for r in rows]})

@app.route("/api/forge/generate", methods=["POST"])
def api_forge_generate():
    data = request.get_json(force=True)
    doctype = data.get("type", "pptx")
    prompt = data.get("prompt", "")
    
    if not prompt:
        return jsonify({"success": False, "error": "Prompt is required"}), 400
    
    result = forge_generate(doctype, prompt)
    if not result["success"]:
        return jsonify(result), 500
    
    # Record in DB
    now = time.time()
    conn = get_db()
    conn.execute(
        "INSERT INTO documents (title, type, filename, size, description, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (prompt[:80], result["type"], result["filename"], result["size"], prompt, now)
    )
    conn.commit()
    conn.close()
    
    log_activity("forge", "generate", f"{result['type']}: {prompt[:60]}")
    record_visit("studio")
    
    return jsonify(result)

@app.route("/api/documents/<path:filename>")
def api_download_doc(filename):
    fpath = DOCS_DIR / filename
    if not fpath.exists():
        abort(404)
    return send_file(str(fpath), as_attachment=True, download_name=filename)

@app.route("/api/documents/<int:did>", methods=["DELETE"])
def api_delete_document(did):
    conn = get_db()
    row = conn.execute("SELECT filename FROM documents WHERE id = ?", (did,)).fetchone()
    if row:
        fpath = DOCS_DIR / row["filename"]
        if fpath.exists():
            fpath.unlink()
        conn.execute("DELETE FROM documents WHERE id = ?", (did,))
        conn.commit()
    conn.close()
    return jsonify({"success": True})


# ── API: Quill ──────────────────────────────────────────────────────────────

@app.route("/api/drafts", methods=["GET"])
def api_drafts():
    conn = get_db()
    rows = conn.execute("SELECT * FROM drafts ORDER BY updated_at DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify({"drafts": [dict(r) for r in rows]})

@app.route("/api/drafts", methods=["POST"])
def api_create_draft():
    data = request.get_json(force=True)
    title = data.get("title", "Untitled Draft")
    content = data.get("content", "")
    now = time.time()
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO drafts (title, content, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (title, content, now, now)
    )
    draft_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM drafts WHERE id = ?", (draft_id,)).fetchone()
    conn.close()
    log_activity("quill", "create_draft", title[:60])
    record_visit("draft")
    return jsonify(dict(row))

@app.route("/api/drafts/<int:did>", methods=["GET"])
def api_get_draft(did):
    conn = get_db()
    row = conn.execute("SELECT * FROM drafts WHERE id = ?", (did,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    return jsonify(dict(row))

@app.route("/api/drafts/<int:did>", methods=["PUT"])
def api_update_draft(did):
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    title = data.get("title")
    content = data.get("content")
    if title is not None:
        conn.execute("UPDATE drafts SET title = ?, updated_at = ? WHERE id = ?", (title, now, did))
    if content is not None:
        conn.execute("UPDATE drafts SET content = ?, updated_at = ? WHERE id = ?", (content, now, did))
    conn.commit()
    row = conn.execute("SELECT * FROM drafts WHERE id = ?", (did,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/drafts/<int:did>", methods=["DELETE"])
def api_delete_draft(did):
    conn = get_db()
    conn.execute("DELETE FROM drafts WHERE id = ?", (did,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/quill/transform", methods=["POST"])
def api_quill_transform():
    """AI-assisted text transformation."""
    data = request.get_json(force=True)
    text = data.get("text", "")
    action = data.get("action", "improve")
    
    prompts = {
        "improve": f"Improve the following text for clarity, grammar, and professionalism:\n\n{text}",
        "formal": f"Rewrite the following text in a formal, professional tone:\n\n{text}",
        "casual": f"Rewrite the following text in a casual, conversational tone:\n\n{text}",
        "concise": f"Make the following text more concise while preserving meaning:\n\n{text}",
        "expand": f"Expand and elaborate on the following text:\n\n{text}",
        "summarize": f"Summarize the following text:\n\n{text}",
        "bullets": f"Convert the following text into clear bullet points:\n\n{text}",
        "headline": f"Write 3 compelling headline options for the following content:\n\n{text}",
    }
    
    task = prompts.get(action, prompts["improve"])
    result = ai_core.complete(task, {"module": "quill", "style": action})
    log_activity("quill", "transform", action)
    return jsonify(result)


# ── API: Kronos ─────────────────────────────────────────────────────────────

@app.route("/api/events", methods=["GET"])
def api_events():
    start = request.args.get("start", type=float)
    end = request.args.get("end", type=float)
    conn = get_db()
    if start and end:
        rows = conn.execute("SELECT * FROM events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time",
                           (start, end)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM events ORDER BY start_time DESC LIMIT 200").fetchall()
    conn.close()
    return jsonify({"events": [dict(r) for r in rows]})

@app.route("/api/events", methods=["POST"])
def api_create_event():
    data = request.get_json(force=True)
    
    # If natural language input, parse it
    if "natural_input" in data and not data.get("title"):
        parsed = parse_natural_language(data["natural_input"], get_setting("timezone", "UTC"))
        title = parsed["title"]
        start_time = parsed["start_time"]
        end_time = parsed["end_time"]
        all_day = parsed["all_day"]
        recurring = parsed["recurring"]
        priority = parsed["priority"]
    else:
        title = data.get("title", "Untitled Event")
        start_time = data.get("start_time", time.time() + 3600)
        end_time = data.get("end_time", start_time + 3600)
        all_day = data.get("all_day", 0)
        recurring = data.get("recurring")
        priority = data.get("priority", "normal")
    
    description = data.get("description", "")
    
    # Check for clashes
    conn = get_db()
    existing = conn.execute("SELECT * FROM events WHERE start_time >= ? AND start_time <= ?",
                           (start_time - 86400, end_time + 86400)).fetchall()
    clashes = detect_clashes([dict(r) for r in existing], start_time, end_time)
    
    cursor = conn.execute(
        """INSERT INTO events (title, description, start_time, end_time, all_day, recurring, priority, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (title, description, start_time, end_time, all_day, recurring, priority, time.time())
    )
    event_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    conn.close()
    
    log_activity("kronos", "create_event", title[:60])
    record_visit("cadence")
    
    return jsonify({**dict(row), "clashes": clashes})

@app.route("/api/events/<int:eid>", methods=["PUT"])
def api_update_event(eid):
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    fields = []
    vals = []
    for k in ["title", "description", "start_time", "end_time", "all_day", "recurring", "priority", "done"]:
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    vals.extend([now, eid])
    conn.execute(f"UPDATE events SET {', '.join(fields)}, created_at = created_at WHERE id = ?", vals)
    conn.commit()
    row = conn.execute("SELECT * FROM events WHERE id = ?", (eid,)).fetchone()
    conn.close()
    return jsonify(dict(row))

@app.route("/api/events/<int:eid>", methods=["DELETE"])
def api_delete_event(eid):
    conn = get_db()
    conn.execute("DELETE FROM events WHERE id = ?", (eid,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/kronos/parse", methods=["POST"])
def api_kronos_parse():
    data = request.get_json(force=True)
    text = data.get("text", "")
    parsed = parse_natural_language(text, get_setting("timezone", "UTC"))
    return jsonify(parsed)

@app.route("/api/kronos/suggest", methods=["POST"])
def api_kronos_suggest():
    data = request.get_json(force=True)
    duration = data.get("duration", 60)
    conn = get_db()
    rows = conn.execute("SELECT * FROM events WHERE start_time >= ? AND start_time <= ?",
                       (time.time(), time.time() + 86400)).fetchall()
    conn.close()
    suggestions = suggest_times([dict(r) for r in rows], duration)
    return jsonify({"suggestions": suggestions})


# ── API: Whiteboard ─────────────────────────────────────────────────────────

@app.route("/api/boards", methods=["GET"])
def api_boards():
    conn = get_db()
    rows = conn.execute("SELECT * FROM boards ORDER BY updated_at DESC LIMIT 50").fetchall()
    conn.close()
    boards = []
    for r in rows:
        b = dict(r)
        b["nodes"] = json.loads(b.get("nodes") or "[]")
        b["edges"] = json.loads(b.get("edges") or "[]")
        boards.append(b)
    return jsonify({"boards": boards})

@app.route("/api/boards", methods=["POST"])
def api_create_board():
    data = request.get_json(force=True)
    name = data.get("name", "Untitled Board")
    nodes = json.dumps(data.get("nodes", []))
    edges = json.dumps(data.get("edges", []))
    now = time.time()
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO boards (name, nodes, edges, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (name, nodes, edges, now, now)
    )
    board_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM boards WHERE id = ?", (board_id,)).fetchone()
    conn.close()
    b = dict(row)
    b["nodes"] = json.loads(b.get("nodes") or "[]")
    b["edges"] = json.loads(b.get("edges") or "[]")
    log_activity("whiteboard", "create_board", name[:60])
    record_visit("whiteboard")
    return jsonify(b)

@app.route("/api/boards/<int:bid>", methods=["GET"])
def api_get_board(bid):
    conn = get_db()
    row = conn.execute("SELECT * FROM boards WHERE id = ?", (bid,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    b = dict(row)
    b["nodes"] = json.loads(b.get("nodes") or "[]")
    b["edges"] = json.loads(b.get("edges") or "[]")
    return jsonify(b)

@app.route("/api/boards/<int:bid>", methods=["PUT"])
def api_update_board(bid):
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    if "name" in data:
        conn.execute("UPDATE boards SET name = ?, updated_at = ? WHERE id = ?", (data["name"], now, bid))
    if "nodes" in data:
        conn.execute("UPDATE boards SET nodes = ?, updated_at = ? WHERE id = ?", (json.dumps(data["nodes"]), now, bid))
    if "edges" in data:
        conn.execute("UPDATE boards SET edges = ?, updated_at = ? WHERE id = ?", (json.dumps(data["edges"]), now, bid))
    if "viewport" in data:
        conn.execute("UPDATE boards SET viewport = ?, updated_at = ? WHERE id = ?", (json.dumps(data["viewport"]), now, bid))
    conn.commit()
    row = conn.execute("SELECT * FROM boards WHERE id = ?", (bid,)).fetchone()
    conn.close()
    b = dict(row)
    b["nodes"] = json.loads(b.get("nodes") or "[]")
    b["edges"] = json.loads(b.get("edges") or "[]")
    return jsonify(b)

@app.route("/api/boards/<int:bid>", methods=["DELETE"])
def api_delete_board(bid):
    conn = get_db()
    conn.execute("DELETE FROM boards WHERE id = ?", (bid,))
    conn.execute("DELETE FROM tasks WHERE board_id = ?", (bid,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ── API: Working Board (Tasks) ─────────────────────────────────────────────

@app.route("/api/tasks", methods=["GET"])
def api_tasks():
    board_id = request.args.get("board_id", type=int)
    conn = get_db()
    if board_id:
        rows = conn.execute("SELECT * FROM tasks WHERE board_id = ? ORDER BY created_at", (board_id,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM tasks ORDER BY updated_at DESC LIMIT 200").fetchall()
    conn.close()
    return jsonify({"tasks": [dict(r) for r in rows]})

@app.route("/api/tasks", methods=["POST"])
def api_create_task():
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    cursor = conn.execute(
        """INSERT INTO tasks (title, description, status, priority, owner, due_date, board_id, x, y, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (data.get("title", "New Task"), data.get("description", ""), data.get("status", "todo"),
         data.get("priority", "normal"), data.get("owner"), data.get("due_date"),
         data.get("board_id"), data.get("x", 0), data.get("y", 0), now, now)
    )
    task_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
    conn.close()
    log_activity("working-board", "create_task", data.get("title", "New Task")[:60])
    record_visit("board")
    return jsonify(dict(row))

@app.route("/api/tasks/<int:tid>", methods=["PUT"])
def api_update_task(tid):
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    fields = []
    vals = []
    for k in ["title", "description", "status", "priority", "owner", "due_date", "board_id", "x", "y"]:
        if k in data:
            fields.append(f"{k} = ?")
            vals.append(data[k])
    vals.extend([now, tid])
    conn.execute(f"UPDATE tasks SET {', '.join(fields)}, updated_at = ? WHERE id = ?", vals)
    conn.commit()
    row = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
    conn.close()
    
    # If task is done/due, push to Kronos as event if needed
    if data.get("status") == "in_progress" and data.get("due_date"):
        # Already handled by client-side push to Kronos
        pass
    
    return jsonify(dict(row))

@app.route("/api/tasks/<int:tid>", methods=["DELETE"])
def api_delete_task(tid):
    conn = get_db()
    conn.execute("DELETE FROM tasks WHERE id = ?", (tid,))
    conn.execute("DELETE FROM task_links WHERE source_id = ? OR target_id = ?", (tid, tid))
    conn.commit()
    conn.close()
    return jsonify({"success": True})

@app.route("/api/tasks/push-to-kronos", methods=["POST"])
def api_push_tasks_to_kronos():
    """Push board tasks to Kronos calendar as scheduled events."""
    data = request.get_json(force=True)
    task_ids = data.get("task_ids", [])
    conn = get_db()
    pushed = 0
    now = time.time()
    for tid in task_ids:
        task = conn.execute("SELECT * FROM tasks WHERE id = ?", (tid,)).fetchone()
        if task and task["due_date"]:
            # Create event at due date
            start = task["due_date"]
            end = start + 3600  # 1 hour block
            conn.execute(
                "INSERT INTO events (title, description, start_time, end_time, priority, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (task["title"], task["description"], start, end, task["priority"], "board", now)
            )
            pushed += 1
    conn.commit()
    conn.close()
    log_activity("working-board", "push_to_kronos", f"{pushed} tasks pushed")
    return jsonify({"success": True, "pushed": pushed})


# ── API: Conversations (per-workspace chat) ─────────────────────────────────

@app.route("/api/conversations", methods=["GET"])
def api_conversations():
    workspace = request.args.get("workspace")
    conn = get_db()
    if workspace:
        rows = conn.execute("SELECT * FROM conversations WHERE workspace = ? ORDER BY updated_at DESC", (workspace,)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 50").fetchall()
    conn.close()
    convos = []
    for r in rows:
        c = dict(r)
        c["messages"] = json.loads(c.get("messages") or "[]")
        convos.append(c)
    return jsonify({"conversations": convos})

@app.route("/api/conversations/<int:cid>", methods=["GET"])
def api_get_conversation(cid):
    conn = get_db()
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone()
    conn.close()
    if not row:
        abort(404)
    c = dict(row)
    c["messages"] = json.loads(c.get("messages") or "[]")
    return jsonify(c)

@app.route("/api/conversations", methods=["POST"])
def api_create_conversation():
    data = request.get_json(force=True)
    workspace = data.get("workspace", "abyss")
    messages = data.get("messages", [])
    now = time.time()
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO conversations (workspace, messages, created_at, updated_at) VALUES (?, ?, ?, ?)",
        (workspace, json.dumps(messages), now, now)
    )
    cid = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone()
    conn.close()
    c = dict(row)
    c["messages"] = json.loads(c.get("messages") or "[]")
    return jsonify(c)

@app.route("/api/conversations/<int:cid>", methods=["PUT"])
def api_update_conversation(cid):
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    if "messages" in data:
        conn.execute("UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?",
                    (json.dumps(data["messages"]), now, cid))
    conn.commit()
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone()
    conn.close()
    c = dict(row)
    c["messages"] = json.loads(c.get("messages") or "[]")
    return jsonify(c)

@app.route("/api/conversations/<int:cid>/message", methods=["POST"])
def api_convo_message(cid):
    """Add a user message and get AI response."""
    data = request.get_json(force=True)
    msg = data.get("message", "")
    workspace = data.get("workspace", "abyss")
    
    conn = get_db()
    row = conn.execute("SELECT * FROM conversations WHERE id = ?", (cid,)).fetchone()
    if not row:
        conn.close()
        abort(404)
    
    messages = json.loads(row["messages"] or "[]")
    messages.append({"role": "user", "content": msg, "ts": time.time()})
    
    # Get AI response
    if workspace == "scout":
        result = ai_core.complete(msg, {"module": "scout"})
    elif workspace == "quill":
        result = ai_core.complete(msg, {"module": "quill"})
    elif workspace == "forge":
        result = ai_core.complete(msg, {"module": "forge"})
    else:
        result = ai_core.complete(msg, {"module": workspace})
    
    messages.append({"role": "assistant", "content": result["text"], "ts": time.time(), "provider": result["provider"], "fallback": result["fallback"]})
    
    now = time.time()
    conn.execute("UPDATE conversations SET messages = ?, updated_at = ? WHERE id = ?",
                (json.dumps(messages), now, cid))
    conn.commit()
    conn.close()
    
    return jsonify({"messages": messages, "response": result})


# ── API: Knowledge / Library ────────────────────────────────────────────────

@app.route("/api/knowledge", methods=["GET"])
def api_knowledge():
    conn = get_db()
    rows = conn.execute("SELECT * FROM knowledge ORDER BY created_at DESC LIMIT 100").fetchall()
    conn.close()
    return jsonify({"knowledge": [dict(r) for r in rows]})

@app.route("/api/knowledge", methods=["POST"])
def api_add_knowledge():
    data = request.get_json(force=True)
    now = time.time()
    conn = get_db()
    conn.execute(
        "INSERT INTO knowledge (title, content, tags, source, created_at) VALUES (?, ?, ?, ?, ?)",
        (data.get("title", ""), data.get("content", ""), json.dumps(data.get("tags", [])),
         data.get("source"), now)
    )
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ── API: Inbox ──────────────────────────────────────────────────────────────

@app.route("/api/inbox", methods=["GET"])
def api_inbox():
    conn = get_db()
    rows = conn.execute("SELECT * FROM inbox ORDER BY created_at DESC LIMIT 50").fetchall()
    conn.close()
    return jsonify({"inbox": [dict(r) for r in rows]})

@app.route("/api/inbox/<int:iid>/read", methods=["POST"])
def api_mark_read(iid):
    conn = get_db()
    conn.execute("UPDATE inbox SET read = 1 WHERE id = ?", (iid,))
    conn.commit()
    conn.close()
    return jsonify({"success": True})


# ── API: Backup/Restore ────────────────────────────────────────────────────

@app.route("/api/system/backup", methods=["POST"])
def api_backup():
    data = backup_all()
    return jsonify(data)

@app.route("/api/system/restore", methods=["POST"])
def api_restore():
    data = request.get_json(force=True)
    success = restore_all(data)
    return jsonify({"success": success})

@app.route("/api/system/clear-samples", methods=["POST"])
def api_clear_samples():
    conn = get_db()
    # Keep settings, clear everything else
    for tbl in ["activity", "visits", "events", "briefs", "documents", "drafts",
                "boards", "tasks", "task_links", "conversations", "ai_usage", "inbox", "uploads"]:
        conn.execute(f"DELETE FROM {tbl}")
    conn.commit()
    conn.close()
    # Re-seed visits and commands
    init_db()
    return jsonify({"success": True})


# ── Error handlers ──────────────────────────────────────────────────────────

@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/"):
        return jsonify({"error": "Not found", "path": request.path}), 404
    return redirect("/dashboard")

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Internal server error", "message": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
