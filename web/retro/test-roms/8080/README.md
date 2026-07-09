# 8080 CPU test ROMs

Test fixtures for `web/retro/cpu8080.mjs`, executed by `web/retro/harness8080.mjs`.
These are the community-standard CP/M diagnostics for validating 8080 emulators
against real Intel silicon. They are **test data only**: never linked into,
bundled with, or deployed as part of the Glifex product (excluded from the
Pages deploy).

| File | What | Provenance / license |
|---|---|---|
| `TST8080.COM` + `TST8080.ASM` | 8080/8085 CPU Diagnostic v1.0, Microcosm Associates 1980 (Kelly Smith test) | Published as a public type-in diagnostic; regarded as public domain |
| `8080PRE.COM` + `8080PRE.MAC` | Preliminary exerciser, Ian Bartholomew / Frank D. Cringle | **GNU GPLv3** (source included per GPL) |
| `8080EXM.COM` + `8080EXM.MAC` | Exhaustive 8080 instruction exerciser; CRC baselines from real Intel 8080A silicon | **GNU GPLv3** (source included per GPL) |
| `CPUTEST.COM` | SuperSoft Associates Diagnostics II v1.2, 1981 | Abandonware, widely redistributed by emulator projects; no formal license |
| `_README.txt` | Upstream provenance notes | -- |

Sources / references:

- ROM collection: https://altairclone.com/downloads/cpu_tests/
- Exerciser background, hardware CRC result tables (incl. AMD ANA variance):
  https://web.archive.org/web/20151108135453/http://www.idb.me.uk:80/sunhillow/8080.html
- Known-good total cycle counts used by the harness follow the stub convention
  of superzazu/8080's reference harness (OUT 0 at 0x0000 = end, OUT 1 + RET at
  0x0005 = BDOS): TST8080 = 4,924 / 8080PRE = 7,817 / CPUTEST = 255,653,383 /
  8080EXM = 23,803,381,171 T-states.

Run:

```
node web/retro/harness8080.mjs --suite web/retro/test-roms/8080          # fast three
node web/retro/harness8080.mjs --suite web/retro/test-roms/8080 --full   # + 8080EXM (~1.5-10 min)
```

`.PRN` assembler listings and the exerciser PDF are intentionally not vendored
(derivable / linked above).
