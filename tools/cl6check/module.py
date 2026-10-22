"""The CommLink6-only data module (owner ruling 2026-10-21): the Commlink6 records in none of our books (the final
analysis's list 1, less the Misc. (US) products that are books we import: Seoul Survivor, the Missions Guide,
Adversary, Age of Rust) and the entries only Commlink6 has that the book overrides used to add (cl6only_module.json),
as catalog files the app loads from custom/sr6/cl6only/ while the table's `cl6OnlyData` setting is on. Never mixed into
book data: each entry's source is a CommLink6-only one (CL6-<book>, canon="false"), its id `cl6.<book>.<id>`.

  python -m tools.cl6check module <data folder> [--jar <jar>]

writes <data folder>/custom/sr6/cl6only/: index.xml naming its files, sources.xml, one <kind>.xml per catalog kind,
each in the importer's format (custom/sr6/imported/<book>/<kind>.xml) and valid against its schema. No jar: skipped,
exit 0. What it writes is the owner's CommLink6 data: never commit it (docs/sr6-cl6-optional-package.md)."""

import os
import re
import time
import sys
from collections import Counter, defaultdict
from pathlib import Path

from tools.cl6check import canon, familymap, fields, reader, valuemap
from tools.cl6check import optional as package
from tools.cl6check.final_analysis import CELL, GERMAN_NAME, side_records
from tools.cl6effects.xlate import ABBR, ATTR_REF

REPO = Path(__file__).resolve().parents[2]
SOURCES = REPO / "public" / "data" / "sr6" / "sources.xml"
# Misc. (US) products that are books we import now (owner 2026-10-21); Age of Rust prints Buzzard Transit (p. 15)
IMPORTED = {"Seoul Survivor", "SRM Guide", "Adversary", "Age of Rust"}
GROUP = {  # (reader.read's reason a record is left out -> the final analysis's list-1 group)
    "lang=de (German-rules duplicate)": "German-rules duplicates",
    "no English name in the jar": "no English name",
    "retired by Commlink6 (Depreciated)": "retired or legacy",
}
NOT_ENTRIES = {"ruleoptions": "a rule setting (the app's rule presets), not a catalog entry"}
ITEMS = ("weapons", "armor", "augmentations", "electronics", "programs", "gear", "vehicles")
VEHICLE = ("handling", "accel", "interval", "topSpeed", "body", "armor", "pilot", "sensor", "seats")
PROGRAM = {"HACKING_PROGRAM": "hacking", "AUTOSOFT": "autosoft", "COMMLINK_APP": "app", "BASIC_PROGRAM": "basic"}
PROGRAM |= {"ESOFT": "e-soft", "RIGGER_PROGRAM": "rigger program"}
SOURCE_ID = re.compile(r"[A-Z][A-Z0-9\-]{0,19}")
ATTRS = ("BODY", "AGILITY", "REACTION", "STRENGTH", "WILLPOWER", "LOGIC", "INTUITION", "CHARISMA", "EDGE")


def _words(s):
    return familymap.words((s or "").lower())


def _texts(jar):
    """{(prefix, id lower): {name, page}} from every language's text in the jar, English first: the name Commlink6
    prints for a record that has no English one."""
    import zipfile

    out = {}
    with zipfile.ZipFile(jar) as z:
        props = sorted(
            (n for n in z.namelist() if n.endswith(".properties") and "/i18n/" in n),
            key=lambda n: (bool(reader.LANG_FILE.search(n.rsplit("/", 1)[1][:-11])), n),
        )
        for n in props:
            for k, v in reader.properties(reader.decode(z.read(n))).items():
                for kk, vv in v.items():
                    out.setdefault(k, {}).setdefault(kk, vv)
    return out


def _rec(x, text):
    """A reader-shaped record (canon.canonical's input) of a listing or side record, its name and page filled from any
    language when it has no English one."""
    el = reader.normalise(x["el"])
    t = next(
        (text[k] for k in [(p, x["id"].lower()) for p in reader.PREFIX.get(x["tag"], (x["tag"],))] if k in text), {}
    )
    return {
        "book": x["book"],
        "file": x["file"],
        "tag": x["tag"],
        "id": x["id"],
        "name": x["name"] or t.get("name") or x["id"],
        "page": x["page"] or t.get("page", "").strip(),
        "wifi": False,
        "variants": {},
        "attrs": dict(el.attrib),
        "el": el,
    }


