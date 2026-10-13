"""SR6 book import: library/sr6/<id>/original.pdf -> book.md (converter sr6 layout) -> regrouped.md -> the recipe's
catalog in custom/sr6/imported/<source>/<kind>.xml, its texts in custom/sr6/texts/<source>.xml, its sample runners in
custom/sr6/imported/<source>/samples/ (listed in custom/sr6/imported/samples.xml, as Anarchy's), and the records. The
same states and records as Anarchy's run (importer/__main__.py), every SR6 data file under the sr6:data root."""
import hashlib
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

from importer import library, reflow, xmlio
from importer.convert import SR6_CONVERTER_VERSION, convert
from importer.sr6 import ROOT, classes, effects, moved, overrides, regroup, resolve
from importer.sr6.recipes import RECIPES, identify, printing, skipped

def run(book_dir, custom_dir, convert_pdf=True, file_name=None, refresh=True):
    """Returns the recipe's Result, or None when no SR6 recipe matched (status failed). refresh: the books whose sample
    runners name something this import brings are read again (_cited)."""
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
            _corpus(book_dir, custom_dir)  # an errata or a card deck: read with the books it reprints
            return None
        recipe, score = identify(meta, md[:4000])
        if recipe is None:
            xmlio.write_import(book_dir, score=f"{score:.2f}", **rec)
            xmlio.write_status(book_dir, "failed", "no SR6 recipe matched this book")
            return None

        xmlio.write_status(book_dir, "extracting")
        res, md, text, report = _read(recipe, md, custom_dir)
        xmlio.write_file(os.path.join(book_dir, "regrouped.md"), text)
        if hasattr(recipe, "extra"):  # the further sources the book holds (a City Edition's city chapter)
            res.extra = recipe.extra(md, meta["sha256"])
            for x in res.extra:
                x.files, x.texts = effects.apply(x.files, x.texts, text)
                x.files = classes.apply(overrides.apply(x.source["id"], x.files))  # (a City Edition's city: its own table)
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
        # several printings of the book: the one published last is loaded, the others listed as superseded
        mine = printing(meta["sha256"])
        others = [(p, d, st) for p, d, st in _same_source(book_dir, src) if p and mine]
        newer = max(((p, d) for p, d, st in others if st == "done" and p > mine), default=None)
        older = [] if newer else [(p, d, st) for p, d, st in others if st in ("done", "superseded") and p < mine]
        prev = moved.previous(out_dir)  # the ids the last import wrote (read before anything replaces them)
        prev_extra = {x: moved.previous(os.path.join(custom_dir, "imported", x.lower()))
                      for x in (old.get("extra") or "").split()} if old is not None else {}
        if older:  # field by field: a value this printing leaves out (or prints as no SR6 value) the next older one's
            res.files, _ = older_printings(res.files, [(p[1], _catalog(recipe, d, custom_dir))
                                                       for p, d, _ in sorted(older, key=lambda o: o[0], reverse=True)])
        if any(st == "done" for _, _, st in older):
            _drop(custom_dir, src)  # the older printing's catalog, texts and sample runners (this one's replace them)
        if not newer:
            texts_path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
            # the texts first: a corrupt texts file fails the import before any overlay is replaced
            texts = _texts(texts_path, res.texts, src, ids) if res.texts else None
            samples_path = os.path.join(custom_dir, "imported", "samples.xml")  # likewise a corrupt samples list
            samples = xmlio.merged_samples(custom_dir, src, res.samples) if res.samples or os.path.exists(samples_path) else None
            files, _ = moved.carry(prev, {n: xmlio.scope(x, src, ids, ROOT) for n, x in res.files.items()})
            for name, xml in files.items():
                xmlio.write_file(os.path.join(out_dir, name), xml)
            if texts:
                xmlio.write_file(texts_path, texts)
            for s in res.samples:  # sr6:character files, their ids already scoped
                xmlio.write_file(os.path.join(out_dir, "samples", s["file"]), s["xml"])
            if samples:
                xmlio.write_file(samples_path, samples)
        for x in (old.get("extra") or "").split() if old is not None else ():
            _drop(custom_dir, x)  # the last import's further sources
        for x in res.extra:
            _write_extra(custom_dir, x, prev_extra.get(x.source["id"], {}))
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
        library.update_sources(custom_dir, os.path.dirname(os.path.normpath(book_dir)), ROOT)
        if not newer:
            xmlio.write_status(book_dir, "done")
        elif _fills(out_dir, src, res.files):
            # an older printing imported after the loaded one, printing what the loaded one leaves open: the loaded one
            # again, so each field takes the newest printing's valid value whatever the import order
            run(newer[1], custom_dir, convert_pdf=False)
            return res
        _corpus(book_dir, custom_dir)
        for d in _cited(book_dir, custom_dir, res) if refresh and not newer else ():
            run(d, custom_dir, convert_pdf=False, refresh=False)  # (once: no book read again reads others again)
        return res
    except Exception as e:
        xmlio.write_status(book_dir, "failed", f"{type(e).__name__}: {e}")
        raise


