# Changelog
## 1.0.0 — 2026-11-09
### Added
- `qr.encode` for versions 1-40, L/M/Q/H, all eight masks chosen by the standard penalty
- `qr.svg`, `qr.ascii`, `qr.matrix`, `qr.functionMap`, `qr.tables`
- a small syntax highlighter for 10 languages and copyable snippet blocks

### Verified
- 95 assertions, which read the encoder's own symbols back: format BCH, unmasking, de-interleaving, RS syndromes, payload
- `scripts/verify-qr.py` compares against segno: ECC, placement and a full matrix, 10 of 10 cases

PolyForm Noncommercial 1.0.0. (c) 2026 Dr Sohil Momin.
