"""SR6 book import: library/sr6/<id>/original.pdf -> book.md (converter sr6 layout) -> regrouped.md -> the recipe's
catalog in custom/sr6/imported/<source>/<kind>.xml, its texts in custom/sr6/texts/<source>.xml, its sample runners in
custom/sr6/imported/<source>/samples/ (listed in custom/sr6/imported/samples.xml, as Anarchy's), and the records. The
same states and records as Anarchy's run (importer/__main__.py), every SR6 data file under the sr6:data root."""
import hashlib
import os
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from importer import __main__ as anarchy, reflow, xmlio
from importer.convert import SR6_CONVERTER_VERSION, convert
from importer.sr6 import NS, regroup
from importer.sr6.recipes import RECIPES, identify, skipped


def sr6_root():
    return xmlio.root("sr6", NS)


def run(book_dir, custom_dir, convert_pdf=True, file_name=None):
    """Returns the recipe's Result, or None when no SR6 recipe matched (status failed)."""
    pdf, md_path = os.path.join(book_dir, "original.pdf"), os.path.join(book_dir, "book.md")
    old = xmlio.read_import(book_dir)
    file_name = file_name or (old.get("file") if old is not None else None) or "original.pdf"
    try:
        xmlio.write_status(book_dir, "converting")
        if convert_pdf:
            # a printing a recipe knows by its fingerprint may come with its heading sizes and font (the guess can miss them)
            sha = hashlib.sha256(Path(pdf).read_bytes()).hexdigest()
            known = next((r for r in RECIPES if sha in r.SHA256), None)
            meta = convert(pdf, md_path, sr6=True, levels=getattr(known, "HEADING_LEVELS", None),
                           heading=getattr(known, "HEADING_FONT", None))
        else:
            sha = hashlib.sha256(Path(pdf).read_bytes()).hexdigest() if os.path.exists(pdf) else ""
            meta = {"converter": SR6_CONVERTER_VERSION, "sha256": sha, "title": _pdf_title(pdf)}
        md = Path(md_path).read_text(encoding="utf8")
        meta["pages"] = len(re.findall(r"<!-- page \d+ -->", md))
        rec = {"file": file_name, "sha256": meta["sha256"], "converter": meta["converter"], "pages": meta["pages"]}

        xmlio.write_status(book_dir, "identifying")
        if why := skipped(meta, file_name):  # before identify: an errata's first page reads as its book's
            xmlio.write_import(book_dir, **rec)
            xmlio.write_status(book_dir, "skipped", f"Nothing to import: {why}")
            return None
        recipe, score = identify(meta, md[:4000])
        if recipe is None:
            xmlio.write_import(book_dir, score=f"{score:.2f}", **rec)
            xmlio.write_status(book_dir, "failed", "no SR6 recipe matched this book")
            return None

        xmlio.write_status(book_dir, "extracting")
        if hasattr(recipe, "prepare_md"):  # a book's own page furniture the converter can't tell (a running head on top)
            md = recipe.prepare_md(md)
        text, report = regroup.regroup(md, recipe.ALIASES, name_headers=recipe.NAME_HEADERS,
                                       end_page=getattr(recipe, "END_PAGE", None),
                                       variants=getattr(recipe, "VARIANT_ROWS", False))
        xmlio.write_file(os.path.join(book_dir, "regrouped.md"), text)
        res = recipe.extract(text, {"custom_dir": custom_dir})  # (a book's sample runners cite the core rulebook's catalog)
        if hasattr(recipe, "extra"):  # the further sources the book holds (a City Edition's city chapter)
            res.extra = recipe.extra(md, meta["sha256"])
        for r in report:  # regroup reports PDF pages; the import report prints the book's
            if isinstance(r.get("page"), int):
                r["page"] = max(1, r["page"] - recipe.PAGE_OFFSET)
        if not res.files:  # (a booklet a looser match took: the Beginner Box quick-start rules read as the core rulebook)
            xmlio.write_import(book_dir, score=f"{score:.2f}", recipe=recipe.__name__.rsplit(".", 1)[1], **rec)
            xmlio.write_status(book_dir, "failed", f"{res.source['name']}: nothing in this book reads as its entries")
            return None
        src = res.source["id"]
        out_dir = os.path.join(custom_dir, "imported", src.lower())
        ids = set().union(*(xmlio.top_ids(x) for x in res.files.values()))
        # several printings of the book: the newest is the one loaded, the others listed as superseded
        mine = _printing(meta["sha256"])
        others = [(p, d, st) for p, d, st in _same_source(book_dir, src) if p and mine]
        newer = max(((p, d) for p, d, st in others if st == "done" and p > mine), default=None)
        older = [] if newer else [(p, d, st) for p, d, st in others if st in ("done", "superseded") and p < mine]
        if any(st == "done" for _, _, st in older):
            _drop(custom_dir, src)  # the older printing's catalog, texts and sample runners (this one's replace them)
        with sr6_root():
            if not newer:
                texts_path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
                # the texts first: a corrupt texts file fails the import before any overlay is replaced
                texts = _texts(texts_path, res.texts, src, ids) if res.texts else None
                samples_path = os.path.join(custom_dir, "imported", "samples.xml")  # likewise a corrupt samples list
                samples = xmlio.merged_samples(custom_dir, src, res.samples) if res.samples or os.path.exists(samples_path) else None
                for name, xml in res.files.items():
                    xmlio.write_overlay(out_dir, name, xml, ids)
                if texts:
                    xmlio.write_file(texts_path, texts)
                for s in res.samples:  # sr6:character files, their ids already scoped
                    xmlio.write_file(os.path.join(out_dir, "samples", s["file"]), s["xml"])
                if samples:
                    xmlio.write_file(samples_path, samples)
            for x in (old.get("extra") or "").split() if old is not None else ():
                _drop(custom_dir, x)  # the last import's further sources
            for x in res.extra:
                _write_extra(custom_dir, x)
            xmlio.write_import(book_dir, report=report + res.report + [r for x in res.extra for r in x.report],
                               extra=" ".join(x.source["id"] for x in res.extra) or None,
                               extras=[{"id": x.source["id"], "name": x.source["name"], "publisher": x.source["publisher"],
                                        "canon": str(x.source["canon"]).lower()} for x in res.extra],
                               files={n: len(xmlio.top_ids(x)) for n, x in res.files.items()},
                               recipe=recipe.__name__.rsplit(".", 1)[1], score=f"{score:.2f}", source=src,
                               name=res.source["name"], publisher=res.source["publisher"],
                               canon=str(res.source["canon"]).lower(),
                               imported=datetime.now(timezone.utc).isoformat(timespec="seconds"), **rec)
            for _, d, _ in older:
                xmlio.write_status(d, "superseded", f"Superseded by {mine[1]}")
            if newer:
                xmlio.write_status(book_dir, "superseded", f"Superseded by {newer[0][1]}")
            xmlio.update_index(custom_dir)
            xmlio.update_sources(custom_dir, os.path.dirname(os.path.normpath(book_dir)))
        if not newer:
            xmlio.write_status(book_dir, "done")
        return res
    except Exception as e:
        xmlio.write_status(book_dir, "failed", f"{type(e).__name__}: {e}")
        raise


