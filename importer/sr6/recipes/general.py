"""The SR6 books no recipe of their own reads (adventures, campaigns, plot sourcebooks, runner resource and setting
books) -> the SR6 catalog, one general reading for all: the NPC, grunt and contact stat blocks (npcs, with their
Professional Rating where printed; a contact's also as a contacts entry), critters, the gear, weapon, armor,
augmentation and vehicle tables, spells, qualities, life modules and the rule sections, ids unscoped (run scopes them
as <id>.<slug>), descriptions in the private texts. Each known book is a recipe of its own in RECIPES (its source id,
name, and how its title or first page names it); they share the core rulebook's reading (crb.extract). Reads only
regrouped.md (importer/sr6/regroup.py), after prepare_md() titles the stat blocks set in body type; layout notes in
general.md. A line or value that doesn't read is reported, never guessed."""
import difflib
import re
from collections import Counter
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.recipes import crb, swc
from importer.sr6.recipes.fs import _md_table
from importer.sr6.regroup import blocks, keys, norm

# (source id, name, CAT number or "", the PDF title's pattern, phrases the first page holds when the title is missing)
# The id: a short form of the book's title (a letter first: THN for 30 Nights), as the core rulebook's CRB.
BOOKS = [
    ("THN", "Shadowrun: 30 Nights", "CAT28400", r"\b30\s+nights\b", ()),
    ("AOR", "Shadowrun: Tales from the UCAS: Age of Rust", "", r"\bage\s+of\s+rust\b", ("TALES FROM THE UCAS", "age of rust")),
    ("ASN", "Shadowrun: Assassin's Night", "CAT28402", r"\bassassin.?s\s+night\b", ()),
    ("BBR", "Shadowrun: Beginner Box: Battle Royale", "CAT28010", r"\bbattle\s+royale\b", ("BATTLE ROYALE ADVENTURE",)),
    ("CCG", "Shadowrun, Sixth World: Character Conversion Guide", "", r"character\s+conversion\s+guide",
     ("CHARACTER CONVERSION GUIDE", "SIXTH WORLD", "Using this Guide")),
    ("CLN", "Shadowrun: Collapsing Now", "CAT28450", r"\bcollapsing\s+now\b", ("Undersea Heist", "Freedom Network")),
    ("CBK", "Shadowrun: Cutting Black", "CAT28300", r"\bcutting\s+black\b", ("SNAFU", "Detroit rupture")),
    ("DOD", "Shadowrun: Dealers of Death", "", r"\bdealers\s+of\s+death\b", ("dealers of death", "DOWN THE BARREL")),
    ("EOLSQ", "Shadowrun: Echoes of a Lost Signal (QSR Edition)", "", r"echoes\s+of\s+a\s+lost\s+signal.*\bqsr\b",
     ("Quick-Start Rules", "Help her", "Andrew")),
    ("EOLS", "Shadowrun: Echoes of a Lost Signal", "", r"echoes\s+of\s+a\s+lost\s+signal", ("Help her", "Andrew")),
    ("EMC", "Shadowrun: Emerald City", "CAT28100", r"\bemerald\s+city\b", ("Butterfly in Oz", "of freedom")),
    ("FPT", "Shadowrun: Falling Point", "CAT28453", r"\bfalling\s+point\b", ("Chaos Tacos", "state of the world")),
    ("FBT", "Shadowrun: Final Bets", "CAT28405", r"\bfinal\s+bets\b", ("Social Rituals", "SHADOWS OF PARIS")),
    ("FRS", "Shadowrun: Free Seattle", "CAT28401", r"\bfree\s+seattle\b", ("The cost of Doing", "seattle in the")),
    ("LHV", "Shadowrun: Lethal Harvest", "CAT28305", r"\blethal\s+harvest\b", ("All or Nothing", "Disian Shadow War")),
    ("LASC", "Shadowrun: Los Alamos: The Secret City", "", r"\blos\s+alamos\b", ("LOS ALAMOS", "THE SECRET CITY")),
    ("MGC", "Shadowrun: Margin Calls", "CAT28306", r"\bmargin\s+calls\b", ("Wind and Fire", "winners & losers")),
    ("ML2083-03", "Shadowrun Missions Legends 2083-03: Nile Gambit: City Under the Sand", "",
     r"city\s+under\s+the\s+sand", ("LEGENDS 2083-03", "Nile gambit")),
    ("ML2083-04", "Shadowrun Missions Legends 2083-04: Nile Gambit: Cave of Shadows", "",
     r"cave\s+of\s+shadows", ("LEGENDS 2083-04", "Nile gambit")),
    ("NAS", "Shadowrun: Neo-Anarchist's Streetpedia", "CAT27454", r"streetpedia", ("Just a Punk", "From Ashes, Neo-Anarchism")),
    ("NUV", "Shadowrun: Null Value", "CAT28452", r"\bnull\s+value\b", ("Relationship Talk", "EX MACHINA")),
    ("PWP", "Shadowrun: Power Plays", "CAT28451", r"\bpower\s+plays\b", ("IN THE FLOW", "power networking")),
    ("RAR", "Shadowrun: Risks & Rewards", "CAT28454", r"\brisks\s+(?:&|and)\s+rewards\b", ("an eye for trouble", "shadows of cairo")),
    ("SCO", "Shadowrun: Scotophobia", "CAT28303", r"\bscotophobia\b", ("One Last Job", "Just how fragged up things are")),
    ("SHC", "Shadowrun: Shadow Cast", "CAT28510", r"\bshadow\s+cast\b", ("RUNTHROUGH", "ACADEMIC MAGE")),
    ("SIF-NO", "Shadowrun: Shadows in Focus: New Orleans: Easy Come, Easy Go", "", r"easy\s+come,?\s+easy\s+go",
     ("shadows in focus", "easy come, easy go")),
    ("SHS", "Shadowrun: Shoot Straight", "CAT28513", r"\bshoot\s+straight\b", ("Branching Out", "Running the Shadows")),
    ("SLS", "Shadowrun: Slip Streams", "CAT28301", r"\bslip\s+streams\b", ("What’s Up with the Metaplanes", "FRAYED FABRIC")),
    ("SOTA2084", "Shadowrun: State of the Art 2084", "", r"state\s+of\s+the\s+art\s+2084", ("A View to a Thrill", "Growing Shadows")),
    ("TKC", "Shadowrun: The Kechibi Code", "CAT28302", r"^(?:shadowrun:\s*)?the\s+kechibi\s+code\b",
     ("Requiem and Rebirth", "alpha and omega")),
    ("TNE", "Shadowrun: The Needle's Eye", "CAT28304", r"needle.?s\s+eye", ("The Hammer Price", "TOUR DE FORCE")),
    ("TTP", "Shadowrun: The Third Parallel", "CAT28403", r"\bthird\s+parallel\b", ("A Bad Omen", "SHADOWS OF DENVER")),
    ("WHN", "Shadowrun: Whisper Nets", "CAT28404", r"\bwhisper\s+nets\b", ("On Track", "A New York State of Mind")),
]

