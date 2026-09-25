// On-screen controls for touch devices: a d-pad on the left, SNES-style face buttons
// on the right. They drive player 1 through NC.Input.touch().
(function (NC) {
  'use strict';
  if (!('ontouchstart' in window) && !(window.matchMedia && matchMedia('(pointer: coarse)').matches)) return;

  var root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML =
    '<div class="dpad">' +
    '<b data-d="up,left"></b><b data-d="up">&#9650;</b><b data-d="up,right"></b>' +
    '<b data-d="left">&#9664;</b><b></b><b data-d="right">&#9654;</b>' +
    '<b data-d="down,left"></b><b data-d="down">&#9660;</b><b data-d="down,right"></b></div>' +
    '<div class="mid"><button data-b="back">BACK</button><button data-b="start">START</button></div>' +
    '<div class="face">' +
    '<button data-b="lp" class="y">LP</button><button data-b="hp" class="x">HP</button>' +
    '<button data-b="sp" class="sp">SP</button>' +
    '<button data-b="lk" class="b">LK</button><button data-b="hk" class="a">HK</button></div>';
  document.body.appendChild(root);
  document.body.classList.add('has-touch');

  // Each finger tracks which controls it currently holds, so sliding across the d-pad works.
  var held = {}; // touchId -> [btn, ...]
  function btnsAt(x, y) {
    var el = document.elementFromPoint(x, y);
    if (!el || !root.contains(el)) return [];
    if (el.dataset.d) return el.dataset.d.split(',');
    if (el.dataset.b) return [el.dataset.b];
    return [];
  }
  function apply(id, list) {
    var prev = held[id] || [];
    prev.forEach(function (b) { if (list.indexOf(b) < 0) NC.Input.touch(b, false); });
    list.forEach(function (b) { if (prev.indexOf(b) < 0) NC.Input.touch(b, true); });
    held[id] = list;
    root.querySelectorAll('[data-d],[data-b]').forEach(function (el) {
      var on = false;
      for (var k in held) held[k].forEach(function (b) { if ((el.dataset.b === b) || (el.dataset.d === b)) on = true; });
      el.classList.toggle('on', on);
    });
  }
  function handle(e) {
    e.preventDefault();
    NC.Audio.unlock();
    var cur = NC.Scenes.current;
    if (cur && !cur.menu) cur.clicked = true;
    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      if (e.type === 'touchend' || e.type === 'touchcancel') apply(t.identifier, []);
      else apply(t.identifier, btnsAt(t.clientX, t.clientY));
    }
  }
  ['touchstart', 'touchmove', 'touchend', 'touchcancel'].forEach(function (ev) {
    root.addEventListener(ev, handle, { passive: false });
  });
})(window.NC = window.NC || {});
