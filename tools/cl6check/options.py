"""Sub-options and variants (behaviour-gap plan Stage 2): Commlink6's SUBSELECT `<subOption>`s and an item's
`<variant>`s, written into the book tables' "gen": "family" rows as the entry's own `<option>` and `<variant>` kids.

    python -m tools.cl6check.options --runs <library import> [--jar <jar>] [--dry]

- `<option choice="<ref>" id name [cost] [price] [avail] [count]>`: one per sub-option of a SUBSELECT pick. cost is
  Commlink6's (karma on a quality, nuyen on an item), added to the entry's; price/avail its own attrdefs.
- `<variant name [price] [essence] [avail] [required]>`: a variant's own price, essence and availability, which replace
  the entry's when it is picked; required on every variant of a `reqVariant` item (one must be picked).
- `<effect option="<ref>.<id>" | variant="<name>">`: a sub-option's or variant's modification our effect vocabulary
  states (tools/cl6effects' mapping of Commlink6 modifications); it holds only while that option is picked.

An entry whose name already carries an option's or variant's name is one entry per option (the owner's rule: the book
split them) and gets neither. Our entry for a record: the checker's matches (`cl6-diffs.csv` of a `--ours` report
beside the import, else the family rows' `cl6` names). Regenerable; never edited by hand.
"""

import csv
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

from tools.cl6check import canon, ours, reader
from tools.cl6check.valuemap import OVERRIDES
from tools.cl6effects import evaluate

OPS = {"add", "edge", "edge-cost", "no-edge", "no-edge-gain", "wild-die", "hits", "threshold"}
NUM = re.compile(r"[+-]?\d+(?:\.\d+)?")
YES = ("y", "yes", "true", "1")


def split(name, labels):
    """Whether our entry is one of a book's entries per option or variant: its name holds one's name, or its bracket's
    words are all words of one (`Arm (synthetic)` of Commlink6's `Full, synthetic`)."""
    labels = [x for x in labels if x]
    if ours.carries(name, labels):
        return True
    m = re.search(r"\(([^()]*)\)\s*$", name or "")
    words = set(re.findall(r"[a-z0-9]+", m.group(1).casefold())) if m else set()
    return bool(words) and any(words <= set(re.findall(r"[a-z0-9]+", x.casefold())) for x in labels)


def _avail(expr, level):
    """An availability at the entry's level (`$RATING+3 L` at 2: `5L`); None when it needs a level the entry lacks."""
    if not expr or "$" not in expr:
        return expr
    m = re.fullmatch(r"(.*?)\s*([A-Z]?)", expr.strip())
    v = _value(m.group(1), None, level) if level else None
    return f"{v}{m.group(2)}" if v is not None else None


def effect(m, **scope):
    """Our effect for one Commlink6 modification of a sub-option or variant, scoped to it; None when our vocabulary has
    no single target for it, or its value is no plain number."""
    try:
        res = evaluate.cl6_atoms4({"_tag": m.tag, **m.attrib})
    except (KeyError, ValueError, TypeError):
        return None
    if not res or res[0] is None or len(res[0]) != 1 or res[1] not in OPS:
        return None
    v = (m.get("value") or "").strip()
    if not NUM.fullmatch(v) or float(v) == 0:
        return None
    (target,) = res[0]
    if target.startswith("item:"):
        return None  # (an item attribute: its price is the option's cost)
    return {"tag": "effect", "attrs": {"target": target, "op": res[1], "value": v.lstrip("+"), **scope}}


def _mods(el):
    return [m for ms in el if ms.tag == "modifications" for m in ms if isinstance(m.tag, str)]


def _value(expr, table, level):
    v = canon.cl6_value(expr, level, table) if expr is not None else None
    return None if v is None else (str(int(v)) if isinstance(v, float) and v.is_integer() else str(v))