FAN = {"EOLS": "Holostreets", "EOLSQ": "Holostreets"}  # source id -> publisher: fan scenarios (canon="false")

_BAND = {"B", "BOD"}
_RATING = re.compile(r"\(?\s*professional\s+rating\s*:?\s*(\d+)\s*\)?", re.I)
_PRICE = {"AVAIL", "AVAILABILITY", "COST"}
_NAME_COLUMNS = {"ITEM", "WEAPON", "NAME", "GEAR", "DEVICE", "VEHICLE", "AUGMENTATION", "ARMOR"}
_SHORT = {"ACC": "ACCEL", "PIL": "PILOT", "HAN": "HAND", "SEN": "SENSOR"}  # vehicle headers set shorter than the core's
_CRITTER_ONLY = {"gear", "augmentations", "adept powers", "complex forms", "spells", "cyberware", "bioware", "living persona"}


def _being(b):
    head = {h.upper() for h in b.stats[0]} if b.stats else set()
    return bool(head & _BAND) and bool(head & {"A", "AGI"})


def _band_head(h):
    hu = {x.upper() for x in h}
    return "B" if hu & _BAND and hu & {"A", "AGI"} else "D" if {"DR", "I/ID"} <= hu or {"DR", "AC", "CM"} <= hu else ""


