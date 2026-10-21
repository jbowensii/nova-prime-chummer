"""Text helpers the Anarchy recipes share (the CRB recipe and its core-table reader)."""

import functools
import re


@functools.cache
def _tab_regexes(tab):
    # a glued lead letter; "A" only before a mark and "I" only before a mark or a capital, since they start sentences
    return (
        re.compile(rf"^[{tab}]$"),
        re.compile(rf" [{tab}]$"),
        re.compile(rf"^(?:[{tab.replace('A', '').replace('I', '')}] |A (?=[*(+•])|I (?=[*(+•A-Z]))"),
    )


def strip_tab(lines, tab):
    """Drop the margin tab letters (tab: the letters as printed): lone lines, and a letter glued to a line's start or end."""
    lone, trail, lead = _tab_regexes(tab)
    out = []
    for l in lines:
        l = l.strip()
        if lone.match(l):
            continue
        l = trail.sub("", lead.sub("", l))
        if l:
            out.append(l)
    return out


def join_lines(lines):
    """One string: a word hyphenated at a line's end is joined ("con-" "tains"; "Logic-" "based" keeps its
    hyphen) and the "." the boxes print as U+FFFD is restored."""
    out = ""
    for l in lines:
        if out.endswith("-") and out[-2:-1].islower() and l[:1].islower():
            out = out[:-1] + ("-" if re.match(r"based|sim\b", l) else "") + l
        else:
            out += " " + l
    return out.replace("�", ".").strip()
