"""CLI for the importer package. `python -m importer convert <pdf> <md> [--pages A-B]`."""
import sys

from importer.convert import convert


USAGE = "usage: python -m importer convert <pdf> <md> [--pages A-B]"


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
    attrs = " ".join(f'{k}="{v}"' for k, v in meta.items())
    print(f"<result {attrs} />")
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] != "convert":
        print(USAGE, file=sys.stderr)
        return 2
    return _cmd_convert(argv[1:])


if __name__ == "__main__":
    sys.exit(main())
