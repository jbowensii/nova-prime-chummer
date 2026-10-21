"""CLI for the SR6 importer (python -m importer sr6 ...).
python -m importer sr6 run <library/sr6/book-id> --custom <custom/sr6> [--md | --reuse] [--file NAME]
python -m importer sr6 remove <library/sr6/book-id> --custom <custom/sr6> [--files]
python -m importer sr6 edit set <kind> <id> [--by <username>] --custom <custom/sr6>  (the entry on stdin; exit 3:
refused) python -m importer sr6 edit remove <kind> <id> --custom <custom/sr6> python -m importer sr6 ask --custom
<custom/sr6> --library <library/sr6> [--scope rules]  (as `importer ask`, from SR6's
    data only, with SR6's AI settings in <library/sr6>/.config)
python -m importer sr6 regroup <book.md> <regrouped.md>        (with the CRB recipe's aliases and name headers)
python -m importer sr6 summary <library/sr6/book-id>           (counts per file, report rows by kind with names)
python -m importer sr6 check <pdf> --out <scratch dir>         (the owner's local real-book check: a fresh
    <scratch>/library/sr6/book1 + <scratch>/custom/sr6, the full run, XSD validation of every file, then the summary)
"""

import os
import shutil
import sys
import time
from collections import Counter, defaultdict
from xml.sax.saxutils import quoteattr

from importer import xmlio

USAGE = __doc__.strip()


def summary(book_dir, out=None):
    """Print the state and import report of the book folder to `out`."""
    out = out or sys.stdout
    status = xmlio.ET.parse(os.path.join(book_dir, "status.xml")).getroot()
    imp = xmlio.read_import(book_dir)
    print(f"state: {status.get('state')} {status.text or ''}".rstrip(), file=out)
    if imp is None:
        return
    print(
        " ".join(f"{k}: {imp.get(k)}" for k in ("recipe", "source", "pages", "converter", "score") if imp.get(k)),
        file=out,
    )
    files = [(f.get("name"), int(f.get("entries"))) for f in imp.iter("file")]
    print(f"files ({len(files)}, {sum(n for _, n in files)} entries):", file=out)
    for name, n in files:
        print(f"  {name:<22} {n}", file=out)
    rows = defaultdict(list)
    for r in imp.iter("row"):
        rows[r.get("kind") or "?"].append(r.attrib)
    print(f"report ({sum(len(v) for v in rows.values())} rows):", file=out)
    for kind, rs in sorted(rows.items()):
        print(f"  {kind}: {len(rs)}", file=out)
        for r in rs:
            print("    " + "; ".join(f"{k}={v}" for k, v in r.items() if k != "kind"), file=out)


def validate(custom_dir):
    """(file, error) for every SR6 file under custom_dir that its XSD refuses (lxml): a data file its kind's, a sample
    runner (sr6:character) character.xsd, the samples list Anarchy's samples.xsd."""
    from lxml import etree

    from importer import DATA_DIR
    from importer.sr6 import SCHEMA_DIR

    bad, schemas = [], {}
    for base, _, names in os.walk(custom_dir):
        for n in sorted(names):
            path = os.path.join(base, n)
            if not n.endswith(".xml") or n == "index.xml":
                continue
            doc = etree.parse(path)
            tag = etree.QName(doc.getroot()).localname
            kind = doc.getroot().get("kind") or tag
            if kind not in schemas:
                xsd = (
                    os.path.join(DATA_DIR, "schema", "samples.xsd")
                    if kind == "samples"
                    else os.path.join(SCHEMA_DIR, f"{kind}.xsd")
                )
                schemas[kind] = etree.XMLSchema(etree.parse(xsd))
            if not schemas[kind].validate(doc):
                bad.append((os.path.relpath(path, custom_dir), str(schemas[kind].error_log.last_error)))
    return bad


