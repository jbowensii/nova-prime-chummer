"""The effects reader's vocabulary (attributes, skills, test types, activities, ...) and its sentence splitting."""

import re

# pylint: disable=line-too-long  # the word tables list one phrase or sentence per line

ATTRIBUTES = {
    "body": "bod",
    "agility": "agi",
    "reaction": "rea",
    "strength": "str",
    "willpower": "wil",
    "logic": "log",
    "intuition": "int",
    "charisma": "cha",
    "edge": "edg",
    "magic": "mag",
    "resonance": "res",
    "essence": "ess",
}
SKILLS = (
    "astral",
    "athletics",
    "biotech",
    "close combat",
    "con",
    "conjuring",
    "cracking",
    "electronics",
    "enchanting",
    "engineering",
    "exotic weapons",
    "firearms",
    "influence",
    "outdoors",
    "perception",
    "piloting",
    "sorcery",
    "stealth",
    "tasking",
)
# The book's own lists of which skills a test type covers (a vocabulary, the same in every book): Social tests are the
# ones that influence or con someone (CRB p. 97, Social Test Edge); Matrix tests are Matrix actions (CRB p. 179,
# Cracking and Electronics); magical tests the magic skills (CRB p. 127); a combat test an attack with a weapon skill.
# Physical, mental and attribute tests take the skills linked to those attributes (the skills catalog's attr).
TEST_TYPES = {
    "social": ("con", "influence"),
    "matrix": ("cracking", "electronics"),
    "magic": ("astral", "conjuring", "enchanting", "sorcery"),
    "resonance": ("tasking",),
    "combat": ("close-combat", "exotic-weapons", "firearms"),
    "vehicle": ("piloting",),
    "physical": ("bod", "agi", "rea", "str"),
    "mental": ("wil", "log", "int", "cha"),
}
# words of a specialization -> its skill (CRB's skill chapter): `Athletics (Climbing)`, `climbing tests`
SPECS = {
    "climbing": "athletics",
    "gymnastics": "athletics",
    "running": "athletics",
    "swimming": "athletics",
    "jumping": "athletics",
    "throwing": "athletics",
    "flight": "athletics",
    "balance": "athletics",
    "sprinting": "athletics",
    "acting": "con",
    "impersonation": "con",
    "performance": "con",
    "etiquette": "influence",
    "negotiation": "influence",
    "intimidation": "influence",
    "instruction": "influence",
    "leadership": "influence",
    "lockpicking": "engineering",
    "gunnery": "engineering",
    "palming": "stealth",
    "escape artist": "athletics",
    "sneaking": "stealth",
    "camouflage": "stealth",
    # Disguise is a specialization of both Stealth and Con (CRB); a test naming its skill keeps it, a bare
    # "Disguise" is Stealth (owner ruling 2026-10-21)
    "disguise": "stealth",
    "navigation": "outdoors",
    "tracking": "outdoors",
    "survival": "outdoors",
    "first aid": "biotech",
    "medicine": "biotech",
    "electronic warfare": "cracking",
    "hacking": "cracking",
    "blades": "close-combat",
    "clubs": "close-combat",
    "unarmed": "close-combat",
    "unarmed combat": "close-combat",
    "spellcasting": "sorcery",
    "counterspelling": "sorcery",
    "summoning": "conjuring",
    "summon": "conjuring",
    "banishing": "conjuring",
    "alchemy": "enchanting",
    "artificing": "enchanting",
    "disenchanting": "enchanting",
    "compiling": "tasking",
    "registering": "tasking",
    "decompiling": "tasking",
    "ground craft": "piloting",
    "aircraft": "piloting",
    "watercraft": "piloting",
    "visual": "perception",
    "aural": "perception",
    "tactile": "perception",
    "scent": "perception",
    "taste": "perception",
    "astral combat": "astral",
    "assensing": "astral",
    "repair": "engineering",
    "jump": "athletics",
    "climb": "athletics",
    "swim": "athletics",
    "lock picking": "engineering",
    "sleight-of-hand": "stealth",
    "sleight of hand": "stealth",
    "cybercombat": "cracking",
    "hearing": "perception",
    "sight": "perception",
    "smell": "perception",
    "impersonate": "con",
    "impersonating": "con",
    "pickpocket": "stealth",
    "picking pockets": "stealth",
    "falling": "athletics",
    "flying": "athletics",
    "sprint": "athletics",
    "balancing": "athletics",
}
# specializations the book prints under several skills -> those skills; SPECS holds the fallback (a bare one)
SHARED_SPECS = {"disguise": ("con", "stealth")}
# what each skill is used for, as the core rulebook's skill descriptions list it (CRB pp. 94-98): an activity a test is
# named by -> the skill it is a test of (owner decision 2026-10-10: tests named by activity are stored as that skill)
ACTIVITIES = [
    (
        r"grappl\w*|grapple|punch\w*|stab\w*|clubbing|melee|brawl\w*|unarmed (?:combat|attacks?)|parry\w*|block\w*",
        "close-combat",
    ),
    (
        r"escap\w*(?: bonds| restraints)?|flexibility|fitting into tight spaces|contortion\w*|sprint\w*|running|run|dodg\w*|diving|"
        r"free-?falling|falling|climb\w*|swim\w*|jump\w*|leap\w*|gymnastics|tumbl\w*|acrobatics|balance|lifting|throw\w*|"
        r"physical exertion|endurance",
        "athletics",
    ),
    (r"first aid|heal\w*|medic\w*|treat\w*|surgery|installing cyberware|diagnos\w*", "biotech"),
    (r"acting|disguis\w*|imperson\w*|performance|lying|lie|bluff\w*|deceiv\w*|decept\w*|fast-talk\w*|seduc\w*", "con"),
    (r"summon\w*|bind\w*|banish\w*", "conjuring"),
    (
        r"hacking|cybercombat|electronic warfare|jamming|brute force|backdoor|gain(?:ing)? access to (?:a |an |the )?(?:network|device|host)\w*|targets? ic\b",
        "cracking",
    ),
    (r"computers?|hardware|software|kludg\w*|matrix search\w*", "electronics"),
    (r"alchemy|artificing|disenchant\w*|crafting foci", "enchanting"),
    (
        r"repair\w*|build\w*|juryrig\w*|jury-rig\w*|lockpick\w*|picking locks|maglocks?|demolitions?|gunnery|armorer|mechanic\w*",
        "engineering",
    ),
    (r"shooting|firing", "firearms"),
    (
        r"etiquette|instruct\w*|teach\w*|intimidat\w*|leadership|lead\w*|negotiat\w*|haggl\w*|bargain\w*|persua\w*|inspir\w*",
        "influence",
    ),
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
STANDARD_ADDONS = (
    "laser sight",
    "smartgun system",
    "imaging scope",
    "silencer",
    "suppressor",
    "gas vent",
    "shock pad",
    "personalized grip",
    "bipod",
    "tripod",
    "periscope",
    "airburst link",
    "flashlight",
)
SOFT_TYPES = ("autosoft", "skillsoft", "activesoft")
DERIVED = {
    "defense rating": "defense",
    "astral defense rating": "defense-astral",
    "matrix defense rating": "matrix-defense",
    "social defense rating": "social",
    "social rating": "social",
    "composure": "composure",
    "judge intentions": "judge-intentions",
    "memory": "memory",
    "lift": "lift",
    "lift/carry": "lift",
    "power point": "power-points",
    "power points": "power-points",
    "essence hole": "essence-hole",
}
MATRIX = {
    "data processing": "data-processing",
    "firewall": "firewall",
    "sleaze": "sleaze",
    "attack attribute": "attack",
    "matrix attack": "attack",
    "overwatch score": "overwatch",
}
ITEM = {
    "attack ratings": "ar",
    "attack rating": "ar",
    "ar": "ar",
    "damage value": "dv",
    "dv": "dv",
    "concealability threshold": "concealability",
    "concealability": "concealability",
    "handling": "handling",
    "acceleration": "acceleration",
    "speed interval": "speed-interval",
    "top speed": "top-speed",
    "size class": "size",
    "seat": "seats",
    "seats": "seats",
    "passenger capacity": "seats",
    "seating": "seats",
    "pilot rating": "pilot",
    "pilot": "pilot",
    "pilots": "pilot",
    "sensor rating": "sensor",
    "sensor": "sensor",
    "sensors": "sensor",
    "body value": "body",
    "armor value": "armor",
    "cargo space": "cargo",
    "cargo": "cargo",
    "cf": "cargo",
}
# an add-on's name as the stat of its host it raises, where the name isn't a target word itself (a cyberlimb's Armor is
# its Defense Rating: `Increases to Armor increase your Defense Ratings`, CRB p. 289)
ADDON_STATS = {"armor": "derived:defense"}
VEHICLE_KINDS = {"vehicles", "vehicledesign"}
ITEM_KINDS = {
    "weapons",
    "armor",
    "gear",
    "electronics",
    "augmentations",
    "vehicles",
    "vehicledesign",
    "ammotypes",
    "programs",
}
NUMBERS = {
    "zero": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
    "ten": "10",
    "single": "1",
    "fifteen": "15",
    "twenty": "20",
    "twenty-five": "25",
    "thirty": "30",
    "forty": "40",
    "fifty": "50",
    "hundred": "100",
    "one hundred": "100",
}
# the senses the books grant as a rule of their own (CRB p. 118, Environment and Visibility; p. 275, visual and audio
# enhancements): an entry named for one, or a sentence granting one, has it (`sense:<name>`, shown, never summed)
SENSES = {
    "low-light vision": "low-light-vision",
    "low light vision": "low-light-vision",
    "thermographic vision": "thermographic-vision",
    "thermographic": "thermographic-vision",
    "low-light": "low-light-vision",
    "ultrasound": "ultrasound",
    "vision magnification": "vision-magnification",
    "wide band hearing": "wide-band-hearing",
    "wide-band hearing": "wide-band-hearing",
    "high frequency hearing": "high-frequency-hearing",
    "low frequency hearing": "low-frequency-hearing",
    "enhanced smell": "enhanced-smell",
    "echolocation": "echolocation",
    "astral perception": "astral-perception",
}
# fire modes (CRB p. 109): a modifier limited to some of a weapon's modes keeps them as its condition
FIRE_MODES = r"semi-auto(?:matic)?|burst fire|full auto(?:matic)?|single shot|\bsa\b|\bbf\b|\bfa\b|\bss\b"
_CONDITION = re.compile(
    r"\b(?:when|whenever|any ?time|while|if|unless|(?:limited|restricted) to|until (?=(?:you|they|the|it|he|she|its)\b)|after (?!the first\b)(?=(?:you|they|the|a|an|being|breaking|using|taking|making|spending|failing|succeeding)\b)|at will|only|as long as|in (?:any )?(?:form of )?(?:close combat|melee|combat)|(?:with|as|spend(?:ing)?|takes?|using) an? (?:minor|major) action|involving|"
    r"related to|against|versus|during|in (?:vr|the presence)|that use|that (?:directly )?involves?|used|"
    r"on an? (?:direct|critical) (?:hit|glitch)|(?:in|your|their) animal form|without (?:a|an|the|which|any)|once per (?:game )?(?:session|day|scene|run|week|round|turn|combat)|"
    r"(?:individuals|characters|those) (?:going|undergoing) through|in (?:an? |the )?(?:dark|darkness|low light|dim light|cold|hot|bright light)\b)\b",
    re.I,
)
# (an action paid to turn it on: `By spending an extra Minor Action`, `Investing a Minor Action`, `the expenditure of a
# Minor Action`)
_SPEND_ACTION = re.compile(
    r"\b(?:spend\w*|invest\w*|expenditure of)(?: an?| one| extra| additional)* (?:minor|major) actions?\b", re.I
)
_SWITCH = (
    ("wireless", re.compile(r"\bwireless\b", re.I)),
    ("sustained", re.compile(r"\bsustain(?:s|ed|ing)?\b", re.I)),
    (
        "activated",
        re.compile(
            r"\b(?:at will|activat\w*|(?:minor|major) action to|with an? (?:minor|major) action|turn(?:s|ed)? (?:on|off)|"
            r"overdrive|while active|is active)\b|" + _SPEND_ACTION.pattern,
            re.I,
        ),
    ),
)
ROLES = {"magician": "magician", "magicians": "magician", "adept": "adept", "adepts": "adept"}


def _slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.casefold()).strip("-")


