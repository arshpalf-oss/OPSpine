# OPSpine

**One operating environment. Eight specialist rooms. Zero cloud dependency.**

OPSpine is a local-first desktop web application for knowledge work. Run it once on your machine and you get research, document production, writing, scheduling, visual thinking, quick actions, project execution, and a central AI router — all in one continuous place.

## Quick Start

```bash
./start.sh
```

Then open http://localhost:5000

The script creates a Python virtual environment, installs dependencies, and starts the server on port 5000 (override with `PORT=8080 ./start.sh`).

## Workspaces

| Room | URL | Job | Shortcut |
|------|-----|-----|----------|
| Dashboard | `/dashboard` | Parent launcher | ⌘0 |
| Abyss | `/abyss` | Central AI router | ⌘1 |
| Scout | `/scout` | Research & verification | ⌘2 |
| Forge | `/forge` | Document production (PPTX/DOCX/XLSX/PDF/MD/PNG) | ⌘3 |
| Quill | `/quill` | Writing & drafting | ⌘4 |
| Kronos | `/kronos` | Calendar & reminders (natural language) | ⌘5 |
| Whiteboard | `/whiteboard` | Visual thinking | ⌘6 |
| Dash | `/dash` | Shortcuts & quick actions | ⌘7 |
| Working Board | `/working-board` | Project execution | ⌘8 |
| Library | `/library` | Files & documents | — |
| Settings | `/settings` | Configuration | — |

## Keyboard Shortcuts

- `⌘K` — Command palette
- `⌘0`–`⌘8` — Jump to workspace
- `⌘Enter` — Run primary action in current room
- `?` — Show shortcut help
- `Esc` — Close overlay / palette
- `⌘\`` — Toggle navigation rail
- `⌘Z` / `⌘⇧Z` — Undo / Redo

## Architecture

- **Backend:** Flask (Python) + SQLite single database
- **Frontend:** Vanilla HTML/CSS/JS, no build step
- **AI Core:** Shared gateway with deterministic local engines for every method. Add API keys (Gemini, Groq, OpenRouter, Brave, Tavily, Exa) in Settings to enable cloud AI.
- **Files:** PPTX via python-pptx, DOCX via python-docx, XLSX via openpyxl, PDF via ReportLab, PNG via Pillow
- **Data:** All in `data/opspine.db`. Export/import JSON backups from Settings.

## Data & Privacy

- All data lives locally in `data/opspine.db`
- No telemetry, no accounts, no cloud sync
- "Local-only" master switch disables all external API calls
- API keys are stored only on the backend, never sent to the browser

## Motion Presets

- **Liquid** (default) — Fluid glass, balanced motion
- **Calm** — Gentler, slower transitions
- **Cinematic** — Deeper parallax, richer light
- **Still** — Zero animation for maximum clarity
- Respects `prefers-reduced-motion` automatically

## Requirements

- Python 3.9+
- No other system dependencies required
