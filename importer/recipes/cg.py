"""Shadowrun Anarchy 2.0 Conversion Guide v1.1 -> technomancer complex forms (items), a rules
reference (rules-technomancers.xml), the Tasking skill and Emerged amp type (skills.xml, amptypes.xml), and the
complex-form price (pricing.xml, a partial <prices> overlay). The SR6/SRA conversion chapters (tests, NPCs, attributes)
are out of scope; only the Technomancers section is imported (controller ruling, Task 9d).

Reads the converter's Markdown. The book's margin tab (the vertical "SHADOWRUN & ANARCHY" spelled
down the page edge) glues onto real lines the same way CRB's does: lone one-letter lines, and a
letter glued to a line's start or end (`clean_lines`, `TAB`/`_LONE`/`_LEAD`/`_TRAIL`).

Two independent passes over the same cleaned lines:
  - `extract_rules`: prose between the known headings (Born Technomancer, Complex Forms, Sprites,
    and the five sprite types), stopping at the first table row (the printed rules, not a stat/item
    table). "Complex Forms" heading is glued to the following column's text by the two-column
    layout ("COMPLEX FORMS technomancy-related..."); the recipe still recognises it via a prefix
    match and keeps whatever prose follows.
  - `extract_forms`: the "COMPLEX FORMS" table itself, spanning printed pp.9-10. Rows are either
    clean pipe-table rows (4 cells: name/type/threshold/notes) or, where the two-column layout
    breaks a row into plain text, "Name I|S rest..." lines. Three names wrap onto the next physical
    line the same way CRB's spell names do (its second word arrives first on the continuation
    line); `NAME_WRAP` pins those three book-specific wraps rather than solving column order
    generally (a converter change here would need CG-specific handling regardless, per the ruling
    that already put CRB's margin-tab stripping in its own recipe).
"""

import re
from xml.sax.saxutils import escape

from importer.recipes import Result
from importer import NoCoreData
from importer.recipes.amps import Mapper, fx_xml, item_effects, load_skills, slug

ID, NAME, PUBLISHER, CANON = "CG", "Shadowrun Anarchy 2.0 Conversion Guide v1.1", "Catalyst Game Labs", True
SHA256 = ("502259843b7a5645d684b8f8312db7b9baeac669c0bb5912e5debd44746b9876",)  # the owner's v1.1 PDF
SHEET = "technomancers"

HEADS = [
    "BORN TECHNOMANCER",
    "COMPLEX FORMS",
    "SPRITES",
    "COURIER SPRITE",
    "CRACK SPRITE",
    "DATA SPRITE",
    "FAULT SPRITE",
    "MACHINE SPRITE",
]

# margin tab letters, glued to real lines the way CRB's are (see importer/recipes/common.py strip_tab);
# unique letters of "SHADOWRUN & ANARCHY" as printed down the page edge, minus "A" for leading strips
# only (real sentences start "A character..."; a solo "A" line or one trailing " A" is still furniture)
TAB = "hS&ycrAndowu"
_LEAD_TAB = TAB.replace("A", "")
_LONE = re.compile(rf"^[{re.escape(TAB)}]$")
_LEAD = re.compile(rf"^[{re.escape(_LEAD_TAB)}] (?=[A-Za-z])")
_TRAIL = re.compile(rf" [{re.escape(TAB)}]$")
_DECOR = re.compile(r"\*\*(?:\d+|[A-Z ]+)\*\*")  # a running head or bare page number, its own line

# a CG-specific two-column layout quirk: these names wrap, second word first on the next line
NAME_WRAP = {"Arc": "feedback", "Infusion of": "Firewall", "Resonance": "spike"}
NEW_FORM = re.compile(r"^([A-Z][a-z]+(?:\s(?:of|[a-z]+)){0,2})\s+([IS])\s+(.+)$")


def match(meta, md_head):
    """How well a book's head fits this recipe: 1.0 by its hash, 0.9 for Other Editions of Shadowrun, else 0.0."""
    if meta.get("sha256") in SHA256:
        return 1.0
    return 0.9 if re.search(r"other editions", md_head, re.I) and re.search(r"shadowrun", md_head, re.I) else 0.0


