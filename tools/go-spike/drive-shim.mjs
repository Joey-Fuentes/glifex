// Gate 4b -- run compile.wasm under Node + @bjorn3/browser_wasi_shim.
//
// This is the host shape glifex ACTUALLY has: the same shim is already bundled
// into web/rust-worker.js and already drives miri.wasm. wasmtime passing (4a)
// says nothing about whether OUR shim covers what the Go toolchain asks of WASI
// -- the compiler does far more file I/O than Miri does. That is what this
// separates out.
//
// Failures here are DESIGNED to be informative: the shim's exported API has
// changed across versions, so print what it actually exports before using it.
// A red gate that teaches us the API is worth the same as a green one.
import { readFileSync } from "node:fs";
import * as path from "node:path";

const OUT = process.argv[2];
if (!OUT) { console.log("## usage: drive-shim.mjs <outdir>"); process.exit(1); }

let shim;
try {
  shim = await import("@bjorn3/browser_wasi_shim");
} catch (e) {
  console.log("## IMPORT FAILED:", String(e).slice(0, 300));
  console.log("## The package name or version is wrong. That is the finding.");
  process.exit(1);
}
console.log("## shim exports:", Object.keys(shim).join(", "));

const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory, Directory } = shim;
console.log("## PreopenDirectory:", typeof PreopenDirectory, " Directory:", typeof Directory);

try {
  const wasmBytes = readFileSync(path.join(OUT, "bin", "compile.wasm"));
  console.log("## compile.wasm:", wasmBytes.length, "bytes -- compiling module");
  const mod = await WebAssembly.compile(wasmBytes);

  console.log("## wasi imports the module actually asks for:");
  const wanted = WebAssembly.Module.imports(mod)
    .filter((i) => i.module.indexOf("wasi") === 0)
    .map((i) => i.name);
  console.log("##   " + wanted.join(" "));
  const provided = new Set(Object.keys(new WASI([], [], []).wasiImport));
  const missing = wanted.filter((w) => !provided.has(w));
  console.log("##   shim provides " + provided.size + " calls; MISSING: " +
              (missing.length ? missing.join(" ") : "(none)"));
  // ^ This one line is the highest-value output in the whole gate: it answers
  //   "does our shim cover the Go toolchain" statically, before any I/O.

  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((m) => console.log("##   [out] " + m)),
    ConsoleStdout.lineBuffered((m) => console.log("##   [err] " + m)),
  ];
  const wasi = new WASI(["compile.wasm", "-V"], ["GOOS=wasip1", "GOARCH=wasm"], fds);
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
  console.log("## starting compile.wasm -V under the shim:");
  try {
    wasi.start(inst);
  } catch (e) {
    console.log("## start threw:", String(e).slice(0, 300));
  }
} catch (e) {
  console.log("## GATE 4b ERROR:", String(e).slice(0, 400));
  process.exit(1);
}
