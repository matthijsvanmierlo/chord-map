#!/usr/bin/env bash
# Run the in-browser unit tests headlessly. Requires python3 and chromium/chrome.
# Usage: scripts/run-tests.sh            (exit code 0 = all pass)
set -euo pipefail
cd "$(dirname "$0")/.."
PORT=${PORT:-8765}
BROWSER=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -z "$BROWSER" ] && { echo "No Chromium/Chrome found — open tests/index.html via a local server instead."; exit 2; }
if ! curl -s "http://127.0.0.1:$PORT/" >/dev/null; then
  python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
  SERVER=$!; trap 'kill $SERVER' EXIT; sleep 1
fi
OUT=$(timeout 120 "$BROWSER" --headless --disable-gpu --virtual-time-budget=60000 --dump-dom "http://127.0.0.1:$PORT/tests/" 2>/dev/null)
python3 -c '
import sys, re, html
s = sys.stdin.read()
rows = [html.unescape(x) for x in re.findall(r"<(?:li|p id=\"summary\")[^>]*>(.*?)</(?:li|p)>", s)]
verbose = len(sys.argv) > 1
for r in rows:
    if verbose or not r.startswith("PASS"): print(r)
sys.exit(0 if rows and "ALL PASS" in rows[0] else 1)
' ${VERBOSE:+-v} <<< "$OUT"
