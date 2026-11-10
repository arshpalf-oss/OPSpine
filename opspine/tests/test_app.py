"""Automated tests for the behaviours the app depends on.

Run with:  python -m unittest discover -s opspine/tests -v

Every test uses a throwaway data directory, so running the suite never touches
`data/opspine.db` or the documents you have generated.
"""
from __future__ import annotations

import importlib
import io
import json
import os
import shutil
import sys
import tempfile
import time
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# The data directory is read at import time by opspine.db, so point it at a
# temporary folder before anything imports the package.
_TMP = tempfile.mkdtemp(prefix="opspine-tests-")
os.environ["OPSPINE_DATA_DIR"] = _TMP
os.environ["OPSPINE_DB_PATH"] = str(Path(_TMP) / "opspine.db")

from opspine import create_app  # noqa: E402
from opspine import db  # noqa: E402
from opspine import safety  # noqa: E402
from opspine.services import (  # noqa: E402
    backup, boards, conversations, documents, drafts, kronos, providers,
    research, settings, tasks,
)


def _fresh_app():
    """Reset every table so each test starts from a clean install."""
    db.init_db()  # idempotent; creates the schema on first use
    for table in (
        "messages", "conversations", "drafts", "events", "tasks", "boards",
        "research_results", "research_notes", "research_sessions", "documents",
        "activity",
    ):
        db.execute(f"DELETE FROM {table}")
    db.execute(
        "UPDATE settings SET value = ? WHERE key = 'local_only'", ("1",)
    )
    for key in ("provider_ai", "provider_search"):
        db.execute("UPDATE settings SET value = 'none' WHERE key = ?", (key,))
    app = create_app({"TESTING": True})
    return app


class BaseCase(unittest.TestCase):
    def setUp(self):
        self.app = _fresh_app()
        self.client = self.app.test_client()

    def json_of(self, response):
        self.assertEqual(
            response.mimetype, "application/json",
            f"expected JSON, got {response.mimetype}: {response.data[:200]!r}",
        )
        return response.get_json()


# --------------------------------------------------------------------------- #
# Database and clean install
# --------------------------------------------------------------------------- #
class TestDatabase(BaseCase):
    def test_required_tables_exist(self):
        info = db.db_health()
        required = {
            "settings", "conversations", "messages", "drafts", "events",
            "tasks", "boards", "research_sessions", "research_notes",
            "research_results", "documents", "activity",
        }
        self.assertTrue(required.issubset(set(info["tables"])), info["tables"])

    def test_init_is_repeatable(self):
        db.init_db()
        db.init_db()
        self.assertGreaterEqual(db.db_health()["user_version"], 1)

    def test_health_endpoint(self):
        data = self.json_of(self.client.get("/api/health"))
        self.assertTrue(data["ok"])
        self.assertEqual(data["status"], "healthy")


