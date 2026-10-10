#!/usr/bin/env bash
# End-to-end tests: drives the real app headlessly (create/edit songs, undo,
# text entry, transpose, practice playback, backup import, ChordPro import…).
# Requires python3 and Chromium/Chrome. Exit code 0 = all pass.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-8766}
BROWSER=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -z "$BROWSER" ] && { echo "No Chromium/Chrome found — open tests/e2e.html via a local server instead."; exit 2; }
python3 scripts/test-server.py "$PORT" >/dev/null 2>&1 &
SERVER=$!; trap 'kill $SERVER' EXIT; sleep 1
OUT=$(timeout 240 "$BROWSER" --headless --disable-gpu --autoplay-policy=no-user-gesture-required --dump-dom "http://127.0.0.1:$PORT/tests/e2e.html?hold" 2>/dev/null)
python3 -c '
import sys, re, html
s = sys.stdin.read()
rows = [html.unescape(x) for x in re.findall(r"<(?:li|p id=\"summary\")[^>]*>(.*?)</(?:li|p)>", s)]
rows = [r for r in rows if not r.startswith("${")]
for r in rows: print(r)
sys.exit(0 if rows and "ALL PASS" in rows[0] else 1)
' <<< "$OUT"