def clean_lines(md):
    """[(printed page, line)] with the margin tab stripped; decorative running heads/page numbers dropped."""
    page, out = 0, []
    for raw in md.splitlines():
        m = re.match(r"<!-- page (\d+) -->", raw)
        if m:
            page = int(m.group(1))
            continue
        l = raw.strip()
        if not l or _LONE.match(l) or _DECOR.fullmatch(l):
            continue
        l = _TRAIL.sub("", _LEAD.sub("", l))
        if l:
            out.append((page, l))
    return out


def _match_head(l):
    for h in HEADS:
        if l == h or l.startswith(h + " "):
            return h
    return None


def _looks_like_heading(l):
    return len(l) <= 30 and l == l.upper() and re.search(r"[A-Z]{3}", l) and not re.search(r"\d", l)


def extract_rules(lines):
    """{title, page, text} for each of the eight tracked headings' prose, up to its first table row."""
    rules, cur = [], None
    for page, l in lines:
        h = _match_head(l)
        if h:
            # pylint: disable-next=unsubscriptable-object  # (cur is None only before the first heading)
            if cur and cur["text"]:
                rules.append(cur)
            cur = {"title": h.title(), "page": page, "text": []}
            rest = l[len(h) :].strip()
            if rest:
                cur["text"].append(rest)
            continue
        if cur is None:
            continue
        if l.startswith("|") or _looks_like_heading(l):
            if cur["text"]:
                rules.append(cur)
            cur = None
            continue
        cur["text"].append(l)
    if cur and cur["text"]:
        rules.append(cur)
    return [{"title": r["title"], "page": r["page"], "text": " ".join(r["text"]).strip()} for r in rules]


def extract_forms(lines):
    """[{name, type ("I"/"S"), page, text}] from the COMPLEX FORMS table (pp.9-10)."""
    forms, cur, wrap, active = [], None, None, False
    for page, l in lines:
        if l.startswith("COMPLEX FORMS"):
            active, cur, wrap = True, None, None
            l = l[len("COMPLEX FORMS") :].strip()
            if not l:
                continue
        elif l.startswith("SPRITES"):
            active = False
        if not active:
            continue
        if l.startswith("|"):
            cells = [re.sub(r"\*\*", "", c.replace("<br>", " ")).strip() for c in l.strip("|").split("|")]
            wrap = None
            if len(cells) >= 4 and cells[1] in ("I", "S"):
                body = f"Threshold: {cells[2]}. {cells[3]}" if cells[2] else cells[3]
                cur = {"name": cells[0], "type": cells[1], "page": page, "text": body}
                forms.append(cur)
            continue
        m = NEW_FORM.match(l)
        if m:
            name, ftype, rest = m.groups()
            cur = {"name": name, "type": ftype, "page": page, "text": rest}
            forms.append(cur)
            wrap = NAME_WRAP.get(name)
            continue
        if cur is None:
            continue
        if wrap and l.split(" ", 1)[0] == wrap:
            cur["name"] += " " + wrap
            rest = l[len(wrap) :].strip()
            if rest:
                cur["text"] += " " + rest
            wrap = None
            continue
        wrap = None
        cur["text"] += " " + l
    return forms


# the Tasking skill's specializations: the Anarchy 2.0 column of the conversion table under TASKING (its three columns
# come apart in the converter). The skill uses Logic, as the complex form rules roll it (p.9).
TASKING_SPECS = (
    ("complex-forms", "Complex forms"),
    ("compiling", "Compiling"),
    ("decompiling", "Decompiling"),
)  # vocabulary
TASKING_ATTR = "log"


def mechanics(lines):
    """(skills entries, amptypes entries): the Tasking skill (the TASKING heading's page) and the Emerged amp type
    ("Emerged Shadow Amp (rank N, …)"), which the core rulebook doesn't have. Empty when the book doesn't print them."""
    tasking = next((p for p, l in lines if l == "TASKING"), None)
    emerged = next(((p, m[1]) for p, l in lines if (m := re.search(r"Emerged Shadow Amp \(rank (\d+)", l))), None)
    skills = (
        [
            f'  <skill id="tasking" attr="{TASKING_ATTR}" requires="emerged" source="{ID}" '
            f'page="{tasking}"><name>Tasking</name>'
            + "".join(f'<spec id="tasking.{i}" attr="{TASKING_ATTR}">{n}</spec>' for i, n in TASKING_SPECS)
            + "</skill>"
        ]
        if tasking
        else []
    )
    types = (
        [
            f'  <amptype id="emerged" base="{emerged[1]}" essence="0" source="{ID}" '
            f'page="{emerged[0]}"><name>Emerged</name></amptype>'
        ]
        if emerged
        else []
    )
    return skills, types


