// Keyboard + Gamepad input, snapshotted once per frame into per-player button states.
(function (NC) {
  'use strict';

  var BUTTONS = ['up', 'down', 'left', 'right', 'lp', 'hp', 'lk', 'hk', 'sp', 'start', 'back'];

  var KEYMAP = [
    { // Player 1
      KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
      KeyU: 'lp', KeyI: 'hp', KeyJ: 'lk', KeyK: 'hk', KeyO: 'sp',
      Enter: 'start', Space: 'start', Escape: 'back', Backspace: 'back'
    },
    { // Player 2
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      Numpad4: 'lp', Comma: 'lp', Numpad5: 'hp', Period: 'hp',
      Numpad1: 'lk', Semicolon: 'lk', Numpad2: 'hk', Quote: 'hk',
      Numpad6: 'sp', Slash: 'sp', NumpadEnter: 'start', Numpad0: 'back'
    }
  ];

  // Human-readable labels for the controls screen.
  NC.KEY_HELP = [
    ['MOVE', 'W A S D', 'ARROWS'],
    ['LIGHT PUNCH', 'U', ', / NUM4'],
    ['HEAVY PUNCH', 'I', '. / NUM5'],
    ['LIGHT KICK', 'J', '; / NUM1'],
    ['HEAVY KICK', 'K', "' / NUM2"],
    ['EASY SPECIAL', 'O', '/ / NUM6'],
    ['START', 'ENTER', 'NUM ENTER']
  ];

  function blank() {
    var o = {};
    for (var i = 0; i < BUTTONS.length; i++) o[BUTTONS[i]] = false;
    return o;
  }

  var keyState = [blank(), blank()];
  var latched = [blank(), blank()]; // keys pressed since the last poll (so quick taps are never lost)
  var prev = [blank(), blank()];
  var players = [
    { held: blank(), pressed: blank(), released: blank(), device: 'keyboard' },
    { held: blank(), pressed: blank(), released: blank(), device: 'keyboard' }
  ];
  var listeners = [];
  var lastKeyCode = null;

  function onKey(e, down) {
    var used = false;
    for (var p = 0; p < 2; p++) {
      var b = KEYMAP[p][e.code];
      if (b) { keyState[p][b] = down; if (down) latched[p][b] = true; used = true; }
    }
    if (down) {
      lastKeyCode = e.code;
      for (var i = 0; i < listeners.length; i++) listeners[i](e);
    }
    if (used) e.preventDefault();
  }
  window.addEventListener('keydown', function (e) { if (!e.repeat) onKey(e, true); else if (KEYMAP[0][e.code] || KEYMAP[1][e.code]) e.preventDefault(); });
  window.addEventListener('keyup', function (e) { onKey(e, false); });
  window.addEventListener('blur', function () { keyState = [blank(), blank()]; });

  var PAD_BTN = { 0: 'lk', 1: 'hk', 2: 'lp', 3: 'hp', 4: 'sp', 5: 'sp', 6: 'sp', 7: 'sp', 8: 'back', 9: 'start', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };

  function readPads(states) {
    var pads = navigator.getGamepads ? navigator.getGamepads() : [];
    var slot = 0;
    for (var i = 0; i < pads.length && slot < 2; i++) {
      var gp = pads[i];
      if (!gp || !gp.connected) continue;
      var s = states[slot];
      for (var b in PAD_BTN) {
        var btn = gp.buttons[b];
        if (btn && (btn.pressed || btn.value > 0.5)) s[PAD_BTN[b]] = true;
      }
      var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -0.5) s.left = true;
      if (ax > 0.5) s.right = true;
      if (ay < -0.5) s.up = true;
      if (ay > 0.5) s.down = true;
      players[slot].device = 'pad';
      slot++;
    }
  }

  // Called once per logic frame.
  function poll() {
    var merged = [blank(), blank()];
    for (var p = 0; p < 2; p++) for (var k in keyState[p]) { merged[p][k] = keyState[p][k] || latched[p][k]; latched[p][k] = false; }
    readPads(merged);
    for (p = 0; p < 2; p++) {
      var pl = players[p];
      for (var i = 0; i < BUTTONS.length; i++) {
        var b = BUTTONS[i];
        pl.pressed[b] = merged[p][b] && !prev[p][b];
        pl.released[b] = !merged[p][b] && prev[p][b];
        pl.held[b] = merged[p][b];
      }
      prev[p] = merged[p];
    }
  }

  // Menu helpers: either player can drive menus unless a player index is given.
  function menuPressed(btn, who) {
    if (who === 0 || who === 1) return players[who].pressed[btn];
    return players[0].pressed[btn] || players[1].pressed[btn];
  }
  function confirm(who) { return menuPressed('lp', who) || menuPressed('start', who) || menuPressed('hp', who); }
  function cancel(who) { return menuPressed('lk', who) || menuPressed('back', who); }

  NC.Input = {
    players: players,
    poll: poll,
    pressed: menuPressed,
    confirm: confirm,
    cancel: cancel,
    onAnyKey: function (fn) { listeners.push(fn); },
    lastKey: function () { var k = lastKeyCode; lastKeyCode = null; return k; },
    blank: blank
  };
})(window.NC = window.NC || {});
