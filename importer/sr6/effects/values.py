"""The effects reader's targets, values and conditions: what a clause raises, by how much, when."""
import re

from .words import ACTIVITIES, ATTRIBUTES, DERIVED, ITEM, ITEM_KINDS, MATRIX, NUMBERS, SKILLS, SPECS, SPELL_CATEGORIES, VEHICLE_KINDS, _ACTION_STOP, _ATTR_RX, _BARE_TEST, _CONDITION, _DICE_ON, _EDGE_OTHERS, _NOT_ACTION, _NOT_A_NAME, _QUALIFIER, _SKILL_RX, _SPEND_ACTION, _SWITCH, _TEST_WORDS, _key, _norm, _slug


def targets(phrase, kind=None):
    """[(target, when)] the phrase names, in order: attributes, skills (with a specialization), test types, derived
    values, Matrix attributes, item stats. `kind` tells an item's stats from a character's (an item's Armor, Body)."""
    p = " " + _norm(phrase).casefold() + " "
    # (`tests to resist damage (not including drain)`, `other than Spellcasting`: not those)
    p = re.sub(r",? and (?:net|the|you|they|it|its|their|then|his|her|(?:reduc|increas|rais|lower|add|grant|gain|impos|allow)\w*)\b.*$|"
               r"\bbut\b.*$", " ", p)  # (the first clause: `X tests, and net hits …`)
    if re.match(r"\s*(?:all |the |any )?thresholds?\b", p):
        return []  # (`-1 to all thresholds`: a threshold, not a pool)
    p = re.sub(r"\b(?:that |which )?(?:are |is )?resisted by\b[^.;]*", " ", p)  # (`spells that are resisted by Willpower, Logic, …`: what resists them, not what is raised)
    p = re.sub(r"\((?:not|except|other than|excluding)[^)]*\)", " ", p)
    p = re.sub(r"\b(?:running|run) silent(?:ly)?\b|\bsilent running\b", " ", p)  # (a Matrix icon's state, not the Running specialization)
    p = re.sub(r"\b(?:the|a|each|every|that|this|during|per) runs?\b(?!\s+(?:tests?|speed|distance))", " ", p)  # (a shadowrun, not the Running specialization)
    p = re.sub(r"\b(" + _SKILL_RX + r")\s*\+\s*(?:" + _ATTR_RX + r")\b", r"\1", p)  # (`their Perception + Intuition test for hearing`: the pool of the skill, the attribute is part of it)
    p = re.sub(r"\b(?:not including|except(?: for)?|other than|excluding|with the exception of)\b[^.;]*", " ", p)
    out, taken = [], []

    def add(t, a, b, when=None):
        if any(x < b and a < y for x, y in taken):
            return
        taken.append((a, b))
        if (t, when) not in out:
            out.append((t, when))
    for m in re.finditer(r"(?:tests?|any test|tests?) using (?:your |their )?(" + _ATTR_RX + r")\b|\b(" + _ATTR_RX +
                         r")[- ](?:based|linked)\b|\b(?:tests?|skills?|skill tests?) (?:that are |which are )?(?:linked|tied) to (?:the |your )?(" + _ATTR_RX + r")\b", p):
        add(f"test:attr-{ATTRIBUTES[m.group(1) or m.group(2) or m.group(3)]}", m.start(), m.end())
    for m in re.finditer(r"\b(maximum|max)\b", p):
        pass
    for m in re.finditer(r"\b(?:tests?|actions?|rolls?)(?: made)? (?:(?:that|which) (?:involve|involves|use|uses|include|includes)|using|involving|based on) (?:(?:an?|any|the|your|their|one of the) )*"
                         r"((?:(?:" + _ATTR_RX + r")(?: attributes?)?(?:,? or |,? and |,\s*)?)+)", p):
        for a in re.finditer(_ATTR_RX, m.group(1)):
            add(f"test:attr-{ATTRIBUTES[a.group(0)]}", m.start(1) + a.start(), m.start(1) + a.end())
    for m in re.finditer(r"\b(" + _ATTR_RX + r")(?: attribute)? (?:tests?|rolls?)\b", p):
        add(f"test:attr-{ATTRIBUTES[m.group(1)]}", m.start(), m.end())
    for m in re.finditer(r"\b(?:" + "|".join(sorted(DERIVED, key=len, reverse=True)) + r")\b", p):
        if m.group(0) == "lift" and "lift/carry" in p:
            continue
        add(f"derived:{DERIVED[m.group(0)]}", m.start(), m.end())
    mx = bool(re.search(r"\b(?:vr|matrix|hot sim|cold sim)\b", p))
    for m in re.finditer(r"\b(?:matrix )?initiative (?:dice|die)\b", p):
        add("derived:matrix-initiative-dice" if mx else "derived:initiative-dice", m.start(), m.end())
    for m in re.finditer(r"\b(?:matrix )?initiative(?: score)?\b", p):
        add("derived:matrix-initiative" if mx or "matrix" in m.group(0) else "derived:initiative", m.start(), m.end())
    for m in re.finditer(r"(?<![a-z'-])(?!" + _NOT_ACTION + r")([a-z][a-z'-]{2,20}(?: (?!" + _NOT_ACTION + r")[a-z][a-z'-]{2,20})?) matrix actions?\b", p):
        if not set(m.group(1).split()) & _NOT_A_NAME:
            add("action:" + _slug(m.group(1)), m.start(), m.end())  # (`a Data Spike Matrix Action`: that action, not every Matrix test)
    for rx, t in _TEST_WORDS:
        for m in re.finditer(r"\b(?:" + rx + r")", p):
            add(t, m.start(), m.end())
    for m in re.finditer(r"\b(" + "|".join(SPELL_CATEGORIES) + r") spells?\b", p):
        add(f"test:spell-{m.group(1)}", m.start(), m.end())
    for m in re.finditer(r"\bspells\b[^.;]{0,60}?\bin the (" + "|".join(SPELL_CATEGORIES) + r") categor(?:y|ies)\b", p):  # (`spells, preparations, and spell rituals in the Manipulation category`)
        add(f"test:spell-{m.group(1)}", m.start(), m.end())
    p = re.sub(r"\boutdoor\b", "outdoors", re.sub(r"\bathletic\b", "athletics", p))
    p = re.sub(r"\b(?:under )?the influence of\b", " ", p)  # (`under the influence of a drug`: no skill)
    for m in re.finditer(r"\b(" + _SKILL_RX + r")(?:\s*\(([a-z][a-z ]+?)\))?(?=\s|[,.;)])", p):
        if m.group(1) == "con" and re.match(r"con(?:dition|tact|trol|sider)", p[m.start():m.start() + 12]):
            continue
        add(f"skill:{m.group(1).replace(' ', '-')}", m.start(), m.end(), m.group(2))
    _TW = r"(?:tests?|rolls?|attempts?|attacks?|checks?|pools?)"
    for m in re.finditer(r"\b(" + "|".join(sorted(SPECS, key=len, reverse=True)) + r")\b", p):
        # a specialization's word next to its test (`climbing tests`, `tests for balance, falling`), not any word (`clubs`)
        if re.match(r"\)?(?:[\s,-]+(?:and |or )?[a-z-]+){0,3}?\)?\s+" + _TW + r"\b", p[m.end():]) or \
                (t := re.search(r"\b" + _TW + r"\s+(?:for|involving|related to|of|like|made to|to|with)\b([^.;]{0,50})$", p[:m.start()])) and \
                len(re.findall(r"[a-z-]+", t.group(1))) <= 6:
            add(f"skill:{SPECS[m.group(1)]}", m.start(), m.end(), m.group(1))
    for m in re.finditer(r"\b(" + "|".join(sorted(MATRIX, key=len, reverse=True)) + r")\b", p):
        add(f"matrix:{MATRIX[m.group(1)]}", m.start(), m.end())
    for m in re.finditer(r"\b(?:the |that |this )?(?:chosen|selected|designated|that|same|this) (?P<mx>matrix )?attribute\b|\bone (?:of )?(?:the |your |their |its |[a-z]+'s )?"
                         r"(?:[a-z]+'s )?(?:basic |physical |mental |special )?attributes\b|\ban attribute of (?:your|their|the player's) choice\b", p):
        add("matrix:choice" if m.groupdict().get("mx") else "attr:choice", m.start(), m.end())
    for m in re.finditer(r"\(attribute\)", p):  # (a complex form's `(attribute)`: the Matrix attribute it is bought for)
        add("matrix:choice" if kind == "complexforms" else "attr:choice", m.start(), m.end())
    for m in re.finditer(r"\b(?:the |that |the chosen |the selected |a )?(?:chosen|selected) skill\b|\bthat skill\b", p):
        add("skill:choice", m.start(), m.end())
    for m in re.finditer(r"\b(knowledge|language) (?:skill )?(?:tests?|checks?)\b", p):
        add(f"skill:{m.group(1)}", m.start(), m.end())
    for m in re.finditer(r"\b(?:doing|performing|using|taking|making) (?:an? |the )?([a-z][a-z'-]{2,20}(?: [a-z][a-z'-]{2,20}){0,2}?) (?:matrix |minor |major )?actions?\b", p):
        if m.group(1) not in ("a", "an", "one", "additional", "extra", "bonus", "free", "the", "minor", "major", "matrix", "this", "that"):
            add(f"action:{_slug(m.group(1))}", m.start(), m.end())
    for m in re.finditer(r"\bthe ([a-z][a-z'-]{2,20}(?: [a-z][a-z'-]{2,20}){0,2}?) (?:minor|major|edge) action\b", p):
        if m.group(1) not in ("a", "an", "one", "additional", "extra", "bonus", "free", "the"):
            add(f"action:{_slug(m.group(1))}", m.start(), m.end())
    # a named action or complex form without a verb (`bonus dice on a Snoop action or Static Veil complex form`), and a
    # list of actions after a colon (`a hacking action: Brute Force, Probe, or Backdoor Entry`)
    for m in re.finditer(r"\bactions?:\s*(?P<l>[a-z][a-z' -]*?(?:,\s*[a-z][a-z' -]*?)*(?:,?\s+or\s+[a-z][a-z' -]*?)?)(?=[.;)]|$)", p):
        for n in re.finditer(r"(?:^|,\s*|\s+or\s+)(?:or\s+)?([a-z][a-z' -]*?)(?=,|\s+or\s+|$)", m.group("l")):
            if n.group(1).strip():
                add(f"action:{_slug(n.group(1).strip())}", m.start("l") + n.start(1), m.start("l") + n.end(1))
    for m in re.finditer(r"(?<![a-z'-])(?!" + _NOT_ACTION + r")([a-z][a-z'-]{2,20}(?: (?!" + _NOT_ACTION + r")[a-z][a-z'-]{2,20}){0,2}?) (?:matrix )?(?P<k>actions?|complex forms?)\b", p):
        w = m.group(1)
        if w.split()[-1] in _ACTION_STOP or m.group("k").startswith("complex") and w in ("sustained", "threaded"):
            continue
        add(("complex-form:" if m.group("k").startswith("complex") else "action:") + _slug(w), m.start(), m.end())
    for m in re.finditer(r"\b(attack ratings?|ar)\b", p):
        add("item:ar", m.start(), m.end())
    for m in re.finditer(r"\b(damage values?|dv)\b", p):
        add("item:dv", m.start(), m.end())
    for m in re.finditer(r"\b(?:a|one|any) (?:single )?skill\b", p):
        add("skill:choice", m.start(), m.end())  # (a character's attacks too: `your Attack Rating with Close Combat attacks`)
    if kind in ITEM_KINDS:
        for m in re.finditer(r"\b(" + "|".join(sorted(ITEM, key=len, reverse=True)) + r")\b", p):
            add(f"item:{ITEM[m.group(1)]}", m.start(), m.end())
        if kind in VEHICLE_KINDS or re.search(r"\b(?:vehicle|drone)(?:'s|s)?\b", p):
            for m in re.finditer(r"\b(armor|body)\b", p):
                add(f"item:{m.group(1)}", m.start(), m.end())
    for m in re.finditer(r"\b(" + _ATTR_RX + r")\b(?! (?:point|boost|action|cost|actions|boosts)s?\b)", p):
        if m.group(1) == "edge" and (re.search(r"\b(?:gain|use|spend|bonus|point)", p[max(0, m.start() - 25):m.start()])
                                     or re.search(r"[+-]?\d+\s*$", p[:m.start()])):
            continue  # (`a bonus Edge`: Edge on tests, not the attribute)
        if re.search(r"\+\s*$", p[:m.start()]):
            continue  # (`Perception + Intuition tests`: the skill's pool, not the attribute)
        if m.group(1) == "body" and (re.search(r"\b(?:physical|metahuman|human|whole|entire|own|living|lower|upper|full|the|a|an|his|her)\s*$",
                                               p[:m.start()]) or re.match(r"body (?:of|part|parts|heat|weight|type|armor|shape|size|mass|language|fluids?|temperature|replacements?)\b", p[m.start():])):
            continue  # (`your physical body`, `the body`, `a lower body replacement`: no attribute)
        if m.group(1) == "magic" and re.match(r"magic(?:al)? (?:items?|tests?|skills?|spells?|resistance)", p[m.start():]):
            continue
        if m.group(1) == "reaction" and (re.search(r"\b(?:allergic|immune|chemical|bad|negative|emotional|a|an)\s*$", p[:m.start()])
                                         or re.match(r"reactions? (?:to|from|of)\b", p[m.start():])):
            continue  # (`the allergic reaction`: no attribute)
        add(f"attr:{ATTRIBUTES[m.group(1)]}", m.start(), m.end())
    # (`Athletics tests related to balance, climbing`: the specializations limit the skill named with them)
    return [(t, w) for t, w in out if w or not any(t2 == t and w2 for t2, w2 in out)]


