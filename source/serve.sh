#!/bin/bash
# local test server for dist/ on :8123 (the Playwright tests load http://127.0.0.1:8123/test.html)
HERE="$(cd "$(dirname "$0")" && pwd)"
curl -s -o /dev/null http://127.0.0.1:8123/test.html || (cd "$HERE/dist" && setsid nohup python3 -m http.server 8123 >/dev/null 2>&1 < /dev/null &)
sleep 0.8
