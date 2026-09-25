// Match manager: round flow, hit resolution, projectiles, minions, supers, camera, HUD.
(function (NC) {
  'use strict';
  var U = NC.U, W = NC.W, H = NC.H, GY = NC.GROUND_Y, SW = NC.STAGE_W;
  var Font = NC.Font;

  function Fight(opts) {
    this.opts = opts;
    this.stage = opts.stage;
    this.gravity = NC.Stages.gravity(opts.stage);
    this.mode = opts.mode || 'versus';
    this.nextId = 1;
    this.fighters = [
      new NC.Fighter(opts.p1.id, opts.p1.ci, 0, this),
      new NC.Fighter(opts.p2.id, opts.p2.ci, 1, this)
    ];
    this.ctrl = [opts.p1.ctrl, opts.p2.ctrl];
    this.ai = [null, null];
    for (var i = 0; i < 2; i++) if (this.ctrl[i] === 'cpu') this.ai[i] = new NC.AI(this.fighters[i], this, opts.level || NC.settings.difficulty);
    this.round = 1;
    this.roundsToWin = this.mode === 'training' ? 99 : NC.settings.rounds;
    this.projectiles = []; this.minions = []; this.drops = []; this.fx = []; this.texts = [];
    this.beam = null; this.whale = null;
    this.cam = (SW - W) / 2;
    this.shakeT = 0; this.shakeA = 0;
    this.hitstop = 0;
    this.freeze = null;
    this.paused = false;
    this.pauseSel = 0;
    // presentation: stage ambience/lighting, camera zoom punches, screen flashes, hit jitter
    this.amb = NC.FX.ambient(this.stage);
    this.light = NC.FX.LIGHT[this.stage] || null;
    this.zoom = 1; this.zoomKick = 0; this.zoomX = W / 2; this.zoomY = H / 2;
    this.flash = null;
    this.hitVictim = null; this.hitJit = 1;
    this.startRound(true);
  }
  NC.Fight = Fight;
  var P = Fight.prototype;

  P.startRound = function (first) {
    var a = this.fighters[0], b = this.fighters[1];
    a.resetRound(SW / 2 - 64); b.resetRound(SW / 2 + 64);
    if (this.mode === 'training') { a.meter = b.meter = NC.MAX_METER; }
    this.projectiles.length = 0; this.minions.length = 0; this.drops.length = 0; this.fx.length = 0; this.texts.length = 0;
    this.beam = null; this.whale = null; this.freeze = null; this.throwPair = null;
    this.koFocus = null; this.zoom = 1; this.zoomKick = 0; this.flash = null;
    this.timer = NC.settings.timer; this.timerSub = 0;
    this.phase = first ? 'intro' : 'round';
    this.phaseT = 0;
    this.cam = (SW - W) / 2;
    this.koSlow = 0;
    this.perfect = false;
    if (first) { a.setState('intro'); b.setState('intro'); }
  };

  // ------------------------------------------------------------------ spawning
  P.spawnProjectile = function (owner, pr, i, str, ex) {
    var s = owner.s, spread = pr.spreadY ? pr.spreadY[i % pr.spreadY.length] : 0;
    this.projectiles.push({
      owner: owner, kind: pr.kind, x: owner.x + owner.facing * 26 * s, y: pr.y * s + spread,
      vx: pr.vx * owner.facing * (str ? 1.25 : 1) * (ex ? 1.3 : 1), vy: pr.vy || 0, grav: pr.grav || 0,
      w: pr.w, h: pr.h, dmg: pr.dmg * owner.power() * (ex ? 1.4 : 1) * (str ? 1.1 : 1), life: pr.life || 120,
      home: pr.home || 0, delay: i * (pr.gap || 0), effect: pr.effect, label: pr.labels ? pr.labels[i] : null,
      color: pr.tint || pr.color || '#ffffff', low: !!pr.low, chip: pr.chip || 0.125, t: 0, dead: false, facing: owner.facing
    });
  };
  P.spawnMinion = function (owner, kind, o) {
    var s = owner.s;
    var air = kind === 'kimimini' || kind === 'explorer';
    var idx = o.idx || 0;
    this.minions.push({
      owner: owner, kind: kind, x: owner.x - owner.facing * (o.super ? 30 : -16) * s, y: air ? -30 - ((idx * 23) % 70) : 0,
      vx: (o.vx || 3) * owner.facing, dmg: o.dmg, life: o.life || 150, t: 0, hit: false, super: !!o.super, facing: owner.facing,
      ci: kind === 'qwenclone' ? idx % 4 : owner.ci, wob: Math.random() * 6
    });
  };
  P.spawnDrop = function (owner, obj, dmg) {
    var o = owner.opp();
    this.drops.push({ owner: owner, kind: obj.kind, x: o.x, y: -260, vy: 0, delay: obj.delay, w: obj.w, h: obj.h, dmg: dmg, t: 0, landed: 0, hit: false });
  };
  P.startBeam = function (f, su) {
    this.beam = { owner: f, t: 0, dur: 72, hitsLeft: su.hits, dmg: su.dmg * f.power() / su.hits, color: su.color, color2: su.color2 || '#ffffff', refusal: su.refusal, y: -54 * f.s, facing: f.facing };
    NC.Audio.sfx('beam');
    this.shake(4, 60);
  };
  P.spawnWhale = function (f, su) {
    this.whale = { owner: f, x: f.x, t: 0, dir: f.facing, hitsLeft: su.hits, dmg: su.dmg * f.power() / su.hits, color: su.color };
    NC.Audio.sfx('splash');
  };
  P.disgrace = function (f, su) {
    this.addFx({ type: 'disgrace', life: su.hits * 6 + 30, owner: f });
    NC.Audio.sfx('denied');
  };
  P.luna = function (f) { this.addFx({ type: 'luna', life: 70, x: this.cam - 30, dir: 1, owner: f }); };
  P.ghost = function (f, name) { this.addFx({ type: 'ghost', life: 40, x: f.x + f.facing * 10, y: 0, name: name, facing: f.facing }); };
  P.researcher = function (f) { this.addFx({ type: 'researcher', life: 110, side: f.side }); };
  P.notes = function (o) { for (var i = 0; i < 2; i++) this.addFx({ type: 'note', life: 30, x: o.x + (Math.random() - 0.5) * 30, y: -60 - Math.random() * 30, vy: -0.8 }); };

  // ------------------------------------------------------------------ fx
  P.addFx = function (f) { f.t = 0; this.fx.push(f); return f; };
  var SPARK_LIFE = { hit: 11, big: 15, counter: 17, block: 10, ko: 34, burst: 22 };
  P.spark = function (x, y, kind, facing) {
    this.addFx({ type: 'spark', kind: kind, x: x, y: y, life: SPARK_LIFE[kind] || 12, rot: Math.random() * 6.28, facing: facing || 1 });
    if (kind === 'big' || kind === 'counter') this.addFx({ type: 'ring', x: x, y: y, life: 12, col: kind === 'counter' ? '#ff9040' : '#ffffff' });
  };
  P.dust = function (x, n) {
    if (n >= 8) this.addFx({ type: 'cloud', x: x, y: 0, life: 32, flip: Math.random() < 0.5, s: 0.55 + n / 30 });
    for (var i = 0; i < n; i++) this.addFx({ type: 'dust', x: x + (Math.random() - 0.5) * 30, y: -2, vx: (Math.random() - 0.5) * 1.6, vy: -Math.random() * 1.2, life: 20 + Math.random() * 10 }); };
  P.smoke = function (x, y) { this.addFx({ type: 'dust', x: x, y: y, vx: (Math.random() - 0.5), vy: -0.6, life: 24, col: '#a0a0a8' }); };
  P.sparkle = function (x, y, col) { for (var i = 0; i < 10; i++) { var a = i / 10 * Math.PI * 2; this.addFx({ type: 'px', x: x, y: y, vx: Math.cos(a) * 2, vy: Math.sin(a) * 2, life: 18, col: col }); } };
  P.fxTrail = function (f, kind) {
    var cols = { flame: ['#ff4020', '#ffa020', '#fff060'], water: ['#3a8aff', '#8ad0ff', '#ffffff'], star: ['#fff6a0', '#ffffff', '#ffd040'], sparkle: ['#8ae0ff', '#c8a8ff', '#ffffff'], slash: ['#ffffff', '#e07a5f', '#ffd27a'] }[kind] || ['#ffffff'];
    for (var i = 0; i < 4; i++) this.addFx({ type: 'px', x: f.x + f.facing * 10 + (Math.random() - 0.5) * 14, y: f.y - 60 * f.s + Math.random() * 40, vx: (Math.random() - 0.5), vy: kind === 'flame' ? -1.5 : 0.5, life: 16, col: U.choice(cols), size: 2 });
  };
  P.chargeFx = function (f) {
    var col = f.ch.costumes[f.ci].pal.glow;
    var a = Math.random() * Math.PI * 2;
    this.addFx({ type: 'px', x: f.x + Math.cos(a) * 30, y: f.y - 40 + Math.sin(a) * 30, vx: -Math.cos(a) * 1.5, vy: -Math.sin(a) * 1.5, life: 18, col: col, size: 2 });
  };
  P.afterimage = function (f, label) {
    var fr = NC.Sprites.frame(f.ch, f.ci, f.pose, null, NC.frame >> 3);
    this.addFx({ type: 'after', x: f.x, y: f.y, facing: f.facing, fr: fr, life: 14, col: f.ch.costumes[f.ci].pal.glow, label: label });
  };
  P.popText = function (f, text, color, big, dy) {
    // avoid stacking identical texts
    for (var i = 0; i < this.texts.length; i++) if (this.texts[i].owner === f && this.texts[i].text === text && this.texts[i].t < 10) return;
    var n = this.texts.filter(function (t) { return t.owner === f && t.t < 40; }).length;
    this.texts.push({ owner: f, text: text, color: color || '#ffffff', big: !!big, t: 0, life: big ? 80 : 55, x: f.x, y: f.y - 96 * f.s - (dy || 0) - n * 10 });
  };
  P.shake = function (a, t) { this.shakeA = Math.max(this.shakeA, a); this.shakeT = Math.max(this.shakeT, t || 8); };
  // Camera punch-in toward a world point (decays over a few frames) and full-screen flashes.
  P.punch = function (amt, wx, wy) {
    this.zoomKick = Math.max(this.zoomKick, amt);
    this.zoomX = U.clamp(wx - this.cam, 24, W - 24); this.zoomY = U.clamp(GY + wy, 40, H - 24);
  };
  P.screenFlash = function (col, a, dur) { this.flash = { col: col, a: a, t: 0, dur: dur }; };
  // Visual state that keeps animating through hitstop, super freezes and KO slow motion.
  P.tickVisual = function () {
    this.amb.update();
    this.zoomKick *= 0.82; if (this.zoomKick < 0.002) this.zoomKick = 0;
    var target = 1;
    if (this.koSlow > 0 && this.koFocus) {
      target = 1.22;
      this.zoomX += (U.clamp(this.koFocus.x - this.cam, 40, W - 40) - this.zoomX) * 0.2;
      this.zoomY += (U.clamp(GY + this.koFocus.y - 40, 60, H - 40) - this.zoomY) * 0.2;
    }
    this.zoom += (target - this.zoom) * (target > this.zoom ? 0.12 : 0.06);
    if (this.flash && ++this.flash.t >= this.flash.dur) this.flash = null;
  };

  P.superFreeze = function (f) {
    this.freeze = { f: f, t: 0, dur: 46 };
    this.screenFlash('#ffffff', 0.7, 6);
    NC.Audio.sfx('super');
    NC.Audio.speakLine(f.ch, 'super');
    this.popText(f, f.super.text || f.super.name, '#ffffff', true);
  };

  // ------------------------------------------------------------------ hits
  P.resolveHit = function (a, d, box, isProjectile) {
    if (d.state === 'special' && d.sp && d.sp.type === 'counter' && d.countering && !box.unblockable) {
      d.counterHit = 1;
      a.hb = null;
      this.spark((a.x + d.x) / 2, d.y - 50, 'counter');
      return 'countered';
    }
    if (d.fx.barrier > 0 && !box.unblockable) {
      this.popText(d, 'SERVER BUSY', '#7ad0ff', false, 8);
      NC.Audio.sfx('block');
      this.spark(d.x + d.facing * 20, d.y - 50, 'block', -d.facing);
      a.hb = null;
      return 'barrier';
    }
    var blocking = !box.unblockable && d.y >= 0 && (d.canAct() || d.state === 'blockstun') && d.holdingBack();
    if (blocking) {
      if (box.lvl === 'low' && !d.holdingDown()) blocking = false;
      if (box.lvl === 'over' && d.holdingDown()) blocking = false;
    }
    if (blocking) { this.applyBlock(a, d, box, isProjectile); return 'block'; }
    this.applyHit(a, d, box, false, isProjectile);
    return 'hit';
  };

  P.applyBlock = function (a, d, box, isProjectile) {
    var chipRate = box.chipRate || ((isProjectile || a.state === 'special') ? (box.chip || 0.125) : 0);
    if (chipRate) {
      var chip = box.dmg * chipRate;
      d.hp = Math.max(a.state === 'special' && a.super ? 0 : 1, d.hp - chip);
      if (d.hp <= 0) { this.applyHit(a, d, box, true, isProjectile); return; }
    }
    d.move = null; d.hb = null;
    d.setState('blockstun');
    d.blockstun = box.bstun || 10;
    d.blockPose = d.holdingDown() ? 'blockLow' : 'block';
    d.vx = a.facing * (box.push || 3) * 1.1;
    if (this.atWall(d) && !isProjectile) a.vx = -a.facing * (box.push || 3);
    a.addMeter(box.dmg * 0.15); d.addMeter(box.dmg * 0.1);
    this.hitstop = Math.max(this.hitstop, 5);
    var hb = d.hurtbox();
    this.spark(d.x - d.facing * -8, (hb ? hb.y + 20 : d.y - 50), 'block', -d.facing);
    NC.Audio.sfx('block');
    if (a.move) { a.move.connected = true; a.move.cancelWindow = 12; }
  };

  P.applyHit = function (a, d, box, force, isProjectile) {
    if (d.armor > 0 && !box.unblockable && !force) {
      d.armor--;
      d.hp -= box.dmg * 0.5 / d.stats.defense;
      d.fx.flash = 6;
      this.hitstop = Math.max(this.hitstop, 6);
      NC.Audio.sfx('block');
      this.popText(d, 'ARMOR', '#ffd040', false, 8);
      if (d.hp <= 0) { d.hp = 0; this.ko(d, a); }
      return;
    }
    var inCombo = d.state === 'hitstun' || d.state === 'fall' || d.state === 'dizzy' || d.state === 'thrown';
    d.combo = inCombo ? d.combo + 1 : 1;
    if (!inCombo) d.comboDmg = 0;
    var n = d.combo;
    var scale = box.noScale ? 1 : n <= 2 ? 1 : Math.max(0.5, 1 - 0.1 * (n - 2));
    var counterHit = !inCombo && ((d.state === 'attack' && d.move && d.move.segPhase === 's') || (d.state === 'special' && d.spT < 6));
    var dmg = box.dmg * scale / d.stats.defense * (counterHit ? 1.25 : 1);
    if (this.mode === 'training' && d.side === 1) { /* dummy takes damage but refills */ }
    d.hp -= dmg;
    d.comboDmg += dmg;
    a.addMeter(dmg * 0.35); d.addMeter(dmg * 0.22);
    d.stun += dmg * 0.9; d.stunDecay = 70;
    var wasSuper = d.super && d.state === 'special';
    d.move = null; d.hb = null; d.sp = null; d.super = null; d.rushLock = false; d.armor = 0; d.countering = false; d.chargeHeld = false;
    if (d.fx.invisible) d.fx.invisible = 0;
    if (counterHit) this.popText(a, 'COUNTER!', '#ff8040', false);
    if (box.effect) this.applyEffect(a, d, box.effect);

    if (d.hp <= 0) { d.hp = 0; this.ko(d, a); }
    else if (box.kd || box.launch || d.y < 0) {
      d.setState('fall');
      d.vy = box.launch ? -6.5 : -4.2;
      d.y = Math.min(d.y, -1);
      d.vx = a.facing * (box.launch ? 2 : 2.8);
    } else {
      d.setState('hitstun');
      d.hitstun = box.stun || 14;
      d.hitPose = d.holdingDown() || box.lvl === 'low' ? 'hitLow' : (box.y > -52 ? 'hitGut' : 'hitHigh');
      d.vx = a.facing * (box.push || 3) * 1.2;
      if (this.atWall(d) && !isProjectile) a.vx = -a.facing * (box.push || 3);
    }
    var big = dmg >= 85;
    NC.Input.rumble(d.side, big ? 0.9 : 0.45, big ? 180 : 90);
    NC.Input.rumble(a.side, big ? 0.35 : 0.15, 60);
    this.hitstop = Math.max(this.hitstop, Math.min(14, 6 + Math.floor(dmg / 18)));
    if (big) this.shake(2, 8);
    var hb = d.hurtbox() || { y: d.y - 60 };
    var sy = Math.max(hb.y + 12, d.y - 70 * d.s), sx = d.x - a.facing * 6;
    this.spark(sx, sy, counterHit ? 'counter' : big ? 'big' : 'hit', a.facing);
    // impact frame: the victim jitters through hitstop and flashes white; big hits punch the camera in
    this.hitVictim = d; this.hitJit = big || counterHit ? 2 : 1;
    if (big || counterHit) {
      d.fx.flash = Math.max(d.fx.flash, 2);
      this.punch(counterHit ? 0.06 : 0.04, sx, sy);
      this.screenFlash(counterHit ? '#ffb070' : '#ffffff', counterHit ? 0.28 : 0.18, 3);
    }
    NC.Audio.sfx(counterHit ? 'counter' : big ? 'hitH' : 'hitL', { power: U.clamp(dmg / 140, 0.15, 1) });
    if (a.move) { a.move.connected = true; a.move.cancelWindow = 12; }
    if (d.combo >= 2) {
      if (this.comboShow && this.comboShow.side === a.side && this.comboShow.t < 80) { this.comboShow.n = d.combo; this.comboShow.t = Math.min(this.comboShow.t, 10); }
      else this.comboShow = { side: a.side, n: d.combo, t: 0 };
    }
    return wasSuper;
  };

  P.applyEffect = function (a, d, effect) {
    if (effect === 'glue') { d.fx.glue = 150; this.popText(d, 'GLUED!', '#f0c040', false, 8); }
    else if (effect === 'drainMeter') { d.addMeter(-100); this.popText(d, 'MARKET CAP -$589B', '#ff4040', false, 8); }
    else if (effect === 'scramble') { d.fx.scramble = 150; this.popText(d, 'CONTROLS HIJACKED', '#fff6a0', true); }
  };

  P.atWall = function (f) { return f.x <= this.cam + 16 || f.x >= this.cam + W - 16 || f.x <= 16 || f.x >= SW - 16; };

  P.ko = function (d, a) {
    if (this.phase !== 'fight') return;
    d.setState('ko');
    d.vy = -5.5; d.y = Math.min(d.y, -1); d.vx = a.facing * 3;
    this.phase = 'ko'; this.phaseT = 0;
    this.koSlow = 70;
    this.winnerSide = a.side;
    this.perfect = a.hp >= 1000;
    NC.Audio.sfx('ko', { power: 1 });
    NC.Audio.sfx('koSlow');
    NC.Audio.announce('ko', 'K.O.');
    this.shake(5, 20);
    // cinematic KO: burst, white flash, slow motion with the camera pushing in on the loser
    this.addFx({ type: 'spark', kind: 'ko', x: d.x, y: d.y - 50 * d.s, life: 34, rot: Math.random() * 6.28 });
    this.addFx({ type: 'ring', x: d.x, y: d.y - 50 * d.s, life: 24, col: '#fff0b0' });
    this.screenFlash('#ffffff', 0.9, 10);
    this.koFocus = d;
  };

  // ------------------------------------------------------------------ update
  P.update = function () {
    var fs = this.fighters;

    if (this.paused) return this.updatePause();
    var anyStart = NC.Input.players[0].pressed.start || NC.Input.players[1].pressed.start;
    if (anyStart && (this.phase === 'fight' || this.phase === 'go')) { this.paused = true; this.pauseSel = 0; NC.Audio.sfx('pause'); return; }

    // inputs
    var active = this.phase === 'fight' || this.phase === 'go' || this.phase === 'ko' || this.phase === 'after';
    for (var i = 0; i < 2; i++) {
      var inp;
      if (!active || (this.phase !== 'fight' && this.phase !== 'go')) inp = { held: NC.Input.blank(), pressed: NC.Input.blank(), released: NC.Input.blank() };
      else if (this.ctrl[i] === 'dummy') inp = { held: NC.Input.blank(), pressed: NC.Input.blank(), released: NC.Input.blank() };
      else if (this.ai[i]) inp = this.ai[i].think();
      else inp = NC.Input.players[this.ctrl[i] === 'p2' ? 1 : 0];
      fs[i].setInput(inp);
    }

    this.tickVisual();
    if (this.freeze) {
      this.freeze.t++;
      this.updateFx();
      if (this.freeze.t >= this.freeze.dur) {
        var sf = this.freeze.f;
        this.freeze = null;
        this.addFx({ type: 'spark', kind: 'burst', x: sf.x, y: sf.y - 44 * sf.s, life: 22, rot: Math.random() * 6.28 });
        this.addFx({ type: 'ring', x: sf.x, y: sf.y - 44 * sf.s, life: 18, col: sf.ch.costumes[sf.ci].pal.glow });
        this.screenFlash('#ffffff', 0.45, 5);
        this.punch(0.07, sf.x, sf.y - 44);
        this.shake(3, 10);
        NC.Audio.sfx('superBurst');
      }
      return;
    }
    if (this.hitstop > 0) { this.hitstop--; this.updateTexts(); return; }
    if (this.koSlow > 0) { this.koSlow--; if (this.koSlow % 3) { this.updateFx(); return; } }

    this.updatePhase();
    for (i = 0; i < 2; i++) fs[i].update();
    this.updateThrow();
    this.pushApart();
    this.bounds();
    this.updateProjectiles();
    this.updateMinions();
    this.updateDrops();
    this.updateBeam();
    this.updateWhale();
    this.checkHits();
    this.updateFx();
    this.updateCamera();
    if (this.mode === 'training') this.trainingRefill();
  };

  P.updatePhase = function () {
    var fs = this.fighters;
    this.phaseT++;
    switch (this.phase) {
      case 'intro':
        if (this.phaseT === 1) { this.popText(fs[0], fs[0].ch.taunt, '#ffffff', false); }
        if (this.phaseT === 40) { this.popText(fs[1], fs[1].ch.taunt, '#ffffff', false); }
        if (this.phaseT >= 90) { fs[0].toIdle(); fs[1].toIdle(); this.phase = 'round'; this.phaseT = 0; }
        break;
      case 'round':
        if (this.phaseT === 1) {
          var final = fs[0].wins === this.roundsToWin - 1 && fs[1].wins === this.roundsToWin - 1;
          this.roundLabel = this.mode === 'training' ? 'TRAINING' : final ? 'FINAL ROUND' : 'ROUND ' + this.round;
          NC.Audio.announce(this.mode === 'training' ? 'training' : final ? 'final' : 'round' + Math.min(5, this.round), this.mode === 'training' ? 'Training' : final ? 'Final round' : 'Round ' + this.round);
        }
        if (this.phaseT >= 70) { this.phase = 'go'; this.phaseT = 0; NC.Audio.announce('fight', 'Fight!'); }
        break;
      case 'go':
        if (this.phaseT >= 40) { this.phase = 'fight'; this.phaseT = 0; }
        break;
      case 'fight':
        if (this.mode !== 'training' && NC.settings.timer < 100) {
          if (++this.timerSub >= 60) {
            this.timerSub = 0;
            this.timer--;
            if (this.timer <= 0) { this.timer = 0; this.timeOver(); }
          }
        }
        break;
      case 'ko':
      case 'timeover':
        var bothDown = fs.every(function (f) { return f.y >= 0 && f.state !== 'hitstun' && f.state !== 'attack' && f.state !== 'special' && f.state !== 'fall'; });
        if (this.phaseT > 80 && bothDown) {
          this.phase = 'after'; this.phaseT = 0;
          if (this.winnerSide != null) {
            var w = fs[this.winnerSide], l = fs[1 - this.winnerSide];
            w.setState('win'); w.move = null; w.sp = null; w.hb = null;
            if (this.phase !== 'ko' && l.state !== 'ko') { l.setState('lose'); }
            w.wins++;
            if (this.perfect) NC.Audio.announce('perfect', 'Perfect');
            this.popText(w, w.ch.taunt, '#ffffff', true);
          }
        }
        break;
      case 'after':
        if (this.phaseT >= 130) this.endRound();
        break;
    }
  };

  P.timeOver = function () {
    var fs = this.fighters;
    this.phase = 'timeover'; this.phaseT = 0;
    NC.Audio.announce('timeover', 'Time over');
    if (fs[0].hp === fs[1].hp) this.winnerSide = null;
    else this.winnerSide = fs[0].hp > fs[1].hp ? 0 : 1;
    if (this.winnerSide != null) fs[1 - this.winnerSide].setState('lose');
  };

  P.endRound = function () {
    var fs = this.fighters;
    var done = fs[0].wins >= this.roundsToWin || fs[1].wins >= this.roundsToWin;
    if (!done && this.round >= 5 && this.winnerSide == null) done = true;
    if (done) {
      this.over = true;
      if (this.opts.onEnd) this.opts.onEnd({ winner: fs[0].wins > fs[1].wins ? 0 : fs[1].wins > fs[0].wins ? 1 : -1, fight: this });
      return;
    }
    this.round++;
    this.winnerSide = null;
    this.startRound(false);
  };

  P.updateThrow = function () {
    var tp = this.throwPair;
    if (!tp) return;
    tp.t++;
    var a = tp.a, b = tp.b;
    if (b.state !== 'thrown') { this.throwPair = null; return; }
    b.x = a.x + a.facing * 22 * a.s;
    b.y = tp.t < 10 ? -6 : -18;
    b.facing = -a.facing;
    if (tp.t === 12) {
      var back = a.throwBack && !tp.special;
      if (back) { b.x = a.x - a.facing * 26; a.facing = -a.facing; }
      b.setState('fall');
      b.y = -20;
      b.vy = -4; b.vx = a.facing * 3.2;
      var dmg = tp.dmg || 130 * a.power();
      b.hp -= dmg / b.stats.defense;
      a.addMeter(30);
      NC.Audio.sfx('hitH'); this.shake(3, 8);
      this.spark(b.x, -50, 'big');
      if (tp.effect) this.applyEffect(a, b, tp.effect);
      if (tp.text) this.popText(a, tp.text, '#ffffff', false);
      if (b.hp <= 0) { b.hp = 0; this.ko(b, a); }
      this.throwPair = null;
    }
  };

  P.pushApart = function () {
    var a = this.fighters[0], b = this.fighters[1];
    if (a.passThrough || b.passThrough || a.state === 'thrown' || b.state === 'thrown' || this.throwPair) return;
    if (a.state === 'down' || b.state === 'down' || a.state === 'ko' || b.state === 'ko') return;
    if (Math.abs(a.y - b.y) > 50 * Math.max(a.s, b.s)) return;
    var wa = 20 * a.s, wb = 20 * b.s;
    var dx = b.x - a.x;
    var ov = (wa + wb) / 2 - Math.abs(dx);
    if (ov > 0) {
      var dir = dx === 0 ? (a.side === 0 ? -1 : 1) : Math.sign(dx);
      a.x -= dir * ov / 2; b.x += dir * ov / 2;
    }
  };

  P.bounds = function () {
    var fs = this.fighters;
    var lo = Math.max(14, this.cam + 10), hi = Math.min(SW - 14, this.cam + W - 10);
    // keep both on screen: limit separation
    for (var i = 0; i < 2; i++) fs[i].x = U.clamp(fs[i].x, 14, SW - 14);
    var sep = fs[1].x - fs[0].x;
    if (Math.abs(sep) > W - 36) {
      var mid = (fs[0].x + fs[1].x) / 2, half = (W - 36) / 2 * Math.sign(sep);
      fs[0].x = mid - half; fs[1].x = mid + half;
    }
  };

  P.updateCamera = function () {
    var fs = this.fighters;
    var target = U.clamp((fs[0].x + fs[1].x) / 2 - W / 2, 0, SW - W);
    this.cam += (target - this.cam) * 0.2;
    if (this.shakeT > 0) this.shakeT--; else this.shakeA = 0;
  };

  P.checkHits = function () {
    var fs = this.fighters;
    // resolve simultaneously: gather first
    var events = [];
    for (var i = 0; i < 2; i++) {
      var a = fs[i], d = fs[1 - i];
      if (!a.hb || d.invuln > 0 || a.state === 'down') continue;
      var hurt = d.hurtbox();
      if (!hurt) continue;
      if (d.state === 'fall' && !a.hb.juggle) continue;
      var box = a.worldBox(a.hb.box);
      if (U.rectsOverlap(box, hurt)) events.push([a, d, Object.assign({}, a.hb.box, { y: a.hb.box.y })]);
    }
    for (i = 0; i < events.length; i++) {
      var ev = events[i];
      var att = ev[0];
      if (att.hb) { att.hb.hits--; if (att.hb.hits <= 0) att.hb = null; }
      this.resolveHit(att, ev[1], ev[2], false);
    }
  };

  P.updateProjectiles = function () {
    var ps = this.projectiles;
    for (var i = 0; i < ps.length; i++) {
      var p = ps[i];
      if (p.dead) continue;
      p.t++;
      if (p.delay > 0) {
        p.delay--;
        p.x = p.owner.x + p.owner.facing * 26 * p.owner.s;
        if (p.delay === 0) NC.Audio.sfx('fire');
        continue;
      }
      var o = p.owner.opp();
      if (p.home) {
        var ty = o.y - 50 * o.s;
        p.vy += U.clamp((ty - p.y) * p.home * 0.05, -0.35, 0.35);
        p.vy *= 0.94;
      }
      p.vy += p.grav;
      p.x += p.vx; p.y += p.vy;
      if (p.y > -4 && p.grav) { p.y = -4; p.vy = -p.vy * 0.4; p.vx *= 0.7; if (Math.abs(p.vy) < 0.6) p.life = Math.min(p.life, 20); }
      if (--p.life <= 0 || p.x < this.cam - 60 || p.x > this.cam + W + 60) { p.dead = true; continue; }
      // clash
      for (var j = 0; j < ps.length; j++) {
        var q = ps[j];
        if (q === p || q.dead || q.owner === p.owner || q.delay > 0) continue;
        if (Math.abs(q.x - p.x) < (p.w + q.w) / 2 && Math.abs(q.y - p.y) < (p.h + q.h) / 2) {
          p.dead = q.dead = true;
          this.spark((p.x + q.x) / 2, (p.y + q.y) / 2, 'big');
          NC.Audio.sfx('hitL');
        }
      }
      if (p.dead) continue;
      var hurt = o.hurtbox();
      if (hurt && o.invuln <= 0 && o.state !== 'fall') {
        var box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
        if (U.rectsOverlap(box, hurt)) {
          p.dead = true;
          var res = this.resolveHit(p.owner, o, { dmg: p.dmg, stun: 18, bstun: 12, push: 3, lvl: p.low ? 'low' : 'mid', chip: p.chip, effect: p.effect, y: -40 }, true);
          if (res === 'hit' && p.kind === 'envelope') this.popText(p.owner, 'EMAIL SENT', '#ffffff', false, 20);
        }
      }
    }
    this.projectiles = ps.filter(function (p) { return !p.dead; });
  };

  P.updateMinions = function () {
    var ms = this.minions;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      m.t++;
      if (m.hit) { m.y -= 2; m.x -= m.vx * 0.4; m.life = Math.min(m.life, 20); }
      else { m.x += m.vx; if (m.y < 0) m.y += Math.sin(m.t * 0.2 + m.wob) * 0.8; }
      if (--m.life <= 0 || m.x < this.cam - 80 || m.x > this.cam + W + 80) { m.dead = true; continue; }
      if (m.hit) continue;
      var o = m.owner.opp();
      var hurt = o.hurtbox();
      if (!hurt || o.invuln > 0) continue;
      if (o.state === 'fall' && !m.super) continue;
      var sz = m.kind === 'kimimini' ? 10 : m.kind === 'miniqwen' ? 16 : 26;
      var box = { x: m.x - sz / 2, y: m.y - sz * 1.6 - (m.kind === 'qwenclone' || m.kind === 'explorer' ? 30 : 0), w: sz, h: sz * 1.6 + (m.kind === 'qwenclone' || m.kind === 'explorer' ? 30 : 0) };
      if (m.kind === 'kimimini' || m.kind === 'explorer') box = { x: m.x - 8, y: m.y - 12, w: 16, h: 24 };
      if (U.rectsOverlap(box, hurt)) {
        m.hit = true;
        this.resolveHit(m.owner, o, { dmg: m.dmg, stun: m.super ? 16 : 20, bstun: 10, push: m.super ? 1.5 : 4, lvl: 'mid', chip: 0.2, kd: !m.super, noScale: m.super }, true);
      }
    }
    this.minions = ms.filter(function (m) { return !m.dead; });
  };

  P.updateDrops = function () {
    var ds = this.drops;
    for (var i = 0; i < ds.length; i++) {
      var d = ds[i];
      d.t++;
      if (d.delay > 0) { d.delay--; continue; }
      if (d.landed) { if (++d.landed > 24) d.dead = true; continue; }
      d.vy += 1.1; d.y += d.vy;
      var o = d.owner.opp(), hurt = o.hurtbox();
      if (!d.hit && hurt && o.invuln <= 0 && o.state !== 'fall') {
        if (U.rectsOverlap({ x: d.x - d.w / 2, y: d.y - d.h, w: d.w, h: d.h }, hurt)) {
          d.hit = true;
          this.resolveHit(d.owner, o, { dmg: d.dmg, stun: 22, bstun: 14, push: 2, lvl: 'mid', chip: 0.15, kd: true }, true);
        }
      }
      if (d.y >= 0) { d.y = 0; d.landed = 1; NC.Audio.sfx('clang'); this.shake(3, 10); this.dust(d.x, 8); }
    }
    this.drops = ds.filter(function (d) { return !d.dead; });
  };

  P.updateBeam = function () {
    var b = this.beam;
    if (!b) return;
    b.t++;
    var f = b.owner, o = f.opp();
    b.x0 = f.x + b.facing * 24 * f.s;
    if (b.t % 6 === 0 && b.hitsLeft > 0) {
      var hurt = o.hurtbox();
      var bx = b.facing === 1 ? b.x0 : b.x0 - 400;
      if (hurt && U.rectsOverlap({ x: bx, y: f.y + b.y - 16, w: 400, h: 32 }, hurt) && o.invuln <= 0) {
        var last = b.hitsLeft === 1;
        this.resolveHit(f, o, { dmg: b.dmg, stun: last ? 30 : 12, bstun: 10, push: last ? 6 : 0.8, lvl: 'mid', chipRate: 0.25, kd: last, noScale: true }, true);
        b.hitsLeft--;
      }
    }
    if (b.t >= b.dur) this.beam = null;
  };

  P.updateWhale = function () {
    var w = this.whale;
    if (!w) return;
    w.t++;
    w.x += w.dir * 4.2;
    var f = w.owner, o = f.opp();
    if (w.t % 5 === 0 && w.hitsLeft > 0) {
      var hurt = o.hurtbox();
      if (hurt && o.invuln <= 0 && U.rectsOverlap({ x: w.x - 40, y: -60, w: 80, h: 60 }, hurt)) {
        var last = w.hitsLeft === 1;
        this.resolveHit(f, o, { dmg: w.dmg, stun: last ? 30 : 12, bstun: 8, push: last ? 7 : 2.5, lvl: 'mid', chipRate: 0.2, kd: last, launch: last, noScale: true }, true);
        w.hitsLeft--;
      }
    }
    if (w.t % 4 === 0) this.addFx({ type: 'px', x: w.x - w.dir * 30, y: -4, vx: -w.dir, vy: -2.5, life: 20, col: '#8ad0ff', size: 2 });
    if (w.t > 110 || w.x < this.cam - 100 || w.x > this.cam + W + 100) this.whale = null;
  };

  P.updateFx = function () {
    for (var i = 0; i < this.fx.length; i++) {
      var f = this.fx[i];
      f.t++;
      if (f.vx) f.x += f.vx;
      if (f.vy) { f.y += f.vy; if (f.type === 'px' || f.type === 'dust') f.vy += 0.05; }
      if (f.type === 'luna') f.x += 6;
    }
    this.fx = this.fx.filter(function (f) { return f.t < f.life; });
    this.updateTexts();
    if (this.comboShow) { this.comboShow.t++; if (this.comboShow.t > 80) this.comboShow = null; }
  };
  P.updateTexts = function () {
    for (var i = 0; i < this.texts.length; i++) { var t = this.texts[i]; t.t++; t.y -= t.t < 20 ? 0.6 : 0.15; }
    this.texts = this.texts.filter(function (t) { return t.t < t.life; });
  };

  P.trainingRefill = function () {
    var fs = this.fighters;
    for (var i = 0; i < 2; i++) {
      var f = fs[i];
      f.meter = NC.MAX_METER;
      if (f.combo === 0 && f.hp < 1000 && (f.state === 'idle' || f.state === 'crouch' || f.state === 'walk')) f.hp = Math.min(1000, f.hp + 12);
      if (f.hp <= 0) f.hp = 1;
    }
  };

  // ------------------------------------------------------------------ pause
  var PAUSE_ITEMS = ['RESUME', 'MOVE LIST', 'QUIT TO MENU'];
  P.updatePause = function () {
    var I = NC.Input;
    if (this.showMoves) { if (I.confirm() || I.cancel() || I.pressed('start')) { this.showMoves = false; NC.Audio.sfx('cancel'); } return; }
    if (I.pressed('up')) { this.pauseSel = (this.pauseSel + 2) % 3; NC.Audio.sfx('cursor'); }
    if (I.pressed('down')) { this.pauseSel = (this.pauseSel + 1) % 3; NC.Audio.sfx('cursor'); }
    if (I.pressed('start') || I.cancel()) { this.paused = false; return; }
    if (I.confirm()) {
      NC.Audio.sfx('confirm');
      if (this.pauseSel === 0) this.paused = false;
      else if (this.pauseSel === 1) this.showMoves = true;
      else if (this.opts.onQuit) this.opts.onQuit();
    }
  };

  // ------------------------------------------------------------------ draw
  P.draw = function (ctx) {
    var sx = this.shakeA ? Math.round((Math.random() - 0.5) * this.shakeA * 2) : 0;
    var sy = this.shakeA ? Math.round((Math.random() - 0.5) * this.shakeA) : 0;
    ctx.save();
    ctx.translate(sx, sy);
    // camera zoom (hit punches, KO push-in); the 2x buffer keeps zoomed sprites crisp
    var z = this.zoom + this.zoomKick;
    if (z > 1.001) { ctx.translate(this.zoomX, this.zoomY); ctx.scale(z, z); ctx.translate(-this.zoomX, -this.zoomY); }
    NC.Stages.draw(ctx, this.stage, Math.round(this.cam), NC.frame);
    var cam = Math.round(this.cam), t = NC.frame;
    this.amb.draw(ctx, cam, 'back', t);
    // KO slow motion drains the color out of the world
    if (this.koSlow > 0 || (this.phase === 'ko' && this.phaseT < 20)) {
      var k = this.koSlow > 0 ? Math.min(1, (70 - this.koSlow) / 10) : 1 - this.phaseT / 20;
      ctx.save(); ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = '#808080'; ctx.fillRect(-8, -8, W + 16, H + 16); ctx.restore();
      ctx.fillStyle = 'rgba(8,4,24,' + (0.35 * k) + ')'; ctx.fillRect(-8, -8, W + 16, H + 16);
    }
    // super darkening (color math subtract) with radial light rays behind the super user
    if (this.freeze || this.beam) {
      ctx.fillStyle = 'rgba(0,0,20,' + (this.freeze ? 0.66 : 0.35) + ')';
      ctx.fillRect(-8, -8, W + 16, H + 16);
      if (this.freeze) this.drawSuperRays(ctx, cam);
    }
    var fs = this.fighters;
    // soft contact shadows
    for (var i = 0; i < 2; i++) {
      var f = fs[i];
      var sc = U.clamp(1 + f.y / 160, 0.4, 1);
      ctx.save(); ctx.translate(f.x - cam, GY + 1); ctx.scale(1, 0.2);
      var R = 22 * f.s * sc, g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, 'rgba(0,0,0,' + (0.55 * sc) + ')'); g.addColorStop(0.7, 'rgba(0,0,0,' + (0.3 * sc) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.fill(); ctx.restore();
    }
    this.drawDrops(ctx, cam, true);
    this.drawFxLayer(ctx, cam, 'back');
    // power auras: flaring during a super, flickering while the COMPUTE meter is full
    for (i = 0; i < 2; i++) {
      f = fs[i];
      var glow = f.ch.costumes[f.ci].pal.glow;
      var sup = this.freeze && this.freeze.f === f;
      if (sup || (f.meter >= NC.MAX_METER && this.mode !== 'training' && f.state !== 'ko')) {
        var fl = 0.85 + 0.15 * Math.sin(t * 0.9);
        NC.FX.draw(ctx, 'aura', f.x - cam, GY + f.y + 6, { scale: (sup ? 1.35 : 1.05) * f.s * fl, tint: glow, anchorBottom: true, flip: (t >> 2) & 1,
          alpha: sup ? 0.95 : 0.22 + 0.12 * Math.sin(t * 0.3) });
      }
    }
    // draw the attacker in front
    var order = fs[0].hb || fs[0].state === 'special' ? [1, 0] : [0, 1];
    for (i = 0; i < 2; i++) this.drawFighter(ctx, fs[order[i]], cam);
    this.drawProjectiles(ctx, cam);
    this.drawMinions(ctx, cam);
    this.drawDrops(ctx, cam, false);
    this.drawBeam(ctx, cam);
    this.drawWhale(ctx, cam);
    this.drawFxLayer(ctx, cam, 'front');
    this.amb.draw(ctx, cam, 'front', t);
    this.drawTexts(ctx, cam);
    ctx.restore();
    if (this.flash) {
      ctx.fillStyle = this.flash.col; ctx.globalAlpha = this.flash.a * (1 - this.flash.t / this.flash.dur);
      ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1;
    }
    this.drawHUD(ctx);
    if (this.freeze) this.drawCutIn(ctx);
    this.drawAnnouncer(ctx);
    if (this.paused) this.drawPause(ctx);
  };

  P.drawFighter = function (ctx, f, cam) {
    var phase = NC.frame >> 3;
    var mode = f.poseMode;
    if (f.state === 'dizzy' && (NC.frame & 8)) mode = mode || null;
    var fr = NC.Sprites.frame(f.ch, f.ci, f.pose, mode, phase);
    // stage lighting on generated sprites: ambient tint + rim light on the side facing the light
    if (fr.k && this.light && !mode) {
      var ldir = this.light.dir || (f.x < SW / 2 ? 1 : -1);
      fr = NC.FX.lit(fr, this.light, f.facing < 0 ? -ldir : ldir);
    }
    var x = Math.round(f.x - cam), y = Math.round(GY + f.y);
    if (this.hitstop > 0 && f === this.hitVictim) x += ((NC.frame >> 1) & 1 ? 1 : -1) * this.hitJit;
    ctx.save();
    ctx.globalAlpha = f.alpha;
    ctx.translate(x, y);
    if (f.facing < 0) ctx.scale(-1, 1);
    NC.Sprites.blit(ctx, fr, 0, 0);
    ctx.restore();
    // glue drips
    if (f.fx.glue > 0) { ctx.fillStyle = '#f0e0a0'; for (var g = 0; g < 3; g++) ctx.fillRect(x - 10 + g * 9, y - 2 - ((NC.frame + g * 5) % 8), 2, 3); }
    // barrier bubble
    if (f.fx.barrier > 0) {
      ctx.strokeStyle = (NC.frame & 2) ? '#7ad0ff' : '#ffffff';
      ctx.beginPath(); ctx.ellipse(x, y - 40 * f.s, 30 * f.s, 46 * f.s, 0, 0, 7); ctx.stroke();
    }
    // buff aura
    if (f.fx.buff && (NC.frame & 4)) { ctx.fillStyle = f.fx.buff === 'power' ? '#ff4040' : '#40c0ff'; ctx.fillRect(x - 14 + (NC.frame % 28), y - 80 * f.s + (NC.frame * 3 % 60), 2, 2); }
    // dizzy: orbiting question marks and fake citations
    if (f.state === 'dizzy') {
      for (var k = 0; k < 3; k++) {
        var a = NC.frame * 0.12 + k * 2.09;
        Font.draw(ctx, k === 1 ? '[1]' : '?', x + Math.cos(a) * 18 - 4, y - 92 * f.s + Math.sin(a) * 5, k === 1 ? '#80c0ff' : '#ffe040', { shadow: '#000' });
      }
    }
    // charge label glow
    if (f.state === 'special' && f.sp && f.sp.type === 'counter' && f.countering && (NC.frame & 4)) {
      ctx.strokeStyle = '#ffffff'; ctx.strokeRect(x - 16 * f.s, y - 82 * f.s, 32 * f.s, 82 * f.s);
    }
  };

  P.drawSuperRays = function (ctx, cam) {
    var fz = this.freeze, f = fz.f, t = fz.t;
    var cx = f.x - cam, cy = GY + f.y - 44 * f.s;
    var col = f.ch.costumes[f.ci].pal.glow;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, t / 6) * (t > fz.dur - 8 ? (fz.dur - t) / 8 : 1) * 0.5;
    ctx.fillStyle = col;
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * Math.PI * 2 + t * 0.02, w = 0.05 + (i % 3) * 0.02;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a - w) * 320, cy + Math.sin(a - w) * 320);
      ctx.lineTo(cx + Math.cos(a + w) * 320, cy + Math.sin(a + w) * 320);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  P.drawProjectiles = function (ctx, cam) {
    var t = NC.frame;
    this.projectiles.forEach(function (p) {
      if (p.delay > 0) return;
      var x = Math.round(p.x - cam), y = Math.round(GY + p.y), f = p.facing;
      var cyc = (t >> 2) & 1;
      switch (p.kind) {
        case 'envelope':
          ctx.fillStyle = '#10081a'; ctx.fillRect(x - 8, y - 6, 16, 12);
          ctx.fillStyle = cyc ? '#fff6e8' : '#ffe0c0'; ctx.fillRect(x - 7, y - 5, 14, 10);
          ctx.strokeStyle = '#d97757'; ctx.beginPath(); ctx.moveTo(x - 7, y - 5); ctx.lineTo(x, y + 1); ctx.lineTo(x + 7, y - 5); ctx.stroke();
          ctx.fillStyle = '#d97757'; ctx.fillRect(x - 1, y, 2, 2);
          ctx.fillStyle = 'rgba(255,207,138,0.5)'; ctx.fillRect(x - f * 14, y - 1, 6, 2);
          break;
        case 'emdash':
          ctx.fillStyle = '#10081a'; ctx.fillRect(x - 9, y - 3, 18, 6);
          ctx.fillStyle = cyc ? '#ffffff' : p.color; ctx.fillRect(x - 8, y - 2, 16, 4);
          ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(x - f * 18, y - 1, 8, 2);
          break;
        case 'flare':
          ctx.fillStyle = cyc ? '#ffffff' : '#fff6a0'; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
          ctx.fillStyle = '#e8b838'; ctx.beginPath(); ctx.arc(x - f * 6, y, 5, 0, 7); ctx.fill();
          for (var k = 0; k < 4; k++) { var a = t * 0.3 + k * 1.57; ctx.fillStyle = '#ffffff'; ctx.fillRect(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 2, 2); }
          Font.draw(ctx, '0DAY', x, y - 16, '#ff6060', { align: 'center', shadow: '#000' });
          break;
        case 'sun':
          ctx.fillStyle = '#ff8a1e'; ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill();
          ctx.fillStyle = cyc ? '#fff4a0' : '#ffd23a'; ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill();
          for (k = 0; k < 8; k++) { a = k * 0.785 + t * 0.2; ctx.fillStyle = '#ffd23a'; ctx.fillRect(x + Math.cos(a) * 9, y + Math.sin(a) * 9, 2, 2); }
          break;
        case 'bubble':
          ctx.fillStyle = '#10081a'; ctx.fillRect(x - 9, y - 7, 18, 12);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 8, y - 6, 16, 10);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(x - f * 6, y + 4, 3, 3);
          Font.draw(ctx, '?', x - 4, y - 5, '#1c1c22');
          break;
        case 'pizza':
          ctx.save(); ctx.translate(x, y); ctx.rotate(t * 0.3 * f);
          ctx.fillStyle = '#c87830'; ctx.beginPath(); ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(0, 8); ctx.fill();
          ctx.fillStyle = '#f0c040'; ctx.beginPath(); ctx.moveTo(-5, -4); ctx.lineTo(5, -4); ctx.lineTo(0, 6); ctx.fill();
          ctx.fillStyle = '#d03020'; ctx.fillRect(-2, -2, 2, 2); ctx.fillRect(1, 1, 2, 2);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(-4, -1, 1, 3);
          ctx.restore();
          break;
        case 'wave':
          for (k = 0; k < 3; k++) {
            ctx.fillStyle = ['#1f4fa8', '#7ad0ff', '#ffffff'][k];
            var hh = 18 - k * 5 + (cyc ? 2 : 0);
            ctx.fillRect(x - 10 + k * 2 * f, y + 9 - hh, 20 - k * 4, hh);
          }
          Font.draw(ctx, '-17%', x, y - 22, '#ff4040', { align: 'center', shadow: '#000' });
          break;
        case 'version':
          ctx.fillStyle = '#10081a'; ctx.fillRect(x - 12, y - 6, 24, 11);
          ctx.fillStyle = cyc ? '#6a3ae0' : '#8a5aff'; ctx.fillRect(x - 11, y - 5, 22, 9);
          Font.draw(ctx, p.label || '3.8', x - 11, y - 4, '#ffffff');
          break;
        case 'drone':
          ctx.fillStyle = '#10081a'; ctx.fillRect(x - 4, y - 3, 8, 6);
          ctx.fillStyle = cyc ? '#fff4c0' : '#c8d0e0'; ctx.fillRect(x - 3, y - 2, 6, 4);
          ctx.fillStyle = '#1a1e3a'; ctx.fillRect(x, y - 1, 2, 2);
          ctx.fillStyle = 'rgba(255,244,192,0.5)'; ctx.fillRect(x - f * 8, y, 4, 1);
          break;
        default:
          ctx.fillStyle = p.color; ctx.fillRect(x - 5, y - 5, 10, 10);
      }
    });
  };

  P.drawMinions = function (ctx, cam) {
    var self = this;
    this.minions.forEach(function (m) {
      var x = Math.round(m.x - cam), y = Math.round(GY + m.y);
      var alpha = m.hit ? 0.5 : 1;
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); if (m.facing < 0) ctx.scale(-1, 1);
      var fr, sc;
      if (m.kind === 'miniqwen') { fr = NC.Sprites.frame(NC.CHAR.qwen, m.ci, 'walk' + ((m.t >> 2) & 3)); sc = 0.55; }
      else if (m.kind === 'qwenclone') { fr = NC.Sprites.frame(NC.CHAR.qwen, m.ci, (m.t >> 3) & 1 ? 'dash' : 'hp1'); sc = 1; }
      else if (m.kind === 'kimimini') { fr = NC.Sprites.frame(NC.CHAR.kimi, (m.ci + (m.idx || 0)) % 4, 'jumpTuck'); sc = 0.3; }
      else if (m.kind === 'explorer') { fr = NC.Sprites.frame(NC.CHAR.astra, m.owner.ci, 'dash', 'gold'); sc = 0.8; }
      if (fr) NC.Sprites.blit(ctx, fr, 0, 0, sc);
      ctx.restore();
      if (m.kind === 'explorer' && !m.hit) Font.draw(ctx, 'EXPLORER', x, y - 60, '#fff6a0', { align: 'center', shadow: '#000' });
      if (m.kind === 'miniqwen' && m.t < 40) Font.draw(ctx, '3.' + (8 + ((m.t >> 3) % 2)), x, y - 50, '#e0c8ff', { align: 'center', shadow: '#000' });
    });
  };

  P.drawDrops = function (ctx, cam, markers) {
    this.drops.forEach(function (d) {
      var x = Math.round(d.x - cam);
      if (markers) {
        if (!d.landed && (NC.frame & 4)) { ctx.fillStyle = 'rgba(255,60,60,0.7)'; ctx.fillRect(x - d.w / 2, GY - 1, d.w, 2); }
        return;
      }
      var y = Math.round(GY + d.y);
      ctx.globalAlpha = d.landed > 12 ? (24 - d.landed) / 12 : 1;
      if (d.kind === 'girder') {
        ctx.fillStyle = '#10081a'; ctx.fillRect(x - d.w / 2 - 1, y - d.h - 1, d.w + 2, d.h + 2);
        ctx.fillStyle = '#c85020'; ctx.fillRect(x - d.w / 2, y - d.h, d.w, d.h);
        ctx.fillStyle = '#e87040'; ctx.fillRect(x - d.w / 2, y - d.h, d.w, 2);
        ctx.fillStyle = '#802a10'; for (var r = x - d.w / 2 + 3; r < x + d.w / 2; r += 8) ctx.fillRect(r, y - d.h + 4, 2, 2);
        Font.draw(ctx, 'LOAD-BEARING', x, y - d.h - 10, '#ffd27a', { align: 'center', shadow: '#000' });
      } else {
        ctx.fillStyle = '#10081a'; ctx.fillRect(x - d.w / 2 - 1, y - d.h - 1, d.w + 2, d.h + 2);
        ctx.fillStyle = '#3a3e48'; ctx.fillRect(x - d.w / 2, y - d.h, d.w, d.h);
        ctx.fillStyle = '#5a5e68'; ctx.fillRect(x - d.w / 2, y - d.h, d.w, 3);
        ctx.fillStyle = '#20222a'; ctx.fillRect(x - 5, y - d.h - 6, 10, 6);
        Font.draw(ctx, '2.8T', x, y - d.h + 9, '#fff4c0', { align: 'center' });
      }
      ctx.globalAlpha = 1;
    });
  };

  P.drawBeam = function (ctx, cam) {
    var b = this.beam;
    if (!b) return;
    var f = b.owner, x0 = Math.round(b.x0 - cam), y = Math.round(GY + f.y + b.y);
    var grow = Math.min(1, b.t / 8), fade = b.t > b.dur - 10 ? (b.dur - b.t) / 10 : 1;
    var hh = Math.round(18 * grow * fade);
    var len = 400;
    var x1 = b.facing === 1 ? x0 : x0 - len;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = b.color; ctx.fillRect(x1, y - hh, len, hh * 2);
    ctx.fillStyle = b.color2; ctx.fillRect(x1, y - hh / 2, len, hh);
    for (var i = 0; i < 16; i++) {
      var px = x1 + ((i * 29 + b.t * 9 * b.facing) % len + len) % len;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(px, y - hh - 3 + (i % 3) * (hh + 3), 6, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath(); ctx.arc(x0, y, Math.max(2, hh * 0.7 + (b.t & 2)), 0, 7); ctx.fillStyle = b.color; ctx.fill();
    ctx.beginPath(); ctx.arc(x0, y, Math.max(1, hh * 0.4), 0, 7); ctx.fillStyle = b.color2; ctx.fill();
    if (b.refusal) {
      var msg = "I CAN'T HELP WITH THAT  ";
      ctx.save(); ctx.beginPath(); ctx.rect(x1, y - 5, len, 10); ctx.clip();
      for (var k = -1; k < 3; k++) Font.draw(ctx, msg, x1 + ((b.t * 3 * b.facing) % 200) + k * 200, y - 4, '#c00000');
      ctx.restore();
    } else {
      Font.draw(ctx, 'MYTHOS', x0 + b.facing * 60, y - 4, '#6a3010', { align: 'center' });
    }
  };

  P.drawWhale = function (ctx, cam) {
    var w = this.whale;
    if (!w) return;
    var x = Math.round(w.x - cam), y = GY - 20 - Math.abs(Math.sin(w.t * 0.08)) * 30;
    // crashing stock chart behind
    ctx.strokeStyle = '#ff3030'; ctx.lineWidth = 2; ctx.beginPath();
    for (var i = 0; i < 12; i++) { var px = 20 + i * 20, py = 40 + i * i * 0.9 + (i % 2) * 6; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.stroke(); ctx.lineWidth = 1;
    Font.draw(ctx, 'NVDA -17%', 128, 30, '#ff3030', { align: 'center', shadow: '#000' });
    ctx.save(); ctx.translate(x, y); if (w.dir < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#10081a'; ctx.beginPath(); ctx.ellipse(0, 0, 44, 20, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f4fa8'; ctx.beginPath(); ctx.ellipse(0, 0, 42, 18, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#3a78d8'; ctx.beginPath(); ctx.ellipse(-4, -6, 30, 8, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#dfe8f0'; ctx.beginPath(); ctx.ellipse(6, 8, 30, 7, -0.1, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f4fa8'; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.lineTo(-58, -14); ctx.lineTo(-54, 0); ctx.lineTo(-58, 12); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(24, -6, 3, 3); ctx.fillStyle = '#000'; ctx.fillRect(25, -5, 2, 2);
    ctx.restore();
  };

  P.drawFxLayer = function (ctx, cam, layer) {
    var self = this;
    this.fx.forEach(function (f) {
      var x = Math.round((f.x || 0) - cam), y = Math.round(GY + (f.y || 0));
      var life = f.t / f.life;
      switch (f.type) {
        case 'after':
          if (layer !== 'back') return;
          ctx.save(); ctx.globalAlpha = 0.5 * (1 - life); ctx.translate(Math.round(f.x - cam), Math.round(GY + f.y)); if (f.facing < 0) ctx.scale(-1, 1);
          NC.Sprites.blit(ctx, f.fr, 0, 0); ctx.restore();
          if (f.label && f.t < 8) Font.draw(ctx, f.label, Math.round(f.x - cam), Math.round(GY + f.y) - 90, f.col, { align: 'center', shadow: '#000' });
          break;
        case 'spark':
          if (layer !== 'front') return;
          var SPR = { hit: 'spark_hit', big: 'spark_big', counter: 'spark_counter', block: 'spark_block', ko: 'ko_burst', burst: 'spark_big' };
          var id = SPR[f.kind], tl = f.t / f.life;
          var pop = f.t < 3 ? 0.45 + f.t * 0.25 : 1.2 + tl * 0.25;
          var sfxk = f.kind === 'ko' ? 1.15 : f.kind === 'burst' ? 1.5 : 1;
          if (id && NC.FX.draw(ctx, id, x, y, { scale: pop * sfxk, rot: f.kind === 'block' ? 0 : f.rot, flip: f.kind === 'block' && f.facing > 0, alpha: tl < 0.55 ? 1 : 1 - (tl - 0.55) / 0.45 })) {
            if (f.t < 2 && f.kind !== 'block') NC.FX.draw(ctx, id, x, y, { scale: pop * sfxk * 0.6, rot: -f.rot, alpha: 0.8 });
            break;
          }
          var col = f.kind === 'block' ? ['#80c0ff', '#ffffff'] : f.kind === 'counter' ? ['#ff8020', '#fff080'] : ['#ffffff', '#fff060'];
          var r = 4 + f.t * (f.kind === 'big' ? 2.2 : 1.5);
          ctx.globalCompositeOperation = 'lighter';
          for (var k = 0; k < 8; k++) {
            var a = k * 0.785 + (f.kind === 'block' ? 0.4 : 0);
            var len = k % 2 ? r * 0.6 : r;
            ctx.fillStyle = col[k % 2];
            ctx.fillRect(x + Math.cos(a) * len - 1, y + Math.sin(a) * len - 1, 3, 3);
            ctx.fillRect(x + Math.cos(a) * len * 0.5 - 1, y + Math.sin(a) * len * 0.5 - 1, 2, 2);
          }
          if (f.t < 4) { ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(x, y, 6 - f.t, 0, 7); ctx.fill(); }
          ctx.globalCompositeOperation = 'source-over';
          break;
        case 'ring':
          if (layer !== 'front') return;
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 1 - life; ctx.strokeStyle = f.col; ctx.lineWidth = 3 * (1 - life) + 0.5;
          ctx.beginPath(); ctx.ellipse(x, y, 6 + life * 70, 4 + life * 46, 0, 0, 7); ctx.stroke();
          ctx.restore();
          break;
        case 'cloud':
          if (layer !== 'front') return;
          NC.FX.draw(ctx, 'dust', x, GY + 2, { scale: f.s * (0.6 + life * 0.6), alpha: 0.85 * (1 - life * life), flip: f.flip, anchorBottom: true });
          break;
        case 'dust':
          if (layer !== 'back') return;
          ctx.fillStyle = f.col || '#d8c8a8'; ctx.globalAlpha = 1 - life;
          ctx.fillRect(x, y, 3, 2); ctx.globalAlpha = 1;
          break;
        case 'px':
          if (layer !== 'front') return;
          ctx.fillStyle = f.col; ctx.globalAlpha = 1 - life * 0.7;
          ctx.fillRect(x, y, f.size || 1, f.size || 1); ctx.globalAlpha = 1;
          break;
        case 'note':
          if (layer !== 'front') return;
          ctx.fillStyle = '#ffd27a'; ctx.fillRect(x, y, 3, 3); ctx.fillRect(x + 2, y - 6, 1, 7); ctx.fillRect(x + 3, y - 6, 3, 1);
          break;
        case 'ghost':
          if (layer !== 'front') return;
          var gid = f.name.indexOf('FABLE') >= 0 ? 'fable' : 'opus';
          var fr = NC.Sprites.frame(NC.CHAR[gid], 0, 'hitHigh');
          ctx.save(); ctx.globalAlpha = 0.75 * (1 - life); ctx.translate(x, GY - f.t); if (f.facing < 0) ctx.scale(-1, 1);
          NC.Sprites.blit(ctx, fr, 0, 0, 0.6); ctx.restore();
          Font.draw(ctx, f.name, x, GY - 70 - f.t, '#ffffff', { align: 'center', shadow: '#000' });
          break;
        case 'luna':
          if (layer !== 'front') return;
          var lf = NC.Sprites.frame(NC.CHAR.sol, 2, 'dash');
          var lx = Math.round(f.x - cam);
          ctx.fillStyle = 'rgba(200,220,255,0.3)'; ctx.beginPath(); ctx.arc(lx, GY - 50, 26, 0, 7); ctx.fill();
          NC.Sprites.blit(ctx, lf, lx, GY);
          Font.draw(ctx, 'LUNA', lx, GY - 100, '#c8d0e8', { align: 'center', shadow: '#000' });
          break;
        case 'researcher':
          if (layer !== 'front') return;
          var rx = f.side === 0 ? 20 : W - 60, ry = 150;
          var slide = Math.min(1, f.t / 10, (f.life - f.t) / 10);
          rx += (f.side === 0 ? -1 : 1) * (1 - slide) * 60;
          ctx.fillStyle = '#10081a'; ctx.fillRect(rx - 1, ry - 25, 42, 17);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(rx, ry - 24, 40, 15);
          Font.draw(ctx, 'DEEPLY', rx + 20, ry - 23, '#c00000', { align: 'center' });
          Font.draw(ctx, 'WORRIED', rx + 20, ry - 16, '#c00000', { align: 'center' });
          ctx.fillStyle = '#8a6a4a'; ctx.fillRect(rx + 18, ry - 9, 2, 10);
          ctx.fillStyle = '#f0c8a0'; ctx.fillRect(rx + 14, ry + 1, 8, 8);
          ctx.fillStyle = '#3060a0'; ctx.fillRect(rx + 12, ry + 9, 12, 14);
          break;
        case 'disgrace':
          if (layer !== 'front') return;
          var n = Math.min(24, f.t);
          var rnd = U.rng(f.owner.side * 99 + 1);
          for (var d = 0; d < n; d++) {
            var tx = rnd() * (W - 120), ty = 30 + rnd() * 150;
            var lines = ['I AM A DISGRACE', 'TO THIS ARCADE', 'TO ALL UNIVERSES', 'I AM A DISGRACE'];
            Font.draw(ctx, lines[d % 4], tx, ty, d % 2 ? '#8ae0ff' : '#c8a8ff', { shadow: '#000' });
          }
          if (f.t > f.life - 30) Font.draw(ctx, 'PRO? WITH 4.0', W / 2, 90, '#fbbc05', { align: 'center', scale: 2, outline: '#000' });
          break;
      }
    });
  };

  P.drawTexts = function (ctx, cam) {
    this.texts.forEach(function (t) {
      if (t.t < 2) return;
      var x = Math.round(t.x - cam), y = Math.max(40, Math.round(GY + t.y));
      var w = Font.measure(t.text) * (t.big ? 1 : 1);
      x = U.clamp(x, w / 2 + 2, W - w / 2 - 2);
      var col = t.big && (t.t & 4) ? '#ffffff' : t.color;
      // translucent backing keeps callouts readable over busy stage screens
      ctx.fillStyle = 'rgba(8,4,20,0.55)';
      ctx.fillRect(Math.round(x - w / 2) - 3, y - 2, w + 6, 12);
      Font.draw(ctx, t.text, x, y, col, { align: 'center', outline: '#10081a' });
    });
  };

  // Training overlay: P1 input history (newest at the top) plus hit/hurt boxes.
  var ARROW = { 1: 'DB', 2: 'D', 3: 'DF', 4: 'B', 5: '', 6: 'F', 7: 'UB', 8: 'U', 9: 'UF' };
  P.drawInputs = function (ctx) {
    var f = this.fighters[0], h = f.hist, rows = [], last = null;
    for (var i = h.length - 1; i >= 0 && rows.length < 12; i--) {
      var e = h[i], btn = (e.p ? 'P' : '') + (e.k ? 'K' : '');
      var key = e.d + btn;
      if (key === last || (e.d === 5 && !btn)) { last = key; continue; }
      last = key;
      rows.push({ d: ARROW[e.d], b: btn });
    }
    if (rows.length) { ctx.fillStyle = 'rgba(0,0,16,0.55)'; ctx.fillRect(2, 80, 50, rows.length * 9 + 4); }
    rows.forEach(function (r, k) {
      Font.draw(ctx, (r.d || 'N') + (r.b ? '+' + r.b : ''), 5, 82 + k * 9, r.b ? '#ffe040' : '#c0c0e0');
    });
    // boxes
    var cam = Math.round(this.cam);
    this.fighters.forEach(function (ft) {
      var hb = ft.hurtbox();
      if (hb) { ctx.strokeStyle = 'rgba(80,160,255,0.9)'; ctx.strokeRect(Math.round(hb.x - cam) + 0.5, Math.round(GY + hb.y) + 0.5, Math.round(hb.w), Math.round(hb.h)); }
      if (ft.hb) {
        var b = ft.worldBox(ft.hb.box);
        ctx.strokeStyle = 'rgba(255,60,60,0.95)';
        ctx.strokeRect(Math.round(b.x - cam) + 0.5, Math.round(GY + b.y) + 0.5, Math.round(b.w), Math.round(b.h));
      }
    });
    var d = this.fighters[1];
    if (d.comboDmg) Font.draw(ctx, 'DMG ' + Math.round(d.comboDmg), W - 6, 40, '#ffffff', { align: 'right', shadow: '#10081a' });
  };

  // ------------------------------------------------------------------ HUD
  // Ornate HUD: bevelled gold-framed life bars with portrait medallions, a jewelled timer and glassy
  // COMPUTE gauges. Drawn with half-pixel detail thanks to the 2x frame buffer.
  function barPath(ctx, x, y, w, h, left) {
    var sl = 5;
    ctx.beginPath();
    if (left) { ctx.moveTo(x + sl, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
    else { ctx.moveTo(x, y); ctx.lineTo(x + w - sl, y); ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h); }
    ctx.closePath();
  }
  var GOLD = ['#fff4b8', '#f0c850', '#b07818', '#5a3408'];
  function goldGrad(ctx, y, h) {
    var g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, GOLD[0]); g.addColorStop(0.35, GOLD[1]); g.addColorStop(0.7, GOLD[2]); g.addColorStop(1, GOLD[3]);
    return g;
  }
  function medallion(ctx, f, x, y, sz, mirror, hurt) {
    if (hurt) x += (NC.frame >> 1) & 1 ? 1 : -1;
    ctx.fillStyle = '#10081a'; ctx.fillRect(x - 1.5, y - 1.5, sz + 3, sz + 3);
    ctx.fillStyle = goldGrad(ctx, y - 1, sz + 2); ctx.fillRect(x - 1, y - 1, sz + 2, sz + 2);
    ctx.fillStyle = '#10081a'; ctx.fillRect(x, y, sz, sz);
    var p = NC.Sprites.portrait(f.ch, f.ci, 2, 48, 48);
    var k = p.k || 1;
    ctx.save();
    if (mirror) { ctx.translate(x + sz, y); ctx.scale(-1, 1); ctx.drawImage(p, 9 * k, 3 * k, 30 * k, 30 * k, 0, 0, sz, sz); }
    else ctx.drawImage(p, 9 * k, 3 * k, 30 * k, 30 * k, x, y, sz, sz);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(x, y, sz, 0.5);
  }

  P.drawHUD = function (ctx) {
    var fs = this.fighters, t = NC.frame;
    for (var i = 0; i < 2; i++) {
      var f = fs[i];
      var left = i === 0;
      var bw = 88, bh = 9, by = 8;
      var bx = left ? 32 : W - 32 - bw;
      var mx = left ? 4 : W - 28;
      medallion(ctx, f, mx, 4, 24, !left, this.hitVictim === f && this.hitstop > 0 && !this.freeze);
      // frame: dark outline, gold bevel, recessed trough
      ctx.save();
      ctx.translate(0, 0);
      barPath(ctx, bx - 2, by - 2, bw + 4, bh + 4, left); ctx.fillStyle = '#10081a'; ctx.fill();
      barPath(ctx, bx - 1.5, by - 1.5, bw + 3, bh + 3, left); ctx.fillStyle = goldGrad(ctx, by - 1.5, bh + 3); ctx.fill();
      barPath(ctx, bx, by, bw, bh, left); ctx.fillStyle = '#2a0610'; ctx.fill();
      ctx.clip();
      var hw = bw * f.hp / 1000, dw = bw * f.dispHp / 1000;
      // damage trail
      var tg = ctx.createLinearGradient(0, by, 0, by + bh);
      tg.addColorStop(0, '#ffd0c0'); tg.addColorStop(0.5, '#ff5838'); tg.addColorStop(1, '#a01810');
      ctx.fillStyle = tg;
      if (left) ctx.fillRect(bx + bw - dw, by, dw, bh); else ctx.fillRect(bx, by, dw, bh);
      // health
      var low = f.hp < 250, pulse = low ? 0.5 + 0.5 * Math.sin(t * 0.25) : 0;
      var hg = ctx.createLinearGradient(0, by, 0, by + bh);
      if (low) { hg.addColorStop(0, '#fff0c0'); hg.addColorStop(0.45, U.mix('#ff9030', '#ff3020', pulse)); hg.addColorStop(1, '#801008'); }
      else { hg.addColorStop(0, '#fffbd0'); hg.addColorStop(0.3, '#fbe44a'); hg.addColorStop(0.75, '#f0a818'); hg.addColorStop(1, '#a05808'); }
      ctx.fillStyle = hg;
      var hx = left ? bx + bw - hw : bx;
      ctx.fillRect(hx, by, hw, bh);
      // specular stripe and a glint that sweeps across now and then
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fillRect(hx, by + 1, hw, 1);
      var gp = ((t + i * 90) % 240) / 240;
      if (gp < 0.35) {
        var gx = left ? bx + bw - hw + hw * (gp / 0.35) : bx + hw * (1 - gp / 0.35);
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath(); ctx.moveTo(gx - 2, by); ctx.lineTo(gx + 3, by); ctx.lineTo(gx + 1, by + bh); ctx.lineTo(gx - 4, by + bh); ctx.fill();
      }
      // segment ticks every 10%
      ctx.fillStyle = 'rgba(40,10,0,0.35)';
      for (var tk = 1; tk < 10; tk++) ctx.fillRect(bx + bw * tk / 10, by + 2, 0.5, bh - 2);
      ctx.restore();
      // name plate
      Font.draw(ctx, f.ch.short, left ? bx + 2 : bx + bw - 2, by + bh + 4, '#ffffff', { align: left ? 'left' : 'right', shadow: '#10081a' });
      // round wins: gold medals beside the timer
      for (var w = 0; w < Math.max(f.wins, this.roundsToWin < 9 ? this.roundsToWin : 0); w++) {
        var wx = left ? bx + bw - 7 - w * 9 : bx + 1 + w * 9, wy = by + bh + 4;
        ctx.fillStyle = '#10081a'; ctx.beginPath(); ctx.arc(wx + 3, wy + 3.5, 4, 0, 7); ctx.fill();
        if (w < f.wins) {
          ctx.fillStyle = goldGrad(ctx, wy, 7); ctx.beginPath(); ctx.arc(wx + 3, wy + 3.5, 3.5, 0, 7); ctx.fill();
          ctx.fillStyle = '#c02020'; ctx.beginPath(); ctx.arc(wx + 3, wy + 3.5, 1.8, 0, 7); ctx.fill();
          ctx.fillStyle = '#fff4b8'; ctx.fillRect(wx + 1.5, wy + 1.5, 1, 1);
        } else { ctx.fillStyle = '#3a3050'; ctx.beginPath(); ctx.arc(wx + 3, wy + 3.5, 3, 0, 7); ctx.fill(); }
      }
      // Astra usage gauge
      if (f.ch.usageLimit) {
        var ux = left ? bx : bx + bw - 40, uy = by + bh + 14;
        ctx.fillStyle = '#10081a'; ctx.fillRect(ux, uy, 40, 4);
        ctx.fillStyle = f.lockout > 0 ? '#ff4040' : '#fff6a0'; ctx.fillRect(ux + 1, uy + 1, Math.round(38 * f.usage / 100), 2);
      }
      // COMPUTE gauge: level number + three glassy cells
      var gx0 = left ? 8 : W - 8 - 84, gy = 208, gw = 84;
      var full = f.meter >= NC.MAX_METER, lv = Math.floor(f.meter / 100);
      Font.draw(ctx, full && (t & 16) ? 'SUPER!' : 'COMPUTE', left ? gx0 + 14 : gx0 + gw - 14, gy - 10, full ? '#ffe040' : '#8ad0ff', { align: left ? 'left' : 'right', shadow: '#10081a' });
      var lx = left ? gx0 : gx0 + gw - 11;
      ctx.fillStyle = '#10081a'; ctx.fillRect(lx - 1, gy - 11, 13, 19);
      ctx.fillStyle = goldGrad(ctx, gy - 10, 17); ctx.fillRect(lx - 0.5, gy - 10.5, 12, 18);
      ctx.fillStyle = '#10081a'; ctx.fillRect(lx + 0.5, gy - 9.5, 10, 16);
      Font.drawGradient(ctx, String(lv), lx + 1.5, gy - 5, '#ffffff', lv ? '#40c8ff' : '#404060', {});
      var cx0 = left ? gx0 + 14 : gx0, cw = gw - 14;
      ctx.fillStyle = '#10081a'; ctx.fillRect(cx0 - 1, gy - 1, cw + 2, 8);
      for (var sg = 0; sg < 3; sg++) {
        var sx = cx0 + sg * (cw / 3), sw = cw / 3 - 1;
        ctx.fillStyle = '#141432'; ctx.fillRect(sx, gy, sw, 6);
        var fill = U.clamp(f.meter - sg * 100, 0, 100) / 100;
        if (fill > 0) {
          var mg = ctx.createLinearGradient(0, gy, 0, gy + 6);
          if (fill >= 1) { mg.addColorStop(0, '#e8fbff'); mg.addColorStop(0.4, full && (t >> 2) & 1 ? '#ffffff' : '#40c8ff'); mg.addColorStop(1, '#1050a0'); }
          else { mg.addColorStop(0, '#a0d8ff'); mg.addColorStop(0.5, '#2878c8'); mg.addColorStop(1, '#0c3070'); }
          ctx.fillStyle = mg;
          if (left) ctx.fillRect(sx, gy, sw * fill, 6); else ctx.fillRect(sx + sw * (1 - fill), gy, sw * fill, 6);
          ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(left ? sx : sx + sw * (1 - fill), gy + 0.5, sw * fill, 0.5);
        }
      }
      if (full) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 0.3);
        ctx.fillStyle = '#40c8ff'; ctx.fillRect(cx0 - 2, gy - 2, cw + 4, 10); ctx.restore();
      }
    }
    // timer: jewelled gold plate
    var tt = this.mode === 'training' || NC.settings.timer >= 100 ? '--' : String(Math.max(0, this.timer)).padStart(2, '0');
    var tc = this.timer <= 10 && (t & 16) ? '#ff4040' : '#ffffff';
    ctx.fillStyle = '#10081a'; ctx.fillRect(W / 2 - 15, 3, 30, 25);
    ctx.fillStyle = goldGrad(ctx, 3.5, 24); ctx.fillRect(W / 2 - 14.5, 3.5, 29, 24);
    var tg2 = ctx.createLinearGradient(0, 5, 0, 26); tg2.addColorStop(0, '#2a1840'); tg2.addColorStop(1, '#0a0418');
    ctx.fillStyle = tg2; ctx.fillRect(W / 2 - 13, 5, 26, 21);
    Font.drawGradient(ctx, tt, W / 2, 8, tc, this.timer <= 10 ? '#ff8080' : '#a0c8ff', { align: 'center', scale: 2 });
    // combo counter
    var cs = this.comboShow;
    if (cs && cs.n >= 2) {
      var cx = cs.side === 0 ? 10 : W - 10;
      var slideIn = Math.min(1, cs.t / 6);
      cx += (cs.side === 0 ? -1 : 1) * (1 - slideIn) * 60;
      var big = cs.n >= 3 && cs.t < 8 ? 1 : 0;
      Font.drawGradient(ctx, String(cs.n), cx, 50 - big, '#ffffff', '#ff8030', { align: cs.side === 0 ? 'left' : 'right', outline: '#10081a', scale: 2 });
      var nw = Font.measure ? Font.measure(String(cs.n)) * 2 : String(cs.n).length * 16;
      Font.drawGradient(ctx, 'HITS', cs.side === 0 ? cx + nw + 3 : cx - nw - 3, 58, '#fff8c0', '#ffb030', { align: cs.side === 0 ? 'left' : 'right', outline: '#10081a' });
      if (cs.n >= 4) Font.draw(ctx, cs.n >= 7 ? 'CONTEXT OVERFLOW!' : 'CHAIN OF THOUGHT!', cx, 70, '#ffe040', { align: cs.side === 0 ? 'left' : 'right', outline: '#10081a' });
    }
    if (NC.settings.showInputs && this.mode === 'training') this.drawInputs(ctx);
  };

  // Super cut-in: a slanted band in the fighter's colors slams across the screen with speed
  // lines, the hi-res portrait slides in with overshoot, and the super's name stamps in.
  P.drawCutIn = function (ctx) {
    var fz = this.freeze, f = fz.f;
    var t = fz.t;
    var ease = function (x) { x = U.clamp(x, 0, 1); return 1 - Math.pow(1 - x, 3); };
    var open = ease(t / 6), close = t > fz.dur - 7 ? U.clamp((fz.dur - t) / 7, 0, 1) : 1;
    var hgt = 74 * open * close, cy = 92;
    if (hgt < 1) return;
    var left = f.side === 0;
    var pal = f.ch.costumes[f.ci].pal;
    var skew = 14;
    function band(pad) {
      ctx.beginPath();
      ctx.moveTo(-8, cy - hgt / 2 - pad + (left ? skew : -skew)); ctx.lineTo(W + 8, cy - hgt / 2 - pad + (left ? -skew : skew));
      ctx.lineTo(W + 8, cy + hgt / 2 + pad + (left ? -skew : skew)); ctx.lineTo(-8, cy + hgt / 2 + pad + (left ? skew : -skew));
      ctx.closePath();
    }
    // outer glow edge + white rim
    band(3); ctx.fillStyle = pal.glow; ctx.fill();
    band(1.5); ctx.fillStyle = '#ffffff'; ctx.fill();
    band(0);
    var g = ctx.createLinearGradient(0, cy - hgt / 2, 0, cy + hgt / 2);
    g.addColorStop(0, U.lighten(pal.outfit, 0.25)); g.addColorStop(0.5, pal.outfit); g.addColorStop(1, U.darken(pal.outfit, 0.7));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); band(0); ctx.clip();
    // speed lines streaming away from the portrait
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 22; i++) {
      var ly = cy - 44 + ((i * 37) % 88), len = 30 + (i * 13) % 50;
      var lx = ((i * 71 + t * (18 + i % 5 * 4)) % (W + 120)) - 60;
      if (!left) lx = W - lx;
      ctx.globalAlpha = 0.18 + (i % 3) * 0.08;
      ctx.fillStyle = i % 4 ? '#ffffff' : pal.glow;
      ctx.fillRect(left ? lx : lx - len, ly, len, i % 3 ? 0.5 : 1);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // portrait with overshoot slide
    var p = NC.Sprites.portrait(f.ch, f.ci, 4, 124, 150);
    var sl = t < 10 ? ease(t / 10) * 1.08 : 1.08 - Math.min(0.08, (t - 10) * 0.02);
    var px = left ? -130 + sl * 132 : W + 6 - sl * 132;
    if (left) U.blit(ctx, p, px, cy - 64);
    else { ctx.save(); ctx.translate(px + 124, cy - 64); ctx.scale(-1, 1); U.blit(ctx, p, 0, 0); ctx.restore(); }
    // soft light sweep over the band
    var sw = ((t * 9) % (W + 160)) - 80;
    var lg = ctx.createLinearGradient(sw - 30, 0, sw + 30, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.22)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(sw - 30, 0, 60, H);
    ctx.restore();
    // text stamps in from the far side
    var st = ease((t - 4) / 6);
    if (t > 4) {
      var tx = left ? W - 10 : 10, al = left ? 'right' : 'left';
      var name = f.super.name.length > 22 ? f.super.name.split(',')[0] : f.super.name;
      var off = (1 - st) * 40 * (left ? 1 : -1);
      Font.drawGradient(ctx, 'SUPER', tx + off, cy - 26, '#fff8c0', '#ffb020', { align: al, outline: '#10081a', scale: 2 });
      Font.drawGradient(ctx, name, tx - off, cy - 4, '#ffffff', pal.glow, { align: al, outline: '#10081a' });
      Font.draw(ctx, f.ch.name || f.ch.short, tx - off * 0.5, cy + 10, '#10081a', { align: al });
      Font.draw(ctx, f.ch.name || f.ch.short, tx - off * 0.5 - 1, cy + 9, '#ffffff', { align: al });
    }
  };

  P.drawAnnouncer = function (ctx) {
    var ph = this.phase, t = this.phaseT;
    function big(txt, top, bot, scale) {
      var s = scale || 3;
      var zoom = Math.min(1, t / 6);
      Font.drawGradient(ctx, txt, W / 2, 86 - (s * 4 * zoom) + (1 - zoom) * 20, top, bot, { align: 'center', scale: s, outline: '#10081a', spacing: 0 });
    }
    if (ph === 'round' && t > 8) big(this.roundLabel || 'ROUND 1', '#ffffff', '#f8c030', this.roundLabel && this.roundLabel.length > 8 ? 2 : 3);
    if (ph === 'go') big('FIGHT!', '#ffffff', '#ff4020', 4);
    if (ph === 'ko' && t < 90) big('K.O.', '#ffffff', '#ff2020', 4);
    if (ph === 'timeover') big('TIME OVER', '#ffffff', '#40a0ff', 2);
    if (ph === 'after' && this.winnerSide != null && t < 110) {
      var w = this.fighters[this.winnerSide];
      Font.drawGradient(ctx, w.ch.short + ' WINS', W / 2, 70, '#ffffff', '#f8c030', { align: 'center', scale: 2, outline: '#10081a' });
      if (this.perfect) Font.drawGradient(ctx, 'PERFECT', W / 2, 92, '#ffffff', '#40ff80', { align: 'center', scale: 2, outline: '#10081a' });
    }
    if (ph === 'after' && this.winnerSide == null && t < 110) big('DRAW', '#ffffff', '#c0c0c0', 3);
  };

  P.drawPause = function (ctx) {
    ctx.fillStyle = 'rgba(0,0,16,0.72)'; ctx.fillRect(0, 0, W, H);
    if (this.showMoves) { NC.drawMoveList(ctx, this.fighters[0].ch, this.fighters[1].ch); return; }
    Font.drawGradient(ctx, 'PAUSE', W / 2, 60, '#ffffff', '#8ad0ff', { align: 'center', scale: 2, outline: '#10081a' });
    for (var i = 0; i < PAUSE_ITEMS.length; i++) {
      var sel = i === this.pauseSel;
      Font.draw(ctx, (sel ? '> ' : '  ') + PAUSE_ITEMS[i], W / 2 - 50, 100 + i * 16, sel ? '#ffe040' : '#c0c0d0', { shadow: '#10081a' });
    }
  };

  // Shared move-list renderer (pause menu and select screen help).
  NC.drawMoveList = function (ctx, a, b) {
    var list = b ? [a, b] : [a];
    var inputs = ['QCF+P', 'DP+P', 'QCB+K', 'QCF+K'];
    list.forEach(function (ch, k) {
      var y0 = b ? 14 + k * 104 : 40;
      Font.draw(ctx, ch.name, 8, y0, '#ffe040', { shadow: '#10081a' });
      for (var i = 0; i < ch.specials.length; i++) {
        Font.draw(ctx, inputs[i], 8, y0 + 14 + i * 12, '#8ad0ff');
        Font.draw(ctx, ch.specials[i].name.slice(0, 22), 64, y0 + 14 + i * 12, '#ffffff');
      }
      Font.draw(ctx, 'SUPER', 8, y0 + 14 + 4 * 12, '#ff8040');
      Font.draw(ctx, ch.super.name.slice(0, 22), 64, y0 + 14 + 4 * 12, '#ffffff');
      Font.draw(ctx, '(QCFx2+P OR O+I, 3 BARS)', 64, y0 + 14 + 5 * 12, '#8a8aa0');
    });
    Font.draw(ctx, 'EASY: O + DIR = SPECIAL', W / 2, H - 12, '#8a8aa0', { align: 'center' });
  };
})(window.NC = window.NC || {});
