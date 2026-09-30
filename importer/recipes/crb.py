"""Shadowrun Anarchy 2.0 Alternative Core Rulebook (CRB) -> the core files (crb_core.py: skills, amp effects, pricing …,
written to custom/imported/core/), spells, Shadow Amps, plain gear and sample runners. The amps and runners are read with
the core files the book itself gives.

Layout notes (page ranges, box shapes, converter quirks) are in crb.md next to this file. In short: every
rules box is a one-cell table titled in capitals; its lines are <br>-separated (a box set in two text
columns reads left column, then right: converter v5). The chapter's margin tab letters (the spelled-out
chapter title) come out as lone lines or glued to a line's ends; they are stripped here, not in the
converter. The PDF has two cover pages before printed page 1: printed page = PDF page - 2. Descriptions go
to the texts result, never the overlay.

Spells sit in five boxes "<FAMILY> SPELLS" (printed pp.180-183). After the "SPELL TYPE THRESHOLD" header
line, a row starts "<Name> <Family> ..." ; a name wraps onto the row's second line ("Increase" /
"Reflexes"), and grouped spells chain "A / B / C*" down the lines, sharing one row.

Amps and gear are the boxes' bold entries, "**Name:** (<weapon type>, Rating N <Kind> Amp, <Essence>, cost¥)
effects" or "**Name:** (Equipment, cost¥) text" (pp.136-241). Effects are read with the DHSA recipe's
Mapper after the CRB's phrasing is brought to its shape ("RR 1 on Stealth (physical) and Perception
(physical) Tests" -> one RR per skill/spec); the rating is reconciled with the printed one the same way.

Sample runners: the 12 pregens (a story page, then a stat page; printed pp.88-111) go through importer.statblock's
CRB layout path; the character creation example box (p.85) builds its runner from the prose. Every printed
number goes to the report, as the pregen booklet's do. An amp printed only on those sheets (no box has its type and
name: Concealment on Hercules', the pregens' brand-name gear) is the rulebook's too, so it joins the catalog amps.
"""
import contextlib
import functools
import os
import re
import shutil
import tempfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from importer import CORE_FILES, find_core_file, statblock, use_core
from importer.recipes import Result
from importer.recipes.dhsa import (  # same ids ("spell-" + slug, amp slugs) and effect rules as the DHSA recipe
    SKILLS, ATTRS, Mapper, attr, core, dv_num, load_skills, reconcile, slug, specialist, weapon_base)

ID, NAME, PUBLISHER, CANON = "CRB", "Shadowrun Anarchy 2.0 Alternative Core Rulebook v1.8", "Catalyst Game Labs", True
SHA256 = ("4ae357ad00d8c9ad660a5595e9c100f1c9e7a105875f92bffc33111efc707a95",)  # the owner's v1.8 PDF
PAGE_OFFSET = 2
FAMILIES = ("Combat", "Detection", "Health", "Illusion", "Manipulation")

TAB = "AWKENdOrL"  # letters of the margin tab (AWAKENED WORLD, lower-case d and r as printed)
# the chapters' margin tabs by printed page: MUNDANE / AWAKENED / VIRTUAL / MECHANICAL WORLD, as printed
# (and GAME CONCEPTS beside the character creation example box, p.85)
TABS = ((85, 85, "GAMECONPTS"), (133, 167, "MuNdAEWOrL"), (169, 199, TAB), (202, 228, "vIrTuALWOd"), (230, 242, "MEChANICLWOrLd"))
BOX = re.compile(rf"^\| (?:[{TAB}] )?({'|'.join(f.upper() for f in FAMILIES)}) SPELLS \|$")
CHAIN = re.compile(r"^([A-Z][A-Za-z ]*?)(\*| /)")

MARK = re.compile(r"\*\*([^*]+?):\*\*")  # an entry's bold run-in name
PAREN = re.compile(r"^:?\s*\(([^()]*)\)\s*:?")
AMP = re.compile(r"(?:(?P<wtype>[^,]+), )?Rating (?P<rating>\d+)\+?,? (?P<kind>[A-Za-z ]+?) Amp")
KIND = {"equipment": "equipment", "cyberware": "cyberware", "bioware": "bioware", "adept power": "adept",
        "quality": "quality", "vehicle": "vehicle", "drone": "vehicle", "contact": "contact", "cyberdeck": "cyberdeck"}
DRONE_SIZES = {"microdrone": "microdrone", "small drone": "small-drone", "medium drone": "medium-drone", "large drone": "large-drone"}
RANGES = re.compile(r"((?:OK|Dis\.?|[–—-])(?:\s*/\s*(?:OK|Dis\.?|[–—-])){3})")


