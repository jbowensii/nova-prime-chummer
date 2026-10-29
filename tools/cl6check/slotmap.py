"""Makes the hook rows (`"gen": "slot"`) from Commlink6 (fit plan Stage 2.1): for every matched entry, the hooks its
Commlink6 record's DATA gives (the code's are rules, importer/sr6/hooks.py, applied by classes.associations):

  python -m tools.cl6check.slotmap <runs dir> [--jar JAR] [--dry]

importer/sr6/overrides/<src>.json: one row `{"cl6", "cl6id", "kind", "id", "kids", "gen": "slot"}` per matched entry
whose record declares any, with kids
- `<slot id value? remove?>` each `itemmod/valmod type=HOOK` (the record's and its variants'; the value at the entry's
  level; `remove="true"` a hook the record takes away). A hook its variants give different capacities (a cyberarm: 8
  synthetic, 15 obvious) takes the variant the entry is: the one whose capacity the entry prints, else whose id's words
  its name carries, else the first (counted in `variant.first`, listed in the run's output);
- `<fits slot cost? mode>` each `<usage>` with a slot (cost: the usage value; mode: embedded, implanted, carried,
  virtual);
- `<prerequisite kind type ref value? apply? group negate?>` each test of its `<requires>`, grouped (group 0 all must
  hold; each `<selreq>` its own group 1, 2 …, any one holds).
This generator is the one emitter of those kids for a matched entry: it takes them out of the entry's `gen: "family"`
rows (familymap's older, flattened copies; a family prerequisite Commlink6 does not give, the owner's, stays). The slots
gate (fields.py) compares ids only, so the values come from here. Read-only on the runs; no cl6check report."""

import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

from tools.cl6check import canon, familymap, hookmap
from tools.cl6check.classmap import OVERRIDES

TAGS = ("slot", "fits", "prerequisite")


def _variant_pick(hooks_by_var, entry):
    """The variant id whose HOOK capacities the entry takes (see the module doc), and whether it was a guess."""
    cap = (entry.get("attrs", {}).get("capacity") or "").strip()
    name = (entry.get("name") or "").casefold()
    for var, caps in hooks_by_var.items():
        if cap and any(v == cap for v in caps.values()):
            return var, False
    for var in hooks_by_var:
        if var and all(w in name for w in re.split(r"[_\W]+", var.casefold()) if len(w) > 2):
            return var, False
    return next(iter(hooks_by_var)), True


def kids_of(rec, entry, rating, report=None):
    """The slot/fits/prerequisite kids Commlink6's record gives our entry."""
    report = Counter() if report is None else report
    el = rec["el"]
    by_var = defaultdict(dict)  # {variant: {hook: value}}
    removes, pos = {}, {}  # (a removal and a value's first place in the data: applied in that order)
    for var, scope in hookmap._scopes(el):  # pylint: disable=protected-access
        for x in hookmap._walk(scope):  # pylint: disable=protected-access
            if x.tag in ("valmod", "itemmod") and x.get("type") == "HOOK" and x.get("ref"):
                pos.setdefault((x.get("ref"), x.get("remove") == "true"), len(pos))
                if x.get("remove") == "true":
                    removes.setdefault(x.get("ref"), None)
                else:
                    by_var[var].setdefault(x.get("ref"), familymap.slot_value(x, rating))
    hooks = dict(by_var.pop(None, {}))
    multi = [h for h in {h for c in by_var.values() for h in c} if len({c.get(h) for c in by_var.values()}) > 1]
    if multi:
        var, guess = _variant_pick(by_var, entry)
        report["variant.first" if guess else "variant.matched"] += 1
        for h in multi:
            hooks.setdefault(h, by_var[var].get(h))
    for c in by_var.values():
        for h, v in c.items():
            hooks.setdefault(h, v)

    def rm(h):
        return {"tag": "slot", "attrs": {"id": hookmap.norm(h), "remove": "true"}}

    kids = [rm(h) for h in removes if pos[h, True] < pos.get((h, False), -1)]  # (taken away, then given back)
    kids += [{"tag": "slot", "attrs": {"id": hookmap.norm(h), **({"value": v} if v else {})}} for h, v in hooks.items()]
    kids += [rm(h) for h in removes if rm(h) not in kids]
    seen = set()
    for u in hookmap.usages(el):
        if u["source"] != "data" or not u["hook"] or u["hook"] in seen:
            continue
        seen.add(u["hook"])
        cost = u["cost"]
        cost = f"{cost:g}" if isinstance(cost, float) else (str(cost) if cost is not None else None)
        attrs = {
            "slot": hookmap.norm(u["hook"]),
            **({"cost": cost} if cost else {}),
            **({"mode": u["mode"].lower()} if u["mode"] else {}),
        }
        kids.append({"tag": "fits", "attrs": attrs})
    for r in hookmap.requirements(el):
        if r["variant"]:
            report[
                "req.variant"
            ] += 1  # (a variant's own: one entry can't hold per-variant tests; cl6check compares the item's)
            continue
        attrs = {"kind": r["tag"], "type": r["type"], "ref": r["ref"], "value": r["value"], "apply": r["apply"]}
        attrs = {k: v for k, v in attrs.items() if v}
        if r["group"]:
            attrs["group"] = str(r["group"])
        if r["negate"]:
            attrs["negate"] = "true"
        if attrs not in [k["attrs"] for k in kids if k["tag"] == "prerequisite"]:
            kids.append({"tag": "prerequisite", "attrs": attrs})
    return kids


