"""The edits layer: catalog entries the user edited or added in the app, kept apart from imported books so
a re-import never touches them. custom/edits/edits.xml holds full entries (kind="edits": <amp>, <item>,
<rule>), texts.xml their edited descriptions, sources.xml the house-rule sources the user created
(canon="false"). The loader applies them after the imported books and before custom/index.xml."""

import os
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

from importer import CORE_FILES, DATA_DIR, core_dir, xmlio

# pylint: disable=redefined-builtin,dangerous-default-value  # id is a public keyword; TAG is never mutated

TAG = {"amps": "amp", "items": "item", "rules": "rule"}  # edit kind (also texts' of=) → entry tag
ID = re.compile(r"[a-z0-9][a-z0-9.\-]*")
POS = re.compile(r"[1-9][0-9]*")
BOOL = ("true", "false", "1", "0")
# what edits.xsd (common.xsd's Amp, Item, Rule) allows: attributes, required ones, child sequence
ATTRS = {
    "amp": {"type", "printedRating", "vehicle", "mod", "family", "level"},
    "item": {"kind", "specialist", "armor", "dv", "ranges", "category"},
    "rule": {"sheet", "section", "effects"},
}
REQUIRED = {"amp": "type", "item": "kind", "rule": "sheet"}
CHILDREN = {
    "amp": re.compile(r"name (item )?(effect )*narrative "),
    "item": re.compile(r"name (effect )*text "),
    "rule": re.compile("title text "),
}
ITEM_KINDS = ("gear", "weapon", "armor", "spell", "complex-form")
USERNAME = re.compile(r"[a-z0-9][a-z0-9._\-]{1,31}")  # server/auth.mjs USERNAME
MAX_BODY = 1024 * 1024  # one entry and its description; the server caps the request body too


class EditError(ValueError):
    """An edit refused; the message says why (shown to the user)."""


def _path(custom_dir, name):
    return os.path.join(custom_dir, "edits", name)


def _root(path):
    return ET.parse(path).getroot() if os.path.exists(path) else None


def _listed(index):
    """The files a custom index.xml lists (its folder + href)."""
    root = _root(index)
    return [] if root is None else [os.path.join(os.path.dirname(index), f.get("href")) for f in root.iter("file")]


def catalog_ids(custom_dir, tag, house=False):
    """Ids of `tag` entries loaded before the edits layer (house: those of the house rules, loaded after it)."""
    files = (
        _listed(os.path.join(custom_dir, "index.xml"))
        if house
        else (
            [os.path.join(core_dir(), f"{n}.xml") for n in CORE_FILES]
            + _listed(os.path.join(custom_dir, "imported", "index.xml"))
        )
    )
    ids = set()
    for f in files:
        try:
            ids |= {e.get("id") for e in ET.parse(f).getroot() if e.tag == tag}
        except (OSError, ET.ParseError):  # a missing or broken file: the loader reports it
            continue
    return ids


def _sources(*paths):
    return {s.get("id") for p in paths if os.path.exists(p) for s in ET.parse(p).getroot() if s.tag == "source"}


def house_sources(custom_dir):
    """The house sources listed in the custom folder's sources.xml."""
    return _sources(_path(custom_dir, "sources.xml"))


def listed_sources(custom_dir):
    """Every source listed across the data, imported and house sources.xml files."""
    return _sources(
        os.path.join(DATA_DIR, "sources.xml"),
        os.path.join(custom_dir, "imported", "sources.xml"),
        os.path.join(custom_dir, "sources.xml"),
        _path(custom_dir, "sources.xml"),
    )


