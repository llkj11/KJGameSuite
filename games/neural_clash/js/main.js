// Boot: canvas setup, integer scaling, fixed 60 Hz loop, mosaic + CRT presentation.
(function (NC) {
  'use strict';
  var W = NC.W, H = NC.H;
  var screen = document.getElementById('screen');
  var sctx = screen.getContext('2d');
  // The frame buffer is NC.RES times the SNES resolution. Everything draws in 256x224 game
  // coordinates through a scale transform, so procedural art stays chunky while the generated
  // sprites, portraits and backdrops keep their extra detail.
  var buf = NC.U.makeCanvas(W * NC.RES, H * NC.RES);
  var ctx = NC.ctx = buf.getContext('2d');
  ctx.setTransform(NC.RES, 0, 0, NC.RES, 0, 0);
  var small = NC.U.makeCanvas(W, H), smallCtx = small.getContext('2d');
  var scale = 1, outW = W, outH = H;

  NC.applyScale = function () {
    var aspect = NC.settings.aspect ? 8 / 7 : 1;
    var touchUI = document.body.classList.contains('has-touch');
    var availW = window.innerWidth - 8, availH = window.innerHeight - (touchUI ? 196 : 28);
    scale = Math.min(availW / (W * aspect), availH / H);
    // integer scaling on desktop; on small touch screens use the best fit so the game fills the width
    scale = touchUI && scale < 2 ? Math.max(0.5, scale) : Math.max(1, Math.floor(scale));
    outW = Math.round(W * aspect * scale); outH = Math.round(H * scale);
    screen.width = outW; screen.height = outH;
    sctx.imageSmoothingEnabled = false;
  };
  window.addEventListener('resize', NC.applyScale);
  NC.applyScale();

  function present() {
    var m = NC.Scenes.mosaic();
    sctx.imageSmoothingEnabled = false;
    if (m > 1) {
      var sw = Math.ceil(W / m), sh = Math.ceil(H / m);
      smallCtx.imageSmoothingEnabled = false;
      smallCtx.clearRect(0, 0, W, H);
      smallCtx.drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, sw, sh);
      sctx.drawImage(small, 0, 0, sw, sh, 0, 0, outW, outH);
      var f = NC.Scenes.fade();
      sctx.fillStyle = 'rgba(0,0,0,' + (f * 0.85) + ')';
      sctx.fillRect(0, 0, outW, outH);
    } else {
      sctx.drawImage(buf, 0, 0, buf.width, buf.height, 0, 0, outW, outH);
    }
    if (NC.settings.crt && scale >= 2) {
      sctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (var y = 0; y < outH; y += scale) sctx.fillRect(0, y + scale - Math.max(1, scale >> 1), outW, Math.max(1, scale >> 1));
      var g = sctx.createRadialGradient(outW / 2, outH / 2, outH * 0.4, outW / 2, outH / 2, outH * 0.85);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)');
      sctx.fillStyle = g; sctx.fillRect(0, 0, outW, outH);
    }
  }

  var STEP = 1000 / 60, acc = 0, last = performance.now();
  function frame(now) {
    acc += Math.min(100, now - last);
    last = now;
    var steps = 0;
    while (acc >= STEP && steps < 4) {
      NC.Input.poll();
      NC.frame++;
      NC.Scenes.update();
      acc -= STEP;
      steps++;
    }
    if (steps) { NC.Scenes.draw(ctx); present(); }
    requestAnimationFrame(frame);
  }

  // Click/tap also counts as the audio-unlock gesture.
  screen.addEventListener('pointerdown', function () {
    NC.Audio.unlock();
    var cur = NC.Scenes.current;
    if (cur && cur.update && !cur.menu) cur.clicked = true;
  });
  window.addEventListener('keydown', function () { if (NC.Audio.ready && !NC.Audio.ready()) NC.Audio.unlock(); });

  // Test hooks: #fight=p1,p2[,stage[,mode]]  #select  #title  #options
  function boot() {
    NC.Art.init();
    var h = decodeURIComponent(location.hash.slice(1));
    if (h.indexOf('fight=') === 0) {
      var a = h.slice(6).split(',');
      NC.Session.mode = a[3] || 'versuscpu';
      var p1 = { id: a[0] || 'fable', ci: 0 }, p2 = { id: a[1] || 'grok', ci: a[0] === a[1] ? 1 : 0 };
      NC.Session.picks = [p1, p2];
      NC.Scenes.go(NC.FightScene({ p1: p1, p2: p2, stage: a[2] || NC.CHAR[p2.id].stage, music: NC.CHAR[p2.id].music, level: 3 }), true);
    } else if (h === 'select') { NC.Session.mode = 'versuscpu'; NC.Scenes.go(NC.SelectScene(), true); }
    else if (h === 'title') NC.Scenes.go(NC.TitleScene(), true);
    else if (h === 'options') NC.Scenes.go(NC.OptionsScene(), true);
    else NC.Scenes.go(NC.BootScene(), true);
    requestAnimationFrame(frame);
  }
  boot();
})(window.NC = window.NC || {});
