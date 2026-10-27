"""Makes the `maxLevel` rows (Commlink6's `max` on a leveled item: a quality, adept power, metamagic, echo, design option,
dracogenesis power) for entries whose book text prints no maximum:

  python -m tools.cl6check.maxmap <runs dir> [--jar JAR] [--dry]

importer/sr6/overrides/<src>.json: one row `{"cl6", "cl6id", "kind", "id", "set": {"maxLevel"}, "gen": "max"}` for each
entry of `runs dir` (a library import or a folder of `importer sr6 check` runs) that a Commlink6 record matches, that
Commlink6 caps at 2..98 (`max` 99 is "no cap") and whose book text gave no maxLevel. Never perLevel: the book's own
perLevel (or none) stays, so no price changes; the entries that have a cap but no perLevel are listed for the owner.
An entry two records cap differently (and none named as it is) gets no row. Rows of an earlier run (`gen`) are
replaced; the rest of a table is left as it is. Read-only on the runs; no cl6check report is made."""

import json
import sys
from collections import defaultdict
from pathlib import Path

from importer.sr6.overrides.schema import allowed
from tools.cl6check import canon
from tools.cl6check.classmap import OVERRIDES

NO_CAP = 99  # (Commlink6's "unlimited")


def cap(rec):
    """The cap Commlink6 gives a record (2..98), else None."""
    m = rec["el"].get("max") or ""
    return int(m) if m.isdigit() and 2 <= int(m) < NO_CAP else None


def item_rows(pairs, made=frozenset()):
    """({src: [row]}, undecided, ambiguous, no_schema): a row for each matched entry without a book-printed maxLevel. made: the
    (src, kind, id) a row of an earlier run gave (their maxLevel is not the book's). undecided: entries two records cap
    differently; no_schema: [(src, id, cap)] entries of a kind whose schema has no maxLevel (no row: it
    would be dropped); ambiguous: [(src, id, name, cap, hasLevel)] entries given a cap but not perLevel (the owner rules).
    """
    got = defaultdict(dict)  # (src, kind, id) -> {cap: (record name, record id)}
    for c, o in pairs:
        if (n := cap(c)) and o["id"].startswith(o["src"] + "."):
            got[o["src"], o["kind"], o["id"]].setdefault(n, (c["name"], c["el"].get("id"), c["el"].get("hasLevel")))
    entries = {(o["src"], o["kind"], o["id"]): o for _, o in pairs}
    rows, undecided, ambiguous, no_schema = defaultdict(list), [], [], []
    for key, caps in sorted(got.items()):
        src, kind, oid = key
        o = entries[key]
        if o["attrs"].get("maxLevel") and key not in made:
            continue
        if (ok := allowed(kind)) is not None and "maxLevel" not in ok:
            no_schema.append((src, oid, sorted(caps)[0]))
            continue
        if len(caps) > 1:  # (records of several caps: the one named as the entry is)
            named = {n: v for n, v in caps.items() if v[0].casefold() == o["name"].casefold()}
            if len(named) != 1:
                undecided.append((src, oid, sorted(caps)))
                continue
            caps = named
        n, (name, cid, has_level) = next(iter(caps.items()))
        rows[src].append(
            {
                "cl6": name,
                "cl6id": cid,
                "kind": kind,
                "id": oid[len(src) + 1 :],
                "set": {"maxLevel": str(n)},
                "gen": "max",
            }
        )
        if o["attrs"].get("perLevel") != "true":
            ambiguous.append((src, oid, name, n, has_level == "true"))
    return rows, undecided, ambiguous, no_schema


def made_ids(root=OVERRIDES):
    """{(src, kind, "<src>.<id>")} of the rows an earlier run made."""
    return {
        (p.stem, r["kind"], f"{p.stem}.{r['id']}")
        for p in Path(root).glob("*.json")
        for r in json.loads(p.read_text(encoding="utf8"))
        if r.get("gen") == "max"
    }


def write_rows(rows, root=OVERRIDES):
    """Each table keeps its other rows; the generated ones are the new ones. {src: rows written}."""
    done = {}
    for src in sorted({p.stem for p in Path(root).glob("*.json")} | set(rows)):
        path = Path(root) / f"{src}.json"
        old = json.loads(path.read_text(encoding="utf8")) if path.is_file() else []
        keep = [r for r in old if r.get("gen") != "max"]
        new = rows.get(src, [])
        if len(keep) != len(old) or new:
            lines = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in keep + new)
            path.write_text("[\n" + lines + "\n]\n" if keep or new else "[]\n", encoding="utf8", newline="\n")
        done[src] = len(new)
    return done


def main(argv):
    """Command line entry: the maxLevel rows for a library import and a Commlink6 jar."""
    args = [a for a in argv if not a.startswith("--")]
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    if not args:
        print(__doc__)
        return 2
    from tools.cl6check import ours, reader
    from tools.cl6check.__main__ import compare

    recs, _ = reader.read(reader.find_jar(jar if jar and not jar.startswith("--") else None))
    pairs = compare([canon.canonical(r) for r in recs], ours.load(args[0]), pdf=False)[2]
    rows, undecided, ambiguous, no_schema = item_rows(pairs, made_ids())
    print(
        f"maxLevel rows: {sum(map(len, rows.values()))}; undecided: {len(undecided)}; no perLevel: {len(ambiguous)}; "
        f"kind lacks maxLevel in its schema: {len(no_schema)}"
    )
    for n in no_schema:
        print("  schema lacks maxLevel", n)
    for u in undecided:
        print("  undecided", u)
    for a in ambiguous:
        print("  no perLevel (owner rules)", a)
    if "--dry" not in argv:
        print("rows per table:", write_rows(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
