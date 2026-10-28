#!/usr/bin/env python3
"""Writes index.html and compositions/*.html of the portrait (9:16, 1080x1920) 404jam reel, from the same recording and events.json
as the film. Run it in a HyperFrames project that has assets/clips/jam.mp4, assets/music.wav and events.json:

    python3 reel.py       # then: npx hyperframes check ; npx hyperframes snapshot ; npx hyperframes render

A section is a list of beats; a beat is a stretch of the recording (start in seconds or (event, offset), length), a caption, and the
part of the screen to show: the centre (cx, cy) in recording pixels and a scale s (1.0 shows 1080x1100 recording pixels).
Beats are hard cuts. Between sections the SP-404MkII drawing of build.py lights one pad and names the next section.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build as B

W, H = 1080, 1920
WIN_Y, WIN_H = 310, 1100          # the screen window; the top 250 px and the bottom 340 px stay free for the app's own interface
CAPTION_Y = 1436
REC_W, REC_H, CROP = B.REC_W, B.REC_H, B.CROP
at = B.at

# (recording start, seconds, caption, cx, cy, s)
SECTIONS = [
    dict(id="punch", tab="PERF", name="PUNCH", lit=5, beats=[
        (('punch-loaded', -0.9), 3.0, "Hold a slot to punch it in", 1500, 560, 1.06),
        (('punch-held', 0.2), 3.0, "Five buses change at once", 540, 560, 1.06),
        (('punch-mix', 0.2), 2.2, "Let go: all back", 540, 560, 1.06)]),
    dict(id="morph", tab="PERF", name="MORPH", lit=10, beats=[
        (('punch-morph-mode', 1.3), 3.0, "Or slide from now to the punch", 960, 540, 0.62)]),
    dict(id="xy", tab="XY", name="XY PAD", lit=0, beats=[
        (('xy-point1', -1.6), 2.6, "Hold a point to save it", 480, 700, 1.05),
        (('xy-point2', -1.5), 2.0, "Save a second point", 480, 700, 1.05),
        (('xy-go', 0.1), 4.0, "GO: it glides between both", 960, 420, 0.56)]),
    dict(id="motion", tab="PERF", name="MOTION", lit=15, beats=[
        (('motion-armed', 2.3), 4.2, "Motion records your fader move", 560, 560, 1.06),
        (('motion-playing', 0.4), 4.5, "Then the slot loops it", 560, 560, 1.06)]),
    dict(id="lfo", tab="PERF", name="LFO", lit=6, beats=[
        (('lfo-bus', -0.7), 3.0, "LFO: pick a bus and a knob", 960, 420, 0.62),
        (('lfo-shape', 0.0), 3.0, "Start it: a wave moves the knob", 960, 480, 0.62),
        (('lfo-depth', -0.2), 4.0, "On the mixer the fader follows", 560, 560, 1.06)]),
]

def place(cx, cy, s):
    """left/top of the full recording inside the window so that (cx, cy) is in the middle, never showing the capture's 14 px marker"""
    def axis(c, size, full):
        if (full - CROP) * s <= size:
            return (size - (full - CROP) * s) / 2 - CROP * s
        return min(-CROP * s, max(size - full * s, size / 2 - c * s))
    return round(axis(cx, W, REC_W), 1), round(axis(cy, WIN_H, REC_H), 1)

