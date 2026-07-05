# Security Policy

## Reporting a vulnerability

Please report security issues privately via **GitHub's private vulnerability
reporting** on this repository (Security tab → "Report a vulnerability").
Do not open a public issue for security reports.

You can expect an initial response within **7 days**.

## Scope notes

- glifex.dev is a **fully static site** — no backend, no accounts, no stored
  user data. Server-side attack surface is GitHub Pages itself.
- The playground executes user-typed code **in the visitor's own browser**
  (and, when vendored, in WASM sandboxes). Escapes from that sandboxing are
  in scope and appreciated.
- The CLI runs code you wrote on your machine; "glifex ran my own code" is
  not a vulnerability. Harness bugs that mis-report correctness are welcome
  as ordinary issues.
