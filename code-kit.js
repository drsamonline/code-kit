/* code-kit — QR encoding, syntax highlighting and snippet blocks. Zero dependencies.
 *
 *   var Code = require("./code-kit.js");
 *   Code.qr("https://example.com").modules;      // [[bool]] - the matrix, no canvas opinion
 *   Code.highlight("const a = 1;", "js");        // HTML with token spans
 *   Code.snippet.html("npm i", "bash");          // a copyable block
 *
 * The QR encoder is byte mode, versions 1-40, error levels L/M/Q/H, all eight
 * masks, chosen by the standard penalty. Its output is verified cell-for-cell
 * against an independent implementation (see test-node.js).
 *
 * Ported in spirit from lobe-mygo pkg/code (MIT), which draws a QR on a GPU
 * surface; here the matrix is data, so a canvas, an SVG or a terminal can draw it.
 *
 * PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Code = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  var Code = { version: "1.0.0" };

  /* ==================================================================== */
  /* QR                                                                   */
  /* ==================================================================== */

  var QR = {};
  Code.qr = QR;

  /* ---------- spec tables ---------- */
  /* Per version: blocks:dataCodewords:ecCodewords per group, for L, M, Q, H.
     Spec constants (ISO/IEC 18004), cross-checked against segno. */
  var RS_ROWS = [
  "1|1:19:7|1:16:10|1:13:13|1:9:17",
  "2|1:34:10|1:28:16|1:22:22|1:16:28",
  "3|1:55:15|1:44:26|2:17:18|2:13:22",
  "4|1:80:20|2:32:18|2:24:26|4:9:16",
  "5|1:108:26|2:43:24|2:15:18;2:16:18|2:11:22;2:12:22",
  "6|2:68:18|4:27:16|4:19:24|4:15:28",
  "7|2:78:20|4:31:18|2:14:18;4:15:18|4:13:26;1:14:26",
  "8|2:97:24|2:38:22;2:39:22|4:18:22;2:19:22|4:14:26;2:15:26",
  "9|2:116:30|3:36:22;2:37:22|4:16:20;4:17:20|4:12:24;4:13:24",
  "10|2:68:18;2:69:18|4:43:26;1:44:26|6:19:24;2:20:24|6:15:28;2:16:28",
  "11|4:81:20|1:50:30;4:51:30|4:22:28;4:23:28|3:12:24;8:13:24",
  "12|2:92:24;2:93:24|6:36:22;2:37:22|4:20:26;6:21:26|7:14:28;4:15:28",
  "13|4:107:26|8:37:22;1:38:22|8:20:24;4:21:24|12:11:22;4:12:22",
  "14|3:115:30;1:116:30|4:40:24;5:41:24|11:16:20;5:17:20|11:12:24;5:13:24",
  "15|5:87:22;1:88:22|5:41:24;5:42:24|5:24:30;7:25:30|11:12:24;7:13:24",
  "16|5:98:24;1:99:24|7:45:28;3:46:28|15:19:24;2:20:24|3:15:30;13:16:30",
  "17|1:107:28;5:108:28|10:46:28;1:47:28|1:22:28;15:23:28|2:14:28;17:15:28",
  "18|5:120:30;1:121:30|9:43:26;4:44:26|17:22:28;1:23:28|2:14:28;19:15:28",
  "19|3:113:28;4:114:28|3:44:26;11:45:26|17:21:26;4:22:26|9:13:26;16:14:26",
  "20|3:107:28;5:108:28|3:41:26;13:42:26|15:24:30;5:25:30|15:15:28;10:16:28",
  "21|4:116:28;4:117:28|17:42:26|17:22:28;6:23:28|19:16:30;6:17:30",
  "22|2:111:28;7:112:28|17:46:28|7:24:30;16:25:30|34:13:24",
  "23|4:121:30;5:122:30|4:47:28;14:48:28|11:24:30;14:25:30|16:15:30;14:16:30",
  "24|6:117:30;4:118:30|6:45:28;14:46:28|11:24:30;16:25:30|30:16:30;2:17:30",
  "25|8:106:26;4:107:26|8:47:28;13:48:28|7:24:30;22:25:30|22:15:30;13:16:30",
  "26|10:114:28;2:115:28|19:46:28;4:47:28|28:22:28;6:23:28|33:16:30;4:17:30",
  "27|8:122:30;4:123:30|22:45:28;3:46:28|8:23:30;26:24:30|12:15:30;28:16:30",
  "28|3:117:30;10:118:30|3:45:28;23:46:28|4:24:30;31:25:30|11:15:30;31:16:30",
  "29|7:116:30;7:117:30|21:45:28;7:46:28|1:23:30;37:24:30|19:15:30;26:16:30",
  "30|5:115:30;10:116:30|19:47:28;10:48:28|15:24:30;25:25:30|23:15:30;25:16:30",
  "31|13:115:30;3:116:30|2:46:28;29:47:28|42:24:30;1:25:30|23:15:30;28:16:30",
  "32|17:115:30|10:46:28;23:47:28|10:24:30;35:25:30|19:15:30;35:16:30",
  "33|17:115:30;1:116:30|14:46:28;21:47:28|29:24:30;19:25:30|11:15:30;46:16:30",
  "34|13:115:30;6:116:30|14:46:28;23:47:28|44:24:30;7:25:30|59:16:30;1:17:30",
  "35|12:121:30;7:122:30|12:47:28;26:48:28|39:24:30;14:25:30|22:15:30;41:16:30",
  "36|6:121:30;14:122:30|6:47:28;34:48:28|46:24:30;10:25:30|2:15:30;64:16:30",
  "37|17:122:30;4:123:30|29:46:28;14:47:28|49:24:30;10:25:30|24:15:30;46:16:30",
  "38|4:122:30;18:123:30|13:46:28;32:47:28|48:24:30;14:25:30|42:15:30;32:16:30",
  "39|20:117:30;4:118:30|40:47:28;7:48:28|43:24:30;22:25:30|10:15:30;67:16:30",
  "40|19:118:30;6:119:30|18:47:28;31:48:28|34:24:30;34:25:30|20:15:30;61:16:30"
  ];

  var ALIGN_ROWS = [
  "2|6,18",
  "3|6,22",
  "4|6,26",
  "5|6,30",
  "6|6,34",
  "7|6,22,38",
  "8|6,24,42",
  "9|6,26,46",
  "10|6,28,50",
  "11|6,30,54",
  "12|6,32,58",
  "13|6,34,62",
  "14|6,26,46,66",
  "15|6,26,48,70",
  "16|6,26,50,74",
  "17|6,30,54,78",
  "18|6,30,56,82",
  "19|6,30,58,86",
  "20|6,34,62,90",
  "21|6,28,50,72,94",
  "22|6,26,50,74,98",
  "23|6,30,54,78,102",
  "24|6,28,54,80,106",
  "25|6,32,58,84,110",
  "26|6,30,58,86,114",
  "27|6,34,62,90,118",
  "28|6,26,50,74,98,122",
  "29|6,30,54,78,102,126",
  "30|6,26,52,78,104,130",
  "31|6,30,56,82,108,134",
  "32|6,34,60,86,112,138",
  "33|6,30,58,86,114,142",
  "34|6,34,62,90,118,146",
  "35|6,30,54,78,102,126,150",
  "36|6,24,50,76,102,128,154",
  "37|6,28,54,80,106,132,158",
  "38|6,32,58,84,110,136,162",
  "39|6,26,54,82,110,138,166",
  "40|6,30,58,86,114,142,170"
  ];

  var RS = {}, ALIGN = {};
  RS_ROWS.forEach(function (row) {
    var p = row.split("|");
    var v = +p[0];
    RS[v] = {};
    ["L", "M", "Q", "H"].forEach(function (lvl, i) {
      RS[v][lvl] = p[i + 1].split(";").map(function (g) {
        var x = g.split(":");
        return { blocks: +x[0], data: +x[1], ec: +x[2] };
      });
    });
  });
  ALIGN_ROWS.forEach(function (row) {
    var p = row.split("|");
    ALIGN[+p[0]] = p[1].split(",").map(Number);
  });

  /* ---------- GF(256), primitive polynomial 0x11d ---------- */
  var EXP = new Array(512), LOG = new Array(256);
  (function () {
    var x = 1;
    for (var i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
    for (i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
  })();

  function gmul(a, b) { return (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]]; }

  function polyMul(a, b) {
    var out = new Array(a.length + b.length - 1).fill(0);
    for (var i = 0; i < a.length; i++) {
      if (!a[i]) continue;
      for (var j = 0; j < b.length; j++) out[i + j] ^= gmul(a[i], b[j]);
    }
    return out;
  }

  function generator(ecLen) {
    var g = [1];
    for (var i = 0; i < ecLen; i++) g = polyMul(g, [1, EXP[i]]);
    return g;
  }

  var GEN_CACHE = {};
  function rsEncode(data, ecLen) {
    var g = GEN_CACHE[ecLen] || (GEN_CACHE[ecLen] = generator(ecLen));
    var res = data.concat(new Array(ecLen).fill(0));
    for (var i = 0; i < data.length; i++) {
      var f = res[i];
      if (!f) continue;
      for (var j = 0; j < g.length; j++) res[i + j] ^= gmul(g[j], f);
    }
    return res.slice(data.length);
  }

  /* ---------- capacity ---------- */
  function dataCodewords(version, level) {
    return RS[version][level].reduce(function (n, g) { return n + g.blocks * g.data; }, 0);
  }

  function utf8(text) {
    var out = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
        var d = text.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
      } else out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
  QR.utf8 = utf8;

  function pickVersion(byteLen, level) {
    for (var v = 1; v <= 40; v++) {
      var cci = v < 10 ? 8 : 16;
      var need = 4 + cci + byteLen * 8;
      if (need <= dataCodewords(v, level) * 8) return v;
    }
    return null;
  }

  /* ---------- codewords ---------- */
  function codewords(bytes, version, level) {
    var spec = RS[version][level];
    var total = dataCodewords(version, level);
    var bits = [];

    function push(value, len) {
      for (var i = len - 1; i >= 0; i--) bits.push((value >> i) & 1);
    }

    push(0b0100, 4);                       /* byte mode */
    push(bytes.length, version < 10 ? 8 : 16);
    bytes.forEach(function (b) { push(b, 8); });

    var cap = total * 8;
    push(0, Math.min(4, cap - bits.length));       /* terminator */
    while (bits.length % 8) bits.push(0);

    var cw = [];
    for (var i = 0; i < bits.length; i += 8) {
      var b = 0;
      for (var j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      cw.push(b);
    }
    var pad = [0xec, 0x11], p = 0;
    while (cw.length < total) cw.push(pad[p++ % 2]);

    var blocks = [], idx = 0;
    spec.forEach(function (g) {
      for (var k = 0; k < g.blocks; k++) {
        var slice = cw.slice(idx, idx + g.data);
        blocks.push({ data: slice, ec: rsEncode(slice, g.ec) });
        idx += g.data;
      }
    });

    var out = [], i2, k2;
    var maxData = Math.max.apply(null, blocks.map(function (b) { return b.data.length; }));
    for (i2 = 0; i2 < maxData; i2++) {
      for (k2 = 0; k2 < blocks.length; k2++) if (i2 < blocks[k2].data.length) out.push(blocks[k2].data[i2]);
    }
    var ecLen = blocks[0].ec.length;
    for (i2 = 0; i2 < ecLen; i2++) for (k2 = 0; k2 < blocks.length; k2++) out.push(blocks[k2].ec[i2]);
    return out;
  }
  QR.codewords = codewords;

  /* ---------- the matrix ---------- */
  function buildMatrix(version, level, cw, forcedMask) {
    var size = version * 4 + 17;
    var mod = [], fn = [], r, c;
    for (r = 0; r < size; r++) {
      mod.push(new Array(size).fill(false));
      fn.push(new Array(size).fill(false));
    }

    function set(r, c, dark) {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      mod[r][c] = !!dark; fn[r][c] = true;
    }

    /* Reserve a cell for a pattern drawn later. Marking it function without
       touching its value is what keeps the timing column intact: reserving the
       format strip must not blank the module at (8, 6). */
    function reserve(r, c) {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      fn[r][c] = true;
    }

    /* finders, with their separators */
    [[0, 0], [0, size - 7], [size - 7, 0]].forEach(function (o) {
      for (r = -1; r <= 7; r++) {
        for (c = -1; c <= 7; c++) {
          var rr = o[0] + r, cc = o[1] + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          var inner = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
                      (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
                      (r >= 2 && r <= 4 && c >= 2 && c <= 4);
          set(rr, cc, inner);
        }
      }
    });

    /* timing */
    for (var i = 8; i < size - 8; i++) {
      set(6, i, i % 2 === 0);
      set(i, 6, i % 2 === 0);
    }

    /* alignment */
    var pos = ALIGN[version] || [];
    for (var a = 0; a < pos.length; a++) {
      for (var b = 0; b < pos.length; b++) {
        var ar = pos[a], ac = pos[b];
        if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue;
        for (r = -2; r <= 2; r++) {
          for (c = -2; c <= 2; c++) {
            set(ar + r, ac + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
          }
        }
      }
    }

    /* reserve the format areas, and the version blocks on v7+ */
    for (i = 0; i <= 8; i++) { reserve(8, i); reserve(i, 8); }
    for (i = 0; i < 8; i++) { reserve(8, size - 1 - i); reserve(size - 1 - i, 8); }
    if (version >= 7) {
      for (i = 0; i < 18; i++) {
        var vv = size - 11 + (i % 3), hh = Math.floor(i / 3);
        reserve(hh, vv);
        reserve(vv, hh);
      }
    }

    /* data, in the standard zigzag */
    var bitIndex = 0, total = cw.length * 8;
    function bitAt(n) { return n < total ? ((cw[n >> 3] >> (7 - (n & 7))) & 1) === 1 : false; }

    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var col = right - j;
          var upward = ((right + 1) & 2) === 0;
          var row = upward ? size - 1 - vert : vert;
          if (fn[row][col]) continue;
          mod[row][col] = bitAt(bitIndex);
          bitIndex++;
        }
      }
    }

    /* masks */
    var MASKS = [
      function (r, c) { return (r + c) % 2 === 0; },
      function (r) { return r % 2 === 0; },
      function (r, c) { return c % 3 === 0; },
      function (r, c) { return (r + c) % 3 === 0; },
      function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
      function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
      function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
      function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
    ];

    function formatBits(mask) {
      var lv = { L: 1, M: 0, Q: 3, H: 2 }[level];
      var data = (lv << 3) | mask;
      var rem = data;
      for (var i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      return ((data << 10) | rem) ^ 0x5412;
    }

    function versionBits() {
      var rem = version;
      for (var i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
      return (version << 12) | rem;
    }

    function drawFormat(mask) {
      var bits = formatBits(mask);
      function bit(n) { return ((bits >> n) & 1) === 1; }
      for (i = 0; i <= 5; i++) set(i, 8, bit(i));
      set(7, 8, bit(6));
      set(8, 8, bit(7));
      set(8, 7, bit(8));
      for (i = 9; i < 15; i++) set(8, 14 - i, bit(i));
      for (i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
      for (i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
      set(size - 8, 8, true);
    }

    if (version >= 7) {
      var vbits = versionBits();
      for (i = 0; i < 18; i++) {
        var on = ((vbits >> i) & 1) === 1;
        var cc2 = size - 11 + (i % 3), rr2 = Math.floor(i / 3);
        set(rr2, cc2, on);
        set(cc2, rr2, on);
      }
    }

    function applyMask(mask) {
      var f = MASKS[mask];
      for (var r2 = 0; r2 < size; r2++) {
        for (var c2 = 0; c2 < size; c2++) {
          if (!fn[r2][c2] && f(r2, c2)) mod[r2][c2] = !mod[r2][c2];
        }
      }
    }

    function penalty() {
      var score = 0, r2, c2, run, dark = 0;

      /* runs of five or more */
      for (r2 = 0; r2 < size; r2++) {
        run = 1;
        for (c2 = 1; c2 <= size; c2++) {
          if (c2 < size && mod[r2][c2] === mod[r2][c2 - 1]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
      }
      for (c2 = 0; c2 < size; c2++) {
        run = 1;
        for (r2 = 1; r2 <= size; r2++) {
          if (r2 < size && mod[r2][c2] === mod[r2 - 1][c2]) run++;
          else { if (run >= 5) score += 3 + (run - 5); run = 1; }
        }
      }

      /* 2x2 blocks of one colour */
      for (r2 = 0; r2 < size - 1; r2++) {
        for (c2 = 0; c2 < size - 1; c2++) {
          var v = mod[r2][c2];
          if (v === mod[r2][c2 + 1] && v === mod[r2 + 1][c2] && v === mod[r2 + 1][c2 + 1]) score += 3;
        }
      }

      /* the finder-like 1:1:3:1:1 pattern */
      var A = [true, false, true, true, true, false, true, false, false, false, false];
      var B = [false, false, false, false, true, false, true, true, true, false, true];
      function matches(get, i) {
        for (var k = 0; k < 11; k++) if (get(i + k) !== A[k]) return false;
        return true;
      }
      function matchesB(get, i) {
        for (var k = 0; k < 11; k++) if (get(i + k) !== B[k]) return false;
        return true;
      }
      for (r2 = 0; r2 < size; r2++) {
        for (c2 = 0; c2 <= size - 11; c2++) {
          var rowGet = (function (rr) { return function (n) { return mod[rr][n]; }; })(r2);
          var colGet = (function (cc) { return function (n) { return mod[n][cc]; }; })(r2);
          if (matches(rowGet, c2) || matchesB(rowGet, c2)) score += 40;
          if (matches(colGet, c2) || matchesB(colGet, c2)) score += 40;
        }
      }

      /* the dark proportion */
      for (r2 = 0; r2 < size; r2++) for (c2 = 0; c2 < size; c2++) if (mod[r2][c2]) dark++;
      var pct = (dark * 100) / (size * size);
      score += Math.floor(Math.abs(pct - 50) / 5) * 10;
      return score;
    }

    if (forcedMask == null) {
      var best = 0, bestScore = Infinity;
      for (var m = 0; m < 8; m++) {
        applyMask(m); drawFormat(m);
        var s = penalty();
        if (s < bestScore) { bestScore = s; best = m; }
        applyMask(m); /* undo: the same mask applied twice cancels */
      }
      applyMask(best); drawFormat(best);
      return { size: size, modules: mod, fn: fn, mask: best, version: version, level: level, penalty: bestScore };
    }

    applyMask(forcedMask);
    drawFormat(forcedMask);
    return { size: size, modules: mod, fn: fn, mask: forcedMask, version: version, level: level, penalty: penalty() };
  }

  /* ---------- the public encode ---------- */
  QR.encode = function (text, opts) {
    var o = opts || {};
    var level = (o.level || "M").toUpperCase();
    if (!/^[LMQH]$/.test(level)) throw new Error("qr: level must be L, M, Q or H");
    var bytes = utf8(String(text == null ? "" : text));
    var version = o.version || pickVersion(bytes.length, level);
    if (!version) throw new Error("qr: too much data for version 40 at level " + level);
    if (version < 1 || version > 40) throw new Error("qr: version must be 1-40");
    if (dataCodewords(version, level) * 8 < 4 + (version < 10 ? 8 : 16) + bytes.length * 8) {
      throw new Error("qr: " + bytes.length + " bytes does not fit version " + version + " at level " + level);
    }
    var mask = o.mask == null ? null : o.mask;
    if (mask != null && (mask < 0 || mask > 7)) throw new Error("qr: mask must be 0-7");
    return buildMatrix(version, level, codewords(bytes, version, level), mask);
  };

  /* The spec tables and the function-module map, for a decoder or a test. A
     reader needs to know which cells are data and which are pattern, and which
     RS block each codeword belongs to; both are here rather than duplicated. */
  QR.tables = { rs: RS, align: ALIGN };
  QR.functionMap = function (version) {
    var r = buildMatrix(version, "L", codewords([0], version, "L"), 0);
    return r.fn;
  };

  /* The matrix from codewords you already have - the seam the tests use to
     compare this encoder's placement against an independent one, and the hook a
     caller needs to draw a symbol it did not build itself. */
  QR.matrix = function (version, level, codewords, mask) {
    if (!RS[version] || !RS[version][level]) throw new Error("qr: unknown version or level");
    return buildMatrix(version, level, codewords, mask == null ? null : mask);
  };

  /* A matrix as SVG, for a page that wants an image rather than a canvas. */
  QR.svg = function (text, opts) {
    var o = opts || {};
    var r = QR.encode(text, o);
    var quiet = o.quiet == null ? 4 : o.quiet;
    var dim = r.size + quiet * 2;
    var px = o.pixel || 4;
    var path = [];
    for (var y = 0; y < r.size; y++) {
      for (var x = 0; x < r.size; x++) {
        if (r.modules[y][x]) path.push("M" + (x + quiet) + " " + (y + quiet) + "h1v1h-1z");
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim +
      '" width="' + dim * px + '" height="' + dim * px + '" shape-rendering="crispEdges">' +
      '<rect width="' + dim + '" height="' + dim + '" fill="' + (o.light || "#ffffff") + '"/>' +
      '<path d="' + path.join("") + '" fill="' + (o.dark || "#000000") + '"/></svg>';
  };

  /* An ASCII matrix, for a terminal or a test. */
  QR.ascii = function (text, opts) {
    var r = QR.encode(text, opts);
    var out = [];
    for (var y = 0; y < r.size; y++) {
      var row = "";
      for (var x = 0; x < r.size; x++) row += r.modules[y][x] ? "##" : "  ";
      out.push(row);
    }
    return out.join("\n");
  };

  /* ---------- syntax highlighting ---------- */
  /* A small tokeniser, not a parser: comments, strings, numbers, keywords,
     function calls and punctuation, per language. Anything unknown is escaped
     and passed through, so a bad language never produces broken markup. */
  var KEYWORDS = {
    js: "var let const function return if else for while do switch case break continue new typeof instanceof class extends super this try catch finally throw await async yield import export from default null undefined true false delete in of void static get set",
    ts: "var let const function return if else for while do switch case break continue new typeof instanceof class extends super this try catch finally throw await async yield import export from default null undefined true false delete in of void static get set interface type enum implements readonly public private protected as satisfies",
    go: "break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var nil true false make new len cap append copy delete panic recover string int int64 float64 bool byte rune error",
    py: "def class return if elif else for while break continue import from as pass raise try except finally with lambda yield global nonlocal assert del in is not and or None True False async await self",
    sql: "select from where insert into values update set delete create table drop alter add column primary key foreign references join left right inner outer on group by order having limit offset as and or not null distinct union all index view",
    bash: "if then else elif fi for while do done case esac function return exit echo cd ls cat grep sed awk export local readonly source alias unset shift set",
    css: "",
    json: "true false null"
  };

  var LANGS = {
    js: [
      ["com", "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"],
      ["str", "\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'|`(?:\\\\.|[^`\\\\])*`"],
      ["num", "\\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?)\\b"],
      ["kw", "\\b(?:" + KEYWORDS.js.replace(/ /g, "|") + ")\\b"],
      ["fn", "\\b[A-Za-z_$][\\w$]*(?=\\s*\\()"],
      ["punc", "[{}()\\[\\];,.]"]
    ],
    json: [
      ["key", "\"(?:\\\\.|[^\"\\\\])*\"(?=\\s*:)"],
      ["str", "\"(?:\\\\.|[^\"\\\\])*\""],
      ["num", "-?\\b\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?\\b"],
      ["kw", "\\b(?:true|false|null)\\b"],
      ["punc", "[{}\\[\\]:,]"]
    ],
    css: [
      ["com", "\\/\\*[\\s\\S]*?\\*\\/"],
      ["str", "\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'"],
      ["num", "\\b\\d+(?:\\.\\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\\b|#[0-9a-fA-F]{3,8}\\b"],
      ["key", "[-a-zA-Z]+(?=\\s*:)"],
      ["punc", "[{}();,]"]
    ],
    html: [
      ["com", "<!--[\\s\\S]*?-->"],
      ["tag", "<\\/?[a-zA-Z][\\w-]*|\\/?>"],
      ["attr", "\\b[a-zA-Z-]+(?==)"],
      ["str", "\"[^\"]*\"|'[^']*'"]
    ]
  };

  LANGS.ts = LANGS.js;
  LANGS.tsx = LANGS.js;
  LANGS.jsx = LANGS.js;
  LANGS.py = [
    ["com", "#[^\\n]*"],
    ["str", "\"\"\"[\\s\\S]*?\"\"\"|'''[\\s\\S]*?'''|\"(?:\\\\.|[^\"\\\\])*\"|'(?:\\\\.|[^'\\\\])*'"],
    ["num", "\\b\\d+(?:\\.\\d+)?\\b"],
    ["kw", "\\b(?:" + KEYWORDS.py.replace(/ /g, "|") + ")\\b"],
    ["fn", "\\b[A-Za-z_][\\w]*(?=\\s*\\()"],
    ["punc", "[{}\\[\\]();,.:]"]
  ];
  LANGS.go = [
    ["com", "\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"],
    ["str", "\"(?:\\\\.|[^\"\\\\])*\"|`[^`]*`"],
    ["num", "\\b(?:0[xX][0-9a-fA-F]+|\\d+(?:\\.\\d+)?)\\b"],
    ["kw", "\\b(?:" + KEYWORDS.go.replace(/ /g, "|") + ")\\b"],
    ["fn", "\\b[A-Za-z_][\\w]*(?=\\s*\\()"],
    ["punc", "[{}\\[\\]();,.]"]
  ];
  LANGS.sh = [
    ["com", "#[^\\n]*"],
    ["str", "\"(?:\\\\.|[^\"\\\\])*\"|'[^']*'"],
    ["kw", "\\b(?:" + KEYWORDS.bash.replace(/ /g, "|") + ")\\b"],
    ["num", "\\b\\d+\\b"],
    ["punc", "[{}()\\[\\];|&<>]"]
  ];
  LANGS.bash = LANGS.sh;
  LANGS.sql = [
    ["com", "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/"],
    ["str", "'(?:''|[^'])*'"],
    ["num", "\\b\\d+(?:\\.\\d+)?\\b"],
    ["kw", "\\b(?:" + KEYWORDS.sql.replace(/ /g, "|") + ")\\b"],
    ["punc", "[(),;]"]
  ];

  Code.languages = Object.keys(LANGS);
  Code.escape = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* SQL is case-insensitive in practice, so its keywords match either case. */
  var FLAGS = { sql: "gi" };

  var RE_CACHE = {};
  function regexFor(lang) {
    if (RE_CACHE[lang]) return RE_CACHE[lang];
    var parts = LANGS[lang];
    var re = new RegExp(parts.map(function (p) { return "(" + p[1] + ")"; }).join("|"), FLAGS[lang] || "g");
    RE_CACHE[lang] = { re: re, classes: parts.map(function (p) { return p[0]; }) };
    return RE_CACHE[lang];
  }

  /* Highlight returns HTML. The default language is the identity: escaped text. */
  Code.highlight = function (src, lang) {
    var text = String(src == null ? "" : src);
    var key = String(lang || "").toLowerCase();
    if (!LANGS[key]) return Code.escape(text);

    var spec = regexFor(key);
    var re = spec.re;
    re.lastIndex = 0;
    var out = "", last = 0, m;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === "") { re.lastIndex++; continue; }
      if (m.index > last) out += Code.escape(text.slice(last, m.index));
      var cls = null;
      for (var i = 0; i < spec.classes.length; i++) {
        if (m[i + 1] !== undefined) { cls = spec.classes[i]; break; }
      }
      out += '<span class="tok-' + cls + '">' + Code.escape(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    out += Code.escape(text.slice(last));
    return out;
  };

  /* ---------- snippets ---------- */
  /* A code block that can be copied: the markup is a string, the clipboard call
     is the only part that needs a DOM. */
  var Snippet = {};
  Code.snippet = Snippet;

  Snippet.html = function (code, opts) {
    var o = opts || {};
    var lang = o.language || o.lang || "";
    var body = Code.highlight(code, lang);
    var label = o.label || lang || "text";
    return '<div class="snippet" data-lang="' + Code.escape(lang) + '">' +
      '<div class="snippet-head"><span class="snippet-lang">' + Code.escape(label) + "</span>" +
      (o.copy === false ? "" : '<button type="button" class="snippet-copy" aria-label="Copy code">Copy</button>') +
      '</div><pre><code class="language-' + Code.escape(lang) + '">' + body + "</code></pre></div>";
  };

  Snippet.copy = function (code, opts) {
    var o = opts || {};
    var text = String(code == null ? "" : code);
    if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  };

  /* Mount the markup and wire the copy button. Guarded: null in Node. */
  Snippet.mount = function (el, code, opts) {
    if (!el || typeof document === "undefined") return null;
    var o = opts || {};
    el.innerHTML = Snippet.html(code, o);
    var btn = el.querySelector(".snippet-copy");
    if (btn) {
      btn.addEventListener("click", function () {
        Snippet.copy(code, o);
        var old = btn.textContent;
        btn.textContent = "Copied";
        setTimeout(function () { btn.textContent = old; }, 1200);
      });
    }
    return el;
  };

  return Code;
});
