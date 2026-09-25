// Generated art (Kenspire): stage backdrops, portraits and sprite atlases listed under
// "art" in assets/manifest.json. Anything missing keeps the procedural art.
(function (NC) {
  'use strict';
  var U = NC.U;

  // Engine pose -> generated pose, most specific first.
  var POSE = {
    idle0: 'idle', idle1: 'idle', idle2: 'idle', portrait: 'idle', intro: 'taunt',
    walk0: 'walk_a', walk1: 'walk_b', walk2: 'walk_a', walk3: 'walk_b',
    crouch: 'crouch', land: 'crouch', getup: 'crouch',
    jumpUp: 'jump', jumpTuck: 'jump', jumpDown: 'jump',
    block: 'block', blockLow: 'block_low',
    hitHigh: 'hit', hitGut: 'hit_gut', hitLow: 'hit_gut', fall: 'fall', lying: 'lying',
    dizzy0: 'dizzy', dizzy1: 'dizzy', win0: 'win', win1: 'win', taunt: 'taunt', lose: 'lose',
    lp0: 'windup', lp1: 'jab', hp0: 'windup', hp1: 'straight', hp2: 'straight',
    lk0: 'kick', lk1: 'kick', hk0: 'kick', hk1: 'high_kick', hk2: 'high_kick',
    clp: 'crouch_punch', chp0: 'crouch', chp1: 'uppercut', clk: 'sweep', chk0: 'crouch', chk1: 'sweep',
    jlp: 'air_punch', jhp: 'air_punch', jlk: 'air_kick', jhk: 'air_kick',
    throw0: 'straight', throw1: 'raise',
    castPrep: 'windup', cast: 'cast', rise0: 'crouch', rise1: 'uppercut', dash: 'dash',
    spin0: 'spin', spin1: 'spin', charge: 'charge', counter: 'counter', grab: 'straight',
    raise: 'raise', superPose: 'raise', think: 'charge'
  };
  var FALLBACK = { windup: 'idle', walk_b: 'walk_a', walk_a: 'idle', block_low: 'crouch', hit_gut: 'hit', crouch_punch: 'crouch',
    sweep: 'crouch', air_punch: 'jump', air_kick: 'jump', high_kick: 'kick', kick: 'idle', jab: 'idle', straight: 'jab',
    uppercut: 'raise', raise: 'win', dash: 'straight', spin: 'idle', charge: 'crouch', counter: 'block', taunt: 'idle',
    dizzy: 'hit', lose: 'crouch', fall: 'hit', lying: 'fall', cast: 'straight', block: 'idle', crouch: 'idle', jump: 'crouch', hit: 'idle', win: 'idle' };

  var M = null;              // manifest.art
  var K = 1;                 // art pixels per game pixel (manifest.art.res)
  var imgs = {};             // url -> HTMLImageElement (loaded) | 'loading' | 'failed'
  var frameCache = {};
  var tintCache = {};

  function load(url, cb) {
    var v = imgs[url];
    if (v && v !== 'loading') { if (cb) cb(v === 'failed' ? null : v); return; }
    if (v === 'loading') return;
    imgs[url] = 'loading';
    var im = new Image();
    im.onload = function () { imgs[url] = im; if (cb) cb(im); };
    im.onerror = function () { imgs[url] = 'failed'; if (cb) cb(null); };
    im.src = 'assets/' + url;
  }
  function ready(url) { var v = imgs[url]; return v && v !== 'loading' && v !== 'failed' ? v : null; }

  function init() {
    if (location.protocol === 'file:') return;
    fetch('assets/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        M = (m && m.art) || null;
        if (!M) return;
        K = M.res || 1;
        var k;
        for (k in M.stages || {}) load(M.stages[k]);
        for (k in M.portraits || {}) M.portraits[k].forEach(function (u) { load(u); });
        for (k in M.sprites || {}) M.sprites[k].atlases.forEach(function (u) { load(u); });
      }).catch(function () { /* no manifest: procedural art */ });
  }

  // Applies the same tint modes the procedural renderer supports.
  function tint(src, mode) {
    var c = U.makeCanvas(src.width, src.height), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    if (!mode) return c;
    var d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (var i = 0; i < p.length; i += 4) {
      if (!p[i + 3]) continue;
      if (mode === 'flash') { p[i] = p[i + 1] = p[i + 2] = 255; }
      else if (mode === 'dark') { p[i] = 16; p[i + 1] = 8; p[i + 2] = 32; }
      else if (mode === 'red') { p[i] = 255; p[i + 1] *= 0.4; p[i + 2] *= 0.4; }
      else if (mode === 'gold') { p[i] = 255; p[i + 1] = Math.min(255, 160 + p[i + 1] * 0.4); p[i + 2] = 60; }
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  NC.Art = {
    init: init,
    has: function (kind, id) { return !!(M && M[kind] && M[kind][id]); },

    // {c, ox, oy} for a fighter pose, or null to use the procedural sprite.
    spriteFrame: function (id, ci, pose, mode) {
      var sp = M && M.sprites && M.sprites[id];
      if (!sp) return null;
      var atlas = ready(sp.atlases[ci] || sp.atlases[0]);
      if (!atlas) return null;
      var key = POSE[pose] || 'idle', guard = 0;
      while (!sp.frames[key] && guard++ < 6) key = FALLBACK[key] || 'idle';
      var f = sp.frames[key];
      if (!f) return null;
      var ck = id + '|' + ci + '|' + key + '|' + (mode || '') + '|' + (pose === 'idle1' || pose === 'idle2' ? pose : '');
      if (frameCache[ck]) return frameCache[ck];
      var c = U.makeCanvas(f[2], f[3] + 2 * K), x = c.getContext('2d');
      // idle breathing: squash the top by a game pixel on alternate frames
      var bob = (pose === 'idle1' ? 1 : pose === 'idle2' ? 2 : 0) * K;
      x.drawImage(atlas, f[0], f[1], f[2], f[3], 0, 2 * K + bob, f[2], f[3] - bob);
      if (mode) c = tint(c, mode);
      c.k = K;
      return (frameCache[ck] = { c: c, ox: f[4] / K, oy: f[5] / K + 2, k: K });
    },

    // Portrait canvas (w x h) cropped from the generated bust, or null.
    portrait: function (id, ci, w, h, mode) {
      var list = M && M.portraits && M.portraits[id];
      if (!list) return null;
      var im = ready(list[ci] || list[0]);
      if (!im) return null;
      var ck = id + '|' + ci + '|' + w + 'x' + h + '|' + (mode || '');
      if (tintCache[ck]) return tintCache[ck];
      var c = U.makeCanvas(w * K, h * K), x = c.getContext('2d');
      var s = Math.max(w * K / im.width, h * K / im.height);
      x.imageSmoothingEnabled = s < 1;
      x.imageSmoothingQuality = 'high';
      var dw = im.width * s, dh = im.height * s;
      x.drawImage(im, Math.round((w * K - dw) / 2), 0, Math.round(dw), Math.round(dh));
      if (mode) c = tint(c, mode);
      c.k = K;
      return (tintCache[ck] = c);
    },

    // Draws a generated stage backdrop with per-scanline parallax (SNES line scroll):
    // the sky drifts slowest, the floor rows track the camera one-to-one.
    drawStage: function (ctx, id, cam) {
      var url = M && M.stages && M.stages[id];
      var im = url && ready(url);
      if (!im) return false;
      // one pass per backdrop row: at 2x art that is two rows per game scanline
      var top = NC.Stages.FLOOR_TOP, H = NC.H, span = im.width / K - NC.W;
      for (var r = 0; r < H * K; r++) {
        var y = r / K;
        var f = y < top ? 0.55 + 0.15 * (y / top) : 0.7 + 0.3 * ((y - top) / (H - top));
        var sx = cam * f + span * (1 - f) / 2;
        ctx.drawImage(im, Math.round(sx * K), r, NC.W * K, 1, 0, y, NC.W, 1 / K);
      }
      return true;
    }
  };
})(window.NC = window.NC || {});
