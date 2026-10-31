"""Commlink6's own keys on our entries (behaviour-gap follow-ups, 2026-10-31), written into the book tables:

    python -m tools.cl6check.markers --runs <library import> [--jar <jar>] [--dry]

- a `"gen": "marker"` row per matched entry that needs one: `class` the record's type when it is one of the item class
  markers our classification lacks (METAGENIC qualities, ANIMALISM and DRACOGENESIS_POWER metaechoes: MARKERS), and
  `cl6` the record's id when the entry's name doesn't already say it (`skin_link`, `mtoc_mark1`), so a Commlink6
  reference (a prerequisite's ref, a pack's item) finds the entry by id;
- each flag a record's variants carry (`CYBERLIMB` on the cyberarm's full-arm variants) as a `<flag>` kid of the entry's
  family row: the variant's own when the book split the item per variant (`Arm (synthetic)`), else those every variant
  carries (familymap reads only the record's own flags).

Our entry for a record: the checker's matcher (compare). Rows of an earlier run are replaced; never edited by hand."""

import json
import re
import sys
from collections import defaultdict

from importer.sr6.overrides import fit
from tools.cl6check import canon, familymap, ours, reader
from tools.cl6check.options import book_split, pick_names, split
from tools.cl6check.valuemap import OVERRIDES

MARKERS = {"METAGENIC", "ANIMALISM", "DRACOGENESIS_POWER"}
FLAGS = {"CYBERLIMB"}  # (the variant flags carried: a cyberlimb; the rest change nothing the app reads yet)
KEY = re.compile(r"[A-Za-z0-9_]+")


def norm(s):
    """A name or id as words (`hk_urban_stinger` and `HK Urban Stinger` alike)."""
    return " ".join(re.findall(r"[a-z0-9]+", (s or "").casefold().replace("_", " ")))


def pairs(recs, runs):
    """[(reader record, our entry)] the checker's matcher pairs (every matched record, not only those that differ)."""
    from tools.cl6check.__main__ import compare  # pylint: disable=import-outside-toplevel  # (the CLI module)

    cans = [canon.canonical(r) for r in recs]
    raw = {id(c): r for c, r in zip(cans, recs)}
    return [(raw[id(c)], o) for c, o in compare(cans, ours.load(runs), pdf=False)[2] if id(c) in raw]


def _hook(v):
    """A variant's hook capacity (its HOOK modification's value), else None."""
    return next((m.get("value") for m in v.iter("valmod") if m.get("type") == "HOOK" and m.get("value")), None)


def variant_flags(rec, entry):
    """The flags our entry takes from the record's variants (see the module's note); [] when none. Several variants
    the entry's name fits (`Arm (synthetic)`: Full, Forearm and Hand, synthetic): the one whose hook capacity is the
    entry's."""
    names = rec.get("variants") or {}
    vs = canon._own(rec["el"], "variant")  # pylint: disable=protected-access  # (canon's own-children reader)
    flags = [
        (
            names.get(v.get("id"), v.get("id")),
            v,
            {(f.text or "").strip() for fl in v.iter("flags") for f in fl if (f.text or "").strip() in FLAGS},
        )
        for v in vs
    ]
    if not flags or not any(f for _, _, f in flags):
        return []
    if split(entry["name"], [n for n, _, _ in flags]):
        mine = [x for x in flags if split(entry["name"], [x[0]])]
        if len(mine) > 1:
            mine = [x for x in mine if _hook(x[1]) and _hook(x[1]) == entry["attrs"].get("capacity")]
        return sorted(mine[0][2]) if len(mine) == 1 else []
    return sorted(set.intersection(*(f for _, _, f in flags)))


def marker(rec, entry, allowed):
    """The `set` of the entry's marker row: its class marker and Commlink6 id where they are needed."""
    out = {}
    t = rec["attrs"].get("type") or ""
    if t in MARKERS and "class" in allowed and entry["attrs"].get("class", "") in ("", t):  # (ours, or none)
        out["class"] = t
    if KEY.fullmatch(rec["id"]) and norm(rec["id"]) != norm(entry["name"]) and "cl6" in allowed:
        out["cl6"] = rec["id"]
    return out


