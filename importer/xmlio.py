"""The importer's XML writes: overlays (ids scoped by source), texts, and the library/custom records.
Every file is written to a temp name and renamed, so a reader never sees half a file."""

import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from xml.sax.saxutils import escape, quoteattr

NS = "urn:chummer-anarchy2:data:1"
WINDOWS = os.name == "nt"
HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
ILLEGAL = re.compile(
    "[^\t\n\r\x20-%s%s-%s%s-%s]" % tuple(map(chr, (0xD7FF, 0xE000, 0xFFFD, 0x10000, 0x10FFFF)))
)  # not in XML 1.0
# (tag, attribute) pairs that name an entry of the imported file set ("*" = any tag); only values that
# are ids of that set get scoped. <effect ref>, amp type and amp vehicle point at base ampeffects, amptypes
# and vehicles (chassis): never scoped, even when a book entry has the same id (DHSA's "Small drone" amp).
# rule parent: SR6's rule tree; configOf, accessoryOf, supplyOf: an SR6 entry's links to other entries
SCOPED = {
    ("*", "id"),
    ("*", "linkedItem"),
    ("*", "configOf"),
    ("*", "accessoryOf"),
    ("*", "supplyOf"),
    ("package", "level"),
    ("link", "ref"),
    ("rule", "parent"),
    ("optionalpower", "ref"),
    ("power", "ref"),
}  # (an SR6 Infected quality's optional and gained powers: entries of its book)
# a book's <skill> names the base skill its specs are added to (the loader appends them), and the amp types and
# effects a book adds (the CG's Emerged, DHSA's grades) are named by amps and the engine as they are: never scoped
UNSCOPED_TAGS = {"skill", "amptype", "effect"}
# an Anarchy amp's family names the id the book's entry had before it was split into levels (no entry has it any more):
# scoped like one
FAMILY = ("amp", "family")
TAG = re.compile(r"<([A-Za-z][\w:.-]*)([^>]*)>")
ATTR = re.compile(r'(?<=\s)([\w:.-]+)="([^"]*)"')


# a game's data root, (prefix, namespace): the texts and sources files are written under <{prefix}:data xmlns:{prefix}=…>
# (SR6's: importer.sr6.ROOT); outside Anarchy's, scope() scopes every tag's ids (UNSCOPED_TAGS is Anarchy's)
CA2 = ("ca2", NS)


def data_root(kind, root=CA2):
    prefix, ns = root
    return f'<{prefix}:data xmlns:{prefix}="{ns}" kind="{kind}" version="1">\n', f"</{prefix}:data>\n"


