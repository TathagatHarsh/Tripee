#!/usr/bin/env python3
"""
Splice the seven chapters into one film and slice it into scrub frames.

    python3 scripts/build-film.py

Reads from film-assets/ (gitignored, heavy):

    ch1-hero.(png|jpg|jpeg|webp)     still, held
    ch2-filling.mp4
    ch3-frosting.mp4
    ch4-comb.mp4
    ch5-drip.mp4
    ch6-toppings.mp4
    ch7-cut.(png|jpg|jpeg|webp)      still, held

Writes into public/film/:

    desktop/frame_0001.webp …  12 fps, 1400px
    mobile/frame_0001.webp  …   8 fps,  900px
    <track>/manifest.json      count, pattern, and the measured chapter starts
    poster.txt                 the first frame as a data URI, inlined by the page
    cut.webp                   the last frame, for the intake
    crop-1..3.webp             re-framed crops for the kitchen section

Two things here are deliberate and easy to undo by accident.

The chapter start fractions are MEASURED off the spliced timeline and written
into the manifest, rather than being written down anywhere a person can edit.
Hand-kept timings are how a caption ends up firing one chapter early.

And the desktop track is fitted to a byte budget by stepping the WebP quality
down until it fits, rather than by dropping frames. This is a bakery's front
door on mobile data: a 30 MB scrub track is a page nobody in Hyderabad waits
for. Frames are the thing you feel; quality is the thing you do not.
"""

import base64
import json
import os
import subprocess
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "film-assets")
OUT = os.path.join(ROOT, "public", "film")
WORK = os.path.join(SRC, "work")

XFADE = 0.4

# The master is 16:9 because Google Flow emits nothing else, but the cake only
# occupies about a quarter of that width — a 700vh pinned scroll, the single
# biggest investment on the page, was resolving onto a cake 300px wide with the
# bottom third of every frame empty bench. This re-cuts to the 4:3 the brief
# asked for, measured to clear the bare stack, the crown, the wedge and the
# crumbs in every chapter. Cropping the SOURCE is the fix; cover-cropping in CSS
# is banned, and the specimen must stay contain-fit over a paper letterbox.
CROP = "crop=1240:930:420:120"
# The two still chapters only need enough frames to exist. They used to hold 2.5s
# and 3.0s — 66 byte-identical frames, about 1.4 MB of pure duplication — back
# when scroll mapped onto film time. Scroll is now divided equally between the
# seven chapters and remapped, so a held still gets its full seventh of the page
# whatever it costs in seconds.
STILL_HOLD = {"ch1-hero": 0.8, "ch7-cut": 0.8}

# id here must match app/film/chapters.ts CHAPTERS[].id
CHAPTERS = [
    ("stack", "ch1-hero", "still"),
    ("filling", "ch2-filling", "clip"),
    ("frosting", "ch3-frosting", "clip"),
    ("comb", "ch4-comb", "clip"),
    ("drip", "ch5-drip", "clip"),
    ("toppings", "ch6-toppings", "clip"),
    ("cut", "ch7-cut", "still"),
]

TRACKS = [
    # 10fps, not 12: at 700vh the desktop track lands a new frame every ~12px of
    # scroll, which is below the threshold anyone can resolve while dragging, and
    # the two frames saved per second buy back the quality the 4:3 crop cost.
    {"name": "desktop", "fps": 10, "width": 1400, "budget_mb": 12.0},
    {"name": "mobile", "fps": 8, "width": 900, "budget_mb": 5.0},
]

STILL_EXT = (".png", ".jpg", ".jpeg", ".webp")


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


