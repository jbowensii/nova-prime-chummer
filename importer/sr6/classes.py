"""Commlink6's own classification on our entries (docs/sr6-data-format.md, the `class` attribute): its TYPE/SUBTYPE
keys, verbatim. classes/category_class.json ({kind: {category: class}}, made by tools/cl6check/classmap.py from the
categories whose entries Commlink6 classes alike, 90% or more) gives every entry of such a category its class; one the
table doesn't reach gets none (we invent no class for what Commlink6 doesn't have), and an entry that has a class
already, one the per-book override table set, keeps it. The Foundry module translates the keys to Eden's later.
classes/section_prefix.json then gives every entry of a source's section, by kind and printed page, one class, whatever
it had: a deliberate extra (classes/extra_classes.json: not Commlink6's), or Commlink6's own where the rule says so
(`"commlink6": true`). Body Shop's critter-only chapter is all `CRITTERWARE/AUGMENTATION`, which the app keeps out of
the player's pickers; the Companion's Infected qualities are `INFECTED` and its Infected optional powers
`INFECTED/OPTIONAL_POWER`, which the app offers only with the table's infectedAllowed rule on."""

import json
import re
from pathlib import Path

from importer.sr6 import overrides

FILE = Path(__file__).with_name("classes") / "category_class.json"
PREFIXES = Path(__file__).with_name("classes") / "section_prefix.json"
EXTRA = Path(__file__).with_name("classes") / "extra_classes.json"


def table(path=FILE):
    """The class table read from `path`, else empty."""
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else {}


def extra(path=EXTRA):
    """{class: reason} of the deliberate extra classes (not Commlink6's): a class of ours that no Commlink6 record
    has."""
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else {}


def prefixes(path=PREFIXES):
    """The section classes: [{src, kinds, pages: [first, last], class}]."""
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else []


def in_section(rule, src, kind, page):
    """Whether an entry of source `src`, `kind` and printed `page` lies in the section `rule` names."""
    try:
        n = int(page)
    except (TypeError, ValueError):
        return False
    return (
        (src or "").lower() == rule["src"].lower()
        and kind in rule["kinds"]
        and rule["pages"][0] <= n <= rule["pages"][1]
    )


def apply(files, cmap=None, src=None, rules=None):
    """files ({<kind>.xml: xml}) with `class` set on each entry whose (kind, category) is in the map, and on each
    categories.xml entry of such a category (its `of` kind and name)."""
    cmap = table() if cmap is None else cmap
    rules = [r for r in (prefixes() if rules is None else rules) if (src or "").lower() == r["src"].lower()]
    if not cmap and not rules:
        return files
    from lxml import etree

    out = dict(files)
    for name, xml in files.items():
        kind = name[:-4]
        sect = [r for r in rules if kind in r["kinds"]]
        if not xml or not name.endswith(".xml") or kind not in cmap and kind != "categories" and not sect:
            continue
        root = etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))
        changed = False
        for e in root:
            if not isinstance(e.tag, str):
                continue
            if not e.get("class"):
                if kind == "categories":
                    cls = cmap.get(e.get("of") or "", {}).get(e.findtext("name") or "")
                else:
                    cls = cmap.get(kind, {}).get(
                        e.get("category") or (e.get("type") if kind == "programs" else "") or ""
                    )
                if cls:
                    e.set("class", cls)
                    changed = True
            for r in sect:  # (the section's class, whatever the entry had: the map's, a row's, Commlink6's)
                if in_section(r, src, kind, e.get("page")) and e.get("class") != r["class"]:
                    e.set("class", r["class"])
                    changed = True
        if changed:
            out[name] = overrides.dump(xml, root)
    return out
