"""Anarchy's effects read from a book clause as general rules (sibling of importer/sr6/effects.py): the narrative effect
kinds (CRB p.59) and how an effect is turned on. Vocabulary only (the game's own words: Advantage, Edge, wound
modifiers, Risk), never an entry's name. The kinds are the engine's RULE_EFFECTS (src/ca2/runner-builder/domain/amps.ts): rating 0, so an
amp's rating stays the book's (its narrative effects keep pricing it); what they say is machine-readable.

rules(clause, tests) -> [(ref, param, value, note, state)]:
- `Advantage on <Test>` (`for/in exchange for 1 Edge` -> edge-advantage), `Disadvantage on <Test>` on the character;
  one it inflicts on someone else (`the target`, `anyone`, `inflicts`) -> inflict-disadvantage
- `ignore/negate/eliminate … Disadvantage`, `without … Disadvantage`, a vision (`Low-Light Vision`) -> no-disadvantage
- `ignore (Light Wound) wound modifiers/penalties` -> ignore-wounds; `must take a High or Extreme Risk` -> forced-risk;
  `N risk dice minimum` -> min-risk-dice; `social armor N`, `Matrix armor +N`; `an additional Complex form` -> sustain-form
- `gain/recover 1 Edge` -> edge-gain; any other `… for/in exchange for 1 Edge` -> edge-effect; `Allows …` -> allow-test
- `last point of Essence counts double` -> essence-implant; `ignore the loss of one Essence point` -> essence-magic
- `suffers a Serious Wound` (a drug's aftermath) -> self-wound; `immunity against …` -> immunity

state(clause, entry): `switch` activated for an entry with a `Duration:` (a drug's dose) or a clause that activates;
`when` for a clause's condition (`when …`, `while …`, `at night`, `once the effects fade away`; a parenthesis is not one);
`confidence="low"` for a value that depends on hits. Tests come from the caller's `tests(phrase)`: skill, spec or attribute
ids, `custom:<words>`, or "" (every Test)."""

import re

