// drive.mjs <module.wasm> <preopen-host-dir or -> [args...]
//
// Runs a wasm32-wasi module under @bjorn3/browser_wasi_shim -- the SAME shim
// web/rust-worker.js already bundles for Bx-6. So a pass here is a real browser
// signal rather than a proxy for one. wasmtime is the control host; this is the
// fidelity arm, and it is continue-on-error everywhere it is called.
//
// Pass - for no preopen: a self-contained module needs no FS.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const WASM = process.argv[2];
const PRE = process.argv[3] || "-";
const ARGS = process.argv.slice(4);

const shim = await import("@bjorn3/browser_wasi_shim");
const { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } = shim;
const Directory = shim.Directory;

function load(dir) {
  const m = new Map();
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (!Directory) {
        throw new Error("this shim version exports no Directory; exports are: " +
          Object.keys(shim).join(","));
      }
      m.set(name, new Directory(load(p)));
    } else {
      m.set(name, new File(new Uint8Array(readFileSync(p))));
    }
  }
  return m;
}

const lines = [];
const fds = [
  new OpenFile(new File([])),
  ConsoleStdout.lineBuffered((m) => { lines.push(m); console.log("     [out] " + m); }),
  ConsoleStdout.lineBuffered((m) => { console.log("     [err] " + m); }),
];
if (PRE !== "-") fds.push(new PreopenDirectory(".", load(PRE)));

const wasi = new WASI([path.basename(WASM), ...ARGS], [], fds, { debug: false });
const mod = await WebAssembly.compile(readFileSync(WASM));
const inst = await WebAssembly.instantiate(mod, { wasi_snapshot_preview1: wasi.wasiImport });

let threw = null;
try {
  wasi.start(inst);
} catch (e) {
  threw = String(e).slice(0, 200);
}
console.log("     shim host: " + (threw === null ? "ran clean" : "threw " + threw) +
  ", " + lines.length + " stdout line(s)");
process.exit(threw === null ? 0 : 1);
