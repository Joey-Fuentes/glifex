// Gate for the 6502 assembly runtime -- the REAL user path with the REAL contract:
// PLAIN 6502 (no self-defined instruction set), 16-BIT result at $12/$13 (LE).
// The fib below is a carry-chained 16-bit loop -- the canonical 8-bit idiom --
// validated instruction-for-instruction against the first-party core in the
// sandbox (fib(20)=6765, fib(24)=46368). If plain 6502 can't compile-and-run
// with correct 16-bit results, this fails; it cannot fake-pass.
const { test, expect } = require("@playwright/test");

const FIB16 = [
  "      lda #0",
  "      sta $00",         // a.lo = 0
  "      sta $01",         // a.hi = 0
  "      sta $03",         // b.hi = 0
  "      lda #1",
  "      sta $02",         // b.lo = 1
  "      ldx $10",         // X = n
  "loop: cpx #0",
  "      beq done",
  "      clc",
  "      lda $00",
  "      adc $02",
  "      sta $04",         // t.lo = a.lo + b.lo
  "      lda $01",
  "      adc $03",
  "      sta $05",         // t.hi = a.hi + b.hi + carry
  "      lda $02",
  "      sta $00",
  "      lda $03",
  "      sta $01",         // a = b
  "      lda $04",
  "      sta $02",
  "      lda $05",
  "      sta $03",         // b = t
  "      dex",
  "      jmp loop",
  "done: lda $00",
  "      sta $12",         // result lo -> $12
  "      lda $01",
  "      sta $13",         // result hi -> $13
  "      brk",
].join("\n");

const ECHO = ["lda $10", "sta $12", "brk"].join("\n");   // (hi byte stays 0)

test.describe("asm-6502 runtime (real assembly, 16-bit result)", () => {
  test("plain 6502 assembles + runs green incl. fib(20)=6765", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async ({ FIB16, ECHO }) => {
      const rt = await window.Runtimes.get("asm-6502");
      if (!rt) return "no-runtime";
      const echo = rt.run(ECHO, [{ input: { n: 7 }, expected: 7 }, { input: { n: 42 }, expected: 42 }]);
      if (echo.error) return "echo error: " + echo.error;
      if (!echo.results.every((r) => r.ok)) return "echo cases-failed: " + JSON.stringify(echo.results);
      const fib = rt.run(FIB16, [
        { input: { n: 0 }, expected: 0 }, { input: { n: 1 }, expected: 1 },
        { input: { n: 10 }, expected: 55 }, { input: { n: 13 }, expected: 233 },
        { input: { n: 20 }, expected: 6765 },
      ]);
      if (fib.error) return "fib error: " + fib.error;
      if (!fib.results.every((r) => r.ok)) return "fib cases-failed: " + JSON.stringify(fib.results);
      return "OK instructions=" + fib.instructions;
    }, { FIB16, ECHO });
    expect(result).toContain("OK");
  });
});