def option_kids(rec, name):
    """The `<option>`s and their effects of the record's SUBSELECT picks; [] for an entry the book split by option."""
    kids = []
    for ch in rec["el"].iter("choice"):
        if ch.get("type") != "SUBSELECT":
            continue
        ref = ch.get("ref") or "option"
        subs = [s for s in ch if s.tag == "subOption"]
        label = {s.get("id"): rec.get("options", {}).get(f"{ref}.{s.get('id')}", s.get("id")) for s in subs}
        if not subs or split(name, label.values()):
            continue
        for s in subs:
            a = {"choice": ref, "id": s.get("id"), "name": label[s.get("id")]}
            if (s.get("cost") or "0") not in ("0", ""):
                a["cost"] = s.get("cost")
            price, avail = canon.attrdef(s, "PRICE")[0], canon.attrdef(s, "AVAILABILITY")[0]
            if price not in (None, "0"):
                a["price"] = price
            if avail not in (None, "0"):
                a["avail"] = _avail(avail, None) or avail
            if ch.get("count"):
                a["count"] = ch.get("count")
            kids.append({"tag": "option", "attrs": a})
            kids += [k for k in (effect(m, option=f"{ref}.{s.get('id')}") for m in _mods(s)) if k]
    return kids


def variant_kids(rec, name, level):
    """The record's `<variant>`s with their own price, essence and availability (and their effects); None for a record
    with none or an entry the book split by variant."""
    el, names = rec["el"], rec.get("variants") or {}
    vs = canon._own(el, "variant")  # pylint: disable=protected-access  # (canon's own-children reader)
    if not vs or split(name, [names.get(v.get("id"), v.get("id")) for v in vs]):
        return None
    req = (rec["attrs"].get("reqVariant") or "").casefold() in YES
    kids = []
    for v in vs:
        n = names.get(v.get("id"), v.get("id"))
        a = {"name": n}
        virtual = (v.get("noBase") or "").casefold() in YES  # (an ability another item grants: no price of its own)
        if not virtual:
            price = _value(*canon.attrdef(v, "PRICE"), level)
            ess = canon.attrdef(v, "ESSENCECOST")[0] or next(
                (u.get("value") for u in v if u.tag == "usage" and u.get("mode") == "IMPLANTED" and u.get("value")),
                None,
            )
            avail = _avail(canon.attrdef(v, "AVAILABILITY")[0], level)
            a.update(
                {k: x for k, x in (("price", price), ("essence", _value(ess, None, level)), ("avail", avail)) if x}
            )
            if req:
                a["required"] = "true"
        kids.append({"tag": "variant", "attrs": a})
        kids += [k for k in (effect(m, variant=n) for m in _mods(v)) if k]
    return kids


def matches(runs):
    """{(src, kind, cl6 id lower): {(kind, our id)}} from the checker's report of the import
    (`<runs>-report/cl6-diffs.csv`)."""
    out = defaultdict(set)
    p = Path(f"{str(runs).rstrip('/').rstrip(chr(92))}-report") / "cl6-diffs.csv"
    if p.exists():
        with open(p, encoding="utf-8-sig", newline="") as f:
            for r in csv.DictReader(f):
                if r.get("our_id") and r.get("cl6_id"):
                    out[r["src"], r["kind"], r["cl6_id"].lower()].add((r["kind"], r["our_id"]))
    return out