EDGE = r"(?:(?:1|one|an|a single)\s+edge(?:\s+points?)?|(?:1|one|a)\s+point\s+of\s+edge)"
_EDGE_PAID = re.compile(
    rf"\b(?:for|in exchange for|against|by spending|spend(?:s|ing)?|use|using|costs?|at the cost of|requires?|"
    rf"(?:requires|requiring)\s+the\s+expenditure\s+of)\s+{EDGE}",
    re.I,
)
# "Requires one Edge point to activate its effects": how the entry is turned on (its switch), not an effect of its own
_EDGE_SWITCH = re.compile(
    rf"^(?:requires?|these effects are activated by spending)\s+(?:the\s+expenditure\s+of\s+)?{EDGE}"
    r"(?:\s+to\s+activate\s+(?:its|these|the(?:ir)?)\s+effects?)?\.?$",
    re.I,
)
_TEST_END = r"(?=\s*(?:tests?\b|rolls?\b|$|[.;,]|\s+(?:when|while|if|to|in exchange|for 1|for one|against|during|until|once|on|concerning|using)\b))"
_ADV = re.compile(
    rf"\badvantage\s+(?:on|in|to|for)\s+(?!exchange\b|1\b|one\b)(?:all\s+|any\s+|every\s+|a\s+|an\s+|their\s+|the\s+)?"
    rf"(?P<test>[^.;:]*?){_TEST_END}",
    re.I,
)
_ADV_BARE = re.compile(r"\b(?:gain|gains|get|gets|grants?|obtain|provides?)\s+(?:an?\s+)?advantage\b", re.I)
_DIS = re.compile(
    rf"\bdisadvantage\s+(?:on|to|in|for)\s+(?:all\s+|any\s+|every\s+|most\s+|some\s+|their\s+|the\s+)?"
    rf"(?P<test>[^.;:]*?){_TEST_END}",
    re.I,
)
_DIS_OTHER = re.compile(
    r"\b(?:inflicts?|imposes?|causes?|cause|generates?|creates?)\s+(?:a\s+)?(?:\w+\s+)?disadvantage\b|"
    r"\b(?:the\s+target|targets|targeted\s+\w+|anyone|opponents?|enemies|victim)\b[^.;]*\bdisadvantage",
    re.I,
)
_NO_DIS = re.compile(
    r"(?<!n't\s)(?<!n’t\s)(?<!not\s)\b(?:ignor\w*|negat\w*|eliminat\w*|cancel\w*|avoid\w*|without\s+(?:\w+\s+){0,3}?suffering|without|"
    r"suffers?\s+no)\b[^.;,]*?\bdisadvantages?\b",
    re.I,
)
_VISION = re.compile(
    r"\b(low[- ]light vision|thermographic vision|thermal vision|night vision|flare compensation)\b"
    r"(?!\s+(?:does|do)(?:\s*n['’]t|\s+not))",
    re.I,
)
_WOUNDS = re.compile(
    r"\bignor\w*\s+(?:the\s+)?(?:(light|serious|severe)\s+wound\s+|wound\s+)?(?:penalties|modifiers)\b"
    r"|\bignor\w*\s+the\s+disadvantage\s+caused\s+by\s+(one\s+wound\s+level)",
    re.I,
)
_RISK = re.compile(r"\bmust\s+take\s+a\s+high\s+or\s+extreme\s+risk\b", re.I)
_MIN_RISK = re.compile(
    r"\b(\d+)\s+risk\s+dice\s+minimum\b|\b(?:at\s+least|a\s+minimum\s+of)\s+(\d+)\s+risk\s+dice\b", re.I
)
_SOCIAL = re.compile(r"\bsocial\s+armor\s+\+?(\d)\b", re.I)
_MATRIX = re.compile(r"\bmatrix\s+armor\s+\+?(\d)\b", re.I)
_FORM = re.compile(r"\b(?:maintain|sustain)\w*\s+(?:one\s+|an\s+)?(?:additional|extra|more)\s+complex\s+form", re.I)
_EDGE_GAIN = re.compile(
    rf"\b(?:gain|gains|gaining|recover|recovers|recovering|regain|regains|earn|earns|grants?)\s+(?:back\s+)?"
    rf"(?:{EDGE}|edge\s+points?)|\brecovery\s+of\s+edge\s+points?",
    re.I,
)
_DIS_BARE = re.compile(
    r"\b(?:take|takes|suffer|suffers|gain|gains|with)\s+(?:a\s+)?disadvantages?\b(?!\s+(?:on|to|in|for)\b)", re.I
)
_SELF_WOUND = re.compile(
    r"\b(?:suffers?|takes?|causes?|inflicts?)\s+(?:a|one|1)\s+(light|serious|severe|minor)\s+(?:wound|injury)\b", re.I
)
_IMMUNE = re.compile(r"\bimmun(?:e|ity)\s+(?:against|to)\s+([^.;]+)", re.I)
_ALLOWS = re.compile(
    r"^(?:it\s+|this\s+)?allows?\b\s*(?:(?:you|the\s+(?:user|caster|character|player|pilot)|users?|a\s+(?:user|character))\s+)?(?:to\s+)?",
    re.I,
)
_ESS_IMPLANT = re.compile(r"\blast\s+point\s+of\s+essence\s+counts\s+double\b", re.I)
_ESS_MAGIC = re.compile(r"\bignore\s+the\s+loss\s+of\s+one\s+essence\s+point\b", re.I)

_COND = re.compile(
    r"\b(?:when(?:ever)?|while|if|unless|as long as|involving|related to|during the (?:following|next)|at night|in darkness|once the effects fade away|"
    r"once the effects dissipate|against\s+(?:targets?|vehicles|unarmored|unarmoured)|when using)\b",
    re.I,
)
_HITS = re.compile(
    r"\b(?:per\s+\d+\s+(?:net\s+)?hits?|net\s+hits|\d+\s+hits?:|every\s+\d+\s+hits|for every \w+ successes)", re.I
)
_DURATION = re.compile(r"\bDuration\s*:", re.I)
_ACTIVATE = re.compile(r"\b(?:activat\w*|at will|turn(?:s|ed)?\s+(?:on|off))\b", re.I)
_PAREN = re.compile(r"\([^()]*\)?")


def _clean(s):
    return re.sub(r"\s+", " ", s).strip(" .,;:-–•")


