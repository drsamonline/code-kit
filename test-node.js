const path = require("path");
const Code = require(path.join(__dirname, "code-kit.js"));
let pass = 0, fail = 0;
function ok(n, c, e) { c ? (pass++, console.log("PASS  " + n + (e ? "  (" + e + ")" : ""))) : (fail++, console.log("FAIL  " + n + (e ? "  (" + e + ")" : ""))); }

/* ====================================================================== */
/* A QR reader, written here so the encoder is verified by being read      */
/* back: format info, unmasking, de-interleaving, RS syndromes, payload.   */
/* ====================================================================== */

const ERR = { L: 1, M: 0, Q: 3, H: 2 };

function gfTables() {
  const exp = new Array(512), log = new Array(256);
  let x = 1;
  for (let i = 0; i < 255; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) exp[i] = exp[i - 255];
  return { exp, log, mul: (a, b) => (a === 0 || b === 0 ? 0 : exp[log[a] + log[b]]) };
}
const GF = gfTables();

/* Read the 15 format bits from both copies and check the BCH. */
function readFormat(modules, size) {
  const bit = (r, c) => (modules[r][c] ? 1 : 0);
  let bits = 0;
  for (let i = 0; i <= 5; i++) bits |= bit(i, 8) << i;
  bits |= bit(7, 8) << 6;
  bits |= bit(8, 8) << 7;
  bits |= bit(8, 7) << 8;
  for (let i = 9; i < 15; i++) bits |= bit(8, 14 - i) << i;

  /* second copy, to prove both were written the same */
  let second = 0;
  for (let i = 0; i < 8; i++) second |= bit(8, size - 1 - i) << i;
  for (let i = 8; i < 15; i++) second |= bit(size - 15 + i, 8) << i;

  const unmasked = bits ^ 0x5412;
  /* BCH(15,5) check: the remainder of the whole 15-bit word must be zero */
  let rem = unmasked;
  for (let i = 14; i >= 10; i--) {
    if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
  }
  return {
    data: unmasked >> 10,
    bch: rem === 0,
    same: bits === second
  };
}

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => (r * c) % 2 + (r * c) % 3 === 0,
  (r, c) => ((r * c) % 2 + (r * c) % 3) % 2 === 0,
  (r, c) => ((r + c) % 2 + (r * c) % 3) % 2 === 0
];

/* Walk the data region in placement order, unmasking as we go. */
function readCodewords(result, mask) {
  const { modules, fn, size } = result;
  const f = MASKS[mask];
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const col = right - j;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - vert : vert;
        if (fn[row][col]) continue;
        bits.push((modules[row][col] ? 1 : 0) ^ (f(row, col) ? 1 : 0));
      }
    }
  }
  const cw = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    cw.push(b);
  }
  return cw;
}

/* Split the interleaved stream back into blocks. */
function deinterleave(cw, spec) {
  const blocks = [];
  spec.forEach((g) => {
    for (let k = 0; k < g.blocks; k++) blocks.push({ data: [], ec: [], ecLen: g.ec, dataLen: g.data });
  });
  let idx = 0;
  const maxData = Math.max(...blocks.map((b) => b.dataLen));
  for (let i = 0; i < maxData; i++) {
    for (const b of blocks) if (i < b.dataLen) b.data.push(cw[idx++]);
  }
  const ecLen = blocks[0].ecLen;
  for (let i = 0; i < ecLen; i++) for (const b of blocks) b.ec.push(cw[idx++]);
  return blocks;
}

/* Every syndrome of a block must be zero for the codeword to be valid. */
function syndromesZero(block) {
  const cw = block.data.concat(block.ec);
  const n = cw.length;
  for (let j = 0; j < block.ecLen; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum ^= GF.mul(cw[i], GF.exp[(j * (n - 1 - i)) % 255]);
    if (sum !== 0) return false;
  }
  return true;
}

/* Parse the byte-mode payload out of the reconstructed data codewords. */
function readPayload(dataCodewords, version) {
  const bits = [];
  dataCodewords.forEach((b) => {
    for (let i = 7; i >= 0; i--) bits.push((b >> i) & 1);
  });
  let pos = 0;
  const take = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = (v << 1) | bits[pos++];
    return v;
  };
  const mode = take(4);
  const count = take(version < 10 ? 8 : 16);
  const bytes = [];
  for (let i = 0; i < count; i++) bytes.push(take(8));
  return { mode, count, bytes };
}

