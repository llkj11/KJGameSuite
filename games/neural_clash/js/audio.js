// SNES-style audio: an 8-voice-ish WebAudio synth with the S-DSP "echo", a tracker
// sequencer for songs, synthesized SFX, speech for voice lines, and a loader that
// swaps in generated assets (Lyria music, ElevenLabs SFX/voices) listed in
// assets/manifest.json whenever they exist.
(function (NC) {
  'use strict';

  var A = NC.Audio = {};
  var ctx = null, master, musicGain, sfxGain, musicBus, echoIn, voiceGain;
  var noiseBuf = null;
  var waves = {};
  var manifest = { music: {}, sfx: {}, voice: {} };
  var buffers = {};      // url -> AudioBuffer | 'loading' | 'failed'
  var current = null;    // current music player
  var currentId = null;

  // ------------------------------------------------------------------ setup
  A.init = function () {
    if (ctx) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC({ sampleRate: 32000 }); } // the SNES DSP runs at 32 kHz
    catch (e) { ctx = new AC(); }

    master = ctx.createDynamicsCompressor();
    master.threshold.value = -14; master.ratio.value = 3; master.attack.value = 0.005; master.release.value = 0.2;
    master.connect(ctx.destination);
    A._master = master;

    musicGain = ctx.createGain(); musicGain.connect(master);
    sfxGain = ctx.createGain(); sfxGain.connect(master);
    voiceGain = ctx.createGain(); voiceGain.connect(master);

    // Gaussian-interpolation-ish low pass on the synth bus.
    var gauss = ctx.createBiquadFilter();
    gauss.type = 'lowpass'; gauss.frequency.value = 7600; gauss.Q.value = 0.4;
    gauss.connect(musicGain);
    musicBus = ctx.createGain(); musicBus.connect(gauss);

    // Echo: feedback delay with a filtered return (the S-DSP's FIR), fed by a send.
    echoIn = ctx.createGain(); echoIn.gain.value = 0.32;
    var delay = ctx.createDelay(1.0); delay.delayTime.value = 0.23;
    var fb = ctx.createGain(); fb.gain.value = 0.38;
    var fir = ctx.createBiquadFilter(); fir.type = 'lowpass'; fir.frequency.value = 2400;
    echoIn.connect(delay); delay.connect(fir); fir.connect(fb); fb.connect(delay);
    fir.connect(gauss);
    A._echo = { delay: delay, fb: fb, send: echoIn };

    // Shared noise buffer (1 s white noise).
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    buildWaves();
    A.setVolumes();
    loadManifest();
    setInterval(tick, 25);
  };

  A.unlock = function () {
    A.init();
    if (ctx && ctx.state !== 'running') ctx.resume();
  };
  A.ready = function () { return !!ctx && ctx.state === 'running'; };
  A.now = function () { return ctx ? ctx.currentTime : 0; };

  A.setVolumes = function () {
    if (!ctx) return;
    musicGain.gain.value = NC.settings.music * 0.55;
    sfxGain.gain.value = NC.settings.sfx * 0.7;
    voiceGain.gain.value = NC.settings.sfx;
  };

  // ------------------------------------------------------------------ waves
  function periodic(harm) {
    var real = new Float32Array(harm.length + 1), imag = new Float32Array(harm.length + 1);
    for (var i = 0; i < harm.length; i++) imag[i + 1] = harm[i];
    return ctx.createPeriodicWave(real, imag);
  }
  function buildWaves() {
    var saw = [], sq = [], pulse25 = [], organ = [0.9, 0.7, 0.5, 0, 0.45, 0, 0.3, 0.35, 0, 0.2];
    var harpsi = [], clav = [];
    for (var n = 1; n <= 24; n++) {
      saw.push(1 / n);
      sq.push(n % 2 ? 1 / n : 0);
      pulse25.push(Math.sin(n * Math.PI * 0.25) * 2 / (n * Math.PI));
      harpsi.push((1 / n) * (n % 3 === 0 ? 0.4 : 1) * (n > 6 ? 1.3 : 1));
      clav.push(Math.sin(n * Math.PI * 0.12) / n);
    }
    waves.saw = periodic(saw);
    waves.square = periodic(sq);
    waves.pulse = periodic(pulse25);
    waves.organ = periodic(organ);
    waves.harpsi = periodic(harpsi);
    waves.clav = periodic(clav);
    waves.soft = periodic([1, 0.3, 0.12, 0.05]);
    waves.choir = periodic([1, 0.5, 0.25, 0.45, 0.3, 0.12, 0.08, 0.05]);
    waves.brass = periodic([1, 0.8, 0.65, 0.5, 0.4, 0.3, 0.22, 0.16, 0.12, 0.08]);
  }

  // ------------------------------------------------------------------ instruments
  // Each instrument: oscillator recipe + envelope + optional filter envelope.
  var INST = {
    brass:    { wave: 'brass', uni: [-5, 5], a: 0.03, d: 0.25, s: 0.7, r: 0.12, lp: 1400, lpEnv: 2600, lpD: 0.3, vol: 0.16, vib: [5.5, 8, 0.25] },
    horn:     { wave: 'soft', uni: [-4, 4], a: 0.06, d: 0.3, s: 0.8, r: 0.2, lp: 1200, vol: 0.2, vib: [5, 6, 0.3] },
    strings:  { wave: 'saw', uni: [-9, 0, 9], a: 0.14, d: 0.3, s: 0.85, r: 0.35, lp: 2600, vol: 0.075, vib: [5, 7, 0.35] },
    pad:      { wave: 'saw', uni: [-12, 12], a: 0.3, d: 0.5, s: 0.8, r: 0.6, lp: 1500, vol: 0.06 },
    choir:    { wave: 'choir', uni: [-7, 7], a: 0.25, d: 0.4, s: 0.85, r: 0.5, lp: 1800, bp: 900, vol: 0.12, vib: [4.5, 6, 0.3] },
    organ:    { wave: 'organ', uni: [0, 3], a: 0.01, d: 0.1, s: 0.95, r: 0.12, lp: 4000, vol: 0.09 },
    harpsi:   { wave: 'harpsi', a: 0.002, d: 0.6, s: 0.0, r: 0.12, lp: 6000, vol: 0.14 },
    pluck:    { wave: 'soft', a: 0.002, d: 0.45, s: 0.0, r: 0.1, lp: 3200, lpEnv: 2000, lpD: 0.1, vol: 0.22, bend: -30 },
    guzheng:  { wave: 'harpsi', a: 0.002, d: 0.8, s: 0.0, r: 0.2, lp: 2600, vol: 0.18, vib: [6, 14, 0.25] },
    marimba:  { fm: [4, 1.2, 0.08], a: 0.002, d: 0.35, s: 0, r: 0.08, vol: 0.24 },
    bell:     { fm: [3.5, 3, 0.9], a: 0.002, d: 1.2, s: 0, r: 0.3, vol: 0.14 },
    epiano:   { fm: [1, 1.6, 0.6], a: 0.003, d: 0.9, s: 0.2, r: 0.25, vol: 0.18 },
    lead:     { wave: 'pulse', a: 0.01, d: 0.2, s: 0.7, r: 0.08, lp: 3800, vol: 0.12, vib: [6, 12, 0.18] },
    square:   { wave: 'square', a: 0.005, d: 0.15, s: 0.6, r: 0.06, lp: 4000, vol: 0.1, vib: [6, 10, 0.2] },
    flute:    { wave: 'soft', a: 0.05, d: 0.2, s: 0.8, r: 0.12, lp: 3000, vol: 0.2, vib: [5, 14, 0.2], breath: 0.03 },
    erhu:     { wave: 'saw', a: 0.08, d: 0.2, s: 0.8, r: 0.15, lp: 1900, bp: 1100, vol: 0.14, vib: [5.5, 22, 0.1], slide: 0.06 },
    supersaw: { wave: 'saw', uni: [-18, -7, 0, 7, 18], a: 0.01, d: 0.25, s: 0.6, r: 0.15, lp: 4200, vol: 0.05 },
    guitar:   { wave: 'saw', uni: [-6, 6], a: 0.005, d: 0.3, s: 0.7, r: 0.08, dist: 18, lp: 2400, vol: 0.06 },
    clav:     { wave: 'clav', a: 0.002, d: 0.22, s: 0.1, r: 0.05, lp: 3500, lpEnv: 2500, lpD: 0.08, vol: 0.16 },
    slap:     { wave: 'square', a: 0.002, d: 0.22, s: 0.35, r: 0.06, lp: 700, lpEnv: 2400, lpD: 0.07, vol: 0.2 },
    bass:     { wave: 'soft', uni: [0, 1200], a: 0.004, d: 0.3, s: 0.6, r: 0.07, lp: 900, lpEnv: 700, lpD: 0.12, vol: 0.26 },
    synbass:  { wave: 'saw', uni: [-6, 6], a: 0.004, d: 0.25, s: 0.5, r: 0.07, lp: 500, lpEnv: 1800, lpD: 0.15, vol: 0.14 },
    subbass:  { wave: 'soft', a: 0.01, d: 0.3, s: 0.85, r: 0.1, lp: 600, vol: 0.22 },
    timpani:  { wave: 'soft', a: 0.004, d: 0.7, s: 0, r: 0.2, lp: 500, vol: 0.4, bend: -60 }
  };
  A.INST = INST;

  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  // Schedule one note. dest defaults to the music bus (with echo send).
  function playNote(instName, midi, t, dur, vel, pan, dest, echo) {
    var I = INST[instName];
    if (!I || !ctx) return;
    vel = vel == null ? 1 : vel;
    var f = mtof(midi);
    var out = ctx.createGain();
    var peak = I.vol * vel;
    var endT = t + dur;
    // envelope
    out.gain.setValueAtTime(0.0001, t);
    out.gain.linearRampToValueAtTime(peak, t + I.a);
    out.gain.setTargetAtTime(peak * I.s + 0.0001, t + I.a, I.d / 3);
    var relEnd = endT + I.r;
    if (I.s === 0) { relEnd = Math.min(relEnd, t + I.a + I.d * 1.6 + I.r); }
    out.gain.setTargetAtTime(0.0001, Math.max(endT, t + I.a + 0.001), I.r / 3);

    var node = out;
    var chainHead = out;
    // filter
    if (I.lp) {
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
      lp.frequency.setValueAtTime(I.lp + (I.lpEnv || 0), t);
      if (I.lpEnv) lp.frequency.setTargetAtTime(I.lp, t + 0.005, (I.lpD || 0.2) / 2);
      chainHead.connect(lp); node = lp;
    }
    if (I.bp) {
      var bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = I.bp; bp.gain.value = 8; bp.Q.value = 1.5;
      node.connect(bp); node = bp;
    }
    if (I.dist) {
      var ws = ctx.createWaveShaper(); ws.curve = distCurve(I.dist); ws.oversample = 'none';
      var post = ctx.createGain(); post.gain.value = I.vol * vel * 1.6;
      node.connect(ws); ws.connect(post); node = post;
    }
    var panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) { panner.pan.value = pan || 0; node.connect(panner); node = panner; }
    node.connect(dest || musicBus);
    if (echo !== false && echoIn) {
      var send = ctx.createGain(); send.gain.value = echo == null ? 0.5 : echo;
      node.connect(send); send.connect(echoIn);
    }

    var stopT = Math.max(relEnd, endT) + I.r + 0.1;
    var oscs = [];
    if (I.fm) {
      // 2-op FM: [ratio, index, indexDecay]
      var car = ctx.createOscillator(); car.type = 'sine'; car.frequency.value = f;
      var mod = ctx.createOscillator(); mod.type = 'sine'; mod.frequency.value = f * I.fm[0];
      var mg = ctx.createGain();
      mg.gain.setValueAtTime(f * I.fm[1], t);
      mg.gain.setTargetAtTime(f * I.fm[1] * 0.1, t, I.fm[2]);
      mod.connect(mg); mg.connect(car.frequency);
      car.connect(out);
      oscs.push(car, mod);
    } else {
      var uni = I.uni || [0];
      for (var u = 0; u < uni.length; u++) {
        var o = ctx.createOscillator();
        if (waves[I.wave]) o.setPeriodicWave(waves[I.wave]); else o.type = I.wave || 'sine';
        o.frequency.setValueAtTime(f, t);
        o.detune.setValueAtTime(uni[u], t);
        if (I.bend) {
          o.detune.setValueAtTime(uni[u] - I.bend, t);
          o.detune.linearRampToValueAtTime(uni[u], t + 0.05);
        }
        if (I.slide) {
          o.frequency.setValueAtTime(f * 0.94, t);
          o.frequency.exponentialRampToValueAtTime(f, t + I.slide);
        }
        var g = ctx.createGain(); g.gain.value = 1 / Math.sqrt(uni.length);
        o.connect(g); g.connect(out);
        oscs.push(o);
      }
      if (I.vib) {
        var lfo = ctx.createOscillator(); lfo.frequency.value = I.vib[0];
        var lg = ctx.createGain();
        lg.gain.setValueAtTime(0, t);
        lg.gain.linearRampToValueAtTime(I.vib[1], t + I.vib[2] + 0.1);
        lfo.connect(lg);
        for (var k = 0; k < oscs.length; k++) lg.connect(oscs[k].detune);
        oscs.push(lfo);
      }
    }
    if (I.breath) {
      var nz = ctx.createBufferSource(); nz.buffer = noiseBuf;
      var ng = ctx.createGain(); ng.gain.value = I.breath;
      var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 2; nf.Q.value = 2;
      nz.connect(nf); nf.connect(ng); ng.connect(out);
      oscs.push(nz);
    }
    for (var j = 0; j < oscs.length; j++) { oscs[j].start(t); oscs[j].stop(stopT); }
  }
  A.playNote = playNote;

  var distCache = {};
  function distCurve(k) {
    if (distCache[k]) return distCache[k];
    var n = 1024, c = new Float32Array(n);
    for (var i = 0; i < n; i++) { var x = i * 2 / n - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    distCache[k] = c;
    return c;
  }

  // ------------------------------------------------------------------ drums
  function noise(t, dur, filterType, freq, q, vol, dest, decay, echo) {
    var src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    var f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q || 1;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + (decay || dur));
    src.connect(f); f.connect(g); g.connect(dest);
    if (echo && echoIn) { var s = ctx.createGain(); s.gain.value = echo; g.connect(s); s.connect(echoIn); }
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.05);
    return g;
  }
  function tone(t, f0, f1, dur, vol, dest, type, echo) {
    var o = ctx.createOscillator(); o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * 0.8);
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest);
    if (echo && echoIn) { var s = ctx.createGain(); s.gain.value = echo; g.connect(s); s.connect(echoIn); }
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  }

  var DRUM = {
    k: function (t, v, d) { tone(t, 150, 42, 0.28, 0.9 * v, d); noise(t, 0.02, 'lowpass', 1200, 1, 0.2 * v, d); },
    K: function (t, v, d) { tone(t, 110, 35, 0.4, 1.0 * v, d); noise(t, 0.03, 'lowpass', 900, 1, 0.3 * v, d); }, // big kick
    s: function (t, v, d) { noise(t, 0.2, 'bandpass', 1900, 0.7, 0.55 * v, d, 0.18, 0.25); tone(t, 220, 160, 0.1, 0.35 * v, d, 'triangle'); },
    S: function (t, v, d) { noise(t, 0.5, 'bandpass', 1500, 0.6, 0.6 * v, d, 0.4, 0.6); tone(t, 200, 140, 0.15, 0.4 * v, d, 'triangle', 0.4); }, // gated/verb snare
    c: function (t, v, d) { noise(t, 0.12, 'bandpass', 1200, 1.2, 0.5 * v, d, 0.1, 0.3); noise(t + 0.012, 0.1, 'bandpass', 1300, 1.2, 0.4 * v, d, 0.1); }, // clap
    h: function (t, v, d) { noise(t, 0.05, 'highpass', 7500, 1, 0.22 * v, d, 0.04); },
    o: function (t, v, d) { noise(t, 0.3, 'highpass', 6500, 1, 0.2 * v, d, 0.25); },
    x: function (t, v, d) { noise(t, 1.4, 'highpass', 4200, 0.8, 0.35 * v, d, 1.3, 0.3); }, // crash
    t: function (t, v, d) { tone(t, 210, 95, 0.3, 0.6 * v, d, 'sine', 0.3); },
    T: function (t, v, d) { tone(t, 130, 70, 0.35, 0.7 * v, d, 'sine', 0.3); },
    i: function (t, v, d) { tone(t, 90, 48, 0.55, 0.75 * v, d, 'sine', 0.4); noise(t, 0.08, 'lowpass', 600, 1, 0.5 * v, d); }, // taiko
    g: function (t, v, d) { // gong
      [110, 146, 183, 229, 311].forEach(function (f, i) { tone(t, f * 1.01, f * 0.99, 2.2, 0.18 * v / (i + 1), d, 'sine', 0.5); });
      noise(t, 1.5, 'bandpass', 600, 2, 0.1 * v, d, 1.4);
    },
    b: function (t, v, d) { tone(t, 1800, 1700, 0.08, 0.2 * v, d, 'square'); }, // block/woodblock
    O: function (t, v, d) { // orchestra hit
      [0, 7, 12, 16, 19].forEach(function (s) { playNote('brass', 60 + s, t, 0.12, 1.6 * v, 0, d, 0.6); });
      noise(t, 0.3, 'bandpass', 900, 0.8, 0.4 * v, d, 0.25, 0.4);
    }
  };
  A.drum = function (sym, t, v, dest) { if (DRUM[sym]) DRUM[sym](t, v == null ? 1 : v, dest || musicBus); };

  // ------------------------------------------------------------------ sequencer
  // A compiled song: { bpm, steps, events: [ [ {k:'n', inst, m, len, v, pan} | {k:'d', sym, v} ] per step ], echo }
  function Player(song) {
    this.song = song;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(musicBus);
    this.step = 0;
    this.nextT = ctx.currentTime + 0.06;
    this.stopped = false;
    this.secPerStep = 60 / song.bpm / 4;
  }
  Player.prototype.schedule = function () {
    var song = this.song;
    while (this.nextT < ctx.currentTime + 0.15 && !this.stopped) {
      var evs = song.events[this.step];
      var t = this.nextT;
      if (song.swing && (this.step & 1)) t += this.secPerStep * song.swing;
      if (evs) {
        for (var i = 0; i < evs.length; i++) {
          var e = evs[i];
          if (e.k === 'n') playNote(e.inst, e.m, t, e.len * this.secPerStep, e.v, e.pan, this.gain, e.echo);
          else DRUM[e.sym] && DRUM[e.sym](t, e.v, this.gain);
        }
      }
      this.step = (this.step + 1) % song.steps;
      if (this.step === 0 && this.once) { this.stopped = true; break; }
      if (this.step === 0 && song.loopFrom) this.step = song.loopFrom;
      this.nextT += this.secPerStep;
    }
  };
  Player.prototype.fadeIn = function (sec) {
    var g = this.gain.gain; g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(0.0001, ctx.currentTime);
    g.exponentialRampToValueAtTime((this.song && this.song.gain) || 1, ctx.currentTime + (sec || 0.05));
  };
  Player.prototype.stop = function (sec) {
    var self = this;
    var g = this.gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(Math.max(0.0001, g.value), ctx.currentTime);
    g.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (sec || 0.05));
    setTimeout(function () { self.stopped = true; try { self.gain.disconnect(); } catch (e) { /* */ } }, (sec || 0.05) * 1000 + 200);
  };

  // Plays a decoded audio asset (Lyria output) on loop, bypassing the SNES bus.
  function AssetPlayer(buf, loop) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(musicGain);
    this.src = ctx.createBufferSource();
    this.src.buffer = buf;
    this.src.loop = loop !== false;
    this.src.connect(this.gain);
    this.src.start();
  }
  AssetPlayer.prototype.schedule = function () {};
  AssetPlayer.prototype.fadeIn = Player.prototype.fadeIn;
  AssetPlayer.prototype.stop = function (sec) {
    var self = this;
    Player.prototype.stop.call(this, sec);
    setTimeout(function () { try { self.src.stop(); } catch (e) { /* */ } }, (sec || 0.05) * 1000 + 100);
  };

  var players = [];
  function tick() {
    if (!ctx) return;
    for (var i = players.length - 1; i >= 0; i--) {
      if (players[i].stopped) { players.splice(i, 1); continue; }
      players[i].schedule();
    }
  }

  A.playMusic = function (id, opts) {
    opts = opts || {};
    if (!ctx) return;
    if (id === currentId && current && !opts.restart) return;
    A.stopMusic(opts.fadeOut == null ? 0.35 : opts.fadeOut);
    currentId = id;
    if (!id) return;
    var loop = opts.loop !== false;
    var url = manifest.music[id];
    var startSynth = function () {
      if (currentId !== id) return;
      var song = NC.Music && NC.Music.get(id);
      if (!song) return;
      var p = new Player(song);
      p.once = !loop;
      if (song.echo) {
        A._echo.delay.delayTime.setTargetAtTime(song.echo[0], ctx.currentTime, 0.05);
        A._echo.fb.gain.setTargetAtTime(song.echo[1], ctx.currentTime, 0.05);
      }
      p.fadeIn(opts.fadeIn || 0.05);
      if (!loop) {
        var total = song.steps * p.secPerStep;
        setTimeout(function () { if (current === p) { p.stop(1.5); current = null; currentId = null; } }, total * 1000);
      }
      players.push(p);
      current = p;
    };
    if (url) {
      getBuffer(url, function (buf) {
        if (currentId !== id) return;
        if (!buf) return startSynth();
        var p = new AssetPlayer(buf, loop);
        p.fadeIn(opts.fadeIn || 0.05);
        players.push(p);
        current = p;
      });
    } else startSynth();
  };
  A.stopMusic = function (fade) {
    if (current) current.stop(fade == null ? 0.3 : fade);
    current = null;
    currentId = null;
  };
  A.currentMusic = function () { return currentId; };

  // ------------------------------------------------------------------ assets
  function loadManifest() {
    if (location.protocol === 'file:') return; // fetch is blocked on file://; synth only
    fetch('assets/manifest.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m) return;
        manifest.music = m.music || {};
        manifest.sfx = m.sfx || {};
        manifest.voice = m.voice || {};
        // Warm up SFX buffers so hits play instantly.
        Object.keys(manifest.sfx).forEach(function (k) { getBuffer(manifest.sfx[k], function () {}); });
      }).catch(function () { /* no manifest: synth only */ });
  }
  function getBuffer(url, cb) {
    var b = buffers[url];
    if (b && b !== 'loading') return cb(b === 'failed' ? null : b);
    if (b === 'loading') { setTimeout(function () { getBuffer(url, cb); }, 60); return; }
    buffers[url] = 'loading';
    fetch('assets/' + url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
      .then(function (buf) { buffers[url] = buf; cb(buf); })
      .catch(function () { buffers[url] = 'failed'; cb(null); });
  }
  function playBuffer(buf, dest, rate, vol) {
    var s = ctx.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = rate || 1;
    var g = ctx.createGain(); g.gain.value = vol == null ? 1 : vol;
    s.connect(g); g.connect(dest); s.start();
    return s;
  }
  // Voice asset lookup: manifest.voice[charId][kind] is a file or an array of files.
  function voiceUrl(charId, kind, idx) {
    var v = manifest.voice[charId];
    if (!v || !v[kind]) return null;
    return Array.isArray(v[kind]) ? v[kind][idx || 0] : v[kind];
  }

  // ------------------------------------------------------------------ SFX
  var SFX = {
    cursor: function (t, d) { tone(t, 1200, 1250, 0.05, 0.25, d, 'square'); },
    confirm: function (t, d) { tone(t, 660, 670, 0.06, 0.25, d, 'square'); tone(t + 0.06, 990, 1000, 0.12, 0.25, d, 'square', 0.4); },
    cancel: function (t, d) { tone(t, 500, 300, 0.12, 0.25, d, 'square'); },
    costume: function (t, d) { tone(t, 880, 1760, 0.1, 0.2, d, 'triangle', 0.4); tone(t + 0.05, 1320, 2640, 0.1, 0.15, d, 'triangle', 0.4); },
    pause: function (t, d) { tone(t, 1000, 1000, 0.05, 0.2, d, 'square'); tone(t + 0.08, 800, 800, 0.05, 0.2, d, 'square'); },
    whiffL: function (t, d) { noise(t, 0.08, 'bandpass', 2400, 2, 0.3, d, 0.07); },
    whiffH: function (t, d) { var g = noise(t, 0.16, 'bandpass', 900, 1.5, 0.45, d, 0.15); },
    hitL: function (t, d) { noise(t, 0.08, 'lowpass', 3000, 1, 0.7, d, 0.07); tone(t, 320, 120, 0.07, 0.5, d, 'square'); },
    hitH: function (t, d) { noise(t, 0.2, 'lowpass', 2000, 1, 0.9, d, 0.18, 0.3); tone(t, 180, 50, 0.18, 0.8, d, 'square'); tone(t, 90, 40, 0.2, 0.7, d); },
    counter: function (t, d) { SFX.hitH(t, d); tone(t, 1600, 2400, 0.15, 0.25, d, 'square', 0.5); },
    block: function (t, d) { noise(t, 0.05, 'highpass', 3000, 1, 0.5, d, 0.05); tone(t, 900, 700, 0.06, 0.3, d, 'square'); },
    ko: function (t, d) { SFX.hitH(t, d); noise(t, 1.2, 'lowpass', 800, 1, 0.6, d, 1.1, 0.6); tone(t, 220, 30, 1.0, 0.6, d, 'sawtooth', 0.5); },
    jump: function (t, d) { tone(t, 200, 500, 0.1, 0.15, d, 'square'); },
    land: function (t, d) { noise(t, 0.06, 'lowpass', 600, 1, 0.4, d, 0.06); },
    dash: function (t, d) { noise(t, 0.2, 'bandpass', 1400, 1, 0.35, d, 0.2); },
    thud: function (t, d) { tone(t, 120, 40, 0.3, 0.9, d); noise(t, 0.2, 'lowpass', 500, 1, 0.6, d, 0.2); },
    fire: function (t, d) { tone(t, 300, 900, 0.12, 0.3, d, 'sawtooth', 0.5); noise(t, 0.2, 'bandpass', 2500, 1, 0.3, d, 0.2); },
    charge: function (t, d) { tone(t, 200, 1200, 0.5, 0.18, d, 'sawtooth', 0.5); },
    beam: function (t, d) { tone(t, 90, 60, 1.2, 0.5, d, 'sawtooth', 0.6); noise(t, 1.2, 'bandpass', 700, 0.6, 0.6, d, 1.2, 0.5); tone(t, 1400, 400, 1.0, 0.1, d, 'square', 0.6); },
    teleport: function (t, d) { tone(t, 2000, 200, 0.2, 0.25, d, 'square', 0.6); tone(t + 0.1, 200, 2000, 0.2, 0.2, d, 'square', 0.6); },
    explode: function (t, d) { noise(t, 0.8, 'lowpass', 1400, 1, 0.9, d, 0.7, 0.5); tone(t, 100, 30, 0.6, 0.8, d); },
    clang: function (t, d) { [520, 1340, 2210].forEach(function (f) { tone(t, f, f * 0.98, 0.6, 0.2, d, 'square', 0.5); }); noise(t, 0.1, 'highpass', 3000, 1, 0.5, d, 0.1); },
    splash: function (t, d) { noise(t, 0.5, 'bandpass', 1500, 0.5, 0.6, d, 0.45, 0.4); tone(t, 400, 150, 0.2, 0.3, d); },
    super: function (t, d) { tone(t, 100, 1600, 0.45, 0.3, d, 'sawtooth', 0.7); tone(t + 0.45, 1600, 1600, 0.2, 0.25, d, 'square', 0.7); DRUM.O(t + 0.45, 0.8, d); },
    parry: function (t, d) { tone(t, 1500, 3000, 0.12, 0.3, d, 'square', 0.6); tone(t + 0.04, 2250, 4500, 0.15, 0.2, d, 'square', 0.6); },
    grab: function (t, d) { noise(t, 0.1, 'bandpass', 800, 2, 0.5, d, 0.1); tone(t, 150, 100, 0.1, 0.5, d, 'square'); },
    powerup: function (t, d) { [0, 4, 7, 12, 16].forEach(function (s, i) { tone(t + i * 0.05, mtof(72 + s), mtof(72 + s), 0.1, 0.18, d, 'square', 0.5); }); },
    denied: function (t, d) { tone(t, 180, 170, 0.25, 0.35, d, 'square'); tone(t + 0.28, 140, 130, 0.35, 0.35, d, 'square'); },
    blip: function (t, d, p) { tone(t, p || 700, p || 700, 0.03, 0.12, d, 'square'); },
    coin: function (t, d) { tone(t, 988, 988, 0.08, 0.2, d, 'square'); tone(t + 0.08, 1319, 1319, 0.3, 0.2, d, 'square', 0.4); },
    round: function (t, d) { DRUM.O(t, 0.9, d); },
    fight: function (t, d) { DRUM.O(t, 1, d); DRUM.x(t, 1, d); },
    kostinger: function (t, d) { DRUM.O(t, 1, d); DRUM.K(t, 1, d); DRUM.x(t, 1, d); }
  };

  A.sfx = function (name, opts) {
    if (!ctx || ctx.state !== 'running') return;
    opts = opts || {};
    var url = manifest.sfx[name];
    if (url && buffers[url] && buffers[url] !== 'loading' && buffers[url] !== 'failed') {
      playBuffer(buffers[url], sfxGain, opts.rate, opts.vol);
      return;
    }
    if (SFX[name]) SFX[name](ctx.currentTime + 0.005, sfxGain, opts.pitch);
  };

  // Dialog text blip, per-character pitch.
  A.blip = function (pitch) { if (ctx && ctx.state === 'running') SFX.blip(ctx.currentTime, sfxGain, pitch); };

  // ------------------------------------------------------------------ voices
  var voiceSrc = null;
  var speechVoices = [];
  function loadVoices() {
    if (!window.speechSynthesis) return;
    speechVoices = speechSynthesis.getVoices().filter(function (v) { return /^en/i.test(v.lang); });
  }
  if (window.speechSynthesis) {
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  // Speak one of a character's lines: kind = select | win | taunt | super | ending.
  A.speakLine = function (ch, kind, idx) {
    var text = kind === 'select' ? ch.select[idx || 0] : kind === 'win' ? ch.wins[idx || 0] :
      kind === 'taunt' ? ch.taunt : kind === 'super' ? ch.super.name : ch.ending;
    A.speak(text, ch.voice, voiceUrl(ch.id, kind, idx));
  };

  // profile: { pitch, rate, voice: index hint, gender: 'm'|'f'|'n' }; url: optional generated clip
  A.speak = function (text, profile, url) {
    A.stopVoice();
    if (!NC.settings.voice) return;
    profile = profile || {};
    if (url && ctx) {
      getBuffer(url, function (buf) {
        if (buf) voiceSrc = playBuffer(buf, voiceGain, 1, 1);
        else speakSynth(text, profile);
      });
      return;
    }
    speakSynth(text, profile);
  };
  function speakSynth(text, profile) {
    if (!window.speechSynthesis) return;
    try {
      var u = new SpeechSynthesisUtterance(text.replace(/--/g, ',').replace(/\.\.\./g, ','));
      u.pitch = profile.pitch == null ? 1 : profile.pitch;
      u.rate = profile.rate == null ? 1 : profile.rate;
      u.volume = Math.min(1, NC.settings.sfx + 0.1);
      if (speechVoices.length) {
        var pool = speechVoices;
        if (profile.gender) {
          var re = profile.gender === 'f' ? /female|samantha|victoria|karen|zira|susan|serena|moira|tessa|fiona|google uk english female|google us english/i
            : /male|daniel|alex|david|mark|fred|george|rishi|google uk english male/i;
          var filtered = speechVoices.filter(function (v) { return re.test(v.name) && !(profile.gender === 'm' && /female/i.test(v.name)); });
          if (filtered.length) pool = filtered;
        }
        u.voice = pool[(profile.voice || 0) % pool.length];
      }
      speechSynthesis.speak(u);
    } catch (e) { /* speech unavailable */ }
  }
  A.stopVoice = function () {
    if (voiceSrc) { try { voiceSrc.stop(); } catch (e) { /* */ } voiceSrc = null; }
    if (window.speechSynthesis) try { speechSynthesis.cancel(); } catch (e) { /* */ }
  };

  // Announcer: generated clip (manifest.sfx['announce_' + key]) if present, else a synth
  // sting plus low-pitched speech. Keys: round1..round5, final, fight, ko, perfect, timeover, training.
  var STING = { fight: 'fight', ko: 'kostinger' };
  A.announce = function (key, text) {
    if (!ctx || ctx.state !== 'running') return;
    var url = manifest.sfx['announce_' + key];
    if (url && buffers[url] && buffers[url] !== 'failed' && buffers[url] !== 'loading') {
      playBuffer(buffers[url], voiceGain, 1, 1);
      if (STING[key]) A.sfx(STING[key]);
      return;
    }
    A.sfx(STING[key] || 'round');
    if (NC.settings.voice && text && window.speechSynthesis) {
      speakSynth(text, { pitch: 0.4, rate: 0.85, gender: 'm' });
    }
  };
})(window.NC = window.NC || {});
