"""The kinds a book prints as sections of its own (gap plan A5/A7, the K1 kinds): every heading or bold run-in under a
section whose heading names the kind. The vocabulary is the game's own section words (`Minor Actions`, `Edge
Actions`, `Mentor Spirits`, `Data Structures`, `Quality Paths`, `Contact Types`, `Paragons`), never an item's name:

- **a heading** whose parent heading (the nearest above it at a shallower level) names a kind is an entry of that
  kind: `#### Avoid Incoming (A)` under `### Minor Actions`, `### Backdoor Entry` under `## Matrix Actions`, `#### Bear`
  under `### Mentor Spirit Archetypes`; so is a heading naming its kind before a colon (`Quality Path: Critter Bond`,
  `New Edge Action: Prepare to Board!`, `New Contact Type: Free Spirit`). A lower-case box title, a heading naming the
  kind itself (`Minor Actions` under `Game Timing and Actions`) and an example are not;
- **a bold run-in** (`• **Reroll one die:** …`, `**2 Edge: Black Thumb**`) in a block whose heading, or whose parent's,
  names a run-in kind is an entry: the Edge boosts and Edge actions, the data structures, the contact types. A run-in
  naming the kind itself (`Electronic Warfare Programs:`) introduces it; a run-in `**2 Edge: Name**` is an Edge action
  wherever it is printed.

The entries are written as well as the rule sections (the rules contents keep them). Their attributes are what the
heading and its section print: an action's type (minor, major, edge, boost: the section's words; a Matrix action's
`(Major)` tag), its timing (`(I)` initiative, `(A)` anytime), its Edge cost (`(2 Edge)`, `N-Edge Boosts`, `Cost: N
Edge`), the action it goes with (`Anticipation (Multiple Attacks, Ranged Attack)`); a quality path's steps (the headings
under it)."""
import re
from dataclasses import dataclass, field, replace

from importer.sr6 import effects, flags
from importer.sr6.regroup import norm, text_page

# kind -> the words of a parent heading whose child headings are its entries
HEADING_KINDS = [
    ("critterpowers", re.compile(r"\b(?:sprite|critter)\s+powers\b|^inherent\b.*\bqualities$", re.I)),  # (a being's
    # inherent qualities are its powers: `Inherent Virtual Life Form Qualities`)
    ("metamagics", re.compile(r"^(?:new\s+|adept\s+)?metamagics?(?:\s+techniques)?$", re.I)),
    ("sprites", re.compile(r"^(?:new\s+)?sprite\s+types$", re.I)),
    ("traditions", re.compile(r"^traditions$", re.I)),
    ("martialtechniques", re.compile(r"\bmartial\s+arts?\s+techniques$", re.I)),  # `Cyberware Martial Arts Techniques`
    ("qualities", re.compile(r"^(?:new\s+)?(?:positive|negative)\s+qualities$", re.I)),
    # a kind a Game Information chapter lists under a heading of its own (`ADEPT POWERS`): each heading under it that
    # prints the kind's own labels (FIELDED) is one, its fields read from them as the recipe reads them
    ("adeptpowers", re.compile(r"^(?:new\s+)?adept\s+powers?$", re.I)),  # (`New Adept Power`: one, Collapsing Now p. 62)
    ("actions", re.compile(r"\bactions\b|\b(?:edge|major|minor|matrix|free|interrupt|status|response|chase)\s+action\b"
                           r"|\bedge\s+boosts?\b|\bspending\s+edge\b", re.I)),
    ("mentorspirits", re.compile(r"\bmentor\s+spirits?\b|\bparagons\b", re.I)),
    ("qualitypaths", re.compile(r"\bquality\s+paths?\s*$", re.I)),
    ("vehicledesign", re.compile(r"\bdesign\s+(?:options?|modifications?)\b|\bquality\s+factors?\b", re.I)),
]
# the labels an entry of a kind read under its own heading prints (an adept power's Cost in PP, its Activation)
FIELDED = {"adeptpowers": {"cost", "activation"}}
TOXIN_LABELS = {"vector", "speed", "power"}  # a toxin's stat lines (the core rulebook's toxin form)
# kind -> the words of a heading (the block's own or its parent's) whose bold run-ins are its entries
RUNIN_KINDS = [
    ("gear", re.compile(r"\bfoci\b", re.I)),  # `Enchanting Foci`: its kinds of focus, priced as the `Enchanting focus` row
    ("echoes", re.compile(r"\bechoes\b", re.I)),
    ("critterpowers", re.compile(r"\b(?:drake|sprite|critter|dracogenesis)\s+powers\b|\bsprite\s+commands\b", re.I)),
    ("programs", re.compile(r"\b(?:cyber)?programs?\b|\bautosofts\b|\bapps\b|\be-softs?\b", re.I)),
    ("qualities", re.compile(r"^(?:new\s+)?(?:positive|negative)\s+qualities$", re.I)),
    ("actions", re.compile(r"\bedge\s+(?:boosts?|actions?)\b|\bspending\s+edge\b|\b(?:fire|combat)\s+actions\b", re.I)),
    ("datastructures", re.compile(r"\bdata\s+structures\b", re.I)),
    ("contacttypes", re.compile(r"\bcontact\s+types\b", re.I)),
]
# a heading naming its kind before a colon (`Quality Path: X`, `New Edge Action: X`, `New Contact Type: X`)
PREFIX = [("qualitypaths", re.compile(r"^(?:new\s+)?quality\s+path\s*:\s*(.+)$", re.I)),
          ("actions", re.compile(r"^(?:new\s+)?(?:(?:status|response|chase)\s+)?(?:edge|major|minor)\s+action\s*:\s*(.+)$", re.I)),
          ("contacttypes", re.compile(r"^(?:new\s+)?contact\s+type\s*:\s*(.+)$", re.I)),
          ("metamagics", re.compile(r"^(?:new\s+)?metamagic\s*:\s*(.+)$", re.I)),
          ("programs", re.compile(r"^new\s+(?:[a-z-]+\s+)?program\s*:\s*(.+)$", re.I)),  # `new hacking program: hitchhiker`
          ("qualities", re.compile(r"^new\s+(?:(?:positive|negative)\s+)?quality\s*:\s*(.+)$", re.I))]
# a heading whose tag line names its kind (`##### Vanishing` over `(Ability/Critter Power)`)
TAG_KINDS = [("critterpowers", re.compile(r"\bcritter\s+power\b", re.I))]
# a heading naming its kind after the name (`##### Paragon (Positive Quality)`)
KIND_SUFFIX = re.compile(r"^(.+?)\s*\(((?:positive|negative)\s+quality)\)$", re.I)
# run-in labels that are a field of the block, not an entry of its kind
FIELD_LABELS = re.compile(r"^(?:cost|note|notes|game\s+effects?|game\s+rules?|effects?|advantages?|disadvantages?|"
                          r"requirements?|prerequisites?|example|bonus|duration|rules|test|limit|threshold|range|choose\s+one|"
                          r"resources|contact\s+points|contact\s+types|all|magician|adept|similar\s+archetypes|"
                          r"use\s+an\s+edge\s+action|wireless\s+bonus|skills?)$", re.I)
# a Matrix action's test line, set under its heading: `(Illegal) Cracking + Logic vs. Willpower + Firewall (Major)`
MATRIX_TEST = re.compile(r"\((?:il)?legal\)[^;]*\((?:major|minor)\b", re.I)
EXAMPLE = re.compile(r"\b(?:example|sample|summary|table|definition|note)s?\b|\bby\s+cost\b|^\d+\s*-?\s*edge$"
                     r"|\((?:positive|negative)\s+quality\)", re.I)
_COST_LINE = re.compile(r"\bCost:\s*\d+\s*(Edge|Karma)\b", re.I)  # an entry's price line (`Cost: 2 Edge`)
_TIMING = re.compile(r"\s*\((I|A)\)\s*$")
_EDGE = re.compile(r"\s*\((\d+)\s*Edge\)\s*$", re.I)
_EDGE_FIRST = re.compile(r"^(\d+)\s*Edge\s*:\s*(.+)$", re.I)
_RUNIN = re.compile(r"^\W{0,3}\*\*(?P<name>[^*]+?)(?::\*\*|\*\*\s*:|:?\*\*\s*$)(?P<rest>.*)$")


