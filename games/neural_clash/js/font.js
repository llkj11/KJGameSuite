// 8x8 bitmap font baked from "Press Start 2P" by CodeMan38 (SIL Open Font License 1.1).
// Glyphs cover ASCII 32-126, one byte per row, MSB = leftmost pixel.
(function (NC) {
  'use strict';
  var HEX = '000000000000000038383830300030006c6c6c00000000006cfe6c6c6cfe6c00107cd07c16fc100062a4c810264a8c0070d8d870dacc7e0030303000000000000c18303030180c006030181818306000006c38fe386c00000018187e1818000000000000003030600000007e0000000000000000003030000204081020408000384cc6c6c66438001838181818187e007cc60e3c78e0fe007e0c183c06c67c001c3c6cccfe0c0c00fcc0fc0606c67c003c60c0fcc6c67c00fec60c183030300078c4e4789e867c007cc6c67e060c7800003030003030000000303000303060000c18306030180c000000fe00fe0000006030180c183060007cfec60c380038007c82baaabe807c00386cc6c6fec6c600fcc6c6fcc6c6fc003c66c0c0c0663c00f8ccc6c6c6ccf800fec0c0fcc0c0fe00fec0c0fcc0c0c0003e60c0cec6663e00c6c6c6fec6c6c6007e18181818187e000606060606c67c00c6ccd8f0f8dcce006060606060607e00c6eefed6d6c6c600c6e6f6decec6c6007cc6c6c6c6c67c00fcc6c6c6fcc0c0007cc6c6c6decc7a00fcc6c6cef8dcce007cc6c07c06c67c007e18181818181800c6c6c6c6c6c67c00c6c6c6ee7c381000d6d6d6d6feee4400c6c66c386cc6c6006666663c18181800fe0e1c3870e0fe003c30303030303c0080402010080402007818181818187800386c00000000000000000000000000fe100800000000000000007c067ec67e00c0c0fcc6c6c67c0000007ec0c0c07e0006067ec6c6c67e0000007cc6fec07c000e187e181818180000007ec6c67e067cc0c0fcc6c6c6c6001800381818187e000c001c0c0c0c0c78c0c0c6ccf8ccc6003818181818187e000000fcb6b6b6b6000000fcc6c6c6c60000007cc6c6c67c000000fcc6c6fcc0c000007ec6c67e060600006e706060600000007cc07c06fc0018187e18181818000000c6c6c6c67e0000006666663c18000000d6d6d6d66c000000c66c386cc6000000c6c6c67e067c0000fe1c3870fe000c18183018180c0018181818181818006030301830306000000070ba1c000000';
  var GLYPHS = [];
  for (var i = 0; i < 95; i++) {
    var rows = [];
    for (var r = 0; r < 8; r++) rows.push(parseInt(HEX.substr((i * 8 + r) * 2, 2), 16));
    GLYPHS.push(rows);
  }

  var atlasCache = {};
  function atlas(color) {
    if (atlasCache[color]) return atlasCache[color];
    var c = document.createElement('canvas');
    c.width = 95 * 8; c.height = 8;
    var x = c.getContext('2d');
    x.fillStyle = color;
    for (var g = 0; g < 95; g++) {
      for (var r = 0; r < 8; r++) {
        var bits = GLYPHS[g][r];
        for (var b = 0; b < 8; b++) if (bits & (128 >> b)) x.fillRect(g * 8 + b, r, 1, 1);
      }
    }
    atlasCache[color] = c;
    return c;
  }

  // Characters are 8px wide by default; the font is monospaced.
  function measure(str, spacing) {
    return String(str).length * (8 + (spacing || 0));
  }

  // opts: { align: 'left'|'center'|'right', shadow: color|false, spacing: px, scale: int }
  function draw(ctx, str, x, y, color, opts) {
    opts = opts || {};
    str = String(str);
    var sp = opts.spacing || 0;
    var sc = opts.scale || 1;
    var w = measure(str, sp) * sc;
    if (opts.align === 'center') x -= Math.floor(w / 2);
    else if (opts.align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (opts.shadow) drawRaw(ctx, str, x + sc, y + sc, opts.shadow, sp, sc);
    if (opts.outline) {
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++)
        if (ox || oy) drawRaw(ctx, str, x + ox, y + oy, opts.outline, sp, sc);
    }
    drawRaw(ctx, str, x, y, color, sp, sc);
    return w;
  }

  function drawRaw(ctx, str, x, y, color, sp, sc) {
    var a = atlas(color);
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i) - 32;
      if (code < 0 || code > 94) code = 31; // '?'
      if (code !== 0) ctx.drawImage(a, code * 8, 0, 8, 8, x + i * (8 + sp) * sc, y, 8 * sc, 8 * sc);
    }
  }

  // Two-tone "gradient" heading: top half one color, bottom half another (SNES title style).
  function drawGradient(ctx, str, x, y, top, bottom, opts) {
    opts = opts || {};
    var sc = opts.scale || 1;
    var w = measure(str, opts.spacing || 0) * sc;
    if (opts.align === 'center') x -= Math.floor(w / 2);
    else if (opts.align === 'right') x -= w;
    var o = { spacing: opts.spacing, scale: sc };
    if (opts.outline) {
      for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++)
        if (ox || oy) draw(ctx, str, x + ox, y + oy, opts.outline, o);
    }
    if (opts.shadow) draw(ctx, str, x + sc + 1, y + sc + 1, opts.shadow, o);
    draw(ctx, str, x, y, bottom, o);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 2, y - 2, w + 4, 4 * sc + 2);
    ctx.clip();
    draw(ctx, str, x, y, top, o);
    ctx.restore();
    return w;
  }

  // Word-wrap to a max character count per line.
  function wrap(str, maxChars) {
    var words = String(str).split(' ');
    var lines = [], cur = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if ((cur + (cur ? ' ' : '') + w).length > maxChars) {
        if (cur) lines.push(cur);
        cur = w;
      } else cur += (cur ? ' ' : '') + w;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  NC.Font = { draw: draw, drawGradient: drawGradient, measure: measure, wrap: wrap };
})(window.NC = window.NC || {});