# --------------------------------------------------------------------------- #
# Settings and secrets
# --------------------------------------------------------------------------- #
class TestSettings(BaseCase):
    def test_api_key_is_stored_but_never_returned(self):
        secret = "sk-test-do-not-leak-1234567890"
        self.client.post("/api/settings", json={"key_gemini": secret})

        self.assertEqual(settings.get("key_gemini"), secret)
        self.assertTrue(settings.secret_configured()["key_gemini"])

        public = self.json_of(self.client.get("/api/settings"))
        self.assertNotIn(secret, json.dumps(public))

        bootstrap = self.client.get("/api/bootstrap")
        self.assertNotIn(secret, bootstrap.get_data(as_text=True))

        exported = self.client.get("/api/backup").get_data(as_text=True)
        self.assertNotIn(secret, exported)

    def test_empty_key_does_not_overwrite_stored_key(self):
        self.client.post("/api/settings", json={"key_groq": "keep-me"})
        self.client.post("/api/settings", json={"key_groq": ""})
        self.assertEqual(settings.get("key_groq"), "keep-me")

    def test_clear_key_flag_removes_secret(self):
        self.client.post("/api/settings", json={"key_brave": "abc"})
        self.client.post("/api/settings", json={"clear_key_brave": True})
        self.assertEqual(settings.get("key_brave"), "")

    def test_unknown_setting_key_is_not_stored(self):
        response = self.client.post("/api/settings", json={"not_a_setting": "x"})
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(db.one("SELECT value FROM settings WHERE key = ?",
                                 ("not_a_setting",)))
        self.assertEqual(settings.get("not_a_setting"), None)

    def test_invalid_motion_is_rejected(self):
        response = self.client.post("/api/settings", json={"motion": "wobbly"})
        self.assertEqual(response.status_code, 400)

    def test_theme_round_trips_and_validates(self):
        for theme in ("dark", "light"):
            self.client.post("/api/settings", json={"theme": theme})
            self.assertEqual(settings.get("theme"), theme)
        response = self.client.post("/api/settings", json={"theme": "neon"})
        self.assertEqual(response.status_code, 400)

    def test_unconverted_workspace_stays_dark(self):
        """The switch must never render a room that isn't converted yet."""
        self.client.post("/api/settings", json={"theme": "light"})
        html = self.client.get("/scout").get_data(as_text=True)
        self.assertIn('data-theme-ready="false"', html)
        self.assertIn('data-theme="dark"', html)

    def test_abyss_is_theme_ready(self):
        """Abyss ships both themes, so it must honour the stored theme."""
        self.client.post("/api/settings", json={"theme": "light"})
        html = self.client.get("/abyss").get_data(as_text=True)
        self.assertIn('data-theme-ready="true"', html)
        self.assertIn('data-theme="light"', html)
        self.client.post("/api/settings", json={"theme": "dark"})
        html = self.client.get("/abyss").get_data(as_text=True)
        self.assertIn('data-theme="dark"', html)

    def test_launcher_is_theme_ready(self):
        self.client.post("/api/settings", json={"theme": "light"})
        html = self.client.get("/dashboard").get_data(as_text=True)
        self.assertIn('data-theme-ready="true"', html)
        self.assertIn('data-theme="light"', html)

    def test_theme_is_reflected_in_the_html_element(self):
        self.client.post("/api/settings", json={"theme": "dark"})
        html = self.client.get("/dashboard").get_data(as_text=True)
        self.assertIn('data-theme="dark"', html)
        self.client.post("/api/settings", json={"theme": "light"})
        html = self.client.get("/dashboard").get_data(as_text=True)
        self.assertIn('data-theme="light"', html)

    def test_launch_mode_and_nav_validate(self):
        for field, good, bad in (
            ("launch_mode", "resume", "sometimes"),
            ("abyss_nav", "collapsed", "sideways"),
        ):
            self.assertEqual(
                self.client.post("/api/settings", json={field: good}).status_code, 200
            )
            self.assertEqual(
                self.client.post("/api/settings", json={field: bad}).status_code, 400
            )

    def test_motion_round_trips(self):
        for motion in ("calm", "cinematic", "still", "liquid"):
            self.client.post("/api/settings", json={"motion": motion})
            self.assertEqual(settings.get("motion"), motion)


# --------------------------------------------------------------------------- #
# Local-only enforcement (server side)
# --------------------------------------------------------------------------- #
class TestLocalOnly(BaseCase):
    def test_guard_blocks_when_local_only_and_provider_configured(self):
        settings.set_value("local_only", True)
        settings.set_value("provider_ai", "gemini")
        settings.set_value("key_gemini", "fake-key")
        self.assertTrue(settings.local_only())
        with self.assertRaises(providers.LocalOnlyError):
            providers._guard()

    def test_active_provider_is_none_while_local_only(self):
        settings.set_value("local_only", True)
        settings.set_value("provider_ai", "gemini")
        settings.set_value("key_gemini", "fake-key")
        self.assertEqual(settings.active_ai_provider(), "none")

    def test_guard_allows_when_local_only_off(self):
        settings.set_value("local_only", False)
        providers._guard()  # must not raise

    def test_no_outbound_attempt_happens_in_local_only(self):
        """The guard must fire before any socket is opened."""
        settings.set_value("local_only", True)
        settings.set_value("provider_ai", "gemini")
        settings.set_value("key_gemini", "fake-key")

        original = providers._post if hasattr(providers, "_post") else None
        calls = []

        def spy(*args, **kwargs):
            calls.append(1)
            raise AssertionError("outbound call attempted in local-only mode")

        if original is not None:
            providers._post = spy
        try:
            with self.assertRaises(providers.LocalOnlyError):
                providers._guard()
        finally:
            if original is not None:
                providers._post = original
        self.assertEqual(calls, [])


