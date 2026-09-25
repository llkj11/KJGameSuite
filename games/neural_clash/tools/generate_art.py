#!/usr/bin/env python3
"""Generates Neural Clash art with Kenspire (imagegen.llkj.dev) and converts it into
SNES-style game assets:

  stages     one 448x224 pixel-art backdrop per stage (line-scrolled in game)
  sprites    per fighter: a reference image, then one reference-guided edit per pose,
             chroma-keyed, scaled, reduced to a 15-color palette with an outline, and
             packed into one atlas per costume (costumes are SNES-style palette swaps)
  portraits  per fighter: a bust portrait (recolored per costume the same way)

Raw downloads are kept in assets/art/raw/ (gitignored); processed files go to
assets/art/ and are registered under "art" in assets/manifest.json.

Auth: KENSPIRE_TOKEN, or KENSPIRE_BROKER_SECRET (+ optional KENSPIRE_BROKER_URL).

  python3 tools/generate_art.py [stages|sprites|portraits|all] [--only fable,archive]
                                [--poses idle,jab] [--force] [--process-only] [--workers 4]
Requires: pip install pillow numpy
"""
import argparse
import colorsys
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
ART = os.path.join(ASSETS, 'art')
RAW = os.path.join(ART, 'raw')
BASE = os.environ.get('KENSPIRE_BASE_URL', 'https://imagegen.llkj.dev').rstrip('/')
BROKER = os.environ.get('KENSPIRE_BROKER_URL', BASE + '/api/kencode/broker/token')
UA = 'NeuralClash-ArtTool/1.0'
OUTLINE = (20, 12, 28)
STAND_H = 84          # standing sprite height in pixels at body scale 1.0
lock = threading.Lock()


# ------------------------------------------------------------------ auth + http
_token = {'value': None, 'at': 0}


def token():
    with lock:
        if _token['value'] and time.time() - _token['at'] < 600:
            return _token['value']
        tok = os.environ.get('KENSPIRE_TOKEN', '').strip()
        secret = os.environ.get('KENSPIRE_BROKER_SECRET', '').strip()
        if secret:
            body = json.dumps({'service': 'kenspire', 'scope': 'kenspire.write'}).encode()
            req = urllib.request.Request(BROKER, data=body, method='POST', headers={
                'Authorization': 'Bearer ' + secret, 'Content-Type': 'application/json', 'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                tok = json.loads(r.read().decode()).get('access_token', '')
        if not tok:
            sys.exit('No Kenspire auth: set KENSPIRE_TOKEN or KENSPIRE_BROKER_SECRET in the environment.')
        _token['value'], _token['at'] = tok, time.time()
        return tok


def http(method, path, body=None, headers=None, raw=False, timeout=180):
    url = path if path.startswith('http') else BASE + '/' + path.lstrip('/')
    h = {'Authorization': 'Bearer ' + token(), 'User-Agent': UA, 'Accept': 'application/json, */*'}
    h.update(headers or {})
    for attempt in range(5):
        req = urllib.request.Request(url, data=body, method=method, headers=h)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
                return data if raw else json.loads(data.decode() or '{}')
        except urllib.error.HTTPError as e:
            msg = e.read().decode(errors='replace')[:400]
            if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                time.sleep(3 * 2 ** attempt)
                continue
            raise RuntimeError(f'{method} {path} -> {e.code}: {msg}')
        except urllib.error.URLError as e:
            if attempt < 4:
                time.sleep(3 * 2 ** attempt)
                continue
            raise RuntimeError(f'{method} {path} -> {e.reason}')


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, path in files:
        ctype = mimetypes.guess_type(path)[0] or 'image/png'
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{os.path.basename(path)}"\r\n'
                   f'Content-Type: {ctype}\r\n\r\n'.encode())
        out.append(open(path, 'rb').read())
        out.append(b'\r\n')
    out.append(f'--{boundary}--\r\n'.encode())
    return b''.join(out), 'multipart/form-data; boundary=' + boundary


def result_url(st):
    res = st.get('result') or {}
    if isinstance(res, str):
        return res
    for k in ('url', 'image_url', 'output_url'):
        if res.get(k):
            return res[k]
    for k in ('urls', 'images', 'outputs'):
        v = res.get(k)
        if v:
            v = v[0]
            return v if isinstance(v, str) else v.get('url')
    return st.get('url')


def wait_and_download(task, dest, label):
    tid = task.get('task_id') or task.get('id')
    if not tid:
        url = result_url(task)
        if not url:
            raise RuntimeError(f'{label}: unexpected response {json.dumps(task)[:300]}')
    else:
        t0 = time.time()
        while True:
            st = http('GET', f'/status/{tid}')
            s = str(st.get('status', '')).upper()
            if s == 'SUCCESS':
                url = result_url(st)
                break
            if s in ('FAILURE', 'FAILED', 'ERROR', 'REVOKED'):
                raise RuntimeError(f'{label}: {st.get("error") or st.get("failure_details") or s}')
            if time.time() - t0 > 900:
                raise RuntimeError(f'{label}: timed out')
            time.sleep(3)
    data = http('GET', url if url.startswith('http') else '/' + url.lstrip('/'), raw=True)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'wb') as f:
        f.write(data)
    return dest