# ---------- values ----------
_NUM = r"[+-]?\s?\d+(?:\.\d+)?"


def number(s):
    s = (s or "").strip().casefold()
    s = NUMBERS.get(s, s)
    m = re.fullmatch(r"([+-])?\s?(\d+(?:\.\d+)?)", s)
    return (("-" if m.group(1) == "-" else "") + m.group(2)) if m else None


# a sentence that limits the effects of the one before (`This bonus only applies while the user is jumped-in`, `The +2 Agility is only active while …`)
_NARROW = re.compile(r"^\W*(?:this|these|that|the|they|it|its|such|all)\b[^.;]{0,60}?\b(?:only (?:appl(?:y|ies)|works?|counts?|functions?)|(?:is|are) only (?:active|in effect|applicable))\s+"
                     r"(?P<q>(?!to (?:you|them|him|her|the user|the character)\b)(?:to|when|whenever|while|if|during|against|in|on|for|within|as long as)\b[^.;]*)", re.I)
_ALWAYS = re.compile(r"\b(?:at all times|always|permanent\w*)\b", re.I)  # (what holds whether the thing is activated or not)
_PER_LEVEL = re.compile(r"\b(?:per|each|every|for each|for every)\s+(?:level|rank|rating|point of (?:rating|force)|rating point|grade)\b(?! of (?:wound|injury) penalt)|"
                        r"\b(?:level|rating) of (?:this|the)\b", re.I)