# --------------------------------------------------------------------------- #
# Conversations and messages
# --------------------------------------------------------------------------- #
class TestConversations(BaseCase):
    def test_create_rename_select_delete(self):
        created = self.json_of(self.client.post(
            "/api/abyss/conversations", json={"title": "First"}
        ))["conversation"]
        cid = created["id"]

        renamed = self.json_of(self.client.patch(
            f"/api/abyss/conversations/{cid}", json={"title": "Renamed"}
        ))["conversation"]
        self.assertEqual(renamed["title"], "Renamed")

        listed = self.json_of(self.client.get("/api/abyss/conversations"))["conversations"]
        self.assertEqual([c["id"] for c in listed], [cid])

        self.assertEqual(
            self.client.delete(f"/api/abyss/conversations/{cid}").status_code, 200
        )
        self.assertEqual(
            self.client.get(f"/api/abyss/conversations/{cid}").status_code, 404
        )

    def test_local_reply_is_labelled_as_local(self):
        cid = self.json_of(self.client.post(
            "/api/abyss/conversations", json={"title": "Local"}
        ))["conversation"]["id"]

        data = self.json_of(self.client.post(
            f"/api/abyss/conversations/{cid}/messages",
            json={"content": "summarise this text please", "use_ai": False},
        ))
        # Local tool results and honest refusals are both distinct modes.
        self.assertIn(data["mode"], ("local-tool", "unavailable", "provider"))
        if data["mode"] == "local-tool":
            self.assertTrue(
                str(data["reply"]["source"]).startswith(("local-tool", "local")),
                data["reply"]["source"],
            )
        else:
            self.assertEqual(data["mode"], "unavailable")
            self.assertIn("No AI provider", data["reply"]["content"])

    def test_using_provider_without_config_explains_limitation(self):
        cid = self.json_of(self.client.post(
            "/api/abyss/conversations", json={"title": "No provider"}
        ))["conversation"]["id"]
        data = self.json_of(self.client.post(
            f"/api/abyss/conversations/{cid}/messages",
            json={"content": "hello", "use_ai": True},
        ))
        self.assertEqual(data["mode"], "unavailable")
        self.assertIsNone(data["provider"])
        self.assertIn("No AI provider", data["reply"]["content"])

    def test_message_history_persists(self):
        cid = self.json_of(self.client.post(
            "/api/abyss/conversations", json={"title": "History"}
        ))["conversation"]["id"]
        self.client.post(
            f"/api/abyss/conversations/{cid}/messages",
            json={"content": "first question", "use_ai": False},
        )
        detail = self.json_of(self.client.get(f"/api/abyss/conversations/{cid}"))
        roles = [m["role"] for m in detail["conversation"]["messages"]]
        self.assertEqual(roles[0], "user")
        self.assertGreaterEqual(len(roles), 2)

    def test_empty_message_is_rejected(self):
        cid = self.json_of(self.client.post(
            "/api/abyss/conversations", json={"title": "Empty"}
        ))["conversation"]["id"]
        response = self.client.post(
            f"/api/abyss/conversations/{cid}/messages", json={"content": "   "}
        )
        self.assertEqual(response.status_code, 400)


