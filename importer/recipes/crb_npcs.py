"""The core rulebook's NPC, critter and spirit stat blocks (chapter "Hell Is Other People", printed pp.244-265) -> NPCs
(Character XML with an <npc> block). Read from the PDF's layout (pdfplumber): the Markdown interleaves the blocks.

Layout (printed pages, no book text): each block is a horizontal band of a two-column page, from its name (16 pt, left
column) to the next name. The left column has the attribute table (STR AGI WIL LOG CHA, the human row first, then
"4 (orks) 3 (dwarfs)…" rows under the columns they change; a spirit prints "Minor / Regular / Major" and "2/3/4" values)
and the skills ("• Skill <avg> (<rank>+<attr initial>, RR n)", "◊ Spec …", "[with <amp> …]" pools); the right column (and
whatever the left one has room for) the Shadow Amps ("• Name (type): effects", under "SHADOW AMPS", "CHOOSE n SHADOW AMP",
"AWAKENED + CHOOSE 1 …"), SPELLS, WEAPONS ("• Name DV n (orks …) [ranges]", "CHOOSE 1 WEAPON"), EQUIPMENT ("• Name (Armor
n)") and WOUND THRESHOLDS ("• Low fighting spirit", thresholds). A band without an attribute table is a critter's
description (the facing page has its block); lines above a page's first name continue the last block. Margin tab
letters (the outer 30 pt) and the running header and page number (18 pt and up) are dropped.

Rules: the human row (the other metatypes' values go to the notes); "choose n" imports the first n options (the rest
go to the notes, as do a toxic spirit's own powers); a spirit imports once per Force column (Minor, Regular, Major);
blocks from p.256 on are critters (no metatype), and spirits when they materialize or manifest; tier regular; fighting
spirit as printed.
"""
import re

from importer import statblock
from importer.recipes.dhsa import slug

PAGE_OFFSET = 2            # printed page = PDF page - 2 (crb.PAGE_OFFSET)
FIRST, LAST = 244, 265     # printed pages of the stat blocks
CRITTERS_FROM = 256        # printed page where the critters start
LABELS = ("STR", "AGI", "WIL", "LOG", "CHA")
FORCES = ("Minor", "Regular", "Major")
ATTR = {"S": "str", "A": "agi", "W": "wil", "L": "log", "C": "cha"}
SPIRITS = ("null", "low", "high", "extreme")
# printed amp type -> the type statblock.to_character reads (AMP_TYPES; "drone" types read as vehicles)
AMP_TYPES = {"drug": "Equipment", "gear": "Equipment", "vehicle improvement": "Equipment", "cyberware improvement": "Cyberware",
             "cyberdeck program": "Cyberdeck", "power": "Quality", "spell": "Quality"}
# an untyped amp by its first word ("Cyberdeck (Attack N, Firewall N)", "Awakened: <kind>", "Dermal <…>: <effect>")
NAMED_TYPES = {"awakened": "Awakened", "cyberdeck": "Cyberdeck", "dermal": "Cyberware", "sustaining": "Equipment"}
SKILL = re.compile(r"^(?P<name>[^\d(\[]+?)\s*(?:[\d/]+\s*)?(?:\((?![\d/]+\s*\+)[^()]*\)\s*)?"
                   r"\((?P<rank>[\d/]+)\s*\+\s*(?P<attr>[SAWLC])(?:/[SAWLC])?\s*,\s*RR\s*[\d/]+\)")
FORCED = re.compile(r"([+-]?\d+)/([+-]?\d+)/([+-]?\d+)")


# ---------------------------------------------------------------- layout (PDF)

def _lines(words):
    """[(top, text, words)] for words sharing a baseline (3 pt), left to right."""
    rows = []
    for w in sorted(words, key=lambda w: (w["top"], w["x0"])):
        if rows and abs(w["top"] - rows[-1][0]["top"]) < 3:
            rows[-1].append(w)
        else:
            rows.append([w])
    return [(ws[0]["top"], " ".join(w["text"] for w in sorted(ws, key=lambda w: w["x0"])), sorted(ws, key=lambda w: w["x0"])) for ws in rows]


