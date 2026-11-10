# OPSpine — implementation checklist

This file records what has actually been built and verified. Every box below
was checked by exercising the running app, not by inspection alone.

Last verified: 2026-11-10

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
      control appears, state persists and is always reversible
- [x] No global right-hand tools panel: every workspace owns its own context
      column (`.ws-aside`), and nothing that used to live in the old panel
      became unreachable
- [x] Exactly one navbar per workspace; Abyss alone has two sidebars (chats
      left, tools right)
- [x] Ctrl/Cmd+K command palette with workspace and record search
- [x] Ctrl/Cmd+0–8 workspace jumps
- [x] Ctrl/Cmd+Enter runs the registered primary action
- [x] Esc closes overlays, palette, drawers and dialogs
- [x] Shortcut help sheet
- [x] Loading / empty / error / success / confirm states
- [x] Toasts bottom-right, capped at three, never covering the primary action;
      a toast can carry one action (used for Undo on board moves)
- [x] Shared dialogs: confirm, and a real text prompt, so no workspace depends
      on `window.prompt` (blocked in embedded and kiosk contexts)
- [x] Every styled switch is operable by mouse and keyboard, not just by
      relying on label forwarding
- [x] Responsive down to 390×844 with no horizontal overflow
- [x] Accessible names, visible focus, semantic controls, reduced-motion
- [x] Motion presets: Liquid, Calm, Cinematic, Still
- [x] Chrome state (sidebar, tools, motion) persisted server-side

## Workspaces

- [x] `/dashboard` — launcher, real counts only, honest empty state
- [x] `/abyss` — conversations persisted locally, create/rename/select/delete,
      search, labelled local tools, honest "no provider" explanation
- [x] `/scout` — sessions and notes saved offline, provider results kept
      separate from user notes, no invented citations, server-side search with
      a live match count, Cmd/Ctrl+Enter to save a note, Copy link and Copy
      citation on each provider source
- [x] `/forge` — all six formats generate real files, download verified
- [x] `/quill` — autosave, word count, last-saved, create/open/rename/delete,
      unsaved-work warning, provider rewrite never impersonated offline,
      `.txt`/`.md` export built in the browser, Ctrl/Cmd+S, Escape closes the
      tool drawer, one confirmation on delete
- [x] `/kronos` — month/week/day, NL entry with confidence + confirmation,
      create/edit/complete/delete, visible today, small-screen fallback,
      jump-to-date, keyboard paging (`←`/`→`, `T`, `M`/`W`/`D`, `N`), view
      persisted, period label names the whole visible range
- [x] `/whiteboard` — add/move/edit/delete nodes, visible links that can be
      removed, save/restore, zoom-to-fit, rename board, Ctrl/Cmd+Z undo with a
      bounded history, visible saved/unsaved state, toolbar never covers
      content
- [x] `/dash` — 26 commands that each execute a real action, filters, search,
      real recent actions, no fabricated statistics, "Ran this session" filter,
      honest shortcut labels, `/` focuses the filter
- [x] `/working-board` — full task CRUD, list view, slide-over detail that
      never hides the toolbar, confirmation before delete, per-card status
      moves, unsaved-edit warning, undoable moves, Ctrl/Cmd+S, `/` search
- [x] `/library` — lists only existing records, metadata, search, download,
      delete, missing-file handling, traversal-safe, rename/delete for drafts
      and conversations, a live record count, arrow-key tabs, deep links
- [x] `/settings` — providers and keys, local-only switch, motion, light/dark,
      launch mode, JSON backup export/import with warning, data location, and
      a typed-in-panel `DELETE` confirmation for the wipe

## Automation

- [x] `opspine/tests/test_app.py` — 63 tests, all passing
      (`python -m unittest discover -s opspine/tests -t .`)
- [x] Every page booted in a real DOM with zero runtime errors
      (11 pages, one pass)
- [x] Create → save → reload → delete flows exercised per workspace through
      the real API and the rendered DOM

### Verification limits — read this before trusting the UI claims

- [ ] **No pixel-level visual check.** The sandbox has no browser binary, so
      layout, spacing and rasterised contrast were verified structurally and by
      contrast arithmetic, not by looking at a screenshot.
- [ ] **Light theme is not available in every room yet.** Dashboard and Abyss
      have both themes; the other nine rooms are still dark-only and say so
      when you try to switch. This is a real outstanding item, not a detail.

## Packaging

- [x] `start.sh`, `start.bat`, `requirements.txt`, `.env.example`
- [x] README with install, startup, configuration, privacy, troubleshooting
- [x] `.gitignore` excludes databases, generated files, virtualenvs, caches
- [x] Clean install verified: fresh data directory, all pages 200
- [x] `build_zip.py` builds the portable archive from the working tree, leaving
      out virtualenvs, databases, logs, generated documents and caches
- [x] `python build_zip.py --check` extracts the archive to a temp folder and
      boots it there: all 13 routes return 200 from a clean extraction
- [ ] The archive is **not** committed (`*.zip` is ignored). Build it with
      `python build_zip.py` — a prebuilt `dist/OPSpine.zip` would be stale the
      moment the code changed.
