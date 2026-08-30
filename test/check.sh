#!/bin/sh
# Self-check: builds, then runs test/fixture.html in headless Chrome and prints PASS/FAIL.
# CHROME=/path/to/binary overrides the browser (CI runs this on Linux).
cd "$(dirname "$0")/.."
node build.mjs >/dev/null 2>&1 || { echo "FAIL build"; exit 1; }
cd test
"${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}" --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=3000 --dump-dom "file://$PWD/fixture.html" 2>/dev/null \
  | sed -n 's/.*<pre id="result">\(.*\)/\1/p; /<pre id="result">/,/<\/pre>/p' | sed 's/<\/pre>.*//' | head -60
