// Gate for the 6502 assembly runtime -- the REAL user path: the source is PLAIN
// 6502 (standard mnemonics, no self-defined instruction set), exactly what a user
// types. The loader prepends customasm's std 6502 ruledef + a $0600 bankdef,
// customasm.wasm assembles it, and our first-party core executes it. If plain
// 6502 cannot compile-and-run, this fails; it cannot fake-pass.
const { test, expect } = require("@playwright/test");

const FIB = [
  "      lda #0",
  "      sta $00",
  "      lda #1",
  "      sta $01",
  "      ldx $10",
  "loop: cpx #0",
  "      beq done",
  "      lda $00",
  "      clc",
  "      adc $01",
  "      ldy $01",
  "      sta $01",
  "      sty $00",
  "      dex",
  "      jmp loop",
  "done: lda $00",
  "      sta $12",
  "      brk",
].join("\n");

const ECHO = ["lda $10", "sta $12", "brk"].join("\n");

test.describe("asm-6502 runtime (real assembly)", () => {
  test("plain 6502 assembles + runs green (echo + fibonacci)", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async ({ FIB, ECHO }) => {
      const rt = await window.Runtimes.get("asm-6502");
      if (!rt) return "no-runtime";
      const echo = rt.run(ECHO, [{ input: { n: 7 }, expected: 7 }, { input: { n: 42 }, expected: 42 }]);
      if (echo.error) return "echo error: " + echo.error;
      if (!echo.results.every((r) => r.ok)) return "echo cases-failed: " + JSON.stringify(echo.results);
      const fib = rt.run(FIB, [
        { input: { n: 0 }, expected: 0 }, { input: { n: 1 }, expected: 1 },
        { input: { n: 7 }, expected: 13 }, { input: { n: 10 }, expected: 55 },
      ]);
      if (fib.error) return "fib error: " + fib.error;
      if (!fib.results.every((r) => r.ok)) return "fib cases-failed: " + JSON.stringify(fib.results);
      return "OK instructions=" + fib.instructions;
    }, { FIB, ECHO });
    expect(result).toContain("OK");
  });
});
