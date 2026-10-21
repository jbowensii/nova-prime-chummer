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
from xml.sax.saxutils import escape, quoteattr

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
            # a printing a recipe knows by its fingerprint may come with its heading sizes and font (the guess can miss
            # them)
            sha = hashlib.sha256(Path(pdf).read_bytes()).hexdigest()
            known = next((r for r in RECIPES if sha in r.SHA256), None)
            meta = convert(
                pdf,
                md_path,
                sr6=True,
                levels=getattr(known, "HEADING_LEVELS", None),
                heading=getattr(known, "HEADING_FONT", None),
            )
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
        # several printings of the book: the one ranking last (printing(): the book's Current Printing, else the one
        # published last) is loaded, the others listed as superseded
        mine, src0 = printing(meta["sha256"]), getattr(
            recipe, "ID", ""
        )  # (ponytail: only the core rulebook has printings, and its source id is its recipe's ID)
        others = [(p, d, st) for p, d, st in _same_source(book_dir, src0) if p and mine] if src0 else []
        newer = max(((p, d) for p, d, st in others if st == "done" and p > mine), default=None)
        older = [] if newer else [(p, d, st) for p, d, st in others if st in ("done", "superseded") and p < mine]
        olds = [
            (p[1], *_catalog(recipe, d, custom_dir)) for p, d, _ in sorted(older, key=lambda o: o[0], reverse=True)
        ]  # (label, files, texts), newest first
        res, md, text, report = _read(recipe, md, custom_dir, olds)
        xmlio.write_file(os.path.join(book_dir, "regrouped.md"), text)
        if hasattr(recipe, "extra"):  # the further sources the book holds (a City Edition's city chapter)
            res.extra = recipe.extra(md, meta["sha256"])
            for x in res.extra:
                x.files, x.texts = read_effects(
                    x.source["id"], x.files, x.texts, text
                )  # (a City Edition's city: its own table)
        for r in report:  # regroup reports PDF pages; the import report prints the book's
            if isinstance(r.get("page"), int):
                r["page"] = max(1, r["page"] - recipe.PAGE_OFFSET)
        if (
            not res.files
        ):  # (a booklet a looser match took: the Beginner Box quick-start rules read as the core rulebook)
            xmlio.write_import(book_dir, score=f"{score:.2f}", recipe=recipe.__name__.rsplit(".", 1)[1], **rec)
            xmlio.write_status(book_dir, "failed", f"{res.source['name']}: nothing in this book reads as its entries")
            return None
        src = res.source["id"]
        out_dir = os.path.join(custom_dir, "imported", src.lower())
        ids = set().union(*(xmlio.top_ids(x) for x in res.files.values()))
        prev = moved.previous(out_dir)  # the ids the last import wrote (read before anything replaces them)
        prev_extra = (
            {
                x: moved.previous(os.path.join(custom_dir, "imported", x.lower()))
                for x in (old.get("extra") or "").split()
            }
            if old is not None
            else {}
        )
        if olds:  # field by field: a value this printing leaves out (or prints as no SR6 value) the next older one's;
            # then the entries only the older ones print
            res.files, _ = older_printings(res.files, [(label, files) for label, files, _ in olds])
            res.files, res.texts = older_extras(res.files, res.texts, olds, res.report)
            ids = set().union(
                *(xmlio.top_ids(x) for x in res.files.values())
            )  # (the extras' too: scoped to the source)
        if any(st == "done" for _, _, st in older):
            _drop(custom_dir, src)  # the older printing's catalog, texts and sample runners (this one's replace them)
        if not newer:
            texts_path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
            # the texts first: a corrupt texts file fails the import before any overlay is replaced
            texts = _texts(texts_path, res.texts, src, ids) if res.texts else None
            samples_path = os.path.join(custom_dir, "imported", "samples.xml")  # likewise a corrupt samples list
            samples = (
                xmlio.merged_samples(custom_dir, src, res.samples)
                if res.samples or os.path.exists(samples_path)
                else None
            )
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
        xmlio.write_import(
            book_dir,
            report=report + res.report + [r for x in res.extra for r in x.report],
            extra=" ".join(x.source["id"] for x in res.extra) or None,
            extras=[
                {
                    "id": x.source["id"],
                    "name": x.source["name"],
                    "publisher": x.source["publisher"],
                    "canon": str(x.source["canon"]).lower(),
                }
                for x in res.extra
            ],
            files={n: len(xmlio.top_ids(x)) for n, x in res.files.items()},
            recipe=recipe.__name__.rsplit(".", 1)[1],
            score=f"{score:.2f}",
            source=src,
            name=res.source["name"],
            publisher=res.source["publisher"],
            canon=str(res.source["canon"]).lower(),
            imported=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            **rec,
        )
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
        if refresh:  # (once, at the top: the books read again for their cited entries are in the pass too)
            _links(custom_dir)
        return res
    except Exception as e:
        xmlio.write_status(book_dir, "failed", f"{type(e).__name__}: {e}")
        raise