_NOT_A_THING = r"(?!(?:levels?|ranks?|ratings?|points?|grades?|hits?|net|full|whole|successe?s?|rounds?|turns?|scenes?|hours?|minutes?|days?|weeks?|months?|years?|seconds?|times?)\b)"
# a value per something that is not the rating (`for each pair of cyberlimbs`, `for every 5 crew`, `each level of wound penalty`, `each drone beyond the first`)
_PER_THING = re.compile(r"\b(?:per|for each|for every|each|every) (?P<x>pair of (?:[a-z-]+ ){0,2}?[a-z-]+s\b|(?:two|three|four|five|six|ten|\d+) (?:additional |extra |full |whole )?" + _NOT_A_THING + r"[a-z-]+|"
                        r"(?:level|rank)s? of (?:wound|injury) penalt\w*|(?:additional |extra )?" + _NOT_A_THING + r"[a-z-]+ beyond the first)", re.I)
_PER_LEVELS = re.compile(r"\b(?:for )?every (?P<n>two|three|four|\d) (?:levels|ranks|rating points|points of rating)\b", re.I)


def _rated(sentence, value, at=None):
    """`R` / `R*N` when the sentence gives the value per level or rating (`for each level`, `per rating point`); `R/N`
    with the book's rounding when it gives it per several levels (`+1 … for every two levels (round up)`). With `at`
    (where the value sits), the phrase of the value's own clause counts first: `+1 to AR per level, and +1 to DV for
    every two levels` is `R` and `R/2`; `For each level, add a die and increase Reaction by 1` is `R` for both."""
    clause = re.split(r"[;]|,\s+and\b", sentence[at:], maxsplit=1)[0] if at is not None else ""
    for text in ((clause, sentence) if at is not None else (sentence,)):
        if (m := _PER_LEVELS.search(text)) and (text is clause or not _PER_LEVEL.search(text) and not _PER_RATED.search(text)):
            n = NUMBERS.get(m.group("n").lower(), m.group("n"))
            if value in ("1", "+1", None, "-1"):
                return ("-" if value == "-1" else "") + f"R/{n} {_rounding(sentence)}"
        if _PER_LEVEL.search(text) or _PER_RATED.search(text):
            if value in ("1", "+1", None):
                return "R"
            if value == "-1":
                return "-R"
            if value and re.fullmatch(r"-?\d+(?:\.\d+)?", value):
                return f"R*{value}"
    return value