def _table(lines):
    """The attribute table's rows rewritten by column: "STR 3 | AGI 2 | …", then "STR 4 (orks) | WIL 3 (dwarfs) …". A value
    belongs to the label nearest its centre (a column's value may sit a little off)."""
    out, cols = [], None
    for top, text, ws in lines:
        if text.split() == list(LABELS):
            cols = [(w["x0"] + w["x1"]) / 2 for w in ws]
            out.append(text)
            continue
        if cols is None or not re.match(r"[\d/]+\b", text):
            cols = None
            out.append(text)
            continue
        cells = []
        for w in ws:
            if re.fullmatch(r"[\d/]+", w["text"]):
                col = min(range(5), key=lambda i: abs(cols[i] - (w["x0"] + w["x1"]) / 2))
                cells.append([LABELS[col], w["text"]])
            elif cells:
                cells[-1].append(w["text"])
        out.append(" | ".join(" ".join(c) for c in cells))
    return out


def page_bands(page):
    """[(name or None, [text line])] for one PDF page: None first for what sits above the page's first name; a band's
    lines are its left column's, then its right column's, top to bottom, with the attribute table by column."""
    words = [w for w in page.extract_words(extra_attrs=["size"])
             if w["size"] < 18 and 30 < w["x0"] < page.width - 30]  # not the running header, page number or margin tab
    if not words:
        return []
    split = min(w["x0"] for w in words) + 240  # the right column starts 252 pt right of the left one
    heads = [(top - 1, text) for top, text, _ in _lines([w for w in words if 14 <= w["size"] < 18])]
    body = [w for w in words if w["size"] < 14]
    bands, out = [(None, -1e9)] + [(n, t) for t, n in heads], []
    for i, (name, top) in enumerate(bands):
        end = bands[i + 1][1] if i + 1 < len(bands) else 1e9
        ws = [w for w in body if top <= w["top"] < end]
        if name is not None or ws:
            out.append((name, _table(_lines([w for w in ws if w["x0"] < split])) + _table(_lines([w for w in ws if w["x0"] >= split]))))
    return out


def chapter(pdf):
    """[(printed page, pdfplumber page)] of the chapter's stat blocks."""
    return [(n, pdf.pages[n + PAGE_OFFSET - 1]) for n in range(FIRST, LAST + 1) if n + PAGE_OFFSET <= len(pdf.pages)]


def blocks(pages):
    """[(printed page, name, [text line])] for every stat block on `pages` ([(printed page, pdfplumber page)])."""
    out = []
    for printed, page in pages:
        for name, lines in page_bands(page):
            if name is None and out:
                out[-1][2].extend(lines)
            elif name is not None:
                out.append((printed, name, lines))
    return [b for b in out if any(l.split() == list(LABELS) for l in b[2])]


# ---------------------------------------------------------------- one block (text)

def _name(s):
    """Small caps as extracted ("mAdE-uP GuArd / tEsT-COP") -> "Made-Up Guard / Test-Cop"."""
    t = re.sub(r"\s+", " ", s).strip().lower().title()
    return re.sub(r"(?<=\s)(Of|And|The)\b", lambda m: m.group(1).lower(), t)


def _choose(heading):
    """How many options a section heading takes: None = all; "CHOOSE 1" 1; "AWAKENED + CHOOSE 1" 2 (the named one and one
    more); "CHOOSE 1 VEHICLE + 1" 2; "CHOOSE 1 VEHICLE OR 2 DRONE" 1 (one bullet). A spirit's "1/2/2" is its Force's by now."""
    if "CHOOSE" not in heading:
        return None
    return sum(int(m.group(1)) if (m := re.search(r"(\d+)", part)) else 1 for part in heading.split("+"))


