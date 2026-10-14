"""Makes the structured-data rows of importer/sr6/overrides/<src>.json that the catalog schema models, from cl6-diffs.csv
and the Commlink6 jar (owner decision 2026-10-13: where we have no data and the books gave us nothing, Commlink6's value):

  python -m tools.cl6check.familymap <cl6-diffs.csv> [--jar JAR] [--dry]

- skill/spec: a weapon's `skill` and `spec` attributes (Commlink6's keys in the books' words: `firearms/pistols_light`
  -> `Firearms`, `Pistols Light`);
- social: an armor's `social` attribute (`–2`, the books' en dash).
The other families (slots, variants, relevance, flags, modonly, size/ammo: elements and attributes the data schema does not
have; choices, requires, effects: a Commlink6 modification has no one-to-one `<effect>`) are not written; see
docs/reviews. Rows of an earlier run (`gen`: family) are replaced. Names and keys only."""
import csv
import json
import sys
from collections import defaultdict

from tools.cl6check import canon, reader
from tools.cl6check.valuemap import OVERRIDES


def words(key):
    return " ".join(w.capitalize() for w in key.split("_"))


def values(el, field):
    """{attribute: value} Commlink6's record gives for a family, or {}."""
    if field == "skill/spec":
        w = next(iter(canon._own(el, "weapon")), None)
        if w is None or not w.get("skill"):
            return {}
        out = {"skill": words(w.get("skill"))}
        spec = (w.get("spec") or "").split("/")[-1]
        if spec:
            out["spec"] = words(spec)
        return out
    a = next(iter(canon._own(el, "armor")), None)
    s = (a.get("social") if a is not None else "") or ""
    return {"social": s.replace("-", "–")} if s else {}


def main(argv):
    dry = "--dry" in argv
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    path = next(a for a in argv if not a.startswith("--") and a != jar)
    recs, _ = reader.read(reader.find_jar(jar))
    by = {r["id"].lower(): r for r in recs}
    groups = defaultdict(dict)
    skipped = defaultdict(int)
    for r in csv.DictReader(open(path, encoding="utf-8-sig", newline="")):
        if r["row"] != "family" or r["status"] != "counted" or r["field"] not in ("skill/spec", "social"):
            continue
        if not r["our_id"]:
            continue  # (a record no entry of ours matches: the missing row)
        if r["kind"] not in ("weapons", "armor"):
            skipped[r["kind"], r["field"]] += 1  # (the schema gives a gear entry no skill)
            continue
        rec = by.get(r["cl6_id"].lower())
        v = values(rec["el"], r["field"]) if rec else {}
        if v:
            groups[r["src"], r["kind"], r["our_id"].split(".", 1)[1]].update(v, _cl6=rec["name"])
    new = defaultdict(list)
    for (src, kind, oid), v in sorted(groups.items()):
        name = v.pop("_cl6")
        new[src].append({"cl6": name, "kind": kind, "id": oid, "set": v, "gen": "family"})
    print(f"{sum(map(len, new.values()))} entries in {len(new)} tables; left out: {dict(skipped)}")
    if dry:
        return
    for p in OVERRIDES.glob("*.json"):
        if any(r.get("gen") == "family" for r in json.loads(p.read_text(encoding="utf8"))):
            new.setdefault(p.stem, [])
    for src, rows in new.items():
        p = OVERRIDES / f"{src}.json"
        old = json.loads(p.read_text(encoding="utf8")) if p.exists() else []
        out = [r for r in old if r.get("gen") != "family"] + rows
        p.write_text("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out) + "\n]\n", encoding="utf8")


if __name__ == "__main__":
    main(sys.argv[1:])
