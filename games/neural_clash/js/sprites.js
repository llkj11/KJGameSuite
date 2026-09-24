// Sprite system: a 14-joint skeletal rig rasterized into palette-indexed pixels
// (15 colors + transparent, like SNES 4bpp OBJ palettes), shaded with 3-tone ramps
// lit from the upper left, outlined, and cached per pose/costume.
(function (NC) {
  'use strict';
  var U = NC.U;

  // Palette index layout (shared by every fighter).
  var P = { OUT: 1, SKIN: 2, OUTFIT: 5, ACC: 8, HAIR: 11, GLOW: 14, WHITE: 15 };
  var RAMPS = { skin: 2, outfit: 5, accent: 8, hair: 11 };

  function buildPalette(pal) {
    var out = [null, pal.outline || '#140c1c'];
    ['skin', 'outfit', 'accent', 'hair'].forEach(function (k) {
      var r = U.ramp(pal[k]);
      out.push(r[0], r[1], r[2]);
    });
    out.push(pal.glow || '#ffe070', pal.emblem || '#f4f0e8');
    return out.map(function (h) { return h ? U.hexToRgb(h) : null; });
  }

  // ------------------------------------------------------------------ raster
  function Raster(w, h) {
    this.w = w; this.h = h;
    this.px = new Uint8Array(w * h);
  }
  var LX = -0.55, LY = -0.83; // light direction (normalized-ish), upper-left; heads override

  Raster.prototype.set = function (x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  };
  Raster.prototype.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.px[y * this.w + x];
  };
  // ramp: [shadow, base, highlight] palette indices, or a single index for flat fill.
  var TH_HI = 0.38, TH_SH = -0.3;
  function shadeIdx(ramp, dot) {
    if (typeof ramp === 'number') return ramp;
    return dot > TH_HI ? ramp[2] : dot < TH_SH ? ramp[0] : ramp[1];
  }
  // Tapered capsule from A to B with radii r0 -> r1.
  Raster.prototype.capsule = function (ax, ay, bx, by, r0, r1, ramp, outline) {
    var minX = Math.floor(Math.min(ax - r0, bx - r1)) - 2, maxX = Math.ceil(Math.max(ax + r0, bx + r1)) + 2;
    var minY = Math.floor(Math.min(ay - r0, by - r1)) - 2, maxY = Math.ceil(Math.max(ay + r0, by + r1)) + 2;
    var dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 0.0001;
    var o = outline ? 1 : 0;
    for (var y = minY; y <= maxY; y++) {
      for (var x = minX; x <= maxX; x++) {
        var px = x + 0.5, py = y + 0.5;
        var t = ((px - ax) * dx + (py - ay) * dy) / L2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        var cx = ax + dx * t, cy = ay + dy * t;
        var r = r0 + (r1 - r0) * t;
        var ex = px - cx, ey = py - cy, d = Math.sqrt(ex * ex + ey * ey);
        if (d <= r) {
          var dot = (ex * LX + ey * LY) / (r || 1);
          this.set(x, y, shadeIdx(ramp, dot));
        } else if (o && d <= r + 1) {
          this.set(x, y, P.OUT);
        }
      }
    }
  };
  Raster.prototype.ellipse = function (cx, cy, rx, ry, ramp, outline) {
    for (var y = Math.floor(cy - ry - 2); y <= Math.ceil(cy + ry + 2); y++) {
      for (var x = Math.floor(cx - rx - 2); x <= Math.ceil(cx + rx + 2); x++) {
        var nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
        var d = nx * nx + ny * ny;
        if (d <= 1) this.set(x, y, shadeIdx(ramp, (nx * LX + ny * LY)));
        else if (outline) {
          var nx2 = (x + 0.5 - cx) / (rx + 1), ny2 = (y + 0.5 - cy) / (ry + 1);
          if (nx2 * nx2 + ny2 * ny2 <= 1) this.set(x, y, P.OUT);
        }
      }
    }
  };
  // Filled polygon (even-odd scanline), flat base color with edge shading.
  Raster.prototype.poly = function (pts, ramp) {
    var minY = Infinity, maxY = -Infinity, i;
    for (i = 0; i < pts.length; i += 2) { minY = Math.min(minY, pts[i + 1]); maxY = Math.max(maxY, pts[i + 1]); }
    var mark = [];
    for (var y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      var sy = y + 0.5, xs = [];
      for (i = 0; i < pts.length; i += 2) {
        var x1 = pts[i], y1 = pts[i + 1], j = (i + 2) % pts.length, x2 = pts[j], y2 = pts[j + 1];
        if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) xs.push(x1 + (sy - y1) / (y2 - y1) * (x2 - x1));
      }
      xs.sort(function (a, b) { return a - b; });
      for (var k = 0; k + 1 < xs.length; k += 2) {
        for (var x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) mark.push(x, y);
      }
    }
    var base = typeof ramp === 'number' ? ramp : ramp[1];
    var tmp = {};
    for (i = 0; i < mark.length; i += 2) tmp[mark[i] + ',' + mark[i + 1]] = 1;
    for (i = 0; i < mark.length; i += 2) {
      var mx = mark[i], my = mark[i + 1], c = base;
      if (typeof ramp !== 'number') {
        if (!tmp[(mx - 1) + ',' + my] || !tmp[mx + ',' + (my - 1)]) c = ramp[2];
        else if (!tmp[(mx + 1) + ',' + my] || !tmp[mx + ',' + (my + 1)]) c = ramp[0];
      }
      this.set(mx, my, c);
    }
  };
  Raster.prototype.rect = function (x, y, w, h, c) {
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) this.set(x + xx, y + yy, c);
  };
  Raster.prototype.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 400; n++) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  Raster.prototype.outline = function () {
    var w = this.w, h = this.h, src = this.px, out = new Uint8Array(src);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      if (src[y * w + x]) continue;
      if ((x > 0 && src[y * w + x - 1] > 1) || (x < w - 1 && src[y * w + x + 1] > 1) ||
          (y > 0 && src[(y - 1) * w + x] > 1) || (y < h - 1 && src[(y + 1) * w + x] > 1)) out[y * w + x] = P.OUT;
    }
    this.px = out;
  };
  Raster.prototype.toCanvas = function (palette, mode) {
    var c = U.makeCanvas(this.w, this.h), x = c.getContext('2d');
    var img = x.createImageData(this.w, this.h), d = img.data;
    for (var i = 0; i < this.px.length; i++) {
      var p = this.px[i];
      if (!p) continue;
      var col = palette[p];
      if (mode === 'flash') col = p === P.OUT ? [255, 255, 255] : [255, 255, 255];
      else if (mode === 'dark') col = p === P.OUT ? [0, 0, 0] : [16, 8, 32];
      else if (mode === 'red') col = p === P.OUT ? [60, 0, 0] : [255, Math.min(255, col[1] * 0.4), Math.min(255, col[2] * 0.4)];
      else if (mode === 'gold') col = p === P.OUT ? [80, 40, 0] : [255, Math.min(255, 160 + col[1] * 0.4), 60];
      d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  };

  // ------------------------------------------------------------------ rig
  function dir(a) { var r = a * Math.PI / 180; return [Math.sin(r), Math.cos(r)]; }

  var DEFAULT_BODY = {
    s: 1, torso: 21, neck: 3, headR: 7, uarm: 12, farm: 11, thigh: 15, shin: 15,
    chest: 8.5, waist: 6.5, wU: 3.4, wF: 3.0, wT: 4.6, wS: 3.7, hand: 3.1, foot: 5.5, bulk: 1
  };

  // Poses: hip offset x/y, torso lean t, head tilt h, back/front shoulder+elbow, back/front hip+knee.
  var POSES = {
    idle0: { t: 8, bs: 38, be: 95, fs: 60, fe: 85, bh: -16, bk: 16, fh: 22, fk: 22 },
    idle1: { y: 1, t: 9, bs: 35, be: 98, fs: 57, fe: 88, bh: -16, bk: 19, fh: 22, fk: 25 },
    idle2: { y: 1.5, t: 10, bs: 33, be: 100, fs: 55, fe: 90, bh: -16, bk: 21, fh: 22, fk: 27 },
    walk0: { t: 9, bs: 40, be: 95, fs: 58, fe: 85, bh: -22, bk: 12, fh: 24, fk: 22 },
    walk1: { y: -1, t: 9, bs: 36, be: 95, fs: 62, fe: 85, bh: -5, bk: 45, fh: 8, fk: 8 },
    walk2: { t: 9, bs: 32, be: 95, fs: 66, fe: 85, bh: 22, bk: 20, fh: -20, fk: 12 },
    walk3: { y: -1, t: 9, bs: 36, be: 95, fs: 62, fe: 85, bh: 6, bk: 6, fh: -4, fk: 45 },
    crouch: { t: 14, bs: 45, be: 95, fs: 62, fe: 88, bh: 48, bk: 128, fh: 78, fk: 118 },
    jumpUp: { air: 1, t: 4, bs: 70, be: 80, fs: 80, fe: 70, bh: 10, bk: 50, fh: 40, fk: 70 },
    jumpTuck: { air: 1, t: 15, bs: 60, be: 100, fs: 75, fe: 95, bh: 70, bk: 120, fh: 88, fk: 120 },
    jumpDown: { air: 1, t: 0, bs: 80, be: 50, fs: 95, fe: 40, bh: -5, bk: 30, fh: 25, fk: 40 },
    land: { y: 3, t: 18, bs: 50, be: 95, fs: 60, fe: 90, bh: 30, bk: 70, fh: 50, fk: 70 },
    block: { t: -6, bs: 72, be: 115, fs: 62, fe: 125, bh: -16, bk: 12, fh: 16, fk: 16 },
    blockLow: { t: 6, bs: 72, be: 115, fs: 62, fe: 125, bh: 48, bk: 128, fh: 78, fk: 118 },
    hitHigh: { x: -2, t: -22, h: -18, bs: -25, be: 40, fs: 15, fe: 40, bh: -8, bk: 12, fh: 22, fk: 28 },
    hitGut: { x: -1, t: 32, h: 20, bs: 15, be: 50, fs: 35, fe: 40, bh: -15, bk: 25, fh: 30, fk: 35 },
    hitLow: { t: 20, h: 10, bs: 20, be: 30, fs: 30, fe: 30, bh: 50, bk: 110, fh: 60, fk: 90 },
    fall: { air: 1, t: -55, h: -10, bs: -60, be: 20, fs: -20, fe: 30, bh: 50, bk: 40, fh: 75, fk: 30 },
    lying: { lying: 1, t: -90, h: -5, bs: 5, be: 10, fs: 20, fe: 20, bh: 88, bk: 5, fh: 92, fk: 10 },
    getup: { t: 30, bs: 20, be: 40, fs: 40, fe: 40, bh: 60, bk: 130, fh: 90, fk: 110 },
    dizzy0: { t: -4, h: 12, bs: 5, be: 15, fs: 12, fe: 20, bh: -10, bk: 20, fh: 15, fk: 30 },
    dizzy1: { x: 1, t: 4, h: -12, bs: 10, be: 20, fs: 5, fe: 15, bh: -15, bk: 15, fh: 10, fk: 25 },
    win0: { t: 0, bs: 25, be: 60, fs: 168, fe: 8, bh: -12, bk: 5, fh: 12, fk: 5 },
    win1: { y: -1, t: -3, h: -8, bs: 25, be: 60, fs: 172, fe: 4, bh: -12, bk: 5, fh: 12, fk: 5 },
    taunt: { t: -2, h: -4, bs: 20, be: 100, fs: 95, fe: 2, bh: -10, bk: 8, fh: 14, fk: 8 },
    lose: { t: 30, h: 30, bs: 5, be: 5, fs: 10, fe: 5, bh: 40, bk: 110, fh: 70, fk: 150 },
    // normals
    lp0: { t: 10, bs: 40, be: 95, fs: 62, fe: 60, bh: -18, bk: 16, fh: 24, fk: 22 },
    lp1: { x: 2, t: 14, bs: 45, be: 100, fs: 88, fe: 4, bh: -20, bk: 14, fh: 26, fk: 20 },
    hp0: { x: -1, t: 2, bs: 30, be: 70, fs: 30, fe: 110, bh: -16, bk: 16, fh: 22, fk: 22 },
    hp1: { x: 4, t: 24, bs: 15, be: 40, fs: 92, fe: 0, bh: -32, bk: 6, fh: 36, fk: 22 },
    hp2: { x: 2, t: 16, bs: 25, be: 60, fs: 75, fe: 30, bh: -26, bk: 10, fh: 30, fk: 22 },
    lk0: { t: 0, bs: 40, be: 95, fs: 55, fe: 90, bh: -6, bk: 8, fh: 50, fk: 70 },
    lk1: { t: -8, bs: 45, be: 90, fs: 50, fe: 95, bh: -6, bk: 6, fh: 82, fk: 8 },
    hk0: { t: -8, bs: 50, be: 90, fs: 40, fe: 90, bh: -4, bk: 6, fh: 70, fk: 100 },
    hk1: { t: -28, h: 8, bs: 70, be: 60, fs: 20, fe: 70, bh: -2, bk: 4, fh: 118, fk: 6 },
    hk2: { t: -18, bs: 60, be: 70, fs: 30, fe: 80, bh: -4, bk: 6, fh: 95, fk: 60 },
    clp: { t: 18, bs: 45, be: 95, fs: 86, fe: 4, bh: 48, bk: 128, fh: 78, fk: 118 },
    chp0: { t: 14, bs: 45, be: 95, fs: 30, fe: 100, bh: 48, bk: 128, fh: 78, fk: 118 },
    chp1: { y: -4, t: 0, bs: 30, be: 60, fs: 160, fe: 8, bh: 30, bk: 70, fh: 50, fk: 70 },
    clk: { t: 20, bs: 50, be: 95, fs: 60, fe: 90, bh: 60, bk: 130, fh: 86, fk: 2 },
    chk0: { t: 25, bs: 60, be: 60, fs: 40, fe: 60, bh: 55, bk: 140, fh: 80, fk: 60 },
    chk1: { t: 30, bs: 75, be: 30, fs: 10, fe: 60, bh: 60, bk: 150, fh: 90, fk: -4 },
    jlp: { air: 1, t: 18, bs: 60, be: 100, fs: 55, fe: 2, bh: 60, bk: 110, fh: 75, fk: 110 },
    jhp: { air: 1, t: 25, bs: 40, be: 60, fs: 50, fe: 0, bh: 40, bk: 90, fh: 60, fk: 80 },
    jlk: { air: 1, t: -5, bs: 70, be: 90, fs: 80, fe: 80, bh: 90, bk: 130, fh: 60, fk: 0 },
    jhk: { air: 1, t: -15, bs: 80, be: 60, fs: 60, fe: 70, bh: 70, bk: 120, fh: 75, fk: -2 },
    throw0: { x: 3, t: 20, bs: 85, be: 20, fs: 95, fe: 15, bh: -26, bk: 10, fh: 32, fk: 22 },
    throw1: { x: -2, t: -25, h: -10, bs: 150, be: 20, fs: 165, fe: 10, bh: -30, bk: 10, fh: 30, fk: 20 },
    // specials
    castPrep: { x: -2, t: -6, bs: -30, be: 70, fs: -18, fe: 80, bh: -20, bk: 20, fh: 26, fk: 30 },
    cast: { x: 4, t: 14, bs: 86, be: 2, fs: 92, fe: 0, bh: -34, bk: 8, fh: 38, fk: 26 },
    rise0: { y: 2, t: 20, bs: 30, be: 60, fs: 40, fe: 110, bh: 30, bk: 80, fh: 60, fk: 80 },
    rise1: { air: 1, t: -8, h: -10, bs: 30, be: 60, fs: 172, fe: 4, bh: 10, bk: 50, fh: 70, fk: 100 },
    dash: { x: 3, t: 38, bs: -45, be: 30, fs: 100, fe: 0, bh: -55, bk: 30, fh: 45, fk: 35 },
    spin0: { t: 0, bs: -95, be: 0, fs: 95, fe: 0, bh: -14, bk: 10, fh: 14, fk: 10 },
    spin1: { t: 0, bs: 95, be: 0, fs: -95, fe: 0, bh: 14, bk: 10, fh: -14, fk: 10 },
    charge: { y: 2, t: 22, bs: -12, be: 95, fs: -8, fe: 105, bh: -42, bk: 36, fh: 44, fk: 56 },
    counter: { t: -8, bs: 55, be: 105, fs: 100, fe: 75, bh: -18, bk: 12, fh: 18, fk: 18 },
    grab: { x: 5, t: 22, bs: 90, be: 15, fs: 96, fe: 8, bh: -30, bk: 10, fh: 34, fk: 22 },
    raise: { t: -8, h: -12, bs: 150, be: 10, fs: 165, fe: 5, bh: -14, bk: 8, fh: 14, fk: 8 },
    superPose: { t: -10, h: -14, bs: -150, be: 10, fs: 150, fe: 10, bh: -20, bk: 8, fh: 20, fk: 8 },
    think: { t: 4, h: 18, bs: 20, be: 150, fs: 60, fe: 130, bh: -12, bk: 12, fh: 16, fk: 14 },
    portrait: { t: 4, h: -4, bs: 58, be: 118, fs: 64, fe: 118, bh: -10, bk: 5, fh: 10, fk: 5 }
  };
  NC.POSES = POSES;

  function rig(look, pose) {
    var B = look._body, s = B.s;
    var p = pose;
    var t = p.t || 0, hx = (p.x || 0) * s;
    var up = dir(180 - t);
    var fwd = [Math.cos(t * Math.PI / 180), Math.sin(t * Math.PI / 180)];
    var J = {};
    J.hip = [hx, 0];
    J.chest = [J.hip[0] + up[0] * B.torso * s, J.hip[1] + up[1] * B.torso * s];
    var hd = dir(180 - t - (p.h || 0));
    J.neck = [J.chest[0] + up[0] * B.neck * s, J.chest[1] + up[1] * B.neck * s];
    J.head = [J.neck[0] + hd[0] * B.headR * s * 0.9, J.neck[1] + hd[1] * B.headR * s * 0.9];
    J.bSh = [J.chest[0] - fwd[0] * 2.5 * s, J.chest[1] - fwd[1] * 2.5 * s + 1.5 * s];
    J.fSh = [J.chest[0] + fwd[0] * 1.5 * s, J.chest[1] + fwd[1] * 1.5 * s + 1.5 * s];
    function arm(sh, sa, ea) {
      var ua = sa + t, d1 = dir(ua), d2 = dir(ua + ea);
      var el = [sh[0] + d1[0] * B.uarm * s, sh[1] + d1[1] * B.uarm * s];
      var ha = [el[0] + d2[0] * B.farm * s, el[1] + d2[1] * B.farm * s];
      return [el, ha, ua + ea];
    }
    var ba = arm(J.bSh, p.bs || 0, p.be || 0), fa = arm(J.fSh, p.fs || 0, p.fe || 0);
    J.bEl = ba[0]; J.bHa = ba[1]; J.bHaA = ba[2];
    J.fEl = fa[0]; J.fHa = fa[1]; J.fHaA = fa[2];
    function leg(hp, ha, ka) {
      var d1 = dir(ha), sa = ha - ka, d2 = dir(sa);
      var kn = [hp[0] + d1[0] * B.thigh * s, hp[1] + d1[1] * B.thigh * s];
      var an = [kn[0] + d2[0] * B.shin * s, kn[1] + d2[1] * B.shin * s];
      var fd = dir(90 + sa * 0.45);
      var toe = [an[0] + fd[0] * B.foot * s, an[1] + fd[1] * B.foot * s];
      return [kn, an, toe];
    }
    J.bHip = [J.hip[0] - 1.5 * s, J.hip[1]];
    J.fHip = [J.hip[0] + 1.5 * s, J.hip[1]];
    var bl = leg(J.bHip, p.bh || 0, p.bk || 0), fl = leg(J.fHip, p.fh || 0, p.fk || 0);
    J.bKn = bl[0]; J.bAn = bl[1]; J.bToe = bl[2];
    J.fKn = fl[0]; J.fAn = fl[1]; J.fToe = fl[2];

    // ground the pose
    var dy;
    if (p.lying) {
      var maxY = -1e9;
      for (var k in J) if (J[k].length) maxY = Math.max(maxY, J[k][1]);
      dy = -maxY - B.wT * s * 0.8;
    } else if (p.air) {
      dy = -(B.thigh + B.shin) * s - 4 * s;
    } else {
      dy = -Math.max(J.bAn[1], J.fAn[1], J.bToe[1], J.fToe[1]) - B.wS * s * 0.7;
    }
    dy += (p.y || 0) * s;
    for (k in J) if (J[k].length) J[k][1] += dy;
    return J;
  }

  // ------------------------------------------------------------------ drawing
  function rampOf(name) { var b = RAMPS[name]; return [b, b + 1, b + 2]; }
  function backRamp(name) { var b = RAMPS[name]; return [b, b, b + 1]; }

  var SIZE = 128, OX = 64, OY = 120;

  function drawFighter(look, costume, pose, scale, phase) {
    scale = scale || 1;
    var W = SIZE * scale, H = SIZE * scale;
    var R = new Raster(W, H);
    var body = look._body = Object.assign({}, DEFAULT_BODY, look.body || {});
    body.s = (look.body && look.body.s || 1) * scale;
    var s = body.s, bulk = body.bulk;
    var J = rig(look, pose);
    var ox = OX * scale, oy = OY * scale;
    function X(p) { return p[0] + ox; }
    function Y(p) { return p[1] + oy; }
    var map = Object.assign({ torso: 'outfit', uarm: 'outfit', farm: 'skin', hand: 'skin', thigh: 'hair', shin: 'hair', foot: 'accent', neck: 'skin' }, look.map || {});
    var acc = Object.assign({}, look.acc || {}, costume.acc || {});
    var ctx = { R: R, J: J, s: s, X: X, Y: Y, look: look, acc: acc, pose: pose, phase: phase || 0, map: map, body: body };

    // --- back layer
    if (acc.wings) drawWings(ctx);
    if (acc.cape) drawCape(ctx, acc.cape);
    if (acc.halo) drawHalo(ctx);
    if (acc.twintails || look.hair === 'twintails') drawTwinTails(ctx);
    if (acc.scarf) drawScarf(ctx, false);
    if (look.torsoStyle === 'tailcoat' || look.torsoStyle === 'robe' || look.torsoStyle === 'monk') drawSkirt(ctx, true);

    // back arm
    limb(ctx, J.bSh, J.bEl, body.wU * bulk, body.wU * 0.9 * bulk, backRamp(map.uarm), false);
    limb(ctx, J.bEl, J.bHa, body.wF * bulk, body.wF * 0.9 * bulk, backRamp(map.farm), false);
    R.ellipse(X(J.bHa), Y(J.bHa), body.hand * s, body.hand * s, backRamp(map.hand));
    // back leg
    limb(ctx, J.bHip, J.bKn, body.wT * bulk, body.wT * 0.9 * bulk, backRamp(map.thigh), false);
    limb(ctx, J.bKn, J.bAn, body.wS * bulk, body.wS * 0.85 * bulk, backRamp(map.shin), false);
    limb(ctx, J.bAn, J.bToe, body.wS * 0.9 * bulk, body.wS * 0.7 * bulk, backRamp(map.foot), false);

    // torso
    var torsoR = rampOf(map.torso);
    R.capsule(X(J.hip), Y(J.hip), X(J.chest), Y(J.chest), body.waist * s * bulk, body.chest * s * bulk, torsoR, false);
    drawTorsoDetail(ctx);
    if (look.torsoStyle === 'robe' || look.torsoStyle === 'monk') drawSkirt(ctx, false);

    // front leg
    limb(ctx, J.fHip, J.fKn, body.wT * bulk, body.wT * 0.9 * bulk, rampOf(map.thigh), true);
    limb(ctx, J.fKn, J.fAn, body.wS * bulk, body.wS * 0.85 * bulk, rampOf(map.shin), true);
    limb(ctx, J.fAn, J.fToe, body.wS * 0.9 * bulk, body.wS * 0.7 * bulk, rampOf(map.foot), true);
    if (look.torsoStyle === 'tailcoat') drawBelt(ctx);

    // head
    R.capsule(X(J.chest), Y(J.chest), X(J.neck), Y(J.neck), 2.4 * s, 2.2 * s, rampOf(map.neck), false);
    drawHead(ctx);
    if (acc.scarf) drawScarf(ctx, true);

    // front arm
    if (look.pauldrons) R.ellipse(X(J.fSh), Y(J.fSh) + 1 * s, 5.5 * s, 4.5 * s, rampOf('accent'), true);
    limb(ctx, J.fSh, J.fEl, body.wU * bulk, body.wU * 0.9 * bulk, rampOf(map.uarm), true);
    limb(ctx, J.fEl, J.fHa, body.wF * bulk, body.wF * 0.9 * bulk, rampOf(map.farm), true);
    if (look.cuffs) R.capsule(X(J.fEl) * 0.25 + X(J.fHa) * 0.75, Y(J.fEl) * 0.25 + Y(J.fHa) * 0.75, X(J.fHa), Y(J.fHa), body.wF * bulk + 0.6 * s, body.wF * bulk + 0.6 * s, rampOf(look.cuffs), false);
    R.ellipse(X(J.fHa), Y(J.fHa), body.hand * s, body.hand * s, rampOf(map.hand), true);
    if (look.prop) drawProp(ctx, look.prop);
    if (acc.tag) drawTag(ctx);

    R.outline();
    return R;
  }

  function limb(ctx, a, b, r0, r1, ramp, outline) {
    ctx.R.capsule(ctx.X(a), ctx.Y(a), ctx.X(b), ctx.Y(b), r0 * ctx.s, r1 * ctx.s, ramp, outline);
  }

  function drawSkirt(ctx, back) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y;
    var style = ctx.look.torsoStyle;
    var ramp = back ? backRamp(ctx.map.torso) : rampOf(ctx.map.torso);
    var hip = [X(J.hip), Y(J.hip)];
    var sway = Math.sin(ctx.phase * Math.PI / 2) * 1.2 * s;
    if (style === 'tailcoat') {
      if (!back) return;
      // two tails hanging behind the back knee
      var kx = X(J.bKn) - 3 * s, ky = Math.max(Y(J.bKn), hip[1] + 10 * s);
      R.poly([hip[0] - 4 * s, hip[1] - 3 * s, hip[0] + 1 * s, hip[1] - 2 * s, kx + sway, ky + 2 * s, kx - 5 * s + sway, ky + 1 * s], ramp);
      return;
    }
    // robe: flaps follow each thigh
    var len = style === 'monk' ? 0.95 : 0.8;
    var kn = back ? J.bKn : J.fKn;
    var hp = back ? J.bHip : J.fHip;
    var ex = X(hp) + (X(kn) - X(hp)) * len * 1.15, ey = Y(hp) + (Y(kn) - Y(hp)) * len * 1.15 + 3 * s;
    var w = ctx.body.waist * s * ctx.body.bulk + 1 * s;
    R.poly([X(hp) - w, Y(hp) - 3 * s, X(hp) + w, Y(hp) - 3 * s, ex + w + 2 * s + sway, ey, ex - w - 1 * s + sway, ey + 1 * s], ramp);
  }

  function drawBelt(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s;
    R.capsule(ctx.X(J.hip) - 5 * s, ctx.Y(J.hip) - 1 * s, ctx.X(J.hip) + 5 * s, ctx.Y(J.hip) - 1 * s, 1.2 * s, 1.2 * s, P.ACC + 1);
  }

  function drawTorsoDetail(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y, look = ctx.look, acc = ctx.acc;
    var cx = X(J.chest) * 0.55 + X(J.hip) * 0.45, cy = Y(J.chest) * 0.55 + Y(J.hip) * 0.45;
    var st = look.torsoStyle;
    // belt / sash
    if (st !== 'tailcoat' && st !== 'mech') {
      R.capsule(X(J.hip) - ctx.body.waist * s, Y(J.hip) - 2 * s, X(J.hip) + ctx.body.waist * s, Y(J.hip) - 2 * s, 1.3 * s, 1.3 * s, rampOf('accent'));
    }
    if (st === 'tailcoat' || acc.blazer) {
      // shirt front + bow tie / tie
      var nx = X(J.neck), ny = Y(J.neck) + 2 * s;
      R.poly([nx - 2 * s, ny, nx + 4 * s, ny, cx + 2 * s, cy + 3 * s], P.WHITE);
      if (acc.tie) R.poly([nx, ny, nx + 2.5 * s, ny, nx + 2 * s, cy + 2 * s, nx + 0.5 * s, cy + 3 * s], [9, 9, 10]);
      else R.rect(Math.round(nx - 1 * s), Math.round(ny), Math.round(4 * s), Math.round(2 * s), P.ACC + 1);
    }
    if (st === 'track') {
      R.line(X(J.chest) + 2 * s, Y(J.chest), X(J.hip) + 2 * s, Y(J.hip) - 3 * s, P.WHITE);
    }
    if (st === 'jacket') {
      // collar
      R.poly([X(J.neck) - 5 * s, Y(J.neck) + 1 * s, X(J.neck) + 5 * s, Y(J.neck) + 1 * s, X(J.neck) + 1 * s, Y(J.neck) + 7 * s], rampOf('accent'));
    }
    if (look.harness && !acc.noHarness) {
      R.line(X(J.fSh) + 2 * s, Y(J.fSh) - 1 * s, X(J.hip) - 4 * s, Y(J.hip) - 2 * s, P.ACC);
      R.line(X(J.fSh) + 2 * s, Y(J.fSh), X(J.hip) - 4 * s, Y(J.hip) - 1 * s, P.ACC + 1);
      R.set(cx, cy, P.GLOW);
    }
    if (look.book && !acc.noBook) {
      var bx = X(J.hip) - 7 * s, by = Y(J.hip) - 1 * s;
      R.rect(Math.round(bx), Math.round(by), Math.round(6 * s), Math.round(7 * s), P.HAIR + 1);
      R.rect(Math.round(bx + 1 * s), Math.round(by + 1 * s), Math.max(1, Math.round(4 * s)), Math.max(1, Math.round(1 * s)), P.GLOW);
      R.line(bx + 3 * s, by - 2 * s, bx + 3 * s, by + 7 * s, P.ACC + 2);
    }
    drawEmblem(ctx, look.emblem, cx + 1 * s, cy - 1 * s);
  }

  function drawEmblem(ctx, type, cx, cy) {
    if (!type) return;
    var R = ctx.R, s = ctx.s, c = P.WHITE;
    var k = Math.max(1, Math.round(s));
    function dot(x, y, col) { R.rect(Math.round(cx + x * k), Math.round(cy + y * k), k, k, col || c); }
    if (type === 'spark') { // Anthropic-style asterisk
      for (var i = -2; i <= 2; i++) { dot(i, 0, P.GLOW); dot(0, i, P.GLOW); }
      dot(-1, -1, P.GLOW); dot(1, 1, P.GLOW); dot(1, -1, P.GLOW); dot(-1, 1, P.GLOW);
    } else if (type === 'x') {
      for (i = -2; i <= 2; i++) { dot(i, i); dot(i, -i); }
    } else if (type === 'star') {
      for (i = -2; i <= 2; i++) { dot(i, 0, P.GLOW); dot(0, i, P.GLOW); }
      dot(-1, -1, P.GLOW); dot(1, -1, P.GLOW);
    } else if (type === 'sparkle') { // 4-point sparkle
      for (i = -3; i <= 3; i++) { dot(0, i, P.GLOW); dot(i, 0, P.GLOW); }
      dot(-1, -1, P.GLOW); dot(1, 1, P.GLOW); dot(1, -1, P.GLOW); dot(-1, 1, P.GLOW);
    } else if (type === 'sun') {
      dot(0, 0, P.GLOW); dot(-1, 0, P.GLOW); dot(1, 0, P.GLOW); dot(0, -1, P.GLOW); dot(0, 1, P.GLOW);
      dot(-2, -2); dot(2, -2); dot(-2, 2); dot(2, 2); dot(0, -3); dot(0, 3); dot(-3, 0); dot(3, 0);
    } else if (type === 'whale') {
      dot(-2, 0); dot(-1, 0); dot(0, 0); dot(1, 0); dot(2, -1); dot(-1, -1); dot(0, -1); dot(-3, -1); dot(-3, -2); dot(2, 1);
    } else if (type === 'q') {
      dot(-1, -2); dot(0, -2); dot(1, -2); dot(-2, -1); dot(2, -1); dot(-2, 0); dot(2, 0); dot(-1, 1); dot(0, 1); dot(1, 1); dot(2, 2);
    } else if (type === 'moon') {
      dot(-1, -2, P.GLOW); dot(-2, -1, P.GLOW); dot(-2, 0, P.GLOW); dot(-2, 1, P.GLOW); dot(-1, 2, P.GLOW); dot(0, 2, P.GLOW); dot(0, -2, P.GLOW);
    } else if (type === 'knot') { // hexagonal flower
      dot(0, -2); dot(2, -1); dot(2, 1); dot(0, 2); dot(-2, 1); dot(-2, -1); dot(0, 0, P.GLOW);
    }
  }

  function drawHead(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y, look = ctx.look, acc = ctx.acc;
    var hx = X(J.head), hy = Y(J.head), r = ctx.body.headR * s;
    var hairR = rampOf('hair');
    var style = acc.hairStyle || look.hair;
    // Heads are lit from the front so faces read clearly (classic fighter portrait lighting).
    var saveX = LX, saveY = LY;
    LX = 0.45; LY = -0.8; TH_SH = -0.62; TH_HI = 0.45;
    try { drawHeadInner(); } finally { LX = saveX; LY = saveY; TH_SH = -0.3; TH_HI = 0.38; }
    function drawHeadInner() {

    // hair behind the head
    if (style === 'long' || style === 'wild') {
      R.poly([hx - r * 0.2, hy - r * 1.0, hx - r * 1.6 + ctx.phase * 0.3 * s, hy + r * (style === 'wild' ? 2.2 : 1.6), hx - r * 0.2, hy + r * 1.2], hairR);
    }
    if (style === 'ponytail') {
      R.capsule(hx - r * 0.8, hy - r * 0.4, hx - r * 2.1, hy + r * 0.9 + Math.sin(ctx.phase * 1.6) * s, r * 0.45, r * 0.25, hairR, true);
    }
    if (look.head === 'helmet') {
      R.ellipse(hx, hy, r * 1.05, r * 1.08, rampOf('accent'), true);
      // visor
      R.capsule(hx - r * 0.1, hy - r * 0.05, hx + r * 0.9, hy - r * 0.05, r * 0.28, r * 0.28, P.GLOW);
      // crescent crest
      if (look.crest === 'moon') {
        R.capsule(hx - r * 0.6, hy - r * 1.3, hx + r * 0.2, hy - r * 1.9, r * 0.3, r * 0.15, P.GLOW, true);
        R.capsule(hx + r * 0.2, hy - r * 1.9, hx + r * 1.0, hy - r * 1.6, r * 0.15, r * 0.08, P.GLOW);
      }
      if (acc.helmetStripe) R.line(hx - r, hy - r * 0.6, hx + r, hy - r * 0.6, P.WHITE);
      return;
    }
    // face
    R.ellipse(hx, hy, r * 0.9, r, rampOf('skin'), true);
    // ear hint & jaw handled by shading; eye
    var ex = hx + r * 0.42, ey = hy - r * 0.05;
    var eyeCol = look.eyes === 'glow' ? P.GLOW : P.OUT;
    if (s >= 1.8) {
      // portrait-scale eye: white, pupil, lash line
      R.rect(Math.round(ex - 0.6 * s), Math.round(ey - 0.2 * s), Math.round(2.4 * s), Math.round(2.2 * s), P.WHITE);
      R.rect(Math.round(ex + 0.6 * s), Math.round(ey - 0.2 * s), Math.round(1.1 * s), Math.round(2.2 * s), eyeCol);
      R.line(ex - 0.8 * s, ey - 0.6 * s, ex + 1.9 * s, ey - 0.6 * s, P.OUT);
      // nose and mouth
      R.line(hx + r * 0.88, hy + r * 0.12, hx + r * 0.95, hy + r * 0.3, P.SKIN);
      R.line(hx + r * 0.42, hy + r * 0.6, hx + r * 0.72, hy + r * 0.56, P.SKIN);
    } else {
      R.rect(Math.round(ex), Math.round(ey), Math.max(1, Math.round(1.2 * s)), Math.max(2, Math.round(2.2 * s)), eyeCol);
    }
    // brow
    R.line(ex - 1 * s, ey - 2 * s, ex + 2 * s, ey - 2.5 * s, P.HAIR);
    if (s >= 1.8) R.line(ex - 1 * s, ey - 2 * s + 1, ex + 2 * s, ey - 2.5 * s + 1, P.HAIR);

    // hair on top
    switch (style) {
      case 'swept':
      case 'long':
      case 'wild':
        R.poly([hx - r * 1.0, hy + r * 0.3, hx - r * 0.95, hy - r * 0.8, hx - r * 0.2, hy - r * 1.25, hx + r * 0.7, hy - r * 1.05,
          hx + r * 1.15, hy - r * 0.35, hx + r * 0.45, hy - r * 0.55, hx - r * 0.3, hy - r * 0.2, hx - r * 0.45, hy + r * 0.5], hairR);
        if (style === 'wild') {
          R.poly([hx - r * 0.3, hy - r * 1.1, hx - r * 0.1, hy - r * 1.9, hx + r * 0.3, hy - r * 1.05], hairR);
          R.poly([hx - r * 0.9, hy - r * 0.6, hx - r * 1.7, hy - r * 1.2, hx - r * 0.6, hy - r * 1.0], hairR);
        }
        break;
      case 'slick':
        R.poly([hx - r * 1.0, hy + r * 0.5, hx - r * 0.95, hy - r * 0.75, hx - r * 0.1, hy - r * 1.15, hx + r * 0.8, hy - r * 0.9,
          hx + r * 0.95, hy - r * 0.45, hx - r * 0.1, hy - r * 0.6, hx - r * 0.45, hy + r * 0.2], hairR);
        R.capsule(hx - r * 0.9, hy - r * 0.1, hx - r * 1.4, hy + r * 0.9, r * 0.35, r * 0.2, hairR);
        break;
      case 'spiky': // sun rays
        for (var a = -150; a <= 30; a += 36) {
          var d = dir(180 + a);
          R.poly([hx + d[0] * r * 0.5 - d[1] * r * 0.45, hy + d[1] * r * 0.5 + d[0] * r * 0.45,
            hx + d[0] * r * 1.75, hy + d[1] * r * 1.75,
            hx + d[0] * r * 0.5 + d[1] * r * 0.45, hy + d[1] * r * 0.5 - d[0] * r * 0.45], hairR);
        }
        R.ellipse(hx - r * 0.2, hy - r * 0.55, r * 0.85, r * 0.55, hairR);
        break;
      case 'undercut':
        R.poly([hx - r * 0.95, hy + r * 0.1, hx - r * 0.9, hy - r * 0.8, hx - r * 0.2, hy - r * 1.35, hx + r * 0.9, hy - r * 1.2,
          hx + r * 1.0, hy - r * 0.6, hx + r * 0.2, hy - r * 0.75, hx - r * 0.5, hy - r * 0.3], hairR);
        break;
      case 'ponytail':
      case 'twintails':
        R.poly([hx - r * 1.0, hy + r * 0.3, hx - r * 0.9, hy - r * 0.85, hx - r * 0.1, hy - r * 1.2, hx + r * 0.85, hy - r * 0.9,
          hx + r * 1.0, hy - r * 0.2, hx + r * 0.6, hy - r * 0.6, hx + r * 0.3, hy - r * 0.2, hx, hy - r * 0.55, hx - r * 0.4, hy + r * 0.3], hairR);
        break;
      case 'bob':
        R.poly([hx - r * 1.1, hy + r * 0.9, hx - r * 1.05, hy - r * 0.8, hx - r * 0.2, hy - r * 1.3, hx + r * 0.9, hy - r * 1.0,
          hx + r * 1.05, hy - r * 0.2, hx + r * 0.3, hy - r * 0.5, hx - r * 0.35, hy - r * 0.1, hx - r * 0.4, hy + r * 0.9], hairR);
        // antenna / ahoge
        R.line(hx - r * 0.1, hy - r * 1.25, hx + r * 0.5, hy - r * 2.1, P.HAIR + 1);
        R.set(hx + r * 0.5, hy - r * 2.2, P.GLOW);
        break;
      case 'hood': // whale hood
        R.poly([hx - r * 1.25, hy + r * 1.1, hx - r * 1.2, hy - r * 0.7, hx - r * 0.3, hy - r * 1.35, hx + r * 0.7, hy - r * 1.25,
          hx + r * 1.2, hy - r * 0.6, hx + r * 0.95, hy - r * 0.3, hx + r * 0.2, hy - r * 0.55, hx - r * 0.4, hy - r * 0.2, hx - r * 0.35, hy + r * 1.1], rampOf('outfit'));
        // dorsal fin + whale eye
        R.poly([hx - r * 0.5, hy - r * 1.2, hx - r * 0.1, hy - r * 1.9, hx + r * 0.15, hy - r * 1.25], rampOf('outfit'));
        R.set(hx + r * 0.6, hy - r * 0.95, P.WHITE);
        R.line(hx + r * 0.3, hy - r * 0.62, hx + r * 1.1, hy - r * 0.5, P.WHITE);
        break;
      case 'crown':
        R.poly([hx - r * 1.0, hy + r * 0.4, hx - r * 0.95, hy - r * 0.8, hx - r * 0.1, hy - r * 1.2, hx + r * 0.85, hy - r * 0.95,
          hx + r * 1.0, hy - r * 0.4, hx + r * 0.2, hy - r * 0.55, hx - r * 0.45, hy + r * 0.4], hairR);
        break;
    }
    // headgear / accessories
    if (look.shades || acc.shades) {
      R.capsule(hx + r * 0.05, hy - r * 0.12, hx + r * 1.0, hy - r * 0.12, r * 0.24, r * 0.24, P.GLOW);
      R.line(hx - r * 0.8, hy - r * 0.2, hx + r * 0.1, hy - r * 0.15, P.OUT);
    }
    if (look.headband || acc.headband) {
      R.capsule(hx - r * 0.95, hy - r * 0.55, hx + r * 0.95, hy - r * 0.65, r * 0.18, r * 0.18, P.ACC + 1);
      R.capsule(hx - r * 0.95, hy - r * 0.55, hx - r * 1.9, hy - r * 0.1 + ctx.phase * 0.4 * s, r * 0.15, r * 0.1, P.ACC + 1);
    }
    if (look.crown || acc.crown) {
      R.poly([hx - r * 0.7, hy - r * 0.95, hx - r * 0.6, hy - r * 1.7, hx - r * 0.25, hy - r * 1.2, hx + r * 0.1, hy - r * 1.9,
        hx + r * 0.4, hy - r * 1.2, hx + r * 0.8, hy - r * 1.65, hx + r * 0.8, hy - r * 0.9], rampOf('accent'));
    }
    if (acc.cone) { // classifier cone
      R.poly([hx - r * 0.9, hy - r * 0.7, hx + r * 0.9, hy - r * 0.7, hx + r * 0.1, hy - r * 2.4], [8, 9, 10]);
      R.line(hx - r * 0.5, hy - r * 1.2, hx + r * 0.6, hy - r * 1.2, P.WHITE);
    }
    if (acc.bikehelmet) {
      R.poly([hx - r * 1.1, hy - r * 0.2, hx - r * 0.8, hy - r * 1.2, hx + r * 0.3, hy - r * 1.45, hx + r * 1.1, hy - r * 0.8, hx + r * 1.2, hy - r * 0.45], rampOf('accent'));
    }
    if (acc.ruff) {
      R.ellipse(X(J.neck), Y(J.neck) + 1 * s, r * 0.9, r * 0.35, P.WHITE, true);
    }
    if (acc.hoodie) {
      R.poly([hx - r * 1.2, hy + r * 1.1, hx - r * 1.15, hy - r * 0.8, hx - r * 0.2, hy - r * 1.35, hx + r * 0.8, hy - r * 1.1,
        hx + r * 0.6, hy - r * 0.6, hx - r * 0.4, hy - r * 0.3, hx - r * 0.3, hy + r * 1.1], rampOf('outfit'));
    }
    if (acc.padlock) {
      R.rect(Math.round(hx - r * 0.4), Math.round(hy - r * 2.1), Math.round(r * 0.8), Math.round(r * 0.6), P.ACC + 2);
      R.line(hx - r * 0.25, hy - r * 2.1, hx - r * 0.25, hy - r * 2.5, P.ACC + 1);
      R.line(hx + r * 0.25, hy - r * 2.1, hx + r * 0.25, hy - r * 2.5, P.ACC + 1);
      R.line(hx - r * 0.25, hy - r * 2.5, hx + r * 0.25, hy - r * 2.5, P.ACC + 1);
    }
    if (acc.goblin) { // pointy ear
      R.poly([hx - r * 0.3, hy - r * 0.1, hx - r * 1.5, hy - r * 0.9, hx - r * 0.4, hy + r * 0.4], rampOf('skin'));
    }
    }
  }

  function drawHalo(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s, hx = ctx.X(J.head), hy = ctx.Y(J.head), r = ctx.body.headR * s;
    for (var a = 0; a < 360; a += 30) {
      var d = dir(a + ctx.phase * 7.5);
      var px = hx - r * 0.3 + d[0] * r * 1.75, py = hy - r * 0.2 + d[1] * r * 1.75;
      R.rect(Math.round(px), Math.round(py), Math.max(1, Math.round(s)), Math.max(1, Math.round(s)), a % 90 === 0 ? P.WHITE : P.GLOW);
    }
  }

  function drawCape(ctx, kind) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y;
    var sway = Math.sin(ctx.phase * Math.PI / 2) * 3 * s;
    var sx = X(J.bSh), sy = Y(J.bSh);
    var len = kind === 'short' ? 22 : 40;
    var ramp = kind === 'tag' ? rampOf('accent') : backRamp(ctx.acc.capeRamp || 'accent');
    R.poly([sx + 3 * s, sy - 2 * s, sx - 4 * s, sy - 1 * s, sx - 14 * s + sway, sy + len * s, sx - 2 * s + sway * 0.5, sy + (len + 3) * s], ramp);
    if (kind === 'stars') {
      var rnd = U.rng(7);
      for (var i = 0; i < 10; i++) {
        var t = rnd();
        R.set(sx - 2 * s - t * 10 * s + sway * t, sy + t * len * s + (rnd() - 0.5) * 4 * s, P.WHITE);
      }
    }
    if (kind === 'tag') {
      R.rect(Math.round(sx - 8 * s + sway * 0.6), Math.round(sy + 12 * s), Math.round(5 * s), Math.round(3 * s), P.WHITE);
    }
  }

  function drawWings(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y;
    var flap = Math.sin(ctx.phase * Math.PI / 2) * 3 * s;
    var cx = X(J.chest) - 3 * s, cy = Y(J.chest) + 2 * s;
    R.poly([cx, cy, cx - 22 * s, cy - 18 * s - flap, cx - 26 * s, cy - 2 * s, cx - 6 * s, cy + 6 * s], [11, 12, 13]);
    R.poly([cx, cy + 4 * s, cx - 18 * s, cy + 16 * s + flap * 0.5, cx - 6 * s, cy + 14 * s], [11, 12, 13]);
    R.line(cx, cy, cx - 22 * s, cy - 18 * s - flap, P.OUT);
  }

  function drawTwinTails(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s, hx = ctx.X(J.head), hy = ctx.Y(J.head), r = ctx.body.headR * s;
    var w = Math.sin(ctx.phase * Math.PI / 2) * 1.5 * s;
    R.capsule(hx - r * 0.8, hy - r * 0.7, hx - r * 2.4 + w, hy + r * 1.2, r * 0.42, r * 0.2, backRamp('hair'), true);
    R.capsule(hx - r * 0.5, hy - r * 0.9, hx - r * 1.9 - w, hy + r * 1.8, r * 0.4, r * 0.18, rampOf('hair'), true);
  }

  function drawScarf(ctx, front) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y;
    var nx = X(J.neck), ny = Y(J.neck) + 1.5 * s;
    if (front) {
      R.capsule(nx - 3.5 * s, ny, nx + 3.5 * s, ny, 2 * s, 2 * s, rampOf('accent'));
      return;
    }
    var w = Math.sin(ctx.phase * Math.PI / 2) * 3 * s;
    R.poly([nx - 1 * s, ny - 2 * s, nx - 18 * s, ny + 2 * s + w, nx - 22 * s, ny + 6 * s + w, nx - 1 * s, ny + 2 * s], backRamp('accent'));
    R.poly([nx - 1 * s, ny, nx - 13 * s, ny + 9 * s - w, nx - 16 * s, ny + 12 * s - w, nx, ny + 3 * s], rampOf('accent'));
  }

  function drawProp(ctx, prop) {
    var R = ctx.R, J = ctx.J, s = ctx.s, X = ctx.X, Y = ctx.Y;
    var d = dir(ctx.J.fHaA);
    var hx = X(J.fHa), hy = Y(J.fHa);
    if (prop === 'baton') {
      R.line(hx, hy, hx + d[0] * 13 * s, hy + d[1] * 13 * s, P.WHITE);
      R.line(hx + 1, hy, hx + d[0] * 13 * s + 1, hy + d[1] * 13 * s, P.WHITE);
    }
  }

  function drawTag(ctx) {
    var R = ctx.R, J = ctx.J, s = ctx.s;
    var x = ctx.X(J.chest) + 3 * s, y = ctx.Y(J.chest) + 3 * s;
    R.rect(Math.round(x), Math.round(y), Math.round(7 * s), Math.round(4 * s), P.WHITE);
    R.rect(Math.round(x + 1 * s), Math.round(y + 1 * s), Math.round(5 * s), Math.max(1, Math.round(1 * s)), P.ACC + 1);
  }

  // ------------------------------------------------------------------ cache API
  var cache = {};
  var paletteCache = {};

  function paletteFor(ch, ci) {
    var k = ch.id + ':' + ci;
    if (!paletteCache[k]) paletteCache[k] = buildPalette(ch.costumes[ci].pal);
    return paletteCache[k];
  }

  // Returns { c: canvas, ox, oy } where (ox, oy) is the feet origin inside the canvas.
  NC.Sprites = {
    P: P,
    frame: function (ch, ci, poseName, mode, phase) {
      var animated = ch.look.animated ? (phase || 0) & 3 : 0;
      var key = ch.id + '|' + ci + '|' + poseName + '|' + (mode || '') + '|' + animated;
      var hit = cache[key];
      if (hit) return hit;
      var pose = POSES[poseName] || POSES.idle0;
      var R = drawFighter(ch.look, ch.costumes[ci], pose, 1, animated);
      hit = cache[key] = { c: R.toCanvas(paletteFor(ch, ci), mode), ox: OX, oy: OY };
      return hit;
    },
    // Bust portrait at integer scale, cropped around head/chest. Always faces right.
    portrait: function (ch, ci, scale, w, h, mode) {
      var key = 'P|' + ch.id + '|' + ci + '|' + scale + '|' + w + 'x' + h + '|' + (mode || '');
      if (cache[key]) return cache[key];
      var pose = POSES[ch.look.portraitPose || 'portrait'];
      var R = drawFighter(ch.look, ch.costumes[ci], pose, scale, 1);
      var full = R.toCanvas(paletteFor(ch, ci), mode);
      var J = rig(ch.look, pose);
      var hx = J.head[0] + OX * scale, hy = J.head[1] + OY * scale;
      var c = U.makeCanvas(w, h), x = c.getContext('2d');
      x.drawImage(full, Math.round(hx - w * 0.52), Math.round(hy - h * 0.36), w, h, 0, 0, w, h);
      cache[key] = c;
      return c;
    },
    palette: paletteFor,
    clear: function () { cache = {}; }
  };
})(window.NC = window.NC || {});
