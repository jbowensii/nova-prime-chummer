"""The effects reader's links: See X citations, add-on and tire links, incompatibilities."""

import re

from .words import NUMBERS, ROLES, STANDARD_ADDONS, _norm, sentences
from .values import _negated

_LINK_RX = [
    # (a bracket holding a comma is the grant's condition: `the Allergy (pollutants, mild) quality`)
    (
        re.compile(
            r"\b(?:gains?|receives?|has|have|get|gets|takes?)\s+(?:the\s+)?(?P<n>[A-Z][\w’'()-]*(?:\s+(?:[A-Z(][\w’'()-]*|of|the))*)(?:\s+\((?P<w>[^()]*,[^()]*)\))?\s+(?:(?P<lv>\d) )?(?P<k>quality|power|critter power|adept power)\b"
        ),
        "grants",
    ),
    # (the kind first: `gain the critter power Immunity (Pathogens, Toxins) with a rating of 2`)
    (
        re.compile(
            r"\b(?:gains?|receives?|get|gets)\s+(?:the\s+|an?\s+)?(?P<k>critter power|adept power|quality)\s+(?P<n>[A-Z][\w’'-]*(?:\s+(?:(?:of|on|the)\s+)?[A-Z][\w’'-]*)*)(?:\s+\((?P<w>[^()]{2,40})\))?(?:\s+with a rating of (?P<lv>\d))?"
        ),
        "grants",
    ),
    (
        re.compile(r"^[Ff]ree (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?P<k>power|quality)\b"),
        "grants",
    ),  # (a mentor's `**Adept:** Free Vocal Control power`)
    (
        re.compile(
            r"\b(?:an? )?implanted version of the (?P<n>[\w’'-]+(?:\s+[\w’'-]+){0,2}?) (?:enhancement|accessory|upgrade)\b",
            re.I,
        ),
        "as",
    ),
    (
        re.compile(
            r"\btreat (?:this|it) (?:\w+ )?as the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?:negative |positive )?(?P<k>quality|power)\b"
        ),
        "as",
    ),
    (
        re.compile(
            r"\b(?:the same (?:result|effect|bonus|way) as|functions (?:in the same way |just )?as|works (?:just )?(?:like|as)|counts as)\s+(?:an? |the )?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*)"
        ),
        "as",
    ),
    (
        re.compile(
            r"\b(?P<lv>\d+|one|two) free levels? of (?:the )?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z(][\w’'()-]*)*)(?: (?P<k>power))?"
        ),
        "grants",
    ),
    (re.compile(r"^(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z(][\w’'()-]*)*) (?P<k>power|quality) for free\b"), "grants"),
    # (the Companion's quality that is another's: `This is the same as the X quality in …`, `function exactly like the X quality
    # (p. 72, SR6)`; Companion p. 71 `Characters with the Beak quality also have the Tough Gut benefits`)
    (
        re.compile(
            r"\b(?:is the same as|same as|functions? exactly like) the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?P<k>quality|power)\b"
        ),
        "as",
    ),
    (re.compile(r"\balso have the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) benefits\b"), "grants"),
    (
        re.compile(r"\bgains? the benefits of the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?P<k>quality|power)\b"),
        "grants",
    ),
]
_SEE = re.compile(
    r"^\W*(?i:see)\s+(?:(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*),?\s+)?p\.\s*\d+(?:,\s*(?P<b>SR6|[A-Z][\w ]+?))?\W*$"
)
_PRICE = re.compile(r"^(?:cost|bonus|karma cost)\s*:\s*[\d,]+\s*karma(?:\s*\(?per (?:level|rating)\)?)?\s*", re.I)


