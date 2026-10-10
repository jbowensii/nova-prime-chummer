"""Effects an entry's prose and tables state (the phase 6 effects grammar): general rules over the sentences, each giving
a target (a path from the character, or the item, to the thing it changes), an operation and a value, how it is
switched on and how sure the reading is. Vocabulary only (the game's words for attributes, skills, test types, derived
values, Matrix attributes and item stats), never an item's name. docs/sr6-data-format.md, "Effects", lists them.

Targets:
- `attr:<abbr>` an attribute (bod … cha, edg, mag, res, ess); `attr-max:<abbr>` its maximum (`attr-max:choice`: the one
  the player picks);
- `skill:<id>` a skill's dice pool (a specialization the effect is limited to: `when`);
- `test:<type>` a test type, shown on every pool it covers (TEST_TYPES: the book's own lists of which skills belong
  to each; `attr-<abbr>` the tests using that attribute; resistance and defense tests);
- `derived:<name>` Defense Rating (`defense`, `defense-astral`, `social`), initiative (`initiative`, `initiative-dice`,
  `matrix-initiative`, `matrix-initiative-dice`), condition monitor boxes (`physical-monitor`, `stun-monitor`,
  `matrix-monitor`, `overflow`), `composure`, `judge-intentions`, `memory`, `lift`, `movement`, `minor-actions`,
  `major-actions`, `hardened-armor`, `damage-reduction`;
- `matrix:<name>` a Matrix attribute (`attack`, `sleaze`, `data-processing`, `firewall`, `choice`) or the Overwatch
  Score (`overwatch`);
- `item:<field>` the item's own stat, or, on an add-on (an accessory, an ammo type, a vehicle mod), the stat of the
  item it fits: `ar` (one value per range band), `dv`, `concealability`, `handling`, `acceleration`,
  `speed-interval`, `top-speed`, `body`, `armor`, `pilot`, `sensor`, `seats`, `size`, `ammo`;
- `action:<name>` an Edge action (its Edge cost);
- `resource:<name>` a creation resource (`contact-points`).

Operations: `add` (+N, or -N), `set` (the value replaces it: an infected type's attribute maximum), `edge` (N bonus
Edge on those tests), `edge-cost` (Edge boosts and actions on them cost N more, -N less), `edge-cost-set` (an Edge
action's new cost), `no-edge` (no Edge may be spent on them), `no-edge-gain` (no Edge may be gained on them),
`wild-die` (a die of the pool is a wild die), `hits` (N extra hits).

Values: a number; `R` (× the line's rating, level or Force: `adds its rating`, `per level`), `R*N`; or a formula over
attributes (`edg/2`: half your Edge, rounded down), which is shown, never applied.

How it is turned on (`switch`): none (always on), `wireless`, `activated` (at will, an action, overdrive), `sustained`,
`conditional` (some tests or situations only). An effect read from a sentence that sets a condition is
`confidence="low"`: shown, never applied (owner decision D3); `when` holds the condition's words (`magician`,
`smell-based`, `in VR`).

Links (owner decision 2026-10-10): an entry that grants another (`gain the Built Tough quality`, `1 free level of Rapid
Healing`) or works as another (`the same result as a Personalized Grip`) holds <link rel="grants|as" kind name>, not a
copy of the other entry's effects: the app uses the linked entry's, so a later correction follows."""
import re

ATTRIBUTES = {"body": "bod", "agility": "agi", "reaction": "rea", "strength": "str", "willpower": "wil", "logic": "log",
              "intuition": "int", "charisma": "cha", "edge": "edg", "magic": "mag", "resonance": "res", "essence": "ess"}
SKILLS = ("astral", "athletics", "biotech", "close combat", "con", "conjuring", "cracking", "electronics", "enchanting",
          "engineering", "exotic weapons", "firearms", "influence", "outdoors", "perception", "piloting", "sorcery",
          "stealth", "tasking")
# The book's own lists of which skills a test type covers (a vocabulary, the same in every book): Social tests are the
# ones that influence or con someone (CRB p. 97, Social Test Edge); Matrix tests are Matrix actions (CRB p. 179,
# Cracking and Electronics); magical tests the magic skills (CRB p. 127); a combat test an attack with a weapon skill.
# Physical, mental and attribute tests take the skills linked to those attributes (the skills catalog's attr).
TEST_TYPES = {"social": ("con", "influence"), "matrix": ("cracking", "electronics"),
              "magic": ("astral", "conjuring", "enchanting", "sorcery"), "resonance": ("tasking",),
              "combat": ("close-combat", "exotic-weapons", "firearms"), "vehicle": ("piloting",),
              "physical": ("bod", "agi", "rea", "str"), "mental": ("wil", "log", "int", "cha")}
# words of a specialization -> its skill (CRB's skill chapter): `Athletics (Climbing)`, `climbing tests`
SPECS = {"climbing": "athletics", "gymnastics": "athletics", "running": "athletics", "swimming": "athletics",
         "jumping": "athletics", "throwing": "athletics", "flight": "athletics", "balance": "athletics",
         "sprinting": "athletics", "acting": "con", "disguise": "con", "impersonation": "con", "performance": "con",
         "etiquette": "influence", "negotiation": "influence", "intimidation": "influence", "instruction": "influence",
         "leadership": "influence", "lockpicking": "engineering", "gunnery": "engineering", "palming": "stealth",
         "sneaking": "stealth", "camouflage": "stealth", "disguising": "stealth", "navigation": "outdoors",
         "tracking": "outdoors", "survival": "outdoors", "first aid": "biotech", "medicine": "biotech",
         "electronic warfare": "cracking", "hacking": "cracking", "blades": "close-combat", "clubs": "close-combat",
         "unarmed": "close-combat", "unarmed combat": "close-combat", "spellcasting": "sorcery", "counterspelling": "sorcery",
         "summoning": "conjuring", "banishing": "conjuring", "alchemy": "enchanting", "artificing": "enchanting",
         "disenchanting": "enchanting", "compiling": "tasking", "registering": "tasking", "decompiling": "tasking",
         "ground craft": "piloting", "aircraft": "piloting", "watercraft": "piloting", "visual": "perception",
         "aural": "perception", "tactile": "perception", "scent": "perception", "taste": "perception",
         "astral combat": "astral", "assensing": "astral", "repair": "engineering", "jump": "athletics",
         "climb": "athletics", "swim": "athletics", "lock picking": "engineering", "sleight-of-hand": "stealth",
         "sleight of hand": "stealth", "hearing": "perception", "sight": "perception", "smell": "perception", "impersonate": "con", "impersonating": "con", "disguising": "con", "pickpocket": "stealth", "picking pockets": "stealth", "falling": "athletics"}
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
DERIVED = {"defense rating": "defense", "astral defense rating": "defense-astral", "social defense rating": "social",
           "social rating": "social", "composure": "composure", "judge intentions": "judge-intentions",
           "memory": "memory", "lift": "lift", "lift/carry": "lift"}
MATRIX = {"data processing": "data-processing", "firewall": "firewall", "sleaze": "sleaze", "attack attribute": "attack",
          "matrix attack": "attack"}
ITEM = {"attack ratings": "ar", "attack rating": "ar", "ar": "ar", "damage value": "dv", "dv": "dv",
        "concealability threshold": "concealability", "concealability": "concealability", "handling": "handling",
        "acceleration": "acceleration", "speed interval": "speed-interval", "top speed": "top-speed",
        "size class": "size", "seat": "seats", "seats": "seats", "pilot rating": "pilot", "pilot": "pilot",
        "sensor rating": "sensor", "sensor": "sensor", "body value": "body", "armor value": "armor"}
VEHICLE_KINDS = {"vehicles", "vehicledesign"}
ITEM_KINDS = {"weapons", "armor", "gear", "electronics", "augmentations", "vehicles", "vehicledesign", "ammotypes", "programs"}
NUMBERS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
           "eight": "8", "nine": "9", "ten": "10", "single": "1"}
