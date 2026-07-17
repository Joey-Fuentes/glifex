// Gate: does the VENDORED payload compile and run a kata that imports sort and
// container/heap? Hosted on node:wasi, because glifex's real host is JS.
//
// Preopen the guest ROOT. A preopen named "." is what killed spike run 1:
// Go's wasip1 runtime resolves relative paths against cwd (PWD, default "/")
// and finds no matching preopen -> EBADF. See docs/go-self-hosted.md section 6.
import { WASI } from "node:wasi";
import { readFileSync, existsSync, statSync } from "node:fs";
import * as path from "node:path";

const ROOT = process.argv[2];
if (!ROOT) { console.log("## usage: drive.mjs <payload-root>"); process.exit(1); }

const ENV = { GOOS: "wasip1", GOARCH: "wasm", GOROOT: "/goroot", HOME: "/", PWD: "/" };
const sz = (p) => (existsSync(p) ? statSync(p).size : -1);
let failed = false;

const mods = {};
async function run(name, args, env, label) {
  if (!mods[name]) mods[name] = await WebAssembly.compile(readFileSync(path.join(ROOT, "bin", name + ".wasm")));
  const wasi = new WASI({ version: "preview1", args: [name + ".wasm", ...args], env,
    preopens: { "/": ROOT }, returnOnExit: true });
  const inst = await WebAssembly.instantiate(mods[name], wasi.getImportObject());
  const t = performance.now();
  let code;
  try { code = wasi.start(inst); }
  catch (e) { console.log("##   " + label + " THREW: " + String(e).slice(0, 300)); failed = true; return -1; }
  console.log("##   " + label + " exit=" + code + "  " + (performance.now() - t).toFixed(0) + "ms");
  if (code !== 0) failed = true;
  return code;
}

console.log("## ---- GATE: a kata that imports sort AND container/heap ----");
await run("compile", ["-o", "/work/main.a", "-p", "main", "-importcfg", "/importcfg.txt",
  "-pack", "/work/main.go", "/work/practice.go", "/work/variants.go"], ENV, "compile");
if (sz(path.join(ROOT, "work/main.a")) <= 0) {
  console.log("## FAIL: no main.a. If this is 'could not import sort', the allowlist is wrong --");
  console.log("##       that is B1's whole question, and this is the answer.");
  process.exit(1);
}

await run("link", ["-o", "/work/out.wasm", "-importcfg", "/work/importcfg.link",
  "-buildmode=exe", "/work/main.a"], ENV, "link");
if (sz(path.join(ROOT, "work/out.wasm")) <= 0) { console.log("## FAIL: no out.wasm"); process.exit(1); }
console.log("##   out.wasm: " + sz(path.join(ROOT, "work/out.wasm")) + " bytes");

console.log("## running it -- expect 7/7 passed:");
const w = await WebAssembly.compile(readFileSync(path.join(ROOT, "work/out.wasm")));
const wasi = new WASI({ version: "preview1", args: ["out.wasm", "clean"],
  env: { PWD: "/work" }, preopens: { "/": ROOT }, returnOnExit: true });
const inst = await WebAssembly.instantiate(w, wasi.getImportObject());
const code = wasi.start(inst);
if (code !== 0) failed = true;

console.log(failed ? "## GATE: RED" : "## GATE: GREEN -- the vendored payload compiles a real kata");
process.exit(failed ? 1 : 0);