def records(jar):
    """(records, moved, text): every list-1 record of the jar the module carries, each a reader-shaped record with its
    list-1 `group`, and the module definition's rows. The ones the definition writes (the former gen="cl6only" rows) are
    not in `records`; text: _texts()."""
    listing = []
    recs, _ = reader.read(jar, listing)
    text = _texts(jar)
    moved = check_rows(package.load_module())
    defined = {(r["cl6_book"], r["cl6_id"]) for r in moved if "cl6_id" in r}
    optional, _ = package.load(with_module=False)
    note = {k: r.get("note", "") for k, r in package.load_have().items()}
    out = []
    for x in side_records(jar):  # (the German-only books and Misc. (US))
        if (x["book"], x["id"]) in defined or x["book"] == "other_us" and x["product"] in IMPORTED:
            continue
        group = (
            "German-only books"
            if x["book"].startswith("de_")
            else "German-rules duplicates" if x["lang"] == "de" else "other"
        )
        out.append(_rec(x, text) | {"group": group, "product": x["product"]})
    out += [_rec(x, text) | {"group": GROUP.get(x["why"], "other")} for x in listing]
    for r in recs:
        c = canon.canonical(r)
        key = (c["src"], c["id"])
        if (r["book"], r["id"]) in defined:
            continue
        if c["kind"] == "ruleoptions":
            group = "rule options"
        elif (
            key in optional or c["cl6only"] and (canon.PSEUDO.match(c["name"].strip()) or CELL in note.get(key, ""))
        ):  # (the optional package's records; a table cell Commlink6 made a record of)
            group = "Commlink6-invented or house content"
        else:
            continue
        out.append(r | {"group": group})
    bases = {r["id"]: r["el"] for r in recs if r["tag"] == "metatype"}  # (a variant's ranges start from its base's)
    for r in out:
        if r["tag"] == "metatype":
            r["base"] = bases.get(r["attrs"].get("variantof"))
    return out, moved, text


def _numeric(field, per):
    """(value, formula or None) of a per-rating Commlink6 value, in our files' words (valuemap's)."""
    per = {r: v for r, v in per.items() if v is not None}
    return valuemap.numeric(field, fields.show(per), "") if per else (None, None)


def _item(c, rec, a, forms):
    """An item's printed values from Commlink6's: rating, cost, avail, essence and its kind's own."""
    f, k = c["fields"], c["kind"]
    if c["cl6_class"] and c["cl6_class"] not in ("item", "focus"):
        a["class"] = c["cl6_class"]
    # (the schema needs a category: Commlink6's subtype, else its type, in words)
    a["category"] = _words(rec["attrs"].get("subtype") or rec["attrs"].get("type") or k)
    if f.get("rating"):
        lo, hi = f["rating"]
        a["rating"] = f"{lo}–{hi}" if hi != lo else str(lo)
    for field in ("cost", "essence") if k in ("augmentations", "packs") else ("cost",):
        v, form = _numeric(field, f.get(field) or {})
        if v is not None:
            a[field] = v
            if form:
                forms[field] = form
    if f.get("avail"):
        v, form = _numeric("avail", {r: n for r, (n, _) in f["avail"].items()})
        let = next((g for _, g in f["avail"].values() if g), "")
        a["avail"] = f"{v}({let})" if let else v
        if form:
            forms["avail"] = form
    if k == "weapons":
        a |= {"dv": f.get("dv"), "modes": f.get("modes"), "ammo": f.get("ammo")}
        a["ar"] = valuemap.ar_value(f["ar"]) if f.get("ar") else None
        a |= familymap.values(rec["el"], "skill/spec")
    elif k == "armor":
        d = f.get("defense")
        a["defense"] = d if not d or d.startswith(("+", "-")) else f"+{d}"
        a |= familymap.values(rec["el"], "social")
    elif k == "vehicles":
        a |= {x: f.get(x) for x in VEHICLE}
    elif k == "augmentations":
        a["type"] = (rec["attrs"].get("type") or "cyberware").lower()
    elif k == "programs":  # (as our books' types: basic, hacking, autosoft …)
        a["type"] = PROGRAM.get(rec["attrs"].get("subtype"), _words(rec["attrs"].get("subtype")).lower() or "basic")


