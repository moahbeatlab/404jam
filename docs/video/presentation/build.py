#!/usr/bin/env python3
"""Writes index.html and compositions/*.html of the 404jam presentation film.

    python3 build.py      # then: npx hyperframes check ; npx hyperframes snapshot --at 5,30 ; npx hyperframes render

The footage is one recording of the real app (assets/clips/jam.mp4, made by capture/ in this folder). Each feature scene
shows a stretch of it with beats: at a time of the recording, a caption (about 6 words) and a part of the screen
(x, y, width, height in recording pixels) to punch in on. The recording has a 10 px marker in its top-left corner
that the capture used to find its actions; the film crops it away.
"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
# where each action of the capture is in the recording, in seconds (capture/sync.py writes it next to this file)
EVENTS_FILE = os.path.join(HERE, "events.json")
if not os.path.exists(EVENTS_FILE):
    raise SystemExit("build.py: events.json is missing: run docs/video/capture/run.sh first, it writes it next to this file")
EVENTS = json.load(open(EVENTS_FILE))

def at(x):
    """a time: seconds, or (name of a capture event, offset in seconds)"""
    return round(EVENTS[x[0]] + x[1], 2) if isinstance(x, tuple) else x

REC_W, REC_H = 1920, 1080
CROP = 14                                   # px cropped off the left and top of the recording (the markers)
WIN_X, WIN_Y, WIN_W = 110, 14, 1700         # the footage window, 16:9
WIN_H = round(WIN_W * (REC_H - CROP) / (REC_W - CROP))
OVERLAP = 0.45
VW, VH = REC_W - CROP, REC_H - CROP
S0 = WIN_W / VW

# Times are (event name, offset). The capture logs an action AFTER its wait, so an event is the END of what it names:
# a thing is on screen from about (event - its wait) to the event. The offsets below are measured against frames.
FEATURES = [
    dict(id="mix", a=('mark', 0.6), b=('faders-start', 5.3), tab="MIX", name="THE BUSES", enter="wipe", beats=[
        (('overview-empty', -0.8), "Try it with the Demo unit", None),
        (('fx0 Tape Echo', -0.7), "Pick an effect on each bus", (0, 100, 1920, 120)),
        (('fx-all', 0.1), "Real parameter names", (0, 930, 1160, 100)),
        (('faders-start', 0.0), "Six touch faders per bus", (0, 100, 780, 330))]),
    dict(id="xy", a=('xy', -0.9), b=('xy-drag-end', 1.2), tab="XY", name="XY PAD", enter="push", beats=[
        (('xy-presets', -0.4), "Presets set both axes", (720, 120, 480, 520)),
        (('xy-assigned', 0.0), "Drag: X is time, Y feedback", (0, 100, 1100, 620))]),
    dict(id="snap", a=('mix-back', 0.6), b=('library', 0.1), tab="SNAP", name="SNAPSHOTS", enter="zoom", beats=[
        (('mix-back', 1.0), "Snapshots store all five buses", (720, 50, 480, 420))]),
    dict(id="play", a=('segB-end', 0.0), b=('ptn-tap2', 0.0), tab="PADS", name="AND PATTERNS", enter="wipe", beats=[
        (('segB-end', 0.4), "A chromatic keyboard", None),
        (('keys-played', 0.1), "Scale pads that stay in key", None),
        (('pads-grid', 0.1), "Patterns: one tap to switch", (0, 60, 1920, 520))]),
    dict(id="jam", a=('ptn-tap2', 0.0), b=('jam-added', 1.5), tab="JAM", name="JAM", enter="push", beats=[
        (('ptn-tap2', 0.2), "JAM: your own controls", None),
        (('jam-added', -1.8), "A preset fills the grid", (0, 100, 1920, 420))]),
    dict(id="lab", a=('jam-added', 0.4), b=('segD-end', 0.8), tab="LAB", name="PREVIEW", enter="zoom", beats=[
        (('lab', -0.5), "Sample Lab: no unit needed", None),
        (('lab-added', 0.0), "Samples land on pads", (0, 100, 1920, 420)),
        (('lab-slice', 0.2), "Cut at the onsets", (0, 180, 1920, 340)),
        (('lab-onsets', 0.4), "Chords and arps too", None)]),
]

def focus_panels(fid, i, x, y, w, h, W, H):
    """four blurred, dimmed panels round the part in focus (cam pixels), plus a hairline edge; the part stays sharp"""
    x, y, w, h = round(x), round(y), round(w), round(h)
    x0, y0 = max(0, x), max(0, y)
    x1, y1 = min(W, x + w), min(H, y + h)
    box = [(0, 0, W, y0), (0, y1, W, H - y1), (0, y0, x0, y1 - y0), (x1, y0, W - x1, y1 - y0)]
    out = [f'<div class="dim {fid}-f{i}" style="left:{a}px;top:{b}px;width:{c}px;height:{d}px"></div>' for a, b, c, d in box if c > 0 and d > 0]
    out.append(f'<div class="edge {fid}-f{i}" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px"></div>')
    return "".join(out)

def cam_for(rect):
    if rect is None:
        return 0, 0, round(S0, 4)
    x, y, w, h = rect
    x, y = x - CROP, y - CROP
    px, py = w * 0.06 + 20, h * 0.10 + 24
    x, y, w, h = x - px, y - py, w + 2 * px, h + 2 * py
    s = max(S0, min(WIN_W / w, WIN_H / h, 2.6))
    cx = min(0, max(WIN_W - VW * s, (WIN_W - w * s) / 2 - x * s))
    cy = min(0, max(WIN_H - VH * s, (WIN_H - h * s) / 2 - y * s))
    return round(cx, 1), round(cy, 1), round(s, 4)

ENTER = {
    "wipe": 'tl.fromTo("#root", { clipPath: "inset(0 100% 0 0)" }, { clipPath: "inset(0 0% 0 0)", duration: 0.55, ease: "power3.inOut" }, 0);',
    "push": 'tl.fromTo("#root", { xPercent: 100 }, { xPercent: 0, duration: 0.55, ease: "power3.inOut" }, 0);',
    "zoom": 'tl.fromTo("#root", { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, 0);',
}
HEAD = """<template>
  <style>
    #root { position: absolute; inset: 0; background: #0d0d10; overflow: hidden; color: #ececf0; font-family: "Inter", sans-serif; }
    .amber { color: #ffb000; }
"""

def feature(f):
    A, B = at(f["a"]), at(f["b"])
    f = dict(f, a=A, b=B, beats=[(at(m), cap, rect) for m, cap, rect in f["beats"]])
    dur = round(B - A, 3)
    t = lambda m: round(m - A, 3)
    beats = f["beats"]
    for i, (m, cap, rect) in enumerate(beats):
        end = t(beats[i + 1][0]) if i + 1 < len(beats) else dur - 0.5
        need = 0.5 + 0.3 * len(cap.split())
        if end - t(m) + 0.05 < need:
            print("  too quick: %s beat %d shows %.1f s, wants %.1f s: %r" % (f["id"], i, end - t(m), need, cap))
    rings, caps, tl = [], [], [ENTER[f["enter"]], f'gsap.set("#cam", {{ transformOrigin: "0 0", x: 0, y: 0, scale: {S0:.4f} }});',
                               'tl.fromTo("#band", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 0.25);']
    for i, (m, cap, rect) in enumerate(beats):
        t0 = max(0.05, t(m)); t1 = t(beats[i + 1][0]) if i + 1 < len(beats) else dur - 0.5
        x, y, s = cam_for(rect)
        caps.append(f'<div class="cap" id="{f["id"]}-cap{i}"><span class="txt">{cap}</span></div>')
        tl.append(f'tl.fromTo("#{f["id"]}-cap{i}", {{ opacity: 0, y: 18 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, {t0:.3f});')
        tl.append(f'tl.to("#{f["id"]}-cap{i}", {{ opacity: 0, y: -14, duration: 0.2, ease: "power2.in" }}, {(t1 - 0.2) if i + 1 < len(beats) else dur - 0.3:.3f});')
        tl.append(f'tl.to("#cam", {{ x: {x}, y: {y}, scale: {s}, duration: 0.55, ease: "power3.inOut" }}, {max(0.0, t0 - 0.25):.3f});')
        if rect and rect[2] < 1800:
            rx, ry, rw, rh = rect
            rings.append(focus_panels(f['id'], i, rx - CROP - 8, ry - CROP - 8, rw + 16, rh + 16, VW, VH))
            tl.append(f'tl.fromTo(".{f["id"]}-f{i}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4, ease: "power2.out" }}, {t0 + 0.3:.3f});')
            tl.append(f'tl.to(".{f["id"]}-f{i}", {{ opacity: 0, duration: 0.25 }}, {t1 - 0.25:.3f});')
    tl.append(f'tl.to("#cam", {{ x: 0, y: 0, scale: {S0:.4f}, duration: 0.5, ease: "power3.inOut" }}, {dur - 0.55:.3f});')
    html = HEAD + f"""    #win {{ position: absolute; left: {WIN_X}px; top: {WIN_Y}px; width: {WIN_W}px; height: {WIN_H}px; border-radius: 14px; overflow: hidden; background: #121216; box-shadow: 0 0 0 2px #2a2a31; }}
    #cam {{ position: absolute; left: 0; top: 0; width: {VW}px; height: {VH}px; overflow: hidden; }}
    #cam video {{ position: absolute; left: -{CROP}px; top: -{CROP}px; width: {REC_W}px; height: {REC_H}px; }}
    .dim {{ position: absolute; opacity: 0; background: rgba(10,10,14,.42); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); }}
    .edge {{ position: absolute; opacity: 0; border: 2px solid rgba(255,255,255,.55); border-radius: 10px; }}
    #band {{ position: absolute; left: {WIN_X}px; right: {WIN_X}px; top: {WIN_Y + WIN_H + 6}px; height: 86px; display: flex; align-items: center; gap: 30px; }}
    .tag {{ font: 600 28px "IBM Plex Mono", monospace; color: #ffb000; letter-spacing: .06em; white-space: nowrap; width: 400px; }}
    .tag b {{ color: #9a9aa6; font-weight: 400; }}
    #caps {{ position: relative; flex: 1; height: 60px; }}
    .cap {{ position: absolute; left: 0; right: 0; top: 0; height: 60px; display: flex; align-items: center; opacity: 0; }}
    .cap .txt {{ font: 600 38px "Inter", sans-serif; color: #ececf0; white-space: nowrap; }}
  </style>
  <div id="root" data-composition-id="{f['id']}" data-width="1920" data-height="1080">
    <div id="win"><div id="cam">
      <video id="{f['id']}-vid" class="clip" data-start="0" data-duration="{dur}" data-media-start="{f['a']}" src="assets/clips/jam.mp4" muted playsinline></video>
      {''.join(rings)}
    </div></div>
    <div id="band"><div class="tag">{f['tab']} <b>·</b> {f['name']}</div><div id="caps">{''.join(caps)}</div></div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {chr(10).join('    ' + l for l in tl).strip()}
    window.__timelines["{f['id']}"] = tl;
  </script>
</template>
"""
    return html, dur

def title_scene():
    faders = "".join(f'<i id="in-f{i}" style="height:{h}px"></i>' for i, h in enumerate([260, 150, 330, 90, 220, 300, 180, 120, 250, 200, 310, 140]))
    tl = ['tl.fromTo("#in-faders", { y: 40 }, { y: 0, duration: 0.8, ease: "power3.out" }, 0);',
          'tl.fromTo(".in-l", { filter: "blur(18px)", y: 24 }, { filter: "blur(0px)", y: 0, duration: 0.6, ease: "power3.out", stagger: 0.07 }, 0);',
          'tl.fromTo("#in-sub", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 1.6);',
          'tl.fromTo("#in-chip", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 2.4);']
    for i in range(12):   # the faders slide in turn, on the beat
        tl.append(f'tl.fromTo("#in-f{i}", {{ scaleY: 0.25 }}, {{ scaleY: 1, duration: 0.5, ease: "power2.out" }}, {0.5 + i * 0.3125:.4f});')
    tl.append('tl.to("#root", { opacity: 0, duration: 0.4 }, 5.55);')
    html = HEAD + """    #in-faders { position: absolute; left: 1130px; top: 250px; width: 680px; height: 560px; display: flex; gap: 18px; align-items: flex-end; }
    #in-faders i { flex: 1; background: #ffb000; border-radius: 12px; transform-origin: 50% 100%; opacity: .92; }
    #in-word { position: absolute; left: 110px; top: 300px; font: 700 250px "IBM Plex Mono", monospace; letter-spacing: -0.04em; line-height: 1; }
    .in-l { display: inline-block; }
    #in-sub { position: absolute; left: 114px; top: 600px; width: 940px; font: 700 62px "Inter", sans-serif; line-height: 1.12; opacity: 0; }
    #in-chip { position: absolute; left: 114px; top: 830px; font: 500 30px "IBM Plex Mono", monospace; color: #ffb000; opacity: 0; line-height: 1.5; }
  </style>
  <div id="root" data-composition-id="intro" data-width="1920" data-height="1080">
    <div id="in-faders">""" + faders + """</div>
    <div id="in-word"><span class="in-l amber">404</span><span class="in-l">jam</span></div>
    <div id="in-sub">A free MIDI controller for the Roland SP-404 MkII, in your browser</div>
    <div id="in-chip">No install · no account · Chrome or Edge · Android app</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    """ + "\n    ".join(tl) + """
    window.__timelines["intro"] = tl;
  </script>
</template>
"""
    return html, 6.0

def problem_scene():
    rows = [("pr-1", "Five effect buses, one pair of hands.", "Each bus has its own effect and six parameters to reach.", ["TIME", "FEEDBACK", "LEVEL", "MODE", "W/F RATE", "W/F DEPTH"]),
            ("pr-2", "A good chain is hard to get back.", "It is a set of values you rebuild by hand.", ["Tape Echo", "JUNO Chorus", "Filter+Drive", "Reverb"]),
            ("pr-3", "Two parameters move one at a time.", "Sweeping both together takes a second hand.", ["X", "Y"])]
    def art(items): return "".join(f'<div class="chip mono">{x}</div>' for x in items)
    html_rows = "".join(f'<div class="row" id="{rid}"><div class="txt"><h2>{h}</h2><p>{p}</p><u id="{rid}-strike"></u></div><div class="art" id="{rid}-art">{art(items)}</div></div>' for rid, h, p, items in rows)
    tl = ['tl.fromTo("#pr-kicker", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 0.3);']
    for i, (rid, *_r) in enumerate(rows):
        t0 = 0.9 + i * 3.1
        tl += [f'tl.fromTo("#{rid}", {{ opacity: 0, x: -60 }}, {{ opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }}, {t0});',
               f'tl.fromTo("#{rid}-art > *", {{ opacity: 0, y: 24 }}, {{ opacity: 1, y: 0, duration: 0.45, ease: "power3.out", stagger: 0.1 }}, {t0 + 0.35});']
    tl += ['tl.fromTo(".row u", { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power2.out", stagger: 0.15 }, 9.6);',
           'tl.to(".row", { opacity: 0, duration: 0.45 }, 10.7);', 'tl.to("#pr-kicker", { opacity: 0, duration: 0.4 }, 10.7);',
           'tl.fromTo("#pr-answer", { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.7, ease: "back.out(1.6)" }, 11.1);']
    html = HEAD + """    #pr-kicker { position: absolute; left: 120px; top: 92px; font: 600 28px "IBM Plex Mono", monospace; color: #ffb000; letter-spacing: .14em; }
    .row { position: absolute; left: 120px; width: 1680px; height: 240px; display: flex; align-items: center; justify-content: space-between; opacity: 0; }
    #pr-1 { top: 170px; } #pr-2 { top: 440px; } #pr-3 { top: 710px; }
    .txt { position: relative; width: 1000px; }
    .txt h2 { font: 700 54px "Inter", sans-serif; line-height: 1.1; margin: 0 0 14px; }
    .txt p { font: 400 32px "Inter", sans-serif; color: #9a9aa6; margin: 0; }
    .txt u { position: absolute; left: 0; top: 36px; width: 100%; height: 6px; background: #ff5f5f; transform-origin: 0 50%; transform: scaleX(0); }
    .art { width: 560px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; }
    .chip { background: #1b1b20; border-radius: 10px; padding: 8px 18px; font-size: 28px; color: #ececf0; }
    #pr-answer { position: absolute; left: 0; right: 0; top: 400px; text-align: center; font: 700 92px "Inter", sans-serif; line-height: 1.12; opacity: 0; }
  </style>
  <div id="root" data-composition-id="problem" data-width="1920" data-height="1080">
    <div id="pr-kicker">THE SLOW PART</div>
    """ + html_rows + """
    <div id="pr-answer"><span class="amber">404jam</span> puts it under<br>your fingers</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    """ + "\n    ".join(tl) + """
    window.__timelines["problem"] = tl;
  </script>
</template>
"""
    return html, 14.0

def what_scene():
    tl = ['tl.fromTo("#wh-title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 0.2);',
          'tl.fromTo("#wh-br", { opacity: 0, x: -60 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, 0.9);',
          'tl.fromTo("#wh-sp", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, 1.5);',
          'tl.fromTo("#wh-cable", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, 2.1);',
          'tl.fromTo("#wh-cap1", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 }, 2.6);',
          'tl.fromTo("#wh-demo", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 4.8);',
          'tl.fromTo("#wh-app", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 6.6);',
          'tl.fromTo("#wh-foot", { opacity: 0 }, { opacity: 1, duration: 0.6 }, 8.6);']
    html = HEAD + """    #wh-title { position: absolute; left: 120px; top: 90px; font: 700 64px "Inter", sans-serif; opacity: 0; }
    .node { position: absolute; background: #1b1b20; border: 3px solid #34343b; border-radius: 22px; padding: 26px 30px; opacity: 0; }
    .node h3 { margin: 0 0 8px; font: 700 40px "Inter", sans-serif; } .node p { margin: 0; font: 400 28px "Inter", sans-serif; color: #9a9aa6; line-height: 1.3; }
    #wh-br { left: 120px; top: 270px; width: 640px; height: 340px; }
    #wh-sp { left: 1160px; top: 270px; width: 640px; height: 340px; }
    #wh-sp .grid { display: grid; grid-template-columns: repeat(4, 56px); gap: 12px; margin-top: 18px; } #wh-sp .grid i { height: 56px; background: #2c2c30; border-radius: 10px; }
    #wh-sp .grid i:nth-child(1), #wh-sp .grid i:nth-child(6), #wh-sp .grid i:nth-child(11) { background: #ffb000; }
    #wh-br .bars { display: flex; gap: 10px; align-items: flex-end; height: 120px; margin-top: 20px; } #wh-br .bars i { width: 36px; background: #ffb000; border-radius: 6px; }
    #wh-link { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; pointer-events: none; }
    #wh-cap1 { position: absolute; left: 760px; width: 400px; top: 470px; text-align: center; font: 600 28px "IBM Plex Mono", monospace; color: #ffb000; opacity: 0; line-height: 1.35; }
    #wh-demo { left: 120px; top: 700px; width: 800px; border-style: dashed; }
    #wh-app { left: 1000px; top: 700px; width: 800px; }
    #wh-foot { position: absolute; left: 120px; right: 120px; top: 985px; font: 400 28px "Inter", sans-serif; color: #9a9aa6; opacity: 0; }
    .code { font-family: "IBM Plex Mono", monospace; color: #ffb000; }
  </style>
  <div id="root" data-composition-id="what" data-width="1920" data-height="1080">
    <div id="wh-title">One web page, over USB MIDI</div>
    <svg id="wh-link" viewBox="0 0 1920 1080"><path id="wh-cable" d="M 760 440 L 1160 440" stroke="#ffb000" stroke-width="8" fill="none" stroke-linecap="butt" stroke-dasharray="1" pathLength="1" stroke-dashoffset="1"/></svg>
    <div class="node" id="wh-br"><h3>404jam in the browser</h3><p>Web MIDI in Chrome or Edge. Nothing to install, nothing to sign in to</p><div class="bars"><i style="height:60px"></i><i style="height:100px"></i><i style="height:40px"></i><i style="height:80px"></i><i style="height:110px"></i></div></div>
    <div class="node" id="wh-sp"><h3>Roland SP-404 MkII</h3><p>Five effect buses and the pads, over its USB MIDI</p><div class="grid"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div></div>
    <div id="wh-cap1">USB MIDI</div>
    <div class="node" id="wh-demo"><h3>No SP-404? <span class="code">Demo unit</span></h3><p>A pretend unit in the browser, with sound, effects and patterns, to try everything</p></div>
    <div class="node" id="wh-app"><h3>On a phone or tablet</h3><p>Touch faders that work with a finger, and an Android app</p></div>
    <div id="wh-foot">Forked from littletools404/404busdriver. Free and open source.</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    """ + "\n    ".join(tl) + """
    window.__timelines["what"] = tl;
  </script>
</template>
"""
    return html, 12.6

def outro_scene():
    url = "moahbeatlab.github.io/404jam"
    chars = "".join(f'<span class="ch" id="ou-c{i}">{c}</span>' for i, c in enumerate(url))
    tl = ['tl.fromTo("#ou-word", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power4.out" }, 0.2);',
          'tl.fromTo("#ou-try", { opacity: 0 }, { opacity: 1, duration: 0.5 }, 1.2);']
    tl += [f'tl.fromTo("#ou-c{i}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.05 }}, {1.7 + i * 0.07:.2f});' for i in range(len(url))]
    tl += ['tl.fromTo("#ou-status", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, 3.4);']
    html = HEAD + """    #ou-word { position: absolute; left: 0; right: 0; top: 150px; text-align: center; font: 700 190px "IBM Plex Mono", monospace; letter-spacing: -0.04em; opacity: 0; }
    #ou-try { position: absolute; left: 0; right: 0; top: 430px; text-align: center; font: 500 34px "IBM Plex Mono", monospace; color: #9a9aa6; opacity: 0; }
    #ou-url { position: absolute; left: 0; right: 0; top: 500px; text-align: center; font: 700 78px "IBM Plex Mono", monospace; color: #ffb000; }
    .ch { opacity: 0; }
    #ou-status { position: absolute; left: 260px; right: 260px; top: 760px; text-align: center; font: 400 31px "Inter", sans-serif; color: #9a9aa6; line-height: 1.5; opacity: 0; border-top: 2px solid #34343b; padding-top: 28px; }
    #ou-status b { color: #ececf0; font-weight: 600; }
  </style>
  <div id="root" data-composition-id="outro" data-width="1920" data-height="1080">
    <div id="ou-word"><span class="amber">404</span>jam</div>
    <div id="ou-try">Open it in Chrome or Edge, or use the Demo unit</div>
    <div id="ou-url">""" + chars + """</div>
    <div id="ou-status"><b>Free and open source.</b> The Sample Lab is a preview on the test page, not yet in the released app.</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    """ + "\n    ".join(tl) + """
    window.__timelines["outro"] = tl;
  </script>
</template>
"""
    return html, 9.2

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, "compositions"), exist_ok=True)
    scenes = [("intro",) + title_scene(), ("problem",) + problem_scene(), ("what",) + what_scene()]
    scenes += [(f["id"],) + feature(f) for f in FEATURES] + [("outro",) + outro_scene()]
    hosts, t = [], 0.0
    for i, (sid, html, dur) in enumerate(scenes):
        open(os.path.join(here, "compositions", sid + ".html"), "w").write(html)
        hosts.append(f'    <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t:.3f}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" data-width="1920" data-height="1080" style="z-index:{i + 1}"></div>')
        t += dur - (OVERLAP if i + 1 < len(scenes) else 0)
    total = round(t, 3)
    index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: #0d0d10; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}
      <audio id="music" src="assets/music.wav" data-start="0" data-duration="{total}" data-track-index="2" data-volume="0.7" data-fade-out="3"></audio>
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
      tl.seek(0);
    </script>
  </body>
</html>
"""
    open(os.path.join(here, "index.html"), "w").write(index)
    print("scenes:", [(s[0], s[2]) for s in scenes]); print("total:", total)

if __name__ == "__main__":
    main()
