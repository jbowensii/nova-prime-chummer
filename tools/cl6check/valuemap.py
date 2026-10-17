"""Makes the field-value rows of importer/sr6/overrides/<src>.json from cl6-diffs.csv (the owner's rule: a value the book
and the reviewers could not confirm is Commlink6's):

  python -m tools.cl6check.valuemap <cl6-diffs.csv> [<cl6-diffs.csv of a run on the result> ...] [--runs <runs dir>] [--dry]
  python -m tools.cl6check.valuemap --refile <runs dir>      (only files the existing value rows under our entry's kind)

--runs: our catalogs; a row's "kind" is then the kind file OUR entry is in (the override only looks there first)

Every `counted` field difference (class a, b or c) becomes an id row `{"cl6", "kind", "id", "set": {...}, "formula"?,
"gen": "value"}` (importer/sr6/overrides.py applies it) unless:
- value_keep.json lists it under "keep": the book prints our value and gossipcat's reviewers (gemini, gpt, opus) all
  confirmed it, 100% certain, from the PDF page;
- value_keep.json lists it under "hold": left for the owner (a per-rating item, a variant's value ...), with why;
- its field has no safe mapping (reported).
Rows of an earlier run (`gen`: value) are replaced; the rest of a table is left as it is. Names and numbers only: no book
text. A per-rating Commlink6 value ("R1 500, R2 1000 …") becomes `Rating x N` when it is linear, else the value at
rating 1 with a `tier(R; 1: a; 2: b …)` formula."""
import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from importer.sr6.overrides import fit
from tools.cl6check import ours

ROOT = Path(__file__).resolve().parents[2]
OVERRIDES = ROOT / "importer" / "sr6" / "overrides"
KEEP = Path(__file__).with_name("value_keep.json")

ATTR = {"cost": "cost", "avail": "avail", "legality": "avail", "karma": "karma", "essence": "essence",
        "capacity": "capacity", "rating": "rating", "dv": "dv", "ar": "ar", "modes": "modes", "ammo": "ammo",
        "defense": "defense", "seats": "seats", "handling": "handling", "interval": "interval", "range": "range",
        "spell type": "type", "spell category": "category", "drain": "dv", "duration": "duration",
        "positive": "kind", "threshold": "threshold", "power type": "type", "action": "action",
        "activation": "activation", "fade": "fade"}
ENUM = {  # Commlink6's keys -> the books' words (what our files print; vocab.py)
    "duration": {"INSTANTANEOUS": "Instant", "SUSTAINED": "Sustained", "ALWAYS": "Always", "PERMANENT": "Permanent",
                 "SPECIAL": "Special"},
    "range": {"LINE_OF_SIGHT": "LOS", "LINE_OF_SIGHT_AREA": "LOS(A)", "TOUCH": "Touch", "SELF": "Self",
              "SELF_AREA": "Self (A)", "LOS": "LOS", "LOS(A)": "LOS(A)", "T": "Touch", "S": "Self", "S(A)": "Self (A)"},
    "action": {"AUTO": "Auto", "MAJOR": "Major", "MINOR": "Minor", "SPECIAL": "Special"},
    "activation": {"MAJOR_ACTION": "Major Action", "MINOR_ACTION": "Minor Action", "PASSIVE": "Passive"},
    "spell type": {"MANA": "M", "PHYSICAL": "P"},
    "power type": {"MANA": "M", "PHYSICAL": "P"},
    "positive": {"true": "positive", "false": "negative"},
    "fade": {"RATING": "Rating"},
}
PER_RATING = re.compile(r"R(\d+) ([-\d.,]+)")


def per_rating(s):
    """{rating: number string} of a show()n per-rating value, or None for a plain one."""
    got = PER_RATING.findall(s)
    return {int(r): v for r, v in got} if got and PER_RATING.sub("", s).strip(" ,") == "" else None


LEVEL = re.compile(r"-(?:level-|rating-)?(\d+)$")