def section(sec):
    beats = [(at(r), d, cap, cx, cy, s) for r, d, cap, cx, cy, s in sec["beats"]]
    total = round(sum(b[1] for b in beats), 2)
    vids, caps, tl, t = [], [], [], 0.0
    for i, (rec, d, cap, cx, cy, s) in enumerate(beats):
        need = 0.5 + 0.3 * len(cap.split())
        if d < need - 0.1:
            print("  too quick: %s beat %d shows %.1f s, wants %.1f s: %r" % (sec["id"], i, d, need, cap))
        ox, oy = place(cx, cy, s)
        vids.append(f'<video id="{sec["id"]}-v{i}" class="clip" data-start="{t:.2f}" data-duration="{d}" data-media-start="{rec}" src="assets/clips/jam.mp4" muted playsinline style="left:{ox}px;top:{oy}px;width:{round(REC_W * s)}px;height:{round(REC_H * s)}px"></video>')
        caps.append(f'<div class="cap" id="{sec["id"]}-c{i}"><span>{cap}</span></div>')
        last = i == len(beats) - 1
        tl.append(f'tl.fromTo("#{sec["id"]}-c{i}", {{ opacity: 0, y: 26 }}, {{ opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }}, {t + 0.05:.2f});')
        tl.append(f'tl.to("#{sec["id"]}-c{i}", {{ opacity: 0, duration: 0.15 }}, {t + d - (0.2 if last else 0.15):.2f});')
        if i:
            tl.append(f'tl.set("#flash", {{ opacity: 0.22 }}, {t:.2f});')
            tl.append(f'tl.to("#flash", {{ opacity: 0, duration: 0.25, ease: "power2.out" }}, {t:.2f});')
        t += d
    html = B.HEAD + f"""    #root {{ width: {W}px; height: {H}px; }}
    #tag {{ position: absolute; left: 60px; top: 236px; font: 600 34px "IBM Plex Mono", monospace; color: #ffb000; letter-spacing: .06em; }}
    #tag b {{ color: #9a9aa6; font-weight: 400; }}
    #win {{ position: absolute; left: 0; top: {WIN_Y}px; width: {W}px; height: {WIN_H}px; overflow: hidden; background: #0d0d10; border-top: 2px solid #2a2a31; border-bottom: 2px solid #2a2a31; }}
    #win video {{ position: absolute; }}
    #flash {{ position: absolute; inset: 0; background: #ffb000; opacity: 0; }}
    .cap {{ position: absolute; left: 60px; width: {W - 120}px; top: {CAPTION_Y}px; height: 150px; display: flex; align-items: center; justify-content: center; text-align: center; opacity: 0; }}
    .cap span {{ font: 700 58px/1.12 "Inter", sans-serif; color: #ececf0; }}
  </style>
  <div id="root" data-composition-id="{sec['id']}" data-width="{W}" data-height="{H}">
    <div id="tag">{sec['tab']} <b>·</b> {sec['name']}</div>
    <div id="win">{''.join(vids)}<div id="flash"></div></div>
    {''.join(caps)}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    tl.set("#flash", {{ opacity: 0 }}, 0);
    tl.fromTo("#tag", {{ opacity: 0, x: -30 }}, {{ opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }}, 0.05);
    {chr(10).join('    ' + l for l in tl).strip()}
    window.__timelines["{sec['id']}"] = tl;
  </script>
</template>
"""
    return html, total

def hook():
    tl = ['tl.fromTo("#hk-word", { opacity: 0, y: 30, filter: "blur(14px)" }, { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.6, ease: "power3.out" }, 0.1);',
          'tl.fromTo("#hk-dev", { opacity: 0, y: 50, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" }, 0.2);',
          'tl.fromTo("#hk-chips", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 1.2);',
          'tl.fromTo("#hk-sub", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, 1.6);']
    for k, n in enumerate([0, 5, 10, 15]):
        tl.append(f'tl.fromTo("#hkdev-p{n}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.1 }}, {0.7 + k * 0.35:.2f});')
        tl.append(f'tl.to("#hkdev-p{n}", {{ opacity: 0.0, duration: 0.5 }}, {0.9 + k * 0.35:.2f});')
    html = B.HEAD + B.DEV_CSS + """    #root { width: 1080px; height: 1920px; }
    #hk-word { position: absolute; left: 0; right: 0; top: 280px; text-align: center; font: 700 190px "IBM Plex Mono", monospace; letter-spacing: -0.04em; line-height: 1; opacity: 0; }
    #hk-dev { position: absolute; left: 260px; width: 560px; top: 480px; opacity: 0; }
    #hk-chips { position: absolute; left: 0; right: 0; top: 1385px; text-align: center; font: 600 36px "IBM Plex Mono", monospace; color: #ffb000; letter-spacing: .06em; opacity: 0; }
    #hk-sub { position: absolute; left: 90px; right: 90px; top: 1450px; text-align: center; font: 700 52px/1.15 "Inter", sans-serif; opacity: 0; }
  </style>
  <div id="root" data-composition-id="hook" data-width="1080" data-height="1920">
    <div id="hk-word"><span class="amber">404</span>jam</div>
    <div id="hk-dev">""" + B.device_svg("hkdev") + """</div>
    <div id="hk-chips">PUNCH · MORPH · MOTION · LFO</div>
    <div id="hk-sub">Play your SP-404MkII effects like an instrument</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    """ + "\n    ".join(tl) + """
    window.__timelines["hook"] = tl;
  </script>
</template>
"""
    return html, 4.0

