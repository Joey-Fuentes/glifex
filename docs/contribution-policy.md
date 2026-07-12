# Contribution policy — problems

The rule in one line: **declared completeness**. Every problem states exactly
what it supports in `manifest.toml`, and `glifex verify` (locally and in CI)
enforces that the declaration is true. Honesty is the gate, not totality.

## The merge floor (algorithm track)

New algorithm problems must implement **Python, JavaScript, C, and C++**, each
with passing `clean` and `optimized` references and a **blank** `practice`
stub. (001/002 previously shipped `practice` solved, flagged
`worked_example = true` -- reverted; every problem now ships a blank stub
uniformly. Worked examples are deferred to a future phase, not dropped.)
Rationale: Python+JS keep every problem attemptable by most visitors — JS
guarantees playground support — and C/C++ prove the contract under manual
memory. Everything above the floor is a welcome incremental PR ("add Ruby to
007" is a first-class contribution). The floor gates new problems in; it never
forces existing problems to grow. Other tracks (database, frontend, assembly,
WAT) keep their own shapes and don't count toward it.

**Exemption hatch:** genuinely language-hostile problems (e.g. big-integer
arithmetic in C) may carry a reviewer-approved `[exemptions]` entry with a
reason. If exemptions become common, the floor is wrong — that's the signal to
change it, not to normalize the hatch.

## The manifest

`problems/NNN-name/manifest.toml` declares: problem metadata (title,
difficulty, tags), `[languages]` with variants per language, `[exclusions]`
with a reason per absent language — `"help-wanted: ..."` invites a PR;
`"not-applicable: ..."` documents a structural mismatch — and `[complexity]`.
`glifex verify <problem>` checks declaration↔reality in both directions, then
runs every declared reference. CI runs it on every problem.

## Complexity claims

Worst-case **time and space are required** per declared variant, in whitelist
notation (`O(1)`, `O(log n)`, `O(sqrt(n))`, `O(n)`, `O(n log n)`, `O(n^2)`,
`O(n^3)`, `O(2^n)`, `O(n!)`). `[complexity.default.<variant>]` covers all
languages; `[complexity.<lang>.<variant>]` overrides. The verifier enforces
notation and the sanity ordering **optimized ≤ practice**. Θ/Ω and proof
sketches are optional and welcome in editorials.

Cost conventions are **LeetCode's**: expected-O(1) hashing, word-RAM integers,
comparison sort O(n log n). Divergences go in `notes`.

No tool can prove complexity (it's undecidable). Claims are verified by
triangulation: author derivation → LLM cross-check (ask for the adversarial
input that triggers the worst case) → the empirical falsifier (future
`glifex complexity`: fits growth curves on scaled inputs — it can **refute a
claim, never confirm one**) → reviewer sign-off.

## Originality and intellectual property

Problem statements must be **original prose you wrote**. Algorithmic ideas
are not copyrightable — a two-sum-shaped problem is fine — but *expression*
is: never copy statement text, examples, or constraint wording from LeetCode
or any other site. If a problem is inspired by a well-known one, say so in a
comment or the editorial; write every visible word yourself. PRs with
recognizably copied text will be closed.

## Test-case minimum

Every problem ships **at least 6 test cases** (enforced by `glifex verify`),
and reviewers check that they include the edge classes that actually break
naive solutions: empty/minimal input, single element, duplicate values,
negative numbers where the domain allows, and answers at boundaries. A happy
path plus five variations of it does not count.

## Conventions

Trees and linked lists use LeetCode's level-order-with-nulls JSON convention
(`[3,9,20,null,null,15,7]`). Builder helpers per floor language — and the C
kit (`kit.h`: dynamic array, hash map, binary heap) — are **planned
prerequisites for corpus growth** into map/tree/graph territory; until they
land, prefer problems tractable with each language's raw toolkit.

## Roadmap items this policy anticipates

Per-problem input **generators** (with adversarial modes) in the manifest,
feeding both the empirical falsifier and **cross-language differential
testing** (all languages vs the Python `clean` oracle on thousands of random
inputs) — the flagship correctness investment. Lean proofs remain a future
content track, never CI authority.
