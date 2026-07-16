// glifex Bx-14 spike driver -- runs the katas through gx_msf and gates.
//
// usage: node drive.mjs <native-bin> <katas-dir> [wasm-js]
//
// GATE (must hold, or the spike has answered NO):
//   1. control.swift            -> 0 errors   (known-good control; rig check)
//   2. broken-op / broken-quote -> >0 errors  (a permissive parser that eats
//                                              invalid code cannot back a
//                                              falsifier -- see trap 5)
// DISCOVERY (reported, never gated -- this is what we do not know yet):
//   pure-* and corpus-* error counts. The corpus katas are expected to be the
//   interesting ones: import Foundation / NSNumber.
//
// If a wasm build is supplied, native and wasm stdout must be byte-identical.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const [nativeBin, katasDir, wasmJs] = process.argv.slice(2);
if (!nativeBin || !katasDir) {
  console.log("usage: node drive.mjs <native-bin> <katas-dir> [wasm-js]");
  process.exit(2);
}

function run(cmd, args) {
  try {
    return { out: execFileSync(cmd, args, { encoding: "utf8" }), code: 0 };
  } catch (e) {
    // gx_msf exits 1 when it found errors -- that is data, not a failure.
    return { out: (e.stdout || "") + (e.stderr || ""), code: e.status ?? -1 };
  }
}

function errorsOf(out) {
  const m = out.match(/^\[ERRORS\] n=(\d+)$/m);
  return m ? Number(m[1]) : null;
}

const katas = readdirSync(katasDir).filter((f) => f.endsWith(".swift")).sort();
const failures = [];
const summary = [];

for (const k of katas) {
  const path = join(katasDir, k);
  const nat = run(nativeBin, [path]);
  console.log("---------------- " + k + "   (exit " + nat.code + ")");
  console.log(nat.out.trimEnd().split("\n").map((l) => "     " + l).join("\n"));

  const n = errorsOf(nat.out);
  if (n === null) {
    failures.push(k + ": no [ERRORS] marker -- gx_msf did not complete");
    continue;
  }
  summary.push({ kata: k, errors: n });

  if (wasmJs) {
    const w = run(process.execPath, [wasmJs, path]);
    if (w.out !== nat.out) {
      failures.push(k + ": wasm stdout DIFFERS from native -- degraded wasm build");
      console.log("     ## wasm output differed:");
      console.log(w.out.trimEnd().split("\n").map((l) => "     ## " + l).join("\n"));
    } else {
      console.log("     ## wasm output identical to native");
    }
  }

  // ---- the gate
  if (k === "control.swift" && n !== 0) {
    failures.push("control.swift reported " + n + " errors -- the RIG is broken, not msf");
  }
  if (k.startsWith("broken-") && n === 0) {
    failures.push(k + ": invalid Swift reported ZERO errors -- msf is permissive here");
  }
}

console.log("");
console.log("## ---- error counts ----");
for (const s of summary) console.log("##   " + s.kata.padEnd(28) + " errors=" + s.errors);

if (failures.length) {
  console.log("");
  console.log("## ---- GATE FAILURES ----");
  for (const f of failures) console.log("##   " + f);
  process.exit(1);
}
console.log("");
console.log("## GATE PASSED");