_CONDITION = re.compile(r"\b(?:when|whenever|while|if|unless|at will|only|as long as|in (?:any )?(?:form of )?(?:close combat|melee|combat)|(?:with|as|spend(?:ing)?|takes?|using) an? (?:minor|major) action|involving|"
                        r"related to|against|during|in (?:vr|the presence)|that use|used)\b", re.I)
_SWITCH = (("wireless", re.compile(r"\bwireless\b", re.I)), ("sustained", re.compile(r"\bsustain(?:s|ed|ing)?\b", re.I)),
           ("activated", re.compile(r"\b(?:at will|activat\w*|(?:minor|major) action to|with an? (?:minor|major) action|turn(?:s|ed)? (?:on|off)|"
                                    r"overdrive|while active|is active)\b", re.I)))
ROLES = {"magician": "magician", "magicians": "magician", "adept": "adept", "adepts": "adept"}


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.casefold()).strip("-")


def _norm(s):
    s = (s or "").replace("\u00ad", "").replace("’", "'").replace("–", "-").replace("—", "-").replace("−", "-")
    s = re.sub(r"(?<=[a-z])-\s+(?=[a-z])", "", s)  # (`De- fense`)
    s = re.sub(r"(?<=/)\s*([+-])\s+(?=\d)", r"\1", s)  # (`–4/–5/– 4/+3`: a band's sign set apart)
    return " ".join(s.split())


def sentences(text):
    """The text's sentences, a labelled line (`**Wireless bonus:** …`, `All: …`) and a list line each on its own."""
    out = []
    for para in re.split(r"\n(?=\s*(?:[•*]|\*\*[^*]+:\*\*|[A-Z][\w ]{1,30}:\s))|\n\s*\n", text or ""):
        one = _norm(para.replace("**", ""))
        out += [s for s in re.split(r"(?<=[.!?])\s+(?=[A-Z(•])", one) if s.strip()]
    return out


# ---------- targets: a phrase -> [(target, when)] ----------
_ATTR_RX = "|".join(ATTRIBUTES)
_SKILL_RX = "|".join(sorted(SKILLS, key=len, reverse=True))
_TEST_WORDS = [  # (pattern, target): the test types a phrase names, longest first
    (r"damage resistance|resist(?:ing|s)? (?:physical |stun )?damage|soak(?:ing)? damage|soak(?:ing)?\b", "test:damage-resistance"),
    (r"drain(?: resistance)?|resist(?:ing)? drain", "test:drain-resistance"),
    (r"(?:toxin|poison|drug|pathogen|disease)s?(?: resistance)?|resist(?:ing)? (?:toxins?|poisons?|drugs?|pathogens?|diseases?)",
     "test:toxin-resistance"),
    (r"fatigue", "test:fatigue-resistance"),
    (r"defen[cs]e tests?|defensive tests?|defending|defense pools?", "test:defense"),
    (r"social (?:tests?|interactions?|situations?|skill tests?|encounters?|actions?|checks?)|social\b", "test:social"),
    (r"addiction tests?", "test:addiction"),
    (r"magic(?:al)? resistance tests?|spell resistance|resist(?:ing|s)? (?:all |any )?(?:spells?|magic)\b", "test:magic-resistance"),
    (r"resist(?:ing|s)? (?:all |any )?[a-z]+(?:-based)? (?:attacks?|damage)", "test:damage-resistance"),
    (r"matrix (?:tests?|actions?|searche?s?|perception)", "test:matrix"),
    (r"(?:magic(?:al)?|magic skill) tests?", "test:magic"),
    (r"physical (?:tests?|activities|activity|skills?)", "test:physical"),
    (r"mental (?:tests?|skills?)", "test:mental"),
    (r"(?<!close )(?:attack|combat) tests?", "test:combat"),
    (r"surprise tests?", "test:surprise"),
    (r"crash tests?", "test:crash"),
]


def targets(phrase, kind=None):
    """[(target, when)] the phrase names, in order: attributes, skills (with a specialization), test types, derived
    values, Matrix attributes, item stats. `kind` tells an item's stats from a character's (an item's Armor, Body)."""
    p = " " + _norm(phrase).casefold() + " "
    # (`tests to resist damage (not including drain)`, `other than Spellcasting`: not those)
    p = re.sub(r",? and (?:net|the|you|they|it|its|their|then|his|her|(?:reduc|increas|rais|lower|add|grant|gain|impos|allow)\w*)\b.*$|"
               r"\bbut\b.*$", " ", p)  # (the first clause: `X tests, and net hits …`)
    if re.match(r"\s*(?:all |the |any )?thresholds?\b", p):
        return []  # (`-1 to all thresholds`: a threshold, not a pool)
    p = re.sub(r"\((?:not|except|other than|excluding)[^)]*\)", " ", p)
    p = re.sub(r"\b(?:not including|except(?: for)?|other than|excluding|with the exception of)\b[^.;]*", " ", p)
    out, taken = [], []

    def add(t, a, b, when=None):
        if any(x < b and a < y for x, y in taken):
            return
        taken.append((a, b))
        if (t, when) not in out:
            out.append((t, when))
    for m in re.finditer(r"(?:tests?|any test|tests?) using (?:your |their )?(" + _ATTR_RX + r")\b|\b(" + _ATTR_RX +
                         r")[- ](?:based|linked)\b", p):
        add(f"test:attr-{ATTRIBUTES[m.group(1) or m.group(2)]}", m.start(), m.end())
    for m in re.finditer(r"\b(maximum|max)\b", p):
        pass
    for m in re.finditer(r"\btests? (?:that|which) (?:involve|use|uses) ((?:(?:" + _ATTR_RX + r")(?:,? or |,? and |,\s*)?)+)", p):
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
    for rx, t in _TEST_WORDS:
        for m in re.finditer(r"\b(?:" + rx + r")", p):
            add(t, m.start(), m.end())
    for m in re.finditer(r"\b(" + "|".join(SPELL_CATEGORIES) + r") spells?\b", p):
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
    for m in re.finditer(r"\b(?:the |that |this )?(?:chosen|selected|that|same) attribute\b", p):
        add("attr:choice", m.start(), m.end())
    for m in re.finditer(r"\b(?:the |that |the chosen |the selected |a )?(?:chosen|selected) skill\b|\bthat skill\b", p):
        add("skill:choice", m.start(), m.end())
    for m in re.finditer(r"\b(knowledge|language) (?:skill )?(?:tests?|checks?)\b", p):
        add(f"skill:{m.group(1)}", m.start(), m.end())
    for m in re.finditer(r"\bthe ([a-z][a-z'-]{2,20}(?: [a-z][a-z'-]{2,20}){0,2}?) (?:minor|major|edge) action\b", p):
        if m.group(1) not in ("a", "an", "one", "additional", "extra", "bonus", "free", "the"):
            add(f"action:{_slug(m.group(1))}", m.start(), m.end())
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
        if m.group(1) == "body" and (re.search(r"\b(?:physical|metahuman|human|whole|entire|own|living|the|a|an|his|her)\s*$",
                                               p[:m.start()]) or re.match(r"body (?:of|part|parts|heat|weight|type|armor|shape|size|mass|language)\b", p[m.start():])):
            continue  # (`your physical body`, `the body`: no attribute)
        if m.group(1) == "magic" and re.match(r"magic(?:al)? (?:items?|tests?|skills?|spells?|resistance)", p[m.start():]):
            continue
        if m.group(1) == "reaction" and (re.search(r"\b(?:allergic|immune|chemical|bad|negative|emotional|a|an)\s*$", p[:m.start()])
                                         or re.match(r"reactions? (?:to|from|of)\b", p[m.start():])):
            continue  # (`the allergic reaction`: no attribute)
        add(f"attr:{ATTRIBUTES[m.group(1)]}", m.start(), m.end())
    out.sort(key=lambda x: next(a for (a, b), y in zip(taken, out) if y == x) if False else 0)
    return out


# ---------- values ----------
_NUM = r"[+-]?\s?\d+(?:\.\d+)?"


