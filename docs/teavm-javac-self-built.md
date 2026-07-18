# Java — teavm-javac, built from pinned source (the Bx-8b record)

**Status: SHIPPED.** Every number below is measured — across four spike rounds in
CI (`spike/bx8b-teavm-javac-*`, throwaway, never merged), then against the real
corpus in a real browser. Nothing here is reasoned.

Bx-8 shipped Java by fetching four files from `https://teavm.org/playground/`.
Bx-8b builds them instead. The track's behaviour did not change; its provenance
did, from nothing to total.

---

## 1. The verdict

```
build     ok    ~112s   konsoletyper/teavm-javac at 7e4a44cf, JDK 25, gradle 9.1.0
                        four artifacts, byte-identical across FOUR independent CI runs
swap      inert         both artifact sets pass 001/002/003 x four variants through
                        the real java-worker.js -- node AND a real Chromium module
                        worker -- with identical verdicts, row for row
```

The source is **`konsoletyper/teavm-javac`** — "Java compiler in the browser".
**Not `konsoletyper/teavm`**, which is the AOT compiler: its releases (0.15.0 and
so on) are Maven artifacts and it ships no `compiler.wasm` at all. Two projects,
one author, and picking the wrong one wastes a round. TeaVM 0.13's own release
notes say the browser-compiler work "was done mostly outside TeaVM".

---

## 2. Why this had to change: there was no version

teavm-javac publishes **no releases and no tags**. Its README does not name a
version — it offers "the latest WebAssembly module" and points at the
maintainer's own web server. So there was nothing to pin to, and every cold
re-vendor re-downloaded a moving target. Not unpinned: **unpinnable**.

And it had already moved. Both `compiler.wasm-runtime.js` files are text, so the
two were compared feature by feature rather than by size:

| feature | teavm.org blob | built at 7e4a44cf |
|---|---|---|
| `teavmAsync` | **no** | yes |
| `notifyHeapResized` | **no** | yes |
| `teavm.imports` | **no** | yes |
| `WebAssembly.Memory` | **no** | yes |
| `teavm.stringToJs` | **no** | yes |
| `stackDeobfuscator`, `teavmJso`, `teavmDate` | yes | yes |

`teavmAsync` **is** the WasmGC coroutine support TeaVM 0.13 introduced — the
headline feature of that release. The shipped blob did not have it, so it was
built **before** `7e4a44cf`, the commit titled *"Update teavm version to
0.13.1"*, which has been master since 2026-03-21. glifex was serving a
hand-uploaded artifact from an older, unknown commit, and no amount of fetching
would ever have said so.

**The artifact-to-commit link is unknowable by construction.** The maintainer
uploads by hand; nothing forces the artifact to track any commit. That is the
whole argument for building it.

---

## 3. What the build actually is

One SHA determines everything. Nothing below is a second pin to keep in sync:

| input | pinned by | value |
|---|---|---|
| teavm-javac | `tools/java-toolchain/pins.env` | `7e4a44cf` (58 commits, unmoved since 2026-03-21) |
| OpenJDK | its own `gradle.properties` | `jdk.revision=6c48f4ed` → `openjdk/jdk25u` (~201 MB zip) |
| TeaVM | its own `gradle/libs.versions.toml` | `0.13.1` (also asm 9.8, jzlib 1.1.3) |
| Gradle | its own checked-in wrapper | 9.1.0 |
| JDK | `pins.env`, asserted at build | **25** |

**`:compiler:build` emits all four.** `compiler/build.gradle` ends with
`build { dependsOn buildWasmGC, buildTeaVMClassLib, generateClassLib }`. The
"special tool" the README credits with generating the two archives, without ever
naming it, is two `JavaExec` tasks in the same repo:

| artifact | task | main class |
|---|---|---|
| `compile-classlib-teavm.bin` | `generateClassLib` | `org.teavm.javac.StdlibConverter` |
| `runtime-classlib-teavm.bin` | `buildTeaVMClassLib` | `org.teavm.javac.ArchiveBuilder` |
| `compiler.wasm` + `.wasm-runtime.js` | `buildWasmGC` | TeaVM plugin, `modularRuntime = true` |

### The README says Java 21. The README is stale.

`settings.gradle` sets `sourceCompatibility = targetCompatibility =
JavaVersion.VERSION_25` for every Java project, and `:javac` compiles **jdk25u**
source that uses unnamed variables (`_`) — final in Java 22, preview-only in 21.
On 21 the build dies:

