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


def _words(s):
    return set(re.findall(r"[a-z0-9]+", (s or "").casefold()))


def split(name, labels, record="", siblings=()):
    """Whether our entry is one of a book's entries per option or variant: its name holds one's name, or its bracket's
    words are all words of one (`Arm (synthetic)` of Commlink6's `Full, synthetic`), or a word its name adds to the
    record's is one's (`MEMS medkit pouch (rank 4-6)` of Medkit Pouch's `for Rtg 4-6`), or an entry of the same name
    and more holds one's name (`Concealable ammo pouch (sealed)` beside `Concealable ammo pouch`)."""
    labels = [x for x in labels if x]
    if ours.carries(name, labels):
        return True
    m = re.search(r"\(([^()]*)\)\s*$", name or "")
    words = _words(m.group(1)) if m else set()
    if words and any(words <= _words(x) for x in labels):
        return True
    extra = _words(name) - _words(record) if record else set()
    if extra and any(extra & _words(x) for x in labels):
        return True
    return any(x.casefold().startswith(f"{(name or '').casefold()} ") and ours.carries(x, labels) for x in siblings)


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


def option_kids(rec, name, siblings=()):
    """The `<option>`s and their effects of the record's SUBSELECT picks; [] for an entry the book split by option."""
    kids = []
    for ch in rec["el"].iter("choice"):
        if ch.get("type") != "SUBSELECT":
            continue
        ref = ch.get("ref") or "option"
        subs = [s for s in ch if s.tag == "subOption"]
        label = {s.get("id"): rec.get("options", {}).get(f"{ref}.{s.get('id')}", s.get("id")) for s in subs}
        if not subs or split(name, label.values(), rec.get("name", ""), siblings):
            continue
        # (an item whose cheapest option costs its whole price states the options' prices, not what they add: Arrow
        # Tap's 2000 and 3500 at 2000; they add 0 and 1500)
        costs = [float(s.get("cost")) for s in subs if NUM.fullmatch(s.get("cost") or "")]
        base = rec["attrs"].get("price") if rec.get("tag") != "quality" else None
        less = float(base) if base and NUM.fullmatch(base) and costs and min(costs) == float(base) > 0 else 0
        for s in subs:
            a = {"choice": ref, "id": s.get("id"), "name": label[s.get("id")]}
            cost = s.get("cost") or "0"
            if less and NUM.fullmatch(cost):
                cost = _value(str(float(cost) - less), None, None)
            if cost not in ("0", ""):
                a["cost"] = cost
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


def _raw(x):
    return {k: v for k, v in x.attrib.items() if k != "uuid"}


def split_kids(rec, name):
    """For an entry the book split per SUBSELECT option (Bestial Nature's `Shifter (Furry)` … `(Fins)` of Commlink6's
    one `shifter`, owner ruling 2026-10-31): what that one option is, as the entry's own kids, each marked `split`
    (`<ref>.<id>`, or `shared`): the option's modifications and its requirements (character prerequisites), and the
    record's own modifications and built-in gear (`<geardef>` items: a `modifier kind="geardef"` with the weapon's
    attributes), which every split entry has. [] when the name carries no single option."""
    for ch in rec["el"].iter("choice"):
        if ch.get("type") != "SUBSELECT":
            continue
        ref = ch.get("ref") or "option"
        subs = [s for s in ch if s.tag == "subOption"]
        label = {s.get("id"): rec.get("options", {}).get(f"{ref}.{s.get('id')}", s.get("id")) for s in subs}
        mine = [s for s in subs if ours.carries(name, [label[s.get("id")]])]
        if len(mine) != 1:
            continue
        s, mark = mine[0], f"{ref}.{mine[0].get('id')}"
        kids = [
            {"tag": "modifier", "attrs": {"kind": m.tag, **_raw(m), "split": mark}}
            for m in _mods(s)
            if m.tag in ("valmod", "checkmod", "itemmod", "allowmod")
        ]
        for rq in (x for x in s if x.tag == "requires"):
            kids += [
                {"tag": "prerequisite", "attrs": {"kind": q.tag, **_raw(q), "apply": "CHARACTER", "split": mark}}
                for q in rq.iter()
                if q.tag in ("datareq", "valuereq")
            ]
        shared = [
            {"tag": "modifier", "attrs": {"kind": m.tag, **_raw(m), "split": "shared"}}
            for m in canon._mods(rec["el"])  # pylint: disable=protected-access  # (canon's own modifications reader)
            if m.tag in ("valmod", "checkmod", "itemmod", "allowmod") and m.get("type") != "HOOK"
        ]
        for gd in canon._own(rec["el"], "geardef"):  # pylint: disable=protected-access
            for it in (x for x in gd if x.tag == "item"):
                w = next((x for x in it if x.tag == "weapon"), None)
                shared.append(
                    {
                        "tag": "modifier",
                        "attrs": {
                            "kind": "geardef",
                            **_raw(it),
                            **(_raw(w) if w is not None else {}),
                            "split": "shared",
                        },
                    }
                )
        return kids + shared
    return []


