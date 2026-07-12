# Glifex: practice algorithms in 18 languages, entirely in your browser

**Live:** https://glifex.dev  -  **Source:** https://github.com/Joey-Fuentes/glifex  -  MIT

Glifex is a polyglot coding-practice playground. You solve a problem once, then run the
same solution against one shared set of hidden test cases in any of its languages -- and
you practice *blind*: the reference solutions stay hidden until you ask to see them.

Why it exists: most practice sites lock you into one language, phone home, and need an
account. Glifex is the opposite -- local-first, no accounts, no tracking, and the whole
thing runs offline once loaded. The same corpus runs two ways: a one-command CLI (Linux,
macOS, Windows, straight from VS Code) and a browser playground that executes your code
client-side.

Under the hood: each language runtime is a vendored WebAssembly module, lazy-loaded on
first run and cached, so nothing hits the network at runtime. Interpreted languages
(Python, Ruby, PHP, JS/TS) and SQL (Postgres via PGlite) run today in the browser; C and
C++ compile and run in-browser via clang-in-wasm; and a sequenced roadmap is bringing the
rest of the compiled and assembly families online, one honest, disclosed runtime at a time.

Ships with: Python, JavaScript, TypeScript, Go, Java, Ruby, C#, C++, C, Rust, PHP, Dart,
Zig, plus an assembly family (x86-64, ARM64, WebAssembly Text) and a PostgreSQL database
track. Adding a language is a single plugin file.

Try it: https://glifex.dev -- pick a problem, write a solution, hit Run. No sign-up.