COST = re.compile(r"Complex forms cost ([\d,]+)\s*¥")


def complex_form_price(lines):
    """(page, nuyen) of the book's complex-form price ("Complex forms cost N¥ to learn"), or None when it isn't
    printed."""
    return next(((p, int(m[1].replace(",", ""))) for p, l in lines if (m := COST.search(l))), None)


def extract(md, _ctx=None):
    """The files the CG recipe reads from the book's markdown: its rules, complex forms and skill rows."""
    lines = clean_lines(md)
    rules, forms = extract_rules(lines), extract_forms(lines)
    skill_rows, type_rows = mechanics(lines)
    price = complex_form_price(lines)

    items, texts, ids = [], [], set()
    try:  # the core skills name the Tests a form's effects are on; none yet: custom ones
        mapper = Mapper(load_skills()[1])
    except NoCoreData:
        mapper = Mapper({})
    for f in forms:
        base = "cf-" + slug(f["name"])
        fid, n = base, 2
        while fid in ids:
            fid, n = f"{base}-{n}", n + 1
        ids.add(fid)
        category = "sustained" if f["type"] == "S" else "instant"
        text = f'{f["type"]}. {f["text"]}'.strip()
        items.append(
            f'  <item id="{fid}" kind="complex-form" category="{category}" source="{ID}" page="{f["page"]}">'
            f'<name>{escape(f["name"])}</name>{fx_xml(item_effects(mapper, f["text"], f["type"] == "S", spell=True))}<t'
            "ext></text></item>"
        )
        texts.append(f'  <text of="items" id="{fid}">{escape(text)}</text>')

    rule_entries, rule_ids = [], set()
    for r in rules:
        base = f"{SHEET}-{slug(r['title'])}"
        rid, n = base, 2
        while rid in rule_ids:
            rid, n = f"{base}-{n}", n + 1
        rule_ids.add(rid)
        rule_entries.append(
            f'  <rule id="{rid}" sheet="{SHEET}" source="{ID}" page="{r["page"]}">'
            f'<title>{escape(r["title"])}</title><text></text></rule>'
        )
        texts.append(f'  <text of="rules" id="{rid}">{escape(r["text"])}</text>')

    head = '<?xml version="1.0" encoding="UTF-8"?>\n'
    items_xml = (
        head + "<!-- Technomancer complex forms from the Conversion Guide. Generated by the importer "
        "(recipe cg); texts in custom/texts/cg.xml. -->\n"
        '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="complexforms" version="1">\n'
        + "\n".join(items)
        + "\n</ca2:data>\n"
    )
    rules_xml = (
        head + "<!-- Rules reference from the Conversion Guide's Technomancers section. Generated by "
        "the importer (recipe cg); text is private (custom/texts/cg.xml). -->\n"
        '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="rules" version="1">\n'
        + "\n".join(rule_entries)
        + "\n</ca2:data>\n"
    )
    texts_xml = (
        head
        + '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="texts" version="1">\n'
        + "\n".join(texts)
        + "\n</ca2:data>\n"
    )

    files = {"complexforms.xml": items_xml, f"rules-{SHEET}.xml": rules_xml}
    for name, kind, rows_ in (("skills.xml", "skills", skill_rows), ("amptypes.xml", "amptypes", type_rows)):
        if rows_:  # technomancy, added to the core data (the loader adds a book's skills and amp types)
            files[name] = (
                head + "<!-- Technomancy from the Conversion Guide. Generated by the importer (recipe cg). -->\n"
                f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">\n'
                + "\n".join(rows_)
                + "\n</ca2:data>\n"
            )
    report = []
    if price:  # a partial pricing overlay: the loader writes it over the core pricing (the CRB has no technomancers)
        files["pricing.xml"] = (
            head + "<!-- The complex-form price from the Conversion Guide. Generated by the importer (recipe cg). -->\n"
            '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="pricing" version="1">\n'
            f'  <prices id="complex-forms" complexForm="{price[1]}" source="{ID}" page="{price[0]}"/>\n</ca2:data>\n'
        )
    else:
        report.append(
            {"kind": "price-unread", "problem": "no complex-form price found; complex forms keep the core price"}
        )
    return Result(
        files=files,
        texts=texts_xml,
        report=report,
        source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON},
    )
