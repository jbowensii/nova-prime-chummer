"""SR6 book import: library/sr6/<id>/original.pdf -> book.md (converter sr6 layout) -> regrouped.md -> the recipe's
catalog in custom/sr6/imported/<source>/<kind>.xml, its texts in custom/sr6/texts/<source>.xml, and the records. The
same states and records as Anarchy's run (importer/__main__.py), every SR6 file under the sr6:data root."""
import hashlib
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from importer import __main__ as anarchy, xmlio
from importer.convert import SR6_CONVERTER_VERSION, convert
from importer.sr6 import NS, regroup
from importer.sr6.recipes import identify


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
            meta = convert(pdf, md_path, sr6=True)
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
        text, report = regroup.regroup(md, recipe.ALIASES, name_headers=recipe.NAME_HEADERS)
        xmlio.write_file(os.path.join(book_dir, "regrouped.md"), text)
        res = recipe.extract(text)
        for r in report:  # regroup reports PDF pages; the import report prints the book's
            if isinstance(r.get("page"), int):
                r["page"] = max(1, r["page"] - recipe.PAGE_OFFSET)
        src = res.source["id"]
        out_dir = os.path.join(custom_dir, "imported", src.lower())
        ids = set().union(*(xmlio.top_ids(x) for x in res.files.values()))
        with sr6_root():
            texts_path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
            # the texts first: a corrupt texts file fails the import before any overlay is replaced
            texts = xmlio.merged_texts(texts_path, xmlio.texts_entries(xmlio.scope(res.texts, src, ids))) if res.texts else None
            for name, xml in res.files.items():
                xmlio.write_overlay(out_dir, name, xml, ids)
            if texts:
                xmlio.write_file(texts_path, texts)
            xmlio.write_import(book_dir, report=report + res.report,
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


def remove(book_dir, custom_dir, forget=False):
    """Anarchy's remove (importer/__main__.py) under the sr6:data root; SR6 has no samples or npcs lists to rewrite."""
    with sr6_root():
        anarchy.remove(book_dir, custom_dir, forget=forget)
