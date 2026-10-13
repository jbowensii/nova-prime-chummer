"""Our imported catalog in the canonical shape of canon.py.

`load(path)` takes a custom/sr6 folder, or a folder of `python -m importer sr6 check` runs (each with custom/sr6 and
library/sr6/book1), and returns {source id: Source}. A source printed by several runs (the core rulebook in each city
edition) is read from the first run in name order. Values stay as printed; `value()` reads them at a rating the way the
app's engine does (src/sr6/engine/values.ts rated())."""
import math
import os
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

from tools.cl6check import canon

COUNT = re.compile(r"\*\*[A-Za-z ]+:\*\*\s*(\d+)\s*[–-]\s*(\d+)\s*$", re.M)
SKIP = {"rules", "attributes", "priorities", "index", "sources", "samples", "categories"}
DASHES = {0x2013: "-", 0x2212: "-"}  # the printed en dash and minus sign
NONE = re.compile(r"^\s*[—–-]?\s*$")
LEGAL = re.compile(r"\s*(?:\(([LIF])\)|([LIF]))\s*$")


@dataclass
class Source:
    src: str
    entries: list = field(default_factory=list)
    book_dir: str | None = None  # library/sr6/<book>: import.xml, book.md, regrouped.md, original.pdf
    texts: dict = field(default_factory=dict)  # entry id → its description (custom/sr6/texts/<src>.xml; book text)


def value(s, rating=1):
    """A printed value at `rating` (rated(): numbers, Rating/Capacity/Force/Level, × x * / ^ + and parentheses; `/`
    only in a formula with the rating, rounding up; a legality suffix and a leading + ignored). None: no value or
    unreadable."""
    if s is None or NONE.match(s) or len(s) > 100:
        return None
    src = LEGAL.sub("", re.sub(r"(?i)\s+each\s*$", "", s.replace("¥", ""))).strip().lstrip("+")  # (`1500 each`)
    src = re.sub(r"(?<=\d),(?=\d{3}\b)", "", src)
    src = re.sub(r"[×x*]", " * ", src)
    src = re.sub(r"(?i)\b(?:rating|capacity|force|level)\b", " R ", src).strip()
    tokens = [t for t in re.split(r"\s*([*/^+()])\s*|\s+", src) if t]
    if "/" in tokens and "R" not in tokens:
        return None  # 300/350: two prices, not a division
    i = 0

    def factor():
        nonlocal i
        t = tokens[i] if i < len(tokens) else None
        i += 1
        if t == "R":
            return float(rating)
        if t == "(":
            v = expr()
            if i >= len(tokens) or tokens[i] != ")":
                raise ValueError
            i += 1
            return v
        if t is not None and re.fullmatch(r"\d+(?:\.\d+)?|\.\d+", t):
            return float(t)
        raise ValueError

    def power():
        nonlocal i
        v = factor()
        while i < len(tokens) and tokens[i] == "^":
            i += 1
            v = v ** factor()
        return v

    def term():
        nonlocal i
        v = power()
        while i < len(tokens) and tokens[i] in ("*", "/"):
            op = tokens[i]
            i += 1
            v = v * power() if op == "*" else math.ceil(v / power())
        return v

    def expr():
        nonlocal i
        v = term()
        while i < len(tokens) and tokens[i] == "+":
            i += 1
            v += term()
        return v

    try:
        v = expr()
    except (ValueError, ZeroDivisionError, OverflowError):
        return None
    return v if i == len(tokens) else None


def numbers(s):
    """Every number printed in a value ('100/month or 1,000/year' → {100, 1000})."""
    return {float(x.replace(",", "")) for x in re.findall(r"\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?", s or "")}


def rating_range(s):
    """(lo, hi) of '1–6', '3', 'Rating 1-4'; None for a dash or nothing."""
    nums = [int(x) for x in re.findall(r"\d+", s or "")]
    return (min(nums), max(nums)) if nums else None


def _norm(s):
    return re.sub(r"[^a-z0-9]+", "-", (s or "").casefold()).strip("-")


def families(e, kind=None):
    """The field families of one entry, in canon.families' shape. The elements are the gap plan's model (subtype,
    skill/spec, social, size/ammoClass, <variant>, <slot>/<fits>, <effect>/<test>/<grant>/<allow>, <choice>,
    <requires>, modonly/<flag>/<relevance>); a weapon accessory's printed MOUNT column already gives its fits."""
    a, out = e.attrib, {}
    if a.get("subtype"):
        out["subtype"] = (_norm(a["subtype"]),)
    if a.get("skill"):
        out["skill/spec"] = (_norm(a["skill"]), _norm(a.get("spec")))
    if a.get("social") not in (None, "") or kind == "armor":  # (armor with no social column: Commlink6's 0)
        s = (a.get("social") or "").translate(DASHES)
        out["social"] = (str(0.0 if NONE.match(s) else canon.cl6_value(s.lstrip("+"))),)
    if a.get("size") or a.get("ammoClass"):
        out["size/ammo"] = (_norm(a.get("size")), _norm(a.get("ammoClass")))
    vs = e.findall("variant")
    if vs:
        out["variants"] = frozenset(_norm(v.get("name") or v.findtext("name") or v.get("id")) for v in vs)
    slots = {("slot", _norm(s.get("id"))) for s in e.findall("slot")} | {("fits", _norm(f.get("slot")))
                                                                         for f in e.findall("fits")}
    if a.get("mount") and not NONE.match(a["mount"]):
        slots |= {("fits", _norm(m)) for m in re.split(r"\s*(?:/|,|\bor\b)\s*", a["mount"]) if m.strip()}
    if slots:
        out["slots"] = frozenset(slots)
    tags = {"effect": "effect", "test": "test", "grant": "grant", "allow": "allow"}
    eff = sorted((tags[x.tag], x.get("target", "").casefold() or f"{_norm(x.get('kind'))}:{_norm(x.get('ref'))}",
                  (x.get("value") or "").replace("+", "").casefold()) for x in e if x.tag in tags)
    if eff:
        out["effects"] = tuple(eff)
    ch = sorted(_norm(c.get("kind")) for c in e.findall("choice") if c.get("kind") != "rating")
    if ch:
        out["choices"] = tuple(ch)
    req = sorted((_norm(r.get("kind") or r.tag), _norm(r.get("ref") or r.get("target")))
                 for rq in e.findall("requires") for r in rq.iter() if r is not rq and r.tag not in ("any",))
    if req:
        out["requires"] = tuple(req)
    # (Commlink6's kind flags follow from our kind and category: the owned books print no flag)
    kind_flags = [{"augmentations": "augmentation", "electronics": "matrix_device"}.get(kind)] + [
        "codemod" if re.search(r"(?i)codemod", a.get("category") or "") else None]
    out.update(canon.ui_families([r.get("topic") for r in e.findall("relevance")],
                                 [f.text for f in e.findall("flag")] + kind_flags, a.get("modonly") == "true"))
    return out


