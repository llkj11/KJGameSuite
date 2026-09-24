// Tracker-style song data + a tiny composer. Each theme has a hand-written melody
// (one token per 8th note; "A4/C5" = two 16ths; "." holds; "-" rests) and a chord
// progression. Bass, pads, arpeggios and drums are generated from style presets,
// like a SNES sound driver playing sequenced parts.
(function (NC) {
  'use strict';

  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseNote(tok) {
    var m = /^([A-G])(#|b)?(-?\d)$/.exec(tok);
    if (!m) { console.warn('bad note', tok); return 60; }
    var pc = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 12 * (parseInt(m[3], 10) + 1) + pc;
  }

  var QUAL = {
    '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'm7': [0, 3, 7, 10], 'maj7': [0, 4, 7, 11],
    'sus4': [0, 5, 7], 'sus2': [0, 2, 7], 'dim': [0, 3, 6], 'aug': [0, 4, 8], '5': [0, 7, 12],
    'add9': [0, 4, 7, 14], 'm9': [0, 3, 7, 10, 14], '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9]
  };
  function parseChord(tok) {
    var parts = tok.split('/');
    var m = /^([A-G])(#|b)?(.*)$/.exec(parts[0]);
    var pc = (NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
    var tones = QUAL[m[3]] || QUAL[''];
    var bass = pc;
    if (parts[1]) {
      var b = /^([A-G])(#|b)?$/.exec(parts[1]);
      bass = (NOTE[b[1]] + (b[2] === '#' ? 1 : b[2] === 'b' ? -1 : 0) + 12) % 12;
    }
    return { pc: pc, tones: tones, bass: bass };
  }

  function tokens(str) { return str.split(/[\s|]+/).filter(function (t) { return t; }); }

  // Melody string -> [[step, midi, len]]
  function parseLine(str, transpose) {
    var toks = tokens(str), notes = [], step = 0, last = null;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t === '.') { if (last) last[2] += 2; step += 2; continue; }
      if (t === '-') { last = null; step += 2; continue; }
      var sub = t.split('/');
      if (sub.length === 2) {
        notes.push(last = [step, parseNote(sub[0]) + transpose, 1]);
        notes.push(last = [step + 1, parseNote(sub[1]) + transpose, 1]);
      } else notes.push(last = [step, parseNote(t) + transpose, 2]);
      step += 2;
    }
    return { notes: notes, steps: step };
  }

  // ---------- generators ----------
  function bassRoot(pc) { return 28 + ((pc - 4 + 12) % 12); } // E1..D#2
  function voice(chord, lo) {
    // close voicing of chord tones at or above `lo`
    var out = [];
    for (var i = 0; i < Math.min(4, chord.tones.length); i++) {
      var n = chord.pc + chord.tones[i] % 12;
      while (n < lo) n += 12;
      while (n >= lo + 12) n -= 12;
      out.push(n);
    }
    return out.sort(function (a, b) { return a - b; });
  }

  var BASS = {
    eighths: function (r, c, len) { var o = []; for (var s = 0; s < len; s += 2) o.push([s, r + (s % 8 === 4 ? 12 : 0), 2]); return o; },
    octave: function (r, c, len) { var o = []; for (var s = 0; s < len; s += 2) o.push([s, r + ((s / 2) % 2 ? 12 : 0), 2]); return o; },
    rock: function (r, c, len) { var o = []; for (var s = 0; s < len; s += 2) o.push([s, r + (s === 12 ? 7 : 0), 2]); return o; },
    synth: function (r, c, len) { var o = []; for (var s = 0; s < len; s += 2) o.push([s, r + (s === 6 || s === 14 ? 12 : 0), 2]); return o; },
    funk: function (r, c, len) {
      var pat = [[0, 0, 2], [3, 12, 1], [6, 0, 1], [8, 0, 2], [10, 7, 1], [11, 12, 1], [14, 10, 2]];
      return pat.filter(function (p) { return p[0] < len; }).map(function (p) { return [p[0], r + p[1], p[2]]; });
    },
    walk: function (r, c, len, next) {
      var third = c.tones[1], fifth = c.tones[2] || 7;
      var nr = next ? bassRoot(next.pc) : r;
      var appr = nr > r ? nr - 1 : nr + 1;
      var seq = [r, r + third, r + fifth, appr];
      var o = []; for (var s = 0, i = 0; s < len; s += 4, i++) o.push([s, seq[i % 4], 3]);
      return o;
    },
    half: function (r, c, len) { return len >= 16 ? [[0, r, 8], [8, r + 7, 8]] : [[0, r, len]]; },
    pedal: function (r, c, len) { return [[0, r, len]]; },
    gallop: function (r, c, len) {
      var o = []; for (var s = 0; s < len; s += 4) { o.push([s, r, 2]); o.push([s + 2, r, 1]); o.push([s + 3, r, 1]); } return o;
    },
    disco: function (r, c, len) { var o = []; for (var s = 0; s < len; s += 2) o.push([s, s % 4 ? r + 12 : r, 2]); return o; }
  };

  var ARP = {
    up16: function (c, lo, len) {
      var v = voice(c, lo); v.push(v[0] + 12);
      var o = []; for (var s = 0; s < len; s++) o.push([s, v[s % v.length], 1]); return o;
    },
    updown16: function (c, lo, len) {
      var v = voice(c, lo); v.push(v[0] + 12);
      var seq = v.concat(v.slice(1, -1).reverse());
      var o = []; for (var s = 0; s < len; s++) o.push([s, seq[s % seq.length], 1]); return o;
    },
    up8: function (c, lo, len) {
      var v = voice(c, lo); v.push(v[0] + 12);
      var o = []; for (var s = 0; s < len; s += 2) o.push([s, v[(s / 2) % v.length], 2]); return o;
    },
    alberti: function (c, lo, len) {
      var v = voice(c, lo); var seq = [v[0], v[2] || v[1], v[1], v[2] || v[1]];
      var o = []; for (var s = 0; s < len; s += 2) o.push([s, seq[(s / 2) % 4], 2]); return o;
    },
    broken: function (c, lo, len) {
      var v = voice(c, lo); var seq = [v[0], v[1], v[2] || v[1] + 5, v[0] + 12, v[2] || v[1] + 5, v[1]];
      var o = []; for (var s = 0; s < len; s += 2) o.push([s, seq[(s / 2) % seq.length], 2]); return o;
    },
    stab8: function (c, lo, len) {
      var v = voice(c, lo), o = [];
      for (var s = 2; s < len; s += 4) for (var i = 0; i < v.length; i++) o.push([s, v[i], 1]);
      return o;
    }
  };

  var PAD = {
    sustain: function (c, lo, len) { return voice(c, lo).map(function (n) { return [0, n, len]; }); },
    half: function (c, lo, len) {
      var o = []; voice(c, lo).forEach(function (n) { o.push([0, n, Math.min(8, len)]); if (len > 8) o.push([8, n, len - 8]); }); return o;
    },
    stabs: function (c, lo, len) {
      var o = []; [0, 6, 10].forEach(function (s) { if (s < len) voice(c, lo).forEach(function (n) { o.push([s, n, 2]); }); }); return o;
    },
    offbeat: function (c, lo, len) {
      var o = []; for (var s = 2; s < len; s += 4) voice(c, lo).forEach(function (n) { o.push([s, n, 2]); }); return o;
    },
    chug: function (c, lo, len) { // palm-muted power chords
      var o = [], r = lo + ((c.pc - lo % 12 + 12) % 12);
      if (r > lo + 7) r -= 12;
      for (var s = 0; s < len; s += 2) {
        var sustain = (s === 0 || s === 6 || s === 12);
        o.push([s, r, sustain ? 2 : 1], [s, r + 7, sustain ? 2 : 1]);
      }
      return o;
    }
  };

  // 16-step drum grids per style; 'x' = full, 'o' = soft.
  var DRUMS = {
    rock:    { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', crash: true },
    drive:   { k: 'x.....x.x.......', s: '....x.......x...', h: 'xoxoxoxoxoxoxoxo', crash: true },
    march:   { k: 'x.......x.......', s: '....x..o....x.oo', h: 'x.x.x.x.x.x.x.x.', crash: true },
    metal:   { K: 'xoxoxoxoxoxoxoxo', s: '....x.......x...', o: '..x...x...x...x.', crash: true },
    euro:    { k: 'x...x...x...x...', c: '....x.......x...', o: '..x...x...x...x.', h: 'o.o.o.o.o.o.o.o.', crash: true },
    funk:    { k: 'x..x......x..x..', s: '....x..o.o..x..o', h: 'xoxoxoxoxoxoxoxo' },
    taiko:   { i: 'x.....x.x..x....', b: '..o...o...o...o.', t: '..............xx', crash: false },
    baroque: { T: 'x.....x.x.......', s: '....o.......o...', h: '' },
    half:    { K: 'x.........x.....', S: '........x.......', h: 'x.x.x.x.x.x.x.x.', crash: true },
    synthwave: { k: 'x.......x.......', S: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', crash: true },
    festive: { k: 'x...x...x...x...', s: '....x.......x...', h: 'oooooooooooooooo', gong: true },
    bouncy:  { k: 'x..x..x.x.......', s: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
    ominous: { K: 'x...............', i: '........x.....o.', h: '' }
  };
  var FILLS = {
    default: { s: '........x.xxxxxx', t: '', T: '' },
    toms: { t: '........x.x.....', T: '............x.x.' },
    taiko: { i: 'x.x.x.x.x.xxxxxx' }
  };

  function compile(def) {
    var mel = parseLine(def.melody, def.leadOct || 0);
    var bars = Math.ceil(mel.steps / 16);
    var total = bars * 16;
    var events = []; for (var i = 0; i < total; i++) events.push([]);
    function add(step, e) { if (step >= 0 && step < total) events[step].push(e); }

    // chords: one per bar token; comma splits a bar in halves
    var ct = tokens(def.chords), segs = [];
    for (var b = 0; b < bars; b++) {
      var tok = ct[b % ct.length], parts = tok.split(',');
      var plen = 16 / parts.length;
      for (var p = 0; p < parts.length; p++) segs.push({ step: b * 16 + p * plen, len: plen, chord: parseChord(parts[p]) });
    }

    function noteEv(inst, m, len, v, pan, echo) { return { k: 'n', inst: inst, m: m, len: len, v: v, pan: pan || 0, echo: echo }; }

    // lead + optional harmony double
    mel.notes.forEach(function (n) {
      var accent = n[0] % 16 === 0 ? 1 : 0.88;
      add(n[0], noteEv(def.lead, n[1], n[2], accent, 0, def.leadEcho));
      if (def.harm) add(n[0], noteEv(def.harm.inst, n[1] + def.harm.int, n[2], (def.harm.v || 0.7) * accent, def.harm.pan || -0.25));
    });
    if (def.counter) {
      var cl = parseLine(def.counter.line, 0);
      cl.notes.forEach(function (n) { add(n[0], noteEv(def.counter.inst, n[1], n[2], def.counter.v || 0.7, 0.3)); });
    }

    segs.forEach(function (sg, si) {
      var next = segs[(si + 1) % segs.length].chord;
      var c = sg.chord;
      if (def.bass) {
        var r = bassRoot(c.bass) + (def.bassOct || 0);
        BASS[def.bassStyle || 'eighths'](r, c, sg.len, next).forEach(function (n) {
          add(sg.step + n[0], noteEv(def.bass, n[1], n[2], n[0] === 0 ? 1 : 0.85, 0, 0.15));
        });
      }
      if (def.pad) {
        PAD[def.padStyle || 'sustain'](c, def.padLo || 55, sg.len).forEach(function (n) {
          add(sg.step + n[0], noteEv(def.pad, n[1], n[2], def.padV || 0.7, -0.3));
        });
      }
      if (def.arp) {
        ARP[def.arpStyle || 'up16'](c, def.arpLo || 67, sg.len).forEach(function (n) {
          add(sg.step + n[0], noteEv(def.arp, n[1], n[2], def.arpV || 0.55, 0.35));
        });
      }
    });

    if (def.drums) {
      var D = DRUMS[def.drums], fe = def.fillEvery || 4;
      var fill = FILLS[def.fill || 'default'];
      for (b = 0; b < bars; b++) {
        var isFill = (b % fe) === fe - 1;
        for (var sym in D) {
          if (sym === 'crash' || sym === 'gong') continue;
          var line = D[sym];
          if (isFill && fill[sym] !== undefined) line = line.slice(0, 8) + (fill[sym] || '........').slice(8);
          for (var s = 0; s < 16; s++) {
            var ch = line[s];
            if (ch === 'x' || ch === 'o') add(b * 16 + s, { k: 'd', sym: sym, v: ch === 'x' ? 1 : 0.45 });
          }
        }
        if (isFill) for (var fs in fill) if (!D[fs] && fill[fs]) {
          for (s = 8; s < 16; s++) if (fill[fs][s] === 'x') add(b * 16 + s, { k: 'd', sym: fs, v: 0.9 });
        }
        if (D.crash && b % 8 === 0) add(b * 16, { k: 'd', sym: 'x', v: 0.8 });
        if (D.gong && b % 4 === 0) add(b * 16, { k: 'd', sym: 'g', v: 0.7 });
      }
    }
    return { bpm: def.bpm, swing: def.swing || 0, steps: total, events: events, echo: def.echo || [0.23, 0.38], gain: def.gain || 1 };
  }

  // ------------------------------------------------------------------ songs
  var SONGS = {
    title: {
      bpm: 128, echo: [0.25, 0.4],
      chords: 'Bb F/A Gm Eb Bb F Eb F | Gm Eb Bb F Gm Eb Cm F',
      melody:
        'F4 . Bb4 . D5 . F5 . | F5 . Eb5 D5 C5 . A4 . | Bb4 . D5 . G5 . F5 . | Eb5 . . . G4 . Bb4 . |' +
        'F5 . Bb5 . A5 G5 F5 . | C5 . F5 . Eb5 D5 C5 . | G5 . F5 . Eb5 . D5 . | C5 . . . . . - - |' +
        'D5 . . Bb4 G4 . D5 . | Eb5 . D5 . C5 . Bb4 . | D5 . F5 . Bb5 . A5 . | A5 . G5 F5 . . C5 . |' +
        'D5 . G5 . Bb5 . A5 G5 | G5 . F5 . Eb5 . G5 . | F5 . Eb5 . D5 . C5 . | F5 . . . . . . .',
      lead: 'brass', harm: { inst: 'strings', int: -12, v: 0.8 },
      bass: 'bass', bassStyle: 'rock',
      pad: 'strings', padStyle: 'half', padV: 0.6,
      arp: 'bell', arpStyle: 'up8', arpLo: 70, arpV: 0.35,
      drums: 'march'
    },
    select: {
      bpm: 116, swing: 0.12, echo: [0.2, 0.3],
      chords: 'F Dm Bb C F Dm Gm,C F',
      melody:
        'A4 C5 F5 . E5 . C5 . | D5 . F5 . A5 . F5 . | D5 . Bb4 . D5 F5 . D5 | C5 . E5 . G5 . E5 . |' +
        'F5 A5 C6 . A5 . F5 . | D5 . F5 . A5 . D6 . | C6 . Bb5 . A5 . G5 . | F5 . . . - - - -',
      lead: 'marimba', harm: { inst: 'flute', int: 12, v: 0.35 },
      bass: 'slap', bassStyle: 'funk',
      pad: 'epiano', padStyle: 'offbeat', padV: 0.5,
      drums: 'bouncy'
    },
    fable: {
      bpm: 138, echo: [0.22, 0.4],
      chords: 'Dm Bb C Am Dm Bb Gm A | Bb C Dm Dm Gm C F,Bb A',
      melody:
        'D5 . . A4 D5 E5 F5 . | G5 . F5 . E5 . D5 . | E5 . . C5 E5 F5 G5 . | A5 . . . E5 . . . |' +
        'F5 . E5 . D5 . A4 . | Bb4 . D5 . F5 . Bb5 . | A5 . G5 . F5 . E5 . | E5 . . . C#5 . . . |' +
        'D5 . F5 . Bb5 . . A5 | G5 . E5 . C5 . G5 . | A5 . . . F5 . D5 . | E5 . F5 . A5 . D6 . |' +
        'D6 . C6 Bb5 A5 . G5 . | E5 . G5 . C6 . Bb5 . | A5 . F5 . D6 . Bb5 . | C#6 . . . A5 . E5 .',
      lead: 'horn', harm: { inst: 'brass', int: -12, v: 0.55 },
      bass: 'bass', bassStyle: 'eighths',
      pad: 'strings', padStyle: 'sustain', padV: 0.6,
      arp: 'harpsi', arpStyle: 'up16', arpV: 0.4, arpLo: 62,
      drums: 'drive'
    },
    opus: {
      bpm: 150, echo: [0.18, 0.3],
      chords: 'Gm D Gm Cm,D Gm Eb Cm D | Bb F Gm D Eb Bb Cm,D Gm',
      melody:
        'G5 D5 Bb4/C5 D5/Eb5 D5 C5/Bb4 A4 D5 | F#4/A4 D5/C5 Bb4/A4 G4/F#4 A4 D4 F#4 A4 |' +
        'Bb4 G4 D5 G4 Eb5 G4 D5 G4 | C5 G4 Eb5 G4 D5 F#4 A4 D5 |' +
        'G5 . F5/Eb5 D5 Eb5/D5 C5 Bb4/A4 G4 | G4/Bb4 Eb5/G5 Bb5 G5 Eb5 Bb4 G4 Eb4 |' +
        'C5/D5 Eb5/F5 G5 Eb5 C5 G4 Eb5 C5 | D5 . F#5 . A5 . D5 . |' +
        'D5/F5 Bb5 . F5 D5/Bb4 F4 . Bb4 | C5/F5 A5 . F5 C5/A4 F4 . A4 |' +
        'Bb4/D5 G5 . D5 Bb4/G4 D4 . G4 | A4 . D5 . F#5 . A5 . |' +
        'G5 Bb5 G5 Eb5 Bb4 Eb5 G5 Bb5 | F5 D5 Bb4 F4 Bb4 D5 F5 Bb5 |' +
        'Eb5 C5 G4 C5 D5 A4 F#4 A4 | G4 . . . - - D5 .',
      lead: 'harpsi', harm: { inst: 'strings', int: -12, v: 0.55 },
      bass: 'bass', bassStyle: 'walk',
      pad: 'strings', padStyle: 'half', padV: 0.35, padLo: 50,
      drums: 'baroque', fill: 'toms'
    },
    astra: {
      bpm: 120, echo: [0.32, 0.5],
      chords: 'Cm Ab Eb Bb Cm Ab Fm G | Ab Bb Gm Cm Ab Bb Fm,G Cm',
      melody:
        'C5 . . . G5 . . . | Ab5 . . . G5 . Eb5 . | G5 . . . . . Bb5 . | F5 . . . D5 . . . |' +
        'Eb5 . . . C5 . G4 . | Ab4 . C5 . Eb5 . Ab5 . | G5 . F5 . Eb5 . C5 . | B4 . . . D5 . G5 . |' +
        'C6 . . . Bb5 . Ab5 . | Bb5 . . . D5 . F5 . | G5 . . . D5 . Bb4 . | C5 . . . Eb5 . G5 . |' +
        'Ab5 . . . C6 . Eb6 . | D6 . . . Bb5 . F5 . | Ab5 . G5 . F5 . D5 . | C5 . . . . . . .',
      lead: 'choir', harm: { inst: 'organ', int: -12, v: 0.6 },
      bass: 'subbass', bassStyle: 'half',
      pad: 'organ', padStyle: 'sustain', padV: 0.5, padLo: 48,
      arp: 'bell', arpStyle: 'up8', arpV: 0.45, arpLo: 72,
      drums: 'half', fill: 'toms'
    },
    sol: {
      bpm: 160, swing: 0.08, echo: [0.19, 0.3],
      chords: 'Emaj7 C#m7 Amaj7 B E C#m7 F#m7 B7 | A B G#m C#m A B C#m,B E',
      melody:
        'E5 . G#5 B5 . G#5 . E5 | C#5 . E5 . G#5 . F#5 E5 | C#5 . . A4 C#5 E5 . A5 | G#5 . F#5 . D#5 . B4 . |' +
        'E5 G#5 B5 . E6 . B5 G#5 | C#6 . B5 . G#5 . E5 . | F#5 . A5 . C#6 . B5 A5 | G#5 . . F#5 . D#5 B4 . |' +
        'C#6 . . B5 A5 . E5 . | D#5 . F#5 . B5 . A5 . | G#5 . . D#5 G#5 . B5 . | C#6 . B5 . G#5 . E5 . |' +
        'A5 . C#6 . E6 . C#6 . | D#6 . . B5 . F#5 . D#5 | E5 . G#5 . F#5 . D#5 . | E5 . . . - - B4 D#5',
      lead: 'lead', harm: { inst: 'clav', int: -12, v: 0.5 },
      bass: 'slap', bassStyle: 'funk',
      pad: 'brass', padStyle: 'stabs', padV: 0.55, padLo: 59,
      arp: 'clav', arpStyle: 'stab8', arpV: 0.4, arpLo: 64,
      drums: 'funk'
    },
    grok: {
      bpm: 170, echo: [0.15, 0.25], gain: 0.55,
      chords: 'E5 E5 C5 D5 E5 E5 C5 B5 | C5 D5 E5 E5 C5 D5 B5 B5',
      melody:
        'E5 . . . G5 . A5 . | B5 . . A5 G5 . E5 . | G5 . . . E5 . C5 . | D5 . F#5 . A5 . F#5 . |' +
        'E5 . . . B5 . . . | D6 . C6 . B5 . A5 . | G5 . A5 . B5 . C6 . | B5 . . . . . - - |' +
        'E6 . D6 . C6 . B5 . | A5 . . B5 A5 . F#5 . | G5 . E5 . B4 . E5 . | G5 . F#5 . E5 . D5 . |' +
        'E5 . G5 . C6 . E6 . | D6 . . . A5 . F#5 . | D#5 . F#5 . B5 . D#6 . | B5 . . . . . . .',
      lead: 'guitar', leadOct: 0, harm: { inst: 'square', int: 12, v: 0.25 },
      bass: 'synbass', bassStyle: 'gallop',
      pad: 'guitar', padStyle: 'chug', padV: 0.6, padLo: 40,
      drums: 'metal'
    },
    gemini: {
      bpm: 160, echo: [0.19, 0.35],
      chords: 'F#m D E F#m Bm D E C# | D E C#m F#m D E F#m,E D,C#',
      melody:
        'F#5 . C#5 . F#5 A5 . G#5 | F#5 . E5 . D5 . F#5 . | E5 . B4 . E5 G#5 . F#5 | E5 . C#5 . A4 . C#5 . |' +
        'D5 . F#5 . B5 . A5 . | F#5 . A5 . D6 . C#6 . | B5 . G#5 . E5 . B5 . | C#6 . . . G#5 . F5 . |' +
        'A5/B5 A5 F#5 . D5 . F#5 A5 | G#5/A5 G#5 E5 . B4 . E5 G#5 | C#6 . B5 . G#5 . E5 . | F#5 . A5 . C#6 . A5 . |' +
        'D6 . C#6 . A5 . F#5 . | E5 . G#5 . B5 . E6 . | C#6 . A5 . B5 . G#5 . | A5 . F#5 . F5 . C#5 .',
      lead: 'supersaw', harm: { inst: 'square', int: 0, v: 0.5 },
      bass: 'synbass', bassStyle: 'octave',
      pad: 'pad', padStyle: 'sustain', padV: 0.5,
      arp: 'square', arpStyle: 'up16', arpV: 0.35, arpLo: 66,
      drums: 'euro'
    },
    deepseek: {
      bpm: 110, echo: [0.3, 0.45], gain: 0.8,
      chords: 'Dm C Dm Am F C Dm,C Dm | Bb C Am Dm Bb C Gm,A Dm',
      melody:
        'D5 . . . F5 . G5 . | A5 . . G5 F5 . D5 . | C5 . D5 . F5 . . . | E5 . . D5 C5 . A4 . |' +
        'F5 . A5 . C6 . A5 . | G5 . . E5 D5 . C5 . | D5 . F5 . E5 . C5 . | D5 . . . . . - - |' +
        'D6 . . C6 A5 . G5 . | E5 . G5 . C6 . . . | A5 . G5 . E5 . C5 . | D5 . . . A5 . . . |' +
        'F5 . . D5 F5 G5 A5 . | G5 . E5 . C5 . G4 . | A4 . C5 . D5 . E5 . | D5 . . . . . . .',
      lead: 'erhu', harm: { inst: 'flute', int: 12, v: 0.25 },
      bass: 'subbass', bassStyle: 'half',
      pad: 'strings', padStyle: 'sustain', padV: 0.35,
      arp: 'guzheng', arpStyle: 'broken', arpV: 0.55, arpLo: 57,
      drums: 'taiko', fill: 'taiko'
    },
    qwen: {
      bpm: 170, echo: [0.18, 0.3],
      chords: 'C Am F G C Am F,G C | F G Em Am F G Am,G C',
      melody:
        'C5 D5 E5 G5 . E5 G5 A5 | C6 . A5 . G5 . E5 . | F5 . A5 . C6 . A5 G5 | G5 . D5 . B4 . D5 . |' +
        'E5 G5 A5 C6 . A5 C6 D6 | E6 . D6 . C6 . A5 . | A5 . C6 . D6 . B5 . | C6 . . . - - G5 A5 |' +
        'C6 . A5 . F5 . A5 . | B5 . G5 . D5 . G5 . | E5 . G5 . B5 . G5 . | A5 . C6 . E6 . C6 . |' +
        'F6 . E6 . D6 . C6 . | D6 . B5 . G5 . B5 . | C6 . E6 . D6 . B5 . | C6 . . . . . . .',
      lead: 'square', harm: { inst: 'bell', int: 12, v: 0.3 },
      bass: 'bass', bassStyle: 'octave',
      pad: 'pad', padStyle: 'offbeat', padV: 0.45,
      arp: 'marimba', arpStyle: 'up16', arpV: 0.4, arpLo: 64,
      drums: 'festive'
    },
    kimi: {
      bpm: 128, echo: [0.35, 0.52], gain: 1.35,
      chords: 'Bm G D A Bm G Em F# | G A F#m Bm G A Em,F# Bm',
      melody:
        'B4 . . . D5 . F#5 . | G5 . . . F#5 . D5 . | A5 . . . F#5 . D5 . | E5 . . . . . C#5 . |' +
        'D5 . . . F#5 . B5 . | B5 . A5 . G5 . D5 . | E5 . F#5 . G5 . B5 . | A#5 . . . F#5 . . . |' +
        'D6 . . . B5 . G5 . | C#6 . . . A5 . E5 . | F#5 . . . C#6 . A5 . | B5 . . . . . F#5 . |' +
        'G5 . B5 . D6 . B5 . | E6 . . . C#6 . A5 . | B5 . A5 . G5 . F#5 . | B5 . . . . . . .',
      lead: 'lead', leadEcho: 0.8, harm: { inst: 'pad', int: -12, v: 0.5 },
      bass: 'synbass', bassStyle: 'synth',
      pad: 'pad', padStyle: 'sustain', padV: 0.55,
      arp: 'bell', arpStyle: 'updown16', arpV: 0.3, arpLo: 71,
      drums: 'synthwave'
    },
    mythos: {
      bpm: 100, echo: [0.34, 0.5],
      chords: 'C#m A F#m G# C#m D G#,A G#',
      melody:
        'C#5 . . . G#4 . . . | A4 . . . C#5 . E5 . | F#5 . . . A5 . F#5 . | G#5 . . . C5 . . . |' +
        'C#6 . . . G#5 . E5 . | D5 . . . F#5 . A5 . | G#5 . . . A5 . C#6 . | C6 . . . G#5 . . .',
      lead: 'organ', harm: { inst: 'choir', int: -12, v: 0.8 },
      bass: 'subbass', bassStyle: 'pedal',
      pad: 'choir', padStyle: 'sustain', padV: 0.6, padLo: 52,
      arp: 'bell', arpStyle: 'up8', arpV: 0.3, arpLo: 73,
      drums: 'ominous', fill: 'taiko'
    },
    victory: {
      bpm: 140, echo: [0.2, 0.3],
      chords: 'C F,G C',
      melody: 'G4/C5 E5/G5 C6 . G5 . C6 . | A5 . F5 . B5 . D6 . | C6 . . . . . . .',
      lead: 'brass', harm: { inst: 'strings', int: -12, v: 0.8 },
      bass: 'bass', bassStyle: 'pedal',
      pad: 'strings', padStyle: 'sustain',
      drums: 'march', fillEvery: 3
    }
  };

  var cache = {};
  NC.Music = {
    get: function (id) {
      if (!SONGS[id]) return null;
      if (!cache[id]) cache[id] = compile(SONGS[id]);
      return cache[id];
    },
    ids: Object.keys(SONGS),
    defs: SONGS,
    _parseLine: parseLine
  };
})(window.NC = window.NC || {});
