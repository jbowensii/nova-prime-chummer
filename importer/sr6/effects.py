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
- `action:<name>` an Edge or Matrix action; `action-max:<name>` the cap on an action's bonus;
- `complex-form:<name>` a complex form named as what the bonus is on; `lifestyle:<name>` lifestyle points;
- `resource:<name>` a creation resource (`contact-points`); `skill-max:<id>` a skill's maximum;
- `sense:<name>` a sense the entry is named for or grants; `pool:chase` the chase pool's Edge; `pricemod:<what>` a
  price in percent; and the derived `monthly-cost`, `essence-hole`, `unarmed-damage` and `power-points`.
docs/sr6-data-format.md, "Effects", is the full grammar (every target family, operation and value).

Operations: `add` (+N, or -N), `set` (the value replaces it: an infected type's attribute maximum), `edge` (N bonus
Edge on those tests), `edge-cost` (Edge boosts and actions on them cost N more, -N less), `edge-cost-set` (an Edge
action's new cost), `no-edge` (no Edge may be spent on them), `no-edge-gain` (no Edge may be gained on them),
`wild-die` (a die of the pool is a wild die), `hits` (N extra hits), `threshold` (the test's threshold changes by N).

Values: a number; `R` (× the line's rating, level or Force: `adds its rating`, `per level`), `R*N`; or a formula over
attributes (`edg/2`: half your Edge, rounded down), which is shown, never applied.

How it is turned on (`switch`): none (always on), `wireless`, `activated` (at will, an action, overdrive), `sustained`,
`conditional` (some tests or situations only). An effect read from a sentence that sets a condition is
`confidence="low"`: shown, never applied (owner decision D3); `when` holds the condition's words (`magician`,
`smell-based`, `in VR`).

Links (owner decision 2026-10-10): an entry that grants another (`gain the Built Tough quality`, `1 free level of Rapid
Healing`) or works as another (`the same result as a Personalized Grip`) holds <link rel="grants|as" kind name>; after
every book is read, copy_links() also copies the linked entry's effects into it (owner direction 2026-10-17: every entry
holds the effects of its whole object), each `from` the linked id, the link marked `copied`: the app and the Foundry
module then read the copies, not the link."""
import re

from importer.reflow import reflow

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
         "summoning": "conjuring", "summon": "conjuring", "banishing": "conjuring", "alchemy": "enchanting", "artificing": "enchanting",
         "disenchanting": "enchanting", "compiling": "tasking", "registering": "tasking", "decompiling": "tasking",
         "ground craft": "piloting", "aircraft": "piloting", "watercraft": "piloting", "visual": "perception",
         "aural": "perception", "tactile": "perception", "scent": "perception", "taste": "perception",
         "astral combat": "astral", "assensing": "astral", "repair": "engineering", "jump": "athletics",
         "climb": "athletics", "swim": "athletics", "lock picking": "engineering", "sleight-of-hand": "stealth",
         "sleight of hand": "stealth", "cybercombat": "cracking", "hearing": "perception", "sight": "perception", "smell": "perception", "impersonate": "con", "impersonating": "con", "disguising": "con", "pickpocket": "stealth", "picking pockets": "stealth", "falling": "athletics",
         "flying": "athletics"}
# what each skill is used for, as the core rulebook's skill descriptions list it (CRB pp. 94-98): an activity a test is
# named by -> the skill it is a test of (owner decision 2026-10-10: tests named by activity are stored as that skill)
ACTIVITIES = [
    (r"grappl\w*|grapple|punch\w*|stab\w*|clubbing|melee|brawl\w*|unarmed (?:combat|attacks?)|parry\w*|block\w*", "close-combat"),
    (r"escap\w*(?: bonds| restraints)?|flexibility|fitting into tight spaces|contortion\w*|sprint\w*|running|run|dodg\w*|diving|"
     r"free-?falling|falling|climb\w*|swim\w*|jump\w*|leap\w*|gymnastics|tumbl\w*|acrobatics|balance|lifting|throw\w*|"
     r"physical exertion|endurance", "athletics"),
    (r"first aid|heal\w*|medic\w*|treat\w*|surgery|installing cyberware|diagnos\w*", "biotech"),
    (r"acting|disguis\w*|imperson\w*|performance|lying|lie|bluff\w*|deceiv\w*|decept\w*|fast-talk\w*|seduc\w*", "con"),
    (r"summon\w*|bind\w*|banish\w*", "conjuring"),
    (r"hacking|cybercombat|electronic warfare|jamming|brute force|backdoor", "cracking"),
    (r"computers?|hardware|software|kludg\w*|matrix search\w*", "electronics"),
    (r"alchemy|artificing|disenchant\w*|crafting foci", "enchanting"),
    (r"repair\w*|build\w*|juryrig\w*|jury-rig\w*|lockpick\w*|picking locks|maglocks?|demolitions?|gunnery|armorer|mechanic\w*", "engineering"),
    (r"shooting|firing", "firearms"),
    (r"etiquette|instruct\w*|teach\w*|intimidat\w*|leadership|lead\w*|negotiat\w*|haggl\w*|bargain\w*|persua\w*|inspir\w*", "influence"),
    (r"navigat\w*|survival|tracking|track\w*|forag\w*|hunting", "outdoors"),
    (r"notic\w*|spot\w*|search\w*|observ\w*|perceiv\w*|hearing|listen\w*|sight|smell\w*", "perception"),
    (r"driv\w*|pilot\w*|chases?|races?|racing|maneuver\w*", "piloting"),
    (r"spellcasting|casting spells|counterspell\w*|ritual spellcasting", "sorcery"),
    (r"sneak\w*|hid(?:e|ing)|palming|pickpocket\w*|picking pockets|sleight of hand|camouflag\w*|shadowing", "stealth"),
    (r"compil\w*|decompil\w*|register\w*", "tasking"),
    (r"assens\w*|astral combat", "astral"),
]
SPELL_CATEGORIES = ("combat", "detection", "health", "illusion", "manipulation")
# the core rulebook's standard weapon add-ons: a maker's own version named after one (`Colt Agent Special proprietary
# laser sight`) works as it (owner decision 2026-10-10: a link, so the standard item's effects follow)
STANDARD_ADDONS = ("laser sight", "smartgun system", "imaging scope", "silencer", "suppressor", "gas vent", "shock pad",
                   "personalized grip", "bipod", "tripod", "periscope", "airburst link", "flashlight")
SOFT_TYPES = ("autosoft", "skillsoft", "activesoft")
DERIVED = {"defense rating": "defense", "astral defense rating": "defense-astral", "matrix defense rating": "matrix-defense", "social defense rating": "social",
           "social rating": "social", "composure": "composure", "judge intentions": "judge-intentions",
           "memory": "memory", "lift": "lift", "lift/carry": "lift", "power point": "power-points", "power points": "power-points",
           "essence hole": "essence-hole"}
MATRIX = {"data processing": "data-processing", "firewall": "firewall", "sleaze": "sleaze", "attack attribute": "attack",
          "matrix attack": "attack", "overwatch score": "overwatch"}
ITEM = {"attack ratings": "ar", "attack rating": "ar", "ar": "ar", "damage value": "dv", "dv": "dv",
        "concealability threshold": "concealability", "concealability": "concealability", "handling": "handling",
        "acceleration": "acceleration", "speed interval": "speed-interval", "top speed": "top-speed",
        "size class": "size", "seat": "seats", "seats": "seats", "passenger capacity": "seats", "seating": "seats", "pilot rating": "pilot", "pilot": "pilot",
        "pilots": "pilot", "sensor rating": "sensor", "sensor": "sensor", "sensors": "sensor", "body value": "body", "armor value": "armor",
        "cargo space": "cargo", "cargo": "cargo", "cf": "cargo"}
# an add-on's name as the stat of its host it raises, where the name isn't a target word itself (a cyberlimb's Armor is
# its Defense Rating: `Increases to Armor increase your Defense Ratings`, CRB p. 289)
ADDON_STATS = {"armor": "derived:defense"}
VEHICLE_KINDS = {"vehicles", "vehicledesign"}
ITEM_KINDS = {"weapons", "armor", "gear", "electronics", "augmentations", "vehicles", "vehicledesign", "ammotypes", "programs"}
NUMBERS = {"zero": "0", "one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "six": "6", "seven": "7",
           "eight": "8", "nine": "9", "ten": "10", "single": "1", "fifteen": "15", "twenty": "20", "twenty-five": "25",
           "thirty": "30", "forty": "40", "fifty": "50", "hundred": "100", "one hundred": "100"}
# the senses the books grant as a rule of their own (CRB p. 118, Environment and Visibility; p. 275, visual and audio
# enhancements): an entry named for one, or a sentence granting one, has it (`sense:<name>`, shown, never summed)
SENSES = {"low-light vision": "low-light-vision", "low light vision": "low-light-vision", "thermographic vision": "thermographic-vision",
          "thermographic": "thermographic-vision", "low-light": "low-light-vision", "ultrasound": "ultrasound",
          "vision magnification": "vision-magnification", "wide band hearing": "wide-band-hearing", "wide-band hearing": "wide-band-hearing",
          "high frequency hearing": "high-frequency-hearing", "low frequency hearing": "low-frequency-hearing",
          "enhanced smell": "enhanced-smell", "echolocation": "echolocation", "astral perception": "astral-perception"}
# fire modes (CRB p. 109): a modifier limited to some of a weapon's modes keeps them as its condition
FIRE_MODES = r"semi-auto(?:matic)?|burst fire|full auto(?:matic)?|single shot|\bsa\b|\bbf\b|\bfa\b|\bss\b"
_CONDITION = re.compile(r"\b(?:when|whenever|while|if|unless|until (?=(?:you|they|the|it|he|she|its)\b)|after (?!the first\b)(?=(?:you|they|the|a|an|being|breaking|using|taking|making|spending|failing|succeeding)\b)|at will|only|as long as|in (?:any )?(?:form of )?(?:close combat|melee|combat)|(?:with|as|spend(?:ing)?|takes?|using) an? (?:minor|major) action|involving|"
                        r"related to|against|during|in (?:vr|the presence)|that use|that (?:directly )?involves?|used)\b", re.I)
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


def sentences(text, labels=False):
    """The text's sentences, a labelled line (`**Wireless bonus:** …`, `All: …`) and a list line each on its own; with
    `labels`, (label, sentence) pairs, the label holding for the rest of its paragraph (`**Wireless bonus:** … increases
    to 2. You gain a bonus Minor Action …`)."""
    out = []
    for para in re.split(r"\n(?=\s*(?:[•*]|\*\*[^*]+:\*\*|[A-Z][\w ]{1,30}:\s))|\n\s*\n", text or ""):
        one = _norm(para.replace("**", ""))
        # (a sentence may open with a quote; a clause after a semicolon is a statement of its own: `+2 to climbing tests;
        # if both hands and feet have setae, +4`, `Light armor reduces DV by 1; Medium armor by 2`)
        ss = [s for s in re.split(r"(?<=[.?])\s+(?=[A-Z(•“\"])|(?<=[.?]\))\s+(?=[A-Z])|(?<=!)\s+(?=[A-Z•“\"])|;\s+(?=\S)", one) if s.strip()]
        label = m.group(1) if ss and (m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+", ss[0])) else ""
        out += [(label, s) for s in ss] if labels else ss
    return out


# ---------- targets: a phrase -> [(target, when)] ----------
_ATTR_RX = "|".join(ATTRIBUTES)
_SKILL_RX = "|".join(sorted(SKILLS, key=len, reverse=True))
_TEST_WORDS = [  # (pattern, target): the test types a phrase names, longest first
    # (the defense tests against what is named: astral attacks, direct or indirect combat spells; owner direction 2026-10-17, the pools
    # Commlink6 splits Defense into)
    (r"(?:defen[cs]e|defensive) (?:tests?|pools?|dic?e) (?:against|vs\.?|versus) (?:all |any )?astral (?:attacks?|combat)|astral (?:defen[cs]e|defensive) (?:tests?|pools?|dic?e)|astral defen[cs]e(?! rating)|defend(?:ing)? against (?:all |any )?astral (?:attacks?|combat)", "test:defense-astral"),
    (r"(?:resist(?:ing|s)?|defen[cs]e|defensive|defend(?:ing)?)(?: tests?| pools?| dic?e)? (?:against|vs\.?|versus) (?:an? |all |any )?direct (?:combat )?spells?", "test:defense-spell-direct"),
    (r"(?:resist(?:ing|s)?|defen[cs]e|defensive|defend(?:ing)?)(?: tests?| pools?| dic?e)? (?:against|vs\.?|versus) (?:an? |all |any )?indirect (?:combat )?spells?", "test:defense-spell-indirect"),
    (r"damage resistance|resist(?:ing|s)? (?:physical |stun )?damage|soak(?:ing)? damage|soak(?:ing)?\b", "test:damage-resistance"),
    (r"drain(?: resistance)?|resist(?:ing)? drain", "test:drain-resistance"),
    (r"(?:toxin|poison|drug|pathogen|disease)s?(?: resistance)?|resist(?:ing)? (?:toxins?|poisons?|drugs?|pathogens?|diseases?)",
     "test:toxin-resistance"),
    (r"fatigue", "test:fatigue-resistance"),
    (r"defen[cs]e tests?|defensive tests?|defending|defense pools?|(?:spell |boosted )*defense dic?e", "test:defense"),
    (r"social (?:tests?|interactions?|situations?|skill tests?|encounters?|actions?|checks?)|social\b", "test:social"),
    (r"addiction tests?", "test:addiction"),
    (r"magic(?:al)? resistance tests?|spell resistance|resist(?:ing|s)? (?:all |any )?(?:spells?|magic)\b", "test:magic-resistance"),
    (r"resist(?:ing|s)? (?:all |any )?[a-z]+(?:-based)? (?:attacks?|damage)", "test:damage-resistance"),
    # (the two Matrix actions the data knows, CRB pp. 177-178: Edge on a Matrix search, dice for Matrix Perception checks;
    # any other Matrix test stays the family)
    (r"matrix search(?:e?s)?", "action:matrix-search"),
    (r"(?:normal |standard )?matrix perception(?: checks?)?", "action:matrix-perception"),
    (r"resonance (?:tests?|actions?)", "test:resonance"),
    (r"matrix (?:tests?|actions?)", "test:matrix"),
    (r"(?:magic(?:al)?|magic skill) tests?|(?:any |the corresponding )?(?:magical )?skills? involving magic|corresponding magical skills?", "test:magic"),
    (r"physical (?:tests?|activities|activity|skills?)|tests? (?:involving|using|that use) (?:one of )?(?:the |your )?(?:four )?physical attributes?", "test:physical"),
    (r"mental (?:tests?|skills?)|tests? (?:involving|using|that use) (?:one of )?(?:the |your )?(?:four )?mental attributes?", "test:mental"),
    (r"(?<!close )(?:attack|combat) (?:tests?|rolls?)", "test:combat"),
    (r"surprise tests?", "test:surprise"),
    (r"(?:when )?targeted by (?:a |any )?spells?", "test:magic-resistance"),
    (r"crash tests?", "test:crash"),
    (r"vehicle tests?", "test:vehicle"),
]


_ACTION_STOP = {"a", "an", "one", "additional", "extra", "bonus", "free", "the", "minor", "major", "matrix", "this", "that", "same",
                "any", "all", "and", "or", "each", "every", "other", "another", "first", "second", "next", "following", "previous", "new", "single",
                "legal", "illegal", "hacking", "combat", "social", "physical", "mental", "specific", "appropriate", "such", "its", "their",
                "your", "own", "chosen", "selected", "no", "non", "per", "sustained", "threaded"}
_NOT_ACTION = r"(?:" + "|".join(sorted(_ACTION_STOP, key=len, reverse=True)) + r")\b"
_NOT_A_NAME = {"for", "of", "to", "in", "on", "with", "by", "at", "tests", "test", "skill", "skills", "hostile", "dice", "bonus", "particular", "given", "using"}  # (words that make a phrase before `matrix actions` no action's name)


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
                         r")[- ](?:based|linked)\b|\b(?:tests?|skills?|skill tests?) (?:that are |which are )?(?:linked|tied) to (?:the |your )?(" + _ATTR_RX + r")\b", p):
        add(f"test:attr-{ATTRIBUTES[m.group(1) or m.group(2) or m.group(3)]}", m.start(), m.end())
    for m in re.finditer(r"\b(maximum|max)\b", p):
        pass
    for m in re.finditer(r"\btests? (?:that|which) (?:involve|involves|use|uses|include|includes) ((?:(?:" + _ATTR_RX + r")(?:,? or |,? and |,\s*)?)+)", p):
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


_PER_LEVEL = re.compile(r"\b(?:per|each|every|for each|for every)\s+(?:level|rank|rating|point of (?:rating|force)|rating point|grade)\b|"
                        r"\b(?:level|rating) of (?:this|the)\b", re.I)
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
        return "wireless", None
    if "overdrive" in lab:
        return "activated", "overdrive"
    for k, rx in _SWITCH:
        if rx.search(s):
            return k, None
    for m in _CONDITION.finditer(low):
        words = _cond_words(s, m.start()) or ""
        if re.match(r"(?:when|if|once) (?:this|the) [a-z]+ is (?:taken|chosen|selected|purchased|bought)\b", words):
            continue  # (`When this way is taken`: the entry itself)
        if m.group(0) == "only" and re.search(r"\b(?:can|may|must|should|could|will)\s*$", low[:m.start()]) or words == "used":
            continue  # (`that can only be spent on …`, `each time it is used`: no condition on the effect)
        if (re.match(r"(?:when|whenever|while|if) (?:you |they |the (?:character|user|adept) )?(?:are |is )?(?:perform|mak|us|roll|attempt|tak|do)\w* (?:an? |any |all |the |your |their )?(?:(?!\b(?:on|against|using|with|by|of|for|(?:this|that)(?! tests?\b))\b)[a-z' ()-])*?\b(?:tests?|checks?|rolls?|skill|actions?)\s*(?:\((?:see )?p\.[^)]*\))?\s*$", words)
                or re.fullmatch(r"(?:when|whenever|while|if) (?:you are |they are )?targeted by (?:a |any )?spells?", words)) \
                and (targets(words) or _activity(words)):
            continue  # (`When performing a Juryrigging test`: which test, not a condition; `… tests to recognize people` is one)
        if (m.group(0) in ("involving", "related to", "that use", "used") or "involve" in m.group(0)) and \
                (targets(words if "involve" in m.group(0) else low[max(0, m.start() - 8):m.start()] + words)
                 or any(re.search(rf"\b(?:{rx})\b", words) for rx, _ in ACTIVITIES)):
            continue  # (`tests involving grappling`, `… one of the four physical attributes`: which tests, not a condition)
        return "conditional", words
    return None, None


def _cond_words(s, at):
    """The condition's words: its clause from the condition word (`when you can be smelled`), up to fourteen words."""
    clause = re.split(r"[,;:.]", re.sub(r"\s*\((?:see )?pp?\.[^)]*\)", "", s[at:]), maxsplit=1)[0]  # (less a page citation)
    words = " ".join(clause.split()[:14]).strip().lower()
    words = re.split(r"\s+and (?:suffer|cannot|can't|lose|take)\b", words)[0]  # (`while moving faster … and suffer a -1 penalty`: the penalty is the effect)
    if words.count("(") > words.count(")"):  # (cut inside a parenthesis: `… a tense situation (only`: without the open one)
        words = words[:words.rfind("(")].strip()
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
                          r"if (?:you|they) do not (?:use|spend) it[^.;]*|but the edge(?: point)? is lost if[^.;]*|if not used[^.;]*)", re.I)


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


_NATURAL_KINDS = {"augmentations", "qualities", "critterpowers", "martialtechniques", "spells"}  # (a spell hardening the fists, `Stone Fist`)
_NATURAL = re.compile(r"\b(?:unarmed|natural weapons?|close combat|melee attacks?|kicks?|claws?|bites?|horns?|tusks?|spikes?|thorns?|fangs?|punch\w*|fists?|limbs?|leaps?)\b", re.I)
# (what is no natural weapon's in any entry: another kind of item)
_NOT_NATURAL = re.compile(r"\b(?:firearms?|guns?|pistols?|rifles?|drones?|vehicles?|ammunition|swords?|knives|knife|clubs?|blades?|axes?|polearms?|thrown|weapon accessor\w*|melee weapons?)\b", re.I)
# (a weapon the character holds, `a favoured weapon`, `this weapon's AR`: an item's in an entry that is not a natural weapon; `wielding`: both)
_HELD = re.compile(r"(?<!natural )\bweapons?\b|\bweapon['’]s\b", re.I)
_WIELD = re.compile(r"\bwield\w*", re.I)
# (an entry that IS a natural weapon: its AR and DV are the unarmed attack's, `That weapon gains +2 Attack Rating` is the natural weapon)
_NATURAL_NAME = re.compile(r"\b(?:natural weapons?|horns?|tusks?|claws?|bites?|spurs?|spikes?|fangs?|thorns?|quills?|stingers?)\b", re.I)


def _natural_entry(text, kind, name, cls):
    return bool("BIOWARE_WEAPON" in (cls or "") or _NATURAL_NAME.search(name or "")
                or (kind in ("critterpowers", "qualities") and re.search(r"\b(?:choose|select|pick) (?:an? |one )?natural weapons?\b|\bthis natural weapon\b", text or "", re.I)))