# the lists of what a section grants (`Powers`, `Characteristics` under `Returned Soldiers`)
GRANTED_LIST = re.compile(r"(powers|characteristics)", re.I)
# a list of what a section costs its taker (`### The Costs` under `# Drakes`): its bold run-ins drawbacks it grants
DRAWBACKS = re.compile(r"(?:the\s+)?(?:costs|drawbacks)", re.I)
# `Select two powers from the list … and one characteristic from …`: (count, noun) pairs
CHOOSE = re.compile(r"(?:\b(?:select|choose|pick|take)\s+|\band\s+)(\d+|one|two|three|four|five|six)\s+(\w+?)s?\s+from\b",
                    re.I)
_COUNTS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}


def _count(w):
    return int(w) if w.isdigit() else _COUNTS.get(w.lower())


def _singular(name):
    """`Returned Soldiers` -> `Returned Soldier`, `Abilities` -> `Ability` (its last word's)."""
    words = name.split()
    if not words:
        return ""
    last = words[-1]
    one = last[:-3] + "y" if last.lower().endswith("ies") else last[:-1] if last.lower().endswith("s")         and not last.lower().endswith("ss") else last
    return " ".join(words[:-1] + [one])


@dataclass
class Found:
    kind: str
    name: str
    page: int
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)  # (tag, attrs, text)
    text: str = ""
    block: object = None  # the heading's block (a kind the recipes read already reads its fields from it)
    priced_steps: int = 0  # a quality path's steps that are qualities priced in Karma
    path: object = None  # an unpriced quality path step's path: written only when that is a path (is_path)
    cites: tuple = ()  # the pages a run-in list's intro points to (`See the Programs section … (p. 184)`): reprint()


def _kind_of(name, rules):
    return next((k for k, rx in rules if rx.search(name or "")), None)


# what may follow the kind's words when they head a heading: nothing, a parenthetical, a colon, or more of the same
# (`Autosofts and E-Softs`)
_HEAD_TAIL = re.compile(r"\s*(?:$|[(:]|and\b|&)", re.I)


def _runin_kind(name):
    """The run-in kind a heading names as its head noun: the kind's words end it (`New Echoes`, `Basic Drake Powers`).
    A title that only mentions them (`Echoes of a Lost Signal`, a book's own title; `Echoes of Divinations`, a group)
    names no kind."""
    return next((k for k, rx in RUNIN_KINDS for m in rx.finditer(name or "") if _HEAD_TAIL.match(name, m.end())), None)


ACTION_WORD = re.compile(r"\baction\b", re.I)


def forms(text):
    """The names a section's text gives as its forms (`comes in one of two forms: boosted defense and dispelling`),
    in norm form."""
    m = re.search(r"\bforms?\b[^.:;]{0,40}:\s*([^.;]+)", " ".join((text or "").split()), re.I)
    return {norm(x) for x in re.split(r",\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+", m.group(1)) if x.strip()} if m else set()


def _action_attrs(name, chain, tags="", text=""):
    """(clean name, attributes) of an action: its type from the section words, timing, Edge cost and companion action."""
    a = {}
    m = _TIMING.search(name)
    if m:
        a["timing"] = "initiative" if m.group(1) == "I" else "anytime"
        name = name[:m.start()]
    m = _EDGE.search(name)
    if m:
        a["edge"], name = m.group(1), name[:m.start()]
    m = _EDGE_FIRST.match(name)
    if m:
        a["edge"], name = m.group(1), m.group(2)
    hay = " ".join(chain).lower()
    if t := re.search(r"\((major|minor)\)", tags or "", re.I):
        a["type"] = t.group(1).lower()
    elif "boost" in hay:
        a["type"] = "boost"
    elif "edge" in hay:
        a["type"] = "edge"
    elif "major" in hay:
        a["type"] = "major"
    elif "minor" in hay:
        a["type"] = "minor"
    if "edge" not in a:
        if m := re.search(r"\b(\d+)\s*-\s*edge\s+boosts?\b", hay):
            a["edge"] = m.group(1)
        elif m := re.search(r"\bcost:\s*(\d+)\s*edge\b", " ".join((text or "").split()), re.I):
            a["edge"] = m.group(1)
    if m := re.match(r"^(.*?\S)\s*\(([^()]*(?:\[[^\]]*\])?[^()]*)\)\s*$", name):  # `Big Speech (Use Skill [Influence])`
        if a.get("type") in ("edge", "boost") and not re.fullmatch(r"\d+|[IA]", m.group(2)):
            name, a["with"] = m.group(1), m.group(2)
    a["category"] = chain[-1] if chain else None
    return name.strip(" .:"), a