def match(meta, md_head):
    if meta.get("sha256") in SHA256:
        return 1.0
    return 0.9 if re.search(r"alternate core rulebook", md_head, re.I) and re.search(r"shadowrun", md_head, re.I) else 0.0


@functools.cache
def _tab_regexes(tab):
    # a glued lead letter; "A" only before a mark and "I" only before a mark or a capital, since they start sentences
    return (re.compile(rf"^[{tab}]$"), re.compile(rf" [{tab}]$"),
            re.compile(rf"^(?:[{tab.replace('A', '').replace('I', '')}] |A (?=[*(+•])|I (?=[*(+•A-Z]))"))


def _tab(page):
    return next((t for a, b, t in TABS if a <= page <= b), None)


def _furniture(lines, tab=TAB):
    """Drop the margin tab letters: lone lines, and a letter glued to a line's start or end."""
    lone, trail, lead = _tab_regexes(tab)
    out = []
    for l in lines:
        l = l.strip()
        if lone.match(l):
            continue
        l = trail.sub("", lead.sub("", l))
        if l:
            out.append(l)
    return out


def spell_rows(md):
    """[(printed page, family, [names], text)] from the spell boxes."""
    out, page, lines = [], 0, md.splitlines()
    for i, line in enumerate(lines):
        m = re.match(r"<!-- page (\d+) -->", line)
        if m:
            page = int(m.group(1)) - PAGE_OFFSET
            continue
        m = BOX.match(line)
        if not m or i + 2 >= len(lines) or not lines[i + 1].startswith("|---"):
            continue
        fam = m.group(1).title()
        start = re.compile(rf"^([A-Z][^()]*?) {fam}(?=$| [(\dA-Z])")
        body = _furniture(lines[i + 2].strip()[1:-1].split("<br>"))
        rows, cur, chaining, second = [], None, False, False
        for l in body[next((k + 1 for k, b in enumerate(body) if b.startswith("SPELL TYPE THRESHOLD")), len(body)):]:
            if l.startswith("*"):  # footnotes: "**Area-based threshold:**", "* A, B … are different spells"
                break
            c = CHAIN.match(l) if chaining else None
            s = None if c else start.match(l)
            if c:
                cur["names"].append(c.group(1).strip())
                chaining = c.group(2) == " /"
                l = l[c.end():].strip()
            elif s:
                name = s.group(1).strip()
                chaining = name.endswith(" /")
                cur = {"names": [name.rstrip(" /*")], "text": []}
                rows.append(cur)
                l = l[len(name):].strip()
            elif cur is None:
                continue
            elif second and (w := re.match(r"([A-Z][a-z]+)(?= \(|$| [a-z])", l)):  # the name's second line
                cur["names"][-1] += " " + w.group(1)
                l = l[w.end():].strip()
            second = bool(s) and not chaining
            if l:
                cur["text"].append(l)
        for r in rows:
            text = " ".join(r["text"]).replace("**", "").replace("�", ".")
            out.append((page, fam.lower(), r["names"], text))
    return out


def boxes(md):
    """(printed page, title, body lines without margin furniture) for every box: a table whose header is one cell."""
    lines, page = md.splitlines(), 0
    for i, line in enumerate(lines):
        m = re.match(r"<!-- page (\d+) -->", line)
        if m:
            page = int(m.group(1)) - PAGE_OFFSET
        elif line.startswith("| ") and " | " not in line and i + 1 < len(lines) and lines[i + 1].startswith("|---"):
            body, j = [], i + 2
            while j < len(lines) and lines[j].startswith("| ") and not lines[j + 1:j + 2] == ["|---|"]:  # to the next box
                body += [c for cell in lines[j].strip().strip("|").split(" | ") for c in cell.split("<br>")]
                j += 1
            tab = _tab(page)
            title = line.strip("| ").strip()
            if tab:
                body, title = _furniture(body, tab), re.sub(rf"^[{tab}] (?=[A-Z]{{2}})", "", title)
            yield page, title, body


def _join(lines):
    """One string: a word hyphenated at a line's end is joined ("con-" "tains"; "Logic-" "based" keeps its
    hyphen) and the "." the boxes print as U+FFFD is restored."""
    out = ""
    for l in lines:
        if out.endswith("-") and out[-2:-1].islower() and l[:1].islower():
            out = out[:-1] + ("-" if re.match(r"based|sim\b", l) else "") + l
        else:
            out += " " + l
    return out.replace("�", ".").strip()


