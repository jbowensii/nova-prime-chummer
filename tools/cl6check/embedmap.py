"""Stage 0 of the vehicle decomposition plan (docs/analysis/sr6-vehicle-decomposition.md, Appendix A): what Commlink6
embeds in each vehicle and how each embedded ref resolves. Measurement only; it changes nothing.

  python -m tools.cl6check embedmap [--jar <jar>] [--ours <custom/sr6 folder>]

Placements are (vehicle id, ref, intoRef). The plan's counts (the gate) are the distinct placements over every record of
a vehicle id, German-rules records included, as its appendix measured them; the second block is the same measurement on
each vehicle's latest printing alone (owner ruling D7: the newest printing's whole embed set, never merged). No jar:
skipped, exit 0."""

import difflib
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from tools.cl6check import corpus, reader

REPO = Path(__file__).resolve().parents[2]
SOURCES = REPO / "public" / "data" / "sr6" / "sources.xml"
# the jar's book folders -> sources.xml ids (only for ordering printings; an unknown book sorts first)
SOURCE = {
    "core": "CRB", "double_clutch": "DC", "deadly_arts": "DA", "tarnished_star": "TS", "krime": "KK",
    "astral_ways": "AW", "sif_new_orleans": "CRB-SEA", "bestial_nature": "BN", "hack_slash": "HS",
    "no_future": "NF", "companion": "SWC", "dealers_of_death": "DD",
}  # fmt: skip
GATE = {  # the plan's numbers (section 1.2 and Appendix A), for the pass/fail lines
    "vehicle records": 337, "with embeds": 251, "without": 86, "distinct placements": 1056,
    "usage-match": 792, "other-usage": 128, "no-usage": 121, "undefined": 15,
    "undefined refs": 13, "ids with geardef": 14, "inline parts": 19, "included placements": 58,
}  # fmt: skip


def classify(ref, into, defs):
    """A placement's ref resolution: `undefined` (ref defined nowhere), `no-usage` (no <usage slot>), `usage-match`
    (a usage slot equals the hook it is embedded in) or `other-usage`. defs: {item id: set of usage slots}, geardef
    children included (an inline part is classed by its usage, and counted inline by measure)."""
    if ref not in defs:
        return "undefined"
    slots = defs[ref]
    return "usage-match" if into in slots else "other-usage" if slots else "no-usage"


def resolve_ref(ref, defs, variants):
    """(rule, base, rating, variant) for an undefined ref, structured (Stage 2 reads it; `resolve` words it): the
    plan's section 4.1/4.6 rule that hit: R-a `<base><n>` / `<base>_<n>` with a defined base (a rating, or one variant
    ending in n: M3), R-b the longest defined prefix whose remainder is a variant of it, or a variant held by exactly
    one item (M5), `R-b ambiguous` (variant: the sorted candidates) when several variants fit, `fuzzy (M6)` (>=75% name
    match to one id), else `unresolved` (base None)."""
    m = re.fullmatch(r"(.+?)_?(\d+)", ref)
    if m and m[1] in defs:
        tail = [v for v in variants.get(m[1], ()) if v.endswith(m[2])]
        return ("R-a (M3 variant)", m[1], None, tail[0]) if len(tail) == 1 else ("R-a rating", m[1], m[2], None)
    for base in sorted((b for b in defs if ref.startswith(b + "_") and variants.get(b)), key=len, reverse=True):
        rest = ref[len(base) + 1 :]
        fit = [v for v in variants[base] if v == rest] or [v for v in variants[base] if rest in v.split("_")]
        if len(fit) == 1:
            return "R-b", base, None, fit[0]
        if fit:
            return "R-b ambiguous", base, None, sorted(fit)
    toks = ref.split("_")
    for i in range(1, len(toks)):
        held = [b for b, vs in variants.items() if "_".join(toks[i:]) in vs]
        if len(held) == 1:
            return "R-b (M5)", held[0], None, "_".join(toks[i:])
    near = difflib.get_close_matches(ref, list(defs), 2, 0.75)
    return ("fuzzy (M6)", near[0], None, None) if len(near) == 1 else ("unresolved", None, None, None)


def resolve(ref, defs, variants):
    """(rule, target) text of resolve_ref, for the measurement's printout."""
    rule, base, rating, variant = resolve_ref(ref, defs, variants)
    if base is None:
        return rule, ""
    if isinstance(variant, list):
        return rule, f"{base}/{{{', '.join(variant)}}}"
    return rule, f"{base}/{variant}" if variant else f"{base} rating {rating}" if rating else base


def read_jar(jar):
    """(vehicles, defs, variants): vehicles [{id, book, lang, type, order, geardef ids, embeds}] in jar order (every
    top-level <item> with a <vehicle> child, books not de_*/placeholder/icons); defs {item id: usage slots} over every
    top-level <item> and <geardef> child, as {slot: usage value}; variants {item id: {variant id: {slot: usage value}}}.
    """
    vehicles, defs, variants = [], defaultdict(dict), defaultdict(dict)
    with zipfile.ZipFile(jar) as z:
        for n in sorted(z.namelist()):
            m = re.match(re.escape(reader.ROOT) + r"([^/]+)/data/.*\.xml$", n)
            if not m or reader.GERMAN.match(m[1]) or m[1] in ("placeholder", "icons"):
                continue
            try:
                root = ET.fromstring(z.read(n))
            except ET.ParseError:
                continue
            for el in root:
                if el.tag != "item" or not el.get("id"):
                    continue
                geo = el.findall("geardef/item")
                for it in [el, *geo]:
                    defs[it.get("id")].update({u.get("slot"): u.get("value") for u in it.findall("usage")})
                    for v in it.findall("variant"):
                        variants[it.get("id")][v.get("id")] = {
                            u.get("slot"): u.get("value") for u in v.findall("usage")
                        }
                if el.find("vehicle") is not None:
                    emb = [
                        {
                            k: x.get(k)
                            for k in (
                                "type",
                                "ref",
                                "intoRef",
                                "intoId",
                                "id",
                                "included",
                                "variant",
                                "rating",
                                "count",
                            )
                        }
                        for x in el.findall("modifications/embed")
                    ]
                    vehicles.append(
                        {"id": el.get("id"), "book": m[1], "lang": el.get("lang"), "type": el.get("type"),
                         "order": len(vehicles), "geardef": [g.get("id") for g in geo], "embeds": emb}
                    )  # fmt: skip
    return vehicles, dict(defs), dict(variants)