# ---------- rules ----------
def _sw(s, label=""):
    """(switch, when) of a sentence: how it is turned on, and the condition's words."""
    low = s.casefold()
    lab = label.casefold()
    if "wireless" in lab:
        for m in re.finditer(r"\b(?:if|when|whenever|while|unless|only)\b", low):  # (`increases to +3 if used when prone`: the wireless bonus has its own condition)
            words = _cond_words(s, m.start())
            if words and not _garbled(words) and len(words.split()) >= 3 and not re.match(r"(?:if|when|while) (?:the|this) (?:item|device|system)? ?(?:is|has) wireless", words):
                return "wireless", words
        return "wireless", None
    if "overdrive" in lab:
        return "activated", "overdrive"
    act = None  # (`When performing a verbal attack, gain +1 DV by spending a Minor Action`: activated, and its own condition kept)
    for k, rx in _SWITCH:
        if rx.search(s):
            if k != "activated" or not _SPEND_ACTION.search(s):
                return k, None
            act = rx
            break
    past = 0  # (the end of a clause that is no condition: `even after the critter becomes used to …`, none of its words is one)
    for m in _CONDITION.finditer(low):
        if m.start() < past:
            continue
        words = _cond_words(s, m.start()) or ""
        if act and (act.search(words) or re.match(r"(?:with|as|spend(?:ing)?|takes?|using) an? (?:minor|major) action", m.group(0)) or _garbled(words) or re.fullmatch(r"(?:in|your|their) animal form", m.group(0))):
            continue  # (`When this power is activated`, `spending a Minor Action`: the switch, not a condition)
        pre = low[max(0, m.start() - 30):m.start()]
        if re.search(r"\beven\s*$", pre) or (m.group(0) == "if" and re.search(r"\b(?:tell|see|determine|know|learn|check|decide|ask|find out|discover|judge|detect|notice|wonder)\s*$", pre)) \
                or re.match(r"while also\b|while (?:the )?[a-z]+ (?:is|are) (?:listed|given|shown|priced|printed|noted)\b", words) \
                or (not act and re.fullmatch(r"as an? (?:minor|major) action", m.group(0))):
            past = m.start() + len(words)
            continue  # (`even when …`, `tests to determine if …`, `…, while also lacing …`, `While costs are listed for single tusks, …`, `Observe in Detail as a Minor Action`: no condition on the effect)
        if re.match(r"(?:when|if|once) (?:this|the) [a-z]+ is (?:taken|chosen|selected|purchased|bought)\b", words) \
                or re.match(r"(?:when|if|once|whenever) you (?:take|have|choose|select|buy|purchase|acquire|install|get) (?:this|the) [a-z]+\s*$", words):
            continue  # (`When this way is taken`, `If you take this quality`: the entry itself)
        if re.fullmatch(r"(?:in|your|their) animal form", m.group(0)):
            return "conditional", "animal form"  # (`Your animal form gains +1 Strength`: the form, not the sentence)
        if words and (bad := _garbled(words)):
            if bad == "flavor":
                continue  # (`if 15 nuyen`, `only for it to look at you with disdain?`: flavor, no condition)
            return "conditional", None  # (`only) no`, `resist the`: a cut-off stub, a condition the reader cannot state: conditional, never always on)
        if m.group(0) == "used" and not re.match(r"used (?:with|against|when|while|on an?|as part|for|to)\b", words):
            continue  # (`used across the world`, `used by budget security guards`: flavor, no condition; `used to discover the quality` is one)
        if m.group(0) == "only" and re.search(r"\brange\w*\s*$", low[:m.start()]):
            continue  # (`+2 AR at Close range only`: the band the number is for, no condition)
        if m.group(0) == "only" and re.search(r"\b(?:can|may|must|should|could|will)\s*$", low[:m.start()]) or words == "used":
            continue  # (`that can only be spent on …`, `each time it is used`: no condition on the effect)
        if (re.match(r"(?:when|whenever|while|if) (?:you |they |the (?:character|user|adept) )?(?:are |is )?(?:perform|mak|us|roll|attempt|tak|do)\w* (?:an? |any |all |the |your |their )?(?:(?!\b(?:on|against|using|with|by|of|for|(?:this|that)(?! tests?\b))\b)[a-z', ()-])*?\b(?:tests?|checks?|rolls?|skill|actions?)\s*(?:\((?:see )?p\.[^)]*\)|\([a-z ]+ \+ [a-z ]+\))?\s*$", words)
                or re.fullmatch(r"(?:when|whenever|while|if) (?:you are |they are )?targeted by (?:a |any )?spells?", words)) \
                and (targets(words) or _activity(words)):
            continue  # (`When performing a Juryrigging test`: which test, not a condition; `… tests to recognize people` is one)
        w1 = words.split(",")[0]  # (a list's first item: `involving combat, stealth, or social situations` is a condition, combat no test)
        if (m.group(0) in ("involving", "related to", "that use", "used") or "involve" in m.group(0)) and \
                (targets(w1 if "involve" in m.group(0) else low[max(0, m.start() - 8):m.start()] + w1)
                 or any(re.search(rf"\b(?:{rx})\b", w1) for rx, _ in ACTIVITIES)):
            continue  # (`tests involving grappling`, `… one of the four physical attributes`: which tests, not a condition)
        return ("activated" if act else "conditional"), words
    return ("activated" if act else None), None


def _garbled(words):
    """`flavor` for a condition's words that are a question or a price, `stub` for a cut-off one (an unbalanced close, or a bare two or three words ending on
    an article or preposition: a long clause ending `… tuned for` is whole, _cond_words cuts its own at twelve words), else None."""
    if "?" in words or re.search(r"\b(?:if|when|while|only)\s+\d+\s*(?:nuyen|¥|karma|%)", words):
        return "flavor"
    if re.match(r"(?:only|if|when|while)\)", words) or (len(words.split()) <= 3 and re.search(r"\b(?:the|a|an|of|to|for|and|or|with|as|than|that|which)$", words)):
        return "stub"  # ("jumped in", "logged on": a particle, not a dangling preposition)
    return None


# a serial list going on past a comma: `, security, or law enforcement personnel`, `, or from, a rural setting`; an item opening with a pronoun or
# a verb is a new clause (`, they gain`, `, and is reduced`), not the list's
_ITEM = r"(?!(?:you|they|he|she|it|we|this|these|those|which|who|then|also|but|so|gains?|receives?|gets?|grants?|adds?|suffers?|may|can|cannot|must|will|is|are|was|were|has|have|does|do|increas\w*|reduc\w*)\b)[a-z][a-z'-]*"
_MORE = r"(?:\s+(?!(?:and|or|nor)\b)" + _ITEM + r"){0,3}"  # (an item's next words: `law enforcement personnel`, not `… personnel and the user`)
_LIST_ON = re.compile(r",\s+(?:(?:or|and)\s+[a-z]+,\s+" + _ITEM + _MORE + r"|(?:" + _ITEM + _MORE + r",\s+){1,4}?(?:or|and)\s+" + _ITEM + _MORE + r")", re.I)
# a new subject after a list, with no comma: `… law enforcement personnel and the user gains +1 Reaction` (the list's condition ends there)
_NEW_SUBJECT = re.compile(r"\s+(?:and|but)\s+(?:(?:the|a|an|his|her|their|its|your)\s+[a-z-]+(?:\s+[a-z-]+)?|you|they|he|she|it)\s+(?:also\s+)?"
                          r"(?:[a-z]+s|can|may|must|will|gain|get|receive|suffer|take|lose|add)\b", re.I)


