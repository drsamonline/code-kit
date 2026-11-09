#!/usr/bin/env python3
"""verify-qr.py — check this kit's QR encoder against an independent one.

The kit has no dependencies, so the shipped tests verify it by reading its own
symbols back (test-node.js: format BCH, unmasking, de-interleaving, RS
syndromes, payload). This script is the other half: a comparison against segno,
a mature independent implementation, run when the encoder or its tables change.

    pip install segno
    python3 scripts/verify-qr.py

Three checks, separable on purpose:

1. Error correction and interleaving — segno's make_final_message() is fed the
   kit's own data codewords; the bit stream must be identical.
2. Placement, masks, format and version information — segno's matrix builder is
   fed the kit's codewords; every cell must agree. The only cells excluded are
   the remainder bits, which segno leaves unset (0x2) and the kit sets to light;
   both read as light, so they are not a disagreement.
3. End to end — segno's own codewords are fed to the kit's matrix builder, and
   the result must equal segno's public output exactly.

Note on padding: segno writes a zero byte when the data stream is already
byte-aligned (write_padding_bits adds 8 - length % 8 bits, so 8 when aligned).
The kit follows ISO/IEC 18004 7.4.10 literally and adds nothing when aligned,
so its pad codewords start one byte earlier. Both decode identically - pad
codewords are ignored - and check 3 is written to isolate exactly that.

Exit code is non-zero if anything differs.
"""
import json
import os
import subprocess
import sys

try:
    import segno
    import segno.encoder as E
    import segno.consts as C
except ImportError:
    sys.exit("verify-qr: pip install segno first")

ERR = {"L": 1, "M": 0, "Q": 3, "H": 2}
KIT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "code-kit.js")

CASES = [
    (1, "L", "HELLO"),
    (1, "H", "HELLO"),
    (2, "M", "https://a.bc/"),
    (3, "Q", "The quick brown fox 0123456789"),
    (5, "L", "x" * 80),
    (7, "M", "QR verification payload: नमस्ते text"),
    (10, "L", "y" * 250),
    (15, "H", "z" * 200),
    (25, "L", "w" * 1200),
    (40, "L", "q" * 2000),
]


def node(script, payload):
    res = subprocess.run(["node", "-e", script, json.dumps(payload)],
                         capture_output=True, text=True)
    if res.returncode:
        sys.exit("verify-qr: node failed\n" + res.stderr)
    return json.loads(res.stdout)


def kit_encode(cases):
    js = """
    const C = require(__KIT__);
    const cases = JSON.parse(process.argv[1]);
    console.log(JSON.stringify(cases.map(([v, lvl, text]) => {
      const r = C.qr.encode(text, { version: v, level: lvl });
      return {
        v, lvl, mask: r.mask,
        cw: C.qr.codewords(C.qr.utf8(text), v, lvl),
        rows: r.modules.map(row => row.map(b => (b ? 1 : 0)).join("")),
      };
    })));
    """
    return node(js.replace("__KIT__", json.dumps(KIT)), [list(c) for c in cases])


def kit_matrix(version, level, codewords, mask):
    js = """
    const C = require(__KIT__);
    const a = JSON.parse(process.argv[1]);
    const r = C.qr.matrix(a.version, a.level, a.cw, a.mask);
    console.log(JSON.stringify(r.modules.map(row => row.map(b => (b ? 1 : 0)).join(""))));
    """
    return node(js.replace("__KIT__", json.dumps(KIT)),
                {"version": version, "level": level, "cw": codewords, "mask": mask})


def deinterleave(cw, groups):
    """Interleaved stream -> block-ordered data codewords (the encoder's input)."""
    blocks = []
    for g in groups:
        for _ in range(g.num_blocks):
            blocks.append({"len": g.num_data, "data": []})
    idx = 0
    for i in range(max(b["len"] for b in blocks)):
        for b in blocks:
            if i < b["len"]:
                b["data"].append(cw[idx])
                idx += 1
    out = []
    for b in blocks:
        out.extend(b["data"])
    return out


def bits_of(codewords):
    out = []
    for cw in codewords:
        out.extend((cw >> i) & 1 for i in reversed(range(8)))
    return out


def segno_codewords(version, level, text):
    """segno's own pipeline, quirks included."""
    segs = E.prepare_data(text, C.MODE_BYTE, None)
    vr = (C.VERSION_RANGE_01_09 if version <= 9 else
          C.VERSION_RANGE_10_26 if version <= 26 else C.VERSION_RANGE_27_40)
    buff = E.Buffer()
    for seg in segs:
        E.write_segment(buff, seg, None, vr)
    cap = C.SYMBOL_CAPACITY[version][ERR[level]]
    E.write_terminator(buff, cap, None, len(buff))
    E.write_padding_bits(buff, version, len(buff))
    E.write_pad_codewords(buff, version, cap, len(buff))
    ref_bits = list(E.make_final_message(version, ERR[level], buff))
    return [int("".join(map(str, ref_bits[i:i + 8])), 2)
            for i in range(0, len(ref_bits) // 8 * 8, 8)]


def main():
    mine = kit_encode(CASES)
    failures = 0
    print("%-4s %-9s %-8s %-10s %s" % ("", "case", "ecc", "placement", "end to end"))

    for case, c in zip(CASES, mine):
        v, lvl = c["v"], c["lvl"]
        size = v * 4 + 17
        groups = C.ECC[v][ERR[lvl]]
        total_data = sum(g.num_blocks * g.num_data for g in groups)

        # 1. error correction and interleaving
        data_cw = deinterleave(c["cw"], groups)
        assert len(data_cw) == total_data
        buff = E.Buffer()
        for cw in data_cw:
            buff.append_bits(cw, 8)
        ref = list(E.make_final_message(v, ERR[lvl], buff))
        mine_bits = bits_of(c["cw"])
        ecc_ok = ref[:len(mine_bits)] == mine_bits

        # 2. placement, masks, format, version
        m = E.make_matrix(size, size)
        E.add_finder_patterns(m, size, size)
        E.add_alignment_patterns(m, size, size)
        E.add_codewords(m, mine_bits, v)
        E.find_and_apply_best_mask(m, size, size, c["mask"])
        E.add_format_info(m, v, ERR[lvl], c["mask"])
        E.add_version_info(m, v)
        place_diff = 0
        for i in range(size):
            for j in range(size):
                ref_cell = m[i][j]
                if ref_cell > 1:          # unset / remainder bit: reads as light
                    continue
                if ref_cell != int(c["rows"][i][j]):
                    place_diff += 1

        # 3. end to end: segno's codewords and segno's mask, through the kit's
        #    matrix builder. The mask is segno's because the two pick a mask
        #    independently - see the note at the top of this file.
        ref_cw = segno_codewords(v, lvl, case[2])
        q = segno.make(case[2], version=v, error=lvl, mode="byte", boost_error=False)
        ref_rows = ["".join(str(b) for b in row) for row in q.matrix]
        end_ok = kit_matrix(v, lvl, ref_cw, q.mask) == ref_rows

        good = ecc_ok and place_diff == 0 and end_ok
        if not good:
            failures += 1
        print("%-4s v%-2d %-4s %-8s %-10s %s" %
              ("OK" if good else "DIFF", v, lvl, ecc_ok, place_diff, end_ok))

    print("\n%d of %d cases agree" % (len(mine) - failures, len(mine)))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