def entries(text):
    """[(name, paren, text)] for each bold run-in entry of a box's text. The paren is the "(…)" right after
    the name, or "" (a label such as "Note" or "Similar Archetypes"). A paren the layout pushed before its
    name ("… (Rating N Contact Amp, X¥) RR 1 **Night clerk:** on …") is moved back to it."""
    ms = list(MARK.finditer(text))
    out = []
    for i, m in enumerate(ms):
        body = text[m.end(): ms[i + 1].start() if i + 1 < len(ms) else len(text)].strip()
        p = PAREN.match(body)
        paren, body = (p.group(1), body[p.end():].strip()) if p else ("", body)
        moved = None if p or not out else re.search(r"\((Rating [^()]*)\)([^()]*)$", out[-1][2])
        if moved:
            out[-1] = (*out[-1][:2], out[-1][2][:moved.start()].strip())
            paren, body = moved.group(1), (moved.group(2).strip() + " " + body).strip()
        out.append((re.sub(r"\s+", " ", m.group(1)).strip(), paren, body))
    return out


def clauses(text):
    """Split on ";" "," and sentence ends, but not inside (…) or […]."""
    out, cur, depth = [], "", 0
    for k, ch in enumerate(text):
        depth += (ch in "([") - (ch in ")]" and depth > 0)
        if depth == 0 and (ch in ";," or (ch == "." and text[k + 1:k + 2] in (" ", ""))):
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [c.strip() for c in out + [cur] if c.strip()]


def _parts(s):
    """Top-level parts of "A (x), B and C (y and z)": split at ",", " and ", " or " outside parentheses."""
    out, cur, depth, k = [], "", 0, 0
    while k < len(s):
        depth += (s[k] == "(") - (s[k] == ")" and depth > 0)
        sep = re.match(r",?\s+(?:and|or)\s+|,\s*", s[k:]) if depth == 0 else None
        if sep:
            out.append(cur)
            cur, k = "", k + sep.end()
            continue
        cur += s[k]
        k += 1
    return [c.strip() for c in out + [cur] if c.strip()]


def mapper_lines(clause):
    """A CRB clause in the phrasing the DHSA Mapper reads: "RR N Skill (spec)", one per skill and spec."""
    c = re.sub(r"\bRR on\b", "RR 1 on", clause)
    c = re.sub(r"\bFW (\d)", r"Firewall \1", c)
    c = re.sub(r"control of (\d+) vehicles", r"control of \1 drones", c)
    c = c.replace("cold- and hot-sim", "cold-sim and hot-sim")
    m = re.search(r"\bRR (\d) on (?:all )?(.+?) Tests?\b(.*)", c)
    if not m:
        return [c]
    n, cond, out = m.group(1), m.group(3).strip(), []
    for part in _parts(m.group(2)):
        sm = re.fullmatch(r"(.+?)(?:\s*\((.*)\))?", part)
        skill, spec = re.sub(r"-based$", "", sm.group(1).strip()), sm.group(2)
        if skill.lower() not in SKILLS and skill.lower() not in ATTRS:
            return [c]  # "RR 1 on Skill Tests (Skill chosen …)" and the like: the Mapper's own patterns
        if spec is None and cond.startswith("when "):  # a condition narrows a skill RR to a custom spec
            spec = cond
        specs = _parts(spec) if spec and not re.search(r"choose|choice", spec) else [spec]
        out += [f"RR {n} {skill}" + (f" ({x})" if x else "") for x in specs]
    return out


def map_clauses(mapper, cls):
    """(effects, narrative clauses): a clause maps only if every Mapper line it becomes maps."""
    fx, narrative = [], []
    for c in cls:
        got = [mapper.effects(l) for l in mapper_lines(c)]
        if all(g is not None for g in got):
            fx += [f for g in got for f in g]
        else:
            narrative.append(c)
    return fx, narrative


def _cost(paren):
    m = re.search(r"(\d[\d, ]*)\s*¥", paren)
    return int(re.sub(r"\D", "", m.group(1))) if m else None


