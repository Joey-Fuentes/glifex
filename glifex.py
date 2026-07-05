#!/usr/bin/env python3
"""
Glifex — polyglot algorithm & database practice/benchmark engine.

One CLI, driven entirely by the plugin registry in languages/*.toml.
Adding a language is a plugin file, never an edit to this runner.

Usage:
    glifex test   <problem> [language] [variant]   # correctness (default variant: practice)
    glifex run    <problem> <language> [variant]    # run a variant, print its output
    glifex bench  <problem> <language> [variant]    # coarse timing (see STATUS.md)
    glifex new    <problem>                          # scaffold an algorithm problem
    glifex new-db <problem>                          # scaffold a database problem
    glifex reveal <problem> <language> [variant]     # reveal a hidden reference solution
    glifex doctor                                    # toolchain ✓/✗ matrix
    glifex db test <problem>                         # run a database problem (SQLite offline / Postgres hosted)
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path

# Windows consoles default to cp1252, which can't print ✓/✗/− — force UTF-8.
for _stream in (sys.stdout, sys.stderr):
    if _stream and hasattr(_stream, "reconfigure"):
        try:
            _stream.reconfigure(encoding="utf-8", line_buffering=True)
        except Exception:
            pass

ROOT = Path(__file__).resolve().parent
LANG_DIR = ROOT / "languages"
TPL_DIR = LANG_DIR / "templates"
PROBLEMS = ROOT / "problems"
PROBLEMS_DB = ROOT / "problems-db"

VARIANTS = ("practice", "clean", "optimized")
HIDDEN = ("clean", "optimized", "brute_force")


# ─── colours (skipped when not a TTY) ───────────────────────────────
def _c(code: str, s: str) -> str:
    return s if not sys.stdout.isatty() else f"\033[{code}m{s}\033[0m"


def green(s):
    return _c("32", s)


def red(s):
    return _c("31", s)


def dim(s):
    return _c("2", s)


def bold(s):
    return _c("1", s)


# ─── plugin registry ────────────────────────────────────────────────
def load_languages() -> dict[str, dict]:
    langs = {}
    if not LANG_DIR.exists():
        return langs
    for f in sorted(LANG_DIR.glob("*.toml")):
        with open(f, "rb") as fh:
            data = tomllib.load(fh)
        langs[data["name"]] = data
    return langs


def resolve_problem(name: str, db: bool = False) -> Path:
    base = PROBLEMS_DB if db else PROBLEMS
    p = base / name
    if p.is_dir():
        return p
    # allow prefix match: "001" -> "001-anagram-detection"
    matches = [d for d in base.glob(f"{name}*") if d.is_dir()]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        sys.exit(red(f"No problem matching '{name}' in {base.name}/"))
    sys.exit(red(f"Ambiguous problem '{name}': {[m.name for m in matches]}"))


# ─── command runner ─────────────────────────────────────────────────
def run_cmd(cmd: str, cwd: Path, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        cwd=cwd,
        shell=True,
        text=True,
        capture_output=capture,
    )


# ─── doctor ─────────────────────────────────────────────────────────
def cmd_doctor(args):
    langs = load_languages()
    print(bold("\nGlifex toolchain check\n"))
    ok = 0
    for name, spec in langs.items():
        detect = spec.get("detect")
        found = False
        version = ""
        if detect:
            exe = detect.split()[0]
            if shutil.which(exe):
                r = run_cmd(detect, ROOT, capture=True)
                found = r.returncode == 0
                version = (r.stdout or r.stderr or "").strip().splitlines()[0] if found else ""
        if found and not _arch_ok(spec):
            print(
                f"  {dim('−')}  {name:<12} {dim('toolchain present but needs ' + spec['arch'] + ' hardware — will skip')}"
            )
            continue
        mark = green("✓") if found else red("✗")
        ok += found
        hint = "" if found else dim(f"  → install: {spec.get('install_hint', 'see README')}")
        print(f"  {mark}  {name:<12} {dim(version)}{hint}")
    # database engines
    print()
    print(f"  {green('✓')}  {'db:sqlite':<12} {dim('python stdlib (offline engine)')}")
    pg = shutil.which("psql") or shutil.which("docker")
    mark = green("✓") if pg else red("✗")
    print(f"  {mark}  {'db:postgres':<12} {dim('docker or psql (hosted engine)')}")
    print(f"\n{ok}/{len(langs)} language toolchains present.\n")


# ─── test / run / bench (algorithm track) ───────────────────────────
def _build_cmd(spec: dict, key: str, variant: str) -> str | None:
    tpl = spec.get(key)
    if not tpl:
        return None
    return tpl.replace("{variant}", variant)


def _arch_ok(spec: dict) -> bool:
    import platform

    want = spec.get("arch")
    if not want:
        return True
    have = platform.machine().lower()
    aliases = {"amd64": "x86_64", "arm64": "aarch64"}
    return aliases.get(have, have) == aliases.get(want.lower(), want.lower())


def _run_variant(prob: Path, name: str, spec: dict, variant: str, mode: str) -> bool:
    langdir = prob / name
    if not langdir.is_dir():
        print(dim(f"  {name}: no {name}/ folder in this problem — skipping"))
        return True
    if not _arch_ok(spec):
        print(dim(f"  {name}: requires {spec['arch']} (this machine isn't) — skipping"))
        return True
    exe = (spec.get("detect") or "x").split()[0]
    if not shutil.which(exe):
        print(dim(f"  {name}: toolchain not installed — skipping (run `glifex doctor`)"))
        return True
    key = {"test": "test_cmd", "run": "run_cmd", "bench": "bench_cmd"}[mode]
    cmd = _build_cmd(spec, key, variant) or _build_cmd(spec, "test_cmd", variant)
    r = run_cmd(cmd, langdir)
    return r.returncode == 0


def cmd_test(args):
    prob = resolve_problem(args.problem)
    langs = load_languages()
    variant = args.variant or "practice"
    targets = [args.language] if args.language else list(langs.keys())
    print(bold(f"\n{prob.name}  ·  variant={variant}\n"))
    results = {}
    for name in targets:
        if name not in langs:
            print(red(f"  unknown language '{name}'"))
            continue
        print(dim(f"── {name} ──"))
        results[name] = _run_variant(prob, name, langs[name], variant, "test")
    print()
    passed = sum(1 for v in results.values() if v)
    line = f"{passed}/{len(results)} languages passed"
    print(green(line) if passed == len(results) else red(line))
    sys.exit(0 if passed == len(results) else 1)


def cmd_run(args):
    prob = resolve_problem(args.problem)
    langs = load_languages()
    if args.language not in langs:
        sys.exit(red(f"unknown language '{args.language}'"))
    _run_variant(prob, args.language, langs[args.language], args.variant or "practice", "run")


def cmd_bench(args):
    prob = resolve_problem(args.problem)
    langs = load_languages()
    if args.language not in langs:
        sys.exit(red(f"unknown language '{args.language}'"))
    print(dim("bench here is coarse in-harness timing; see STATUS.md for real-tool delegation."))
    _run_variant(prob, args.language, langs[args.language], args.variant or "optimized", "bench")


# ─── database track ─────────────────────────────────────────────────
def cmd_db_test(args):
    import sqlite3

    prob = resolve_problem(args.problem, db=True)
    schema = (prob / "schema.sql").read_text()
    seed = (prob / "seed.sql").read_text()
    variant = args.variant or "practice"
    qfile = prob / (f"{variant}.sql" if variant == "practice" else f".solutions/{variant}.sql")
    if not qfile.exists():
        sys.exit(red(f"no query file {qfile}"))
    query = qfile.read_text()
    exp = json.loads((prob / "expected.json").read_text())
    ordered = exp.get("ordered", False)
    expected_rows = [list(r) for r in exp["rows"]]

    print(bold(f"\n{prob.name}  ·  engine=sqlite (offline)  ·  variant={variant}\n"))
    con = sqlite3.connect(":memory:")
    try:
        con.executescript(schema)
        con.executescript(seed)
        cur = con.execute(query)
        got = [list(r) for r in cur.fetchall()]
    except Exception as e:
        sys.exit(red(f"query error: {e}"))
    finally:
        con.close()

    a, b = (got, expected_rows) if ordered else (sorted(map(str, got)), sorted(map(str, expected_rows)))
    if a == b:
        print(green(f"  ✓ PASS  ({len(got)} rows, ordered={ordered})\n"))
        sys.exit(0)
    print(red("  ✗ FAIL"))
    print(dim(f"    expected: {expected_rows}"))
    print(dim(f"    got:      {got}\n"))
    sys.exit(1)


def cmd_db_bench(args):
    """EXPLAIN-based plan comparison: the honest benchmark for SQL."""
    import sqlite3

    prob = resolve_problem(args.problem, db=True)
    schema = (prob / "schema.sql").read_text()
    seed = (prob / "seed.sql").read_text()

    def plan(sql: str) -> list[str]:
        con = sqlite3.connect(":memory:")
        try:
            con.executescript(schema)
            con.executescript(seed)
            return [r[3] for r in con.execute("EXPLAIN QUERY PLAN " + sql)]
        finally:
            con.close()

    print(bold(f"\n{prob.name}  ·  query-plan comparison (sqlite EXPLAIN)\n"))
    print(dim("On hosted Postgres this uses EXPLAIN ANALYZE; offline sqlite shows plan shape."))
    for variant in ("practice", "clean", "optimized"):
        qfile = prob / ("practice.sql" if variant == "practice" else f".solutions/{variant}.sql")
        if not qfile.exists():
            continue
        sql = qfile.read_text()
        try:
            steps = plan(sql)
        except Exception as e:
            print(red(f"  {variant}: query error: {e}"))
            continue
        print(f"\n  {bold(variant)}:")
        for s in steps:
            flag = red("  ← full scan") if s.startswith("SCAN") and "USING" not in s else ""
            print(f"    {s}{flag}")
    print(
        dim(
            "\nSCAN = walks every row; SEARCH ... USING INDEX = uses an index. "
            "The optimized query should SEARCH where practice SCANs.\n"
        )
    )


# ─── scaffolding ────────────────────────────────────────────────────
def _tpl(name: str) -> str:
    f = TPL_DIR / name
    return f.read_text() if f.exists() else ""


def cmd_new(args):
    langs = load_languages()
    prob = PROBLEMS / args.problem
    if prob.exists():
        sys.exit(red(f"{prob} already exists"))
    prob.mkdir(parents=True)
    (prob / "problem.md").write_text(
        f"# {args.problem}\n\n## Task\n\n_Describe the problem._\n\n## Signature\n\n`solve(input) -> output`\n"
    )
    (prob / "test_cases.json").write_text('[\n  { "input": {}, "expected": null }\n]\n')
    made = 0
    for name, spec in langs.items():
        if spec.get("scaffold") is False:
            continue  # special languages (asm, wat) are added per-problem by hand
        made += 1
        d = prob / name
        d.mkdir()
        spec["extension"]
        harness_tpl = spec.get("harness_template", "")
        if harness_tpl:
            (d / Path(harness_tpl).name).write_text(_tpl(harness_tpl))
        for sf in spec.get("support_files", []):
            (d / sf).write_text(_tpl(sf))
        pf = spec["practice_file"]  # "practice.py" or "Practice.java"
        cap = pf[0].isupper()
        for v in VARIANTS:
            target = v.capitalize() if cap else v
            fname = target + pf[len("practice") :]  # swap the 8-char stem, keep extension
            stub = spec.get("stub", "// TODO\n").replace("{variant}", v).replace("{Variant}", v.capitalize())
            (d / fname).write_text(stub)
    print(green(f"scaffolded {prob.relative_to(ROOT)} in {made} languages"))


def cmd_new_db(args):
    prob = PROBLEMS_DB / args.problem
    if prob.exists():
        sys.exit(red(f"{prob} already exists"))
    (prob / ".solutions").mkdir(parents=True)
    (prob / "problem.md").write_text(f"# {args.problem}\n\n## Task\n\n_Describe the query._\n\n_Order matters:_ no\n")
    (prob / "schema.sql").write_text("-- CREATE TABLE ...\n")
    (prob / "seed.sql").write_text("-- INSERT ...\n")
    (prob / "expected.json").write_text('{ "ordered": false, "rows": [] }\n')
    (prob / "practice.sql").write_text("-- write your query here\n")
    (prob / ".solutions" / "clean.sql").write_text("-- reference\n")
    (prob / ".solutions" / "optimized.sql").write_text("-- reference\n")
    print(green(f"scaffolded {prob.relative_to(ROOT)}"))


def cmd_reveal(args):
    # Algorithm track wins if any problems/ entry matches; else database track.
    algo_matches = [d for d in PROBLEMS.glob(f"{args.problem}*") if d.is_dir()]
    db = not algo_matches
    prob = resolve_problem(args.problem, db=db)
    variant = args.variant or "clean"
    if db:
        f = prob / ".solutions" / f"{variant}.sql"
    else:
        langs = load_languages()
        spec = langs.get(args.language)
        if not spec:
            sys.exit(red(f"unknown language '{args.language}'"))
        f = prob / args.language / spec["practice_file"].replace("practice", variant)
    if not f.exists():
        sys.exit(red(f"no such reference: {f}"))
    print(bold(f"\n{variant} reference:\n"))
    print(f.read_text())
    print(dim(f"\nOpen side-by-side in VS Code:  code -r {f}\n"))


# ─── argparse ───────────────────────────────────────────────────────
def main():
    p = argparse.ArgumentParser(prog="glifex", description="Polyglot algorithm & database practice engine.")
    sub = p.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("test")
    t.add_argument("problem")
    t.add_argument("language", nargs="?")
    t.add_argument("variant", nargs="?")
    t.set_defaults(fn=cmd_test)
    r = sub.add_parser("run")
    r.add_argument("problem")
    r.add_argument("language")
    r.add_argument("variant", nargs="?")
    r.set_defaults(fn=cmd_run)
    b = sub.add_parser("bench")
    b.add_argument("problem")
    b.add_argument("language")
    b.add_argument("variant", nargs="?")
    b.set_defaults(fn=cmd_bench)
    n = sub.add_parser("new")
    n.add_argument("problem")
    n.set_defaults(fn=cmd_new)
    nd = sub.add_parser("new-db")
    nd.add_argument("problem")
    nd.set_defaults(fn=cmd_new_db)
    rv = sub.add_parser("reveal")
    rv.add_argument("problem")
    rv.add_argument("language", nargs="?")
    rv.add_argument("variant", nargs="?")
    rv.set_defaults(fn=cmd_reveal)
    sub.add_parser("doctor").set_defaults(fn=cmd_doctor)

    db = sub.add_parser("db")
    dbsub = db.add_subparsers(dest="dbcmd", required=True)
    dbt = dbsub.add_parser("test")
    dbt.add_argument("problem")
    dbt.add_argument("variant", nargs="?")
    dbt.set_defaults(fn=cmd_db_test)
    dbb = dbsub.add_parser("bench")
    dbb.add_argument("problem")
    dbb.set_defaults(fn=cmd_db_bench)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