def _place_split(row, kids):
    """The row's kids with the earlier split kids replaced by `kids`; a shared kid the row states already (the paired
    entry's family modifications) is not repeated."""
    old = [k for k in row.get("kids", []) if "split" not in k.get("attrs", {})]
    have = {json.dumps(k["attrs"], sort_keys=True) for k in old if k["tag"] == "modifier"}
    new = [
        k
        for k in kids
        if not (
            k["attrs"]["split"] == "shared"
            and json.dumps({a: v for a, v in k["attrs"].items() if a != "split"}, sort_keys=True) in have
        )
    ]
    return old + new


def variant_kids(rec, name, level, siblings=()):
    """The record's `<variant>`s with their own price, essence and availability (and their effects); None for a record
    with none or an entry the book split by variant."""
    el, names = rec["el"], rec.get("variants") or {}
    vs = canon._own(el, "variant")  # pylint: disable=protected-access  # (canon's own-children reader)
    if not vs or split(name, [names.get(v.get("id"), v.get("id")) for v in vs], rec.get("name", ""), siblings):
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
        cf = next((u.get("value") for u in v if u.tag == "usage" and u.get("slot") == "VEHICLE_CF"), None)
        if cf is not None:  # (Metahuman Adjustments: a dwarf seat takes 0 of the vehicle's CF, a troll seat 1)
            a["cf"] = _value(cf, None, level) or cf
        kids.append({"tag": "variant", "attrs": a})
        kids += [k for k in (effect(m, variant=n) for m in _mods(v)) if k]
    return kids


def pick_names(rec):
    """Every option and variant name the record gives (its picks' and its variants')."""
    names = rec.get("variants") or {}
    vs = canon._own(rec["el"], "variant")  # pylint: disable=protected-access  # (canon's own-children reader)
    out = [names.get(v.get("id"), v.get("id")) for v in vs]
    for ch in rec["el"].iter("choice"):
        if ch.get("type") == "SUBSELECT":
            ref = ch.get("ref") or "option"
            out += [rec.get("options", {}).get(f"{ref}.{s.get('id')}", s.get("id")) for s in ch if s.tag == "subOption"]
    return [x for x in out if x]


def book_split(rec, idx, kind):
    """The entries a book printed one per option or variant of the record under its own shorter name (`Rapid Transit
    (basic)` … `(diamond)` of Commlink6's `AV Rapid Transit`): of the record's source and kind, an entry whose name less
    its bracket ends the record's name and whose bracket is one of the record's option or variant names. [] else."""
    words, names = _words(rec["name"]), pick_names(rec)
    src = canon.canonical(rec)["src"]
    out = []
    for (s, k, oid), e in idx.items():
        m = re.fullmatch(r"(.+?)\s*\(([^()]*)\)\s*", e["name"])
        if s != src or k != kind or not m or not names:
            continue
        base = re.findall(r"[a-z0-9]+", m.group(1).casefold())
        if (
            base
            and rec["name"].casefold().split()[-len(base) :] == base
            and base[0] in words
            and split(e["name"], names)
        ):
            out.append((s, k, oid))
    return out


