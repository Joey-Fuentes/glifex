// drive.mjs [--host=shim|mini] [--strip-start] [--dir=<hostdir>] <module.wasm> [args...]
//
// Two hosts on purpose:
//   mini  -- a ~60-line WASI written here, NO dependencies. Runs in the sandbox,
//            so this rig can be validated before it ever reaches CI. Round 1's
//            driver could not be run locally, which is exactly why its bug shipped.
//   shim  -- @bjorn3/browser_wasi_shim, the SAME shim web/rust-worker.js bundles.
//            A pass here is a real browser signal rather than a proxy for one.
//
// --strip-start removes the start section first. See wasmtools.stripStart for why.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { sections, exportsOf, stripStart } from "./wasmtools.mjs";

const argv = process.argv.slice(2);
let host = "mini", doStrip = false, dir = null;
const rest = [];
for (const a of argv) {
  if (a.startsWith("--host=")) host = a.slice(7);
  else if (a === "--strip-start") doStrip = true;
  else if (a.startsWith("--dir=")) dir = a.slice(6);
  else rest.push(a);
}
const WASM = rest[0];
const ARGS = rest.slice(1);
if (!WASM) { console.log("usage: drive.mjs [--host=shim|mini] [--strip-start] [--dir=D] <wasm> [args]"); process.exit(2); }

let buf = new Uint8Array(readFileSync(WASM));
const secs = sections(buf);
const hasStart = secs.some((s) => s.id === 8);
console.log("     module: " + buf.length + " bytes, sections " +
  secs.map((s) => s.name).join(",") + ", START section " + (hasStart ? "PRESENT" : "absent"));
console.log("     exports: " + exportsOf(buf).map((e) => e.name).join(",") || "(none)");

if (doStrip) {
  const r = stripStart(buf);
  if (r.stripped) {
    console.log("     stripped START (it named func " + r.startFuncIdx + "); " +
      buf.length + " -> " + r.buf.length + " bytes");
    buf = r.buf;
  } else {
    console.log("     --strip-start requested but no START section present");
  }
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();
let exitCode = 0;
const stdoutLines = [];

function runMini() {
  let inst = null;
  const mem = () => new DataView(inst.exports.memory.buffer);
  const mem8 = () => new Uint8Array(inst.exports.memory.buffer);
  const argsAll = [path.basename(WASM), ...ARGS];
  let acc = "";
  const emit = (s) => {
    acc += s;
    let k;
    while ((k = acc.indexOf("\n")) >= 0) {
      const line = acc.slice(0, k); acc = acc.slice(k + 1);
      stdoutLines.push(line); console.log("     [out] " + line);
    }
  };
  const known = {
    args_sizes_get(c, s) {
      const d = mem(); d.setUint32(c, argsAll.length, true);
      d.setUint32(s, argsAll.reduce((a, x) => a + x.length + 1, 0), true); return 0;
    },
    args_get(argv_, buf_) {
      const d = mem(), b = mem8();
      for (const a of argsAll) {
        d.setUint32(argv_, buf_, true); argv_ += 4;
        const e = encoder.encode(a); b.set(e, buf_); b[buf_ + e.length] = 0;
        buf_ += e.length + 1;
      } return 0;
    },
    environ_sizes_get(c, s) { const d = mem(); d.setUint32(c, 0, true); d.setUint32(s, 0, true); return 0; },
    environ_get() { return 0; },
    fd_write(fd, iovs, n, nwritten) {
      const d = mem(), b = mem8(); let w = 0;
      for (let k = 0; k < n; k++) {
        const p = d.getUint32(iovs + k * 8, true), l = d.getUint32(iovs + k * 8 + 4, true);
        emit(decoder.decode(b.slice(p, p + l))); w += l;
      }
      d.setUint32(nwritten, w, true); return 0;
    },
    fd_close() { return 0; },
    fd_fdstat_get() { return 0; },
    fd_seek() { return 0; },
    fd_prestat_get() { return 8; },        // EBADF: no preopens under mini
    random_get(p, l) { const b = mem8(); for (let k = 0; k < l; k++) b[p + k] = (Math.random() * 256) | 0; return 0; },
    clock_time_get(id, prec, out) { mem().setBigUint64(out, BigInt(Date.now()) * 1000000n, true); return 0; },
    proc_exit(c) { exitCode = c; throw { __exit: c }; },
  };
  const wasiImport = new Proxy(known, {
    get(t, k) {
      if (k in t) return t[k];
      return (...a) => { console.log("     [mini] unimplemented WASI call: " + String(k)); return 52; };
    },
    has() { return true; },
  });
  const mod = new WebAssembly.Module(buf);
  try {
    inst = new WebAssembly.Instance(mod, { wasi_snapshot_preview1: wasiImport });
  } catch (e) {
    if (e && e.__exit !== undefined) { if (acc) emit("\n"); return; }   // START ran main and exited
    throw e;
  }
  if (typeof inst.exports._start === "function") {
    try { inst.exports._start(); } catch (e) { if (!(e && e.__exit !== undefined)) throw e; }
  }
  if (acc) emit("\n");
}

async function runShim() {
  const shim = await import("@bjorn3/browser_wasi_shim");
  const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } = shim;
  const Directory = shim.Directory;
  const load = (d) => {
    const m = new Map();
    for (const nm of readdirSync(d)) {
      const p = path.join(d, nm);
      if (statSync(p).isDirectory()) {
        if (!Directory) throw new Error("shim exports no Directory; has: " + Object.keys(shim).join(","));
        m.set(nm, new Directory(load(p)));
      } else m.set(nm, new File(new Uint8Array(readFileSync(p))));
    }
    return m;
  };
  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((m) => { stdoutLines.push(m); console.log("     [out] " + m); }),
    ConsoleStdout.lineBuffered((m) => console.log("     [err] " + m)),
  ];
  if (dir) fds.push(new PreopenDirectory(".", load(dir)));
  const wasi = new WASI([path.basename(WASM), ...ARGS], [], fds, { debug: false });
  const mod = await WebAssembly.compile(buf);
  const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });
  wasi.start(inst);
}

try {
  if (host === "mini") runMini();
  else await runShim();
  console.log("     host=" + host + " ran, exit=" + exitCode + ", " + stdoutLines.length + " stdout line(s)");
  process.exit(exitCode);
} catch (e) {
  const msg = String((e && e.stack) || e).split("\n").slice(0, 3).join(" | ");
  console.log("     host=" + host + " THREW: " + msg.slice(0, 300));
  process.exit(1);
}