def _shape(entry):
    """edits.xsd's rules for one entry: what is wrong, or []."""
    tag, a = entry.tag, entry.attrib
    notes = [f'unknown attribute "{k}"' for k in a if k not in ATTRS[tag] | {"id", "source", "page"}]
    notes += [f"no {k}" for k in ("id", "source", "page", REQUIRED[tag]) if not a.get(k, "").strip()]
    for k in ("id", "type", "vehicle", "sheet"):
        if a.get(k) and not ID.fullmatch(a[k]):
            notes.append(f'{k} "{a[k]}" isn’t an id (a-z, 0-9, dots and dashes)')
    for k in ("page", "armor"):
        if a.get(k) and not POS.fullmatch(a[k]):
            notes.append(f'{k} "{a[k]}" isn’t a whole number above 0')
    if a.get("printedRating") and not re.fullmatch(r"-?[0-9]+", a["printedRating"]):
        notes.append(f'printedRating "{a["printedRating"]}" isn’t a whole number')
    notes += [f'{k} "{a[k]}" isn’t true or false' for k in ("mod", "specialist") if k in a and a[k] not in BOOL]
    if tag == "item" and a.get("kind") and a["kind"] not in ITEM_KINDS:
        notes.append(f'item kind "{a["kind"]}" isn’t one of {", ".join(ITEM_KINDS)}')
    if tag == "item" and a.get("kind") == "armor" and not a.get("armor"):
        notes.append("an armor item needs its armor rating")
    if tag == "rule":
        notes += [f'effects "{e}" isn’t an id' for e in a.get("effects", "").split() if not ID.fullmatch(e)]
    if not CHILDREN[tag].fullmatch("".join(c.tag + " " for c in entry)):
        want = {
            "amp": "<name>, <item>?, <effect>…, <narrative>",
            "item": "<name>, <effect>…, <text>",
            "rule": "<title>, <text>",
        }[tag]
        notes.append(f"its elements must be {want} in that order")
    if (entry.text or "").strip() or any((c.tail or "").strip() for c in entry):
        notes.append(f"text outside the elements of <{tag}>")
    for c in entry:
        if c.tag in ("name", "narrative", "text", "title"):
            notes += [f"<{c.tag}> holds only text"] if len(c) else []
            notes += [f"<{c.tag}> takes no attributes"] if c.attrib else []
            continue
        if c.tag in ("item", "effect") and (len(c) or (c.text or "").strip()):
            notes.append(f"<{c.tag}> holds no elements or text")
        if c.tag == "item":
            k = c.attrib
            notes += [
                f'unknown attribute "{x}" on <item>'
                for x in k
                if x not in ("kind", "specialist", "armor", "dv", "ranges")
            ]
            if k.get("kind") not in ("gear", "weapon", "armor"):
                notes.append("<item> kind must be gear, weapon or armor")
        elif c.tag == "effect":
            notes += [
                f'unknown attribute "{x}" on <effect>'
                for x in c.attrib
                if x
                not in ("ref", "param", "value", "note", "unpriced", "switch", "when", "confidence", "from", "affects")
            ]
            if not ID.fullmatch(c.get("ref") or ""):
                notes.append("an <effect> has no ref id")
            if c.get("value") and not POS.fullmatch(c.get("value")):
                notes.append(f'effect value "{c.get("value")}" isn’t a whole number above 0')
    return notes


def _refs(entry):
    """The propose/apply-review checks (validate-data.mjs's reference rules) for one entry."""
    from importer.__main__ import entry_notes
    from importer.ai import propose

    m = propose.mechanics()
    if entry.tag == "amp":
        vehicles = {v.get("id") for v in ET.parse(os.path.join(core_dir(), "vehicles.xml")).getroot()}
        bad = (
            [f'unknown vehicle "{entry.get("vehicle")}"']
            if entry.get("vehicle") and entry.get("vehicle") not in vehicles
            else []
        )
        return entry_notes("amp", entry, m) + bad
    if entry.tag == "item":
        return entry_notes(entry.get("kind"), entry, m)
    notes = [] if (entry.findtext("title") or "").strip() else ["no title"]
    return notes + [f'unknown effect "{e}"' for e in (entry.get("effects") or "").split() if e not in m["effects"]]


def parse_edit(kind, id, body, tags=TAG):
    """(entry, description or None) from `body`: one entry, or <edit> holding one entry and an optional <description>.
    tags: edit kind -> entry tag (SR6's KINDS for importer/sr6/edits.py)."""
    if kind not in tags:
        raise EditError(f'unknown kind "{kind}" (amps, items or rules)')
    body = body.encode("utf8") if isinstance(body, str) else body
    if len(body) > MAX_BODY:
        raise EditError(f"the edit is too large (over {MAX_BODY // 1024} KB); shorten the description")
    if b"<!DOCTYPE" in body.upper():
        raise EditError("the edit may not contain a DOCTYPE")
    try:
        root = ET.fromstring(body)
    except ET.ParseError as e:
        raise EditError(f"the entry isn’t well-formed XML: {e}") from None
    kids = list(root) if root.tag == "edit" else [root]
    entries = [k for k in kids if k.tag != "description"]
    desc = [k for k in kids if k.tag == "description"]
    if len(entries) != 1 or entries[0].tag != tags[kind] or len(desc) > 1:
        raise EditError(f"an edit of {kind} needs one <{tags[kind]}> entry and at most one <description>")
    if entries[0].get("id") != id:
        raise EditError(f'the entry’s id "{entries[0].get("id")}" isn’t "{id}"')
    if desc and (len(desc[0]) or desc[0].attrib):
        raise EditError("<description> holds only text")
    text = desc[0].text if desc else None
    return entries[0], (text if text and text.strip() else None)