def generate(prompt, dest, label, aspect='1:1'):
    body = json.dumps({'media_type': 'image', 'parameters': {'prompt': prompt, 'aspect_ratio': aspect}}).encode()
    task = http('POST', '/generate', body, {'Content-Type': 'application/json'})
    return wait_and_download(task, dest, label)


def edit(images, prompt, dest, label):
    body, ctype = multipart({'prompt': prompt, 'thinking_level': 'high'}, [('images', p) for p in images])
    task = http('POST', '/edit-image', body, {'Content-Type': ctype}, timeout=300)
    return wait_and_download(task, dest, label)


# ------------------------------------------------------------------ roster data from the game
def load_roster():
    js = os.path.join(ROOT, 'js', 'characters.js')
    code = ("const vm=require('vm'),fs=require('fs');const s={window:{}};"
            f"vm.runInNewContext(fs.readFileSync({json.dumps(js)},'utf8'),s);"
            "console.log(JSON.stringify(s.window.NC.ROSTER.map(c=>({id:c.id,s:(c.look.body&&c.look.body.s)||1,"
            "costumes:c.costumes.map(k=>({name:k.name,pal:k.pal}))}))))")
    return {c['id']: c for c in json.loads(subprocess.check_output(['node', '-e', code]).decode())}


# ------------------------------------------------------------------ image processing
def hex_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def snes(rgb):
    """Quantize to SNES 15-bit color."""
    return tuple(int(v) >> 3 << 3 | int(v) >> 5 for v in rgb)


def chroma_key(img):
    a = np.asarray(img.convert('RGB')).astype(np.int32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # magenta-ish: red and blue high, green much lower
    key = (r > 150) & (b > 150) & (g < 110) & (np.abs(r - b) < 90)
    # sample the border to catch off-magenta backgrounds too
    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    key |= dist < 40
    # pixels strongly tinted toward magenta are anti-aliased background fringe
    key |= (np.minimum(r, b) - g > 70) & (np.abs(r - b) < 70)
    alpha = np.where(key, 0, 255).astype(np.uint8)
    rgb = a.astype(np.uint8)
    rgb[key] = 0  # no background color left to bleed in when resizing
    # despill: pull remaining magenta cast out of edge pixels
    edge = np.zeros_like(key)
    edge[1:] |= key[:-1]; edge[:-1] |= key[1:]; edge[:, 1:] |= key[:, :-1]; edge[:, :-1] |= key[:, 1:]
    edge &= ~key
    spill = edge & (r > g) & (b > g)
    lim = np.minimum(r, b)[spill]
    rgb[spill, 0] = np.minimum(r[spill], g[spill] + (lim - g[spill]) // 3)
    rgb[spill, 2] = np.minimum(b[spill], g[spill] + (lim - g[spill]) // 3)
    out = np.dstack([rgb, alpha])
    return Image.fromarray(out, 'RGBA')


def largest_blob_bbox(alpha):
    ys, xs = np.nonzero(alpha > 0)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def quantize_rgba(img, colors):
    """Quantize RGBA (binary alpha) to a palette with no dithering; returns RGBA."""
    a = np.asarray(img)
    mask = a[..., 3] > 127
    rgb = Image.fromarray(a[..., :3])
    q = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    qa = np.asarray(q).astype(np.uint8)
    qa = (qa >> 3 << 3) | (qa >> 5)  # SNES 15-bit color
    out = np.dstack([qa, np.where(mask, 255, 0).astype(np.uint8)])
    return Image.fromarray(out, 'RGBA')


def add_outline(img):
    a = np.asarray(img).copy()
    m = a[..., 3] > 0
    grow = np.zeros_like(m)
    grow[1:] |= m[:-1]; grow[:-1] |= m[1:]; grow[:, 1:] |= m[:, :-1]; grow[:, :-1] |= m[:, 1:]
    edge = grow & ~m
    a[edge] = OUTLINE + (255,)
    return Image.fromarray(a, 'RGBA')


def to_sprite(raw_path, pose, body_s):
    img = chroma_key(Image.open(raw_path))
    bb = largest_blob_bbox(np.asarray(img)[..., 3])
    if not bb:
        raise RuntimeError('empty sprite after chroma key: ' + raw_path)
    img = img.crop(bb)
    w, h = img.size
    std = STAND_H * body_s
    if 'w' in pose:
        scale = std * pose['w'] / w
    else:
        scale = std * pose['h'] / h
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    small = img.convert('RGBa').resize((nw, nh), Image.Resampling.LANCZOS).convert('RGBA')
    a = np.asarray(small).copy()
    a[..., 3] = np.where(a[..., 3] > 110, 255, 0)
    small = quantize_rgba(Image.fromarray(a, 'RGBA'), 15)
    pad = Image.new('RGBA', (nw + 2, nh + 2), (0, 0, 0, 0))
    pad.paste(small, (1, 1))
    spr = add_outline(pad)
    # anchor: median x of the torso band, feet at the bottom
    al = np.asarray(spr)[..., 3] > 0
    band = al[int(spr.size[1] * 0.3):int(spr.size[1] * 0.7)]
    xs = np.nonzero(band)[1]
    ox = int(np.median(xs)) if len(xs) else spr.size[0] // 2
    return spr, ox, spr.size[1] - 1


# --- costume palette swaps
def rgb_to_lab(c):
    c = np.asarray(c, dtype=np.float64) / 255.0
    c = np.where(c > 0.04045, ((c + 0.055) / 1.055) ** 2.4, c / 12.92)
    m = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]])
    xyz = c @ m.T / np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])], -1)