def transition(i, name, lit):
    uid = f"rt{i}"
    r, c = divmod(lit, 4)
    px, py = B.pad_center(lit); cx, cy = px / B.DEV_W, py / B.DEV_H
    tl = [f'tl.fromTo("#{uid}-wrap", {{ opacity: 0, scale: 0.9, y: 40 }}, {{ opacity: 1, scale: 1, y: 0, duration: 0.35, ease: "power3.out" }}, 0);',
          f'tl.fromTo("#{uid}-p{lit}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.1, ease: "none" }}, 0.25);',
          f'tl.fromTo("#{uid}-ring", {{ opacity: 0.9, scale: 0.9 }}, {{ opacity: 0, scale: 1.7, duration: 0.5, ease: "power2.out" }}, 0.27);',
          f'tl.fromTo("#{uid}-label", {{ opacity: 0, y: 16 }}, {{ opacity: 1, y: 0, duration: 0.28, ease: "power3.out" }}, 0.25);',
          f'tl.to("#{uid}-wrap", {{ opacity: 0, scale: 1.08, duration: 0.25, ease: "power2.in" }}, 1.1);',
          f'tl.to("#{uid}-label", {{ opacity: 0, duration: 0.2 }}, 1.1);']
    html = B.HEAD + B.DEV_CSS + f"""    #root {{ width: {W}px; height: {H}px; }}
    .xt-wrap {{ position: absolute; left: 170px; top: 260px; width: 740px; transform-origin: 50% 50%; opacity: 0; }}
    .xt-ring {{ position: absolute; width: 120px; height: 98px; margin: -49px 0 0 -60px; border: 5px solid #ffb000; border-radius: 22px; left: {cx * 100:.2f}%; top: {cy * 100:.2f}%; opacity: 0; }}
    .xt-label {{ position: absolute; left: 0; right: 0; top: 1470px; text-align: center; font: 700 76px "IBM Plex Mono", monospace; color: #ffb000; letter-spacing: .08em; opacity: 0; }}
  </style>
  <div id="root" data-composition-id="{uid}" data-width="{W}" data-height="{H}">
    <div class="xt-wrap" id="{uid}-wrap">{B.device_svg(uid)}<div class="xt-ring" id="{uid}-ring"></div></div>
    <div class="xt-label" id="{uid}-label">{name}</div>
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {chr(10).join('    ' + l for l in tl).strip()}
    window.__timelines["{uid}"] = tl;
  </script>
</template>
"""
    return html, 1.4

def outro():
    url = "moahbeatlab.github.io/404jam"
    chars = "".join(f'<span class="ch" id="ou-c{i}">{c}</span>' for i, c in enumerate(url))
    tl = ['tl.fromTo("#ou-word", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.6, ease: "power4.out" }, 0.1);',
          'tl.fromTo("#ou-try", { opacity: 0 }, { opacity: 1, duration: 0.4 }, 0.8);']
    tl += [f'tl.fromTo("#ou-c{i}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.05 }}, {1.2 + i * 0.05:.2f});' for i in range(len(url))]
    tl += ['tl.fromTo("#ou-status", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 2.8);']
    html = B.HEAD + B.DEV_CSS + """    #root { width: 1080px; height: 1920px; }
    #ou-dev { position: absolute; left: 160px; top: 330px; width: 760px; opacity: .1; }
    #ou-word { position: absolute; left: 0; right: 0; top: 420px; text-align: center; font: 700 190px "IBM Plex Mono", monospace; letter-spacing: -0.04em; opacity: 0; }
    #ou-try { position: absolute; left: 0; right: 0; top: 680px; text-align: center; font: 500 31px "Inter", sans-serif; color: #9a9aa6; opacity: 0; }
    #ou-url { position: absolute; left: 0; right: 0; top: 760px; text-align: center; font: 700 54px "IBM Plex Mono", monospace; color: #ffb000; }
    .ch { opacity: 0; }
    #ou-status { position: absolute; left: 70px; right: 70px; top: 1000px; text-align: center; font: 400 31px/1.45 "Inter", sans-serif; color: #9a9aa6; opacity: 0; }
    #ou-status b { color: #ececf0; font-weight: 600; }
  </style>
  <div id="root" data-composition-id="outro" data-width="1080" data-height="1920">
    <div id="ou-dev">""" + B.device_svg("oudev") + """</div>
    <div id="ou-word"><span class="amber">404</span>jam</div>
    <div id="ou-try">Free, in your browser. Chrome or Edge, or the Android app</div>
    <div id="ou-url">""" + chars + """</div>
    <div id="ou-status"><b>Free and open source.</b><br>Shown with the Demo unit, not yet checked on a real SP-404MkII.</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    """ + "\n    ".join(tl) + """
    window.__timelines["outro"] = tl;
  </script>
</template>
"""
    return html, 4.8

def main():
    here = os.path.dirname(os.path.abspath(__file__))
    os.makedirs(os.path.join(here, "compositions"), exist_ok=True)
    scenes = [("hook",) + hook()]
    for k, sec in enumerate(SECTIONS):
        scenes.append((f"rt{k}",) + transition(k, sec["name"], sec["lit"]))
        scenes.append((sec["id"],) + section(sec))
    scenes.append(("outro",) + outro())
    hosts, t = [], 0.0
    for i, (sid, html, dur) in enumerate(scenes):
        open(os.path.join(here, "compositions", sid + ".html"), "w").write(html)
        hosts.append(f'    <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" data-start="{t:.3f}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}" style="z-index:{i + 1}"></div>')
        t += dur
    total = round(t, 3)
    index = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={W}, height={H}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: {W}px; height: {H}px; overflow: hidden; background: #0d0d10; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total}" data-width="{W}" data-height="{H}">
{chr(10).join(hosts)}
      <audio id="music" src="assets/music.wav" data-start="0" data-duration="{total}" data-track-index="2" data-volume="0.7" data-fade-out="2"></audio>
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