_EDGE_SET = re.compile(r"[•\s]*(?P<n>[A-Z][\w’' !-]+?)(?: (?P<w0>only on [A-Za-z ]+?))? \((?P<v>\d+)(?:,\s*\d+)*(?:,? or \d+)?(?:(?: (?:Edge|Karma))(?: (?P<w1>only [^)]*))?\)|\) Edge)(?: (?P<w2>(?:only )?on [^.]*))?.*")


def read(text, kind=None, name=None, cls=""):
    """[(tag, attrs, None)]: the effects, tests and links the text states, in the order printed, each once."""
    out = []
    natural_entry = kind in _NATURAL_KINDS and _natural_entry(text, kind, name, cls)
    # (a table of `DICE POOL MODIFIER`s by situation, `TIME SINCE IMPRESSION | 1 week | –2`, `NATURE OF ITEM`: the gamemaster's, no
    # flat effect of the entry; Paradigm Shift)
    text = _situations(text)
    prev_tests = []  # (the last sentence's skill and test targets: `… for such tests` in the next one)
    last_named = []  # (the clause before's skill and test targets, effects or not: `… hindered in Athletics tests …; Edge Actions cost 1 point higher`)
    carried = None  # (`Once activated, roll …`: the sentences after it are the activated thing's, owner 2026-10-11)
    stated = {}  # (owner decision 8, 2026-10-11: a stat with its number in one sentence, `Firewall 2`, for the next one's back-reference)
    edge_actions = bool(re.search(r"\bedge cost\b", text or "", re.I))
    ai = bool(re.search(r"\bAIs?\b|\bAI's\b", text or ""))  # (an AI's initiative is its Matrix initiative)
    last_who = "caster"
    opposed = bool(re.search(r"\bopposed test\b", text or "", re.I))
    for label, s in sentences(text, labels=True):
        if m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+(.*)$", s):
            label, s = m.group(1), m.group(2)
            if targets(label, kind) and re.match(r"[+-]\s?\d", s):
                s = f"{label} {s}"  # (`**AR:** +2`, `**Body:** +1`: the label names the target)
        if re.match(r"\W*(?:for (?:example|instance)\b|e\.g\.|such as\b)", s, re.I):
            # (`For example, the −1 modifier for 3 boxes can be removed`: an illustration of
            # a rule, no effect of its own; a worked `Example:` of an entry's own numbers stays read, Off Road Chassis)
            continue
        if any(x[0] == "effect" for x in out) and not re.search(r"\b(?:each|per)\b", s, re.I) and re.match(
                r"\W*(?:it )?(?:may|can) be (?:purchased|taken|bought|selected) (?:twice|two times|up to \w+ times|multiple times)\b[^.]*\btotal\b", s, re.I):
            continue  # (`+1 DV. May be purchased twice for a total +2`: the sum of buying it again, after the effect itself was read)
        role = ROLES.get(label.casefold())
        s = re.sub(r"\bvs\.(?=\s)", "versus", s)  # (`vs. astral attacks`: the full stop ends no clause)
        s = _USE_OR_LOSE.sub(_keep_on, s)  # (`a point of Edge that must be spent on that test`, then a loss clause: use it or lose it, no condition)
        s = re.sub(r"\s*\((?:that is|e\.g\.|i\.e\.|for example|for instance|also reflected)\b[^)]*\)?", "", s, flags=re.I)  # (an example in parentheses; `(also reflected in their Attack Rating)`: the number again, no effect of its own, CRB p. 264)
        # (a critter power's restriction in its name, `Movement (Self Only)`, `Magical Guard (self only, p. 69 …)`, and a
        # price's note, `(–10 Karma if character is already Awakened)`: no condition on the sentence's effects)
        s = re.sub(r"\s*\((?:self only\b|[+–-]\s*\d+\s+Karma\b)[^()]*\)", "", s, flags=re.I)
        s = _DRAIN_UP.sub("", s)  # (`a cost of +1 Drain for each additional status`, `increases the spell's Drain by 1`: the spell's own cost)
        sw, when = _sw(s, label)
        if sw is None and carried and not _CONDITION.search(s.casefold()):
            sw = carried
        carried = "activated" if re.match(r"\W*(?:once|when|while) (?:activated|active)\b", s, re.I) else carried if sw == carried else None
        when = when or role
        low_formula = False
        if role and not sw:
            sw = "conditional"
        per_n = None
        if (per := re.search(r"\b(?:each|every|per) (?P<n>whole |two |three |four )?points? of (?:your |their |the )?(?:own )?(?!rating|force|level)([a-z][a-z -]{2,25}?)(?=[,.;:)]|\s+(?:and|or|that|which|you|they|the|to|for|above|below|beyond|over)\b|$)", s, re.I)) \
                and not _PER_RATED.search(s) and not re.search(r"\b(?:rating|level|force)\b", per.group(2), re.I) \
                and not re.search(r"points? of (?:standard )?armor added over", s, re.I):  # (read in _rules: a stat lost per point of armor)
            sw, when = "conditional", f"per point of {per.group(2).lower()}"  # (`each point of your Essence loss`: a formula)
            low_formula = True
            if (n := NUMBERS.get((per.group("n") or "").strip().lower())) and n != "1":  # (`every two points of nanite volume`: a formula over the quantity)
                per_n = f"{_slug(per.group(2))}/{n} {_rounding(s)}"
                low_formula = False
        rounding = _ROUNDING.search(s)
        if kind == "datastructures" and sw is None:
            sw = "activated"  # (a data structure is activated with a Minor Action for the next action, Hack & Slash p. 70)
        if kind in ("spells", "rituals", "complexforms") and sw in (None, "activated"):
            sw = "sustained"  # (a spell's, ritual's or complex form's: while it is cast and lasts)
        if label.casefold() in ("effect", "effects") and kind == "gear" and not sw:
            sw = "activated"  # (a drug's or toxin's `Effect:` line: while it acts)
        others = _OTHERS.search(s) and not (kind in ("spells", "rituals", "complexforms") and re.match(r"\W*(?:the )?(?:targets?|subjects?)\b", s, re.I)) \
            and not re.search(r"\b(?:oppose|resist|counter|defend against)\b[^.]*\btests? to (?:see|spot|notice|find|hear|track|detect)\b", s, re.I)  # (dice to oppose the tests to spot them: the owner's)
        if re.search(r"\b(?:it|this|the \w+) has an? (?:initiative|body|armor|pilot|sensor|device rating)\b", s, re.I) or re.search(r"\b(?:required|needed) to (?:reload|ready|fire|operate|set up)\b", s, re.I):
            continue  # (what it costs to use, or its own stat line: not the entry's effect)
        if others:  # (owner decision 16, 2026-10-11: what others get against the entry is kept, `affects="others"`, never counted on the runner)
            who = "others"
        elif kind in ("spells", "rituals", "complexforms"):  # (a sentence opening with a pronoun is about whom the one before was)
            # (`However, … they cannot gain or spend Edge`: a they with no one named is the sentence
            # before's target, as one opening with it)
            # (`They can select how many net hits they apply to the target`: the target named, it is the target's)
            if (re.match(r"\W*(?:they|them|it|he|she|this|these|their|its)\b", s, re.I) and not (
                    _TARGET_WORDS.search(s) and not _CASTER_WORDS.search(s))) or (
                    re.search(r"\b(?:they|them|their)\b", s, re.I) and not _TARGET_WORDS.search(s) and not _CASTER_WORDS.search(s)):
                who = last_who
            elif (who := _affects(s)) == "caster" and opposed and not _TARGET_WORDS.search(s) and not _CASTER_WORDS.search(s) \
                    and re.search(r"\b(?:each|every|per)\s+(?:net\s+)?hits?\b[^.]*\b(?:reduc|lower|decreas)\w+", s, re.I):
                who = "target"  # (`Each net hit reduces (attribute) by 1` after an opposed test: what it does to the one it is rolled against)
            last_who = who
        else:
            who = None
        if stated and (bm := _BACK_REF.search(s)):  # (`Its Firewall attribute is cumulative with other devices`)
            for t, _ in targets(bm.group("t"), kind):
                if t in stated:
                    out.append(_fx(t, "add", stated[t], sw, when))
        stated = {t: v for m in _STATED.finditer(s) for t, _ in targets(m.group("t"), kind)[:1] for v in [m.group("v")]}
        if (lm := _LEVELS_AFTER_FIRST.search(s)) and prev_tests:  # (owner 2026-10-11: `R-1`, a value per level after the first)
            n = lm.group("v")
            for t, spec in prev_tests:
                out.append(_fx(t, "add", "R-1" if n == "1" else f"R*{n}-{n}", sw, when, spec))
        here = []
        resist = _RESIST_OF.search(s)
        got = _rules(s, kind, sw, when, edge_actions, label, ai, last_named)
        if kind in _NATURAL_KINDS and (natural_entry or _NATURAL.search(s)) and not _NOT_NATURAL.search(s) and (natural_entry or not _HELD.search(s) or (_WIELD.search(s) and _NATURAL.search(s))):
            # (a body modification's, quality's, critter power's or martial technique's Attack Rating or Damage Value is the natural
            # weapon's: the unarmed attack's, not an item's; thorns, horns, tusks, `Iron Limbs`. A sentence that names a wielded weapon
            # covers both the unarmed attack and the item: `including when wielding weapons`)
            both = bool(_WIELD.search(s) or re.search(r"\bmelee attacks?\b|\barmed or unarmed\b", s, re.I))  # (`+1 AR for melee attacks`: with a weapon or without)
            got = [y for t, a, x in got for y in (
                [(t, {**a, "target": "derived:unarmed-" + a["target"][5:]}, x)] + ([(t, a, x)] if both else [])
                if t == "effect" and a["target"] in ("item:ar", "item:dv") else [(t, a, x)])]
        if prev_tests and not any(x[0] == "effect" for x in got) and (bm := re.search(
                r"\b(?:gains?|receives?|gets?) (?:an? )?(?P<v>[+-]?\d+) (?:dice pool )?(?:bonus|modifier)\b(?!\s+(?:to|on|for|when|against))", s, re.I)):
            # (`if both hands and feet have setae, they gain a +4 dice pool bonus`: the tests of the clause before)
            got = [_fx(t, "add", _val(bm.group("v"), s), sw, when, spec) for t, spec in prev_tests]
        # (`That attribute's maximum (but not current) rank increases by 1`: the maximum, not the attribute; Exceptional
        # (Attribute), CRB Hong Kong p. 71)
        maxed = {x[1]["target"][9:] for x in got if x[0] == "effect" and x[1]["target"].startswith("attr-max:")}
        got = [x for x in got if not (x[0] == "effect" and x[1]["target"].startswith("attr:") and x[1]["target"][5:] in maxed)]
        for x in got:
            if x[0] == "effect":
                if who:
                    x[1]["affects"] = _edge_who(s, who) if x[1]["op"] in _EDGE_OPS and who != "others" else who
                if low_formula:
                    x[1]["confidence"] = "low"
                if per_n and re.fullmatch(r"-?1", x[1]["value"]):
                    x[1]["value"] = ("-" if x[1]["value"].startswith("-") else "") + per_n
                if re.fullmatch(r"-?[a-z][a-z-]*/\d+", x[1]["value"]):
                    x[1]["value"] = f"{x[1]['value']} {_rounding(s)}"  # (`edg/2`: the book's rounding, RU when silent)
                if resist and x[1]["target"].endswith("-resistance") and not x[1].get("switch"):
                    # (owner 2026-10-11: `resistant to ingested poisons … Edge on tests to resist`: a condition, noted)
                    x[1]["switch"], x[1]["when"] = "conditional", resist.group("obj").strip().lower()
                if x[1]["target"].startswith(("skill:", "test:")) and (x[1]["target"], x[1].get("spec")) not in here:
                    here.append((x[1]["target"], x[1].get("spec")))
                if re.search(r"\bnet hits?\b|\b(?:each|every|per) hit\b", s, re.I) and re.fullmatch(r"-?(?:1|R)", x[1]["value"]):
                    x[1]["value"] = ("-" if x[1]["value"].startswith("-") else "") + "hits"  # (`1 per net hit`: shown, never applied)
            out.append(x)
        if here:
            prev_tests = here
        if re.search(r"\b(?:is|are) also (?:active|effective|in effect) (?:on|in) the astral plane\b", s, re.I):
            # (Mystic Armor, CRB p. 158: `Gain 1 point of Armor for each level … Mystic Armor is also active on the astral plane`: the
            # Defense Rating it gave is the astral one too)
            out += [("effect", {**x[1], "target": "derived:defense-astral"}, None) for x in list(out) if x[0] == "effect" and x[1]["target"] == "derived:defense"]
        last_named =here or [(t, w) for t, w in targets(s, kind) if t.startswith(("skill:", "test:"))]
        for m in _TEST.finditer(s):
            out.append(("test", {"skill": f"skill:{m.group(1).casefold().replace(' ', '-')}",
                                 "attr": f"attr:{ATTRIBUTES[m.group(2).casefold()]}", "threshold": m.group(3)}, None))
    uniq, at = [], {}
    for x in out:  # each once; the same effect on several of a skill's tests: one, its conditions (specializations) joined
        k = (x[0], tuple(sorted((a, b) for a, b in x[1].items() if a not in ("when", "spec"))), "spec" in x[1])
        if k in at:
            for f in ("when", "spec"):
                w0, w1 = uniq[at[k]][1].get(f), x[1].get(f)
                if w1 and w0 and w1 not in w0.split(", "):
                    uniq[at[k]][1][f] = f"{w0}, {w1}"
            continue
        at[k] = len(uniq)
        uniq.append((x[0], dict(x[1]), x[2]))
    if _REMOVED_BAND.search(text or ""):  # (owner 2026-10-11: the longest range band removed, shown `—`)
        ar = next((x for x in uniq if x[0] == "effect" and x[1]["target"] == "item:ar" and x[1]["op"] == "add" and x[1]["value"].count(",") == 4), None)
        if ar:
            ar[1]["value"] = ",".join(ar[1]["value"].split(",")[:4] + ["x"])
        else:
            uniq.append(_fx("item:ar", "add", "0,0,0,0,x"))
    for x in uniq:  # (a defense pool the book names by what it defends against, `against astral attacks`, needs no condition saying so)
        if x[0] == "effect" and x[1]["target"] in ("test:defense-astral", "test:defense-spell-direct", "test:defense-spell-indirect") \
                and re.match(r"(?:against|versus)\b", x[1].get("when", "")):
            x[1].pop("when")
            if x[1].get("switch") == "conditional":
                x[1].pop("switch")
    # (`+1 die for any Perception (Hearing) tests`: read twice, the plain skill and the specialization: the specialization only)
    same = lambda x, y: x[0] == y[0] == "effect" and all(x[1].get(k) == y[1].get(k) for k in ("target", "op", "value", "switch", "when"))  # noqa: E731
    uniq = [x for x in uniq if not (x[0] == "effect" and "spec" not in x[1] and any(same(x, y) and "spec" in y[1] for y in uniq))]
    if kind in VEHICLE_KINDS | {"gear"} and (pairs := _road_pairs(text)):
        # (tires that give on the road and take off it: the stat as the on-road/off-road pair, not two conditions)
        gone = {f"item:{k}" for k in pairs}
        uniq = [x for x in uniq if not (x[0] == "effect" and x[1]["target"] in gone and x[1]["op"] == "add")] + \
            [_fx(f"item:{k}", "add", v) for k, v in pairs.items()]
    return uniq


_ROAD_STAT = r"(?P<stat>acceleration|speed interval|handling)"
_ROAD_SIDE = ((re.compile(r"\boff[- ]?road\b"), 1), (re.compile(r"\bon[- ]?road\b|\bon (?:the )?(?:pavement|street)\b"), 0))


def _road_pairs(text):
    """{stat: 'on-road/off-road'} for a tire's Acceleration and Speed Interval as the book prints them for the road and for the
    off-road (Double Clutch pp. 122-123: one sentence gives the figures for one, another turns them into penalties for the
    other): a stat in a sentence about the road and in one about the off-road; {} when it isn't printed both ways."""
    got = {}
    for s in sentences(text):
        low = s.casefold().replace("–", "-").replace("−", "-")
        side = next((i for rx, i in _ROAD_SIDE if rx.search(low)), None)
        if side is None:
            continue
        for m in re.finditer(r"(?<![\w.])(?P<n>[+-]?\d+)\s+(?:to (?:the )?)?" + _ROAD_STAT.replace("?P<stat>", "?P<s1>") + r"|" +
                             _ROAD_STAT.replace("?P<stat>", "?P<s2>") + r"\s+by\s+(?P<n2>[+-]?\d+)", low):
            stat, n = (m.group("s1"), m.group("n")) if m.group("s1") else (m.group("s2"), m.group("n2"))
            got.setdefault(stat.replace(" ", "-"), {}).setdefault(side, n.lstrip("+"))
    return {k: f"{v[0]}/{v[1]}" for k, v in got.items() if len(v) == 2}


_TARGET_WORDS = re.compile(r"\b(?:the |a |each |any |one )?(?:voluntary )?(?:targets?|subjects?|recipients?|affected|device|object|vehicle|drone|"
                           r"ally|allies|individual|person|creature|item)\b", re.I)
_CASTER_WORDS = re.compile(r"\b(?:the (?:caster|spellcaster|magician|technomancer|shaman)|you|your)\b", re.I)


def _affects(s):
    """Whom a spell's or complex form's sentence says it affects (owner decisions 2026-10-10): `target` when it names the
    target, subject, device … before the caster; else `caster` (it names the caster, `you gain`, or no one)."""
    t, c = _TARGET_WORDS.search(s), _CASTER_WORDS.search(s)
    return "target" if t and (not c or t.start() < c.start()) else "caster"


_EDGE_OPS = ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die")


def _edge_who(s, who):
    """Whom an Edge sentence gives (or denies) the Edge: the caster or target named nearest before its verb, `the caster gains
    1 Edge` in `… in an area affected by …, the caster gains 1 Edge`, `you gain` in `When using this form on a target …, you gain …`; `who` (the sentence's first named) when none is."""
    v = re.search(r"\b(?:gains?|gets?|receives?|spend)\b", s, re.I)
    head = (s[:v.start()] if v else "").rsplit(",", 1)[-1]  # (the verb's own clause: `If the subject resists your spell, they gain 1 Edge`)
    last = [(m.end(), w) for w, rx in (("target", _TARGET_WORDS), ("caster", _CASTER_WORDS)) for m in rx.finditer(head)]
    return max(last)[1] if last else who


def _rounding(sentence):
    """`RD` or `RU`: how the book rounds a formula's result (owner decision 13, 2026-10-11: `(rounded down)` RD,
    `rounded up` RU, silent RU)."""
    m = _ROUNDING.search(sentence)
    return "RD" if m and ((m.group("dir") or "").lower() == "down" or m.group("dir2")) else "RU"


def _activity(phrase):
    """[(test:other, the words)] for tests a phrase names by activity (`tests involving grappling, escaping bonds`),
    else []."""
    m = re.search(r"\b(?:tests?|checks?|rolls?)\b(?: (?:involving|related to|for|to|made (?:to|for)) (?P<a>[^.;]{3,80}))?", phrase)
    head = " ".join(phrase.split()[:10])
    if not m and any(re.search(rf"\b(?:{rx})\b", head) for rx, _ in ACTIVITIES):
        m = re.match(r"(?P<a>.+)", head.strip())  # (a phrase opening with the activity: `searching for items that glow`)
    if not m:
        return []
    words = (m.group("a") or phrase[:m.start()]).strip(" ,")
    words = re.sub(r"\s*\([^)]*$", "", re.sub(r"^(?:all|any|your|their|the)\s+", "", words)[:70]).strip()  # (an unclosed parenthesis: cut)
    if not words or re.fullmatch(r"(?:that|this|the|it|them|those|these|such|a|an|same|each|every|any|all)(?: (?:test|tests|roll|rolls))?", words):
        return []  # (`that test`: a pronoun, not an activity)
    out = {}
    for rx, skill in ACTIVITIES:  # (the skill each activity is a test of, from the book's skill descriptions)
        for mm in re.finditer(rf"\b(?:{rx})\b", words):
            spec = mm.group(0) if SPECS.get(mm.group(0)) == skill else None
            got = out.setdefault((f"skill:{skill}", spec), [])
            phrase = re.sub(r"\s+(?:or|and)$", "", re.match(r"[^,;]*?(?=\s+(?:or|and)\s|[,;]|$)", words[mm.start():]).group(0).strip())  # (`escaping bonds`)
            if phrase not in got:
                got.append(phrase)
    return [(t, spec, ", ".join(w)) for (t, spec), w in out.items()] or [("test:other", None, words)]


# (a rise in the spell's, form's or preparation's own Drain is its cost, no effect: `Drain Value is also increased by +2`,
# `each additional person increases the spell's Drain by 1`, `+1 Drain for each additional status`, `Poor Healer`'s `+1 Drain
# Value`; a rise of the Drain *resistance* is not)
_DRAIN_UP = re.compile(r"\bincreas\w*\s+(?:the |a |an |its |your |their )?(?:[a-z]+['’]s\s+)?drain(?: value)?(?![\s-]+resist)(?:\s+by\s+(?:\+?\d+|one|two|three)\b)?|"
                       r"(?<!resist )(?<!resisting )\bdrain(?: value)?(?:\s+of\s+the\s+\w+)?\s+(?:is |are |being )?(?:also )?(?:increas\w*|rais\w*)(?:\s+by\s+(?:\+?\d+|one|two|three)\b)?|"
                       r"\+\d+\s+drain(?: value)?\b(?![\s-]+resist)", re.I)