def numeric(field, s, ours, level=None):
    """(attribute value, formula or None) for a numeric field. A level's own entry (one item per level: `wired-
    reflexes-2`) takes Commlink6's value at its level, plainly."""
    pr = per_rating(s)
    if pr and level in pr:
        return pr[level].replace(",", ""), None
    if not pr:
        return s.replace(",", "") if field != "dv" else s, None
    v = {r: float(x.replace(",", "")) for r, x in pr.items()}
    fmt = lambda f: str(int(f)) if float(f).is_integer() else f"{f:g}"
    if v.get(1) and all(abs(x - r * v[1]) < 1e-9 for r, x in v.items()):
        return f"Rating x {fmt(v[1])}", f"R * {fmt(v[1])}"
    return fmt(v[min(v)]), "tier(R; " + "; ".join(f"{r}: {fmt(x)}" for r, x in sorted(v.items())) + ")"


def ar_value(s):
    """'11,9,7,,' -> '11/9/7/—/—'."""
    parts = (s.split(",") + [""] * 5)[:5]
    return "/".join(p.strip() or "—" for p in parts)


def split_avail(s):
    """('4', 'L') of '4(L)'; ('(Force +3)', 'L') of '(Force +3) L'; ('Rating', 'I') of 'Rating(I)'."""
    m = re.match(r"^(.*?)\s*(?:\(([LIFR])\)|(?<![A-Za-z])([LIFR]))?\s*$", s or "")
    return (m.group(1), m.group(2) or m.group(3) or "") if m else ("", "")


def row_values(items):
    """({attribute: value}, {attribute: formula}, [unmapped]) for the field rows of one entry."""
    by = {x["field"]: x for x in items}
    m = LEVEL.search(items[0]["our_id"])
    level = int(m.group(1)) if m else None
    if level and "rating" in by:
        by.pop("rating")  # (a level's entry has its one rating: by design, left as it is)
    sets, forms, bad = {}, {}, []
    for field, x in by.items():
        cl6, ours = x["cl6"], x["ours"]
        if field in ("avail", "legality"):
            continue
        if field == "ar":
            sets["ar"] = ar_value(cl6)
        elif field in ENUM:
            if cl6 not in ENUM[field]:
                bad.append(f"{field}={cl6}")
                continue
            sets[ATTR[field]] = ENUM[field][cl6]
        elif field in ("cost", "essence", "capacity", "karma", "threshold", "defense"):
            v, f = numeric(field, cl6, ours, level)
            if field == "karma" and ours.startswith("-") and not v.startswith("-"):
                v = "-" + v
            if field == "defense" and not v.startswith(("+", "-")):
                v = "+" + v
            sets[ATTR[field]] = v
            if f:
                forms[ATTR[field]] = f
        elif field == "drain":
            sets["dv"] = cl6
        elif field in ATTR:
            sets[ATTR[field]] = cl6
        else:
            bad.append(field)
    if "avail" in by or "legality" in by:
        a, g = by.get("avail"), by.get("legality")
        if a:
            num, f = numeric("avail", a["cl6"], a["ours"], level)
            let = split_avail(a["ours"])[1]
            if f:
                forms["avail"] = f
        else:
            num, let = split_avail(g["ours"])
        if g:
            let = {"(legal)": ""}.get(g["cl6"], g["cl6"])
        if num == "":
            bad.append("legality without a number")
        else:
            sets["avail"] = f"{num}({let})" if let else num
    return sets, forms, bad


def refile(runs, root=OVERRIDES):
    """The value rows of every table filed under OUR entry's kind (rows landed by an earlier run are no csv difference any
    more, so a regeneration would lose them): {src: rows changed}."""
    mine, done = ours.kinds(ours.index(runs)), {}
    for p in sorted(Path(root).glob("*.json")):
        rows = json.loads(p.read_text(encoding="utf8"))
        moved = []
        for r in rows:
            k = ours.kind_of(mine, p.stem, f"{p.stem}.{r['id']}", r["kind"]) if r.get("gen") == "value" else None
            if k and k != r["kind"]:
                r["kind"] = k
                moved.append(r)
        if moved:
            p.write_text("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n", encoding="utf8", newline="\n")
            done[p.stem] = len(moved)
    return done


