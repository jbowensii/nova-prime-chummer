"""A library of books (library/<id>/: the PDF, its import records) and what their imports wrote under custom/: removing a
book, the other books of its source, the sources list. Shared by both games' importers (Anarchy's importer/__main__.py,
SR6's importer/sr6/run.py); each passes its data root (xmlio.CA2, or SR6's importer.sr6.ROOT)."""
import os
import re
import shutil
from pathlib import Path

from importer import xmlio

# A source id as it may name a folder or file under custom/ (letters, digits, dash, underscore; no dots or slashes).
SAFE_SOURCE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")


def same_source(book_dir, source):
    """import.xml of the other books in the library that name `source`: library/sr6/ (the Shadowrun 6 area's books, in
    Anarchy's library) is no book, and a superseded printing (an SR6 book's older one) loads nothing."""
    library, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    imps = (xmlio.read_import(os.path.join(library, b)) for b in os.listdir(library)
            if b != me and b.lower() != "sr6" and os.path.isdir(os.path.join(library, b))  # sr6/: the Shadowrun 6 area's books
            and xmlio.read_state(os.path.join(library, b)) != "superseded")
    return [i for i in imps if i is not None and (i.get("source") or "").lower() == source.lower()]


def remove(book_dir, custom_dir, forget=False, status=True, *, root):
    """Undo a book's import: its overlay files, and (unless another book imports the same source) the
    source's folder, texts and samples; then its import record (`forget`: the whole library/<id>) and,
    unless `status` is False (a caller mid-job), status "removed".
    Rebuilds custom/imported/index.xml and sources.xml. A re-import runs this first, so nothing an
    earlier import wrote outlives it. root (required, so a game never gets another's by default): the game's data root of the texts and sources files (xmlio.CA2, SR6's)."""
    library = os.path.dirname(os.path.normpath(book_dir))
    imp = xmlio.read_import(book_dir)
    src = imp.get("source") if imp is not None else None
    if src and not SAFE_SOURCE_ID.fullmatch(src):  # a tampered import.xml must not point the deletes outside custom/
        src = None
    if src:
        out_dir = os.path.join(custom_dir, "imported", src.lower())
        others = same_source(book_dir, src)
        shared = {f.get("name") for o in others for f in o.iter("file")}
        gone = set()
        for f in imp.iter("file"):
            name = os.path.basename(f.get("name") or "")
            path = os.path.join(out_dir, name)
            if name.endswith(".xml") and name not in shared and os.path.isfile(path):
                gone |= xmlio.top_ids(Path(path).read_text(encoding="utf8"))
                os.remove(path)
        texts = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
        samples = os.path.join(custom_dir, "imported", "samples.xml")
        if not others:
            shutil.rmtree(out_dir, ignore_errors=True)
            if os.path.exists(texts):
                os.remove(texts)
            if os.path.exists(samples):
                xmlio.write_file(samples, xmlio.merged_samples(custom_dir, src, []))
            npcs = os.path.join(custom_dir, "imported", "npcs.xml")
            if os.path.exists(npcs):
                xmlio.write_file(npcs, xmlio.merged_npcs(custom_dir, src, []))
        elif gone and os.path.exists(texts):
            xmlio.write_file(texts, xmlio.merged_texts(texts, [], drop=gone, root=root))
    if forget:
        shutil.rmtree(book_dir, ignore_errors=True)
    else:
        if imp is not None:
            xmlio.write_import(book_dir, **{k: imp.get(k) for k in ("file", "sha256", "converter", "pages", "score")})
        if status:
            xmlio.write_status(book_dir, "removed")
    if os.path.isdir(os.path.join(custom_dir, "imported")):
        xmlio.update_index(custom_dir)
        update_sources(custom_dir, library, root)


def update_sources(custom_dir, library_dir, root):
    """custom/imported/sources.xml: one <source> per imported source id, from the books' import.xml.
    A source imported from several files (the four quick-reference sheets) lists them all. A book's further sources
    (<extra>: an SR6 City Edition's city chapter) are listed too, a superseded printing's as well (it still loads them).
    root: the game's data root (xmlio.CA2, SR6's)."""
    by_id = {}
    for b in sorted(os.listdir(library_dir)):
        if b.lower() == "sr6":  # library/sr6/: the Shadowrun 6 area's books, never an Anarchy source
            continue
        imp = xmlio.read_import(os.path.join(library_dir, b)) if os.path.isdir(os.path.join(library_dir, b)) else None
        if imp is None or not imp.get("source"):  # needs-ai / failed books have no source yet
            continue
        for x in imp.iter("extra"):
            by_id.setdefault(x.get("id"), []).append({**{k: imp.get(k) for k in ("file", "sha256", "imported")}, **x.attrib})
        if xmlio.read_state(os.path.join(library_dir, b)) == "superseded":  # an SR6 book's older printing: not loaded
            continue
        by_id.setdefault(imp.get("source"), []).append(imp)
    out = []
    for sid, imps in sorted(by_id.items()):
        last = max(imps, key=lambda i: i.get("imported", ""))
        texts = f"texts/{sid.lower()}.xml"
        a = {"id": sid, "publisher": last.get("publisher"), "canon": last.get("canon"),
             "texts": texts if os.path.exists(os.path.join(custom_dir, texts)) else None,
             "file": "; ".join(i.get("file") for i in imps), "sha256": " ".join(i.get("sha256") for i in imps),
             "imported": last.get("imported")[:10]}
        out.append(f"  <source{xmlio.xml_attrs(a)}><name>{xmlio.escape(last.get('name'))}</name></source>\n")
    start, end = xmlio.data_root("sources", root)
    xmlio.write_file(os.path.join(custom_dir, "imported", "sources.xml"), xmlio.HEAD + "<!-- Generated by the importer. Do not edit. -->\n"
               + start + "".join(out) + end)
