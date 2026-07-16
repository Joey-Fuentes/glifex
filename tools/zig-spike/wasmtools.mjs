// wasmtools.mjs -- pure, dependency-free wasm section surgery.
// Split out from drive.mjs so it can be unit-tested against a real artifact
// without npm, a network, or a browser. Round 1's rig could not be run in the
// sandbox at all; that is why its bugs reached CI.

export const SECTION_NAMES = {
  0: "custom", 1: "type", 2: "import", 3: "function", 4: "table", 5: "memory",
  6: "global", 7: "export", 8: "START", 9: "element", 10: "code", 11: "data",
  12: "datacount",
};

function uleb(b, i) {
  let r = 0, s = 0;
  for (;;) {
    const x = b[i]; i += 1;
    r |= (x & 0x7f) << s; s += 7;
    if (!(x & 0x80)) return [r, i];
  }
}

// -> [{ id, name, bodyStart, bodyLen, start, end }]
export function sections(buf) {
  if (!(buf[0] === 0x00 && buf[1] === 0x61 && buf[2] === 0x73 && buf[3] === 0x6d)) {
    throw new Error("not a wasm module");
  }
  const out = [];
  let i = 8;
  while (i < buf.length) {
    const start = i;
    const id = buf[i]; i += 1;
    const [len, after] = uleb(buf, i);
    out.push({ id, name: SECTION_NAMES[id] || "?", bodyStart: after, bodyLen: len,
               start, end: after + len });
    i = after + len;
  }
  return out;
}

export function exportsOf(buf) {
  const sec = sections(buf).find((s) => s.id === 7);
  if (!sec) return [];
  let [n, j] = uleb(buf, sec.bodyStart);
  const out = [];
  for (let k = 0; k < n; k++) {
    let nl; [nl, j] = uleb(buf, j);
    const nm = new TextDecoder().decode(buf.subarray(j, j + nl)); j += nl;
    const kind = buf[j]; j += 1;
    let idx; [idx, j] = uleb(buf, j);
    out.push({ name: nm, kind, idx });
  }
  return out;
}

// Zig's SELF-HOSTED wasm linker (-fno-lld) emits a start section, so the module
// runs _start during WebAssembly.instantiate() -- before a JS WASI host can
// bind its instance. wasmtime does not care; every JS host does. The start
// section names the SAME function already exported as _start, so removing the
// section leaves an ordinary WASI command module the host can start itself.
// Returns { buf, stripped, startFuncIdx }.
export function stripStart(buf) {
  const secs = sections(buf);
  const st = secs.find((s) => s.id === 8);
  if (!st) return { buf, stripped: false, startFuncIdx: null };
  const [idx] = uleb(buf, st.bodyStart);
  const out = new Uint8Array(buf.length - (st.end - st.start));
  out.set(buf.subarray(0, st.start), 0);
  out.set(buf.subarray(st.end), st.start);
  return { buf: out, stripped: true, startFuncIdx: idx };
}
