// Fighter: state machine, motion-input reading, normals, specials, supers.
// World space: x across the stage, y = 0 on the ground and negative in the air.
(function (NC) {
  'use strict';
  var U = NC.U;

  var GRAV = 0.42;
  var MAX_METER = 300;
  var DIZZY_AT = 560;

  // Motion inputs as numpad directions relative to facing (6 = forward).
  var MOTIONS = {
    qcf: [2, 3, 6],
    qcb: [2, 1, 4],
    dp: [6, 2, 3],
    super: [2, 3, 6, 2, 3, 6]
  };

  function Fighter(charId, costume, side, game) {
    this.ch = NC.CHAR[charId];
    this.ci = costume || 0;
    this.side = side;
    this.game = game;
    this.s = this.ch.look.body.s || 1;
    this.stats = this.ch.stats;
    this.hist = [];
    this.inp = { held: NC.Input.blank(), pressed: NC.Input.blank(), released: NC.Input.blank() };
    this.meter = 0;
    this.wins = 0;
    this.resetRound(side === 0 ? NC.STAGE_W / 2 - 60 : NC.STAGE_W / 2 + 60);
  }
  NC.Fighter = Fighter;
  var F = Fighter.prototype;

  F.resetRound = function (x) {
    this.x = x; this.y = 0; this.vx = 0; this.vy = 0;
    this.facing = this.side === 0 ? 1 : -1;
    this.hp = 1000; this.dispHp = 1000;
    this.stun = 0; this.stunDecay = 0;
    this.usage = 100; this.lockout = 0;
    this.state = 'idle'; this.t = 0;
    this.move = null; this.sp = null;
    this.hb = null; this.invuln = 0; this.armor = 0;
    this.combo = 0; this.comboDmg = 0;
    this.hitstun = 0; this.blockstun = 0;
    this.fx = { glue: 0, scramble: 0, invisible: 0, barrier: 0, buff: null, buffT: 0, flash: 0 };
    this.pose = 'idle0';
    this.poseMode = null;
    this.alpha = 1;
    this.label = null;
    this.hist.length = 0;
    this.super = null;
    this.frozen = false;
  };

  // ---------------------------------------------------------------- input
  F.setInput = function (inp) {
    var h = inp.held, p = inp.pressed;
    if (this.fx.scramble > 0) { // Computer Use: left and right are hijacked
      h = Object.assign({}, h); p = Object.assign({}, p);
      var t = h.left; h.left = h.right; h.right = t;
      t = p.left; p.left = p.right; p.right = t;
    }
    this.inp = { held: h, pressed: p, released: inp.released || {} };
    var d = this.dirOf(h);
    this.hist.push({ d: d, p: p.lp || p.hp, k: p.lk || p.hk });
    if (this.hist.length > 40) this.hist.shift();
  };
  F.dirOf = function (h) {
    var fwd = this.facing === 1 ? h.right : h.left;
    var back = this.facing === 1 ? h.left : h.right;
    var v = h.up ? 1 : h.down ? -1 : 0;
    var x = fwd && !back ? 1 : back && !fwd ? -1 : 0;
    return [[1, 2, 3], [4, 5, 6], [7, 8, 9]][v + 1][x + 1];
  };
  F.dir = function () { return this.hist.length ? this.hist[this.hist.length - 1].d : 5; };
  F.holdingBack = function () { var d = this.dir(); return d === 4 || d === 1 || d === 7; };
  F.holdingDown = function () { var d = this.dir(); return d === 1 || d === 2 || d === 3; };

  function motion(hist, seq, win) {
    var i = seq.length - 1, n = 0;
    for (var k = hist.length - 1; k >= 0 && n < win; k--, n++) {
      var d = hist[k].d;
      if (d === seq[i]) { i--; if (i < 0) return true; }
    }
    return false;
  }

  // Returns {idx, strength, ex} for a special, 'super', or null.
  F.readSpecial = function () {
    var p = this.inp.pressed, h = this.inp.held;
    var punch = p.lp || p.hp, kick = p.lk || p.hk;
    var sp = this.ch.specials;
    // Easy special button: direction picks the move; HP + SP = super.
    if (p.sp || (p.hp && h.sp)) {
      if ((h.hp || p.hp) && this.meter >= MAX_METER) return { idx: 'super' };
      var d = this.dir();
      var idx = d === 6 || d === 9 || d === 3 ? 1 : d === 4 || d === 7 || d === 1 ? 2 : d === 2 ? 3 : 0;
      return { idx: idx, strength: 0, btn: idx >= 2 ? 'k' : 'p' };
    }
    if (!punch && !kick) return null;
    var ex = this.meter >= 100 && ((p.lp && (p.hp || h.hp)) || (p.hp && h.lp) || (p.lk && (p.hk || h.hk)) || (p.hk && h.lk));
    var strength = (p.hp || p.hk) ? 1 : 0;
    if (punch && this.meter >= MAX_METER && motion(this.hist, MOTIONS.super, 30)) return { idx: 'super' };
    if (punch && motion(this.hist, MOTIONS.dp, 16)) return { idx: 1, strength: strength, ex: ex, btn: 'p' };
    if (punch && motion(this.hist, MOTIONS.qcf, 16)) return { idx: 0, strength: strength, ex: ex, btn: 'p' };
    if (kick && motion(this.hist, MOTIONS.qcb, 16)) return { idx: 2, strength: strength, ex: ex, btn: 'k' };
    if (kick && motion(this.hist, MOTIONS.qcf, 16) && sp[3]) return { idx: 3, strength: strength, ex: ex, btn: 'k' };
    return null;
  };

  // ---------------------------------------------------------------- helpers
  F.opp = function () { return this.game.fighters[1 - this.side]; };
  F.grounded = function () { return this.y >= 0; };
  F.speed = function () {
    var s = this.stats.speed;
    if (this.fx.buff === 'speed') s *= 1.3;
    if (this.fx.glue > 0) s *= 0.5;
    return s;
  };
  F.power = function () { return this.stats.power * (this.fx.buff === 'power' ? 1.25 : 1); };
  F.setState = function (st) { this.state = st; this.t = 0; };
  F.toIdle = function () {
    this.move = null; this.sp = null; this.hb = null; this.armor = 0;
    this.setState(this.y < 0 ? 'air' : (this.holdingDown() ? 'crouch' : 'idle'));
  };
  F.canAct = function () { return this.state === 'idle' || this.state === 'walk' || this.state === 'crouch'; };
  F.addMeter = function (v) { this.meter = U.clamp(this.meter + v, 0, MAX_METER); };
  F.say = function (text, color, big) { this.game.popText(this, text, color, big); };
  F.faceOpp = function () {
    var o = this.opp();
    if (Math.abs(o.x - this.x) > 2) this.facing = o.x > this.x ? 1 : -1;
  };

  F.hurtbox = function () {
    var s = this.s;
    if (this.state === 'down' || this.state === 'getup' || this.state === 'ko' || this.state === 'thrown') return null;
    if (this.state === 'special' && this.sp && this.sp.type === 'teleport' && this.spT >= this.sp.startup && this.spT < this.sp.startup + this.sp.vanish) return null;
    var h = 80 * s, w = 24 * s;
    var crouch = this.state === 'crouch' || this.pose === 'crouch' || this.pose === 'blockLow' || (this.move && this.move.def.crouch) || this.pose === 'chk1' || this.pose === 'clk';
    if (crouch) h = 54 * s;
    if (this.pose === 'fall') return { x: this.x - 20 * s, y: this.y - 40 * s, w: 40 * s, h: 30 * s };
    var y = this.y - h;
    if (this.state === 'air' || this.state === 'jump') { y = this.y - 70 * s; h = 56 * s; }
    return { x: this.x - w / 2, y: y, w: w, h: h };
  };
  F.worldBox = function (b) {
    var s = this.s;
    var x = this.facing === 1 ? this.x + b.x * s : this.x - (b.x + b.w) * s;
    return { x: x, y: this.y + b.y * s, w: b.w * s, h: b.h * s };
  };

  // ---------------------------------------------------------------- update
  F.update = function () {
    var g = this.game;
    this.t++;
    if (this.invuln > 0) this.invuln--;
    for (var k in this.fx) if (typeof this.fx[k] === 'number' && this.fx[k] > 0) this.fx[k]--;
    if (this.fx.buffT > 0 && --this.fx.buffT === 0) this.fx.buff = null;
    if (this.lockout > 0) this.lockout--;
    if (this.ch.usageLimit && this.usage < 100) this.usage = Math.min(100, this.usage + 0.09);
    if (this.stunDecay > 0) this.stunDecay--; else this.stun = Math.max(0, this.stun - 3);
    this.dispHp += (this.hp - this.dispHp) * 0.06;
    if (Math.abs(this.dispHp - this.hp) < 1) this.dispHp = this.hp;
    this.alpha = this.fx.invisible > 0 ? ((NC.frame & 3) ? 0.25 : 0.5) : 1;
    this.poseMode = this.fx.flash > 0 ? 'flash' : null;

    var st = this.state;
    var h = this.inp.held, p = this.inp.pressed;
    var grav = GRAV * g.gravity;

    // global: special/super read (only from neutral-ish states or cancels)
    if (this.canAct() || (st === 'jumpsquat')) {
      if (this.tryThrow()) return;
      if (this.trySpecial()) return;
    } else if (st === 'attack' && this.move && this.move.def.cancel && this.move.connected && this.move.cancelWindow > 0) {
      if (this.trySpecial()) return;
      // chain light normals
      if ((p.lp || p.lk) && this.move.segPhase !== 's') { if (this.tryNormal()) return; }
    }

    switch (st) {
      case 'intro':
        this.pose = (this.t >> 4) & 1 ? 'taunt' : 'idle0';
        break;
      case 'idle':
      case 'walk':
      case 'crouch':
        this.faceOpp();
        if (this.tryNormal()) return;
        if (h.up) { this.setState('jumpsquat'); this.jumpDir = this.dir(); break; }
        var d = this.dir();
        if (h.down) {
          this.state = 'crouch';
          this.vx = 0;
          this.pose = (d === 1 && this.threatened()) ? 'blockLow' : 'crouch';
        } else if (d === 6) {
          this.state = 'walk';
          this.vx = 1.7 * this.speed() * this.facing;
          this.walkT = (this.walkT || 0) + 1;
          this.pose = 'walk' + ((this.walkT / 7 | 0) & 3);
        } else if (d === 4) {
          if (this.threatened()) { this.vx = 0; this.pose = 'block'; }
          else {
            this.state = 'walk';
            this.vx = -1.35 * this.speed() * this.facing;
            this.walkT = (this.walkT || 0) + 1;
            this.pose = 'walk' + (3 - ((this.walkT / 8 | 0) & 3));
          }
        } else {
          this.state = 'idle';
          this.vx = 0;
          var ph = (NC.frame / 10 | 0) % 4;
          this.pose = ['idle0', 'idle1', 'idle2', 'idle1'][ph];
        }
        break;
      case 'jumpsquat':
        this.pose = 'land';
        this.vx = 0;
        if (this.t >= 3) {
          var jd = this.dir();
          var jx = (jd === 9 ? 1 : jd === 7 ? -1 : this.jumpDir === 9 ? 1 : this.jumpDir === 7 ? -1 : 0);
          this.vx = jx * 2.6 * Math.min(1.2, this.speed()) * this.facing;
          this.vy = -8.6 * this.stats.jump * (this.fx.glue > 0 ? 0.75 : 1) * Math.sqrt(g.gravity);
          this.y = -1;
          this.setState('air');
          NC.Audio.sfx('jump');
        }
        break;
      case 'air':
        this.vy += grav;
        this.pose = this.vy < -2 ? 'jumpUp' : this.vy < 2.5 ? 'jumpTuck' : 'jumpDown';
        if (this.tryNormal()) break;
        break;
      case 'land':
        this.pose = 'land';
        this.vx = 0;
        if (this.t >= 4) this.toIdle();
        break;
      case 'attack':
        this.updateMove();
        break;
      case 'special':
        this.updateSpecial();
        break;
      case 'hitstun':
        this.pose = this.hitPose || 'hitHigh';
        this.vx *= 0.82;
        if (--this.hitstun <= 0) this.recoverFromHit();
        break;
      case 'blockstun':
        this.pose = this.blockPose || 'block';
        this.vx *= 0.8;
        if (--this.blockstun <= 0) this.toIdle();
        break;
      case 'fall':
        this.vy += grav;
        this.pose = 'fall';
        break;
      case 'down':
        this.pose = 'lying';
        this.vx *= 0.8;
        if (this.t >= 34) { this.setState('getup'); }
        break;
      case 'getup':
        this.pose = 'getup';
        this.invuln = 4;
        if (this.t >= 14) { this.combo = 0; this.toIdle(); this.invuln = 6; }
        break;
      case 'dizzy':
        this.pose = (this.t >> 4) & 1 ? 'dizzy0' : 'dizzy1';
        if (p.lp || p.hp || p.lk || p.hk || p.left || p.right) this.dizzyT -= 4;
        if (--this.dizzyT <= 0) { this.stun = 0; this.toIdle(); }
        break;
      case 'thrown':
        this.pose = this.t < 12 ? 'hitGut' : 'fall';
        break;
      case 'throwing':
        this.pose = this.t < 10 ? 'throw0' : 'throw1';
        if (this.t >= 28) this.toIdle();
        break;
      case 'ko':
        this.vy += grav;
        this.pose = this.y < 0 ? 'fall' : 'lying';
        this.vx *= this.y < 0 ? 1 : 0.85;
        break;
      case 'win':
        this.pose = (this.t >> 4) & 1 ? 'win1' : 'win0';
        this.vx = 0;
        break;
      case 'lose':
        this.pose = 'lose';
        this.vx = 0;
        break;
    }

    // physics
    this.x += this.vx;
    this.y += this.vy;
    if (this.y >= 0 && (this.state === 'air' || this.state === 'fall' || this.state === 'ko' || (this.state === 'attack' && this.move && this.move.def.air) || (this.state === 'special' && this.sp && this.spAir))) {
      this.land();
    }
    if (this.y > 0) this.y = 0;
    if (this.state !== 'air' && this.state !== 'fall' && this.state !== 'ko' && !(this.state === 'special' && this.spAir) && !(this.state === 'attack' && this.move && this.move.def.air)) { this.vy = 0; }
  };

  F.land = function () {
    this.y = 0;
    this.airAttacked = false;
    var st = this.state;
    if (st === 'fall') {
      this.vy = 0; this.vx *= 0.3;
      NC.Audio.sfx('thud'); this.game.shake(3); this.game.dust(this.x, 8);
      this.setState('down'); this.hb = null;
      return;
    }
    if (st === 'ko') {
      if (this.vy > 3) { this.vy = -this.vy * 0.35; this.y = -1; NC.Audio.sfx('thud'); this.game.shake(4); this.game.dust(this.x, 10); return; }
      this.vy = 0;
      return;
    }
    this.vy = 0; this.vx = 0;
    if (st === 'special') { this.spAir = false; this.hb = null; this.sp = null; this.setState('land'); this.t = -6; return; }
    this.hb = null; this.move = null;
    this.setState('land');
    NC.Audio.sfx('land');
  };

  F.threatened = function () {
    var o = this.opp(), g = this.game;
    var dx = Math.abs(o.x - this.x);
    if ((o.hb || (o.move && o.move.segPhase === 's') || (o.state === 'special' && o.sp)) && dx < 110) return true;
    for (var i = 0; i < g.projectiles.length; i++) {
      var pr = g.projectiles[i];
      if (pr.owner !== this && Math.abs(pr.x - this.x) < 90) return true;
    }
    for (i = 0; i < g.minions.length; i++) if (g.minions[i].owner !== this && Math.abs(g.minions[i].x - this.x) < 80) return true;
    if (g.beam && g.beam.owner !== this) return true;
    return false;
  };

  // ---------------------------------------------------------------- normals
  F.tryNormal = function () {
    var p = this.inp.pressed;
    var btn = p.hk ? 'hk' : p.hp ? 'hp' : p.lk ? 'lk' : p.lp ? 'lp' : null;
    if (!btn) return false;
    var name;
    if (this.state === 'air' || this.y < 0) {
      if (this.airAttacked) return false;
      name = 'j' + btn;
      this.airAttacked = true;
    } else name = (this.holdingDown() ? 'c' : '') + btn;
    var def = NC.NORMALS[name];
    if (!def) return false;
    this.startMove(def);
    return true;
  };
  F.startMove = function (def) {
    var wasAir = this.y < 0;
    this.move = { def: def, seg: 0, segT: 0, connected: false, cancelWindow: 0, segPhase: def.seq[0][2] };
    this.hb = null;
    if (!wasAir) this.vx = 0;
    this.setState('attack');
    this.pose = def.seq[0][0];
    if (def.sfx) NC.Audio.sfx(def.sfx);
  };
  F.updateMove = function () {
    var m = this.move, def = m.def;
    if (def.air) { this.vy += GRAV * this.game.gravity; }
    var seg = def.seq[m.seg];
    this.pose = seg[0];
    m.segPhase = seg[2];
    if (seg[2] === 'a' && !m.connected) {
      var hit = Object.assign({}, def.hit);
      hit.dmg = hit.dmg * this.power();
      this.hb = { box: hit, multi: 0, hits: 1, juggle: false, id: this.game.nextId++ };
    } else if (seg[2] !== 'a') this.hb = null;
    if (m.cancelWindow > 0) m.cancelWindow--;
    if (++m.segT >= seg[1]) {
      m.seg++; m.segT = 0;
      if (m.seg >= def.seq.length) {
        this.airAttacked = this.y < 0;
        this.move = null; this.hb = null;
        if (this.y < 0) this.setState('air'); else this.toIdle();
      }
    }
  };

  // ---------------------------------------------------------------- throws
  F.tryThrow = function () {
    var p = this.inp.pressed, o = this.opp();
    if (!p.hp || this.y < 0) return false;
    var d = this.dir();
    if (d !== 6 && d !== 4) return false;
    if (Math.abs(o.x - this.x) > 34 * Math.max(this.s, 1) || o.y < 0 || o.invuln > 0) return false;
    if (!(o.state === 'idle' || o.state === 'walk' || o.state === 'crouch' || (o.state === 'attack' && o.move && o.move.segPhase === 'r'))) return false;
    this.setState('throwing');
    this.hb = null;
    o.setState('thrown');
    o.move = null; o.hb = null;
    this.throwBack = d === 4;
    this.game.throwPair = { a: this, b: o, t: 0 };
    NC.Audio.sfx('grab');
    return true;
  };

  // ---------------------------------------------------------------- specials
  F.trySpecial = function () {
    var r = this.readSpecial();
    if (!r) return false;
    if (r.idx === 'super') return this.startSuper();
    var sp = this.ch.specials[r.idx];
    if (!sp) return false;
    if (this.ch.usageLimit) {
      if (this.lockout > 0 || this.usage < 25) {
        if (this.lockout <= 0) { this.lockout = 180; this.say('USAGE LIMIT REACHED', '#ff6060'); this.game.popText(this, 'RETURN IN 4H 51M', '#ffb0b0', false, 12); NC.Audio.sfx('denied'); }
        return false;
      }
      this.usage -= 25;
    }
    if (r.ex) { this.addMeter(-100); this.say('EX ' + sp.name, '#ffe060'); }
    this.startSpecial(sp, r.strength || 0, r.ex, r.btn);
    return true;
  };

  F.startSpecial = function (sp, strength, ex, btn) {
    this.sp = sp; this.spT = 0; this.spStr = strength; this.spEx = !!ex; this.spBtn = btn;
    this.spAir = false; this.spHits = 0; this.spDone = false;
    this.hb = null; this.move = null;
    this.vx = 0;
    this.setState('special');
    this.faceOpp();
    this.addMeter(6);
    if (sp.text && !ex) this.say(sp.text, this.ch.costumes[this.ci].pal.glow);
    var type = SPECIALS[sp.type];
    if (type && type.start) type.start(this, sp);
  };

  F.updateSpecial = function () {
    var sp = this.sp;
    if (!sp) { this.toIdle(); return; }
    this.spT++;
    var type = SPECIALS[sp.type];
    type.update(this, sp, this.spT);
  };
  F.spDmg = function (base) { return base * this.power() * (this.spStr ? 1.15 : 1) * (this.spEx ? 1.4 : 1); };
  F.endSpecial = function () { this.sp = null; this.hb = null; this.armor = 0; this.toIdle(); };

  // Each special type: start(f, sp), update(f, sp, t)
  var SPECIALS = {
    projectile: {
      update: function (f, sp, t) {
        var st = sp.startup;
        f.pose = t < st ? 'castPrep' : 'cast';
        if (t === st) {
          var pr = sp.proj;
          if (f.copied) pr = f.copied;
          var count = pr.count || 1;
          for (var i = 0; i < count; i++) {
            f.game.spawnProjectile(f, pr, i, f.spStr, f.spEx);
          }
          NC.Audio.sfx('fire');
        }
        if (t >= st + sp.recovery) { f.copied = null; f.endSpecial(); }
      }
    },
    copy: { // Qwen: fires the opponent's S1 projectile
      update: function (f, sp, t) {
        if (t === 1) {
          var o = f.opp(), src = o.ch.specials[0];
          f.copied = src && src.type === 'projectile' ? Object.assign({}, src.proj, { tint: '#c8a8ff' }) : NC.CHAR.qwen.specials[0].proj;
          f.game.popText(f, 'COPIED: ' + (src ? src.name : '???'), '#e0c8ff', false, 12);
        }
        SPECIALS.projectile.update(f, { startup: sp.startup, recovery: sp.recovery, proj: f.copied }, t);
      }
    },
    rising: {
      start: function (f, sp) { f.invuln = sp.invuln + (f.spEx ? 6 : 0); f.armor = sp.armor || 0; },
      update: function (f, sp, t) {
        if (t < sp.startup) { f.pose = 'rise0'; return; }
        if (t === sp.startup) {
          f.vy = sp.vy * (f.spStr ? 1.1 : 1); f.vx = sp.vx * f.facing * (f.spStr ? 1.2 : 1);
          f.y = -1; f.spAir = true;
          f.hb = { box: { x: 0, y: -96, w: 30, h: 60, dmg: f.spDmg(sp.dmg), stun: 22, bstun: 14, push: 4, lvl: 'mid', kd: true, launch: true }, hits: sp.hits || 1, juggle: true, id: f.game.nextId++ };
          NC.Audio.sfx('whiffH');
          f.game.fxTrail(f, sp.fx);
        }
        if (t > sp.startup) {
          f.vy += GRAV * f.game.gravity;
          f.pose = f.vy < 0 ? 'rise1' : 'jumpDown';
          if (f.vy > -1) f.hb = null;
          if (t % 3 === 0 && f.vy < 0) f.game.fxTrail(f, sp.fx);
        }
      }
    },
    spin: {
      start: function (f, sp) { f.invuln = sp.invuln; },
      update: function (f, sp, t) {
        if (t < sp.startup) { f.pose = 'spin0'; return; }
        var k = t - sp.startup;
        f.pose = (k >> 2) & 1 ? 'spin1' : 'spin0';
        f.vx = sp.vx * f.facing * (f.spStr ? 1.3 : 1);
        if (k % 9 === 0 && f.spHits < sp.hits) {
          f.hb = { box: { x: -34, y: -70, w: 68, h: 30, dmg: f.spDmg(sp.dmg), stun: 14, bstun: 10, push: 2, lvl: 'high', kd: f.spHits === sp.hits - 1 }, hits: 1, juggle: true, id: f.game.nextId++, both: true };
          f.spHits++;
          NC.Audio.sfx('whiffH');
        }
        if (k % 4 === 0) f.game.smoke(f.x - f.facing * 14, -40);
        if (k >= sp.dur) { f.vx = 0; f.endSpecial(); }
      }
    },
    rush: {
      start: function (f, sp) { f.armor = sp.armor || 0; if (f.spEx) f.invuln = 10; },
      update: function (f, sp, t) {
        if (t < sp.startup) { f.pose = 'castPrep'; return; }
        var k = t - sp.startup;
        f.pose = sp.pose || 'dash';
        f.vx = sp.speed * f.facing * (f.spStr ? 1.15 : 1);
        var interval = Math.max(4, Math.floor(sp.dur / (sp.hits || 1)));
        if (k % interval === 0 && f.spHits < (sp.hits || 1)) {
          f.hb = { box: { x: 0, y: -66, w: 34, h: 40, dmg: f.spDmg(sp.dmg), stun: 16, bstun: 10, push: sp.pass ? 0 : 2, lvl: 'mid', kd: f.spHits === (sp.hits || 1) - 1 && !sp.pass }, hits: 1, id: f.game.nextId++ };
          f.spHits++;
        }
        if (k === 0) NC.Audio.sfx('dash');
        if (k % 3 === 0) f.game.afterimage(f, sp.afterimages ? sp.afterimages[Math.min(2, (k / 8) | 0)] : null);
        if (sp.label && k % 8 === 4) f.game.popText(f, sp.label, '#40ff80', false, 20);
        if (sp.pass) f.passThrough = true;
        if (k >= sp.dur) { f.vx = 0; f.passThrough = false; f.endSpecial(); f.setState('land'); f.t = -8; }
      }
    },
    teleport: {
      update: function (f, sp, t) {
        f.pose = 'counter';
        if (t < sp.startup) return;
        if (t === sp.startup) { NC.Audio.sfx('teleport'); f.game.sparkle(f.x, -40, '#ffffff'); f.invuln = sp.vanish + 4; }
        if (t < sp.startup + sp.vanish) { f.alpha = 0; return; }
        if (t === sp.startup + sp.vanish) {
          var o = f.opp();
          var nx = sp.where === 'behind' ? o.x - o.facing * 36 : o.x + o.facing * 60;
          f.x = U.clamp(nx, 20, NC.STAGE_W - 20);
          f.faceOpp();
          f.game.sparkle(f.x, -40, '#ffffff');
          if (sp.rare && U.chance(0.12)) f.say(sp.rare, '#ff80ff', true);
        }
        f.pose = 'taunt';
        if (t >= sp.startup + sp.vanish + sp.recovery) f.endSpecial();
      }
    },
    counter: {
      update: function (f, sp, t) {
        f.pose = 'counter';
        f.countering = t <= sp.window;
        f.poseMode = f.countering && (t & 2) ? 'gold' : f.poseMode;
        if (f.counterHit) {
          f.countering = false;
          if (f.counterHit === 1) {
            f.counterHit = 2; f.counterT = 0;
            NC.Audio.sfx('parry');
            if (sp.ghost) f.game.ghost(f, sp.ghost);
            if (sp.onHit) f.say(sp.onHit, '#ffffff', true);
            f.game.hitstop = 14;
          }
          f.counterT++;
          f.pose = f.counterT < 6 ? 'counter' : 'hp1';
          if (f.counterT === 6) {
            var o = f.opp();
            if (Math.abs(o.x - f.x) < 90 && o.y > -60) {
              f.x = o.x - f.facing * 30;
              f.game.applyHit(f, o, { dmg: f.spDmg(sp.dmg), stun: 26, bstun: 0, push: 6, lvl: 'mid', kd: true, unblockable: true }, true);
            }
          }
          if (f.counterT >= 22) { f.counterHit = 0; f.endSpecial(); }
          return;
        }
        if (t >= sp.window + sp.recovery) f.endSpecial();
      }
    },
    grab: {
      update: function (f, sp, t) {
        f.pose = t < sp.startup ? 'castPrep' : 'grab';
        if (t === sp.startup) {
          var o = f.opp();
          var reach = sp.range * f.s;
          if (Math.abs(o.x - f.x) <= reach && o.y >= 0 && o.invuln <= 0 && o.hurtbox() && o.state !== 'thrown') {
            f.grabbed = true;
            o.setState('thrown'); o.move = null; o.hb = null; o.sp = null;
            f.game.throwPair = { a: f, b: o, t: 0, dmg: f.spDmg(sp.dmg), effect: sp.effect, text: sp.effectText, special: true };
            NC.Audio.sfx('grab');
          } else f.grabbed = false;
        }
        if (t > sp.startup && f.grabbed) { f.pose = t - sp.startup < 12 ? 'grab' : 'throw1'; if (t >= sp.startup + (sp.recovery || 28)) { f.grabbed = false; f.endSpecial(); } }
        else if (t > sp.startup + sp.whiff) f.endSpecial();
      }
    },
    buff: {
      update: function (f, sp, t) {
        if (sp.kind === 'invisible') {
          f.pose = 'think';
          if (t === sp.startup) {
            f.fx.invisible = sp.dur;
            f.game.researcher(f);
            NC.Audio.sfx('teleport');
          }
          if (t >= sp.startup + sp.recovery) f.endSpecial();
          return;
        }
        // Grok: checks with the boss for a random buff
        f.pose = 'think';
        if (t % 12 === 0 && t < sp.startup) f.game.popText(f, ['SEARCHING X...', 'READING REPLIES...', "WHAT DOES THE BOSS THINK?"][(t / 12 | 0) % 3], '#a0c0ff', false, 10);
        if (t === sp.startup) {
          var r = U.choice(['power', 'speed', 'par', 'power']);
          if (r === 'par') { f.say('ROUGHLY ON PAR', '#c0c0c0', true); NC.Audio.sfx('denied'); }
          else { f.fx.buff = r; f.fx.buffT = sp.dur; f.say(r === 'power' ? 'BOSS SAYS: POWER UP' : 'BOSS SAYS: SPEED UP', '#ff6060', true); NC.Audio.sfx('powerup'); }
        }
        if (t >= sp.startup + sp.recovery) f.endSpecial();
      }
    },
    summon: {
      update: function (f, sp, t) {
        f.pose = t < sp.startup ? 'castPrep' : 'cast';
        if (t === sp.startup) { f.game.spawnMinion(f, sp.minion.kind, { vx: sp.minion.vx, dmg: f.spDmg(sp.minion.dmg), life: sp.minion.life }); NC.Audio.sfx('powerup'); }
        if (t >= sp.startup + sp.recovery) f.endSpecial();
      }
    },
    drop: {
      update: function (f, sp, t) {
        f.pose = t < sp.startup ? 'castPrep' : 'raise';
        if (t === sp.startup) { f.game.spawnDrop(f, sp.obj, f.spDmg(sp.obj.dmg)); }
        if (t >= sp.startup + sp.recovery) f.endSpecial();
      }
    },
    barrier: {
      update: function (f, sp, t) {
        f.pose = 'counter';
        if (t === 1) { f.fx.barrier = sp.dur; NC.Audio.sfx('parry'); }
        if (t >= sp.dur + sp.recovery) f.endSpecial();
      }
    },
    charge: {
      start: function (f) { f.chargeT = 0; f.chargeHeld = true; f.chargeStage = -1; },
      update: function (f, sp, t) {
        var h = f.inp.held;
        var holding = f.spBtn === 'p' ? (h.lp || h.hp || h.sp) : (h.lk || h.hk || h.sp);
        if (f.chargeHeld) {
          f.pose = sp.think ? 'think' : 'charge';
          f.chargeT++;
          if (sp.meterGain) f.addMeter(sp.meterGain);
          var stage = Math.min(sp.stages.length - 2, Math.floor(f.chargeT / (sp.max / (sp.stages.length - 1))));
          if (stage !== f.chargeStage) { f.chargeStage = stage; f.game.popText(f, sp.stages[stage], sp.think ? '#7ad0ff' : '#ff9040', false, 16); NC.Audio.sfx('charge'); }
          if (f.chargeT % 4 === 0) f.game.chargeFx(f);
          if ((!holding && f.chargeT >= sp.min) || f.chargeT >= sp.max) {
            f.chargeHeld = false;
            f.chargeLevel = f.chargeT / sp.max;
            f.spT = 0;
            if (f.chargeT >= sp.max) f.game.popText(f, sp.stages[sp.stages.length - 1], '#ffffff', true);
            if (sp.armorAt && f.chargeT >= sp.armorAt) f.armor = 1;
            NC.Audio.sfx('dash');
          }
          return;
        }
        // release: lunge
        f.pose = 'hp1';
        var dur = 16;
        f.vx = sp.speed * f.facing * (0.6 + f.chargeLevel * 0.6);
        if (t === 1) f.hb = { box: { x: 0, y: -70, w: 36, h: 40, dmg: f.spDmg(U.lerp(sp.dmgMin, sp.dmgMax, f.chargeLevel)), stun: 24, bstun: 14, push: 6, lvl: 'mid', kd: f.chargeLevel > 0.5 }, hits: 1, id: f.game.nextId++ };
        if (t % 3 === 0) f.game.afterimage(f);
        if (t >= dur) { f.vx = 0; f.armor = 0; f.endSpecial(); f.setState('land'); f.t = -6; }
      }
    }
  };
  NC.SPECIALS = SPECIALS;

  // ---------------------------------------------------------------- supers
  F.startSuper = function () {
    if (this.meter < MAX_METER) return false;
    this.meter = 0;
    this.super = this.ch.super;
    this.superT = 0;
    this.hb = null; this.move = null; this.sp = null;
    this.vx = 0;
    this.setState('special');
    this.sp = { type: '_super' };
    this.invuln = 30;
    this.game.superFreeze(this);
    return true;
  };

  SPECIALS._super = {
    update: function (f) {
      var su = f.super, t = ++f.superT;
      var o = f.opp();
      switch (su.type) {
        case 'beam':
          f.pose = t < 20 ? 'castPrep' : 'cast';
          if (t === 20) f.game.startBeam(f, su);
          if (t > 20 && !f.game.beam) { if (t > 90) { f.super = null; f.endSpecial(); } }
          break;
        case 'rushSuper':
          if (!f.rushLock) {
            f.pose = 'dash';
            f.vx = su.speed * f.facing;
            if (t % 2 === 0) f.game.afterimage(f);
            if (Math.abs(o.x - f.x) < 40 * f.s && o.hurtbox() && o.y > -80) {
              if (o.state === 'blockstun' || (o.holdingBack() && o.canAct())) {
                f.game.applyHit(f, o, { dmg: su.dmg * 0.12, stun: 0, bstun: 20, push: 8, lvl: 'mid' }, false);
                f.vx = 0; f.super = null; f.endSpecial(); return;
              }
              f.rushLock = true; f.rushT = 0; f.vx = 0;
              o.setState('hitstun'); o.hitstun = 999; o.hitPose = 'hitHigh';
              if (su.luna) f.game.luna(f);
            }
            if (t > 40) { f.vx = 0; f.super = null; f.endSpecial(); }
            break;
          }
          f.rushT++;
          f.pose = ['lp1', 'hp1', 'lk1', 'hk1', 'chp1'][(f.rushT / 5 | 0) % 5];
          if (f.rushT % 5 === 0 && f.rushT < su.hits * 5) {
            var last = f.rushT >= (su.hits - 1) * 5;
            f.game.applyHit(f, o, { dmg: su.dmg / su.hits * f.power(), stun: last ? 30 : 999, bstun: 0, push: last ? 8 : 0.5, lvl: 'mid', kd: last, launch: last, unblockable: true, noScale: true }, true);
            if (su.notes) f.game.notes(o);
            if (last) { f.rushLock = false; f.super = null; f.endSpecial(); }
          }
          break;
        case 'swarm':
          f.pose = t < 16 ? 'superPose' : 'raise';
          if (t >= 16 && t < 16 + su.count * 4 && (t - 16) % 4 === 0) {
            f.game.spawnMinion(f, su.minion, { dmg: su.dmg * f.power(), vx: 3.5 + Math.random() * 1.5, life: 160, super: true, idx: (t - 16) / 4 });
          }
          if (t > 16 + su.count * 4 + 20) { f.super = null; f.endSpecial(); }
          break;
        case 'whale':
          f.pose = t < 20 ? 'charge' : 'raise';
          if (t === 20) f.game.spawnWhale(f, su);
          if (t > 70) { f.super = null; f.endSpecial(); }
          break;
        case 'disgrace':
          f.pose = (t >> 3) & 1 ? 'dizzy0' : 'superPose';
          if (t === 10) f.game.disgrace(f, su);
          if (t > 10 && t < 10 + su.hits * 6 && (t - 10) % 6 === 0) {
            var fin = (t - 10) / 6 >= su.hits - 1;
            if (o.hurtbox() && o.state !== 'down') f.game.applyHit(f, o, { dmg: su.dmg / su.hits * f.power(), stun: fin ? 30 : 12, bstun: 8, push: fin ? 7 : 1, lvl: 'mid', kd: fin, noScale: true, chipRate: 0.25 }, false);
            if ((t - 10) % 18 === 0) f.hp = Math.max(1, f.hp - su.selfDmg / 4);
          }
          if (t > 10 + su.hits * 6 + 20) { f.super = null; f.endSpecial(); }
          break;
      }
    }
  };

  // ---------------------------------------------------------------- getting hit
  F.recoverFromHit = function () {
    if (this.stun >= DIZZY_AT * this.stats.defense && this.hp > 0) {
      this.setState('dizzy'); this.dizzyT = 150; this.stun = 0;
      this.say('HALLUCINATING!', '#ff80ff', true);
      return;
    }
    this.combo = 0;
    this.toIdle();
  };

  NC.MAX_METER = MAX_METER;
  NC.GRAV = GRAV;
})(window.NC = window.NC || {});
