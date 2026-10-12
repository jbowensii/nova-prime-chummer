"""Markdown out: a line's words with its bold runs as **…**, a table's rows as a Markdown table."""
import re

BOLD_FONT = re.compile(r"bold|black|heavy", re.I)


def is_bold(word):
    """Most of the word's letters/digits are set in a bold face (the bullet glyph and punctuation don't count)."""
    chars = [c for c in word["chars"] if c["text"].isalnum()]
    return bool(chars) and sum(bool(BOLD_FONT.search(c["fontname"])) for c in chars) * 2 > len(chars)


def _split_bold(w):
    """(the SR6 layout) A word whose bold letters end at a dash, the rest regular (`theurgy—especially`: a bold term
    run into its sentence): its bold part, then the rest glued to it (no space), else [w]."""
    cs = w.get("chars") or []
    k = next((i for i, c in enumerate(cs) if c["text"] in "—–"), 0)
    a, b = cs[:k], cs[k:]
    letters = lambda part: [c for c in part if c["text"].isalnum()]
    if not k or not letters(a) or not letters(b) or not all(BOLD_FONT.search(c["fontname"]) for c in letters(a)) \
            or any(BOLD_FONT.search(c["fontname"]) for c in letters(b)):
        return [w]
    return [{**w, "text": "".join(c["text"] for c in a), "chars": a},
            {**w, "text": "".join(c["text"] for c in b), "chars": b, "glue": True}]


def line_text(line, split=False):
    """Words joined by spaces, adjacent bold words merged into one **run**. A punctuation-only word
    ("–") between two bold words stays inside the run. split (the SR6 layout): a word bold up to a dash is two
    (_split_bold)."""
    if split:
        line = [p for w in line for p in _split_bold(w)]
    bold = [is_bold(w) for w in line]
    bold = [b or (0 < i < len(line) - 1 and bold[i - 1] and bold[i + 1] and not any(c.isalnum() for c in line[i]["text"]))
            for i, b in enumerate(bold)]
    out, run = [], []
    for w, b in zip(line + [None], bold + [False]):
        if b:
            run.append(w["text"])
            continue
        if run:
            out.append("**" + " ".join(run) + "**")
            run = []
        if w is not None:
            if w.get("glue") and out:
                out[-1] += w["text"]
            else:
                out.append(w["text"])
    return " ".join(out)


def table_md(rows):
    # (an SR6 band's first-cell marks, leading no-break and en spaces, stay: layout._first_marks)
    keep = lambda c: (re.match(r"[  ]*", c).group() if c.strip() else "") + c.strip()  # noqa: E731
    rows = [[keep((c or "").replace("\n", "<br>")) for c in r] for r in rows if any(r)]
    if not rows:
        return []
    head, *body = rows
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + [
        "| " + " | ".join(r) + " |" for r in body
    ]