def see_links(text, kind, name):
    """The entry a text that only points to another one works as (Companion p. 71: `Dermal Deposits`, `Cost: 7 Karma` /
    `See Dermal Deposits, p. 71, SR6.`; `See p. 76, SR6.` names the entry's own name in that book): <link rel="as">, none when
    the text says more than the price and the citation."""
    t = _norm((text or "").replace("**", ""))
    own = re.sub(r"\s*\(.*$", "", name).strip()  # (the text may open with the entry's own name and its price line)
    t = _PRICE.sub("", re.sub(r"^" + re.escape(own) + r"\b[\s:]*", "", t, flags=re.I))
    if not (m := _SEE.match(t)):
        return []
    a = {"rel": "as", "name": m.group("n") or re.sub(r"\s*\(.*$", "", name).strip()}
    if kind:
        a["kind"] = kind
    if m.group("b"):
        a["book"] = "crb" if m.group("b") == "SR6" else m.group("b")
    return [("link", a, None)]


_ADDON_RX = "|".join(STANDARD_ADDONS)
_AS_ADDON = re.compile(
    rf"\b(?:function|work|act)s? as an? (?P<a>{_ADDON_RX})(?:,? or as an? (?P<b>{_ADDON_RX}))?\b", re.I
)


def addon_links(text, kind):
    """A weapon add-on that works as standard ones (`able to function as a laser sight or as a smartgun system`)."""
    if kind != "weapons" or not (m := _AS_ADDON.search(_norm(text))):
        return []
    return [
        ("link", {"rel": "as", "kind": "weapons", "name": x.capitalize()}, None)
        for x in (m.group("a"), m.group("b"))
        if x
    ]


_TIRE_AS = re.compile(
    r"\b(?:function|work)s? like an? (?P<n>off-road|racing) tire\b[^.]*?\((?:again )?with the same modifiers\)|"
    r"\bjust like an? (?P<m>off-road|racing) tire\b[^.]*?\((?:again )?with the same modifiers\)",
    re.I,
)


_SYSTEM_AS = re.compile(r"\bworks? in (?:exactly )?the same way as the (?P<n>[a-z][a-z -]*? \([a-z]+\)) system\b", re.I)


def tire_links(text, kind):
    """Tires that work as other tires `(with the same modifiers)` (Double Clutch p. 123, Smart Tires) and a mod that works as
    another `in exactly the same way as the multi-terrain suspension (static) system` (p. 126): <link rel="as"> to each.
    """
    out = []
    for m in _TIRE_AS.finditer(_norm(text)):
        n = (m.group("n") or m.group("m")).title()
        out.append(("link", {"rel": "as", "kind": kind, "name": f"{n} Tires"}, None))
    out += [
        ("link", {"rel": "as", "kind": kind, "name": m.group("n").title()}, None)
        for m in _SYSTEM_AS.finditer(_norm(text))
    ]
    return out


_LINK_KIND = {
    "quality": "qualities",
    "power": "adeptpowers",
    "adept power": "adeptpowers",
    "critter power": "critterpowers",
}
_NOT_NAMES = {"Edge", "The", "This", "Each", "A", "An", "Magic", "Resonance"}


# ---------- incompatibilities: what the entry can't be combined with (CRB Hong Kong pp. 157, 286-293) ----------
_INC = re.compile(
    r"\b(?:(?:is|are) incompatible with|incompatible with|cannot be combined with|can't be combined with|"
    r"can not be combined with|may not be combined with|(?:may|can) not take both)\b(?P<rest>[^.;]*)",
    re.I,
)
_ONE_AT_A_TIME = re.compile(
    r"\byou can only have one installed at a time\b|\bonly one (?:type |kind )?(?:of (?:these|them) )?"
    r"(?:can|may) be (?:installed|taken|implanted)(?: at a time)?\b",
    re.I,
)
_COMPAT = re.compile(
    r"\b(?:is|are) compatible with (?:an? |the )?(?P<w>wireless )?(?P<n>[a-z][\w’' -]*?)(?: systems?)?(?=,|;| and\b|$)",
    re.I,
)
_INC_TARGETS = (
    ("reaction", "attr:rea"),
    ("strength", "attr:str"),
    ("agility", "attr:agi"),
    ("body", "attr:bod"),
    ("initiative", "derived:initiative-dice"),
)
_KIND_WORDS = re.compile(r"\s+(?:cyberware|bioware|geneware|nanoware|bodyware|quality|power|system)s?$", re.I)