def _pdf_title(pdf):
    """The PDF's metadata title ('' when absent or unreadable): a book identified by its title (a general recipe) is
    identified again when re-run from its book.md."""
    if not os.path.exists(pdf):
        return ""
    import pdfplumber
    try:
        with pdfplumber.open(pdf) as d:
            return (d.metadata or {}).get("Title", "") or ""
    except Exception:  # noqa: BLE001 (an unreadable PDF has no title)
        return ""


def _printing(sha):
    """(rank, label) of a known printing (a recipe's PRINTINGS, oldest first: the higher rank the newer), or None."""
    for r in RECIPES:
        p = getattr(r, "PRINTINGS", {})
        if sha in p:
            return list(p).index(sha), p[sha]
    return None


def _same_source(book_dir, src):
    """The library's other books imported as `src`: [(printing or None, dir, state)]."""
    library, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    out = []
    for b in os.listdir(library):
        d = os.path.join(library, b)
        imp = xmlio.read_import(d) if b != me and os.path.isdir(d) else None
        if imp is not None and (imp.get("source") or "").lower() == src.lower():
            out.append((_printing(imp.get("sha256")), d, xmlio.read_state(d)))
    return out


def _texts(path, xml, src, ids):
    """The source's texts file with `xml`'s descriptions merged in: each in paragraphs, words split across the PDF's
    lines rejoined (importer/reflow.py)."""
    entries = xmlio.texts_entries(xmlio.scope(xml, src, ids))
    words = reflow.vocabulary(t for _, _, t in entries)
    return xmlio.merged_texts(path, [(of, i, reflow.reflow(t, words)) for of, i, t in entries])


def _write_extra(custom_dir, res):
    """A further source the book holds (Result.extra): its catalog in custom/sr6/imported/<source>/, its texts."""
    src = res.source["id"]
    ids = set().union(*(xmlio.top_ids(x) for x in res.files.values()))
    for name, xml in res.files.items():
        xmlio.write_overlay(os.path.join(custom_dir, "imported", src.lower()), name, xml, ids)
    if res.texts:
        path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
        xmlio.write_file(path, _texts(path, res.texts, src, ids))


def _drop(custom_dir, src):
    if not anarchy.SAFE_SOURCE_ID.fullmatch(src or ""):  # an id read from import.xml: never a path
        return
    shutil.rmtree(os.path.join(custom_dir, "imported", src.lower()), ignore_errors=True)
    texts = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
    if os.path.exists(texts):
        os.remove(texts)


def remove(book_dir, custom_dir, forget=False):
    """Anarchy's remove (importer/__main__.py) under the sr6:data root: it rewrites the samples list too (SR6 has no npcs
    list). The book's further sources (import.xml extra) go with it. The loaded printing of a book removed, the newest
    superseded one is imported again (from its book.md) and loaded. A further source another book also holds (the same
    PDF uploaded twice) stays."""
    imp = xmlio.read_import(book_dir)
    src, loaded = (imp.get("source") if imp is not None else None), xmlio.read_state(book_dir) == "done"
    library, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    held = {x for b in os.listdir(library) if b != me and os.path.isdir(os.path.join(library, b))
            for i in [xmlio.read_import(os.path.join(library, b))] if i is not None for x in (i.get("extra") or "").split()}
    for x in (imp.get("extra") or "").split() if imp is not None else ():
        if x not in held:
            _drop(custom_dir, x)
    with sr6_root():
        anarchy.remove(book_dir, custom_dir, forget=forget)
    others = _same_source(book_dir, src) if src and loaded else []
    nxt = max(((p, d) for p, d, st in others if p and st == "superseded"), default=None)
    if nxt and not any(st == "done" for _, _, st in others):
        try:
            run(nxt[1], custom_dir, convert_pdf=False)
        except Exception:  # noqa: BLE001  (its own status says why; this book is removed)
            pass