def _cond_words(s, at):
    """The condition's words: its clause from the condition word (`when you can be smelled`), up to twelve words (no more of the book than that)."""
    clause = re.split(r"[;:]|(?<!\bMr)(?<!\bMrs)(?<!\bMs)(?<!\bDr)(?<!\bSt)\.", re.sub(r"\s*\((?:see )?pp?\.[^)]*\)", "", s[at:]), maxsplit=1)[0]  # (less a page citation)
    c, first, cap = -1, None, 12
    while (c := clause.find(",", c + 1)) >= 0 and (m := _LIST_ON.match(clause, c)):
        first, cap = c if first is None else first, max(cap, len(clause[:m.end()].split()))
        c = m.end() - 1  # (a list goes on past its commas: `military, security, or law enforcement personnel`, `living in, or from, a rural setting`)
    if cap > 16:  # (a list too long to state: its first item, as before)
        c, cap = first, 12
    clause = clause[:c] if c >= 0 else clause
    clause = _NEW_SUBJECT.split(clause, maxsplit=1)[0]  # (`… or Seoulpa Ring members and the user gains +1 Reaction`: a new subject, a new clause)
    clause = re.split(r"(?<=[a-z0-9)]) (?=(?:Sometimes|Starting|Considered|The|This|These|It|You|They|There|However|Additionally|Also|Each|Every|Unlike)\b)", clause, maxsplit=1)[0]  # (a sentence run into this one with no full stop: `… firing two or more barrels Sometimes you just need …`)
    words = " ".join(clause.split()[:cap]).strip(" ,").lower()
    cut = re.split(r"\s+and (?:suffer|cannot|can't|lose|take)\b|\s+(?:suffers?|gains?|receives?|may add|may not)\b", words)[0]  # (`while moving faster … and suffer a -1 penalty`: the penalty is the effect)
    words = re.sub(r"\s+(?:you|they|he|she|it)$", "", cut) if cut != words else words  # (`once per game session you may add …`)
    if words.count(")") > words.count("("):  # (a close with no open: the clause began inside a parenthesis, `… the allergen)`)
        words = words.rstrip(") ")
    if words.count("(") > words.count(")"):  # (cut inside a parenthesis: `… a tense situation (only`: without the open one)
        words = words[:words.rfind("(")].strip()
    if len(clause.split()) > cap:  # (cut at twelve words: not on a dangling article or preposition)
        words = re.sub(r"(?:\s+(?:the|a|an|of|to|for|and|or|with|in|on|at|by|as|than|that|which))+$", "", words)
    return words or None


def _fx(target, op, value, switch=None, when=None, spec=None, low=False):
    """One effect. A switch (wireless, activated, sustained, conditional) is how it is turned on: it counts in the
    bracketed total (owner decision 2026-10-10); `low` (a conditional one whose condition has no words, a formula per
    point of something) is shown, never applied."""
    a = {"target": target, "op": op, "value": value}
    if low or (switch == "conditional" and not when and not spec):
        a["confidence"] = "low"
    if switch:
        a["switch"] = switch
    if when:
        a["when"] = when
    if spec:
        a["spec"] = spec
    return ("effect", a, None)


_TGT_END = r"(?=[.;:]|\s(?:but|and (?:gain|receive|add|increase|the|you|it|a|an)\b|which|while|when|if|as long|for (?:the|a|one|\d) (?:duration|minute|hour|round|turn)|until|unless|with the exception)\b|$)"
_PHRASE = r"((?:[^.;:](?!\s(?:but|which|until|unless)\b))+?)" + _TGT_END


def split_cost(cost):
    """An adept power's two prices (`Combat skill: 1.0 PP per level; other skills 0.5 PP per level`, Improved Ability, CRB
    Hong Kong p. 157): {"cost": the other skills', "costCombat": the combat skill's}; {} for one price."""
    c = re.search(r"\bcombat skills?\s*:?\s*([\d.]+)\s*(?:PP|power\s+points?)", cost or "", re.I)
    o = re.search(r"\bother skills?\s*:?\s*([\d.]+)\s*(?:PP|power\s+points?)", cost or "", re.I)
    return {"cost": o.group(1), "costCombat": c.group(1)} if c and o else {}
_USE_OR_LOSE = re.compile(r",?\s*(?:(?:that|which) must be (?:immediately )?(?:spent|used)[^.;]*?(?=,? or (?:else )?(?:it|the point|that point)|[.;]|$)|"
                          r"(?:,? or (?:else )?)?(?:it|the (?:edge )?point|that point) (?:goes away|vanishes|is lost|disappears)[^.;]*|"
                          r"(?:but )?if (?:you|they) do not (?:use|spend) (?:it|the edge|that edge|the point|the bonus)[^.;]*|but the edge(?: point)? is lost if[^.;]*|if not used[^.;]*)", re.I)


def _source_ids():
    """The ids of the sources the importer has a recipe for (`crb`, `swc` …): the prefix of an entry's id."""
    from importer.sr6.recipes import RECIPES
    return {str(getattr(r, "ID", "")).lower() for r in RECIPES} - {""}


def _keep_on(m):
    """What a use-it-or-lose-it clause leaves: the tests it names (`that must be used on that test or it is lost`: ` on that test`)."""
    on = re.search(r"\bon(?: \w+,?){1,6}\s*$", m.group(0)) if re.match(r"[\s,]*(?:that|which) must be", m.group(0), re.I) else None
    return " " + on.group(0) if on else ""


_PER_RATED = re.compile(r"\b(?:per|each|every|for each|for every)\s+(?:rating )?(?:point|level|rank)s? of (?:this|the|its|their) (?:[a-z-]+ )?(?:mod|modification|augmentation|quality|power|implant|system|item|echo|metamagic|codemod|rating|level)\b|"
                        r"\b(?:per|each|every) (?:point of )?(?:[a-z-]+ ){0,3}?rating\b", re.I)


_RESIST_OF = re.compile(r"\bresistan(?:t|ce) to (?P<obj>(?:ingested|inhaled|injected|contact|airborne|dermal|certain|specific|natural|magical|[a-z]+-based) [^,;.]+?)(?=,|;|\.|\s+(?:gaining|giving|granting|and gain)\b|$)", re.I)
_LEVELS_AFTER_FIRST = re.compile(r"\beach level\b(?: of [\w' -]+?)? after the first(?: one)? (?:grants?|gives?|adds?) (?:an? )?\+?(?P<v>\d+) (?:dice pool )?(?:modifier|bonus|dice|die) (?:for|on|to) (?:such|those|these) tests", re.I)
_REMOVED_BAND = re.compile(r"\bremoves? the longest[- ]range attack rating\b", re.I)
_STATED = re.compile(r"\b(?P<t>(?:" + "|".join(sorted(MATRIX, key=len, reverse=True)) + r"|device rating|" + "|".join(ATTRIBUTES) + r")) (?P<v>\d+)\b", re.I)
_BACK_REF = re.compile(r"^\W*(?:its|this|the|that) (?P<t>[a-z][a-z ]{2,30}?)(?: attribute| rating| bonus)? (?:is|are) (?:cumulative with|added to|stacks? with|in addition to)\b", re.I)
_ROUNDING = re.compile(r"\b(?:round(?:ed|ing)? (?P<dir>down|up)|(?P<dir2>drop|ignore) (?:any |the )?(?:fraction|remainder)s?)\b", re.I)