def _read(recipe, md, custom_dir, olds=()):
    """A book's book.md as its recipe reads it: (Result with every entry's effects, the md its recipe prepared, the
    regrouped text, regroup's report). olds: the older printings' catalogs, (label, files, texts) newest first; an item
    this printing files under another id than they do takes theirs (same_ids)."""
    if hasattr(recipe, "prepare_md"):  # a book's own page furniture the converter can't tell (a running head on top)
        md = recipe.prepare_md(md)
    text, report = regroup.regroup(
        md,
        recipe.ALIASES,
        name_headers=recipe.NAME_HEADERS,
        end_page=getattr(recipe, "END_PAGE", None),
        variants=getattr(recipe, "VARIANT_ROWS", False),
    )
    res = recipe.extract(text, {"custom_dir": custom_dir})  # (a book's sample runners cite the core rulebook's catalog)
    if olds:  # (before the effects and the overrides, which name entries by id)
        res.files, res.texts = same_ids(res.files, res.texts, olds)
    res.files, res.texts = read_effects(getattr(recipe, "ID", ""), res.files, res.texts, text)
    return res, md, text, report


def _shape(r):
    """An override row less its effects and drops (None when nothing else is left): what it gives an entry's
    structure."""
    r = {k: v for k, v in r.items() if k not in ("effects", "drops")}
    return r if "id" not in r or any(k in r for k in overrides.OPS) or r.get("set") or r.get("kids") else None


def read_effects(src, files, texts, regrouped, rows=None):
    """(files, texts): every entry's effects read (effects.apply) on the structure the book's override rows give it, a
    family row's `<variant name="Missile">`, a class row's class, a rename (the rules read them: a rocket's Missile
    variant, a musical instrument's dice pool), then the rows' own effects and drops on the reader's (Commlink6's, the
    book corrections', an errata's). Read before the rows, an entry an override reshaped lost the effects its new shape
    has (the live import of 2026-10-20). An entry an override added is read apart, after the others and keeping the
    effects its row gave it (effects.apply only=). rows: the book's override rows (default its tables)."""
    rows, files = overrides.table(src) if rows is None else rows, dict(files)

    def ids(fs):
        return {(n[:-4], i) for n, x in fs.items() if x for i in xmlio.top_ids(x)}

    have = ids(files)
    shape = [s for s in map(_shape, rows) if s]
    files = classes.apply(
        overrides.apply(src, files, rows=shape) if shape else files, src=src
    )  # (Commlink6's class on each entry of a category it classes alike: an override's own stays)
    texts = (
        overrides.texts(src, files, texts, rows=shape) if shape else texts
    )  # (an added entry that takes a heading's text)
    added = ids(files) - have
    aside = (
        {}
        # (the added entries, out of the first read: the book's own entries are read as the book prints them, beside
        # each other)
    )
    for n in {k + ".xml" for k, _ in added}:
        keep = []
        for ln in effects.split_entries(files[n]).splitlines(keepends=True):
            m = effects.ENTRY.match(ln)
            if m and (n[:-4], m.group(3)) in added:
                aside.setdefault(n, []).append(ln.strip().removesuffix("</sr6:data>"))
                ln = "</sr6:data>\n" if ln.rstrip().endswith("</sr6:data>") else ""
            keep.append(ln)
        files[n] = "".join(keep)
    files, texts = effects.apply(files, texts, regrouped)  # every entry's effects, from its text and the book's tables
    for n, els in aside.items():
        x, end = files[n], files[n].rindex("</sr6:data>")
        files[n] = x[:end].rstrip("\n") + "".join("\n  " + e for e in els) + "\n" + x[end:]
    if added:  # (an entry an override added is read too, with the text it took, keeping the effects its row gave it)
        files, texts = effects.apply(files, texts, regrouped, only=added)
    fx = [
        r
        for r in rows
        if "id" in r and (r.get("effects") or r.get("drops") or any(k.get("tag") == "link" for k in r.get("kids", ())))
    ]
    return (overrides.apply(src, files, rows=fx) if fx else files), texts