def build_amp(mapper, name, atype, rating, wtype, cost, text, page):
    """One Amp: item descriptor and effects from the entry's text, rating reconciled as in the DHSA recipe."""
    item, vehicle, vfx, cls = "", None, [], None
    if atype == "equipment":
        bdv, brng = weapon_base(wtype, "") if wtype else (None, None)
        if wtype and not bdv:
            bdv, brng = weapon_base(name, wtype)
        if bdv:  # a weapon: DV and ranges as printed; the base weapon comes from the type in the paren
            dv = " ".join(re.sub(r"\s+|\([a-z ]+\)", "", d).strip("()").replace("STR+", "S+")
                          for d in re.findall(r"\bDV (\([^)]*\)|\d+(?: \([a-z ]+\))?(?: / \d+(?: \([a-z ]+\))?)?)", text))
            rm = RANGES.search(text)
            rng = re.sub(r"\s+", "", rm.group(1)).replace("–", "-").replace("—", "-").replace("Dis.", "Dis") if rm else ""
            item = f'<item kind="weapon"{attr("specialist", "true" if specialist(cost, rating) else "")}{attr("dv", dv)}{attr("ranges", rng)}/>'
            a, b = dv_num(dv.split()[0] if dv else ""), dv_num(bdv)
            if a and b and a[0] == b[0] and a[1] > b[1]:
                vfx += [("dv-plus", None, None, None)] * (a[1] - b[1])
            if brng and rng and rng != brng:
                vfx.append(("range-improve", f"{brng} -> {rng}", None, None))
            if brng.split("/")[1] != "-":  # ranged weapons carry their type in the name, as the old catalog did
                name = f"{name} ({wtype[:1].upper() + wtype[1:]})"
            cls = [c for c in clauses(text) if not re.match(r"(?:DV|[Rr]ange)\b|\[|underbarrel", c) and not RANGES.fullmatch(c)]
        elif m := re.match(r"Armor (\d)\b", text):
            item, text = f'<item kind="armor" armor="{m.group(1)}"/>', text[m.end():]
        else:
            item = '<item kind="gear"/>'
    if atype == "vehicle":
        chassis = core()["chassis"]
        m = statblock.VSTATS.search(text)  # shared with the stat blocks (read at call time: statblock imports dhsa)
        if m:
            p, b, h, s, a = map(int, m.groups())
            text = text[:m.start()] + text[m.end():]
        else:  # a drone given by size and Pilot only ("Tiny drone, Pilot 7, hovers")
            size = next((v for k, v in DRONE_SIZES.items() if k in text.lower()), "small-drone")
            pm = re.search(r"Pilot (\d+)", text)
            p, (b, h, s), a = int(pm.group(1)) if pm else core()["pilot"][size], chassis[size], 0
            text = re.sub(r"Pilot \d+", "", text)
        flying = any(c.lower() == "flying" for c in clauses(text))
        ground = s // 2 if flying else s
        # the nearest chassis; on a tie (sports car and chopper share stats) the one the name says
        vehicle = min(chassis, key=lambda c: (abs(chassis[c][0] - b) * 3 + abs(chassis[c][1] - h) + abs(chassis[c][2] - ground),
                                              c not in slug(name)))
        cb, ch, cs = chassis[vehicle]
        vfx = [("pilot-plus", None, None, None)] * max(0, p - core()["pilot"][vehicle]) + [("vehicle-armor", None, None, None)] * a
        vfx += [("handling-plus", None, None, None)] * max(0, h - ch) + [("speed-plus", None, None, None)] * max(0, ground - cs)
        if flying:
            vfx.append(("flying", None, None, None))
        cls = [c for c in clauses(text) if c.lower() != "flying"]
    choose = re.search(r"\(choose (\d) out of", text)
    if choose:  # mentor spirits: RR 1 on two of the listed skills/specs
        fx, narrative = [("rr-spec", "", None, "choose from the list")] * int(choose.group(1)), [text]
    else:
        fx, narrative = map_clauses(mapper, clauses(text) if cls is None else cls)
    fx = vfx + fx
    refs = [f[0] for f in fx]
    for lvl, pre in (("init-3", "init-2"), ("init-2", "init-1"), ("vr-hot", "vr-cold")):
        if lvl in refs and pre not in refs:
            fx.insert(0, (pre, None, None, None))
            refs.insert(0, pre)
    computed = reconcile(fx, narrative, core()["base"][atype], rating)
    return {"id": slug(name), "name": name, "type": atype, "rating": rating, "page": page, "item": item,
            "vehicle": vehicle, "mod": False, "text": text.strip(" ,;"), "computed": computed, "fx": fx}


def amps_and_gear(md, mapper):
    """Amp rows (dicts for build_amp's shape) and plain gear rows from every box's bold entries."""
    amps, gear = [], []
    for page, title, body in boxes(md):
        text = _join(body)
        es = entries(text)
        for k, (name, paren, rest) in enumerate(es):
            if re.fullmatch(r"[Ee]quipment, .*", paren):
                gear.append({"name": name, "page": page, "category": title.capitalize(), "text": rest})
                continue
            mod, a = re.search(r"Amp Rating ([+-]\d+)", paren), AMP.search(paren)
            if mod and "CYBERDECK" in title:  # deck programs and components: add-ons to a cyberdeck Amp
                fx, narrative = map_clauses(mapper, clauses(rest))
                rating = int(mod.group(1))
                amps.append({"id": "mod-" + slug(name), "name": name, "type": "cyberdeck", "rating": rating, "page": page,
                             "item": "", "vehicle": None, "mod": True, "text": rest, "fx": fx,
                             "computed": reconcile(fx, narrative, 0, rating, negative_ok=rating < 0)})
                continue
            if not a or a.group("kind").lower() not in KIND:
                continue
            atype = KIND[a.group("kind").lower()]
            if atype == "quality":  # a mentor spirit: its "Similar Archetypes" label, before the next entry with a paren
                nxt = next(((n, r) for n, p, r in es[k + 1:] if n == "Similar Archetypes" or p), (None, None))
                if nxt[0] == "Similar Archetypes":
                    name = f"{name} Mentor Spirit {nxt[1].replace(',', '')}"
            amps.append(build_amp(mapper, name, atype, int(a.group("rating")), (a.group("wtype") or "").strip(),
                                  _cost(paren), rest, page))
        # prose that rules named substances plain equipment ("**A** and **B** are always equipment")
        for m in re.finditer(r"\*\*([^*]+)\*\*(?: and \*\*([^*]+)\*\*)? (?:is|are) always equipment", text):
            gear += [{"name": n[:1].upper() + n[1:], "page": page, "category": title.capitalize(), "text": ""}
                     for n in m.groups() if n]
    return amps, gear