def _norm(s):
    s = (s or "").replace("\u00ad", "").replace("’", "'").replace("–", "-").replace("—", "-").replace("−", "-")
    s = re.sub(r"(?<=[a-z])-\s+(?=(?!(?:or|and)\b)[a-z])", "", s)  # (`De- fense`; not `heat- or fire-related`)
    s = re.sub(r"(?<=/)\s*([+-])\s+(?=\d)", r"\1", s)  # (`–4/–5/– 4/+3`: a band's sign set apart)
    return " ".join(s.split())


def sentences(text, labels=False):
    """The text's sentences, a labelled line (`**Wireless bonus:** …`, `All: …`) and a list line each on its own; with
    `labels`, (label, sentence, paragraph number) triples, the label holding for the rest of its paragraph (`**Wireless
    bonus:** … increases to 2. You gain a bonus Minor Action …`)."""
    out = []
    for n, para in enumerate(re.split(r"\n(?=\s*(?:[•*]|\*\*[^*]+:\*\*|[A-Z][\w ]{1,30}:\s))|\n\s*\n", text or "")):
        one = _norm(para.replace("**", ""))
        # (a sentence may open with a quote; a clause after a semicolon is a statement of its own: `+2 to climbing
        # tests;
        # if both hands and feet have setae, +4`, `Light armor reduces DV by 1; Medium armor by 2`; `Mr. Johnson`: no
        # sentence's end)
        ss = [
            s
            for s in re.split(
                r"(?<=[.?])(?<!\bMr\.)(?<!\bMrs\.)(?<!\bMs\.)(?<!\bDr\.)(?<!\bSt\.)\s+(?=[A-Z(•“\"])|(?<=[.?]\))\s+(?=[A-Z])|(?<=!)\s+(?=[A-Z•“\"])|;\s+(?=\S)",
                one,
            )
            if s.strip()
        ]
        label = m.group(1) if ss and (m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+", ss[0])) else ""
        out += [(label, s, n) for s in ss] if labels else ss
    return out


# ---------- targets: a phrase -> [(target, when)] ----------
_ATTR_RX = "|".join(ATTRIBUTES)
_SKILL_RX = "|".join(sorted(SKILLS, key=len, reverse=True))
_SEVERITIES = ("mild", "moderate", "severe", "extreme")
_CHOOSE_ONE = re.compile(
    r"\(\s*choose one\s*\)|\bchoose one\b|\bthe choice of [a-z ]{0,25}?(?:skill|attribute)\b|\bselect one skill\b|\bpick one\b|\bone skill of your choice\b",
    re.I,
)
# a numeric dice modifier on tests the reader knows no target of (`-1 dice pool modifier to any fine manipulations using
# the webbed digits`)
_DICE_ON = re.compile(
    r"(?<![\w/])(?:(?P<v>[+-]\s?\d+)|(?P<w>an? (?:extra|additional|bonus)|one|two|three))\s*(?:bonus |extra |additional |dice pool |situational )*(?:dice|die|modifier|bonus|penalty)\b"
    r"[^.;]{0,30}?\b(?:on|to|for|when making|during)\s+(?:all |any |every |your |their |the |a |an )*(?P<t>(?:[a-z'-]+ ){0,5}?(?:tests?|rolls?|checks?|actions?|manipulations?)\b[^.;]*?)(?=\s+(?:but|and)\s+[a-z]+\s+(?:an? )?[+-]\s?\d|[.;]|$)",
    re.I,
)
_BARE_TEST = re.compile(r"(?:tests?|rolls?|checks?|actions?)\s*$", re.I)
# a wild die from converting one of the pool's dice (overdrive): `Convert one die on the Sprinting test to a wild die`,
# `One of these dice must be a wild die`
_WILD_CONV = re.compile(
    r",? one of which (?:must be|is) a wild die\b|\bconvert (?:one|a) die(?: (?:on|in|for|of) (?:the |a |an |that |this |your )*(?P<t>[^.;]*?))? to a wild die\b|"
    r"\bone (?:die )?(?:of (?:these|the|those) dice )?(?:must be|is|becomes|may be|can be) a wild die\b|\bone of (?:these|the|those) dice (?:must be|is|becomes) a wild die\b",
    re.I,
)
# who gets or loses the Edge when it is not the owner (`the opposing individual gains a point of Edge`, `opponents may
# not gain or spend Edge`)
_EDGE_OTHERS = re.compile(
    r"\b(?:the opposing (?:individual|spirit|character|party|side)|opponents?|observers?|attackers?|the target|targets?|spirits|anyone|others|whoever|their opposition|your opposition|"
    r"other (?:characters|individuals|people|runners|players)|(?:a|any) (?:character|individual|person|critter)s?(?= (?:within|who|that|in)\b)|the (?:caster|magician|mage|hacker|decker) (?:of|sustaining|casting) [a-z ]{3,25}|(?:any )?tests? made against you|"
    r"the source of [a-z ]+|each opponent|any entit(?:y|ies)|entities)\b[^.;,]{0,40}?\b(?:gains?|receives?|get|gets|may not|cannot|can't|can not|may never|never)\b[^.;,]{0,40}?\bedge\b|"
    r"\bgrants? (?:an? )?(?:point of )?(?:situational )?edge to (?:anyone|others|opponents?|observers?|the target|any \w+)\b|"
    r"\bthe users? (?:of (?:this|the) \w+ )?grants? (?:an? )?(?:point of )?(?:situational )?edge\b|"
    r"\btests? against [^,.;]+, they (?:gain|receive)s? (?:an? )?(?:additional )?(?:point of )?(?:situational )?edge\b",
    re.I,
    # (a subject and its Edge verb in one clause: the owner is `you`, an imperative, `the magician`, `the spirit` of its own
    # power)
)
# `they` after `you` (`you can give them a mean look … they can't gain or spend Edge`): the other party's
_THEY_EDGE = re.compile(
    r"\b(?:they|them)\b[^.;]{0,60}?\b(?:gains?|can't|cannot|can not|may not|are unable to)\b[^.;]{0,30}\bedge\b", re.I
)
# the weapons or fire an item bonus is for (`for all linked smartgun weapons`, `on thrown weapons`, `with Close Combat
# attacks`, `for Full-Auto`)
_ITEM_SCOPE_WORDS = (
    r"(?:thrown|melee|ranged|linked|smartgun|close combat|firearm|edged|bladed|unarmed|cyber-implanted|natural|full-auto|burst|single-shot|semi-automatic|"
    r"projectile|ballistic)\b[^.;,]{0,50}"
)
_ITEM_SCOPE = re.compile(
    r"\b(?:for|on|with|against|to)\s+(?:all |any |the |your |their |each )*(?P<q>"
    + _ITEM_SCOPE_WORDS
    + r")|^\W*on (?P<q2>"
    + _ITEM_SCOPE_WORDS
    + r")",
    re.I,
)
_GENERIC_RESIST = re.compile(
    r"\b(?:tests?|rolls?|checks?)\b|^(?:a |an )?(?:spell|power|attack)", re.I
)  # (what is resisted when it is a kind of test, not a kind of harm)
_RESIST_CLAUSE = re.compile(
    r"\bresist(?:ing|s)?\s+(?:an? |any |all |the |someone else's |attempts? to |attempts at )*(?P<x>[^.;,]{3,60})", re.I
)
_PRONOUN_TEST = re.compile(
    r"(?:(?:that|this|the|it|them|those|these|such|a|an|same|each|every|any|all)(?: (?:test|tests|roll|rolls|action|actions))?)?",
    re.I,
)
# thresholds the entry changes: `reduces any Outdoors (Navigation) test thresholds by 3`, `the threshold of cold
# survival tests is also decreased by one`,
# `-1 to threshold for climbing tests`, `Lowers the threshold by -2 for Perception tests to detect ambush`
_THRESHOLD = re.compile(
    r"\b(?P<d>reduc\w*|lower\w*|decreas\w*|rais\w*|increas\w*)\s+(?:the |any |all |your |their )*(?P<t>[^.;]{0,80}?)\s*thresholds?\b(?P<mid>[^.;]{0,80}?)\s+by\s+(?:a |an )?(?P<v>[+-]?\d+|one|two|three)\b(?P<after>[^.;]{0,120})|"
    r"\bthresholds?\s+(?:of|for|on)\s+(?:the |all |any )*(?P<t2>[^.;]{0,80}?)\s+(?:is|are)\s+(?:also\s+)?(?P<d2>decreas\w*|reduc\w*|lower\w*|increas\w*|rais\w*)\s+by\s+(?P<v2>[+-]?\d+|one|two|three)\b|"
    r"(?<![\w/])(?P<s3>[+-]\s?\d+)\s+(?:to|on)\s+(?:the )?thresholds?\s+(?:of|for|on)\s+(?P<t3>[^.;]{0,120})|"
    # (`all tactile Perception tests you make have their threshold increased by 1`, `-1 for all repair test thresholds`)
    r"\b(?:all |any |your )?(?P<t4>[a-z][^.;,]{0,60}?\btests?\b)(?: you (?:make|roll))? have their thresholds? (?P<d4>reduc\w*|lower\w*|decreas\w*|increas\w*|rais\w*) by (?P<v4>[+-]?\d+|one|two|three)\b|"
    r"(?<![\w/])(?P<s5>[+-]\s?\d+)\s+(?:to|for|on)\s+(?:all |any |the )*(?P<t5>[a-z][a-z ()-]{0,40}?\btests?) thresholds?\b",
    re.I,
)
# the words after a test's name that limit it: `tests made in your Home Ground`, `Survival tests in frigid
# environments`, `social interaction with a member of any union`
_QUALIFIER = re.compile(
    r"\b(?:tests?|rolls?|checks?|interactions?|actions?|attempts?|encounters?)\s+(?:(?:made|taken|performed|rolled|you (?:make|roll|perform|take))\s+)?"
    r"(?P<q>(?:in|within|at|with|versus|using|relating to|related to|pertaining to|where|that (?:would|could|might|are not|aren't|is not|isn't)|to [a-z]{3,})\b\s*[^.;,]{3,80})",
    re.I,
)
_BONUS_ACTION = re.compile(r"\b(?:bonus|extra|additional|free) minor action\b", re.I)
_REFUND = re.compile(
    r"\b(?:(?:on|during|in) (?:a|any|the|that) turns? (?:when|where|that|you|in which)\b[^.;,]+|(?:immediately )?after (?:spending|using|you spend|you use|you command)\b[^.;,]+|"
    r"when (?:you|the user|they|a user) (?:turn|activate|deactivate|extend|retract|use|spend|change|toggle|cancel|command)\b[^.;,]+|"
    r"when using the [a-z ]+? (?:minor |major )?action\b)",
    re.I,
)
# where a drug's `Effect:` line ends and its story begins, a sentence opening in the same run (no full stop)
_DRUG_FLAVOR = re.compile(
    r"(?<=[a-z0-9)]) (?=(?:When|If|While|Once|Originally|The|This|These|A|An|Users?|It|In|After|Before|Anyone|Taking|Unlike|Because|Some|Many|Most|With|"
    r"Designed|Invented|Developed|Worse|Normal|During|Initially|Often|Used|Although|Since|Based|Commonly|Popular)\b).*",
    re.S,
)
_DRUG_WORDS = {
    "initiative",
    "edge",
    "dice",
    "pain",
    "tolerance",
    "matrix",
    "confused",
    "nauseous",
    "blinded",
    "fatigued",
    "stilled",
    "dazed",
    "deafened",
    "frightened",
    "burning",
    "poisoned",
    "bleeding",
    "stunned",
    "prone",
    "panicked",
    "hobbled",
    "impaired",
    "dragon",
    "high",
    "low",
    "physical",
    "mental",
    "stun",
}


def _drug_cut(s):
    """A drug's `Effect:` line without the story run into it (`… -1 Willpower Chill is a great BTL for those who …`): up
    to the first capitalized word that starts a sentence of its own, not an attribute, skill or status."""
    s = _DRUG_FLAVOR.sub("", s, count=1)
    for m in re.finditer(
        r"(?<=[a-z0-9)]) (?=[A-Z][\w'’]*(?: [A-Z][\w'’]*){0,2} (?:was|is|were|are|has|had|comes|came|can|will)\b)", s
    ):
        before = s[: m.start()].split()
        first = s[m.start() + 1 :].split()[0].casefold()
        if (
            before
            and not before[-1][0].isupper()
            and first not in _DRUG_WORDS
            and first not in ATTRIBUTES
            and first not in SKILLS
        ):  # (not `High Pain Tolerance Zapzap is`: a name run into capitalized effect words)
            return s[
                : m.start()
                # (a name's story, `Ayao's Will was originally created by …`: its own sentence, the effect ends where it
                # begins)
            ]
    for m in re.finditer(
        r"(?<=[a-z0-9)]) (?=([A-Z][a-z]+) (?!(?:spells?|tests?|attacks?|actions?|rolls?|checks?)\b)[a-z]{2,})", s
    ):  # (`resist Manipulation spells`: a spell type, no story)
        if (
            m.group(1).casefold() not in _DRUG_WORDS
            and m.group(1).casefold() not in ATTRIBUTES
            and m.group(1).casefold() not in SKILLS
        ):
            return s[: m.start()]
    return s


_DRUG_CRASH = re.compile(r"\b(?:once|when|after) the (?:drug|effect|stimulant)s? (?:wears? off|ends?)\b", re.I)
_ATTR_TESTS = r"(?:tests?|rolls?|checks?) (?:involving|using|that (?:use|involve)) (?:a |an |any |one of the |the )?"
_TEST_WORDS = [  # (pattern, target): the test types a phrase names, longest first
    (
        r"(?:(?:tests?|checks?|rolls?|actions?) )?(?:involving|related to|for|in) (?:the )?operat(?:ion|ing) (?:of )?(?:an? |the |any )?(?:vehicles?|drones?)",
        "test:vehicle",
    ),  # (`all tests involving the operation of a vehicle`, Control Rig)
    (_ATTR_TESTS + r"physical attributes?", "test:physical"),
    (_ATTR_TESTS + r"mental attributes?", "test:mental"),
    # (the defense tests against what is named: astral attacks, direct or indirect combat spells; owner direction
    # 2026-10-17, the pools
    # Commlink6 splits Defense into)
    (
        r"(?:defen[cs]e|defensive) (?:tests?|pools?|dic?e) (?:against|vs\.?|versus) (?:all |any )?astral (?:attacks?|combat)|astral (?:defen[cs]e|defensive) (?:tests?|pools?|dic?e)|astral defen[cs]e(?! rating)|defend(?:ing)? against (?:all |any )?astral (?:attacks?|combat)",
        "test:defense-astral",
    ),
    (
        r"(?:resist(?:ing|s)?|defen[cs]e|defensive|defend(?:ing)?)(?: tests?| pools?| dic?e)? (?:against|vs\.?|versus) (?:an? |all |any )?direct (?:combat )?spells?",
        "test:defense-spell-direct",
    ),
    (
        r"(?:resist(?:ing|s)?|defen[cs]e|defensive|defend(?:ing)?)(?: tests?| pools?| dic?e)? (?:against|vs\.?|versus) (?:an? |all |any )?indirect (?:combat )?spells?",
        "test:defense-spell-indirect",
    ),
    (
        r"damage resistance|resist(?:ing|s)? (?:physical |stun )?damage|soak(?:ing)? damage|soak(?:ing)?\b",
        "test:damage-resistance",
    ),
    (r"drain(?: resistance)?|resist(?:ing)? drain", "test:drain-resistance"),
    (
        r"(?:toxin|poison|drug|pathogen|disease)s?(?: resistance)?|resist(?:ing)? (?:toxins?|poisons?|drugs?|pathogens?|diseases?)",
        "test:toxin-resistance",
    ),
    (r"fatigue", "test:fatigue-resistance"),
    (r"defen[cs]e tests?|defensive tests?|defending|defense pools?|(?:spell |boosted )*defense dic?e", "test:defense"),
    (r"social (?:tests?|interactions?|situations?|skill tests?|encounters?|actions?|checks?)|social\b", "test:social"),
    (r"addiction tests?", "test:addiction"),
    (
        r"magic(?:al)? resistance tests?|spell resistance|resist(?:ing|s)? (?:all |any )?(?:spells?|magic)\b",
        "test:magic-resistance",
    ),
    (r"resist(?:ing|s)? (?:all |any )?[a-z]+(?:-based)? (?:attacks?|damage)", "test:damage-resistance"),
    # (the two Matrix actions the data knows, CRB pp. 177-178: Edge on a Matrix search, dice for Matrix Perception
    # checks;
    # any other Matrix test stays the family)
    (r"matrix search(?:e?s)?", "action:matrix-search"),
    (r"(?:normal |standard )?matrix perception(?: checks?)?", "action:matrix-perception"),
    (r"resonance (?:tests?|actions?)", "test:resonance"),
    (r"matrix (?:tests?|actions?)", "test:matrix"),
    (
        r"(?:magic(?:al)?|magic skill) tests?|(?:any |the corresponding )?(?:magical )?skills? involving magic|corresponding magical skills?",
        "test:magic",
    ),
    (
        r"physical (?:tests?|activities|activity|skills?)|tests? (?:involving|using|that use) (?:one of )?(?:the |your )?(?:four )?physical attributes?",
        "test:physical",
    ),
    (
        r"mental (?:tests?|skills?)|tests? (?:involving|using|that use) (?:one of )?(?:the |your )?(?:four )?mental attributes?",
        "test:mental",
    ),
    (r"(?<!close )(?:attack|combat) (?:tests?|rolls?)", "test:combat"),
    (r"surprise tests?", "test:surprise"),
    (r"(?:when )?targeted by (?:a |any )?spells?", "test:magic-resistance"),
    (r"crash tests?", "test:crash"),
    (r"vehicle tests?", "test:vehicle"),
]


_ACTION_STOP = {
    "a",
    "an",
    "one",
    "additional",
    "extra",
    "bonus",
    "free",
    "the",
    "minor",
    "major",
    "matrix",
    "this",
    "that",
    "same",
    "any",
    "all",
    "and",
    "or",
    "each",
    "every",
    "other",
    "another",
    "first",
    "second",
    "next",
    "following",
    "previous",
    "new",
    "single",
    "legal",
    "illegal",
    "hacking",
    "combat",
    "social",
    "physical",
    "mental",
    "specific",
    "appropriate",
    "such",
    "its",
    "their",
    "your",
    "own",
    "chosen",
    "selected",
    "no",
    "non",
    "per",
    "sustained",
    "threaded",
}
_NOT_ACTION = r"(?:" + "|".join(sorted(_ACTION_STOP, key=len, reverse=True)) + r")\b"
_NOT_A_NAME = {
    "for",
    "of",
    "to",
    "in",
    "on",
    "with",
    "by",
    "at",
    "tests",
    "test",
    "skill",
    "skills",
    "hostile",
    "dice",
    "bonus",
    "particular",
    "given",
    "using",
}  # (words that make a phrase before `matrix actions` no action's name)


def _unesc(s):
    return (
        s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&apos;", "'").replace("&amp;", "&")
    )


def _key(s):
    return re.sub(r"[^a-z0-9]+", " ", _unesc(s).casefold().replace("’", "'")).strip()