```
Check.java:1324: error: unnamed variables are a preview feature and are disabled by default
```

Do **not** reach for `--enable-preview`. The build is not asking to opt into a
preview; it is telling you which JDK it is written against.
`build-teavm-javac.sh` refuses if the running `java` disagrees with `pins.env`,
the way `build-dart2js.sh` refuses when the installed `dart` disagrees with its
pin.

---

## 4. The one patch, and why it is not a fork

`settings.gradle` lists `https://teavm.org/maven/repository` **first**, ahead of
`mavenCentral()`, in **both** `pluginManagement` and
`dependencyResolutionManagement`. So every build asked the server that 415s us
before it asked Central — for every plugin and every dependency, including
third-party ones it does not even have.

Measured with `--info` on an unpatched build:

```
176 https://repo.maven.apache.org
 81 https://teavm.org          <- all misses: jackson, commons, apache parents,
  7 https://plugins.gradle.org    gretty, jetty, bouncycastle, joda-time...
```

Then teavm.org and nodejs.org were **blackholed at the DNS level**, the module
cache wiped, and `--refresh-dependencies` run cold:

```
COLD build without teavm.org: exit=0
resolution failures: (none)
SAME BYTES -- all four sha256 identical to the runs that used it
```

**It was FIRST, not NECESSARY.** Central serves every artifact this build needs,
including teavm 0.13.1 and the `org.teavm.gradle.plugin` marker. So the patch
removes a redundant repository; it does not replace a source. Three asserts,
because one is a hope:

1. the anchor matches **exactly 2** (the two lines differ only in indentation, 9
   spaces vs 8 — so match line CONTENT, never whitespace);
2. the host is absent from `settings.gradle` afterwards;
3. the host is absent from the **build log** afterwards.

What remains is `repo.maven.apache.org`, `plugins.gradle.org`,
`services.gradle.org` (the wrapper) and `github.com` (jdk25u at a pinned SHA) —
the same CDN class glifex already accepts for python, ruby, typescript,
postgres, php and wat, and strictly better than arm64's `ftp.gnu.org` +
`gitlab.arm.com`.

---

## 5. The build is byte-reproducible

Four independent CI runs at `7e4a44cf` on JDK 25 produced identical sha256 for
all four artifacts:

```
05c4d5061bea31443b231ebbdd78a88f4ee243be65a3cf37d898857bdb15b0b6  compiler.wasm
bd103f277be99fd2f3ffc0248b3558e6c2c85a44902bfeef042c6bedcf0b2c63  compiler.wasm-runtime.js
8a2de4558132ed41e62c17faa0677cc305bdcf142cdb949b0029784191d36bd0  compile-classlib-teavm.bin
4b1a894f0b2ff0435c7d46a70ceed86b9bdb061fb5d4ce187251cc1bd42aeaa1  runtime-classlib-teavm.bin
```

**Four runs is evidence, not a guarantee.** A JDK patch bump (25.0.3 → 25.0.4) is
the obvious way to break it. The digests are recorded in `pins.env` so a change
that moves them is visible instead of silent — deliberately as a *record*, not as
a gate, because a digest gate would fail on the day a JDK patch lands and tell
you nothing useful.

---

## 6. Proving the swap was inert

The artifacts differ from the old blob **in kind**, not just in bytes, and
`web/java-worker.js` was written against the old ones — with no e2e coverage at
all. "It built" is not "it works", so:

| | teavm.org blob | built at 7e4a44cf |
|---|---|---|
| `compiler.wasm` | 4,126,432 | 4,299,273 (+4.2%) |
| `compiler.wasm-runtime.js` | 11,642 | 13,936 (+19.7%) |
| `compile-classlib-teavm.bin` | 199,668 | 200,624 (+0.5%) |
| `runtime-classlib-teavm.bin` | 2,377,497 | 2,391,126 (+0.6%) |
| kata compile → run | ok, 55 | ok, 55 |
| 001/002/003 x 4 variants, node | identical | identical |
| same, real Chromium **module worker** | identical | identical |
| ten ceiling probes | all compile | all compile |
| compile wall | ~4.7 s | ~5.4 s (+15%) |

Identical row for row, **including the practice stub's partial-pass pattern**
(001: 4/6, 002: 0/6, 003: 1/6 on both) — which is the detail that makes it a
comparison rather than a coincidence.