def entry(rec, text=None):
    """(kind, attrs, formulas {field: formula}, kids) of a record as a catalog entry of ours, or (None, why) when it
    maps to no catalog kind of the app. text: _texts(), for a pack's contents' names."""
    from importer.sr6 import KINDS
    from importer.sr6.overrides import allowed

    c = canon.canonical(rec)
    k, a, forms, f = c["kind"], {}, {}, c["fields"]
    if not c["modelled"] or k not in KINDS:
        return None, f"Commlink6's {rec['tag']} records: no catalog kind of ours"
    if k in NOT_ENTRIES:
        return None, NOT_ENTRIES[k]
    if k in ITEMS or k == "packs":
        _item(c, rec, a, forms)
    elif k == "qualities":
        a |= {
            "kind": "positive" if rec["attrs"].get("pos") == "true" else "negative",
            "karma": rec["attrs"].get("karma"),
        }
    elif k == "adeptpowers":
        a |= {"cost": f.get("pp cost"), "activation": valuemap.ENUM["activation"].get(f.get("activation"))}
        a["perLevel"] = "true" if f.get("per level") == "true" else None
    elif k == "lifemodules":
        a["stage"] = "opening" if rec["attrs"].get("type") in ("NATIONALITY", "OPENING") else "adult"
    elif k == "actions":
        a |= {"type": (rec["attrs"].get("type") or "").lower(), "category": _words(rec["attrs"].get("cat"))}
        a["edge"] = rec["attrs"].get("cost") if rec["attrs"].get("type") == "EDGE" else None
    elif k == "trueelements":
        a["category"] = _words(rec["attrs"].get("element"))
    elif k == "lifestyles":
        a["cost"] = rec["attrs"].get("cost")
        if not a["cost"]:
            return None, "a lifestyle CommLink6 gives no cost"
    elif k == "metatypes":
        if not (got := _metatype(rec, text or {})):
            return None, "a metatype CommLink6 gives no attribute maximums (its drake types are choices, not metatypes)"
        return k, {}, {}, got
    elif k == "mentorspirits":
        if not (got := _mentor(rec, text or {})):
            return None, "a mentor spirit with no advantage in a form the app reads"
        return k, {}, {}, got
    sets, kids = familymap.structure(rec) if k in ITEMS or k == "packs" else ({}, [])
    if k == "packs":  # (its contents first, as the schema has them: the name of each item it holds)
        kids = [
            {"tag": "item", "text": (text or {}).get(("item", m.get("ref").lower()), {}).get("name") or m.get("ref")}
            for m in canon._mods(rec["el"])  # pylint: disable=protected-access
            if m.tag == "itemmod" and m.get("type") == "GEAR" and m.get("ref")
        ] + kids
    ok = allowed(k) or set()
    a = {x: str(v) for x, v in (a | sets).items() if v not in (None, "") and x in ok}
    return k, a, {x: v for x, v in forms.items() if x in a}, kids


def _name(text, prefixes, ref):
    """CommLink6's name of the record `ref` of one of the text prefixes (English first), or None."""
    return next((text[p, ref.lower()]["name"] for p in prefixes if text.get((p, ref.lower()), {}).get("name")), None)


def _metatype(rec, text):
    """A metatype's kids: its attribute ranges (1 to its maximum: its base's then its own CommLink6 maximums, 6 where
    neither gives one) and its traits (the qualities and critter powers it gives, by CommLink6's name); [] when neither
    it nor its base gives a maximum."""
    maxes = {}
    for el in (rec.get("base"), rec["el"]):
        for m in el.iter("valmod") if el is not None else ():
            ref, v = (m.get("ref") or "").upper(), m.get("value") or ""
            if m.get("type") == "ATTRIBUTE" and m.get("set") == "MAX" and ref in ATTRS and v.isdigit():
                maxes[ref] = v
    if not maxes:
        return []
    kids = [{"tag": "range", "attrs": {"attr": ABBR[x], "min": "1", "max": maxes.get(x, "6")}} for x in ATTRS]
    for m in rec["el"].iter():
        if m.tag in ("itemmod", "valmod") and m.get("type") in ("QUALITY", "CRITTER_POWER") and m.get("ref"):
            pre = ("quality",) if m.get("type") == "QUALITY" else ("critterpower",)
            if name := _name(text, pre, m.get("ref")):
                kids.append({"tag": "trait", "text": name})
    return kids


