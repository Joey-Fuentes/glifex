// Gate for the SM83 (Game Boy) assembly runtime -- the REAL user path: PLAIN
// SM83 mnemonics (no self-defined instruction set), 16-BIT result at
// $C010/$C011 (LE), entry $0100, HALT to stop. The fib below uses the SM83's
// native 16-bit ADD HL,DE -- validated instruction-for-instruction against the
// first-party core in the sandbox (fib(20)=6765, fib(24)=46368). If plain SM83
// can't compile-and-run with correct 16-bit results, this fails.
const { test, expect } = require("./coi-fixtures");

const FIB = [
  "    LD HL,0",
  "    LD DE,1",
  "    LD A,[$C000]",
  "    LD B,A",
  "    OR A",
  "    JR Z,done",
  "loop:",
  "    PUSH DE",
  "    ADD HL,DE",
  "    LD D,H",
  "    LD E,L",
  "    POP HL",
  "    DEC B",
  "    JR NZ,loop",
  "done:",
  "    LD A,L",
  "    LD [$C010],A",
  "    LD A,H",
  "    LD [$C011],A",
  "    HALT",
].join("\n");

const ECHO = ["    LD A,[$C000]", "    LD [$C010],A", "    LD A,0", "    LD [$C011],A", "    HALT"].join("\n");

test.describe("sm83 runtime (real Game Boy assembly, 16-bit result)", () => {
  test("plain SM83 assembles + runs green incl. fib(20)=6765", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async ({ FIB, ECHO }) => {
      const rt = await window.Runtimes.get("sm83");
      if (!rt) return "no-runtime";
      const echo = await rt.run(ECHO, [{ input: { n: 7 }, expected: 7 }, { input: { n: 42 }, expected: 42 }]);
      if (echo.error) return "echo error: " + echo.error;
      if (!echo.results.every((r) => r.ok)) return "echo cases-failed: " + JSON.stringify(echo.results);
      const fib = await rt.run(FIB, [
        { input: { n: 0 }, expected: 0 }, { input: { n: 1 }, expected: 1 },
        { input: { n: 13 }, expected: 233 }, { input: { n: 20 }, expected: 6765 },
      ]);
      if (fib.error) return "fib error: " + fib.error;
      if (!fib.results.every((r) => r.ok)) return "fib cases-failed: " + JSON.stringify(fib.results);
      return "OK instructions=" + fib.instructions;
    }, { FIB, ECHO });
    expect(result).toContain("OK");
  });
});