def _text_bands(b):
    """A block with no stat box whose text holds one (a description printed above its band: the core rulebook's
    and the cast chapters' form) -> its first being's bands as its stats (the attribute band and the defense bands
    after it; a cell under a repeated header keeps the first: two beings printed in one band), out of its text."""
    if b.stats or "| B |" not in b.text and "| BOD |" not in b.text:
        return b
    stats, text = [], b.text
    for h, rows in crb._tables(b.text):
        k = _band_head(h)
        if not k or k == "B" and stats or k == "D" and not stats or not rows:
            if stats:
                break
            continue
        for r in rows:
            cells = {}
            for n, (x, v) in enumerate(zip(h, r)):
                cells.setdefault("RES" if x == "R" and "R" in h[:n] else x, v)  # (a second R: Resonance)
            stats.append(cells)
        text = text.replace(_md_table(h, rows), "", 1)
    return replace(b, stats=stats, text=text.strip()) if stats else b


_BAND_LINE = re.compile(r"\| (?:B|BOD) \| (?:A|AGI) \|")
_TAG_LINE = re.compile(r"\((?:professional rating|force|rating|male|female)\b[^()]*\)|professional rating\s*\d+", re.I)
_SEX = re.compile(r"\s*\((?:[^()]*,\s*)?(?:male|female)\b[^()]*\)$", re.I)
_PROSE_END = re.compile(r"[.,;:!?…”\"’-]$")


def _prev(lines, i):
    """The nearest non-empty line above line i, page markers skipped."""
    j = i - 1
    while j >= 0 and (not lines[j].strip() or lines[j].startswith("<!-- page")):
        j -= 1
    return j if j >= 0 else None


def _name_line(lines, k, loose=False):
    """A stat block's title set in body type: a short line, not a heading, table, label, quote or sentence end, its
    long words capitalized (`Saeder-Krupp Guard`); one in lower case only right after a sentence's end (a box
    title: `micro bull shark`), or (loose: right over its band) after a labelled line or a weapon's bracketed stats:
    the next being of a box printing several (`gorilla chimera` after `**Weapons:** …`)."""
    s = lines[k].strip()
    if not s or s[0] in "#|>*<•" or len(s.split()) > 6 or len(s) > 60 or _PROSE_END.search(re.sub(r"\s*\([^()]*\)$", "", s)):
        return False
    words = [w for w in re.findall(r"[^\W\d_][\w’'-]*", re.sub(r"\([^()]*\)", "", s)) if len(w) > 3]
    if words and s[0].isupper() and sum(not w[0].isupper() for w in words) <= (len(words) > 1 and len(s.split()) <= 4):
        return True  # (a word the PDF split, `Neo-PD Interve ntion`, may leave one piece in lower case)
    p = _prev(lines, k)
    after = r"[.!?”]$|^#|^\||^\*\*|\]$" if loose else r"[.!?”]$|^#|^\|"
    return s == s.lower() and len(s.split()) <= 4 and (p is None or bool(re.search(after, lines[p].strip()))) \
        or bool(_SEX.search(s)) and len(s.split()) <= 6


def _box_title(s):
    """A box title in lower case (`saeder-krupp guard`) between a name and its band."""
    s = s.strip()
    return bool(s) and s == s.lower() and s[0] not in "#|>*<•(" and len(s.split()) <= 6 and not _PROSE_END.search(s)


def _name_group(lines, i):
    """The lines (indexes, top first) naming the being whose band is at line i: a heading (`##### Blue (Elf)`) or a
    name in body type (`Saeder-Krupp Guard`), then an optional tag line and box title; None when there is none."""
    j, idx = _prev(lines, i), []
    if j is not None and _box_title(lines[j]):
        idx, j = [j], _prev(lines, j)
    if j is not None and _TAG_LINE.fullmatch(re.sub(r"^#{3,5} ", "", lines[j].strip())):
        idx, j = [j] + idx, _prev(lines, j)
    if j is None:
        return None
    s = lines[j].strip()
    if s.startswith("#") and not re.fullmatch(r"#{3,5} [^(#|*].{0,60}", s) or not s.startswith("#") and not _name_line(lines, j):
        return None
    return [j] + idx


