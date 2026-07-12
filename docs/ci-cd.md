# CI/CD pipeline

Full detail behind architecture.md's Decision 9 (search for "Decision 9" if
linking directly to it). This doc exists because the pipeline broke in
production once, in a way that looked correct at every individual step --
the failure was only visible in how the pieces fit together. Read this
before touching branch protection, `ci.yml`, or `pages.yml`.

## The incident

A PR with a real, broken solution (002-two-sum's `practice.js` returning an
empty array unconditionally) merged to `main` despite CI's `playground` job
failing, and Deploy Pages then shipped it to production. Nothing in the
individual job logs was wrong -- `playground` correctly showed red. The
failure was in how branch protection and the deploy trigger interpreted that
redness.

## Root cause 1 — a skipped required check satisfies branch protection

GitHub's branch protection blocks a merge on a **failed** required check. It
does **not** block on a **skipped** one -- skipped reads as "not applicable,"
not "didn't pass." Before the fix, only `e2e` was configured as a required
check. `e2e` declares `needs: [playground]`, so when `playground` failed,
`e2e` was never run at all -- it showed as skipped, which branch protection
treated as satisfied. The merge went through with a genuinely broken solution
in the codebase.

This is a general GitHub Actions trap, not specific to this repo: any
required check with a `needs:` dependency on a job that can fail is
vulnerable the same way, because a failure upstream skips it rather than
failing it.

### The fix — `ci-status-gate`

A single job in `ci.yml` that depends on every real job and is the only one
ever configured as a required check:

```yaml
ci-status-gate:
  needs: [lint, corpus, playground, e2e]
  if: always()
  runs-on: ubuntu-latest
  steps:
    - name: Fail if any required job did not succeed
      run: |
        # ...checks each dependency's result; exits 1 unless every one is 'success'
```

`if: always()` is load-bearing: without it, this job would itself be skipped
whenever an upstream dependency failed -- reintroducing the exact loophole it
exists to close. With it, the job always runs, inspects every dependency's
actual `result`, and explicitly fails unless all of them are `success`.
Skipped, cancelled, and failed dependencies are all treated as "not good
enough" -- only a genuine, uniform `success` passes.

`matrix` and `security` are deliberately excluded from `needs:` -- both are
currently disabled (`if: ${{ false }}`, a free-tier cost measure), so their
result is always `skipped` by design, not a real signal. Including them would
permanently block every merge. Re-add them to `ci-status-gate`'s `needs:` if
and when they're re-enabled.

**Deliberately no `name:` field on this job.** See "The naming gotcha" below
for why that matters and what happened when an earlier version of this fix
had one.

## Root cause 2 — Deploy Pages trusted `main`, not CI

`pages.yml` triggered on `push: { branches: [main] }` -- it ran the moment
anything landed on `main`, with zero knowledge of whether CI had passed,
failed, or even run yet. A merge that slipped past root cause 1 would deploy
unconditionally.

### The fix — gate on `workflow_run`

```yaml
on:
  workflow_run:
    workflows: ["CI"]   # must match ci.yml's `name:` field exactly
    branches: [main]
    if: ${{ github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success' }}
```

Deploy Pages now only fires after the `CI` workflow finishes on `main`, and
only proceeds if that workflow's overall `conclusion` is `success` -- an
allowlist, not a denylist: everything except a clean success is refused,
including `failure` and (correctly, now that `ci-status-gate` exists)
`skipped` states that used to slip through as merges. It checks out the
**exact commit CI tested** (`github.event.workflow_run.head_sha`), not
whatever `main` happens to be at deploy time, so a fast-follow push can't
cause CI's result to be applied to different code than it actually tested.
`workflow_dispatch` remains available for manual, deliberate re-deploys.

**A subtlety worth knowing:** when a downstream job is skipped because an
upstream one failed (root cause 1's exact mechanism), the *workflow's own*
overall `conclusion` is still `failure`, not `skipped` -- confirmed directly,
not assumed. This is what makes the `workflow_run` gate correctly block a
deploy even before `ci-status-gate` existed to catch the branch-protection
side of the same root cause.

## The naming gotcha (a real incident, not a hypothetical)

Branch protection's required-check configuration matches on the **exact
string a check reports itself as** -- which for a GitHub Actions job is its
`name:` field if one is set, or its bare job id (the YAML key) if not. These
are easy to conflate, because the job id is what's visible in the workflow
file and in `needs:` references, making it the natural thing to type when
configuring a required check by hand.

`ci-status-gate` originally had `name: CI status gate (required check)` --
a human-readable label, seemingly harmless. Branch protection was configured
with the literal string `ci-status-gate` (the job id, not the display name).
Result: the job ran, genuinely succeeded, every time -- and branch protection
sat on "Expected -- waiting for status to be reported" forever, because a
check reported under that exact string was never going to arrive. The fix
was to drop the `name:` field entirely, so the job reports under its own id
-- one string, everywhere: the YAML key, the Actions UI, and what belongs in
Settings → Branches.

**Takeaway:** if a required-check job ever needs a `name:` field for
readability, the string configured in Settings → Branches must match that
`name:` field exactly, not the job id. Simplest is to avoid the split
entirely, as `ci-status-gate` now does.

## Verification methodology

Each fix was proven by deliberately breaking something and confirming the
pipeline actually refused to let it through -- not by reasoning about the
YAML in isolation:

1. **Deploy Pages gate.** A PR bundling the `workflow_run` fix with a
   deliberate, clearly-marked breakage in an unrelated file. Confirmed: CI
   failed on `main` after merge, and Deploy Pages did not fire.
2. **Branch protection gate.** A second PR, on top of the first, adding
   nothing but a verification note -- relying on the breakage already
   present. Confirmed: the PR did not merge, because `ci-status-gate`
   correctly failed and branch protection correctly blocked it.
3. **The real fix.** The actual regression (a broken `practice.js`) fixed for
   real, as the first legitimate change to go through the now-fully-verified
   pipeline end to end: CI ran clean, `ci-status-gate` passed for real,
   branch protection allowed the merge because it was legitimately green, and
   Deploy Pages fired and shipped it.
4. **Confirmation.** Functional testing directly on the live site after
   deploy -- not just trusting that the pipeline reported success. (Checking
   the deployed commit hash against the page's own embedded version --
   `<meta name="glifex-commit">` in `web/index.html`, read by
   `web/wiring.js` -- is the more precise way to do this and was suggested
   at the time, but live functional testing is what actually happened and
   is what caught several real, separate bugs afterward.)

## What's required today

Settings → Branches, required status check: **`ci-status-gate`** only. Not
`e2e`, not any individual job -- those remain visible in PR checks but
enforce nothing on their own; `ci-status-gate` is the sole gate, and it
already accounts for all of them.

## Job graph (`ci.yml`)

`lint` + `corpus` → `playground` → `e2e` → `ci-status-gate` (needs all four,
`if: always()`). `matrix` and `security` exist in the file but are
`if: ${{ false }}` (free-tier cost measure) -- always skipped by design, not
included in `ci-status-gate`'s `needs:`. `CodeQL` runs as its own, separate
workflow, non-blocking. `pages.yml` runs after `CI` completes on `main`, via
`workflow_run`, gated on that workflow's overall `conclusion`.
