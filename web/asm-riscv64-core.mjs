// asm-riscv64-core.mjs -- build the user's riscv64 .s with the guest toolchain
// under Blink, then execute it on libriscv compiled to wasm32.
//
//   .s -> Blink(as) -> .o -> Blink(ld) -> linked ELF -> libriscv -> a0
//
// Mirrors web/asm-arm64-core.mjs. Three things differ, all in our favour:
//
//  1. NO RELOCATION. VIXL dereferenced a guest address as a raw host pointer, so
//     arm64 had to parse PT_LOADs and copy them to a 4K-aligned malloc'd base --
//     and get the alignment exactly right, or every adrp page delta shifted
//     silently. libriscv takes the ELF whole and owns its memory. There is no
//     ELF parsing in this file at all.
//  2. NATIVE INSTRUCTION COUNT. machine.instruction_counter() -- VIXL made us
//     count step() calls by hand.
//  3. SYMBOLS FROM THE LIBRARY. machine.address_of(name); no symtab walking.
//
// The cost: guest memory is not wasm memory, so inputs go through
// copy_to_guest/copy_from_guest rather than poking HEAPU8. Proven: the
// __glifex_io .bss trick ports unchanged -- the linker places it, gx_sym finds
// it, and a kata reading ptr[0]+ptr[1] returns the right answer.
//
// Full findings: docs/libriscv-riscv64.md.

import { RiscvBlink } from "./asm-riscv64-blink.mjs";
import riscvFactory from "./vendor/asm-riscv64/gx_rv.mjs";

const ASM_URL = "vendor/asm-riscv64/riscv64-as.elf";
const LD_URL = "vendor/asm-riscv64/riscv64-ld.elf";

// RISC-V ABI register numbers. a0..a7 are x10..x17; ra is x1; sp is x2.
const A0 = 10, A1 = 11, A2 = 12, A3 = 13, RA = 1, SP = 2;

const bigIntSafe = (_, v) => (typeof v === "bigint" ? Number(v) : v);
function eq(a, b) {
  try { return JSON.stringify(a, bigIntSafe) === JSON.stringify(b, bigIntSafe); }
  catch { return false; }
}
const big = (v) => (typeof v === "bigint" ? v : BigInt(v));
function cstr(s) {
  const b = new Uint8Array(s.length + 1);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  b[s.length] = 0;
  return b;
}

// Per-problem RISC-V adapters: a0-a7 in, a0 out. Same problem shapes as the
// SysV and AAPCS64 adapters; only the register numbers change. Corpus
// signatures come from the CLI harness.c -- int solve(const char*, const char*)
// etc. Inputs live in a BSS scratch region, not the stack.
const ADAPTERS = {
  anagram: {
    marshal(g, io, inp) {
      const S = io, T = io + 0x10000n;
      g.writeBytes(S, cstr(inp.s));
      g.writeBytes(T, cstr(inp.t));
      g.setX(A0, S); g.setX(A1, T);
      return {};
    },
    decode(g) { return (g.getX(A0) & 1n) === 1n; },
  },
  twoSum: {
    marshal(g, io, inp) {
      const NUMS = io, OUT = io + 0x30000n;
      const a = inp.nums;
      const buf = new Uint8Array(a.length * 8);
      const dv = new DataView(buf.buffer);
      a.forEach((v, k) => dv.setBigInt64(k * 8, big(v), true));
      g.writeBytes(NUMS, buf);
      const ob = new Uint8Array(16);
      const odv = new DataView(ob.buffer);
      odv.setBigInt64(0, -1n, true); odv.setBigInt64(8, -1n, true);
      g.writeBytes(OUT, ob);
      g.setX(A0, NUMS); g.setX(A1, a.length); g.setX(A2, inp.target); g.setX(A3, OUT);
      return { OUT };
    },
    decode(g, ctx) {
      const b = g.readBytes(ctx.OUT, 16);
      const dv = new DataView(b.buffer, b.byteOffset, 16);
      return [Number(dv.getBigInt64(0, true)), Number(dv.getBigInt64(8, true))];
    },
  },
  fib: {
    marshal(g, io, inp) { g.setX(A0, inp.n); return {}; },
    decode(g) { return Number(BigInt.asUintN(64, g.getX(A0))); },
  },
};
function adapterFor(cases) {
  const inp = cases[0].input;
  if ("s" in inp && "t" in inp) return ADAPTERS.anagram;
  if ("nums" in inp) return ADAPTERS.twoSum;
  if ("n" in inp) return ADAPTERS.fib;
  throw new Error("unknown problem shape: " + JSON.stringify(Object.keys(inp)));
}

// A guest-memory view. Unlike arm64's, these are NOT wasm offsets -- libriscv
// owns the address space, so every access goes through copy_to/from_guest.
function guest(M) {
  return {
    setX(n, v) { M._gx_write_x(n, big(v)); },
    getX(n) { return M._gx_read_x(n); },
    writeBytes(addr, bytes) {
      const p = M._malloc(bytes.length);
      M.HEAPU8.set(bytes, p);
      M._gx_write_mem(big(addr), p, bytes.length);
      M._free(p);
    },
    readBytes(addr, len) {
      const p = M._malloc(len);
      M._gx_read_mem(p, big(addr), len);
      const out = M.HEAPU8.slice(p, p + len);
      M._free(p);
      return out;
    },
    sym(name) {
      const b = cstr(name);
      const p = M._malloc(b.length);
      M.HEAPU8.set(b, p);
      const a = M._gx_sym(p);
      M._free(p);
      return a;
    },
  };
}

let riscvPromise = null;
// The Machine is rebuilt per solve (gx_load_elf), but the wasm module itself is
// loaded ONCE per worker.
async function getRiscv() {
  if (!riscvPromise) riscvPromise = riscvFactory();
  return riscvPromise;
}

