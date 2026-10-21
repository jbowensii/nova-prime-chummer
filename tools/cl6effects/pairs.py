"""Join every matched (CL6 record, our entry) pair with the raw CL6 modifications, our <effect>/<modifier> children and
text. Reads the rebuilt runs; changes nothing."""

import collections
import os
import re
import xml.etree.ElementTree as ET

from tools.cl6check import __main__ as M
from tools.cl6check import modifiers, ours

# pylint: disable=protected-access  # the pairing reads the importer's entry lists


def raw_mods(el):
    """every modification element of a record with its block context"""
    out = []
    blocks = (
        [(el, "")]
        + [(x, f"{x.tag}:{x.get('id') or ''}") for x in el if x.tag in ("mode", "variant")]
        + [(x, f"role:{x.tag}") for x in el if x.tag in ("magician", "adept")]
    )
    for b, ctx in blocks:
        for ms in b.findall("modifications"):
            sel = set()
            for s in ms.iter("selmod"):
                for x in s.iter():
                    sel.add(id(x))
            for m in ms.iter():
                if m.tag in modifiers.UNSTATED or m.tag in ("modifications", "selmod"):
                    continue
                d = dict(m.attrib)
                d["_tag"], d["_ctx"], d["_sel"] = m.tag, ctx, id(m) in sel
                out.append(d)
    return out


def base(n):
    """The comparable name: without parentheses, casefolded."""
    return re.sub(r"\s*\([^)]*\)\s*", " ", n or "").strip().casefold()


def build(cl6, runs):
    """-> (rows, idx): rows for evaluate.eval_all, idx = our effect children by entry id and (kind, id)."""
    orig = ours._entries

    def patched(src_dir, src):
        out = orig(src_dir, src)
        els = {}
        for n in sorted(os.listdir(src_dir)):
            kind = n[:-4]
            if not n.endswith(".xml") or kind in ours.SKIP:
                continue
            for e in ET.parse(os.path.join(src_dir, n)).getroot():
                els[(kind, e.get("id", ""))] = e
        for e in out:
            e["el"] = els.get((e["kind"], e["id"]))
        return out

    ours._entries = patched
    try:
        mine = ours.load(runs)
    finally:
        ours._entries = orig
    _, _, pairs = M.compare(cl6, mine, pdf=False)
    groups, bygroup = collections.defaultdict(list), collections.defaultdict(
        list
    )  # (bygroup: the entries printed under one group heading, `Awareness` Basic and Tactical)
    for sr in mine.values():
        for e in sr.entries:
            groups[(e["src"], e["kind"], base(e["name"]))].append(e)
            g = (e.get("attrs") or {}).get("group")
            if g:
                bygroup[(e["src"], e["kind"], g)].append(e)

    def kids(el):
        return [dict(k.attrib) | {"_tag": k.tag} for k in el]

    rows = []
    for c, o in pairs:
        src, el = o["src"], o.get("el")
        sib = [x for x in groups[(src, o["kind"], base(o["name"]))] if x is not o and x.get("el") is not None]
        g = (o.get("attrs") or {}).get("group")
        if g and not sib:
            sib += [x for x in bygroup[(src, o["kind"], g)] if x is not o and x not in sib and x.get("el") is not None]
        rows.append(
            {
                "siblings": [{"id": x["id"], "name": x["name"], "kids": kids(x["el"])} for x in sib],
                "cl6": {
                    "src": c["src"],
                    "tag": c["tag"],
                    "id": c["id"],
                    "name": c["name"],
                    "kind": c["kind"],
                    "class": c.get("cl6_class", ""),
                    "attrs": dict(c["el"].attrib),
                    "mods": raw_mods(c["el"]),
                    "variants": [v.get("id") for v in c["el"].findall("variant")],
                    "fam": sorted(c["families"].keys()),
                },
                "our": {
                    "src": src,
                    "kind": o["kind"],
                    "id": o["id"],
                    "name": o["name"],
                    "attrs": o["attrs"],
                    "kids": kids(el) if el is not None else [],
                    "text": mine[src].texts.get(o["id"], "") if src in mine else "",
                },
            }
        )
    idx = {e["id"]: kids(e["el"]) for sr in mine.values() for e in sr.entries if e.get("el") is not None}
    idx.update(
        {(e["kind"], e["id"]): kids(e["el"]) for sr in mine.values() for e in sr.entries if e.get("el") is not None}
    )
    return rows, idx
