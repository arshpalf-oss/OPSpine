# OPSpine — implementation checklist

This file records what has actually been built and verified. Every box below
was checked by exercising the running app, not by inspection alone.

Last verified: 2026-11-09

## Backend

- [x] Flask app factory with configurable host/port/data directory
- [x] Single SQLite database, WAL mode, foreign keys, busy timeout
- [x] Idempotent schema creation (safe to run against an existing file)
- [x] Tables: settings, conversations, messages, drafts, events, tasks,
      boards, research_sessions, research_notes, research_results, documents,
      activity
- [x] Parameterised queries throughout (no string-built SQL with user input)
- [x] Validation layer at every API boundary, consistent JSON error bodies
- [x] Rotating log file at `data/opspine.log`
- [x] Security headers, clean 404/500 pages, JSON errors for `/api/*`

## Safety

- [x] Server-generated filenames (`slug` + random suffix), never client-chosen
- [x] Every generated-file path re-resolved and confirmed inside
      `data/documents` before serving (`safety.resolve_existing`)
- [x] Traversal attempts rejected (`../../app.py`, absolute paths, backslashes)
- [x] Local-only mode enforced inside the provider guard, before any socket
      is opened — not just hidden in the UI
- [x] API keys write-only: stored in SQLite, never returned by any endpoint,
      excluded from backups by default
- [x] Provider requests are explicit, timeout-limited, and clearly labelled
- [x] Backup validated before any write; restore runs in one transaction
- [x] No telemetry, no cloud sync, no analytics

## Shared shell

- [x] Collapsible left sidebar; icons stay visible, labels hide, restore
      control appears
- [x] Tools panel completes collapsed **and** expanded; collapsed shows a real
      icon rail (each icon maps to a section of that workspace's panel)
- [x] Ctrl/Cmd+K command palette with workspace and record search
- [x] Ctrl/Cmd+0–8 workspace jumps
- [x] Ctrl/Cmd+Enter runs the registered primary action
- [x] Esc closes overlays, palette, drawers and dialogs
- [x] Shortcut help sheet
- [x] Loading / empty / error / success / confirm states
- [x] Toasts bottom-right, capped at three, never covering the primary action
- [x] Responsive down to 390×844 with no horizontal overflow
- [x] Accessible names, visible focus, semantic controls, reduced-motion
- [x] Motion presets: Liquid, Calm, Cinematic, Still
- [x] Chrome state (sidebar, tools, motion) persisted server-side

## Workspaces

- [x] `/dashboard` — launcher, real counts only, honest empty state
- [x] `/abyss` — conversations persisted locally, create/rename/select/delete,
      search, labelled local tools, honest "no provider" explanation
- [x] `/scout` — sessions and notes saved offline, provider results kept
      separate from user notes, no invented citations
- [x] `/forge` — all six formats generate real files, download verified
- [x] `/quill` — autosave, word count, last-saved, create/open/rename/delete,
      unsaved-work warning, provider rewrite never impersonated offline
- [x] `/kronos` — month/week/day, NL entry with confidence + confirmation,
      create/edit/complete/delete, visible today, small-screen fallback
- [x] `/whiteboard` — add/move/edit/delete nodes, visible links, save/restore,
      toolbar never covers content
- [x] `/dash` — 24 commands that each execute a real action, filters, search,
      real recent actions, no fabricated statistics
- [x] `/working-board` — full task CRUD, list view, slide-over detail that
      never hides the toolbar, confirmation before delete
- [x] `/library` — lists only existing records, metadata, search, download,
      delete, missing-file handling, traversal-safe
- [x] `/settings` — providers and keys, local-only switch, motion, JSON
      backup export/import with warning, data location and removal

## Automation

- [x] `opspine/tests/test_app.py` — 44 tests, all passing
      (`python -m unittest discover -s opspine/tests -t .`)
- [x] Browser verification of every workspace at desktop and narrow widths
- [x] Create → save → reload → delete flows exercised per workspace

## Packaging

- [x] `start.sh`, `start.bat`, `requirements.txt`, `.env.example`
- [x] README with install, startup, configuration, privacy, troubleshooting
- [x] `.gitignore` excludes databases, generated files, virtualenvs, caches
- [x] Clean install verified: fresh data directory, all pages 200
- [x] Portable ZIP built excluding virtualenvs, data, caches (see `dist/`)