def _read(recipe, md, custom_dir):
    """A book's book.md as its recipe reads it: (Result with every entry's effects, the md its recipe prepared, the
    regrouped text, regroup's report)."""
    if hasattr(recipe, "prepare_md"):  # a book's own page furniture the converter can't tell (a running head on top)
        md = recipe.prepare_md(md)
    text, report = regroup.regroup(md, recipe.ALIASES, name_headers=recipe.NAME_HEADERS,
                                   end_page=getattr(recipe, "END_PAGE", None),
                                   variants=getattr(recipe, "VARIANT_ROWS", False))
    res = recipe.extract(text, {"custom_dir": custom_dir})  # (a book's sample runners cite the core rulebook's catalog)
    res.files, res.texts = effects.apply(res.files, res.texts, text)  # every entry's effects, from its text and the book's tables
    res.files = overrides.apply(getattr(recipe, "ID", ""), res.files)  # the book's last-resort Commlink6 name table
    res.files = classes.apply(res.files)  # Commlink6's class on each entry of a category it classes alike (an override's own stays)
    res.texts = overrides.texts(getattr(recipe, "ID", ""), res.files, res.texts)  # (an added entry that takes a heading's text)
    return res, md, text, report


def _catalog(recipe, book_dir, custom_dir):
    """Another printing's catalog as an import of it reads it now (from its book.md): {file: xml}, ids unscoped; {}
    when it has no book.md or fails to read."""
    path = os.path.join(book_dir, "book.md")
    try:
        return _read(recipe, Path(path).read_text(encoding="utf8"), custom_dir)[0].files if os.path.exists(path) else {}
    except Exception:  # noqa: BLE001 (an older printing that no longer reads gives nothing)
        return {}


FALLBACK = ("missing", "unreadable")  # (an issue's codes: no value printed, or one that is no SR6 value: vocab.py)


def older_printings(files, olds, prefix=""):
    """The owner's rule, field by field the latest printing wins: a field `files` leaves open (an issue FALLBACK) takes
    the value of the newest of `olds` ([(printing label, {file: xml})], newest first, ids unscoped) that prints it valid
    (a value with no issue of its own), with its formula, noted <found how="printing">that printing</found>. prefix: the
    source scope of the ids in `files` (a catalog on disk). (files, the fields filled)."""
    from lxml import etree

    from importer.sr6.resolve import _add_kid, _kids
    parse = lambda xml: etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))  # noqa: E731
    index = {}
    for label, of in olds:
        for name, xml in of.items():
            for el in parse(xml) if xml else ():
                if isinstance(el.tag, str) and el.get("id"):
                    index.setdefault((name, el.get("id")), []).append((label, el))
    out, n = {}, 0
    for name, xml in files.items():
        root, changed = parse(xml), False
        for el in root:
            i = el.get("id") or "" if isinstance(el.tag, str) else ""
            for iss in [x for x in _kids(el, "issue") if x.get("code") in FALLBACK]:
                f = iss.get("field")
                got = next(((label, o) for label, o in index.get((name, i[len(prefix):] if i.startswith(prefix) else i), ())
                            if (o.get(f) or "").strip() not in ("", "—", "-")
                            and not any(x.get("field") == f for x in _kids(o, "issue"))), None)
                if not got:
                    continue
                label, o = got
                el.set(f, o.get(f))
                el.remove(iss)
                for x in [x for x in _kids(el, "formula") if x.get("field") == f]:
                    el.remove(x)
                for x in [x for x in _kids(o, "formula") if x.get("field") == f]:
                    _add_kid(el, "formula", dict(x.attrib), x.text)
                _add_kid(el, "found", {"field": f, "how": "printing", "source": el.get("source"), "page": o.get("page")}, label)
                changed, n = True, n + 1
        out[name] = (xmlio.HEAD + etree.tostring(root, encoding="unicode").rstrip("\n") + "\n") if changed else xml
    return out, n


def _fills(out_dir, src, files):
    """Whether this printing's catalog (`files`, ids unscoped) prints a valid value of a field the loaded printing's
    catalog (out_dir, on disk) leaves open or took from a printing (which may be older than this one)."""
    reopen = lambda x: re.sub(r'<found field="([^"]+)" how="printing"[^>]*>[^<]*</found>', r'<issue field="\1" code="missing"/>', x)  # noqa: E731
    disk = {n: reopen(Path(out_dir, n).read_text(encoding="utf8")) for n in files if os.path.isfile(os.path.join(out_dir, n))}
    return older_printings(disk, [("", files)], prefix=src.lower() + ".")[1] > 0


def _corpus(book_dir, custom_dir):
    """The third circle (resolve.py): every book's open issues looked for in the rest of the library, each errata
    applied to its own book. A failure there leaves this import as it is (its issues stay open)."""
    try:
        resolve.library(os.path.dirname(os.path.normpath(book_dir)), custom_dir)
    except Exception as e:  # noqa: BLE001
        print(f"corpus pass: {type(e).__name__}: {e}", file=sys.stderr)


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


