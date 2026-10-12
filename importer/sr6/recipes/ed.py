"""Shadowrun: Explosive Decompression (ED) -> the SR6 catalog: the space gear (spacesuits as armor, gear, the signal
booster, the rEvolution Arms energy weapons), the thruster packs, spaceships, starships and drones (vehicles), the
mission rosters' NPCs and the rule sections, ids unscoped (run scopes them as ed.<slug>), descriptions in the private
texts. Reads only regrouped.md (importer/sr6/regroup.py), after prepare_md() gives book.md's stat tables their titles,
with the core rulebook's reading (crb.extract); layout notes in ed.md. A line or value that doesn't read is reported,
never guessed."""
import re
import sys
from dataclasses import replace

from importer.sr6.ids import slug
from importer.sr6.recipes import crb, fs
from importer.sr6.regroup import blocks, keys, norm

ID, NAME, PUBLISHER, CANON = "ED", "Shadowrun: Explosive Decompression", "Catalyst Game Labs", True
BOOK = "Explosive Decompression"
SHA256 = ("b81d842b07a24001bc894f8163edde9bb19143852683f869f3ad9005d7d74f9e",)  # the owner's copy (latest)
# heading sizes -> levels: the guess takes the missions' 44 pt titles and 17 pt numbers for two levels of their own
HEADING_LEVELS = {60.0: 1, 44.0: 2, 21.0: 2, 15.0: 3, 13.0: 4, 9.0: 5}
PAGE_OFFSET = 1  # printed page = PDF page - 1
ALIASES = {}
NAME_HEADERS = frozenset({"ITEM", "WEAPON"})

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("let me play among the stars", "the new space race", "running the void", "hailing frequencies",
                 "opening bay doors", "prepare for launch", "mission logs", "mission rosters")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = ("opening bay doors", "prepare for launch")
GEAR, SHIPS, ROSTERS = "opening bay doors", "prepare for launch", "mission rosters"
UNRATED_NPCS = "Mission Rosters"  # its named characters print no Professional Rating
_TITLE_REACH = 80  # lines: an untitled stat table takes the nearest stray title up to this far above it
_STAT_HEADS = ("HAND", "HANDL", "ACCEL", "ITEM")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    return 0.9 if re.search(r"explosive\s+decompression", f"{meta.get('title') or ''}\n{md_head}", re.I) else 0.0


def _words(s):
    return set(norm(re.sub(r"\([^()]*\)", " ", s)).split())


def prepare_md(md):
    """book.md with the gear and vehicle chapters' stat tables under their titles: the book sets a table's title
    (`evo star wing (thruster pack)`, `Evomars voidsearcher`) apart from it, a column or a page section away. An
    untitled stat table (HAND …, ITEM … with text right above) takes the nearest title above it (up to _TITLE_REACH
    lines) that no table follows and that names no titled table (`EVO II` beside `evo armadillo II`: an art caption)."""
    lines = md.splitlines()
    heading = lambda ln: re.match(r"(#{4,5}) (.+)$", ln)
    nxt = lambda i: next((j for j in range(i + 1, len(lines)) if lines[j].strip()), None)
    prv = lambda i: next((j for j in range(i - 1, -1, -1) if lines[j].strip()), None)
    chapter, inside, titled, stray = "", [], [], []
    for i, ln in enumerate(lines):
        if ln.startswith("# "):
            chapter = norm(ln[2:])
        if chapter not in (GEAR, SHIPS):
            continue
        inside.append(i)
        if (m := heading(ln)) and (j := nxt(i)) is not None:
            (titled if lines[j].startswith("|") else stray).append(i)
    named = [_words(heading(lines[i]).group(2)) for i in titled]
    stray = [i for i in stray if not (t := heading(lines[i]).group(2)).startswith("(")
             and not t.lower().startswith("posted by") and (t[:1].islower() or len(heading(lines[i]).group(1)) == 5)
             and not any(w and (w <= _words(t) or _words(t) <= w) for w in named)]
    moves = {}
    for i in inside:
        p = prv(i)
        if lines[i].startswith("|") and lines[i].strip("| ").split(" |")[0].upper() in _STAT_HEADS \
                and p is not None and not lines[p].startswith(("|", "#")) and i + 1 < len(lines) and lines[i + 1].startswith("|-"):
            t = next((s for s in reversed(stray) if i - _TITLE_REACH <= s < i and s not in moves.values()), None)
            if t is not None:
                moves[i] = t
    out, moved = [], set(moves.values())
    for i, ln in enumerate(lines):
        if i in moves:
            out.append(lines[moves[i]])
        if i not in moved:
            out.append(ln)
    # a vehicle table's title in lower case reads as a caption unless labels follow: as an item heading it is the box
    for i, ln in enumerate(out[:-1]):
        cells = out[i + 1].split("|")
        if (m := re.match(r"(#{4,5} )([a-z])(.*)", ln)) and len(cells) > 2 and cells[1].strip().upper() in ("HAND", "HANDL", "ACCEL"):
            out[i] = m.group(1) + m.group(2).upper() + m.group(3)
    return "\n".join(out) + "\n"


