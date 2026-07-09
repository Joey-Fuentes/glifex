/*
 * Glifex C++ runtime driver -- wraps Binji's vendored wasm-clang (cpp-shared.js API)
 * to compile + link + run our harness single-process in a worker. Deltas over
 * Binji's stock compileLinkRun: -std=c++17 (cc1 defaults to no exceptions/rtti); a
 * link line adding the compiler-rt builtins archive (fixes __lttf2) + a large
 * initial memory; the test cases fed on stdin so the harness reads them (no memfs
 * file path); argv = [name, variant].
 *
 * Message in : { id:'run', source, headers, cases, variant }
 * Message out: { id:'result', output } | { id:'error', error, output }
 */
importScripts('cpp-shared.js');   // committed patched fork of Binji's shared.js (Apache-2.0)

let apiPromise = null;
let out = '';

function makeApi() {
  const api = new API({
    async readBuffer(f) { return (await fetch(f)).arrayBuffer(); },
    async compileStreaming(f) { return WebAssembly.compile(await (await fetch(f)).arrayBuffer()); },
    hostWrite(s) { out += s; },
    clang: 'vendor/cpp/clang',
    lld: 'vendor/cpp/lld',
    memfs: 'vendor/cpp/memfs',
    sysroot: 'vendor/cpp/sysroot.tar',
  });
  api.clangCommonArgs.push('-std=c++17');   // -cc1 defaults to no exceptions + no rtti
  return api.ready.then(() => api);
}

async function compileLinkRun(source, headers, cases, variant) {
  if (!apiPromise) apiPromise = makeApi();
  const api = await apiPromise;

  // support headers must exist as files so #include "solution.hpp"/"json.hpp" resolve
  for (const [name, body] of Object.entries(headers || {})) {
    try { api.memfs.addFile(name, body); } catch (e) { /* ignore dup */ }
  }

  // 1) compile the single concatenated TU -> object (uses clangCommonArgs + -O2)
  await api.compile({ input: 'all.cpp', contents: source, obj: 'all.o' });

  // 2) link, adding the compiler-rt builtins archive + a large initial memory
  const lld = await api.getModule(api.lldFilename);
  await api.run(
    lld, 'wasm-ld', '--no-threads', '--export-dynamic', '--initial-memory=67108864',
    '-z', 'stack-size=1048576', '-Llib/wasm32-wasi',
    'lib/wasm32-wasi/crt1.o', 'all.o',
    '-lc', '-lc++', '-lc++abi', '-lcanvas',
    '-L/lib/clang/8.0.1/lib/wasi', '-lclang_rt.builtins-wasm32',
    '-o', 'all.wasm');

  // 3) run the linked program: cases on stdin, argv = [name, variant]; capture stdout
  const wasmBytes = api.memfs.getFileContents('all.wasm');
  const mod = await WebAssembly.compile(new Uint8Array(wasmBytes).slice());
  out = '';
  api.memfs.setStdinStr(JSON.stringify(cases));   // harness reads the cases from stdin
  await api.run(mod, 'all.wasm', variant || 'practice', '--metrics');   // L1-cpp-argv: harness emits per-case [METRIC] lines
  return out;
}

self.onmessage = async (e) => {
  const d = e.data || {};
  if (d.id !== 'run') return;
  try {
    const output = await compileLinkRun(d.source, d.headers, d.cases, d.variant);
    self.postMessage({ id: 'result', output });
  } catch (err) {
    self.postMessage({ id: 'error', error: String((err && err.stack) || err), output: out });
  }
};