def _split_shared(lines):
    """Two beings printed in one band (`| B … ESS | B … ESS | M |`) under their names stacked right above it, the
    defense band and labels after it printed once: one band each (a column after the last group is that being's),
    the lines after the band (to the next being or heading) shared. A band whose names don't stack over it is left."""
    out, i = [], 0
    while i < len(lines):
        ln = lines[i]
        cells = crb._cells(ln) if _BAND_LINE.match(ln) else []
        starts = [n for n, c in enumerate(cells) if c == cells[0]]
        if len(starts) < 2 or i + 2 >= len(lines) or len(crb._cells(lines[i + 2])) != len(cells):
            out.append(ln)
            i += 1
            continue
        groups, at = [], len(out)
        for _ in starts:  # each being's name group, from the band up, stacked one right over the next
            g = _name_group(out + [ln], at)
            if not g:
                break
            groups.insert(0, g)
            at = g[0]
        if len(groups) < len(starts):
            out.append(ln)
            i += 1
            continue
        vals, end = crb._cells(lines[i + 2]), i + 3
        while end < len(lines) and not lines[end].startswith("#") and not _BAND_LINE.match(lines[end]):
            end += 1
        if end < len(lines) and _BAND_LINE.match(lines[end]) and (g := _name_group(lines, end)):
            end = g[0]
        shared = lines[i + 3:end]
        names = [[out[x] for x in g] for g in groups]
        del out[groups[0][0]:]
        for n, s in enumerate(starts):
            e = starts[n + 1] if n + 1 < len(starts) else len(cells)
            out += names[n] + ["| " + " | ".join(cells[s:e]) + " |", "|" + "---|" * (e - s), "| " + " | ".join(vals[s:e]) + " |"]
            out += shared if n == 0 else [x for x in shared if not x.startswith("<!-- page")]
        i = end
    return out


NEAR_NAME = 0.88  # a box title this close to its heading's name (difflib ratio of their keys) names the same item


def _box_named(b):
    """A stat box under its item's heading, titled a letter or a joining word off it (`ceramic or plasteel knife` under
    `Ceramic/Plasteel Knife`): named by the heading (the printed name), the box title an alias."""
    if b.type != "item" or not b.label or b.name != b.label or b.name != b.name.lower() or not b.section:
        return b
    a, h = keys(b.name)[0], keys(b.section)[0]
    if a == h or difflib.SequenceMatcher(None, a, h).ratio() < NEAR_NAME:
        return b
    return replace(b, name=b.section, aliases=[*b.aliases, b.name])


def _stat_line(b):
    """An item's heading whose text holds its one stat line: a one-row priced table with no name column (`TYPE | MODE |
    DV | … | AVAIL | COST`, the type its first cell): that row is the item's, named by the heading."""
    if b.type != "section" or b.level < 3 or b.stats or b.row is not None:
        return b
    ts = crb._tables(b.text)
    if len(ts) != 1 or len(ts[0][1]) != 1:
        return b
    h, rows = ts[0]
    if not _PRICE & {x.upper() for x in h} or h[0].upper() in _NAME_COLUMNS | {"ITEM", "NAME"} or len(rows[0]) != len(h):
        return b
    row = {"ITEM": b.name, **dict(zip(h, rows[0]))}
    return replace(b, type="item", row=row, header=list(row), text=b.text.replace(_md_table(h, rows), "", 1).strip())


def _spell_box(b):
    """A spell box printing its category under TYPE and its type under DV (`TYPE Illusion | RANGE LOS | DV P | DURATION S
    | DRAIN 4`, Dealers of Death): the core rulebook's form, TYPE the type, DV the drain, the category in the section
    (`Illusion spells`: the catalog's spell category)."""
    s = {h.upper(): (h, v) for h, v in (b.stats[0].items() if b.stats else ())}
    if not {"TYPE", "DV", "DRAIN", "RANGE"} <= s.keys() or s["TYPE"][1].strip().lower() not in crb.SPELL_CATEGORIES \
            or s["DV"][1].strip().upper() not in ("P", "M"):
        return b
    box = {h: v for h, v in b.stats[0].items() if h.upper() not in ("TYPE", "DV", "DRAIN")}
    box = {s["TYPE"][0]: s["DV"][1], **box, s["DV"][0]: s["DRAIN"][1]}
    return replace(b, stats=[box] + b.stats[1:], section=f"{s['TYPE'][1].strip()} spells")


_KICKER = re.compile(r"(#{2,6}) ([^#].*:)$")


def _kickers(lines):
    """A heading ending in a colon right over a bigger one (`##### Part of the Family:` over `### Deserted`): one
    heading, the bigger one's level (`### Part of the Family: Deserted`)."""
    out = []
    for ln in lines:
        m = re.match(r"(#{1,6}) (.+)$", ln)
        k = _KICKER.match(out[-1]) if out else None
        if m and k and len(m.group(1)) < len(k.group(1)):
            out[-1] = f"{m.group(1)} {k.group(2)} {m.group(2)}"
        else:
            out.append(ln)
    return out


