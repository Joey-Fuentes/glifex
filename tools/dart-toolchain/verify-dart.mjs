// verify-dart.mjs <vendor-dir>
//
// A size check proves the build produced bytes, not that the compiler WORKS.
// Without the kernel patch, gx_web.js is exactly the right size and compiles
// nothing at all -- it dies in _js_interop_checks before doing any work. Only
// running it catches that, so this compiles a kata and checks the answer.
//
// Same lesson as riscv's verify: RISCV_EXT_C=OFF fails at ELF LOAD, so only
// running something catches it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dir = process.argv[2] || "web/vendor/dart";
const dill = new Uint8Array(readFileSync(resolve(dir, "dart2js_platform.dill")));
const spec = readFileSync(resolve(dir, "libraries.json"), "utf8");

// dart2js reaches its global through self. A browser has one; bare node does not,
// and without it the first await never resumes.
globalThis.self = globalThis;
globalThis.gxGetDill = () => dill;
globalThis.gxGetLibrariesSpec = () => spec;

const KATA = `
dynamic solve(Map<String, dynamic> c) {
  final n = c['n'] as int;
  var a = 0, b = 1;
  for (var i = 0; i < n; i++) { final t = a + b; a = b; b = t; }
  return a;
}
void main() { print('[VERIFY] solve(10)=' + solve({'n': 10}).toString()); }
`;

const fail = (m) => { console.error("verify-dart: " + m); process.exit(1); };

globalThis.gxReady = async () => {
  let js;
  try {
    js = await globalThis.gxCompileDart(KATA);
  } catch (e) {
    return fail("the compiler threw: " + String(e).slice(0, 400));
  }
  if (!js || js.length < 1000) return fail("output is " + (js ? js.length : 0) + " chars");
  // Compiling is not the verify. Running the output is.
  const printed = [];
  const log = console.log;
  console.log = (s) => printed.push(String(s));
  try { (0, eval)(js); } catch (e) { console.log = log; return fail("output threw: " + String(e).slice(0, 200)); }
  console.log = log;
  const out = printed.join("\n");
  if (!out.includes("solve(10)=55")) return fail("expected solve(10)=55, got: " + out);
  console.log("verify-dart: ok -- compiled " + js.length + " chars in-process, and it computed 55");
  process.exit(0);
};

await import(resolve(dir, "gx_web.js"));
setTimeout(() => fail("gxReady never fired -- the compiler did not initialise"), 120000);
