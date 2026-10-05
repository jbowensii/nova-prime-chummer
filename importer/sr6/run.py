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
from importer.sr6.recipes import RECIPES, identify


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
            meta = {"converter": SR6_CONVERTER_VERSION, "sha256": sha, "title": ""}
        md = Path(md_path).read_text(encoding="utf8")
        meta["pages"] = len(re.findall(r"<!-- page \d+ -->", md))
        rec = {"file": file_name, "sha256": meta["sha256"], "converter": meta["converter"], "pages": meta["pages"]}

        xmlio.write_status(book_dir, "identifying")
        recipe, score = identify(meta, md[:4000])
        if recipe is None:
            xmlio.write_import(book_dir, score=f"{score:.2f}", **rec)
            xmlio.write_status(book_dir, "failed", "no SR6 recipe matched this book")
            return None

        xmlio.write_status(book_dir, "extracting")
        if hasattr(recipe, "prepare"):  # a book's own page furniture the converter can't tell (a running head on top)
            md = recipe.prepare(md)
        text, report = regroup.regroup(md, recipe.ALIASES, name_headers=recipe.NAME_HEADERS,
                                       end_page=getattr(recipe, "END_PAGE", None),
                                       variants=getattr(recipe, "VARIANT_ROWS", False))
        xmlio.write_file(os.path.join(book_dir, "regrouped.md"), text)
        res = recipe.extract(text)
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
        with sr6_root():
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
                               files={n: len(xmlio.top_ids(x)) for n, x in res.files.items()},
                               recipe=recipe.__name__.rsplit(".", 1)[1], score=f"{score:.2f}", source=src,
                               name=res.source["name"], publisher=res.source["publisher"],
                               canon=str(res.source["canon"]).lower(),
                               imported=datetime.now(timezone.utc).isoformat(timespec="seconds"), **rec)
            xmlio.update_index(custom_dir)
            xmlio.update_sources(custom_dir, os.path.dirname(os.path.normpath(book_dir)))
        xmlio.write_status(book_dir, "done")
        return res
    except Exception as e:
        xmlio.write_status(book_dir, "failed", f"{type(e).__name__}: {e}")
        raise


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
    list). The book's further sources (import.xml extra) go with it."""
    imp = xmlio.read_import(book_dir)
    for x in (imp.get("extra") or "").split() if imp is not None else ():
        _drop(custom_dir, x)
    with sr6_root():
        anarchy.remove(book_dir, custom_dir, forget=forget)
