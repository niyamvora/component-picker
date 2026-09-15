#!/bin/sh
# Self-check: builds, then runs every test/fixture*.html in headless Chrome and prints PASS/FAIL.
# Exits non-zero when any fixture fails, so `npm test` stops here instead of carrying on.
# CHROME=/path/to/binary overrides the browser.
cd "$(dirname "$0")/.."
node build.mjs >/dev/null 2>&1 || { echo "FAIL build"; exit 1; }
cd test
status=0
for fixture in fixture*.html; do
  out=$("${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" --headless=new --disable-gpu --no-sandbox \
    --virtual-time-budget=10000 --dump-dom "file://$PWD/$fixture" 2>/dev/null \
    | awk '/<pre id="result">/,/<\/pre>/' | sed 's/.*<pre id="result">//; s/<\/pre>.*//' | head -60)
  printf '%s: %s\n' "$fixture" "$out"
  case "$out" in PASS*) ;; *) status=1 ;; esac
done
exit $status