class Reader:
    """Fed every block in reading order (feed(block, page)), it returns the entries of the section kinds the block is
    or holds."""
    # toxins read from their stat lines (a book printing no price table for them: the general recipe's books turn it
    # on while they are read; the core rulebook prices its drugs and toxins in tables of its own)
    toxins = False

    def __init__(self):
        self.stack, self.chapter, self.path = [], None, None  # path: [level, Found, its steps' level, step prices,
        # the names its steps grant (step_qualities)]
        self.prefixed = set()  # the parent headings a `Kind: Name` child names its kind under (the others aren't)
        self.granted = {}  # a granted list's noun (`power`) -> (its category, the most of it one may have, or None)

    def feed(self, b, page):
        if b.chapter != self.chapter:
            self.chapter, self.stack, self.path, self.prefixed = b.chapter, [], None, set()
            self.packs = False  # a chapter printing PACK headings: a heading over a `(N nuyen)` line there is a pack
        out, lv = [], b.level or 0
        heading = lv > 0
        while heading and self.stack and self.stack[-1][0] >= lv:
            self.stack.pop()
        chain = [x[1] for x in self.stack]
        parent = chain[-1] if chain else ""
        if heading and self.path:
            # a step set at the path heading's own level naming its path (`Part of the Family: Deserted`): its step,
            # under its printed name
            named = lv == self.path[0] and re.match(rf"\s*{re.escape(self.path[1].name)}\s*:", b.name, re.I)
            if lv <= self.path[0] and not named:
                self.path = None
            else:  # a quality path's steps: the headings right under it
                if not INTRO_STEP.fullmatch(b.name.strip()):  # (an intro set a level above the steps: `Starting Point`)
                    self.path[2] = self.path[2] or lv
                if lv == self.path[2] and b.name[:1].isupper() and not EXAMPLE.search(b.name):
                    self.path[1].children.append(("step", {}, b.name))
                    qs = step_qualities(b, page, "" if named else self.path[1].name, self.path[1].name, self.path[3],
                                        self.path[4])
                    self.path[1].priced_steps += any(q.path is None for q in qs)
                    for q in qs:
                        q.path = q.path and self.path[1]
                    out += qs
                elif self.path[2] and lv > self.path[2] and norm(b.name) in self.path[4]:
                    # a quality its step grants, described under a heading of its own right under it (`##### No Code`
                    # under `Step 2: No Code or Penitent or Re-Bound`): the path's quality
                    self.path[4].discard(norm(b.name))
                    q = imposed(b.name.strip(), page, _body(b))
                    q.path = self.path[1]
                    out.append(q)
        if self.path:
            self.path[3].update(step_prices(b.text))  # (prices the prose gives the steps after it)
        if heading:
            out += self._heading(b, page, chain, parent)
            if PACK_WORD.search(b.name):
                self.packs = True
            if not out:
                out += packs(b, page, parent, self.packs)
        out += design_tables(b, page) + quality_sets(b, page) + derived(b, page)
        rk = _runin_kind(b.name)
        if not rk and re.fullmatch(r"(?i)basic|hacking", b.name.strip()) and re.search(r"(?i)\bprograms\b", parent):
            rk = "programs"  # `Basic` and `Hacking` under `Programs`
        if not rk and KEYWORDS.search(b.name) and re.search(r"\bkeywords\b", b.text or "", re.I):
            rk = "spellfeatures"  # a spell or ritual section introducing its keywords, each a bold run-in
        if not rk and heading and not out and (pk := _runin_kind(parent)):
            rk = pk  # the parent heading names the kind (`Core Vehicle Modifications` under `Autosofts and E-Softs`)
        if not rk and heading and not out and DRAWBACKS.fullmatch(b.name.strip()) and chain:
            out += self._drawbacks(b, page, _singular(chain[-1].strip()))
        if rk and not out:  # (a heading that is an entry itself: its bold lines are its own)
            out += self._runins(b, page, rk, chain + [b.name])
        elif not rk and not out:  # `**2 Edge: Black Thumb**`: an Edge action wherever it is printed
            out += [f for f in self._runins(b, page, "actions", chain + [b.name], _EDGE_FIRST)]
        if heading:
            # a Matrix action's test line set as a heading of its own under it: its parent heading is the action
            if MATRIX_TEST.search(b.name) and self.stack and not self.stack[-1][3]:
                plv, pname, pb, _, ppage = self.stack[-1]
                pb = replace(pb, tags=f"{pb.tags}; {b.name}" if pb.tags else b.name)
                out.append(self._make("actions", pname, pb, ppage, chain[:-1]))
                self.stack[-1] = (plv, pname, pb, True, ppage)
            self.stack.append((lv, b.name, b, bool(out), page))
            qp = next((f for f in out if f.kind == "qualitypaths"), None)
            if qp:
                self.path = [lv, qp, None, step_prices(b.text), set()]
        return out

    def _heading(self, b, page, chain, parent):
        name = b.name.strip()
        for kind, rx in PREFIX:
            if m := rx.match(name):
                self.prefixed.add((len(chain), parent))
                n = m.group(1).strip()
                f = self._make(kind, n[:1].upper() + n[1:], b, page, chain)
                if f and kind == "programs":
                    f.attrs["type"] = program_type(name[:m.start(1)])
                return [f] if f else []
        if m := KIND_SUFFIX.match(name) or KIND_SUFFIX.match(f"{name} ({b.tags})"):
            return [f for f in [self._make("qualities", m.group(1), b, page, chain + [m.group(2)[:-1] + "ies"])] if f]
        # (its tag line, or a parenthesized line among the first of its text: regroup leaves it there under labels)
        tagline = b.tags or next((ln for ln in (b.text or "").splitlines()[:4] if re.fullmatch(r"\s*\([^()]+\)\s*", ln)), "")
        for kind, rx in TAG_KINDS:
            if rx.search(tagline) and name[:1].isupper():
                return [f for f in [self._make(kind, name, b, page, chain)] if f]
        if f := self._family_quality(b, page):
            return [f]
        if f := self._bought_as_quality(b, page, chain):
            return [f]
        if f := self._granted_ability(b, page):
            return [f]
        if f := self._granted_quality(b, page):
            return [f]
        if self.toxins and TOXIN_LABELS <= {k.lower() for k in b.labels} and name[:1].isupper() \
                and "|" not in (b.text or ""):
            # a toxin's stat lines (Vector, Speed, Power …) under its heading, no price table (a drug's row is read
            # with its table): gear, its category the heading over it
            return [Found("gear", name, page, {"category": parent or None}, [], _body(b), b)]
        if f := self._priced_heading(b, page, chain):
            return [f]
        kind = _kind_of(parent, HEADING_KINDS)
        if not kind and (f := optional_rule_quality(b, page)):
            return [f]
        labels = {k.lower(): v for k, v in b.labels.items()}
        if not kind and "game effect" in labels and re.match(r"\s*\d+\s*Karma\b", labels.get("cost") or labels.get("bonus") or "", re.I) \
                and (name[:1].isupper() or re.match(r"[a-z]+[A-Z]{2}", name)) and not EXAMPLE.search(name) \
                and b.row is None and not b.stats \
                and not _kind_of(name, HEADING_KINDS + RUNIN_KINDS) and not any(
                    (m := _RUNIN.match(ln)) and not FIELD_LABELS.match(m.group("name").strip())
                    for ln in (b.text or "").splitlines()):
            # a quality's own shape wherever it is printed (`### rEVOlutionary` under `## Game Information`: `Cost: 10
            # Karma`, `Game Effect: …`)
            return [f for f in [self._make("qualities", name, b, page, chain)] if f]
        if not kind and len(chain) > 1 and self.stack[-1][3] and (m := _COST_LINE.search(" ".join((b.text or "").split()))) \
                and (pm := _COST_LINE.search(" ".join((self.stack[-1][2].text or "").split()))) \
                and m.group(1).lower() == pm.group(1).lower():
            # an entry set a level too deep under the one before it, priced as it is (`#### Yielding Force` after
            # `### Weapon Spread`, both `Cost: N Edge`): the kind's next entry, the one before it its sibling
            if k := _kind_of(chain[-2], HEADING_KINDS):
                return [f for f in [self._make(k, name, b, page, chain[:-1])] if f]
        if not kind and self.stack and norm(name) in forms(self.stack[-1][2].text):
            # a heading the section above names as one of its forms, and an action (owner, 2026-10-07):
            # Counterspelling "comes in one of two forms: boosted defense and dispelling"
            f = self._make("actions", name, b, page, chain) if ACTION_WORD.search(b.text or "") else None
            if f and "type" not in f.attrs and (t := re.search(r"\b(major|minor)\s+action\b", b.text or "", re.I)):
                f.attrs["type"] = t.group(1).lower()
            # (owner, 2026-10-08) a form whose text names no action type takes its sibling form's (Dispelling: Major)
            sib = self.__dict__.setdefault("_form_type", {})
            if f and "type" in f.attrs:
                sib[id(self.stack[-1][2])] = f.attrs["type"]
            elif f and id(self.stack[-1][2]) in sib:
                f.attrs["type"] = sib[id(self.stack[-1][2])]
            return [f] if f else []
        if not kind and MATRIX_TEST.search(b.tags or ""):  # `(Illegal) Cracking + Logic vs. … (Major)`: a Matrix action
            kind = "actions"
        if (len(chain), parent) in self.prefixed:
            return []
        if not kind or not name[:1].isupper() and not name[:1].isdigit() or EXAMPLE.search(name) \
                or _kind_of(name, [(k, rx) for k, rx in HEADING_KINDS + RUNIN_KINDS if k == kind]) or name.startswith("(") \
                or name.isupper() and len(name.split()) > 1:  # (a box's title in capitals: `ZAPWARE OVERDRIVE BONUSES`)
            return []
        if kind in FIELDED and not FIELDED[kind] & {k.lower() for k in b.labels}:
            return []  # (a heading under the kind's heading that prints none of its labels: a rule section)
        if kind == "vehicledesign":  # a heading over several (`Heavy Duty/Lightweight`, `Comms (I, II, III)`): each
            return [self._make(kind, n, b, page, chain) for n in split_names(name)]
        return [f for f in [self._make(kind, name, b, page, chain)] if f]

    def _drawbacks(self, b, page, owner):
        """The bold run-ins of a `The Costs` (`Drawbacks`) list under a section its text names (`### The Costs` under
        `# Drakes`: "playing a drake requires …"): each a drawback that section grants, a negative quality at Karma 0
        (the owner's rule for granted qualities), its category `<owner> drawback`. Not a requirement or an existing
        quality it hands out (`Metahuman Quality: … requires the Drake positive quality`, `Unsteady Hands: Drakes gain
        the Unsteady Hands quality`)."""
        # (regroup hands a block's leading labelled lines over as labels: read with its text)
        t = "\n".join([f"**{k}:** {v}" for k, v in b.labels.items() if f"**{k}:**" not in (b.text or "")] + [b.text or ""])
        if not owner or not re.search(rf"\b{re.escape(owner)}s?\b", " ".join(t.split()), re.I):
            return []
        out, lines = [], t.splitlines()
        for i, ln in enumerate(lines):
            m = _RUNIN.match(ln)
            if not m or not m.group("name")[:1].isupper():
                continue
            name = " ".join(m.group("name").split()).strip()
            body = [m.group("rest").strip()]
            for nxt in lines[i + 1:]:
                if _RUNIN.match(nxt) or nxt.startswith(("#", "|")) or not nxt.strip():
                    break
                body.append(nxt.strip())
            para = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(x for x in body if x))  # (`Un- steady`)
            if re.search(r"\bquality\b", name, re.I) or re.search(rf"\bgains?\s+the\s+{re.escape(name)}\s+quality\b", para, re.I):
                continue
            at = max(1, text_page(b, ln.strip()[:40]) - (b.page - page))
            out.append(Found("qualities", name, at, {"kind": "negative", "karma": "0", "granted": "true",
                                                       "category": f"{owner} drawback"}, effects.read(para), para))
        return out

    def _family_quality(self, b, page):
        """A heading right under one naming a family of qualities (`New Technomancer Qualities: Resonant Streams`)
        whose text prices them (`Streams cost 20 Karma`): a positive quality at that price, the family its category."""
        if not self.stack or not b.name[:1].isupper() or EXAMPLE.search(b.name):
            return None
        plv, pname, pb, _, _ = self.stack[-1]
        fam = re.search(r"\bqualities\s*:\s*(.+)$", pname, re.I)
        karma = re.search(r"\bcosts?\s+(\d+)\s+Karma\b", " ".join((pb.text or "").split()), re.I)
        if not fam or not karma or b.level != plv + 1:
            return None
        return Found("qualities", b.name.strip(), page, {"kind": "positive", "karma": karma.group(1),
                                                          "category": fam.group(1).strip()}, [], _body(b), b)

    def _bought_as_quality(self, b, page, chain):
        """A heading under a section whose text says its entries are taken as a quality, at the price its tag prints
        (`Adept Ways` (20 Karma): "… by selecting it as a quality"): an entry is a heading named with the section's own
        noun (`Artisan's Way` under `Adept Ways`), a positive quality at that price."""
        if not self.stack:
            return None
        pb = self.stack[-1][2]
        karma = re.fullmatch(r"\(?(\d+)\s*Karma\)?", (pb.tags or "").strip(), re.I)
        noun = re.search(r"(\w+?)s\b", pb.name)
        if not karma or not noun or not re.search(r"\bas\s+an?\s+(?:positive\s+)?quality\b", " ".join((pb.text or "").split()), re.I):
            return None
        if not re.search(rf"\b{re.escape(noun.group(1))}$", b.name.strip(), re.I):
            return None
        return Found("qualities", b.name.strip(), page, {"kind": "positive", "karma": karma.group(1)}, [], _body(b), b)

    def _granted_ability(self, b, page):
        """A heading under a section whose entries are bought as a quality and whose text says each gives the abilities
        printed under it (`Adept Ways` (20 Karma): "… selecting it as a quality, which gives them the Innate Way,
        Focused Channeling, and Spark of Brilliance abilities", the headings `Innate Talent`, `Focused Channeling`,
        `Spark of Brilliance`): an ability every entry grants, a positive quality at Karma 0, granted, its category
        `<entry> ability` (`Way ability`). Not an entry of the section itself (`Artisan's Way`)."""
        if not self.stack or not b.name[:1].isupper() or EXAMPLE.search(b.name):
            return None
        pb = self.stack[-1][2]
        text = " ".join((pb.text or "").split())
        noun = re.search(r"(\w+?)s\b", pb.name)
        if not re.fullmatch(r"\(?\d+\s*Karma\)?", (pb.tags or "").strip(), re.I) or not noun \
                or not re.search(r"\bas\s+an?\s+(?:positive\s+)?quality\b", text, re.I) \
                or not (m := re.search(r"\bgives?\s+(?:them|you|it)\s+the\s+([^.]+?)\s+abilit(?:y|ies)\b", text, re.I)):
            return None
        if re.search(rf"\b{re.escape(noun.group(1))}$", b.name.strip(), re.I):
            return None  # (an entry of the section: `Artisan's Way`)
        named = {norm(x) for x in re.split(r",\s*(?:and\s+)?|\s+and\s+", m.group(1))}
        if not (norm(b.name) in named or set(norm(b.name).split()) & {w for x in named for w in x.split()}):
            return None  # (a heading the sentence doesn't name)
        return Found("qualities", b.name.strip(), page, {"kind": "positive", "karma": "0", "granted": "true",
                                                         "category": f"{noun.group(1).split()[-1].capitalize()} ability"},
                     effects.read(_body(b)), _body(b), b)

    def _granted_quality(self, b, page):
        """A heading under a `Powers` or `Characteristics` heading whose text names the section over it (`### Powers`
        under `## Returned Soldiers`: the list's text naming the section's noun) is a quality that
        section grants, never bought on its own: Karma 0, granted, its category the section's noun and the list's
        (`Returned Soldier power`). A power is positive; a characteristic, which costs nothing, a drawback (negative:
        the owner's rule). Its effects are its prose's (effects.py)."""
        if len(self.stack) < 2 or not b.name[:1].isupper() or EXAMPLE.search(b.name):
            return None
        _, lname, lb, _, _ = self.stack[-1]
        m = GRANTED_LIST.fullmatch(lname.strip())
        owner = _singular(self.stack[-2][1].strip())
        if not m or not owner or not re.search(rf"\b{re.escape(owner)}s?\b", " ".join((lb.text or "").split()), re.I):
            return None
        noun = _singular(m.group(1)).lower()
        cat = f"{owner} {noun}"
        most = re.search(r"\bno\s+more\s+than\s+(\w+)\b", " ".join((lb.text or "").split()), re.I)
        self.granted[noun] = (cat, _count(most.group(1)) if most else None)
        body = _body(b)
        return Found("qualities", b.name.strip(), page, {"kind": "positive" if noun == "power" else "negative",
                                                         "karma": "0", "granted": "true", "category": cat},
                     effects.read(body), body, b)

    def _priced_heading(self, b, page, chain):
        """A heading printing its price in Karma (`Returned Soldier (12 Karma)`) is a positive quality at that price; the
        choices its text offers from the granted lists read before it (`Select two powers … and one characteristic …`)
        are its <choice>s (kind quality, the list's category, count; max: the most the list allows)."""
        m = re.fullmatch(r"(.+?)\s*\((\d+)\s*Karma\)", b.name.strip(), re.I)
        if not m or not m.group(1)[:1].isupper():
            return None
        body = _body(b)
        kids = []
        for n, noun in CHOOSE.findall(" ".join(body.split())):
            cat, most = self.granted.get(_singular(noun).lower(), (None, None))
            if cat and _count(n):
                kids.append(("choice", {"kind": "quality", "category": cat, "count": str(_count(n)),
                                        **({"max": str(most)} if most else {})}, None))
        return Found("qualities", m.group(1).strip(), page, {"kind": "positive", "karma": m.group(2)},
                     kids + effects.read(body), body, b)

    def _make(self, kind, name, b, page, chain):
        attrs, text = {}, b.text or ""
        if kind == "actions":
            # the row a table pairs with the heading prints the name plain: its heading's (I)/(A) is in the aliases
            full = next((a for a in getattr(b, "aliases", ()) if norm(a).startswith(norm(name))), name)
            name, attrs = _action_attrs(full, chain, b.tags, text)
        if kind == "adeptpowers":  # `Cost: 0.25 PP per level`: its Power Points, a level each
            cost = next((v for k, v in b.labels.items() if k.lower() == "cost"), "")
            if m := re.match(r"\s*([\d.]+)\s*(?:PP|power\s+points?)\b(\s*per\s+level)?", cost, re.I):
                attrs = {"cost": m.group(1), "perLevel": "true" if m.group(2) else None}
            elif split := effects.split_cost(cost):
                attrs = {**split, "perLevel": "true" if re.search(r"per\s+level", cost, re.I) else None}
        if kind == "qualities":
            attrs = quality_attrs(name, chain, _body(b))
            if not attrs:
                return None
            name = re.sub(r"\s*\((?:\d+\s*(?:or|to|-|–)\s*\d+)\)\s*$", "", name)
        if kind == "vehicledesign":
            attrs = {"category": chain[-1] if chain else None}
            if m := re.search(r"\((x\s*[\d.]+)\s*BP\)", name, re.I):  # `Scrap Frame (x0.5 BP)`
                name, attrs["bp"] = name[:m.start()].strip(), m.group(1).replace(" ", "")
            if m := re.search(r"\s*\((\d+\s*[–-]\s*\d+)\)\s*$", name):  # `Mil-Spec Frame (1-12)`: its rating range
                name, attrs["rating"] = name[:m.start()], m.group(1).replace(" ", "")
            # its Design Point cost as printed (`Cost: 2 Design Points x Armor Rating`): a cost, not an effect (owner
            # decision 2026-10-10; a vehicle designer reads it later)
            if m := re.search(r"Cost:\**\s*(\+?\s*\d+(?:\.\d+)?)\s*Design Points?((?:\s*(?:x|×|per)\s*[A-Za-z][\w ]*?)?)"
                              r"\s*(?:\.|$|\n|\()", _body(b), re.I):
                attrs["dp"] = (m.group(1).replace(" ", "") + m.group(2).rstrip()).strip()
        if kind == "martialtechniques":  # its closing `Category:` line, inline after its last sentence
            attrs = {"category": flags.technique_category(text)}
        if kind == "metamagics":  # who may take it (`Adept Metamagics`, `(Adepts Only)`); the note leaves the name, so
            # the recipe's own reading of the heading is this one (crb._Catalog.add reads the rest from its text)
            name, attrs = flags.metamagic(name, "", [*chain, b.tags])
        return Found(kind, name, page, {k: v for k, v in attrs.items() if v}, [], _body(b), b)

    def _runins(self, b, page, kind, chain, only=None):
        """The block's bold run-ins as entries of `kind`; only: a pattern the run-in's name must match (and then
        names the kind itself: `2 Edge: X` is an Edge action)."""
        out, seen = [], set()
        # (regroup hands the block's leading labelled lines over as labels, the rest stays in the text)
        lead = []
        for k, v in b.labels.items():  # (until the first the text prints itself: read there, after a repeated label)
            if f"**{k}:**" in (b.text or "") and " ".join(v.split()[:3]) in " ".join((b.text or "").split()):
                break
            lead.append(f"**{k}:** {v}")
        t = "\n".join(lead + [b.text or ""])
        t = re.sub(r"\*\*\s*\n\s*\*\*", " ", t)  # a bold name wrapped onto two lines
        lines = t.splitlines()
        intro = "\n".join(lines[:next((i for i, ln in enumerate(lines) if _RUNIN.match(ln)), len(lines))])
        cites = tuple(int(n) for n in re.findall(r"\(\s*p\.\s*(\d+)\s*\)", re.sub(r"\*\*", "", intro)))
        for i, ln in enumerate(lines):
            m = _RUNIN.match(ln)
            if not m:
                continue
            name = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(m.group("name").split()).strip())  # (`Vi- sion`)
            if only is not None and not only.match(name):
                continue
            if (new := re.match(r"(?i)new\s+([\w ]+?)\s*:", name)) and not _kind_of(
                    new.group(1) + "s", [(k, rx) for k, rx in HEADING_KINDS + RUNIN_KINDS if k == kind]):
                continue  # `New Status: Painted` among new actions: another kind of thing
            if FIELD_LABELS.match(name) or FIELD_LABELS.match(name.split(":")[0].strip()) or not (name[:1].isupper() or name[:1].isdigit() or name[:1] in "+[" or re.match(r"[a-z][A-Z]", name)) \
                    or len(name) > 70 or norm(name) in seen:
                continue
            seen.add(norm(name))
            pre = next((pm for k, rx in PREFIX if k == kind and (pm := rx.match(name))), None)  # `New Edge Action: X`
            if not pre and _runin_kind(name) == kind:
                continue  # (`Electronic Warfare Programs:` introduces the kind)
            body = [m.group("rest").strip()]
            for nxt in lines[i + 1:]:
                n2 = _RUNIN.match(nxt)
                if n2 and not FIELD_LABELS.match(n2.group("name").strip()) or nxt.startswith(("#", "|")) or not nxt.strip():
                    break  # (its own labelled lines, `• **Cost:** N Karma`, are its paragraph's)
                body.append(nxt.strip())
            para = "\n".join(x for x in body if x)  # (its lines kept: the texts are reflowed later)
            attrs = {}
            if kind == "actions":
                name, attrs = _action_attrs(pre.group(1) if pre else name, chain + ([name] if pre else []), "", para)
                if only is not None:
                    attrs["type"] = "edge"
            if kind == "programs":
                own = re.search(r"(?i)\b(?:this|these|the)\s+(autosoft|e-soft|app)s?\b", para)  # (its own words)
                attrs = {"type": own.group(1).lower() if own else program_type(chain[-1] if chain else "")}
            if kind == "gear":  # a kind of the class its heading names: priced as that class's row
                attrs = {"category": "foci", "_class": class_row(chain[-1] if chain else "")}
            if kind == "qualities":
                attrs = quality_attrs(name, chain, para)
                name = re.sub(r"\s*\((?:\d+\s*(?:or|to|-|–)\s*\d+)\)\s*$", "", name)
                if not attrs:
                    continue
            # (its own page: a run-in printed on a later page than its block's heading)
            at = max(1, text_page(b, ln.strip()[:40]) - (b.page - page))
            out.append(Found(kind, name, at, {k: v for k, v in attrs.items() if v}, [], para, cites=cites))
        return out