def _target(m):
    """Our effect target of a Commlink6 Edge boost (checkmod what=EDGE_BOOST), or None."""
    ty, ref = m.get("type"), (m.get("ref") or "")
    if ty == "SKILL":
        return "skill:" + ("choice" if ref.upper() == "CHOICE" else re.sub(r"[^a-z0-9]+", "-", ref.lower()))
    if ty == "ATTRIBUTE":
        t = ATTR_REF.get(ref.upper(), "")
        return f"test:attr-{ABBR[ref.upper()]}" if ref.upper() in ATTRS else t if t.startswith("test:") else None
    if ty in ("SPELL", "SPELL_CATEGORY") and ref.upper() != "CHOICE":
        return "test:spell-" + ref.lower()
    return None


def _mentor(rec, text):
    """A mentor spirit's kids in our words, as the books' (crb mentor spirits): its Edge boosts as `edge-cost` effects
    on the skill, attribute test or spell category (a magician's or an adept's only: `when`), the adept powers and
    qualities it gives as `grants` links by CommLink6's name, its relevance and picks; [] when it has none of the first
    two."""
    kids = []
    blocks = [("", b) for b in rec["el"].findall("modifications")]
    blocks += [(role, b) for role in ("magician", "adept") for b in rec["el"].findall(role)]
    for when, block in blocks:
        cond = {"switch": "conditional", "when": when} if when else {}
        for m in block.iter():
            ty, ref, v = m.get("type"), m.get("ref") or "", m.get("value") or ""
            target = _target(m) if m.tag == "checkmod" and m.get("what") == "EDGE_BOOST" and v else None
            if target:
                kids.append({"tag": "effect", "attrs": {"target": target, "op": "edge-cost", "value": v, **cond}})
            elif m.tag in ("valmod", "itemmod") and ty in ("ADEPT_POWER", "QUALITY") and ref:
                if ty == "ADEPT_POWER":
                    kind, pre = "adeptpowers", ("adeptpower", "power")
                else:
                    kind, pre = "qualities", ("quality",)
                if name := _name(text, pre, ref):
                    level = {"level": v} if v.isdigit() and int(v) > 0 else {}
                    attrs = {"rel": "grants", "name": name, "kind": kind, **level, **({"when": when} if when else {})}
                    kids.append({"tag": "link", "attrs": attrs})
            elif m.tag == "relevancemod" and (m.get("topic") or "").strip():
                kids.append({"tag": "relevance", "attrs": {"topic": m.get("topic").strip().casefold()}})
    if not any(k["tag"] in ("effect", "link") for k in kids):
        return []
    picks = [k for k in familymap.structure(rec)[1] if k["tag"] == "selection"]
    return list({repr(k): k for k in kids + picks}.values())


def prefix(book, file=""):
    """The id prefix of the module's entries of Commlink6's book (folder): cl6.<our source id or the folder>, the same
    book its source (source_id) names."""
    from importer.sr6.ids import slug

    return f"cl6.{slug(canon.source_of(book, file))}"


def check_rows(rows):
    """The module definition's rows, each checked (a ValueError naming the row otherwise): an add row has its book
    table `src`, `kind`, `cl6`, `cl6_book`, `cl6_id` and a page; any other row names an add row of its table by id or
    name."""
    from importer.sr6 import KINDS
    from importer.sr6.ids import slug

    adds = defaultdict(set)
    for i, r in enumerate(rows):
        if not isinstance(r, dict) or not r.get("src") or r.get("kind") not in KINDS:
            raise ValueError(f"cl6only_module.json row {i}: needs its book table `src` and a catalog `kind`")
        if "add" in r:
            if not all(r.get(k) for k in ("cl6", "cl6_book", "cl6_id")) or not isinstance(r["add"].get("page"), int):
                raise ValueError(
                    f"cl6only_module.json row {i} ({r.get('cl6')}): an add row needs cl6, cl6_book, cl6_id, page"
                )
            name = r["add"].get("name", r["cl6"])
            adds[r["src"]] |= {r["add"].get("id") or slug(name), name}
    for i, r in enumerate(rows):
        if "add" not in r and not ({r.get("id"), *r.get("ours", ())} - {None}) <= adds[r["src"]]:
            raise ValueError(
                f"cl6only_module.json row {i} ({r.get('cl6')}): names no entry the module adds in {r['src']}"
            )
    return rows


def source_id(book, file=""):
    """The CommLink6-only source an entry of Commlink6's book (folder) cites: CL6-<our source id>, else CL6-<folder>."""
    sid = "CL6-" + canon.source_of(book, file).upper().replace("_", "-")
    if not SOURCE_ID.fullmatch(sid):
        raise ValueError(f"{book}: {sid} is no source id (A-Z, 0-9, -, at most 20)")
    return sid