_OTHERS = re.compile(r"^\W*(?:(?:additionally|also|however|furthermore|in addition|but|and)\W+)?"
                     r"(?:those(?! with)|anyone|anybody|someone|others|opponents?|attackers?|enemies|observers?|onlookers?|"
                     r"spellcasters?|targets?|the target|anyone else|an? (?:observer|opponent|attacker|enemy|onlooker)|"
                     r"other (?:individuals|characters|people|runners|players)|(?:npcs|pcs)\b|"
                     r"(?:characters|people|individuals|anyone) (?:trying|attempting|looking|who|that))\b|"
                     r"\b(?:tests?|attacks?|spells?) (?:made |cast )?against (?:you|them|the character|the user)\b|"
                     r"\btests? to (?:[a-z]+ ){1,3}(?:for )?(?:your|you)\b|"
                     r"\bfor (?:anyone|others|those)\b|"
                     # (`your targets suffer -2`, not `a bonus when interacting with your target`: the one the bonus is rolled against)
                     r"\byour (?:opponents?|enemies|attackers?)\b|(?<!with )(?<!against )(?<!of )\byour targets?\b|"
                     # (the pursued one's gear against the pursuers: `any ground vehicles in pursuit suffer`, not `your vehicle in pursuit gains`)
                     r"\b(?:(?:any|all|other|enemy|opposing) (?:[a-z-]+ )?(?:vehicles?|drones?) (?:in pursuit|pursuing)|pursuing (?:[a-z-]+ )?(?:vehicles?|drones?))\b(?! of\b)|"
                     r"\b(?:to|for) (?:anyone|anybody) (?:who|that|conducting|attempting|trying|making|performing|looking)\b|"
                     r"\b(?:perception )?tests? to (?:see|spot|notice|find|hear|track|detect) (?:them|you|the (?:character|user|individual))\b|"
                     r"^\W*users? of (?:the|this) \w+ grants?\b", re.I)
_TEST = re.compile(rf"\b({'|'.join(s.title() for s in SKILLS)})\s*\+\s*({'|'.join(a.title() for a in ATTRIBUTES)})"
                   rf"\s*\((\d+)\)\s+test\b")
_VAL = r"(?P<v>[+-]?\s?\d+(?:\.\d+)?|one|two|three|four|five|six|an?|single)"
_LOSS = re.compile(r"\b(?:lose[sd]?|losing|suffers?|subtract\w*|minus|penalt\w*|fewer|reduc\w*)\b[^.;]{0,30}$")  # (`loses 2 dice for …`: a penalty, not a bonus; left unread)
_PER = r"(?:\s+(?:per|for each|each)\s+(?:level|rating(?: point)?|point of (?:rating|force)|hit))?"


def _val(v, s, at=None):
    v = (v or "").strip().casefold()
    v = "1" if v in ("a", "an") else NUMBERS.get(v, v).replace(" ", "")
    v = v.lstrip("+")
    return _rated(s, v, at)


def _negated(low, at):
    """Whether the clause before `at` denies it (`does not add`, `nor do they add`)."""
    return bool(re.search(r"\b(?:not|nor|never|n't)\b[^.;,]{0,25}$", low[:at]))