def matches(recs, runs):
    """{(src, kind, cl6 id lower): {(kind, our id)}}: the checker's matcher (markers.pairs: every matched record) and
    the report of the import (`<runs>-report/cl6-diffs.csv`, when there is one)."""
    from tools.cl6check.markers import pairs  # pylint: disable=import-outside-toplevel  # (markers imports split)

    out = defaultdict(set)
    for rec, o in pairs(recs, runs):
        out[o["src"], canon.canonical(rec)["kind"], rec["id"].lower()].add((o["kind"], o["id"]))
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
    found = matches(recs, runs)
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
    sibs = defaultdict(list)  # (the entries of a source and kind, by first word: split entries' siblings)
    for src, kind, oid in idx:
        sibs[src, kind, (idx[src, kind, oid]["name"].split() or [""])[0].casefold()].append(idx[src, kind, oid]["name"])

    def siblings(e):
        return sibs[e["src"], e["kind"], (e["name"].split() or [""])[0].casefold()]

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
            or {(k, oid) for _s, k, oid in book_split(rec, idx, c["kind"])}
        )  # (a name fallback only in Commlink6's own kind: a program Armor is no critter power)
        if c["kind"] == "qualities":  # (every entry a book split the quality into gets its option's data: split_kids)
            targets = set(targets) | {(k, oid) for _s, k, oid in book_split(rec, idx, c["kind"])}
        priced = any(True for _ in el.iter("subOption")) or (rec["attrs"].get("reqVariant") or "").casefold() in YES
        if not targets:
            if priced:
                left.append(f"{c['src']} {c['kind']} {rec['id']} ({rec['name']})")
            continue
        keys = [
            (t[1].split(".", 1)[0], ours.kind_of(held, t[1].split(".", 1)[0], t[1], t[0]) or t[0], t[1])
            for t in targets
        ]
        if priced and all(
            not option_kids(rec, idx[k]["name"], siblings(idx[k]))
            and variant_kids(rec, idx[k]["name"], None, siblings(idx[k])) is None
            for k in keys
            if k in idx
        ):
            stats["split by the book"] += 1  # (our entries are one per option or variant: nothing to pick)
        for kind, oid in sorted(targets):
            src, bare = oid.split(".", 1)
            kind = ours.kind_of(held, src, oid, kind) or kind
            e = idx.get((src, kind, oid))
            if not e or src not in tables:
                continue
            level = ours.rating_range(e.get("attrs", {}).get("rating"))
            level = level[0] if level and level[0] == level[1] else None
            new = option_kids(rec, e["name"], siblings(e))
            vk = variant_kids(rec, e["name"], level, siblings(e))
            # (a quality the book split per option: that option's own data on the entry, split_kids)
            sk = split_kids(rec, e["name"]) if kind == "qualities" and not new else []
            if not new and not vk and not sk:
                continue
            rows = tables[src]
            row = next((r for r in rows if r.get("gen") == "family" and r["kind"] == kind and r["id"] == bare), None)
            if row is None:
                row = {"cl6": rec["name"], "kind": kind, "id": bare, "kids": [], "gen": "family"}
                rows.append(row)
                stats["new rows"] += 1
            out, placed = [], vk is None
            for k in row.get("kids", []):  # (the variants where the row had them; earlier generated kids replaced)
                if (
                    k["tag"] == "option"
                    or (k["tag"] == "effect" and ({"option", "variant"} & set(k["attrs"])))
                    or "split" in k.get("attrs", {})
                ):
                    continue
                if k["tag"] == "variant" and vk is not None:
                    if not placed:
                        out += vk
                        placed = True
                    continue
                out.append(k)
            row["kids"] = out + new + ([] if placed else vk)
            if sk:
                row["kids"] = _place_split(row, sk)
                stats["split entries"] += 1
                stats["split kids"] += sum(1 for k in row["kids"] if "split" in k.get("attrs", {}))
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
