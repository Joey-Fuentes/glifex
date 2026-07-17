// go-worker.js -- the Go track (Bx-12). Runs the real gc toolchain, compiled to
// wasip1/wasm, in a worker: compile.wasm then link.wasm over one virtual FS,
// then the linked output. No cmd/go anywhere -- it builds by forking, and
// os/exec does not exist under wasip1. See docs/go-self-hosted.md.
//
// Shim: vendor/go/wasi-shim.mjs, sliced at vendor time out of the committed
// rust-worker bundle, so Rust and Go drive the same proven WASI implementation.
// Every WASI construction passes { debug: false } -- omitting it turns the
// shim's logging ON (options = {} -> enable(undefined) -> 'void 0 ? true'),
// which costs ~25% and floods the console. Bx-6 passes it for the same reason.
import { WASI, Fd, File, OpenFile, PreopenDirectory, Directory } from "./vendor/go/wasi-shim.mjs";

const BASE = "vendor/go";

// Env for the toolchain processes. Host arch == target arch (both wasm), so
// GOOS/GOARCH here select what the compiler EMITS, read at runtime.
const TOOLENV = ["GOOS=wasip1", "GOARCH=wasm", "GOROOT=/goroot", "HOME=/", "PWD=/"];

class Stdio extends Fd {
  constructor(out) { super(); this.out = out; }
  fd_write(data) { this.out.push(data.slice()); return { ret: 0, nwritten: data.byteLength }; }
  clear() { this.out.length = 0; }
  text() { const d = new TextDecoder("utf-8"); let s = ""; for (const b of this.out) s += d.decode(b); return s; }
}

async function fetchBytes(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error("fetch " + path + " -> " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

let cachePromise = null;

// One-time: the toolchain modules and the std export data. importcfg.txt is the
// manifest -- it names every archive the compiler may open, so there is no
// second list to drift out of sync with the vendor step.
async function initOnce() {
  const cfgText = new TextDecoder().decode(await fetchBytes(BASE + "/importcfg.txt"));
  const files = [...cfgText.matchAll(/^packagefile\s+\S+=\/pkg\/(\S+)$/gm)].map((m) => m[1]);
  if (!files.length) throw new Error("vendor/go/importcfg.txt names no packages");
  const [compileMod, linkMod, pkgEntries] = await Promise.all([
    WebAssembly.compileStreaming(fetch(BASE + "/bin/compile.wasm")),
    WebAssembly.compileStreaming(fetch(BASE + "/bin/link.wasm")),
    Promise.all(files.map(async (f) => [f, new File(await fetchBytes(BASE + "/pkg/" + f))])),
  ]);
  return { compileMod, linkMod, pkgEntries, cfgText };
}

function runTool(mod, args, root, out) {
  const stdio = new Stdio(out);
  const wasi = new WASI(["tool.wasm", ...args], TOOLENV,
    [new Stdio([]), stdio, stdio, root], { debug: false });
  return WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport })
    .then((inst) => wasi.start(inst));
}