def _slash_names(name):
    """The names one stat block printed for several stands for (`Saint Joseph Houngan/Mambo`: Saint Joseph Houngan
    and Saint Joseph Mambo; `Government Agent/Corp Troubleshooter`: both), else [name]."""
    if name.count("/") != 1 or "(" in name:
        return [name]
    left, right = (x.strip() for x in name.split("/"))
    if not left or not re.search(r"[^\W\d_]", right):
        return [name]
    head, tail = left.split(), right.split()
    if len(tail) > 1:  # `UCAS/Sioux Border`: UCAS Border and Sioux Border
        return [left, right] if len(head) > 1 else [" ".join(head + tail[1:]), right]
    k = len(head) - 1
    if not head[k][:1].isupper() and right[:1].isupper():
        while k > 0 and not head[k][:1].isupper():
            k -= 1  # a word the PDF split (`Ho ungan/Mambo`): the alternative replaces all of it
    elif head[k][:1].isupper():
        right = right[:1].upper() + right[1:]
    return [left, " ".join(head[:k] + [right])]


_MODULES = re.compile(r"(?:adult\s+)?life\s+modules?", re.I)
_GRANT = re.compile(r"\*\*(?:choose \w+|contact points|resources):\*\*", re.I)


def _title_line(s):
    return bool(s) and s[0].isupper() and len(s.split()) <= 5 and s[0] not in "•*#|>" and "," not in s \
        and not re.search(r"[.;!?-]$", s)


def _modules(bs):
    """(name, text, PDF page) of each adult life module a book prints in body type under a `Life Modules` heading or
    line (the Sixth World Companion's form): a module's title is a run of short lines (`Event:` `Brush With Death`)
    that prose follows, its grants its labelled lines. The run goes on through the page's running head (a section
    named like the chapter, a page number) and stops at the next heading. A part with no grant is no module (a
    quality printed before them)."""
    lines, page, on = [], 0, False
    for b in bs:
        head = norm(b.name)
        if on and (head in (norm(b.chapter), "") or head.isdigit()):
            lines += b.text.splitlines()
            continue
        on = False
        text = b.text.splitlines()
        at = 0 if _MODULES.fullmatch(b.name.strip()) else next(
            (i + 1 for i, ln in enumerate(text) if _MODULES.fullmatch(ln.strip())), None)
        if at is not None:
            lines, page, on = lines + [""] + text[at:], page or b.page, True
    out, cur, name = [], [], []
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if _title_line(s) and (not "".join(cur).strip() or any(_GRANT.search(c) for c in cur)):
            j = i
            while j < len(lines) and _title_line(lines[j].strip()):
                j += 1
            if j < len(lines) and lines[j].strip() and not lines[j].lstrip().startswith(("•", "**")) and j - i <= 3:
                if cur and any(_GRANT.search(c) for c in cur):
                    out.append((" ".join(name), "\n".join(cur), page))
                name, cur, i = [lines[k].strip() for k in range(i, j)], [], j
                continue
        cur.append(lines[i])
        i += 1
    if cur and name and any(_GRANT.search(c) for c in cur):
        out.append((" ".join(name), "\n".join(cur), page))
    return out


def _contact(b):
    return any(re.match(r"connection(\s+rating)?$", k, re.I) for k in b.labels)


