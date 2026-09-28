"""CLI for the importer package.
  python -m importer convert <pdf> <md> [--pages A-B]
  python -m importer run <library/book-id> --custom <custom dir> [--md] [--file NAME]
  python -m importer propose <library/book-id> --library <library dir> [--dry-run] [--fresh]
  python -m importer remove <library/book-id> --custom <custom dir> [--files]
  python -m importer apply-review <library/book-id> --custom <custom dir> --source ID --name NAME --canon true|false
  python -m importer set-key <library dir> <provider>      (the key on stdin; empty removes it)
  python -m importer set-settings --library <library dir>  (ai-providers.xml on stdin; exit 3: refused)
  python -m importer list-models <provider> --library <library dir>  (one model id per line; exit 3: the reason on stderr)
  python -m importer edit set <amps|items|rules> <id> --custom <custom dir>  (the entry on stdin; exit 3: refused)
  python -m importer edit remove <amps|items|rules> <id> --custom <custom dir>
  python -m importer edit add-source <ID> --custom <custom dir> --name NAME [--publisher P]  (exit 3: refused)
  python -m importer backup --characters D --custom D --library D --out F [--keys] [--version V]
  python -m importer restore --check F                     (the manifest on stdout; exit 3: refused, the reason on stderr)
  python -m importer restore --apply F --characters D --custom D --library D [--version V]  (exit 3: refused)
"""
import hashlib
import os
import re
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import quoteattr

from importer import DATA_DIR, xmlio
from importer.convert import CONVERTER_VERSION, convert
from importer.recipes import RECIPES, identify

USAGE = __doc__.strip()
# overlay file per review.xml proposal kind: (file name, data kind)
REVIEW_FILES = {"amp": ("amps.xml", "amps"), "gear": ("gear.xml", "gear"), "weapon": ("weapons.xml", "weapons"),
                "armor": ("armor.xml", "armor"), "spell": ("spells.xml", "spells"), "complex-form": ("complexforms.xml", "complexforms")}
SOURCE_ID = re.compile(r"[A-Z][A-Z0-9-]{0,19}")
PROVIDER_IDS = ("anthropic", "openai", "gemini", "anythingllm")


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


def _same_source(book_dir, source):
    """import.xml of the other books in the library that name `source`."""
    library, me = os.path.dirname(os.path.normpath(book_dir)), os.path.basename(os.path.normpath(book_dir))
    imps = (xmlio.read_import(os.path.join(library, b)) for b in os.listdir(library)
            if b != me and os.path.isdir(os.path.join(library, b)))
    return [i for i in imps if i is not None and (i.get("source") or "").lower() == source.lower()]


def remove(book_dir, custom_dir, forget=False, status=True):
    """Undo a book's import: its overlay files, and (unless another book imports the same source) the
    source's folder, texts and samples; then its import record (`forget`: the whole library/<id>) and,
    unless `status` is False (a caller mid-job), status "removed".
    Rebuilds custom/imported/index.xml and sources.xml. A re-import runs this first, so nothing an
    earlier import wrote outlives it."""
    library = os.path.dirname(os.path.normpath(book_dir))
    imp = xmlio.read_import(book_dir)
    src = imp.get("source") if imp is not None else None
    if src:
        out_dir = os.path.join(custom_dir, "imported", src.lower())
        others = _same_source(book_dir, src)
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
        elif gone and os.path.exists(texts):
            xmlio.write_file(texts, xmlio.merged_texts(texts, [], drop=gone))
    if forget:
        shutil.rmtree(book_dir, ignore_errors=True)
    else:
        if imp is not None:
            xmlio.write_import(book_dir, **{k: imp.get(k) for k in ("file", "sha256", "converter", "pages", "score")})
        if status:
            xmlio.write_status(book_dir, "removed")
    if os.path.isdir(os.path.join(custom_dir, "imported")):
        xmlio.update_index(custom_dir)
        xmlio.update_sources(custom_dir, library)


def _reserved_sources(custom_dir):
    """Source ids a recipe, the shipped data, the user's own custom/sources.xml or a house-rule source of the
    edits layer own; an AI import may not take them."""
    ids = {r.ID for r in RECIPES}
    for path in (os.path.join(DATA_DIR, "sources.xml"), os.path.join(custom_dir, "sources.xml"),
                 os.path.join(custom_dir, "edits", "sources.xml")):
        if os.path.exists(path):
            ids |= {s.get("id") for s in xmlio.ET.parse(path).getroot()}
    return {i.upper() for i in ids if i}


