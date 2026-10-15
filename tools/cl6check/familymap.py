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


STRUCTURE = ("slots", "variants", "relevance", "flags", "modonly", "size/ammo", "effects", "requires", "choices")


def structure(rec):
    """({attribute: value}, [kid]) Commlink6's record gives for the item-structure families (docs/sr6-data-format.md, Item
    structure), in the books' words where it has keys (`MILITARY` -> `Military`)."""
    el, attrs = rec["el"], rec["attrs"]
    sets, kids = {}, []
    if attrs.get("modonly") in ("y", "yes", "true", "1") or attrs.get("modonly") is True:
        sets["modonly"] = "true"
    size, ammo = canon.attrdef(el, "WEAPON_SIZE")[0], canon.attrdef(el, "AMMUNITION_CLASS")[0]
    if size:
        sets["size"] = words(size.lower())
    if ammo:
        sets["ammoClass"] = words(ammo.lower())
    for m in canon._mods(el):
        if m.tag in ("valmod", "itemmod") and m.get("type") == "HOOK" and m.get("ref"):
            kids.append({"tag": "slot", "attrs": {"id": canon._norm(m.get("ref")), **({"value": m.get("value")} if m.get("value") else {})}})
        if m.tag == "relevancemod" and (m.get("topic") or "").strip():
            kids.append({"tag": "relevance", "attrs": {"topic": m.get("topic").strip().casefold()}})
    for u in canon._own(el, "usage"):
        if u.get("mode") == "EMBEDDED" and u.get("slot"):
            kids.append({"tag": "fits", "attrs": {"slot": canon._norm(u.get("slot"))}})
    names = rec.get("variants") or {}
    for v in canon._own(el, "variant"):
        kids.append({"tag": "variant", "attrs": {"name": names.get(v.get("id"), v.get("id"))}})
    for fl in canon._own(el, "flags"):
        for f in fl:
            if (f.text or "").strip():
                kids.append({"tag": "flag", "text": f.text.strip()})
    # Commlink6's own rule data, kept as it gives it (never applied by the app): its modifications, prerequisites and picks
    raw = lambda x: {k: v for k, v in x.attrib.items() if k != "uuid"}  # noqa: E731
    for m in canon._mods(el):
        if m.tag in ("valmod", "checkmod", "itemmod", "allowmod") and m.get("type") != "HOOK":
            kids.append({"tag": "modifier", "attrs": {"kind": m.tag, **raw(m)}})
    for rq in canon._own(el, "requires"):
        for q in rq.iter():
            if q.tag in ("datareq", "valuereq"):
                kids.append({"tag": "prerequisite", "attrs": {"kind": q.tag, **raw(q)}})
    for cs in canon._own(el, "choices"):
        for ch in cs:
            if ch.tag == "choice" and (ch.get("ref") or "").upper() not in canon.RATING_REFS:
                kids.append({"tag": "selection", "attrs": raw(ch)})
    seen, out = set(), []
    for k in kids:
        key = json.dumps(k, sort_keys=True)
        if key not in seen:
            seen.add(key)
            out.append(k)
    return sets, out


def main(argv):
    dry = "--dry" in argv
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    paths = [a for a in argv if not a.startswith("--") and a != jar]  # (a later csv, of a run on the rows so far, adds the entries the first did not list)
    recs, _ = reader.read(reader.find_jar(jar))
    by = {}  # ((source, kind), id): records of two types may share an id (the Cyberdeck item, a licence type)
    for r in recs:
        c = canon.canonical(r)
        by.setdefault((c["src"], c["kind"], r["id"].lower()), r)
    groups = defaultdict(dict)
    skipped = defaultdict(int)
    rows_all = [r for path in paths for r in csv.DictReader(open(path, encoding="utf-8-sig", newline=""))]
    for r in rows_all:
        if r["row"] != "family" or r["status"] != "counted" or r["field"] not in ("skill/spec", "social", *STRUCTURE):
            continue
        if not r["our_id"]:
            continue  # (a record no entry of ours matches: the missing row)
        rec = by.get((r["src"], r["kind"], r["cl6_id"].lower()))
        if r["field"] in STRUCTURE:
            if rec:
                sets, kids = structure(rec)
                g = groups[r["src"], r["kind"], (r["our_id"].partition(".")[2] or r["our_id"])]
                g.update(sets, _cl6=rec["name"])
                g["_kids"] = [*g.get("_kids", []), *[k for k in kids if k not in g.get("_kids", [])]]
            continue
        if r["kind"] not in (("weapons", "gear") if r["field"] == "skill/spec" else ("armor",)):
            skipped[r["kind"], r["field"]] += 1
            continue
        v = values(rec["el"], r["field"]) if rec else {}
        if v:
            groups[r["src"], r["kind"], (r["our_id"].partition(".")[2] or r["our_id"])].update(v, _cl6=rec["name"])
    new = defaultdict(list)
    for (src, kind, oid), v in sorted(groups.items()):
        name, kids = v.pop("_cl6"), v.pop("_kids", [])
        if v or kids:
            new[src].append({"cl6": name, "kind": kind, "id": oid, **({"set": v} if v else {}), **({"kids": kids} if kids else {}), "gen": "family"})
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