def parse(lines, force=None):
    """A block's text lines -> statblock's block shape plus "notes" and "fighting"; None without an attribute table.
    force: 0/1/2 picks a spirit's Minor/Regular/Major value of every "a/b/c"."""
    if force is not None:
        lines = [FORCED.sub(lambda m: m.group(force + 1), l) for l in lines]
    # the book prints "." as U+FFFD; the wound boxes are private-use glyphs
    lines = [re.sub("[\ue000-\uf8ff]", "", l.replace("\ufffd", ".")).strip() for l in lines]
    start = next((i for i, l in enumerate(lines) if l.split() == list(LABELS)), None)
    if start is None:
        return None
    attrs, metas, notes = {}, [], []
    sec, group, bracket = None, None, False
    skills, amps, spells, weapons, equipment = [], [], [], [], []
    groups = []  # [section, how many to take, [item]]: the "choose" lists
    items = []   # [section, its choose list or None, bullet, text], in order
    fighting = None
    for l in lines[start + 1:]:
        if re.match(r"(?:STR|AGI|WIL|LOG|CHA) [\d/]", l):
            cells = [c.split() for c in l.split(" | ")]
            if not attrs and all(len(c) == 2 for c in cells):
                attrs = {c[0].lower(): int(c[1]) for c in cells}
            else:
                metas.append(", ".join(" ".join(c) for c in cells))
            continue
        if not l.startswith(("•", "◊", "[")) and re.fullmatch(r"[A-Z0-9 +:/&()'’.-]+", l) and re.search(r"[A-Z]{3}", l):
            head = l
            # "WEAPONS (DEPENDING ON SHADOW AMPS)" is a weapons list
            sec = ("skills" if "SKILL" in head else "weapons" if "WEAPON" in head else "amps" if "SHADOW AMP" in head
                   else "spells" if "SPELL" in head else "equipment" if "EQUIPMENT" in head else "wounds" if "WOUND" in head else sec)
            take = _choose(head)
            group = [sec, take, []] if take is not None else None
            if group:
                groups.append(group)
            bracket = False
            continue
        if l.startswith("["):
            bracket = "]" not in l
            continue
        if bracket:
            bracket = "]" not in l
            continue
        if l.startswith(("•", "◊")):
            items.append([sec, group, l[0], l[1:].strip()])
            if group:
                group[2].append(items[-1])
        elif items and items[-1][0] == sec and sec in ("amps", "spells", "weapons", "equipment"):
            items[-1][3] += " " + l  # a wrapped line
    for g in groups:  # a choice beyond the first n: to the notes
        top = [it for it in g[2] if g[0] != "skills" or it[2] == "•"]
        for it in top[g[1]:]:
            it[0] = "not chosen"
            if g[0] == "skills":  # its specializations go with it
                for x in g[2][g[2].index(it) + 1:]:
                    if x[2] == "•":
                        break
                    x[0] = "not chosen"
    for sec, _, mark, text in items:
        text = re.sub(r"\s+", " ", text).strip()
        if sec == "not chosen":
            notes.append(text)
        elif sec == "skills":
            m = SKILL.match(text)
            if not m:
                continue
            name, rank, attr = m.group("name").strip(), int(m.group("rank")), ATTR[m.group("attr")]
            if mark == "•" or not skills:
                skills.append({"name": name, "rating": rank, "attr": attr, "dp": rank + attrs.get(attr, 0), "rr": None, "specs": []})
            else:
                skills[-1]["specs"].append({"name": name, "plus2": rank > skills[-1]["rating"], "attr": attr,
                                            "dp": rank + attrs.get(attr, 0), "rr": None})
        elif sec == "amps":
            if text.startswith("["):  # "[<Kind> toxic spirits only] …": a toxic spirit's own power
                notes.append(text)
            else:
                amps.append(_amp(text))
        elif sec == "spells":
            spells.append(re.split(r" \(", text)[0].strip(" ."))
        elif sec == "weapons":
            m = re.match(r"(.+?) DV (\d+)\b.*?\[([^\]]*)\]", text)
            if m:
                rng = re.sub(r"\s+", "", m.group(3)).replace("–", "-").replace("—", "-").replace("Dis.", "Dis")
                weapons.append({"name": m.group(1).strip(), "dv": m.group(2), "ranges": rng})
        elif sec == "equipment":
            equipment.append(text.rstrip("."))
        elif sec == "wounds" and fighting is None:
            m = re.match(r"(\w+) fighting spirit", text, re.I)
            fighting = m.group(1).lower() if m and m.group(1).lower() in SPIRITS else None
    if metas:
        notes.insert(0, "Other metatypes: " + "; ".join(metas) + ".")
    armor, gear = [], []
    for e in equipment:
        m = re.match(r"(.+?) \(Armor (\d+)\)", e)
        if m and not armor:
            armor.append({"name": m.group(1).strip(), "armor": m.group(2), "l": 0})
        else:
            gear.append(re.sub(r" \((?:except|only)[^()]*\)$", "", e))
    return {"keywords": [], "skills": skills, "weapons": [], "armor": armor, "dispositions": [], "cues": [], "spells": spells,
            "forms": [], "amps": amps, "equipment": gear, "attributes": attrs, "knowledge": [],
            "printed_weapons": weapons, "notes": notes, "fighting": fighting}