def _entry_notes(kind, entry, m):
    """propose's checks on one reviewed entry (the user may have edited it): what is wrong, or []."""
    from importer.ai import propose
    notes = [] if (entry.get("id") or "").strip() and (entry.findtext("name") or "").strip() else ["no id or name"]
    if kind == "amp":
        effects = [{"ref": e.get("ref"), "param": e.get("param")} for e in entry.findall("effect")]
        return notes + propose.amp_notes({"type": entry.get("type"), "effects": effects}, m)
    if entry.get("kind") != kind:
        notes.append(f'item kind "{entry.get("kind")}" isn’t the proposal’s "{kind}"')
    if kind in propose.CATEGORIES and entry.get("category") not in propose.CATEGORIES[kind]:
        notes.append(f'unknown {kind} category "{entry.get("category")}"')
    return notes


def apply_review(book_dir, custom_dir, source, name, canon):
    """Write the accepted and edited proposals of library/<id>/review.xml as custom/imported/<source>/,
    ids scoped like a recipe's, replacing this book's previous outputs; then its import record and sources."""
    try:
        if not SOURCE_ID.fullmatch(source or "") or not (name or "").strip() or canon not in ("true", "false"):
            raise ValueError("apply-review needs a source id (A-Z, 0-9, -), a name and canon true|false")
        if source in _reserved_sources(custom_dir) or _same_source(book_dir, source):
            raise ValueError(f"the source id {source} is already used by another book")
        xmlio.write_status(book_dir, "applying")
        from importer.ai import propose  # loads the AI SDK: only for AI work
        m = propose.mechanics()
        rows, report = {}, []
        for p in xmlio.ET.parse(os.path.join(book_dir, "review.xml")).getroot().findall("proposal"):
            kind = p.get("kind")
            entry = next((e for e in p if e.tag == ("amp" if kind == "amp" else "item")), None)
            if p.get("state") in ("accepted", "edited") and kind in REVIEW_FILES and entry is not None:
                notes = _entry_notes(kind, entry, m)
                if notes:  # an edit can break what propose checked: the entry stays out, the report says why
                    report.append({"proposal": p.get("id"), "page": p.get("page"), "problem": "; ".join(notes)})
                    continue
                entry.set("source", source)
                entry.tail = None
                rows.setdefault(REVIEW_FILES[kind], []).append("  " + xmlio.ET.tostring(entry, encoding="unicode"))
        files = {f: xmlio.HEAD + "<!-- AI proposals accepted on the review screen. Generated by the importer. -->\n"
                 f'<ca2:data xmlns:ca2="{xmlio.NS}" kind="{kind}" version="1">\n' + "\n".join(r) + "\n</ca2:data>\n"
                 for (f, kind), r in rows.items()}
        old = xmlio.read_import(book_dir)
        rec = {k: old.get(k) for k in ("file", "sha256", "converter", "pages", "score")} if old is not None else {}
        remove(book_dir, custom_dir, status=False)  # a second apply replaces the first; the book stays applying
        out_dir = os.path.join(custom_dir, "imported", source.lower())
        ids = set().union(*(xmlio.top_ids(x) for x in files.values()))
        for f, xml in files.items():
            xmlio.write_overlay(out_dir, f, xml, ids)
        xmlio.write_import(book_dir, report=report, files={f: len(xmlio.top_ids(x)) for f, x in files.items()}, recipe="ai", source=source,
                           name=name.strip(), publisher="", canon=canon,
                           imported=datetime.now(timezone.utc).isoformat(timespec="seconds"), **rec)
        os.makedirs(os.path.join(custom_dir, "imported"), exist_ok=True)
        xmlio.update_index(custom_dir)
        xmlio.update_sources(custom_dir, os.path.dirname(os.path.normpath(book_dir)))
        skipped = f", {len(report)} skipped (see the report)" if report else ""
        xmlio.write_status(book_dir, "done", f"{sum(map(len, rows.values()))} entries applied{skipped}")
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
    dry, fresh = "--dry-run" in argv, "--fresh" in argv
    argv = [a for a in argv if a not in ("--dry-run", "--fresh")]
    if len(argv) != 3 or argv[1] != "--library":
        print(USAGE, file=sys.stderr)
        return 2
    config = os.path.join(argv[2], ".config")
    use = providers.read_providers(config)[0] if os.path.exists(os.path.join(config, "ai-providers.xml")) else None
    if dry:  # how many requests, and to whom, before the user confirms sending the book
        n = propose.count_chunks(os.path.join(argv[0], "book.md"))
        print(f"<result parts={quoteattr(str(n))} provider={quoteattr(use or '')} />")
        return 0
    n = propose.propose(argv[0], lambda s, u: providers.call(config, s, u, schema.SCHEMA), provider=use, fresh=fresh)
    print(f'<result state="review" proposals="{n}" />')
    return 0


def _flag(argv, name):
    """`name value` or `name=value` (the server passes free text as one `--name=…` argument)."""
    for a in argv:
        if a.startswith(name + "="):
            return a[len(name) + 1:]
    return argv[argv.index(name) + 1] if name in argv[:-1] else None