FAMILIES = ('skin', 'outfit', 'accent', 'hair', 'glow')


def family_refs(pal):
    refs = []
    for fam in FAMILIES:
        base = hex_rgb(pal[fam])
        hls = colorsys.rgb_to_hls(*[v / 255 for v in base])
        for k in (0.55, 0.78, 1.0, 1.25):
            l = min(0.95, hls[1] * k)
            refs.append((fam, tuple(int(v * 255) for v in colorsys.hls_to_rgb(hls[0], l, hls[2]))))
    return refs


def recolor(img, pal_from, pal_to, keep_border=False):
    """Map every sprite color to its nearest costume family in the default palette and
    rebuild it in the target costume's family color at the same relative lightness.
    keep_border leaves the dominant border color (a portrait backdrop) untouched."""
    if pal_from == pal_to:
        return img
    a = np.asarray(img).copy()
    keep = set()
    if keep_border:
        border = np.concatenate([a[0, :, :3], a[-1, :, :3], a[:, 0, :3], a[:, -1, :3]])
        vals, counts = np.unique(border, axis=0, return_counts=True)
        keep.add(tuple(int(v) for v in vals[np.argmax(counts)]))
    refs = family_refs(pal_from)
    ref_lab = rgb_to_lab([r[1] for r in refs])
    colors = np.unique(a[a[..., 3] > 0][:, :3], axis=0)
    for c in colors:
        h, l, s = colorsys.rgb_to_hls(*(c / 255))
        if tuple(int(v) for v in c) in keep or tuple(c) == OUTLINE or l < 0.1 or (l > 0.9 and s < 0.15):
            continue
        d = ((ref_lab - rgb_to_lab(c)) ** 2).sum(-1)
        fam = refs[int(np.argmin(d))][0]
        if fam == 'skin' and pal_from['skin'] == pal_to['skin']:
            continue
        fh, fl, fs = colorsys.rgb_to_hls(*[v / 255 for v in hex_rgb(pal_from[fam])])
        th, tl, ts = colorsys.rgb_to_hls(*[v / 255 for v in hex_rgb(pal_to[fam])])
        ratio = l / max(fl, 0.05)
        nl = max(0.04, min(0.96, tl * ratio))
        ns = max(0.0, min(1.0, ts * (s / max(fs, 0.05)) if fs > 0.08 else ts))
        new = snes(tuple(int(v * 255) for v in colorsys.hls_to_rgb(th, nl, ns)))
        sel = (a[..., 0] == c[0]) & (a[..., 1] == c[1]) & (a[..., 2] == c[2]) & (a[..., 3] > 0)
        a[sel, :3] = new
    return Image.fromarray(a, 'RGBA')


