# The langbox: real toolchains inside emulated Linux in wasm

**Status: ON HOLD.** Investigated in depth (2026-07-15); it works, and the numbers say it
is not the right vehicle for the remaining language tracks yet. Everything below is measured,
not estimated -- kept so nobody re-derives it.

## What it is

[container2wasm](https://github.com/container2wasm/container2wasm) (Apache-2.0, CNCF) converts an
OCI image into a wasm blob: a Linux kernel + rootfs running under **QEMU compiled to wasm**
(`ktock/qemu-wasm`). It clears all three glifex constraints -- OSS, self-hosted, offline -- and
runs the **real, unmodified** toolchain. No per-language port, no subset, no compile ceiling.

We built it, ran it in headless Chromium via Playwright, and drove real compiles.

## It works

Alpine + gcc + OpenJDK 17 + kotlinc, in a browser tab, no server:

| | native (same image, `docker run --cpus=4 --memory=1g`) | in-browser | factor |
|---|---|---|---|
| `gcc hello.c` | 0.02s | 5.9s (warm) / 12.9s (cold) | ~295x |
| `java -version` | 0.03s | 10.1s | ~337x |
| `kotlinc hello.kt -d out` | 4.12s | 1015s | ~250x |
| `kotlinc -include-runtime` | 4.65s | 1334s | ~290x |
| boot (snapshot restore) | -- | 9.2s (4-core) | -- |

Bundle: **435MB** (395MB `.data` + 40MB wasm). Guest: 1024MB / 4 vCPU (build-args verified in
-guest: `free -m` = 995MB, `nproc` = 4, **no swap** -- c2w builds no swap device).
`user 37m > real 22m` on kotlinc confirms MTTCG multi-core actually works.

## Why it is on hold

**1. A flat ~300x tax, and it is structural.** qemu-wasm compiles a translation block into its own
`WebAssembly.Module` only after it runs `INSTANTIATE_NUM` (1500) times; everything else runs on
**TCI, an interpreter for QEMU's IR**. The arithmetic matches: ~3-5 TCG ops per guest instruction x
~20-50 host instructions per op to fetch/decode/dispatch, plus SoftMMU per load/store, plus
ASYNCIFY (~2-5x) and the wasm engine (~1.5-2x). Nothing is broken; that is what interpreting IR
costs. Lowering INSTANTIATE_NUM 1500 -> 100 bought ~7%.

**2. The rationing is a browser limit, not a bug.** `MAX_INSTANCE_ALIVE = 15000`
(`tcg/wasm32.c:107`). At the cap, `remove_instance_running_local()` evicts **half** the running
instances **FIFO** (not LRU) and the TB keeps running on TCI; evicted TBs are re-instantiated on
next touch, and `trysleep()` calls `emscripten_sleep(0)` -- a full ASYNCIFY unwind/rewind -- to let
`FinalizationRegistry` reclaim slots. One `WebAssembly.Module` **per TB** is why the caps exist;
upstream's own README says browsers cannot create thousands of modules. **v86 solves this by
batching** an entire hot page (+ reachable pages) into one module with a big `brtable` -- and its
docs admit browsers handle that structure poorly and `MAX_PAGES` must be capped. The W3C
**jit-interface** proposal exists precisely because runtime code-generation on the web is expensive
for everyone. This is an industry-wide wall, not a qemu-wasm defect.

**3. A self-modifying-code bug.** The guest JVM dies under sustained JIT:
`SIGSEGV ... Problematic frame: v ~BufferBlob::vtable chunks` -- a crash *inside* JIT-generated
code, with 840MB of 995MB free (so: not OOM). SMC invalidation looks wrong. It fits everything:
`java -version` (~no JIT) is fine, gcc (static code, zero SMC) is fine, kotlinc survives one run
but a daemon JIT-ing for 40 minutes dies. **Worth reporting upstream** -- repro is a mixed-mode JVM.
(Seen on qemu-wasm master `0ef7b4e2`; c2w v0.8.4 pins `8604ed4`. Untested whether the pin is clean.)

## What we learned that outlives the hold

**kotlinc is ~94% startup.** One JVM, repeated compiles (native):
`warm1=3595ms warm2=368ms -> 366 -> 246 -> 230ms`. So a **resident compiler daemon** removes the
overwhelming majority of the cost, for Kotlin, anywhere -- 1015s would become ~74s emulated. Not
the heap (256m == 768m == 4GB, all ~4.1s), not `-include-runtime` (+15% native), not `.kts`
(3.30s vs kotlinc 3.29s -- identical, and one JVM instead of two), not the guest's own JIT
(`-Xint` cut 43% of CPU but only 8% of wall).

**c2w's snapshot is controllable, and its ordering is load-bearing.**
`cmd/get-qemu-state/main.go` snapshots on the **first ten consecutive `=`** printed on the guest
console (`defaultWaitString = "=========="`, breaks at `cnt == 10`, fires once). c2w's own init
prints it (`cmd/init/main.go:160`) **before** mounting the pack 9p and **before** the container CMD
-- because **QEMU refuses to migrate while a VirtFS export is mounted**
(`Migration is disabled when VirtFS export path ... is mounted`). So a warm daemon can only be
snapshotted if the 9p is unmounted first. The snapshot itself runs under a **native**
`qemu-system-x86_64`, so warming at build time is cheap.

## Revisit triggers

* Batched TB->module codegen lands in qemu-wasm (v86 proves the design; the W3C jit-interface
  proposal would make it cheap), taking the tax from ~300x toward ~30x.
* The SMC/JIT crash is fixed, making a resident JVM survivable.
* A track genuinely needs the *real, unmodified* toolchain and can accept ~800MB + tens of seconds.

## Reproducing

Branch `spike/bx-langbox-zig` carried the harness: a headless PTY implementing the `Module["pty"]`
contract (no xterm, no CDN), the `TTY.stream_ops.poll` patch upstream's `index.html` requires (or
the guest never prints), a websocket sink on :8888 (the `-netdev socket` NIC hangs silently without
a peer), COOP/COEP (pthreads + SharedArrayBuffer), and Playwright/Chromium. The WASI build
(`c2w image out.wasm`) **cannot** run in a browser -- its first `poll_oneoff` throws
"async io not supported" under a synchronous WASI shim; only `--to-js` (emscripten + ASYNCIFY) works.

