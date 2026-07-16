// Gate 4a -- THE GATE. compile + link + run, entirely inside WASI, driven from
// JS. No cmd/go, no os/exec, no native toolchain.
//
// The host is node:wasi rather than wasmtime, deliberately: glifex's real host
// is JS (a worker + browser_wasi_shim, already bundled and already driving
// miri.wasm for Bx-6). A native host passing would answer a question we do not
// have.
//
// PREOPEN SHAPE -- what killed run 1, root-caused against run 1's own
// compile.wasm rather than reasoned about:
//   wasmtime "--dir ." creates a preopen NAMED ".". Go's wasip1 runtime resolves
//   relative paths against cwd (PWD env, default "/"), producing
//   "/work/importcfg.txt", then hunts for a preopen matching it. "." never
//   matches "/..." -> EBADF -> "open work/importcfg.txt: Bad file number".
//   Preopening the guest ROOT is what works, and this file does that.
import { WASI } from "node:wasi";
import { readFileSync, existsSync, statSync } from "node:fs";
import * as path from "node:path";

const ROOT = process.argv[2];
if (!ROOT) { console.log("## usage: drive-wasi.mjs <gospike-dir>"); process.exit(1); }

const mods = {};
async function mod(name) {
  if (!mods[name]) {
    const p = path.join(ROOT, "bin", name + ".wasm");
    const t0 = performance.now();
    mods[name] = await WebAssembly.compile(readFileSync(p));
    console.log("##   [host] WebAssembly.compile(" + name + ".wasm) " +
                (performance.now() - t0).toFixed(0) + "ms");
  }
  return mods[name];
}

async function run(name, args, env, label) {
  const m = await mod(name);
  const wasi = new WASI({
    version: "preview1",
    args: [name + ".wasm", ...args],
    env,
    preopens: { "/": ROOT },
    returnOnExit: true,
  });
  const inst = await WebAssembly.instantiate(m, wasi.getImportObject());
  const t0 = performance.now();
  let code;
  try {
    code = wasi.start(inst);
  } catch (e) {
    console.log("##   " + label + " THREW: " + String(e).slice(0, 300));
    return { code: -1, ms: performance.now() - t0 };
  }
  const ms = performance.now() - t0;
  console.log("##   " + label + " exit=" + code + "  " + ms.toFixed(0) + "ms");
  return { code, ms };
}

const ENV = { GOOS: "wasip1", GOARCH: "wasm", GOROOT: "/goroot", HOME: "/", PWD: "/" };
const sz = (p) => (existsSync(p) ? statSync(p).size : -1);
let failed = false;

function must(label, r, artifact) {
  if (r.code !== 0) { console.log("## FAIL: " + label + " exited " + r.code); failed = true; return false; }
  if (artifact && sz(path.join(ROOT, artifact)) <= 0) {
    console.log("## FAIL: " + label + " exited 0 but produced no " + artifact); failed = true; return false;
  }
  return true;
}

async function runOutput(wasmRel, args, env, label) {
  const w = await WebAssembly.compile(readFileSync(path.join(ROOT, wasmRel)));
  const wasi = new WASI({ version: "preview1", args: [path.basename(wasmRel), ...args],
    env, preopens: { "/": ROOT }, returnOnExit: true });
  const inst = await WebAssembly.instantiate(w, wasi.getImportObject());
  const t0 = performance.now();
  let code = -1;
  try { code = wasi.start(inst); } catch (e) { console.log("##   THREW: " + String(e).slice(0, 250)); }
  console.log("##   " + label + " exit=" + code + "  " + (performance.now() - t0).toFixed(0) + "ms");
  return code;
}

// ---- 4a-i: hello world. The OUTPUT program does stdout only and no file I/O,
//      so a failure here is the toolchain and never the guest FS.
console.log("## ---- 4a-i: hello world ----");
let r = await run("compile", ["-o", "/work/hello.a", "-p", "main",
  "-importcfg", "/work/importcfg.txt", "-pack", "/work/hello/hello.go"], ENV, "compile hello");
must("compile hello", r, "work/hello.a");

r = await run("link", ["-o", "/work/hello.wasm", "-importcfg", "/work/importcfg.hello",
  "-buildmode=exe", "/work/hello.a"], ENV, "link hello");
if (must("link hello", r, "work/hello.wasm")) {
  console.log("##   hello.wasm: " + sz(path.join(ROOT, "work/hello.wasm")) + " bytes");
  console.log("## running the OUTPUT of the wasm-hosted toolchain:");
  if (await runOutput("work/hello.wasm", [], {}, "hello") !== 0) failed = true;
}

// ---- 4a-ii: the REAL glifex harness. Multi-file package, encoding/json,
//      reflect, and a solve that allocates -- the actual contract, not a toy.
console.log("## ---- 4a-ii: the REAL glifex Go harness ----");
r = await run("compile", ["-o", "/work/main.a", "-p", "main",
  "-importcfg", "/work/importcfg.txt", "-pack",
  "/work/kata/main.go", "/work/kata/practice.go", "/work/kata/variants.go"], ENV, "compile harness");
must("compile harness", r, "work/main.a");

r = await run("link", ["-o", "/work/out.wasm", "-importcfg", "/work/importcfg.link",
  "-buildmode=exe", "/work/main.a"], ENV, "link harness");
if (must("link harness", r, "work/out.wasm")) {
  console.log("##   out.wasm: " + sz(path.join(ROOT, "work/out.wasm")) + " bytes");
  console.log("## running it -- expect the harness's own N/N passed line:");
  // The harness reads ../test_cases.json, so cwd is /work/kata and the json sits
  // at /work/. A browser worker synthesises its own FS and puts the file
  // wherever it likes, so this placement is convenience, not a constraint.
  if (await runOutput("work/out.wasm", ["clean"], { PWD: "/work/kata" }, "harness") !== 0) failed = true;
}

console.log(failed
  ? "## GATE 4a: RED"
  : "## GATE 4a: GREEN -- the gc toolchain compiled and linked Go to running wasm, hosted in wasm, driven from JS");
process.exit(failed ? 1 : 0);