def reprint(f, entries):
    """True when run-in f repeats an entry its list's intro points to (the rigging chapter's `Rigger Programs`, `See
    the Programs section … (p. 184)`, lists the matrix chapter's programs again): an entry of its kind and name on a
    cited page (or the next: an entry runs over a page). The list references it; no second entry is made."""
    return bool(f.cites) and any(norm(e["name"]) == norm(f.name) and str(e["page"]).isdigit()
                                 and any(0 <= int(e["page"]) - c <= 1 for c in f.cites) for e in entries)


# --- vehicle design (Double Clutch's design rules) ---------------------------------------------------------------

_SEP = re.compile(r"\|(?:\s*:?-+:?\s*\|)+\s*$")


def _md_tables(text):
    """The markdown tables of a text: [(header, rows)]."""
    lines, out, i = (text or "").splitlines(), [], 0
    while i < len(lines):
        if lines[i].startswith("|") and i + 1 < len(lines) and _SEP.match(lines[i + 1]):
            header, rows, i = [c.strip() for c in lines[i].strip().strip("|").split("|")], [], i + 2
            while i < len(lines) and lines[i].startswith("|") and not (i + 1 < len(lines) and _SEP.match(lines[i + 1])):
                rows.append([c.strip() for c in lines[i].strip().strip("|").split("|")])
                i += 1
            out.append((header, rows))
        else:
            i += 1
    return out


