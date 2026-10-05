"""Shadowrun: Body Shop (BS), the core augmentation book -> the SR6 catalog: cyberware (with cyberlimbs and their
enhancements), bioware, geneware, symbionts, transgenics and nanoware (each its own type), nanotech and drugs
(gear), the implant weapons, the augmentation qualities, the augmented critters and the rule sections (the implant
grades, cybermancy: no catalog kind of their own), ids unscoped (run scopes them as bs.<slug>), descriptions in the
private texts. Reads only regrouped.md (importer/sr6/regroup.py) with the core rulebook's reading (crb.extract); layout
notes in bs.md.

The book prints its gear as the core rulebook does: descriptions under level-4 headings, priced in a titled catalog table
(CYBERWARE, BIOWARE, GENEWARE …) at the end of the section. A line or value that doesn't read is reported, never
guessed."""
import re
import sys
from dataclasses import replace

from importer.recipes.dhsa import slug
from importer.sr6.recipes import crb
from importer.sr6.regroup import blocks, norm

ID, NAME, PUBLISHER, CANON = "BS", "Shadowrun: Body Shop", "Catalyst Game Labs", True
BOOK = "Body Shop"
SHA256 = ("2d7bfa762cfd1cb1c6e782326540536588bb384e06f80aef8378f304e9f4ef87",)  # the owner's copy
PAGE_OFFSET = 1  # printed page = PDF page - 1
END_PAGE = 189  # PDF page: the augmentations index starts here (left out)
CONTENTS_END = 7  # PDF page: the first chapter (its title no heading) starts here, still under the CONTENTS heading
FIRST_CHAPTER = "Augmentations, Essence, and the Meaning of Life"
ALIASES = {}
# first header cells that make a table a catalog (its rows are items even when no description pairs)
NAME_HEADERS = frozenset({"CYBERWARE", "BIOWARE", "SYMBIONT", "DEVICE", "ITEM", "DRUG", "AUGMENTATION", "CYBERLIMB",
                          "ACCESSORY", "EXOFRAME", "MODULE", "TYPE", "MELEE WEAPONS", "WEAPONS", "GENEWARE CORRECTIVE APPLICATIONS",
                          "GENEWARE PHENOTYPE ALTERATION", "ITEM COSMETIC/COVERT NANITES"})

SECTIONS = []  # kind() maps the blocks
SECTION_KINDS = set()
LABEL_SECTIONS = {}
RULE_CHAPTERS = ("augmentations essence", "chrome life", "building your body", "changing the code", "quick hitters",
                 "taming the wild", "edge of essence")
ATTRIBUTE_CHAPTERS = ()
CATALOG_CHAPTERS = RULE_CHAPTERS
# printed headers -> the core rulebook's (crb.HEADERS)
RENAME = {"CAP": "CAPACITY", "AVAL": "AVAIL", "AVAILABILITY": "AVAIL", "ESS": "ESSENCE", "DAMAGE": "DV"}
PROSE = {"POWER", "TRAINING REQ.", "CRITTERJACK REQ.", "TREATMENT TIME"}  # columns kept in the text
VARIANT_ROWS = True  # a catalog's name-only rows name the rows under them (regroup._variants)
CYBER = {"CYBERWARE", "DEVICE", "AUGMENTATION", "CYBERLIMB", "ACCESSORY", "EXOFRAME", "MODULE"}
BIO = {"BIOWARE", "SYMBIONT"}
_QUALITY = re.compile(r"(?:optional\s+)?(positive|negative)\s+quality:\s*", re.I)


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    hay = f"{meta.get('title') or ''}\n{md_head}"
    return 0.9 if re.search(r"body\s+shop", hay, re.I) else 0.0


def _head(b):
    return (b.header[0] if b.header else "").upper()


def fix(b, parent2):
    """The first chapter named; headers renamed to the core rulebook's (a column it has no attribute for goes to the
    text); a geneware or transgenic table's first header (`GENEWARE Corrective Applications`, `TYPE`) read as bioware;
    a `Negative Quality: X` box as quality X."""
    if norm(b.chapter) == "contents" and b.page >= CONTENTS_END:
        b = replace(b, chapter=FIRST_CHAPTER)
    labels = dict(b.labels)

    def ren(d, row=False):
        out = {}
        for i, (h, v) in enumerate(d.items()):
            h = RENAME.get(h.upper(), h) if row else h
            if h.upper() in PROSE and not (row and i == 0):
                if v and v != "—":
                    labels.setdefault(h.capitalize(), v)
            else:
                out[h] = v
        return out
    row = ren(b.row, True) if b.row is not None else None
    b = replace(b, row=row, header=list(row) if row is not None else b.header, stats=[ren(s) for s in b.stats],
                labels=labels)
    head = _head(b)
    if row is not None and (head.startswith("GENEWARE") or head == "SYMBIONT" or head == "TYPE" and norm(b.chapter) ==
                            "changing the code" or head == "AUGMENTATION" and "genetic" in b.label.lower()):
        name = f"BIOWARE {b.header[0]}"
        b = replace(b, header=[name] + b.header[1:], row={name if i == 0 else h: v for i, (h, v) in enumerate(row.items())})
    if (m := _QUALITY.match(b.name)) and b.type == "item":
        b = replace(b, name=b.name[m.end():], tags=f"{m.group(1).lower()} quality")
    return b