class Book:
    """One known book: the attributes crb.extract reads (a recipe module's), its match() and extract()."""
    __name__ = "importer.sr6.recipes.general"  # run records the recipe as `general`
    PUBLISHER, CANON = "Catalyst Game Labs", True
    PAGE_OFFSET = 1  # printed page = PDF page - 1 (a cover page first)
    SHA256 = ()
    ALIASES = {}
    NAME_HEADERS = frozenset(_NAME_COLUMNS)
    SECTIONS = []  # kind() maps the blocks
    SECTION_KINDS = {"qualities"}
    LABEL_SECTIONS = {}
    RULE_CHAPTERS = ("",)  # every chapter: its sections are the book's rules
    ATTRIBUTE_CHAPTERS = ()
    CATALOG_CHAPTERS = ()
    ARCHETYPES = "\0"  # no sample runners

    def __init__(self, id, name, cat, title, phrases):
        self.ID, self.NAME, self.CAT, self.TITLE, self.PHRASES = id, name, cat, re.compile(title, re.I), phrases
        self.BOOK = self.UNRATED_NPCS = re.sub(r"^Shadowrun(?:, Sixth World)?:\s*", "", name)
        if id in FAN:
            self.PUBLISHER, self.CANON = FAN[id], False

    def __repr__(self):
        return f"<general recipe {self.ID}>"

    def match(self, meta, md_head):
        """0.9 when the PDF's title names the book; else 0.8 plus 0.05 a phrase (up to 0.95) when the first page holds
        all its phrases (its contents or title lines): the book naming more of them wins (the QSR edition), three
        win over a looser recipe's 0.9 (the conversion guide names the core rulebook)."""
        if self.TITLE.search(meta.get("title") or ""):
            return 0.9
        hay = norm(md_head)
        if self.PHRASES and all(norm(p) in hay for p in self.PHRASES):
            return min(0.95, 0.8 + 0.05 * len(self.PHRASES))
        return 0.0

    def prepare_md(self, md):
        """book.md with a stat block's title as a heading where the book sets it in body type: the name line right
        over a being's band (`Red Tide Follower`), or over its tag line (`(Professional Rating 4)`, `(Force 5)`,
        `(Male Human)`, which then reads as the heading's tags), a tag at the name's end too; a heading in lower case
        there gets a capital (a box title over a tag line reads as an art caption); a tag line with more after it
        (`(Professional Rating 4), Human`) as one tag. A kicker set small over a heading (`Part of the Family:` over
        `Deserted`, `Event:` over a life module's title) is one heading with it, at the heading's level."""
        lines = _kickers(_split_shared(md.splitlines()))
        bare = lambda s: re.sub(r"^#{4,5} ", "", s.strip())
        for i, ln in enumerate(lines):
            if not _BAND_LINE.match(ln):
                continue
            j = _prev(lines, i)
            if j is None:
                continue
            t = _prev(lines, j)  # a box title in body type between the tag line and the band (`egyptian army regulars`)
            if t is not None and lines[j].strip() == lines[j].strip().lower() and lines[j][:1] not in "#|>*<" \
                    and _TAG_LINE.fullmatch(bare(lines[t])):
                lines[j], j = "", t
            if m := re.fullmatch(r"(\([^()]+)\),\s*([^()]+)", bare(lines[j])):
                lines[j] = f"{m.group(1)}, {m.group(2)})"
            tag = j if _TAG_LINE.fullmatch(bare(lines[j])) else None
            k = _prev(lines, j) if tag is not None else j
            if k is None:
                continue
            if tag is not None:
                lines[tag] = f"##### {bare(lines[tag])}"
                if m := re.fullmatch(r"(#{4,5} )([a-z])(.*)", lines[k]):
                    lines[k] = m.group(1) + m.group(2).upper() + m.group(3)
            if not _name_line(lines, k, loose=tag is None):
                continue
            name, own = lines[k].strip(), None
            if m := re.fullmatch(r"(.+?)\s*(\([^()]+\))", name):
                name, own = m.group(1), m.group(2)
            lines[k] = f"##### {name}" + (f"\n##### {own}" if own and tag is None else "")
        return "\n".join(lines) + "\n"

    def fix(self, b, parent2):
        """An item's priced stat box as its row, named by its heading; a stat block's `(Professional Rating N)` (a tag
        line, in its name or the text's first line) as the core rulebook's section form; a box title in lower case
        with a capital. A heading whose text holds a being's bands is that being (an item); a block with no chapter
        heading (a book printing none) is in the book's."""
        if not b.chapter:
            b = replace(b, chapter=self.BOOK, name=b.name or self.BOOK)
        b = _spell_box(_stat_line(_box_named(b)))
        if b.type == "item" or b.level >= 2:
            b = _text_bands(b)
            if b.type == "section" and _being(b):
                b = replace(b, type="item")
        if b.type == "item" and b.row is None and b.stats and _PRICE & {h.upper() for h in b.stats[0]} and not _being(b):
            cells = {h: v for i, (h, v) in enumerate(b.stats[0].items()) if i or h.upper() not in _NAME_COLUMNS}
            b = replace(b, row={"ITEM": b.name, **cells}, header=["ITEM", *cells], stats=b.stats[1:], label="")
        if b.row is not None and _SHORT.keys() & set(b.row):
            b = replace(b, row={_SHORT.get(h, h): v for h, v in b.row.items()}, header=[_SHORT.get(h, h) for h in b.header])
        if _being(b):
            first = (b.text.strip().splitlines() or [""])[0]
            m = next((m for s in (b.tags, b.name, first, *b.labels.values()) if (m := _RATING.search(s))), None)
            name = _SEX.sub("", _RATING.sub("", b.name)).strip(" ,") or b.name
            name = " ".join(w[:1].upper() + w[1:] for w in name.split()) if name == name.lower() else name[:1].upper() + name[1:]
            if m:
                text = b.text.replace(first, "", 1).strip() if _RATING.fullmatch(first.strip()) else b.text
                b = replace(b, name=name, text=text, section=f"Professional Rating {m.group(1)}: {b.section or self.BOOK}")
            else:
                b = replace(b, name=name)
        return b

    def kind(self, chapter, b, parent2):
        labels = {k.lower() for k in b.labels}
        if not b.stats and b.row is None and b.level >= 3 and {"cost", "bonus"} & labels and re.search(
                r"karma|^\s*\d+\s*points?\b", " ".join(v for k, v in b.labels.items() if k.lower() in ("cost", "bonus")),
                re.I):  # (Emerald City prices its Local Character qualities `5 Points`: Karma points)
            return "qualities", "negative" if "bonus" in labels else "positive"
        if b.type == "section" and not b.stats:
            return None, None
        if _being(b):
            if _contact(b):
                return "contacts", None
            if not _RATING.search(b.section) and "powers" in labels and not labels & _CRITTER_ONLY:
                return "critters", "critter"
            return "npcs", None
        if b.stats and {"RANGE", "DURATION"} <= {h.upper() for h in b.stats[0]}:
            return "spells", None
        if b.row is None:
            return None, None
        if b.name.startswith(("*", "†")):
            return "skip", None  # a table's footnote printed as a row
        head = {h.upper() for h in b.header}
        if not re.search(r"[^\W\d_]", b.name):
            return None, None  # a row without a name: the section's table
        cat = slug(b.label if b.label and norm(b.label) != norm(b.name) else b.section) or None
        if head & {"HAND", "HANDL", "HANDLING", "HAND (ON/OFF ROAD)", "ACCEL"}:
            return "vehicles", cat
        if head & {"DV", "MODE", "MODES", "ATTACK RATINGS", "AR"} and not head & {"COST MULTIPLIER"} \
                and b.header[0].upper() not in ("AMMO",):
            return "weapons", cat
        if head & {"DEFENSE RATING", "DR", "DEFENSE"}:
            return "armor", cat
        if head & {"ESSENCE", "ESS"}:
            return "augmentations", cat
        if head & {"ATTRIBUTES (D/F)", "ATTRIBUTES (A/S)", "ATTRIBUTE ARRAY", "DEVICE RATING"}:
            return "electronics", cat
        if head & {"AVAIL", "AVAILABILITY"} or any(re.search(r"\d", v) for h, v in b.row.items() if h.upper() == "COST"):
            return "gear", cat  # (a list of places with `¥¥` for a price is none)
        return None, None

    def split_being(self, b):
        """A stat block printed for several names (`Saint Joseph Houngan/Mambo`): one being per name, the stats shared;
        not when a name it gives is another block's too (`Grey Cell Watcher/Investigator`, `…Watcher/Decker`)."""
        names = _slash_names(b.name)
        if len(names) < 2 or any(norm(n) in self._clash for n in names):
            return [b]
        return [replace(b, name=n) for n in names]

    def extract(self, regrouped, ctx=None):
        bs = list(blocks(regrouped)) if isinstance(regrouped, str) else list(regrouped)
        names = {norm(b.name): b.name for b in bs if b.name}.values()  # each printed name once
        self._clash = {n for n, c in Counter(norm(x) for name in names for x in _slash_names(name)).items() if c > 1}
        res = crb.extract(bs, ctx, book=self)
        cat = crb._Catalog(self.ID, self.ID.lower(), self.BOOK)
        for name, text, page in _modules(bs):
            swc._lifemodule(cat, "adult", name, text, max(1, page - self.PAGE_OFFSET))
        if cat.entries["lifemodules"]:  # (the blocks stay rules too: the modules print no description of their own)
            res.files["lifemodules.xml"] = cat.xml("lifemodules")
            res.report += cat.report
        return res


RECIPES = [Book(*b) for b in BOOKS]