def design_tables(b, page):
    """Each row of a table with a BUILD POINTS column (the chassis, powertrain and console type tables): a vehicle
    design part, its category the table's first header (`chassis type`), its build points as printed."""
    tables = ([(b.header, [[b.row.get(h, "") for h in b.header]])] if b.row is not None and b.header else []) \
        + [(list(x), [list(x.values())]) for x in b.stats] + _md_tables(b.text)
    out = []
    for header, rows in tables:
        hu = [h.upper() for h in header]
        if "BUILD POINTS" not in hu or len(header) < 2:
            continue
        bp = hu.index("BUILD POINTS")
        for r in rows:
            if r and r[0].strip() and len(r) > bp:
                out.append(Found("vehicledesign", r[0].strip(), page, {"category": header[0].lower(),
                                                                         "bp": r[bp].strip() or None}, [], ""))
    for f in out:
        f.attrs = {k: v for k, v in f.attrs.items() if v}
    return out


KEYWORDS = re.compile(r"\b(?:rituals?|spells?)\b", re.I)


def quality_sets(b, page):
    """Each row of a table listing qualities with a Karma price (`TYPE | KARMA | METATYPE | POSITIVE METAGENIC
    QUALITIES | …`: the Companion's metagenic collectives): a set of qualities bought together."""
    out = []
    for header, rows in _md_tables(b.text) + ([(b.header, [[b.row.get(h, "") for h in b.header]])]
                                               if b.row is not None and b.header else []):
        hu = [h.upper() for h in header]
        qs = [i for i, h in enumerate(hu) if "QUALITIES" in h]
        karma = next((i for i, h in enumerate(hu) if "KARMA" in h), None)
        if not qs or karma is None or not header:
            continue
        meta = next((i for i, h in enumerate(hu) if "METATYPE" in h), None)
        for r in rows:
            if not r or not r[0].strip() or len(r) < len(header):
                continue
            items = [x for i in qs for x in _items(r[i]) if x and x != "—"]
            out.append(Found("qualitysets", r[0].strip(), page, {k: v for k, v in (
                ("karma", r[karma].strip()), ("metatypes", r[meta].strip() if meta is not None else "")) if v},
                [("quality", {}, x) for x in items], ""))
    return out


_OR = r"(?:\s*(?:,\s*(?:or\s+)?|or|to|–|-|/)\s*\d+)*"  # (`4 or 8 Karma`, `3,6, or 9 Karma`: the first the lowest)
_COST = re.compile(rf"\*\*(?:Karma\s+)?Cost:?\*\*:?\s*(\d+){_OR}\s*Karma|\bCost:\s*(\d+){_OR}\s*Karma"
                   r"|\*\*Karma\s+Cost:?\*\*:?\s*(\d+)\b|\*\*Cost:?\*\*:?\s*(\d+)\s*points?\b",
                   re.I)  # (`Karma Cost: 6 points`; `Cost: 5 Points`, Karma points: not `5 Design Points`)