## The successor: OpenJDK Zero compiled straight to wasm (no QEMU at all)

The langbox was **the wrong layer**, and the same author reached that conclusion independently.
The JavaBox post that started this investigation now carries an update:

> "I have updated the code so it's actually fast now, **no longer using alpine linux and QEMU,
> compiled OpenJDK Zero to WebAssembly**."

He hit the wall we measured and the way out was not a better emulator -- it was deleting the
emulator. We were emulating an entire x86 machine to run one program that can be compiled directly.

```
langbox:  browser -> QEMU(TCI + SoftMMU + ASYNCIFY) -> kernel -> Alpine -> JVM(x86) -> kotlinc
Zero:     browser -> JVM(wasm, no JIT) -> kotlinc
```

**Zero** is the interpreter-only HotSpot build with no assembler for any architecture
(openjdk.org/projects/zero) -- it exists so the JVM can run where nobody wrote a port. Which means
**no JIT -> no self-modifying code -> the `~BufferBlob::vtable chunks` SIGSEGV above cannot occur.**
That crash was never a bug to fix; it was a consequence of JIT-under-emulation.

Read from his build scripts directly (github.com/bmarti44/javabox):

* **~75MB** total (3MB code + 72MB data) vs our 435MB. 256MB initial / 512MB max vs QEMU's 3000MB heap.
* **Boot target ~3-5s** (direct) vs ~55s (his QEMU mode). AGENTS.md; a target, not a measurement.
* The configure is **stock OpenJDK**: `--with-jvm-variants=zero`, `--with-jvm-features=zero,serialgc,
  static-build`, C1/C2/G1/ZGC/JFR/JVMCI/dtrace all disabled, `CC=emcc CXX=em++`, `make hotspot-only`
  -> `libjvm.a`. The **only** non-upstream flag is `--openjdk-target=wasm32-unknown-emscripten`.