def _page(p):
    """The first page number Commlink6 gives, else 1 (the schema needs a page; Commlink6 cites none)."""
    m = re.search(r"\d+", p or "")
    return str(int(m.group())) if m and int(m.group()) else "1"


def _defined(moved, roots, ids):
    """The module definition's entries (overrides.apply on its rows, per book table), re-cited and re-identified as
    CommLink6-only, appended to roots(kind); [(kind, row)] of each."""
    from lxml import etree

    from importer.sr6 import overrides

    out, by_src = [], defaultdict(list)
    for r in sorted(moved, key=lambda r: "add" not in r):  # (the adds first: a name row needs its entry made)
        by_src[r["src"]].append({k: v for k, v in r.items() if k not in ("src", "cl6_book", "cl6_id")})
    adds = {(r["src"], r["kind"], r["add"].get("name", r["cl6"])): r for r in moved if "add" in r}
    for src, rows in sorted(by_src.items()):
        for name, xml in sorted(overrides.apply(src, {}, rows=rows).items()):
            kind = name[:-4]
            for e in etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8")):
                row, old = adds[src, kind, e.findtext("name")], e.get("id")
                e.set("id", ids(kind, f"{prefix(row['cl6_book'])}.{old}"))
                e.set("source", source_id(row["cl6_book"]))
                # (its id as a book entry until 2026-10-21: a saved runner holding it finds this one, load.ts `moved`)
                etree.SubElement(e, "alias", {"id": f"{src}.{old}"})
                roots(kind).append(e)
                out.append((kind, row))
    return out


def build(jar):
    """({file name: xml}, summary) of the module: index.xml, sources.xml and one file per catalog kind."""
    from lxml import etree

    from importer import xmlio
    from importer.sr6 import KINDS, NS
    from importer.sr6.ids import slug

    recs, moved, text = records(jar)
    roots, seen = {}, Counter()

    def root(kind):
        if kind not in roots:
            roots[kind] = etree.fromstring(f'<sr6:data xmlns:sr6="{NS}" kind="{kind}" version="1"/>'.encode())
        return roots[kind]

    def uid(kind, i):  # (two records of one book with one id: a German edition's copy beside a German-only one)
        seen[kind, i] += 1
        return i if seen[kind, i] == 1 else f"{i}-{seen[kind, i]}"

    s = {"kind": Counter(), "group": Counter(), "unmapped": defaultdict(list), "sources": {}}
    for kind, row in _defined(moved, root, uid):
        s["kind"][kind] += 1
        s["group"][
            (
                "other"
                if row["cl6_book"] == "other_us"
                else (
                    "German-rules duplicates"
                    if GERMAN_NAME.search(row["cl6"])
                    else "Commlink6-invented or house content"
                )
            )
        ] += 1
        s["sources"].setdefault(source_id(row["cl6_book"]), (row["cl6_book"], ""))
    for r in sorted(recs, key=lambda r: (r["book"], r["tag"], r["id"])):
        got = entry(r, text)
        if got[0] is None:
            s["unmapped"][got[1]].append(f"{r['book']}/{r['tag']}/{r['id']}")
            continue
        kind, a, forms, kids = got
        sid = source_id(r["book"], r["file"])
        e = etree.SubElement(
            root(kind),
            KINDS[kind],
            {
                "id": uid(kind, f"{prefix(r['book'], r['file'])}.{slug(r['id'])}"),
                "source": sid,
                "page": _page(r["page"]),
                **a,
            },
        )
        etree.SubElement(e, "name").text = r["name"].strip()
        for k in kids:
            etree.SubElement(e, k["tag"], {x: str(v) for x, v in k.get("attrs", {}).items()}).text = k.get("text")
        for field, form in forms.items():
            etree.SubElement(e, "formula", {"field": field}).text = form
        s["kind"][kind] += 1
        s["group"][r["group"]] += 1
        s["sources"].setdefault(sid, (r["book"], r.get("product", "")))
    files = {"sources.xml": _sources(s["sources"])}
    for kind in KINDS:
        if kind in roots:
            r = roots[kind]
            r[:] = sorted(r, key=lambda e: e.get("id"))
            files[f"{kind}.xml"] = _xml(r)
    files["index.xml"] = (
        xmlio.HEAD
        + "<!-- The CommLink6-only module (python -m tools.cl6check module). Loaded while cl6OnlyData is on. -->\n"
        + "<overlays>\n"
        + "".join(f'  <file href="{n}"/>\n' for n in files)
        + "</overlays>\n"
    )
    return files, s