def replace_value_rows(old, rows):
    """A table's rows with its earlier value rows replaced by `rows`; every other row (class, family, errata, owner) stays."""
    return [r for r in old if r.get("gen") != "value"] + rows


def main(argv):
    if "--refile" in argv:
        print("value rows refiled:", refile(argv[argv.index("--refile") + 1]))
        return
    dry = "--dry" in argv
    runs = argv[argv.index("--runs") + 1] if "--runs" in argv else None  # (our catalogs: a row names OUR entry's kind, not Commlink6's)
    paths = [a for a in argv if not a.startswith("--") and a != runs]
    mine = ours.kinds(ours.index(runs)) if runs else {}
    keep = json.loads(KEEP.read_text(encoding="utf8")) if KEEP.exists() else {}
    skip = {tuple(k[:4]) for k in keep.get("keep", [])} | {tuple(k[:4]) for k in keep.get("hold", [])}
    skip |= {(v["src"], v["kind"], v["our_id"], v["field"]) for v in keep.get("verdicts", [])}  # (the owner ruled ours right)
    groups, conflicts, seen = defaultdict(dict), set(), defaultdict(set)
    for path in paths:  # (a later csv, made after the rows of an earlier one, adds what the first could not see: an availability's legality)
        for r in csv.DictReader(open(path, encoding="utf-8-sig", newline="")):
            if r["row"] != "field" or r["status"] != "counted" or r["class"] not in ("a", "b", "c") or r["field"] == "class":
                continue
            key = (r["src"], r["kind"], r["our_id"], r["field"])
            if key in skip:
                continue
            seen[key].add(r["cl6"])
            if len(seen[key]) > 1:  # (two Commlink6 records of one entry of ours, disagreeing: no value is Commlink6's)
                conflicts.add(key)
            groups[key[:3]][r["field"]] = r
    for key in conflicts:
        groups[key[:3]].pop(key[3], None)
    print(f"{len(conflicts)} fields left alone: two Commlink6 records match one entry and disagree: {sorted(conflicts)[:6]} ...")
    groups = {k: list(v.values()) for k, v in groups.items() if v}
    new, unmapped = defaultdict(list), []
    for (src, kind, oid), items in sorted(groups.items()):
        sets, forms, bad = row_values(items)
        unmapped += [(src, oid, b) for b in bad]
        if sets:
            row = {"cl6": items[0]["name_cl6"], "kind": ours.kind_of(mine, src, oid, kind) or kind, "id": oid.split(".", 1)[1], "set": sets, "gen": "value"}
            if forms:
                row["formula"] = forms
            new[src] += fit([row]) if mine else [row]  # (only our entry's kind says which attributes its schema has)
    print(f"{sum(map(len, new.values()))} entries in {len(new)} tables; unmapped: {unmapped}")
    if dry:
        return
    hold = {tuple(k[:4]): k for k in keep.get("hold", [])}
    for key in sorted(conflicts):
        hold.setdefault(key, [*key, "two Commlink6 records match this entry and disagree"])
    keep["hold"] = list(hold.values())
    KEEP.write_text(json.dumps(keep, indent=0, ensure_ascii=False), encoding="utf8")
    for p in OVERRIDES.glob("*.json"):  # (a table with value rows from an earlier run gets them replaced)
        rows = json.loads(p.read_text(encoding="utf8"))
        if any(r.get("gen") == "value" for r in rows) and p.stem not in new:
            new[p.stem] = []
    for src, rows in new.items():
        p = OVERRIDES / f"{src}.json"
        old = json.loads(p.read_text(encoding="utf8")) if p.exists() else []
        out = replace_value_rows(old, rows)
        p.write_text("[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in out) + "\n]\n", encoding="utf8")


if __name__ == "__main__":
    main(sys.argv[1:])