# --------------------------------------------------------------------------- #
# Documents, filenames, and traversal defence
# --------------------------------------------------------------------------- #
class TestDocuments(BaseCase):
    def test_all_six_formats_generate_real_files(self):
        signatures = {
            "pptx": b"PK", "docx": b"PK", "xlsx": b"PK",
            "pdf": b"%PDF", "png": b"\x89PNG", "md": b"",
        }
        titles = {
            "pptx": "Deck", "docx": "Brief", "xlsx": "Sheet",
            "pdf": "Report", "png": "Image", "md": "Notes",
        }
        for fmt, magic in signatures.items():
            record = documents.generate(
                fmt=fmt, title=titles[fmt], body="Body text for the file.",
                options={},
            )
            path = safety.resolve_existing(record["filename"])
            self.assertTrue(path.is_file(), f"{fmt} file missing")
            if magic:
                self.assertTrue(
                    path.read_bytes().startswith(magic),
                    f"{fmt} did not start with {magic!r}",
                )

    def test_filename_cannot_escape_documents_dir(self):
        for hostile in ("../../app.py", "..\\..\\app.py", "/etc/passwd", "a/../../x.md"):
            with self.assertRaises(Exception):
                safety.resolve_existing(hostile)

    def test_traversal_download_is_refused(self):
        response = self.client.get("/api/library/documents/..%2f..%2fapp.py/file")
        self.assertIn(response.status_code, (400, 404))
        self.assertNotIn(b"Flask", response.data[:200])

    def test_missing_file_is_reported_not_crashed(self):
        record = documents.generate(fmt="md", title="Vanishing", body="x", options={})
        safety.resolve_existing(record["filename"]).unlink()
        listing = self.json_of(self.client.get("/api/library/"))
        entry = next(d for d in listing["documents"] if d["id"] == record["id"])
        self.assertTrue(entry["missing"])
        download = self.client.get(f"/api/library/documents/{record['id']}/file")
        self.assertEqual(download.status_code, 410)
        self.assertIn("unavailable", download.get_data(as_text=True).lower())

    def test_delete_removes_file_and_row(self):
        record = documents.generate(fmt="md", title="Delete me", body="x", options={})
        path = safety.resolve_existing(record["filename"])
        self.assertTrue(path.exists())
        self.assertEqual(
            self.client.delete(f"/api/library/documents/{record['id']}").status_code, 200
        )
        self.assertFalse(path.exists())
        self.assertEqual(self.client.delete(
            f"/api/library/documents/{record['id']}"
        ).status_code, 404)


# --------------------------------------------------------------------------- #
# Quill drafts
# --------------------------------------------------------------------------- #
class TestDrafts(BaseCase):
    def test_create_update_and_delete(self):
        created = self.json_of(self.client.post(
            "/api/quill/drafts", json={"title": "Draft", "content": "hello world"}
        ))["draft"]
        updated = self.json_of(self.client.put(
            f"/api/quill/drafts/{created['id']}",
            json={"title": "Draft v2", "content": "hello world again"},
        ))["draft"]
        self.assertEqual(updated["title"], "Draft v2")
        self.assertEqual(updated["content"], "hello world again")
        self.assertEqual(
            self.client.delete(f"/api/quill/drafts/{created['id']}").status_code, 200
        )

    def test_provider_rewrite_is_refused_without_a_provider(self):
        """Quill rewrites through Abyss, which reports an honest limitation."""
        cid = self.json_of(self.client.post(
            "/api/abyss/conversations", json={"title": "Quill rewrite"}
        ))["conversation"]["id"]
        data = self.json_of(self.client.post(
            f"/api/abyss/conversations/{cid}/messages",
            json={"content": "tighten this paragraph", "use_ai": True},
        ))
        self.assertEqual(data["mode"], "unavailable")
        self.assertIn("No AI provider", data["reply"]["content"])
        self.assertFalse(
            data["reply"]["source"].startswith("provider:"),
            "an unconfigured provider must never be impersonated",
        )