def number(s):
    s = (s or "").strip().casefold()
    s = NUMBERS.get(s, s)
    m = re.fullmatch(r"([+-])?\s?(\d+(?:\.\d+)?)", s)
    return (("-" if m.group(1) == "-" else "") + m.group(2)) if m else None


def _rated(sentence, value):
    """`R` / `R*N` when the sentence gives the value per level or rating (`for each level`, `per rating point`)."""
    if re.search(r"\b(?:per|each|every|for each|for every)\s+(?:level|rank|rating|point of (?:rating|force)|rating point|grade)\b|"
                 r"\b(?:level|rating) of (?:this|the)\b", sentence, re.I):
        if value in ("1", "+1", None):
            return "R"
        if value == "-1":
            return "-R"
        if value and re.fullmatch(r"-?\d+", value):
            return f"R*{value}"
    return value


# ---------- rules ----------
def _sw(s, label=""):
    """(switch, when) of a sentence: how it is turned on, and the condition's words."""
    low = s.casefold()
    lab = label.casefold()
    if "wireless" in lab:
        return "wireless", None
    if "overdrive" in lab:
        return "activated", "overdrive"
    for k, rx in _SWITCH:
        if rx.search(s):
            return k, None
    if _CONDITION.search(low):
        return "conditional", None
    return None, None


def _fx(target, op, value, switch=None, when=None):
    a = {"target": target, "op": op, "value": value}
    if switch:
        a.update(confidence="low", switch=switch)
    if when:
        a["when"] = when
    return ("effect", a, None)


_TGT_END = r"(?=[.;:]|\s(?:but|and (?:gain|receive|add|increase|the|you|it|a|an)\b|which|while|when|if|as long|for (?:the|a|one|\d) (?:duration|minute|hour|round|turn)|until|unless|with the exception)\b|$)"
_PHRASE = r"((?:[^.;:](?!\s(?:but|which|until|unless)\b))+?)" + _TGT_END


def read(text, kind=None, name=None):
    """[(tag, attrs, None)]: the effects, tests and links the text states, in the order printed, each once."""
    out = []
    edge_actions = bool(re.search(r"\bedge cost\b", text or "", re.I))
    for s in sentences(text):
        label = ""
        if m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+(.*)$", s):
            label, s = m.group(1), m.group(2)
            if targets(label, kind) and re.match(r"[+-]\s?\d", s):
                s = f"{label} {s}"  # (`**AR:** +2`, `**Body:** +1`: the label names the target)
        role = ROLES.get(label.casefold())
        sw, when = _sw(s, label)
        when = when or role
        if role and not sw:
            sw = "conditional"
        if (per := re.search(r"\b(?:each|every|per) (?:whole )?point of (?:your |their |the )?(?:own )?(?!rating|force|level)([a-z][a-z ]{2,25}?)\b(?=\s|,|$)", s, re.I)):
            sw, when = "conditional", f"per point of {per.group(1).lower()}"  # (`each point of your Essence loss`: a formula)
        if kind in ("spells", "rituals", "complexforms") and not sw:
            sw = "activated"  # (a spell's, ritual's or complex form's: while it is cast and lasts)
        if label.casefold() in ("effect", "effects") and kind == "gear" and not sw:
            sw = "activated"  # (a drug's or toxin's `Effect:` line: while it acts)
        others = _OTHERS.search(s) and not (kind in ("spells", "rituals", "complexforms") and re.match(r"\W*(?:the )?(?:targets?|subjects?)", s, re.I))
        if others or re.search(r"\b(?:it|this|the \w+) has an? (?:initiative|body|armor|pilot|sensor|device rating)\b", s, re.I) or re.search(r"\b(?:required|needed) to (?:reload|ready|fire|operate|set up)\b", s, re.I):
            continue  # (what others suffer against the entry, or what it costs to use: not the entry's effect)
        for x in _rules(s, kind, sw, when, edge_actions, label):
            out.append(x)
        for m in _TEST.finditer(s):
            out.append(("test", {"skill": f"skill:{m.group(1).casefold().replace(' ', '-')}",
                                 "attr": f"attr:{ATTRIBUTES[m.group(2).casefold()]}", "threshold": m.group(3)}, None))
    uniq, at = [], {}
    for x in out:  # each once; the same effect on several of a skill's tests: one, its conditions joined
        k = (x[0], tuple(sorted((a, b) for a, b in x[1].items() if a != "when")))
        if k in at:
            w0, w1 = uniq[at[k]][1].get("when"), x[1].get("when")
            if w1 and w0 and w1 not in w0.split(", "):
                uniq[at[k]][1]["when"] = f"{w0}, {w1}"
            continue
        at[k] = len(uniq)
        uniq.append((x[0], dict(x[1]), x[2]))
    return uniq


def _activity(phrase):
    """[(test:other, the words)] for tests a phrase names by activity (`tests involving grappling, escaping bonds`),
    else []."""
    m = re.search(r"\b(?:tests?|checks?|rolls?)\b(?: (?:involving|related to|for|to|made (?:to|for)) (?P<a>[^.;]{3,80}))?", phrase)
    if not m:
        return []
    words = (m.group("a") or phrase[:m.start()]).strip(" ,")
    words = re.sub(r"^(?:all|any|your|their|the)\s+", "", words)[:70].strip()
    return [("test:other", words)] if words else []


_OTHERS = re.compile(r"^\W*(?:(?:additionally|also|however|furthermore|in addition|but|and)\W+)?"
                     r"(?:those(?! with)|anyone|anybody|someone|others|opponents?|attackers?|enemies|observers?|onlookers?|"
                     r"spellcasters?|targets?|the target|anyone else|an? (?:observer|opponent|attacker|enemy|onlooker)|"
                     r"other (?:individuals|characters|people|runners|players)|(?:npcs|pcs)\b|"
                     r"(?:characters|people|individuals|anyone) (?:trying|attempting|looking|who|that))\b|"
                     r"\b(?:tests?|attacks?|spells?) (?:made |cast )?against (?:you|them|the character|the user)\b|"
                     r"\bfor (?:anyone|others|those)\b|\byour (?:targets?|opponents?|enemies|attackers?)\b", re.I)
_TEST = re.compile(rf"\b({'|'.join(s.title() for s in SKILLS)})\s*\+\s*({'|'.join(a.title() for a in ATTRIBUTES)})"
                   rf"\s*\((\d+)\)\s+test\b")
_VAL = r"(?P<v>[+-]?\s?\d+(?:\.\d+)?|one|two|three|four|five|six|an?|single)"
_PER = r"(?:\s+(?:per|for each|each)\s+(?:level|rating(?: point)?|point of (?:rating|force)|hit))?"


def _val(v, s):
    v = (v or "").strip().casefold()
    v = "1" if v in ("a", "an") else NUMBERS.get(v, v).replace(" ", "")
    v = v.lstrip("+")
    return _rated(s, v)