_SITUATION_WORDS = re.compile(r"\b(?:time|nature|distance|light|visibility|range|condition|situation|since|terrain|weather|environment)\b", re.I)


def _situations(text):
    """The text less its tables of `DICE POOL MODIFIER`s by situation (a header with that phrase whose first column names a
    situation, or whose rows name no test or skill): the gamemaster's, no flat effect of the entry. A table whose first column
    is a mode or a kind, with a test in a cell, is the entry's own."""
    lines, out, i = (text or "").split("\n"), [], 0
    while i < len(lines):
        if lines[i].startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*:?-", lines[i + 1]) and re.search(r"dice pool modifiers?", lines[i], re.I):
            j = i + 2
            while j < len(lines) and lines[j].startswith("|"):
                j += 1
            first = lines[i].strip().strip("|").split("|")[0]
            body = " ".join(lines[i + 2:j])
            if _SITUATION_WORDS.search(first) or not re.search(r"\btests?\b|\bchecks?\b|\b(?:" + "|".join(SKILLS) + r")\b", body, re.I):
                i = j
                continue
        out.append(lines[i])
        i += 1
    return "\n".join(out)


def _armor_performance(sentence, armor):
    """The Acceleration or Top Speed a foundation's armor costs (`Every two points of standard armor added over the original armor
    rating reduces the vehicle's Acceleration by one meter per combat round`, Double Clutch p. 133): `-R*0.5`; None for a sentence
    about another armor or no such rule."""
    m = re.search(r"\bevery (?P<n>\w+) points? of (?P<a>[a-z ]+?) added over the original armor rating reduces? the vehicle.s (?P<s>acceleration|top speed) by (?P<m>\w+)",
                  _norm(sentence).casefold())
    n, k = (number(m.group("n")), number(m.group("m"))) if m else (None, None)
    if not (m and n and k and float(n) and _key(m.group("a")) == armor):
        return None
    return _fx("item:" + m.group("s").replace(" ", "-"), "add", "-R*" + f"{float(k) / float(n):g}")


_NATURAL_KINDS = {"augmentations", "qualities", "critterpowers", "martialtechniques", "spells", "metamagics"}  # (a spell hardening the fists, `Stone Fist`)
_NATURAL = re.compile(r"\b(?:unarmed|natural weapons?|close combat|melee attacks?|kicks?|claws?|bites?|horns?|tusks?|spikes?|thorns?|fangs?|punch\w*|fists?|limbs?|leaps?)\b", re.I)
# (what is no natural weapon's in any entry: another kind of item)
_NOT_NATURAL = re.compile(r"\b(?:firearms?|guns?|pistols?|rifles?|drones?|vehicles?|ammunition|swords?|knives|knife|clubs?|blades?|axes?|polearms?|thrown|weapon accessor\w*|melee weapons?)\b", re.I)
# (a weapon the character holds, `a favoured weapon`, `this weapon's AR`: an item's in an entry that is not a natural weapon; `wielding`: both)
_HELD = re.compile(r"(?<!natural )\bweapons?\b|(?<!natural )\bweapon['’]s\b", re.I)
_WIELD = re.compile(r"\bwield\w*", re.I)
# (an entry that IS a natural weapon: its AR and DV are the unarmed attack's, `That weapon gains +2 Attack Rating` is the natural weapon)
_NATURAL_NAME = re.compile(r"\b(?:natural weapons?|horns?|tusks?|claws?|bites?|spurs?|spikes?|fangs?|thorns?|quills?|stingers?)\b", re.I)


def _natural_entry(text, kind, name, cls):
    return bool("BIOWARE_WEAPON" in (cls or "") or _NATURAL_NAME.search(name or "")
                or (kind in ("critterpowers", "qualities") and re.search(r"\b(?:choose|select|pick) (?:an? |one )?natural weapons?\b|\bthis natural weapon\b", text or "", re.I)))


_EDGE_SET = re.compile(r"[•\s]*(?P<n>[A-Z][\w’' !-]+?)(?: (?P<w0>only on [A-Za-z ]+?))? \((?P<v>\d+)(?:,\s*\d+)*(?:,? or \d+)?(?:(?: (?:Edge|Karma))(?: (?P<w1>only [^)]*))?\)|\) Edge)(?: (?P<w2>(?:only )?on [^.]*))?.*")


# two bonuses in a sentence, each with tests of its own (`+2 dice for Firearms tests and +1 die on tests to spot snipers`): each its own clause, its own condition
_TWO_BONUSES = re.compile(r"(?<=\btests)\s+and\s+(?=[+-]\s?\d+\s+(?:[a-z-]+\s+){0,3}?(?:dice|die|bonus|modifier|penalty)\b[^.;]*\btests?\b)|"
                          r"(?<=\btests)\s*[;,]\s+and\s+(?=[+-]\s?\d+\s+(?:[a-z-]+\s+){0,3}?(?:dice|die|bonus|modifier|penalty)\b[^.;]*\btests?\b)", re.I)


_EDGE_SPLIT = re.compile(r",?\s+(?:but|and|while|whereas)\s+(?=[^.;]*\bedge\b)|;\s+(?=[^.]*\bedge\b)|,\s+(?:and\s+)?(?=(?:offers?|provides?|gives?|grants?)\b[^.;]*\bedge\b)", re.I)


def _clauses(s):
    """The sentence as the clauses that each carry a bonus and the tests it is for: a split at `… tests and +1 die on … tests`, or between an Edge
    that is someone else's and one that is the owner's (`Opponents gain a point of Edge against you, but you gain one on Defense tests`); else the sentence."""
    if len(re.findall(r"\bedge\b", s, re.I)) >= 2:
        parts = [p for p in _EDGE_SPLIT.split(s) if p.strip()]
        if len(parts) > 1 and (any(_EDGE_OTHERS.search(p) for p in parts) and any(re.search(r"\bedge\b", p, re.I) and not _EDGE_OTHERS.search(p) for p in parts)
                               or re.search(r",\s+(?:and\s+)?(?:offers?|provides?|gives?|grants?)\b", s)):
            lead = re.match(r"\W*((?:if|when|whenever|while|once|as long as)\b[^,;]*),\s+", s, re.I)  # (`If you engage in a Teamwork test, no one can spend Edge, and the opposing individual gains …`: the condition holds for both)
            return parts[:1] + [p if not lead or _CONDITION.search(p.casefold()) else lead.group(1) + ", " + p for p in parts[1:]]
    if len(re.findall(r"(?<![\w/])[+-]\s?\d+\b", s)) < 2:
        return [s]
    parts = _TWO_BONUSES.split(s)
    return [p for p in parts if p.strip()] if len(parts) > 1 else [s]


