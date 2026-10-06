"""The kinds a book prints as sections of its own (gap plan A5/A7, the K1 kinds): every heading or bold run-in under a
section whose heading names the kind. The vocabulary is the game's own section words (`Minor Actions`, `Edge
Actions`, `Mentor Spirits`, `Data Structures`, `Quality Paths`, `Contact Types`, `Paragons`), never an item's name:

- **a heading** whose parent heading (the nearest above it at a shallower level) names a kind is an entry of that
  kind: `#### Avoid Incoming (A)` under `### Minor Actions`, `### Backdoor Entry` under `## Matrix Actions`, `#### Bear`
  under `### Mentor Spirit Archetypes`; so is a heading naming its kind before a colon (`Quality Path: Critter Bond`,
  `New Edge Action: Prepare to Board!`, `New Contact Type: Free Spirit`). A lower-case box title, a heading naming the
  kind itself (`Minor Actions` under `Game Timing and Actions`) and an example are not;
- **a bold run-in** (`• **Reroll one die:** …`, `**2 Edge: Black Thumb**`) in a block whose heading, or whose parent's,
  names a run-in kind is an entry: the Edge boosts and Edge actions, the data structures, the contact types.

The entries are written as well as the rule sections (the rules contents keep them). Their attributes are what the
heading and its section print: an action's type (minor, major, edge, boost: the section's words; a Matrix action's
`(Major)` tag), its timing (`(I)` initiative, `(A)` anytime), its Edge cost (`(2 Edge)`, `N-Edge Boosts`, `Cost: N
Edge`), the action it goes with (`Anticipation (Multiple Attacks, Ranged Attack)`); a quality path's steps (the headings
under it)."""
import re
from dataclasses import dataclass, field

from importer.sr6.regroup import norm

# kind -> the words of a parent heading whose child headings are its entries
HEADING_KINDS = [
    ("actions", re.compile(r"\bactions\b|\b(?:edge|major|minor|matrix|free|interrupt|status|response|chase)\s+action\b", re.I)),
    ("mentorspirits", re.compile(r"\bmentor\s+spirits?\b|\bparagons\b", re.I)),
    ("qualitypaths", re.compile(r"\bquality\s+paths?\s*$", re.I)),
]
# kind -> the words of a heading (the block's own or its parent's) whose bold run-ins are its entries
RUNIN_KINDS = [
    ("actions", re.compile(r"\bedge\s+(?:boosts?|actions?)\b|\bspending\s+edge\b", re.I)),
    ("datastructures", re.compile(r"\bdata\s+structures\b", re.I)),
    ("contacttypes", re.compile(r"\bcontact\s+types\b", re.I)),
]
# a heading naming its kind before a colon (`Quality Path: X`, `New Edge Action: X`, `New Contact Type: X`)
PREFIX = [("qualitypaths", re.compile(r"^(?:new\s+)?quality\s+path\s*:\s*(.+)$", re.I)),
          ("actions", re.compile(r"^(?:new\s+)?(?:(?:status|response|chase)\s+)?(?:edge|major|minor)\s+action\s*:\s*(.+)$", re.I)),
          ("contacttypes", re.compile(r"^(?:new\s+)?contact\s+type\s*:\s*(.+)$", re.I))]
# run-in labels that are a field of the block, not an entry of its kind
FIELD_LABELS = re.compile(r"^(?:cost|note|notes|game\s+effects?|game\s+rules?|effects?|advantages?|disadvantages?|"
                          r"requirements?|prerequisites?|example|bonus|duration|test|limit|threshold|range|choose\s+one|"
                          r"resources|contact\s+points|contact\s+types|all|magician|adept|similar\s+archetypes|"
                          r"use\s+an\s+edge\s+action|wireless\s+bonus)$", re.I)
EXAMPLE = re.compile(r"\b(?:example|sample|summary|table|definition)s?\b|\bby\s+cost\b|^\d+\s*-?\s*edge$"
                     r"|\((?:positive|negative)\s+quality\)", re.I)
_TIMING = re.compile(r"\s*\((I|A)\)\s*$")
_EDGE = re.compile(r"\s*\((\d+)\s*Edge\)\s*$", re.I)
_EDGE_FIRST = re.compile(r"^(\d+)\s*Edge\s*:\s*(.+)$", re.I)
_RUNIN = re.compile(r"^\W{0,3}\*\*(?P<name>[^*]+?)(?::\*\*|\*\*\s*:|:?\*\*\s*$)(?P<rest>.*)$")