def _cited(book_dir, custom_dir, res):
    """The library's other imported books whose sample runners name something not in the catalog that this import now
    has (a Smooth Operations face's Sixth World Companion quality, that book imported after it): their dirs, read again
    so a sample is fitted against every book in the library whatever the import order. A name matches as whole words
    of the printed one, less its quantity and what follows a bracket or `w/` (`AV Rapid Transit (…)`: Rapid Transit)."""
    names = set()
    for x in [res, *res.extra]:
        for xml in x.files.values():
            names |= {regroup.norm(re.split(r"\s*\(", n)[0]) for n in re.findall(r"<name>([^<]*)</name>", xml)}
    names.discard("")
    library, me, out = os.path.dirname(os.path.normpath(book_dir)), os.path.normpath(book_dir), []
    for b in sorted(os.listdir(library)):
        d = os.path.join(library, b)
        imp = xmlio.read_import(d) if os.path.normpath(d) != me and os.path.isdir(d) else None
        src = imp is not None and xmlio.read_state(d) == "done" and (imp.get("source") or "").lower()
        sd = os.path.join(custom_dir, "imported", src, "samples") if src else ""
        if not sd or not os.path.isdir(sd):
            continue
        missing = [regroup.norm(re.split(r"\s*[(\[]|\s+w/", re.sub(r"^\d+\s*x\s+", "", item.strip()))[0])
                   for f in os.listdir(sd) for m in re.findall(r"not in the catalog: (.*?)\.(?=\s|<|$)", Path(sd, f).read_text(encoding="utf8"))
                   for item in m.split("; ")]
        if any(n == m or f" {n} " in f" {m} " for m in missing if m for n in names):
            out.append(d)
    return out


def _same_source(book_dir, src):
    """The library's other books imported as `src`: [(printing or None, dir, state)]."""
    library, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    out = []
    for b in os.listdir(library):
        d = os.path.join(library, b)
        imp = xmlio.read_import(d) if b != me and os.path.isdir(d) else None
        if imp is not None and (imp.get("source") or "").lower() == src.lower():
            out.append((printing(imp.get("sha256")), d, xmlio.read_state(d)))
    return out


def _texts(path, xml, src, ids):
    """The source's texts file with `xml`'s descriptions merged in: each in paragraphs, words split across the PDF's
    lines rejoined (importer/reflow.py)."""
    entries = xmlio.texts_entries(xmlio.scope(xml, src, ids, ROOT))
    words = reflow.vocabulary(t for _, _, t in entries)
    return xmlio.merged_texts(path, [(of, i, reflow.reflow(t, words)) for of, i, t in entries], root=ROOT)


def _write_extra(custom_dir, res, prev=None):
    """A further source the book holds (Result.extra): its catalog in custom/sr6/imported/<source>/ (with the old ids
    of its last import, `prev`, as id aliases), its texts."""
    src = res.source["id"]
    ids = set().union(*(xmlio.top_ids(x) for x in res.files.values()))
    files, _ = moved.carry(prev or {}, {n: xmlio.scope(x, src, ids, ROOT) for n, x in res.files.items()})
    for name, xml in files.items():
        xmlio.write_file(os.path.join(custom_dir, "imported", src.lower(), name), xml)
    if res.texts:
        path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
        xmlio.write_file(path, _texts(path, res.texts, src, ids))


def _drop(custom_dir, src):
    if not library.SAFE_SOURCE_ID.fullmatch(src or ""):  # an id read from import.xml: never a path
        return
    shutil.rmtree(os.path.join(custom_dir, "imported", src.lower()), ignore_errors=True)
    texts = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
    if os.path.exists(texts):
        os.remove(texts)


def remove(book_dir, custom_dir, forget=False):
    """The library's remove (importer/library.py) under the sr6:data root: it rewrites the samples list too (SR6 has no
    npcs list). The book's further sources (import.xml extra) go with it. The loaded printing of a book removed, the newest
    superseded one is imported again (from its book.md) and loaded. A further source another book also holds (the same
    PDF uploaded twice) stays."""
    imp = xmlio.read_import(book_dir)
    src, loaded = (imp.get("source") if imp is not None else None), xmlio.read_state(book_dir) == "done"
    shelf, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    held = {x for b in os.listdir(shelf) if b != me and os.path.isdir(os.path.join(shelf, b))
            for i in [xmlio.read_import(os.path.join(shelf, b))] if i is not None for x in (i.get("extra") or "").split()}
    for x in (imp.get("extra") or "").split() if imp is not None else ():
        if x not in held:
            _drop(custom_dir, x)
    library.remove(book_dir, custom_dir, forget=forget, root=ROOT)
    others = _same_source(book_dir, src) if src and loaded else []
    nxt = max(((p, d) for p, d, st in others if p and st == "superseded"), default=None)
    if nxt and not any(st == "done" for _, _, st in others):
        try:
            run(nxt[1], custom_dir, convert_pdf=False)
        except Exception:  # noqa: BLE001  (its own status says why; this book is removed)
            pass