/* Full round trip. */
function roundTrip(text, version, level, mask) {
  const r = Code.qr.encode(text, { version, level, mask });
  const fmt = readFormat(r.modules, r.size);
  const spec = Code.qr.tables.rs[version][level];
  const blocks = deinterleave(readCodewords(r, r.mask), spec);
  const data = [];
  blocks.forEach((b) => data.push(...b.data));
  const payload = readPayload(data, version);
  const out = new TextDecoder("utf-8").decode(Uint8Array.from(payload.bytes));
  return {
    size: r.size,
    bch: fmt.bch,
    copiesAgree: fmt.same,
    level: fmt.data >> 3,
    mask: fmt.data & 7,
    syndromes: blocks.every(syndromesZero),
    text: out,
    ok: out === text && payload.mode === 4
  };
}

/* ---------- structure ---------- */
const r1 = Code.qr.encode("HELLO", { version: 1, level: "L" });
ok("version is a string", typeof Code.version === "string", Code.version);
ok("version 1 is 21x21", r1.size === 21 && r1.modules.length === 21);
ok("matrix is square and boolean", r1.modules.every((row) => row.length === 21 && row.every((v) => typeof v === "boolean")));
ok("finder pattern top-left", (function () {
  for (let r = 0; r <= 6; r++) for (let c = 0; c <= 6; c++) {
    const want = (r === 0 || r === 6 || c === 0 || c === 6) ? true : (r >= 2 && r <= 4 && c >= 2 && c <= 4);
    if (r1.modules[r][c] !== want) return false;
  }
  return true;
})());
ok("finder pattern top-right", r1.modules[0][20] === true && r1.modules[6][14] === true && r1.modules[3][17] === true);
ok("finder pattern bottom-left", r1.modules[20][0] === true && r1.modules[14][6] === true);
ok("separators are light", r1.modules[7][7] === false && r1.modules[7][0] === false && r1.modules[0][7] === false);
ok("timing row alternates", (function () {
  for (let c = 8; c < 13; c++) if (r1.modules[6][c] !== (c % 2 === 0)) return false;
  return true;
})());
ok("timing column alternates", (function () {
  for (let r = 8; r < 13; r++) if (r1.modules[r][6] !== (r % 2 === 0)) return false;
  return true;
})());
ok("dark module", r1.modules[r1.size - 8][8] === true);
ok("mask is 0-7", r1.mask >= 0 && r1.mask <= 7, r1.mask);
ok("version 7 has alignment patterns", (function () {
  const r = Code.qr.encode("x".repeat(60), { version: 7, level: "L" });
  return r.modules[22][22] === true && r.modules[24][24] === true && r.modules[23][23] === false;
})());
ok("version 7 has version info", (function () {
  const r = Code.qr.encode("x".repeat(60), { version: 7, level: "L" });
  let dark = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) if (r.modules[i][r.size - 11 + j]) dark++;
  return dark > 0;
})());

/* ---------- round trip, across versions, levels and masks ---------- */
const payloads = [
  ["HELLO", 1, "L"],
  ["https://drsamonline.github.io/motion-kit/", 3, "M"],
  ["a", 1, "H"],
  ["The quick brown fox jumps over the lazy dog.", 4, "Q"],
  ["x".repeat(100), 6, "L"],
  ["unicode: नमस्ते — ok", 5, "M"],
  ["0123456789".repeat(8), 10, "Q"],
  ["payload ".repeat(60), 15, "L"],
  ["big ".repeat(200), 25, "M"]
];

payloads.forEach((p) => {
  const t = roundTrip(p[0], p[1], p[2]);
  ok("round trip v" + p[1] + " " + p[2] + " (" + p[0].length + " bytes)", t.ok, t.size + "x" + t.size);
  ok("  format BCH valid v" + p[1] + " " + p[2], t.bch && t.copiesAgree);
  ok("  level read back v" + p[1] + " " + p[2], t.level === ERR[p[2]], "level bits " + t.level);
  ok("  RS syndromes zero v" + p[1] + " " + p[2], t.syndromes);
});

/* every mask must round trip too */
let maskFails = [];
for (let m = 0; m < 8; m++) {
  const t = roundTrip("mask " + m, 2, "M", m);
  if (!t.ok || t.mask !== m) maskFails.push(m);
}
ok("all eight masks round trip and are read back", maskFails.length === 0, "failed: " + maskFails.join(","));

/* UTF-8 payloads survive */
ok("multi-byte UTF-8 round trips", roundTrip("नमस्ते दुनिया", 4, "Q").ok);
ok("emoji round trips", roundTrip("ok \u2713 done", 2, "L").ok);

