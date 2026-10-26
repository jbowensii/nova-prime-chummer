"""Makes the structured-data rows of importer/sr6/overrides/<src>.json that the catalog schema models, from
cl6-diffs.csv and the Commlink6 jar (owner decision 2026-10-13: where we have no data and the books gave us nothing,
Commlink6's value):

  python -m tools.cl6check.familymap <cl6-diffs.csv> [--jar JAR] [--runs <runs dir>] [--variants] [--dry]

Commlink6's records are keyed (src, kind, id) as the comparer does. With --runs (our catalogs) a row names OUR entry's
kind and the earlier family rows still valid are kept and widened (a row that landed is no longer a csv difference);
stale ones go.

- skill/spec: a weapon's `skill` and `spec` attributes (Commlink6's keys in the books' words: `firearms/pistols_light`
  -> `Firearms`, `Pistols Light`);
- social: an armor's `social` attribute (`–2`, the books' en dash).
The other families (slots, variants, relevance, flags, modonly, size/ammo: elements and attributes the data schema does
not have; choices, requires, effects: a Commlink6 modification has no one-to-one `<effect>`) are not written; see
docs/reviews. Rows of an earlier run (`gen`: family) are replaced. Names and keys only."""

import csv
import json
import re
import sys
from collections import defaultdict

from importer.sr6.overrides import fit
from tools.cl6check import canon, ours, reader
from tools.cl6check.valuemap import OVERRIDES

# pylint: disable=protected-access,consider-using-with  # shares canon's private readers; one-shot read


def words(key):
    """A snake_case family key as capitalised words."""
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


TAGS = {  # (the kids each structure family is made of: a row of a family writes only its own)
    "slots": ("slot", "fits"),
    "variants": ("variant",),
    "relevance": ("relevance",),
    "flags": ("flag",),
    "effects": ("modifier",),
    "requires": ("prerequisite",),
    "choices": ("selection",),
}
STRUCTURE = ("slots", "variants", "relevance", "flags", "modonly", "size/ammo", "effects", "requires", "choices")


def slot_value(m, rating):
    """A HOOK's capacity as the entry holds it: at `rating`, the table's own number (Cybereyes: 1, 4, 8, 12, 16 by
    level; `$RATING` is the level, not the capacity), else as Commlink6 gives it (None when it gives none)."""
    v = m.get("value")
    if not v:
        return None
    if rating is not None and m.get("table"):
        got = canon.cl6_value(v, rating, m.get("table"))
        if got is not None:
            return f"{got:g}" if isinstance(got, float) else str(got)
    return v


def structure(rec, rating=None):
    """({attribute: value}, [kid]) Commlink6's record gives for the item-structure families
    (docs/sr6-data-format/kinds.md, Item
    structure), in the books' words where it has keys (`MILITARY` -> `Military`). Slots (a host's HOOKs) and fits (an
    accessory's EMBEDDED usages) are the item's, its variants' too (canon.associations); rating: the level of the entry
    that takes them (a HOOK's value is read at it)."""
    el, attrs = rec["el"], rec["attrs"]
    sets, kids = {}, []
    if attrs.get("modonly") in ("y", "yes", "true", "1") or attrs.get("modonly") is True:
        sets["modonly"] = "true"
    size, ammo = canon.attrdef(el, "WEAPON_SIZE")[0], canon.attrdef(el, "AMMUNITION_CLASS")[0]
    if size:
        sets["size"] = words(size.lower())
    if ammo:
        sets["ammoClass"] = words(ammo.lower())
    seen = set()  # (a slot several variants give: the record's own first, then the first variant's capacity)
    for x in el.iter():
        if x.tag in ("valmod", "itemmod") and x.get("type") == "HOOK" and x.get("ref"):
            if canon._norm(x.get("ref")) in seen:
                continue
            seen.add(canon._norm(x.get("ref")))
            v = slot_value(x, rating)
            kids.append({"tag": "slot", "attrs": {"id": canon._norm(x.get("ref")), **({"value": v} if v else {})}})
        elif x.tag == "usage" and x.get("mode") == "EMBEDDED" and x.get("slot"):
            kids.append({"tag": "fits", "attrs": {"slot": canon._norm(x.get("slot"))}})
    for m in canon._mods(el):
        if m.tag == "relevancemod" and (m.get("topic") or "").strip():
            kids.append({"tag": "relevance", "attrs": {"topic": m.get("topic").strip().casefold()}})
    names = rec.get("variants") or {}
    for v in canon._own(el, "variant"):
        kids.append({"tag": "variant", "attrs": {"name": names.get(v.get("id"), v.get("id"))}})
    for fl in canon._own(el, "flags"):
        for f in fl:
            if (f.text or "").strip():
                kids.append({"tag": "flag", "text": f.text.strip()})

    # Commlink6's own rule data, kept as it gives it (never applied by the app): its modifications, prerequisites and
    # picks
    def raw(x):
        return {k: v for k, v in x.attrib.items() if k != "uuid"}

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