def _described(bs):
    """A stat entry of the gear and vehicle chapters (a catalog row, a box with a vehicle band) takes the description
    whose heading names it (all the entry's words in it: `Crimson Spark` under `rEvolution Arms Crimson Spark`,
    `Evomars rifter` under `EvoMars Rifter`), and that heading's name when the entry is a titled box; a one-row table
    whose row says only what it is (`Space Suit` under `aresspace guardian`) is named by its title. The description
    then holds no rule of its own."""
    descs = [b for b in bs if norm(b.chapter) in (GEAR, SHIPS) and b.row is None and not b.stats and b.text.strip()
             and (b.type == "item" and b.level == 4 or b.type == "section" and b.level == 3)]
    taken, out = set(), []
    for b in bs:
        if norm(b.chapter) in (GEAR, SHIPS) and b.row is None and b.stats and not _vehicle(b) \
                and {"AVAIL", "COST"} & {h.upper() for h in b.stats[0]}:
            # a priced box under its title (the grenade launcher: its title right over its table) is its row
            b = replace(b, row={"ITEM": b.name, **b.stats[0]}, header=["ITEM", *b.stats[0]], stats=b.stats[1:])
        if norm(b.chapter) in (GEAR, SHIPS) and (b.row is not None or b.stats and _vehicle(b)):
            name, own = b.name, b.row is None
            if b.row is not None and b.label and not b.text.strip() and not any(_words(name) <= _words(d.name) for d in descs) \
                    and sum(1 for x in bs if x.label == b.label and x.row is not None) == 1:
                name, own = b.label, True  # a single-row table: its title names the item
            cands = [d for d in descs if _words(name) and (_words(name) <= _words(d.name)
                                                           or own and len(_words(d.name)) > 1 and _words(d.name) <= _words(name))]
            d = next((d for d in cands if norm(d.name) == norm(name)), cands[0] if len(cands) == 1 else None)
            if d is not None:
                taken.add(id(d))
                b = replace(b, text="\n\n".join(t for t in (d.text.strip(), b.text.strip()) if t),
                            section=d.section if own else b.section, tags=b.tags or d.tags)
                name = d.name if own and _words(d.name) <= _words(name) else name  # (`Mk II` keeps its own)
            if b.row is not None:
                b = replace(b, name=name, row={**b.row, b.header[0]: name})
            else:
                b = replace(b, name=name[:1].upper() + name[1:])
        out.append(b)
    return [b for b in out if id(b) not in taken]


def _rosters(bs):
    """A roster's stat box (`gagarin security hacker`) takes its level-3 section: its name when the box's words are
    all in it, its `(Professional Rating N)` tag and its text; the section then holds no rule of its own."""
    secs, taken, out = {}, set(), []
    for b in bs:
        if norm(b.chapter) == ROSTERS and b.type == "section" and b.level == 3:
            secs[b.section] = b
        elif norm(b.chapter) == ROSTERS and b.type == "item" and b.stats and "B" in {h.upper() for h in b.stats[0]} \
                and (sec := secs.get(b.section)) is not None:
            taken.add(id(sec))
            b = replace(b, name=sec.name if _words(b.name) <= _words(sec.name) else b.name[:1].upper() + b.name[1:],
                        tags=b.tags or sec.tags, text="\n\n".join(t for t in (sec.text.strip(), b.text.strip()) if t))
        out.append(b)
    return [b for b in out if id(b) not in taken]


def _tagged(bs):
    """A gear section whose text holds a one-row stat table with no name column, its row naming the section's tag
    (`(Grenade Launcher)` over a TYPE row `Grenade Launcher`: the ArmTech SSG-69A1, its band landing in its text) ->
    an item with that row, named by the section."""
    out = []
    for b in bs:
        t = next(((h, r) for h, r in crb._tables(b.text) if len(r) == 1 and h[0].upper() == "TYPE"
                  and norm(r[0][0]) == norm(b.tags)), None) if norm(b.chapter) == GEAR and b.tags and b.row is None else None
        if t:
            row = {"WEAPON": b.name, **dict(zip(t[0], t[1][0]))}
            b = replace(b, type="item", row=row, header=list(row), text=b.text.replace(fs._md_table(*t), "").strip())
        out.append(b)
    return out


def _vehicle(b):
    return any(h.upper() in ("HAND", "HANDL", "ACCEL") for h in (b.stats[0] if b.stats else b.header))


def fix(b, parent2):
    """A vehicle's box as its row; an NPC's `(Professional Rating N)` tag as the core rulebook's section form (a named
    character keeps its tag line, `(Female Elf)`, and the book's group UNRATED_NPCS)."""
    if b.stats and _vehicle(b) and b.row is None:
        s = b.stats[0]
        b = replace(b, row={"VEHICLE": b.name, **s}, header=["VEHICLE", *s], stats=b.stats[1:], label="")
    if norm(b.chapter) == ROSTERS and (m := fs._RATING.search(b.tags)):
        b = replace(b, section=f"Professional Rating {m.group(1)}: {UNRATED_NPCS}")
    return b


def kind(chapter, b, parent2):
    if chapter == ROSTERS:
        return ("npcs", None) if b.stats and "B" in {h.upper() for h in b.stats[0]} else (None, None)
    if chapter not in (GEAR, SHIPS) or b.row is None:
        return None, None
    if b.name.startswith(("*", "†")):
        return "skip", None
    head = {h.upper() for h in b.header}
    if head & {"HAND", "HANDL", "ACCEL"}:
        thruster = chapter == GEAR and ("thruster" in b.name.lower() or norm(b.section) == "thruster packs")
        return "vehicles", "thruster-packs" if thruster else slug(parent2 if chapter == SHIPS else b.section) or "vehicles"
    if head & {"DEFENSE RATING", "DR"}:
        return "armor", "spacesuits"
    if head & {"DV", "MODE", "MODES"}:
        return "weapons", slug(b.tags) if b.tags else "energy-weapons"  # (the grenade launcher: its tag)
    if head & {"AVAIL", "AVAILABILITY", "COST"}:
        return "gear", slug(parent2) or "gear"
    return None, None


def extract(regrouped, ctx=None):
    return crb.extract(_rosters(_tagged(_described(list(blocks(regrouped))))), ctx, book=sys.modules[__name__])