def _cmd_remove(argv):
    if len(argv) < 3 or argv[1] != "--custom":
        print(USAGE, file=sys.stderr)
        return 2
    remove(argv[0], argv[2], forget="--files" in argv)
    return 0


def _cmd_apply_review(argv):
    if len(argv) < 3 or argv[1] != "--custom":
        print(USAGE, file=sys.stderr)
        return 2
    apply_review(argv[0], argv[2], _flag(argv, "--source"), _flag(argv, "--name"), _flag(argv, "--canon"))
    print('<result state="done" />')
    return 0


def _cmd_set_key(argv):
    """The key comes on stdin, never as an argument (process arguments are visible to other users)."""
    if len(argv) != 2 or argv[1] not in PROVIDER_IDS:
        print(USAGE, file=sys.stderr)
        return 2
    from importer.ai import providers
    providers.set_key(os.path.join(argv[0], ".config"), argv[1], sys.stdin.read())
    return 0


def _cmd_set_settings(argv):
    """Check and save ai-providers.xml from stdin, clearing the key of any provider whose address changed.
    Prints <result cleared="…"/>; a refused body exits 3 with the reason on stderr."""
    if len(argv) != 2 or argv[0] != "--library":
        print(USAGE, file=sys.stderr)
        return 2
    from importer.ai import providers
    try:
        cleared = providers.set_settings(os.path.join(argv[1], ".config"), sys.stdin.buffer.read().decode("utf8", "replace"))
    except providers.SettingsError as e:
        print(e, file=sys.stderr)
        return 3
    print(f"<result cleared={quoteattr(' '.join(cleared))} />")
    return 0


def _cmd_list_models(argv):
    """The provider's models, asked with the saved key and address. Read-only; exit 3 with the reason on stderr."""
    if len(argv) != 3 or argv[0] not in PROVIDER_IDS or argv[1] != "--library":
        print(USAGE, file=sys.stderr)
        return 2
    from importer.ai import providers
    try:
        ids = providers.list_models(argv[0], argv[2])
    except providers.ProviderError as e:
        print(e, file=sys.stderr)
        return 3
    print("\n".join(ids))
    return 0


def _cmd_edit(argv):
    """The edits layer (importer/edits.py). A refused edit exits 3 with the reason on stderr."""
    from importer import edits
    sub, custom = (argv[0] if argv else None), _flag(argv, "--custom")
    if not custom or (sub in ("set", "remove") and len(argv) != 5) or sub not in ("set", "remove", "add-source") or len(argv) < 2:
        print(USAGE, file=sys.stderr)
        return 2
    try:
        if sub == "set":
            edits.set_entry(custom, argv[1], argv[2], sys.stdin.buffer.read(edits.MAX_BODY + 1))
            print('<result state="saved" />')
        elif sub == "remove":
            print(f'<result removed="{str(edits.remove_entry(custom, argv[1], argv[2])).lower()}" />')
        else:
            edits.add_source(custom, argv[1], _flag(argv, "--name"), _flag(argv, "--publisher") or "")
            print('<result state="saved" />')
    except edits.EditError as e:
        print(e, file=sys.stderr)
        return 3
    return 0


def _dirs(argv):
    dirs = {f: _flag(argv, "--" + f) for f in ("characters", "custom", "library")}
    return dirs if all(dirs.values()) else None


def _cmd_backup(argv):
    from importer import backup
    dirs, out = _dirs(argv), _flag(argv, "--out")
    if not dirs or not out:
        print(USAGE, file=sys.stderr)
        return 2
    backup.backup(dirs, out, keys="--keys" in argv, version=_flag(argv, "--version"))
    return 0


def _cmd_restore(argv):
    from importer import backup
    zip_path, dirs = _flag(argv, "--check") or _flag(argv, "--apply"), _dirs(argv)
    if not zip_path or ("--apply" in argv and not dirs):
        print(USAGE, file=sys.stderr)
        return 2
    try:
        if "--check" in argv:
            print(xmlio.ET.tostring(backup.check(zip_path), encoding="unicode"))
        else:
            safety = backup.apply(zip_path, dirs, version=_flag(argv, "--version"))
            print(f'<result state="restored" safety={quoteattr(os.path.basename(safety))} />')
    except backup.RestoreError as e:
        print(e, file=sys.stderr)
        return 3
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    cmds = {"convert": _cmd_convert, "run": _cmd_run, "propose": _cmd_propose, "remove": _cmd_remove,
            "apply-review": _cmd_apply_review, "set-key": _cmd_set_key,
            "set-settings": _cmd_set_settings, "list-models": _cmd_list_models, "edit": _cmd_edit,
            "backup": _cmd_backup, "restore": _cmd_restore}
    if not argv or argv[0] not in cmds:
        print(USAGE, file=sys.stderr)
        return 2
    return cmds[argv[0]](argv[1:])


if __name__ == "__main__":
    sys.exit(main())
