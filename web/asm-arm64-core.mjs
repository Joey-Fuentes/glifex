// asm-arm64-core.mjs -- build the user's aarch64 .s with the guest toolchain
// under Blink, then execute it on VIXL's AArch64 Simulator compiled to wasm32.
//
//   .s -> Blink(as) -> .o -> Blink(ld) -> linked ELF
//      -> load PT_LOADs at a 4K-aligned malloc'd base -> VIXL -> x0
//
// Mirrors web/asm-x86-core.mjs's driveProblem contract. Two things deliberately
// differ, because VIXL is not Blink:
//
//  1. NO SENTINEL RETURN ADDRESS. Bx-7 pushes 0xDEAD0000 and steps until rip
//     hits it. VIXL's ResetState() seeds lr with kEndOfSimAddress, so
//     IsSimulationFinished() IS the sentinel, natively.
//  2. NO heapBytes. Bx-7 counts mmap by watching for a syscall opcode with
//     rax==9. VIXL simulates a CPU, not a kernel -- there are no syscalls to
//     watch. Reporting 0 would look like a measurement; the field is omitted
//     and spaceStack carries the real signal.
//
// Full findings and numbers: docs/vixl-arm64.md.

import { ArmBlink, elfLoads, elfSymAddr } from "./asm-arm64-blink.mjs";
import vixlFactory from "./vendor/asm-arm64/gx_vixl.mjs";

const ASM_URL = "vendor/asm-arm64/aarch64-as.elf";
const LD_URL = "vendor/asm-arm64/aarch64-ld.elf";

const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
function eq(a, b) {
  try { return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe); }
  catch { return false; }
}
const big = (v) => (typeof v === "bigint" ? v : BigInt(v));

// Per-problem AAPCS64 adapters: x0-x7 in, x0 out. Same shapes as the SysV
// adapters in asm-x86-core.mjs, register-renamed. The corpus signatures are
// int solve(const char *s, const char *t) etc -- see the CLI harness.c.
// Inputs live in a BSS scratch region, not the stack: Lab ladders reach n=1024.
const ADAPTERS = {
  anagram: {
    marshal(g, io, inp) {
      const S = io, T = io + 0x10000;
      g.writeBytes(S, cstr(inp.s));
      g.writeBytes(T, cstr(inp.t));
      g.setX(0, S); g.setX(1, T);
      return {};
    },
    decode(g) { return (g.getX(0) & 1n) === 1n; },
  },
  twoSum: {
    marshal(g, io, inp) {
      const NUMS = io, OUT = io + 0x30000;
      const a = inp.nums;
      for (let k = 0; k < a.length; k++) g.writeU64(NUMS + k * 8, big(a[k]));
      g.writeU64(OUT, big(-1)); g.writeU64(OUT + 8, big(-1));
      g.setX(0, NUMS); g.setX(1, a.length); g.setX(2, inp.target); g.setX(3, OUT);
      return { OUT };
    },
    decode(g, ctx) {
      return [Number(BigInt.asIntN(64, g.readU64(ctx.OUT))),
              Number(BigInt.asIntN(64, g.readU64(ctx.OUT + 8)))];
    },
  },
  fib: {
    marshal(g, io, inp) { g.setX(0, inp.n); return {}; },
    decode(g) { return Number(BigInt.asUintN(64, g.getX(0))); },
  },
};
function cstr(s) {
  const b = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  b[s.length] = 0;
  return b;
}
function adapterFor(cases) {
  const inp = cases[0].input;
  if ("s" in inp && "t" in inp) return ADAPTERS.anagram;
  if ("nums" in inp) return ADAPTERS.twoSum;
  if ("n" in inp) return ADAPTERS.fib;
  throw new Error("unknown problem shape: " + JSON.stringify(Object.keys(inp)));
}

// A thin guest-memory view over VIXL. Guest addresses ARE wasm linear-memory
// offsets (VIXL dereferences them as raw host pointers, no MMU), so this is
// plain HEAPU8 arithmetic -- no spy_address indirection like Blink needs.
function guest(M) {
  return {
    M,
    setX(n, v) { M._gx_write_x(n, big(v)); },
    getX(n) { return M._gx_read_x(n); },
    sp() { return Number(M._gx_read_sp()); },
    writeBytes(addr, bytes) { M.HEAPU8.set(bytes, addr); },
    writeU64(addr, v) { new DataView(M.HEAPU8.buffer).setBigUint64(addr, BigInt.asUintN(64, big(v)), true); },
    readU64(addr) { return new DataView(M.HEAPU8.buffer).getBigUint64(addr, true); },
    fill(addr, val, len) { M.HEAPU8.fill(val, addr, addr + len); },
    readByte(addr) { return M.HEAPU8[addr]; },
  };
}