def _qualified(s, kind):
    """The words after the test name, up to the verb, that limit the effect to what they name (`Edge on Con tests to blend in`, `tests made in your
    Home Ground gain an Edge`, `Survival tests in frigid environments`, `tests versus inhaled toxins`), or None."""
    if not (qual := _QUALIFIER.search(s)):
        return None
    q_, e_ = qual.group("q"), qual.end("q")
    while (lm := _LIST_ON.match(s, e_)) and not _NEW_SUBJECT.match(s, e_) and (nx := re.match(r"[^.;,]*", _NEW_SUBJECT.split(s[lm.end():], maxsplit=1)[0])):
        q_, e_ = q_ + s[e_:lm.end()] + nx.group(0), lm.end() + nx.end()  # (`with military, security, or law enforcement personnel`: the whole list)
    q_ = re.split(r"\s+(?:gains?|receives?|gets?|grants?|for use on)\b", q_, maxsplit=1)[0].strip(" ,")
    # (the tests are named before it, `Con (Disguise) tests to hide their metatype`: what follows limits them, whatever words it holds)
    head_ = any(t.startswith(("skill:", "test:", "derived:", "action:")) for t, _ in targets(re.split(r"\b(?:gains?|receives?|gets?|grants?|adds?|provides?)\b", s[:qual.start("q")])[-1], kind))
    limiter_ = re.match(r"to resist\b", q_ or "") and not re.fullmatch(r"to resist (?:all |any |the )?(?:(?:physical|stun|matrix) )?(?:damage|drain|fading|toxins?|spells?|magic|attacks?)", re.sub(r"\s*\([^)]*\)", "", q_))  # (`rolls to resist cold-based attacks`)
    if re.match(r"(?:related|relating|pertaining) to\b", q_ or "") and (targets(q_, kind) or _activity(q_)):
        return None  # (`tests related to balance`: the specialization, not a limit)
    if q_ and ((not targets(q_, kind) and not _activity(q_)) or head_ or limiter_) and re.search(r"\b(?:edge|dice|die|bonus|modifier|penalty|(?:gain|spend)\w*)\b|[+-]\s?\d", s, re.I):
        return " ".join(q_.split()[:12]).casefold()
    return None


# where a sentence's clauses meet: `, while|whereas …`; `, and|but|or …` opening a clause (`, and you gain`, `, and an additional two Minor Actions`,
# `, or +2 DV`), not a list's last item (`Stealth, Piloting, and Navigation tests`); a dash; `… and provides|can|gains …` (a second verb of the subject)
_SUB_SPLIT = re.compile(r"(?<=, )(?=(?:while|whereas)\b|(?:and|but|or) (?:a|an|the|this|that|these|those|you|they|he|she|it|its|their|his|her|your|if|when|whenever|while|also|then|"
                        r"can|may|must|cannot|will|is|are|has|have|gains?|grants?|provides?|adds?|receives?|suffers?|each|every|any|all|no|in|on|one|two|three|four|[+-]?\s?\d)\b)|"
                        r"(?<=[a-z][—–])(?=[a-z])|(?<=[a-z] [—–-] )(?=[a-z])|(?<=[a-z0-9)] )(?=and (?:(?:the|this|that|its|their|your|his|her) [a-z-]+ (?:[a-z-]+ )?|you |they |he |she |it )?(?:also )?"
                        r"(?:can|may|will|must|gains?|gets?|creates?|provides?|grants?|receives?|adds?|offers?)\b)", re.I)


def _scoped(got, s, kind, label, when, rules):
    """The sentence's condition on its effects, each from its own clause: `+2 Reaction, +2 Agility, and two additional Minor Actions that
    involve physical movement` limits the Minor Actions only. An effect's clause is the first of the sentence's clauses (`_SUB_SPLIT`) that
    states it read alone (`rules`); a clause stating none that opens with a condition or `but` (`…, while jumped in`, `…, but it is limited to
    blades`) is the clause before's. The condition stays when it is in a sentence-initial condition clause (`During this phase, …`), the effect's
    own clause, or a clause before it that states nothing (`… brought low when the drug wears off, and the user suffers -1 Willpower`), or
    when the effect's clause points back to it (`…, and you gain +1 DV to those attacks`); else the effect takes its own clause's condition, or none."""
    n = " ".join(s.split())
    at = n.casefold().find(when)
    lead = _CONDITION.match(n, len(n) - len(n.lstrip("•*- "))) and re.match(r"[^,;]*,\s+", n)
    start = lead.end() if lead else 0
    if at < start:  # (not found: -1)
        return got
    cuts = sorted({start} | {m.start() for m in _SUB_SPLIT.finditer(n) if m.start() > start})
    parts = []  # [(start, end, text, {(target, op, value)})]
    for a, b in zip(cuts, cuts[1:] + [len(n)]):
        t = n[a:b].strip(" ,;—–-")
        fx = {(x[1]["target"], x[1]["op"], x[1]["value"]) for x in rules(t) if x[0] == "effect"}
        if parts and not fx and re.match(r"but\b|" + _CONDITION.pattern, re.sub(r"^(?:and|or) ", "", t.casefold())):
            parts[-1] = (parts[-1][0], b, n[parts[-1][0]:b].strip(" ,;—–-"), parts[-1][3])
        else:
            parts.append((a, b, t, fx))
    cond = next((p for p in parts if p[0] <= at < p[1]), None)
    if len(parts) < 2 or cond is None:
        return got
    for x in got:
        if x[0] != "effect" or x[1].get("when") != when or x[1].get("switch") != "conditional":
            continue
        key = (x[1]["target"], x[1]["op"], x[1]["value"])
        home = next((p for p in parts if key in p[3]), None) or next((p for p in parts if key[:2] in {k[:2] for k in p[3]}), None)
        if home is None or home is cond or cond[0] < home[0] and (not cond[3] or re.search(r"\b(?:those|these|such|the same)\b", home[2], re.I)):
            continue  # (no clause states it alone; the condition is its own clause's, or a clause's before it that states nothing; `those attacks`)
        sw2, w2 = _sw(home[2], label)
        if sw2 is None:
            w2 = _qualified(home[2], kind)
        elif sw2 != "conditional":
            continue  # (a switch of its own: left as the sentence reads it)
        if w2:
            x[1]["when"] = w2
        else:
            x[1].pop("switch"), x[1].pop("when")
    return got