def _rules(s, kind, sw, when, edge_actions, label):
    """The effects one sentence states."""
    low = s.casefold()
    out = []

    def emit(ts, op, value, w=None, phrase=""):
        if not ts and phrase:  # (tests the book names by activity, `tests involving grappling`: shown with its words)
            ts = _activity(phrase)
        for t, spec in ts:
            if t.startswith("attr:") and op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die"):
                t = "test:attr-" + t[5:]  # (Edge on Logic tests: tests using the attribute)
            if op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die") and t.startswith(("item:", "matrix:")):
                continue
            ww = ", ".join(x for x in (w or when, spec) if x) or None
            s2 = sw or ("conditional" if spec else None)
            out.append(_fx(t, op, value, s2, ww))

    # an attribute's maximum (`maximum (but not current) rank increases by 1`, `maximum Body and Strength by one point`)
    for m in re.finditer(r"\b(?:maxim(?:um|ums|a)|racial limits?)\b(?:\s*\(but not current\))?(?P<t>[^.]{0,40}?)(?:rank\s+)?(?P<dir>increas\w*|decreas\w*|rais\w*|lower\w*)"
                         r"\s+by\s+" + _VAL, low):
        ts = [(t, w) for t, w in targets(low[:m.start("dir")], kind) if t.startswith("attr:")] or \
            ([("attr:choice", None)] if re.search(r"chosen|select|choose|that attribute", low) else [])
        v = _val(m.group("v"), low)
        if m.group("dir").startswith(("decreas", "lower")):
            v = "-" + v.lstrip("-")
        for t, _ in ts:
            out.append(_fx("attr-max:" + t[5:], "add", v, sw, when))
    for m in re.finditer(r"\bincreas\w* (?:the (?:individual|character)'s |your |their )?maximum (?P<t>[^.]*?) by " + _VAL, low):
        for t, _ in targets(m.group("t"), kind):
            if t.startswith("attr:"):
                out.append(_fx("attr-max:" + t[5:], "add", _val(m.group("v"), low), sw, when))
    for m in re.finditer(r"\b(physical|mental) attribute maxim(?:um|ums|a) (?:are |is )?(?P<dir>increas\w*|reduc\w*|decreas\w*|lower\w*) by " + _VAL, low):
        sign = "-" if re.match(r"reduc|decreas|lower", m.group("dir")) else ""
        for a in TEST_TYPES[m.group(1)]:
            out.append(_fx(f"attr-max:{a}", "add", sign + _val(m.group("v"), low).lstrip("-"), sw, when))
    maxed = any(x[1]["target"].startswith("attr-max:") for x in out)

    # Edge: bonus Edge, no Edge, Edge costs
    for m in re.finditer(r"(?:\bcannot|\bcan't|\bmay not|\bcan not|\bcan never|\bmay never|\bnever|\bunable to|\bnot able to|\bdoes not|\bdo not|n't) (?P<what>(?:gain|earn|spend|use)"
                         r"(?: or (?:gain|earn|spend|use))?) edge(?: (?:points?|boosts?|actions?))?(?: (?:on|for|in|during|when making|when)\s+"
                         r"(?P<t>[^.;]*))?", low):
        what = m.group("what")
        before = low[:m.start()] if re.search(r"\b(?:tests?|rolls?|checks?|skills?)\b", low[:m.start()]) else ""
        ts = targets(m.group("t") or "", kind) or [x for x in targets(before, kind) if x[0] != "attr:edg"] or \
            [("test:all", None)]  # (`When using that skill …, you may not …`; `you may not gain or spend Edge`: on any test)
        if what in ("gain", "earn") or re.search(r"\b(?:gain|earn)\b", what):
            emit(ts, "no-edge-gain", "1")
        if re.search(r"\b(?:spend|use)\b", what):
            emit(ts, "no-edge", "1")
    for m in re.finditer(r"\bedge (?:boosts?|actions?)(?: (?:and|or) (?:boosts?|actions?))? cost (?P<v>\w+) (?P<dir>less|more)"
                         r"(?: (?:for|on|when making|when|to)\s+(?P<t>[^.;]*))?", low):
        v = _val(m.group("v"), low)
        emit(targets(m.group("t") or "", kind), "edge-cost", ("-" if m.group("dir") == "less" else "") + v.lstrip("-"))
    for m in re.finditer(r"\b(?P<dir>reduc\w*|lower\w*|increas\w*|rais\w*) the (?:edge )?cost of (?:any |all |the )?edge "
                         r"(?:boosts?|actions?)(?: (?:and|or) (?:boosts?|actions?))?(?: by (?P<v>\w+))?"
                         r"(?P<t>[^.;]*)", low):
        v = _val(m.group("v") or "1", low)
        sign = "-" if m.group("dir").startswith(("reduc", "lower")) else ""
        emit(targets(m.group("t"), kind), "edge-cost", sign + v.lstrip("-"))
    for m in re.finditer(r"\bedge (?:actions?|boosts?)(?: and (?:actions?|boosts?))? cost (?P<v>\w+) (?:points? )?(?P<dir>higher|lower)", low):
        ts = [x for x in targets(low[:m.start()], kind) if x[0] != "attr:edg"]  # (`… Athletics tests …; Edge Actions and Boosts cost 1 point higher`)
        emit(ts, "edge-cost", ("-" if m.group("dir") == "lower" else "") + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\b(?:reduc|lower)\w* the (?:edge )?cost of (?:any |all |the )?edge (?:boosts?|actions?)(?P<t>[^.;]*?)\bby (?P<v>one|two|\d+)\b", low):
        if re.match(r"\s*(?:and (?:boosts?|actions?))?\s*$", m.group("t")):
            continue  # (read above)
        emit(targets(m.group("t"), kind), "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\bedge (?:boost |action )?costs? (?:are |is )?(?P<dir>increas\w*|reduc\w*|lower\w*) by (?P<v>\w+)(?P<t>[^.;]*)", low):
        sign = "-" if m.group("dir").startswith(("reduc", "lower")) else ""
        ts = targets(m.group("t"), kind) or targets(low[:m.start()], kind)
        emit(ts, "edge-cost", sign + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\breduce the edge cost of the (?P<n>[\w ’'-]+?) edge action(?: by (?P<v>\w+))?", low):
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost", "-" + _val(m.group("v") or "1", low).lstrip("-"), sw, when))
    if edge_actions and (m := re.fullmatch(r"[•\s]*([A-Z][\w’' !-]+?) \((\d+)(?:,\s*\d+)*(?:,? or \d+)? Edge\).*", s)):
        out.append(_fx(f"action:{_slug(m.group(1))}", "edge-cost-set", m.group(2), sw, when))
    edge_rx = (r"(?:\b(?:bonus of|gain(?:s|ing)?|receiv(?:es?|ing)|gets?|getting|grant(?:s|ing)?|gives?|giving|provid(?:es?|ing)|confers?|has|have|earns?|with|and)|\+)\s*(?:the (?:character|user|adept|individual) )?"
               r"(?:an? (?=\+))?(?P<v>an?|one|two|three|\d+|\+\d+)?\s*(?:additional |extra |bonus |free |situational )*(?:points? of )?"
               r"(?:situational |bonus )?edge(?: points?| bonus)?(?: (?:that|which) (?:must|can|may) be [^.,;]*?(?= on| for| when|$))?"
               r"(?: (?:on|for|to use on|when (?:making|attempting|performing|using|rolling)|when|in|during|before making|to)\s+(?P<t>[^.;]*))?")
    for m in re.finditer(r"\b(?:gains?|receives?|gets?|adds?|grants?) edge (?:and [^.;]*? )?(?:on|for|to|when making|when) (?P<t>[^.;]*)", low):
        if not re.search(r"(?:\bcannot|\bnot|n't|\bnever)\s*$", low[:m.start()]):
            emit(targets(m.group("t"), kind), "edge", "1")
    for m in re.finditer(edge_rx, low):
        if re.search(r"(?:\bcannot|n't|\bnot|\bnever)\s*$", low[:m.start()]):
            continue
        if not m.group("v") and not re.search(r"\b(?:bonus|situational|points? of|an? edge)\b", m.group(0)):
            continue
        t = m.group("t") or ""
        ts = targets(t, kind)
        if not ts:  # (`Whenever you assense …, gain a point of Edge`, `Outdoors and Perception tests … gain an Edge`)
            ts = targets(low[:m.start()], kind)
        if not ts and not _activity(t):
            continue
        emit(ts, "edge", _val(m.group("v") or "1", low).lstrip("+"), phrase=t)
    for m in re.finditer(r"\bspend (?P<v>\w+) (?:extra|additional|more) points? of edge on edge (?:boosts?|actions?)[^.;]*?"
                         r"(?: (?:on|for) (?P<t>[^.;]*?))?(?= when\b|[.;]|$)", low):
        emit(targets(m.group("t") or "", kind), "edge-cost", _val(m.group("v"), low).lstrip("+"))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three) (?:additional|extra|bonus) hits? (?:on|to|for) (?:all |any |your )*(?P<t>[^.;]*)", low):
        emit(targets(m.group("t"), kind), "hits", _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:use|swap in|roll|adds?|gains?|and|imposes?|replace [^.]* with)\s+(?:a|the|one|an additional|an extra|a bonus)\s+wild die(?: (?:on|for|with|in|to)\s+(?:all (?:of )?)?(?:your )?(?P<t>[^.;]*))?", low):
        ts = targets(m.group("t") or "", kind) or targets(low[m.end():], kind)  # (`… with a wild die when rolling any toxin test`)
        emit(ts or ([("test:combat", None)] if kind == "weapons" else []), "wild-die", "1")

    # initiative dice and score
    for m in re.finditer(r"(?:\+\s?(?P<a>\d+)\s?d6 (?:to )?(?:your )?(?:matrix )?initiative|"
                         r"(?P<b>\d+|an?|one|two|three|four|five|its rating in|its rating as)\s+(?:additional |extra |bonus )?(?:matrix )?initiative di(?:c)?e|"
                         r"\+\s?(?P<c>\d+)\s+initiative di(?:c)?e|initiative di(?:c)?e(?: [^.]{0,40})? by (?P<d>\d+|its rating|one|two)|"
                         r"adds? (?P<e>\d+|an?|one)\s*d6 (?:to )?initiative)", low):
        raw = next(g for g in (m.group("a"), m.group("b"), m.group("c"), m.group("d"), m.group("e")) if g)
        v = "R" if "rating" in raw else _val(raw, low)
        matrix = bool(re.search(r"\b(?:vr|matrix|hot sim|cold sim)\b", low))
        out.append(_fx("derived:matrix-initiative-dice" if matrix else "derived:initiative-dice", "add", v, sw, when))
    for m in re.finditer(r"\+\s?(?P<v>\d+) (?:to )?(?:your |the )?(?P<mx>matrix )?initiative(?! di)(?: score)?\b|"
                         r"(?:matrix )?init(?:iative)? bonus of \+?(?P<w>\d+)", low):
        v = _val(m.group("v") or m.group("w"), low)
        out.append(_fx("derived:matrix-initiative" if (m.group("mx") or re.search(r"\b(?:vr|matrix)\b", low)) else "derived:initiative",
                       "add", v, sw, when))

    # condition monitor boxes, Minor and Major Actions, Hardened Armor, Overwatch, movement
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three|an additional|one additional|\+\d+)\s+(?:additional |extra |bonus )?boxe?s?\b(?! (?:farther|further) down)"
                         r"(?P<t>[^.;]{0,60}?)(?P<which>physical|stun|condition)? ?(?:condition )?monitor", low):
        which = "stun" if "stun" in m.group(0) else "matrix" if "matrix" in m.group(0) else "physical"
        v = _val(m.group("v").replace("additional", "").strip(), low)
        out.append(_fx(f"derived:{which}-monitor", "add", v, sw, when))
    for m in re.finditer(r"\+\s?(?P<v>\d+) (?P<w>physical|stun) (?:condition monitor )?boxes", low):
        out.append(_fx(f"derived:{m.group('w')}-monitor", "add", m.group("v"), sw, when))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:additional|extra|bonus|free|more)\s+(?P<w>minor|major) actions?|"
                         r"\+\s?(?P<u>\d+) (?P<x>minor|major) actions?", low):
        if re.match(r"\s*(?:are |is )?(?:required|needed|to (?:reload|ready))", low[m.end():]) or \
                re.search(r"\b(?:with|for|using|spend(?:ing)?|requires?|takes?|costs?|by taking)\s+$", low[:m.start()]):
            continue  # (`3 additional Major Actions required to reload`: a cost)
        if m.group("u"):
            v, w = m.group("u"), m.group("x")
        else:
            v, w = _val(m.group("v"), low), m.group("w")
        out.append(_fx(f"derived:{w}-actions", "add", v, sw, when))
    if m := re.search(r"hardened armor(?: ability)?(?: \([^)]*\))?(?: at rating| rating| of|)\s+(\d+)", low):
        out.append(_fx("derived:hardened-armor", "add", m.group(1), sw, when))
    if m := re.search(r"\b(?:reduce (?:the )?(?:os|overwatch score)|(?:increases to the )?overwatch score (?:increases )?(?:are |is )?reduced) by (\w+)", low):
        out.append(_fx("matrix:overwatch", "add", "-" + _val(m.group(1), low).lstrip("-"), sw, when))
    for m in re.finditer(r"\b(?P<w>walking and running|walking|running|movement|flying|swimming|flight)(?: rates?| speed)? (?:by|of|to) "
                         r"\+?(?P<v>\d+/\+?\d+/\+?\d+)", low):
        w = {"flying": "flying", "flight": "flying", "swimming": "swimming"}.get(m.group("w"))
        out.append(_fx("derived:movement", "add", m.group("v").replace("+", ""), sw, ", ".join(x for x in (when, w) if x) or None))

    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:additional |extra |bonus )?(?:damage )?overflow box", low):
        out.append(_fx("derived:overflow", "add", _val(m.group("v"), low), sw, when))
    for m in re.finditer(r"(?:(?:ar|attack ratings?)[^.;]{0,40}?|^|: ?)(?P<l>(?:[+-]?\d+|-)(?:/(?:[+-]?\d+|-)){4})(?!\d)", low):
        vals = m.group("l").split("/")
        if any(v.startswith(("+", "-")) and v != "-" for v in vals):  # (a modifier per range band: `+2/–/–1/–2/–3`)
            out.append(_fx("item:ar", "add", ",".join("0" if v == "-" else v.lstrip("+") for v in vals), sw, when))
    # dice and bonuses: `+N dice (pool bonus) to X`, `a +N bonus on X`, `X +N`, `increase X by N`, `adds its rating to X`
    found = []

    def bonus(ts, v, w=None):
        for t, spec in ts:
            if t == "item:dv" and re.search(r"\bincoming\b", low):  # (`-1 to DV on every incoming attack`: damage reduction)
                t, v = "derived:damage-reduction", (v[1:] if v.startswith("-") else "-" + v)
            if t in ("attr:edg",) and re.search(r"\bedge (?:bonus|point)|bonus edge|point of edge", low):
                continue
            found.append((t, v, spec, w))
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+)(?:d6)?\s*(?:(?:bonus |extra |additional )?(?:dice pool|dice|die)\s*"
                         r"(?:bonus|modifier|penalty|modifiers)?|bonus|modifier|penalty|points?)?"
                         r"(?:\s+(?:per|for each) (?:level|rating)(?: point)?(?: of [a-z ]+?)?)?(?: and [^.;]{0,25}?)?\s+(?:to|on|for|when|against)\s+"
                         r"(?:all |any |your |their |the |its |his |her |a |each )*(?P<t>[^.;]*)", low):
        if re.match(r"\s?\d+\s?d6", low[m.start("v"):]):
            continue
        t = re.split(r"\b(?:up to|allowed|provided|as long as)\b", m.group("t"))[0]
        bonus(targets(" ".join(t.split()[:10]), kind)[:6], _val(m.group("v"), low))
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+)\s+(?:points? of |to the |to your |to )?(?P<t>(?:[a-z]+ ){0,3}[a-z]+)", low):
        if re.match(r"(?:points? of |bonus )?edge\b", m.group("t")):
            continue  # (`+1 Edge on …`: Edge on tests)
        ts = targets(m.group("t"), kind)
        if ts and not re.match(r"\s?\d+\s?d6", low[m.start("v"):]):
            bonus(ts[:1], _val(m.group("v"), low))
    for m in re.finditer(r"(?<![a-z])(?P<t>(?:[a-z]+ ){0,2}[a-z]+)\s(?P<v>[+-]\s?\d+)\b(?!\s?(?:d6|/|%|\s?percent))", low):
        ts = targets(m.group("t"), kind)  # (`Agility +1`, `Defense Rating +2`: the target right before the number)
        if ts and not re.search(r"\b(?:tests?|rolls?|pools?|and|or|but|a|an|the|by|of|with)$", m.group("t")):
            bonus(ts[-1:], _val(m.group("v"), low))
    for m in re.finditer(r"(?<!edge )\b(?:increas|rais|boost|improv|add|enhanc)\w*\s+(?:both |all |each of )?(?:your |their |the (?:user|character|individual|wearer)'s |its |the |his |her )?"
                         r"(?P<t>(?:(?!\b(?:increas|rais|boost|add)\w*\b)[^.;]){2,90}?)\s+(?:attributes? |ratings? |values? |scores? )?by\s+(?:a |an )?(?P<v>[+-]?\s?\d+|one|two|three|four|"
                         r"its rating|their rating|the rating|its force|their force|its level|the level|rating|level)\b", low):
        raw = m.group("v")
        v = "R" if re.search(r"rating|force|level", raw) else _val(raw, low)
        if re.search(r"\bmaxim", m.group("t")) or maxed and re.search(r"\bmaxim", low):
            continue
        rest = re.match(r"\s*(?:for|on|when making|when rolling)\s+(?:all |any |your |their )*(?P<t>[^.;]*?\btests?\b)", low[m.end():])
        own = targets(re.split(r"\s+(?:with|of|within|from|against)\s+", m.group("t"))[0], kind) or \
            ([] if re.search(r"\bthresholds?\b", m.group("t")) else targets(low[m.start():m.end()], kind))
        bonus(targets(rest.group("t"), kind) if rest and targets(rest.group("t"), kind) else own, v)
        for m2 in re.finditer(r"(?:,|\band)\s+(?:the |its |your |their )?(?P<t>[a-z][a-z' ]{1,40}?) by (?P<v>[+-]?\d+|one|two|three)\b",
                              low[m.end():]):
            v2 = _val(m2.group("v"), low)
            if re.match(r"(?:decreas|reduc|lower)\w*\b", m2.group("t")):  # (`… and decreases your Intuition by 1`)
                v2 = "-" + v2.lstrip("-")
            bonus(targets(re.sub(r"^(?:\w+s )?(?:your |their |the |its )", "", m2.group("t")), kind), v2)
    for m in re.finditer(r"\b(?:adds?|gives?|provides?|grants?|gains?|receives?)\s+(?:its|their|the item's|the) (?:rating|force|level)"
                         r"(?: in (?:bonus |additional )?dice| as (?:a |extra |bonus )?(?:dice pool bonus|dice|bonus|extra \w+)|"
                         r" as (?:a )?(?:dice pool )?bonus)?\s+(?:to|on|for|when)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\badds? the (?:rating|force|level) of (?:the |this |these |its )?[a-z' -]{0,40}? to (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:4], "R")
    for m in re.finditer(r"\badds? (?P<v>a|one|two|\d+) (?:point|box)s? to (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:2], _val(m.group("v"), low))
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+) (?:increase|boost|bonus) (?:to|in) (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:4], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:add|gain|receive|get)s?\s+(?:a number of )?dice equal to (?:its|their|the) (?:rating|force|level)\s+"
                         r"(?:to|on|for)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\b(?:bonus|equal to (?:its|their) (?:rating|force|level)) (?:to|on) (?:your |their |the )?(?P<t>[^.;]*?)"
                         r"\s*(?:equal to (?:its|their) (?:rating|force|level))?$", low):
        if re.search(r"equal to (?:its|their) (?:rating|force|level)", m.group(0)):
            bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\b(?:gain|receive|get|add|grant)s?\s+(?:a |an |one |(?P<v>\d+|two|three|four) )?(?:additional |extra |bonus )+"
                         r"(?:dice|die)\s+(?:to|on|for|when)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v") or "1", low))
    for m in re.finditer(r"\badds? (?P<v>one|two|three|an?|\d+) (?:die|dice) (?:to|on|for) (?:all |any |your |their |the )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:gain|add)s?\s+(?P<v>two|three|\d+) dice(?:, one of which must be a wild die)?(?:,)?\s+(?:to|on|for|when)\s+"
                         r"(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:counts? as|considered|treated as) (?:being )?(?P<v>one|two|three|\d+) points? higher (?:for|when) (?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low))
    for m in re.finditer(r"\bgain (?:its|their|the) rating as (?:extra|additional) (?P<a>" + _ATTR_RX + r") when (?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind) or [(f"attr:{ATTRIBUTES[m.group('a')]}", None)], "R")
    for m in re.finditer(r"\b(?:defense rating|dr) bonus equal to (?:its|their) rating|bonus equal to (?:its|their) rating to (?:your |the )?defense rating", low):
        bonus([("derived:defense", None)], "R")
    for m in re.finditer(r"\b(?:an? |its |their )?(?P<t>[a-z ]{2,30}?) (?P<n>attribute |rating )?equal to (?:its|their|the item's) rating\b", low):
        bonus((targets(m.group("t"), kind) or targets(m.group("t") + " " + (m.group("n") or ""), kind))[-1:], "R")
    for m in re.finditer(r"\bdice pool bonus (?:for|to|on) (?:all |any |your )*(?P<t>[^.;]*?) equal to (?:this [a-z]+'s|its|their|the) (?:level|rating|force)\b", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\bbonus equal to (?:its|their) (?:rating|force|level) (?:on|to|for) (?:all |any |your )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:extra|additional|more) boxe?s? of (?:damage )?overflow", low):
        bonus([("derived:overflow", None)], _val(m.group("v"), low))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three) less (?P<w>(?:damage )?overflow|stun|physical)(?: condition monitor)? box", low):
        w = {"stun": "derived:stun-monitor", "physical": "derived:physical-monitor"}.get(m.group("w"), "derived:overflow")
        bonus([(w, None)], "-" + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\ba number of (?:additional |extra )?boxes on your (?P<w>physical|stun) condition monitor equal to the (?:rank|level|rating)", low):
        bonus([(f"derived:{m.group('w')}-monitor", None)], "R")
    for m in re.finditer(r"(?P<t>[a-z][a-z' ]{2,40}?) (?:is|are) (?:increased|raised|boosted|improved) by (?:the |its |their )?(?P<v>rating|level|force|[+-]?\d+|one|two)", low):
        if maxed and re.search(r"\b(?:maxim|limit)", low):
            continue  # (`Your racial limit for Charisma and Willpower are increased by 1`: the maxima, read above)
        v = "R" if m.group("v") in ("rating", "level", "force") else _val(m.group("v"), low)
        bonus(targets(m.group("t"), kind)[-1:], v)
    for m in re.finditer(r"\b(?:each|every|per) (?:rating(?: point)?|level)\b[^.;]*?\b(?:increases?|improves?|raises?) (?:your |the |its |their )?(?P<t>[^.;]*)", low):
        if not re.search(r"\bby\b", m.group("t")):
            bonus(targets(m.group("t"), kind)[:1], "R")
    for m in re.finditer(r"\b(?:attack rating|ar) (?:bonus )?increases to \+?(?P<v>\d+)", low):
        found.append(("item:ar", m.group("v"), None, None))
    for m in re.finditer(r"\badds? (?P<v>\d+|one|two) to the rating of (?:a|one|any) skill", low):
        found.append(("skill:choice", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\b(?:its|their|the [\w' -]{2,40}?'s?) (?:rating|force|level) is added to (?:your |their |the )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"(?P<t>[a-z][a-z ]{2,30}?) (?:receives?|gets?|gains?) (?:an? )?(?:ongoing |permanent )?(?:boost|bonus|increase) "
                         r"equal to (?:the|its|their) (?:level|rating|force)", low):
        bonus(targets(m.group("t"), kind)[-1:], "R")
    for m in re.finditer(r"(?P<v>[+-]\s?\d+) lp modifier (?:to|toward|towards|on|applied to) (?:their |your |the )?(?P<w>necessities|comforts|security|neighborhood|entertainment)", low):
        found.append((f"lifestyle:{m.group('w')}", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\breduces? (?:all )?incoming (?:dv|damage(?: value)?) by (?P<v>\d+|one|two|three)", low):
        found.append(("derived:damage-reduction", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"(?P<v>\d+|one|two|three|an?) (?:levels?|points?) of (?:natural )?armor\b", low):
        if kind not in VEHICLE_KINDS:
            bonus([("derived:defense", None)], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:increase|decrease|reduce|lower|raise)s? (?:the )?(?P<t>(?:close|near|medium|far|extreme)(?:(?:,\s*|\s+and\s+|\s+|,\s*and\s+)(?:close|near|medium|far|extreme))*) "
                         r"attack ratings? by (?P<v>\d+)", low):
        bands = ("close", "near", "medium", "far", "extreme")
        sign = "-" if re.match(r"\s*(?:decrease|reduce|lower)", m.group(0)) else ""
        v = ",".join(sign + m.group("v") if b in m.group("t") else "0" for b in bands)
        found.append(("item:ar", v, None, None))
    for m in re.finditer(r"\b(?:decrease|reduce|lower)s?\s+(?:the |its |your )?(?!(?:all )?incoming)(?P<t>[a-z ]{2,40}?)\s+by\s+(?P<v>\d+|one|two|three)", low):
        ts = targets(m.group("t"), kind)
        for t, spec in ts:
            if t.startswith(("item:", "derived:", "attr:", "matrix:")):
                found.append((t, "-" + _val(m.group("v"), low).lstrip("-"), spec, None))
    for t, v, spec, w in found:
        if v is None:
            continue
        op = "add"
        tt = t
        if t.startswith("test:attr-") and False:
            pass
        ww = ", ".join(x for x in (w or when, spec) if x) or None
        s2 = sw or ("conditional" if spec else None)
        out.append(_fx(tt, op, v, s2, ww))
    return out


_LINK_RX = [
    (re.compile(r"\b(?:gains?|receives?|has|have|get|gets|takes?)\s+(?:the\s+)?(?P<n>[A-Z][\w’'()-]*(?:\s+(?:[A-Z(][\w’'()-]*|of|the))*)\s+(?:(?P<lv>\d) )?(?P<k>quality|power|critter power|adept power)\b"), "grants"),
    (re.compile(r"\btreat (?:this|it) (?:\w+ )?as the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?:negative |positive )?(?P<k>quality|power)\b"), "as"),
    (re.compile(r"\b(?:the same (?:result|effect|bonus|way) as|functions (?:in the same way |just )?as|works (?:just )?(?:like|as)|counts as)\s+(?:an? |the )?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*)"), "as"),
    (re.compile(r"\b(?P<lv>\d+|one|two) free levels? of (?:the )?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z(][\w’'()-]*)*)(?: (?P<k>power))?"), "grants"),
    (re.compile(r"^(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z(][\w’'()-]*)*) (?P<k>power|quality) for free\b"), "grants"),
]
_LINK_KIND = {"quality": "qualities", "power": "adeptpowers", "adept power": "adeptpowers", "critter power": "critterpowers"}
_NOT_NAMES = {"Edge", "The", "This", "Each", "A", "An", "Magic", "Resonance"}


def links(text, kind=None):
    """<link rel kind name [level]> for each entry the text grants or says this one works as."""
    out = []
    ss = sentences(text)
    for i, s in enumerate(ss):
        after = " ".join(ss[i + 1:i + 2])  # (`… gain the X quality. See p. 70, SR6.`: the citation next)
        if m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+(.*)$", s):
            role, s = ROLES.get(m.group(1).casefold()), m.group(2)
        else:
            role = None
        for rx, rel in _LINK_RX:
            for m in rx.finditer(s):
                n = re.sub(r"\s*\(p\.\s*\d+.*$", "", m.group("n")).strip(" ,")
                if n in _NOT_NAMES or len(n) < 3:
                    continue
                k = _LINK_KIND.get((m.groupdict().get("k") or "").casefold())
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
                cite = re.search(r"\(?p\.\s*\d+,\s*(SR6|[A-Z][\w ]+?)\b\)?", (s[m.end():m.end() + 40] + " " + after)[:80])
                if cite:
                    a["book"] = "crb" if cite.group(1) == "SR6" else cite.group(1)
                x = ("link", a, None)
                if x not in out:
                    out.append(x)
    return out


# ---------- tables: a table's modifier columns ----------
COLUMNS = {"bod": "bod", "agi": "agi", "rea": "rea", "str": "str", "wil": "wil", "log": "log", "int": "int", "cha": "cha",
           "edg": "edg", "mag": "mag", "res": "res"}
STAT_COLUMNS = {"ar": "item:ar", "attack rating": "item:ar", "attack ratings": "item:ar", "dv": "item:dv",
                "defense rating": "derived:defense", "defense": "derived:defense", "unarmed dv": "item:dv", "unarmed ar": "item:ar",
                "matrix init bonus": "derived:matrix-initiative", "init bonus": "derived:initiative",
                "initiative bonus": "derived:initiative", "dr": "derived:defense", "defense rating bonus": "derived:defense"}


def table(header, row, kind):
    """Effects of one table row: an attribute table of six or more attribute columns printing an infected type's (a
    quality's) maxima (`set`); a column naming a target whose cell is signed (`+2`, `–1`: a modifier, an ammo type's AR
    and DV) or a bonus column (`MATRIX INIT BONUS`)."""
    out = []
    h = [re.sub(r"\s+", " ", x.strip().casefold()) for x in header]
    cells = dict(zip(h, row))
    attrs = [c for c in h if c in COLUMNS]
    if len(attrs) >= 6 and kind == "qualities":
        for c in attrs:
            if v := number(_norm(cells.get(c, ""))):
                out.append(_fx(f"attr-max:{COLUMNS[c]}", "set", v))
        return out
    for c, v in cells.items():
        t = STAT_COLUMNS.get(c)
        v = _norm(v or "")
        if not t or not v or v in ("-", "—") or (kind == "armor" and t == "derived:defense"):
            continue  # (an armor's own Defense Rating is its defense field, not an effect)
        if t == "item:ar" and "/" in v and re.fullmatch(r"(?:[+-]\d+|0|-)(?:/(?:[+-]\d+|0|-)){4}", v):
            out.append(_fx(t, "add", ",".join("0" if x == "-" else x.lstrip("+") for x in v.split("/"))))
        elif re.fullmatch(r"[+-]\d+", v) or (c.endswith("bonus") and re.fullmatch(r"\+?\d+", v)):
            out.append(_fx(t, "add", ",".join([v.lstrip("+")] * 5) if t == "item:ar" else v.lstrip("+")))
    return out


_BANDS = ("close", "near", "medium", "far", "extreme")
_AR = re.compile(r"\b(?:increase|raise|boost|improve)s?\s+(?:the\s+)?((?:(?:close|near|medium|far|extreme)(?:,\s*|\s+and\s+|\s+))+)"
                 r"attack\s+ratings?\s+by\s+(\d+)\b", re.I)


def accessory(text, thing):
    """[(tag, attrs, None)]: what a sentence of `text` naming the accessory (its last word: `arm-brace`) says it does to
    the item it fits: `increases the Near and Medium Attack Ratings by 1` -> <effect target="item:ar" op="add"
    value="0,1,1,0,0">, one value a range band; low confidence when the sentence sets a condition."""
    word = (thing.split() or [""])[-1].lower()
    out = []
    for s in sentences(text):
        if not word or word not in s.lower():
            continue
        for m in _AR.finditer(s):
            named = {b for b in _BANDS if re.search(rf"\b{b}\b", m.group(1), re.I)}
            value = ",".join(m.group(2) if b in named else "0" for b in _BANDS)
            x = ("effect", {"target": "item:ar", "op": "add", "value": value,
                            **({"confidence": "low"} if _CONDITION.search(s) else {})}, None)
            if x not in out:  # (a note printed twice: in the text and as a label)
                out.append(x)
    return out


# ---------- the import's pass over every entry ----------
# kinds whose entries print no effects of their own in prose the grammar reads (stat blocks, rules, vocabularies, and
# life modules, whose points are their own attributes and choices)
SKIP_KINDS = {"rules", "actions", "npcs", "contacts", "critters", "spirits", "sprites", "categories", "priorities", "metatypes",
              "skills", "lifemodules", "grades", "attributes", "samples", "sources", "index", "packs", "contacttypes",
              "licencetypes", "magictypes", "senses", "trueelements", "ruleoptions", "spellfeatures", "qualitysets"}
_ENTRY = re.compile(r'^(\s*)<([\w]+) id="([^"]+)"(.*?)><name>(.*?)</name>(.*)</\2>\s*$')
_KEEP = re.compile(r'<effect [^>]*target="item:[^"]*"[^>]*/>')  # (an add-on's effect read from its host's text: crb.add_ons)
_DROP = re.compile(r'<(?:effect|test|link) [^>]*/>')


def _unesc(s):
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")


def _tables(regrouped):
    """[(title, header, row)] of every markdown table in the regrouped text."""
    out, lines = [], (regrouped or "").splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*-", lines[i + 1]):
            header = [c.strip() for c in ln.strip().strip("|").split("|")]
            j = i + 2
            while j < len(lines) and lines[j].startswith("|"):
                out.append((header, [c.strip() for c in lines[j].strip().strip("|").split("|")]))
                j += 1
    return out


def _key(s):
    return re.sub(r"[^a-z0-9]+", " ", _unesc(s).casefold().replace("’", "'")).strip()


def _own_part(text, name, siblings):
    """An entry's part of a description it shares with entries of the same kind (`High performance engines … Racing
    engines … Economy engines …`): the sentences from the one naming it to the next naming a sibling, with any
    before the first naming one; the whole text when it doesn't name the entry."""
    def word(n):  # (the name as a sentence opens with it: `Racing` for `Racing engines …`)
        return " ".join(re.sub(r"\s*\(.*?\)\s*$", "", n).casefold().split())
    me = word(name)
    sib = {word(n) for n in siblings if n != name and word(n) != me and len(word(n)) > 3}
    if not me or len(me) < 4 or not sib:
        return text
    ss = sentences(text)
    tag = [next((w for w in [me, *sib] if re.match(rf"\W*{re.escape(w)}\b", x.casefold())), None) for x in ss]
    if me not in tag or not any(t in sib for t in tag):
        return text
    out, cur = [], None
    for x, t in zip(ss, tag):
        cur = t or cur
        if cur in (None, me):
            out.append(x)
    return " ".join(out)


def _runins(regrouped):
    """{label key: [(block name key, paragraph)]}: every bold run-in paragraph of the book (`**NeoElastian:** A metahuman
    body …`), with the block it is printed in."""
    out, block, cur = {}, "", None
    for ln in (regrouped or "").splitlines():
        if ln.startswith("<!-- item") or ln.startswith("<!-- section"):
            mm = re.search(r'"name": "([^"]*)"', ln)
            block, cur = _key(mm.group(1)) if mm else "", None
            continue
        if ln.startswith(("#", "|", "<!--")) or not ln.strip():
            cur = None
            continue
        if mm := re.match(r"^\W*\*\*([^*]{2,40}?):\*\*\s*(.*)$", ln):
            cur = [mm.group(2)]
            out.setdefault(_key(mm.group(1)), []).append((block, cur))
        elif cur is not None:
            cur.append(ln.strip())
    return {k: [(b, re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(p))) for b, p in v] for k, v in out.items()}


def apply(files, texts_xml, regrouped=""):
    """(files, texts): the catalog files (`{name: xml}`, crb._Catalog.xml's one entry a line) with each entry's effects,
    tests and links as its text and the book's tables state them (read(), table(), links()), in place of the ones read
    before (an add-on's effects on its host, read from the host's text, stay); and the texts with a variant's own run-in
    paragraph added to its description where the book prints it under the parent's heading (`Genotype Enhancement
    (NeoElastian)`: `**NeoElastian:** …`)."""
    from xml.sax.saxutils import quoteattr
    texts = {}
    for m in re.finditer(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', texts_xml or "", re.S):
        texts[(m.group(1), m.group(2))] = _unesc(m.group(3))
    rows = _tables(regrouped)
    by_name = {}
    for header, row in rows:
        if row and row[0]:
            by_name.setdefault(_key(re.sub(r"[*†‡]+$", "", row[0])), []).append((header, row))
    ids = {f[:-4]: set(re.findall(r'^\s*<\w+ id="([^"]+)"', x or "", re.M)) for f, x in files.items()}
    runins, added = _runins(regrouped), {}
    names = {f[:-4]: [_unesc(n) for n in re.findall(r"<name>(.*?)</name>", x or "")] for f, x in files.items()}
    out = {}
    for fname, xml in files.items():
        kind = fname[:-4]
        if kind in SKIP_KINDS or not xml:
            out[fname] = xml
            continue
        lines = []
        for ln in xml.splitlines(keepends=True):
            m = _ENTRY.match(ln)
            if not m:
                lines.append(ln)
                continue
            ind, tag, eid, attrs, name, kids = m.groups()
            text = texts.get((kind, eid), "")
            nm = _unesc(name)
            if (pm := re.match(r"(.+?) \(([^()]+)\)", nm)) and len(text) < 200:
                base, var = _key(pm.group(1)), _key(pm.group(2))
                got = [p for b, p in runins.get(var, ()) if b and (b in base or base in b)] or \
                    ([p for _, p in runins[var]] if len(runins.get(var, ())) == 1 else [])
                got = sorted(got, key=len, reverse=True)  # (the label's line and the text's paragraph: the fuller)
                if got and got[0] not in text:
                    text = (text + "\n" + got[0]).strip()
                    added[(kind, eid)] = text
            text = _own_part(text, nm, names.get(kind, ()))
            found = read(text, kind, nm) + links(text, kind)
            for t, a, _ in found:  # a link's entry: this book's, or the book its citation names (`p. 70, SR6`)
                if t == "link":
                    sl = _slug(a["name"])
                    if a.get("kind") and sl in ids.get(a["kind"], ()):
                        a["ref"] = sl
                    elif a.get("book"):
                        a["ref"] = f"{a['book'].lower()}.{sl}"
                    a.pop("book", None)
            tab = by_name.get(_key(nm), [])
            if not tab and (pm := re.search(r"\(([^()]+)\)\s*$", nm)):
                tab = [(h, r) for h, r in by_name.get(_key(pm.group(1)), [])]  # (`Cyberjack (Rating 1)`: the row `Rating 1`)
            if kind == "ammotypes":  # (an ammo type's AR and DV: modifiers of the weapon it is loaded in)
                at = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
                tab = tab or [(["AR", "DV"], [_unesc(at.get("ar", "")), _unesc(at.get("dv", ""))])]
            for header, row in tab:
                w = row[1] if len(tab) > 1 and len(header) > 1 and header[1].strip().upper() == "BASE" else None
                for t, a, _ in table(header, row, kind):
                    found.append((t, {**a, **({"when": w} if w else {})}, None))
            kept = _KEEP.findall(kids)
            kids = _DROP.sub("", kids)
            new = "".join(f"<{t}{''.join(f' {k}={quoteattr(str(v))}' for k, v in a.items())}/>" for t, a, _ in found)
            new = "".join(dict.fromkeys(kept + re.findall(r"<[^>]+/>", new)))
            cut = kids.find("<text>")
            kids = kids + new if cut < 0 else kids[:cut] + new + kids[cut:]
            lines.append(f'{ind}<{tag} id="{eid}"{attrs}><name>{name}</name>{kids}</{tag}>\n')
        out[fname] = "".join(lines)
    if added and texts_xml:
        from xml.sax.saxutils import escape

        def sub(m):
            t = added.get((m.group(1), m.group(2)))
            return m.group(0) if t is None else f'<text of="{m.group(1)}" id="{m.group(2)}">{escape(t)}</text>'
        texts_xml = re.sub(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', sub, texts_xml, flags=re.S)
    return out, texts_xml
