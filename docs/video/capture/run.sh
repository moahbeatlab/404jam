#!/usr/bin/env bash
# Record the real app doing everything the film shows, and work out when each action happens in the recording.
#
#   npm run dev -- --port 5199 --host 127.0.0.1 &          # a build that has what you want to show (the Sample Lab is on test-all)
#   docs/video/capture/run.sh http://127.0.0.1:5199/ /tmp/404jam-cap
#
# Needs agent-browser (a headless Chrome driver), ffmpeg, python3 with numpy. See ../README.md.
set -euo pipefail
URL="${1:-http://127.0.0.1:5199/}"
OUT="${2:-/tmp/404jam-cap}"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
rm -f "$OUT/recording.webm"
agent-browser close --all >/dev/null 2>&1 || true
sleep 3                                                      # the daemon must be gone before --args is read again
agent-browser --args "--no-sandbox" open "$URL" >/dev/null
agent-browser set viewport 1920 1080 >/dev/null              # the film is 1920x1080: record at that size
sleep 2
agent-browser record start "$OUT/recording.webm" >/dev/null  # reloads the page: do everything after this
sleep 2.5
agent-browser eval "$(cat "$HERE/helpers.js")" >/dev/null
agent-browser eval "$(cat "$HERE/lab-helpers.js")" >/dev/null
agent-browser eval "window.__errs=[];addEventListener('error',e=>window.__errs.push(e.message))" >/dev/null
for seg in A B C D; do
  agent-browser eval "$(cat "$HERE/seg$seg.js")" > "$OUT/log$seg.txt"
done
sleep 2
echo "page errors during the run: $(agent-browser eval 'JSON.stringify(window.__errs)')"
agent-browser record stop >/dev/null
# the last segment returns the whole log of actions as a JSON string (the CLI prints it quoted)
python3 - "$OUT/logD.txt" "$OUT/log.json" <<'PY'
import json, sys
s = open(sys.argv[1]).read().strip().splitlines()[-1]
open(sys.argv[2], "w").write(json.loads(s))
PY
python3 "$HERE/sync.py" "$OUT/recording.webm" "$OUT/log.json" "$HERE/../presentation/events.json"
cp "$OUT/recording.webm" "$OUT/jam.webm"
echo "recording: $OUT/recording.webm  (convert for the film: ffmpeg -i recording.webm -c:v libx264 -crf 17 -pix_fmt yuv420p -r 30 assets/clips/jam.mp4)"
