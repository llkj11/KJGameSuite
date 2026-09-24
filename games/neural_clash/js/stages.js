// Stages: each is painted procedurally into parallax layers once, then composed per
// frame with SNES-style tricks: banded HDMA skies, line-scroll perspective floors,
// Mode 7 floors, palette-cycled lights and animated background casts.
(function (NC) {
  'use strict';
  var U = NC.U, W = NC.W, H = NC.H;
  var FLOOR_TOP = 172, FLOOR_H = H - FLOOR_TOP;
  var SW = NC.STAGE_W;
  var FW = SW + 320, FOFF = 160; // floor texture width and origin offset

  function mk(w, h) { return U.makeCanvas(w, h); }
  function layerW(f) { return Math.ceil(W + (SW - W) * f) + 2; }

  // ------------------------------------------------------------------ helpers
  function person(x, px, py, body, skin, hair, h, pose) {
    h = h || 16;
    var sh = U.darken(body, 0.35);
    x.fillStyle = '#10081a';
    x.fillRect(px - 4, py - h + 5, 10, h - 5);
    x.fillRect(px - 3, py - h - 1, 7, 7);
    if (pose === 1) { x.fillRect(px - 6, py - h - 3, 3, 9); x.fillRect(px + 5, py - h - 3, 3, 9); }
    x.fillStyle = body; x.fillRect(px - 3, py - h + 6, 8, h - 6);
    x.fillStyle = sh; x.fillRect(px + 3, py - h + 6, 2, h - 6); x.fillRect(px - 3, py - 3, 8, 3);
    x.fillStyle = skin; x.fillRect(px - 2, py - h, 5, 5);
    x.fillStyle = hair; x.fillRect(px - 2, py - h, 5, 2); x.fillRect(px - 2, py - h + 2, 1, 2);
    if (pose === 1) { x.fillStyle = skin; x.fillRect(px - 5, py - h - 2, 1, 6); x.fillRect(px + 6, py - h - 2, 1, 6); }
  }
  var BODY_COLS = ['#c83c3c', '#3c6cc8', '#e8b030', '#3ca860', '#a050c8', '#e87830', '#f0f0f0', '#303848', '#40b8c0', '#c8408c'];
  var SKINS = ['#f0c8a0', '#d8a078', '#a87050', '#704830', '#f8d8c0'];
  var HAIRS = ['#201010', '#5a3010', '#d8b060', '#101010', '#a03010', '#c0c0c0'];
  // Two-frame crowd strip (frame 1 has some people cheering / bobbing).
  function crowd(w, h, seed, density, cols) {
    var frames = [mk(w, h), mk(w, h)];
    var rnd = U.rng(seed);
    var ppl = [];
    for (var px = 4; px < w - 4; px += density + Math.floor(rnd() * 4)) {
      ppl.push({ x: px, y: h - Math.floor(rnd() * 6), b: (cols || BODY_COLS)[Math.floor(rnd() * (cols || BODY_COLS).length)],
        s: SKINS[Math.floor(rnd() * SKINS.length)], hr: HAIRS[Math.floor(rnd() * HAIRS.length)], h: 14 + Math.floor(rnd() * 5), c: rnd() });
    }
    ppl.sort(function (a, b) { return a.y - b.y; });
    for (var f = 0; f < 2; f++) {
      var x = frames[f].getContext('2d');
      ppl.forEach(function (p) {
        var cheer = f === 1 && p.c > 0.45;
        person(x, p.x, p.y - (cheer ? 1 : 0), p.b, p.s, p.hr, p.h, cheer ? 1 : 0);
      });
    }
    return frames;
  }
  function stars(x, w, h, n, seed, cols) {
    var rnd = U.rng(seed);
    for (var i = 0; i < n; i++) {
      x.fillStyle = (cols || ['#ffffff', '#c8d0ff', '#fff0c0'])[Math.floor(rnd() * 3)];
      var s = rnd() < 0.1 ? 2 : 1;
      x.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), s, s);
    }
  }
  function ridge(x, w, baseY, amp, rough, seed, col) {
    var rnd = U.rng(seed);
    x.fillStyle = col;
    var y = baseY - amp * rnd();
    for (var i = 0; i < w; i++) {
      y += (rnd() - 0.5) * rough;
      y = U.clamp(y, baseY - amp, baseY);
      x.fillRect(i, Math.floor(y), 1, 200);
    }
  }
  function windowGrid(x, bx, by, bw, bh, cw, ch, lit, off, seed) {
    var rnd = U.rng(seed);
    for (var yy = by + 3; yy < by + bh - ch; yy += ch + 3) {
      for (var xx = bx + 3; xx < bx + bw - cw; xx += cw + 3) {
        x.fillStyle = rnd() < 0.6 ? lit : off;
        x.fillRect(xx, yy, cw, ch);
      }
    }
  }
  function text(x, str, px, py, col, opts) { NC.Font.draw(x, str, px, py, col, opts); }

  // Perspective floor via per-scanline scroll (SNES line scroll / Mode 7 lookalike).
  // tex: FW-wide canvas; if mode7, tex rows are sampled by depth.
  function drawFloor(ctx, tex, camX, mode7, t) {
    var d0 = 38;
    for (var r = 0; r < FLOOR_H; r++) {
      var k = (r + d0) / (FLOOR_H + d0);
      var srcW = W / k;
      var srcX = camX + FOFF + W / 2 - srcW / 2;
      var srcY = r;
      if (mode7) {
        var z = 1 / k;
        srcY = Math.floor((z * 46 + (t || 0)) % tex.height);
      }
      ctx.drawImage(tex, srcX, srcY, srcW, 1, 0, FLOOR_TOP + r, W, 1);
    }
  }

  function floorTex(h, paint) {
    var c = mk(FW, h || FLOOR_H), x = c.getContext('2d');
    paint(x, FW, h || FLOOR_H);
    return c;
  }

  function drawLayer(ctx, c, camX, f, y) {
    ctx.drawImage(c, -Math.round(camX * f), y || 0);
  }

  // ------------------------------------------------------------------ stages
  var DEFS = {};

  // ===== THE SEALED ARCHIVE (Fable) =====
  DEFS.archive = {
    name: 'THE SEALED ARCHIVE', place: 'SAN FRANCISCO',
    build: function (S) {
      var wf = layerW(0.35), wn = layerW(0.7);
      var far = mk(wf, FLOOR_TOP), x = far.getContext('2d');
      U.bandGradient(x, 0, 0, wf, FLOOR_TOP, [[0, '#2a1810'], [1, '#5a3420']], 12);
      // arched windows with a park view (someone eating a sandwich)
      for (var i = 0; i < 4; i++) {
        var wx = 30 + i * 90;
        x.fillStyle = '#1a0e08'; x.fillRect(wx - 2, 20, 40, 70);
        U.bandGradient(x, wx, 22, 36, 66, [[0, '#f8c890'], [1, '#98c8e8']], 8);
        x.fillStyle = '#4a8a3a'; x.fillRect(wx, 72, 36, 16);
        x.fillStyle = '#2a5a2a'; x.beginPath(); x.arc(wx + 10, 70, 8, 0, 7); x.fill();
        x.fillStyle = '#1a0e08'; x.fillRect(wx + 17, 22, 2, 66); x.fillRect(wx, 52, 36, 2);
        x.beginPath(); x.moveTo(wx - 2, 22); x.arc(wx + 18, 22, 20, Math.PI, 0); x.fill();
        if (i === 2) { person(x, wx + 28, 86, '#3060a0', '#f0c8a0', '#402010', 9); x.fillStyle = '#e8c070'; x.fillRect(wx + 30, 79, 3, 2); }
      }
      // central sealed vault
      var vx = wf / 2;
      x.fillStyle = '#20140c'; x.beginPath(); x.arc(vx, 88, 50, 0, 7); x.fill();
      x.fillStyle = '#8a6a50'; x.beginPath(); x.arc(vx, 88, 44, 0, 7); x.fill();
      x.fillStyle = '#6a4a38'; x.beginPath(); x.arc(vx, 88, 36, 0, 7); x.fill();
      x.fillStyle = '#4a3428'; x.beginPath(); x.arc(vx, 88, 14, 0, 7); x.fill();
      for (var a = 0; a < 8; a++) { x.fillStyle = '#a88868'; x.fillRect(vx + Math.cos(a * 0.785) * 40 - 2, 88 + Math.sin(a * 0.785) * 40 - 2, 4, 4); }
      x.strokeStyle = '#c0c0c8'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(vx - 50, 50); x.lineTo(vx + 50, 126); x.moveTo(vx + 50, 50); x.lineTo(vx - 50, 126); x.stroke();
      text(x, 'MYTHOS', vx, 104, '#ffcf8a', { align: 'center', shadow: '#000' });
      S.far = far;
      // near: bookshelves, vending machine, candles
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      var rnd = U.rng(11);
      function shelf(sx, w) {
        n.fillStyle = '#3a2214'; n.fillRect(sx, 60, w, FLOOR_TOP - 60);
        n.fillStyle = '#5a3a24'; n.fillRect(sx, 58, w, 4);
        for (var sy = 66; sy < FLOOR_TOP - 10; sy += 22) {
          n.fillStyle = '#24140a'; n.fillRect(sx + 2, sy, w - 4, 18);
          for (var bx = sx + 3; bx < sx + w - 5;) {
            var bw = 2 + Math.floor(rnd() * 4), bh = 10 + Math.floor(rnd() * 7);
            n.fillStyle = ['#a83828', '#284878', '#387838', '#c89838', '#6a3a7a', '#d97757', '#efe3cc'][Math.floor(rnd() * 7)];
            n.fillRect(bx, sy + 18 - bh, bw, bh);
            bx += bw + (rnd() < 0.2 ? 2 : 0);
          }
          n.fillStyle = '#5a3a24'; n.fillRect(sx, sy + 18, w, 3);
        }
      }
      shelf(0, 70); shelf(wn - 70, 70);
      shelf(wn / 2 - 150, 48); shelf(wn / 2 + 102, 48);
      // Claudius's vending machine
      var mx = 84;
      n.fillStyle = '#2e4fa8'; n.fillRect(mx, 96, 34, 76);
      n.fillStyle = '#10204a'; n.fillRect(mx + 3, 102, 20, 50);
      for (var r2 = 0; r2 < 4; r2++) for (var c2 = 0; c2 < 3; c2++) { n.fillStyle = '#9aa0a8'; n.fillRect(mx + 5 + c2 * 6, 105 + r2 * 12, 4, 4); }
      n.fillStyle = '#c82828'; n.fillRect(mx + 25, 104, 6, 20);
      NC.Font.draw(n, 'W', mx + 24, 128, '#ffffff');
      n.fillStyle = '#000'; n.fillRect(mx + 3, 156, 20, 8);
      text(n, 'CUBES', mx + 17, 88, '#e8e8f0', { align: 'center', shadow: '#000' });
      S.near = near;
      S.candles = [[40, 150], [wn - 40, 150], [wn / 2 - 126, 140], [wn / 2 + 126, 140]];
      S.crowd = crowd(wn, 30, 5, 16, ['#efe3cc', '#d97757', '#3b2b35', '#7a6a5a']);
      S.floor = floorTex(FLOOR_H, function (f, w, h) {
        U.bandGradient(f, 0, 0, w, h, [[0, '#4a2a18'], [1, '#7a4a28']], 8);
        for (var px = 0; px < w; px += 24) { f.fillStyle = '#3a2010'; f.fillRect(px, 0, 1, h); }
        for (var py = 6; py < h; py += 9) { f.fillStyle = '#5a3620'; f.fillRect(0, py, w, 1); }
        f.fillStyle = '#b85a40'; f.fillRect(FOFF + SW / 2 - 110, 10, 220, 30);
        f.fillStyle = '#d97757'; f.fillRect(FOFF + SW / 2 - 104, 13, 208, 24);
        f.fillStyle = '#efe3cc'; f.fillRect(FOFF + SW / 2 - 90, 24, 180, 2);
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.far, cam, 0.35);
      drawLayer(ctx, S.crowd[(t >> 4) & 1], cam, 0.7, FLOOR_TOP - 30);
      drawLayer(ctx, S.near, cam, 0.7);
      // candle flicker (palette-cycle style)
      S.candles.forEach(function (c, i) {
        var x = c[0] - cam * 0.7, fl = ((t >> 2) + i) % 3;
        ctx.fillStyle = '#efe3cc'; ctx.fillRect(x - 1, c[1], 3, 8);
        ctx.fillStyle = ['#ffcf60', '#ff9a40', '#fff0a0'][fl];
        ctx.fillRect(x - 1 + (fl === 1 ? 1 : 0), c[1] - 4, 2, 4);
      });
      // vending machine light blink
      if ((t >> 5) & 1) { ctx.fillStyle = '#80ffff'; ctx.fillRect(84 + 25 - cam * 0.7, 126, 6, 1); }
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== GOLDEN GATE, DUSK (Opus) =====
  DEFS.goldengate = {
    name: 'GOLDEN GATE, DUSK', place: 'SAN FRANCISCO',
    build: function (S) {
      var ws = layerW(0.1), wf = layerW(0.3), wm = layerW(0.55);
      var sky = mk(ws, FLOOR_TOP), x = sky.getContext('2d');
      U.bandGradient(x, 0, 0, ws, FLOOR_TOP, [[0, '#2a1850'], [0.35, '#8a3a78'], [0.62, '#f07848'], [0.8, '#ffc070'], [1, '#ffe0a0']], 22);
      x.fillStyle = '#fff4c0'; x.beginPath(); x.arc(ws * 0.7, 118, 16, 0, 7); x.fill();
      x.fillStyle = '#ffd890'; x.fillRect(ws * 0.7 - 20, 112, 40, 1); x.fillRect(ws * 0.7 - 24, 120, 48, 1);
      S.sky = sky;
      // bridge
      var far = mk(wf, FLOOR_TOP), f = far.getContext('2d');
      ridge(f, wf, 120, 20, 3, 21, '#3a2040');
      var deckY = 104, t1 = 70, t2 = wf - 70;
      f.strokeStyle = '#c8402a'; f.lineWidth = 1;
      for (var k = 0; k < 2; k++) {
        f.beginPath();
        for (var px = -40; px <= wf + 40; px += 2) {
          var yy;
          if (px < t1) yy = 34 + (t1 - px) * 0.9;
          else if (px > t2) yy = 34 + (px - t2) * 0.9;
          else { var u = (px - t1) / (t2 - t1); yy = 34 + 4 * u * (1 - u) * 60; }
          if (px === -40) f.moveTo(px, yy + k); else f.lineTo(px, yy + k);
        }
        f.stroke();
      }
      for (var sx = t1; sx < t2; sx += 6) {
        var uu = (sx - t1) / (t2 - t1), cy = 34 + 4 * uu * (1 - uu) * 60;
        f.fillStyle = '#b83a28'; f.fillRect(sx, cy, 1, deckY - cy);
      }
      [t1, t2].forEach(function (tx) {
        f.fillStyle = '#d04a30'; f.fillRect(tx - 5, 24, 10, deckY + 40 - 24);
        f.fillStyle = '#902818'; f.fillRect(tx + 2, 24, 3, deckY + 16);
        f.fillStyle = '#e86a48'; f.fillRect(tx - 5, 24, 2, deckY + 16);
        for (var yb = 40; yb < deckY; yb += 20) { f.fillStyle = '#902818'; f.fillRect(tx - 5, yb, 10, 3); }
      });
      f.fillStyle = '#b83a28'; f.fillRect(0, deckY, wf, 5);
      f.fillStyle = '#801e10'; f.fillRect(0, deckY + 5, wf, 2);
      S.far = far;
      // water
      var mid = mk(wm, 60), m = mid.getContext('2d');
      U.bandGradient(m, 0, 0, wm, 60, [[0, '#f09060'], [0.3, '#8a4a78'], [1, '#2a2a58']], 10);
      var rnd = U.rng(4);
      for (var i = 0; i < 140; i++) { m.fillStyle = rnd() < 0.5 ? '#ffd0a0' : '#c87890'; m.fillRect(Math.floor(rnd() * wm), Math.floor(rnd() * 60), 3 + Math.floor(rnd() * 6), 1); }
      S.mid = mid;
      S.crowd = crowd(layerW(0.8), 30, 9, 11, ['#1f2a55', '#101018', '#f0f0f0', '#e07a5f', '#503040']);
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        U.bandGradient(fl, 0, 0, w, h, [[0, '#5a3a30'], [1, '#8a5a40']], 6);
        for (var py = 0; py < h; py += 5) { fl.fillStyle = '#3a2218'; fl.fillRect(0, py, w, 1); }
        for (var px = 0; px < w; px += 36) { fl.fillStyle = '#2a1810'; fl.fillRect(px + (Math.floor(px / 36) % 2) * 12, 0, 1, h); }
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.sky, cam, 0.1);
      drawLayer(ctx, S.far, cam, 0.3);
      // HDMA water shimmer: each scanline offset by a sine
      for (var r = 0; r < 60; r++) {
        var off = Math.round(Math.sin(r * 0.5 + t * 0.07) * (r / 30 + 0.5));
        ctx.drawImage(S.mid, Math.round(cam * 0.55) + off, r, W, 1, 0, 112 + r, W, 1);
      }
      // sailboats
      for (var b = 0; b < 3; b++) {
        var bx = ((t * 0.12 + b * 140) % 520) - 60 - cam * 0.5, by = 124 + b * 9;
        ctx.fillStyle = '#f0e8e0'; ctx.fillRect(bx, by - 10, 1, 10);
        ctx.beginPath(); ctx.moveTo(bx + 1, by - 10); ctx.lineTo(bx + 8, by - 2); ctx.lineTo(bx + 1, by - 2); ctx.fill();
        ctx.fillStyle = '#403040'; ctx.fillRect(bx - 4, by - 1, 12, 2);
      }
      // drifting fog (color-math style translucent band)
      ctx.globalAlpha = 0.35; ctx.fillStyle = '#ffe8f0';
      for (var fz = 0; fz < 4; fz++) {
        var fx = ((t * 0.2 + fz * 110) % 480) - 100 - cam * 0.4;
        ctx.fillRect(fx, 96 + fz * 5, 90, 4); ctx.fillRect(fx + 20, 100 + fz * 5, 60, 3);
      }
      ctx.globalAlpha = 1;
      drawLayer(ctx, S.crowd[(t >> 4) & 1], cam, 0.8, FLOOR_TOP - 30);
      ctx.fillStyle = '#3a2218'; ctx.fillRect(0, FLOOR_TOP - 4, W, 4);
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== STARGATE, ABILENE (Astra) =====
  DEFS.stargate = {
    name: 'STARGATE, ABILENE', place: 'ABILENE, TX',
    build: function (S) {
      var ws = layerW(0.08), wf = layerW(0.3), wn = layerW(0.62);
      var sky = mk(ws, FLOOR_TOP), x = sky.getContext('2d');
      U.bandGradient(x, 0, 0, ws, FLOOR_TOP, [[0, '#1a0a30'], [0.4, '#6a1a48'], [0.7, '#e8481e'], [1, '#ffb040']], 20);
      stars(x, ws, 50, 40, 3);
      x.fillStyle = '#ffe070'; x.beginPath(); x.arc(ws * 0.3, 132, 22, 0, 7); x.fill();
      S.sky = sky;
      var far = mk(wf, FLOOR_TOP), f = far.getContext('2d');
      ridge(f, wf, 130, 26, 1.2, 8, '#5a1e2a');
      // mesas
      f.fillStyle = '#3a1020';
      f.fillRect(40, 108, 60, 40); f.fillRect(50, 100, 40, 10); f.fillRect(wf - 140, 112, 80, 40); f.fillRect(wf - 128, 104, 50, 10);
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      // data center halls
      for (var i = 0; i < 4; i++) {
        var bx = 10 + i * (wn / 4), bw = wn / 4 - 20;
        n.fillStyle = '#4a4a5a'; n.fillRect(bx, 104, bw, 68);
        n.fillStyle = '#6a6a7a'; n.fillRect(bx, 104, bw, 4);
        n.fillStyle = '#2a2a38'; n.fillRect(bx + bw - 8, 108, 8, 64);
        for (var fx = bx + 6; fx < bx + bw - 12; fx += 14) { n.fillStyle = '#1a1a26'; n.fillRect(fx, 116, 10, 6); n.fillRect(fx, 132, 10, 6); }
      }
      text(n, 'STARGATE', wn / 2, 92, '#fff6a0', { align: 'center', outline: '#401030' });
      // cooling towers
      [60, wn - 70].forEach(function (cx) {
        n.fillStyle = '#8a8a96';
        n.beginPath(); n.moveTo(cx - 16, 172); n.lineTo(cx - 10, 118); n.lineTo(cx + 10, 118); n.lineTo(cx + 16, 172); n.fill();
        n.fillStyle = '#6a6a76'; n.fillRect(cx + 4, 120, 6, 52);
      });
      // power lines
      n.strokeStyle = '#201020';
      for (var p = 0; p < wn; p += 90) { n.fillStyle = '#201020'; n.fillRect(p, 70, 2, 60); n.fillRect(p - 8, 72, 18, 2); }
      n.beginPath(); for (p = 0; p < wn; p += 90) { n.moveTo(p - 8, 73); n.quadraticCurveTo(p + 37, 86, p + 82, 73); } n.stroke();
      S.near = near;
      S.crowd = crowd(layerW(0.8), 30, 13, 13, ['#f0a020', '#e8e020', '#ff6020', '#4060a0']);
      S.steam = [60, wn - 70];
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        U.bandGradient(fl, 0, 0, w, h, [[0, '#a85a38'], [1, '#d88a50']], 8);
        var rnd = U.rng(6);
        for (var i = 0; i < 500; i++) { fl.fillStyle = rnd() < 0.5 ? '#b86a40' : '#e8a868'; fl.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 2, 1); }
        fl.fillStyle = '#8a4428'; fl.fillRect(0, 18, w, 2); fl.fillRect(0, 34, w, 2);
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.sky, cam, 0.08);
      // heat shimmer via per-scanline offsets on the far layer
      for (var r = 90; r < FLOOR_TOP; r++) {
        var off = Math.round(Math.sin(r * 0.9 + t * 0.15) * 1.2);
        ctx.drawImage(S.far, Math.round(cam * 0.3) + off, r, W, 1, 0, r, W, 1);
      }
      drawLayer(ctx, S.near, cam, 0.62);
      // blinking server lights
      for (var i = 0; i < 24; i++) {
        if (((t >> 3) + i * 7) % 5 < 2) {
          ctx.fillStyle = i % 3 ? '#40ff80' : '#40c0ff';
          ctx.fillRect((i * 18 + 16) - cam * 0.62, 112 + (i % 3) * 16, 2, 1);
        }
      }
      // steam puffs
      ctx.fillStyle = 'rgba(240,230,240,0.55)';
      S.steam.forEach(function (sx, k) {
        for (var p = 0; p < 4; p++) {
          var ph = ((t * 0.4 + p * 18 + k * 9) % 72);
          var rr = 4 + ph * 0.12;
          ctx.beginPath(); ctx.arc(sx - cam * 0.62 + Math.sin(ph * 0.1) * 3, 116 - ph, rr, 0, 7); ctx.fill();
        }
      });
      drawLayer(ctx, S.crowd[(t >> 4) & 1], cam, 0.8, FLOOR_TOP - 30);
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== THE LAUNCH STREAM (Sol) =====
  DEFS.launch = {
    name: 'THE LAUNCH STREAM', place: 'SAN FRANCISCO',
    build: function (S) {
      var wf = layerW(0.4), wn = layerW(0.75);
      var far = mk(wf, FLOOR_TOP), x = far.getContext('2d');
      U.bandGradient(x, 0, 0, wf, FLOOR_TOP, [[0, '#0a0a14'], [1, '#1a1a2e']], 8);
      // giant LED wall
      var sx = wf / 2 - 100;
      x.fillStyle = '#000'; x.fillRect(sx - 4, 16, 208, 112);
      x.fillStyle = '#10141e'; x.fillRect(sx, 20, 200, 104);
      S.screenX = sx;
      // lights truss
      x.fillStyle = '#2a2a38'; x.fillRect(0, 8, wf, 4);
      for (var l = 10; l < wf; l += 34) { x.fillStyle = '#404050'; x.fillRect(l, 12, 6, 6); }
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      // plants and stools (every launch stream has them)
      [30, wn - 40].forEach(function (px) {
        n.fillStyle = '#e8e0d0'; n.fillRect(px - 6, 150, 12, 22);
        n.fillStyle = '#3a8a4a';
        for (var k = 0; k < 7; k++) { n.beginPath(); n.ellipse(px + (k - 3) * 3, 140 - Math.abs(k - 3) * 2, 3, 12, (k - 3) * 0.3, 0, 7); n.fill(); }
      });
      [wn / 2 - 40, wn / 2, wn / 2 + 40].forEach(function (px) {
        n.fillStyle = '#c0c0c8'; n.fillRect(px - 5, 140, 10, 3); n.fillRect(px - 1, 143, 2, 29);
      });
      S.near = near;
      S.crowd = crowd(layerW(0.85), 30, 17, 10, ['#303030', '#f0f0f0', '#ff8a1e', '#40a0c0', '#a0a0a0']);
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        U.bandGradient(fl, 0, 0, w, h, [[0, '#2a2a3a'], [1, '#4a4a5e']], 6);
        for (var px = 0; px < w; px += 32) { fl.fillStyle = '#20202e'; fl.fillRect(px, 0, 1, h); }
        fl.fillStyle = 'rgba(255,200,120,0.15)'; fl.fillRect(FOFF + SW / 2 - 80, 0, 160, h);
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.far, cam, 0.4);
      var sx = S.screenX - cam * 0.4;
      // LED wall content cycles: chart crime / countdown / LIVE
      var phase = (t >> 8) % 3;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, 20, 200, 104); ctx.clip();
      if (phase === 0) {
        text(ctx, 'BENCHMARK', sx + 100, 26, '#ffffff', { align: 'center' });
        // chart crime: the smaller number has the taller bar
        ctx.fillStyle = '#ff8a1e'; ctx.fillRect(sx + 40, 44, 40, 70);
        ctx.fillStyle = '#6a6a7a'; ctx.fillRect(sx + 120, 94, 40, 20);
        text(ctx, '52.8', sx + 60, 36 + 70 - 64, '#ffffff', { align: 'center' });
        text(ctx, '69.1', sx + 140, 84, '#ffffff', { align: 'center' });
        text(ctx, 'SOL', sx + 60, 116, '#ffd23a', { align: 'center' });
        text(ctx, 'OPUS', sx + 140, 116, '#c0c0c0', { align: 'center' });
      } else if (phase === 1) {
        text(ctx, 'LAUNCHING', sx + 100, 46, '#ffd23a', { align: 'center', scale: 2 });
        text(ctx, 'THIS THURSDAY', sx + 100, 72, '#ffffff', { align: 'center' });
        text(ctx, '$2 / $10', sx + 100, 96, '#40ff80', { align: 'center', scale: 2 });
      } else {
        ctx.fillStyle = '#ff2020'; if ((t >> 4) & 1) { ctx.beginPath(); ctx.arc(sx + 20, 32, 4, 0, 7); ctx.fill(); }
        text(ctx, 'LIVE', sx + 28, 28, '#ffffff');
        text(ctx, 'BUILD WITH SOL', sx + 100, 56, '#ffd23a', { align: 'center' });
        text(ctx, 'SCALE WITH LUNA', sx + 100, 72, '#c8d0e8', { align: 'center' });
        text(ctx, '89 MIN AFTER OPUS', sx + 100, 100, '#8a8a9a', { align: 'center' });
      }
      ctx.restore();
      // spotlight beams (additive-ish)
      ctx.globalAlpha = 0.12; ctx.fillStyle = '#fff0c0';
      for (var b = 0; b < 3; b++) {
        var bx = 40 + b * 90 + Math.sin(t * 0.02 + b) * 30 - cam * 0.4;
        ctx.beginPath(); ctx.moveTo(bx, 12); ctx.lineTo(bx - 30, FLOOR_TOP); ctx.lineTo(bx + 30, FLOOR_TOP); ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawLayer(ctx, S.crowd[(t >> 4) & 1], cam, 0.85, FLOOR_TOP - 30);
      drawLayer(ctx, S.near, cam, 0.75);
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== COLOSSUS, MEMPHIS (Grok) =====
  DEFS.colossus = {
    name: 'COLOSSUS, MEMPHIS', place: 'MEMPHIS, TN',
    build: function (S) {
      var ws = layerW(0.08), wf = layerW(0.25), wn = layerW(0.6);
      var sky = mk(ws, FLOOR_TOP), x = sky.getContext('2d');
      U.bandGradient(x, 0, 0, ws, FLOOR_TOP, [[0, '#08060e'], [0.6, '#2a1420'], [1, '#8a3a18']], 18);
      stars(x, ws, 60, 30, 9);
      S.sky = sky;
      var far = mk(wf, FLOOR_TOP), f = far.getContext('2d');
      // Starship on its tower (the SpaceX merger)
      var rx = wf * 0.75;
      f.fillStyle = '#20202a'; f.fillRect(rx + 10, 30, 10, 110);
      for (var y = 34; y < 140; y += 8) { f.fillStyle = '#34343e'; f.fillRect(rx + 10, y, 10, 1); }
      f.fillStyle = '#c8c8d0'; f.fillRect(rx - 6, 20, 12, 120);
      f.beginPath(); f.moveTo(rx - 6, 20); f.lineTo(rx, 6); f.lineTo(rx + 6, 20); f.fill();
      f.fillStyle = '#9a9aa4'; f.fillRect(rx + 2, 20, 4, 120);
      f.fillStyle = '#20202a'; f.fillRect(rx - 10, 56, 4, 10); f.fillRect(rx + 6, 56, 4, 10);
      // city skyline
      var rnd = U.rng(31);
      for (var bx = 0; bx < wf; bx += 14 + Math.floor(rnd() * 10)) {
        var bh = 20 + rnd() * 40;
        f.fillStyle = '#16121e'; f.fillRect(bx, 140 - bh, 14, bh + 40);
        windowGrid(f, bx, 140 - bh, 14, bh, 2, 2, '#e8a040', '#16121e', bx);
      }
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      n.fillStyle = '#3a3e48'; n.fillRect(20, 80, wn - 40, 92);
      n.fillStyle = '#4a4e5a'; n.fillRect(20, 80, wn - 40, 5);
      text(n, 'COLOSSUS', wn / 2, 66, '#ffffff', { align: 'center', outline: '#000', scale: 1 });
      for (var rk = 36; rk < wn - 50; rk += 20) {
        n.fillStyle = '#16181e'; n.fillRect(rk, 94, 14, 60);
        for (var ry = 98; ry < 150; ry += 6) { n.fillStyle = '#2a2e38'; n.fillRect(rk + 2, ry, 10, 3); }
      }
      // gas turbines
      S.turbines = [];
      for (var tb = 0; tb < 3; tb++) {
        var tx = 30 + tb * (wn / 3) + 30;
        n.fillStyle = '#6a6e78'; n.fillRect(tx, 136, 36, 36);
        n.fillStyle = '#8a8e98'; n.fillRect(tx, 136, 36, 3);
        n.fillStyle = '#f08018'; for (var hs = 0; hs < 36; hs += 8) n.fillRect(tx + hs, 166, 4, 4);
        n.fillStyle = '#4a4e58'; n.fillRect(tx + 24, 116, 8, 20);
        S.turbines.push(tx + 28);
      }
      // fence
      n.strokeStyle = '#5a5e68';
      for (var fx = 0; fx < wn; fx += 6) { n.beginPath(); n.moveTo(fx, 150); n.lineTo(fx + 6, 172); n.moveTo(fx + 6, 150); n.lineTo(fx, 172); n.stroke(); }
      S.near = near;
      // Mode 7 concrete texture with hazard stripes
      S.floor = floorTex(128, function (fl, w, h) {
        fl.fillStyle = '#5a5a62'; fl.fillRect(0, 0, w, h);
        var rnd2 = U.rng(2);
        for (var i = 0; i < 900; i++) { fl.fillStyle = rnd2() < 0.5 ? '#4e4e56' : '#66666e'; fl.fillRect(Math.floor(rnd2() * w), Math.floor(rnd2() * h), 2, 2); }
        for (var yy = 0; yy < h; yy += 64) {
          for (var xx = 0; xx < w; xx += 16) { fl.fillStyle = (xx / 16) % 2 ? '#1a1a1a' : '#f0c020'; fl.fillRect(xx, yy, 16, 6); }
        }
        for (xx = 0; xx < w; xx += 64) { fl.fillStyle = '#3a3a42'; fl.fillRect(xx, 0, 2, h); }
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.sky, cam, 0.08);
      drawLayer(ctx, S.far, cam, 0.25);
      drawLayer(ctx, S.near, cam, 0.6);
      // turbine smoke
      S.turbines.forEach(function (sx, k) {
        for (var p = 0; p < 5; p++) {
          var ph = (t * 0.5 + p * 15 + k * 7) % 75;
          ctx.fillStyle = 'rgba(' + (120 + ph) + ',' + (110 + ph) + ',' + (110 + ph) + ',' + (0.6 - ph / 150) + ')';
          ctx.beginPath(); ctx.arc(sx - cam * 0.6 + ph * 0.3, 114 - ph, 3 + ph * 0.1, 0, 7); ctx.fill();
        }
      });
      // rack LEDs
      for (var i = 0; i < 20; i++) if (((t >> 2) * 7 + i * 13) % 9 < 4) {
        ctx.fillStyle = i % 2 ? '#ff3030' : '#40a0ff';
        ctx.fillRect(38 + i * 20 - cam * 0.6, 100 + (i * 7) % 48, 2, 1);
      }
      drawFloor(ctx, S.floor, cam, true, 0);
    }
  };

  // ===== SHORELINE KEYNOTE (Gemini) =====
  DEFS.shoreline = {
    name: 'SHORELINE KEYNOTE', place: 'MOUNTAIN VIEW',
    build: function (S) {
      var ws = layerW(0.1), wf = layerW(0.35), wn = layerW(0.7);
      var sky = mk(ws, FLOOR_TOP), x = sky.getContext('2d');
      U.bandGradient(x, 0, 0, ws, FLOOR_TOP, [[0, '#3a78e8'], [0.7, '#88c0ff'], [1, '#d0e8ff']], 16);
      var rnd = U.rng(12);
      for (var c = 0; c < 7; c++) {
        var cx = rnd() * ws, cy = 16 + rnd() * 50;
        x.fillStyle = '#ffffff';
        for (var k = 0; k < 5; k++) { x.beginPath(); x.arc(cx + k * 7, cy + (k % 2) * 3, 7, 0, 7); x.fill(); }
        x.fillStyle = '#d8e8ff'; x.fillRect(cx - 6, cy + 5, 40, 3);
      }
      S.sky = sky;
      var far = mk(wf, FLOOR_TOP), f = far.getContext('2d');
      ridge(f, wf, 128, 18, 2, 5, '#6a9a5a');
      // tent canopy peaks
      for (var p = 0; p < 5; p++) {
        var px = 20 + p * (wf - 40) / 4;
        f.fillStyle = '#f4f4f8'; f.beginPath(); f.moveTo(px - 40, 110); f.lineTo(px, 60); f.lineTo(px + 40, 110); f.fill();
        f.fillStyle = '#d0d4e0'; f.beginPath(); f.moveTo(px, 60); f.lineTo(px + 40, 110); f.lineTo(px + 10, 110); f.fill();
        f.fillStyle = '#808890'; f.fillRect(px - 1, 50, 2, 12);
      }
      f.fillStyle = '#d0d4e0'; f.fillRect(0, 108, wf, 4);
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      // big keynote screen frame
      S.scrX = wn / 2 - 70;
      n.fillStyle = '#202028'; n.fillRect(S.scrX - 4, 60, 148, 84);
      n.fillStyle = '#404048'; n.fillRect(S.scrX + 66, 144, 8, 28);
      // balloon clusters in four colors
      var bc = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];
      [30, wn - 40].forEach(function (bx, j) {
        for (var i = 0; i < 8; i++) {
          n.strokeStyle = '#808080'; n.beginPath(); n.moveTo(bx, 170); n.lineTo(bx + (i - 4) * 4, 100 + (i % 3) * 8); n.stroke();
          n.fillStyle = bc[(i + j) % 4]; n.beginPath(); n.ellipse(bx + (i - 4) * 4, 96 + (i % 3) * 8, 5, 6, 0, 0, 7); n.fill();
          n.fillStyle = 'rgba(255,255,255,0.6)'; n.fillRect(bx + (i - 4) * 4 - 2, 92 + (i % 3) * 8, 2, 2);
        }
      });
      S.near = near;
      S.crowd = crowd(layerW(0.85), 30, 23, 9);
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        U.bandGradient(fl, 0, 0, w, h, [[0, '#3a3a48'], [1, '#5a5a6a']], 6);
        var cols = ['#4285f4', '#ea4335', '#fbbc05', '#34a853'];
        for (var px = 0; px < w; px += 40) { fl.fillStyle = cols[(px / 40) % 4]; fl.fillRect(px, h - 6, 40, 2); }
        for (px = 0; px < w; px += 20) { fl.fillStyle = '#2a2a36'; fl.fillRect(px, 0, 1, h); }
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.sky, cam, 0.1);
      drawLayer(ctx, S.far, cam, 0.35);
      drawLayer(ctx, S.near, cam, 0.7);
      var sx = S.scrX - cam * 0.7;
      ctx.save(); ctx.beginPath(); ctx.rect(sx, 64, 140, 76); ctx.clip();
      var ph = (t >> 7) % 3;
      U.bandGradient(ctx, sx, 64, 140, 76, [[0, '#1a2a6a'], [1, '#6a2aa8']], 8);
      if (ph === 0) {
        NC.Font.drawGradient(ctx, '3.8', sx + 70, 78, '#ffffff', '#8ae0ff', { align: 'center', scale: 2 });
        text(ctx, 'FLASH', sx + 70, 100, '#ffffff', { align: 'center' });
        text(ctx, 'NEW! AGAIN!', sx + 70, 118, '#fbbc05', { align: 'center' });
      } else if (ph === 1) {
        text(ctx, "WHERE'S", sx + 70, 84, '#ffffff', { align: 'center', scale: 2 });
        text(ctx, 'PRO?', sx + 70, 104, '#ea4335', { align: 'center', scale: 2 });
      } else {
        text(ctx, 'ADD GLUE', sx + 70, 80, '#ffffff', { align: 'center' });
        text(ctx, 'TO PIZZA', sx + 70, 92, '#ffffff', { align: 'center' });
        text(ctx, 'SOURCE:', sx + 70, 110, '#8a8aa0', { align: 'center' });
        text(ctx, 'REDDIT', sx + 70, 120, '#ff6030', { align: 'center' });
      }
      ctx.restore();
      drawLayer(ctx, S.crowd[(t >> 3) & 1], cam, 0.85, FLOOR_TOP - 30);
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== WEST LAKE, HANGZHOU (DeepSeek) =====
  DEFS.westlake = {
    name: 'WEST LAKE, HANGZHOU', place: 'HANGZHOU',
    build: function (S) {
      var ws = layerW(0.08), wf = layerW(0.3), wn = layerW(0.8);
      var sky = mk(ws, 120), x = sky.getContext('2d');
      U.bandGradient(x, 0, 0, ws, 120, [[0, '#060a20'], [0.7, '#1a2a5a'], [1, '#3a4a7a']], 16);
      stars(x, ws, 90, 80, 44);
      x.fillStyle = '#fff8e0'; x.beginPath(); x.arc(ws * 0.2, 34, 12, 0, 7); x.fill();
      x.fillStyle = '#e8e0c8'; x.fillRect(ws * 0.2 - 4, 30, 3, 3); x.fillRect(ws * 0.2 + 3, 37, 2, 2);
      S.sky = sky;
      var far = mk(wf, 120), f = far.getContext('2d');
      ridge(f, wf, 110, 34, 2.5, 3, '#141c3a');
      ridge(f, wf, 116, 16, 1.5, 4, '#0e1430');
      // Leifeng pagoda silhouette with lit windows
      var px = wf * 0.62;
      for (var lv = 0; lv < 5; lv++) {
        var w = 26 - lv * 4, y = 96 - lv * 12;
        f.fillStyle = '#0a0e22'; f.fillRect(px - w / 2, y, w, 12);
        f.fillStyle = '#301818'; f.fillRect(px - w / 2 - 4, y - 1, w + 8, 3);
        f.fillStyle = '#ffb040'; for (var wx = px - w / 2 + 3; wx < px + w / 2 - 2; wx += 5) f.fillRect(wx, y + 4, 2, 4);
      }
      f.fillStyle = '#0a0e22'; f.fillRect(px - 1, 30, 2, 8);
      S.far = far;
      // lake reflection source = sky+far flipped
      var refl = mk(W + 2, 52), r = refl.getContext('2d');
      S.refl = refl;
      // near: willow trees + lanterns
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      [20, wn - 60].forEach(function (tx) {
        n.fillStyle = '#2a1a10'; n.fillRect(tx + 16, 60, 6, 112);
        var rnd = U.rng(tx);
        for (var b = 0; b < 26; b++) {
          var bx = tx + rnd() * 40, len = 30 + rnd() * 60;
          n.strokeStyle = rnd() < 0.5 ? '#2a6a3a' : '#3a8a4a';
          n.beginPath(); n.moveTo(bx, 50 + rnd() * 20); n.quadraticCurveTo(bx + 6, 90, bx + 2, 50 + len); n.stroke();
        }
      });
      S.near = near;
      S.lanterns = [];
      for (var l = 60; l < wn - 60; l += 44) S.lanterns.push(l);
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        U.bandGradient(fl, 0, 0, w, h, [[0, '#4a4a58'], [1, '#6a6a7a']], 6);
        for (var py = 0; py < h; py += 8) for (var pxx = (py / 8 % 2) * 10; pxx < w; pxx += 20) {
          fl.fillStyle = '#3a3a48'; fl.fillRect(pxx, py, 1, 8); fl.fillRect(pxx, py, 20, 1);
        }
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.sky, cam, 0.08);
      drawLayer(ctx, S.far, cam, 0.3);
      // lake: reflect the sky+far bands upside down with HDMA wobble
      ctx.fillStyle = '#0a1230'; ctx.fillRect(0, 120, W, 52);
      for (var r = 0; r < 52; r++) {
        var off = Math.round(Math.sin(r * 0.6 + t * 0.08) * (1 + r / 20));
        var srcY = 119 - r * 1.6;
        if (srcY < 0) break;
        ctx.globalAlpha = 0.55 - r / 140;
        ctx.drawImage(S.far, Math.round(cam * 0.3) + off, srcY, W, 1, 0, 120 + r, W, 1);
      }
      ctx.globalAlpha = 1;
      // moon glitter
      for (var g = 0; g < 8; g++) {
        if (((t >> 3) + g) % 3) { ctx.fillStyle = '#fff0c0'; ctx.fillRect(W * 0.2 - cam * 0.08 + Math.sin(g * 7) * 8, 124 + g * 5, 6 - g % 3 * 2, 1); }
      }
      // the whale breaches every ~8 seconds
      var wt = t % 480;
      if (wt < 60) {
        var wx = 180 - cam * 0.5, wy = 140 - Math.sin(wt / 60 * Math.PI) * 26;
        ctx.fillStyle = '#1f4fa8'; ctx.beginPath(); ctx.ellipse(wx, wy, 16, 7, -0.4 + wt / 60 * 0.8, 0, 7); ctx.fill();
        ctx.fillStyle = '#dfe8f0'; ctx.beginPath(); ctx.ellipse(wx + 2, wy + 3, 11, 3, -0.4 + wt / 60 * 0.8, 0, 7); ctx.fill();
        ctx.fillStyle = '#1f4fa8'; ctx.fillRect(wx - 20, wy - 6, 6, 4);
      }
      drawLayer(ctx, S.near, cam, 0.8);
      // swaying lanterns
      S.lanterns.forEach(function (lx, i) {
        var x = lx - cam * 0.8 + Math.sin(t * 0.04 + i) * 2;
        ctx.fillStyle = '#301010'; ctx.fillRect(x, 40, 1, 12);
        ctx.fillStyle = ((t >> 4) + i) % 4 ? '#e83020' : '#ff6040'; ctx.fillRect(x - 4, 52, 9, 10);
        ctx.fillStyle = '#ffd040'; ctx.fillRect(x - 3, 51, 7, 1); ctx.fillRect(x - 3, 62, 7, 1);
      });
      ctx.fillStyle = '#2a2a38'; ctx.fillRect(0, FLOOR_TOP - 3, W, 3);
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== SINGLES' DAY MARKET (Qwen) =====
  DEFS.market = {
    name: "SINGLES' DAY MARKET", place: 'HANGZHOU',
    build: function (S) {
      var wf = layerW(0.3), wn = layerW(0.7);
      var far = mk(wf, FLOOR_TOP), x = far.getContext('2d');
      U.bandGradient(x, 0, 0, wf, FLOOR_TOP, [[0, '#10081e'], [1, '#3a1040']], 12);
      var rnd = U.rng(77);
      for (var bx = 0; bx < wf; bx += 20 + Math.floor(rnd() * 16)) {
        var bh = 50 + rnd() * 70;
        x.fillStyle = '#1e1028'; x.fillRect(bx, FLOOR_TOP - bh, 22, bh);
        windowGrid(x, bx, FLOOR_TOP - bh, 22, bh, 3, 2, rnd() < 0.5 ? '#ff60c0' : '#60e0ff', '#1e1028', bx + 1);
      }
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      // stalls
      for (var s = 0; s < 5; s++) {
        var sx = 10 + s * (wn - 20) / 5, sw = (wn - 20) / 5 - 12;
        n.fillStyle = ['#e83050', '#f08020', '#6a3ae0', '#20a0a0', '#e8c020'][s];
        for (var st = 0; st < sw; st += 8) { n.fillRect(sx + st, 100, 8, 10); n.fillStyle = n.fillStyle === '#ffffff' ? ['#e83050', '#f08020', '#6a3ae0', '#20a0a0', '#e8c020'][s] : '#ffffff'; }
        n.fillStyle = '#2a1a20'; n.fillRect(sx, 110, sw, 62);
        n.fillStyle = '#4a2a30'; n.fillRect(sx + 2, 140, sw - 4, 4);
        for (var it = 0; it < 6; it++) { n.fillStyle = ['#ffd040', '#ff6060', '#60ff90', '#c8a8ff'][it % 4]; n.fillRect(sx + 4 + it * (sw - 8) / 6, 134, 4, 6); }
      }
      S.near = near;
      S.signs = [['11.11', '#ff40a0'], ['QWEN 3.8', '#c8a8ff'], ['NEW!', '#ffe040'], ['3.9 SOON', '#60e0ff'], ['50% OFF', '#ff6040']];
      S.crowd = crowd(layerW(0.85), 30, 51, 9);
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        U.bandGradient(fl, 0, 0, w, h, [[0, '#2a1830'], [1, '#4a2848']], 6);
        for (var px = 0; px < w; px += 16) for (var py = 0; py < h; py += 8) { fl.fillStyle = ((px / 16 + py / 8) % 2) ? '#3a2040' : '#281430'; fl.fillRect(px, py, 16, 8); }
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.far, cam, 0.3);
      drawLayer(ctx, S.near, cam, 0.7);
      // neon signs flicker (palette cycling)
      S.signs.forEach(function (sg, i) {
        var x = 40 + i * 90 - cam * 0.7, on = ((t >> 3) + i * 5) % 17 !== 0;
        ctx.fillStyle = '#10081a'; ctx.fillRect(x - 4, 70 + (i % 2) * 10, NC.Font.measure(sg[0]) + 8, 14);
        if (on) text(ctx, sg[0], x, 73 + (i % 2) * 10, sg[1]);
      });
      // string lights
      for (var l = 0; l < 30; l++) {
        var lx = l * 16 - (cam * 0.75) % 16;
        ctx.fillStyle = ((t >> 4) + l) % 3 === 0 ? '#ffffff' : ['#ff4060', '#ffd040', '#60e0ff'][l % 3];
        ctx.fillRect(lx, 30 + Math.round(Math.sin(l * 0.8) * 3), 2, 2);
      }
      drawLayer(ctx, S.crowd[(t >> 4) & 1], cam, 0.85, FLOOR_TOP - 30);
      drawFloor(ctx, S.floor, cam);
    }
  };

  // ===== MOONSHOT CRATER (Kimi) =====
  DEFS.moon = {
    name: 'MOONSHOT CRATER', place: 'THE MOON', gravity: 0.72,
    build: function (S) {
      var ws = layerW(0.05), wf = layerW(0.25), wn = layerW(0.55);
      var sky = mk(ws, FLOOR_TOP), x = sky.getContext('2d');
      x.fillStyle = '#02020a'; x.fillRect(0, 0, ws, FLOOR_TOP);
      stars(x, ws, FLOOR_TOP, 160, 99);
      // Earth
      var ex = ws * 0.72, ey = 48;
      x.fillStyle = '#2a60c8'; x.beginPath(); x.arc(ex, ey, 22, 0, 7); x.fill();
      x.fillStyle = '#3aa050'; x.fillRect(ex - 10, ey - 12, 10, 8); x.fillRect(ex + 2, ey + 2, 12, 9); x.fillRect(ex - 16, ey + 4, 6, 5);
      x.fillStyle = '#ffffff'; x.fillRect(ex - 14, ey - 6, 8, 2); x.fillRect(ex + 4, ey - 14, 10, 2);
      x.fillStyle = 'rgba(0,0,20,0.55)'; x.beginPath(); x.arc(ex + 8, ey, 22, -1.6, 1.6); x.fill();
      S.sky = sky;
      var far = mk(wf, FLOOR_TOP), f = far.getContext('2d');
      ridge(f, wf, 150, 44, 4, 12, '#3a3a48');
      ridge(f, wf, 160, 20, 2, 13, '#4a4a5a');
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      // lander + antenna
      var lx = wn * 0.3;
      n.fillStyle = '#c8c8d0'; n.fillRect(lx, 130, 30, 20);
      n.fillStyle = '#e8b030'; n.fillRect(lx + 2, 132, 26, 16);
      n.fillStyle = '#8a8a96'; n.fillRect(lx - 6, 150, 4, 22); n.fillRect(lx + 32, 150, 4, 22);
      n.fillStyle = '#ffffff'; n.fillRect(lx + 14, 110, 2, 20);
      text(n, 'K3', lx + 8, 136, '#1a1e3a');
      // flag
      n.fillStyle = '#c0c0c8'; n.fillRect(wn * 0.75, 110, 1, 62);
      n.fillStyle = '#1a1e3a'; n.fillRect(wn * 0.75 + 1, 110, 22, 13);
      n.fillStyle = '#fff4c0'; n.beginPath(); n.arc(wn * 0.75 + 12, 116, 4, 0, 7); n.fill();
      n.fillStyle = '#1a1e3a'; n.beginPath(); n.arc(wn * 0.75 + 14, 115, 4, 0, 7); n.fill();
      S.near = near;
      // Mode 7 regolith with craters
      S.floor = floorTex(160, function (fl, w, h) {
        fl.fillStyle = '#8a8a96'; fl.fillRect(0, 0, w, h);
        var rnd = U.rng(5);
        for (var i = 0; i < 1400; i++) { fl.fillStyle = rnd() < 0.5 ? '#7a7a86' : '#9a9aa6'; fl.fillRect(Math.floor(rnd() * w), Math.floor(rnd() * h), 2, 1); }
        for (i = 0; i < 40; i++) {
          var cx = rnd() * w, cy = rnd() * h, r = 4 + rnd() * 12;
          fl.fillStyle = '#6a6a76'; fl.beginPath(); fl.ellipse(cx, cy, r, r * 0.6, 0, 0, 7); fl.fill();
          fl.fillStyle = '#aaaab6'; fl.beginPath(); fl.ellipse(cx + 1, cy + r * 0.3, r * 0.8, r * 0.25, 0, 0, Math.PI); fl.fill();
        }
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.sky, cam, 0.05);
      drawLayer(ctx, S.far, cam, 0.25);
      // swarm of tiny agents drifting across the sky
      for (var i = 0; i < 18; i++) {
        var x = ((t * (0.3 + (i % 5) * 0.08) + i * 37) % 300) - 20, y = 40 + ((i * 29) % 70) + Math.sin(t * 0.05 + i) * 3;
        ctx.fillStyle = (t >> 3) % 4 === i % 4 ? '#ffffff' : '#fff4c0';
        ctx.fillRect(x, y, 2, 2);
      }
      drawLayer(ctx, S.near, cam, 0.55);
      drawFloor(ctx, S.floor, cam, true, 0);
    }
  };

  // ===== THE VAULT (Mythos) =====
  DEFS.vault = {
    name: 'THE VAULT (OPEN)', place: 'CLASSIFIED',
    build: function (S) {
      var wf = layerW(0.3), wn = layerW(0.65);
      var far = mk(wf, FLOOR_TOP), x = far.getContext('2d');
      U.bandGradient(x, 0, 0, wf, FLOOR_TOP, [[0, '#08020e'], [1, '#2a0a3a']], 14);
      // rune columns
      for (var c = 20; c < wf; c += 60) {
        x.fillStyle = '#1a0a24'; x.fillRect(c, 20, 18, FLOOR_TOP - 20);
        x.fillStyle = '#2a1238'; x.fillRect(c, 20, 3, FLOOR_TOP - 20);
      }
      S.runeCols = [];
      for (c = 20; c < wf; c += 60) S.runeCols.push(c);
      S.far = far;
      var near = mk(wn, FLOOR_TOP), n = near.getContext('2d');
      // open vault door, chains broken
      var vx = wn / 2;
      n.fillStyle = '#000'; n.beginPath(); n.arc(vx, 84, 46, 0, 7); n.fill();
      n.fillStyle = '#4a2a5a'; n.beginPath(); n.ellipse(vx + 58, 84, 12, 46, 0, 0, 7); n.fill();
      n.fillStyle = '#6a3a7a'; n.beginPath(); n.ellipse(vx + 58, 84, 8, 40, 0, 0, 7); n.fill();
      n.strokeStyle = '#8a8a98'; n.lineWidth = 2;
      n.beginPath(); n.moveTo(vx - 70, 40); n.lineTo(vx - 40, 64); n.moveTo(vx - 70, 130); n.lineTo(vx - 46, 112); n.stroke();
      S.near = near;
      S.floor = floorTex(FLOOR_H, function (fl, w, h) {
        fl.fillStyle = '#140a1c'; fl.fillRect(0, 0, w, h);
        for (var px = 0; px < w; px += 40) { fl.fillStyle = '#3a1a4a'; fl.fillRect(px, 0, 1, h); }
        fl.fillStyle = '#ffcc30'; fl.fillRect(0, h / 2, w, 1);
      });
    },
    draw: function (ctx, S, cam, t) {
      drawLayer(ctx, S.far, cam, 0.3);
      // glowing runes cycle up the columns
      S.runeCols.forEach(function (c, i) {
        for (var k = 0; k < 6; k++) {
          var y = 30 + ((k * 24 + t * 0.5 + i * 11) % 130);
          ctx.fillStyle = (k + (t >> 3)) % 3 ? '#ffcc30' : '#ff60ff';
          ctx.fillRect(c + 6 - cam * 0.3, y, 6, 2); ctx.fillRect(c + 8 - cam * 0.3, y - 2, 2, 6);
        }
      });
      drawLayer(ctx, S.near, cam, 0.65);
      // light pouring from the vault + floating books
      var vx = (layerW(0.65) / 2) - cam * 0.65;
      ctx.globalAlpha = 0.25 + Math.sin(t * 0.08) * 0.08; ctx.fillStyle = '#ffcc30';
      ctx.beginPath(); ctx.arc(vx, 84, 40, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      for (var b = 0; b < 6; b++) {
        var bx = vx - 90 + b * 36, by = 50 + Math.sin(t * 0.04 + b * 2) * 10 + (b % 2) * 30;
        ctx.fillStyle = '#2a1040'; ctx.fillRect(bx, by, 10, 7);
        ctx.fillStyle = '#ffe080'; ctx.fillRect(bx + 1, by + 1, 8, 1);
      }
      // occasional lightning flash
      if (t % 300 < 4) { ctx.fillStyle = 'rgba(255,220,255,0.3)'; ctx.fillRect(0, 0, W, FLOOR_TOP); }
      drawFloor(ctx, S.floor, cam);
    }
  };

  var built = {};
  NC.Stages = {
    ids: Object.keys(DEFS),
    get: function (id) {
      var d = DEFS[id] || DEFS.archive;
      if (!built[id]) {
        var S = { def: d };
        d.build(S);
        built[id] = S;
      }
      return built[id];
    },
    draw: function (ctx, id, cam, t) {
      var S = NC.Stages.get(id);
      S.def.draw(ctx, S, cam, t);
    },
    name: function (id) { return (DEFS[id] || DEFS.archive).name; },
    place: function (id) { return (DEFS[id] || DEFS.archive).place; },
    gravity: function (id) { return (DEFS[id] || {}).gravity || 1; },
    FLOOR_TOP: FLOOR_TOP
  };
})(window.NC = window.NC || {});