def _piece(clause, rx):
    """The part of `clause` (split at ":", ";" and sentence ends) where `rx` matches: a text param says only that."""
    for p in re.split(r"[:;]\s+|(?<=[.!?])\s+", clause):
        if rx.search(p):
            return _clean(p)[:100]
    return _clean(clause)[:100]


def when(clause):
    """The condition a clause sets, as printed from its first condition word (`when analyzing clues`), else None. Words in
    parentheses are an aside, not a condition."""
    c = _PAREN.sub(" ", clause)
    m = _COND.search(c)
    return _clean(c[m.start() :])[:120] or None if m else None


def state(clause, entry=""):
    """{switch?, when?, confidence?} for an effect read from `clause` of an entry whose whole text is `entry`."""
    out = {}
    if _DURATION.search(entry) or _ACTIVATE.search(clause):
        out["switch"] = "activated"
    w = when(clause)
    if w:
        out["when"] = w
        out.setdefault("switch", "conditional")
    if _HITS.search(clause):
        out["confidence"] = "low"
    return out


def rules(clause, tests, entry=""):
    """[(ref, param, value, note, state)]: the narrative effect kinds `clause` states, in the order printed, each once."""
    c = clause.strip()
    if not c or _EDGE_SWITCH.match(_clean(c)):
        return []
    st = state(c, entry)
    out = []

    def add(ref, param="", value=None, own=None):
        x = (ref, param or "", value, None, st if own is None else own)
        if all(y[:3] != x[:3] for y in out):
            out.append(x)

    edge_paid = bool(_EDGE_PAID.search(c))
    for m in _ADV.finditer(c):
        for p in tests(_clean(m.group("test"))) or [""]:
            add("edge-advantage" if edge_paid else "advantage", p)
    if not out and _ADV_BARE.search(c):
        add("edge-advantage" if edge_paid else "advantage")
    if _FORM.search(c):
        add("sustain-form")
    elif _NO_DIS.search(c):
        add("no-disadvantage", _piece(c, _NO_DIS))
    elif _DIS_OTHER.search(c):
        add("inflict-disadvantage", _piece(c, _DIS_OTHER))
    else:
        for m in _DIS.finditer(c):
            for p in tests(_clean(m.group("test"))) or [""]:
                add("disadvantage", p)
        if not any(x[0] == "disadvantage" for x in out) and _DIS_BARE.search(c):
            add("disadvantage")
    for m in _VISION.finditer(c):
        add(
            "no-disadvantage",
            m.group(1)[:1].upper() + m.group(1)[1:].lower(),
            own={k: v for k, v in st.items() if k == "switch" and v == "activated"},
        )
    m = _SELF_WOUND.search(c)
    if m and not _DIS_OTHER.search(c) and not re.search(r"\b(?:target|victim|anyone|every \(|damage)\b", c, re.I):
        add("self-wound", {"severe": "serious", "minor": "light"}.get(m.group(1).lower(), m.group(1).lower()))
    m = _IMMUNE.search(c)
    if m:
        add("immunity", _clean(m.group(1))[:80])
    m = _WOUNDS.search(c)
    if m:
        add("ignore-wounds", (m.group(1) or m.group(2) or "").lower().replace("severe", "serious"))
    if _RISK.search(c):
        add("forced-risk")
    for rx, ref in ((_MIN_RISK, "min-risk-dice"), (_SOCIAL, "social-armor"), (_MATRIX, "matrix-armor")):
        m = rx.search(c)
        if m:  # a value the effect states: always on (an aside such as "or the whole pool if less" isn't a condition)
            add(
                ref,
                value=int(next(g for g in m.groups() if g)),
                own={k: v for k, v in st.items() if k == "switch" and v == "activated"},
            )
    if _ESS_IMPLANT.search(c):
        add("essence-implant")
    if _ESS_MAGIC.search(c):
        add("essence-magic")
    if _EDGE_GAIN.search(c):
        add("edge-gain", _piece(c, _EDGE_GAIN))
    elif edge_paid and not out:
        add("edge-effect", _piece(c, _EDGE_PAID))
    if not out and _ALLOWS.match(c):
        add("allow-test", _clean(_ALLOWS.sub("", c, count=1))[:100])
    return out