# --------------------------------------------------------------------------- #
# Kronos
# --------------------------------------------------------------------------- #
class TestKronos(BaseCase):
    def test_natural_language_parsing(self):
        from datetime import datetime
        now = datetime(2026, 11, 9, 15, 0)  # a Monday, mid-afternoon
        cases = [
            ("Design review tomorrow at 2pm for 90 minutes", "Design review"),
            ("team standup every monday", "team standup"),
            ("lunch at noon", "lunch"),
        ]
        for phrase, expected in cases:
            parsed = kronos.parse(phrase, now=now)
            self.assertIn(expected.lower(), parsed["title"].lower(), phrase)
            self.assertGreater(parsed["confidence"], 0)

    def test_crud_and_range_query(self):
        start = int(time.time()) + 3600
        created = self.json_of(self.client.post("/api/kronos/events", json={
            "title": "Review", "start_at": start, "end_at": start + 1800,
            "notes": "", "all_day": False,
        }))["event"]
        eid = created["id"]

        updated = self.json_of(self.client.put(
            f"/api/kronos/events/{eid}", json={"title": "Review v2"}
        ))["event"]
        self.assertEqual(updated["title"], "Review v2")

        found = self.json_of(self.client.get(
            f"/api/kronos/events?start={start - 86400}&end={start + 86400}"
        ))["events"]
        self.assertIn(eid, [e["id"] for e in found])

        self.assertEqual(
            self.client.delete(f"/api/kronos/events/{eid}").status_code, 200
        )

    def test_partial_update_keeps_other_fields(self):
        start = int(time.time()) + 7200
        created = self.json_of(self.client.post("/api/kronos/events", json={
            "title": "Keep notes", "start_at": start, "end_at": start + 3600,
            "notes": "important", "all_day": False,
        }))["event"]
        updated = self.json_of(self.client.put(
            f"/api/kronos/events/{created['id']}", json={"done": True}
        ))["event"]
        self.assertTrue(updated["done"])
        self.assertEqual(updated["title"], "Keep notes")
        self.assertEqual(updated["notes"], "important")
        self.assertEqual(updated["start_at"], created["start_at"])

    def test_end_before_start_is_rejected(self):
        start = int(time.time())
        response = self.client.post("/api/kronos/events", json={
            "title": "Backwards", "start_at": start, "end_at": start - 600,
        })
        self.assertEqual(response.status_code, 400)


# --------------------------------------------------------------------------- #
# Tasks and boards
# --------------------------------------------------------------------------- #
class TestTasks(BaseCase):
    def test_status_flow_and_counts(self):
        task = self.json_of(self.client.post("/api/tasks/", json={
            "title": "Ship it", "status": "todo", "priority": "high",
            "due_date": "2026-12-01",
        }))["task"]
        self.assertEqual(task["status"], "todo")

        moved = self.json_of(self.client.put(
            f"/api/tasks/{task['id']}", json={"status": "done"}
        ))["task"]
        self.assertEqual(moved["status"], "done")

        listing = self.json_of(self.client.get("/api/tasks/"))
        self.assertEqual(listing["counts"]["done"], 1)
        self.assertEqual(listing["counts"]["total"], 1)

    def test_blank_title_is_rejected(self):
        response = self.client.post("/api/tasks/", json={"title": "   "})
        self.assertEqual(response.status_code, 400)

    def test_delete_is_permanent(self):
        task = self.json_of(self.client.post(
            "/api/tasks/", json={"title": "Temp"}
        ))["task"]
        self.client.delete(f"/api/tasks/{task['id']}")
        self.assertEqual(
            self.json_of(self.client.get("/api/tasks/"))["counts"]["total"], 0
        )