def _amp(text):
    """"2 <Name> (<type>): <effects>" -> statblock's amp shape (no printed rating or Essence)."""
    count = 1
    m = re.match(r"(\d+) (?=[A-Z])", text)
    if m:
        count, text = int(m.group(1)), text[m.end():]
    m = re.match(r"([^(:]+)(?:\(([^()]*)\))?\s*(:|$|(?=\S))", text)
    name, paren, rest = m.group(1).strip(), (m.group(2) or "").strip(), text[m.end():].strip()
    rest = re.sub(r"^\([^()]*\):\s*", "", rest).strip(" .;")  # "(replaces <amp>): …"
    low = paren.lower()
    if paren and (re.search(r"\d", paren) or low.startswith("choose") or low in ("hermetic", "shamanic")):
        rest, low = f"{paren}; {rest}" if rest else paren, ""  # "Cyberdeck (Attack 1, Firewall 2)": the paren is its effects
    atype = AMP_TYPES.get(low) or (low.capitalize() if low else NAMED_TYPES.get(name.split()[0].lower(), "Quality"))
    lines = statblock.crb_amp_lines([rest.rstrip(".")]) if rest else []
    return {"name": name, "type": atype, "ess": None, "rating": None, "count": count, "lines": lines}  # none printed


def characters(page, raw_name, lines, rules, spell_ids, updated, taken):
    """One stat block -> ([npc list entry with "xml"], report rows): one NPC, or one per Force for a spirit."""
    name = _name(raw_name)
    forced = any(l.strip() == " / ".join(FORCES) for l in lines)
    out = []
    for force in (range(3) if forced else [None]):
        block = parse(lines, force)
        if block is None:
            return [], [{"kind": "npc-failed", "name": name, "page": page, "problem": "no attribute table"}]
        text = " ".join(" ".join(a["lines"]) for a in block["amps"])
        kind = "npc" if page < CRITTERS_FROM else "spirit" if forced or re.search(r"materiali[sz]|manifest", text, re.I) else "critter"
        full = f"{name} ({FORCES[force]})" if forced else name
        base = sid = f"crb.npc-{slug(full)}"
        n = 2
        while any(x["file"] == f"{sid}.xml" for x in taken + out):
            sid, n = f"{base}-{n}", n + 1
        ch, rows = statblock.to_character(block, rules, sid=sid, name=full, role="", origin="CRB", background=f"CRB p.{page}.",
                                          updated=updated, spell_ids=spell_ids, page=page)
        b = ch["build"]
        for a in b["amps"]:  # no rating is printed: nothing to compare the rules' rating with
            a.pop("snapshot", None)
        for w in block["printed_weapons"]:  # every attack as printed (a critter's bite too); unarmed is the app's own
            if w["name"].lower() == "unarmed":
                continue
            cid = statblock.weapon_id(rules, re.sub(r"\s*\(.*\)$", "", w["name"]))  # "Assault rifle (drones)"
            b["items"].append({"uid": f"it-{len(b['items']) + 1}", "kind": "weapon", "name": w["name"],
                               **({"catalogId": cid} if cid else {}), "dv": w["dv"], "ranges": w["ranges"]})
        ch["npc"] = {"kind": kind, "tier": "regular", **({"fightingSpirit": block["fighting"]} if block["fighting"] else {})}
        ch["identity"]["metatype"] = "human" if kind == "npc" else ""
        ch["identity"]["notes"] = "\n".join(block["notes"])
        out.append({"file": f"{sid}.xml", "xml": statblock.character_xml(ch), "name": full, "kind": kind, "tier": "regular", "page": page})
        rows = [r for r in rows if r["kind"] in ("unknown-skill", "amp-type", "unmatched-item")]
    return out, [{**r, "page": page} for r in rows]


def npcs(pages, rules, spell_ids, updated):
    """(npc list entries, report rows) for the stat blocks on `pages` (chapter(pdf)). A block that can't be read is
    reported; the others still import."""
    out, report = [], []
    for page, raw, lines in blocks(pages):
        try:
            got, rows = characters(page, raw, lines, rules, spell_ids, updated, out)
        except Exception as e:  # noqa: BLE001  one bad block never stops the rest
            got, rows = [], [{"kind": "npc-failed", "name": _name(raw), "page": page, "problem": f"{type(e).__name__}: {e}"}]
        out += got
        report += rows
    return out, report