_BONUS = re.compile(rf"\*\*(?:Karma\s+)?Bonus:?\*\*:?\s*(\d+){_OR}\s*Karma|\bBonus:\s*(\d+){_OR}\s*Karma"
                    r"|\*\*Karma\s+Bonus:?\*\*:?\s*(\d+)\b", re.I)
_NONE = re.compile(r"\*\*(?:Karma\s+)?(?:Cost|Bonus):?\*\*:?\s*None\b|\b(?:Cost|Bonus):\s*None\b", re.I)
_ANY_COST = re.compile(r"\*\*(?:Karma\s+)?Cost:?\*\*", re.I)  # a cost in nuyen, or by a rule (`5 x new rating`)
_EFFECT = re.compile(r"\*\*Game\s+Effects?:?\*\*", re.I)


_KARMA_LIST = re.compile(r"(-?\d+)((?:\s*(?:,\s*(?:or\s+)?|to|or|[–/-])\s*\d+)*)\s*karma", re.I)


def karma_list(s):
    """Every Karma price a price line prints, a list of them read as one: `3,6, or 9 Karma` -> [3, 6, 9], `5, 10 Karma`,
    `5/8 Karma`, `4 to 12 Karma`; `Common: 12 Karma; Uncommon: 9 Karma` -> [12, 9]."""
    return [int(n) for m in _KARMA_LIST.finditer(s or "") for n in [m.group(1), *re.findall(r"\d+", m.group(2))]]


def karma_steps(line):
    """The prices a quality's price line lists as its choices (`7 or 12 Karma`, `3,6, or 9 Karma`, `Common: 12 Karma;
    Uncommon: 9 Karma`): `7 12`, the karmaSteps it is bought at (Bilko Contacts, Seattle p. 327); None for one price or a
    range (`2 to 20 Karma`, every value between)."""
    if re.search(r"\d\s*(?:to|[–—-])\s*\d", line or "", re.I):
        return None
    ks = sorted(set(karma_list(line)))
    return " ".join(map(str, ks)) if len(ks) > 1 else None


def quality_attrs(name, chain, text):
    """A quality's kind (positive, negative: its heading's words, else its Cost or Bonus line, else its text naming
    it a positive or negative quality) and Karma; {} when nothing says which."""
    if any(re.search(r"\blifestyle", h, re.I) for h in chain) or re.match(r"^[A-Z]\.\s", name):
        return {}  # (a lifestyle's qualities are bought with the lifestyle; `B. For 3 or 4 …` is an option)
    near = next((h.lower() for h in reversed(chain) if re.search(r"(?:positive|negative)\s+qualit", h, re.I)), "")
    near = "" if "positive" in near and "negative" in near else near  # (`New Positive and Negative Qualities`)
    cost, bonus = _COST.search(text or ""), _BONUS.search(text or "")
    if "negative qualit" in near or not near and bonus and not cost:
        kind = "negative"
    elif "positive qualit" in near or cost:
        kind = "positive"
    elif m := re.search(r"\b(positive|negative)\s+quality\b", text or "", re.I):
        kind = m.group(1).lower()
    else:
        return {}
    k = (bonus if kind == "negative" else cost) or cost or bonus
    karma = next((g for g in k.groups() if g), None) if k else None
    if karma is None and _NONE.search(text or ""):
        karma = "0"  # (`Bonus: None`: In Debt, CRB p. 77, gives no Karma)
    top =max((int(n) for n in re.findall(r"\d+", k.group(0))), default=0) if k else 0
    steps = karma_steps(k.group(0)) if k and karma and top > int(karma) else None
    return {"kind": kind, "karma": karma, **({"karmaMax": str(top)} if karma and top > int(karma) else {}), **({"karmaSteps": steps} if steps else {})}


def template_headings(bs, chapters=3):
    """The headings a book repeats in `chapters` chapters or more (Shadow Cast's `Roleplaying`, `Strategies`, `Combat`
    in every archetype's chapter): its own page template, never an entry's name."""
    seen = {}
    for b in bs:
        if b.level and b.level > 1:
            seen.setdefault(norm(b.name), set()).add(b.chapter)
    return {n for n, cs in seen.items() if len(cs) >= chapters}


def is_path(f, template=frozenset()):
    """A quality path has a path's structure: steps under it (one priced in Karma is enough by itself), and a name of
    its own, not one of the book's template headings. A heading under a `Quality Paths` section without (a chapter's
    `Roleplaying`, `Strategies`, `Combat` advice) is no path. An unpriced step's quality is written when its path is
    one."""
    if f.kind != "qualitypaths":
        return f.path is None or is_path(f.path, template)
    return f.priced_steps > 0 or any(t == "step" for t, _, _ in f.children) and norm(f.name) not in template


def _granted(name, body):
    """The step grants a quality printed elsewhere: `gain the Home Ground quality`, `the Home Ground quality (p. 72)`."""
    one = " ".join((body or "").split())
    n = re.escape(name)
    return bool(re.search(rf"(?i)\b(?:gains?|purchases?|buys?|takes?|receives?)\s+the\s+{n}\s+quality\b|\b{n}\s+quality\s*\(p\.", one))


INTRO_STEP = re.compile(r"(?i)start(?:ing)?\s+point|how\s+to\s+move\s+on")  # a path's intro, no step
_BARE_STEP = re.compile(r"(?i)step\s+(\d+|one|two|three|four|five)")
# a step's price in its prose: `spend 10 Karma`, `By investing 10 Karma`, `an expenditure of 15 Karma`
_STEP_PRICE = re.compile(r"(?i)\b(?:(?:spend(?:ing|s)?|invest(?:ing|s)?|expenditure\s+of|pay(?:ing|s)?|costs?)\s+(\d+)\s+Karma\b"
                         r"|(\d+)\s+Karma\s+(?:expenditure|investment)\b)")  # (`with a 15 Karma expenditure`)
# a price the path's prose gives a later step: `They must spend 10 Karma, and they move to step 1`
_MOVE_PRICE = re.compile(r"(?i)\b(\d+)\s+Karma\b[^.]{0,40}?\bmove\s+(?:on\s+)?to\s+step\s+(\d+|one|two|three|four|five)\b")
_STEP_WORDS = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5"}


def step_prices(text):
    """{step number: Karma} the prose gives the steps after it (`spend 10 Karma, and they move to step 1`)."""
    return {_STEP_WORDS.get(m.group(2).lower(), m.group(2)): m.group(1) for m in _MOVE_PRICE.finditer(" ".join((text or "").split()))}


def step_qualities(b, page, path, owner="", prices=None, granted=None):
    """A quality path's step is a quality (or several: `Step 2: No Code or Penitent or Re-Bound`), its name without the
    path's and the step's number: `Critter Bond: Lost` -> `Lost`, `Step 1: Broken Code` -> `Broken Code`. Its kind
    and Karma are its Cost or Bonus line's (quality_attrs). A step printing neither is still the path's quality when
    it is named as a step (`Step 1: X`, `Path: X`) or prints a Game Effect (a bare heading may name a quality the step
    grants, printed elsewhere: `Mentor Spirit`): a Cost line in nuyen or by a rule makes it positive, else it is one
    the path imposes, negative, with an issue saying the book doesn't state it (its Karma gets the usual missing
    issue). Those are marked with their path (`path`). A bare step heading (`Step 2`, owner decision 2026-10-07) is
    the path's quality named as printed, its path (`owner`) its category and group (shown `Gestalt: Step 2`), positive,
    its Karma the price its prose states (`By investing 10 Karma`) or the path's prose gives it (`prices`). A step
    naming several that says it grants one (`receive the No Code quality`) adds that one's name to `granted`: a heading
    of that name right under the step describes it (Reader.feed)."""
    name = re.sub(r"^\s*step\s+(?:\d+|one|two|three|four|five)\s*:\s*", "", b.name, flags=re.I)
    if path:
        name = re.sub(rf"^\s*{re.escape(path)}\s*:\s*", "", name, flags=re.I)
    if INTRO_STEP.fullmatch(name.strip()):
        return []
    body = _body(b)
    out = []
    if (m := _BARE_STEP.fullmatch(name.strip())) and owner:
        attrs = quality_attrs(name, [], body) or {"kind": "positive"}
        if not attrs.get("karma"):
            k = _STEP_PRICE.search(" ".join(body.split()))
            attrs["karma"] = (k.group(1) or k.group(2)) if k else (prices or {}).get(_STEP_WORDS.get(m.group(1).lower(), m.group(1)))
        attrs.update({"category": owner, "group": owner, "_id": f"{owner} {name.strip()}"})
        return [Found("qualities", name.strip(), page, {k: v for k, v in attrs.items() if v}, [], body, b, path=True)]
    for n in re.split(r"\s+or\s+", name):
        attrs = quality_attrs(n, [], body)
        if attrs:
            out.append(Found("qualities", n.strip(), page, {k: v for k, v in attrs.items() if v}, [], body))
        elif n.strip()[:1].isupper() and (name != b.name or _EFFECT.search(body)) and not _BARE_STEP.fullmatch(n.strip()):
            if not _granted(n.strip(), body):
                out.append(imposed(n.strip(), page, body))
            elif granted is not None and name != b.name:
                granted.add(norm(n))  # (one of several the step names: described under a heading of its own, maybe)
    for f in out:  # (the printed heading, `Obsession: Consumed`: Catalog.section names a step by it when it must)
        if norm(f.name) != norm(b.name):
            f.attrs["_heading"] = b.name.strip()
    return out


