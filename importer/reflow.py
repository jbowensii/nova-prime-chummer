"""Book text as paragraphs (0.9.1). The converter keeps the PDF's line breaks, so a description arrives as a narrow column
with words split across lines ("gamemas-" / "ter"). reflow() joins the lines of each paragraph and rejoins a word
hyphenated across a line break, keeping real hyphens ("non-player"); blank-line paragraph breaks, list items, markdown
table rows, headings and "**Label:** value" lines stay on lines of their own. Used on the SR6 texts (importer/sr6/run.py);
Anarchy's texts are already one line each and are left alone."""

import re

_LIST = re.compile(r"(?:[-*•▪◦–]|\d{1,2}[.)])\s")
_FIELD = re.compile(r"\*\*[^*\n]+(?::\*\*|\*\*:)")
_WORD = re.compile(r"[A-Za-z]+(?:-[A-Za-z]+)*")
_BROKEN = re.compile(
    r"(?<![A-Za-z-])([A-Za-z]+)-$"
)  # a word and its hyphen at the end of the line (not "--", not " -")
# first halves that take a real hyphen: "non-player", "self-aware", "well-known", "two-handed"…
KEEP = frozenset(
    """non self ex all half cross well semi anti co quasi pre post multi counter ultra meta full high low long short
mid off one two three four five six seven eight nine ten first second third twenty thirty forty fifty hundred""".split()
)


def vocabulary(texts):
    """Every word (and hyphenated word) that a text prints inside a line: the evidence for rejoining a split word."""
    words = set()
    for t in texts:
        for line in t.splitlines():
            words.update(w.lower() for w in _WORD.findall(line.rstrip("-")))
    return frozenset(words)


def _alone(line):
    """A line that starts a line of its own (a list item, table row, heading or label line)."""
    return line.startswith(("|", "#")) or bool(_LIST.match(line) or _FIELD.match(line))


def _join(prev, nxt, words):
    m = _BROKEN.search(prev)
    if not m:
        return f"{prev} {nxt}"
    if not nxt[:1].islower():  # "Fichetti-" / "Security": a real hyphen before a name or a number
        return prev + nxt
    head, tail = m.group(1), re.match(r"[a-z]+", nxt).group(0)
    joined, hyphenated = (head + tail).lower(), f"{head}-{tail}".lower()
    if joined in words and hyphenated not in words:
        return prev[:-1] + nxt
    if hyphenated in words or head.lower() in KEEP:
        return prev + nxt
    return prev[:-1] + nxt  # the line's own break: one word


_END = re.compile(r"[.!?:][\"”’)]*$")
_SHORT = 0.8  # a line ending a sentence this much shorter than the column's longest line ends its paragraph


def reflow(text, words=frozenset()):
    """`text` with each paragraph's lines joined; `words`: vocabulary() of the book's texts. The converter writes no
    blank lines, so a paragraph also ends at a short line that ends a sentence (a justified column's last line)."""
    paras = []
    for para in re.split(r"\n[ \t]*\n", text.strip()):
        lines = [x.strip() for x in para.splitlines() if x.strip()]
        width = max(map(len, lines), default=0)
        out, prev = [], ""
        for line in lines:
            if prev and _END.search(prev) and len(prev) < _SHORT * width and not _alone(line) and not _alone(prev):
                paras.append("\n".join(out))
                out = [line]
            elif out and not _alone(line) and not out[-1].startswith(("|", "#")) and not _FIELD.match(out[-1]):
                out[-1] = _join(out[-1], line, words)
            else:
                out.append(line)
            prev = line
        if out:
            paras.append("\n".join(out))
    return "\n\n".join(paras)