def latest(vehicles, published):
    """{vehicle id: its newest printing's record}: by the book's sources.xml month, a non-German record before a
    German-rules one of the same book, then the later in the jar."""

    def key(v):
        return (published.get(SOURCE.get(v["book"], ""), ""), v["lang"] != "de", v["order"])

    best = {}
    for v in vehicles:
        if v["id"] not in best or key(v) > key(best[v["id"]]):
            best[v["id"]] = v
    return best


def measure(records, defs, variants):
    """The counts for a set of vehicle records (a vehicle id's embeds are the union of its records')."""
    ids = {v["id"] for v in records}
    place, included = {}, set()
    inline = {g for v in records for g in v["geardef"]}
    for v in records:
        for e in v["embeds"]:
            k = (v["id"], e["ref"], e["intoRef"])
            place[k] = classify(e["ref"], e["intoRef"], defs)
            if e["included"] == "true":
                included.add(k)
    withe = {k[0] for k in place}
    cls = Counter(place.values())
    und = sorted({k[1] for k, c in place.items() if c == "undefined"})
    return {
        "vehicle records": len(ids), "with embeds": len(withe), "without": len(ids - withe),
        "distinct placements": len(place),
        **{c: cls[c] for c in ("usage-match", "other-usage", "no-usage", "undefined")},
        "undefined refs": len(und), "ids with geardef": len({v["id"] for v in records if v["geardef"]}),
        "inline parts": len(inline), "included placements": len(included),
        "inline placements": sum(1 for k in place if k[1] in inline),
        "_und": [(r, *resolve(r, defs, variants), sorted({k[0] for k, c in place.items() if k[1] == r})) for r in und],
    }  # fmt: skip


def ours(folder):
    """Counts of our imported <builtin> parts (G6): entries with any, builtins carrying a ref (the importer's name
    match, resolve._mod_ref), builtins without one, and box-line notes."""
    c = Counter()
    for f in Path(folder).rglob("*.xml"):
        try:
            root = ET.parse(f).getroot()
        except ET.ParseError:
            continue
        for e in root.iter():
            b = [x for x in e if x.tag == "builtin"]
            if b:
                c["entries with builtins"] += 1
                c["builtins"] += len(b)
                c["builtins with ref (name match)"] += sum(1 for x in b if x.get("ref"))
                c["builtins without ref"] += sum(1 for x in b if not x.get("ref"))
            c["builtin notes"] += sum(1 for x in e if x.tag == "note" and x.get("field") == "builtin")
    return c


def main(argv):
    """Print the measurement; always 0 (a gate miss is printed, it is evidence, not a build step)."""
    jar, folder, args = None, None, list(argv)
    while args:
        a = args.pop(0)
        if a == "--jar":
            jar = args.pop(0)
        elif a == "--ours":
            folder = args.pop(0)
    jar = reader.find_jar(jar)
    if jar is None:
        print("cl6check embedmap: no Commlink6 jar (--jar or $CL6_JAR): nothing to measure, skipped.")
        return 0
    vehicles, defs, variants = read_jar(jar)
    allp = measure(vehicles, defs, variants)
    print(f"embedmap: {jar.name}; {len(vehicles)} vehicle records\n\nall printings (the plan's gate):")
    ok = True
    for k, want in GATE.items():
        ok &= allp[k] == want
        print(f"  {k:22} {allp[k]:>6}  {'ok' if allp[k] == want else f'MISMATCH (plan: {want})'}")
    print(f"  {'inline placements':22} {allp['inline placements']:>6}")
    print(f"gate: {'PASS' if ok else 'FAIL'}\n\nundefined refs (rule, target, vehicles):")
    for ref, rule, target, vs in allp["_und"]:
        print(f"  {ref:26} {rule:16} {target:42} {', '.join(vs)}")
    lat = measure(list(latest(vehicles, corpus.published(SOURCES)).values()), defs, variants)
    print("\nlatest printing only (D7):")
    for k in [*GATE, "inline placements"]:
        print(f"  {k:22} {lat[k]:>6}")
    if folder:
        print(f"\nours ({folder}):")
        for k, v in sorted(ours(folder).items()):
            print(f"  {k:32} {v:>6}")
        from tools.cl6check import vehicleparts

        if vehicleparts.OUT.is_file():
            lines, ok = vehicleparts.gate(
                folder,
                json.loads(vehicleparts.OUT.read_text(encoding="utf8")),
                latest(vehicles, corpus.published(SOURCES)),
            )
            print("\nStage 2 gate (vehicle_parts.json vs the D7 oracle and this import):")
            print("\n".join("  " + x for x in lines) + f"\n  gate: {'PASS' if ok else 'FAIL'}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