The corpus rig imported `web/java-worker.js` **itself** rather than
reimplementing `genDecode`/`buildProgram`. Reimplementing them would have tested
the rig; those two functions are the whole reason the track is shaped the way it
is ("a generic decoder overflows teavm-javac, so we emit only what this shape
needs"). The C# validate job set that precedent.

### A loose thread on the ceiling

All ten probes — `HashMap`, `Arrays.sort`, `Arrays.asList`, `List.of`,
recursion, streams, `@FunctionalInterface`, `StringBuilder`, `TreeMap` — compile
**in isolation** on both artifact sets. Those are exactly the constructs
`java-worker.js`'s user-facing error blames ("*a known limit... e.g.
HashMap/generics, Arrays.sort/asList, recursion — try a simpler approach*").

So the ceiling is probably **cumulative size/branchiness, not those constructs**,
and that error text is probably misleading. **The probes are minimal, so this is
a lead, not a result.** Do not rewrite the message on the strength of it; measure
first.

---

## 7. Reproducing

```bash
. tools/java-toolchain/pins.env
bash tools/java-toolchain/build-teavm-javac.sh /tmp/out   # ~112s, needs JDK 25
node tools/java-toolchain/verify-java.mjs /tmp/out        # compiles a kata AND runs it
```

`verify-java.mjs` takes a directory on purpose: point it at any set of the four
artifacts. That is what made the spike's control possible — running the identical
verify against production's blob, so a failure could be told apart from a broken
harness.

**It imports a `.mjs` COPY of the runtime, not the `.js`.** The file is an ES
module with a `.js` extension; a bare `import()` threw `SyntaxError: Unexpected
token 'export'` on the CI runner while passing in every spike. The cause was
never established. `.mjs` is unconditionally ESM on every node, under any
`package.json`, so the copy removes the question instead of theorising about it;
the verify also walks up printing every `package.json` and its `type`, so the
next occurrence lands in the log. Nothing that ships changes — the browser
imports the `.js` name and none of this applies there.

---

## 8. Where the spikes were wrong

The roadmap's steer was right; almost everything supporting it needed correcting,
and most of the corrections are about the spike's own scaffolding rather than
about Java.

| believed | actually |
|---|---|
| "the source repo is konsoletyper/teavm" | that is the AOT compiler and ships no `compiler.wasm`. It is `teavm-javac`. |
| "the artifact is versioned badly" | it is not versioned **at all**: no releases, no tags, "the latest module" |
| "You need Java 21" (the README) | the build says 25, in `settings.gradle`, and dies loudly on 21 |
| "six origins, all bad" | one fragile server plus the CDN class already accepted everywhere else. Counting hostnames is not classifying risk. |
| "Central may not have 0.13.1" (31 of 116 versions) | it does. The cold blackholed build proved it in two minutes. |
| "a dead host makes Gradle fail hard, so the blackhole is confounded" | Gradle fell through cleanly. The experiment was fine. |
| "the 415 is a hard block, headers no longer work" | it is intermittent: a vendor run succeeded 10 minutes after the failure. `ci-dependency-hardening.md`'s refusal to call it fixed was right, and overriding it on three retries inside one minute was not a control. |

### The scaffolding lessons, which cost more than Dart did

- **Guards that read prose instead of code fired three times.** A check banning
  `compiler.listOutputFiles.length` matched the comment *explaining* that bug; a
  check asserting a host was absent matched the marker comment naming it. The
  handoff already records this exact footgun ("a guard grepped the bundled worker
  for a word that only appeared in a comment"). Strip comments before checking,
  or do not check.
- **Truncation ate the answer twice.** `sed -n '1,40p'` cut the URL list exactly
  where `org/teavm/*` would have appeared; `tail -2` hid a success line and
  invented a reproduction that did not exist. Both produced confident, wrong
  conclusions.
- **A number that measures nothing looks exactly like a finding.**
  `compiler.listOutputFiles` is a method; reading `.length` gives a function's
  **arity**. It printed "output classes: 0" for both artifact sets, on every run,
  and meant nothing at all.
- **Use the house rig.** `e2e/java-smoke.spec.js` first used bare
  `@playwright/test` and died with "execution context destroyed" — the error
  `e2e/coi-fixtures.js` exists to prevent and names verbatim in its own comment.
  Sixteen of twenty specs already used it.
- **Run the control.** Every hypothesis reasoned to in this series was wrong;
  every experiment was decisive. Same finding as the dart2js series, one track
  later, which suggests it is not a coincidence.
