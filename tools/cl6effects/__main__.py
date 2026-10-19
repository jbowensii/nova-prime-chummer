"""Effects parity replay: rebuild the saved import runs with a tree's importer, then count how many of Commlink6's modifications our
effects carry (strict match, book-ruled, accepted placeholder). Run it on main and on a branch before merging a change to
importer/sr6/effects.py or importer/sr6/overrides/*.book.json; both must read 1,079/1,079 with no unmatched drops. See docs/cl6check.md.

  python -m tools.cl6effects --tree <code tree> [--base <tree>] [--runs <saved runs>] [--out <dir>] [--jar <jar>]
"""
import argparse
import collections
import glob
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from xml.sax.saxutils import unescape

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(REPO))

from tools.cl6check import canon, reader  # noqa: E402
from tools.cl6effects import evaluate, pairs  # noqa: E402


def rebuild(tree, runs, out):
    """Rebuild the runs with `tree`'s importer in its own process -> the count of "drop matches no effect" warnings."""
    p = subprocess.run([sys.executable, "-W", "ignore", str(HERE / "rebuild.py"), str(tree), str(runs), str(out)],
                       cwd=tree, capture_output=True, text=True, encoding="utf-8", errors="replace")
    sys.stdout.write(p.stdout)
    if p.returncode:
        sys.exit(f"rebuild with {tree} failed:\n{p.stderr[-3000:]}")
    return sum("matches no effect" in l for l in p.stderr.splitlines())


def measure(recs, out):
    rows, idx = pairs.build([canon.canonical(r) for r in recs], str(out))
    ev = evaluate.eval_all(rows, idx)
    return evaluate.tally(ev), ev


def sig(e):
    return (e["final"] if "final" in e else e["status"], e["status"], tuple(sorted(e.get("ours", []))))


def differing(ev_base, ev_tree):
    """Every CL6 row (entry, effect) whose status differs between the two runs -> [(row, base statuses, tree statuses)]."""
    key = lambda e: (tuple(e["pair"]), e["sig"], str(e.get("value")), e.get("bucket"))
    a, b = collections.defaultdict(list), collections.defaultdict(list)
    for e in ev_base:
        a[key(e)].append(sig(e))
    for e in ev_tree:
        b[key(e)].append(sig(e))
    return [(k, sorted(a.get(k, [])), sorted(b.get(k, []))) for k in sorted(set(a) | set(b), key=str) if sorted(a.get(k, [])) != sorted(b.get(k, []))]


def book_rows(tree):
    """{(recipe id, kind, entry id): row} of the "gen": "book" correction rows of `tree`."""
    out = {}
    for f in glob.glob(os.path.join(tree, "importer", "sr6", "overrides", "*.book.json")):
        stem = os.path.basename(f)[: -len(".book.json")]
        for r in json.load(open(f, encoding="utf-8")):
            if r.get("gen") == "book":
                out[(stem, r["kind"], r["id"])] = r
    return out


def entry_effects(out, stem, kind, eid):
    """The (target, op, value) of every effect the rebuilt runs carry on entry `stem.eid` of file `kind` (any run), or None when no run has the entry."""
    found, fx = False, set()
    for f in glob.glob(os.path.join(out, "*", "custom", "sr6", "imported", stem, kind + ".xml")):
        m = re.search(r'<(\w+) id="' + re.escape(f"{stem}.{eid}") + r'"[^>]*?(?:/>|>.*?</\1>)', open(f, encoding="utf-8").read(), re.S)
        if m:
            found = True
            for a in re.findall(r"<effect ([^>]*)/>", m.group(0)):
                d = {k: unescape(v, {"&quot;": '"'}) for k, v in re.findall(r'(\w+)="([^"]*)"', a)}
                fx.add((d.get("target"), d.get("op"), d.get("value")))
    return fx if found else None


def retired(base, tree, out):
    """Correction rows `base` has and `tree` has not, whose effects are missing from the tree's rebuilt output -> [(key, missing effects, why)]."""
    gone = {k: r for k, r in book_rows(base).items() if k not in book_rows(tree)}
    res = []
    for (stem, kind, eid), r in sorted(gone.items()):
        want = [(e.get("target"), e["op"], e.get("value")) for e in r.get("effects", []) if not e.get("keep")]
        have = entry_effects(out, stem, kind, eid)
        miss = [w for w in want if have is None or w not in have]
        if miss:
            res.append(((stem, kind, eid), miss, r.get("why", ""), have is None))
    return res, len(gone)


def report(label, t, warns):
    print(f"== {label}")
    for l in evaluate.lines(t):
        print("  " + l)
    print(f"  override warnings, \"drop matches no effect\": {warns}")


def main(argv=None):
    p = argparse.ArgumentParser(prog="cl6effects", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--tree", required=True, help="the code tree (a checkout or an archive of one) whose importer rebuilds the runs")
    p.add_argument("--base", help="a second tree: run both, print every row whose status differs and the correction rows only the base has")
    p.add_argument("--runs", default=os.environ.get("CL6_RUNS") or str(REPO / ".extract" / "cl6check-runs14"), help="the saved import runs (default .extract/cl6check-runs14, or $CL6_RUNS)")
    p.add_argument("--out", default=str(REPO / ".extract" / "cl6effects"), help="where the rebuilt runs go (one folder per tree)")
    p.add_argument("--jar")
    a = p.parse_args(argv)
    jar = reader.find_jar(a.jar)
    if jar is None:
        print("cl6effects: no Commlink6 jar (--jar or $CL6_JAR): nothing to measure, skipped.")
        return 0
    if not os.path.isdir(a.runs):
        print(f"cl6effects: --runs {a.runs} is not a folder of saved import runs.", file=sys.stderr)
        return 2
    recs, _ = reader.read(jar)
    done = {}
    for label, tree in (("tree", a.tree), ("base", a.base)):
        if not tree:
            continue
        tree, out = os.path.abspath(tree), os.path.join(a.out, label)
        warns = rebuild(tree, a.runs, out)
        done[label] = (tree, out) + measure(recs, out)
        report(f"{label}: {tree}", done[label][2], warns)
    if "base" in done:
        diff = differing(done["base"][3], done["tree"][3])
        print(f"== rows whose status differs, base -> tree: {len(diff)}")
        for k, before, after in diff:
            print(f"  {k[0]} | {k[1]} | CL6 {k[2]}\n    base: {before}\n    tree: {after}")
        miss, n = retired(done["base"][0], done["tree"][0], done["tree"][1])
        print(f"== correction rows (gen=book) only the base has: {n}; with effects missing from the tree's import: {len(miss)}")
        for key, effects, why, nothere in miss:
            print(f"  {'/'.join(key)}{' (entry absent)' if nothere else ''}: missing {effects}\n    {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
