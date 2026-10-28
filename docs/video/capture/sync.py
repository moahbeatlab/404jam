#!/usr/bin/env python3
"""Find the capture's actions in the recording and write presentation/events.json.

    python3 docs/video/capture/sync.py recording.webm capture-log.json presentation/events.json

The recording is not in real time: the browser's recorder drops the stretches where nothing changes, so a
second of the script is not a second of the video. Each action of the capture therefore flashed a 10 px magenta
square in the top-left corner (helpers.js, `J.at`), and this finds those flashes and pairs them, in order, with
the actions the script logged. Actions that did not flash (they were less than 1.1 s after another) are placed
from the one before. The film crops the corner, so the squares never show.
"""
import json, subprocess, sys
import numpy as np

def main():
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    video, logfile, out = sys.argv[1:]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", video, "-vf", "fps=20,crop=6:6:2:2", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                         capture_output=True, check=True).stdout
    a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 6, 6, 3).astype(int)
    on = [bool(f[..., 0].mean() > 150 and f[..., 2].mean() > 150 and f[..., 1].mean() < 110) for f in a]
    starts = [i / 20 for i, v in enumerate(on) if v and (i == 0 or not on[i - 1])]
    log = json.loads(open(logfile).read())                        # [[seconds, name, flashed], ...]
    flashed = [(t, w) for t, w, f in log if f]
    if len(starts) != len(flashed):
        sys.exit("sync.py: %d flashes in the video but %d flashed actions in the log. Look at the recording; "
                 "a dialog over the corner, or an action that did not run, is the usual cause." % (len(starts), len(flashed)))
    ev, last = {}, None
    for (t, w), s in zip(flashed, starts):
        ev[w] = round(s, 2)
    for t, w, f in log:
        if f: last = (t, ev[w])
        else: ev[w] = round(last[1] + (t - last[0]), 2)
    json.dump(ev, open(out, "w"), indent=0)
    print("%d actions placed in %s" % (len(ev), out))

if __name__ == "__main__":
    main()