def kind(chapter, b, parent2):
    """(kind, category) of a block, else (None, None)."""
    labels = {k.lower(): v for k, v in b.labels.items()}
    if b.type == "section":
        return None, None
    if b.row is None:
        if norm(b.name) in ("positive qualities", "negative qualities"):
            return None, None
        if b.tags.endswith(" quality"):
            return "qualities", b.tags.split()[0]
        if re.search(r"karma", labels.get("cost") or labels.get("bonus") or "", re.I):
            return "qualities", "negative" if "bonus" in labels else "positive"
        if b.stats and _being(b.stats[0]) and "taming the wild" in chapter:
            return "critters", "critter" if "baseline" in norm(b.section) else "augmented critter"
        return None, None
    head, cols = _head(b), {h.upper() for h in b.header}
    label = slug(re.sub(r"\s*table$", "", b.label, flags=re.I)) or None
    if not label:  # a title its table doesn't follow (text between)
        label = "critter-augmentations" if "taming the wild" in chapter else slug(b.section) or None
    if head in CYBER:
        return "augmentations", label
    if head.startswith("BIOWARE") or head in BIO:
        return "augmentations", label
    if head == "ITEM" and "changing the code" in chapter:
        return ("augmentations", label) if "ESSENCE" in cols else ("gear", label)
    if head in ("DRUG", "EQUIPMENT"):
        return "gear", label if label and label.count("-") < 5 else "drugs"  # (a title run into the text beside it)
    if "DV" in cols and ("ATTACK RATINGS" in cols or "TYPE" in cols):
        return "weapons", label
    return None, None


def _being(s):
    return bool({h.upper() for h in s} & {"B", "BOD"} and {h.upper() for h in s} & {"A", "AGI"})


_PRICE_TAG = re.compile(r"Cost:\s*(.+?),\s*Availability:\s*(.+)", re.I)


def _prep(bs):
    """Blocks the core rulebook's reading takes: a being's band with a table printed beside it (`1D6 ROLL`,
    `EQUIPMENT … COST`) split from it (an equipment row as its own item), a box titled `… table` holding a being named
    by the empty heading before it; a heading priced on its tag line (`(Cost: 225,000, Availability: 6)`, a cybernetic
    shell) or by `Availability:` and `Cost:` labels with a `Vector:` (a drug) as a row; a nanite colony priced as a
    template and pre-built as two rows."""
    out = []
    for b in bs:
        prev = out[-1] if out else None
        if b.stats and _being(b.stats[0]) and (extra := [h for h in b.stats[0] if h.upper() not in crb._BEING]):
            beside = {h: b.stats[0][h] for h in extra}
            stats = [s for s in ({h: v for h, v in s.items() if h not in extra} for s in b.stats) if any(s.values())]
            b = replace(b, stats=stats)
            if extra[0].upper() == "EQUIPMENT" and any(beside.values()):
                out.append(replace(b, name=beside[extra[0]], header=extra, row=beside, stats=[], labels={}, text="",
                                   label=b.name))
        if b.type == "item" and b.label and b.label.lower().endswith("table") and b.stats and _being(b.stats[0]) \
                and prev is not None and prev.type == "item" and not prev.stats and prev.row is None:
            out[-1] = replace(b, name=prev.name, label="", text="\n\n".join(t for t in (prev.text, b.text) if t))
            continue
        if b.type == "item" and b.row is None and (m := _PRICE_TAG.fullmatch(b.tags)):
            head = next((p.name for p in reversed(out) if p.type == "item" and not p.stats and not p.tags and p.row is None), "")
            row = {"CYBERWARE": f"{head} ({b.name})" if head else b.name, "AVAIL": m.group(2), "COST": m.group(1)}
            b = replace(b, name=row["CYBERWARE"], header=list(row), row=row, tags="",
                        labels={**b.labels, **{k: v for s in b.stats for k, v in s.items()}}, stats=[])
        labels = {k.lower(): v for k, v in b.labels.items()}
        if b.type == "item" and b.row is None and "vector" in labels and "cost" in labels:
            row = {"DRUG": b.name, "AVAIL": labels.get("availability", ""), "COST": labels["cost"]}
            b = replace(b, header=list(row), row=row, label="drugs",
                        labels={k: v for k, v in b.labels.items() if k.lower() not in ("availability", "cost")})
        if b.row is not None and "COLONY AVAIL" in b.row:
            r, name = b.row, b.name
            for v, a, c in (("colony template", "COLONY AVAIL", "TEMPLATES COST"), ("pre-built", "PRE-BUILT AVAIL", "NANITES COST")):
                row = {"ITEM": f"{name} ({v})", "AVAIL": r.get(a, ""), "COST": r.get(c, "")}
                out.append(replace(b, name=row["ITEM"], header=list(row), row=row))
            continue
        if b.type == "item" and b.name[:1].islower():  # a box titled in lower case (`pet pal puppy`)
            b = replace(b, name=" ".join(w[:1].upper() + w[1:] for w in b.name.split()))
        out.append(b)
    return out


def extract(regrouped, ctx=None):
    return crb.extract(_prep(list(blocks(regrouped))), ctx, book=sys.modules[__name__])
