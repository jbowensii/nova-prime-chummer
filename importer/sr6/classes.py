"""Commlink6's own classification on our entries (docs/sr6-data-format.md, the `class` attribute): its TYPE/SUBTYPE keys,
verbatim. classes/category_class.json ({kind: {category: class}}, made by tools/cl6check/classmap.py from the categories
whose entries Commlink6 classes alike, 90% or more) gives every entry of such a category its class; one the table doesn't
reach gets none (we invent no class for what Commlink6 doesn't have), and an entry that has a class already, one the
per-book override table set, keeps it. The Foundry module translates the keys to Eden's later."""
import json
import re
from pathlib import Path

from importer.sr6 import overrides

FILE = Path(__file__).with_name("classes") / "category_class.json"


def table(path=FILE):
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else {}


def apply(files, cmap=None):
    """files ({<kind>.xml: xml}) with `class` set on each entry whose (kind, category) is in the map, and on each
    categories.xml entry of such a category (its `of` kind and name)."""
    cmap = table() if cmap is None else cmap
    if not cmap:
        return files
    from lxml import etree
    out = dict(files)
    for name, xml in files.items():
        kind = name[:-4]
        if not xml or not name.endswith(".xml") or kind not in cmap and kind != "categories":
            continue
        root = etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))
        changed = False
        for e in root:
            if not isinstance(e.tag, str) or e.get("class"):
                continue
            if kind == "categories":
                cls = cmap.get(e.get("of") or "", {}).get(e.findtext("name") or "")
            else:
                cls = cmap[kind].get(e.get("category") or (e.get("type") if kind == "programs" else "") or "")
            if cls:
                e.set("class", cls)
                changed = True
        if changed:
            out[name] = overrides.dump(xml, root)
    return out