# (owner, 2026-10-08) an optional rule that prices itself in Karma is a quality too
OPTIONAL = re.compile(r"\b(?:use this rule|optional rule)\b", re.I)
_GRADE_KARMA = re.compile(r"\bkarma cost to become or advance an? [\w-]+ grade is (\d+)\s*\+\s*(?:the\s+)?next\s+grade", re.I)
_COST_TO = re.compile(r"\bcost to (?:become|be|gain)\b[^.]*?\bis (\d+) Karma\b", re.I)


def optional_rule_quality(b, page):
    """An optional rule (`Use this rule …`, `Under this optional rule …`) whose text prices taking it in Karma is also
    a buyable quality (owner, 2026-10-08; the rule stays in the Rules pages): positive, category `Optional rule`, its
    text the rule's. `The cost to become an aspected magician … is 15 Karma. The cost to become any other kind … is 25
    Karma`: karma 15, karmaMax 25; `The karma cost to become or advance a transhumanist grade is 10 + next grade`:
    karma 11 (the first grade), a karma formula `10 + R` (R the grade)."""
    text = re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(_body(b).replace("**", "").split()))
    if not OPTIONAL.search(text) or not b.name[:1].isupper() or EXAMPLE.search(b.name):
        return None
    if g := _GRADE_KARMA.search(text):
        return Found("qualities", b.name.strip(), page, {"kind": "positive", "karma": str(int(g.group(1)) + 1),
                                                         "category": "Optional rule"},
                     [("formula", {"field": "karma"}, f"{g.group(1)} + R")], _body(b), b)
    ks = [int(x) for x in _COST_TO.findall(text)]
    if not ks:
        return None
    attrs = {"kind": "positive", "karma": str(min(ks)), "category": "Optional rule"}
    if len(set(ks)) > 1:
        attrs["karmaMax"] = str(max(ks))
        attrs["karmaSteps"] = " ".join(map(str, sorted(set(ks))))  # (one price or the other: a choice, never between)
    return Found("qualities", b.name.strip(), page, attrs, [], _body(b), b)


def imposed(name, page, body):
    """A quality a path's step imposes: positive when it prints a cost in nuyen or by a rule, else negative with an
    issue (the book doesn't say)."""
    kids = [] if _ANY_COST.search(body) else [
        ("issue", {"field": "kind", "code": "missing", "page": page},
         "no Karma cost or bonus printed: a step the quality path imposes, positive or negative not stated")]
    return Found("qualities", name, page, {"kind": "negative" if kids else "positive"}, kids, body, path=True)


def class_row(heading):
    """The row a heading over kinds of one class names (`Enchanting Foci` -> `Enchanting focus`)."""
    words = heading.split()
    if not words:
        return ""
    last = words[-1]
    one = "focus" if last.lower() == "foci" else last[:-3] + "y" if last.lower().endswith("ies") else \
        last[:-1] if last.lower().endswith("s") else last
    return " ".join(words[:-1] + [one.lower()])


def program_type(heading):
    """A program's type, from the heading listing it: `Basic Cyberprograms` -> basic, `Autosofts` -> autosoft,
    `Commlink Apps` -> app (the game's own words)."""
    h = heading.lower()
    for w, t in (("autosoft", "autosoft"), ("e-soft", "e-soft"), ("app", "app"), ("hacking", "hacking"), ("basic", "basic")):
        if re.search(rf"\b{w}", h):
            return t
    return h.strip() or "program"


def split_names(name):
    """A heading naming several parts: `Heavy Duty/Lightweight`, `High Performance/Racing/ Economy Engines`, `Twin
    Linked and Quad Linked`, `Mil-spec Comms (I, II, III)` (each numeral one part); else [name]."""
    m = re.match(r"^(.*?)\s*\(((?:[IVX]+|\d+)(?:\s*,\s*(?:[IVX]+|\d+))+)\)\s*$", name)
    if m:
        return [f"{m.group(1)} {x.strip()}" for x in m.group(2).split(",")]
    parts = [p.strip() for p in re.split(r"\s*/\s*|\s+and\s+", name) if p.strip()]
    return parts if len(parts) > 1 else [name]


# --- items a section derives from others by a rule (Body Shop's transgenic infusions) -------------------------------

_NUMBER_WORDS = {"ten": 10, "twenty": 20, "twenty-five": 25, "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60,
                 "seventy": 70, "seventy-five": 75, "eighty": 80, "ninety": 90, "hundred": 100, "one hundred": 100}
_PCT = r"(\d+|[a-z]+(?:-[a-z]+)?)\s*(?:%|percent)\s+(more|less)\s+(essence|nuyen)"
_RULE = re.compile(rf"\bcosts?\s+{_PCT}\s+than\s+their\s+([\w-]+)\s+equivalents?(?:,?\s*(?:but|and)\s+costs?\s+{_PCT})?",
                   re.I)
_FOLLOWING = re.compile(r"\bthe\s+following\s+([\w-]+)\s+can\s+be\s+(?:imitated|reproduced|replicated)\s+"
                        r"(?:through|by|as|with)\s+([\w-]+)\s+[\w-]+s?\b", re.I)
_LIST_LINE = re.compile(r"^(?:[A-Z][^:]{0,60}):\s*(.+)$")
DERIVED_FIELDS = {"essence": "essence", "nuyen": "cost"}


def _pct(word):
    w = word.lower()
    return int(w) if w.isdigit() else _NUMBER_WORDS.get(w)


def _listed(text):
    """The items of a derived list line, as printed: split at its commas; `A and B` when both halves are two words or
    more (`chemical glands and exhalation spray`, not `webbed hands and feet`); a parenthetical listing several
    (`(corrosive spit and fangs)`) adds them, one saying `no …` or naming one other thing doesn't. A comma set inside
    the closing parenthesis (`(… fangs,)`) is the list's."""
    text = re.sub(r",\s*\)", "),", text).rstrip(".")
    out = []
    for item in _items(re.sub(r"\([^()]*\)", "", text)):
        halves = re.split(r"\s+and\s+", item.strip(" .;"))
        out += halves if len(halves) == 2 and all(len(h.split()) >= 2 for h in halves) else [item]
    for paren in re.findall(r"\(([^()]*)\)", text):
        if not re.match(r"(?i)\s*no\b", paren) and re.search(r",|\band\b", paren):
            out += [p for p in re.split(r"\s*,\s*|\s+and\s+", paren) if p.strip()]
    return out


