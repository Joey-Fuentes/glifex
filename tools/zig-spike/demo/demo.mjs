// The Bx-11 browser demo. A transliteration of zigtools/playground's
// src/workers/zig.ts + src/utils.ts + src/workers/runner.ts, which is in
// production at playground.zigtools.org -- not an invention of mine.
//
// It does the real thing: zig.wasm (a Zig compiler that IS wasm) reads main.zig
// from a virtual FS, compiles it with its self-hosted wasm backend and its own
// self-hosted linker, writes main.wasm back into that FS, and then the page
// instantiates THAT and prints what it says. No network, no server, no LLVM.
//
// Deliberately NOT template literals anywhere: the batch contract forbids
// backtick bytes, so every string here is concatenation.
import { WASI, PreopenDirectory, Directory, File, OpenFile, ConsoleStdout }
  from "@bjorn3/browser_wasi_shim";
import { untar } from "@andrewbranch/untar.js";

const $ = (id) => document.getElementById(id);
const log = (s) => { $("log").textContent += s; console.log(s); };

async function fetchBuf(u) {
  const r = await fetch(u);
  if (!r.ok) throw new Error("fetch " + u + " -> " + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// playground src/utils.ts getLatestZigArchive(): gunzip with the browser's OWN
// DecompressionStream, untar, drop the leading "lib/", mount the rest at /lib.
// Only lib/std is in the tarball -- not the 196 MB lib/. This is the Bx-6
// Rust-sysroot problem, already solved by them.
async function loadLib(url) {
  let ab = (await fetchBuf(url)).buffer;
  const magic = new Uint8Array(ab).slice(0, 2);
  if (magic[0] === 0x1f && magic[1] === 0x8b) {
    const ds = new DecompressionStream("gzip");
    ab = await new Response(new Response(ab).body.pipeThrough(ds)).arrayBuffer();
  }
  const entries = untar(ab);
  const root = new Map();
  let n = 0;
  for (const e of entries) {
    if (!e.filename.startsWith("lib/")) continue;
    const parts = e.filename.slice(4).split("/");
    let c = root;
    for (const seg of parts.slice(0, -1)) {
      if (!c.has(seg)) c.set(seg, new Map());
      c = c.get(seg);
    }
    c.set(parts[parts.length - 1], e.fileData);
    n += 1;
  }
  log("[lib] untarred " + n + " files into /lib\n");
  return convert(root);
}

// playground src/utils.ts convert(). NOTE: shim 0.4.x Directory takes an ARRAY
// of [name, Inode] pairs, NOT a Map -- my earlier drive.mjs passed a Map, which
// would have bitten us here.
function convert(node) {
  return new Directory([...node.entries()].map(([k, v]) =>
    v instanceof Uint8Array ? [k, new File(v)] : [k, convert(v)]));
}

// playground src/workers/zig.ts
async function compile(source, libDir, crt) {
  const args = [
    "zig.wasm",
    "build-exe",
    "main.zig",
    "libcompiler_rt.a",
    "-fno-compiler-rt", // their comment: the self hosted wasm backend cannot compile it itself
    "-fno-entry",       // their comment: stop the backend adding a start function
  ];
  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((s) => log("[zig] " + s + "\n")),
    ConsoleStdout.lineBuffered((s) => log("[zig] " + s + "\n")),
    new PreopenDirectory(".", new Map([
      ["main.zig", new File(new TextEncoder().encode(source))],
      ["libcompiler_rt.a", new File(crt)],
    ])),
    new PreopenDirectory("/lib", libDir.contents),
    new PreopenDirectory("/cache", new Map()),
  ];
  const wasi = new WASI(args, [], fds, { debug: false });
  const t0 = performance.now();
  const { instance } = await WebAssembly.instantiateStreaming(
    fetch("zig.wasm"), { wasi_snapshot_preview1: wasi.wasiImport });
  const code = wasi.start(instance);
  const ms = Math.round(performance.now() - t0);
  log("[zig] exit=" + code + " in " + ms + " ms\n");
  $("ms").textContent = String(ms);
  if (code !== 0) throw new Error("zig exited " + code);
  const cwd = wasi.fds[3];
  const out = cwd.dir.contents.get("main.wasm");
  if (!out) throw new Error("zig exited 0 but produced no main.wasm");
  log("[zig] main.wasm = " + out.data.length + " bytes\n");
  $("outsize").textContent = String(out.data.length);
  return out.data;
}

// playground src/workers/runner.ts
async function run(wasmData) {
  let acc = "";
  const fds = [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered((s) => { acc += s + "\n"; log("[out] " + s + "\n"); }),
    ConsoleStdout.lineBuffered((s) => { acc += s + "\n"; log("[err] " + s + "\n"); }),
    new PreopenDirectory(".", new Map()),
  ];
  const wasi = new WASI(["main.wasm"], [], fds);
  const { instance } = await WebAssembly.instantiate(wasmData,
    { wasi_snapshot_preview1: wasi.wasiImport });
  try {
    const code = wasi.start(instance);
    log("[run] exit=" + code + "\n");
  } catch (e) {
    log("[run] threw " + String(e) + "\n");
  }
  return acc.trim();
}

(async () => {
  try {
    $("status").textContent = "loading";
    const [libDir, crt, src] = await Promise.all([
      loadLib("zig.tar.gz"),
      fetchBuf("libcompiler_rt.a"),
      fetch("kata.zig").then((r) => r.text()),
    ]);
    $("src").textContent = src;
    $("status").textContent = "ready";
    $("go").disabled = false;
    $("go").onclick = async () => {
      $("go").disabled = true;
      try {
        $("status").textContent = "compiling";
        const wasm = await compile(src, libDir, crt);
        $("status").textContent = "running";
        const out = await run(wasm);
        $("result").textContent = out;
        $("status").textContent = "done";
      } catch (e) {
        $("status").textContent = "failed";
        $("result").textContent = "ERROR";
        log("\n" + String((e && e.stack) || e) + "\n");
      }
    };
  } catch (e) {
    $("status").textContent = "failed";
    log("\n" + String((e && e.stack) || e) + "\n");
  }
})();