def pack_atlas(frames):
    """frames: {pose: (img, ox, oy)} -> (atlas image, {pose: [x, y, w, h, ox, oy]})"""
    items = sorted(frames.items(), key=lambda kv: -kv[1][0].size[1])
    width, x, y, row_h, placed = 1024, 0, 0, 0, {}
    for name, (img, ox, oy) in items:
        w, h = img.size
        if x + w > width:
            x, y, row_h = 0, y + row_h + 1, 0
        placed[name] = [x, y, w, h, ox, oy]
        x += w + 1
        row_h = max(row_h, h)
    atlas = Image.new('RGBA', (width, y + row_h + 1), (0, 0, 0, 0))
    for name, (img, _, _) in items:
        px, py = placed[name][:2]
        atlas.paste(img, (px, py))
    return atlas, placed


def to_portrait(raw_path):
    img = Image.open(raw_path).convert('RGB')
    w, h = img.size
    tw, th = 160, 192
    s = max(tw / w, th / h)
    img = img.resize((round(w * s), round(h * s)), Image.Resampling.LANCZOS)
    left = (img.size[0] - tw) // 2
    img = img.crop((left, 0, left + tw, th))
    q = img.quantize(colors=48, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGBA')
    return q


def to_backdrop(raw_path):
    img = Image.open(raw_path).convert('RGB')
    w, h = img.size
    if w / h > 2:
        nw = h * 2
        img = img.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
    else:
        nh = w // 2
        img = img.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
    img = img.resize((448, 224), Image.Resampling.LANCZOS)
    return img.quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')


# ------------------------------------------------------------------ manifest
def read_manifest():
    p = os.path.join(ASSETS, 'manifest.json')
    try:
        return json.load(open(p))
    except FileNotFoundError:
        return {'music': {}, 'sfx': {}, 'voice': {}}


def write_manifest(m):
    with lock:
        with open(os.path.join(ASSETS, 'manifest.json'), 'w') as f:
            json.dump(m, f, indent=2)
            f.write('\n')


# ------------------------------------------------------------------ jobs
def run_stages(P, opt, man):
    art = man.setdefault('art', {}).setdefault('stages', {})
    jobs = {}
    for sid, desc in P['stages'].items():
        if opt.only and sid not in opt.only:
            continue
        raw = os.path.join(RAW, 'stages', sid + '.png')
        if not opt.process_only and (opt.force or not os.path.exists(raw)):
            prompt = (f"{P['style'].replace('sprite art', 'stage background art')}. Wide side-view fighting game "
                      f"stage background: {desc}. The ground fills the bottom quarter of the image, empty open floor "
                      "in the middle for two fighters, no fighters, no people in the foreground, no text, no UI, no health bars.")
            jobs[sid] = (generate, (prompt, raw, 'stage ' + sid, '16:9'))
    run_parallel(jobs, opt.workers)
    for sid in P['stages']:
        if opt.only and sid not in opt.only:
            continue
        raw = os.path.join(RAW, 'stages', sid + '.png')
        if os.path.exists(raw):
            out = os.path.join(ART, 'stages', sid + '.png')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            to_backdrop(raw).save(out, optimize=True)
            art[sid] = 'art/stages/' + sid + '.png'
            print('stage', sid, '->', out)
    write_manifest(man)


def run_parallel(jobs, workers):
    if not jobs:
        return
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fn, *args): name for name, (fn, args) in jobs.items()}
        for f in as_completed(futs):
            try:
                f.result()
                print('  done', futs[f])
            except Exception as e:  # keep going; the game falls back to procedural art
                print('  FAILED', futs[f], str(e)[:300])


def reference_path(cid):
    return os.path.join(RAW, 'sprites', cid, '_reference.png')


def ensure_reference(P, cid, opt):
    ref = reference_path(cid)
    if os.path.exists(ref) and not opt.force:
        return ref
    prompt = (f"{P['style']}. Full-body character sprite of {P['characters'][cid]} "
              f"Pose: {P['poses']['idle']['desc']}. {P['sprite_bg']}")
    return generate(prompt, ref, cid + ' reference')


