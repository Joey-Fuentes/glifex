// L4 -- Complexity Lab SPACE falsifier (retro tracks). Proves the space
// pathway end to end and the Time|Space UI. Companion to lab.spec.js,
// which covers the TIME path on the JS wall tier and never leaves
// JavaScript (the ROADMAP's L1-e2e-analyze-js-only-gap); this is the
// first Analyze spec that deliberately selects a non-JS language.
//
// Retro space is EXACT and i8080 is the DETERMINISTIC tier, so unlike
// lab.spec.js these tests need no retry loop and can assert exact
// verdicts: the space metric is a count of distinct memory writes, not a
// clock reading, and i8080's cycle-accurate tier never trips the
// time-reliability gate that suppresses a card.
const { test, expect } = require("@playwright/test");

// Correct i8080 fib, baked corpus "clean" reference -> constant workspace
// (writes only the 2 result bytes) -> O(1) space.
const FIB_I8080_OK = `; nth Fibonacci -- Intel 8080 assembly, reference (clean)
;
; The 8080's DAD instruction adds a register pair into HL (16-bit, 10 cycles),
; and XCHG swaps HL<->DE in 4 cycles. Together they make the fib window-slide
; (a, b) <- (b, a+b) exactly TWO instructions -- compare the SM83's five
; (PUSH / ADD / LD / LD / POP):
;   XCHG              HL <-> DE      (HL = b, DE = a)
;   DAD D             HL = a + b
; Invariant: after k slides, DE = fib(k) and HL = fib(k+1) -- so the answer
; is read from DE. Loop body: XCHG(4) + DAD(10) + DCR(5) + JNZ(10) = 29
; cycles per step at 2.000 MHz. (Note: 8080 conditional JMPs cost 10 taken
; OR not-taken -- unlike conditional CALL/RET, which are 17/11 and 11/5.)
;
; Result: low byte -> 0xC010, high byte -> 0xC011 (little-endian).

    lxi d, 0          ; DE = fib(0) = 0
    lxi h, 1          ; HL = fib(1) = 1
    lda 0xC000        ; A = n
    ora a             ; sets Z if n == 0 (fib(0) is already in DE)
    jz done
    mov b, a          ; B is the loop counter

loop:
    xchg              ; HL = b, DE = a
    dad d             ; HL = a + b       (DE = fib(k), HL = fib(k+1))
    dcr b
    jnz loop

done:
    mov a, e
    sta 0xC010        ; result low byte
    mov a, d
    sta 0xC011        ; result high byte
    hlt
`;

// SAME correct computation + one wasteful instruction (push d) that stores
// each running fib on the descending stack: result unchanged (still passes
// the correctness gate) but distinct-bytes-written grows ~2n -> O(n)
// space, which REFUTES the declared O(1). Validated against the real 8080
// core in-sandbox: correct on [3,6,12,24] AND space [8,14,26,50].
const FIB_I8080_ONSPACE = `; nth Fibonacci -- Intel 8080 assembly, reference (clean)
;
; The 8080's DAD instruction adds a register pair into HL (16-bit, 10 cycles),
; and XCHG swaps HL<->DE in 4 cycles. Together they make the fib window-slide
; (a, b) <- (b, a+b) exactly TWO instructions -- compare the SM83's five
; (PUSH / ADD / LD / LD / POP):
;   XCHG              HL <-> DE      (HL = b, DE = a)
;   DAD D             HL = a + b
; Invariant: after k slides, DE = fib(k) and HL = fib(k+1) -- so the answer
; is read from DE. Loop body: XCHG(4) + DAD(10) + DCR(5) + JNZ(10) = 29
; cycles per step at 2.000 MHz. (Note: 8080 conditional JMPs cost 10 taken
; OR not-taken -- unlike conditional CALL/RET, which are 17/11 and 11/5.)
;
; Result: low byte -> 0xC010, high byte -> 0xC011 (little-endian).

    lxi d, 0          ; DE = fib(0) = 0
    lxi h, 1          ; HL = fib(1) = 1
    lda 0xC000        ; A = n
    ora a             ; sets Z if n == 0 (fib(0) is already in DE)
    jz done
    mov b, a          ; B is the loop counter

loop:
    xchg              ; HL = b, DE = a
    dad d             ; HL = a + b       (DE = fib(k), HL = fib(k+1))
    push d            ; L4-TEST: waste O(n) workspace on the stack; result unaffected
    dcr b
    jnz loop

done:
    mov a, e
    sta 0xC010        ; result low byte
    mov a, d
    sta 0xC011        ; result high byte
    hlt
`;