RATED = re.compile(r"\s*\((?:Rating|Level)\s*\d+\)\s*$")  # (an entry's level suffix: one entry per level)


def level(e):
    """The one level of an entry of ours (`rating` 1..5), else None."""
    r = ours.rating_range((e or {}).get("attrs", {}).get("rating"))
    return r[0] if r and r[0] == r[1] else None


def levels(idx, key):
    """The keys of every level entry of the item the entry `key` is one level of (itself included), else []."""
    e = idx.get(key)
    if not e or not RATED.search(e["name"]):
        return []
    base = RATED.sub("", e["name"]).casefold()
    return [
        k
        for k, x in idx.items()
        if k[:2] == key[:2] and RATED.search(x["name"]) and RATED.sub("", x["name"]).casefold() == base
    ]


def merge(old, new, idx, src, variants=False):
    """src's table rows: the hand rows and other generators' rows as they are; the family rows of an earlier run kept
    (a row that landed is no longer a difference in the csv, so the csv alone never has it again) unless no entry of
    ours has its id any more (a rename), each filed under OUR entry's kind and widened by a new row of the same entry.
    a row's old values win (they were reviewed). <variant> kids stay where the old row already landed them; elsewhere
    none on an entry whose name carries a variant (one item per variant) and, until the owner decides (variants=True,
    `--variants`), none at all."""
    rows, landed, held = {}, set(), ours.kinds(idx)
    filed = {(x["kind"], x["id"]) for x in old if x.get("gen") == "family"}
    for r in old:
        k = ours.kind_of(held, src, f"{src}.{r['id']}", r["kind"]) if r.get("gen") == "family" else None
        if k and (
            k == r["kind"] or (k, r["id"]) not in filed
        ):  # (a row refiled onto one the kind file already has: dropped)
            rows[k, r["id"]] = {**r, "kind": k}
            if r["kind"] == k:
                landed.add((k, r["id"]))
    for r in new:
        o = rows.get((r["kind"], r["id"]))
        if o:
            kept = [
                k
                for k in o.get("kids", [])
                if not (
                    k["tag"] == "slot"
                    and "$" in k["attrs"].get("value", "")
                    and any(
                        x["tag"] == "slot"
                        and x["attrs"]["id"] == k["attrs"]["id"]
                        and "$" not in x["attrs"].get("value", "$")
                        for x in r.get("kids", [])
                    )
                )
            ]  # (a slot Commlink6 now gives with its level's own capacity replaces the old row's `$RATING`)
            have = {k["attrs"]["id"] for k in kept if k["tag"] == "slot"}  # (one capacity per slot: the old row's wins)
            r = {
                **o,
                **r,
                "set": {**r.get("set", {}), **o.get("set", {})},
                "kids": [
                    *kept,
                    *[
                        k
                        for k in r.get("kids", [])
                        if k not in kept and not (k["tag"] == "slot" and k["attrs"]["id"] in have)
                    ],
                ],
            }
            r = {k: v for k, v in r.items() if v or k in ("cl6", "kind", "id", "gen")}
        rows[r["kind"], r["id"]] = r
    for i, r in list(rows.items()):
        names = [k["attrs"]["name"] for k in r.get("kids", []) if k["tag"] == "variant"]
        if (
            names
            and i not in landed
            and (ours.carries(idx.get((src, i[0], f"{src}.{i[1]}"), {}).get("name", ""), names) or not variants)
        ):
            kids = [k for k in r["kids"] if k["tag"] != "variant"]
            rows[i] = {k: v for k, v in {**r, "kids": kids}.items() if v or k != "kids"}
            if not (rows[i].get("set") or kids):
                del rows[i]
    return [r for r in old if r.get("gen") != "family"] + fit(list(rows.values()))