@dataclass
class Found:
    kind: str
    name: str
    page: int
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)  # (tag, attrs, text)
    text: str = ""


def _kind_of(name, rules):
    return next((k for k, rx in rules if rx.search(name or "")), None)


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

    def __init__(self):
        self.stack, self.chapter, self.path = [], None, None  # path: [level, Found, its steps' level]
        self.prefixed = set()  # the parent headings a `Kind: Name` child names its kind under (the others aren't)

    def feed(self, b, page):
        if b.chapter != self.chapter:
            self.chapter, self.stack, self.path, self.prefixed = b.chapter, [], None, set()
        out, lv = [], b.level or 0
        heading = lv > 0
        while heading and self.stack and self.stack[-1][0] >= lv:
            self.stack.pop()
        chain = [n for _, n in self.stack]
        parent = chain[-1] if chain else ""
        if heading and self.path:
            if lv <= self.path[0]:
                self.path = None
            else:  # a quality path's steps: the headings right under it
                self.path[2] = self.path[2] or lv
                if lv == self.path[2] and b.name[:1].isupper() and not EXAMPLE.search(b.name):
                    self.path[1].children.append(("step", {}, b.name))
        if heading:
            out += self._heading(b, page, chain, parent)
        rk = _kind_of(b.name, RUNIN_KINDS) or _kind_of(parent, RUNIN_KINDS)
        if rk and not out:  # (a heading that is an entry itself: its bold lines are its own)
            out += self._runins(b, page, rk, chain + [b.name])
        if heading:
            self.stack.append((lv, b.name))
            qp = next((f for f in out if f.kind == "qualitypaths"), None)
            if qp:
                self.path = [lv, qp, None]
        return out

    def _heading(self, b, page, chain, parent):
        name = b.name.strip()
        for kind, rx in PREFIX:
            if m := rx.match(name):
                self.prefixed.add((len(chain), parent))
                return [self._make(kind, m.group(1).strip(), b, page, chain)]
        kind = _kind_of(parent, HEADING_KINDS)
        if (len(chain), parent) in self.prefixed:
            return []
        if not kind or not name[:1].isupper() and not name[:1].isdigit() or EXAMPLE.search(name) \
                or _kind_of(name, HEADING_KINDS + RUNIN_KINDS) or name.startswith("("):
            return []
        return [self._make(kind, name, b, page, chain)]

    def _make(self, kind, name, b, page, chain):
        attrs, text = {}, b.text or ""
        if kind == "actions":
            # the row a table pairs with the heading prints the name plain: its heading's (I)/(A) is in the aliases
            full = next((a for a in getattr(b, "aliases", ()) if norm(a).startswith(norm(name))), name)
            name, attrs = _action_attrs(full, chain, b.tags, text)
        return Found(kind, name, page, {k: v for k, v in attrs.items() if v}, [], _body(b))

    def _runins(self, b, page, kind, chain):
        out, seen = [], set()
        # (regroup hands the block's leading labelled lines over as labels, the rest stays in the text)
        t = "\n".join([f"**{k}:** {v}" for k, v in b.labels.items() if f"**{k}:**" not in (b.text or "")] + [b.text or ""])
        t = re.sub(r"\*\*\s*\n\s*\*\*", " ", t)  # a bold name wrapped onto two lines
        lines = t.splitlines()
        for i, ln in enumerate(lines):
            m = _RUNIN.match(ln)
            if not m:
                continue
            name = " ".join(m.group("name").split()).strip()
            if FIELD_LABELS.match(name) or FIELD_LABELS.match(name.split(":")[0].strip()) or not (name[:1].isupper() or name[:1].isdigit() or name[:1] in "+") \
                    or len(name) > 70 or norm(name) in seen:
                continue
            seen.add(norm(name))
            body = [m.group("rest").strip()]
            for nxt in lines[i + 1:]:
                if _RUNIN.match(nxt) or nxt.startswith(("#", "|")) or not nxt.strip():
                    break
                body.append(nxt.strip())
            para = " ".join(x for x in body if x)
            attrs = {}
            if kind == "actions":
                name, attrs = _action_attrs(name, chain, "", para)
            out.append(Found(kind, name, page, {k: v for k, v in attrs.items() if v}, [], para))
        return out


def _body(b):
    labels = [f"**{k}:** {v}" for k, v in b.labels.items() if f"**{k}:**" not in (b.text or "")]
    return "\n".join(labels + ([b.text] if b.text else []))
