"""The workspace registry.

One list defines navigation, shortcuts, palette entries, and the page registry.
Both the server (which template to render) and the browser (sidebar and palette)
read from this, so they cannot drift apart.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

WORKSPACES: List[Dict[str, Any]] = [
    {
        "key": "dashboard",
        "path": "/dashboard",
        "name": "Dashboard",
        "tagline": "Your launch point",
        "description": "Every workspace in one place, plus what you actually did recently.",
        "shortcut": "0",
        "accent": "#8faeff",
        "group": "launcher",
        "template": "workspaces/dashboard.html",
        "style": "css/dashboard.css",
        "script": "js/workspaces/dashboard.js",
        "primary_action": "Open Abyss",
    },
    {
        "key": "abyss",
        "path": "/abyss",
        "name": "Abyss",
        "tagline": "Central assistant",
        "description": "Conversations with a configured model, or honest local tools.",
        "shortcut": "1",
        "accent": "#8faeff",
        "group": "create",
        "template": "workspaces/abyss.html",
        "style": "css/abyss.css",
        "script": "js/workspaces/abyss.js",
        "primary_action": "Send message",
    },
    {
        "key": "scout",
        "path": "/scout",
        "name": "Scout",
        "tagline": "Research and evidence",
        "description": "Sourced web results when a provider is set, local notes always.",
        "shortcut": "2",
        "accent": "#ffd166",
        "group": "create",
        "template": "workspaces/scout.html",
        "style": "css/scout.css",
        "script": "js/workspaces/scout.js",
        "primary_action": "New research session",
    },
    {
        "key": "forge",
        "path": "/forge",
        "name": "Forge",
        "tagline": "Document production",
        "description": "Real PPTX, DOCX, XLSX, PDF, Markdown and PNG files, built locally.",
        "shortcut": "3",
        "accent": "#ff2d6f",
        "group": "create",
        "template": "workspaces/forge.html",
        "style": "css/forge.css",
        "script": "js/workspaces/forge.js",
        "primary_action": "Generate file",
    },
    {
        "key": "quill",
        "path": "/quill",
        "name": "Quill",
        "tagline": "Writing and drafting",
        "description": "A quiet editor with autosave, word counts and offline text tools.",
        "shortcut": "4",
        "accent": "#2563eb",
        "group": "create",
        "template": "workspaces/quill.html",
        "style": "css/quill.css",
        "script": "js/workspaces/quill.js",
        "primary_action": "New draft",
    },
    {
        "key": "kronos",
        "path": "/kronos",
        "name": "Kronos",
        "tagline": "Calendar and planning",
        "description": "Month, week and day views with plain-English event entry.",
        "shortcut": "5",
        "accent": "#c9b6ff",
        "group": "organise",
        "template": "workspaces/kronos.html",
        "style": "css/kronos.css",
        "script": "js/workspaces/kronos.js",
        "primary_action": "New event",
    },
    {
        "key": "whiteboard",
        "path": "/whiteboard",
        "name": "Whiteboard",
        "tagline": "Visual thinking",
        "description": "Place notes, connect ideas, and keep the board on disk.",
        "shortcut": "6",
        "accent": "#c4a1ff",
        "group": "organise",
        "template": "workspaces/whiteboard.html",
        "style": "css/whiteboard.css",
        "script": "js/workspaces/whiteboard.js",
        "primary_action": "Add note",
    },
    {
        "key": "dash",
        "path": "/dash",
        "name": "Dash",
        "tagline": "Commands and shortcuts",
        "description": "Every command in one table, searchable, with its real shortcut.",
        "shortcut": "7",
        "accent": "#5eead4",
        "group": "organise",
        "template": "workspaces/dash.html",
        "style": "css/dash.css",
        "script": "js/workspaces/dash.js",
        "primary_action": "Run first command",
    },
    {
        "key": "working-board",
        "path": "/working-board",
        "name": "Working Board",
        "tagline": "Project execution",
        "description": "Tasks with status, priority and due dates, saved locally.",
        "shortcut": "8",
        "accent": "#ff8a3d",
        "group": "organise",
        "template": "workspaces/working-board.html",
        "style": "css/working-board.css",
        "script": "js/workspaces/working-board.js",
        "primary_action": "New task",
    },
    {
        "key": "library",
        "path": "/library",
        "name": "Library",
        "tagline": "Everything saved",
        "description": "Generated files and saved work, with download and delete.",
        "shortcut": None,
        "accent": "#9db4ff",
        "group": "system",
        "template": "workspaces/library.html",
        "style": "css/library.css",
        "script": "js/workspaces/library.js",
        "primary_action": "Search library",
    },
    {
        "key": "settings",
        "path": "/settings",
        "name": "Settings",
        "tagline": "Configuration",
        "description": "Providers, local-only mode, motion, and backups.",
        "shortcut": None,
        "accent": "#b9c6e6",
        "group": "system",
        "template": "workspaces/settings.html",
        "style": "css/settings.css",
        "script": "js/workspaces/settings.js",
        "primary_action": "Save settings",
    },
]

BY_KEY = {w["key"]: w for w in WORKSPACES}
BY_PATH = {w["path"]: w for w in WORKSPACES}

#: Workspaces reachable with Ctrl/Cmd+digit, in digit order.
SHORTCUT_TABLE = {
    w["shortcut"]: w["key"] for w in WORKSPACES if w["shortcut"]
}


def get(key: str) -> Optional[Dict[str, Any]]:
    return BY_KEY.get(key)


def for_rail() -> List[Dict[str, Any]]:
    """Entries shown in the sidebar, grouped."""
    return [
        {
            "key": w["key"], "path": w["path"], "name": w["name"],
            "shortcut": w["shortcut"], "group": w["group"],
            "accent": w["accent"], "tagline": w["tagline"],
        }
        for w in WORKSPACES
    ]