def _catalog(recipe, book_dir, custom_dir):
    """Another printing's catalog as an import of it reads it now (from its book.md): ({file: xml}, texts xml), ids
    unscoped; ({}, "") when it has no book.md or fails to read."""
    path = os.path.join(book_dir, "book.md")
    try:
        r = _read(recipe, Path(path).read_text(encoding="utf8"), custom_dir)[0] if os.path.exists(path) else None
        return (r.files, r.texts or "") if r else ({}, "")
    # pylint: disable-next=broad-exception-caught  # (an older printing that no longer reads gives nothing)
    except Exception:
        return {}, ""


FALLBACK = ("missing", "unreadable")  # (an issue's codes: no value printed, or one that is no SR6 value: vocab.py)


def older_printings(files, olds, prefix=""):
    """The owner's rule, field by field the latest printing wins: a field `files` leaves open (an issue FALLBACK) takes
    the value of the newest of `olds` ([(printing label, {file: xml})], newest first, ids unscoped) that prints it valid
    (a value with no issue of its own), with its formula, noted <found how="printing">that printing</found>. prefix: the
    source scope of the ids in `files` (a catalog on disk). (files, the fields filled)."""
    from lxml import etree

    from importer.sr6.resolve import add_kid, kids

    def parse(xml):
        return etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))

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
            for iss in [x for x in kids(el, "issue") if x.get("code") in FALLBACK]:
                f = iss.get("field")
                got = next(
                    (
                        (label, o)
                        for label, o in index.get((name, i[len(prefix) :] if i.startswith(prefix) else i), ())
                        if (o.get(f) or "").strip() not in ("", "—", "-")
                        and not any(x.get("field") == f for x in kids(o, "issue"))
                    ),
                    None,
                )
                if not got:
                    continue
                label, o = got
                el.set(f, o.get(f))
                el.remove(iss)
                for x in [x for x in kids(el, "formula") if x.get("field") == f]:
                    el.remove(x)
                for x in [x for x in kids(o, "formula") if x.get("field") == f]:
                    add_kid(el, "formula", dict(x.attrib), x.text)
                add_kid(
                    el,
                    "found",
                    {"field": f, "how": "printing", "source": el.get("source"), "page": o.get("page")},
                    label,
                )
                changed, n = True, n + 1
        out[name] = (xmlio.HEAD + etree.tostring(root, encoding="unicode").rstrip("\n") + "\n") if changed else xml
    return out, n


NOT_EXTRA = (
    "rules.xml",
    "categories.xml",
)  # (the loaded printing's own text and tables make these; an older printing's are not added to them)
IDENTITY = {
    "id",
    "source",
    "page",
    "category",
    "group",
    "class",
    "type",
    "skill",
    "spec",
}  # (where an entry sits and how it is filed; the rest are its printed values)


def _parse(xml):
    from lxml import etree

    return etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))


def _entries(xml):
    return [e for e in _parse(xml) if isinstance(e.tag, str) and e.get("id")] if xml else []


def _key(el):
    """What names one item in every printing: its name and its category (a name in two categories is two items)."""
    return regroup.norm(el.findtext("name") or ""), el.get("category") or ""


def _dump(root):
    from lxml import etree

    return xmlio.HEAD + etree.tostring(root, encoding="unicode").rstrip("\n") + "\n"


def same_ids(files, texts, olds):
    """An item this printing files under another id than an older printing does takes the older one's, so a saved
    runner, an override row and the app's catalog keep naming it (the id of a name another category of the file has
    already carries its category: the Current Printing, without the Formula row `Ritual Spellcasting`, files the focus
    of that name as `ritual-spellcasting`, the later printings as `foci.ritual-spellcasting`). The item is found by name
    and category in the same file, when both are unique there. Returns (files, texts); the entry's text goes with its
    id."""
    older = {}  # (file, key) -> the ids older printings give it, newest first
    for _, of, _ in olds:
        for name, xml in of.items():
            for e in _entries(xml):
                if e.get("category"):
                    older.setdefault((name, _key(e)), []).append(e.get("id"))
    out = dict(files)
    for name, xml in files.items():
        root = _parse(xml)
        els = [e for e in root if isinstance(e.tag, str) and e.get("id")]
        used = {e.get("id") for e in els}
        count = {k: sum(_key(e) == k for e in els) for k in {_key(e) for e in els}}
        changed = False
        for e in els:
            ids = older.get((name, _key(e)), ())
            if not e.get("category") or count[_key(e)] > 1 or not ids or e.get("id") in ids or ids[0] in used:
                continue
            old, new = e.get("id"), ids[0]
            e.set("id", new)
            used.add(new)
            texts = re.sub(rf'(<text of="{re.escape(name[:-4])}" id=)"{re.escape(old)}"', rf'\1"{new}"', texts or "")
            changed = True
        if changed:
            out[name] = _dump(root)
    return out, texts


