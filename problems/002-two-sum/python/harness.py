#!/usr/bin/env python3
"""Generated harness — do not edit. Reads ../test_cases.json, runs a variant."""
import importlib, json, sys, time
from pathlib import Path

def main():
    variant = sys.argv[1] if len(sys.argv) > 1 else "practice"
    bench = "--bench" in sys.argv
    cases = json.loads((Path(__file__).parent.parent / "test_cases.json").read_text())
    solve = importlib.import_module(variant).solve
    if bench:
        n, best = 2000, float("inf")
        for _ in range(5):
            t = time.perf_counter_ns()
            for c in cases: solve(c["input"])
            best = min(best, (time.perf_counter_ns() - t) / max(1, len(cases)))
        print(f"  {variant}: ~{best:.0f} ns/case (coarse)"); return
    passed = 0
    for i, c in enumerate(cases):
        got, exp = solve(c["input"]), c["expected"]
        ok = got == exp; passed += ok
        print(f"  [{'PASS' if ok else 'FAIL'}] case {i}" + ("" if ok else f"  expected={exp!r} got={got!r}"))
    print(f"{passed}/{len(cases)} passed")
    sys.exit(0 if passed == len(cases) else 1)

if __name__ == "__main__":
    main()