def _cmd_run(argv):
    from importer.sr6.run import run

    if len(argv) < 3 or argv[1] != "--custom":
        print(USAGE, file=sys.stderr)
        return 2
    file_name = argv[argv.index("--file") + 1] if "--file" in argv else None
    from importer.convert import SR6_CONVERTER_VERSION, reusable

    # --md: book.md as it is; --reuse: book.md when it was made from this PDF by this converter, else convert
    keep = "--md" in argv or ("--reuse" in argv and reusable(argv[0], SR6_CONVERTER_VERSION))
    res = run(argv[0], argv[2], convert_pdf=not keep, file_name=file_name)
    state = xmlio.ET.parse(os.path.join(argv[0], "status.xml")).getroot().get("state")
    extra = f" source={quoteattr(res.source['id'])} files={quoteattr(' '.join(res.files))}" if res else ""
    print(f"<result state={quoteattr(state)}{extra} />")
    return 0


def _cmd_remove(argv):
    from importer.sr6.run import remove

    if len(argv) < 3 or argv[1] != "--custom":
        print(USAGE, file=sys.stderr)
        return 2
    remove(argv[0], argv[2], forget="--files" in argv)
    return 0


def _cmd_edit(argv):
    """The SR6 edits layer (importer/sr6/edits.py). A refused edit exits 3 with the reason on stderr."""
    from importer.core import flag
    from importer.sr6 import edits

    sub, custom = (argv[0] if argv else None), flag(argv, "--custom")
    by = flag(argv, "--by") if sub == "set" else None
    if not custom or sub not in ("set", "remove") or len(argv) != (7 if by else 5):
        print(USAGE, file=sys.stderr)
        return 2
    try:
        if sub == "set":
            edits.set_entry(custom, argv[1], argv[2], sys.stdin.buffer.read(edits.MAX_BODY + 1), by=by)
            print('<result state="saved" />')
        else:
            print(f'<result removed="{str(edits.remove_entry(custom, argv[1], argv[2])).lower()}" />')
    except edits.EditError as e:
        print(e, file=sys.stderr)
        return 3
    return 0


def _cmd_regroup(argv):
    from pathlib import Path

    from importer.sr6 import regroup
    from importer.sr6.recipes import crb

    if len(argv) != 2:
        print(USAGE, file=sys.stderr)
        return 2
    text, report = regroup.regroup(
        Path(argv[0]).read_text(encoding="utf8"), crb.ALIASES, name_headers=crb.NAME_HEADERS, end_page=crb.END_PAGE
    )
    xmlio.write_file(argv[1], text)
    print(" ".join(f"{k}={n}" for k, n in sorted(Counter(r["kind"] for r in report).items())))
    return 0


def _cmd_summary(argv):
    if len(argv) != 1:
        print(USAGE, file=sys.stderr)
        return 2
    summary(argv[0])
    return 0


def _cmd_check(argv):
    from importer.sr6.run import run

    if len(argv) != 3 or argv[1] != "--out":
        print(USAGE, file=sys.stderr)
        return 2
    pdf, out = argv[0], os.path.abspath(argv[2])
    book, custom = os.path.join(out, "library", "sr6", "book1"), os.path.join(out, "custom", "sr6")
    for d in (book, custom):  # a fresh run each time, only inside the scratch dir
        shutil.rmtree(d, ignore_errors=True)
    os.makedirs(book)
    shutil.copyfile(pdf, os.path.join(book, "original.pdf"))
    t = time.monotonic()
    run(book, custom, file_name=os.path.basename(pdf))
    print(f"wall time: {time.monotonic() - t:.0f} s")
    summary(book)
    bad = validate(custom) if os.path.isdir(custom) else []
    print(f"xsd: {'all valid' if not bad else f'{len(bad)} invalid'}")
    for path, err in bad:
        print(f"  {path}: {err}")
    print(f"output: {book} (book.md, regrouped.md, import.xml), {custom}")
    return 1 if bad else 0


def _cmd_ask(argv):
    from importer.core import cmd_ask

    return cmd_ask(argv, USAGE, game="sr6")


def main(argv=None):
    """Run the sr6 command named first in `argv`; its exit code."""
    argv = sys.argv[1:] if argv is None else argv
    cmds = {
        "run": _cmd_run,
        "remove": _cmd_remove,
        "regroup": _cmd_regroup,
        "summary": _cmd_summary,
        "check": _cmd_check,
        "edit": _cmd_edit,
        "ask": _cmd_ask,
    }
    if not argv or argv[0] not in cmds:
        print(USAGE, file=sys.stderr)
        return 2
    return cmds[argv[0]](argv[1:])


if __name__ == "__main__":
    sys.exit(main())
