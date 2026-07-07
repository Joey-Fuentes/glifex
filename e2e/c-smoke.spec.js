// PR-2a (Bx-3-C toolchain proof) -- proves the vendored Wasmer WASIX clang
// toolchain compiles AND runs a C program fully in-browser, offline, under the
// cross-origin isolation established in PR-1. This de-risks the whole C runtime
// foundation (offline @wasmer/sdk init, Wasmer.fromFile of the vendored clang
// container, compile-then-run) before the harness/corpus wiring in PR-2b.
//
// Chromium-only for now (the smoke just needs to prove the toolchain); Firefox is
// added with the full runtime in PR-2b. Long timeout: loading the ~100MB clang
// container + compiling in wasm is slow in CI.
const { test, expect } = require("@playwright/test");

test.describe("C toolchain (Wasmer WASIX clang)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "smoke runs on chromium for now");

  test("compiles and runs a C program in-browser", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    // The SW is registered on boot; wait until it's active, then reload so the
    // navigation is COI-stamped and SharedArrayBuffer (which @wasmer/sdk needs)
    // is available.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

    const out = await page.evaluate(async () => {
      const { init, Wasmer, Directory } = await import("/vendor/c/index.mjs");
      const inlined = (await import("/vendor/c/wasm-inlined.mjs")).default;
      await init({ module: inlined });   // base64-embedded SDK core -- no network

      const webc = new Uint8Array(await (await fetch("/vendor/c/clang.webc")).arrayBuffer());
      const clang = await Wasmer.fromFile(webc);

      const dir = new Directory();
      await dir.writeFile("main.c", '#include <stdio.h>\nint main(){ printf("GLIFEX_OK\\n"); return 0; }\n');
      const compile = await clang.entrypoint.run({
        args: ["/project/main.c", "-o", "/project/main.wasm"],
        mount: { "/project": dir },
      });
      const c = await compile.wait();
      if (!c.ok) return "COMPILE_FAIL(" + c.code + "): " + c.stderr;

      const wasm = await dir.readFile("main.wasm");
      const prog = await Wasmer.fromFile(wasm);
      const r = await (await prog.entrypoint.run()).wait();
      return r.stdout;
    });

    expect(out).toContain("GLIFEX_OK");
  });
});
