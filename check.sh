#!/bin/sh
# Self-check: runs test.html in headless Chrome and prints PASS/FAIL.
cd "$(dirname "$0")"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=3000 --dump-dom "file://$PWD/test.html" 2>/dev/null \
  | sed -n 's/.*<pre id="result">\(.*\)/\1/p; /<pre id="result">/,/<\/pre>/p' | sed 's/<\/pre>.*//' | head -60
