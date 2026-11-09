#!/usr/bin/env python3
"""OPSpine entry point.

    python app.py                 # http://127.0.0.1:5000
    OPSPINE_HOST=0.0.0.0 python app.py   # reachable from other machines

Environment variables:
    OPSPINE_HOST        bind address (default 127.0.0.1)
    OPSPINE_PORT        port (default 5000)
    OPSPINE_DEBUG       "1" to enable the debug reloader
    OPSPINE_DATA_DIR    where the database and documents live
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_ROOT = Path(__file__).resolve().parent
if str(APP_ROOT) not in sys.path:
    sys.path.insert(0, str(APP_ROOT))

from opspine import create_app  # noqa: E402  (path set up above)

app = create_app()


def main() -> None:
    host = os.environ.get("OPSPINE_HOST", "127.0.0.1")
    # PORT is the conventional name used by start.sh / start.bat / hosting
    # panels; OPSPINE_PORT wins when both are set.
    raw_port = os.environ.get("OPSPINE_PORT") or os.environ.get("PORT") or "5000"
    try:
        port = int(raw_port)
    except ValueError:
        print(f"Port {raw_port!r} is not a number.", file=sys.stderr)
        raise SystemExit(2)

    debug = os.environ.get("OPSPINE_DEBUG", "") in ("1", "true", "yes")
    shown = "127.0.0.1" if host in ("0.0.0.0", "::") else host

    print()
    print("  OPSpine")
    print(f"  Running on   http://{shown}:{port}")
    print(f"  Data folder  {os.environ.get('OPSPINE_DATA_DIR', APP_ROOT / 'data')}")
    print("  Stop with    Ctrl+C")
    print()

    app.run(
        host=host,
        port=port,
        debug=debug,
        use_reloader=debug,
        threaded=True,
    )


if __name__ == "__main__":
    main()