def rows_of(pairs, report=None):
    """{src: [row]}: one `gen="slot"` row per matched entry whose Commlink6 record gives a hook, a usage with
    a slot or a requirement. `pairs` are (canonical Commlink6 record, our entry), as `compare(...)[2]` gives them; an
    entry several records match (printings) is one row, its kids unioned."""
    by = {}  # (src, kind, oid) -> row
    for c, o in pairs:
        if not o["id"].startswith(o["src"] + "."):
            continue
        kids = kids_of(c, o, familymap.level(o), report)
        if not kids:
            continue
        key = (o["src"], o["kind"], o["id"])
        row = by.get(key)
        if row is None:
            by[key] = {
                "cl6": c["name"],
                "cl6id": c["el"].get("id"),
                "kind": o["kind"],
                "id": o["id"][len(o["src"]) + 1 :],
                "kids": kids,
                "gen": "slot",
            }
        else:
            row["kids"] += [k for k in kids if k not in row["kids"]]
    rows = defaultdict(list)
    for (src, _, _), row in by.items():
        rows[src].append(row)
    return rows


def _strip_family(old, new):
    """old's rows, each `gen: "family"` row of an entry `new` has a row for less its slot and fits kids and the
    prerequisites Commlink6 gives (new's, compared without group/negate/apply); a row left with nothing goes."""
    have = {(r["kind"], r["id"]): r for r in new}
    out = []
    for r in old:
        n = have.get((r["kind"], r["id"])) if r.get("gen") == "family" else None
        if n is None:
            out.append(r)
            continue
        cl6 = {
            tuple(k["attrs"].get(a) for a in ("kind", "type", "ref", "value"))
            for k in n["kids"]
            if k["tag"] == "prerequisite"
        }
        kids = [
            k
            for k in r.get("kids", [])
            if k["tag"] not in ("slot", "fits")
            and not (
                k["tag"] == "prerequisite" and tuple(k["attrs"].get(a) for a in ("kind", "type", "ref", "value")) in cl6
            )
        ]
        r = {k: v for k, v in {**r, "kids": kids}.items() if k != "kids" or v}
        if r.get("kids") or r.get("set"):
            out.append(r)
    return out


def write_rows(rows, root=OVERRIDES):
    """Each table keeps its other rows; the generated ones replace the earlier `gen="slot"` ones and their kids leave
    the family rows. {src: count}."""
    done = {}
    for src in sorted({p.stem for p in Path(root).glob("*.json")} | set(rows)):
        path = Path(root) / f"{src}.json"
        old = json.loads(path.read_text(encoding="utf8")) if path.is_file() else []
        new = rows.get(src, [])
        keep = _strip_family([r for r in old if r.get("gen") != "slot"], new)
        if keep + new != old:
            lines = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in keep + new)
            path.write_text("[\n" + lines + "\n]\n" if keep or new else "[]\n", encoding="utf8", newline="\n")
        done[src] = len(new)
    return done


def main(argv):
    """Command line entry: the hook rows for a library import (or a folder of per-book runs) and a Commlink6 jar."""
    args = [a for a in argv if not a.startswith("--")]
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    args = [a for a in args if a != jar]
    if not args:
        print(__doc__)
        return 2
    from tools.cl6check import ours, reader  # pylint: disable=import-outside-toplevel
    from tools.cl6check.__main__ import compare  # pylint: disable=import-outside-toplevel

    recs, _ = reader.read(reader.find_jar(jar))
    pairs = compare([canon.canonical(r) for r in recs], ours.load(args[0]), pdf=False)[2]
    report = Counter()
    rows = rows_of(pairs, report)
    print(f"slot rows: {sum(map(len, rows.values()))} in {len(rows)} tables; {dict(report)}")
    if "--dry" not in argv:
        print("rows per table:", write_rows(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