def main(argv):
    """Build the family map from the Commlink6 jar and our catalogs, and write it to the given path."""
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
    rows = [
        r
        for r in csv.DictReader(open(path, encoding="utf-8-sig", newline=""))
        if r["row"] == "family"
        and r["status"] == "counted"
        and r["field"] in ("skill/spec", "social", *STRUCTURE)
        and r["our_id"]
    ]  # (no our_id: a record no entry of ours matches)
    own = {(r["src"], r["kind"], r["our_id"]) for r in rows}  # (records of the entry's own kind file)
    for r in rows:
        rec = by.get((r["src"], r["kind"], r["cl6_id"].lower()))
        kind = ours.kind_of(mine, r["src"], r["our_id"], r["kind"]) or r["kind"]
        if kind != r["kind"] and (r["src"], kind, r["our_id"]) in own:
            continue  # (another record of the entry's own kind is its record: an echo and a device of one id)
        if r["field"] in STRUCTURE:
            if rec:
                sets, kids = structure(rec, level(idx.get((r["src"], kind, r["our_id"]))))
                kids = [k for k in kids if k["tag"] in TAGS.get(r["field"], ())]
                sets = sets if r["field"] in ("size/ammo", "modonly") else {}
                g = groups[r["src"], kind, r["our_id"].split(".", 1)[1]]
                g.update(sets, _cl6=rec["name"], _rec=rec)
                g["_kids"] = [*g.get("_kids", []), *[k for k in kids if k not in g.get("_kids", [])]]
            continue
        if kind not in ("weapons", "armor"):
            skipped[kind, r["field"]] += 1  # (the schema gives a gear entry no skill)
            continue
        v = values(rec["el"], r["field"]) if rec else {}
        if v:
            groups[r["src"], kind, r["our_id"].split(".", 1)[1]].update(v, _cl6=rec["name"])
    for (src, kind, oid), v in list(groups.items()):  # (every level of a rated item holds the slots and fits)
        if "_rec" not in v:
            continue
        for key in levels(idx, (src, kind, f"{src}.{oid}")):
            lv = groups[src, kind, key[2].split(".", 1)[1]]
            if lv is v:
                continue
            _, kids = structure(v["_rec"], level(idx[key]))
            lv.setdefault("_cl6", v["_cl6"])
            lv["_kids"] = [
                *lv.get("_kids", []),
                *[k for k in kids if k["tag"] in ("slot", "fits") and k not in lv.get("_kids", [])],
            ]
    new = defaultdict(list)
    for (src, kind, oid), v in sorted(groups.items()):
        v.pop("_rec", None)
        name, kids = v.pop("_cl6"), v.pop("_kids", [])
        if v or kids:
            row = {
                "cl6": name,
                "kind": kind,
                "id": oid,
                **({"set": v} if v else {}),
                **({"kids": kids} if kids else {}),
                "gen": "family",
            }
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
        out = (
            merge(old, rows, idx, src, "--variants" in argv)
            if runs
            else [r for r in old if r.get("gen") != "family"] + rows
        )
        p.write_text(
            "[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out) + "\n]\n",
            encoding="utf8",
            newline="\n",
        )


if __name__ == "__main__":
    main(sys.argv[1:])
