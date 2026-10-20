"""Flags the stat lines of an SR6 import's beings (npcs, critters, spirits, sprites) that took in text from outside
their stat block: the paragraph after the block, a sidebar, a page's back cover joined to the block's last labelled line
(`**Attacks:**` … then the book's back-cover blurb, Cutting Black p. 176).

    python -m tools.statbleed <custom/sr6 folder or an import run folder> [--show]

Prints one line per flagged stat line (source, entry, line, why) and the count. A stat line is a list: entries split
by commas or set one after another (`Staff [Clubs, DV 4S, 8/—/—/—/—]`); what reads as prose is flagged."""
import glob
import os
import re
import sys
import xml.etree.ElementTree as ET

KINDS = ("npcs", "critters", "spirits", "sprites")
SKIP = {"name", "alias", "note", "modifier", "effect"}
# a bold run-in (`**VOICES`, `***Note:**`; not a footnote mark: `DV 5P**,`, `** Onotari …`) or a page's furniture
_MARKUP = re.compile(r"(?<!\S)\*{2,}(?=[^\s*])|catalystgamelabs|ISBN|©|All rights reserved", re.I)
# prose: a sentence of eight plain words or more in a row (no comma, bracket, digit or slash among them); a stat
# list's entries are a word or three between commas and brackets
_PROSE = re.compile(r"(?:\b[A-Za-z][a-z’'-]*\b[ ]){7,}[A-Za-z][a-z’'-]*[.!?:;]?")
_SENTENCES = re.compile(r"[a-z)\]][.!?] +[A-Z][a-z]+ [a-z]+ [a-z]+")


def why(text):
    """The reason a stat line reads as bled text, or ''."""
    t = " ".join((text or "").split())
    if m := _MARKUP.search(t):
        return f"page furniture or a bold run-in ({m.group(0)!r})"
    if len(t) > 1000:
        return f"{len(t)} characters"
    if (m := _SENTENCES.search(t)) and _PROSE.search(t):
        return f"prose sentences ({t[max(0, m.start() - 20):m.end() + 20]!r})"
    return ""


def scan(folder):
    """[(source, entry name, line tag, reason, text)] for every flagged stat line under folder."""
    root = folder if os.path.basename(folder.rstrip("\\/")) == "sr6" else os.path.join(folder, "custom", "sr6")
    out = []
    for kind in KINDS:
        for f in sorted(glob.glob(os.path.join(root, "imported", "*", kind + ".xml"))):
            src = os.path.basename(os.path.dirname(f))
            for e in ET.parse(f).getroot():
                name = next((c.text for c in e if c.tag.rsplit("}", 1)[-1] == "name"), e.get("id"))
                for c in e:
                    tag = c.tag.rsplit("}", 1)[-1]
                    if tag not in SKIP and (r := why(c.text)):
                        out.append((src, name, tag, r, c.text))
    return out


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    rows = scan(argv[0])
    for src, name, tag, r, text in rows:
        print(f"{src}\t{name}\t{tag}\t{r}")
        if "--show" in argv:
            print("    " + " ".join(text.split()))
    print(f"flagged stat lines: {len(rows)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
