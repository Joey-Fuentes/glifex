// GX-BX8B-JAVA-TOOLCHAIN-V2
// verify-java.mjs <dir> [label]
//
// A size check proves the build produced bytes, not that the compiler WORKS.
// verify-dart.mjs says exactly this and it is the same lesson here, so this
// compiles a kata with the built compiler and RUNS the output.
//
// It is written to run against ANY set of the four artifacts, because round 3's
// whole point is the control: run it on what we built AND on what production
// serves. If both pass, the swap is safe. If ours fails and live passes, the
// artifact upgrade is the problem. If both fail, this harness is the problem --
// and knowing which of the three is true is worth more than a green tick.
//
// Bytes, never paths. Our runtime (TeaVM 0.13.1) can read files under node; the
// live one predates that and only knows fetch(). Handing both a Uint8Array is
// the only call that means the same thing to both.

import { readFile, copyFile, mkdtemp } from "node:fs/promises";
import { resolve, join, dirname, parse } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";

const dir = process.argv[2];
const label = process.argv[3] || dir;
if (!dir) {
  console.error("usage: node verify-java.mjs <dir-with-the-four-artifacts> [label]");
  process.exit(2);
}

const say = (s) => console.log("[" + label + "] " + s);
const fail = (s) => { console.error("[" + label + "] FAIL: " + s); process.exit(1); };

// Deliberately dull Java: this is testing the compiler, not the kata. fib(10)=55
// is the same shape verify-dart.mjs checks, so a human reading both sees one idea.
const KATA = [
  "public class Main {",
  "    static int solve(int n) {",
  "        int a = 0, b = 1;",
  "        for (int i = 0; i < n; i++) { int t = a + b; a = b; b = t; }",
  "        return a;",
  "    }",
  "    public static void main(String[] args) {",
  "        System.out.println(\"GXVERIFY solve(10)=\" + solve(10));",
  "    }",
  "}",
].join("\n");

const bytes = async (n) => new Uint8Array(await readFile(resolve(dir, n)));

// WHY THIS IS NOT A PLAIN import() OF THE .js
//
// compiler.wasm-runtime.js is an ES module with a .js extension. Node auto-
// detects module syntax in a bare .js ONLY while no package.json shadows it: a
// package.json WITHOUT a "type" field anywhere up the tree turns detection off,
// forces CommonJS, and "export{...}" becomes SyntaxError: Unexpected token
// 'export'. Reproduced both ways -- no package.json above: imports fine;
// {"name":"x"} above: throws.
//
// That is why this passed in the spikes and failed on the real pipeline. The
// spike ran the Java step alone against an empty web/vendor; the pipeline runs
// every other vendor step first, and something up-tree leaves a typeless
// package.json. A .mjs is unconditionally ESM, so importing a copy is correct on
// every node, under any package.json, whichever step turns out to be the source.
// The walk below records WHICH one, so the next run answers it in the log rather
// than in someone's head.
let d = resolve(dir);
const fsRoot = parse(d).root;
for (;;) {
  const pj = join(d, "package.json");
  try {
    const t = JSON.parse(await readFile(pj, "utf8")).type;
    say("note: " + pj + " has type=" + JSON.stringify(t === undefined ? null : t) +
        (t === "module" ? "" : "   <- a typeless package.json here is what disables ESM detection for .js"));
  } catch { /* absent or unreadable: not interesting */ }
  if (d === fsRoot) break;
  d = dirname(d);
}

let load;
try {
  const tmp = await mkdtemp(join(tmpdir(), "gx-java-"));
  const asMjs = join(tmp, "compiler.wasm-runtime.mjs");
  await copyFile(resolve(dir, "compiler.wasm-runtime.js"), asMjs);
  ({ load } = await import(pathToFileURL(asMjs).href));
} catch (e) {
  fail("could not import compiler.wasm-runtime.js: " + String(e).slice(0, 300));
}
if (typeof load !== "function") fail("compiler.wasm-runtime.js exports no load()");

let teavm;
try {
  teavm = await load(await bytes("compiler.wasm"));
} catch (e) {
  fail("load(compiler.wasm) threw: " + String(e).slice(0, 400));
}

let compiler;
try {
  compiler = teavm.exports.createCompiler();
} catch (e) {
  fail("createCompiler() threw: " + String(e).slice(0, 300));
}

const diags = [];
compiler.onDiagnostic((d) => {
  const line = "  [" + d.type + "/" + d.severity + "] " + (d.fileName || "") + ":" + (d.lineNumber || 0) + " " + d.message;
  diags.push(line);
  console.log(line);
});

try {
  compiler.setSdk(await bytes("compile-classlib-teavm.bin"));
  compiler.setTeaVMClasslib(await bytes("runtime-classlib-teavm.bin"));
} catch (e) {
  fail("setSdk/setTeaVMClasslib threw: " + String(e).slice(0, 300));
}

compiler.addSourceFile("Main.java", KATA);

const t0 = Date.now();
let ok;
try {
  ok = compiler.compile();
} catch (e) {
  fail("compile() threw: " + String(e).slice(0, 400));
}
if (!ok) fail("javac rejected the kata. Diagnostics above (" + diags.length + ").");
// listOutputFiles is a METHOD, though the README declares it like a property.
// Round 3 read compiler.listOutputFiles.length -- a function's ARITY -- and
// printed "output classes: 0" for both sets, a number that looked like a finding
// while measuring nothing. Call it, and only trust it if it returns something
// list-shaped.
const outs = typeof compiler.listOutputFiles === "function"
  ? compiler.listOutputFiles()
  : compiler.listOutputFiles;
const nOuts = outs && typeof outs.length === "number" ? outs.length : "unreadable";
say("javac ok in " + (Date.now() - t0) + "ms; output classes: " + nOuts);
if (nOuts === 0) fail("javac reported success but produced no class files");

const t1 = Date.now();
let genOk;
try {
  genOk = compiler.generateWebAssembly({ outputName: "app", mainClass: "Main" });
} catch (e) {
  fail("generateWebAssembly threw: " + String(e).slice(0, 400));
}
if (!genOk) fail("generateWebAssembly returned false. Diagnostics above (" + diags.length + ").");
say("teavm ok in " + (Date.now() - t1) + "ms");

const app = compiler.getWebAssemblyOutputFile("app.wasm");
if (!app || !app.length) fail("app.wasm is empty");
say("app.wasm is " + app.length + " bytes");

// Compiling is not the verify. Running the output is.
const printed = [];
const realLog = console.log;
console.log = (s) => printed.push(String(s));
try {
  const out = await load(new Uint8Array(app.buffer || app));
  out.exports.main([]);
} catch (e) {
  console.log = realLog;
  fail("running app.wasm threw: " + String(e).slice(0, 400));
}
console.log = realLog;

const text = printed.join("\n");
if (!text.includes("GXVERIFY solve(10)=55")) {
  fail("expected 'GXVERIFY solve(10)=55', got: " + JSON.stringify(text.slice(0, 200)));
}
say("ok -- compiled a kata in-process and it computed 55");
process.exit(0);