def _story(text):
    """(name, role) from a pregen's story page: the name line in small caps ("TeST RiGGER"), then the role in bold
    on one or two lines."""
    m = re.search(r"^([^\W\d][\w ]+)\n((?:\*\*.+\*\*\n)+)", text, re.M)
    if not m:
        return "Runner", ""
    return m.group(1).strip().title(), " ".join(re.findall(r"\*\*(.+?)\*\*", m.group(2)))


def _paren(text, i):
    """The balanced "(…)" opening at text[i], without its parentheses."""
    depth = 0
    for k in range(i, len(text)):
        depth += (text[k] == "(") - (text[k] == ")")
        if depth == 0:
            return text[i + 1:k]
    return text[i + 1:]


def _priced(paren):
    """"0 for the base, 4 for Risk Reduction 2 on A (x) Tests, and 2 to sustain …" -> the parts that cost
    points, as effect lines ("RR 2 on A (x) Tests", "sustain …")."""
    out = []
    for part in _parts(paren):
        m = re.match(r"([1-9]\d*) (?:for|to) (.+)", part)
        if m:
            out.append(re.sub(r"\bRR (\d) for\b", r"RR \1 on", m.group(2).replace("Risk Reduction", "RR")))
    return out


def creation_example(text, rules, spell_names):
    """The character creation example box -> (name, block in parse_statblock's shape), or None when the prose
    doesn't name the runner and all five attributes. It prints the attributes, skills, each Amp's rating with
    what its points buy, armor, weapon and spells; no pools."""
    who = re.search(r"wants (\w+), (?:his|her|their) character", text)
    words = {"str": "Strength", "agi": "Agility", "wil": "Willpower", "log": "Logic", "cha": "Charisma"}
    attrs = {k: int(m.group(1)) for k, w in words.items() if (m := re.search(rf"\b{w} (\d)\b", text))}
    if not who or len(attrs) < len(words):
        return None
    skills = []
    for info in rules["skills"].values():
        m = re.search(rf"\b{re.escape(info['name'])} (\d)(?: \(([^()]+?) \+2\))?", text, re.I)
        if not m:
            continue
        up = re.search(rf"increase {re.escape(info['name'])} from \d to (\d)", text, re.I)
        r, a = int(up.group(1) if up else m.group(1)), info["attr"]
        spec = [{"name": m.group(2), "plus2": True, "attr": a, "dp": r + 2 + attrs[a], "rr": None}] if m.group(2) else []
        skills.append((m.start(), {"name": info["name"], "rating": r, "attr": a, "dp": r + attrs[a], "rr": None, "specs": spec}))

    amps = []

    def amp(nm, atype, rating, lines):
        amps.append({"name": nm, "type": atype, "ess": None, "rating": int(rating), "count": 1, "lines": lines})
    m = re.search(r"Awakened abilities.*?spends (\d+) points \(", text)
    if m:
        amp("Awakened", "Awakened", m.group(1), [_paren(text, m.end() - 1)])
    m = re.search(r"picks (\w+) as a mentor spirit at rating (\d+) \(", text)
    if m:
        amp(f"{m.group(1)} mentor spirit", "Quality", m.group(2), _priced(_paren(text, m.end() - 1)))
    for m in re.finditer(r"picks an? ([a-z ]+?), an? rating (\d+) Amp \(", text):
        amp(m.group(1).capitalize(), "Equipment", m.group(2), _priced(_paren(text, m.end() - 1)))
    m = re.search(r"(\d+) points are used for one contact: ([^(]+?) \(", text)
    if m:
        amp(re.sub(r", an? ", ", ", m.group(2)), "Contact", m.group(1), _priced("1 for " + _paren(text, m.end() - 1)))

    armor = [{"name": a.capitalize(), "armor": n, "l": 0} for a, n in re.findall(r"\ban? ([a-z ]+?) \(Armor (\d)\)", text)]
    weapons = [{"name": w.capitalize(), "kind": w.split()[-1], "dv": "", "ranges": "", "count": 1, "notes": []}
               for w in re.findall(r"\ban? ([a-z ]+?) \(standard weapon\)", text)]
    picks = text[text.find(" spells:"):] if " spells:" in text else ""  # the spells are listed after "… spells:"
    firsts = Counter(n.split()[0] for n in spell_names)
    spells = set()
    for n in spell_names:  # a spell by its name, or by a first word no other spell starts with ("Lightning,")
        w = n.split()[0]
        m = re.search(rf"\b{re.escape(n)}\b", picks) or (
            re.search(rf"\b{re.escape(w)}(?=[,;.])", picks) if " " in n and firsts[w] == 1 else None)
        if m:
            spells.add((m.start(), m.group(0)))
    gear = [g[:1].upper() + g[1:] for g in re.findall(r"\badds some ([a-z ]+?)\.", text)]  # "adds some reagents"

    def listed(label):  # "Keywords: A, B, and C." / "Dispositions, he chose: A, B, which …, and C."
        m = re.search(rf"{label}[^:.]*: (.+?)\.", text)
        return [p[:1].upper() + p[1:] for p in _parts(m.group(1)) if not p.startswith("which")] if m else []
    return who.group(1), {"keywords": listed("Keywords"), "skills": [x for _, x in sorted(skills, key=lambda t: t[0])],
                  "weapons": weapons, "armor": armor, "dispositions": listed("Dispositions"), "cues": [],
                  "spells": [n for _, n in sorted(spells)], "forms": [], "amps": amps, "equipment": gear, "attributes": attrs, "knowledge": []}