/* ---------- capacity and errors ---------- */
ok("empty string encodes", Code.qr.encode("").size === 21);
ok("auto version grows with the payload", Code.qr.encode("x".repeat(200)).version > 1);
ok("auto version 1 for a short payload", Code.qr.encode("hi").version === 1);
ok("level H is smaller capacity than L", (function () {
  try { Code.qr.encode("x".repeat(100), { version: 3, level: "H" }); return false; }
  catch (e) { return /does not fit/.test(e.message); }
})());
ok("too much data for version 40 throws", (function () {
  try { Code.qr.encode("x".repeat(3000), { level: "H" }); return false; }
  catch (e) { return /too much data/.test(e.message); }
})());
ok("bad level throws", (function () {
  try { Code.qr.encode("x", { level: "Z" }); return false; } catch (e) { return /level/.test(e.message); }
})());
ok("bad mask throws", (function () {
  try { Code.qr.encode("x", { mask: 9 }); return false; } catch (e) { return /mask/.test(e.message); }
})());
ok("bad version throws", (function () {
  try { Code.qr.encode("x", { version: 41 }); return false; } catch (e) { return /version/.test(e.message); }
})());

/* ---------- svg and ascii ---------- */
const svg = Code.qr.svg("HELLO");
ok("svg is an svg", svg.indexOf("<svg") === 0 && svg.indexOf("</svg>") > 0);
ok("svg has a path", svg.indexOf('<path d="M') > 0);
ok("svg honours the quiet zone", svg.indexOf('viewBox="0 0 29 29"') > 0, svg.slice(0, 120));
ok("svg takes colours", Code.qr.svg("x", { dark: "#111111", light: "#eeeeee" }).indexOf("#111111") > 0);
const ascii = Code.qr.ascii("HELLO");
ok("ascii has one row per module", ascii.split("\n").length === 21);
ok("ascii uses two characters per module", ascii.split("\n")[0].length === 42);

/* ---------- highlighter ---------- */
const hl = Code.highlight;
ok("unknown language is escaped text", hl("<b>", "nope") === "&lt;b&gt;");
ok("no language is escaped text", hl("<b>") === "&lt;b&gt;");
ok("js keyword", hl("const a = 1;", "js").indexOf("tok-kw") > 0);
ok("js string", hl('var s = "hi";', "js").indexOf("tok-str") > 0);
ok("js comment", hl("// note", "js").indexOf("tok-com") > 0);
ok("js number", hl("var n = 42;", "js").indexOf("tok-num") > 0);
ok("js function call", hl("run()", "js").indexOf("tok-fn") > 0);
ok("js block comment", hl("/* a\nb */", "js").indexOf("tok-com") > 0);
ok("html tag", hl("<div class=\"a\">", "html").indexOf("tok-tag") > 0);
ok("html comment", hl("<!-- x -->", "html").indexOf("tok-com") > 0);
ok("css property", hl("color: red;", "css").indexOf("tok-key") > 0);
ok("json key", hl('{"a": 1}', "json").indexOf("tok-key") > 0);
ok("python comment", hl("# note", "py").indexOf("tok-com") > 0);
ok("python triple quote", hl('"""doc"""', "py").indexOf("tok-str") > 0);
ok("go keyword", hl("func main() {}", "go").indexOf("tok-kw") > 0);
ok("bash keyword", hl("if true; then echo hi; fi", "sh").indexOf("tok-kw") > 0);
ok("sql keyword", hl("SELECT * FROM t", "sql").indexOf("tok-kw") > 0);
ok("script in code is escaped, never live", hl('<script>alert(1)</script>', "html").indexOf("<script>") === -1);
ok("quote in code is escaped", hl('var s = "<b>";', "js").indexOf("&lt;b&gt;") > 0);
ok("highlighting preserves the text", (function () {
  const src = 'const a = "x"; // c';
  const html = hl(src, "js");
  const text = html.replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  return text === src;
})(), hl('const a = "x"; // c', "js"));
ok("languages are listed", Code.languages.indexOf("js") >= 0 && Code.languages.indexOf("sql") >= 0, Code.languages.length + " languages");

/* ---------- snippet ---------- */
const snip = Code.snippet.html('npm i motion-kit', { language: "bash" });
ok("snippet wrapper", snip.indexOf('class="snippet"') > 0);
ok("snippet label", snip.indexOf('class="snippet-lang">bash') > 0);
ok("snippet copy button", snip.indexOf("snippet-copy") > 0);
ok("copy can be turned off", Code.snippet.html("x", { copy: false }).indexOf("snippet-copy") === -1);
ok("snippet escapes its code", Code.snippet.html("<b>", {}).indexOf("&lt;b&gt;") > 0);
ok("snippet code carries the language class", snip.indexOf('class="language-bash"') > 0);
ok("snippet mount is null without a DOM", Code.snippet.mount(null, "x") === null);
ok("copy is false without a clipboard", Code.snippet.copy("x") === false);

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
