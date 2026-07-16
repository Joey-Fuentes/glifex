// Lab ladder ceiling (Bx-10 follow-up) -- a track must survive the TOP RUNG of
// its own ladder.
//
// WHY THIS IS ITS OWN FILE, AND SLOW ON PURPOSE
// web/lab-ladder.test.mjs proves a det-tier track gets a *sized* ladder instead
// of inheriting the wall ladder. It cannot prove the size is ACHIEVABLE -- only
// running it can. This is that test, and it is deliberately not folded into
// runtimes.spec.js: it costs an in-browser assemble+link+run per track at the
// largest input the Lab will ever generate, which is exactly the work the smoke
// specs avoid.
//
// WHAT IT WOULD HAVE CAUGHT
// arm64 shipped with no ladder cap, so the det tier walked to n=32768 and
// Analyze reported "the solution is incorrect on a generated input" on the live
// site -- clean's stack table hit exactly the 1 MB guest stack, and brute-force
// truncated at MAX_STEPS and returned a wrong answer rather than erroring.
//
// SCOPE: the det-tier (single-stepped) tracks. Those are the constrained ones --
// ~1000x slower than native, with hard step and stack budgets. The wall-tier
// runtimes were never in doubt at these sizes. `clean` only: it is the shipped
// reference, and if it cannot survive the ceiling nothing can.
const { test, expect } = require("./coi-fixtures");

// One page for the whole file, like runtimes.spec.js -- each runtime
// lazy-initialises once -- but a named test per (problem, lang) so CI reports
// independent lines.
test.describe.configure({ mode: "serial" });

// KNOWN DEFECT, deliberately NOT deleted from the matrix: asm-x86_64's 002
// cannot reach the ceiling Bx-7 declared for it. Measured on the live site:
//
//   asm-x86_64  002  n=512   30,001ms  TIMEOUT   <-- loadAsmX86's 30s budget
//   asm-x86_64  001  n=512    3,906ms  ok
//   asm-arm64   002  n=512    6,023ms  ok
//
// detByLang declares [32,64,128,256,512] for asm-x86_64, but 002's clean is a
// hash table with linear probing in mmap'd memory and Blink single-steps every
// instruction. The Lab runs the WHOLE plan (3 families x 5 sizes), so live
// Analyze is worse than this single case.
//
// fixme, not removal: CI names it every run instead of forgetting it. Deleting
// the row would turn the finding into silence, which is the failure mode this
// whole spec exists to prevent.
//
// The fix needs a number nobody has: 002 timed OUT, so we do not know whether it
// wants 35s or 5 minutes -- and that decides between raising loadAsmX86's timeout
// and lowering the declared ladder. Tracked in docs/ROADMAP.md.
const KNOWN_UNREACHABLE = [{ pid: "002", lang: "asm-x86_64" }];

const CASES = [
  { problem: "Anagram", pid: "001", lang: "asm-arm64" },
  { problem: "Two Sum", pid: "002", lang: "asm-arm64" },
  { problem: "Fibonacci", pid: "003", lang: "asm-arm64" },
  { problem: "Anagram", pid: "001", lang: "asm-riscv64" },
  { problem: "Two Sum", pid: "002", lang: "asm-riscv64" },
  { problem: "Fibonacci", pid: "003", lang: "asm-riscv64" },
  { problem: "Anagram", pid: "001", lang: "asm-x86_64" },
  { problem: "Two Sum", pid: "002", lang: "asm-x86_64" },
  { problem: "Fibonacci", pid: "003", lang: "asm-x86_64" },
];

test.describe("Lab ladder ceiling (det-tier tracks)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "runs on chromium for now");

  for (const c of CASES) {
    const known = KNOWN_UNREACHABLE.some((k) => k.pid === c.pid && k.lang === c.lang);
    const t = known ? test.fixme : test;
    t(`${c.pid} ${c.lang}: clean is correct at the top of its ladder`, async ({ page }) => {
      test.setTimeout(300_000);
      page.on("pageerror", (e) => console.log("[pageerror] " + e.message));
      await page.goto("/");
      await expect(page.locator("#problem-list li").first()).toBeVisible();

      const out = await page.evaluate(async ({ pid, lang }) => {
        const C = await import("./lab-config.mjs");
        const corpus = await (await fetch("problems.generated.json")).json();
        const p = corpus.problems.find((x) => x.id.indexOf(pid) === 0);
        const cfgKey = Object.keys(C.PROBLEMS).find((k) => k.indexOf(pid) === 0);
        const cfg = C.PROBLEMS[cfgKey];

        // Resolve the ladder exactly as buildPlan does -- do not reimplement it.
        const { sizes, plan } = C.buildPlan(cfg, "det", lang, "ceiling");
        const n = sizes[sizes.length - 1];

        // Use the family the CONFIG designates for the upper bound -- do not
        // hardcode "worst". 001/002 use worst/random/best, but 003's only mode
        // is "value". Hardcoding made this test fail on its own assumption
        // rather than on the runtime.
        const family = (cfg.roles && cfg.roles.upper) || cfg.modes[0].id;
        const worst = plan.filter((x) => x.mode === family && x.n === n);
        if (!worst.length) return { err: "no " + family + "-family case at n=" + n };

        const runner = await window.Runtimes.get(lang);
        if (!runner) return { err: "runtime " + lang + " is not vendored" };
        const src = p.languages[lang] && p.languages[lang].clean;
        if (!src) return { err: "no clean reference for " + lang };

        const res = await runner.run(src, worst.map((w) => ({ input: w.input, expected: null })));
        if (res.error) return { err: res.error, n };
        return { n, rows: (res.results || []).map((r) => ({ ok: r.ok, ret: r.ret, got: r.got })) };
      }, { pid: c.pid, lang: c.lang });

      // A runtime that is not vendored in this pipeline is a skip, not a fail.
      test.skip(!!(out.err && /not vendored/.test(out.err)), out.err || "");
      expect(out.err, `ceiling run failed at n=${out.n}`).toBeFalsy();
      // expected is null above (the Lab compares against its own oracle, not
      // test_cases.json), so assert the run COMPLETED -- a truncated step budget
      // or a stack trap shows up as ret:false, which is precisely the shape that
      // reached production.
      for (const r of out.rows) {
        expect(r.ret, `no return at ceiling n=${out.n} -- step budget or stack limit`).toBe(true);
      }
    });
  }
});