def duration(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def find_source(stem):
    for ext in (".mp4", *STILL_EXT):
        p = os.path.join(SRC, stem + ext)
        if os.path.exists(p):
            return p
    return None


def still_to_clip(still, stem):
    """Hold a still for its chapter's duration, so the splice sees seven clips."""
    out = os.path.join(WORK, stem + "-held.mp4")
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(still):
        return out
    run(["ffmpeg", "-y", "-v", "error", "-loop", "1", "-i", still,
         "-t", str(STILL_HOLD[stem]), "-r", "24",
         # even dimensions, or libx264 refuses the frame
         "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
         "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", out])
    return out


def build_master():
    """Crossfade the seven chapters, and measure where each one actually starts."""
    inputs = []
    for cid, stem, kind in CHAPTERS:
        src = find_source(stem)
        if not src:
            sys.exit(f"missing chapter source: film-assets/{stem}.*")
        if kind == "still":
            src = still_to_clip(src, stem)
        inputs.append((cid, src, duration(src)))

    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-select_streams", "v",
         "-show_entries", "stream=width,height", "-of", "csv=p=0", inputs[0][1]],
        capture_output=True, text=True, check=True)
    w, h = probe.stdout.strip().split(",")[:2]

    args = ["ffmpeg", "-y", "-v", "error"]
    for _, src, _ in inputs:
        args += ["-i", src]

    filters = []
    for i in range(len(inputs)):
        filters.append(
            f"[{i}:v]scale={w}:{h}:force_original_aspect_ratio=decrease,"
            f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,fps=24,setsar=1[n{i}]")

    starts = [{"id": inputs[0][0], "start": 0.0}]
    prev, prev_end = "[n0]", inputs[0][2]
    for i in range(1, len(inputs)):
        cid, _, dur = inputs[i]
        offset = prev_end - XFADE
        out = f"[v{i}]"
        filters.append(
            f"{prev}[n{i}]xfade=transition=fade:duration={XFADE}:"
            f"offset={offset:.4f}{out}")
        starts.append({"id": cid, "start": offset})
        prev, prev_end = out, offset + dur
    total = prev_end

    master = os.path.join(WORK, "master.mp4")
    args += ["-filter_complex", ";".join(filters), "-map", prev,
             "-an", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", master]
    run(args)

    for s in starts:
        s["start"] = round(s["start"] / total, 4)
    return master, starts, total


def slice_track(master, track, starts):
    """Slice one track, stepping quality down until it fits its byte budget."""
    d = os.path.join(OUT, track["name"])
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(d):
        if f.endswith((".webp", ".png", ".json")):
            os.remove(os.path.join(d, f))

    run(["ffmpeg", "-y", "-v", "error", "-i", master,
         "-vf", f"{CROP},fps={track['fps']},scale={track['width']}:-2",
         os.path.join(d, "frame_%04d.png")])
    pngs = sorted(f for f in os.listdir(d) if f.endswith(".png"))

    chosen, total = None, 0
    for quality in (82, 74, 66, 58, 50):
        total = 0
        for f in pngs:
            p = os.path.join(d, f)
            with Image.open(p) as im:
                im.save(p.replace(".png", ".webp"), "WEBP", quality=quality, method=5)
            total += os.path.getsize(p.replace(".png", ".webp"))
        chosen = quality
        if total / 1e6 <= track["budget_mb"]:
            break

    for f in pngs:
        os.remove(os.path.join(d, f))

    manifest = {
        "count": len(pngs),
        "pattern": f"/film/{track['name']}/frame_%04d.webp",
        "chapters": starts,
    }
    with open(os.path.join(d, "manifest.json"), "w") as fh:
        json.dump(manifest, fh)

    return {"count": len(pngs), "mb": total / 1e6, "quality": chosen, "dir": d}


def derive_extras(mobile_dir, desktop_dir, count):
    """The poster, the cut still, and three re-framed crops. No new generations."""
    first = os.path.join(mobile_dir, "frame_0001.webp")
    with open(first, "rb") as fh:
        uri = "data:image/webp;base64," + base64.b64encode(fh.read()).decode()
    with open(os.path.join(OUT, "poster.txt"), "w") as fh:
        fh.write(uri)

    last = os.path.join(desktop_dir, f"frame_{count:04d}.webp")
    with Image.open(last) as im:
        im.save(os.path.join(OUT, "cut.webp"), "WEBP", quality=82)

    # Re-framed, not repeated: each crop is a tighter read of a frame the film
    # already ran past, at a size the film never showed it at.
    boxes = [(0.28, 0.30, 0.72, 0.78), (0.34, 0.16, 0.66, 0.62), (0.22, 0.40, 0.78, 0.92)]
    for i, (l, t, r, b) in enumerate(boxes, start=1):
        idx = max(1, round(count * (0.18 + 0.30 * (i - 1))))
        src = os.path.join(desktop_dir, f"frame_{idx:04d}.webp")
        if not os.path.exists(src):
            continue
        with Image.open(src) as im:
            w, h = im.size
            im.crop((int(l * w), int(t * h), int(r * w), int(b * h))).save(
                os.path.join(OUT, f"crop-{i}.webp"), "WEBP", quality=80)
    return len(uri)


def main():
    os.makedirs(WORK, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    master, starts, total = build_master()
    print(f"master: {total:.1f}s, {len(starts)} chapters\n")

    results = {}
    for track in TRACKS:
        r = slice_track(master, track, starts)
        results[track["name"]] = r
        flag = "" if r["mb"] <= track["budget_mb"] else "  ** OVER BUDGET **"
        print(f"{track['name']:<8} {r['count']:>4} frames  "
              f"{r['mb']:>6.2f} MB  q{r['quality']}"
              f"  (budget {track['budget_mb']} MB){flag}")

    poster_bytes = derive_extras(
        results["mobile"]["dir"], results["desktop"]["dir"], results["desktop"]["count"])
    print(f"\nposter    {poster_bytes / 1024:.1f} KB inlined data URI")
    print("cut.webp, crop-1..3.webp written\n")

    print("measured chapter starts (the page reads these, nothing is hand-kept):")
    for s in starts:
        print(f"  {s['id']:<10} {s['start']:.4f}")


if __name__ == "__main__":
    main()