def main(argv):
    """Write the option and variant kids into the book tables' family rows."""
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    runs = argv[argv.index("--runs") + 1]
    recs, _ = reader.read(reader.find_jar(jar))
    idx = ours.index(runs)
    held = ours.kinds(idx)
    found = matches(runs)
    tables = {
        p.stem: json.loads(p.read_text(encoding="utf8")) for p in OVERRIDES.glob("*.json") if ".book" not in p.name
    }
    by_name = defaultdict(list)  # (a family row by its Commlink6 name: the fallback match)
    for src, rows in tables.items():
        for r in rows:
            if r.get("gen") == "family" and r.get("cl6"):
                by_name[src, r["cl6"].casefold()].append((r["kind"], f"{src}.{r['id']}"))
    named = defaultdict(list)  # (an entry of ours by its own name: the last fallback)
    for src, kind, oid in idx:
        named[src, idx[src, kind, oid]["name"].casefold()].append((kind, oid))
    stats = defaultdict(int)
    left = []
    for rec in recs:
        el = rec["el"]
        vs = canon._own(el, "variant")  # pylint: disable=protected-access  # (canon's own-children reader)
        if not (any(c.get("type") == "SUBSELECT" for c in el.iter("choice")) or vs):
            continue
        c = canon.canonical(rec)
        if c["kind"] == "qualitypaths":
            continue  # (a quality path's step picks: Stage 6, the special creation paths)
        targets = (
            found.get((c["src"], c["kind"], rec["id"].lower()))
            or {t for t in by_name.get((c["src"], rec["name"].casefold()), []) if t[0] == c["kind"]}
            or {t for t in named.get((c["src"], rec["name"].casefold()), []) if t[0] == c["kind"]}
        )  # (a name fallback only in Commlink6's own kind: a program Armor is no critter power)
        if not targets:
            if any(True for _ in el.iter("subOption")) or (rec["attrs"].get("reqVariant") or "").casefold() in YES:
                left.append(f"{c['src']} {c['kind']} {rec['id']} ({rec['name']})")
            continue
        for kind, oid in sorted(targets):
            src, bare = oid.split(".", 1)
            kind = ours.kind_of(held, src, oid, kind) or kind
            e = idx.get((src, kind, oid))
            if not e or src not in tables:
                continue
            level = ours.rating_range(e.get("attrs", {}).get("rating"))
            level = level[0] if level and level[0] == level[1] else None
            new = option_kids(rec, e["name"])
            vk = variant_kids(rec, e["name"], level)
            if not new and not vk:
                continue
            rows = tables[src]
            row = next((r for r in rows if r.get("gen") == "family" and r["kind"] == kind and r["id"] == bare), None)
            if row is None:
                row = {"cl6": rec["name"], "kind": kind, "id": bare, "kids": [], "gen": "family"}
                rows.append(row)
                stats["new rows"] += 1
            out, placed = [], vk is None
            for k in row.get("kids", []):  # (the variants where the row had them; earlier generated kids replaced)
                if k["tag"] == "option" or (k["tag"] == "effect" and ({"option", "variant"} & set(k["attrs"]))):
                    continue
                if k["tag"] == "variant" and vk is not None:
                    if not placed:
                        out += vk
                        placed = True
                    continue
                out.append(k)
            row["kids"] = out + new + ([] if placed else vk)
            price = rec["attrs"].get("price")
            if (
                any("cost" in k["attrs"] for k in new if k["tag"] == "option")
                and kind != "qualities"
                and price
                and not NUM.fullmatch(str(e.get("attrs", {}).get("cost", "")).strip())
            ):  # (a price the book prints per option, `300 (Obj. Res. 1-3); 350 ...`: the base the options add to)
                row["set"] = {**row.get("set", {}), "cost": price}
                stats["base prices"] += 1
            stats["options"] += sum(k["tag"] == "option" for k in new)
            stats["variant entries"] += vk is not None
            stats["required"] += bool(vk and any(k["attrs"].get("required") for k in vk))
            stats["effects"] += sum(k["tag"] == "effect" for k in new + (vk or []))
    print(dict(stats))
    print(f"no entry of ours for {len(left)} records with priced options or a required variant:")
    for x in left:
        print("  " + x)
    if "--dry" in argv:
        return
    for src, rows in tables.items():
        p = OVERRIDES / f"{src}.json"
        text = "[\n" + ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in rows) + "\n]\n"
        if text != p.read_text(encoding="utf8"):
            p.write_text(text, encoding="utf8", newline="\n")


if __name__ == "__main__":
    main(sys.argv[1:])