def _unplaced(s, sw, when, kind=None):
    """`-1 dice pool modifier to any fine manipulations using the webbed digits`: a dice modifier on tests the reader knows no target of is
    on `test:other`, the words naming them its condition; on every test or action, `test:all`."""
    out = []
    for m in _DICE_ON.finditer(s):
        v = (m.group("v") or "").replace(" ", "").lstrip("+") or NUMBERS.get((m.group("w") or "").casefold(), "1")
        if re.search(r"penalt", m.group(0), re.I) and not v.startswith("-"):
            v = "-" + v
        words = re.sub(r"\s*\([^)]*\)?", "", m.group("t"))  # (a parenthesis: a citation, an aside)
        words = _LIST_ON.sub(lambda lm: lm.group(0).replace(",", "\0"), words)  # (a list's commas are no clause's end: `people living in, or from, a rural setting`)
        words = re.split(r"\s+and\s+(?=[+-]?\d|one\b|an?\b|you\b|they\b|suffers?\b|takes?\b|the\b)|,\s|;\s|:\s|\s+but\s+", words)[0].replace("\0", ",")  # (the next clause is another effect's)
        words = re.sub(r"^(?:their |your |the )?dice pool\s+", "", words)
        words = re.sub(r"^when (?:making|rolling) (?:any|all) (?:tests?|rolls?)\b", "tests", words)
        words = " ".join(words.split()[:12]).strip(" ,").casefold()
        if targets(words, kind):
            continue  # (the reader names a target for these tests: it read them)
        if (bm := re.match(r"(?:tests?|rolls?|checks?|actions?)\s+(?P<c>(?:while|when|during|until|if)\b.*)$", words)):
            out.append(_fx("test:all", "add", v, "conditional", bm.group("c")))  # (`-6 dice pool modifier to all actions while exposed to the allergen`)
        elif _BARE_TEST.fullmatch(words):
            out.append(_fx("test:all", "add", v, sw, when))
        elif re.match(r"(?:such|those|these|that|this|the same|the above)\b", words):
            continue  # (`for such tests`: the tests of the sentence before, read there)
        else:
            out.append(_fx("test:other", "add", v, sw or "conditional", words if not when or when in words else f"{when}: {words}"))
    return out


_EDGE_OPS = ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die")


def _rounding(sentence):
    """`RD` or `RU`: how the book rounds a formula's result (owner decision 13, 2026-10-11: `(rounded down)` RD,
    `rounded up` RU, silent RU)."""
    m = _ROUNDING.search(sentence)
    return "RD" if m and ((m.group("dir") or "").lower() == "down" or m.group("dir2")) else "RU"


def _mask_not_a_skill(s):
    """`running silent` (a Matrix icon's state) and `the run` (a shadowrun) hold the word of the Running specialization, not the specialization: masked, same length."""
    return re.sub(r"\b(?:running|run) silent(?:ly)?\b|\bsilent running\b|\b(?:the|a|each|every|that|this|during|per) runs?\b(?!\s+(?:tests?|speed|distance))", lambda m: "x" * len(m.group(0)), s)


def _activity(phrase):
    """[(test:other, the words)] for tests a phrase names by activity (`tests involving grappling, escaping bonds`),
    else []."""
    m = re.search(r"\b(?:tests?|checks?|rolls?)\b(?: (?:involving|related to|for|to|made (?:to|for)) (?P<a>[^.;]{3,80}))?", phrase)
    head = " ".join(phrase.split()[:10])
    if not m and any(re.search(rf"\b(?:{rx})\b", _mask_not_a_skill(head)) for rx, _ in ACTIVITIES):
        m = re.match(r"(?P<a>.+)", head.strip())  # (a phrase opening with the activity: `searching for items that glow`)
    if not m:
        return []
    words = (m.group("a") or phrase[:m.start()]).strip(" ,")
    words = re.sub(r"\s*\([^)]*$", "", re.sub(r"^(?:all|any|your|their|the)\s+", "", words)[:70]).strip()  # (an unclosed parenthesis: cut)
    if not words or re.fullmatch(r"(?:that|this|the|it|them|those|these|such|a|an|same|each|every|any|all)(?: (?:test|tests|roll|rolls))?", words):
        return []  # (`that test`: a pronoun, not an activity)
    out = {}
    for rx, skill in ACTIVITIES:  # (the skill each activity is a test of, from the book's skill descriptions)
        for mm in re.finditer(rf"\b(?:{rx})\b", _mask_not_a_skill(words)):
            spec = mm.group(0) if SPECS.get(mm.group(0)) == skill else None
            got = out.setdefault((f"skill:{skill}", spec), [])
            phrase = re.sub(r"\s+(?:or|and)$", "", re.match(r"[^,;]*?(?=\s+(?:or|and)\s|[,;]|$)", words[mm.start():]).group(0).strip())  # (`escaping bonds`)
            if phrase not in got:
                got.append(phrase)
    return [(t, spec, ", ".join(w)) for (t, spec), w in out.items()] or [("test:other", None, words)]


def _val(v, s, at=None):
    v = (v or "").strip().casefold()
    v = "1" if v in ("a", "an") else NUMBERS.get(v, v).replace(" ", "")
    v = v.lstrip("+")
    return _rated(s, v, at)


def _negated(low, at):
    """Whether the clause before `at` denies it (`does not add`, `nor do they add`)."""
    return bool(re.search(r"\b(?:not|nor|never|n't)\b[^.;,]{0,25}$", low[:at]))


def _spec(target, words):
    """A specialization's name (`Climbing`) when the words name one of the target skill's (SPECS), else the words as a
    specialization-like limit (`Etiquette or Negotiation`) on a skill, else None."""
    if not words or not target.startswith("skill:"):
        return None
    words = re.sub(r"\s+(?:or|and)\s+", ", ", words)  # (`Etiquette or Negotiation`: either, listed)
    skill = target[6:]
    # (`Sprint`, `impersonate`, `balancing`: the specialization's own name, the first of SPECS's words for the skill that share its stem)
    words = ", ".join(next((k for k, s_ in SPECS.items() if s_ == skill and re.fullmatch(r"[A-Za-z]{4,}", w) and k.startswith(w.casefold()[:5])), w) for w in words.split(", "))
    return " ".join(w.capitalize() if w not in ("of",) else w for w in words.split())


_BANDS = ("close", "near", "medium", "far", "extreme")
