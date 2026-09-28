"""CLI for the importer package.
  python -m importer convert <pdf> <md> [--pages A-B]
  python -m importer run <library/book-id> --custom <custom dir> [--md] [--file NAME]
  python -m importer propose <library/book-id> --library <library dir> [--dry-run]
"""
import hashlib
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import quoteattr

from importer import xmlio
from importer.convert import CONVERTER_VERSION, convert
from importer.recipes import identify

USAGE = __doc__.strip()


def run(book_dir, custom_dir, convert_pdf=True, file_name=None):
    """Convert library/<id>/original.pdf to book.md (unless convert_pdf is False), identify the recipe,
    extract, and write custom/imported/<source>/, custom/texts/<source>.xml and the records."""
    pdf, md_path = os.path.join(book_dir, "original.pdf"), os.path.join(book_dir, "book.md")
    old = xmlio.read_import(book_dir)
    file_name = file_name or (old.get("file") if old is not None else None) or "original.pdf"
    try:
        xmlio.write_status(book_dir, "converting")
        if convert_pdf:
            meta = convert(pdf, md_path)
        else:
            sha = hashlib.sha256(Path(pdf).read_bytes()).hexdigest() if os.path.exists(pdf) else ""
            meta = {"converter": CONVERTER_VERSION, "sha256": sha, "title": ""}
        md = Path(md_path).read_text(encoding="utf8")
        meta["pages"] = len(re.findall(r"<!-- page \d+ -->", md))
        rec = {"file": file_name, "sha256": meta["sha256"], "converter": meta["converter"], "pages": meta["pages"]}

        xmlio.write_status(book_dir, "identifying")
        recipe, score = identify(meta, md[:4000])
        if recipe is None:
            xmlio.write_import(book_dir, score=f"{score:.2f}", **rec)
            xmlio.write_status(book_dir, "needs-ai", "no recipe matched this book")
            return None

        xmlio.write_status(book_dir, "extracting")
        out_dir = os.path.join(custom_dir, "imported", recipe.ID.lower())
        res = recipe.extract(md, {"previous_dir": out_dir})  # the previous import, still in place
        src = res.source["id"]
        ids = set().union(*(xmlio.top_ids(x) for x in res.files.values()))
        texts_path = os.path.join(custom_dir, "texts", f"{src.lower()}.xml")
        # merge texts and the samples list first: a corrupt texts or samples file fails the import before any overlay is replaced
        texts = xmlio.merged_texts(texts_path, xmlio.texts_entries(xmlio.scope(res.texts, src, ids))) if res.texts else None
        samples_path = os.path.join(custom_dir, "imported", "samples.xml")
        samples = xmlio.merged_samples(custom_dir, src, res.samples) if res.samples or os.path.exists(samples_path) else None
        for name, xml in res.files.items():
            xmlio.write_overlay(out_dir, name, xml, ids)
        if texts:
            xmlio.write_file(texts_path, texts)
        for s in res.samples:
            xmlio.write_file(os.path.join(out_dir, "samples", s["file"]), s["xml"])
        if samples:
            xmlio.write_file(samples_path, samples)
        xmlio.write_import(book_dir, report=res.report, files={n: len(xmlio.top_ids(x)) for n, x in res.files.items()},
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


def _cmd_convert(argv):
    pages = None
    if len(argv) == 4 and argv[2] == "--pages":
        a, _, b = argv[3].partition("-")
        pages = (int(a), int(b or a))
        argv = argv[:2]
    if len(argv) != 2:
        print(USAGE, file=sys.stderr)
        return 2
    pdf_path, md_path = argv
    meta = convert(pdf_path, md_path, pages)
    attrs = " ".join(f"{k}={quoteattr(str(v))}" for k, v in meta.items())
    print(f"<result {attrs} />")
    return 0


def _cmd_run(argv):
    if len(argv) < 3 or argv[1] != "--custom":
        print(USAGE, file=sys.stderr)
        return 2
    file_name = argv[argv.index("--file") + 1] if "--file" in argv else None
    res = run(argv[0], argv[2], convert_pdf="--md" not in argv, file_name=file_name)
    state = xmlio.ET.parse(os.path.join(argv[0], "status.xml")).getroot().get("state")
    extra = f" source={quoteattr(res.source['id'])} files={quoteattr(' '.join(res.files))}" if res else ""
    print(f"<result state={quoteattr(state)}{extra} />")
    return 0


def _cmd_propose(argv):
    """AI proposals for a needs-ai book into its review.xml, through the provider library/.config chooses."""
    from importer.ai import propose, providers, schema  # the anthropic SDK only loads for AI work
    dry = "--dry-run" in argv
    argv = [a for a in argv if a != "--dry-run"]
    if len(argv) != 3 or argv[1] != "--library":
        print(USAGE, file=sys.stderr)
        return 2
    config = os.path.join(argv[2], ".config")
    use = providers.read_providers(config)[0] if os.path.exists(os.path.join(config, "ai-providers.xml")) else None
    if dry:  # how many requests, and to whom, before the user confirms sending the book
        n = propose.count_chunks(os.path.join(argv[0], "book.md"))
        print(f"<result parts={quoteattr(str(n))} provider={quoteattr(use or '')} />")
        return 0
    n = propose.propose(argv[0], lambda s, u: providers.call(config, s, u, schema.SCHEMA), provider=use)
    print(f'<result state="review" proposals="{n}" />')
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cmds = {"convert": _cmd_convert, "run": _cmd_run, "propose": _cmd_propose}
    if not argv or argv[0] not in cmds:
        print(USAGE, file=sys.stderr)
        return 2
    return cmds[argv[0]](argv[1:])


if __name__ == "__main__":
    sys.exit(main())
