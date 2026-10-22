"""A being's `Powers` line read as powers and the sentence a book runs on after them (power_list): the line's shape, no
book's names. Used by the regrouper (a line cut inside a power list goes on) and the catalog (the list it keeps)."""

import re

_CONNECTORS = {"of", "and", "or", "the", "to", "in", "on", "for", "with", "vs", "a"}
_RIDER_LEAD = re.compile(r"(?:a|an|the|it|its|but|if|you|they|this|that|which|when|while|then|as|each|doing)\b")


def _bracket_end(s):
    """The index past the first bracket group of `s` (`(…)` or `[…]`, nested ones too); -1 when it has none or the group
    is left open."""
    depth = 0
    for i, ch in enumerate(s):
        if ch in "([":
            depth += 1
        elif ch in ")]" and depth:
            depth -= 1
            if not depth:
                return i + 1
    return -1


def _power_tokens(value):
    """A powers line's tokens as [start, end) spans of `value`: split at the commas and semicolons outside any bracket
    and at a sentence's period (`Armor 2. Astral Form`, `Concealment (Self Only). Dual Natured`)."""
    spans, depth, start = [], 0, 0
    for i, ch in enumerate(value):
        depth += (ch in "([") - (ch in ")]" and depth > 0)
        if not depth and (ch in ",;" or ch == "." and value[i + 1 : i + 2].strip() == ""):
            spans.append((start, i))
            start = i + 1
    return [(a, b) for a, b in [*spans, (start, len(value))] if value[a:b].strip()]


def _is_rider(name):
    """Whether the words of a power's name (its brackets taken out) are a sentence, not a name: they start in lower case
    with a function word (`but doing so …`, `a glitch raises it …`), or run to five words with a plain lower-case one
    in them (`Sapience damage increases to 9P`), not counting the connectors a name has (`Resistance to Toxins and
    Pathogens`)."""
    words = re.sub(r"[*†‡]", "", name).split()
    if not words:
        return False
    return bool(_RIDER_LEAD.match(words[0])) or (
        len(words) >= 5 and any(w[:1].islower() and w not in _CONNECTORS for w in words)
    )


def power_list(value):
    """A being's powers line read as its powers and the sentence the book runs on after them: (powers, rider). The
    powers are comma-separated again, a missing comma put back (`Hardened Armor 2; Immunity (Cold)`, `Armor 2. Astral
    Form`, `Enhanced Senses (Smell) Guard`). The rider is what follows the last power that is no name but a sentence
    (`… Petrification, Sapience damage increases to 9P, a glitch raises it 10P …`), or text after a power's brackets
    that is no name (`Shift (Winged Gorilla, Self) All attributes are the same in all forms`): it belongs to the power
    before it, and goes to the entry's text, not to its list."""
    value = " ".join((value or "").split())
    powers, rider = [], ""
    for a, b in _power_tokens(value):
        tok = value[a:b].strip()
        end = _bracket_end(tok)
        if _is_rider(re.split(r"[(\[]", tok, maxsplit=1)[0]):
            rider = value[a:].strip(" ,;")
            break
        if end >= 0 and (after := tok[end:].strip(" ,;")) and not re.fullmatch(r"[\d*†‡\s]*", after):
            # (text after the bracket: another power when it reads as a name, else the sentence the line runs on with)
            if re.fullmatch(r"[A-Z][\w'’/-]*(?:\s+(?:[A-Z][\w'’/-]*|[a-z]{1,3})){0,2}", after) and not _is_rider(after):
                powers += [tok[:end].strip(), after]
                continue
            powers.append(tok[:end].strip())
            rider = (after + value[b:]).strip(" ,;")
            break
        powers.append(tok)
    return ", ".join(powers), rider


def is_titled(value):
    """Whether a powers list's names (its brackets taken out) are all Title Case words, the connectors of a name apart
    (`Weapons (claws/bite), Sapience`; not `Zorp hunts in packs, and glows`)."""
    flat = re.sub(r"\([^()]*\)|\[[^\[\]]*\]", "", value)
    return all(w[:1].isupper() or w[:1].isdigit() or w in _CONNECTORS for w in re.split(r"[\s,;]+", flat) if w)