def write_file(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf8", newline="\n") as f:
        f.write(text)
    # Windows refuses to replace a file the server is reading at that moment (it polls status.xml): wait and try again, as
    # server/common.mjs writeAtomic does. Elsewhere replace() never fails this way and the loop runs once.
    for i in range(20):
        try:
            return os.replace(tmp, path)
        except PermissionError:
            if i == 19 or not WINDOWS:
                raise
            time.sleep(0.01 * (i + 1))


def top_ids(xml):
    return {el.get("id") for el in ET.fromstring(xml.encode("utf8")) if el.get("id") and not el.tag.endswith("remove")}


def scope(xml, source, ids, root=CA2):
    """Prefix `<source>.` to every id-valued attribute naming one of `ids` (root: the game's data root)."""
    pre = source.lower() + "."
    unscoped = UNSCOPED_TAGS if root == CA2 else ()  # Anarchy's rule; every SR6 entry id is scoped

    def tag(t):
        name = t.group(1).split(":")[-1]
        if name in unscoped:
            return t.group(0)

        def attr(m):
            if unscoped and (name, m.group(1)) == FAMILY and m.group(2) and not m.group(2).startswith(pre):
                return f'{m.group(1)}="{pre}{m.group(2)}"'
            if (
                name == "slot" and m.group(1) == "id"
            ):  # (a slot's name, not an entry id: <fits slot="armor"> names it raw)
                return m.group(0)
            if ("*", m.group(1)) not in SCOPED and (name, m.group(1)) not in SCOPED:
                return m.group(0)
            return f'{m.group(1)}="{" ".join(pre + v if v in ids else v for v in m.group(2).split(" "))}"'

        return f"<{t.group(1)}{ATTR.sub(attr, t.group(2))}>"

    return TAG.sub(tag, xml)


def write_overlay(dir, name, xml, ids=None):
    """Write custom/imported/<source>/<name>; the folder name is the source. `ids` is the file set's
    entry ids (default: this file's), so cross-file references are scoped too."""
    write_file(
        os.path.join(dir, name),
        scope(xml, os.path.basename(os.path.normpath(dir)), top_ids(xml) if ids is None else ids),
    )


def merged_texts(path, entries, drop=(), root=CA2):
    """The kind="texts" file at `path` with (of, id, text) entries merged in by (of, id); others kept
    unless their id (or (of, id)) is in `drop`; under the game's data `root`. Raises on a corrupt existing file, so
    callers can build this before writing anything."""
    merged = {}
    if os.path.exists(path):
        merged = {
            (t.get("of"), t.get("id")): t.text or ""
            for t in ET.parse(path).getroot()
            if t.get("id") not in drop and (t.get("of"), t.get("id")) not in drop
        }
    merged.update({(of, i): text for of, i, text in entries})
    body = "".join(
        f"  <text of={quoteattr(of)} id={quoteattr(i)}>{escape(t)}</text>\n" for (of, i), t in merged.items()
    )
    start, end = data_root("texts", root)
    return HEAD + "<!-- PRIVATE: book text. Do not commit. -->\n" + start + body + end


def write_texts(path, entries):
    write_file(path, merged_texts(path, entries))


def texts_entries(xml):
    return [(t.get("of"), t.get("id"), t.text or "") for t in ET.fromstring(xml.encode("utf8"))]


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def xml_attrs(d):
    return "".join(f" {k}={quoteattr(str(v))}" for k, v in d.items() if v is not None)


def write_status(book_dir, state, message=""):
    write_file(
        os.path.join(book_dir, "status.xml"),
        HEAD + f'<status state="{state}" updated="{_now()}">{escape(ILLEGAL.sub("", message))}</status>\n',
    )


def read_state(book_dir):
    """status.xml's state, or None."""
    p = os.path.join(book_dir, "status.xml")
    return ET.parse(p).getroot().get("state") if os.path.exists(p) else None


def read_import(book_dir):
    p = os.path.join(book_dir, "import.xml")
    return ET.parse(p).getroot() if os.path.exists(p) else None


def write_import(book_dir, report=(), files=None, extras=(), **attrs):
    """library/<id>/import.xml: recipe, source, file, sha256, dates, counts per file, report rows; `extras`: the further
    sources the book holds (an SR6 City Edition's city chapter), each an <extra id name publisher canon/> for sources.xml.
    """
    rows = "".join(f"    <row{xml_attrs(r)}/>\n" for r in report)
    counts = "".join(f"    <file{xml_attrs({'name': n, 'entries': c})}/>\n" for n, c in (files or {}).items())
    more = "".join(f"  <extra{xml_attrs(x)}/>\n" for x in extras)
    write_file(
        os.path.join(book_dir, "import.xml"),
        HEAD + f"<import{xml_attrs(attrs)}>\n"
        f"  <files>\n{counts}  </files>\n  <report>\n{rows}  </report>\n{more}</import>\n",
    )


def update_index(custom_dir):
    """custom/imported/index.xml: every imported/<source>/*.xml (samples/ excluded; core/ is loaded as the core data)."""
    root = os.path.join(custom_dir, "imported")
    hrefs = sorted(
        f"{s}/{f}"
        for s in os.listdir(root)
        if os.path.isdir(os.path.join(root, s)) and s != "core"
        for f in os.listdir(os.path.join(root, s))
        if f.endswith(".xml")
    )
    write_file(
        os.path.join(root, "index.xml"),
        HEAD
        + "<!-- Generated by the importer. Do not edit. -->\n<overlays>\n"
        + "".join(f"  <file href={quoteattr(h)}/>\n" for h in hrefs)
        + "</overlays>\n",
    )


def _merged_list(custom_dir, kind, source, rows):
    """custom/imported/<kind>.xml text (<samples><sample …/>, <npcs><npc …/>): this source's rows replaced by `rows`.
    Raises on a corrupt existing list, so callers can build it before writing anything."""
    path = os.path.join(custom_dir, "imported", f"{kind}.xml")
    keep = [s.attrib for s in ET.parse(path).getroot() if s.get("source") != source] if os.path.exists(path) else []
    return (
        HEAD
        + f"<!-- Generated by the importer. Do not edit. -->\n<{kind}>\n"
        + "".join(f"  <{kind[:-1]}{xml_attrs(r)}/>\n" for r in keep + rows)
        + f"</{kind}>\n"
    )


def merged_samples(custom_dir, source, samples):
    """custom/imported/samples.xml text: every imported sample runner, this source's rows replaced by `samples`."""
    return _merged_list(
        custom_dir,
        "samples",
        source,
        [
            {
                "source": source,
                "href": f"{source.lower()}/samples/{s['file']}",
                "name": s["name"],
                "role": s.get("role"),
                "page": s.get("page"),
            }
            for s in samples
        ],
    )


def merged_npcs(custom_dir, source, npcs):
    """custom/imported/npcs.xml text: every imported book NPC, this source's rows replaced by `npcs`."""
    return _merged_list(
        custom_dir,
        "npcs",
        source,
        [
            {
                "source": source,
                "href": f"{source.lower()}/npcs/{n['file']}",
                "name": n["name"],
                "kind": n["kind"],
                "tier": n["tier"],
                "page": n.get("page"),
            }
            for n in npcs
        ],
    )
