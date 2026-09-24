// NEURAL CLASH: core namespace, constants and small helpers shared by every module.
(function (NC) {
  'use strict';

  NC.W = 256;          // SNES NTSC width
  NC.H = 224;          // SNES NTSC height
  NC.FPS = 60;
  NC.GROUND_Y = 200;   // screen-space floor line for fighters
  NC.STAGE_W = 448;    // world width of a fight stage
  NC.frame = 0;        // global frame counter, incremented by main loop

  // ---------- math ----------
  var U = NC.U = {};
  U.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  U.lerp = function (a, b, t) { return a + (b - a) * t; };
  U.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };
  U.rad = function (d) { return d * Math.PI / 180; };
  U.rand = Math.random;
  U.randInt = function (a, b) { return a + Math.floor(Math.random() * (b - a + 1)); };
  U.choice = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  U.chance = function (p) { return Math.random() < p; };

  // Deterministic PRNG (mulberry32) for stage decoration so layouts are stable.
  U.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  U.rectsOverlap = function (a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  };

  // ---------- color ----------
  U.hexToRgb = function (hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    var n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  U.rgbToHex = function (r, g, b) {
    // Quantize to SNES 15-bit color (5 bits per channel) for authenticity.
    function q(v) { v = U.clamp(Math.round(v), 0, 255); return (v >> 3) << 3 | (v >> 5); }
    return '#' + ((1 << 24) | (q(r) << 16) | (q(g) << 8) | q(b)).toString(16).slice(1);
  };
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; } else {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    return [h * 360, s, l];
  }
  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    if (s === 0) return [l * 255, l * 255, l * 255];
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
  }
  U.rgbToHsl = rgbToHsl;
  U.hslToRgb = hslToRgb;

  // Pixel-art style ramp: shadows shift hue toward blue/purple, highlights toward yellow.
  U.ramp = function (hex) {
    var c = U.hexToRgb(hex), hsl = rgbToHsl(c[0], c[1], c[2]);
    function shift(h, target, amt) {
      var d = ((target - h + 540) % 360) - 180;
      return h + d * amt;
    }
    var sh = hslToRgb(shift(hsl[0], 250, 0.08), Math.min(1, hsl[1] * 0.95 + 0.03), hsl[2] * 0.68);
    var hi = hslToRgb(shift(hsl[0], 55, 0.1), hsl[1] * 0.95, Math.min(0.94, hsl[2] + (1 - hsl[2]) * 0.42));
    return [U.rgbToHex(sh[0], sh[1], sh[2]), U.rgbToHex(c[0], c[1], c[2]), U.rgbToHex(hi[0], hi[1], hi[2])];
  };
  U.mix = function (h1, h2, t) {
    var a = U.hexToRgb(h1), b = U.hexToRgb(h2);
    return U.rgbToHex(U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t));
  };
  U.darken = function (hex, amt) { return U.mix(hex, '#000000', amt); };
  U.lighten = function (hex, amt) { return U.mix(hex, '#ffffff', amt); };

  // ---------- canvas helpers ----------
  U.makeCanvas = function (w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    return c;
  };

  // Vertical banded gradient, SNES-HDMA style (discrete bands rather than smooth).
  U.bandGradient = function (ctx, x, y, w, h, stops, bands) {
    bands = bands || 16;
    var bh = h / bands;
    for (var i = 0; i < bands; i++) {
      var t = i / (bands - 1);
      // find stop segment
      var col = stops[stops.length - 1][1];
      for (var s = 0; s < stops.length - 1; s++) {
        if (t >= stops[s][0] && t <= stops[s + 1][0]) {
          var lt = (t - stops[s][0]) / ((stops[s + 1][0] - stops[s][0]) || 1);
          col = U.mix(stops[s][1], stops[s + 1][1], lt);
          break;
        }
      }
      ctx.fillStyle = col;
      ctx.fillRect(x, Math.floor(y + i * bh), w, Math.ceil(bh) + 1);
    }
  };

  // Ordered 2x2 dither between two colors in a rect (for SNES-ish transitions).
  U.dither = function (ctx, x, y, w, h, color, phase) {
    ctx.fillStyle = color;
    for (var yy = 0; yy < h; yy++) {
      for (var xx = ((yy + (phase || 0)) & 1); xx < w; xx += 2) ctx.fillRect(x + xx, y + yy, 1, 1);
    }
  };

  // ---------- storage (safe) ----------
  NC.store = {
    get: function (k, d) {
      try { var v = localStorage.getItem('neuralclash.' + k); return v === null ? d : JSON.parse(v); }
      catch (e) { return d; }
    },
    set: function (k, v) {
      try { localStorage.setItem('neuralclash.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    }
  };

  // ---------- settings ----------
  NC.settings = NC.store.get('settings', null) || {
    difficulty: 3,     // 1..5
    rounds: 2,         // rounds to win
    timer: 99,
    crt: false,
    aspect: false,     // 8:7 stretch
    voice: true,
    music: 0.8,
    sfx: 0.9
  };
  NC.saveSettings = function () { NC.store.set('settings', NC.settings); };
})(window.NC = window.NC || {});