async function analyzeRetro(page, { lang, source }) {
  await page.goto("/");
  await page.waitForFunction(() => window.state && window.state.corpus, null, { timeout: 15000 });
  await page.evaluate((id) => window.selectProblem(id), "003-nth-fibonacci");
  await page.selectOption("#lang-select", lang);
  await expect(page.locator("#lab-btn")).toBeVisible();
  await page.evaluate((src) => {
    if (window.GlifexEditor) GlifexEditor.setValue(src);
    else document.getElementById("editor").value = src;
  }, source);
  await page.locator("#reveal-btn").click();
  await expect(page.locator("#reference-panel")).toBeVisible();
  await page.locator("#lab-btn").click();
  const verdicts = page.locator("#lab .lab-verdict");
  await expect(verdicts.first()).toBeVisible({ timeout: 60000 });
  return verdicts;
}
const spaceText = (verdicts) => verdicts.filter({ hasText: /\[space\]/i }).first().textContent();

test("i8080 fib: declared space O(1) is consistent (deterministic)", async ({ page }) => {
  test.setTimeout(60000);
  const verdicts = await analyzeRetro(page, { lang: "i8080", source: FIB_I8080_OK });
  const text = await spaceText(verdicts);
  expect(text).toMatch(/O\(1\)/);
  expect(text).toMatch(/consistent/i);
  expect(text).not.toMatch(/REFUTED/);
  const all = (await verdicts.allTextContents()).join(" ");
  expect(all).toMatch(/Upper bound O\(n\)/i);   // time verdict still present
});

test("i8080 fib storing the whole sequence REFUTES declared space O(1)", async ({ page }) => {
  test.setTimeout(60000);
  const verdicts = await analyzeRetro(page, { lang: "i8080", source: FIB_I8080_ONSPACE });
  const text = await spaceText(verdicts);
  expect(text).toMatch(/O\(1\).*REFUTED/i);
});

test("Time|Space tab appears on retro with a byte-unit space chart", async ({ page }) => {
  test.setTimeout(60000);
  await analyzeRetro(page, { lang: "i8080", source: FIB_I8080_OK });
  await expect(page.locator('#lab [data-labmetric="time"]')).toBeVisible();
  await expect(page.locator('#lab [data-labmetric="space"]')).toBeVisible();
  await expect(page.locator('#lab [data-metricpanel="time"] .lab-fig')).toContainText(/(ns|cycles)\s*\/\s*case/i);
  await page.locator('#lab [data-labmetric="space"]').click();
  await expect(page.locator('#lab [data-metricpanel="space"] .lab-fig')).toContainText(/bytes\s*\/\s*case/i);
});

test("no Space tab where there is no space signal (JavaScript)", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.waitForFunction(() => window.state && window.state.corpus, null, { timeout: 15000 });
  await page.evaluate((id) => window.selectProblem(id), "003-nth-fibonacci");
  await page.selectOption("#lang-select", "javascript");
  await page.evaluate((src) => { if (window.GlifexEditor) GlifexEditor.setValue(src); else document.getElementById("editor").value = src; },
    "module.exports = function solve(c){let a=0,b=1;for(let i=0;i<c.n;i++){const t=a+b;a=b;b=t;}return a;};");
  await page.locator("#reveal-btn").click();
  // wall tier -> retry on the inconclusive card (a time-sampling fluke)
  for (let i = 0; i < 5; i++) {
    await page.locator("#lab-btn").click();
    await expect(page.locator("#lab .lab-verdict").first()).toBeVisible({ timeout: 60000 });
    const panel = await page.locator("#lab").textContent();
    if (!/Inconclusive:/.test(panel)) break;
  }
  await expect(page.locator('#lab [data-labmetric="space"]')).toHaveCount(0);
});

