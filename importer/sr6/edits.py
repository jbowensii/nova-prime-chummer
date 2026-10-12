"""The SR6 edits layer: catalog entries changed in the app, kept apart from the imported books so a re-import never
touches them. custom/sr6/edits/edits.xml holds the full edited entries (kind="edits", each with by="<username>"),
texts.xml their edited descriptions (of=<kind>). S1 edits existing entries only: no new entries, no house sources.
The client's loader (src/sr6/engine/load.ts) applies them after the imported books."""
import functools
import os
import xml.etree.ElementTree as ET

from importer import xmlio
from importer.edits import MAX_BODY, USERNAME, EditError, parse_edit  # noqa: F401 (MAX_BODY: the CLI's stdin cap)
from importer.sr6 import KINDS, NS, ROOT, SCHEMA_DIR


def _path(custom_dir, name):
    return os.path.join(custom_dir, "edits", name)


def _root(path):
    return ET.parse(path).getroot() if os.path.exists(path) else None


# the edits layer also holds corrections of a book sample runner's printed lines (owner, 2026-10-09: a value correction
# goes in the override file, never in the importer): kind "samplefixes", one <samplefix id="<sample id>"> per sample
EDIT_KINDS = {**KINDS, "samplefixes": "samplefix"}


def _kind(kind):
    if kind not in EDIT_KINDS:
        raise EditError(f'unknown kind "{kind}" ({", ".join(EDIT_KINDS)})')


def _sample(custom_dir, id):
    """A sample runner's stand-in for the edits check: an element with the source and page its <printed> gives (or the
    samples list's source and page 1 when it prints none), or None when no imported sample has that id."""
    imported = os.path.join(custom_dir, "imported")
    listing = _root(os.path.join(imported, "samples.xml"))
    for s in [] if listing is None else listing.iter("sample"):
        href = s.get("href") or ""
        if os.path.basename(href) != f"{id}.xml":
            continue
        try:
            root = ET.parse(os.path.join(imported, href)).getroot()
        except (OSError, ET.ParseError):
            return None
        printed = next((e for e in root if e.tag == "printed"), None)
        return ET.Element("samplefix", {"source": (printed.get("source") if printed is not None else s.get("source")) or "",
                                        "page": (printed.get("page") if printed is not None else None) or "1"})
    return None


def _imported(custom_dir, tag, id):
    """The imported entry `id` (a <tag>) from the files custom/imported/index.xml lists, or None."""
    imported = os.path.join(custom_dir, "imported")
    index = _root(os.path.join(imported, "index.xml"))
    for f in [] if index is None else index.iter("file"):
        try:
            hit = next((e for e in ET.parse(os.path.join(imported, f.get("href"))).getroot() if e.tag == tag and e.get("id") == id), None)
        except (OSError, ET.ParseError):  # a missing or broken file: the loader reports it
            continue
        if hit is not None:
            return hit
    return None


@functools.lru_cache(maxsize=None)
def _schema(kind):
    from lxml import etree
    return etree.XMLSchema(etree.parse(os.path.join(SCHEMA_DIR, f"{kind}.xsd")))


def _xsd_error(kind, entry):
    """The first message the kind's XSD gives for the entry alone in a <sr6:data kind=…> file, or None."""
    from lxml import etree
    doc = etree.fromstring(f'<sr6:data xmlns:sr6="{NS}" kind="{kind}" version="1">{ET.tostring(entry, encoding="unicode")}</sr6:data>'
                           .encode("utf8"), etree.XMLParser(resolve_entities=False, no_network=True))
    schema = _schema(kind)
    return None if schema.validate(doc) else schema.error_log[0].message


def _edits_xml(entries):
    rows = []
    for e in entries:
        e.tail = None
        rows.append("  " + ET.tostring(e, encoding="unicode") + "\n")
    start, end = xmlio._root("edits", ROOT)
    return xmlio.HEAD + "<!-- Catalog entries edited in the app. Written by the importer. -->\n" + start + "".join(rows) + end


def _entries(custom_dir):
    root = _root(_path(custom_dir, "edits.xml"))
    return [] if root is None else list(root)


def set_entry(custom_dir, kind, id, body, by=None):
    """Check one edited entry and write it into custom/edits/ (replacing the same id). `body`: <edit><TAG …/>
    <description>…</description></edit>; the entry must be in the imported catalog with the same source and page, and
    fit its kind's XSD. Without a description (or an empty one) the book's text shows again. `by`: who saved it (the
    server passes it, never the client)."""
    if by is not None and not USERNAME.fullmatch(by):
        raise EditError(f'"{by}" isn’t a username')
    _kind(kind)
    entry, desc = parse_edit(kind, id, body, tags=EDIT_KINDS)
    entry.attrib.pop("by", None)  # only the server says who saved it
    if (entry.findtext("text") or "").strip():
        raise EditError("the entry’s <text> stays empty; put the description in <description>")
    book = _sample(custom_dir, id) if kind == "samplefixes" else _imported(custom_dir, entry.tag, id)
    if book is None:
        raise EditError(f'"{id}" isn’t {"an imported sample runner" if kind == "samplefixes" else "in the catalog"}; only imported entries can be edited')
    for k in ("source", "page"):
        if entry.get(k) != book.get(k):
            raise EditError(f'the entry’s {k} "{entry.get(k)}" isn’t the book’s "{book.get(k)}"')
    why = _xsd_error(kind, entry)
    if why:
        raise EditError(why)
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
    texts = xmlio.merged_texts(texts_path, [(kind, id, desc)] if desc else [], drop=() if desc else {(kind, id)},
                               root=ROOT)
    xmlio.write_file(_path(custom_dir, "edits.xml"), _edits_xml(entries))
    xmlio.write_file(texts_path, texts)


def remove_entry(custom_dir, kind, id):
    """Drop the edit of `id` and its description (the book's version shows again). False: there was none."""
    _kind(kind)
    entries = _entries(custom_dir)
    keep = [e for e in entries if not (e.tag == EDIT_KINDS[kind] and e.get("id") == id)]
    texts_path = _path(custom_dir, "texts.xml")
    texts_root = _root(texts_path)
    had_text = texts_root is not None and any((t.get("of"), t.get("id")) == (kind, id) for t in texts_root)
    if len(keep) == len(entries) and not had_text:
        return False
    texts = xmlio.merged_texts(texts_path, [], drop={(kind, id)}, root=ROOT) if had_text else None
    xmlio.write_file(_path(custom_dir, "edits.xml"), _edits_xml(keep))
    if texts:
        xmlio.write_file(texts_path, texts)
    return True