def derived(b, page):
    """Items a section derives from the book's own by a rule: its text states the rule as percentages against the
    base item (`… cost fifty percent more Essence than their bioware equivalent, but cost thirty percent less nuyen`)
    and lists what it applies to (`The following bioware can be imitated through transgenic infusions` and then
    `Label: a, b, c` lines). Each listed item is an entry `<Adjective> <item>` (`Transgenic gills`) whose fields
    are the base item's times the factors (`_base`, `_factors`, resolved by the recipe against its entries)."""
    text = " ".join(_joined(b.text or ""))
    rule, follow = _RULE.search(text), _FOLLOWING.search(text)
    if not rule or not follow:
        return []
    factors = {}
    for n, d, f in (rule.group(1, 2, 3), rule.group(5, 6, 7)):
        if n and _pct(n) is not None:
            factors[DERIVED_FIELDS[f.lower()]] = round(1 + (_pct(n) if d.lower() == "more" else -_pct(n)) / 100, 4)
    if not factors:
        return []
    adj = follow.group(2)[:1].upper() + follow.group(2)[1:].lower()
    out, seen = [], set()
    for ln in _joined(b.text or ""):
        if ln.startswith(("**", "#", "|", ">")):
            continue
        m = _LIST_LINE.match(ln.strip())
        if not m or m.start(1) > 70 or "," not in m.group(1):
            continue
        for item in _listed(m.group(1)):
            item = re.sub(r"^(?:and|or|most(?:\s+forms\s+of)?)\s+", "", item.strip(" .;"), flags=re.I)
            if not item or len(item.split()) > 5 or norm(item) in seen:
                continue
            seen.add(norm(item))
            rule_text = rule.group(0)
            out.append(Found("augmentations", f"{adj} {item}", page,
                             {"_base": item, "_basekind": follow.group(1), "_factors": factors, "_rule": rule_text}, [],
                             ""))
    return out


# --- gear packs (the Sixth World Companion's PACKs) -----------------------------------------------------------------

PACK_WORD = re.compile(r"\bPACKS?\b")  # the book's own word for them, set in capitals
_PACKS = re.compile(r"\bpacks\b", re.I)
# (`(116,000 nuyen, Vehicle's Body must be at least 10)`: a requirement may follow the price; `139,800 nuyen`: the
# parentheses left out)
_PRICE_LINE = re.compile(r"^(?:\(\s*([\d,]+)\s*nuyen\s*(?:[,;][^()]*)?\)|([\d,]+)\s*nuyen)\s*$", re.I)
_PRICE_START = re.compile(r"^\(\s*[\d,]+\s*nuyen\b", re.I)  # a price line, maybe wrapped over two lines
_NUYEN = re.compile(r"\*\*\s*([\d,]+)\s*(?:\*\*\s*\*\*\s*)?nuyen\s*\*\*\s*$", re.I)
_RATING_PRICE = re.compile(r"^([A-Z][A-Za-z]*(?:\s+[A-Za-z]+)*)\s+Rating\s+(\d+)\s*:\s*([\d,]+)\s*nuyen\s*$")
_ESSENCE = re.compile(r"\*\*\s*Essence(?:\s+Cost)?\s*:\s*\*\*\s*([\d.]+)", re.I)
NOT_CONTENTS = re.compile(r"skill|qualit|attribute|note|essence|priority|recommend|karma", re.I)  # labels not contents
_LIST = re.compile(r"^\*\*([A-Z][^*:]{1,30}):\*\*\s*(.+)$")


def _pack_name(name):
    """`Hacker PACK A` -> `Hacker Pack A`, `Armed Yamaha Growler PACK` -> `Armed Yamaha Growler` (the kind's word)."""
    name = re.sub(r"\s+PACKS?\s*$", "", name.strip())
    return re.sub(r"\bPACK\b", "Pack", name)


def _items(text):
    """A contents list as printed, split at its commas (not those inside parentheses)."""
    out, depth, cur = [], 0, ""
    for ch in " ".join(text.split()):
        depth += ch == "("
        depth -= ch == ")"
        if ch == "," and depth == 0:
            out.append(cur.strip())
            cur = ""
        else:
            cur += ch
    out.append(cur.strip())
    return [x for x in (re.sub(r"\s*(?:-\s+)", "", x) for x in out) if x]


def _joined(text):
    """The text with words split over two lines rejoined and each paragraph (a bold line and its wrapped rest) one
    line."""
    out = []
    for ln in (text or "").splitlines():
        ln = ln.strip()
        # (a wrapped line opening with a parenthesis continues its paragraph, `(rating 3), contacts …`; a price starts
        # its own)
        if out and ln and not ln.startswith(("**", "#", "|", "<!--")) and not _PRICE_START.match(ln) \
                and not _RATING_PRICE.match(ln) \
                and not _PRICE_LINE.match(ln) and not out[-1].endswith((".", "!", "?")) \
                and not _PRICE_LINE.match(out[-1]) and not _RATING_PRICE.match(out[-1]):
            out[-1] = re.sub(r"(\w)-$", r"\1", out[-1]) + ("" if out[-1].endswith("-") else " ") + ln
        elif out and ln.startswith("**") and re.fullmatch(r"\*\*[\d,]*\s*nuyen\*\*|\*\*nuyen\*\*", ln):
            out[-1] += " " + ln
        else:
            out.append(ln)
    return out


def packs(b, page, parent, chapter_has_packs):
    """The packs a block prints: the block itself when its heading names a PACK or sits under a `… PACKs` heading (or in a
    chapter of them) over a `(N nuyen)` line; else each `**Name** (w/ contents): **N nuyen**` paragraph, or
    `Pilot Rating N: N nuyen` line, of a block under a `… PACKs` heading."""
    lines = _joined(b.text)
    first = next((ln for ln in lines if ln), "")
    label_text = "\n".join(f"**{k}:** {v}" for k, v in b.labels.items())
    out = []
    in_packs = _PACKS.search(b.name) or _PACKS.search(parent or "")
    if (m := _PRICE_LINE.match(first)) and (PACK_WORD.search(b.name) or in_packs or chapter_has_packs):
        attrs = {"category": parent or None, "cost": (m.group(1) or m.group(2)).replace(",", "")}
        if e := _ESSENCE.search(label_text + "\n" + (b.text or "")):
            attrs["essence"] = e.group(1)
        items = []
        for ln in lines + [f"**{k}:** {v}" for k, v in b.labels.items()]:
            if (lm := _LIST.match(ln)) and not NOT_CONTENTS.search(lm.group(1)):
                items += _items(lm.group(2))
        return [Found("packs", _pack_name(b.name), page, {k: v for k, v in attrs.items() if v},
                      [("item", {}, x) for x in dict.fromkeys(items)], _body(b))]
    if not in_packs:
        return []
    for ln in lines:
        if (m := re.match(r"^\*\*([^*]+?):?\*\*:?\s*(.*)$", ln)) and (p := _NUYEN.search(ln)):
            name = m.group(1).strip().rstrip(":")
            rest = m.group(2)[:_NUYEN.search(m.group(2)).start()] if _NUYEN.search(m.group(2)) else ""
            rest = rest.strip().rstrip(":").strip()
            contents = re.sub(r"^\(\s*(?:w/\s*)?", "", rest)  # (`(w/ …)`, `(throwback, w/ …)`)
            contents = contents[:-1] if rest.startswith("(") and contents.endswith(")") else contents
            out.append(Found("packs", _pack_name(name), page, {"category": b.name, "cost": p.group(1).replace(",", "")},
                             [("item", {}, x) for x in _items(contents)], ln))
        elif m := _RATING_PRICE.match(ln):
            out.append(Found("packs", f"{_pack_name(b.name)} {m.group(2)}", page,
                             {"category": b.name, "cost": m.group(3).replace(",", "")}, [], ln))
    own = [f for f in out if f.attrs.get("category") == b.name]
    if PACK_WORD.search(b.name) and not _PACKS.search(b.name) and len(own) == 1:  # the PACK heading's own price line
        own[0].name, own[0].attrs["category"], own[0].text = _pack_name(b.name), parent or None, _body(b)
    return _told_apart(out)


def _told_apart(out):
    """Packs printed under one name with other contents (two `Ares Predator VI` PACKs): the first keeps the name, a later
    one is named by its first item the first lacks (`Ares Predator VI (concealable holster)`)."""
    first = {}
    for f in out:
        items = [re.sub(r"^w/\s*", "", x).strip() for _, _, x in f.children]
        if f.name not in first:
            first[f.name] = items
            continue
        other = next((x for x in items if x and x not in first[f.name]), None)
        if other:
            f.name = f"{f.name} ({other})"
    return out


def _body(b):
    labels = [f"**{k}:** {v}" for k, v in b.labels.items() if f"**{k}:**" not in (b.text or "")]
    return "\n".join(labels + ([b.text] if b.text else []))