// L4 Slice-B coverage: 6502 + SM83 land on the WALL tier for TIME (no
// cycle table), so their card is gated behind the time-reliability check
// -> retry on the Inconclusive card. Space itself is still exact; the
// retry only ensures a card renders. Proves space collection was widened
// beyond the deterministic (i8080) tier.
const FIB_6502_OK = `; nth Fibonacci -- 6502 assembly, reference (clean)
;
; Keeps two 16-bit numbers in zero page and iterates n times:
;   a ($00 lo / $01 hi) = fib(i)      b ($02 lo / $03 hi) = fib(i+1)
; Each step computes t = a + b in 16 bits, then slides the window:
; a <- b, b <- t. After n steps, a = fib(n).
;
; The 16-bit add is the classic 6502 idiom: the CPU adds one byte at a
; time, and the CARRY flag chains the bytes together --
;   CLC             clear carry before the low add
;   LDA lo1 / ADC lo2   low bytes (sets carry on overflow past 255)
;   LDA hi1 / ADC hi2   high bytes + that carry, automatically
;
; Result is stored little-endian: low byte -> $12, high byte -> $13.

        lda #0
        sta $00          ; a.lo = 0   (fib(0))
        sta $01          ; a.hi = 0
        sta $03          ; b.hi = 0
        lda #1
        sta $02          ; b.lo = 1   (fib(1))
        ldx $10          ; X = n (loop counter)

loop:   cpx #0
        beq done         ; counted down to zero -> a holds fib(n)

        clc              ; --- t = a + b, 16-bit carry-chained ---
        lda $00
        adc $02
        sta $04          ; t.lo = a.lo + b.lo          (carry set?)
        lda $01
        adc $03
        sta $05          ; t.hi = a.hi + b.hi + carry

        lda $02          ; --- slide the window: a <- b ---
        sta $00
        lda $03
        sta $01
        lda $04          ; --- b <- t ---
        sta $02
        lda $05
        sta $03

        dex
        jmp loop

done:   lda $00
        sta $12          ; result low byte  -> $12
        lda $01
        sta $13          ; result high byte -> $13
        brk
`;
const FIB_SM83_OK = `; nth Fibonacci -- Game Boy assembly (SM83), reference (clean)
;
; The SM83 has real 16-bit register pairs, so unlike the 6502 there is no
; hand-rolled carry chaining: HL holds fib(i), DE holds fib(i+1), and
; ADD HL,DE computes their 16-bit sum in ONE instruction.
;
; Each step slides the window (a, b) <- (b, a+b):
;   PUSH DE           save b
;   ADD HL,DE         HL = a + b
;   LD D,H / LD E,L   DE = a + b     (new b)
;   POP HL            HL = old b     (new a)
;
; Result: low byte -> $C010, high byte -> $C011 (little-endian).

    LD HL,0           ; a = fib(0) = 0
    LD DE,1           ; b = fib(1) = 1
    LD A,[$C000]      ; A = n
    LD B,A            ; B is the loop counter
    OR A              ; sets Z if n == 0
    JR Z,done

loop:
    PUSH DE           ; save b
    ADD HL,DE         ; HL = a + b   (16-bit, one instruction)
    LD D,H
    LD E,L            ; DE = a + b   (b' = a + b)
    POP HL            ; HL = old b   (a' = b)
    DEC B
    JR NZ,loop

done:
    LD A,L
    LD [$C010],A      ; result low byte
    LD A,H
    LD [$C011],A      ; result high byte
    HALT
`;

for (const [lang, src] of [["asm-6502", FIB_6502_OK], ["sm83", FIB_SM83_OK]]) {
  test(`${lang} fib: declared space O(1) consistent (wall tier; space exact)`, async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/");
    await page.waitForFunction(() => window.state && window.state.corpus, null, { timeout: 15000 });
    await page.evaluate((id) => window.selectProblem(id), "003-nth-fibonacci");
    await page.selectOption("#lang-select", lang);
    await page.evaluate((s) => { if (window.GlifexEditor) GlifexEditor.setValue(s); else document.getElementById("editor").value = s; }, src);
    await page.locator("#reveal-btn").click();
    let text = "";
    for (let i = 0; i < 6; i++) {
      await page.locator("#lab-btn").click();
      await expect(page.locator("#lab .lab-verdict").first()).toBeVisible({ timeout: 60000 });
      const panel = await page.locator("#lab").textContent();
      if (/Inconclusive:/.test(panel)) continue;
      const line = page.locator("#lab .lab-verdict").filter({ hasText: /\[space\]/i });
      if (await line.count()) { text = await line.first().textContent(); break; }
    }
    expect(text).toMatch(/O\(1\)/);
    expect(text).toMatch(/consistent/i);
  });
}