def _inc_names(rest):
    """The entries a clause names (`including muscle augmentation or muscle toner bioware`, `(such as bone density
    augmentation)`, `Cyclopean Eye`): each name, its kind word left off."""
    m = re.search(r"\b(?:including|such as|like)\s+(?:the\s+)?(.+)$", rest, re.I)
    if m:
        body = m.group(1)
    elif not re.search(r"\b(?:augmentations?|enhancements?|boosts?|other|any|all)\b", rest, re.I):
        body = rest  # (`Incompatible with Cyclopean Eye`: the clause is the name)
    else:
        return []
    out = []
    body = re.sub(r"\s*\(see [^)]*\)?", "", body, flags=re.I)
    for n in re.split(r",\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+(?:the\s+)?", body.strip(" ()")):
        n = _KIND_WORDS.sub("", re.sub(r"^(?:the|a|an)\s+", "", n.strip(" ().,"), flags=re.I)).strip()
        # (a name, not a description: `anything else that provides …`, `skin modifications`, `qualities`)
        if (
            2 < len(n) < 60
            and len(n.split()) <= 4
            and not re.match(
                r"(?:any|all|other|every|anything|something|except|qualit|augment|"
                r"modification|cyberware|bioware|ware\b)",
                n,
                re.I,
            )
            and not re.search(r"\b(?:that|which|who|modifications?)\b", n, re.I)
        ):
            out.append(n)
    return out


def incompatibilities(text, name=""):
    """[(tag, attrs, None)]: <incompatible> parts for what the text says the entry can't be combined with: `targets` the
    attributes and initiative an augmentation that raises them can't be combined with (`incompatible with augmentations
    that affect Reaction or Initiative`), `names` the entries named (`including wired reflexes`, `; `-separated),
    `family` the name its kind shares when only one may be installed at a time (`Bone Lacing (Plastic)`: `Bone Lacing`);
    and <compatible name switch> for an exception (`Wireless bonus: compatible with a wireless wired reflexes system`).
    """
    out = []
    for s in sentences(text):
        label = ""
        if m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+(.*)$", s):
            label, s = m.group(1), m.group(2)
        if _ONE_AT_A_TIME.search(s):
            fam = re.sub(r"\s*\(.*$", "", name or "").strip()
            if fam:
                out.append(("incompatible", {"family": fam}, None))
        for m in _INC.finditer(s):
            rest = m.group("rest")
            if _negated(s.lower(), m.start()):
                continue
            ts = [
                t
                for w, t in _INC_TARGETS
                if re.search(
                    rf"\b(?:increase|affect|add to|raise|enhance|boost)\w*\s+(?:your\s+)?[\w\s]*\b{w}\b|"
                    rf"\benhancements? to {w}\b|\b{w}(?: or \w+)? (?:boosts?|enhancements?)\b|"
                    rf"\bform of [\w\s]*\b{w}\b",
                    rest,
                    re.I,
                )
            ]
            names = _inc_names(rest)
            if ts or names:
                a = {}
                if ts:
                    a["targets"] = " ".join(dict.fromkeys(ts))
                if names:
                    a["names"] = "; ".join(names)
                out.append(("incompatible", a, None))
        # (only a wireless exception: `Wireless bonus: … compatible with a wireless wired reflexes system`)
        if (
            (m := _COMPAT.search(s.rstrip(". ")))
            and not re.search(r"\bnot\b", s[: m.start()], re.I)
            and (m.group("w") or label.casefold().startswith("wireless"))
        ):
            out.append(("compatible", {"name": _KIND_WORDS.sub("", m.group("n").strip()), "switch": "wireless"}, None))
    uniq = []
    for x in out:
        if x not in uniq:
            uniq.append(x)
    return uniq


