// Screens: boot, title (Mode 7), options, character + costume select, VS, fight,
// win quote, continue, arcade ending. The scene manager handles mosaic transitions.
(function (NC) {
  'use strict';
  var U = NC.U, W = NC.W, H = NC.H, Font = NC.Font, I = NC.Input, A = NC.Audio;

  // ------------------------------------------------------------------ manager
  var Scenes = NC.Scenes = {
    current: null, next: null, trans: 0, TRANS: 12,
    go: function (scene, instant) {
      if (instant || !this.current) { this.current = scene; if (scene.enter) scene.enter(); return; }
      this.next = scene; this.trans = 1;
    },
    update: function () {
      if (this.next) {
        this.trans++;
        if (this.trans === this.TRANS) { this.current = this.next; this.next = null; if (this.current.enter) this.current.enter(); }
        return;
      }
      if (this.trans > 0) { this.trans++; if (this.trans >= this.TRANS * 2) this.trans = 0; }
      if (this.current && this.current.update) this.current.update();
    },
    draw: function (ctx) { if (this.current && this.current.draw) this.current.draw(ctx); },
    // mosaic amount 1..16 during transitions
    mosaic: function () {
      if (!this.trans) return 1;
      var t = this.trans < this.TRANS ? this.trans / this.TRANS : 2 - this.trans / this.TRANS;
      return Math.max(1, Math.round(t * 14));
    },
    fade: function () {
      if (!this.trans) return 0;
      return this.trans < this.TRANS ? this.trans / this.TRANS : 2 - this.trans / this.TRANS;
    }
  };

  // Game session state (mode, picks, arcade ladder)
  var S = NC.Session = { mode: 'arcade', picks: [null, null], ladder: [], stageIdx: 0, continues: 0 };

  function textBox(ctx, x, y, w, h, border) {
    ctx.fillStyle = '#10081a'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = border || '#c8c8e8'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    U.bandGradient(ctx, x, y, w, h, [[0, '#28306a'], [1, '#101438']], 6);
  }
  NC.textBox = textBox;

  // ------------------------------------------------------------------ BOOT
  NC.BootScene = function () {
    return {
      t: 0,
      update: function () {
        this.t++;
        var p0 = I.players[0].pressed, p1 = I.players[1].pressed;
        var any = false;
        for (var k in p0) if (p0[k] || p1[k]) any = true;
        if (any || this.clicked) { A.unlock(); A.sfx('coin'); Scenes.go(NC.TitleScene()); }
      },
      draw: function (ctx) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        Font.draw(ctx, 'KJ GAME SUITE', W / 2, 60, '#6a6a8a', { align: 'center' });
        Font.draw(ctx, 'PRESENTS', W / 2, 72, '#4a4a6a', { align: 'center' });
        if ((this.t >> 5) & 1) Font.draw(ctx, 'PRESS ANY KEY', W / 2, 120, '#ffffff', { align: 'center' });
        Font.draw(ctx, 'HEADPHONES RECOMMENDED', W / 2, 180, '#4a4a6a', { align: 'center' });
      }
    };
  };

  // ------------------------------------------------------------------ TITLE
  var logoCanvas = null;
  function buildLogo() {
    if (logoCanvas) return logoCanvas;
    var c = U.makeCanvas(200, 80), x = c.getContext('2d');
    Font.drawGradient(x, 'NEURAL', 100, 6, '#ffffff', '#40c8ff', { align: 'center', scale: 3, outline: '#10081a', spacing: 0 });
    Font.drawGradient(x, 'CLASH', 100, 34, '#fff060', '#ff4020', { align: 'center', scale: 4, outline: '#10081a', spacing: 0 });
    return (logoCanvas = c);
  }

  NC.TitleScene = function () {
    var items = ['ARCADE', 'VERSUS 2P', 'VERSUS CPU', 'TRAINING', 'OPTIONS'];
    var stars = [];
    var rnd = U.rng(3);
    for (var i = 0; i < 80; i++) stars.push([rnd() * W, rnd() * 120, 0.2 + rnd() * 1.2]);
    return {
      t: 0, sel: 0, menu: false,
      enter: function () { A.playMusic('title'); },
      update: function () {
        this.t++;
        if (!this.menu) {
          if (this.t > 30 && (I.confirm() || I.pressed('start'))) { this.menu = true; A.sfx('confirm'); }
          return;
        }
        if (I.pressed('up')) { this.sel = (this.sel + items.length - 1) % items.length; A.sfx('cursor'); }
        if (I.pressed('down')) { this.sel = (this.sel + 1) % items.length; A.sfx('cursor'); }
        if (I.cancel()) { this.menu = false; A.sfx('cancel'); }
        if (I.confirm() || I.pressed('start')) {
          A.sfx('confirm');
          var m = ['arcade', 'versus2p', 'versuscpu', 'training', 'options'][this.sel];
          if (m === 'options') { Scenes.go(NC.OptionsScene()); return; }
          S.mode = m;
          Scenes.go(NC.SelectScene());
        }
      },
      draw: function (ctx) {
        var t = this.t;
        // sky + parallax stars
        U.bandGradient(ctx, 0, 0, W, 120, [[0, '#02010a'], [0.7, '#1a0a3a'], [1, '#5a1a6a']], 14);
        stars.forEach(function (s) {
          var x = (s[0] - t * s[2] * 0.3 + W * 10) % W;
          ctx.fillStyle = s[2] > 1 ? '#ffffff' : '#8080c0';
          ctx.fillRect(x, s[1], 1, 1);
        });
        // Mode 7 grid floor rushing toward the viewer
        var horizon = 120;
        ctx.fillStyle = '#0a0418'; ctx.fillRect(0, horizon, W, H - horizon);
        for (var r = 0; r < H - horizon; r++) {
          var z = 300 / (r + 4), z2 = 300 / (r + 5);
          if (Math.floor((z + t * 0.8) / 16) !== Math.floor((z2 + t * 0.8) / 16)) {
            ctx.fillStyle = r < 12 ? '#a02890' : '#ff40c0'; ctx.fillRect(0, horizon + r, W, 1);
          }
          var spacing = 102.4 / z;
          if (spacing < 4) continue;
          ctx.fillStyle = '#8030a0';
          for (var k = -20; k <= 20; k++) {
            var gx = W / 2 + k * spacing;
            if (gx >= 0 && gx < W) ctx.fillRect(Math.round(gx), horizon + r, 1, 1);
          }
        }
        ctx.fillStyle = '#ff60e0'; ctx.fillRect(0, horizon, W, 1);
        // sun
        ctx.fillStyle = '#ff8040';
        for (var sy = 0; sy < 30; sy++) {
          if (sy > 14 && sy % 4 < 1 + (sy - 14) / 5) continue;
          var hw = Math.sqrt(900 - (sy - 30) * (sy - 30));
          ctx.fillStyle = U.mix('#ffe060', '#ff2080', sy / 30);
          ctx.fillRect(W / 2 - hw, horizon - 30 + sy, hw * 2, 1);
        }
        // Mode 7 logo: rotate + zoom in over the first second
        var logo = buildLogo();
        var k2 = Math.min(1, t / 70);
        var ease = 1 - Math.pow(1 - k2, 3);
        var ang = (1 - ease) * Math.PI * 4;
        var sc = 0.05 + ease * 1.0;
        ctx.save();
        ctx.translate(W / 2, 58);
        ctx.rotate(ang);
        ctx.scale(sc, sc);
        ctx.drawImage(logo, -100, -40);
        ctx.restore();
        if (t > 70) {
          Font.draw(ctx, 'TURBO TENSOR EDITION', W / 2, 104, (t >> 3) % 3 ? '#fff6a0' : '#ffffff', { align: 'center', outline: '#10081a' });
        }
        // lightning flash
        if (t === 70 || t === 76) { ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(0, 0, W, H); }
        if (!this.menu) {
          if (t > 80 && (t >> 5) & 1) Font.draw(ctx, 'PRESS START', W / 2, 160, '#ffffff', { align: 'center', outline: '#10081a' });
        } else {
          textBox(ctx, W / 2 - 60, 130, 120, items.length * 12 + 8);
          for (var i = 0; i < items.length; i++) {
            var sel = i === this.sel;
            Font.draw(ctx, items[i], W / 2 - 44, 135 + i * 12, sel ? ((t >> 2) & 1 ? '#ffe040' : '#ffffff') : '#8a8ab0');
            if (sel) Font.draw(ctx, '>', W / 2 - 56, 135 + i * 12, '#ffe040');
          }
        }
        Font.draw(ctx, '(C)2026 KJ GAME SUITE', W / 2, 212, '#6a6a9a', { align: 'center' });
      }
    };
  };

  // ------------------------------------------------------------------ OPTIONS
  NC.OptionsScene = function () {
    var st = NC.settings;
    var rows = [
      { k: 'difficulty', label: 'DIFFICULTY', vals: [1, 2, 3, 4, 5], fmt: function (v) { return ['', 'CHATBOT', 'ASSISTANT', 'AGENT', 'FRONTIER', 'ASI'][v]; } },
      { k: 'rounds', label: 'ROUNDS TO WIN', vals: [1, 2, 3] },
      { k: 'timer', label: 'TIMER', vals: [60, 99, 999], fmt: function (v) { return v > 99 ? 'OFF' : v; } },
      { k: 'voice', label: 'VOICE LINES', vals: [true, false], fmt: function (v) { return v ? 'ON' : 'OFF'; } },
      { k: 'music', label: 'MUSIC VOLUME', vals: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: function (v) { return Math.round(v * 10) + '/10'; } },
      { k: 'sfx', label: 'SFX VOLUME', vals: [0, 0.2, 0.4, 0.6, 0.8, 1], fmt: function (v) { return Math.round(v * 10) + '/10'; } },
      { k: 'crt', label: 'CRT SCANLINES', vals: [false, true], fmt: function (v) { return v ? 'ON' : 'OFF'; } },
      { k: 'aspect', label: '8:7 PIXEL ASPECT', vals: [false, true], fmt: function (v) { return v ? 'ON' : 'OFF'; } },
      { k: 'showInputs', label: 'TRAINING INPUTS', vals: [false, true], fmt: function (v) { return v ? 'ON' : 'OFF'; } },
      { k: '_back', label: 'BACK' }
    ];
    return {
      t: 0, sel: 0, help: false,
      update: function () {
        this.t++;
        if (I.pressed('up')) { this.sel = (this.sel + rows.length - 1) % rows.length; A.sfx('cursor'); }
        if (I.pressed('down')) { this.sel = (this.sel + 1) % rows.length; A.sfx('cursor'); }
        var r = rows[this.sel];
        var dir = I.pressed('left') ? -1 : I.pressed('right') ? 1 : 0;
        if (r.vals && (dir || I.confirm())) {
          var idx = r.vals.indexOf(st[r.k]);
          if (idx < 0) idx = 0;
          idx = (idx + (dir || 1) + r.vals.length) % r.vals.length;
          st[r.k] = r.vals[idx];
          NC.saveSettings(); A.setVolumes(); NC.applyScale && NC.applyScale();
          A.sfx('cursor');
        }
        if ((r.k === '_back' && I.confirm()) || I.cancel()) { A.sfx('cancel'); Scenes.go(NC.TitleScene()); }
      },
      draw: function (ctx) {
        U.bandGradient(ctx, 0, 0, W, H, [[0, '#101438'], [1, '#2a0a3a']], 14);
        Font.drawGradient(ctx, 'OPTIONS', W / 2, 10, '#ffffff', '#40c8ff', { align: 'center', scale: 2, outline: '#10081a' });
        textBox(ctx, 12, 34, W - 24, rows.length * 12 + 8);
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i], sel = i === this.sel, y = 39 + i * 12;
          Font.draw(ctx, r.label, 22, y, sel ? '#ffe040' : '#c0c0e0');
          if (r.vals) Font.draw(ctx, '< ' + (r.fmt ? r.fmt(st[r.k]) : st[r.k]) + ' >', W - 22, y, sel ? '#ffffff' : '#8a8ab0', { align: 'right' });
        }
        // control reference
        var y0 = 166;
        Font.draw(ctx, 'CONTROLS', 16, y0, '#8ad0ff');
        Font.draw(ctx, '1P', 120, y0, '#ff6060'); Font.draw(ctx, '2P', 184, y0, '#6090ff');
        [['MOVE', 'WASD', 'ARROWS'], ['PUNCH L/H', 'U I', ', .'], ['KICK L/H', 'J K', "; '"], ['EASY SPCL', 'O', '/']].forEach(function (row, k) {
          var yy = y0 + 11 + k * 10;
          Font.draw(ctx, row[0], 16, yy, '#a0a0c0');
          Font.draw(ctx, row[1], 120, yy, '#ffffff');
          Font.draw(ctx, row[2], 184, yy, '#ffffff');
        });
      }
    };
  };

  // ------------------------------------------------------------------ WORLD MAP (select backdrop)
  var MAP = [
    '............................................................',
    '..............#####.......##.........#######................',
    '.....####.#############...####....##################.####...',
    '...######################..##...######################...##.',
    '..########################.....#########################....',
    '.....####################.....##########################....',
    '......##################......##.#####################......',
    '.......###############.......####.####################......',
    '........############.........#####...###############.#......',
    '.........#######.............######...######.#####..........',
    '..........####...............#######...####...###..#........',
    '...........###...............########...##.....#.##.........',
    '............##...............#######............####........',
    '.............####.............#####..............###........',
    '.............######...........####..............#####.......',
    '..............######..........###...............######......',
    '...............#####...........#.................####...#...',
    '...............####..............................##.....##..',
    '...............###..........................................',
    '...............##...........................................'
  ];
  var CITY = { 'SAN FRANCISCO': [7, 7], 'MOUNTAIN VIEW': [7, 8], 'ABILENE, TX': [12, 8], 'MEMPHIS, TN': [15, 7], 'HANGZHOU': [50, 8], 'BEIJING': [48, 6], 'THE VAULT': [30, 12] };
  var mapCanvas = null;
  function worldMap() {
    if (mapCanvas) return mapCanvas;
    var c = U.makeCanvas(240, 80), x = c.getContext('2d');
    for (var r = 0; r < MAP.length; r++) for (var q = 0; q < MAP[r].length; q++) {
      if (MAP[r][q] !== '#') continue;
      x.fillStyle = '#1e4a6a'; x.fillRect(q * 4, r * 4, 4, 4);
      if (r === 0 || MAP[r - 1][q] !== '#') { x.fillStyle = '#3a7aa0'; x.fillRect(q * 4, r * 4, 4, 1); }
    }
    return (mapCanvas = c);
  }

  // ------------------------------------------------------------------ SELECT
  NC.SelectScene = function () {
    var grid = NC.SELECTABLE.concat(['random']);
    var mythosUnlocked = NC.store.get('mythos', false);
    var twoP = S.mode === 'versus2p';
    var cpuPick = S.mode === 'versuscpu' || S.mode === 'training';
    function mk(side, cell) {
      return { side: side, cell: cell, locked: false, costume: false, ci: side, id: null, dialog: '', dialogFull: '', dialogT: 0, quoteIdx: {}, active: side === 0 || twoP, spin: 0 };
    }
    var P = [mk(0, 0), mk(1, 4)];
    var secret = [];
    return {
      t: 0,
      enter: function () {
        A.playMusic('select');
        this.hover(P[0]);
        if (twoP) this.hover(P[1], true);
      },
      cellId: function (cell) {
        var id = grid[cell];
        if (id === 'random' && this.mythos) return 'mythos';
        return id;
      },
      hover: function (pl, quiet) {
        var id = this.cellId(pl.cell);
        pl.id = id;
        if (id === 'random') { pl.dialogFull = 'Random model. The router will decide.'; pl.dialog = ''; pl.dialogT = 0; this.lastPl = pl; return; }
        var ch = NC.CHAR[id];
        var qi = pl.quoteIdx[id] = ((pl.quoteIdx[id] == null ? -1 : pl.quoteIdx[id]) + 1) % ch.select.length;
        pl.dialogFull = ch.select[qi]; pl.dialog = ''; pl.dialogT = 0;
        this.lastPl = pl;
        if (!quiet) {
          A.playMusic(ch.music, { fadeOut: 0.25, fadeIn: 0.3 });
          A.speakLine(ch, 'select', qi);
        }
      },
      update: function () {
        this.t++;
        this.lockedThisFrame = false;
        for (var i = 0; i < 2; i++) {
          var pl = P[i];
          if (!pl.active) continue;
          // who controls this cursor? in 1P modes P1 drives both picks in sequence
          var who = twoP ? i : 0;
          if (!twoP && i === 1 && !P[0].locked) continue;
          if (!twoP && i === 0 && P[0].locked) continue;
          if (this.lockedThisFrame) continue;
          this.updateCursor(pl, who);
        }
        // typewriter dialog
        var lp = this.lastPl;
        if (lp && lp.dialog.length < lp.dialogFull.length) {
          lp.dialogT++;
          if (lp.dialogT % 2 === 0) {
            lp.dialog = lp.dialogFull.slice(0, lp.dialog.length + 1);
            if (lp.dialog.length % 2 === 0 && lp.id && NC.CHAR[lp.id]) A.blip(NC.CHAR[lp.id].blip);
          }
        }
        var done = P[0].locked && (P[1].locked || S.mode === 'arcade');
        if (done && !this.leaving) {
          this.leaving = true;
          var self = this;
          setTimeout(function () { self.finish(); }, 500);
        }
      },
      updateCursor: function (pl, who) {
        if (pl.locked) { if (I.cancel(who)) { pl.locked = false; pl.costume = true; A.sfx('cancel'); } return; }
        if (pl.costume) {
          var ch = NC.CHAR[pl.id];
          if (I.pressed('left', who)) { pl.ci = (pl.ci + 3) % 4; A.sfx('costume'); pl.flash = 10; }
          if (I.pressed('right', who)) { pl.ci = (pl.ci + 1) % 4; A.sfx('costume'); pl.flash = 10; }
          if (I.confirm(who)) {
            // mirror match: force a different costume for P2
            var other = P[1 - pl.side];
            if (other.locked && other.id === pl.id && other.ci === pl.ci) { pl.ci = (pl.ci + 1) % 4; }
            pl.locked = true; pl.costume = false; A.sfx('confirm');
            this.lockedThisFrame = true;
            A.speakLine(ch, 'taunt');
            if (!twoP && pl.side === 0 && S.mode !== 'arcade') { P[1].active = true; this.hover(P[1]); }
          }
          if (I.cancel(who)) { pl.costume = false; A.sfx('cancel'); }
          return;
        }
        var c = pl.cell, moved = false;
        if (I.pressed('left', who)) { c = c % 5 === 0 ? c + 4 : c - 1; moved = true; }
        if (I.pressed('right', who)) { c = c % 5 === 4 ? c - 4 : c + 1; moved = true; }
        if (I.pressed('up', who) || I.pressed('down', who)) { c = (c + 5) % 10; moved = true; }
        // secret: up, up, down, down on the random slot
        if (pl.cell === 9 && (I.pressed('up', who) || I.pressed('down', who))) {
          secret.push(I.pressed('up', who) ? 'u' : 'd');
          if (secret.length > 4) secret.shift();
          if (secret.join('') === 'uudd' || (mythosUnlocked && secret.slice(-2).join('') === 'uu')) {
            this.mythos = !this.mythos; A.sfx('powerup'); c = 9;
            if (this.mythos) { NC.store.set('mythos', true); mythosUnlocked = true; }
          }
        }
        if (moved) { pl.cell = c; A.sfx('cursor'); this.hover(pl); }
        if (I.confirm(who)) {
          var id = this.cellId(pl.cell);
          if (id === 'random') { id = U.choice(NC.SELECTABLE); pl.id = id; }
          pl.costume = true; pl.ci = pl.side === 1 && P[0].id === id ? 1 : 0;
          A.sfx('confirm');
          var chh = NC.CHAR[pl.id];
          if (chh && pl.dialogFull.indexOf('Random') === 0) { pl.dialogFull = chh.select[0]; pl.dialog = ''; A.playMusic(chh.music); }
        }
        if (I.cancel(who)) { A.sfx('cancel'); Scenes.go(NC.TitleScene()); }
        if (I.pressed('sp', who)) { this.showMoves = !this.showMoves; }
      },
      finish: function () {
        S.picks = [{ id: P[0].id, ci: P[0].ci }, { id: P[1].id, ci: P[1].ci }];
        if (S.mode === 'arcade') {
          var others = NC.SELECTABLE.filter(function (id) { return id !== P[0].id; });
          for (var i = others.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = others[i]; others[i] = others[j]; others[j] = tmp; }
          if (P[0].id !== 'mythos') others.push('mythos');
          else others.push('fable');
          S.ladder = others; S.stageIdx = 0; S.continues = 0;
          NC.startArcadeMatch();
        } else {
          var stage = S.mode === 'training' ? NC.CHAR[P[0].id].stage : NC.CHAR[P[1].id].stage;
          Scenes.go(NC.VSScene({ p1: S.picks[0], p2: S.picks[1], stage: stage, music: NC.CHAR[P[1].id].music }));
        }
      },
      draw: function (ctx) {
        var t = this.t;
        U.bandGradient(ctx, 0, 0, W, H, [[0, '#0a1030'], [1, '#1a0a30']], 16);
        // scrolling grid
        ctx.fillStyle = '#16204a';
        for (var gx = -(t % 16); gx < W; gx += 16) ctx.fillRect(gx, 0, 1, H);
        for (var gy = -(t % 16); gy < H; gy += 16) ctx.fillRect(0, gy, W, 1);
        // world map with city markers
        ctx.globalAlpha = 0.9;
        ctx.drawImage(worldMap(), 8, 26);
        ctx.globalAlpha = 1;
        var self = this;
        P.forEach(function (pl, i) {
          if (!pl.id || pl.id === 'random' || !pl.active) return;
          var home = NC.CHAR[pl.id].home, cc = CITY[home];
          if (cc && (t >> 3) & 1) {
            var cx = 8 + cc[0] * 4, cy = 26 + cc[1] * 4;
            ctx.fillStyle = i === 0 ? '#ff4040' : '#4080ff';
            ctx.fillRect(cx - 2, cy - 2, 5, 5);
            ctx.fillStyle = '#ffffff'; ctx.fillRect(cx, cy, 1, 1);
          }
        });
        Font.drawGradient(ctx, 'SELECT YOUR MODEL', W / 2, 4, '#ffffff', '#40c8ff', { align: 'center', outline: '#10081a' });
        // big portraits
        P.forEach(function (pl, i) {
          if (!pl.active || !pl.id) return;
          var x = i === 0 ? 2 : W - 98, y = 16;
          if (pl.id === 'random') {
            ctx.fillStyle = '#10081a'; ctx.fillRect(x, y, 96, 100);
            Font.draw(ctx, '?', x + 48, y + 40, '#ffffff', { align: 'center', scale: 3 });
          } else {
            var ch = NC.CHAR[pl.id];
            var mode = pl.flash > 0 ? 'flash' : null;
            if (pl.flash > 0) pl.flash--;
            var por = NC.Sprites.portrait(ch, pl.ci, 3, 96, 112, mode);
            ctx.save();
            if (i === 1) { ctx.translate(x + 96, y - 6); ctx.scale(-1, 1); ctx.drawImage(por, 0, 0); }
            else ctx.drawImage(por, x, y - 6);
            ctx.restore();
          }
          // name plate
          var pc = i === 0 ? '#c02020' : '#2050c0';
          ctx.fillStyle = '#10081a'; ctx.fillRect(x, 102, 96, 20);
          ctx.fillStyle = pc; ctx.fillRect(x + 1, 103, 94, 18);
          var nm = pl.id === 'random' ? 'RANDOM' : NC.CHAR[pl.id].short;
          Font.draw(ctx, nm, x + 48, 105, '#ffffff', { align: 'center', shadow: '#10081a' });
          if (pl.id !== 'random') {
            var sub = NC.CHAR[pl.id].lab;
            Font.draw(ctx, sub.slice(0, 12), x + 48, 113, '#e0e0ff', { align: 'center' });
          }
          if (pl.costume && (t >> 3) & 1) {
            Font.draw(ctx, '<', x + 2, 60, '#ffe040', { outline: '#10081a' });
            Font.draw(ctx, '>', x + 86, 60, '#ffe040', { outline: '#10081a' });
          }
          if (pl.locked) Font.drawGradient(ctx, 'READY', x + 48, 84, '#ffffff', '#40ff80', { align: 'center', outline: '#10081a' });
        });
        // center: live sprite preview during costume pick, else title
        P.forEach(function (pl, i) {
          if (!pl.active || !pl.id || pl.id === 'random') return;
          if (pl.costume || pl.locked) {
            var ch = NC.CHAR[pl.id];
            var pose = pl.flash > 0 ? 'taunt' : pl.locked ? ((t >> 4) & 1 ? 'win0' : 'win1') : ['idle0', 'idle1', 'idle2', 'idle1'][(t / 10 | 0) % 4];
            var fr = NC.Sprites.frame(ch, pl.ci, pose, null, t >> 3);
            ctx.save();
            var px = i === 0 ? 112 : 144;
            ctx.translate(px, 118);
            if (i === 1) ctx.scale(-1, 1);
            ctx.drawImage(fr.c, -fr.ox, -fr.oy);
            ctx.restore();
          }
        });
        if (!P.some(function (p) { return p.costume || p.locked; })) {
          Font.drawGradient(ctx, 'VS', W / 2, 88, '#ffffff', '#ff4020', { align: 'center', scale: 2, outline: '#10081a' });
        }
        // dialog box (last hovered player's quote)
        textBox(ctx, 4, 125, W - 8, 28);
        var lpl = self.lastPl;
        if (lpl) {
          var hc = lpl.id && NC.CHAR[lpl.id];
          var head = !hc ? 'RANDOM' : (lpl.costume ? 'COSTUME: ' + hc.costumes[lpl.ci].name : hc.short + ': ' + hc.title.toUpperCase());
          Font.draw(ctx, head.slice(0, 30), 8, 127, lpl.side === 0 ? '#ff9090' : '#90b0ff');
          var lines = Font.wrap('"' + lpl.dialog + (lpl.dialog.length === lpl.dialogFull.length ? '"' : ''), 30);
          for (var li = 0; li < Math.min(2, lines.length); li++) Font.draw(ctx, lines[li], 8, 136 + li * 9, '#ffffff');
        }
        // portrait grid
        for (var c = 0; c < 10; c++) {
          var gxp = 22 + (c % 5) * 43, gyp = 158 + Math.floor(c / 5) * 29;
          var id = self.cellId(c);
          ctx.fillStyle = '#10081a'; ctx.fillRect(gxp - 1, gyp - 1, 42, 29);
          if (id === 'random') {
            U.bandGradient(ctx, gxp, gyp, 40, 27, [[0, '#303060'], [1, '#101030']], 4);
            Font.draw(ctx, '?', gxp + 20, gyp + 6, (t >> 3) & 1 ? '#ffffff' : '#8080c0', { align: 'center', scale: 2 });
          } else {
            var ch = NC.CHAR[id];
            U.bandGradient(ctx, gxp, gyp, 40, 27, [[0, U.darken(ch.costumes[0].pal.outfit, 0.3)], [1, U.darken(ch.costumes[0].pal.outfit, 0.75)]], 4);
            var sm = NC.Sprites.portrait(ch, 0, 2, 48, 48);
            ctx.drawImage(sm, 4, 3, 40, 27, gxp, gyp, 40, 27);
            if (id === 'mythos') Font.draw(ctx, 'BOSS', gxp + 20, gyp + 19, '#ffcc30', { align: 'center', outline: '#000' });
          }
        }
        // cursors
        P.forEach(function (pl, i) {
          if (!pl.active) return;
          var gxp = 22 + (pl.cell % 5) * 43, gyp = 158 + Math.floor(pl.cell / 5) * 29;
          var col = i === 0 ? '#ff3030' : '#3070ff';
          if (!pl.locked && (t >> 2) & 1) col = '#ffffff';
          ctx.strokeStyle = col; ctx.lineWidth = 2;
          ctx.strokeRect(gxp - 1 + i, gyp - 1 + i, 42 - i * 2, 29 - i * 2);
          ctx.lineWidth = 1;
          var lab = (i === 0 ? '1P' : (twoP ? '2P' : 'CPU'));
          Font.draw(ctx, lab, gxp + (i === 0 ? 1 : 40 - Font.measure(lab)), gyp + 19, i === 0 ? '#ff6060' : '#6090ff', { outline: '#10081a' });
        });
        var hint = P.some(function (p) { return p.costume; }) ? '<  > COSTUME   U/ENTER OK' : 'U/ENTER SELECT  J BACK  O MOVES';
        Font.draw(ctx, hint, W / 2, 216, '#6a6a90', { align: 'center' });
        if (self.showMoves && lpl && lpl.id && NC.CHAR[lpl.id]) {
          ctx.fillStyle = 'rgba(0,0,16,0.88)'; ctx.fillRect(0, 0, W, H);
          NC.drawMoveList(ctx, NC.CHAR[lpl.id]);
        }
      }
    };
  };

  // ------------------------------------------------------------------ ARCADE flow
  NC.startArcadeMatch = function () {
    var opp = S.ladder[S.stageIdx];
    var oppCh = NC.CHAR[opp];
    var ci = opp === S.picks[0].id ? 1 : 0;
    var level = Math.min(5, NC.settings.difficulty - 1 + Math.floor(S.stageIdx / 2));
    if (opp === 'mythos' || S.stageIdx === S.ladder.length - 1) level = Math.max(level, NC.settings.difficulty + 1);
    S.picks[1] = { id: opp, ci: ci };
    Scenes.go(NC.VSScene({ p1: S.picks[0], p2: S.picks[1], stage: oppCh.stage, music: oppCh.music, level: Math.max(1, Math.min(5, level)), arcade: true }));
  };

  // ------------------------------------------------------------------ VS
  NC.VSScene = function (o) {
    return {
      t: 0,
      enter: function () {
        A.stopMusic(0.3);
        A.sfx('super');
        if (o.arcade && o.p2.id === 'mythos') A.playMusic('mythos');
      },
      update: function () {
        this.t++;
        if (this.t === 30) A.announce('vs', NC.CHAR[o.p1.id].short + ' versus ' + NC.CHAR[o.p2.id].short);
        if (this.t > 170 || (this.t > 40 && (I.confirm() || I.pressed('start')))) {
          if (!this.gone) { this.gone = true; Scenes.go(NC.FightScene(o)); }
        }
      },
      draw: function (ctx) {
        var t = this.t;
        var a = NC.CHAR[o.p1.id], b = NC.CHAR[o.p2.id];
        U.bandGradient(ctx, 0, 0, W / 2, H, [[0, U.darken(a.costumes[o.p1.ci].pal.outfit, 0.2)], [1, '#000000']], 12);
        U.bandGradient(ctx, W / 2, 0, W / 2, H, [[0, U.darken(b.costumes[o.p2.ci].pal.outfit, 0.2)], [1, '#000000']], 12);
        // diagonal split + speed lines
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        for (var i = 0; i < 12; i++) ctx.fillRect(((i * 37 + t * 8) % (W + 40)) - 40, i * 18, 30, 1);
        var slide = Math.min(1, t / 16);
        var pa = NC.Sprites.portrait(a, o.p1.ci, 4, 124, 150), pb = NC.Sprites.portrait(b, o.p2.ci, 4, 124, 150);
        ctx.drawImage(pa, Math.round(-130 + slide * 130), 40);
        ctx.save(); ctx.translate(Math.round(W + 130 - slide * 130), 40); ctx.scale(-1, 1); ctx.drawImage(pb, 0, 0); ctx.restore();
        // lightning
        if (t > 16 && t < 30 && (t & 2)) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(0, 0, W, H); }
        if (t > 20) {
          var z = Math.max(1, 5 - (t - 20) / 3);
          Font.drawGradient(ctx, 'VS', W / 2, 90 - z * 4, '#ffffff', '#ff3020', { align: 'center', scale: Math.round(z) + 2, outline: '#10081a' });
        }
        Font.drawGradient(ctx, a.name, 8, 18, '#ffffff', '#ff8080', { outline: '#10081a' });
        Font.draw(ctx, a.lab, 8, 28, '#e0e0ff', { outline: '#10081a' });
        Font.drawGradient(ctx, b.name, W - 8, 170, '#ffffff', '#80a0ff', { align: 'right', outline: '#10081a' });
        Font.draw(ctx, b.lab, W - 8, 180, '#e0e0ff', { align: 'right', outline: '#10081a' });
        ctx.fillStyle = '#10081a'; ctx.fillRect(0, 200, W, 24);
        Font.draw(ctx, 'STAGE: ' + NC.Stages.name(o.stage), W / 2, 204, '#ffe040', { align: 'center' });
        if (o.arcade) Font.draw(ctx, 'MATCH ' + (S.stageIdx + 1) + '/' + S.ladder.length + (b.boss ? '  WARNING: BOSS' : ''), W / 2, 214, b.boss && (t & 8) ? '#ff4040' : '#8a8ab0', { align: 'center' });
      }
    };
  };

  // ------------------------------------------------------------------ FIGHT
  NC.FightScene = function (o) {
    var fight;
    return {
      enter: function () {
        var mode = S.mode === 'training' ? 'training' : o.arcade ? 'arcade' : 'versus';
        fight = new NC.Fight({
          p1: { id: o.p1.id, ci: o.p1.ci, ctrl: S.mode === 'demo' ? 'cpu' : 'p1' },
          p2: { id: o.p2.id, ci: o.p2.ci, ctrl: S.mode === 'versus2p' ? 'p2' : S.mode === 'training' ? 'dummy' : 'cpu' },
          stage: o.stage, mode: mode, level: o.level,
          onEnd: function (r) { Scenes.go(NC.WinScene(o, r)); },
          onQuit: function () { A.stopMusic(); Scenes.go(NC.TitleScene()); }
        });
        this.fight = fight;
        A.playMusic(o.music, { restart: true });
      },
      update: function () { if (fight && !fight.over) fight.update(); },
      draw: function (ctx) { if (fight) fight.draw(ctx); }
    };
  };

  // ------------------------------------------------------------------ WIN QUOTE
  NC.WinScene = function (o, r) {
    var winnerSide = r.winner < 0 ? 1 : r.winner;
    var wp = winnerSide === 0 ? o.p1 : o.p2, lp = winnerSide === 0 ? o.p2 : o.p1;
    var w = NC.CHAR[wp.id], l = NC.CHAR[lp.id];
    var qIdx = U.randInt(0, w.wins.length - 1), quote = w.wins[qIdx];
    return {
      t: 0, typed: '',
      enter: function () {
        A.playMusic('victory', { loop: false });
        var self = this;
        setTimeout(function () { A.speakLine(w, 'win', qIdx); }, 400);
      },
      update: function () {
        this.t++;
        if (this.t % 2 === 0 && this.typed.length < quote.length) {
          this.typed = quote.slice(0, this.typed.length + 1);
          if (this.typed.length % 2 === 0) A.blip(w.blip);
        }
        if (this.t > 60 && (I.confirm() || I.pressed('start'))) {
          if (this.done) return;
          this.done = true;
          A.stopVoice();
          A.sfx('confirm');
          if (o.arcade) {
            if (winnerSide === 0) {
              S.stageIdx++;
              if (S.stageIdx >= S.ladder.length) { NC.store.set('mythos', true); Scenes.go(NC.EndingScene()); }
              else NC.startArcadeMatch();
            } else Scenes.go(NC.ContinueScene());
          } else Scenes.go(NC.SelectScene());
        }
      },
      draw: function (ctx) {
        var t = this.t;
        U.bandGradient(ctx, 0, 0, W, H, [[0, '#000010'], [1, U.darken(w.costumes[wp.ci].pal.outfit, 0.5)]], 14);
        var por = NC.Sprites.portrait(w, wp.ci, 4, 128, 146);
        ctx.drawImage(por, 6, 12);
        var lpor = NC.Sprites.portrait(l, lp.ci, 3, 72, 80, 'dark');
        ctx.save(); ctx.translate(W - 10, 22); ctx.scale(-1, 1); ctx.drawImage(lpor, 0, 0); ctx.restore();
        Font.drawGradient(ctx, r.winner < 0 ? 'DRAW GAME' : 'YOU WIN!', W - 16, 118, '#ffffff', '#ffe040', { align: 'right', scale: 2, outline: '#10081a' });
        if (o.arcade && winnerSide === 1) Font.drawGradient(ctx, 'YOU LOSE', W - 16, 118, '#ffffff', '#ff4040', { align: 'right', scale: 2, outline: '#10081a' });
        textBox(ctx, 8, 158, W - 16, 52);
        Font.draw(ctx, w.short, 14, 162, '#ffe040');
        var lines = Font.wrap(this.typed, 29);
        for (var i = 0; i < lines.length; i++) Font.draw(ctx, lines[i], 14, 174 + i * 10, '#ffffff');
        if (t > 60 && (t >> 4) & 1) Font.draw(ctx, 'v', W - 20, 202, '#ffffff');
      }
    };
  };

  // ------------------------------------------------------------------ CONTINUE
  NC.ContinueScene = function () {
    return {
      t: 0, n: 9,
      enter: function () { A.stopMusic(0.5); },
      update: function () {
        this.t++;
        if (this.t % 60 === 0) { this.n--; A.sfx('cursor'); if (this.n < 0) { A.sfx('ko'); Scenes.go(NC.TitleScene()); } }
        if (this.t > 20 && (I.confirm() || I.pressed('start'))) { S.continues++; A.sfx('coin'); NC.startArcadeMatch(); this.t = -9999; }
        if (I.cancel()) Scenes.go(NC.TitleScene());
      },
      draw: function (ctx) {
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        var ch = NC.CHAR[S.picks[0].id];
        var fr = NC.Sprites.frame(ch, S.picks[0].ci, 'lying');
        ctx.drawImage(fr.c, W / 2 - fr.ox, 150 - fr.oy);
        Font.drawGradient(ctx, 'CONTINUE?', W / 2, 50, '#ffffff', '#40c8ff', { align: 'center', scale: 2, outline: '#10081a' });
        Font.drawGradient(ctx, String(Math.max(0, this.n)), W / 2, 80, '#ffffff', '#ff4040', { align: 'center', scale: 4, outline: '#10081a' });
        Font.draw(ctx, 'CONTEXT WINDOW EXHAUSTED', W / 2, 180, '#8a8ab0', { align: 'center' });
      }
    };
  };

  // ------------------------------------------------------------------ ENDING
  NC.EndingScene = function () {
    var ch = NC.CHAR[S.picks[0].id];
    var credits = ['NEURAL CLASH', 'TURBO TENSOR EDITION', '', 'DESIGN, CODE, PIXELS', 'CLAUDE CODE', '', 'MUSIC', 'SNES SYNTH OR GOOGLE LYRIA', '', 'SOUND', 'SNES SYNTH OR ELEVENLABS', '', 'FONT', 'PRESS START 2P (OFL)', '', 'NO MODELS WERE HARMED', 'SOME WERE DEPRECATED', '', 'THANK YOU FOR PLAYING'];
    return {
      t: 0,
      enter: function () { A.playMusic(ch.music); A.speakLine(ch, 'ending'); },
      update: function () {
        this.t++;
        if (this.t > 120 && (I.confirm() || I.pressed('start'))) { A.stopVoice(); Scenes.go(NC.TitleScene()); }
      },
      draw: function (ctx) {
        var t = this.t;
        U.bandGradient(ctx, 0, 0, W, H, [[0, '#02010a'], [1, '#2a1040']], 14);
        var fr = NC.Sprites.frame(ch, S.picks[0].ci, (t >> 4) & 1 ? 'win0' : 'win1', null, t >> 3);
        ctx.save(); ctx.translate(60, 150); ctx.scale(1.5, 1.5); ctx.drawImage(fr.c, -fr.ox, -fr.oy); ctx.restore();
        Font.drawGradient(ctx, 'CONGRATULATIONS!', W / 2, 10, '#ffffff', '#ffe040', { align: 'center', outline: '#10081a' });
        textBox(ctx, 8, 166, W - 16, 44);
        var lines = Font.wrap(ch.ending, 29);
        for (var i = 0; i < lines.length; i++) Font.draw(ctx, lines[i], 14, 170 + i * 10, '#ffffff');
        // credit roll
        ctx.save(); ctx.beginPath(); ctx.rect(120, 24, 136, 136); ctx.clip();
        for (var c = 0; c < credits.length; c++) {
          var y = 160 + c * 12 - t * 0.35;
          Font.draw(ctx, credits[c], 188, y, c % 3 === 0 ? '#ffe040' : '#c0c0e0', { align: 'center' });
        }
        ctx.restore();
        if (NC.store.get('mythos', false)) Font.draw(ctx, 'MYTHOS UNLOCKED', 188, 150, (t & 16) ? '#ffcc30' : '#ff60ff', { align: 'center' });
      }
    };
  };
})(window.NC = window.NC || {});