def sample_runners(md, spell_names, pdf=None):
    """(samples, report rows): the character creation example box, then each pregen's stat page (the page with the
    SHADOW AMPS header; the story page before it gives the name and role, and the page the runner is cited to).
    pdf: the book's PDF (pdfplumber), when the import has it: the stat page's dispositions and cues come from its layout."""
    parts = re.split(r"<!-- page (\d+) -->", md)
    pages = {int(parts[i]): parts[i + 1] for i in range(1, len(parts), 2)}
    rules = statblock.load_rules()
    updated = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    spell_ids = {statblock._norm(n): f"{ID.lower()}.spell-{slug(n)}" for n in spell_names}  # scoped as run() scopes them
    samples, report, sheets = [], [], []
    for page, title, body in boxes(md):
        example = creation_example(_join(body), rules, spell_names) if title == "CHARACTER CREATION EXAMPLE" else None
        if example:
            name, block = example
            s, rows = statblock.sample(block, rules, ID, name, "Character creation example", page,
                                       f"Character creation example. CRB p.{page}.", updated, samples, spell_ids)
            samples.append(s)
            sheets.append((page, block))
            report += [r for r in rows if r["kind"] in ("amp", "unmatched-item")]  # no pools, thresholds or Essence printed
    for n, text in sorted(pages.items()):
        if not re.search(r"^SHADOW AMPS ESSENCE RATING", text, re.M):
            continue
        name, role = _story(pages.get(n - 1, ""))
        page = n - 1 - PAGE_OFFSET
        block = statblock.crb_statblock(text)
        if pdf is not None and n <= len(pdf.pages):  # the Markdown's page n is the PDF's
            block.update({k: v for k, v in statblock.pdf_narrative(pdf.pages[n - 1]).items() if v})
        s, rows = statblock.sample(block, rules, ID, name, role, page, f"{role}. CRB p.{page}.", updated, samples, spell_ids)
        samples.append(s)
        sheets.append((page, block))
        report += rows
    return samples, report, sheets


