# code-kit — API reference

**Version 1.0.0.** **QR encoding, syntax highlighting and copyable code blocks.** Zero dependencies. One file. The QR encoder is byte mode, versions 1–40, all four error levels and all eight masks, with the matrix as data so a canvas, an SVG or a terminal can draw it.

Generated from the source in this repository: every name, argument and
note below is read out of the kit file, so it cannot describe a function
that is not there.

```js
<script src="code-kit.js"></script>
Code.encode(...)
// or: const Code = require('./code-kit.js')
```

## The surface (11 entries)

| Name | Arguments | What it does |
|---|---|---|
| `Code.QR.encode` | `(text, opts)` | — |
| `Code.QR.tables` | `()` | — |
| `Code.QR.functionMap` | `(version)` | — |
| `Code.QR.matrix` | `(version, level, codewords, mask)` | — |
| `Code.QR.svg` | `(text, opts)` | A matrix as SVG, for a page that wants an image rather than a canvas. |
| `Code.QR.ascii` | `(text, opts)` | An ASCII matrix, for a terminal or a test. |
| `Code.escape` | `(s)` | — |
| `Code.highlight` | `(src, lang)` | Highlight returns HTML. The default language is the identity: escaped text. |
| `Code.Snippet.html` | `(code, opts)` | — |
| `Code.Snippet.copy` | `(code, opts)` | — |
| `Code.Snippet.mount` | `(el, code, opts)` | Mount the markup and wire the copy button. Guarded: null in Node. |

## Notes

- Zero dependencies, one file, no build step: it works from `file://`, from a
  `<script>` tag and from Node.
- The version above is the `VERSION` file in this repository; a pinned copy is
  what an app vendors.