def older_extras(files, texts, olds, report=None, prefix=""):
    """The owner's rule, older printings fill what the latest one lacks: an entry an older printing prints that the
    loaded one does not (the City Editions' Shotgun ammunition, a row the Current Printing leaves out) is added with its
    text, the newest older printing's first, and listed in the import report (`printing-extra`). Not added: rules and
    categories (NOT_EXTRA); an entry of an id the loaded printing gives another item; the same item under another id
    (name and category); an item the loaded printing prints renamed (`Uzi V` for `Uzi IV`: an entry only it has, on the
    same page of the same file, with all the printed values the older one has). prefix: the source scope of the ids in
    `files` (a catalog on disk). (files, texts)."""
    out, added = dict(files), []
    for name in sorted({n for _, of, _ in olds for n in of if n not in NOT_EXTRA and files.get(n)}):
        root = _parse(files[name])
        mine = [e for e in root if isinstance(e.tag, str) and e.get("id")]
        theirs = [(label, e) for label, of, _ in olds for e in _entries(of.get(name))]

        def uid(e):
            return e.get("id")[len(prefix) :] if e.get("id").startswith(prefix) else e.get("id")

        printed = {e.get("id") for _, e in theirs} | {_key(e) for _, e in theirs if e.get("category")}
        lonely = [
            e for e in mine if uid(e) not in printed and not (e.get("category") and _key(e) in printed)
        ]  # (only this printing has them)
        ids, keys = {uid(e) for e in mine}, {_key(e) for e in mine if e.get("category")}

        def value(e):
            return {k: v for k, v in e.attrib.items() if k not in IDENTITY}

        for label, e in theirs:
            if (
                e.get("id") in ids
                or e.get("category")
                and _key(e) in keys
                or any(
                    e.get("page") == w.get("page") and value(e) and all(w.get(k) == v for k, v in value(e).items())
                    for w in lonely
                )
            ):
                continue
            e.tail = "\n"
            root.append(e)
            ids.add(e.get("id"))
            keys.add(_key(e))
            added.append((name, e, label))
            out[name] = _dump(root)
    if added:
        said = {label: {(of, i): t for of, i, t in xmlio.texts_entries(tx)} for label, _, tx in olds if tx}
        more = "".join(
            f"  <text of={quoteattr(n[:-4])} id={quoteattr(e.get('id'))}>{escape(said[label][n[:-4], e.get('id')])}</te"
            "xt>\n"
            for n, e, label in added
            if (n[:-4], e.get("id")) in said.get(label, ())
        )
        if more and texts:
            i = texts.rindex("</sr6:data>")
            texts = texts[:i] + more + texts[i:]
        for n, e, label in added:
            if report is not None:
                report.append(
                    {
                        "kind": "printing-extra",
                        "file": n,
                        "id": e.get("id"),
                        "name": e.findtext("name") or "",
                        "page": e.get("page"),
                        "printing": label,
                    }
                )
    return out, texts


def _fills(out_dir, src, files):
    """Whether this printing's catalog (`files`, ids unscoped) prints a valid value of a field the loaded printing's
    catalog (out_dir, on disk) leaves open or took from a printing (which may be older than this one), or an entry it
    lacks.
    """

    def reopen(x):
        return re.sub(
            r'<found field="([^"]+)" how="printing"[^>]*>[^<]*</found>', r'<issue field="\1" code="missing"/>', x
        )

    disk = {
        n: reopen(Path(out_dir, n).read_text(encoding="utf8"))
        for n in files
        if os.path.isfile(os.path.join(out_dir, n))
    }
    pre = src.lower() + "."
    return (
        older_printings(disk, [("", files)], prefix=pre)[1] > 0
        or older_extras(disk, "", [("", files, "")], prefix=pre)[0] != disk
    )


def _corpus(book_dir, custom_dir):
    """The third circle (resolve.py): every book's open issues looked for in the rest of the library, each errata
    applied to its own book. A failure there leaves this import as it is (its issues stay open)."""
    try:
        resolve.library(os.path.dirname(os.path.normpath(book_dir)), custom_dir)
    except Exception as e:  # pylint: disable=broad-exception-caught
        print(f"corpus pass: {type(e).__name__}: {e}", file=sys.stderr)


