// Gate for the 6502 assembly runtime: assemble (customasm.wasm) + execute
// (6502.ts) + result + cycles, end to end, through Runtimes.get("asm-6502").
// Inline ruledef (echo program) so the gate is independent of <std/6502.asm>.
const { test, expect } = require("@playwright/test");

test.describe("asm-6502 runtime", () => {
  test("assembles + runs green through the 6502 runtime (driver)", async ({ page }) => {
    await page.goto("/");
    const result = await page.evaluate(async () => {
      const rt = await window.Runtimes.get("asm-6502");
      if (!rt) return "no-runtime";
      const src = [
        "#ruledef {",
        "    lda {a: u8} => 0xA5 @ a",   // LDA zeropage
        "    sta {a: u8} => 0x85 @ a",   // STA zeropage
        "    brk         => 0x00",
        "}",
        "lda 0x10",                       // A <- RAM[$10] (input n)
        "sta 0x12",                       // RAM[$12] <- A  (result)
        "brk",
      ].join("\n");
      const out = rt.run(src, [{ input: { n: 7 }, expected: 7 }, { input: { n: 42 }, expected: 42 }]);
      if (out.error) return "error: " + out.error;
      if (!out.results.every((r) => r.ok)) return "cases-failed: " + JSON.stringify(out.results);
      return "OK cycles=" + out.cycles;
    });
    expect(result).toContain("OK");
  });
});