const MAX_STEPS = 5000000;
// The poison window must cover the LARGEST stack allocation the Lab's ladder
// produces, or the depth scan saturates and reports a flat number -- which reads
// as O(1) and is a confident wrong answer, worse than no measurement.
//
// 0xE00 (3584 B) came from asm-x86-core.mjs, where it is correct: x86-64's 002
// mmaps its hash table, so its stack stays tiny. On THIS track there is no mmap
// -- no kernel behind the emulator -- so the table is a stack allocation:
// next_pow2(2n) slots x 16 B = 16 KB at the ladder's top rung (n=512).
//
// Measured with the old window: 32:1040  64:2064  128:3584  256:3584  512:3584
// -- pinned from n=128 up. With this one: 128:4112  256:8208  512:16400, which
// doubles per rung exactly as O(n) should.
const POISON = 0x8000;   // 32 KB: 2x the 16 KB the top rung actually needs

export async function driveProblem(source, cases) {
  const m = source.match(/\.globl\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (!m) return { error: "no .globl symbol found in source" };
  const entry = m[1];
  let adapter;
  try { adapter = adapterFor(cases); }
  catch (e) { return { error: String(e.message || e) }; }

  // The linker places this and gx_sym finds it -- the same trick arm64 uses,
  // and it survives libriscv's different memory model.
  const srcAug = source +
    "\n\n.section .bss\n.align 16\n.globl __glifex_io\n__glifex_io:\n.zero 262144\n";

  const B = new RiscvBlink();
  await B.init(ASM_URL, LD_URL);

  const asExit = await B.assemble(srcAug);
  if (asExit !== 0) {
    return { error: "assembly failed: " + (B.log || "").slice(-300).replace(/[^\x20-\x7e\n]/g, ".") };
  }
  const ldExit = await B.link(entry);
  if (ldExit !== 0) {
    return { error: "link failed: " + (B.log || "").slice(-300).replace(/[^\x20-\x7e\n]/g, ".") };
  }
  const elf = B.readLinked();

  const M = await getRiscv();
  const g = guest(M);

  const ep = M._malloc(elf.length);
  M.HEAPU8.set(elf, ep);
  const rc = M._gx_load_elf(ep, elf.length);
  M._free(ep);
  if (rc !== 0) {
    // The likeliest cause by far, and it is a build-config bug, not a user one.
    return { error: "the riscv64 runtime could not load your program (code " + rc + "). " +
      "If this is reproducible, the vendored libriscv may have been built without RISCV_EXT_C." };
  }

  const entryAddr = g.sym(entry);
  const io = g.sym("__glifex_io");
  if (entryAddr === 0n) return { error: "symbol not found after link: " + entry };
  if (io === 0n) return { error: "scratch buffer __glifex_io not found after link" };

  let totalInsns = 0, peakStackMax = 0;
  const results = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    // machine.reset(), NOT a rebuild. Each Machine allocates a
    // 2^RISCV_ENCOMPASSING_ARENA_BITS arena, so rebuilding per case exhausts the
    // heap -- measured: it OOMs trying to grow to 512 MB with two live arenas.
    // Same shape as VIXL's ResetState(), which arm64 uses here.
    M._gx_reset();
    const sp0 = g.getX(SP);
    // Poison below sp so the depth scan can see how much stack the solve used.
    g.writeBytes(sp0 - big(POISON), new Uint8Array(POISON).fill(0xA5));
    const ctx = adapter.marshal(g, io, c.input);

    g.setX(RA, 0);                        // a ret to 0 is the sentinel
    M._gx_set_pc(entryAddr);
    const before = M._gx_icount();
    let steps = 0, ret = false, threw = null;
    try {
      while (steps < MAX_STEPS) {
        if (M._gx_step() !== 0) { threw = "faulted"; break; }
        steps++;
        if (M._gx_get_pc() === 0n) { ret = true; break; }
      }
    } catch (e) { threw = String((e && e.message) || e); }

    // Exhausting the budget must be an ERROR, not a wrong answer -- Bx-10
    // shipped the other way and the Lab reported truncated runs as incorrect
    // algorithms, which is the worst failure shape available.
    if (!ret && !threw) {
      return {
        error: "Your riscv64 program ran past " + MAX_STEPS.toLocaleString() +
          " instructions on case " + i + " without returning -- likely a runaway loop, " +
          "or an algorithm far slower than expected at this input size.",
      };
    }

    let got = null;
    try { got = adapter.decode(g, ctx); } catch (e) { threw = threw || String(e.message || e); }

    // instruction_counter() is libriscv's own -- exact, and free.
    const insns = Number(M._gx_icount() - before);
    let deepest = sp0;
    const win = g.readBytes(sp0 - big(POISON), POISON);
    for (let k = 0; k < POISON; k++) {
      if (win[k] !== 0xA5) { deepest = sp0 - big(POISON) + big(k); break; }
    }
    const peakStack = Number(sp0 - deepest);

    totalInsns += insns;
    if (peakStack > peakStackMax) peakStackMax = peakStack;
    results.push({
      i, ok: ret && !threw && eq(got, c.expected), got, expected: c.expected,
      insns, cycles: insns,               // exact -- libriscv counts them
      // The Lab reads `.space` for its primary workspace verdict (lab.js:406 ->
      // spaceBy -> spaceSeries -> spaceJ). For THIS track the stack IS the
      // workspace: libriscv simulates a CPU and not a kernel, so there is no
      // mmap behind an ecall and no heap to measure. 002's hash table is a stack
      // allocation for exactly that reason.
      //
      // Deliberately NOT also setting spaceStack -- see asm-arm64-core.mjs.
      space: peakStack, peakStack,
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
