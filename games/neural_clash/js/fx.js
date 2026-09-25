// Fight polish: generated impact sprites (drawn additively), per-stage lighting on the generated
// fighter sprites (ambient tint + rim light), and ambient particles for each stage.
(function (NC) {
  'use strict';
  var U = NC.U, W = NC.W, H = NC.H;
  var FX = NC.FX = {};

  // ------------------------------------------------------------------ generated effect sprites
  // Draws effect `id` centered at (x, y) in game pixels. Returns false when the art is missing so
  // callers can fall back to procedural effects.
  //   o.scale, o.rot (radians), o.alpha, o.tint (css color, for white effects), o.flip
  FX.draw = function (ctx, id, x, y, o) {
    var e = NC.Art.fx(id);
    if (!e) return false;
    o = o || {};
    var im = o.tint ? tinted(id, e, o.tint) : e.im;
    var w = e.im.width / e.k * (o.scale || 1), h = e.im.height / e.k * (o.scale || 1);
    ctx.save();
    if (e.add) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = o.alpha == null ? 1 : Math.max(0, Math.min(1, o.alpha));
    ctx.translate(x, y);
    if (o.rot) ctx.rotate(o.rot);
    if (o.flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, o.anchorBottom ? -h : -h / 2, w, h);
    ctx.restore();
    return true;
  };
  FX.has = function (id) { return !!NC.Art.fx(id); };

  var tintCache = {};
  function tinted(id, e, col) {
    var k = id + col;
    if (tintCache[k]) return tintCache[k];
    var c = U.makeCanvas(e.im.width, e.im.height), x = c.getContext('2d');
    x.drawImage(e.im, 0, 0);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    if (!e.add) { x.globalCompositeOperation = 'destination-in'; x.drawImage(e.im, 0, 0); }
    return (tintCache[k] = c);
  }

  // ------------------------------------------------------------------ stage lighting
  // amb: color the sprite is pulled toward (a = strength); rim: light-side edge glow (ra = strength);
  // dir: +1 light from screen right, -1 from the left, 0 from the stage center (vault door).
  FX.LIGHT = {
    archive:    { amb: '#3a2010', a: 0.10, rim: '#ffb050', ra: 0.55, dir: -1 },
    goldengate: { amb: '#40204a', a: 0.08, rim: '#ffa060', ra: 0.60, dir: -1 },
    stargate:   { amb: '#4a2010', a: 0.10, rim: '#ff9040', ra: 0.60, dir: -1 },
    launch:     { amb: '#101848', a: 0.14, rim: '#c8e0ff', ra: 0.60, dir: 1 },
    colossus:   { amb: '#0c1438', a: 0.20, rim: '#ffc060', ra: 0.55, dir: -1 },
    shoreline:  { amb: '#ffffff', a: 0.00, rim: '#fffbe8', ra: 0.35, dir: 1 },
    westlake:   { amb: '#0a1440', a: 0.20, rim: '#ff9860', ra: 0.60, dir: 1 },
    market:     { amb: '#2a1040', a: 0.16, rim: '#ff5c8a', ra: 0.55, dir: -1 },
    moon:       { amb: '#101830', a: 0.12, rim: '#a8d0ff', ra: 0.65, dir: 1 },
    vault:      { amb: '#1c0a30', a: 0.16, rim: '#ffd070', ra: 0.70, dir: 0 }
  };

  // Lit copy of a generated sprite frame; canvasDir is the light side in the frame's own
  // (unflipped) pixels. Cached on the frame object.
  FX.lit = function (fr, light, canvasDir) {
    if (!fr.k || !light) return fr;
    var key = light.amb + light.a + light.rim + light.ra + canvasDir;
    fr._lit = fr._lit || {};
    if (fr._lit[key]) return fr._lit[key];
    var src = fr.c, w = src.width, h = src.height;
    var c = U.makeCanvas(w, h), x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    if (light.a > 0) {
      x.globalCompositeOperation = 'source-atop';
      x.globalAlpha = light.a; x.fillStyle = light.amb; x.fillRect(0, 0, w, h);
      x.globalAlpha = 1;
    }
    if (light.ra > 0) {
      // rim = silhouette minus itself shifted away from the light: a band on the lit edge
      var r = U.makeCanvas(w, h), rx = r.getContext('2d');
      var band = Math.max(2, fr.k * 2);
      rx.drawImage(src, 0, 0);
      rx.globalCompositeOperation = 'source-in';
      rx.fillStyle = light.rim; rx.fillRect(0, 0, w, h);
      rx.globalCompositeOperation = 'destination-out';
      rx.drawImage(src, -canvasDir * band, Math.round(band / 2));
      x.globalCompositeOperation = 'lighter';
      x.globalAlpha = light.ra;
      x.drawImage(r, 0, 0);
      x.globalAlpha = 1;
    }
    c.k = fr.k;
    return (fr._lit[key] = { c: c, ox: fr.ox, oy: fr.oy, k: fr.k });
  };

  // ------------------------------------------------------------------ ambient particles
  var AMB = {
    archive:    { kind: 'mote', n: 26, col: ['#ffd9a0', '#ffb860'] },
    goldengate: { kind: 'mote', n: 14, col: ['#ffd0a0', '#ffffff'] },
    stargate:   { kind: 'sand', n: 40, col: ['#e8b070', '#c89050'] },
    launch:     { kind: 'confetti', n: 30, col: ['#40c8ff', '#ffe040', '#ff5c8a', '#7aff9a'], beams: true },
    colossus:   { kind: 'ember', n: 26, col: ['#ffa030', '#ff6020', '#ffe080'] },
    shoreline:  { kind: 'confetti', n: 16, col: ['#ff4040', '#40a0ff', '#ffe040', '#ffffff'] },
    westlake:   { kind: 'firefly', n: 18, col: ['#e8ff80', '#ffd060'] },
    market:     { kind: 'ember', n: 14, col: ['#ff5c8a', '#ffd060'] },
    moon:       { kind: 'moondust', n: 22, col: ['#c8d0e0', '#8890a8'] },
    vault:      { kind: 'rune', n: 24, col: ['#ffd070', '#fff0b0', '#c090ff'] }
  };

  FX.ambient = function (stageId) {
    var def = AMB[stageId];
    var parts = [];
    var SW = NC.STAGE_W;
    function spawn(p, fresh) {
      p.x = Math.random() * (SW + 64) - 32;
      p.col = U.choice(def.col);
      p.ph = Math.random() * 7;
      p.front = Math.random() < 0.25;
      switch (def.kind) {
        case 'mote': case 'firefly':
          p.y = 20 + Math.random() * 150; p.vx = (Math.random() - 0.5) * 0.15; p.vy = -0.05 - Math.random() * 0.1; break;
        case 'ember':
          p.y = fresh ? Math.random() * H : H + 4; p.vx = (Math.random() - 0.3) * 0.4; p.vy = -0.4 - Math.random() * 0.7; break;
        case 'sand':
          p.y = 110 + Math.random() * 110; p.vx = 2 + Math.random() * 2.5; p.vy = (Math.random() - 0.5) * 0.2;
          if (!fresh) p.x = -20 - Math.random() * 60; break;
        case 'confetti':
          p.y = fresh ? Math.random() * H : -6; p.vx = (Math.random() - 0.5) * 0.4; p.vy = 0.3 + Math.random() * 0.4; break;
        case 'moondust':
          p.y = 150 + Math.random() * 70; p.vx = (Math.random() - 0.5) * 0.12; p.vy = -0.05 - Math.random() * 0.08; break;
        case 'rune':
          p.y = fresh ? Math.random() * H : H + 4; p.vx = (Math.random() - 0.5) * 0.2; p.vy = -0.2 - Math.random() * 0.35; break;
      }
      p.life = 300 + Math.random() * 400; p.t = 0;
      return p;
    }
    if (def) for (var i = 0; i < def.n; i++) parts.push(spawn({}, true));
    return {
      update: function () {
        if (!def) return;
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          p.t++; p.x += p.vx; p.y += p.vy;
          if (def.kind === 'firefly' || def.kind === 'mote') { p.vx += (Math.random() - 0.5) * 0.02; p.vx = U.clamp(p.vx, -0.3, 0.3); }
          if (def.kind === 'confetti') p.x += Math.sin(p.t * 0.08 + p.ph) * 0.35;
          if (def.kind === 'ember') p.x += Math.sin(p.t * 0.05 + p.ph) * 0.2;
          if (p.t > p.life || p.y < -10 || p.y > H + 10 || p.x > SW + 40 || p.x < -60) spawn(p, false);
        }
      },
      draw: function (ctx, cam, layer, t) {
        if (!def) return;
        if (def.beams && layer === 'back') drawBeams(ctx, t);
        ctx.save();
        ctx.globalCompositeOperation = def.kind === 'confetti' ? 'source-over' : 'lighter';
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i];
          if (p.front !== (layer === 'front')) continue;
          var x = p.x - cam * (p.front ? 1.15 : 0.85), y = p.y;
          if (x < -8 || x > W + 8) continue;
          var fade = Math.min(1, p.t / 40, (p.life - p.t) / 40);
          switch (def.kind) {
            case 'mote': case 'moondust':
              ctx.globalAlpha = fade * (0.35 + 0.25 * Math.sin(t * 0.05 + p.ph));
              ctx.fillStyle = p.col; ctx.fillRect(x, y, p.front ? 1.5 : 1, p.front ? 1.5 : 1); break;
            case 'firefly':
              var glow = 0.5 + 0.5 * Math.sin(t * 0.07 + p.ph);
              ctx.globalAlpha = fade * glow * 0.9; ctx.fillStyle = p.col; ctx.fillRect(x - 0.5, y - 0.5, 1.5, 1.5);
              ctx.globalAlpha = fade * glow * 0.25; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); break;
            case 'ember':
              ctx.globalAlpha = fade * (0.6 + 0.4 * Math.sin(t * 0.3 + p.ph)); ctx.fillStyle = p.col;
              ctx.fillRect(x, y, 1, p.front ? 2 : 1.5); break;
            case 'sand':
              ctx.globalAlpha = fade * 0.35; ctx.fillStyle = p.col; ctx.fillRect(x, y, p.front ? 6 : 4, 0.5); break;
            case 'confetti':
              ctx.globalAlpha = fade * 0.85; ctx.fillStyle = p.col;
              var fl = Math.abs(Math.sin(t * 0.12 + p.ph));
              ctx.fillRect(x, y, 2 * fl + 0.5, 2); break;
            case 'rune':
              ctx.globalAlpha = fade * (0.35 + 0.35 * Math.sin(t * 0.06 + p.ph)); ctx.fillStyle = p.col;
              ctx.fillRect(x, y, 1, 1); ctx.fillRect(x - 1, y + 1, 3, 0.5); break;
          }
        }
        ctx.restore();
      }
    };
  };

  // sweeping concert spotlights for the launch-event stage
  function drawBeams(ctx, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var ox = 40 + i * 88, a = Math.sin(t * 0.012 + i * 2.1) * 0.35;
      var g = ctx.createLinearGradient(ox, 0, ox, 190);
      g.addColorStop(0, 'rgba(200,225,255,0.20)'); g.addColorStop(1, 'rgba(200,225,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox - 3, 0); ctx.lineTo(ox + 3, 0);
      ctx.lineTo(ox + Math.sin(a) * 190 + 26, 190); ctx.lineTo(ox + Math.sin(a) * 190 - 26, 190);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
})(window.NC = window.NC || {});