let vixlPromise = null;
// gx_init constructs the Decoder + Simulator and costs ~771 ms. Build it ONCE
// per worker and reuse across solves; gx_reset() is the per-case call.
async function getVixl() {
  if (!vixlPromise) {
    vixlPromise = (async () => {
      const M = await vixlFactory();
      if (M._gx_init() !== 0) throw new Error("VIXL init failed");
      return M;
    })();
  }
  return vixlPromise;
}

const MAX_STEPS = 5000000;
const POISON = 0xE00;

export async function driveProblem(source, cases) {
  const m = source.match(/\.globl\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!m) return { error: "no .globl symbol found in source" };
  const entry = m[1];
  let adapter;
  try { adapter = adapterFor(cases); }
  catch (e) { return { error: String(e.message || e) }; }

  // Inputs go in a linker-placed BSS buffer, not the stack. 256 KB holds every
  // Lab ladder input. .bss arrives as memsz > filesz and is zero-filled below.
  const srcAug = source +
    "\n\n.section .bss\n.align 16\n.globl __glifex_io\n__glifex_io:\n.zero 262144\n";

  const B = new ArmBlink();
  await B.init(ASM_URL, LD_URL);

  const asExit = await B.assemble(srcAug);
  if (asExit !== 0) {
    return { error: "assembly failed: " + (B.log || "").slice(-300).replace(/[^\x20-\x7e\n]/g, ".") };
  }
  const ldExit = await B.link(entry);
  if (ldExit !== 0) {
    return { error: "link failed: " + (B.log || "").slice(-300).replace(/[^\x20-\x7e\n]/g, ".") };
  }

  let elf, segs, minva, span, entryVaddr, ioVaddr;
  try {
    elf = B.readLinked();
    segs = elfLoads(elf);
    minva = Math.min(...segs.map((s) => s.va));
    span = Math.max(...segs.map((s) => s.va + s.msz)) - minva;
    entryVaddr = elfSymAddr(elf, entry);
    ioVaddr = elfSymAddr(elf, "__glifex_io");
  } catch (e) {
    return { error: "ELF parse: " + String(e.message || e) };
  }

  const M = await getVixl();
  const g = guest(M);

  // adrp masks PC to a 4 KB page, so (base - minva) MUST be a multiple of 4096
  // or every page delta shifts by one -- which surfaces as garbage reads, not a
  // fault. malloc gives no such guarantee: over-allocate and round up.
  const raw = Number(M._malloc(span + 8192));
  if (!raw) return { error: "out of memory allocating " + span + " bytes" };
  const base = (raw + 4095) & ~4095;
  for (const s of segs) {
    const dst = base + (s.va - minva);
    g.fill(dst, 0, s.msz);                       // .bss
    M.HEAPU8.set(elf.subarray(s.off, s.off + s.fsz), dst);
  }
  const off = base - minva;
  const entryAddr = entryVaddr + off;
  const io = ioVaddr + off;

  let totalInsns = 0, peakStackMax = 0;
  const results = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    M._gx_reset();                               // also reseeds lr = kEndOfSimAddress
    const sp0 = g.sp();
    g.fill(sp0 - POISON, 0xA5, POISON);          // poison below sp for the depth scan
    const ctx = adapter.marshal(g, io, c.input);

    M._gx_set_pc(big(entryAddr));
    let steps = 0, ret = false, threw = null;
    try {
      while (steps < MAX_STEPS) {
        if (M._gx_step() === 1) { ret = true; break; }
        steps++;
      }
    } catch (e) { threw = String((e && e.message) || e); }

    // Exhausting the budget must be an ERROR, not a wrong answer. Left alone it
    // returns ret:false plus whatever the output buffer happened to hold, which
    // reads as "your algorithm is incorrect" -- the worst failure shape there
    // is, because it is plausible. Seen live: the Lab walked the default ladder
    // to n=32768 and reported brute-force as INCORRECT when it had simply been
    // truncated at 5e6 steps.
    if (!ret && !threw) {
      return {
        error: "Your arm64 program ran past " + MAX_STEPS.toLocaleString() +
          " instructions on case " + i + " without returning -- likely a runaway loop, " +
          "or an algorithm far slower than expected at this input size.",
      };
    }

    let got = null;
    try { got = adapter.decode(g, ctx); } catch (e) { threw = threw || String(e.message || e); }

    // Deepest byte of the poison window the solve disturbed == stack it used.
    let deepest = sp0;
    for (let k = 1; k <= POISON; k++) {
      if (g.readByte(sp0 - k) !== 0xA5) deepest = sp0 - k;
    }
    const peakStack = sp0 - deepest;

    totalInsns += steps;
    if (peakStack > peakStackMax) peakStackMax = peakStack;
    results.push({
      i, ok: ret && !threw && eq(got, c.expected), got, expected: c.expected,
      insns: steps, cycles: steps,          // exact -- VIXL single-steps
      peakStack, spaceStack: peakStack,
      ret, threw,
    });
  }

  const n = cases.length || 1;
  return {
    results,
    instructions: Math.round(totalInsns / n),
    spaceBytes: peakStackMax,
    codeBytes: elf.length,
    entry,
  };
}
