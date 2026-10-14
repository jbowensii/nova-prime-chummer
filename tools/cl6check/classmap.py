"""Makes the data behind our `class` attribute (Commlink6's own TYPE/SUBTYPE, importer/sr6/classes.py):

  python -m tools.cl6check.classmap <category_class_map.csv> <runs dir> [--jar JAR] [--dry]

1. importer/sr6/classes/category_class.json: {kind: {category: class}} from the Eden-class study's category_class_map.csv
   (.extract/eden-class), the categories with status CLEAR (Commlink6 classes 90% of their matched items alike) and
   the majority class (`majority_cl6`, Commlink6's keys).
2. importer/sr6/overrides/<src>.json: one row `{"cl6", "kind", "id", "set": {"class"}, "gen": "class"}` for each entry
   of `runs dir` (a folder of `importer sr6 check` runs) that a Commlink6 record matches and whose class the category
   map doesn't give (a mixed category's items, an exception in a clear one). An entry two records class differently,
   and one no record matches, gets no row: we invent no class. Rows of an earlier run (`gen`) are replaced; the rest of a
   table is left as it is.
Read-only on the runs; no cl6check report is made."""
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

from tools.cl6check import canon

ROOT = Path(__file__).resolve().parents[2]
MAP = ROOT / "importer" / "sr6" / "classes" / "category_class.json"
OVERRIDES = ROOT / "importer" / "sr6" / "overrides"


def category_map(csv_path):
    """{kind: {category: class}} from the study's csv: CLEAR categories with a Commlink6 class."""
    out = defaultdict(dict)
    for r in csv.DictReader(open(csv_path, encoding="utf-8-sig")):
        if r["status"] == "CLEAR" and r["majority_cl6"] not in ("", "itemenhancement") and r["kind"] in canon.CLASS_KINDS:
            out[r["kind"]][r["category"]] = r["majority_cl6"]
    return {k: dict(sorted(v.items())) for k, v in sorted(out.items())}


def hand_ids(root=OVERRIDES):
    """{(src, kind, id)} of the class rows made by hand (no `gen`): the owner's decisions, which a run leaves as they are."""
    out = set()
    for p in Path(root).glob("*.json"):
        for r in json.loads(p.read_text(encoding="utf8")):
            if "id" in r and "class" in r.get("set", {}) and not r.get("gen"):
                out.add((p.stem, r["kind"], r["id"]))
    return out


def item_rows(pairs, cmap, hand=frozenset()):
    """({src: [row]}, conflicts, no_id): a row for each matched entry whose class the map doesn't give. Records with no
    class of their own (an item enhancement) and entries with a hand row are left out."""
    got = defaultdict(dict)
    for c, o in pairs:
        if o["kind"] in canon.CLASS_KINDS and c["cl6_class"]:
            got[(o["src"], o["kind"], o["id"])].setdefault(c["cl6_class"], c["name"])
    rows, conflicts, no_id = defaultdict(list), [], []
    entries = {(o["src"], o["kind"], o["id"]): o for _, o in pairs}
    for (src, kind, oid), classes in sorted(got.items()):
        o = entries[src, kind, oid]
        if len({k.casefold() for k in classes}) > 1:  # (records of several classes: the one named as the entry is)
            named = {k: n for k, n in classes.items() if n.casefold() == o["name"].casefold()}
            if len(named) != 1:
                conflicts.append((src, oid, sorted(classes)))
                continue
            classes = named
        cls, name = next(iter(classes.items()))
        if (cmap.get(kind, {}).get(o["attrs"].get("category") or (o["attrs"].get("type") if kind == "programs" else "") or "") or "").casefold() == cls.casefold():
            continue
        if not oid.startswith(src + "."):
            no_id.append((src, oid))
            continue
        if (src, kind, oid[len(src) + 1:]) in hand:
            continue
        rows[src].append({"cl6": name, "kind": kind, "id": oid[len(src) + 1:], "set": {"class": cls}, "gen": "class"})
    return rows, conflicts, no_id


def write_rows(rows, root=OVERRIDES):
    """Each table keeps its hand-made rows; the generated ones are the new ones. {src: rows written}."""
    done = {}
    for src in sorted({p.stem for p in Path(root).glob("*.json")} | set(rows)):
        path = Path(root) / f"{src}.json"
        old = json.loads(path.read_text(encoding="utf8")) if path.is_file() else []
        keep = [r for r in old if r.get("gen") != "class"]
        new = rows.get(src, [])
        if len(keep) != len(old) or new:
            lines = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in keep + new)
            path.write_text("[\n" + lines + "\n]\n" if keep or new else "[]\n", encoding="utf8", newline="\n")
        done[src] = len(new)
    return done


def main(argv):
    args = [a for a in argv if not a.startswith("--")]
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    if len(args) < 2:
        print(__doc__)
        return 2
    from tools.cl6check import ours, reader
    from tools.cl6check.__main__ import compare
    cmap = category_map(args[0])
    recs, _ = reader.read(reader.find_jar(jar if jar and not jar.startswith("--") else None))
    pairs = compare([canon.canonical(r) for r in recs], ours.load(args[1]), pdf=False)[2]
    rows, conflicts, no_id = item_rows(pairs, cmap, hand_ids())
    print(f"categories mapped: {sum(len(v) for v in cmap.values())}; item rows: {sum(map(len, rows.values()))}; "
          f"conflicts: {len(conflicts)}; ids not of their source: {len(no_id)}")
    for c in conflicts:
        print("  conflict", c)
    if "--dry" not in argv:
        MAP.parent.mkdir(exist_ok=True)
        MAP.write_text(json.dumps(cmap, indent=1, ensure_ascii=False) + "\n", encoding="utf8", newline="\n")
        print("rows per table:", write_rows(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