* The final link has **no ASYNCIFY**: `em++ -O3 -mtail-call -pthread -sUSE_PTHREADS=1
  -sPROXY_TO_PTHREAD=1 -sPTHREAD_POOL_SIZE=16 -sSUPPORT_LONGJMP=wasm -fwasm-exceptions -sWASM_BIGINT`.
  Real threads, and `-mtail-call` -- exactly what a bytecode interpreter's dispatch loop wants. One
  of our three multipliers is simply gone. Blocking is done with a **SharedArrayBuffer ring buffer +
  `Atomics.wait`/`notify`**, not stack unwinding.
* `build/CompileServer.java` is a **resident compile daemon** holding `javax.tools.JavaCompiler` --
  he arrived at the same architecture we derived from measurement (kotlinc is ~94% startup).

**Sizing the port (AGENTS.md):**

```
openjdk/    Forked OpenJDK 21u with Emscripten OS layer (branch: wasm-emscripten)
  src/hotspot/os/emscripten/           Emscripten OS abstraction  (~15 files)
  src/hotspot/os_cpu/emscripten_zero/  Zero CPU port for Emscripten (~11 files)
```

**~26 files, in OpenJDK's two standard porting directories** -- the textbook shape upstream defines
for a new OS/CPU, plus autoconf for the triplet. Not smeared across the JDK. Upstream already ships
`os/linux/` and `os_cpu/linux_zero/`, so the work is "copy those, then fix what Emscripten lacks":
no `dlopen`/`dlsym`, no `fork`, restricted signals/`mprotect`, odd pthread semantics. His notes name
the landmines: **a static symbol table with binary search replaces `dlsym`** for JNI resolution, and
libjvm/libjava/libjimage/libzip/libnio/libffi are all statically linked into one binary.

**Blocked, but trivially:** `./openjdk` is a **gitlink** (mode 160000, commit
`97a3d2372d457c5a72413df14bf08cf99545c695`) with **no `.gitmodules`** -- he ran `git add openjdk` on
a local sibling checkout instead of `git submodule add`, so the URL was never registered and the
fork is not in his public repos. Same for `third-party/libffi-emscripten/`. `build-direct.sh` is an
89-line orchestrator that fetches nothing, and `build-jvm-wasm.sh` assumes `openjdk/` exists, so the
published repo **cannot be built by anyone but him**. An issue asking him to push the
`wasm-emscripten` branch + add the submodule URL is a two-minute fix on his side. (Filed.)

**The caveat that matters most for Bx-9, from his own Known Constraints:**

> "Emscripten pthreads: JVM internal threads (Finalizer, GC) may fail to start; game loop and
> compilation work on the main pthread."

Doom and `javac` survive single-threaded. **kotlinc does not** -- we measured `user 37m > real 22m`,
i.e. real parallelism. So the port could succeed and Kotlin still not work. **Bx-8 Java
(un-ceilinged -- teavm-javac's JS-call-stack limit is a TeaVM artifact, Zero has no such limit) is
the safer first tenant**, with Kotlin, Scala, Clojure and Groovy behind it.

**Status:** most promising Bx-9 architecture found; validated on his build scripts, not yet on our
own numbers. His `scripts/benchmark.sh` *measures* rather than reports, so "actually fast now" is
still his claim -- nobody has published figures. His live deploy
(`javabox-demo.brian-fec.workers.dev`) serves the built artifact and could be measured directly
without the fork -- that is the cheapest way to turn the claim into data.
