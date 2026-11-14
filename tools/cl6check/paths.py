"""The quality-paths gate (importer/sr6/cl6_paths.py).

  python -m tools.cl6check paths [--custom <custom/sr6 dir>] [--jar <jar>]

(a) re-reads Commlink6's quality_paths.xml and asserts the published paths.json (importer/sr6/library/<book>/, and
<custom>/paths/<book>.json when --custom has one) has the same path, step and nextSteps counts per book; exit 1 on a
difference. (b) with --custom: lists every `quality:<id>` a path names that no catalog quality answers to, matched as
src/sr6/runner-builder/domain/paths.ts qualityIdOf does (name part, case and punctuation ignored). `quality:CHOICE` is a
placeholder (the step's choice picks the quality) and is reported apart. No jar: (a) skipped, exit 0."""

import argparse
import json
import re
import sys
from pathlib import Path

from importer.sr6 import cl6_paths
from tools.cl6check import ours, reader

LIBRARY = Path(cl6_paths.__file__).parent / "library"


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def counts(paths):
    """(paths, steps, nextSteps) of one book's path list."""
    steps = [s for p in paths for s in p["steps"]]
    return len(paths), len(steps), sum(len(s["nextSteps"]) for s in steps)


def refs(paths):
    """{quality ref: [book-less path ids naming it]} of every add/remove quality mod."""
    out = {}
    for p in paths:
        for s in p["steps"]:
            for m in s["modifications"]:
                if m["op"] in ("add", "remove") and m["ref"].startswith("quality:"):
                    out.setdefault(m["ref"][8:], set()).add(p["id"])
    return out


def catalog_names(custom):
    """The normalised name parts of every quality in a custom/sr6 import (the id after `<book>.`)."""
    names = set()
    for src in ours.load(custom).values():
        for e in src.entries:
            if e["kind"] == "qualities":
                names.add(_norm(re.sub(r"^[^.]*\.", "", e["id"]) if e["id"].startswith(f"{src.src}.") else e["id"]))
                names.add(_norm(e["name"]))
    return names


def misses(published, names):
    """(unresolved {ref: path ids}, whether CHOICE appears) over every book's refs."""
    out, choice = {}, False
    for paths in published.values():
        for ref, ids in refs(paths).items():
            if ref == "CHOICE":
                choice = True
            elif _norm(ref) not in names:
                out.setdefault(ref, set()).update(ids)
    return out, choice


def main(argv):
    """Run the checks; exit 1 when the published files differ from the jar."""
    p = argparse.ArgumentParser(prog="cl6check paths")
    p.add_argument("--custom")
    p.add_argument("--jar")
    a = p.parse_args(argv)
    bad = 0
    jar = reader.find_jar(a.jar)
    if jar is None:
        print("cl6check paths: no Commlink6 jar: published-vs-jar skipped.")
    for book in cl6_paths.BOOKS:
        file = LIBRARY / book / "paths.json"
        pub = json.loads(file.read_text(encoding="utf-8")) if file.is_file() else None
        copies = [("library", pub)]
        if a.custom and (Path(a.custom) / "paths" / f"{book}.json").is_file():
            copies.append(("custom", json.loads((Path(a.custom) / "paths" / f"{book}.json").read_text("utf-8"))))
        want = counts(cl6_paths.read_book_paths(book, jar)) if jar else None
        for where, got in copies:
            have = counts(got) if got is not None else None
            if want is not None and have != want:
                bad += 1
            print(f"{book:18}{where:8}paths/steps/next {have} jar {want}" + ("  DIFF" if want and have != want else ""))
    if a.custom:
        published = {b: json.loads((LIBRARY / b / "paths.json").read_text("utf-8")) for b in cl6_paths.BOOKS}
        lost, choice = misses(published, catalog_names(a.custom))
        print(
            f"quality refs with no catalog quality: {len(lost)}"
            + ("; quality:CHOICE is a placeholder" if choice else "")
        )
        for ref in sorted(lost):
            print(f"  quality:{ref}  ({', '.join(sorted(lost[ref]))})")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
