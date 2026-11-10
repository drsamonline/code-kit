# code-kit

[![live](https://img.shields.io/badge/live-online-22c55e)](https://drsamonline.github.io/code-kit/)
[![test](https://github.com/drsamonline/code-kit/actions/workflows/test.yml/badge.svg)](https://github.com/drsamonline/code-kit/actions/workflows/test.yml)
[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)

**QR encoding, syntax highlighting and copyable code blocks.** Zero dependencies. One file.
The QR encoder is byte mode, versions 1–40, all four error levels and all eight masks, with
the matrix as data so a canvas, an SVG or a terminal can draw it.

## Use it

```js
var Code = require("./code-kit.js");          // Node; in a browser it is window.Code

var qr = Code.qr.encode("https://example.com", { level: "M" });
qr.size;                                      // 25 -> 25x25 modules
qr.modules;                                   // [[bool]] - the matrix, no canvas opinion

Code.qr.svg("https://example.com");           // an <svg> string, quiet zone included
Code.qr.ascii("hello");                       // ## / two spaces, for a terminal

Code.highlight("const a = 1;", "js");         // HTML with token spans
Code.snippet.html("npm i motion-kit", "bash");// a copyable block
```

## What it does

- **QR, versions 1–40** — byte mode, UTF-8 input, error levels L/M/Q/H, and the mask chosen
  by the standard penalty. `level`, `version` and `mask` can all be pinned
- **`qr.modules`** — the symbol as booleans, plus `qr.svg()` and `qr.ascii()`. There is no
  canvas, no image and no font: drawing it is the caller's choice
- **`qr.tables` and `qr.functionMap(version)`** — the RS block tables and which cells are
  pattern rather than data, because a reader needs both
- **a highlighter** for JavaScript/TypeScript, JSON, HTML, CSS, Python, Go, shell and SQL —
  comments, strings, numbers, keywords, function calls, tags, attributes and keys. Anything
  unrecognised is escaped and passed through, so a bad language never produces broken markup
- **`snippet.html()`** — a labelled block with a copy button, and `snippet.mount()` to wire it
  in a page. Code is always escaped: a `<script>` in a snippet stays text

## Verified

```
node test-node.js
95 passed, 0 failed
```

The shipped tests verify the encoder by **reading its own symbols back**, with a QR reader
written inside `test-node.js`: it parses the format information and checks the BCH code, unmasks
the data region, walks the placement order, de-interleaves the blocks, checks that every Reed–
Solomon syndrome is zero, and decodes the byte-mode payload. That round trip runs across nine
versions and every level, and once per mask.

Separately, `scripts/verify-qr.py` compares the encoder against **segno**, an independent
implementation, on three separable things — error correction and interleaving, placement and
format information, and an end-to-end matrix:

```
`pip install segno` — and it now runs in CI on every push, so a change to the tables cannot pass without an independent check. && python3 scripts/verify-qr.py
10 of 10 cases agree
```

Two honest notes from that comparison. segno writes an extra zero byte when the data stream is
already byte-aligned; the kit follows ISO/IEC 18004 §7.4.10 and writes nothing, so its pad
codewords start one byte earlier — both decode identically, because pad codewords are ignored.
And the two choose a mask independently in some cases, because segno evaluates the penalty with
its remainder bits unset; the kit evaluates the finished matrix, which is what the standard
describes. The verification script isolates both differences rather than papering over them.

## Consumers

None, by design — no app in the fleet is modified by this pass. The QR half is aimed at the
optical-transfer apps (BLINKTRANSFER, helioprism, lockhtml) and the highlighter at app-poets-studio
and TTB, which hand-roll both today.

## Support

<img src="docs/assets/support-portrait.jpg" width="72" height="72" alt="Dr. Sohil Momin" align="left" style="border-radius:50%;margin-right:1rem">

Free, offline, accountless — and staying that way. If it earned its keep:

| | |
|---|---|
| UPI (India) | `drsohilboi@ybl` — payee Dr. Sohil Momin, open amount, or scan [the QR](docs/assets/upi-qr.svg) |
| Ko-fi | [ko-fi.com/matneo](https://ko-fi.com/matneo) |
| PayPal | [paypal.me/drsohilmomin](https://paypal.me/drsohilmomin?locale.x=en_GB&country.x=IN) |
| My books | [Amazon author store](https://www.amazon.com/stores/author/B08ZT331LY/allbooks) |
| More apps | [drsamonline.github.io](https://drsamonline.github.io/) |
| Email | [sohilmomin2000@gmail.com](mailto:sohilmomin2000@gmail.com) |

Nothing is gated behind it: no accounts, no tracking, no network requests.

## Licence

PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin. Part of the Forge system — kits
open, orchestrator licensed.
