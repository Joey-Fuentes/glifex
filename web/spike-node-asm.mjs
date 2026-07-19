// spike-node-asm.mjs -- THROWAWAY probe harness.
// Drives the SAME emulators production uses (Blink runs the x86-64 as/ld; the
// emitted code executes on libriscv / VIXL / Blink) headless under Node, for
// every asm arch x problem x variant, and judges each by contract:
//   practice must run but NOT solve; brute-force/clean/optimized must pass all.
// Node runs the vendored emscripten wasm, so this works on any OS Node runs on.
//
// It chdir's to web/ so the cores' relative toolchain URLs ("vendor/asm-*/...")
// resolve, and reads problems from ../problems. Every failure is caught and
// printed (never throws), so a failing macOS/Windows leg reports WHY.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WEB = path.dirname(fileURLToPath(import.meta.url));
process.chdir(WEB); // cores load "vendor/asm-<arch>/<tool>.elf" relative to cwd
const PROBLEMS = path.resolve(WEB, "..", "problems");
const OS = process.env.RUNNER_OS || process.platform;

const ARCHES = [
  { name: "asm-x86_64", core: "./asm-x86-core.mjs", probe: "vendor/asm-x86_64/gnu-as.elf" },
  { name: "asm-arm64", core: "./asm-arm64-core.mjs", probe: "vendor/asm-arm64/aarch64-as.elf" },
  { name: "asm-riscv64", core: "./asm-riscv64-core.mjs", probe: "vendor/asm-riscv64/riscv64-as.elf" },
];

let ran = 0;
let flags = 0;

for (const arch of ARCHES) {
  console.log("==================== " + OS + " / " + arch.name + " ====================");
  if (!existsSync(arch.probe)) {
    console.log("  skipped: vendor artifact missing (" + arch.probe + ") -- vendor bundle not present on this leg");
    continue;
  }
  let driveProblem;
  try {
    ({ driveProblem } = await import(arch.core));
  } catch (e) {
    console.log("  MODULE-LOAD-FAIL: " + (e && e.message ? e.message : e));
    flags++;
    continue;
  }
  for (const prob of readdirSync(PROBLEMS).sort()) {
    const adir = path.join(PROBLEMS, prob, arch.name);
    const casesPath = path.join(PROBLEMS, prob, "test_cases.json");
    if (!existsSync(adir) || !existsSync(casesPath)) continue;
    const cases = JSON.parse(readFileSync(casesPath, "utf8"));
    for (const v of ["practice", "brute-force", "clean", "optimized"]) {
      const sp = path.join(adir, v + ".s");
      if (!existsSync(sp)) continue;
      const source = readFileSync(sp, "utf8");
      ran++;
      let out;
      const t0 = Date.now();
      try {
        out = await driveProblem(source, cases);
      } catch (e) {
        out = { error: "threw: " + (e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e) };
      }
      const dt = ((Date.now() - t0) / 1000).toFixed(1) + "s";
      let verdict;
      let detail = "";
      if (!out || out.error) {
        verdict = "ERROR";
        detail = String((out && out.error) || "no result").slice(0, 140);
        flags++;
      } else {
        const passed = out.results.filter((r) => r.ok).length;
        const total = out.results.length;
        const tally = passed + "/" + total;
        if (v === "practice") {
          if (passed < total) {
            verdict = "ok(unsolved " + tally + ")";
          } else {
            verdict = "FLAG(practice-solved " + tally + ")";
            flags++;
          }
        } else if (passed === total) {
          verdict = "ok(" + tally + ")";
        } else {
          verdict = "FLAG(ref-failed " + tally + ")";
          flags++;
        }
      }
      console.log("  " + prob.padEnd(16) + " " + v.padEnd(12) + " " + dt.padStart(6) + "  " + verdict + (detail ? "  :: " + detail : ""));
    }
  }
}

console.log("");
console.log("SPIKE SUMMARY [" + OS + "]: ran=" + ran + " flagged=" + flags + "  (read the table; a leg that loads the wasm at all is the real signal).");
console.log("This job opened no PR. Delete the branch when done.");