def run_sprites(P, opt, man, roster):
    art = man.setdefault('art', {}).setdefault('sprites', {})
    for cid in P['characters']:
        if opt.only and cid not in opt.only:
            continue
        if not opt.process_only:
            ensure_reference(P, cid, opt)
            jobs = {}
            for pname, pose in P['poses'].items():
                if opt.poses and pname not in opt.poses:
                    continue
                raw = os.path.join(RAW, 'sprites', cid, pname + '.png')
                if os.path.exists(raw) and not opt.force:
                    continue
                prompt = (f"Redraw this exact same character with the same face, hair, outfit, colors, proportions "
                          f"and pixel-art style, in a new pose: {pose['desc']}. Full body. {P['sprite_bg']}")
                jobs[f'{cid}/{pname}'] = (edit, ([reference_path(cid)], prompt, raw, f'{cid} {pname}'))
            run_parallel(jobs, opt.workers)
        build_sprite_atlases(P, cid, roster[cid], art)
        write_manifest(man)


def build_sprite_atlases(P, cid, ch, art):
    frames = {}
    for pname, pose in P['poses'].items():
        raw = os.path.join(RAW, 'sprites', cid, pname + '.png')
        if not os.path.exists(raw):
            continue
        try:
            frames[pname] = to_sprite(raw, pose, ch['s'])
        except Exception as e:
            print('  skip', cid, pname, e)
    if 'idle' not in frames:
        print(f'{cid}: no idle pose yet, keeping procedural sprites')
        return
    base_pal = ch['costumes'][0]['pal']
    atlases = []
    meta = None
    for ci, cos in enumerate(ch['costumes']):
        recol = {k: (recolor(img, base_pal, cos['pal']), ox, oy) for k, (img, ox, oy) in frames.items()}
        atlas, placed = pack_atlas(recol)
        out = os.path.join(ART, 'sprites', f'{cid}_{ci}.png')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        atlas.save(out, optimize=True)
        atlases.append(f'art/sprites/{cid}_{ci}.png')
        meta = placed
    art[cid] = {'atlases': atlases, 'frames': meta}
    print(f'sprites {cid}: {len(frames)} poses x {len(atlases)} costumes')


def run_portraits(P, opt, man, roster):
    art = man.setdefault('art', {}).setdefault('portraits', {})
    jobs = {}
    for cid in P['characters']:
        if opt.only and cid not in opt.only:
            continue
        raw = os.path.join(RAW, 'portraits', cid + '.png')
        if not opt.process_only and (opt.force or not os.path.exists(raw)):
            ref = reference_path(cid)
            prompt = (f"Bust portrait (head and shoulders) of {P['characters'][cid]} "
                      "facing right in three-quarter view, confident fighting-game character-select expression, "
                      f"SNES fighting game portrait style like Street Fighter Alpha, crisp pixel art, {P['portrait_bg']}.")
            if os.path.exists(ref):
                jobs[cid] = (edit, ([ref], 'Using this character as the reference: ' + prompt, raw, cid + ' portrait'))
            else:
                jobs[cid] = (generate, (prompt, raw, cid + ' portrait', '5:6'))
    run_parallel(jobs, opt.workers)
    for cid in P['characters']:
        if opt.only and cid not in opt.only:
            continue
        raw = os.path.join(RAW, 'portraits', cid + '.png')
        if not os.path.exists(raw):
            continue
        base = to_portrait(raw)
        outs = []
        for ci, cos in enumerate(roster[cid]['costumes']):
            img = recolor(base, roster[cid]['costumes'][0]['pal'], cos['pal'], keep_border=True)
            out = os.path.join(ART, 'portraits', f'{cid}_{ci}.png')
            os.makedirs(os.path.dirname(out), exist_ok=True)
            img.save(out, optimize=True)
            outs.append(f'art/portraits/{cid}_{ci}.png')
        art[cid] = outs
        print('portrait', cid)
    write_manifest(man)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('what', nargs='?', default='all', choices=['all', 'stages', 'sprites', 'portraits'])
    ap.add_argument('--only', type=lambda s: s.split(','))
    ap.add_argument('--poses', type=lambda s: s.split(','))
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--process-only', action='store_true', help='rebuild game assets from existing raw files')
    ap.add_argument('--workers', type=int, default=4)
    opt = ap.parse_args()
    P = json.load(open(os.path.join(ROOT, 'tools', 'art_prompts.json')))
    roster = load_roster()
    man = read_manifest()
    if not opt.process_only:
        token()  # fail fast without auth
    if opt.what in ('all', 'stages'):
        run_stages(P, opt, man)
    if opt.what in ('all', 'sprites'):
        run_sprites(P, opt, man, roster)
    if opt.what in ('all', 'portraits'):
        run_portraits(P, opt, man, roster)
    print('Done. Reload the game to see the new art.')


if __name__ == '__main__':
    main()
