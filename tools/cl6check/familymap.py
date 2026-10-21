"""Makes the structured-data rows of importer/sr6/overrides/<src>.json that the catalog schema models, from cl6-diffs.csv
and the Commlink6 jar (owner decision 2026-10-13: where we have no data and the books gave us nothing, Commlink6's value):

  python -m tools.cl6check.familymap <cl6-diffs.csv> [--jar JAR] [--runs <runs dir>] [--variants] [--dry]

Commlink6's records are keyed (src, kind, id) as the comparer does. With --runs (our catalogs) a row names OUR entry's kind and the
earlier family rows still valid are kept and widened (a row that landed is no longer a csv difference); stale ones go.

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

from importer.sr6.overrides import fit
from tools.cl6check import canon, ours, reader
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
    """({attribute: value}, [kid]) Commlink6's record gives for the item-structure families (docs/sr6-data-format/kinds.md, Item
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


def merge(old, new, idx, src, variants=False):
    """src's table rows: the hand rows and other generators' rows as they are; the family rows of an earlier run kept
    (a row that landed is no longer a difference in the csv, so the csv alone never has it again) unless no entry of ours
    has its id any more (a rename), each filed under OUR entry's kind and widened by a new row of the same entry.
    a row's old values win (they were reviewed). <variant> kids stay where the old row already landed them; elsewhere none
    on an entry whose name carries a variant (one item per variant) and, until the owner decides (variants=True,
    `--variants`), none at all."""
    rows, landed, held = {}, set(), ours.kinds(idx)
    filed = {(x["kind"], x["id"]) for x in old if x.get("gen") == "family"}
    for r in old:
        k = ours.kind_of(held, src, f"{src}.{r['id']}", r["kind"]) if r.get("gen") == "family" else None
        if k and (k == r["kind"] or (k, r["id"]) not in filed):  # (a row refiled onto one the kind file already has: dropped)
            rows[k, r["id"]] = {**r, "kind": k}
            if r["kind"] == k:
                landed.add((k, r["id"]))
    for r in new:
        o = rows.get((r["kind"], r["id"]))
        if o:
            r = {**o, **r, "set": {**r.get("set", {}), **o.get("set", {})}, "kids": [*o.get("kids", []), *[k for k in r.get("kids", []) if k not in o.get("kids", [])]]}
            r = {k: v for k, v in r.items() if v or k in ("cl6", "kind", "id", "gen")}
        rows[r["kind"], r["id"]] = r
    for i, r in list(rows.items()):
        names = [k["attrs"]["name"] for k in r.get("kids", []) if k["tag"] == "variant"]
        if names and i not in landed and (ours.carries(idx.get((src, i[0], f"{src}.{i[1]}"), {}).get("name", ""), names) or not variants):
            kids = [k for k in r["kids"] if k["tag"] != "variant"]
            rows[i] = {k: v for k, v in {**r, "kids": kids}.items() if v or k != "kids"}
            if not (rows[i].get("set") or kids):
                del rows[i]
    return [r for r in old if r.get("gen") != "family"] + fit(list(rows.values()))


def main(argv):
    dry = "--dry" in argv
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    runs = argv[argv.index("--runs") + 1] if "--runs" in argv else None  # (our catalogs: a row names OUR entry's kind)
    path = next(a for a in argv if not a.startswith("--") and a not in (jar, runs))
    recs, _ = reader.read(reader.find_jar(jar))
    by = {}  # (src, kind, id) like the comparer: an id several books or kinds share is several records
    for r in recs:
        c = canon.canonical(r)
        by.setdefault((c["src"], c["kind"], r["id"].lower()), r)
    idx = ours.index(runs) if runs else {}
    mine = ours.kinds(idx)
    groups = defaultdict(dict)
    skipped = defaultdict(int)
    rows = [r for r in csv.DictReader(open(path, encoding="utf-8-sig", newline=""))
            if r["row"] == "family" and r["status"] == "counted" and r["field"] in ("skill/spec", "social", *STRUCTURE) and r["our_id"]]  # (no our_id: a record no entry of ours matches)
    own = {(r["src"], r["kind"], r["our_id"]) for r in rows}  # (records of the entry's own kind file)
    for r in rows:
        rec = by.get((r["src"], r["kind"], r["cl6_id"].lower()))
        kind = ours.kind_of(mine, r["src"], r["our_id"], r["kind"]) or r["kind"]
        if kind != r["kind"] and (r["src"], kind, r["our_id"]) in own:
            continue  # (another record of the entry's own kind is its record: an echo and a device of one id)
        if r["field"] in STRUCTURE:
            if rec:
                sets, kids = structure(rec)
                g = groups[r["src"], kind, r["our_id"].split(".", 1)[1]]
                g.update(sets, _cl6=rec["name"])
                g["_kids"] = [*g.get("_kids", []), *[k for k in kids if k not in g.get("_kids", [])]]
            continue
        if kind not in ("weapons", "armor"):
            skipped[kind, r["field"]] += 1  # (the schema gives a gear entry no skill)
            continue
        v = values(rec["el"], r["field"]) if rec else {}
        if v:
            groups[r["src"], kind, r["our_id"].split(".", 1)[1]].update(v, _cl6=rec["name"])
    new = defaultdict(list)
    for (src, kind, oid), v in sorted(groups.items()):
        name, kids = v.pop("_cl6"), v.pop("_kids", [])
        if v or kids:
            row = {"cl6": name, "kind": kind, "id": oid, **({"set": v} if v else {}), **({"kids": kids} if kids else {}), "gen": "family"}
            new[src] += fit([row]) if runs else [row]  # (only our entry's kind says which attributes its schema has)
    print(f"{sum(map(len, new.values()))} entries in {len(new)} tables; left out: {dict(skipped)}")
    if dry:
        return
    for p in OVERRIDES.glob("*.json"):
        if any(r.get("gen") == "family" for r in json.loads(p.read_text(encoding="utf8"))):
            new.setdefault(p.stem, [])
    for src, rows in new.items():
        p = OVERRIDES / f"{src}.json"
        old = json.loads(p.read_text(encoding="utf8")) if p.exists() else []
        out = merge(old, rows, idx, src, "--variants" in argv) if runs else [r for r in old if r.get("gen") != "family"] + rows
        p.write_text("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out) + "\n]\n", encoding="utf8", newline="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
