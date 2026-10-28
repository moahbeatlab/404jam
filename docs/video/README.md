# The 404jam film

A two-minute film that says what 404jam is and shows each part of it: the five effect buses, the XY pad, snapshots, the play
surfaces and patterns, JAM, and PERF (Punch, Morph, Motion, LFO). The SP-404MkII is drawn (a vector, `device_svg` in `build.py`) over the cut between sections. It is made from a **recording of the real app** driven by a script,
and rendered with [HyperFrames](https://github.com/heygen-com/hyperframes) (HTML and GSAP in, MP4 out), with zoom-ins and captions.

Both halves are repeatable from the files here, so the film can be made again when the app changes.

    capture/        records the app doing everything the film shows, and finds when each action happens in the recording
    presentation/   the film: build.py writes the scenes, music.py writes a backing track, events.json says when things happen

## What you need

`node` 22 or newer, `ffmpeg`, `python3` with `numpy`, and [`agent-browser`](https://www.npmjs.com/package/agent-browser) (a headless Chrome
driver; the first run needs `--args "--no-sandbox"` in a container, which `capture/run.sh` passes). About 2 GB of free disk for the
render and its frame cache, and 4 GB of memory (the render is the heavy part: see *Rendering* below).

## 1. Record the app

    npm install && npm run dev -- --port 5199 --host 127.0.0.1 &       # from a checkout of main: the film shows the released app, not a test branch
    docs/video/capture/run.sh http://127.0.0.1:5199/ /tmp/404jam-cap

`run.sh` opens the app at **1920×1080**, starts the recorder (this **reloads the page**, so everything is done after it), loads the helpers
and runs the segments, each one a script in `capture/` (**a segment must take less than about 25 s**: the browser driver gives up on a longer eval, so a long part is split):

| Segment | What it does |
| --- | --- |
| `segA.js` | the Demo unit on, an effect on each bus, the buses on, six faders dragged |
| `segB1.js`, `segB2.js` | XY presets and a circular drag; two points saved by holding the point buttons, GO morphs between them (ping-pong); the Overview, Snapshots, the Library |
| `segC.js` | PADS (keys, scale, pads), PTN, JAM with the MC-101 preset |
| `segD0.js` | the Demo unit's PLAY: it gives the app a MIDI clock, without which Motion does not loop and the LFOs run on tap tempo |
| `segD1.js`, `segD1b.js` | PERF › PUNCH: a preset fills four slots, hold one while the MIX view shows the buses change, let go; then MORPH, the slider |
| `segD2.js` | PERF › MOTION: arm a slot, move a fader for two bars in MIX, it loops (MIX shows the fader move), speed, direction |
| `segD3.js` | PERF › LFO: bus, knob, shape, start, depth; MIX shows the fader follow |

A segment is one `async` function. It logs each action with `A('name')` and **waits first, then logs**, so a log line is the *end* of its
wait. Helpers (`J.tap`, `J.view`, `J.fader`, `J.loadFx`…) are in `capture/helpers.js` and `capture/app-helpers.js` (`J.ffader` drags the big faders of MIX). Show movement, not only buttons: the effect of a Punch, a Motion or an LFO is on the MIX view, so the segments switch to it while the thing runs.

### Finding the actions in the video

The recorder (Playwright's) **drops the stretches where nothing changes**, so one second of script is not one second of video (80 s of script
became 68 s). The film needs to know *where in the video* each action is. So every logged action flashes a 10 px magenta square in the top-left
corner, and `capture/sync.py` finds the flashes and pairs them, in order, with the log. The result is `presentation/events.json`, a name → video
seconds table. The film crops the corner, so the squares never show. If `sync.py` says the counts differ, a dialog over the corner or an action that
did not run is the cause: look at the recording.

### Things that went wrong, so they do not again

- A bare `.click()` does nothing on controls that listen for `pointerdown` (the view tabs, snapshot slots, faders). Use `J.tap(el)` and, for drags, `J.drag`.
  The menu, picker items by `click`, and the `Overview` toggle are plain clicks.
- The overview has **no faders until an effect is chosen**, and the effect picker lists favourites first, so pick **by name**
  (`J.loadFx(bus, 'Tape Echo')`), not by position.
- The EFX pads turn a bus **on**; choosing an effect does not. Snapshots then say `ON` instead of `off`.
- The JAM preset asks for a **target device** in a second step (`Default (SP-404 output)`). Skipping it leaves a dialog over everything after it.
- Switching views with the bottom tabs goes to **Focus**, not Overview; use Menu → Overview to get the five buses side by side again.
- Do not zoom the page (CSS `zoom`): the layout is built on `100dvh` and breaks. Record at 1920×1080 and let the film punch in.
- Whatever shows in the recording is in the film: use the Demo unit and generated samples, never a real project or file names.

## 2. The film

    mkdir -p /tmp/404jam-film && cp -r docs/video/presentation/. /tmp/404jam-film && cd /tmp/404jam-film
    mkdir -p assets/clips
    ffmpeg -i /tmp/404jam-cap/recording.webm -c:v libx264 -crf 17 -pix_fmt yuv420p -r 30 assets/clips/jam.mp4
    python3 music.py assets/music.wav 104        # a generated backing track (seeded, no samples); the length is the film's, plus a little
    python3 build.py                              # writes index.html and compositions/*.html; says "too quick" for a caption that needs longer
    npx hyperframes telemetry disable             # it sends anonymous usage data otherwise
    npx hyperframes check                         # lint, layout, contrast: fix what it says
    npx hyperframes snapshot --at 41,48,66        # look at frames before rendering
    npx hyperframes render -o 404jam.mp4 --fps 30 --workers 1 --low-memory-mode --protocol-timeout 900000

`build.py` is where the film is written (edit it, not the generated HTML). The feature scenes are a table, `FEATURES`: a stretch of the recording
(`a`, `b`) and **beats**, each a time, a caption (about 6 words) and a part of the screen to punch in on (`x, y, width, height` in recording pixels).
A time is seconds or `("event name", offset)`: **use event names**, so that recording again moves the film with it and no number has to be
looked up. The camera moves to the part, everything else is blurred and dimmed round it, the caption changes.

What `check` taught, and `build.py` now does:

- A caption needs **0.5 s plus 0.3 s a word** on screen; `build.py` prints `too quick` when a beat gets less.
- Keep a punched-in part narrow enough that its text is **28 px or more** after the zoom; a full-width part cannot zoom, so it is not blurred round.
- The first frame must already show the title (it is the thumbnail); the closing line needs about 5 s.
- The corner markers are cropped by placing the recording 14 px up and left inside its window.

### Rendering

On a small machine (2 CPUs, 4 GB) the render **fails with `Unable to capture screenshot`** with several workers, or when the video-frame cache fills `/tmp`.
`--workers 1 --low-memory-mode --protocol-timeout 900000` and `--frames-cache-dir <a folder on the real disk>` fixed it; it takes about 20 minutes for 95 s of film.

### When a feature is added or changed

1. If the app has a new part worth showing, add actions for it to a segment (and wait before you log).
2. Run `capture/run.sh` again and look at frames from across the recording (`ffmpeg -ss T -i recording.webm -frames:v 1 f.png`).
3. Add or edit a scene in `FEATURES` (beats by event name); if the story changes, the `problem` and `what` scenes.
4. `check`, `snapshot` a frame per beat, render.
5. Show what is released: record from `main`, not from `test-all`. A feature that is only on a test branch does not belong in the film until it is released.

The recording, the music and the rendered film are not committed (they are large and can be made again); publish the film as a release or on the Pages site.

## Editing the film

- **Change a caption, a time or a scene:** edit `FEATURES` (or the scene functions) in `presentation/build.py` and run it; it rewrites `index.html` and `compositions/*.html`. Hand edits to those files are lost the next time `build.py` runs.
- **Look at it while you edit:** in the project folder, `npx hyperframes preview` opens the HyperFrames studio (a timeline you can scrub, play and edit) in the browser. Edits you make there change the generated HTML files; to keep a change, port it into `build.py`.
- **The SP-404MkII drawing and the transitions:** `device_svg` and `transition_scene` in `build.py` (colours are the `.dv-*` rules in `DEV_CSS`). It is amber line art on the layout of the real unit, with the moahbeatlab wordmark up the left margin; `pad_center(n)` gives where pad n is.
- **The music:** `python3 music.py assets/music.wav SECONDS`, or put your own file at `assets/music.wav`.
- **Cut or reorder the footage:** every scene shows a stretch of one recording (`a` to `b`, event names plus an offset); reorder the entries of `FEATURES` to reorder the film.

## The vertical reel (9:16, 1080x1920, about 50 s)

The reel shows the app's **phone layout**, as on a smartphone: a second recording of the same app, made in a 432x768 viewport at 2.5x (so the video is exactly 1080x1920), plus its own events file.

    PHONE=1 VIEWPORT="432 768 2.5" docs/video/capture/run.sh http://127.0.0.1:5199/ /tmp/404jam-phone docs/video/presentation/events-phone.json
    ffmpeg -i /tmp/404jam-phone/recording.webm -c:v libx264 -crf 18 -pix_fmt yuv420p -r 30 assets/clips/phone.mp4

`PHONE=1` makes `run.sh` use `seg<name>.phone.js` where one exists: the phone layout shows one bus at a time (the focus view), so `segA.phone.js` picks each bus tab and drives `#fx-name`, `#efx-pad` and the big faders; the other segments work unchanged.

`presentation/reel.py` then makes the film from `events-phone.json` and `assets/clips/phone.mp4`: a hook, then Punch, Morph, the XY ping-pong, Motion and LFO, each introduced by the SP-404MKII line art, and an end card. It imports `build.py` for the drawing, so keep both in the same project folder.

    python3 reel.py                                          # writes index.html and compositions/*.html
    python3 music.py assets/music.wav 50 reel                # the backing track, full groove from the start
    npx hyperframes render --workers 1 --low-memory-mode --protocol-timeout 900000 -o reel.mp4

A section is a list of beats in `SECTIONS`: where in the phone recording it starts (seconds or `(event, offset)`), how long, and the caption. The phone screen sits in a card with the top 150 px and the bottom 330 px left free for the platform's own buttons.
