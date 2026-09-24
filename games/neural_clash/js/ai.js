// CPU opponent. It produces the same per-frame input snapshot a human would, via a
// queue of input frames (so motion inputs are real quarter-circles), chosen by a
// utility-scored decision step that runs after a reaction delay set by difficulty.
(function (NC) {
  'use strict';
  var U = NC.U;

  var REACT = [0, 30, 22, 15, 10, 6];

  function AI(f, game, level) {
    this.f = f;
    this.game = game;
    this.level = U.clamp(level || 3, 1, 5);
    this.queue = [];
    this.wait = 30;
    this.prev = NC.Input.blank();
    this.p = f.ch.ai;
  }
  NC.AI = AI;
  var A = AI.prototype;

  // spec tokens: u d f b (relative), lp hp lk hk sp, joined with '+'. '' = neutral.
  function rep(spec, n) { var a = []; for (var i = 0; i < n; i++) a.push(spec); return a; }
  var M = {
    qcf: function (b) { return ['d', 'd+f', 'f+' + b]; },
    dp: function (b) { return ['f', 'd', 'd+f+' + b]; },
    qcb: function (b) { return ['d', 'd+b', 'b+' + b]; },
    sup: function () { return ['d', 'd+f', 'f', 'd', 'd+f', 'f+lp']; }
  };

  A.push = function (arr) { this.queue = this.queue.concat(arr); };

  A.think = function () {
    var f = this.f;
    var spec = '';
    if (this.queue.length) spec = this.queue.shift();
    else {
      if (this.wait > 0) this.wait--;
      else this.decide();
      if (this.queue.length) spec = this.queue.shift();
      else spec = this.idleSpec || '';
    }
    return this.toInput(spec);
  };

  A.toInput = function (spec) {
    var f = this.f, held = NC.Input.blank();
    spec.split('+').forEach(function (t) {
      if (t === 'u') held.up = true;
      else if (t === 'd') held.down = true;
      else if (t === 'f') { if (f.facing === 1) held.right = true; else held.left = true; }
      else if (t === 'b') { if (f.facing === 1) held.left = true; else held.right = true; }
      else if (t) held[t] = true;
    });
    // Computer Use scramble also applies to the CPU (its inputs get swapped in Fighter)
    var pressed = NC.Input.blank();
    for (var k in held) pressed[k] = held[k] && !this.prev[k];
    this.prev = held;
    return { held: held, pressed: pressed, released: {} };
  };

  A.decide = function () {
    var f = this.f, o = f.opp(), g = this.game, p = this.p, L = this.level;
    var dx = o.x - f.x, d = Math.abs(dx);
    var skill = L / 5;
    this.idleSpec = '';
    this.wait = REACT[L] + U.randInt(0, 8);

    if (!(f.canAct() || f.state === 'air')) { this.wait = 2; return; }
    if (f.state === 'air') { if (d < 60 && U.chance(0.5 * skill + 0.2)) this.push(rep('', 6).concat([U.choice(['hk', 'hp'])])); this.wait = 20; return; }

    var oppAttacking = !!(o.hb || (o.move && o.move.segPhase === 's') || (o.state === 'special' && o.sp && o.sp.type !== 'buff'));
    var oppAir = o.y < -10 && o.state !== 'fall' && o.state !== 'ko';
    var oppApproachAir = oppAir && Math.sign(o.vx) === Math.sign(-dx) && d < 110;
    var proj = null;
    for (var i = 0; i < g.projectiles.length; i++) {
      var pr = g.projectiles[i];
      if (pr.owner !== f && Math.sign(pr.vx) === Math.sign(f.x - pr.x) && Math.abs(pr.x - f.x) < 140) { proj = pr; break; }
    }
    var punish = o.state === 'dizzy' || (o.state === 'land' && o.t < 0) || (o.state === 'special' && o.sp && o.spT > 20 && o.sp.type !== 'counter');
    var meterFull = f.meter >= NC.MAX_METER;
    var spc = f.ch.specials;

    // 1. punish openings
    if (punish && d < 90) {
      if (meterFull && U.chance(0.6)) { this.push(M.sup()); return; }
      this.combo(d); return;
    }
    // 2. anti-air
    if (oppApproachAir && d < 90) {
      if (U.chance(p.antiair * (0.35 + skill * 0.6))) { this.push(U.chance(0.7) ? M.dp(U.choice(['lp', 'hp'])) : ['d+hp']); this.wait = 18; return; }
      this.push(rep('b', 18)); return;
    }
    // 3. projectile incoming
    if (proj) {
      var pd = Math.abs(proj.x - f.x);
      if (pd < 90) {
        var r = Math.random();
        if (r < 0.25 + skill * 0.25 && d < 170) { this.push(['u+f'].concat(rep('', 16), ['hk'])); return; }
        if (r < 0.55 && spc[0].type === 'projectile' && pd > 50) { this.push(M.qcf('lp')); return; }
        this.push(rep(proj.low ? 'd+b' : 'b', 22)); return;
      }
    }
    // 4. opponent attacking close: block or counter
    if (oppAttacking && d < 100) {
      if (spc[3] && spc[3].type === 'counter' && U.chance(0.25 * skill)) { this.push(M.qcf('lk')); return; }
      if (spc[2] && spc[2].type === 'barrier' && U.chance(0.3 * skill)) { this.push(M.qcb('lk')); return; }
      if (U.chance(0.25 + 0.13 * L)) { this.push(rep(o.move && o.move.def.crouch ? 'd+b' : 'b', 16)); return; }
    }
    // 5. super when it will likely connect
    if (meterFull && d < 120 && U.chance(0.12 + 0.05 * L)) { this.push(M.sup()); return; }

    // 6. neutral game by personality
    var style = p.style;
    var zoneWant = p.zoning, agg = p.aggression;
    if (d > 150) {
      var z = Math.random();
      if (z < zoneWant * 0.55) { this.useSpecial(0); return; }
      if (style === 'brawler' && z < 0.7 && spc[3] && spc[3].type === 'buff' && !f.fx.buff) { this.push(M.qcf('lk')); return; }
      if (style === 'thinker' && z < 0.65 && spc[3] && spc[3].type === 'charge') { this.push(M.qcf('lk').concat(rep('lk', 40 + U.randInt(0, 50)))); return; }
      if (z < 0.2 && spc[2] && spc[2].type === 'teleport') { this.push(M.qcb('lk')); return; }
      if (z < 0.25 && spc[2] && (spc[2].type === 'drop' || spc[2].type === 'summon')) { this.push(M.qcb('lk')); return; }
      this.push(rep('f', 14 + U.randInt(0, 20)));
      return;
    }
    if (d > 80) {
      var q = Math.random();
      if (q < agg * 0.3) { this.push(['u+f'].concat(rep('', 14 + U.randInt(0, 6)), [U.choice(['hk', 'hp', 'lk'])])); return; }
      if (q < agg * 0.3 + zoneWant * 0.3) { this.useSpecial(U.chance(0.6) ? 0 : 2); return; }
      if (q < 0.75) { this.push(rep('f', 10 + U.randInt(0, 14))); return; }
      if (style === 'brawler' && spc[2].type === 'charge') { this.push(M.qcb('lk').concat(rep('lk', 20 + U.randInt(0, 60)))); return; }
      this.push(rep(U.chance(zoneWant) ? 'b' : '', 12));
      return;
    }
    // close range
    var c = Math.random();
    if (d < 34 && c < 0.12 + 0.03 * L) { this.push(['f+hp']); return; }
    if (c < 0.45 + agg * 0.2) { this.combo(d); return; }
    if (c < 0.6 && spc[3] && spc[3].type === 'grab') { this.push(M.qcf('lk')); return; }
    if (c < 0.7) { this.push(['d+lk']); return; }
    if (c < 0.8 && zoneWant > 0.5) { this.push(rep('b', 14)); return; }
    this.push(rep('b', 10));
  };

  A.useSpecial = function (idx) {
    var sp = this.f.ch.specials[idx];
    if (!sp) return;
    var btn = U.choice(['lp', 'hp']);
    if (idx === 0) this.push(M.qcf(btn));
    else if (idx === 1) this.push(M.dp(btn));
    else if (idx === 2) { this.push(M.qcb(U.choice(['lk', 'hk']))); if (sp.type === 'charge') this.push(rep('lk', 30 + U.randInt(0, 50))); }
    else if (idx === 3) { this.push(M.qcf(U.choice(['lk', 'hk']))); if (sp.type === 'charge') this.push(rep('lk', 30 + U.randInt(0, 60))); }
  };

  A.combo = function (d) {
    var L = this.level, sp = this.f.ch.specials;
    var r = Math.random();
    if (L <= 1) { this.push([U.choice(['lp', 'lk', 'hp', 'd+lk'])]); return; }
    if (r < 0.3) {
      // low chain into a special
      this.push(['d+lk'].concat(rep('d', 7), ['d+lk'], rep('d', 4)));
      if (L >= 3) this.push(M.qcf(U.choice(['lp', 'hp'])));
    } else if (r < 0.55) {
      this.push(['lp', '', '', '', '', '', 'lp'].concat(rep('', 5)));
      if (L >= 3) this.push(M.dp('hp'));
    } else if (r < 0.75) {
      this.push(['hp'].concat(rep('', 7)));
      if (L >= 2) this.push(M.qcf('hp'));
    } else if (r < 0.88) {
      this.push(['d+hk']);
    } else {
      this.push(['hk']);
    }
  };
})(window.NC = window.NC || {});
