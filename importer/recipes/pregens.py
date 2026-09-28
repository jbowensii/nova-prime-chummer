"""Daegann's pregen booklet (SRA2 Pregens v1.0f) -> sample runners.

Each runner is a story page ("# NAME", "(ROLE)") followed by its stat page (the page with the SKILLS
anchor). The table of contents ("**Name (Role) ..... N**") gives the name as printed in mixed case.
importer.statblock does the reading and building; the samples are written as character XML to
custom/imported/pregens/samples/pregens.<name>.xml and every printed number goes to the report.
"""
import re
from datetime import datetime, timezone

from importer import statblock
from importer.recipes import Result

ID, NAME, PUBLISHER, CANON = "PREGENS", "SRA2 Pregens v1.0f", "Daegann (Holostreets)", False
TOC = re.compile(r"^\*\*(.+?) \((.+?)\)\s*\.{3,}\s*(\d+)\*\*$", re.M)


def match(meta, md_head):
    return 0.9 if re.search(r"daegann", md_head, re.I) and re.search(r"pregen", md_head, re.I) else 0.0


def extract(md, ctx=None):
    parts = re.split(r"<!-- page (\d+) -->", md)
    pages = {int(parts[i]): parts[i + 1] for i in range(1, len(parts), 2)}
    toc = {int(p) + 1: (n.strip(), r.strip()) for n, r, p in TOC.findall(md)}
    rules = statblock.load_rules()
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    samples, report = [], []
    for page, text in sorted(pages.items()):
        if not re.search(r"^SKILLS RATING", text, re.M):
            continue
        name, role = toc.get(page) or _story_title(pages.get(page - 1, ""))
        s, rows = statblock.sample(statblock.parse_statblock(text), rules, ID, name, role, page,
                                   f"{role}. {NAME} p.{page}.", updated, samples)
        samples.append(s)
        report += rows
    return Result(files={}, texts=None, samples=samples, report=report,
                  source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON})


def _story_title(text):
    """"# TEST FACE" / "(MADE-UP FACE)" on the story page, when the contents don't list the runner."""
    m = re.search(r"^# (.+)\n\((.+)\)", text, re.M)
    return (m.group(1).title(), m.group(2).capitalize()) if m else ("Runner", "")