class TestBoards(BaseCase):
    def test_save_and_restore(self):
        board = self.json_of(self.client.post(
            "/api/whiteboard/boards", json={"title": "Ideas"}
        ))["board"]
        data = {
            "nodes": [
                {"id": "n1", "x": 10, "y": 20, "text": "First"},
                {"id": "n2", "x": 200, "y": 90, "text": "Second"},
            ],
            "links": [{"from": "n1", "to": "n2"}],
            "viewport": {"x": 0, "y": 0, "scale": 1},
        }
        self.client.put(f"/api/whiteboard/boards/{board['id']}", json={"data": data})
        loaded = self.json_of(
            self.client.get(f"/api/whiteboard/boards/{board['id']}")
        )["board"]
        self.assertEqual(len(loaded["data"]["nodes"]), 2)
        self.assertEqual(len(loaded["data"]["links"]), 1)
        self.assertEqual(loaded["data"]["nodes"][0]["text"], "First")


# --------------------------------------------------------------------------- #
# Research and notes
# --------------------------------------------------------------------------- #
class TestResearch(BaseCase):
    def test_notes_work_without_any_provider(self):
        session = self.json_of(self.client.post(
            "/api/scout/sessions", json={"question": "What is local-first?"}
        ))["session"]
        note = self.client.post(
            f"/api/scout/sessions/{session['id']}/notes",
            json={"kind": "note", "body": "Write it down offline."},
        )
        self.assertEqual(note.status_code, 200)
        self.assertTrue(self.json_of(note)["note"]["body"])

        detail = self.json_of(
            self.client.get(f"/api/scout/sessions/{session['id']}")
        )["session"]
        self.assertEqual(len(detail["notes"]), 1)
        self.assertEqual(detail["results"], [], "no provider results may be invented")

    def test_search_without_provider_reports_unavailable(self):
        session = self.json_of(self.client.post(
            "/api/scout/sessions", json={"question": "Anything"}
        ))["session"]
        data = self.json_of(self.client.post(
            f"/api/scout/sessions/{session['id']}/search"
        ))
        self.assertFalse(data["ok"])
        self.assertIn("provider", json.dumps(data).lower())