def links(text, kind=None):
    """<link rel kind name [level]> for each entry the text grants or says this one works as."""
    out = []
    ss = sentences(text)
    for i, s in enumerate(ss):
        after = " ".join(ss[i + 1 : i + 2])  # (`… gain the X quality. See p. 70, SR6.`: the citation next)
        if m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+(.*)$", s):
            role, s = ROLES.get(m.group(1).casefold()), m.group(2)
        else:
            role = None
        if m and m.group(1).casefold() in (
            "effect",
            "effects",
        ):  # (a drug's `Effect:` list naming an entry with its page, `High Pain Tolerance (p. 72, SR6)`: it grants it)
            for d in re.finditer(
                r"(?:^|,\s*|\s+and\s+)(?:Gains?\s+)?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*)\s+\(p\.\s*\d+(?:,\s*(?P<b>SR6|[A-Z][\w ]+?))?\)",
                s,
            ):
                x = (
                    "link",
                    {
                        "rel": "grants",
                        "name": d.group("n"),
                        **({"book": "crb" if d.group("b") == "SR6" else d.group("b")} if d.group("b") else {}),
                    },
                    None,
                )
                if x not in out:
                    out.append(x)
        for rx, rel in _LINK_RX:
            for m in rx.finditer(s):
                n = re.sub(r"\s*\(p\.\s*\d+.*$", "", m.group("n")).strip(" ,")
                if n in _NOT_NAMES or len(n) < 3:
                    continue
                if re.search(r"\b(?:must|need to|have to|has to)\s+(?:also\s+)?$", s[: m.start()], re.I):
                    continue  # (`You must also take the Overprotective quality`: what it requires, no grant)
                if re.search(
                    r"\b(?:if|unless|until|when|whenever)\s+(?:you|they|the character|the (?:spirit|critter|target|user))\s+(?:do(?:es)? not\s+|don.t\s+)?(?:also\s+)?(?:already\s+)?$",
                    s[: m.start()],
                    re.I,
                ):
                    continue  # (`if you do not already have the Hooder quality`, `3 Karma if you already have X`: what it asks of the character, no grant)
                if rel == "as" and re.match(r"\s*,?\s*except\b", s[m.end() :]):
                    continue  # (`functions in the same way as Armor, except that it only protects on the astral plane`: not Armor's effects)
                k = _LINK_KIND.get((m.groupdict().get("k") or "").casefold()) or (
                    "gear" if "implanted version" in m.group(0).casefold() else None
                )  # (the enhancement is a gear entry)
                if not k and "free level" in m.group(0):
                    k = "adeptpowers"
                a = {"rel": rel, "name": n}
                if k:
                    a["kind"] = k
                lv = m.groupdict().get("lv")
                if lv:
                    a["level"] = NUMBERS.get(lv, lv)
                if role:
                    a["when"] = role
                elif m.groupdict().get("w"):
                    a["when"] = m.group("w")
                elif rel == "grants" and (
                    cond := re.search(r"\b(?:who|if|when|whenever|while|unless)\b[^,.;]{3,60}$", s[: m.start()], re.I)
                ):
                    a["when"] = re.sub(r"\s+also\s*$", "", cond.group(0)).strip(
                        " ,"
                    )  # (`Users who reach level 5 or 6 … also gain the Uncouth quality`: on that condition)
                cite = re.search(
                    r"\(?p\.\s*\d+,\s*(SR6|[A-Z][\w ]+?)\b\)?", (s[m.end() : m.end() + 40] + " " + after)[:80]
                )
                if cite:
                    a["book"] = "crb" if cite.group(1) == "SR6" else cite.group(1)
                x = ("link", a, None)
                if x not in out:
                    out.append(x)
    return out