def main(argv):
    """Write the marker rows and the variant flags into the book tables."""
    from importer.sr6.overrides.schema import allowed  # pylint: disable=import-outside-toplevel

    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    runs = argv[argv.index("--runs") + 1]
    recs, _ = reader.read(reader.find_jar(jar))
    tables = {
        p.stem: json.loads(p.read_text(encoding="utf8")) for p in OVERRIDES.glob("*.json") if ".book" not in p.name
    }
    rows, flags, stats, seen = defaultdict(list), defaultdict(dict), defaultdict(int), set()
    base = defaultdict(list)  # (an entry's book siblings: the split entries of one item, `Arm (synthetic)`/`(obvious)`)
    idx = ours.index(runs)
    for e in idx.values():
        base[e["src"], e["kind"], norm(re.sub(r"\s*\([^()]*\)\s*$", "", e["name"]))].append(e)
    for rec, o in pairs(recs, runs):
        if canon._own(rec["el"], "variant"):  # pylint: disable=protected-access
            for sib in base[o["src"], o["kind"], norm(re.sub(r"\s*\([^()]*\)\s*$", "", o["name"]))]:
                if sib["id"] != o["id"] and sib["id"].startswith(sib["src"] + ".") and sib["src"] in tables:
                    if fl := variant_flags(rec, sib):
                        flags[sib["src"]][sib["kind"], sib["id"][len(sib["src"]) + 1 :]] = (rec["name"], fl)
        src, kind, oid = o["src"], o["kind"], o["id"]
        if not oid.startswith(src + ".") or src not in tables or (src, kind, oid) in seen:
            continue
        ok = allowed(kind) or set()
        # (every level of a leveled item is the record: `Cyberjack (Rating 1)` … `(Rating 6)`)
        for key in familymap.levels(idx, (src, kind, oid)) or [(src, kind, oid)]:
            if key in seen or key not in idx:
                continue
            seen.add(key)
            if s := marker(rec, idx[key], ok):
                rows[src].append(
                    {"cl6": rec["name"], "kind": kind, "id": key[2][len(src) + 1 :], "set": s, "gen": "marker"}
                )
                for k in s:
                    stats[k] += 1
        if fl := variant_flags(rec, o):
            flags[src][kind, oid[len(src) + 1 :]] = (rec["name"], fl)
    # (an item the book split under a shorter name than Commlink6's, AV Rapid Transit: each split entry is the record)
    for rec in recs:
        kind = canon.canonical(rec)["kind"]
        for key in book_split(rec, idx, kind) if pick_names(rec) else ():
            if key in seen or key[0] not in tables:
                continue
            seen.add(key)
            if s := marker(rec, idx[key], allowed(kind) or set()):
                rows[key[0]].append(
                    {"cl6": rec["name"], "kind": kind, "id": key[2][len(key[0]) + 1 :], "set": s, "gen": "marker"}
                )
                stats["book split"] += 1
    for src, table in tables.items():
        out = [r for r in table if r.get("gen") != "marker"]
        for (kind, bare), (name, fl) in flags.get(src, {}).items():
            row = next((r for r in out if r.get("gen") == "family" and r["kind"] == kind and r["id"] == bare), None)
            if row is None:
                row = {"cl6": name, "kind": kind, "id": bare, "kids": [], "gen": "family"}
                out.append(row)
            have = {k.get("text") for k in row.get("kids", []) if k["tag"] == "flag"}
            add = [{"tag": "flag", "text": f} for f in fl if f not in have]
            row["kids"] = [*row.get("kids", []), *add]
            stats["variant flags"] += len(add)
            stats["CYBERLIMB"] += sum(k["text"] == "CYBERLIMB" for k in add)
        tables[src] = out + fit(rows.get(src, []))
    print(dict(stats))
    if "--dry" in argv:
        return
    for src, table in tables.items():
        p = OVERRIDES / f"{src}.json"
        text = "[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in table) + "\n]\n"
        if text != p.read_text(encoding="utf8"):
            p.write_text(text, encoding="utf8", newline="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
