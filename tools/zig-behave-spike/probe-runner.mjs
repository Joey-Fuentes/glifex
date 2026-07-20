// probe-runner.mjs <zig.wasm> <libcompiler_rt.a> <lib-dir> <cases-dir...> <shim.mjs>
// BEHAVIORAL spike: compile the 0.16 harness + REAL corpus solutions, then RUN the
// result against real test_cases.json and check for "N/N passed". Compilation is not
// correctness; this proves the harness round-trip (parse->solve->stringify->compare)
// actually works end to end -- the thing the compile-only spike could not show.
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const SHIM = args.pop();
const ZIGWASM = args.shift();
const CRT = args.shift();
const LIBDIR = args.shift();
const CASEDIRS = args;   // each is a dir with main.zig + solutions + test_cases.json

const { WASI, Fd, OpenFile, PreopenDirectory, File, Directory } =
  await import(pathToFileURL(SHIM).href);

class Cap extends Fd {
  constructor(){ super(); this.buf=[]; }
  fd_write(d){ this.buf.push(d.slice()); return { ret:0, nwritten:d.byteLength }; }
  text(){ const t=new TextDecoder(); return this.buf.map(b=>t.decode(b)).join(""); }
}
function dirToMap(p) {
  const m = new Map();
  for (const name of readdirSync(p)) {
    const full = path.join(p, name);
    m.set(name, statSync(full).isDirectory() ? new Directory(dirToMap(full)) : new File(readFileSync(full)));
  }
  return m;
}
const zigMod = new WebAssembly.Module(readFileSync(ZIGWASM));
const libContents = dirToMap(LIBDIR);
const crt = readFileSync(CRT);

function runModule(mod, args, preopens, inFd) {
  const out = new Cap(), err = new Cap();
  const fds = [ inFd || new OpenFile(new File(new Uint8Array())), out, err, ...preopens ];
  const wasi = new WASI(args, [], fds, { debug:false });
  let code = 0;
  try { code = wasi.start(new WebAssembly.Instance(mod, { wasi_snapshot_preview1: wasi.wasiImport })) ?? 0; }
  catch(e){ code = (e && typeof e.code==="number") ? e.code : 1; }
  return { out: out.text(), err: err.text(), code };
}

console.log("=== BEHAVIORAL RESULTS (paste this back) ===");

// First: compile-only micro-probes isolating each unproven harness construct.
// A single-file compile per probe; prints which construct fails and its diagnostic.
const MICRO = CASEDIRS.find(d => path.basename(d) === "micro");
if (MICRO) {
  const single = readdirSync(MICRO).filter(f => f.endsWith(".zig") && f !== "helper.zig").sort();
  for (const f of single) {
    const work = new Map();
    for (const g of readdirSync(MICRO)) work.set(g, new File(readFileSync(path.join(MICRO, g))));
    work.set("libcompiler_rt.a", new File(crt));
    const pre = new PreopenDirectory(".", work);
    const comp = runModule(zigMod,
      ["zig.wasm","build-exe",f,"libcompiler_rt.a","-fno-compiler-rt","-fno-entry"],
      [ pre, new PreopenDirectory("/lib", libContents), new PreopenDirectory("/cache", new Map()) ]);
    const wasmName = f.replace(/\.zig$/, ".wasm");
    const emit = pre.dir.contents.get(wasmName);
    const ok = emit && emit.data && emit.data.length > 0;
    console.log("MICRO " + f.padEnd(22) + (ok ? " PASS" : " FAIL code=" + comp.code));
    if (!ok) {
      const diag = (comp.out + comp.err).trim();
      if (diag) console.log(diag.split("\n").filter(l => l.includes("error")).slice(0,3).map(l => "      " + l).join("\n"));
    }
  }
}

const BEHAVE_DIRS = CASEDIRS.filter(d => path.basename(d) !== "micro");
for (const dir of BEHAVE_DIRS) {
  const label = path.basename(dir);
  // 1. build the work dir: all .zig files + libcompiler_rt.a + test_cases.json
  const work = new Map();
  for (const f of readdirSync(dir)) work.set(f, new File(readFileSync(path.join(dir, f))));
  work.set("libcompiler_rt.a", new File(crt));
  const workPre = new PreopenDirectory(".", work);
  // 2. compile main.zig (imports the sibling solutions)
  const comp = runModule(zigMod,
    ["zig.wasm","build-exe","main.zig","libcompiler_rt.a","-fno-compiler-rt","-fno-entry"],
    [ workPre, new PreopenDirectory("/lib", libContents), new PreopenDirectory("/cache", new Map()) ]);
  const emitted = workPre.dir.contents.get("main.wasm");
  const emittedLen = emitted && emitted.data ? emitted.data.length : 0;
  if (!emitted || emittedLen === 0) {
    console.log("BEHAVE " + label.padEnd(6) + " COMPILE-FAIL code=" + comp.code + " (main.wasm " + (emitted ? "empty" : "absent") + ", " + emittedLen + " bytes)");
    const diag = (comp.out + comp.err).trim();
    if (diag) console.log(diag.split("\n").slice(0, 8).map(l => "      " + l).join("\n"));
    else console.log("      (no compiler diagnostics -- exit code " + comp.code + ")");
    continue;
  }
  // 3. run the emitted harness with variant=clean, test_cases.json mounted
  const runMod = new WebAssembly.Module(emitted.data);
  const runWork = new Map([["test_cases.json", work.get("test_cases.json")]]);
  const runPre = new PreopenDirectory(".", runWork);
  const r = runModule(runMod, ["main.wasm","clean"], [runPre]);
  const outTrim = r.out.trim();
  const lastLine = outTrim.split("\n").pop();
  const ok = /(\d+)\/\1 passed/.test(lastLine);   // N/N passed
  console.log("BEHAVE " + label.padEnd(6) + (ok ? " RUN-PASS" : " RUN-FAIL code=" + r.code) + "  last=" + JSON.stringify(lastLine));
  if (!ok) {
    const errline = (r.out + r.err).split("\n").slice(0,4).join(" | ");
    if (errline) console.log("      " + errline.slice(0, 300));
  }
}
console.log("=== END BEHAVIORAL ===");