def _rules(s, kind, sw, when, edge_actions, label, ai=False, prev=()):
    """The effects one sentence states (`ai`: the entry is an AI's, whose initiative is its Matrix initiative; `prev`:
    the clause before's tests, for an Edge cost stated after a semicolon)."""
    low = s.casefold()
    out = []
    matrix_init = bool(re.search(r"\b(?:vr|matrix|hot sim|cold sim)\b", low)) or ai

    def emit(ts, op, value, w=None, phrase=""):
        if not ts and phrase:  # (tests the book names by activity, `tests involving grappling`: shown with its words)
            ts = _activity(phrase)
        for t, spec, *words in ts:  # (an activity's: the words it is named by, `escaping bonds, flexibility`)
            if t.startswith("attr:") and op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die"):
                t = "test:attr-" + t[5:]  # (Edge on Logic tests: tests using the attribute)
            if op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die") and t.startswith(("item:", "matrix:")):
                continue
            out.append(_fx(t, op, value, sw or ("conditional" if words else None), (words[0] if words else None) or w or when, _spec(t, spec)))

    # an attribute's maximum (`maximum (but not current) rank increases by 1`, `maximum Body and Strength by one point`)
    bare = re.sub(r"\s*\([^)]*\)", "", low)  # (`(as listed in the Metatype Attribute Table, p. 64, SR6)`)
    for m in re.finditer(r"\b(?:maxim(?:um|ums|a)|racial limits?)\b(?:\s*\(but not current\))?(?P<t>[^.]{0,60}?)(?:rank\s+)?(?:is |are )?(?P<dir>increas\w*|decreas\w*|rais\w*|lower\w*)"
                         r"\s+by\s+" + _VAL, bare):
        ts = [(t, w) for t, w in targets(bare[:m.start("dir")], kind) if t.startswith("attr:")] or \
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
    for m in re.finditer(r"(?:\bcannot|\bcan't|\bmay not|\bcan not|\bcan never|\bmay never|\bnever|\bunable to|\bnot (?:be |being )?able to|\bdoes not|\bdo not|n't) (?P<what>(?:gain|earn|spend|use)"
                         r"(?: or (?:gain|earn|spend|use))?)(?: any)? edge(?: (?:points?|boosts?|actions?))?(?: (?:on|for|in|during|when making|when)\s+"
                         r"(?P<t>[^.;]*))?", low):
        what = m.group("what")
        before = low[:m.start()] if re.search(r"\b(?:tests?|rolls?|checks?|skills?)\b", low[:m.start()]) else ""
        named = m.group("t") or ""
        if re.match(r"the purposes? of\b", named):  # (`for the purposes of sneaking while carrying …`: the activity, as a test)
            named = re.split(r"\s+(?:while|when|if|whenever|during)\b", re.sub(r"^the purposes? of\s+", "", named))[0] + " tests"
        ts = targets(named, kind) or [x for x in targets(before, kind) if x[0] != "attr:edg"] or \
            [("test:all", None)]  # (`When using that skill …, you may not …`; `you may not gain or spend Edge`: on any test)
        role = re.match(r"\W*(technomancer|magician|adept|decker|rigger)s?\b", low)  # (`Technomancers who take this drug … will not be able to`: theirs only)
        n_ = len(out)
        if what in ("gain", "earn") or re.search(r"\b(?:gain|earn)\b", what):
            emit(ts, "no-edge-gain", "1")
        if re.search(r"\b(?:spend|use)\b", what):
            emit(ts, "no-edge", "1")
        fail = re.search(r"\bfail(?:ure|s|ed)?\b", low[:m.start()])  # (`Failure means … the penalty of not being able to spend Edge`: after a failed test only)
        for x in out[n_:]:
            if (role or fail) and not x[1].get("when"):
                x[1]["switch"], x[1]["when"] = "conditional", role.group(1) if role else "on failure"
    for m in re.finditer(r"\bthe cost of (?:any |all )?edge (?:actions?|boosts?)(?: (?:or|and) (?:actions?|boosts?))?(?P<t>[^.;]*?) (?:are|is) "
                         r"(?P<dir>increased|raised|reduced|lowered|decreased) by (?P<v>\w+)", low):
        sign = "-" if m.group("dir") in ("reduced", "lowered", "decreased") else ""
        emit(targets(m.group("t"), kind), "edge-cost", sign + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\bedge (?:boosts?|actions?)(?: (?:and|or) (?:boosts?|actions?))? cost (?P<v>\w+) (?P<dir>less|more)"
                         r"(?: (?:for|on|when making|when|to|in|during|with)\s+(?P<t>[^.;]*))?", low):
        v = _val(m.group("v"), low)
        emit(targets(m.group("t") or "", kind), "edge-cost", ("-" if m.group("dir") == "less" else "") + v.lstrip("-"), phrase=m.group("t") or "")
    for m in re.finditer(r"\b(?P<dir>reduc\w*|lower\w*|increas\w*|rais\w*) the (?:edge )?cost of (?:any |all |the )?edge "
                         r"(?:boosts?|actions?)(?: (?:and|or) (?:boosts?|actions?))?(?: by (?P<v>\w+))?"
                         r"(?P<t>[^.;]*)", low):
        v = _val(m.group("v") or "1", low)
        sign = "-" if m.group("dir").startswith(("reduc", "lower")) else ""
        emit(targets(m.group("t"), kind), "edge-cost", sign + v.lstrip("-"))
    for m in re.finditer(r"\bedge (?:actions?|boosts?)(?: and (?:actions?|boosts?))? cost (?P<v>\w+) (?:points? )?(?P<dir>higher|lower)", low):
        ts = [x for x in targets(low[:m.start()], kind) if x[0] != "attr:edg"] or list(prev)  # (`… Athletics tests …; Edge Actions and Boosts cost 1 point higher`: the clause before's tests)
        emit(ts, "edge-cost", ("-" if m.group("dir") == "lower" else "") + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\b(?:reduc|lower)\w* the (?:edge )?cost of (?:any |all |the |your |their )?edge (?:boosts?|actions?)(?P<t>[^.;]*?)\bby (?P<v>one|two|\d+)\b(?P<after>[^.;]*)", low):
        if not targets(m.group("t"), kind) and targets(m.group("after"), kind):  # (`… by one on tests like Stealth (Palming)`)
            emit(targets(m.group("after"), kind), "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))
            continue
        if re.match(r"\s*(?:(?:and|or) (?:boosts?|actions?))?\s*$", m.group("t")) and not targets(m.group("after"), kind):
            if sw == "conditional" and when and not any(x[1]["op"] == "edge-cost" for x in out):
                emit([("test:all", None)], "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))  # (`Whenever you are affected by noise, reduce the cost of any Edge boosts or actions by 1`: every test, then)
            continue  # (read above)
        emit(targets(m.group("t"), kind), "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\bedge (?:boost |action )?costs? (?:are |is )?(?P<dir>increas\w*|reduc\w*|lower\w*) by (?P<v>\w+)(?P<t>[^.;]*)", low):
        sign = "-" if m.group("dir").startswith(("reduc", "lower")) else ""
        ts = targets(m.group("t"), kind) or targets(low[:m.start()], kind)
        emit(ts, "edge-cost", sign + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\breduce the edge cost of the (?P<n>[\w ’'-]+?) edge action(?: by (?P<v>\w+))?", low):
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost", "-" + _val(m.group("v") or "1", low).lstrip("-"), sw, when))
    if edge_actions and (m := _EDGE_SET.fullmatch(s)):
        # (`Bootleg Turn (1 Karma)`: the Stunt Driver's list prints Karma where its lead-in says half the Edge cost; `Double Down (1,2, or 3
        # Edge only on Engineering [Gunnery] tests)`, `Double Down only on Piloting tests (1,2, or 3 Edge)` and `Double Down (1,2, or 3)
        # Edge on any test made while chasing`: the lowest, with its condition)
        cond = next((c for c in (m.group("w0"), m.group("w1"), m.group("w2")) if c), None)
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost-set", m.group("v"), "conditional" if cond else sw,
                       re.sub(r"\[([^\]]*)\]", r"(\1)", cond if cond.startswith(("on ", "only")) else "only " + cond) if cond else when))
    edge_rx = (r"(?:\b(?:in addition to(?: the)?(?= \d)|bonus of|gain(?:s|ing)?|receiv(?:es?|ing)|gets?|getting|grant(?:s|ing)?(?: you(?= an? bonus point of edge))?|gives?|giving|provid(?:es?|ing)|offers?|confers?|has|have|earns?|with|and|plus|add(?:s|ing)?)|\+)\s*(?:the (?:character|user|adept|individual) )?"
               r"(?:an? (?=\+))?(?P<v>an?|one|two|three|\d+|\+\d+)?\s*(?:additional |extra |bonus |free |situational )*(?:points? of )?"
               r"(?:situational |bonus )?edge(?: points?| bonus)?(?: (?:that|which) (?:must|can|may) be [^.,;]*?(?= on| for| when|$))?"
               r"(?: (?:to (?:your|their|the) dice pool )?(?:on|for|to use on|when (?:making|attempting|performing|using|rolling)|when|in|during|before making|to|vs\.?|versus|against)\s+(?P<t>[^.;]*))?")
    chase_pool = bool(re.search(r"\bchase pool\b|\bedge at the (?:start|beginning) of (?:every|each)", low))  # (a chase pool's Edge: pool:chase, below)
    for m in re.finditer(r"\b(?:gains?|receives?|gets?|adds?|grants?)(?: the (?:character|user|adept|magician|individual))? edge (?:and [^.;]*? )?(?:on|for|to|when making|when) (?P<t>[^.;]*)", low):
        if not re.search(r"(?:\bcannot|\bnot|n't|\bnever)\s*$", low[:m.start()]) and not chase_pool:
            emit(targets(m.group("t"), kind), "edge", "1", phrase=m.group("t"))  # (`gain Edge when searching for …`: the activity)
    for m in re.finditer(edge_rx, low):
        if chase_pool:
            break
        if re.search(r"\b(?:when|if|whenever)\s+having\b[^,.;]*$", low[:m.start()]):
            continue  # (`does not apply when having a lower Social Rating grants Edge`: a condition of the rule, no Edge given)
        if re.search(r"(?:\bcannot|n't|\bnot|\bnever)\s*$", low[:m.start()]):
            continue
        if not m.group("v") and not re.search(r"\b(?:bonus|situational|points? of|an? edge|(?:grants?|gives?) (?:the \w+ )?edge)\b", m.group(0)):
            continue
        t = m.group("t") or ""
        ts = list(prev) if prev and re.match(r"\s*(?:that|those|such|these) tests?\b", t) else targets(t, kind)  # (`a bonus point of Edge on that test`: the one before's)
        if not ts:  # (`Whenever you assense …, gain a point of Edge`, `Outdoors and Perception tests … gain an Edge`)
            clause = [c for c in re.split(r"[,;]|(?<=[a-z])-(?=(?:on|for|in|when|with)\b)", low[:m.start()]) if c.strip()]
            last = clause[-1] if clause and not re.match(r"\s*(?:or|and|nor)\b", clause[-1]) else ""  # (the end of a list is not the whole list)
            ts = (targets(last, kind) if last else []) or targets(low[:m.start()], kind)  # (the clause just before first: `on those Con (Disguise) tests, gain a point of Edge`)
        if not ts and not _activity(t):
            if not _activity(low[:m.start()]):  # (`When performing a Juryrigging test, you gain a point of Edge`)
                if sw == "conditional" and when:  # (owner decision 9, 2026-10-11: Edge on a condition, no test named: shown with its words)
                    emit([("test:other", None, when)], "edge", _val(m.group("v") or "1", low).lstrip("+"))
                continue
            t = low[:m.start()]
        emit(ts, "edge", _val(m.group("v") or "1", low).lstrip("+"), phrase=t)
    for m in re.finditer(r"\bspend (?P<v>\w+) (?:extra|additional|more) points? of edge on edge (?:boosts?|actions?)[^.;]*?"
                         r"(?: (?:on|for) (?P<t>[^.;]*?))?(?= when\b|[.;]|$)", low):
        emit(targets(m.group("t") or "", kind), "edge-cost", _val(m.group("v"), low).lstrip("+"))
    for m in re.finditer(r"\bgains? (?P<v>\d+|an?|one|two|three) (?:additional |extra |bonus )hits? when (?P<t>resisting [^.;]*)", low):
        emit(targets(m.group("t"), kind), "hits", _val(m.group("v"), low), phrase=m.group("t"))  # (`gains one bonus hit when resisting an attack`, Granite)
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three) (?:additional|extra|bonus) hits? (?:on|to|for) (?:all |any |your )*(?P<t>[^.;]*)", low):
        emit(targets(m.group("t"), kind), "hits", _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:use|swap in|roll|adds?|gains?|and|imposes?|replace[sd]? [^.]* with)\s+(?:a|the|one|an additional|an extra|a bonus)\s+wild die(?: (?:on|for|with|in|to)\s+(?:all (?:of )?)?(?:your )?(?P<t>[^.;]*))?", low):
        ts = targets(m.group("t") or "", kind) or targets(low[m.end():], kind) or targets(low[:m.start()], kind)  # (`… with a wild die when rolling any toxin test`; `on a Judge Intentions test … replace one of the dice with a Wild Die`)
        emit(ts or ([("test:combat", None)] if kind == "weapons" else []), "wild-die", "1")

    # initiative dice and score
    for m in re.finditer(r"(?:\+\s?(?P<a>\d+)\s?d6 (?:to )?(?:your )?(?:matrix )?initiative|"
                         r"(?P<b>\d+|an?|one|two|three|four|five|its rating in|its rating as)\s+(?:additional |extra |bonus )?(?:matrix )?initiative di(?:c)?e|"
                         r"\+\s?(?P<c>\d+)\s+initiative di(?:c)?e|initiative di(?:c)?e(?: [^.]{0,40})? by (?P<d>\d+|its rating|one|two)|"
                         r"adds? (?P<e>\d+|an?|one)\s*d6 (?:to )?initiative)", low):
        if re.search(r"\b(?:up to|maximum of|max(?:imum)? of|no more than|at most)\s*(?:a |the |normal )*(?:maximum of )?$", low[:m.start()]):
            continue  # (`up to a maximum of five initiative dice`: a cap)
        raw = next(g for g in (m.group("a"), m.group("b"), m.group("c"), m.group("d"), m.group("e")) if g)
        v = "R" if "rating" in raw else _val(raw, low)
        out.append(_fx("derived:matrix-initiative-dice" if matrix_init else "derived:initiative-dice", "add", v, sw, when))
    for m in re.finditer(r"\+\s?(?P<v>\d+) (?:to )?(?:your |the )?(?P<mx>matrix )?initiative(?! di)(?: score)?\b|"
                         r"(?:matrix )?init(?:iative)? bonus of \+?(?P<w>\d+)", low):
        v = _val(m.group("v") or m.group("w"), low)
        out.append(_fx("derived:matrix-initiative" if (m.group("mx") or matrix_init) else "derived:initiative",
                       "add", v, sw, when))

    # condition monitor boxes, Minor and Major Actions, Hardened Armor, Overwatch, movement
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three|an additional|one additional|\+\d+)\s+(?:additional |extra |bonus )?boxe?s?\b(?! (?:farther|further) down| of damage)"
                         r"(?P<t>[^.;]{0,60}?)(?P<which>physical|stun|condition)? ?(?:condition )?monitor", low):
        if _negated(low, m.start()):
            continue  # (`nor do they add a Condition Monitor box`)
        which = "stun" if "stun" in m.group(0) else "matrix" if "matrix" in m.group(0) else "physical"
        v = _val(m.group("v").replace("additional", "").strip(), low)
        out.append(_fx(f"derived:{which}-monitor", "add", v, sw, when))
    for m in re.finditer(r"\+\s?(?P<v>\d+) (?P<w>physical|stun) (?:condition monitor )?boxes", low):
        out.append(_fx(f"derived:{m.group('w')}-monitor", "add", m.group("v"), sw, when))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:additional|extra|bonus|free|more)\s+(?:(?P<v2>\d+|one|two|three)\s+)?(?P<w>minor|major) actions?|"
                         r"\+\s?(?P<u>\d+) (?P<x>minor|major) actions?", low):
        if re.match(r"\s*(?:are |is )?(?:required|needed|to (?:reload|ready))", low[m.end():]) or \
                re.search(r"\b(?:with|for|using|spend(?:ing)?|requires?|takes?|costs?|by taking|must (?:also )?(?:use|spend|take))\s+$", low[:m.start()]):
            continue  # (`3 additional Major Actions required to reload`: a cost)
        if m.group("u"):
            v, w = m.group("u"), m.group("x")
        else:
            v, w = _val(m.group("v2") or m.group("v"), low), m.group("w")  # (`an additional two Minor Actions`)
        out.append(_fx(f"derived:{w}-actions", "add", v, sw, when))
    for m in re.finditer(r"\buse (?:the )?(?P<n>[^.;]*?) (?P<w>minor|major) actions? (?:an additional|one more|an extra|another) time\b", low):
        out.append(_fx(f"derived:{m.group('w')}-actions", "add", _val("1", low), sw, when or m.group("n").strip()))  # (`use the Move and Avoid Incoming Minor Actions an additional time per combat round per rating point`)
    # the rules of their own: a mode-limited Attack Rating modifier, an ammunition belt, a sense, a monthly cost, a chase
    # pool's Edge, a cost in percent, a skill's maximum, a Matrix attribute cumulative with other devices
    for m in re.finditer(r"\b(?P<dir>decreas|reduc|lower|increas|rais)\w* the (?P<modes>(?:" + FIRE_MODES + r")(?:(?:,\s*|\s+and\s+|\s+or\s+)(?:" + FIRE_MODES + r"))*) attack ratings? (?:modifiers?|penalt(?:y|ies)) by (?P<v>\d+|one|two|three)\b", low):
        v = _val(m.group("v"), low)
        sign = "" if m.group("dir") in ("decreas", "reduc", "lower") else "-"  # (a smaller penalty: a higher Attack Rating)
        out.append(_fx("item:ar", "add", sign + v, sw, when or re.sub(r"\s+and\s+|\s+or\s+", ", ", m.group("modes"))))
    for m in re.finditer(r"(?P<v>\d[\d,]*)-round (?:belt|magazine|drum|clip|cassette)", low):
        if kind in ITEM_KINDS or kind == "accessories":
            out.append(_fx("item:ammo", "set", m.group("v").replace(",", ""), sw, when))
    for m in re.finditer(r"\b(?:gains?|grants?|provides?|has|have|possess(?:es)?|receives?|confers?)\s+(?:the (?:user |character )?|an? |its users? )?(?:ability of )?(?P<s>" + "|".join(sorted(SENSES, key=len, reverse=True)) + r")\b", low):
        if not _negated(low, m.start()) and not re.search(r"\b(?:persons?|those|people|anyone|characters) with\s*$", low[:m.start()]):
            out.append(_fx(f"sense:{SENSES[m.group('s')]}", "add", "1", sw, when))
    for m in re.finditer(r"\b(?:pays?|costs?|spend|donates?|gives?)\s+(?:at least )?\(?(?:an additional |an extra )?(?:(?:quality|the quality's|its|their) )?(?P<r>level|rating)?\s*(?:x|×|times)?\s*(?P<v>\d[\d,]*)\s*(?:nuyen|¥)?\)?(?:\s+per (?:level|rating)(?: of this \w+)?)?\s+(?:per|a|each|every) month|"
                         r"\blifestyle costs? (?:increases?|is increased|rises?) by (?P<w>\d[\d,]*) nuyen (?:per|a|each) month", low):
        v = (m.group("v") or m.group("w")).replace(",", "")
        out.append(_fx("derived:monthly-cost", "add", f"R*{v}" if m.group("r") else _rated(low, v), sw, when))
    for m in re.finditer(r"\bchase pool\b[^;]*?(?:begins|starts) with (?P<v>\d+|one|two|three) edge", low):
        out.append(_fx("pool:chase", "add", _val(m.group("v"), low)))  # (`when your chase pool becomes available`: the pool, not a condition)
    if re.search(r"\b(?:chase|race)s?\b", low) and (m := re.search(r"\bgain (?:a point of |an? |one |\d+ )?edge at the (?:start|beginning) of (?:every|each) (?:combat )?round", low)):
        out.append(_fx("pool:chase", "add", _val("1", low), sw, when or "at the start of every round"))
    for m in re.finditer(r"\b(?:increas\w*|rais\w*) the (?:cost|price)s? of (?:all |any |their |your )?(?P<t>armor|clothing|lifestyles?|gear|everything|all (?:items|gear))(?: and (?:clothing|armor|gear))? by (?P<v>[a-z-]+|\d+) percent|"
                         r"\b(?P<v2>[a-z-]+|\d+) percent (?:boost|increase|rise) in (?:the )?(?P<t2>lifestyle|armor|gear) costs?|"
                         r"\bincreas\w* (?:the )?(?P<t3>lifestyle|armor|gear) costs? by (?P<v3>[a-z-]+|\d+) percent|"
                         r"\b(?P<t4>clothing|armor|gear)\b[^.;]*?\bcost increase of (?P<v4>[a-z-]+|\d+) percent", low):
        t = next(g for g in (m.group("t"), m.group("t2"), m.group("t3"), m.group("t4")) if g)
        v = number(next(g for g in (m.group("v"), m.group("v2"), m.group("v3"), m.group("v4")) if g))
        if v:
            t = {"clothing": "armor", "lifestyles": "lifestyle", "all items": "everything", "all gear": "everything"}.get(t, t)
            out.append(_fx(f"pricemod:{t}", "add", str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
    for m in re.finditer(r"\blifestyle costs? (?:are |is )?(?:lowered|reduced|decreased) by (?P<l>[a-z-]+|\d+) percent|"
                         r"\b(?:armor and clothing|clothing and armor|armor|clothing)\b[^.;]*?\bpurchased at an? (?P<a>[a-z-]+|\d+) percent (?:increase|boost) to the base cost|"
                         r"\bincrease the cost of any fitted gear\b(?: \([^)]*\))? by (?P<f>[a-z-]+|\d+) percent per level", low):
        # (a price in percent, written as the book words it: `Lifestyle costs are lowered by fifteen percent`, `specially designed … at a fifty
        # percent increase to the base cost`, `fitted gear … ten percent per level`; Body Shop p. 104, Companion pp. 123, 126)
        if m.group("l") and (v := number(m.group("l"))):
            out.append(_fx("pricemod:lifestyle", "add", "-" + str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
        elif m.group("a") and (v := number(m.group("a"))):
            out.append(_fx("pricemod:armor", "add", str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
        elif m.group("f") and (v := number(m.group("f"))):
            out.append(_fx("pricemod:armor", "add", "R*" + str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
    for m in re.finditer(r"\b(?:your |the )?skill maximum for the (?:selected|chosen) skill is (?P<v>\d+)\b|"
                         r"\bmaximum rating (?:that can be obtained |that can be reached )?(?:in|for|of) (?:a|one|any|the chosen|the selected) skill is (?:increased|raised) by (?P<w>one|two|\d+)\b", low):
        if m.group("v"):
            out.append(_fx("skill-max:choice", "set", m.group("v"), sw, when))
        else:
            out.append(_fx("skill-max:choice", "add", _val(m.group("w"), low), sw, when))
    for m in re.finditer(r"\b(?:its|the|this device's) (?P<a>firewall|data processing|sleaze|attack) attribute is cumulative with", low):
        n = re.search(r"\b" + m.group("a") + r" (\d)\b", low)
        if n:
            out.append(_fx(f"matrix:{MATRIX.get(m.group('a'), m.group('a').replace(' ', '-'))}", "add", n.group(1), sw, when))
    for m in re.finditer(r"\bwhen using (?P<n>[a-z][a-z'—–-]+(?:[ —–-](?!reduce\b)[a-z][a-z'-]+){0,3}?), reduce (?:either )?the edge cost(?: \([^)]*\))? (?:[^.;]*?\bby (?P<v>\d+|one|two))?", low):
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost", "-" + _val(m.group("v") or "1", low).lstrip("-"),
                       None if (when or "").startswith("when using") else sw, None if (when or "").startswith("when using") else when))  # (the action named is the target, not a condition)
    for m in re.finditer(r"\b(?:gains?|receives?) the (?:(?P<n>[a-z][a-z' ,-]+?) )?knowledge skill(?: (?P<n2>[a-z][a-z' -]*?[a-z]))?(?=[,.;]| which| at| that| for| and|$)|"
                         r"\b(?:gains?|receives?) the (?:language )?(?P<n3>[a-z][a-z'-]+(?: [a-z][a-z'-]+)?)(?: language)? \((?P<lv>n|\d)\)(?: language)?(?: skill)?", low):
        if m.group("n3"):
            out.append(_fx("skill:language", "set", m.group("lv").upper(), sw, when, m.group("n3").title()))
        else:
            n = (m.group("n") or m.group("n2") or "").strip(" ,")
            out.append(_fx("skill:knowledge", "add", "1", sw, when, n.title() if n and n not in ("a", "an", "the", "this", "that") else None))
    if m := re.search(r"\badds? the (?:vehicle|drone)['’]s body to the attack rating(?: when (?P<w>[^,.;]+))?(?:,? one-half body if (?P<w2>[^.;]+))?", low):
        # (Shredders, Double Clutch p. 123: the vehicle's own Body, `bod`, on the item's Attack Rating when ramming; half of it against a vehicle)
        out.append(_fx("item:ar", "add", "bod", "conditional", (m.group("w") or "").strip() or None, None))
        if m.group("w2"):
            out.append(_fx("item:ar", "add", "bod/2 RU", "conditional", m.group("w2").strip()))
    # creation rules (Companion pp. 134, 138, Lofwyr's Legions p. 20): how many attributes or skills may start at their maximum, a drake's
    # Adjustment Attributes, `Gain +2 Hardened Armor`; the new targets `resource:maxed-out-attributes`, `resource:maxed-out-skills`
    # (`set`: the number allowed, 0 for `may not start with any`) and `resource:adjust-drake` (`add`)
    for m in re.finditer(r"\bup to (?P<n>\w+) (?P<w>attributes|skills) (?:at (?:their|its) maxim\w+|at rank 6)", low):
        out.append(_fx("resource:maxed-out-" + m.group("w"), "set", _val(m.group("n"), low).lstrip("+"), sw, when))
    for m in re.finditer(r"\bmay not start with any (?P<w>attributes|skills) at (?:your |their |its )?[\w’' ]*?maxim", low):
        out.append(_fx("resource:maxed-out-" + m.group("w"), "set", "0", sw, when))
    for m in re.finditer(r"\+(?P<n>\d+) to your (?:\w+ )?adjustment attributes", low):
        out.append(_fx("resource:adjust-drake", "add", m.group("n"), sw, when))
    if m := re.search(r"\bgains? \+?(\d+) hardened armor\b", low):
        out.append(_fx("derived:hardened-armor", "add", m.group(1), sw, when))
    if m := re.search(r"hardened armor(?: ability)?(?: \([^)]*\))?(?: at rating| rating| of|)\s+(\d+)", low):
        out.append(_fx("derived:hardened-armor", "add", m.group(1), sw, when))
    if m := re.search(r"\b(?:reduce (?:the )?(?:os|overwatch score)|(?:increases to the )?overwatch score (?:increases )?(?:are |is )?reduced) by (\w+)", low):
        out.append(_fx("matrix:overwatch", "add", "-" + _val(m.group(1), low).lstrip("-"), sw, when))
    for m in re.finditer(r"\b(?P<w>walking and running|walking|running|movement|flying|swimming|flight)(?: rates?| speed)? (?:by|of|to) "
                         r"\+?(?P<v>\d+/\+?\d+/\+?\d+)", low):
        w = {"flying": "flying", "flight": "flying", "swimming": "swimming"}.get(m.group("w"))
        out.append(_fx("derived:movement", "add", m.group("v").replace("+", ""), sw, ", ".join(x for x in (when, w) if x) or None))

    for m in re.finditer(r"\+?(?P<v>\d+/\+?\d+/\+?\d+)(?: per meter)? to (?:the |your |their )?(?P<w>movement|walking|running|flying|swimming)(?: rates?| speed)?\b", low):
        w = {"flying": "flying", "swimming": "swimming"}.get(m.group("w"))
        out.append(_fx("derived:movement", "add", m.group("v").replace("+", ""), sw, ", ".join(x for x in (when, w) if x) or None))
    for m in re.finditer(r"\b(?:gains?|receives?) an? essence hole of (?P<v>\d+(?:\.\d+)?)\b|\bfrees? up (?P<v2>\d+(?:\.\d+)?) essence\b", low):
        out.append(_fx("derived:essence-hole", "add", _val(m.group("v") or m.group("v2"), low), sw, when))  # (BN p. 21, SWC p. 132: per level)
    if re.search(r"temporarily increase your effective magic rating", low):
        # (a power focus, CRB p. 156: its Force added to every test where Magic is involved, the Sorcery pool among them)
        out.append(_fx("test:attr-mag", "add", "R", sw, when))
    # Essence per level or grade (Body Shop pp. 16, 169, Companion p. 146, Hack & Slash p. 129): a quality that takes Essence away at its
    # level (`attr:ess`, `-R`), an optional rule's hole by grade (`derived:essence-hole`, `R`; an AI's Spark for Neuromorphism)
    for m in re.finditer(r"\b(?:starting essence is reduced by the level|each level(?: taken)? costs? (?P<n>\w+) points? of essence)\b", low):
        n = NUMBERS.get(m.group("n"), m.group("n")) if m.group("n") else "1"
        out.append(_fx("attr:ess", "add", "-R" if n == "1" else f"-R*{n}", sw, when))
    for m in re.finditer(r"\b(?:gains?|expands?)(?: or expands?)? an essence hole\b[^.;]*?\bby (?P<v>\d+(?:\.\d+)?) essence with each (?:grade|level)\b|"
                         r"\badditional (?P<w>\d+(?:\.\d+)?) spark.s worth of codemods with each grade\b", low):
        v = m.group("v") or m.group("w")
        out.append(_fx("derived:essence-hole", "add", "R" if float(v) == 1 else f"R*{v}", sw, when))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:additional |extra |bonus )?(?:damage )?overflow box", low):
        out.append(_fx("derived:overflow", "add", _val(m.group("v"), low), sw, when))
    # unarmed damage made Physical (Dermal Deposits, bone lacing and bone density: CRB Hong Kong pp. 71, 286, 291)
    if (m := re.search(r"\bunarmed (?:combat |melee )?(?:damage|attacks?)\b[^.;]{0,40}?\bphysical\b", low)) and not _negated(low, m.start()) \
            and not re.search(r"\b(?:not|never|n't)\b", m.group(0)):
        out.append(_fx("derived:unarmed-damage", "set", "P"))  # (always: the sentence's condition is another clause's)
    for m in re.finditer(r"(?:(?:ar|attack ratings?)[^.;]{0,40}?|^|: ?)(?P<l>(?:[+-]?\d+|-)(?:/(?:[+-]?\d+|-)){4})(?!\d)", low):
        vals = m.group("l").split("/")
        if any(v.startswith(("+", "-")) and v != "-" for v in vals):  # (a modifier per range band: `+2/–/–1/–2/–3`)
            out.append(_fx("item:ar", "add", ",".join("0" if v == "-" else v.lstrip("+") for v in vals), sw, when))
    # dice and bonuses: `+N dice (pool bonus) to X`, `a +N bonus on X`, `X +N`, `increase X by N`, `adds its rating to X`
    found = []

    def bonus(ts, v, w=None):
        for t, spec in ts:
            if t in ("item:dv", "item:ar") and re.search(r"\bresist\w* [^.;]*?\bdamage\b", low) and not re.search(r"\b(?:weapon|attack)s?\b", low):
                continue  # (`roll Body to resist 7P damage, with +1 DV per level`: damage suffered, no item's)
            if t == "item:dv" and re.search(r"\bincoming\b", low):  # (`-1 to DV on every incoming attack`: damage reduction)
                t, v = "derived:damage-reduction", (v[1:] if v.startswith("-") else "-" + v)
            if t in ("attr:edg",) and re.search(r"\bedge (?:bonus|point)|(?:bonus|situational) edge|point of edge", low):
                continue
            found.append((t, v, spec, w))
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+)(?:d6)?\s*(?:(?:bonus |extra |additional )?(?:dice pool|dice|die)\s*"
                         r"(?:bonus|modifier|penalty|modifiers)?|bonus|modifier|penalty|points?)?"
                         r"(?:\s+(?:per|for each) (?:level|rating)(?: point)?(?: of [a-z ]+?)?)?(?: and [^.;]{0,25}?)?\s+(?:to|on|for|when|against)\s+"
                         r"(?:all |any |your |their |the |its |his |her |a |each )*(?P<t>(?:(?![+-]\s?\d)[^.;])*)", low):
        if re.match(r"\s?\d+\s?d6", low[m.start("v"):]):
            continue
        t = re.split(r"\b(?:up to|allowed|provided|as long as|for (?:every|each)|per)\b|\s(?:and\s+)?[+-]\s?\d+\s+(?:to|on)\b", m.group("t"))[0]  # (`+1 to DV and +2 to AR`: each its own; `for every initiative die`: a rate)
        # (`+2 to dice pools and +1 Edge when making Influence tests`: the tests named after the next bonus)
        # (the tests are borrowed from further on only when this one names none, `+2 to dice pools and`; `+2 to base movement rates` names
        # a thing of its own, not read here: it takes nobody else's target, Harvester)
        generic = re.fullmatch(r"\s*(?:(?:all |any )?(?:dice )?pools?|dice|tests?|rolls?)?(?:,?\s*and)?[\s,]*", t)
        bonus(targets(" ".join(t.split()[:10]), kind)[:6] or (targets(low[m.end():], kind)[:6] if generic else []), _val(m.group("v"), low, m.start("v")))
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+)\s+(?:points? of |to the |to your |to )?(?P<t>(?:[a-z]+ ){0,3}[a-z]+)", low):
        if re.match(r"(?:points? of |bonus )?edge\b", m.group("t")):
            continue  # (`+1 Edge on …`: Edge on tests)
        ts = targets(m.group("t"), kind)
        if ts and not re.match(r"\s?\d+\s?d6", low[m.start("v"):]):
            bonus(ts[:1], _val(m.group("v"), low, m.start("v")))
    for m in re.finditer(r"(?<![a-z])(?P<t>(?:[a-z]+ ){0,2}[a-z]+)\s(?P<v>[+-]\s?\d+)\b(?!\s?(?:d6|/|%|\s?percent))", low):
        ts = targets(m.group("t"), kind)  # (`Agility +1`, `Defense Rating +2`: the target right before the number)
        if low[max(0, m.start() - 1):m.start()] == "(":
            continue  # (`Near (Magic + 2)`: a formula, not a bonus)
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
        if rest and own and all(t.startswith("item:") for t, _ in own) and targets(rest.group("t"), kind):
            bonus(own, v, "for " + rest.group("t").strip())  # (`increases the concealability threshold by 1 for visual tests`: the item's stat, the tests are its condition)
        else:
            bonus(targets(rest.group("t"), kind) if rest and targets(rest.group("t"), kind) else own, v)
        for m2 in re.finditer(r"(?:,|\band)\s+(?:the |its |your |their )?(?P<t>[a-z][a-z' ]{1,40}?) by (?P<v>[+-]?\d+|one|two|three)\b",
                              low[m.end():]):
            v2 = _val(m2.group("v"), low)
            if re.match(r"(?:decreas|reduc|lower)\w*\b", m2.group("t")):  # (`… and decreases your Intuition by 1`)
                v2 = "-" + v2.lstrip("-")
            bonus(targets(re.sub(r"^(?:\w+s )?(?:your |their |the |its )", "", m2.group("t")), kind), v2)
    for m in re.finditer(r"\b(?:adds?|adding|gives?|provides?|grants?|gains?|receives?)\s+(?:its|their|the item's|the) (?:rating|force|level)"
                         r"(?: in (?:bonus |additional )?dice| as (?:a |extra |bonus )?(?:dice pool bonus|dice|bonus|extra \w+)|"
                         r" as (?:a )?(?:dice pool )?bonus)?\s+(?:to|on|for|when)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\badds? the (?:rating|force|level) of (?:the |this |these |its )?[a-z' -]{0,40}? to (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:4], "R")
    # a spell's or complex form's per hit (`net hits are added to the subject's Defense Rating`, `each net hit increases
    # the target's Overwatch Score by 1`): `hits`, shown, never applied
    for m in re.finditer(r"\b(?:net )?hits\b(?: on the [a-z ]+ test)? (?:are|is) added to (?:the (?:subject|target|caster|character)'s |your |their )?(?P<t>[^.;]*)|"
                         r"\b(?:each|every|per) (?:net )?hit (?:temporarily )?(?P<dir>increases?|adds?|raises?|boosts?|reduces?|decreases?|lowers?) (?:the (?:subject|target|caster|character)'s |your |their |the )?(?P<t2>[a-z ()' -]{2,40}?) by (?P<v>\d+|one|two)\b", low):
        if m.group("t2") and re.search(r"\bnoise\b", m.group("t2")):
            continue  # (a noise rating: no target of ours)
        for t, spec in targets(m.group("t") or m.group("t2"), kind)[:3]:
            sign = "-" if m.group("dir") and m.group("dir").startswith(("reduc", "decreas", "lower")) else ""
            found.append((t, sign + "hits", spec, None))
    for m in re.finditer(r"\badds? (?P<v>a|one|two|\d+) (?:point|box)s? to (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        if _negated(low, m.start()):
            continue
        bonus(targets(m.group("t"), kind)[:2], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:each|every|per) (?:level|rating)(?: of [a-z ]+?)? adds (?P<v>\d+|one|two|three) (?P<t>[a-z]{2,20}(?: [a-z]{2,20})?)\b", low):
        bonus(targets(m.group("t"), kind)[:1], _val(m.group("v"), low))  # (`Each level adds 2 CF`: the item's cargo, per level)
    for m in re.finditer(r"\b(?:gear )?bonus of (?P<v>[+-]\s?\d+) dice (?:to|on|for) (?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low, m.start("v")))  # (`a gear bonus of +2 dice to vehicle tests`, Pilot-By-Wire)
    for m in re.finditer(r"\b(?P<t>social (?:encounters|interactions)\b[^.;]*?) (?:are done )?with an? (?P<v>[+-]\s?\d+) dice pool modifier", low):
        bonus([("test:social", None)], _val(m.group("v"), low, m.start("v")))  # (`First social encounters with metahumans are done with a -1 dice pool modifier`, Hairless)
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+) (?:increase|boost|bonus) (?:to|in) (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:4], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:add|gain|receive|get)s?\s+(?:a number of )?dice equal to (?:its|their|the|your) (?P<x>[a-z][a-z ]{2,25}?)\s+"
                         r"(?:to|on|for)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        x = m.group("x")  # (`its rating`: R; `your Initiate Grade`: a formula over a value of the character's, shown)
        bonus(targets(m.group("t"), kind), "R" if re.search(r"\b(?:rating|force|level)$", x) else _slug(x))
    for m in re.finditer(r"\b(?:bonus|equal to (?:its|their) (?:rating|force|level)) (?:to|on) (?:your |their |the )?(?P<t>[^.;]*?)"
                         r"\s*(?:equal to (?:its|their) (?:rating|force|level))?$", low):
        if re.search(r"equal to (?:its|their) (?:rating|force|level)", m.group(0)):
            bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\b(?:gain|receive|get|add|grant)s?\s+(?:a |an |one |(?P<v>\d+|two|three|four) )?(?:additional |extra |bonus )+"
                         r"(?:dice|die)(?:\s+per (?:level|rating)(?: point)?)?\s+(?:to|on|for|when)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        # (a data structure adds its level in bonus dice, Hack & Slash p. 70: `Gain bonus dice on …` is its level)
        ts_ = targets(m.group("t"), kind)
        if not ts_ and kind == "datastructures" and (sm := re.match(r"a test to (?P<a>[a-z]+)(?: or (?P<b>[a-z]+))? an? (?:matching )?sprite", m.group("t"))):
            ts_ = [(f"action:{x}-sprite", None) for x in (sm.group("a"), sm.group("b")) if x]  # (`a test to compile or register a sprite`: those actions)
        bonus(ts_, "R" if kind == "datastructures" and not m.group("v") and " bonus dice " in m.group(0) else _val(m.group("v") or "1", low))
    for m in re.finditer(r"\b(?:grants?|gives?|provides?) (?P<v>one|two|three|an?|\d+) (?P<t>(?:[a-z-]+ ){1,3})(?:dice|die)\b", low):
        bonus([x for x in targets(m.group("t") + "dice", kind) if x[0].startswith("test:")], _val(m.group("v"), low))
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
    for m in re.finditer(r"\b(?:an? |its |their )?(?P<t>[a-z ]{2,30}?) (?P<n>attribute |rating )?equal to (?:its|their|the item's) (?:[a-z-]+ ){0,3}?rating\b", low):
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
    for m in re.finditer(r"(?P<t>[a-z][a-z' ]{2,40}?) (?:is|are) (?:always |permanently |also )?(?:increased|raised|boosted|improved) by (?:the |its |their )?(?:(?:this |the )?(?:quality|power|echo|augmentation|implant|mod|codemod|focus|item)'s )?(?P<v>rating|level|force|[+-]?\d+|one|two|" + _ATTR_RX + r")", low):
        if re.search(r"\bcosts?\b", low[max(0, m.start() - 60):m.end()]):
            continue  # (`the cost of Edge actions … are increased by one`: an Edge cost, read above)
        if maxed and re.search(r"\b(?:maxim|limit)", low):
            continue  # (`Your racial limit for Charisma and Willpower are increased by 1`: the maxima, read above)
        if re.search(r"\bpercent\b", low[m.end():m.end() + 12]):
            continue  # (`is increased by 20 percent`: read as a percent above)
        v = "R" if m.group("v") in ("rating", "level", "force") else ATTRIBUTES.get(m.group("v")) or _val(m.group("v"), low)
        bonus(targets(re.sub(r"^(?:and|or|but)\s+", "", m.group("t")), kind)[-1:], v)  # (`…, and their Social Rating is increased by their Magic`)
    for m in re.finditer(r"(?P<t>[a-z][a-z' ]{2,40}?) (?:increases?|rises?|goes up) by (?P<v>[+-]?\d+|one|two|three)\b", low):
        if not re.search(r"\bcosts?\b", m.group("t")):
            bonus(targets(m.group("t"), kind)[-1:], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:each|every|per) (?:rating(?: point)?|level)\b[^.;]*?\b(?:increases?|improves?|raises?) (?:your |the |its |their )?(?P<t>[^.;]*)", low):
        if not re.search(r"\bby\b", m.group("t")) and not re.match(r"\s*(?:adds?|gives?|grants?|provides?)\b", m.group("t")):
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
    for m in re.finditer(r"\battack ratings? (?:for|at|in) (?:the )?(?P<t>(?:close|near|medium|far|extreme)(?:(?:,\s*|\s+and\s+|,\s*and\s+|\s+or\s+)(?:close|near|medium|far|extreme))*)"
                         r"(?: ranges?)? (?:are |is )?(?P<dir>increased|raised|decreased|reduced|lowered) by (?P<v>\d+)", low):
        bands = ("close", "near", "medium", "far", "extreme")
        sign = "-" if m.group("dir") in ("decreased", "reduced", "lowered") else ""
        found.append(("item:ar", ",".join(sign + m.group("v") if b in m.group("t") else "0" for b in bands), None, None))
    for m in re.finditer(r"\b(?:decrease|reduce|lower)s?\s+(?:the |its |your )?(?!(?:all )?incoming)(?P<t>[a-z ]{2,40}?)\s+by\s+(?P<v>\d+|one|two|three)", low):
        ts = targets(m.group("t"), kind)
        for t, spec in ts:
            if t.startswith(("item:", "derived:", "attr:", "matrix:")):
                found.append((t, "-" + _val(m.group("v"), low).lstrip("-"), spec, None))
    for m in re.finditer(r"\b(?:subtracts?|reduces?|lowers?|decreases?) (?:its rating|the [a-z' -]{2,40}? rating|(?P<v>\d+|one|two|three)) from the thresholds?"
                         r"(?: of (?:all |any )?(?P<t>[^.;]*))?|"
                         r"\b(?:reduces?|lowers?|decreases?) the thresholds? (?:of|for) (?:all |any )?(?P<t2>[^.;]*?) by (?:its rating|(?P<v2>\d+|one|two|three))", low):
        v = _val(m.group("v") or m.group("v2"), low) if (m.group("v") or m.group("v2")) else "R"
        # (`When making jumping tests … subtract the hydraulic jacks rating from the threshold`: the tests named before)
        before = re.search(r"\b(?:when|while) (?:making|rolling|attempting) (?P<t>[^.;(]*?\btests?)\b", low[:m.start()])
        t = m.group("t") or m.group("t2") or (before.group("t") if before else "")
        # (the tests named are no condition; a condition after them is: `… Stealth tests while sneaking` → `while sneaking`)
        w = when
        if before and when and before.group("t") in when:
            rest = when.split(before.group("t"), 1)[1].strip(" ,")
            w = rest if _CONDITION.match(rest) else None
        for t, spec in targets(t, kind):
            out.append(_fx(t, "threshold", "-" + v.lstrip("-"), sw, w, _spec(t, spec)))
    for m in re.finditer(r"\b(?:can|may) (?:be used to )?(?:add|raise|increase) (?:to )?either (?:the )?(?P<t>[a-z]+(?:, [a-z]+)*,? or [a-z]+)\b", low):
        # (`Cyberlimbs can be used to add to either Agility, Armor, or Strength`: no amount, the item's rating; the one
        # the player picks of the attributes named)
        attrs = [ATTRIBUTES[w] for w in re.findall(r"[a-z]+", m.group("t")) if w in ATTRIBUTES]
        if len(attrs) > 1:
            out.append(_fx("attr:choice", "add", "R", sw, " or ".join(k for k, a in ATTRIBUTES.items() if a in attrs)))
    for m in re.finditer(r"\b(?:decrease|reduce|lower)s?\s+(?:the |its |your )?(?P<t>[a-z ]{2,40}?)(?: of the (?:vehicle|drone|weapon|item))?\s+by\s+(?:the |its )?(?:[a-z-]+'s )?(?:rating|level)\b|"
                         r"\bsubtracts? (?:its|their|the [a-z-]+'s) rating (?:directly )?from (?:the )?(?:base |vehicle's |item's )?(?P<t2>[a-z ]{2,40}?)(?: stat| attribute| value| rating)?(?: of the (?:vehicle|drone|weapon|item))?(?=\s+and\b|[.;,]|$)", low):
        for t, spec in targets(m.group("t") or m.group("t2"), kind):
            if t.startswith(("item:", "derived:", "attr:", "matrix:")):
                found.append((t, "-R", spec, None))
    if re.search(r"\bmoves? one point of (?:the )?off-road handling to (?:the )?on-road handling", low):
        found.append(("item:handling", "R/-R", None, None))  # (on-road up, off-road down, a point a rating: shown as printed)
    for m in re.finditer(r"\badds? (?P<v>\d+|[a-z-]+) percent (?:to|of) (?:the |its )?(?:base )?(?P<t>[a-z ]{2,30}?)(?: number| value| rating| stat)?(?=[.;,]|$)", low):
        v = number(m.group("v"))
        for t, spec in targets(m.group("t"), kind)[:1]:
            if v and t.startswith("item:"):
                found.append((t, f"{v}%", spec, None))  # (`adds 20 percent to the base Top Speed`: a formula, shown)
    if kind == "critterpowers":  # (a drake's or critter's Armor is its Defense Rating; Mystic Armor its astral one; by its Edge: a formula)
        for m in re.finditer(r"\b(?:gains?|grants?|have|has) (?P<t>mystic armor|armor) equal to (?P<half>half )?(?:(?:your|their|the|its) )?edge\b|"
                             r"\bincreas\w* (?:your |their )?(?:dracoform )?(?P<t2>armor or mystic armor|mystic armor|armor) by half (?:your|their|its) edge\b", low):
            names = (m.group("t") or m.group("t2")).split(" or ")
            for n in names:
                found.append(("derived:defense-astral" if "mystic" in n else "derived:defense", "edg/2" if m.group("t2") or m.group("half") else "edg", None, None))
    for m in re.finditer(r"\b(?:increas|rais)\w* the maximum (?:dice pool )?(?:bonus|modifier)(?: available)? (?:for|of|on|from) (?:the |a )?(?P<n>[a-z][a-z' -]{2,30}?)(?: action)?(?: \((?:see )?p\.[^)]*\))? by (?P<v>its rating|its level|the rating|\d+|one|two)\b", low):
        v = "R" if "rating" in m.group("v") or "level" in m.group("v") else _val(m.group("v"), low)
        out.append(_fx(f"action-max:{_slug(m.group('n'))}", "add", v, sw, when))
    for m in re.finditer(r"\b(?:gains?|receives?|gets?) (?P<v>an?|one|two|three|\d+) (?:additional |extra |bonus )?power points?\b", low):
        found.append(("derived:power-points", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\b(?:the )?(?P<t>[a-z]+(?: [a-z]+)?) (?P<k>attribute|skill) at (?:rating )?(?P<v>\d+)\b", low):
        for t, _ in targets(m.group("t") + (" attribute" if m.group("k") == "attribute" else ""), kind)[-1:]:
            if t.startswith(("attr:", "skill:")):
                out.append(_fx(t, "set", m.group("v"), sw, when))
    for m in re.finditer(r"\bthe rating of the (?:artificial |chosen |selected )?skill (?:equals|is equal to|is) (?:the|its) [a-z ]{0,30}?rating\b", low):
        out.append(_fx("skill:choice", "set", "R", sw, when))
    for m in re.finditer(r"\b(?P<t>(?:" + _ATTR_RX + r")(?:,? (?:and|or) (?:" + _ATTR_RX + r"))+) (?:are|is) (?:increased|raised|boosted|improved) by (?P<v>[+-]?\d+|one|two|three)", low):
        for t, _ in targets(m.group("t"), kind):
            found.append((t, _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\b(?:gain|receive|get|add)s?\s+a number of (?:bonus |additional |extra )?dice equal to (?:the|its|their) (?:level|rating|force)(?: of (?:this|the) [a-z]+)?"
                         r"(?:\s+(?:to|on|for)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*))?", low):
        bonus(targets(m.group("t") or "", kind) or targets(low[:m.start()], kind), "R")
    # CL6 parity increment: the bare phrasings of the two largest families (character/roll, character/attribute); each needs
    # its number and a test or attribute from the vocabulary
    _tw = r"(?:all |any |your |their |the |its )*(?P<t>[^.;]*?\btests?\b)"
    for m in re.finditer(r"(?<![\w/+-])(?P<v>\d+|one|two|three|four)\s+(?:(?:bonus|extra|additional|situational)\s+)*(?:dice|die)(?: pool)?(?: bonus| modifier)?\s+(?:for|to|on)\s+" + _tw, low):
        if not _negated(low, m.start()) and not _LOSS.search(low[:m.start()]) and not _PER_LEVEL.search(low) and not re.search(r"\b(?:up to|maximum|max|only|at most)\s*$", low[:m.start()]) and \
                not (re.search(r"\b(?:roll\w*|with|of)\s+$", low[:m.start()]) and not re.search(r"bonus|extra|additional", m.group(0))):  # (`roll 6 dice for the test`: a pool, no bonus)
            bonus([x for x in targets(m.group("t"), kind) if x[0].startswith(("skill:", "test:"))][:4], NUMBERS.get(m.group("v"), m.group("v")))
    for m in re.finditer(r"(?<![\w/+-])(?P<v>\d+|one|two|three)\s+(?:(?:bonus|extra|additional|situational)\s+)*edge(?: points?)?\s+(?:for|to|on)\s+" + _tw, low):
        if not _negated(low, m.start()) and not _LOSS.search(low[:m.start()]):
            emit([x for x in targets(m.group("t"), kind) if x[0].startswith(("skill:", "test:"))][:4], "edge", _val(m.group("v"), low))
    _al = rf"(?P<t>(?:{_ATTR_RX})(?:(?:,\s*|,?\s+(?:and|or)\s+)(?:{_ATTR_RX}))*)"
    for m in re.finditer(r"\b(?:adds?|gives?|grants?|provides?|gains?|receives?)\s+(?:you |them |the (?:user|character|wearer) )?(?:a |an )?(?:bonus of )?(?P<v>\d+|one|two|three)\s+(?:points? )?to\s+(?:your |their |the (?:user's|character's|wearer's) )?" + _al + r"\b(?! (?:dice|tests?|rolls?)\b)", low):
        if not _negated(low, m.start()) and not re.search(r"\b(?:maxim|limit)", low[m.start():m.end() + 20]):
            for t, _ in targets(m.group("t"), kind):
                found.append((t, _val(m.group("v"), low), None, None))
    for m in re.finditer(r"(?:^|[.;:,]\s*|\bthe |\byour |\btheir )" + _al + r"(?: attributes?)?\s+by\s+(?P<v>[+]?\d+|one|two|three)\b", low):
        if not maxed and not re.search(r"\b(?:maxim|limit|decreas|reduc|lower)", low[max(0, m.start() - 40):m.end()]):
            for t, _ in targets(m.group("t"), kind):
                found.append((t, _val(m.group("v"), low), None, None))
    # (`Increase the close and near attack ratings by 2`: the bands named, not also the plain `increase … by 2`)
    # (`defense tests against astral attacks`: that pool, not also every defense test of the same number)
    pools = {v for t, v, _, _ in found if t.startswith("test:defense-")}
    found = [x for x in found if not (x[0] == "test:defense" and x[1] in pools)]
    banded = {b for t, v, _, _ in found if t == "item:ar" and v and "," in v for b in v.split(",")}
    found = [x for x in found if not (x[0] == "item:ar" and x[1] and "," not in x[1] and x[1] in banded)]
    for t, v, spec, w in found:
        if v is None:
            continue
        if matrix_init and t in ("derived:initiative", "derived:initiative-dice"):
            t = t.replace("derived:", "derived:matrix-")  # (an AI's, or in VR: Matrix initiative)
        out.append(_fx(t, "add", v, sw, w or when, _spec(t, spec)))
    return out


def _spec(target, words):
    """A specialization's name (`Climbing`) when the words name one of the target skill's (SPECS), else the words as a
    specialization-like limit (`Etiquette or Negotiation`) on a skill, else None."""
    if not words or not target.startswith("skill:"):
        return None
    words = re.sub(r"\s+(?:or|and)\s+", ", ", words)  # (`Etiquette or Negotiation`: either, listed)
    return " ".join(w.capitalize() if w not in ("of",) else w for w in words.split())


_LINK_RX = [
    (re.compile(r"\b(?:gains?|receives?|has|have|get|gets|takes?)\s+(?:the\s+)?(?P<n>[A-Z][\w’'()-]*(?:\s+(?:[A-Z(][\w’'()-]*|of|the))*)\s+(?:(?P<lv>\d) )?(?P<k>quality|power|critter power|adept power)\b"), "grants"),
    (re.compile(r"\btreat (?:this|it) (?:\w+ )?as the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?:negative |positive )?(?P<k>quality|power)\b"), "as"),
    (re.compile(r"\b(?:the same (?:result|effect|bonus|way) as|functions (?:in the same way |just )?as|works (?:just )?(?:like|as)|counts as)\s+(?:an? |the )?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*)"), "as"),
    (re.compile(r"\b(?P<lv>\d+|one|two) free levels? of (?:the )?(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z(][\w’'()-]*)*)(?: (?P<k>power))?"), "grants"),
    (re.compile(r"^(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z(][\w’'()-]*)*) (?P<k>power|quality) for free\b"), "grants"),
    # (the Companion's quality that is another's: `This is the same as the X quality in …`, `function exactly like the X quality
    # (p. 72, SR6)`; Companion p. 71 `Characters with the Beak quality also have the Tough Gut benefits`)
    (re.compile(r"\b(?:is the same as|same as|functions? exactly like) the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?P<k>quality|power)\b"), "as"),
    (re.compile(r"\balso have the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) benefits\b"), "grants"),
    (re.compile(r"\bgains? the benefits of the (?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*) (?P<k>quality|power)\b"), "grants"),
]
_SEE = re.compile(r"^\W*(?i:see)\s+(?:(?P<n>[A-Z][\w’'-]*(?:\s+[A-Z][\w’'-]*)*),?\s+)?p\.\s*\d+(?:,\s*(?P<b>SR6|[A-Z][\w ]+?))?\W*$")
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
_AS_ADDON = re.compile(rf"\b(?:function|work|act)s? as an? (?P<a>{_ADDON_RX})(?:,? or as an? (?P<b>{_ADDON_RX}))?\b", re.I)


def addon_links(text, kind):
    """A weapon add-on that works as standard ones (`able to function as a laser sight or as a smartgun system`)."""
    if kind != "weapons" or not (m := _AS_ADDON.search(_norm(text))):
        return []
    return [("link", {"rel": "as", "kind": "weapons", "name": x.capitalize()}, None) for x in (m.group("a"), m.group("b")) if x]


_TIRE_AS = re.compile(r"\b(?:function|work)s? like an? (?P<n>off-road|racing) tire\b[^.]*?\((?:again )?with the same modifiers\)|"
                      r"\bjust like an? (?P<m>off-road|racing) tire\b[^.]*?\((?:again )?with the same modifiers\)", re.I)


_SYSTEM_AS = re.compile(r"\bworks? in (?:exactly )?the same way as the (?P<n>[a-z][a-z -]*? \([a-z]+\)) system\b", re.I)


def tire_links(text, kind):
    """Tires that work as other tires `(with the same modifiers)` (Double Clutch p. 123, Smart Tires) and a mod that works as
    another `in exactly the same way as the multi-terrain suspension (static) system` (p. 126): <link rel="as"> to each."""
    out = []
    for m in _TIRE_AS.finditer(_norm(text)):
        n = (m.group("n") or m.group("m")).title()
        out.append(("link", {"rel": "as", "kind": kind, "name": f"{n} Tires"}, None))
    out += [("link", {"rel": "as", "kind": kind, "name": m.group("n").title()}, None) for m in _SYSTEM_AS.finditer(_norm(text))]
    return out


_LINK_KIND = {"quality": "qualities", "power": "adeptpowers", "adept power": "adeptpowers", "critter power": "critterpowers"}
_NOT_NAMES = {"Edge", "The", "This", "Each", "A", "An", "Magic", "Resonance"}


# ---------- incompatibilities: what the entry can't be combined with (CRB Hong Kong pp. 157, 286-293) ----------
_INC = re.compile(r"\b(?:(?:is|are) incompatible with|incompatible with|cannot be combined with|can't be combined with|"
                  r"can not be combined with|may not be combined with|(?:may|can) not take both)\b(?P<rest>[^.;]*)", re.I)
_ONE_AT_A_TIME = re.compile(r"\byou can only have one installed at a time\b|\bonly one (?:type |kind )?(?:of (?:these|them) )?"
                            r"(?:can|may) be (?:installed|taken|implanted)(?: at a time)?\b", re.I)
_COMPAT = re.compile(r"\b(?:is|are) compatible with (?:an? |the )?(?P<w>wireless )?(?P<n>[a-z][\w’' -]*?)(?: systems?)?(?=,|;| and\b|$)", re.I)
_INC_TARGETS = (("reaction", "attr:rea"), ("strength", "attr:str"), ("agility", "attr:agi"), ("body", "attr:bod"),
                ("initiative", "derived:initiative-dice"))
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
        if 2 < len(n) < 60 and len(n.split()) <= 4 and not re.match(r"(?:any|all|other|every|anything|something|except|qualit|augment|"
                                                                     r"modification|cyberware|bioware|ware\b)", n, re.I) \
                and not re.search(r"\b(?:that|which|who|modifications?)\b", n, re.I):
            out.append(n)
    return out


def incompatibilities(text, name=""):
    """[(tag, attrs, None)]: <incompatible> parts for what the text says the entry can't be combined with: `targets` the
    attributes and initiative an augmentation that raises them can't be combined with (`incompatible with augmentations
    that affect Reaction or Initiative`), `names` the entries named (`including wired reflexes`, `; `-separated),
    `family` the name its kind shares when only one may be installed at a time (`Bone Lacing (Plastic)`: `Bone Lacing`);
    and <compatible name switch> for an exception (`Wireless bonus: compatible with a wireless wired reflexes system`)."""
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
            ts = [t for w, t in _INC_TARGETS if re.search(rf"\b(?:increase|affect|add to|raise|enhance|boost)\w*\s+(?:your\s+)?[\w\s]*\b{w}\b|"
                                                         rf"\benhancements? to {w}\b|\b{w}(?: or \w+)? (?:boosts?|enhancements?)\b|"
                                                         rf"\bform of [\w\s]*\b{w}\b", rest, re.I)]
            names = _inc_names(rest)
            if ts or names:
                a = {}
                if ts:
                    a["targets"] = " ".join(dict.fromkeys(ts))
                if names:
                    a["names"] = "; ".join(names)
                out.append(("incompatible", a, None))
        # (only a wireless exception: `Wireless bonus: … compatible with a wireless wired reflexes system`)
        if (m := _COMPAT.search(s.rstrip(". "))) and not re.search(r"\bnot\b", s[:m.start()], re.I) \
                and (m.group("w") or label.casefold().startswith("wireless")):
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
                if re.search(r"\b(?:must|need to|have to|has to)\s+(?:also\s+)?$", s[:m.start()], re.I):
                    continue  # (`You must also take the Overprotective quality`: what it requires, no grant)
                if re.search(r"\b(?:if|unless|until)\s+(?:you|they|the character)\s+(?:do(?:es)? not\s+|don.t\s+)?(?:already\s+)?$", s[:m.start()], re.I):
                    continue  # (`if you do not already have the Hooder quality`, `3 Karma if you already have X`: what it asks of the character, no grant)
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
                elif rel == "grants" and (cond := re.search(r"\b(?:who|if|when|whenever|while|unless)\b[^,.;]{3,60}$", s[:m.start()], re.I)):
                    a["when"] = re.sub(r"\s+also\s*$", "", cond.group(0)).strip(" ,")  # (`Users who reach level 5 or 6 … also gain the Uncouth quality`: on that condition)
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
                "defense rating": "derived:defense", "defense": "derived:defense", "unarmed dv": "derived:unarmed-dv", "unarmed ar": "derived:unarmed-ar",
                "matrix init bonus": "derived:matrix-initiative", "init bonus": "derived:initiative",
                "initiative bonus": "derived:initiative", "dr": "derived:defense", "defense rating bonus": "derived:defense"}


def _init_column(c):
    """An initiative bonus column by its words, under any printing's header (`MATRIX INIT BONUS`, a later printing's
    `VR MATRIX INIT DICE BONUS`): `derived:[matrix-]initiative[-dice]`; None for another column."""
    w = c.split()
    if "bonus" not in w or not any(x in ("init", "initiative") for x in w):
        return None
    return f"derived:{'matrix-' if 'matrix' in w else ''}initiative{'-dice' if 'dice' in w or 'die' in w else ''}"
def _stat_mod(v):
    """An AR or DV cell's modifier as printed (`–1S(e)`, `–2 to all`, `+1`): the signed number; else the cell."""
    v = _norm(v)
    m = re.match(r"\s*([+-]\d+)(?:[PS]\b|\(e\)|\s+(?:to all(?: attack ratings)?|dv|ar)|\s*$)", v, re.I)
    return m.group(1) if m else v


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
        t = STAT_COLUMNS.get(c) or _init_column(c)
        v = _stat_mod(v or "") if t in ("item:ar", "item:dv") else _norm(v or "")
        if c == "body" and "unarmed dv" in h and re.fullmatch(r"\+\d+", v):
            # (a table of unarmed values, the bone lacing table, CRB Hong Kong p. 286: its BODY is extra Body when resisting
            # physical damage, as its text says)
            out.append(_fx("test:damage-resistance", "add", v.lstrip("+"), "conditional", "when resisting physical damage"))
            continue
        if t == "derived:unarmed-dv" and (dm := re.fullmatch(r"(\d+)\s*[PS]", v)):
            out.append(_fx(t, "set", dm.group(1)))  # (`3P`: the unarmed Damage Value it gives, HK p. 286; `+1`: added)
            continue
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


def less_accessory(text, thing):
    """`text` less the sentences accessory() reads for the add-on `thing` (`Arm-brace add-on increases the Near and Medium Attack Ratings
    by 1`): they are the add-on's effects, not the item's own."""
    word = (thing.split() or [""])[-1].lower()
    if not word:
        return text
    keep = [x for x in re.split(r"(?<=[.!?])\s+", text or "") if not (word in x.lower() and _AR.search(x))]
    return " ".join(keep) if len(keep) != len(re.split(r"(?<=[.!?])\s+", text or "")) else text


# ---------- the import's pass over every entry ----------
# kinds whose entries print no effects of their own in prose the grammar reads (stat blocks, rules, vocabularies, and
# life modules, whose points are their own attributes and choices)
SKIP_KINDS = {"rules", "actions", "npcs", "contacts", "critters", "spirits", "sprites", "categories", "priorities", "metatypes",
              "skills", "lifemodules", "grades", "attributes", "samples", "sources", "index", "packs", "contacttypes",
              "licencetypes", "magictypes", "senses", "trueelements", "ruleoptions", "spellfeatures", "qualitysets"}
_ENTRY = re.compile(r'^(\s*)<([\w]+) id="([^"]+)"(.*?)><name>(.*?)</name>(.*)</\2>(?:</sr6:data>)?\s*$')  # (the file's last entry may close the root on its line: an override's)
_KEEP = re.compile(r'<effect [^>]*target="item:[^"]*"[^>]*/>')  # (an add-on's effect read from its host's text: catalog.add_ons)
_DROP = re.compile(r'<(?:effect|test|link|incompatible|compatible) [^>]*/>')


def _split_entries(xml):
    """The catalog one entry a line again: the entries an override appended run together on the file's last line."""
    return re.sub(r"(</(\w+)>)(?=<\2 id=)", r"\1\n  ", xml) if xml else xml


def _unesc(s):
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")


def _block_tables(regrouped):
    """{item name key: [(header, rows)]}: every markdown table printed inside an item block, by the block's name."""
    out, block, lines = {}, None, (regrouped or "").splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("<!-- item"):
            mm = re.search(r'"name": "([^"]*)"', ln)
            block = _key(mm.group(1)) if mm else None
        elif ln.startswith("<!-- end"):
            block = None
        elif block and ln.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*-", lines[i + 1]):
            header = [c.strip() for c in ln.strip().strip("|").split("|")]
            rows, j = [], i + 2
            while j < len(lines) and lines[j].startswith("|"):
                rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
                j += 1
            out.setdefault(block, []).append((header, rows))
            i = j
            continue
        i += 1
    return out


def rating_table(header, rows, kind):
    """Effects of a per-rating table printed under an entry (`RATING | DV | AR`, one row a rating 1, 2, 3 …: the bone
    density augmentation, CRB p. 291): each stat column's values as the book's own value per rating, `R[1,1,2,2]`
    (owner decision 3, 2026-10-11); an augmentation's DV and AR are its unarmed ones."""
    h = [re.sub(r"\s+", " ", x.strip().casefold()) for x in header]
    if len(h) < 2 or h[0] not in ("rating", "level", "force") or not rows:
        return []
    ratings = [number(_norm(r[0])) if r else None for r in rows]
    if any(x is None for x in ratings) or [int(float(x)) for x in ratings] != list(range(1, len(rows) + 1)):
        return []
    out = []
    for i, c in enumerate(h[1:], 1):
        t = STAT_COLUMNS.get(c) or _init_column(c)
        if not t:
            continue
        if kind == "augmentations" and t in ("item:ar", "item:dv"):
            t = "derived:unarmed-" + t[5:]
        vals = [number(_stat_mod(r[i])) if i < len(r) else None for r in rows]
        if any(v is None for v in vals):
            continue
        out.append(_fx(t, "add", "R[" + ",".join(vals) + "]"))
    return out


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


_VARIANT = re.compile(r"(.+?) \(((?:[^()]|\([^()]*\))+)\)")  # (a name and its variant, which may end in its own parenthesis)


def _label(variant):
    """The run-in label key of a variant: `Fear Response Dampener` for `Fear Response Dampener (basic)`, the book printing
    one paragraph for both."""
    return _key(re.sub(r"\s*\([^()]*\)$", "", variant))


def _own_part(text, name, siblings):
    """An entry's part of a description it shares with entries of the same kind (`High performance engines … Racing
    engines … Economy engines …`): the sentences from the one naming it to the next naming a sibling, with any
    before the first naming one; the whole text when it doesn't name the entry."""
    def word(n):  # (the name as a sentence opens with it: `Racing` for `Racing engines …`; a variant's word, `Medium` for
        # `Mil-Spec Armor (Medium)`: `Medium armor reduces incoming DV by 2`)
        if pm := re.fullmatch(r"(.+?)\s*\(((?:[^()]|\([^()]*\))+)\)\s*", n):
            return " ".join(re.sub(r"\s*\([^()]*\)$", "", pm.group(2)).casefold().split())  # (raw, not _key: `Semi-Rigid` stays as the sentence prints it)
        return " ".join(re.sub(r"\s*\(.*?\)\s*$", "", n).casefold().split())
    me = word(name)
    sib = {word(n) for n in siblings if n != name and word(n) != me and len(word(n)) > 3}
    if not me or len(me) < 4 or not sib:
        return text
    ss = sentences(text)
    tag = [next((w for w in [me, *sib] if re.match(rf"\W*{re.escape(w)}\b", x.casefold())
                 or re.match(rf"\W*{re.escape(w)}\b", re.sub(r"^[•*\s]*[A-Z][\w ]{1,30}:\s+", "", x).casefold())), None) for x in ss]
    if me not in tag or not any(t in sib for t in tag):
        return text
    out, cur = [], None
    for x, t in zip(ss, tag):
        cur = t or cur
        if cur in (None, me):
            out.append(x)
    return " ".join(out)


def _variant_part(text, name, siblings):
    """A variant's part of a description its siblings share, the book printing each under a bold run-in label
    (`Endosymbionts (Halcyon)`: `… **Halcyon:** …`): the lines before the first sibling's label, then its own from its
    label to the next sibling's (its own sub-labels, `**Overdrive:**`, stay); the whole text when it has no label of
    its own."""
    pm = _VARIANT.match(name)
    if not pm:
        return text
    base, me = pm.group(1), _label(pm.group(2))
    sib = {_label(m.group(2)) for n in siblings if (m := _VARIANT.match(n)) and m.group(1) == base} - {me}
    labels = [(m.start(), _key(m.group(1))) for m in re.finditer(r"(?m)^\W*\*\*([^*\n]{2,40}?):\*\*", text)]
    mine = [i for i, (_, k) in enumerate(labels) if k == me]
    if not mine and sib:
        # (`Genotype Enhancement (NDI)`, the book printing its paragraph under `**NDE:**`: the one paragraph label no
        # sibling claims is its own; a label with a value only, `**Treatment time:** 2 months`, is no paragraph)
        para = {m.start() for m in re.finditer(r"(?m)^\W*\*\*[^*\n]{2,40}?:\*\*[ \t]*(?=\S+[ \t]+\S+[ \t]+\S+)", text)}
        free = [i for i, (at, k) in enumerate(labels) if at in para and k not in sib]
        if len(free) == 1 and len(({me} | sib) - {k for _, k in labels}) == 1:  # (and it is the one entry without a label)
            mine, me = free, labels[free[0]][1]
    if not mine or not sib or not any(k in sib for _, k in labels):
        return text
    first = next(at for at, k in labels if k in sib or k == me)
    start = labels[mine[0]][0]
    end = next((at for at, k in labels[mine[0] + 1:] if k in sib), len(text))
    return (text[:first] + text[start:end]).strip()


def _runins(regrouped):
    """{label key: [(block name key, paragraph)]}: every bold run-in paragraph of the book (`**NeoElastian:** A metahuman
    body …`), with the block it is printed in."""
    out, block, cur = {}, "", None
    order, loose, subs = [], None, set()  # (a block's labels in order; an unlabelled paragraph after them; bullets' labels)
    for ln in (regrouped or "").splitlines():
        if ln.startswith("<!-- item") or ln.startswith("<!-- section"):
            mm = re.search(r'"name": "([^"]*)"', ln)
            block, cur, order, loose, subs = _key(mm.group(1)) if mm else "", None, [], None, set()
            continue
        if ln.startswith(("#", "|", "<!--")) or not ln.strip():
            cur = None
            if order and loose is None and not ln.strip():
                loose = []
            continue
        if (mm := re.match(r"^\W*\*\*([^*]{2,40}?):\*\*\s*(.*)$", ln)) and ln.lstrip().startswith("•") and order:
            # (a bullet's sub-label, `• **Overdrive:**`: part of the paragraph it is printed in)
            cur = loose if loose is not None else cur if cur is not None else order[-1][1]
            cur.append(f"{mm.group(1)}: {mm.group(2)}")
            subs.add(_key(mm.group(1)))
            continue
        if mm:
            k = _key(mm.group(1))
            seen = [x for x, _ in order]
            main = [x for x in seen[:seen.index(k)] if x not in subs] if k in seen else []
            if loose and main:
                # (a block printing each label's first lines as a list, then the rest flowing: `**Cerebral …:** …` then
                # `This genetic modification …` before `**Synaptic …:**` again: the rest is the label's before it)
                order[seen.index(main[-1])][1].extend(loose)
            loose = None
            cur = [mm.group(2)]
            out.setdefault(k, []).append((block, cur))
            if k not in [x for x, _ in order]:
                order.append((k, cur))
        elif cur is not None:
            cur.append(ln.strip())
        elif loose is not None:
            loose.append(ln.strip())
    return {k: [(b, re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(p))) for b, p in v] for k, v in out.items()}


def _sections(regrouped):
    """({item name key: section name}, {section name: its intro text}, {item name key: its prose}): which section each
    item is printed in, the text a section prints above its first item, and each item block's own prose (a parent row
    printed with the text its variant rows share, `Cyberjack Boosters`)."""
    of, intro, prose, cur, item = {}, {}, {}, None, None
    for ln in (regrouped or "").splitlines():
        if ln.startswith("<!-- section") or ln.startswith("<!-- item"):
            mm = re.search(r'"name": "([^"]*)".*?"section": "([^"]*)"', ln)
            if ln.startswith("<!-- section") and mm:
                cur, item = mm.group(1), None
                intro.setdefault(cur, [])
            else:
                cur = None
                item = _key(mm.group(1)) if mm else None
                if mm:
                    of.setdefault(_key(mm.group(1)), mm.group(2))
                    prose.setdefault(item, [])
            continue
        if ln.startswith("<!-- end"):
            cur = item = None
        elif cur is not None and not ln.startswith(("|", "#")):
            intro[cur].append(ln.strip())
        elif item is not None and not ln.startswith(("|", "#")) and (ln.strip() or prose[item] and prose[item][-1]):
            prose[item].append(ln.strip())
    join = lambda v: re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(v)).strip()
    # (a block's prose keeps its lines and its blank ones, for _block_text: a mentor spirit's `**Magician:**` role lines read by their labels)
    return of, {k: join(v) for k, v in intro.items()}, {k: "\n".join(v).strip() for k, v in prose.items() if any(v)}


def _block_text(prose):
    """An entry's description from its book block's prose (`_sections`), where the entry has none of its own: the paragraphs
    (a bold label line holds a wrapped sentence's lines, `**Disadvantage:** Cannot gain … for` / `Snoop actions.`), less the
    fluff after a mentor spirit's `Similar Archetypes` line and a label line the heading cut short (printed whole below)."""
    lines = []
    for ln in reflow(prose.split("**Similar Archetypes:**")[0]).split("\n"):
        if lines and lines[-1].startswith("**") and ln and not ln.startswith("**") and not re.search(r"[.!?:]$", lines[-1]):
            lines[-1] = re.sub(r"(?<=[a-z])-$", "", lines[-1]) + ("" if lines[-1].endswith("-") else " ") + ln
        else:
            lines.append(ln)
    return "\n".join(x for i, x in enumerate(lines) if not (x.startswith("**") and any(y != x and y.startswith(x) for y in lines[i + 1:])))


def _variant_sentences(text, mine, others, label=None):
    """The sentences of a parent's description about this variant (`Cyberjack Boosters (Firewall)`: `A Data Processing
    or Firewall cyberjack booster improves …`) or about no variant; the whole text when no sentence names a variant."""
    ss = sentences(text)
    me = {w.casefold() for w in mine if w}
    sib = {w.casefold() for w in others if w} - me
    def names(x, ws):
        # (with a label, a version named as one: `the general version`, `general toxin resistance`; not `in general`)
        tail = rf"\s+(?:versions?|types?|forms?|variants?|{re.escape(label)})" if label else ""
        return any(re.search(rf"\b{re.escape(w)}\b{tail}", x.casefold()) for w in ws)
    if not me or not any(names(x, me | sib) for x in ss):
        return text
    return " ".join(x for x in ss if names(x, me) or not names(x, sib))


_FAMILY = {"attr": lambda w: ATTRIBUTES.get(w), "attr-max": lambda w: ATTRIBUTES.get(w), "matrix": lambda w: MATRIX.get(w) or MATRIX.get(w + " attribute"),
           "skill": lambda w: w.replace(" ", "-") if w in SKILLS else None, "skill-max": lambda w: w.replace(" ", "-") if w in SKILLS else None}
_VARIANT_FAMILY = {"attribute": ("attr", "attr-max"), "attributes": ("attr", "attr-max"), "skill": ("skill", "skill-max"), "skills": ("skill", "skill-max")}


def _resolve_variant(found, words):
    """A variant row's effects (owner decision 2026-10-10: a choice the row makes): `<family>:choice` becomes the member the
    variant's words name (`(Firewall)`: matrix:firewall; `(Agility)`: attr:agi); a variant named for a target family
    (`(attribute)`, `(skill)`) keeps that family's effects only."""
    fam = next((f for w in words for f in [_VARIANT_FAMILY.get(_key(w))] if f), None)
    out = []
    for t, a, _ in found:
        if t == "effect" and fam and a["target"].split(":")[0] in {k for v in _VARIANT_FAMILY.values() for k in v} and a["target"].split(":")[0] not in fam:
            continue
        if t == "effect" and a["target"].endswith(":choice"):
            k = a["target"][:-7]
            member = next((m for w in words for m in [_FAMILY.get(k, lambda w: None)(_key(w))] if m), None)
            if member:
                a = {**a, "target": f"{k}:{member}"}
        out.append((t, a, None))
    return out


# programs and gear named for what a skillsoft kind gives (CRB p. 272, Skillsofts): its skill at its rating
SOFTS = {"activesoft": "skill:choice", "activesofts": "skill:choice", "skillsoft": "skill:choice", "skillsofts": "skill:choice",
         "knowsoft": "skill:knowledge", "knowsofts": "skill:knowledge", "linguasoft": "skill:language", "linguasofts": "skill:language",
         "knowledge": "skill:knowledge", "language": "skill:language"}
_EACH = re.compile(r"^\W*(?:each|every|all|any)\b", re.I)
_NOT = re.compile(r"\b(?:not|nor|no|never|n't)\b", re.I)


_PLURAL_SUBJECT = (r"^\W*(?:[a-z-]+ and )?((?:[a-z-]+ ){0,2}[a-z-]+s)\s+"
                   r"(?:are|have|has|carry|get|gain|receive|add|adds|provide|grant|use|come|include|count|can|may|must|do)\b")


def section_effects(intro, text, name, kind, section=""):
    """The effects a section's intro states of every item in it (owner decision 2026-10-10: `Each cyberlimb adds one
    box to the character's Physical Condition Monitor`), a sentence opening `Each`, `Every`, `All` or `Any`; less the
    ones the item's own text excepts (a sentence of its own, about it, saying it doesn't)."""
    out = []
    base = _key(re.sub(r"\s*\(.*$", "", name))
    own = [x.casefold() for x in sentences(text) if _NOT.search(x)]
    kinds = {w.rstrip("s") for w in re.findall(r"[a-z]+", section.casefold())}
    subjects = {m_.group(1) for x in sentences(intro) if (m_ := re.match(_PLURAL_SUBJECT, re.sub(r"^\W*notes?:\s*", "", x, flags=re.I).casefold()))}
    tails = [tuple(x.split()[1:]) for x in subjects if len(x.split()) >= 3]
    versions = any(tails.count(t) > 1 for t in tails)  # (`Small blast shields …` and `Large blast shields …`: each sentence is its version's)
    for s in sentences(intro):
        s = re.sub(r"^\W*notes?:\s*", "", s, flags=re.I)  # (a section's `Notes:` line is its intro too)
        m = re.match(r"^\W*(?:(?:each|every|all|any)\s+)?([a-z-]+)(?:\s+(?:and\s+)?([a-z-]+))?", s.casefold())
        ws = {w.rstrip("s") for w in m.groups() if w} if m else set()
        nouns = {k for k in kinds for w in ws if k == w or len(w) >= 4 and k.endswith(w)}  # (`limbs` of the section `Cyberlimbs`)
        if not nouns:
            continue  # (about the section's items, `Each cyberlimb` under Cyberlimbs, `Missiles are …`; not `Each point of nanite volume`)
        if not re.match(r"^\W*(?:each|every|all|any)\b", s.casefold()):
            # (owner decision 10, 2026-10-11: a sentence about the section's items as a class, its plural noun the subject:
            # `Missiles are rockets …` under Rockets and Missiles is the missiles' rule, not a rocket's; `This genotype
            # enhancement offsets …` is one item's)
            sm = re.match(_PLURAL_SUBJECT, s.casefold())
            if not sm or nouns < kinds and not nouns & {w.rstrip("s") for w in base.split()}:
                continue
            # (`Small blast shields provide +1 … Large blast shields provide +2`: the words before the noun, the version, must be in the item's name)
            if versions and not {w.rstrip("s") for w in sm.group(1).split()[:-1]} <= {w.rstrip("s") for w in _key(name).split()} | kinds:
                continue
        if lm := re.search(r"\binstalled with all physical attributes at (\d+)\b", s.casefold()):
            # (CRB p. 288: a basic cyberlimb's own attributes, the new target `limb-attr:<abbr>`: the limb's, never the runner's)
            out += [(t, {**a, "rule": section or "class"}, None) for t, a, _ in (_fx(f"limb-attr:{x}", "set", lm.group(1)) for x in ("bod", "agi", "rea", "str"))]
            continue
        got = read(s, kind)
        if versions and not any(t == "effect" for t, _, _ in got) and (what := next(iter(re.findall(r"\bto ([a-z ]+? rating)\b", " ".join(sentences(intro)).casefold())), None)):
            # (`Large blast shields provide +2 (max +4) for each shield installed`: of the `Defense Rating` the sentence before names)
            got = read(re.sub(r"\b(provides? [+-]?\d+)", rf"\1 to {what}", s, count=1, flags=re.I), kind)
        for t, a, _ in got:
            if t != "effect":
                continue
            words = re.split(r"[:]", a["target"])[-1].replace("-monitor", "").replace("-", " ")
            if any(words in x and (base and base in _key(x[:x.find(words)]) or re.match(r"\W*(?:this|it)\b", x)) for x in own):
                continue  # (`This arm does not add a box`: excepted)
            # (a rule of the section's class: copy_links gives it to the same class in other books; not a sub-class's sentence this item
            # is the very one of, `Missiles are …` for the `Missile Variant` row)
            out.append((t, a if nouns < kinds and nouns & {w.rstrip("s") for w in base.split()} else {**a, "rule": section or "class"}, None))
    return out


# a rating the book prints in the entry's name, one row a rating (`Wired Reflexes 3`, `Cyberjack (Rating 2)`,
# `Telescoping modification (Level 1)`)
_NAME_RATING = re.compile(r"(?:^|\s)(?:(?P<word>\(\s*(?:rating|level)\s+)|(?P<base>(?<=\s)))(\d{1,2})(?(word)\)|)\s*$", re.I)
_USES_R = re.compile(r'<effect [^>]*\bvalue="[^"]*\bR\b|<formula\b[^>]*>[^<]*\bR\b')


def split_rating(name, attrs, kids, siblings=()):
    """` rating="N"` for an entry the book splits into one row a rating, its name ending in the rating (`Cyberjack
    (Rating 2)`; a bare number, `Wired Reflexes 3`, only beside a sibling of the same name and another number), when it
    prints no rating range of its own and its effects or formulas count per rating (`R`): R is that row's rating, never
    1; '' otherwise."""
    m = _NAME_RATING.search(name or "")
    if not m or re.search(r'\srating="', attrs) or not _USES_R.search(kids) or int(m.group(3)) < 1:
        return ""
    if not m.group("word"):
        base = name[:m.start()].strip().casefold()
        if not any(n != name and (o := _NAME_RATING.search(n)) and not o.group("word")
                   and n[:o.start()].strip().casefold() == base for n in siblings):
            return ""
    return f' rating="{m.group(3)}"'


def apply(files, texts_xml, regrouped="", only=None):
    """(files, texts): the catalog files (`{name: xml}`, catalog.Catalog.xml's one entry a line) with each entry's effects,
    tests and links as its text and the book's tables state them (read(), table(), links()), in place of the ones read
    before (an add-on's effects on its host, read from the host's text, stay); and the texts with a variant's own run-in
    paragraph added to its description where the book prints it under the parent's heading (`Genotype Enhancement
    (NeoElastian)`: `**NeoElastian:** …`). only: {(kind, id)} to read only these entries (the ones an override added)."""
    files = {f: _split_entries(x) for f, x in files.items()}
    texts = {}
    for m in re.finditer(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', texts_xml or "", re.S):
        texts[(m.group(1), m.group(2))] = _unesc(m.group(3))
    rows = _tables(regrouped)
    by_name = {}
    for header, row in rows:
        if row and row[0]:
            by_name.setdefault(_key(re.sub(r"[*†‡]+$", "", row[0])), []).append((header, row))
    ids = {f[:-4]: set(re.findall(r'^\s*<\w+ id="([^"]+)"', x or "", re.M)) for f, x in files.items()}
    section_of, intros, block_prose = _sections(regrouped)
    block_tables = _block_tables(regrouped)
    # (an entry's name -> its id and type, per kind: the base item a variant is priced from)
    by_kind = {}
    for f, x in files.items():
        got = by_kind.setdefault(f[:-4], {})
        for m in re.finditer(r'<\w+ id="([^"]+)"([^>]*)><name>(.*?)</name>', x or ""):
            k, typ = _key(_unesc(m.group(3))), (re.search(r' type="([^"]*)"', m.group(2)) or [None, ""])[1]
            if k not in got or typ == "bioware":  # (the bioware one when a name is ware of two types: `Fangs`)
                got[k] = (m.group(1), typ)
    runins, added = _runins(regrouped), {}
    # (a rule's text naming an entry: where the book's description of an item went when it was read as a rule,
    # `Move-By-Wire (Rating 1-2)`, `Stealthlink Upgrade`, `ProCams and SmartCams`)
    rules = re.findall(r'<rule id="([^"]+)"([^>]*)><name>(.*?)</name>', files.get("rules.xml") or "")
    rule_name = {rid: _key(n) for rid, _, n in rules}
    rule_parent = {rid: (pm.group(1) if (pm := re.search(r' parent="([^"]*)"', a)) else None) for rid, a, _ in rules}

    def life_module(rid):  # (a rule printed under the book's `Life Modules`: a life module's text, no item's)
        for _ in range(8):
            if "life module" in rule_name.get(rid, ""):
                return True
            rid = rule_parent.get(rid)
        return False
    rule_texts = [(_key(n), texts.get(("rules", rid), "")) for rid, _, n in rules if not life_module(rid)]
    rule_texts = [(k, t) for k, t in rule_texts if t]
    names = {f[:-4]: [_unesc(n) for n in re.findall(r"<name>(.*?)</name>", x or "")] for f, x in files.items()}
    # (an entry's category -> its names, per kind: the entries that share a description are one category's, `Endosymbionts
    # (Gain)` of Symbiont is no sibling of `Awareness (Tactical)`, whose description holds `Gain a +1 dice pool bonus …`)
    categorised = {}
    for f, x in files.items():
        for m in re.finditer(r'<\w+ id="[^"]+"([^>]*)><name>(.*?)</name>', x or ""):
            cat = (re.search(r' category="([^"]*)"', m.group(1)) or [None, ""])[1].casefold()
            categorised.setdefault(f[:-4], {}).setdefault(cat, []).append(_unesc(m.group(2)))
    # (an item's add-ons the book prices in its text, catalog.add_ons: host id -> the add-ons' names; their effects are theirs)
    acc_of = {}
    for m in re.finditer(r'<\w+ id="[^"]+"[^>]*? accessoryOf="([^"]+)"[^>]*><name>(.*?)</name>', "".join(f for f in files.values() if f)):
        for hid in m.group(1).split():
            acc_of.setdefault(hid, []).append(_unesc(m.group(2)))
    # (the rows printed under a group header, `Awareness` over `Basic` and `Tactical`: by kind, group key -> names)
    grouped = {}
    for f, x in files.items():
        for m in re.finditer(r'<\w+ id="[^"]+"([^>]*)><name>(.*?)</name>', x or ""):
            if gm := re.search(r' group="([^"]*)"', m.group(1)):
                grouped.setdefault(f[:-4], {}).setdefault(_key(_unesc(gm.group(1))), []).append(_unesc(m.group(2)))
    out = {}
    for fname, xml in files.items():
        kind = fname[:-4]
        if kind in SKIP_KINDS or not xml:
            out[fname] = xml
            continue
        lines = []
        for ln in xml.splitlines(keepends=True):
            m = _ENTRY.match(ln)
            if not m or only is not None and (kind, m.group(3)) not in only:
                lines.append(ln)
                continue
            ind, tag, eid, attrs, name, kids = m.groups()
            text = texts.get((kind, eid), "")
            nm = _unesc(name)
            variant_words = []
            if not text.strip():  # (a variant or rating row: its parent's description, the sentences about it)
                base_nm, pid = nm, None
                while not text.strip() and (vm := re.match(r"(.+?)\s*\(([^()]+)\)\s*$", base_nm)):
                    base_nm = vm.group(1)
                    pid = by_kind.get(kind, {}).get(_key(base_nm))
                    text = (texts.get((kind, pid[0]), "") if pid else "") or re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(block_prose.get(_key(base_nm), "").split()))  # (or the parent block's prose when it is no entry)
                if text.strip():
                    variant_words = [w for w in re.findall(r"\(([^()]+)\)", nm) if not re.match(r"(?i)(?:rating|level|force) \d", w)]
                    others = [w for n in names.get(kind, ()) if n != nm and _key(n).startswith(_key(base_nm) + " ")
                              for w in re.findall(r"\(([^()]+)\)", n) if not re.match(r"(?i)(?:rating|level|force) \d", w)]
                    text = _variant_sentences(text, variant_words, others)
            bare = lambda t: re.sub(r"\*\*[^*\n]+:\*\*[^\n]*", "", t).strip()  # (the text less its label lines: `**Treatment time:** 2 months`)
            if (pm := _VARIANT.match(nm)) and len(bare(text)) < 200:
                base, var = _key(pm.group(1)), _label(pm.group(2))  # (`Fear Response Dampener (basic)`: the label `Fear Response Dampener`)
                if var not in runins:  # (a label of the variant's words less one: `Synaptic Acceleration`)
                    vw = set(var.split())
                    var = next((k for k in runins if len(k.split()) >= 2 and set(k.split()) <= vw and len(vw - set(k.split())) <= 1), var)
                if var not in runins:
                    # (a label the book misprints, `**NDE:**` for `NDI`: the one paragraph label of the group's block that no row names,
                    # when this row is the only one of the group without its own; no alias yet, the corpus pass adds it after this)
                    mine_ = lambda k: [p for b, p in runins.get(k, ()) if b and (b in base or base in b) and len(p.split()) >= 3]
                    sibs = {_label(m.group(2)) for n in names.get(kind, ()) if (m := _VARIANT.match(n)) and _key(m.group(1)) == base}
                    free = {k for k in runins if mine_(k)} - sibs
                    if len(free) == 1 and len(sibs) >= 3 and [k for k in sibs if not mine_(k)] == [var]:  # (a group of three rows or more: two are no pattern)
                        var = free.pop()
                got = [p for b, p in runins.get(var, ()) if b and (b in base or base in b)] or \
                    ([p for _, p in runins[var]] if len(runins.get(var, ())) == 1 else [])
                got = sorted(got, key=len, reverse=True)  # (the label's line and the text's paragraph: the fuller)
                if got and got[0] not in text:
                    text = (text + "\n" + got[0]).strip()
                    added[(kind, eid)] = text
            ri = runins.get(_key(nm), ())
            if 'value="RCC"' in kids:  # (a rigger program, an override's `Encryption` for an RCC: the Rigger Programs block's line, not the deck program's)
                ri = [x for x in ri if "rigger" in x[0]] or ri
            if len(bare(text)) < 40 and "(" not in nm and len(ri) and len({b for b, _ in ri}) == 1:
                # (a row named by a run-in label of one block of the book, `Balance` under the Tail's `**Balance:** …`: that
                # paragraph is its description)
                got = sorted((p for _, p in ri), key=len, reverse=True)
                if got[0] not in text:
                    text = (text + "\n" + got[0]).strip()
                    added[(kind, eid)] = text
            armor_fx = []
            if kind == "qualities" and any(a_["rel"] == "as" and _key(a_["name"]) == _key(re.sub(r"\s*\(.*$", "", nm)) for t_, a_, _ in links(text, kind)) \
                    and (rt := next((t for k, t in rule_texts if k == _key(nm) and t not in text), None)):
                text = (text + "\n" + rt).strip()  # (`the same as the Synchronicity quality in the … path above`: the rule of that name, where the book prints it)
            for thing in acc_of.get(eid, ()):
                text = less_accessory(text, thing)
            if kind == "weapons" and _key(nm).startswith("laser sight ") and (bm := re.search(r"only be used at ([a-z, ]+?) ranges|operates across (all) ranges", " ".join(_norm(text).replace("|", " ").split()), re.I)):
                # (a maker's laser sight, Firing Squad p. 72: the core rulebook's +1 Attack Rating, at the ranges it can be used at)
                bands = {b for b in _BANDS} if bm.group(2) else {b for b in _BANDS if b in bm.group(1).casefold()}
                armor_fx.append(_fx("item:ar", "add", ",".join("1" if b in bands else "0" for b in _BANDS)))
            if kind == "gear" and (sec := section_of.get(_key(nm))) and re.search(r' class="MOD_SKIN/MOD_ARMOR"', attrs):
                # (Foundations, Double Clutch p. 133: the section's own blocks `Acceleration` and `Top Speed` tell what each foundation's armor
                # does to them, the sentences naming this one: read here, not as text, the sentence's reverse and its numbers are no effect)
                armor_fx = [fx for stat in ("acceleration", "top speed") if section_of.get(stat) == sec
                            for sn in sentences(" ".join(block_prose.get(stat, "").split())) if (fx := _armor_performance(sn, _key(nm.replace("Armor", "")) + " armor"))]
            if kind == "gear" and nm.casefold().endswith(" focus") and (fr := [t for k, t in rule_texts if k == _key(nm[:-6]) + " foci" and t not in text]):
                text = (text + "\n" + fr[0]).strip()  # (`Power focus`: its Focus Types rule, `Power Foci`, tells what it does, CRB p. 156)
            if len(bare(text)) < 40 and kind != "rules":  # (a label line only: the rule the book describes it under)
                base = _key(re.sub(r"\s*\(.*$", "", nm))
                words = [w.rstrip("s") for w in base.split() if w not in ("system", "systems", "suite", "module", "unit", "kit", "external", "internal", "basic")] or [w.rstrip("s") for w in base.split()]
                got = sorted((len(k), t) for k, t in rule_texts if len(base) > 4 and words and
                             all(any(x.rstrip("s") == w for x in k.split()) for w in words))
                if got and got[0][1] not in text:
                    text = (text + "\n" + got[0][1]).strip()
                    added[(kind, eid)] = text  # (the rule's text is the item's description: kept with it)
                    if not variant_words:
                        variant_words = [w for w in re.findall(r"\(([^()]+)\)", nm) if not re.match(r"(?i)(?:rating|level|force) \d", w)]
            if not text.strip():  # (no description of its own: its book block's prose, a mentor spirit's `**All:** …` lines)
                text = _block_text(block_prose.get(_key(nm), ""))
            grp = (gm := re.search(r' group="([^"]*)"', attrs)) and _unesc(gm.group(1))
            if grp and "(" not in nm:  # (a row under a group header: its own run-in of the group's text, `**Basic:**`)
                text = _variant_part(text, f"{grp} ({nm})", [f"{grp} ({n})" for n in grouped.get(kind, {}).get(_key(grp), ())])
            text = _variant_part(text, nm, names.get(kind, ()))
            cat = (cm := re.search(r' category="([^"]*)"', attrs)) and cm.group(1).casefold() or ""
            text = _own_part(text, nm, categorised.get(kind, {}).get(cat, ()))
            if (nest := re.search(r"\(([^()]+)\)\)\s*$", nm)) and not re.match(r"(?i)(?:rating|level|force) \d", nest.group(1)):
                # (`Pathogen Resistance (general)` / `(specific)`, one paragraph for both: the sentences that name the other version are
                # not this one's)
                text = _variant_sentences(text, [nest.group(1)], [m.group(1) for n in names.get(kind, ()) if n != nm and n[:nest.start()] == nm[:nest.start()]
                                                                  and (m := re.search(r"\(([^()]+)\)\)\s*$", n)) and not re.match(r"(?i)(?:rating|level|force) \d", m.group(1))],
                                          label=_label(_VARIANT.match(nm).group(2)).split()[0])
            found = read(text, kind, nm, (cl := re.search(r' class="([^"]*)"', attrs)) and cl.group(1) or "") + links(text, kind) + see_links(text, kind, nm) + addon_links(text, kind) + tire_links(text, kind)
            if sm := re.search(r"\b(?:the same (?:[a-z]+ )?(?:bonus|bonuses|effects?|results?) as|functions (?:just )?like|works (?:just )?like)"
                               r" (?:the |an? )?([a-z][a-z ]{2,30}?)(?=[,.;)]|$)", _norm(text), re.I):
                # (`The character receives the same Stealth bonuses as basic camouflage`, `This functions like the balance
                # tail`: as the sibling version named, a variant row of the same base or a row of the same run-in block)
                sw_, bk = set(_key(sm.group(1)).split()), _key(re.sub(r"\s*\(.*$", "", nm))
                sibs = [(_key(vm2.group(2)), n) for n in names.get(kind, ()) if n != nm and "(" in nm
                        and (vm2 := re.match(r"(.+?)\s*\(([^()]+)\)\s*$", n)) and _key(vm2.group(1)) == bk]
                if "(" not in nm and (blk := {b for b, _ in runins.get(_key(nm), ())}) and len(blk) == 1:
                    sibs += [(k, n) for k, v in runins.items() if k != _key(nm) and any(b in blk for b, _ in v)
                             for n in names.get(kind, ()) if _key(n) == k]
                for k, n in sibs:
                    if k in sw_ and (hit := by_kind.get(kind, {}).get(_key(n))):
                        found.append(("link", {"rel": "as", "kind": kind, "name": n, "ref": hit[0]}, None))
                        break
            if kind in ("augmentations", "adeptpowers", "qualities"):
                found += incompatibilities(text, nm)
            if variant_words:
                found = _resolve_variant(found, variant_words)
            nk = _key(re.sub(r"\s*\(.*$", "", nm))
            if kind in ("qualities", "augmentations", "gear", "critterpowers", "adeptpowers"):  # (an entry named for a sense has it)
                sense = SENSES.get(nk) or next((SENSES[_key(w)] for w in re.findall(r"\(([^()]+)\)", nm) if _key(w) in SENSES), None)
                if sense and not any(a.get("target") == f"sense:{sense}" for t, a, _ in found):
                    found.append(_fx(f"sense:{sense}", "add", "1"))
            if kind in ("gear", "programs") and nk in SOFTS and re.search(r' rating="|\brating\b', _unesc(attrs), re.I):  # (a skillsoft gives its skill at its rating)
                spec = re.search(r"\(([^()]+)\)", nm)
                found.append(_fx(SOFTS[nk], "set", "R", spec=spec.group(1) if spec and SOFTS[nk] != "skill:choice" else None))
            sec = section_of.get(_key(nm)) or section_of.get(_key(re.sub(r"\s*\(.*$", "", nm)))
            if not sec and kind in ITEM_KINDS:
                # (a table row of a section named for it, `Machine Gun Blast Shield (small)` of `Machine Gun “Blast Shields”`: the section's words all in its name)
                nw = {w.rstrip("s") for w in re.findall(r"[a-z]+", nm.casefold())}
                sec = max((n for n in intros if len({w.rstrip("s") for w in re.findall(r"[a-z]+", n.casefold())}) >= 3
                           and {w.rstrip("s") for w in re.findall(r"[a-z]+", n.casefold())} <= nw), key=len, default=None)
            if sec and intros.get(sec):
                found += [x for x in section_effects(intros[sec], text, nm, kind, sec) if x not in found]
            for v in re.findall(r'<variant name="([^"]*)"', kids):
                # (a variant an entry comes in, `Missile` for a rocket: its own table row, `Missile Variant` with its NOTES `+2 to
                # Attack Rating`, and the section's sentences about it, `Missiles are rockets that carry … sensor packages adding
                # their rating to the attack roll`, are effects when it is that variant, CRB p. 264)
                vk = _key(unesc_v := _unesc(v))
                if not vk or vk == "base":
                    continue
                said = [read(row[[x.strip().casefold() for x in header].index("notes")], kind) for header, row in by_name.get(_key(unesc_v + " variant"), [])
                        if "notes" in [x.strip().casefold() for x in header][:len(row)]]
                said += [read(s, kind) for s in sentences(intros.get(sec, ""))
                         if re.match(rf"^\W*{re.escape(vk)}s\s+(?:are|have|has|carry|get|gain|add|provide|grant|use|can|may|must)\b", s.casefold())] if sec else []
                found += [(t, {**a, "switch": "conditional", "when": f"{unesc_v}, {a['when']}" if a.get("when") else unesc_v, "rule": f"{unesc_v} variant"}, None)
                          for r in said for t, a, _ in r if t == "effect"]
            if re.search(r"\bthan the base item\b", _unesc(attrs)) and len(nm.split()) > 1:
                # (`Transgenic gills`: priced from the base item, the bioware it is the equivalent of: its effects)
                base = _key(nm.split(None, 1)[1])
                got = by_kind.get(kind, {})
                hit = got.get(base) or got.get(base.rstrip("s")) or \
                    next((v for k, v in sorted(got.items()) if k.startswith(base + " ") and v[1] == "bioware"), None)  # (`tails`: `Tail`; `chameleon skin`: its first variant)
                if not hit and (fm := re.search(r"ref\(\w+:(?:[a-z0-9]+\.)?([a-z0-9.-]+?)\s*[,)]", kids)):
                    hit = next((v for v in got.values() if v[0] == fm.group(1) or v[0].endswith("." + fm.group(1))), None)  # (the base its price formula cites: `webbed hands and feet` from `Hand and foot webbing`)
                if hit:
                    found.append(("link", {"rel": "as", "kind": kind, "name": nm.split(None, 1)[1], "ref": hit[0]}, None))
                    # (the version named for its base, `Transgenic hand and foot webbing` for `Transgenic webbed hands
                    # and feet`: a name the book's own words give it, as a search alias)
                    base_name = next((x for x in names.get(kind, ()) if got.get(_key(x), (None,))[0] == hit[0]), None)
                    if base_name and _key(f"{nm.split(None, 1)[0]} {base_name}") != _key(nm) and f"<alias>{base_name}" not in kids:
                        from xml.sax.saxutils import escape
                        kids = f"<alias>{escape(nm.split(None, 1)[0] + ' ' + base_name[:1].lower() + base_name[1:])}</alias>" + kids
                else:  # (a base printed as a group header over its versions: the version its name picks, else each)
                    gbase = _key(re.sub(r"\s*\([^()]*\)\s*$", "", nm.split(None, 1)[1]))
                    pick = _key(vm.group(1)) if (vm := re.search(r"\(([^()]+)\)\s*$", nm)) else None
                    for gn in grouped.get(kind, {}).get(gbase, ()) or grouped.get(kind, {}).get(gbase.rstrip("s"), ()):
                        if (gid := got.get(_key(gn))) and (pick is None or _key(gn) == pick):
                            found.append(("link", {"rel": "as", "kind": kind, "name": f"{gbase.title()}: {gn}", "ref": gid[0]}, None))
            for t, a, _ in found:  # a link's entry: this book's, or the book its citation names (`p. 70, SR6`)
                if t == "link":
                    sl = _slug(a["name"])
                    if a.get("kind") and sl in ids.get(a["kind"], ()):
                        a["ref"] = sl
                    elif a.get("book") and a["book"].lower() in _source_ids():  # (a source's id, `swc`; a book's name or its first word is no id)
                        a["ref"] = f"{a['book'].lower()}.{sl}"
                    a.pop("book", None)
            if kind == "programs" and (pm := re.search(r' type="([^"]*)"', _unesc(attrs))) and pm.group(1).casefold() in SOFT_TYPES:
                sk = _key(re.sub(r"\s*\(.*$", "", nm))
                if sk in SKILLS:  # (an autosoft named for a skill gives it at its rating, the section's general rule)
                    spec = re.search(r"\(([^()]+)\)", nm)
                    found.append(_fx(f"skill:{sk.replace(' ', '-')}", "set", "R", spec=spec.group(1) if spec else None))
            if kind == "weapons" and not any(t in ("effect", "link") for t, _, _ in found):
                k = _key(nm)
                std = next((a for a in STANDARD_ADDONS if k.endswith(" " + a) or k.endswith(" " + a + "s")), None)
                if std:
                    found.append(("link", {"rel": "as", "kind": "weapons", "name": std.capitalize()}, None))
            tab = by_name.get(_key(nm), [])
            based = lambda h: len(h) > 1 and h[1].strip().upper() == "BASE"  # noqa: E731
            if not tab and kind == "qualities" and (bm := re.fullmatch(r"(.+?) \(([^()]+)\)", nm)):
                # (`Ghoul (Dwarf)`: the row `Ghoul` whose BASE is Dwarf, the Companion's Infected Metatype Attributes, p. 109)
                tab = [(h, r) for h, r in by_name.get(_key(bm.group(1)), []) if based(h) and _key(r[1]) == _key(bm.group(2))]
            # (`Cyberjack (Rating 1)`: the row `Rating 1`; `Bone Lacing (Plastic)`, whose own row is its price's: the row
            # `Plastic` of the Bone Lacing table)
            if not any(table(h, r, kind) for h, r in tab) and (pm := re.search(r"\(([^()]+)\)\s*$", nm)):
                tab = tab + [(h, r) for h, r in by_name.get(_key(pm.group(1)), [])]
            if kind == "gear" and re.search(r' class="[^"]*INSTRUMENT', attrs) and (im := re.fullmatch(r"dice pool effect:\s*([+-]?\d+)\**", _norm(text.replace("**", "")).strip().casefold())) \
                    and int(im.group(1)) != 0:
                found.append(_fx("skill:con", "add", im.group(1).lstrip("+"), "conditional", "performance tests"))  # (a musical instrument's `Dice pool effect:`, Neo-Anarchist Streetpedia p. 156: on a Performance test)
            if kind in ("weapons", "ammotypes") and re.search(r' class="ammotype"', attrs) and (dm := re.search(r' dv="(\d+[PS])"', attrs)):
                found.append(_fx("item:dv", "set", dm.group(1)))  # (an ammo type printing a Damage Value of its own, not a modifier: the weapon's becomes it, Astral Ways p. 128)
            if kind == "ammotypes":  # (an ammo type's AR and DV: modifiers of the weapon it is loaded in, `–1S(e)`, `–2 to all`)
                at = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
                tab = tab or [(["AR", "DV"], [_unesc(at.get("ar", "")), _unesc(at.get("dv", ""))])]
            for header, row in tab:
                # (a quality's row of a table by base metatype is that base's, `when` naming it: an Infected type's maxima)
                w = row[1] if based(header) and (len(tab) > 1 or kind == "qualities") else None
                for t, a, _ in table(header, row, kind):
                    found.append((t, {**a, **({"when": w} if w else {})}, None))
            for header, trows in block_tables.get(_key(nm), ()):  # (a per-rating table under the entry: `R[1,1,2,2]`)
                found += [x for x in rating_table(header, trows, kind) if x not in found]
            if kind == "programs":  # (a Matrix program's `+2 to Defense Rating` is the Matrix one, CRB p. 184: `Armor`, the hacking program)
                found = [(t, {**a, "target": "derived:matrix-defense"} if t == "effect" and a["target"] == "derived:defense" else a, x) for t, a, x in found]
            if kind in ITEM_KINDS and not any(t == "effect" for t, _, _ in found) and re.search(r"accessor", _unesc(attrs), re.I) \
                    and re.search(r"<formula\b[^>]*>[^<]*\bR\b", kids):
                # (a rated add-on named for the attribute it raises, a cyberlimb's `Armor`, a booster's `Firewall`: its
                # rating to it; not a derived value, whose name leaves score or dice open)
                ts = [t for t in targets(nm.casefold(), kind) if t[0].startswith(("attr:", "matrix:"))] \
                    or ([(ADDON_STATS[_key(nm)], None)] if _key(nm) in ADDON_STATS else [])
                found += [_fx(t, "add", "R", spec=sp) for t, sp in ts[:1]]
            if kind in ITEM_KINDS and not any(t == "effect" for t, _, _ in found) and re.search(r' category="[^"]*\bmod\b', attrs, re.I) \
                    and re.search(r' rating="[^"]*\d', attrs):
                # (a rated vehicle mod named for the stat it replaces, `Enhanced Sensors`, `Improved Pilot` (DC pp. 141-142:
                # `Sensors may have a rating from 1 to 9`): the stat becomes its rating)
                # (named for the stat itself, in the name less its notes: `Reduce Cargo Space` or `Increasing Cargo Space (CF Mod)`
                # lowers or raises it, its rating is a price cell, `1 per 2 CF`, never the stat's new value)
                head = re.sub(r"\s*\(.*$", "", nm).casefold()
                ts = [] if re.match(r"(?:reduc|increas|decreas|expand|extend|enlarg|add|remov|chang)\w*\b", head) else \
                    [t for t in targets(head, "vehicles") if t[0].startswith("item:")]
                # (Standard Armor, Double Clutch p. 133: `modifies the Armor attribute of the vehicle` one for one: added to it)
                found += [_fx(t, "add" if re.search(r"\bmodif\w* the \w+ attribute[^.]{0,40}1:1\b", text or "", re.I) else "set", "R") for t, _ in ts[:1]]
            found += armor_fx
            kept = _KEEP.findall(kids)
            if only is not None:
                # (an entry an override added keeps the effects and links the override gave it, Commlink6's word; the text's add the targets
                # and links the override left)
                mine_fx, mine_ln = _FX.findall(kids), _LNK.findall(kids)
                set_ = {_attrs(x).get("target") for x in mine_fx}
                named = {(_attrs(x).get("name") or "").casefold() for x in mine_ln}
                found = [x for x in found if not (x[0] == "effect" and x[1]["target"] in set_) and not (x[0] == "link" and (x[1].get("name") or "").casefold() in named)]
                kept = kept + mine_fx + mine_ln
            kids = _DROP.sub("", kids)
            new = "".join(_tag(t, {k: str(v) for k, v in a.items()}) for t, a, _ in found)
            new = "".join(dict.fromkeys(kept + re.findall(r"<[^>]+/>", new)))
            cut = kids.find("<text>")
            kids = kids + new if cut < 0 else kids[:cut] + new + kids[cut:]
            attrs += split_rating(nm, attrs, kids, names.get(kind, ()))
            lines.append(f'{ind}<{tag} id="{eid}"{attrs}><name>{name}</name>{kids}</{tag}>{"</sr6:data>" if ln.rstrip().endswith("</sr6:data>") else ""}\n')
        out[fname] = "".join(lines)
    if added and texts_xml:
        from xml.sax.saxutils import escape
        done = set()

        def sub(m):
            t = added.get((m.group(1), m.group(2)))
            done.add((m.group(1), m.group(2)))
            return m.group(0) if t is None else f'<text of="{m.group(1)}" id="{m.group(2)}">{escape(t)}</text>'
        texts_xml = re.sub(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', sub, texts_xml, flags=re.S)
        # (a row with no text of its own given one, a variant's run-in or its rule: a new element)
        new = "".join(f'  <text of="{k}" id="{i}">{escape(t)}</text>\n' for (k, i), t in added.items() if (k, i) not in done and t.strip())
        if new and (cut := texts_xml.rfind("</")) >= 0:
            texts_xml = texts_xml[:cut] + new + texts_xml[cut:]
    return out, texts_xml


# ---------- links: the linked entry's effects copied into the entry (after every book is read) ----------
_FX = re.compile(r"<effect [^>]*/>")
_LNK = re.compile(r"<link [^>]*/>")
_ATTR = re.compile(r'([\w:-]+)="([^"]*)"')


def _attrs(tag):
    return {k: _unesc(v) for k, v in _ATTR.findall(tag)}


def _tag(name, a):
    from xml.sax.saxutils import escape
    return f"<{name}" + "".join(f' {k}="{escape(v, {chr(34): "&quot;"})}"' for k, v in a.items()) + "/>"


_PAIR = re.compile(r"-?\d+(?:\.\d+)?/-?\d+(?:\.\d+)?")
_NUM_ = r"\d+(?:\.\d+)?"
_PER_RATING = (re.compile(rf"(-?)R(?:\*(-?{_NUM_}))?(?:-({_NUM_}))?"), re.compile(rf"(-?)(?:({_NUM_})\*)R(?:-({_NUM_}))?"))


def _num(x):
    return str(int(x)) if x == int(x) else str(x)


def _at_level(v, n):
    """An effect value counted per rating at level n, in the forms the app reads (src/sr6/engine/effects.ts effectValue): `R`, `-R`,
    `R*2`, `2*R`, `R-1`, `R*2-2`, `R[1,1,2]`, each side of an on-road/off-road pair `R/-R`; a value with no rating as it is
    (`2`, `edg/2`, `hits`); None for a rating in any other form."""
    s = (v or "").replace(" ", "")
    if "/" in s and (parts := s.split("/")) and len(parts) == 2 and all(re.fullmatch(r"-?(?:[\d.]*[*]?R(?:[-*][\d.]+)?|[\d.]+)", p) for p in parts):
        got = [_at_level(p, n) for p in parts]
        return None if None in got else "/".join(got)
    if not re.search(r"(?<![A-Za-z])R(?![A-Za-z])", s):
        return v
    if m := re.fullmatch(r"R\[([-\d.,]+)\]", s):
        by = m.group(1).split(",")
        return by[min(n, len(by)) - 1]
    for rx in _PER_RATING:
        if m := rx.fullmatch(s):
            sign = -1 if m.group(1) else 1
            mult = float(m.group(2)) if m.group(2) else 1.0
            val = sign * mult * n
            if m.group(3):
                val = max(0.0, n * mult - float(m.group(3))) * (1 if sign > 0 else -1)
            return _num(val)
    return None


# the classes whose section or variant rules the core rulebook states for every item of them (a rule carries `rule="<its heading>"`):
# the same class in another book has them too; ponytail: two classes verified, add another when it is
CLASS_RULES = {"CYBERWARE/CYBER_LIMBS", "AMMUNITION/ROCKETS"}
_PARTIAL_LIMB = re.compile(r"\b(?:forearm|hand|lower leg|foot|feet|partial)\b", re.I)  # (partial limbs get no box: CRB p. 289, owner decision)


def _mentions(text, target):
    """Whether an entry's own text speaks of what the effect on `target` is about (`condition monitor`, a limb's attributes, Attack
    Rating …): a rule for the class does not fill in what the entry itself states."""
    tail = target.split(":", 1)[-1]
    if tail.endswith("-monitor"):
        return bool(re.search(r"condition monitor|\bboxes\b", text, re.I))
    if target.startswith("limb-attr:"):
        return bool(re.search(r"\battributes?\b", text, re.I))  # (its overdrive boosting Strength and Agility is no statement of its base ones)
    return bool(re.search(r"\b" + re.escape(tail.replace("-", " ")) + r"\b", text, re.I))


def copy_links(sources, texts=None):
    """The entries whose effects change when each link (`grants`, `as`) copies the linked entry's effects into the entry
    (owner direction 2026-10-17): {(source, file name): xml} of the changed files from `sources`, {source: {file name:
    xml}} (the catalog as on disk, ids scoped, one entry a line); texts: {source: {(kind, id): description}}, when the
    entries' own words matter (a class rule fills in nothing the entry's text speaks of). An effect the entry holds for the
    same target, op and specialization is its own and stays (the book's word for the entry wins); `when` of the link goes on
    the copies; a copy is `from` the linked id; the link is `copied`, for the app and the Foundry module not to follow it
    again. A `grants` link is counted at its `level` (the lowest when it names none: `R` is that level); a link whose entry
    is not found, or one of whose effects cannot be given at that level, is left unmarked and copies nothing (the app
    follows it). Run again, it starts from the entries' own effects."""
    texts = texts or {}
    ents, by_id, by_name, by_file = [], {}, {}, {}
    for src, files in sources.items():
        for fname, xml in files.items():
            for ln in (xml or "").splitlines():
                if not (m := _ENTRY.match(ln)):
                    continue
                _, _, eid, eattrs, name, kids = m.groups()
                e = {"src": src, "file": fname, "kind": fname[:-4], "id": eid, "key": _key(name), "name": _unesc(name),
                     "cls": (re.search(r' class="([^"]*)"', eattrs) or [None, ""])[1],
                     "own": [_attrs(x) for x in _FX.findall(kids) if ' from="' not in x],
                     "links": [_attrs(x) for x in _LNK.findall(kids)]}
                ents.append(e)
                by_file.setdefault((src, fname), {})[eid] = e
                by_id.setdefault(eid, []).append(e)
                for k in (e["kind"], ""):
                    by_name.setdefault((k, e["key"]), []).append(e)

    def target(e, link):
        c = [x for x in by_id.get(link.get("ref", ""), []) if not link.get("kind") or x["kind"] == link["kind"]] \
            or by_name.get((link.get("kind", ""), _key(link["name"])), [])
        # (the entry's own kind first, then its own book, then one that has effects: `Armor` a critter power's is the critter power)
        c = sorted((x for x in c if x is not e), key=lambda x: (x["kind"] != (link.get("kind") or e["kind"]), x["src"] != e["src"], not x["own"]))
        return c[0] if c else None

    def through(l, a):  # (a linked entry's effect as the linking entry holds it: a granted level's value, the link's condition)
        a = {k: v for k, v in a.items() if k != "rule"}  # (a class rule is the donor's bookkeeping: a copy through a link is not one)
        if l.get("rel") == "grants":
            v = _at_level(a.get("value", ""), int(l["level"]) if str(l.get("level", "")).isdigit() else 1)
            if v is None:
                return None
            a = {**a, "value": v}
        if l.get("when"):
            a = {**a, "when": l["when"], **({} if a.get("switch") else {"switch": "conditional"})}
        return a

    def effects_of(e, depth=0):  # (its own, then those of the entries it links: two levels deep, as the app reads them)
        out = [dict(a) for a in e["own"]]
        for l in e["links"] if depth < 1 else ():
            if l.get("rel") in ("grants", "as") and (t := target(e, l)):
                out += [x for a in effects_of(t, depth + 1) if (x := through(l, a))]
        return out

    class_rules = {}
    for x in ents:
        for a in x["own"]:
            if a.get("rule") and x["cls"] in CLASS_RULES:
                class_rules.setdefault((x["kind"], x["cls"]), []).append((x, a))
    changed = {}
    for e in ents:
        mine = {(a["target"], a["op"], a.get("spec")) for a in e["own"]}
        copies, marks = [], {}
        for l in e["links"]:
            if l.get("rel") not in ("grants", "as") or not (t := target(e, l)):
                continue
            got = [through(l, a) for a in effects_of(t)]
            if None in got:
                continue  # (an effect that cannot be given at that level: the link stays for the app to follow)
            marks[id(l)] = t
            for a in got:
                if (a["target"], a["op"], a.get("spec")) in mine:
                    continue
                # (an on-road/off-road pair that two links both give, Smart Tires working as off-road and racing tires: the better
                # of each side, the tire that suits the road it is on)
                same = next((c for c in copies if (c["target"], c["op"], c.get("spec")) == (a["target"], a["op"], a.get("spec"))
                             and _PAIR.fullmatch(c["value"]) and _PAIR.fullmatch(a["value"])), None)
                if same:
                    same["value"] = "/".join(str(max(float(x), float(y)) if "." in x + y else max(int(x), int(y)))
                                             for x, y in zip(same["value"].split("/"), a["value"].split("/")))
                elif not any((c["target"], c["op"], c.get("spec"), c.get("when"), c.get("switch")) == (a["target"], a["op"], a.get("spec"), a.get("when"), a.get("switch")) for c in copies):
                    copies.append({**a, "from": t["id"]})  # (the first link's copy of each condition and switch: two links reading alike are not twice; a firearm's and a melee weapon's stay, a wireless one and a plain one)
        if e["cls"] in CLASS_RULES and not (e["cls"] == "CYBERWARE/CYBER_LIMBS" and _PARTIAL_LIMB.search(e["name"])):
            # (a rule the core rulebook states for all items of a class, a section's or a variant's: the same class in another book has
            # it too unless it states its own or its text speaks of it, the Foamtek rocket's `Missile` or the Additional Cyberarm's
            # attributes, CRB pp. 265, 288; `from` names the rule)
            have = {(a["target"], a["op"], a.get("spec"), a.get("when")) for a in e["own"] + copies}
            words = (texts.get(e["src"]) or {}).get((e["kind"], e["id"]), "")
            for x, a in class_rules.get((e["kind"], e["cls"]), ()):
                if x["src"] != e["src"] and (k := (a["target"], a["op"], a.get("spec"), a.get("when"))) not in have \
                        and not _mentions(words, a["target"]):
                    have.add(k)
                    copies.append({**{k: v for k, v in a.items() if k != "rule"}, "from": f"{x['src']}:{a['rule']}"})
        e["copies"], e["marks"] = copies, marks
    for src, files in sources.items():
        for fname, xml in files.items():
            out, hit = [], False
            by = by_file.get((src, fname), {})
            for ln in (xml or "").splitlines(keepends=True):
                m = _ENTRY.match(ln)
                if not m or m.group(3) not in by or not (by[m.group(3)]["links"] or by[m.group(3)]["copies"] or ' from="' in ln):
                    out.append(ln)
                    continue
                e, (ind, tag, eid, attrs, name, kids) = by[m.group(3)], m.groups()
                links = _LNK.findall(kids)
                kids = _FX.sub(lambda x: "" if ' from="' in x.group(0) else x.group(0), kids)
                for old, l in zip(links, e["links"]):
                    new = {k: v for k, v in l.items() if k != "copied"}
                    if id(l) in e["marks"]:
                        new["copied"] = "yes"
                    kids = kids.replace(old, _tag("link", new), 1)
                add = "".join(_tag("effect", a) for a in e["copies"])
                ends = [x.end() for x in re.finditer(r"<(?:effect|link) [^>]*/>", kids)]
                cut = ends[-1] if ends else (kids.find("<text>") if "<text>" in kids else len(kids))
                kids = kids[:cut] + add + kids[cut:]
                nl = f'{ind}<{tag} id="{eid}"{attrs}><name>{name}</name>{kids}</{tag}>' + ("</sr6:data>" if ln.rstrip().endswith("</sr6:data>") else "") + ("\n" if ln.endswith("\n") else "")
                hit |= nl != ln
                out.append(nl)
            if hit:
                changed[(src, fname)] = "".join(out)
    return changed