def sheet_amps(sheets, rows, rules):
    """Amps the rulebook prints only on a runner's sheet (a pregen or the creation example; Concealment on Hercules'):
    each one whose type and name no box amp has becomes a catalog amp in build_amp's shape, from its first sheet, with
    the effects the sample runner gets. Names match as statblock.catalog_id matches them ("Raccoon mentor spirit" is
    the box's Raccoon entry) or as the same words in any order, plural or not ("Aluminum Bone Lacings"; a "Cybernetic
    Arm" is a cyberarm). Skipped: metatype traits, the Awakened amp and contacts (the runner's own magic and people,
    not catalog entries)."""
    mapper = Mapper({**rules["specs"], **statblock.SPEC_NAMES})
    # ponytail: exact / unique-prefix / word-bag (any order, plural or not) matching, and no report row when a sheet
    # name is close to a box name but doesn't match; revisit if a book update brings a genuine near-duplicate name
    known, bags, out = {}, set(), []  # known: type -> normalized name -> amp id

    def bag(atype, name):
        # the sheets say "Cybernetic Arm", the cyberware box "cyberarm"
        return atype, frozenset(w.rstrip("s") for w in statblock._norm(name).replace("cybernetic arm", "cyberarm").split()
                                if w not in ("a", "an", "the"))
    for r in rows:
        known.setdefault(r["type"], {})[statblock._norm(r["name"])] = r["id"]
        bags.add(bag(r["type"], r["name"]))
    for page, block in sheets:
        for a in block["amps"]:
            if a["type"].lower() in statblock.METATYPES:
                continue
            atype, fx, _, vehicle, computed = statblock.map_amp(a, rules, mapper, True, catalog=True)
            if atype in (None, "awakened", "contact") or bag(atype, a["name"]) in bags \
                    or statblock.catalog_id(a["name"], known.get(atype, {})):
                continue
            known.setdefault(atype, {})[statblock._norm(a["name"])] = slug(a["name"])
            bags.add(bag(atype, a["name"]))
            # the sheet's line text stays out of the overlay: a narrative effect balances the printed rating
            fx = [("narrative", "", None, "balances printed rating") if f[0] == "narrative" else
                  ("weapon-mount", "", *f[2:]) if f[0] == "weapon-mount" else f for f in fx]
            item = ""
            if atype == "equipment":  # a sheet weapon the amp's name starts or ends with is its base item
                n = statblock._norm(a["name"])
                w = next((w for w in block["weapons"] if w["kind"] and (n.startswith(statblock._norm(w["name"]) + " ")
                                                                         or n.endswith(" " + statblock._norm(w["name"])))), None)
                rng = re.sub(r"[�–—]", "-", w["ranges"]).replace("Dis.", "Dis") if w else ""
                item = f'<item kind="weapon"{attr("dv", w["dv"])}{attr("ranges", rng)}/>' if w else '<item kind="gear"/>'
            out.append({"id": slug(a["name"]), "name": a["name"], "type": atype, "rating": a["rating"], "page": page,
                        "item": item, "vehicle": vehicle, "mod": False, "text": "; ".join(a["lines"]), "computed": computed, "fx": fx})
    return out


# The book's optional rules, the seeds of the app's Table rules (a GM switches them on): id, name, page. Names and pages
# are facts; each description goes to the private texts. `where` finds it: ("box", title, first line) for a box, or
# ("prose", pattern) for a paragraph of body text.
OPTIONAL = (
    ("optional-extended-social-tests", "Extended social tests", 139, ("box", "OPTIONAL RULES:", "EXTENDED SOCIAL TESTS")),
    ("optional-vehicle-damage-for-all", "Vehicle and drone damage for characters, critters and devices", 68,
     ("prose", re.compile(r"\boptionally\b.*\brules for vehi"))),
    ("optional-planning-pool", "Planning pool or personal Edge", 80, ("box", "PLANNING POOL", "OR PERSONAL EDGE?")),
)


def _paragraph(md, pattern):
    """(printed page, text) of the body paragraph whose line matches `pattern`, or None. A run-in label the converter
    set on its own line ("**Note:**") is dropped. The paragraph ends at a short line ending a sentence."""
    lines, page = md.splitlines(), 0
    for i, line in enumerate(lines):
        m = re.match(r"<!-- page (\d+) -->", line)
        if m:
            page = int(m.group(1)) - PAGE_OFFSET
        elif pattern.search(line):
            out = []
            # ponytail: "short line ending in a period" ends the paragraph; a real paragraph break would need the layout
            for l in lines[i:i + 15]:
                if re.fullmatch(r"\*\*[^*]+:\*\*", l.strip()):
                    continue
                out.append(l.strip())
                if l.rstrip().endswith(".") and len(l.strip()) < 45:
                    break
            return page, _join(out)
    return None


def optional_rules(md):
    """[(id, name, page, text)]: the optional rules; the page the book prints when it's found (else the known page) and
    its description ("" when not found)."""
    found = {(t, b[0].strip()): (p, _join(b[1:])) for p, t, b in boxes(md) if b}
    out = []
    for oid, name, page, where in OPTIONAL:
        hit = found.get(where[1:]) if where[0] == "box" else _paragraph(md, where[1])
        out.append((oid, name, *(hit or (page, ""))))
    return out