# --------------------------------------------------------------------------- #
# Backup: export, verify, restore
# --------------------------------------------------------------------------- #
class TestBackup(BaseCase):
    def test_export_import_round_trip(self):
        self.client.post("/api/quill/drafts", json={"title": "Keep", "body": "body"})
        self.client.post("/api/tasks/", json={"title": "Task"})
        settings.set_value("key_gemini", "super-secret")

        exported = self.json_of(self.client.get("/api/backup"))
        self.assertNotIn("super-secret", json.dumps(exported))
        self.assertGreaterEqual(len(exported["tables"]["drafts"]), 1)

        db.execute("DELETE FROM drafts")
        db.execute("DELETE FROM tasks")
        self.assertEqual(drafts.list_drafts(), [])

        response = self.client.post(
            "/api/backup/restore?mode=replace", json=exported
        )
        self.assertEqual(response.status_code, 200, response.get_data(as_text=True))
        titles = [d["title"] for d in drafts.list_drafts()]
        self.assertIn("Keep", titles)
        self.assertEqual(db.one("SELECT COUNT(*) AS n FROM tasks")["n"], 1)

    def test_invalid_backup_is_rejected(self):
        response = self.client.post("/api/backup/inspect", json={"nope": True})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.mimetype, "application/json")
        self.assertFalse(response.get_json()["ok"])

    def test_non_object_backup_is_rejected(self):
        response = self.client.post("/api/backup/inspect", json=[1, 2, 3])
        self.assertEqual(response.status_code, 400)
        self.assertIn("not a json object",
                      response.get_data(as_text=True).lower())

    def test_backup_without_app_marker_is_rejected(self):
        payload = self.json_of(self.client.get("/api/backup"))
        payload["app"] = "SomethingElse"
        response = self.client.post("/api/backup/restore?mode=replace", json=payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("was not exported by opspine",
                      response.get_data(as_text=True).lower())

    def test_restore_replaces_only_when_asked(self):
        self.client.post("/api/tasks/", json={"title": "Original"})
        payload = self.json_of(self.client.get("/api/backup"))
        db.execute("DELETE FROM tasks")
        self.client.post("/api/backup/restore?mode=replace", json=payload)
        titles = [t["title"] for t in self.json_of(
            self.client.get("/api/tasks/")
        )["tasks"]]
        self.assertEqual(titles, ["Original"])


# --------------------------------------------------------------------------- #
# Pages and shell
# --------------------------------------------------------------------------- #
class TestPages(BaseCase):
    PATHS = [
        "/", "/dashboard", "/abyss", "/scout", "/forge", "/quill", "/kronos",
        "/whiteboard", "/dash", "/working-board", "/library", "/settings",
    ]

    def test_every_workspace_renders(self):
        for path in self.PATHS:
            with self.subTest(path=path):
                response = self.client.get(path, follow_redirects=True)
                self.assertEqual(response.status_code, 200, path)

    def test_root_serves_the_launcher(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        html = response.get_data(as_text=True)
        self.assertIn('class="launcher"', html)
        # The launcher is chrome-less: no app shell, no sidebar.
        self.assertNotIn('id="app-shell"', html)
        self.assertNotIn('class="sidebar', html)

    def test_dashboard_is_the_launcher(self):
        response = self.client.get("/dashboard")
        self.assertEqual(response.status_code, 200)
        self.assertIn('class="launcher"', response.get_data(as_text=True))

    def test_workspaces_keep_the_app_shell(self):
        for key in ("kronos", "forge", "settings"):
            with self.subTest(key=key):
                html = self.client.get(f"/{key}").get_data(as_text=True)
                self.assertIn('id="app-shell"', html)
                self.assertIn('class="sidebar', html)

    def test_every_workspace_has_exactly_one_navigation_bar(self):
        """One nav rail, one surface. A second bar was the reported bug."""
        for key in ("scout", "forge", "quill", "kronos", "whiteboard",
                    "dash", "working-board", "library", "settings"):
            with self.subTest(key=key):
                html = self.client.get(f"/{key}").get_data(as_text=True)
                self.assertEqual(html.count('<nav'), 1, "expected one <nav>")
                self.assertEqual(html.count('class="sidebar sidebar--left"'), 1)
                self.assertEqual(html.count('id="sidebar"'), 1)

    def test_no_global_tools_panel_anywhere(self):
        """The right-hand tools panel is gone; its content lives per workspace."""
        for key in ("scout", "forge", "quill", "kronos", "whiteboard",
                    "dash", "working-board", "library", "settings"):
            with self.subTest(key=key):
                html = self.client.get(f"/{key}").get_data(as_text=True)
                self.assertNotIn('id="tools-panel"', html)
                self.assertNotIn('id="tools-rail"', html)

    def test_forge_preview_parsing_matches_the_generator(self):
        """The live preview must not drift from what the server actually builds.

        It re-implements split_sections/split_rows in JS, so this pins the two
        together: if one side changes, this fails.
        """
        from opspine.services import documents

        self.assertEqual(
            documents.split_sections("Overview:\nText.\n\nKey points:\n- one\n- two"),
            [
                {"heading": "Overview", "lines": ["Text."]},
                {"heading": "Key points", "lines": ["- one", "- two"]},
            ],
        )
        self.assertEqual(
            documents.split_sections("# First\nbody\n# Second\nmore"),
            [{"heading": "First", "lines": ["body"]},
             {"heading": "Second", "lines": ["more"]}],
        )
        self.assertEqual(
            documents.split_sections("just one line\nand another"),
            [{"heading": "", "lines": ["just one line", "and another"]}],
        )
        self.assertEqual(documents.split_sections(""), [{"heading": "", "lines": []}])
        self.assertEqual(documents.split_rows("a,b,c\n1,2,3"),
                         [["a", "b", "c"], ["1", "2", "3"]])
        self.assertEqual(documents.split_rows("a|b|c\n1|2|3"),
                         [["a", "b", "c"], ["1", "2", "3"]])
        self.assertEqual(documents.split_rows("a\tb\tc\n1\t2\t3"),
                         [["a", "b", "c"], ["1", "2", "3"]])

    def test_workspace_reference_is_nested_inside_its_tool(self):
        """The reference column belongs to the tool, not to the shell.

        It used to render as a bare band above the workspace because it sat
        outside the tool's root element.
        """
        roots = {
            "scout": "scout", "quill": "quill", "kronos": "kronos",
            "whiteboard": "wb", "dash": "dashconsole",
            "working-board": "wboard", "library": "library",
            "settings": "settings", "forge": "forge",
        }
        for key, root in roots.items():
            with self.subTest(key=key):
                html = self.client.get(f"/{key}").get_data(as_text=True)
                aside_at = html.find('class="ws-aside"')
                root_at = html.find(f'class="{root}"')
                self.assertGreater(aside_at, 0, "reference column missing")
                self.assertGreater(root_at, 0, f"root .{root} missing")
                self.assertGreater(aside_at, root_at,
                                   "reference column must come after the root opens")

    def test_workspace_context_moved_into_the_workspace(self):
        """Nothing that was reachable became unreachable."""
        for key in ("scout", "forge", "quill", "kronos", "whiteboard",
                    "dash", "working-board", "library", "settings"):
            with self.subTest(key=key):
                html = self.client.get(f"/{key}").get_data(as_text=True)
                self.assertIn("ws-aside", html)
                self.assertIn("tools__heading", html)

    def test_no_backdrop_filter_in_any_sheet(self):
        """Blur over a parent with no background smears the page grey."""
        for sheet in sorted((REPO_ROOT / "opspine/static/css").glob("*.css")):
            with self.subTest(sheet=sheet.name):
                self.assertNotIn("backdrop-filter", sheet.read_text())

    def test_abyss_collapsed_nav_keeps_main_column_in_place(self):
        """Collapsing history must not slide the thread into the 0px track."""
        css = (REPO_ROOT / "opspine/static/css/abyss.css").read_text()
        self.assertIn('grid-template-areas: "nav main tools"', css)
        self.assertIn("grid-area: main", css)
        self.assertIn("grid-area: nav", css)

    def test_abyss_is_its_own_chat_chrome(self):
        """Abyss owns its layout: two sidebars, no global workspace chrome."""
        html = self.client.get("/abyss").get_data(as_text=True)
        self.assertEqual(html.count("<aside"), 2)
        self.assertIn('id="chat"', html)
        self.assertNotIn('id="app-shell"', html)
        self.assertNotIn('class="sidebar sidebar--left"', html)

    def test_launcher_lists_every_workspace_but_itself(self):
        html = self.client.get("/dashboard").get_data(as_text=True)
        names = ["Abyss", "Scout", "Forge", "Quill", "Kronos",
                 "Whiteboard", "Dash", "Working Board", "Library", "Settings"]
        for name in names:
            self.assertIn(f'>{name}<', html, name)

    def test_resume_mode_lands_on_the_pinned_workspace(self):
        settings.set_value("launch_mode", "resume")
        settings.set_value("last_workspace", "/kronos")
        try:
            response = self.client.get("/")
            self.assertEqual(response.status_code, 302)
            self.assertIn("/kronos", response.headers["Location"])
            # /dashboard still shows the launcher in resume mode.
            self.assertEqual(self.client.get("/dashboard").status_code, 200)
        finally:
            settings.set_value("launch_mode", "launcher")

    def test_visiting_a_workspace_remembers_it(self):
        self.client.get("/quill")
        self.assertEqual(settings.get("last_workspace"), "/quill")

    def test_unknown_path_returns_clean_404(self):
        response = self.client.get("/does-not-exist")
        self.assertEqual(response.status_code, 404)

    def test_api_error_is_json(self):
        response = self.client.get("/api/abyss/conversations/99999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.mimetype, "application/json")


# --------------------------------------------------------------------------- #
# Teardown
# --------------------------------------------------------------------------- #
def tearDownModule():
    shutil.rmtree(_TMP, ignore_errors=True)


if __name__ == "__main__":
    unittest.main(verbosity=2)