def _links(custom_dir):
    """The last pass (effects.copy_links): every entry holding a link takes the linked entry's effects, whichever book
    the linked entry is in, so it runs over all the sources on disk after any book is imported or removed. A failure
    leaves the entries as they are (each with its link, which the app still follows)."""
    root = os.path.join(custom_dir, "imported")
    try:
        srcs = (
            {
                s: {
                    f: Path(root, s, f).read_text(encoding="utf8")
                    for f in os.listdir(os.path.join(root, s))
                    if f.endswith(".xml")
                }
                for s in os.listdir(root)
                if os.path.isdir(os.path.join(root, s))
            }
            if os.path.isdir(root)
            else {}
        )
        said = {
            s: {
                (of, i): t
                for of, i, t in xmlio.texts_entries(Path(custom_dir, "texts", f"{s}.xml").read_text(encoding="utf8"))
            }
            for s in srcs
            if os.path.isfile(os.path.join(custom_dir, "texts", f"{s}.xml"))
        }
        for (s, f), xml in effects.copy_links(srcs, said).items():
            xmlio.write_file(os.path.join(root, s, f), xml)
    except Exception as e:  # pylint: disable=broad-exception-caught
        print(f"links pass: {type(e).__name__}: {e}", file=sys.stderr)


def _pdf_title(pdf):
    """The PDF's metadata title ('' when absent or unreadable): a book identified by its title (a general recipe) is
    identified again when re-run from its book.md."""
    if not os.path.exists(pdf):
        return ""
    import pdfplumber

    try:
        with pdfplumber.open(pdf) as d:
            return (d.metadata or {}).get("Title", "") or ""
    except Exception:  # pylint: disable=broad-exception-caught  # (an unreadable PDF has no title)
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
    # (the library folder's path, not the imported module)
    # pylint: disable-next=redefined-outer-name
    library, me, out = os.path.dirname(os.path.normpath(book_dir)), os.path.normpath(book_dir), []
    for b in sorted(os.listdir(library)):
        d = os.path.join(library, b)
        imp = xmlio.read_import(d) if os.path.normpath(d) != me and os.path.isdir(d) else None
        src = imp is not None and xmlio.read_state(d) == "done" and (imp.get("source") or "").lower()
        sd = os.path.join(custom_dir, "imported", src, "samples") if src else ""
        if not sd or not os.path.isdir(sd):
            continue
        missing = [
            regroup.norm(re.split(r"\s*[(\[]|\s+w/", re.sub(r"^\d+\s*x\s+", "", item.strip()))[0])
            for f in os.listdir(sd)
            for m in re.findall(r"not in the catalog: (.*?)\.(?=\s|<|$)", Path(sd, f).read_text(encoding="utf8"))
            for item in m.split("; ")
        ]
        if any(n == m or f" {n} " in f" {m} " for m in missing if m for n in names):
            out.append(d)
    return out


def _same_source(book_dir, src):
    """The library's other books imported as `src`: [(printing or None, dir, state)]."""
    # (the library folder's path, not the imported module)
    # pylint: disable-next=redefined-outer-name
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
    npcs list). The book's further sources (import.xml extra) go with it. The loaded printing of a book removed, the
    newest superseded one is imported again (from its book.md) and loaded. A further source another book also holds (the
    same PDF uploaded twice) stays."""
    imp = xmlio.read_import(book_dir)
    src, loaded = (imp.get("source") if imp is not None else None), xmlio.read_state(book_dir) == "done"
    shelf, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    held = {
        x
        for b in os.listdir(shelf)
        if b != me and os.path.isdir(os.path.join(shelf, b))
        for i in [xmlio.read_import(os.path.join(shelf, b))]
        if i is not None
        for x in (i.get("extra") or "").split()
    }
    for x in (imp.get("extra") or "").split() if imp is not None else ():
        if x not in held:
            _drop(custom_dir, x)
    library.remove(book_dir, custom_dir, forget=forget, root=ROOT)
    others = _same_source(book_dir, src) if src and loaded else []
    nxt = max(((p, d) for p, d, st in others if p and st == "superseded"), default=None)
    if nxt and not any(st == "done" for _, _, st in others):
        try:
            run(nxt[1], custom_dir, convert_pdf=False)
        except Exception:  # pylint: disable=broad-exception-caught  # (its own status says why; this book is removed)
            pass
    _links(custom_dir)  # (the entries that took the removed book's effects, and the books that cite it)