def extract(md, ctx=None):
    """Spells, amps, gear and sample runners (overlay), and the core files (Result.core). The amps and runners are read
    with the core files this book gives; a core table it can't read comes from the core already in place, if any."""
    from importer.recipes import crb_core
    core, core_texts, report = crb_core.build(md)
    with tempfile.TemporaryDirectory() as tmp:
        for name, xml in core.items():
            Path(tmp, name).write_text(xml, encoding="utf8")
        missing = [f"{n}.xml" for n in CORE_FILES if f"{n}.xml" not in core]
        found = {name: find_core_file(name) for name in missing}
        if not all(found.values()):  # a table neither this book nor the core in place has
            report.append({"kind": "amps-skipped", "problem": "no core data to read the amps and sample runners with (missing: "
                           + ", ".join(n for n, p in found.items() if not p) + "); import the book again once the core tables are in place"})
            return _spells_only(md, core, core_texts, report)
        for path in found.values():
            shutil.copy(path, tmp)
        with use_core(tmp), _pdf((ctx or {}).get("pdf")) as pdf:
            res = _extract(md, report, pdf=pdf)
    res.core, res.core_texts = core, core_texts
    return res


def _spells_only(md, core, core_texts, report):
    res = _extract(md, report, spells_only=True)
    res.core, res.core_texts = core, core_texts
    return res


@contextlib.contextmanager
def _pdf(path):
    """The book's PDF, open (pdfplumber), or None without one (an import from Markdown)."""
    if not path or not os.path.isfile(path):
        yield None
        return
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        yield pdf


def _extract(md, report, spells_only=False, pdf=None):
    spells, amps, gear, texts, ids = [], [], [], [], set()
    spell_list = spell_rows(md)
    for page, fam, names, text in spell_list:
        for name in names:
            sid = "spell-" + slug(name)
            spells.append(f'  <item id="{sid}" kind="spell" category="{fam}" source="{ID}" page="{page}">'
                          f'<name>{escape(name)}</name><text></text></item>')
            texts.append(f'  <text of="items" id="{sid}">{escape(text)}</text>')

    def uid(base):
        i, s = 1, base
        while s in ids:
            i += 1
            s = f"{base}-{i}"
        ids.add(s)
        return s

    mapper = Mapper({} if spells_only else load_skills(dhsa_specs=False)[1])
    rows, items, samples, sample_rows = [], [], [], []
    if not spells_only:
        rows, items = amps_and_gear(md, mapper)
        samples, sample_rows, sheets = sample_runners(md, [n for r in spell_list for n in r[2]], pdf)
        rows += sheet_amps(sheets, rows, statblock.load_rules())
    for r in rows:
        aid = uid(r["id"])
        if r["computed"] != r["rating"]:
            report.append({"kind": "rating-mismatch", "id": aid, "page": r["page"], "type": r["type"],
                           "printed": r["rating"], "computed": r["computed"]})
        fx = "".join(f'<effect ref="{f[0]}"{attr("param", f[1])}{attr("value", f[2])}{attr("note", f[3])}/>' for f in r["fx"])
        amps.append(f'  <amp id="{aid}" type="{r["type"]}" printedRating="{r["rating"]}"{attr("vehicle", r["vehicle"])}'
                    f'{attr("mod", "true" if r["mod"] else "")} source="{ID}" page="{r["page"]}"><name>{escape(r["name"])}</name>'
                    f'{r["item"]}{fx}<narrative></narrative></amp>')
        if r["text"]:
            texts.append(f'  <text of="amps" id="{aid}">{escape(r["text"])}</text>')
    for g in items:
        gid = uid("gear-" + slug(g["name"]))
        gear.append(f'  <item id="{gid}" kind="gear" category="{escape(g["category"])}" source="{ID}" page="{g["page"]}">'
                    f'<name>{escape(g["name"])}</name><text></text></item>')
        if g["text"]:
            texts.append(f'  <text of="items" id="{gid}">{escape(g["text"])}</text>')
    rules = []
    for oid, name, page, text in optional_rules(md):
        rules.append(f'  <rule id="{oid}" sheet="optional" section="Optional rule" source="{ID}" page="{page}">'
                     f'<title>{escape(name)}</title><text></text></rule>')
        if text:
            texts.append(f'  <text of="rules" id="{oid}">{escape(text)}</text>')
    report += [{"kind": "unresolved-spec", "spec": s} for s in sorted(set(mapper.unresolved))]
    report += sample_rows

    def data(kind, comment, entries):
        return ('<?xml version="1.0" encoding="UTF-8"?>\n'
                f"<!-- {comment} Generated by the importer (recipe crb) from the Anarchy 2.0 core rulebook. -->\n"
                f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n' + "\n".join(entries) + "\n</ca2:data>\n")
    files = {"spells.xml": data("spells", "Spells.", spells),
             "amps.xml": data("amps", 'Prebuilt Shadow Amps and add-on mods (mod="true"); texts in custom/texts/crb.xml.', amps),
             "gear.xml": data("gear", "Plain equipment (not Amps).", gear),
             "rules-optional.xml": data("rules", "The book's optional rules (the app's Table rules); texts in custom/texts/crb.xml.", rules)}
    return Result(files=files, texts=data("texts", "PRIVATE: book text. Do not commit.", texts), samples=samples, report=report,
                  source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON})
