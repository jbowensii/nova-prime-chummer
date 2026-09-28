"""Quick-reference sheets (Base, Magic, Matrix, Vehicles; design by felipedaen) -> rules.

Each sheet is its own PDF, so each upload yields rules-<sheet>.xml; the texts go to the shared
texts file. Reads the converter's Markdown: "#" page titles, sub-heads as "##" or all-caps lines,
"•" bullets, bold runs as **…**. A line opening with a bold "Title:" starts a rule (sub-bullets are
printed regular); untitled lines under a sub-head form one rule named after it.
"""
import os
import re
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

from importer.recipes import Result

ID, NAME, PUBLISHER, CANON = "QREF", "Quick reference sheets: Base, Magic, Matrix, Vehicles", "felipedaen", False

# first word of the page title -> sheet id
SHEETS = {"rules": "base", "base": "base", "magic": "magic", "matrix": "matrix", "vehicle": "vehicles", "vehicles": "vehicles"}
# rule title (lowercase) -> amp effects it explains; shown as hover help on those effects
EFFECTS = {
    "vr cold-sim": "vr-cold", "vr hot-sim": "vr-hot", "captain’s chair": "rcc", "jump in": "vcr",
    "astral perception": "awk-astral-perception", "astral projection": "awk-astral-projection",
    "sustained spell (s)": "sustain-spell", "summoning": "summon-spirit awk-conjuring", "spellcasting": "awk-sorcery",
    "firewall": "firewall-plus", "risk reduction (rr)": "rr-skill rr-spec rr-attr",
    "extra action": "init-1 init-2 init-3",
}
TITLE_RE = re.compile(r"#\s*(\w+)\s+quick\s+reference", re.I)
BULLET = re.compile(r"[•\-]\s+(.*)")
# a rule starts with a bold run-in title: "• **Title:** text" (numbered steps "**1. Step:**" are not titles)
TITLED = re.compile(r"(?:[•\-]\s+)?\*\*(?!\d+\.)([^*]+?):?\*\*:?\s*(.*)")


def slug(s):
    s = s.lower().replace("’", "").replace("'", "")
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:50]


def sheet_of(md):
    m = TITLE_RE.search(md)
    return SHEETS.get(m.group(1).lower()) if m else None


def match(meta, md_head):
    return 0.9 if sheet_of(md_head) else 0.0


def _subhead(t):
    m = re.match(r"#{2,3}\s+(.+)", t)
    if m:
        return m.group(1)
    if len(t) <= 40 and ":" not in t and re.search(r"[A-Z]{2}", t) and t == t.upper() and not BULLET.match(t):
        return t
    return None


def clean(s):
    return re.sub(r"\s+", " ", s.replace("**", "")).strip()


def extract_sheet(sheet, md):
    rules, ids, section, page, cur = [], set(), "", 1, None

    def add(title, text):
        rid = base = f"{sheet}-{slug(title)}"
        n = 2
        while rid in ids:
            rid, n = f"{base}-{n}", n + 1
        ids.add(rid)
        r = {"id": rid, "title": title, "section": section, "page": page, "effects": EFFECTS.get(title.lower()),
             "lines": [text] if text else []}
        rules.append(r)
        return r

    for t in (ln.strip() for ln in md.splitlines()):
        if not t or clean(t).lower().lstrip("•- ").startswith("design by"):
            continue
        m = re.match(r"<!-- page (\d+) -->", t)
        if m:
            page = int(m.group(1))
            continue
        if re.match(r"# (?!#)", t):  # each printed page repeats the sheet title
            continue
        head = _subhead(clean(t))
        if head:
            section, cur = head.title(), None
            continue
        m = TITLED.match(t)
        if m:
            cur = add(clean(m.group(1)).rstrip(":"), clean(m.group(2)))
        elif cur is not None:  # sub-bullet or continuation of the current rule
            cur["lines"].append(clean(t))
        else:  # untitled lines under a sub-head (numbered steps): one rule named after the section
            cur = add(section, clean(t))
    for r in rules:
        r["text"] = " ".join(r.pop("lines"))
    return rules


def title_report(sheet, titles, previous):
    """Report rows for titles that differ from the previous import of this sheet (`previous`: its
    rules-<sheet>.xml path, or None). First import: no rows."""
    if not previous or not os.path.exists(previous):
        return []
    known = [r.findtext("title") for r in ET.parse(previous).getroot() if r.tag == "rule"]
    rows = [{"kind": "title-missing", "sheet": sheet, "title": t} for t in known if t not in titles]
    return rows + [{"kind": "title-new", "sheet": sheet, "title": t} for t in titles if t not in known]


def extract(md, ctx=None):
    """ctx: optional {"previous_dir": custom/imported/qref/} so a re-import reports changed titles."""
    sheet = sheet_of(md)
    rules = extract_sheet(sheet, md)
    prev_dir = (ctx or {}).get("previous_dir")
    report = title_report(sheet, [r["title"] for r in rules], prev_dir and os.path.join(prev_dir, f"rules-{sheet}.xml"))
    entries = [f'  <rule id={quoteattr(r["id"])} sheet={quoteattr(sheet)} section={quoteattr(r["section"])}'
               + (f' effects={quoteattr(r["effects"])}' if r["effects"] else "")
               + f' source="{ID}" page="{r["page"]}"><title>{escape(r["title"])}</title><text></text></rule>' for r in rules]
    texts = [f'  <text of="rules" id={quoteattr(r["id"])}>{escape(r["text"])}</text>' for r in rules if r["text"]]
    head = '<?xml version="1.0" encoding="UTF-8"?>\n'
    rules_xml = (head + f"<!-- Rules reference from the {sheet} quick-reference sheet. Generated by the importer (recipe qref);\n"
                 "     the text is private (custom/texts/qref.xml); effects= links a rule to the amp effects it explains. -->\n"
                 '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="rules" version="1">\n' + "\n".join(entries) + "\n</ca2:data>\n")
    texts_xml = (head + '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="texts" version="1">\n'
                 + "\n".join(texts) + "\n</ca2:data>\n")
    return Result(files={f"rules-{sheet}.xml": rules_xml}, texts=texts_xml, report=report, source={"id": ID, "name": NAME, "publisher": PUBLISHER, "canon": CANON})
