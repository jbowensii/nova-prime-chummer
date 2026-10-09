"""Flags an entry's own words set (owner, 2026-10-09: the metamagic and spell flags the builder, the sheet and the
Foundry export use). General readers over the printed name, its section and its text, never an item's name:

- a metamagic's **user**: `adept` when its name carries `(Adepts Only)` (the core rulebook) or it is printed under an
  `Adept Metamagics` heading (Street Wyrd); `magician` the same way (`(Magicians Only)`, `Magician Metamagics`). No
  note: any initiate may take it (CRB p. 167: "unless otherwise noted"). The note leaves the name.
- a metamagic's **perLevel**: its text says it can be taken again (`You can take this as many times as you like`,
  `can be taken multiple times`, `may take this power multiple times`); maxLevel when it says `up to N times`. Each
  time is one more initiation's metamagic (CRB p. 167: a metamagic a grade).
- a spell's **opposed**: its test is opposed (`opposed by`, `Opposed test`, `resisted by`, `vs. Willpower + …`, `vs.
  Object Resistance`), and every Combat spell (CRB p. 133: Direct ones opposed by Willpower + Intuition, Indirect ones
  rolled vs. Reaction + Willpower). `as opposed to` is no test.
- a spell's **essence**: its test's threshold counts the target's Essence (`Sorcery + Magic (5 – Essence)`, the
  Health spells', CRB p. 135)."""
import re

from importer.sr6.regroup import norm

_ONLY = re.compile(r"\(?\s*\b(adepts?|magicians?)\s+only\b\s*\)?", re.I)
_SECTION = re.compile(r"^(adepts?|magicians?)\s+metamagics?\b")
_WORD = r"(?:one|two|three|four|five|six|\d+)"
_NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
_AGAIN = re.compile(rf"\b(?:take|taken|select|selected|choose|chosen|learn|learned|purchase|purchased|buy|bought)\b"
                    rf"[^.]{{0,40}}?\b(?:as\s+many\s+times|more\s+than\s+once|multiple\s+times|several\s+times"
                    rf"|up\s+to\s+({_WORD})\s+times)\b", re.I)
_ATTR = r"(?:Body|Agility|Reaction|Strength|Willpower|Logic|Intuition|Charisma|Edge|Magic|Resonance|Object\s+Resistance)"
_OPPOSED = re.compile(r"(?<!as )\bopposed\b(?!\s+to\b)|\bresist(?:s|ed)?\s+(?:by|with)\b"
                      rf"|\b(?:vs\.?|versus)\s+(?:the\s+)?(?:(?:target|subject|victim)[’']?s?\s+)?{_ATTR}\b", re.I)
_ESSENCE = re.compile(r"\d+\s*[–−-]\s*(?:the\s+)?(?:(?:target|subject)[’']?s\s+)?Essence\b", re.I)


def _user(word):
    return "adept" if word.lower().startswith("adept") else "magician"


def metamagic(name, text="", context=()):
    """(name, attrs): the name without its `(Adepts Only)` note; user adept|magician, perLevel true, maxLevel N.
    context: the headings it is printed under, its tag line."""
    attrs = {}
    if m := _ONLY.search(name):
        name, attrs["user"] = (name[:m.start()] + name[m.end():]).strip(), _user(m.group(1))
    else:
        for c in context:
            if c and (m := _ONLY.fullmatch(c.strip()) or _SECTION.match(norm(c))):
                attrs["user"] = _user(m.group(1))
                break
    if m := _AGAIN.search(" ".join((text or "").split())):
        attrs["perLevel"] = "true"
        if m.group(1):
            attrs["maxLevel"] = str(_NUMBERS.get(m.group(1).lower()) or int(m.group(1)))
    return name, attrs


def spell(category, text=""):
    """{opposed: true, essence: true} as its category and text say."""
    t = " ".join((text or "").split())
    out = {}
    if category == "combat" or _OPPOSED.search(t):
        out["opposed"] = "true"
    if _ESSENCE.search(t):
        out["essence"] = "true"
    return out
