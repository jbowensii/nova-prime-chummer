"""CLI for the importer package. `python -m importer convert <pdf> <md>`."""
import sys

from importer.convert import convert


def _cmd_convert(argv):
    if len(argv) != 2:
        print("usage: python -m importer convert <pdf> <md>", file=sys.stderr)
        return 2
    pdf_path, md_path = argv
    meta = convert(pdf_path, md_path)
    attrs = " ".join(f'{k}="{v}"' for k, v in meta.items())
    print(f"<result {attrs} />")
    return 0


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not argv or argv[0] != "convert":
        print("usage: python -m importer convert <pdf> <md>", file=sys.stderr)
        return 2
    return _cmd_convert(argv[1:])


if __name__ == "__main__":
    sys.exit(main())