def _sources(sources):
    """sources.xml: each CommLink6-only source, not canon, named for the book it claims."""
    from lxml import etree

    from importer.sr6 import NS

    ours = {
        e.get("id"): e.findtext("name")
        for e in etree.parse(str(SOURCES)).getroot()
        if isinstance(e.tag, str) and e.get("id")
    }
    root = etree.fromstring(f'<sr6:data xmlns:sr6="{NS}" kind="sources" version="1"/>'.encode())
    for sid, (book, product) in sorted(sources.items()):
        title = ours.get(sid[4:]) or {"other_us": "Misc. (US)"}.get(book) or f"{product or book} (German only)"
        e = etree.SubElement(root, "source", {"id": sid, "publisher": "CommLink6", "canon": "false"})
        etree.SubElement(e, "name").text = f"CommLink6 only: {title}"
    return _xml(root)


def _xml(root):
    """A data file as the importer writes one: an entry a line."""
    from lxml import etree

    from importer import xmlio

    root.text = "\n  " if len(root) else None
    for i, e in enumerate(root):
        e.tail = "\n" if i == len(root) - 1 else "\n  "
    return xmlio.HEAD + etree.tostring(root, encoding="unicode") + "\n"


def write(out, jar):
    """Write the module under <out>/custom/sr6/cl6only; (folder, summary). Raises when a file fails its schema."""
    from importer import xmlio
    from importer.sr6.__main__ import validate

    import shutil

    files, s = build(jar)
    folder = os.path.join(out, "custom", "sr6", "cl6only")
    # written and validated beside the live module, swapped in only when every file passes (a failed run leaves the
    # previous module as it was); the replaced one goes to _to_delete, never deleted
    fresh = folder + ".new"
    shutil.rmtree(fresh, ignore_errors=True)
    os.makedirs(fresh)
    # renames only (never shutil.move: on a locked file it falls back to copy-and-delete, which can half-empty the live
    # folder); anything that fails leaves the live module as it was and drops the new one
    old = (
        os.path.join(out, "_to_delete", f"cl6only-{time.strftime('%Y%m%d-%H%M%S')}") if os.path.isdir(folder) else None
    )
    try:
        for name, xml in files.items():
            xmlio.write_file(os.path.join(fresh, name), xml)
        if bad := validate(fresh):
            raise ValueError("schema: " + "; ".join(f"{f}: {e}" for f, e in bad[:10]))
        if old:
            os.makedirs(os.path.dirname(old), exist_ok=True)
            _rename(folder, old)
        try:
            _rename(fresh, folder)
        except OSError:
            if old:
                _rename(old, folder)
            raise
    except Exception:
        shutil.rmtree(fresh, ignore_errors=True)
        raise
    return folder, s


def _rename(src, dst):
    """os.replace, waiting while a server holds a file in it open (Windows refuses the rename then), as
    importer/xmlio.py write_file does; raises when it still fails."""
    for i in range(20):
        try:
            os.replace(src, dst)
            return
        except PermissionError:
            if i == 19 or os.name != "nt":
                raise
            time.sleep(0.01 * (i + 1))


def main(argv):
    """`module <out> [--jar <jar>]`: write the module, print what it holds and what it could not map."""
    import argparse

    p = argparse.ArgumentParser(prog="cl6check module")
    p.add_argument("out")
    p.add_argument("--jar")
    a = p.parse_args(argv)
    jar = reader.find_jar(a.jar)
    if jar is None:
        print("cl6check module: no Commlink6 jar (--jar or $CL6_JAR): nothing to write, skipped.")
        return 0
    folder, s = write(a.out, jar)
    n = sum(len(v) for v in s["unmapped"].values())
    print(f"not mapped ({n}):")
    for why, ids in sorted(s["unmapped"].items()):
        print(f"  {why} ({len(ids)}): {', '.join(ids)}")
    print("by group: " + ", ".join(f"{g} {k}" for g, k in sorted(s["group"].items())))
    print("by kind: " + ", ".join(f"{g} {k}" for g, k in sorted(s["kind"].items())))
    print(f"module: {sum(s['kind'].values())} entries, {len(s['sources'])} sources -> {folder}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
