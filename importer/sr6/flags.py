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
  Health spells', CRB p. 135).
- a martial arts technique's **requires** (Firing Squad p. 97: some techniques have "additional restrictions"): the
  prerequisites its closing `Category:` line (or the Restriction label shapes.martial makes of its rest) prints, each
  a `requires` child, its kind `technique`, `adeptpower`, `quality`, `augmentation` or `other`, its text the name as
  printed. Read: `requires X`, `[the] user must [already] know|have X`; the kind from a word after the name (`the
  Kick Attack technique`, `X power`, `X quality`), else `know` (one knows techniques), else `augmentation` when X
  names augmentations by their words (`cyber…`, `bio…`, `implant…`, `augment…`, `…ware`: `at least one full
  cyberlimb`, `an implanted firearm`), else a word after the name in the entry's own text (`has the Killing Hands
  power active`), else `other`. A usage note (`may only be used with swords`) is no prerequisite.
- an entry's **options** (owner, 2026-10-09): its text says to choose one of the options it lists when it is learned
  (`against melee or ranged attacks (choose which category when learning this technique)`) and that it may be taken
  as many times as there are options to gain them all (`may be taken up to twice in order to gain both`): one entry per
  option, `<Name> (<Option>)` (crb._Catalog.add)."""
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
_CLOSING = re.compile(r"(?:\*\*|_)?\b(Category|Restriction)\b(?:\*\*|_)?\s*:\s*", re.I)
_MUST = r"(?:the\s+)?(?:user|character|practitioner)\s+must\s+(?:already\s+)?"
_NEED = re.compile(rf"^(?:requires?|{_MUST}(know|have|possess))\s+(.+)$", re.I)
_CLAUSE = re.compile(rf";|\.(?!\d)|,\s*(?=(?:requires?|{_MUST}(?:know|have|possess))\b)", re.I)
_KIND_WORD = r"(technique|adept\s+power|power|quality)"
_KINDS = {"technique": "technique", "power": "adeptpower", "adept power": "adeptpower", "quality": "quality"}
_PRINTED = re.compile(r"^(?:the|an?|one\s+or\s+both\s+versions\s+of|either\s+version\s+of)\s+", re.I)
_AUGMENT = re.compile(r"\b(?:cyber|bio|implant|augment)\w*|\b\w+ware\b", re.I)
_OPTIONS = re.compile(r"((?:[\w-]+,\s+)*[\w-]+,?\s+or\s+[\w-]+)\s+[\w-]+\s*\(?\s*choose\s+which\b[^.)]*?\bwhen\s+"
                      r"(?:learning|taking|selecting|buying|purchasing)\b", re.I)
_ALL = re.compile(r"\b(?:taken|learned|selected|purchased|bought)\s+(?:up\s+to\s+)?(twice|\w+\s+times)\b[^.]*?\b(?:both|all)\b", re.I)
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


def _kind(word):
    return _KINDS[" ".join(word.lower().split())]


def _closing(text):
    """(label, value) for each `Category:` / `Restriction:` label of the text: a label line's value is its line; one
    after the last sentence (`… firing mode. **Category:** Ranged, requires …`) runs to the paragraph's end, its
    wrapped lines joined."""
    t = re.sub(r"(?<=[a-z])-\n(?=[a-z])", "", text or "")
    out = []
    for m in _CLOSING.finditer(t):
        own_line = not t[t.rfind("\n", 0, m.start()) + 1:m.start()].strip(" •")
        rest = t[m.end():]
        rest = rest.split("\n")[0] if own_line else re.split(r"\n\s*\n|\n(?=\*\*[^*\n]+:\*\*)", rest)[0]
        out.append((m.group(1).title(), " ".join(rest.replace("**", "").replace("_", " ").split())))
    return out


def technique_category(text):
    """A technique's category as its closing `Category:` line prints it, without what follows it (`Grappling, requires
    …`: `Grappling`); None when it prints none."""
    return next((_CLAUSE.split(v)[0].strip(" ,.") or None for k, v in _closing(text) if k == "Category"), None)


def requires(text):
    """[("requires", {"kind": kind}, name)]: a martial arts technique's printed prerequisites (above)."""
    flat = " ".join((text or "").replace("**", "").split())
    out = []
    for _, value in _closing(text):
        for clause in _CLAUSE.split(value):
            if not (n := _NEED.match(clause.strip(" ,"))):
                continue
            what = _PRINTED.sub("", n.group(2).strip(" ,"))
            if k := re.match(rf"^(.+?)\s+{_KIND_WORD}$", what, re.I):
                what, kind = k.group(1), _kind(k.group(2))
            elif (n.group(1) or "").lower() == "know":
                kind = "technique"
            elif _AUGMENT.search(what):
                kind = "augmentation"
            elif k := re.search(rf"\b{re.escape(what)}\s+{_KIND_WORD}\b", flat, re.I):
                kind = _kind(k.group(1))
            else:
                kind = "other"
            out.append(("requires", {"kind": kind}, what))
    return out


def options(text):
    """The options an entry is learned in, one entry each (above): ["Melee", "Ranged"], else []."""
    t = " ".join((text or "").replace("**", "").replace("_", "").replace("*", "").split())
    m, n = _OPTIONS.search(t), _ALL.search(t)
    if not (m and n):
        return []
    opts = [o for o in re.split(r",\s*(?:or\s+)?|\s+or\s+", m.group(1)) if o]
    times = n.group(1).lower().split()[0]
    times = 2 if times == "twice" else _NUMBERS.get(times) or (int(times) if times.isdigit() else 0)
    return [o[:1].upper() + o[1:] for o in opts] if times == len(opts) > 1 else []
