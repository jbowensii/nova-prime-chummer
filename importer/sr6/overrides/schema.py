"""What a catalog kind's schema allows an override to write: allowed() reads it, fit() takes the rest out of the id rows."""
import os
import sys
from functools import lru_cache


@lru_cache(maxsize=None)
def allowed(kind):
    """The attributes the entry of catalog kind `kind` may carry (its schema's, read from public/data/sr6/schema), or None
    for a kind with no schema. An override or a generator writes no attribute outside this set."""
    from lxml import etree

    from importer.sr6 import KINDS, SCHEMA_DIR
    if kind not in KINDS or not os.path.isfile(os.path.join(SCHEMA_DIR, f"{kind}.xsd")):
        return None
    xs = "{http://www.w3.org/2001/XMLSchema}"
    docs = [etree.parse(os.path.join(SCHEMA_DIR, f"{n}.xsd")).getroot() for n in (kind, "common")]
    defs = {(n.tag, n.get("name")): n for d in docs for n in d.iter(xs + "complexType", xs + "attributeGroup") if n.get("name")}
    names = set()

    def walk(node):  # (the attributes of a type: its own, its attribute groups', its base's; not the content model's)
        for c in node:
            if c.tag == xs + "attribute":
                names.add(c.get("name") or c.get("ref"))
            elif c.tag == xs + "attributeGroup" and c.get("ref"):
                walk(defs[xs + "attributeGroup", c.get("ref").split(":")[-1]])
            elif c.tag in (xs + "complexContent", xs + "simpleContent", xs + "extension", xs + "restriction"):
                base = (c.get("base") or "").split(":")[-1]
                if (xs + "complexType", base) in defs:
                    walk(defs[xs + "complexType", base])
                walk(c)
    el = next(e for e in docs[0].iter(xs + "element") if e.get("name") == KINDS[kind])
    walk(defs[xs + "complexType", el.get("type").split(":")[-1]] if el.get("type") else el.find(xs + "complexType"))
    return frozenset(names)


def fit(rows):
    """The id rows with the attributes their kind's schema lacks taken out (a row left with nothing to set, add or
    replace is dropped): one line on stderr for each row that loses some, never invalid xml."""
    out = []
    for r in rows:
        ok = allowed(r["kind"])
        bad = [k for k in r.get("set", {}) if ok is not None and k not in ok]
        if bad:
            print(f"override {r.get('cl6') or r.get('id')}: {r['kind']}.xml has no {', '.join(bad)} on its entries, skipped", file=sys.stderr)
            r = {**r, "set": {k: v for k, v in r["set"].items() if k not in bad}, **({"formula": {k: v for k, v in r["formula"].items() if k not in bad}} if "formula" in r else {})}
            if not (r["set"] or r.get("kids") or r.get("effects") or r.get("formula") or r.get("drops")):
                continue
        out.append(r)
    return out
