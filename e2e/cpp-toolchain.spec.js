// Bx-3b C++ runtime (Binji wasm-clang) -- toolchain + real-code proofs.
// Slice 1: his runtime compiles+runs a trivial program in-browser.
// Slice 2a: our driver (cpp-worker.js) compiles+links+runs problem 001's REAL
// harness/support (builtins archive, Rc json.hpp, cases fed on stdin) and the
// harness reports 7/7.
// Single-threaded (--no-threads), no SharedArrayBuffer -- just runs under our COI.
const { test, expect } = require("@playwright/test");

test.describe("C++ runtime (Binji wasm-clang)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "runs on chromium for now");

  test("compiles and runs a trivial C++ program in-browser", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    const out = await page.evaluate(async () => {
      const worker = new Worker("vendor/cpp/worker.js");
      const { port1, port2 } = new MessageChannel();
      let acc = "";
      const done = new Promise((resolve, reject) => {
        port1.onmessage = (e) => {
          if (e.data && e.data.id === "write") {
            acc += e.data.data;
            if (acc.includes("GLIFEX_OK")) resolve(acc);
          }
        };
        setTimeout(() => reject(new Error("timeout; output so far:\n" + acc)), 220_000);
      });
      worker.postMessage({ id: "constructor", data: port2 }, [port2]);
      port1.postMessage({ id: "compileLinkRun",
        data: '#include <cstdio>\nint main(){ printf("GLIFEX_OK\\n"); return 0; }\n' });
      return done;
    });
    expect(out).toContain("GLIFEX_OK");
  });

  test("problem 001 compiles and runs 7/7 in-browser via the C++ driver", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    const res = await page.evaluate(async () => {
      const corpus = await (await fetch("problems.generated.json")).json();
      const p = corpus.problems.find((x) => x.id.indexOf("001") === 0);
      const L = p.languages.cpp, sup = L.support;
      // single TU: harness + the three variants (headers included by name -> sent separately)
      const source = [sup["harness.cpp"], L.practice, L.clean, L.optimized].join("\n");
      const headers = { "solution.hpp": sup["solution.hpp"], "json.hpp": sup["json.hpp"] };
      const worker = new Worker("cpp-worker.js");
      return await new Promise((resolve, reject) => {
        worker.onmessage = (e) => resolve(e.data);
        worker.onerror = (e) => reject(new Error("worker error: " + e.message));
        setTimeout(() => reject(new Error("timeout")), 280_000);
        worker.postMessage({ id: "run", source, headers, cases: p.cases, variant: "practice" });
      });
    });
    if (res.id === "error") throw new Error("driver error: " + res.error + "\n--- output ---\n" + (res.output || ""));
    expect(res.output).toContain("7/7 passed");
    expect(res.output).not.toContain("[FAIL]");
  });

  test("runs problem 001 green through the C++ UI", async ({ page }) => {
    test.setTimeout(300_000);
    await page.goto("/");
    await page.locator("#problem-list li").first().click();
    await page.locator("#lang-select").selectOption("cpp");
    await page.locator("#run-btn").click();
    await expect(page.locator(".summary")).toHaveClass(/ok/, { timeout: 290_000 });
  });
});
