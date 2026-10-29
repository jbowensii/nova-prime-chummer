"""Makes the per-vehicle mod-slot rows (`"gen": "slot"`) from Commlink6: each drivable vehicle's declared slot-family
capacities (its `<valmod/itemmod type="HOOK" ref="VEHICLE_*" value="N">`: accessory, tires, cf, hardpoint, chassis,
powertrain, electronics; the EXACT ref, incl `vehicle-weapon-small/-large/-military`) and each vehicle mod's `<fits>`
(its `usage mode="EMBEDDED" slot="VEHICLE_*"`), owner ruling 2026-10-27:

  python -m tools.cl6check.slotmap <runs dir> [--jar JAR] [--dry]

importer/sr6/overrides/<src>.json: one row `{"cl6", "cl6id", "kind", "id", "kids": [<slot id value>|<fits slot>...],
"gen": "slot"}` for each matched entry of kind vehicles/gear/weapons whose Commlink6 record declares a `vehicle-*` HOOK
or a `vehicle-*` EMBEDDED usage. The slots gate (fields.py) compares (type, normalized-id) tuples only — it ignores
slot VALUES and is one-directional — so a diff-driven generator (familymap, which reads cl6-diffs.csv) never emits the
hook VALUES. This one walks the matched pairs directly (maxmap style: `compare(...)[2]`). It is NOT the only source of
vehicle slots: importer/sr6/classes.py `associations()` still gives every vehicles.xml entry with a Body the six generic
value-less family slots (VEHICLE_MOD_SLOTS) and wheeled classes `vehicle-tires`; these rows add the values Commlink6
writes in its data, and the runtime (src/sr6/.../vehiclemods.ts) supplies the Body fallback where no value is given.
(Owner ruling 2026-10-29: the importer will compute the generic capacities the Commlink6 way, from Body/Seats/Pilot,
with these rows' values overriding them; until then the above holds.) Rows of an earlier run (`gen`) are replaced; the
rest of a table is left as it is. Read-only on the runs; no cl6check report."""

import json
import sys
from collections import defaultdict
from pathlib import Path

from tools.cl6check import canon, familymap
from tools.cl6check.classmap import OVERRIDES

KINDS = ("vehicles", "gear", "weapons")  # (a host vehicle; a vehicle mod; a vehicle-mounted weapon)


def vehicle_kids(rec, rating):
    """The slot/fits kids of a Commlink6 record that name a `vehicle-*` slot (its HOOK values and EMBEDDED fits), with
    their capacity values; [] when it declares none."""
    _, kids = familymap.structure({"el": rec["el"], "attrs": {}}, rating)
    return [
        k
        for k in kids
        if k["tag"] in ("slot", "fits") and (k["attrs"].get("id") or k["attrs"].get("slot", "")).startswith("vehicle-")
    ]


def rows_of(pairs):
    """{src: [row]} — one `gen="slot"` row per matched entry (kind vehicles/gear/weapons) whose Commlink6 record names
    a vehicle-* slot. `pairs` are (canonical Commlink6 record, our entry), as `compare(...)[2]` gives them; an entry
    several Commlink6 records match (a printing, a variant) is one row, its vehicle-* kids unioned."""
    by = {}  # (src, kind, oid) -> row
    for c, o in pairs:
        if o["kind"] not in KINDS or not o["id"].startswith(o["src"] + "."):
            continue
        kids = vehicle_kids(c, familymap.level(o))
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


def write_rows(rows, root=OVERRIDES):
    """Each table keeps its other rows; the generated ones replace the earlier `gen="slot"` ones. {src: count}."""
    done = {}
    for src in sorted({p.stem for p in Path(root).glob("*.json")} | set(rows)):
        path = Path(root) / f"{src}.json"
        old = json.loads(path.read_text(encoding="utf8")) if path.is_file() else []
        keep = [r for r in old if r.get("gen") != "slot"]
        new = rows.get(src, [])
        if len(keep) != len(old) or new:
            lines = ",\n".join("  " + json.dumps(r, ensure_ascii=False) for r in keep + new)
            path.write_text("[\n" + lines + "\n]\n" if keep or new else "[]\n", encoding="utf8", newline="\n")
        done[src] = len(new)
    return done


def main(argv):
    """Command line entry: the slot rows for a library import (or a folder of per-book runs) and a Commlink6 jar."""
    args = [a for a in argv if not a.startswith("--")]
    jar = argv[argv.index("--jar") + 1] if "--jar" in argv else None
    if not args:
        print(__doc__)
        return 2
    from tools.cl6check import ours, reader
    from tools.cl6check.__main__ import compare

    recs, _ = reader.read(reader.find_jar(jar if jar and not jar.startswith("--") else None))
    pairs = compare([canon.canonical(r) for r in recs], ours.load(args[0]), pdf=False)[2]
    rows = rows_of(pairs)
    print(f"slot rows: {sum(map(len, rows.values()))} in {len(rows)} tables")
    if "--dry" not in argv:
        print("rows per table:", write_rows(rows))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
