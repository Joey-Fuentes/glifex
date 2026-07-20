// probe-runner.mjs <zig.wasm> <libcompiler_rt.a> <std-tar-dir> <probes-dir> <shim.mjs>
// Compile each probe with zig.wasm under the sliced browser shim (the real path),
// report which spellings COMPILE. This is a resolver spike: the answer is the
// PASS/FAIL table, pasted back to build B+C on facts not guesses.
import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const [,, ZIGWASM, CRT, STDDIR, PROBES, SHIM] = process.argv;
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
// STDDIR is the unpacked lib/ (it contains std/). Round 10 mounts the CONTENTS of
// lib/ at /lib, so the guest sees /lib/std/... and zig auto-discovers it. Do NOT
// pass --zig-lib-dir: that made zig open("/lib") explicitly and the shim returned
// AccessDenied; the bare preopen is what the proven demo used.
const libContents = dirToMap(STDDIR);   // Map { std: Directory, ... }
const crt = readFileSync(CRT);

function compile(src) {
  const work = new Map([
    ["main.zig", new File(new TextEncoder().encode(src))],
    ["libcompiler_rt.a", new File(crt)],
  ]);
  const out = new Cap(), err = new Cap();
  const fds = [
    new OpenFile(new File(new Uint8Array())), out, err,
    new PreopenDirectory(".", work),
    new PreopenDirectory("/lib", libContents),
    new PreopenDirectory("/cache", new Map()),
  ];
  const wasi = new WASI(
    ["zig.wasm","build-exe","main.zig","libcompiler_rt.a","-fno-compiler-rt","-fno-entry"],
    [], fds, { debug:false });
  let code = 0;
  try { code = wasi.start(new WebAssembly.Instance(zigMod, { wasi_snapshot_preview1: wasi.wasiImport })) ?? 0; }
  catch(e){ code = (e && typeof e.code==="number") ? e.code : 1; }
  const wasm = work.get("main.wasm");
  return { code, ok: !!wasm, out: out.text(), err: err.text() };
}

const probes = readdirSync(PROBES).filter(f => f.endsWith(".zig")).sort();
console.log("=== PROBE RESULTS (paste this back) ===");
for (const f of probes) {
  const src = readFileSync(path.join(PROBES, f), "utf8");
  const r = compile(src);
  const verdict = r.ok ? "PASS" : "FAIL";
  console.log("PROBE " + f.padEnd(30) + " " + verdict + (r.ok ? "" : "  code=" + r.code));
  if (!r.ok) {
    const msg = (r.out + r.err).trim().split("\n").filter(l => l.includes("error")).slice(0,2).join(" | ");
    if (msg) console.log("      " + msg.slice(0, 200));
  }
}
console.log("=== END PROBES ===");