// The user's file goes in VERBATIM as its own file in the package. Go compiles a
// multi-file package in one invocation, so the harness lives beside the user's
// code rather than being spliced into it -- which means the user keeps their own
// imports, and their line numbers are already correct. Rust has to splice and
// then remap; Go does not.
const ENTRY_RE = /^func\s+(practice|clean|optimized|bruteForce|brute_force)\s*\(/m;

function synth(source, cases) {
  const m = source.match(ENTRY_RE);
  if (!m) {
    return { error: "no entry function found -- expected one of practice, clean, optimized, bruteForce" };
  }
  const entry = m[1];
  // Cases are embedded, not read from a file: the FS is ours, so there is no
  // reason to invent a path contract the CLI harness only needs because it has
  // one. JSON string escaping is a subset of Go's interpreted-string escaping.
  const casesLit = JSON.stringify(JSON.stringify(cases));
  const harness = [
    "package main",
    "",
    "import (",
    '\t"encoding/json"',
    '\t"fmt"',
    '\t"reflect"',
    '\t"runtime"',
    '\t"time"',
    ")",
    "",
    "// gxSink is package-level and never read, so the compiler must keep every",
    "// call that writes it. Go has no std black_box; this is the equivalent.",
    "var gxSink any",
    "",
    "// 2ms clears a 100us performance.now() clamp by 20x. The cap stops a genuinely",
    "// slow solve from being repeated into a timeout.",
    "const gxMinNs = 2000000",
    "const gxMaxReps = 1 << 22",
    "",
    "type gxCase struct {",
    // No struct tags: encoding/json matches field names case-insensitively on
    // unmarshal, so Input picks up \"input\". Tags would need backticks, and a
    // backtick cannot appear anywhere in a delivered batch.
    "\tInput    map[string]any",
    "\tExpected any",
    "}",
    "",
    "const gxCases = " + casesLit,
    "",
    "func main() {",
    "\tvar cases []gxCase",
    "\tif err := json.Unmarshal([]byte(gxCases), &cases); err != nil {",
    '\t\tfmt.Println("harness: bad cases:", err)',
    "\t\treturn",
    "\t}",
    "\tpassed := 0",
    "\tfor i, c := range cases {",
    "\t\t// Warm once and discard: the first call pays lazy init.",
    "\t\tgxSink = " + entry + "(c.Input)",
    "",
    "\t\t// Space: allocation volume for ONE call. TotalAlloc is cumulative and",
    "\t\t// monotonic, so the delta is what this solve allocated -- an upper",
    "\t\t// bound on workspace, the same model the C# harness uses.",
    "\t\tvar m0, m1 runtime.MemStats",
    "\t\truntime.ReadMemStats(&m0)",
    "\t\tgot := " + entry + "(c.Input)",
    "\t\truntime.ReadMemStats(&m1)",
    "\t\theap := int64(m1.TotalAlloc - m0.TotalAlloc)",
    "",
    "\t\t// Time: ADAPTIVE REPEAT, because the clock is coarse. The WASI shim",
    "\t\t// backs CLOCK_MONOTONIC with performance.now(), which a browser clamps",
    "\t\t// to ~100us without cross-origin isolation -- and this track needs no",
    "\t\t// COI, so that is the resolution we get. A microsecond solve measures",
    "\t\t// as exactly zero. Repeat until the timed region clears the clamp by a",
    "\t\t// wide margin, then divide: the same thing the C harness does with",
    "\t\t// el/reps. gxSink is package-level so the compiler cannot decide the",
    "\t\t// repeated calls are dead and delete the loop.",
    "\t\treps := 1",
    "\t\tvar ns int64",
    "\t\tfor {",
    "\t\t\tt0 := time.Now()",
    "\t\t\tfor r := 0; r < reps; r++ {",
    "\t\t\t\tgxSink = " + entry + "(c.Input)",
    "\t\t\t}",
    "\t\t\tel := time.Since(t0).Nanoseconds()",
    "\t\t\tif el >= gxMinNs || reps >= gxMaxReps {",
    "\t\t\t\tns = el / int64(reps)",
    "\t\t\t\tbreak",
    "\t\t\t}",
    "\t\t\tif el <= 0 {",
    "\t\t\t\treps *= 16",
    "\t\t\t} else {",
    "\t\t\t\treps *= 4",
    "\t\t\t}",
    "\t\t}",
    "",
    "\t\t// Compare JSON-to-JSON: the harness decodes into any, so an int in the",
    "\t\t// case file is a float64 here, and reflect.DeepEqual on raw values",
    "\t\t// would call 3 != 3.0. The CLI harness has the same problem.",
    "\t\tgj, _ := json.Marshal(got)",
    "\t\tej, _ := json.Marshal(c.Expected)",
    "\t\tvar gv, ev any",
    "\t\tjson.Unmarshal(gj, &gv)",
    "\t\tjson.Unmarshal(ej, &ev)",
    "\t\tif reflect.DeepEqual(gv, ev) {",
    "\t\t\tpassed++",
    '\t\t\tfmt.Printf("  [PASS] case %d\\n", i)',
    "\t\t} else {",
    '\t\t\tfmt.Printf("  [FAIL] case %d  expected=%s got=%s\\n", i, ej, gj)',
    "\t\t}",
    '\t\tfmt.Printf("[METRIC] case %d ns=%d\\n", i, ns)',
    '\t\tfmt.Printf("[SPACE] case %d heap=%d\\n", i, heap)',
    "\t}",
    '\tfmt.Printf("%d/%d passed\\n", passed, len(cases))',
    "}",
    "",
  ].join("\n");
  return { harness, entry };
}

// Errors name the file the compiler was given. user.go is the user's file
// verbatim, so its line numbers need no remapping -- only the path prefix goes,
// and the harness is named as the harness rather than leaking a path.
function remapPaths(out) {
  return out.replace(/\/work\/user\.go:/g, "practice.go:")
            .replace(/\/work\/harness\.go:(\d+)(:\d+)?/g, "<glifex harness>");
}

function parse(out, cases) {
  const byI = new Map(), nsById = new Map(), heapById = new Map();
  for (const line of out.split("\n")) {
    const m = line.match(/\[(PASS|FAIL)\]\s+case\s+(\d+)(?:\s+expected=(.*?)\s+got=(.*))?/);
    if (m) byI.set(Number(m[2]), { ok: m[1] === "PASS", exp: m[3], got: m[4] });
    const mm = line.match(/\[METRIC\]\s+case\s+(\d+)\s+ns=(\d+)/);
    if (mm) nsById.set(Number(mm[1]), Number(mm[2]));
    const ms = line.match(/\[SPACE\]\s+case\s+(\d+)\s+heap=(\d+)/);
    if (ms) heapById.set(Number(ms[1]), Number(ms[2]));
  }
  if (byI.size === 0) return { error: "no case results from the Go harness:\n" + out.trim().slice(0, 600) };
  const results = cases.map((c, i) => {
    const r = byI.get(i);
    const tNs = nsById.has(i) && nsById.get(i) > 0 ? nsById.get(i) : null;
    const row = r
      ? (r.ok
          ? { i, ok: true, got: c.expected, expected: c.expected, tNs }
          : { i, ok: false, got: r.got != null ? r.got : "(see output)", expected: r.exp != null ? r.exp : c.expected, tNs })
      : { i, ok: false, error: "no result for case", expected: c.expected };
    if (heapById.has(i)) row.space = heapById.get(i);
    return row;
  });
  return { results };
}

export async function build(pre, source, cases) {
  const s = synth(source, cases);
  if (s.error) return { error: s.error };

  const work = new Map([
    ["user.go", new File(new TextEncoder().encode(source))],
    ["harness.go", new File(new TextEncoder().encode(s.harness))],
  ]);
  const root = new PreopenDirectory("/", new Map([
    ["pkg", new Directory(new Map(pre.pkgEntries))],
    ["work", new Directory(work)],
    ["importcfg.txt", new File(new TextEncoder().encode(pre.cfgText))],
    ["importcfg.link", new File(new TextEncoder().encode(
      pre.cfgText + "packagefile main=/work/main.a\n"))],
  ]));

  const out = [];
  let code = await runTool(pre.compileMod, [
    "-o", "/work/main.a", "-p", "main", "-importcfg", "/importcfg.txt", "-pack",
    "/work/harness.go", "/work/user.go"], root, out);
  if (code !== 0 || !work.has("main.a")) {
    return { error: "compile failed:\n" + remapPaths(new TextDecoder().decode(
      out.length ? out.reduce((a, b) => new Uint8Array([...a, ...b])) : new Uint8Array())).trim() };
  }

  out.length = 0;
  code = await runTool(pre.linkMod, [
    "-o", "/work/out.wasm", "-importcfg", "/importcfg.link", "-buildmode=exe",
    "/work/main.a"], root, out);
  if (code !== 0 || !work.has("out.wasm")) {
    return { error: "link failed:\n" + new TextDecoder().decode(
      out.length ? out.reduce((a, b) => new Uint8Array([...a, ...b])) : new Uint8Array()).trim() };
  }

  return { wasm: work.get("out.wasm").data, root };
}

export async function execute(wasm, root) {
  const out = [];
  const stdio = new Stdio(out);
  const mod = await WebAssembly.compile(wasm);
  const wasi = new WASI(["out.wasm"], ["PWD=/"], [new Stdio([]), stdio, stdio, root], { debug: false });
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
  wasi.start(inst);
  return stdio.text();
}

export { initOnce, synth, parse, remapPaths };

if (typeof self !== "undefined" && typeof self.addEventListener === "function") {
  self.addEventListener("message", async (e) => {
    const d = e.data || {};
    if (d.id !== "run") return;
    try {
      if (!cachePromise) cachePromise = initOnce();
      const pre = await cachePromise;
      const built = await build(pre, d.source, d.cases || []);
      if (built.error) return void self.postMessage({ id: "error", error: built.error });
      const text = remapPaths(await execute(built.wasm, built.root));
      const parsed = parse(text, d.cases || []);
      if (parsed.error) return void self.postMessage({ id: "error", error: parsed.error });
      // No cycles: the browser executes the linked wasm natively and nothing
      // counts steps, so lab.js derives the wall tier on its own. Go wants no
      // wallByLang cap -- unlike Rust/Miri it runs at native speed and can take
      // the full ladder.
      self.postMessage({ id: "result", results: parsed.results, nsPerCase: 0,
        spaceApprox: true, spaceApproxKind: "volume" });
    } catch (err) {
      self.postMessage({ id: "error", error: String((err && err.message) || err) });
    }
  });
}
