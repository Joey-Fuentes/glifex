// glifex Bx-14 spike driver -- ROUND 2.
//
// usage: node drive.mjs <native-bin> <katas-dir> [wasm-js]
//
// Every kata runs BOTH ways: plain msf_analyze, and msf_analyze_with_vocab
// against msf_vocab_builtin(). The DELTA is the finding -- it is exactly the
// "does import Foundation resolve" question, measured rather than argued.
//
// GATE (must hold):
//   1. control.swift plain -> 0 errors        (known-good control; rig check)
//   2. broken-*     plain -> >0 errors        (a permissive parser cannot back
//                                              a falsifier -- trap 5)
//   3. vocab probe  -> modules > 0            (0 means OUR build failed to bake
//                                              generated/sdk_vocab.h -- a rig
//                                              error, not an msf verdict)
//   4. wasm vs native, PLAIN MODE ONLY        (see below)
//
// DISCOVERY (reported, never gated):
//   corpus-* plain vs vocab error counts; the [HASTYPE] table; the full-vs-web
//   vocab trim delta.
//
// Why gate 4 is plain-only: the wasm build is compiled -DMSF_WEB_VOCAB, which
// selects the TRIMMED sdk_vocab_web.h, while native embeds the full
// sdk_vocab.h. The two vocabs differ BY DESIGN, so vocab-mode output is
// expected to differ across builds. Comparing it would be a guard firing on a
// correct artifact -- worse than no guard at all.

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
const errorsOf = (out) => {
  const m = out.match(/^\[ERRORS\] n=(\d+)$/m);
  return m ? Number(m[1]) : null;
};
const show = (s, p) => console.log(s.trimEnd().split("\n").map((l) => p + l).join("\n"));

const failures = [];

// ---------------------------------------------------------------- vocab probe
console.log("################ vocab probe -- NATIVE (full sdk_vocab.h)");
const pNat = run(nativeBin, ["--vocab-probe"]);
show(pNat.out, "     ");
const modsNat = Number((pNat.out.match(/^\[VOCAB\] modules=(\d+)$/m) || [])[1] ?? -1);
if (!(modsNat > 0)) {
  failures.push("native vocab probe reported modules=" + modsNat +
                " -- OUR build did not bake generated/sdk_vocab.h (rig error, not an msf verdict)");
}

let modsWasm = null;
if (wasmJs) {
  console.log("################ vocab probe -- WASM (trimmed sdk_vocab_web.h)");
  const pW = run(process.execPath, [wasmJs, "--vocab-probe"]);
  show(pW.out, "     ");
  modsWasm = Number((pW.out.match(/^\[VOCAB\] modules=(\d+)$/m) || [])[1] ?? -1);
}

// ---------------------------------------------------------------- katas
const katas = readdirSync(katasDir).filter((f) => f.endsWith(".swift")).sort();
const rows = [];

for (const k of katas) {
  const path = join(katasDir, k);
  console.log("################ " + k);

  const nPlain = run(nativeBin, [path]);
  console.log("---- native, plain (exit " + nPlain.code + ")");
  show(nPlain.out, "     ");
  const ePlain = errorsOf(nPlain.out);

  const nVocab = run(nativeBin, [path, "--vocab"]);
  console.log("---- native, with vocab (exit " + nVocab.code + ")");
  show(nVocab.out, "     ");
  const eVocab = errorsOf(nVocab.out);

  if (ePlain === null || eVocab === null) {
    failures.push(k + ": no [ERRORS] marker -- gx_msf did not complete");
    continue;
  }
  rows.push({ kata: k, plain: ePlain, vocab: eVocab });

  if (wasmJs) {
    const wPlain = run(process.execPath, [wasmJs, path]);
    if (wPlain.out !== nPlain.out) {
      failures.push(k + ": wasm PLAIN output differs from native -- degraded wasm build");
      console.log("---- wasm plain DIFFERED:");
      show(wPlain.out, "     ## ");
    } else {
      console.log("     ## wasm plain output identical to native");
    }
    const wVocab = run(process.execPath, [wasmJs, path, "--vocab"]);
    const wv = errorsOf(wVocab.out);
    console.log("     ## wasm vocab errors=" + wv + " (web vocab is trimmed; a delta here is EXPECTED)");
  }

  if (k === "control.swift" && ePlain !== 0)
    failures.push("control.swift plain reported " + ePlain + " errors -- the RIG is broken, not msf");
  if (k.startsWith("broken-") && ePlain === 0)
    failures.push(k + ": invalid Swift reported ZERO errors -- msf is permissive here");
}

// ---------------------------------------------------------------- report
console.log("");
console.log("## ---- error counts: plain vs vocab ----");
console.log("##   " + "kata".padEnd(26) + "plain  vocab  delta");
for (const r of rows) {
  const d = r.vocab - r.plain;
  console.log("##   " + r.kata.padEnd(26) +
              String(r.plain).padStart(5) + String(r.vocab).padStart(7) +
              String(d > 0 ? "+" + d : d).padStart(7));
}
console.log("##");
console.log("##   native vocab modules=" + modsNat + (modsWasm === null ? "" :
            "   web vocab modules=" + modsWasm +
            "   trim=" + (modsNat > 0 ? (100 - Math.round((modsWasm / modsNat) * 100)) : "?") + "%"));
console.log("##");
console.log("##   THE FINDING is the corpus-* rows. vocab==0 means import Foundation");
console.log("##   resolves and msf can type-check the Swift glifex ALREADY HAS.");
console.log("##   vocab>0 with errors naming NSNumber/Any means a Foundation-free");
console.log("##   corpus rewrite is the price of the half-track.");

if (failures.length) {
  console.log("");
  console.log("## ---- GATE FAILURES ----");
  for (const f of failures) console.log("##   " + f);
  process.exit(1);
}
console.log("");
console.log("## GATE PASSED");
