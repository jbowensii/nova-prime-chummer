"""The repeatable-qualities gate: every Commlink6 quality with multi="true" must be flagged `multi="true"` on ours.

  python -m tools.cl6check multi --ours <custom/sr6 dir or import runs> [--jar <jar>]

Prints Commlink6's multi count, how many matched one of our qualities, how many of those ours flags, and our flagged
qualities no Commlink6 multi record matched (extras: fine when the book's prose says so). Exit 1 on any miss. No jar:
skipped, exit 0. `favored_weapon_custom` is not a book quality and is ignored."""

import argparse
import sys
from collections import defaultdict

from tools.cl6check import canon, match, ours, reader

IGNORED = {"favored_weapon_custom"}


def check(recs, mine):
    """(cl6 multi records, [(record, [our entries])], misses, extras): misses are matched or unmatched records ours
    does not flag; extras are our flagged entries no multi record matched."""
    multi = [
        canon.canonical(r)
        for r in recs
        if r["tag"] == "quality" and r["attrs"].get("multi") == "true" and r["id"] not in IGNORED
    ]
    by_src = defaultdict(list)
    for c in multi:
        by_src[c["src"]].append(c)
    pairs, used = [], set()
    for src, cs in sorted(by_src.items()):
        entries = mine[src].entries if src in mine else []
        for c, hits, _ in match.match(cs, entries):
            pairs.append((c, hits))
            used.update(id(h) for h in hits)
    # a match whose own prose says "only once" (multi="false") is book-ruled, not a miss (owner ruling 2026-10-29)
    misses = [(c, hits) for c, hits in pairs if not any(h["attrs"].get("multi") in ("true", "false") for h in hits)]
    extras = [
        e
        for s in mine.values()
        for e in s.entries
        if e["kind"] == "qualities" and e["attrs"].get("multi") == "true" and id(e) not in used
    ]
    return multi, pairs, misses, extras


def main(argv):
    """The gate: print the counts and every miss; exit 1 on a miss."""
    p = argparse.ArgumentParser(prog="cl6check multi")
    p.add_argument("--ours", required=True)
    p.add_argument("--jar")
    a = p.parse_args(argv)
    jar = reader.find_jar(a.jar)
    if jar is None:
        print("cl6check multi: no Commlink6 jar: skipped.")
        return 0
    recs, _ = reader.read(jar)
    multi, pairs, misses, extras = check(recs, ours.load(a.ours))
    matched = [(c, h) for c, h in pairs if h]
    flagged = len(matched) - len([m for m in misses if m[1]])
    print(f"Commlink6 multi qualities {len(multi)}; matched to ours {len(matched)}; ours flagged {flagged}")
    for c, hits in misses:
        print(f"MISS {c['src']}.{c['id']} {c['name']!r}: " + (", ".join(h["id"] for h in hits) or "no match in ours"))
    print(f"ours-only extras {len(extras)}: " + "; ".join(f"{e['src']}.{e['id']}" for e in extras))
    return 1 if misses else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