def _entries(src_dir, src):
    out = []
    for n in sorted(os.listdir(src_dir)):
        kind = n[:-4]
        if not n.endswith(".xml") or kind in SKIP:
            continue
        for e in ET.parse(os.path.join(src_dir, n)).getroot():
            name = (e.findtext("name") or "").strip()
            if not name:
                continue
            attrs = dict(e.attrib)
            for f in e.findall("formula"):  # the importer's rule for a field, beside its printed value: formula:<field>
                expr = (f.text or "").strip()
                opts = ",".join(sorted({m for m in re.findall(r"opt\.([a-z0-9][a-z0-9.-]*[a-z0-9])", expr)}))
                attrs[f"formula:{f.get('field')}"] = "|".join(
                    [expr] + [f"{k}={f.get(k)}" for k in ("unit", "round") if f.get(k)] + ([f"opts={opts}"] if opts else []))
            out.append({"src": src, "kind": kind, "id": e.get("id", ""), "name": name, "page": e.get("page", ""),
                        "aliases": [x.get("name") or (x.text or "").strip() for x in e.findall("alias") if x.get("id") is None],
                        "attrs": attrs, "families": families(e, kind),
                        "issues": [(i.get("field"), i.get("code")) for i in e.findall("issue")],
                        # where the importer found a value the row leaves out (resolve.py): field -> how
                        "found": {x.get("field"): x.get("how") for x in e.findall("found")}})
    return _inline_refs(out)


_REF = re.compile(r"ref\(\s*([a-z]+):([^,\s)]+)\s*,\s*(\w+)\s*(?:,\s*R\s*)?\)")


def _inline_refs(entries):
    """A formula citing another entry of the source (`ref(augmentations:x, cost, R)*0.7`, an item derived from it) with
    that entry's own formula for the field, or its printed number, put in its place, so the formula can be evaluated."""
    from importer.sr6 import formula as F
    by = {(e["kind"], e["id"]): e["attrs"] for e in entries}

    def sub(m):
        a = by.get((m.group(1), m.group(2)))
        if a is None:
            return m.group(0)
        f = a.get(f"formula:{m.group(3)}")
        if f and "ref(" not in f:
            return f"({f.split('|')[0]})"
        p = F.plain(a.get(m.group(3)) or "", m.group(3))
        return m.group(0) if p is None else f"({p:g})"
    for e in entries:
        for k, v in list(e["attrs"].items()):
            if k.startswith("formula:") and "ref(" in v:
                e["attrs"][k] = _REF.sub(sub, v)
    return entries


def _texts(path):
    if not os.path.exists(path):
        return {}
    out = {}
    for t in ET.parse(path).getroot():  # a rule of the same id (`Uneducated`, a weakness citing the quality) never
        if t.get("id") and (t.get("of") != "rules" or t.get("id") not in out):  # replaces the entry's own text
            out[t.get("id")] = t.text or ""
    return out


def _book_dirs(root):
    """{source id (lower): library/sr6/<book> dir} for every import under root, its main source and its extra."""
    out = {}
    for base, dirs, files in sorted(os.walk(root)):
        dirs.sort()
        if "import.xml" in files and os.path.basename(os.path.dirname(base)) == "sr6":
            imp = ET.parse(os.path.join(base, "import.xml")).getroot()
            for s in (imp.get("extra"), imp.get("source")):
                if s:
                    out.setdefault(s.lower(), base)
    return out


def load(path):
    """{source id (lower): Source} of every import under path."""
    out, books = {}, {}
    for base, dirs, files in sorted(os.walk(path)):
        dirs.sort()
        if os.path.basename(os.path.dirname(base)) != "imported" or not any(f.endswith(".xml") for f in files):
            continue
        src = os.path.basename(base).lower()
        if src in out:
            continue
        sr6 = os.path.dirname(os.path.dirname(base))  # custom/sr6
        run = os.path.dirname(os.path.dirname(sr6))   # the run (or the repo) holding custom/ and library/
        if run not in books:
            books[run] = _book_dirs(os.path.join(run, "library"))
        out[src] = Source(src, _entries(base, src), books[run].get(src), _texts(os.path.join(sr6, "texts", f"{src}.xml")))
        for e in out[src].entries:  # a per-unit price's count range, as its row printed it (a labelled `1–9` cell)
            for k, v in list(e["attrs"].items()):
                if k.startswith("formula:") and "|unit=" in v and (m := COUNT.search(out[src].texts.get(e["id"], ""))):
                    e["attrs"][k] = f"{v}|count={m.group(1)}-{m.group(2)}"
    return out