def _edits_xml(entries):
    rows = []
    for e in entries:
        e.tail = None
        rows.append("  " + ET.tostring(e, encoding="unicode"))
    return (
        xmlio.HEAD + "<!-- Catalog entries edited or added in the app. Written by the importer. -->\n"
        f'<ca2:data xmlns:ca2="{xmlio.NS}" kind="edits" version="1">\n'
        + "".join(r + "\n" for r in rows)
        + "</ca2:data>\n"
    )


def _entries(custom_dir):
    root = _root(_path(custom_dir, "edits.xml"))
    return [] if root is None else list(root)


def set_entry(custom_dir, kind, id, body, by=None):
    """Validate one edited or new entry and write it into custom/edits/ (replacing the same id).
    An id the catalog doesn't have is a new entry: its source must be a house-rule source and its id
    `<source lower>.<slug>`. Without a description, any edited description for the id is dropped.
    `by`: the account that saved it (by="<username>" on the entry; the server passes it, never the client)."""
    if by is not None and not USERNAME.fullmatch(by):
        raise EditError(f'"{by}" isn’t a username')
    entry, desc = parse_edit(kind, id, body)
    entry.attrib.pop("by", None)  # only the server says who saved it
    notes = _shape(entry)
    if not notes:
        src = entry.get("source")
        if id in catalog_ids(custom_dir, entry.tag, house=True):
            notes.append(
                f'"{id}" comes from your house rules (custom/index.xml), which load after edits; change it there'
            )
        elif id not in catalog_ids(custom_dir, entry.tag) and (
            src not in house_sources(custom_dir) or not id.startswith(src.lower() + ".")
        ):
            notes.append(
                f'a new entry needs a house-rule source (add one first) and an id "<source>.<name>"; '
                f'"{id}" from "{src}" isn’t one'
            )
        elif src not in listed_sources(custom_dir):
            notes.append(f'source "{src}" isn’t listed in any sources file')
        notes += _refs(entry)
    if notes:
        raise EditError("; ".join(notes))
    if by:
        entry.set("by", by)
    entries = _entries(custom_dir)
    at = next((i for i, e in enumerate(entries) if e.tag == entry.tag and e.get("id") == id), None)
    if at is None:
        entries.append(entry)
    else:
        entries[at] = entry
    texts_path = _path(custom_dir, "texts.xml")
    # both files built before either is written: a corrupt texts file fails the edit, not half of it
    texts = xmlio.merged_texts(texts_path, [(kind, id, desc)] if desc else [], drop=() if desc else {(kind, id)})
    xmlio.write_file(_path(custom_dir, "edits.xml"), _edits_xml(entries))
    xmlio.write_file(texts_path, texts)


def remove_entry(custom_dir, kind, id):
    """Drop the edit of `id` and its description (the book's version shows again). False: there was none."""
    if kind not in TAG:
        raise EditError(f'unknown kind "{kind}" (amps, items or rules)')
    entries = _entries(custom_dir)
    keep = [e for e in entries if not (e.tag == TAG[kind] and e.get("id") == id)]
    texts_path = _path(custom_dir, "texts.xml")
    texts_root = _root(texts_path)
    had_text = texts_root is not None and any((t.get("of"), t.get("id")) == (kind, id) for t in texts_root)
    if len(keep) == len(entries) and not had_text:
        return False
    texts = xmlio.merged_texts(texts_path, [], drop={(kind, id)}) if had_text else None
    xmlio.write_file(_path(custom_dir, "edits.xml"), _edits_xml(keep))
    if texts:
        xmlio.write_file(texts_path, texts)
    return True


def add_source(custom_dir, sid, name, publisher=""):
    """Add a house-rule source (canon="false") to custom/edits/sources.xml; the id must be new everywhere."""
    from importer.__main__ import SOURCE_ID, reserved_sources

    if not SOURCE_ID.fullmatch(sid or "") or not (name or "").strip():
        raise EditError("a house-rule source needs an id (A-Z, 0-9 and dashes, starting with a letter) and a name")
    taken = reserved_sources(custom_dir) | {i.upper() for i in listed_sources(custom_dir)}
    if sid in taken:
        raise EditError(f"the source id {sid} is already used; pick another")
    path = _path(custom_dir, "sources.xml")
    root = _root(path)
    rows = [] if root is None else [s for s in root if s.tag == "source"]
    body = "".join(f"  {ET.tostring(s, encoding='unicode').strip()}\n" for s in rows)
    body += (
        f'  <source id={quoteattr(sid)} publisher={quoteattr(publisher)} canon="false">'
        f"<name>{escape(name.strip())}</name></source>\n"
    )
    xmlio.write_file(
        path,
        xmlio.HEAD + "<!-- House-rule sources created in the app. Written by the importer. -->\n"
        f'<ca2:data xmlns:ca2="{xmlio.NS}" kind="sources" version="1">\n{body}</ca2:data>\n',
    )
