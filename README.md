# OPSpine

A local-first workspace for knowledge work. Eleven specialist rooms, one SQLite
database, no account, no cloud, no API key required.

Everything you create stays in the `data/` folder next to the app. You can copy
that folder to back up your work, or delete it to start over.

---

## Quick start

**macOS / Linux**

```bash
./start.sh
```

**Windows**

```bat
start.bat
```

Then open <http://localhost:5000>.

The scripts create a virtual environment, install the dependencies and start
the server. The first run needs an internet connection to fetch Python
packages; after that the app runs entirely offline.

### Manual start

```bash
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Requires Python 3.9 or newer.

---

## The rooms

| Room | URL | What it does | Shortcut |
|---|---|---|---|
| Dashboard | `/dashboard` | Launcher, real counts, recent work | `Ctrl 0` |
| Abyss | `/abyss` | Conversations with a model or local tools | `Ctrl 1` |
| Scout | `/scout` | Research sessions, sources, notes | `Ctrl 2` |
| Forge | `/forge` | PPTX, DOCX, XLSX, PDF, Markdown, PNG | `Ctrl 3` |
| Quill | `/quill` | Drafting with autosave and word count | `Ctrl 4` |
| Kronos | `/kronos` | Calendar with plain-English entry | `Ctrl 5` |
| Whiteboard | `/whiteboard` | Text nodes and connections | `Ctrl 6` |
| Dash | `/dash` | Command console — every row runs something | `Ctrl 7` |
| Working Board | `/working-board` | Tasks with status, priority, due date | `Ctrl 8` |
| Library | `/library` | Files, drafts, research and chats in one index | — |
| Settings | `/settings` | Providers, local-only, motion, backup | — |

`Cmd` works instead of `Ctrl` on macOS.

### Keyboard

| Keys | Action |
|---|---|
| `Ctrl K` | Command palette |
| `Ctrl 0`–`Ctrl 8` | Jump to a workspace |
| `Ctrl Enter` | Run the primary action of the current room |
| `Ctrl \` | Collapse or expand the sidebar |
| `?` | Shortcut reference |
| `Esc` | Close the palette, a dialog or a drawer |

---

## What works offline

These features need nothing external:

- Generating all six document formats and downloading them
- Writing, autosaving and managing drafts
- Calendar events, including plain-English parsing
- Tasks, statuses, priorities and due dates
- Whiteboards with nodes and links
- Research notes written by hand
- Conversation history, search and export
- Dash commands, the command palette and navigation

The **local text tools** in Abyss and Quill are deterministic functions —
statistics, uppercase, lowercase, title case, sentence case, bullets,
de-duplicate lines, sort lines, collapse blank lines, URL slug, extractive
summary and key terms. They are labelled `local-tool:…` wherever they appear,
so you can always tell which output came from a model and which came from a
rule.

---

## Optional AI and research providers

OPSpine runs without any provider. Adding one is optional and always explicit.

1. Open **Settings**
2. Choose an AI provider: Google Gemini, Groq or OpenRouter
3. Choose a research provider: Brave Search or Tavily
4. Paste the key and press **Save**

Keys are written to the local SQLite database and are never returned to the
browser. The interface only ever shows whether a key is stored.

Provider calls are made only when you ask for them, with a request timeout, and
are labelled with the provider name in the transcript and in results. If a
provider is unreachable, OPSpine says so instead of inventing an answer.

### Local-only mode

On by default. While it is on, the server refuses every outbound request before
opening a socket. This is enforced in `opspine/services/providers._guard()`, not
in the interface, so it holds even if a request is made by hand.

Turning local-only off does not by itself contact anything — it only allows the
providers you have configured to be used when you explicitly ask.

---

## Configuration

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `OPSPINE_HOST` | `127.0.0.1` | Bind address. Use `0.0.0.0` to allow other machines |
| `OPSPINE_PORT` | `5000` | Port (`PORT` also works) |
| `OPSPINE_DEBUG` | off | `1` enables the reloader and debug pages |
| `OPSPINE_DATA_DIR` | `./data` | Where the database, documents and logs live |
| `OPSPINE_DB_PATH` | `<data>/opspine.db` | Override the database file |

```bash
OPSPINE_HOST=0.0.0.0 OPSPINE_PORT=8080 python app.py
```

Binding to `0.0.0.0` exposes the app to your network. It has no login screen —
only do this on a network you trust.

`.env.example` documents the provider variables for deployments that inject
keys through the environment. Keys entered in Settings are stored in the
database instead; nothing is read from `.env` automatically.

---

## Your data

```
data/
├── opspine.db          # the only database
├── opspine.log         # rotating server log
└── documents/          # generated files, served from here only
```

- **Backup**: Settings → *Export backup*. A JSON file with your records, minus
  API keys.
- **Restore**: Settings → *Choose backup file*. The file is validated first and
  you see what it contains before anything is replaced.
- **Delete**: Settings → *Delete everything* requires typing `DELETE`.

Deleting `data/` while the app is stopped is equivalent to a clean install.

### Privacy

- No telemetry, no analytics, no crash reporting, no cloud sync
- No outbound request happens while local-only mode is on
- API keys are excluded from ordinary backups
- Generated files are only ever served from `data/documents`; every path is
  re-resolved and checked before the file is opened

---

## Tests

```bash
python -m unittest discover -s opspine/tests -t .
```

44 tests covering schema creation, settings and secret handling, local-only
enforcement, conversation and message persistence, all six document formats,
path-traversal refusal, missing-file handling, drafts, calendar parsing and
CRUD, tasks, boards, research notes, backup round-trips and every page route.
They use a temporary data directory and never touch your real database.

---

## Layout

```
app.py                     entry point
opspine/
├── __init__.py            app factory, logging, security headers
├── db.py                  schema and connections
├── pages.py               HTML routes
├── workspaces.py          the room registry (name, path, shortcut, assets)
├── validation.py          input checking
├── safety.py              filename and path handling
├── services/              database and domain logic, no HTTP
├── api/                   JSON endpoints, no SQL
├── templates/             layout, partials, one file per workspace
├── static/css/            base, shell, one stylesheet per workspace
├── static/js/             api, ui, shell, one script per workspace
└── tests/                 the test suite
```

Routes are kept thin: they validate and delegate. Services own the SQL. Each
workspace has its own stylesheet and script, and all of them share the shell
components in `base.css`, `shell.css`, `ui.js` and `shell.js`.

---

## Troubleshooting

**Port already in use**

```bash
OPSPINE_PORT=8080 python app.py
```

**`./start.sh: Permission denied`**

```bash
chmod +x start.sh
```

**Pillow fails to build** (usually Python 3.13+ without wheel support)

Everything except PNG generation still works. Use Python 3.11 or 3.12 for full
support, or `pip install --upgrade pip` first.

**The page loads but data looks empty**

Check that `data/` is writable and look at `data/opspine.log`. If the database
was deleted while the server was running, restart it — the schema is created on
startup.

**A generated file says "missing"**

The record exists but the file was removed outside OPSpine. Delete the record
in Library, or generate the file again.

**Provider calls fail**

Confirm the key is stored (Settings shows *stored*), that local-only mode is
off, and that your machine can reach the provider. The error from the provider
is shown in the transcript rather than being swallowed.

**Reset everything**

Stop the server, delete `data/`, start again.

---

## Limits worth knowing

- The development server is single-process Flask. It is fine for one person on
  one machine; put it behind a real WSGI server before exposing it widely.
- Abyss and Quill do not generate prose offline. Without a provider they run
  deterministic tools and say so.
- Scout shows only what a configured search provider returns. With no provider
  it stores your notes and nothing else.
- Kronos stores events and shows them in three views. It does not send
  notifications or sync to an external calendar.
- Motion presets are preference-level: they change durations and easing, and
  the system reduced-motion setting always wins.
