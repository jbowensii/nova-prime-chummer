"""Before the importer writes an issue it searches for the value in widening circles (the owner, phase 2C):

1. table (search.py): every table of the same book whose row names the item (its name, or a shorter printing of it:
   `Laser mic` for `Laser microphone`) and has a column for the field: a summary table, a gear list in another chapter,
   a comparison table, the implant table that prices an implant weapon;
2. text (search.py): a sentence of the same book that prints the field's value with its word (`ratings 1 to 6`,
   `Availability 4`, `costs 500¥`): the item's own description first, then the text of the heading it is printed under,
   then any sentence naming it;
3. corpus (corpus() below, after every import): every other source in the library, the latest published first:
   another book's entry of the same kind and name, a card deck's stat line, a class-price row (`Cyberprogram,
   hacking`, `Autosoft`) for the class an entry names.

A value found is written to the entry's attribute with a `<found field how source page/>` child saying where; only
when every circle fails is the issue written, with `searched="book"` (and `book,corpus` once the corpus pass has
looked too). Book values are canon: a found value is a printed one, never a guess. Several different values found in
one circle is no value (the issue stays).

Errata (corpus()): an errata PDF's statements correct its own book's entries when the errata is newer than the
printing (the owner: the version published last wins): `p. 12: Glimmer Pistol's DV is 5S(e)`, `Rating 3 Ziplenses /
Zipears: Essence 0.3, … Availability 4`, a bulleted `Name: Availability N` under a heading naming a page. The
replaced value is kept in a `<found how="errata">` child's text.

Nothing here names an item: the readers are the books' column headers and value words."""

import json
import os
import re
import sys
from pathlib import Path

from importer.sr6 import catalog, lifemodules
from importer.sr6.recipes import current, published
from importer.sr6.search import clean, good, norm

_PDFDATE = re.compile(r"(?:D:)?((?:19|20)\d\d)(\d\d)(\d\d)")
_COPYRIGHT = re.compile(r"©\s*((?:19|20)\d\d)")


def pdf_date(pdf, md_text=""):
    """A PDF's own date (YYYY-MM-DD): its metadata modification date, else its creation date, each only when it falls
    in the year its © line prints or the year after (a later date is a re-save); '' when there is none."""
    if not os.path.exists(pdf):
        return ""
    try:
        import pdfplumber

        with pdfplumber.open(pdf) as d:
            meta = d.metadata or {}
    except Exception:  # noqa: BLE001 (an unreadable PDF has no date)  # pylint: disable=broad-exception-caught
        return ""
    years = [int(y) for y in _COPYRIGHT.findall(md_text[:20000])]
    for k in ("ModDate", "CreationDate"):
        m = _PDFDATE.match(str(meta.get(k) or ""))
        if m and (not years or int(m.group(1)) in (max(years), max(years) + 1)):
            return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return ""


ERRATA_FIELDS = {
    "availability": "avail",
    "avail": "avail",
    "cost": "cost",
    "price": "cost",
    "dv": "dv",
    "damage": "dv",
    "ammo": "ammo",
    "essence": "essence",
    "capacity": "capacity",
    "modes": "modes",
    "mode": "modes",
    "ar": "ar",
    "attack ratings": "ar",
    "attack rating": "ar",
    "ar stats": "ar",
}
_BANDS = ("close", "near", "medium", "far", "extreme")
_EFIELD = "|".join(sorted((re.escape(k) for k in ERRATA_FIELDS), key=len, reverse=True))
_BOLD = re.compile(r"\*\*(.+?)\*\*")
# `p. 12: Glimmer Pistol's DV is **5S(e)**`, `p. 14: Wobble Gun has ammo **8(cy)**`, `… Near AR is changed from 18 to
# **8**`
_PAGE_STMT = re.compile(
    r"^\W*p\.\s*(\d+)\s*[:,]\s*(.+?)(?:['’]s?\s+(?:("
    + "|".join(_BANDS)
    + r")\s+)?("
    + _EFIELD
    + r")\s+(?:is|are)\s+(?:changed\s+from\s+\S+\s+to\s+)?|\s+has\s+(?:("
    + "|".join(_BANDS)
    + r")\s+)?("
    + _EFIELD
    + r")\s+)(.+?)\s*\.?\s*$",
    re.I,
)
# a bulleted `Name: Availability 2` (`Rating 3 Ziplenses / Zipears: Essence 0.3, Availability 4, Cost 9,000¥ / 8,500¥`)
_BULLET = re.compile(r"^\s*[●•*-]\s*(.+?):\s*(.+)$")
_PAIR = re.compile(
    r"(?:adds\s+)?(\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?(?:\s*/\s*\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?)*)\s+("
    + _EFIELD
    + r")\b|\b("
    + _EFIELD
    + r")\s+(\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?(?:\s*/\s*\+?\d[\d,.]*(?:\s*\(?[LIF]\)?)?\s*¥?)*)",
    re.I,
)
_GROUP_PAGE = re.compile(r"^(.*?)\s+p\.\s*(\d+)\s*$", re.I)
_CHANGE_COST = re.compile(r"\bchange\s+the\s+(cost|availability|price)\s+to\s+([\d,]+\s*¥?|\d+\s*\(?[LIF]?\)?)", re.I)
_HEAD_ITEM = re.compile(r"^#+\s*p\.\s*(\d+)\s*,\s*(.+)$", re.I)
# a renumbering: `Rather than being rating 5 and 6 cyberware as printed …, these are instead rating 6 and 7 cybereyes
# and cyberears.` (the names the statement's last words)
_RENUMBER = re.compile(
    r"\brather than being ratings? (\d+)(?:\s*(?:and|,)\s*(\d+))?\b[^.]*?,\s*(?:these|it|they) "
    r"(?:are|is) instead ratings? (\d+)(?:\s*(?:and|,)\s*(\d+))?\s+([^.]+)\.",
    re.I,
)
# a rating dropped: `Autovoice and vocal expansion no longer have ratings, and their price and Availability are always
# calculated as if they were rating 1.`
_UNRATED = re.compile(
    r"(?:^|[.!?)]\s+)([^.!?)]+?)\s+no longer ha(?:s|ve) (?:a )?ratings?\b[^.]*?\bas if (?:it|they) "
    r"(?:was|were) rating (\d+)",
    re.I,
)


def _names_of(s):
    """`cybereyes and cyberears` -> ['cybereyes', 'cyberears']."""
    return [x.strip() for x in re.split(r",\s*(?:and\s+)?|\s+and\s+", s.strip()) if x.strip()]


def _whole_statements(md):
    """The statements an errata prints as prose sentences, read over its joined lines: [(None, subject, '_renumber',
    (old, new), None)] and [(None, subject, '_unrated', rating, None)]."""
    text = " ".join(
        _BOLD.sub(r"\1", ln.strip())
        for ln in (md or "").splitlines()
        if ln.strip() and not ln.strip().startswith(("<!--", "#"))
    )
    out = []
    for m in _RENUMBER.finditer(text):
        olds, news = [x for x in (m.group(1), m.group(2)) if x], [x for x in (m.group(3), m.group(4)) if x]
        if len(olds) == len(news):
            for subj in _names_of(m.group(5)):
                out += [(None, subj, "_renumber", (int(o), int(n)), None) for o, n in zip(olds, news)]
    for m in _UNRATED.finditer(text):
        out += [(None, subj, "_unrated", int(m.group(2)), None) for subj in _names_of(m.group(1))]
    return out


def _subjects(s):
    """`Rating 3 Ziplenses / Zipears` -> ['Rating 3 Ziplenses', 'Rating 3 Zipears'] (the parts after the first
    share its leading words); `A` -> ['A']."""
    parts = [p.strip() for p in s.split("/") if p.strip()]
    if len(parts) < 2:
        return parts
    lead = parts[0].split()[:-1]
    return [parts[0]] + [p if len(p.split()) > 1 else " ".join(lead + [p]) for p in parts[1:]]


def _errata_value(field, v):
    v = _BOLD.sub(r"\1", v).strip().rstrip(".,;").strip()
    if field == "cost":
        v = re.sub(r"(?<=\d),(?=\d{3})", "", v).replace("¥", "").strip()
    return " ".join(v.split())


# an FAQ's question naming an item (`H OW DOES S TOLEN G EAR WORK ? ( P . 162)`, letter-spaced capitals) and a Karma
# statement under it (`It only ever gives a bonus of 0 Karma.`)
_QUESTION = re.compile(r"^(?:HOW DOES|HOW DO|WHAT DOES|WHAT DO)\s+(?:THE\s+|AN?\s+)?(.+?)\s+(?:WORK|DO|MEAN)\b")
_BONUS_KARMA = re.compile(r"\b(?:gives|grants|is worth) (?:a bonus of )?(\d+) Karma\b", re.I)


def _unspaced(ln):
    """`H OW DOES S TOLEN G EAR` -> `HOW DOES STOLEN GEAR` (a capital printed apart from the rest of its word)."""
    return re.sub(r"\b([A-Z]) (?=[A-Z]{2,}\b|[A-Z]\b)", r"\1", ln)


def _question_statements(md):
    """[(page, subject, 'karma', value, None)]: a Karma statement under an FAQ question naming its subject."""
    out, subj, page = [], None, None
    for raw in (md or "").splitlines():
        ln = _unspaced(_BOLD.sub(r"\1", raw.strip()))
        if not ln or ln.startswith("<!--"):
            continue
        if (m := _QUESTION.match(ln)) and ln.upper() == ln:
            subj = m.group(1).strip().title()
            p = re.search(r"\(\s*P\s*\.\s*(\d+)", ln)
            page = int(p.group(1)) if p else None
            continue
        if subj and ln.upper() == ln and len(ln) > 12:
            subj = None  # (another question or heading, naming something else)
            continue
        if subj and (k := _BONUS_KARMA.search(ln)):
            out.append((page, subj, "karma", k.group(1), None))
    return out


def errata(md):
    """The value statements of an errata's converted text: [(page or None, subject, field, value, band or None)].
    Rules and renames are left out (a person reads those)."""
    out, group_page, head = [], None, None
    for raw in (md or "").splitlines():
        ln = raw.strip()
        if not ln or ln.startswith("<!--"):
            continue
        if m := _HEAD_ITEM.match(ln):  # `#### p. 30, Rifles table, Bonk M9`
            head = (int(m.group(1)), m.group(2).split(",")[-1].strip())
            continue
        if ln.startswith("#"):
            head = None
            continue
        if m := _PAGE_STMT.match(_BOLD.sub(r"\1", ln) if "**" not in ln else ln):
            page, subj = int(m.group(1)), _BOLD.sub(r"\1", m.group(2)).strip()
            band, word = (m.group(3), m.group(4)) if m.group(4) else (m.group(5), m.group(6))
            f = ERRATA_FIELDS[word.lower()]
            val = _errata_value(f, m.group(7))
            if val and not re.search(r"\b(?:renamed|gains|loses|no independent)\b", ln, re.I):
                out.append((page, subj, f, val, band.lower() if band else None))
            continue
        if m := _GROUP_PAGE.match(_BOLD.sub(r"\1", ln)):  # `Spin Tops p. 20`
            group_page = int(m.group(2))
            continue
        if m := _BULLET.match(ln):
            subj, rest = _BOLD.sub(r"\1", m.group(1)), m.group(2)
            names = _subjects(subj)
            for pm in _PAIR.finditer(rest):
                val, word = (pm.group(1), pm.group(2)) if pm.group(2) else (pm.group(4), pm.group(3))
                f = ERRATA_FIELDS[word.lower()]
                vals = [x.strip() for x in val.split("/")] if "/" in val and len(names) > 1 else [val] * len(names)
                if re.match(
                    r"\s*adds\b", rest[max(0, pm.start() - 1) : pm.start() + 5], re.I
                ) or rest.lower().startswith("adds"):
                    vals = ["+" + v.lstrip("+") for v in vals]
                for n, v in zip(names, vals):
                    out.append((group_page, n, f, _errata_value(f, v), None))
            continue
        if head and (m := _CHANGE_COST.search(ln)):  # `Change … the cost to N¥.` under a heading naming the item
            f = ERRATA_FIELDS[m.group(1).lower()]
            out.append((head[0], head[1], f, _errata_value(f, m.group(2)), None))
    return (
        _whole_statements(md) + out + _question_statements(md)
    )  # (a renumbering first: the values that follow name the new ratings)


def _words(s):
    return set(norm(s).split())


def errata_targets(entries, page, subject):
    """The entries a statement names: the same name, else the entry whose name holds every word of the subject (on
    the statement's page when it gives one: `Hardened` among the spin tops of p. 20). One only, else none."""
    sw = _words(subject)
    flat = norm(subject).replace(" ", "")
    same = [e for e in entries if norm(subject) in {norm(n) for n in [e["name"], *e.get("aliases", ())]}]
    if not same:  # `Glo-Cam` for `GloCam (1-12)`: the words run together, a range or note after
        same = [e for e in entries if norm(re.sub(r"\s*\([^()]*\)\s*$", "", e["name"])).replace(" ", "") == flat]
    if not same:
        same = [e for e in entries if sw and sw <= _words(e["name"])]
    if page is not None and len(same) > 1:
        same = [e for e in same if e["page"] == page] or [e for e in same if abs(e["page"] - page) <= 1] or same
    return same if len(same) == 1 else []


def patch_band(ar, band, value):
    """An attack-rating string with one band (close … extreme) replaced: `1/19/11/9/6`, near, 9 -> `1/9/11/9/6`."""
    parts = (ar or "").split("/")
    i = _BANDS.index(band)
    if len(parts) != 5:
        return None
    parts[i] = value
    return "/".join(parts)


# --- the corpus pass -------------------------------------------------------------------------------------------

CARD_FIELDS = {
    "dv": "dv",
    "mode": "modes",
    "modes": "modes",
    "ammo": "ammo",
    "availability": "avail",
    "avail": "avail",
    "cost": "cost",
}
_CARD_LABEL = re.compile(r"\*\*([A-Za-z ]+):\*\*\s*(.*?)(?=\s*\*\*[A-Za-z ]+:\*\*|$)")
# the class a priced row names for every item of that class (`Cyberprogram, hacking`, `Autosoft`): kind -> (the row's
# name, from the entry's type; the words its category must hold, when the name is the bare type: `Autosoft` in the
# Software table, not a `Basic` subscription tier in another book) (the game's own words)
CLASS_ROWS = {"programs": (("cyberprogram {type}", None), ("{type}", re.compile(r"(?i)soft|program")))}
PRICED_AS = {"e-soft": "autosoft"}  # a class the game prices as another (Double Clutch: e-softs as autosofts)
FIXABLE = ("missing", "unreadable")  # (an ambiguous field is the book's own two values, or a rule)


class _Book:
    def __init__(self, book_dir, custom_dir, sources):
        from importer import xmlio

        self.dir, self.custom = book_dir, custom_dir
        imp = xmlio.read_import(book_dir)
        st = os.path.join(book_dir, "status.xml")
        self.state = xmlio.read_state(book_dir)
        self.why = (xmlio.ET.parse(st).getroot().text or "") if os.path.exists(st) else ""
        get = (lambda k: imp.get(k) or "") if imp is not None else (lambda k: "")
        self.src, self.extra = get("source").lower(), get("extra").lower().split()
        self.name, self.file = get("name"), get("file")
        self._md, self._md_path = None, os.path.join(book_dir, "book.md")
        # (a known printing whose PDF has no date: the month that printing was published, not its source's first)
        known = published(get("sha256"))
        self.current = current(get("sha256"))  # the book's Current Printing: it already incorporates its errata
        self.date = (
            pdf_date(os.path.join(book_dir, "original.pdf"), self.md[:20000])
            or (known or "")
            or sources.get(self.src.upper(), "")
        )

    @property
    def md(self):
        """The book's markdown text, read once."""
        if self._md is None:
            self._md = ""
            if os.path.exists(self._md_path):
                with open(self._md_path, encoding="utf8") as f:
                    self._md = f.read()
        return self._md


def _tail(name):
    """A source's distinctive title, letters only: `Shadowrun: Firing Squad` -> `firingsquad`."""
    t = re.sub(r"(?i)^\s*shadowrun\W*(?:sixth\s+world\W*)?", "", name or "")
    return re.sub(r"[^a-z0-9]", "", t.lower())


def cards(md):
    """A card deck's stat lines: {norm name: {field: value}} (`## zorp predator X` over `**Availability:** 2(L)
    **Cost:** 750¥`)."""
    out, name = {}, None
    for ln in (md or "").splitlines():
        if m := re.match(r"^#{1,3}\s+(.+)$", ln):
            name = norm(m.group(1))
            continue
        if name and "**" in ln:
            for lm in _CARD_LABEL.finditer(ln):
                f = CARD_FIELDS.get(lm.group(1).strip().lower())
                if f and lm.group(2).strip():
                    out.setdefault(name, {}).setdefault(f, clean(lm.group(2), f))
    return out


def _sources_dates():
    from importer import DATA_DIR, xmlio

    p = os.path.join(DATA_DIR, "sr6", "sources.xml")
    if not os.path.exists(p):
        return {}
    return {s.get("id"): s.get("published") or "" for s in xmlio.ET.parse(p).getroot() if s.get("id")}


def kids(el, tag):
    """The child elements of `el` named `tag`."""
    return [k for k in el if isinstance(k.tag, str) and k.tag == tag]


def add_kid(el, tag, attrs, text=None):
    """Add a `tag` child with the given attributes and text to `el`; unset attributes are left out."""
    from lxml import etree

    k = etree.Element(tag, {a: str(v) for a, v in attrs.items() if v not in (None, "")})
    k.text = text or None
    t = kids(el, "text")
    if t:
        t[0].addprevious(k)
    else:
        el.append(k)
    return k


def _formula_of(el, f):
    return next((x for x in kids(el, "formula") if x.get("field") == f), None)


def _errata_books(bs):
    """(errata, the book it corrects) for each errata newer than its book's printing (a printing newer than the
    errata carries its own values). A Current Printing (_Book.current) counts as newer than every errata whatever the
    dates: the errata is yielded for it all the same, and _apply_errata lets it fill only what the printing leaves open.
    """
    for eb in bs:
        if eb.state != "skipped" or "errata" not in eb.why.lower():
            continue
        hay = re.sub(r"[^a-z0-9]", "", (eb.file + " " + eb.md[:400]).lower())
        targets = [b for b in bs if b.state == "done" and b.src and _tail(b.name) and _tail(b.name) in hay]
        if not targets:
            continue
        best = max(len(_tail(b.name)) for b in targets)
        for tb in [b for b in targets if len(_tail(b.name)) == best]:
            if tb.current or eb.date and tb.date and eb.date > tb.date:
                yield eb, tb


def _apply_errata(bs, entries, changed, n):
    """Each errata statement on its own book's entries, when the errata is newer than the printing. On a Current
    Printing an erratum never replaces a printed value: it fills a field the printing leaves open (an issue of its own)
    and nothing else (no renumbering, no dropped rating)."""
    for eb, tb in _errata_books(bs):
        stmts = errata(eb.md)
        ents = [
            {
                "name": el.findtext("name") or "",
                "page": int(el.get("page") or 0),
                "el": el,
                "path": path,
                "aliases": [a.text for a in kids(el, "alias") if a.text],
            }
            for b, src, kind, el, path in entries
            if b is tb and src == tb.src and kind != "rules"
        ]
        if not tb.current:
            _renumber(ents, [s for s in stmts if s[2] == "_renumber"], tb, changed, n)
        for page, subj, field, value, band in stmts:
            if field == "_unrated" and not tb.current:
                from importer.sr6.categories import singular

                for e in errata_targets(ents, page, subj) or errata_targets(ents, page, singular(subj)):
                    _unrate(e, value, tb, changed, n)
                continue
            if field.startswith("_"):
                continue

            def open_(e, field=field):
                return any(i.get("field") == field for i in kids(e["el"], "issue"))

            hit = errata_targets(
                [e for e in ents if open_(e) or e["el"].get(field) is not None and not tb.current], page, subj
            )
            if not hit:
                continue
            el, path = hit[0]["el"], hit[0]["path"]
            old = el.get(field)
            new = patch_band(old, band, value) if band else value
            if new is None or new == old:
                continue
            el.set(field, new)
            for x in [x for x in kids(el, "issue") + kids(el, "formula") if x.get("field") == field]:
                el.remove(x)
            add_kid(el, "found", {"field": field, "how": "errata", "source": tb.src.upper(), "page": page}, old)
            changed.add(path)
            n["errata"] += 1


def _line_page(md, title):
    """The PDF page the line printing a title is on (the `<!-- page N -->` above it), or None."""
    page = None
    for ln in (md or "").splitlines():
        if m := re.match(r"<!-- page (\d+) -->", ln.strip()):
            page = int(m.group(1))
        elif re.sub(r"\*\*", "", ln).strip().rstrip(":").strip() == title:
            return page
    return None


def _errata_modules(bs, files, changed, n):
    """Life modules an errata prints whole for its book (`use these errata'd entries instead of what's printed`: the
    companion's form, lifemodules.modules): each one the book's catalog lacks is added to its lifemodules file, on the
    errata's page, with a `found` record (how=errata). Returns the files it created."""
    from lxml import etree
    from importer.sr6 import regroup as rg

    made = []
    for eb, tb in _errata_books(bs):
        mods = lifemodules.modules(list(rg.blocks(rg.regroup(eb.md)[0])))
        if not mods:
            continue
        cat = catalog.Catalog(tb.src.upper(), tb.src, "an errata")
        for name, text, page in mods:
            lifemodules.lifemodule(cat, "adult", name, text, _line_page(eb.md, name) or page)
        path = os.path.join(tb.custom, "imported", tb.src, "lifemodules.xml")
        have = next((f for f in files + made if f[3] == path), None)
        if have is None:
            root = etree.fromstring(cat.xml("lifemodules").encode("utf8"))
            for el in list(root):
                root.remove(el)
            have = (tb, tb.src, "lifemodules", path, etree.ElementTree(root))
            made.append(have)
        root = have[4].getroot()

        # (the module's name less an `Event:` kicker: the errata's `Event: You had Fifteen Minutes of Fame` is the
        # book's `You had Fifteen Minutes of Fame`, No Future p. 3)
        def bare(el):
            return norm(re.sub(r"^\s*event:\s*", "", el.findtext("name") or "", flags=re.I))

        names = {bare(el) for el in root if isinstance(el.tag, str)}
        for el in etree.fromstring(cat.xml("lifemodules").encode("utf8")):
            if not isinstance(el.tag, str) or bare(el) in names:
                continue
            el.set("id", f"{tb.src}.{el.get('id')}")
            add_kid(el, "found", {"field": "entry", "how": "errata", "source": tb.src.upper(), "page": el.get("page")})
            el.tail = "\n"
            root.append(el)
            changed.add(path)
            n["errata"] += 1
    return made


def _renumber(ents, stmts, tb, changed, n):
    """An errata's renumbering (`these are instead rating 6 and 7 cybereyes`): each entry named with the old rating
    (`Cybereyes (Rating 5)`) takes the new one in its name and its formulas' rating bands, all at once (the old
    names first: 5 -> 6 and 6 -> 7 don't collide). Its id stays (characters keep loading it); the printed name is a
    `found` record."""
    todo = []
    # (by their printed names: an entry renamed by an earlier corpus pass is found, and left, by its printed name)
    view = [
        (
            dict(e, name=f.text or "", done=True)
            if (
                f := next(
                    (f for f in kids(e["el"], "found") if f.get("field") == "name" and f.get("how") == "errata"), None
                )
            )
            is not None
            else dict(e, done=False)
        )
        for e in ents
    ]
    olds = {o for _, _, _, (o, _), _ in stmts}
    for _, subj, _, (old, new), _ in stmts:
        if new not in olds and errata_targets(view, None, f"{subj} Rating {new}"):
            continue  # (already renumbered: an override row did it, the chain's last rating is there)
        hit = errata_targets(view, None, f"{subj} Rating {old}")
        if hit and not hit[0]["done"] and re.search(rf"\bRating\s+{old}\b", hit[0]["name"]):
            todo.append((next(e for e in ents if e["el"] is hit[0]["el"]), old, new))
    maps = {}
    for e, old, new in todo:
        maps.setdefault(id(e["el"]), {})[old] = new
    for e, old, new in todo:
        el, printed = e["el"], e["name"]
        e["name"] = re.sub(rf"\bRating\s+{old}\b", f"Rating {new}", printed)
        el.find("name").text = e["name"]
        m = {o: x for es in maps.values() for o, x in es.items()}  # (the family's bands: tier(R; 5: …; 6: …))
        for f in kids(el, "formula"):
            f.text = re.sub(
                r"(?<=[;(]\s)(\d+)(?=\s*:)", lambda k, m=m: str(m.get(int(k.group(1)), k.group(1))), f.text or ""
            )
        add_kid(el, "found", {"field": "name", "how": "errata", "source": tb.src.upper(), "page": e["page"]}, printed)
        changed.add(e["path"])
        n["errata"] += 1


def _unrate(e, rating, tb, changed, n):
    """An errata dropping an item's rating (`no longer have ratings … as if they were rating 1`): each formula's value
    at that rating is the field's value; the rating goes."""
    from importer.sr6 import formula as F

    el = e["el"]
    done = False
    for f in kids(el, "formula"):
        try:
            v = F.evaluate(f.text or "", R=rating)
        except Exception:  # (a formula needing more than the rating: left)  # pylint: disable=broad-exception-caught
            continue
        if v is None:
            continue
        field = f.get("field")
        add_kid(
            el, "found", {"field": field, "how": "errata", "source": tb.src.upper(), "page": e["page"]}, el.get(field)
        )
        el.set(field, F.fmt(v))
        el.remove(f)
        done = True
    if done and el.get("rating") is not None:
        del el.attrib["rating"]
    if done:
        changed.add(e["path"])
        n["errata"] += 1


def corpus(books, sources=None, apply_errata=True):
    """The third circle and the errata, over a library: books [(book_dir, custom_dir)] (on the server every book's
    custom_dir is the same one; a measurement's runs each have their own). Each loaded book's catalog files
    (custom/imported/<source>/*.xml) are read and rewritten in place. Returns counts {corpus, errata, searched}."""
    from lxml import etree
    from importer import xmlio

    dates = sources if sources is not None else _sources_dates()
    bs = [_Book(d, c, dates) for d, c in books]
    files, seen = [], set()  # (book, source, kind, path, tree)
    for b in bs:
        if b.state != "done" or not b.src:
            continue
        for src in [b.src, *b.extra]:
            d = os.path.join(b.custom, "imported", src)
            if not os.path.isdir(d) or os.path.realpath(d) in seen:
                continue
            seen.add(os.path.realpath(d))
            for f in sorted(os.listdir(d)):
                if f.endswith(".xml"):
                    tree = etree.parse(os.path.join(d, f))
                    files.append((b, src, tree.getroot().get("kind"), os.path.join(d, f), tree))
    entries, by_name = [], {}  # (book, source, kind, element, file); (kind, norm name) -> [(book, source, element)]
    for b, src, kind, path, tree in files:
        for el in tree.getroot():
            if isinstance(el.tag, str) and el.get("id") is not None:
                entries.append((b, src, kind, el, path))
                for n in dict.fromkeys(
                    [el.findtext("name") or ""] + [a.text or "" for a in kids(el, "alias") if a.get("id") is None]
                ):
                    by_name.setdefault((kind, norm(n)), []).append((b, src, el))
    changed, n = set(), {"corpus": 0, "errata": 0, "searched": 0}
    if apply_errata:
        _apply_errata(bs, entries, changed, n)
        made = _errata_modules(bs, files, changed, n)
        files += made
    deck_cards = [(b, cards(b.md)) for b in bs if b.state == "skipped" and "card" in b.why.lower()]

    def offer(cands, ob, osrc, oel, f):
        v = oel.get(f)
        if v and good(f, v) and f not in {i.get("field") for i in kids(oel, "issue")}:
            cands.append((ob.date or "", v, osrc.upper(), oel.get("page"), _formula_of(oel, f), oel))

    def kind_of(e):  # (Commlink6's TYPE of the class: what kind of thing an entry is)
        return (e.get("class") or "").split("/")[0]

    for b, src, kind, el, path in entries:
        todo = kids(el, "issue")
        name = norm(el.findtext("name") or "")
        if todo:
            changed.add(path)
        for iss in todo:
            f, cands = iss.get("field"), []  # (date, value, source, page, formula)
            for ob, osrc, oel in by_name.get((kind, name), ()):
                # (the same name is another thing when the classes differ in kind: Street Wyrd's Climbing Gear, an
                # alchemical preparation, is not the core rulebook's survival gear)
                if not (ob is b and osrc == src) and not (kind_of(el) and kind_of(oel) and kind_of(el) != kind_of(oel)):
                    offer(cands, ob, osrc, oel, f)
            for cb, cs in deck_cards:
                v = cs.get(name, {}).get(f)
                if v and good(f, v):
                    cands.append((cb.date or "", v, None, None, None, None))
            if el.get("type"):
                for pat, cat in CLASS_ROWS.get(kind, ()):
                    t = PRICED_AS.get(el.get("type"), el.get("type"))
                    for ob, osrc, oel in by_name.get(("gear", norm(pat.format(type=t))), ()):
                        if cat is None or cat.search(oel.get("category") or ""):
                            offer(cands, ob, osrc, oel, f)
            if iss.get("code") not in FIXABLE:  # the book prints two values or a rule: only a later source settles it
                cands = [c for c in cands if b.date and c[0] > b.date]
            latest = max((c[0] for c in cands), default=None)
            top = {c[1] for c in cands if c[0] == latest}
            if not cands or len(top) > 1:  # nothing found, or sources of the same date disagree
                iss.set("searched", "book,corpus")
                n["searched"] += 1
                continue
            _date, v, osrc, page, fx, oel = next(c for c in cands if c[0] == latest)
            el.set(f, v)
            el.remove(iss)
            for x in [x for x in kids(el, "formula") if x.get("field") == f]:
                el.remove(x)
            if fx is not None:
                add_kid(el, "formula", dict(fx.attrib), fx.text)
            add_kid(el, "found", {"field": f, "how": "corpus", "source": osrc, "page": page})
            n["corpus"] += 1
            r = oel.get("rating") if oel is not None else None
            if (
                r
                and not el.get("rating")
                and fx is not None
                and re.search(r"\bR\b", fx.text or "")
                and "rating" not in {i.get("field") for i in kids(oel, "issue")}
            ):
                # (a price per rating comes with the ratings it is for: the Autosoft row's `1–9` with its `Rating x
                # 500`, CRB p. 271)
                el.set("rating", r)
                for x in [x for x in kids(el, "issue") if x.get("field") == "rating"]:
                    el.remove(x)
                add_kid(el, "found", {"field": "rating", "how": "corpus", "source": osrc, "page": page})
    n["abbreviations"] = _spelled_out(bs, entries, changed)
    n["run-ins"] = _run_in_names(entries, changed)
    n["builtin"] = _builtin_mods(bs, entries, changed)
    n["parts"] = vehicle_parts(entries, changed)
    n["weapon-parts"], missed = weapon_parts(bs, entries, changed)
    for m in missed:
        print(f"weapon standard upgrade: no accessory for {m}", file=sys.stderr)
    for b, src, kind, path, tree in files:
        if path in changed:
            body = etree.tostring(tree, encoding="unicode")
            xmlio.write_file(path, xmlio.HEAD + body + ("" if body.endswith("\n") else "\n"))
    for custom in {f[0].custom for f in (made if apply_errata else [])}:
        xmlio.update_index(custom)  # (a file an errata's entries made: listed)
    return n


_RUNIN_LINE = re.compile(r"^\s*(?:•\s*)?\*\*([A-Z][\w’'-]*(?:[ -][\w’'-]+){0,3}):\*\*")
_GROUPED = re.compile(r"^(.+?)\s+\(([^()]+)\)$")


def _typo(a, b):
    """Two all-capital names of three letters or more one letter apart (`NDE` / `NDI`)."""
    return len(a) == len(b) >= 3 and a.isupper() and b.isupper() and sum(x != y for x, y in zip(a, b)) == 1


def _run_in_names(entries, changed):
    """A grouped row `Group (Part)` that its book describes under a bold run-in naming it another way gets that name as
    a search name (an `<alias>` with no id): the part with the group's head word before it (`**Endo-Mender:**` for
    `Endosymbionts (Mender)`), or the part one letter off (`**NDE:**` for `Genotype Enhancement (NDI)`: a typo, the
    printed row keeping its name). The run-in within four pages of the row, and naming no entry of the book.
    Returns how many entries got one."""
    done = 0
    by_book = {}
    for b, src, kind, el, path in entries:
        if b.state == "done" and src == b.src and kind != "rules":
            by_book.setdefault(id(b), (b, []))[1].append((el, path))
    for b, ents in by_book.values():
        runins, page = [], 0
        for ln in (b.md or "").splitlines():
            if m := re.match(r"<!-- page (\d+) -->", ln.strip()):
                page = int(m.group(1))
            elif m := _RUNIN_LINE.match(ln):
                runins.append((m.group(1).strip(), page))
        names = {norm(el.findtext("name") or "") for el, _ in ents}
        parts = {norm(m.group(2)) for el, _ in ents if (m := _GROUPED.match(el.findtext("name") or ""))}
        for el, path in ents:
            m = _GROUPED.match(el.findtext("name") or "")
            if not m or not str(el.get("page") or "").isdigit():
                continue
            group, part, at = m.group(1), m.group(2).strip(), int(el.get("page"))
            head = norm(group).split()[0] if norm(group) else ""
            hits = set()
            for x, pg in runins:
                if not (0 <= pg - at <= 4) or norm(x) in names or norm(x) == norm(part):
                    continue
                pre = re.match(rf"(?i)^(.+?)[\s-]+{re.escape(part)}$", x)
                if (
                    pre
                    and head.startswith(norm(pre.group(1)).replace(" ", ""))
                    or _typo(x, part)
                    and norm(x) not in parts
                ):
                    hits.add(x)
            if len(hits) == 1 and not any((a.text or "") == next(iter(hits)) for a in kids(el, "alias")):
                add_kid(el, "alias", {}, next(iter(hits)))
                changed.add(path)
                done += 1
    return done


# an abbreviation the text spells out: `rigger command consoles (RCCs)`, `Medical Evacuation (MEDEVAC)`
_DEFINED = re.compile(r"\b((?:[A-Za-z][a-z]+[\s-]+){1,5}[A-Za-z][a-z]+)\s+\(([A-Z]{2,7})s?\)")


def _spelled_out(bs, entries, changed):
    """An entry named only by an abbreviation (`RCC`) that a book of the library spells out where it defines it
    (`rigger command console (RCC)`, the words' initials the letters): that spelling a search name (an `<alias>`
    with no id), singular. Returns how many entries got one."""
    spelled = {}
    for b in bs:
        for m in _DEFINED.finditer(b.md or ""):
            words = re.split(r"[\s-]+", m.group(1))
            for k in range(len(words)):  # the words the letters start: the last len(abbr) words
                tail = words[k:]
                if len(tail) == len(m.group(2)) and "".join(w[0] for w in tail).upper() == m.group(2):
                    one = " ".join(tail)
                    one = one[:-1] if one.endswith("s") and not one.endswith("ss") else one
                    spelled.setdefault(m.group(2), one[:1].upper() + one[1:].lower())
                    break
    done = 0
    for b, _src, _kind, el, path in entries:
        name = (el.findtext("name") or "").strip()
        full = spelled.get(name)
        if full and not any((a.text or "").lower() == full.lower() for a in kids(el, "alias")):
            add_kid(el, "alias", {}, full)
            changed.add(path)
            done += 1
    return done


# a box listing the modifications another book's vehicles come with (Double Clutch p. 146, `Core Vehicle Modifications`:
# "Vehicles and drones from the … core rulebook … already incorporate the following modifications")
_BUILTIN_BOX = re.compile(r"(?i)^\s*core\s+vehicle\s+modifications\s*$")
_RUNIN = re.compile(r"^\s*(?:•\s*)?\*\*([^*]+?):\*\*\s*(.+?)\s*$")
_SLOTS = re.compile(r"(?i)^(\d+)\s+additional\s+(\w+)\s+mod\s+slots?$")
_LEVEL = re.compile(r"(?i)\s*\((?:rating|level|size\s+class)\s*\d+\)")


def builtin_box(regrouped):
    """A book's built-in modifications box as [(vehicle name, its list as printed, PDF page)]: the bold run-ins
    (`**GMC Bulldog:** 4 additional Chassis mod slots`) of the block headed `Core Vehicle Modifications` and of the
    deeper blocks right after it (its groups: `Bikes`, `Cars`). A run-in naming no vehicle (another column's text run
    into the box) is dropped where it is applied (_builtin_mods)."""
    from importer.sr6.regroup import blocks

    out, level = [], None
    for b in blocks(regrouped):
        if _BUILTIN_BOX.match(b.name or ""):
            level = b.level or 0
        elif level is None or b.type == "section" or (b.level or 0) <= level:
            level = None
            continue
        # (regroup hands a block's leading labelled lines over as labels; the rest stay in its text)
        runins = [
            *b.labels.items(),
            *((m.group(1), m.group(2)) for ln in (b.text or "").splitlines() if (m := _RUNIN.match(ln))),
        ]
        out += [(k.strip(), v, b.page) for k, v in dict(runins).items()]
    return out


def builtin_parts(text):
    """A box line's list -> [(tag, attrs, text)]: each modification a `builtin` (name as printed, its trailing number
    the rating: `Realistic features 4`; `4 additional Chassis mod slots`: slots 4, category chassis), a line or part
    that is a sentence rather than a name (`As Nissan Samurai, except …`, `upgradable to rating 3 for 500¥`) a `note`
    (field builtin), as printed."""
    text = " ".join(text.split())
    if re.search(r"\.\s+[A-Z]", text) or re.match(r"As\s", text):  # (sentences, not a list)
        return [("note", {"field": "builtin"}, text)]
    out, depth, cur = [], 0, ""
    for ch in text + ",":  # (a comma inside parentheses is the part's own: `(amphibious, surface)`)
        depth += (ch == "(") - (ch == ")")
        if ch == "," and depth == 0:
            if p := cur.strip(" ."):
                out.append(p)
            cur = ""
        else:
            cur += ch
    kids = []  # pylint: disable=redefined-outer-name  # local list; the kids() helper is not used below
    for p in out:
        if m := _SLOTS.match(p):
            kids.append(("builtin", {"name": p, "slots": m.group(1), "category": m.group(2).lower()}, None))
        elif len(p.split()) >= 6 or "¥" in p or p[:1].islower() and re.search(r"\b(?:to|for|with)\b", p):
            kids.append(("note", {"field": "builtin"}, p))
        elif m := re.fullmatch(r"(.*?\S)\s+(\d+)", p):
            kids.append(("builtin", {"name": m.group(1), "rating": m.group(2)}, None))
        else:
            kids.append(("builtin", {"name": p}, None))
    return kids


def _mod_ref(name, rating, mods):
    """The id of the modification a box names (mods: [(id, [its names])]): the one whose words (catalog.word_stems, a
    level's `(Rating 1)` left out) are the name's, else the only one whose words hold the name's or are held in them
    (two words shared at least: `Ceramic plate armor` is `Ceramic Plate`, `rigger cocoon` `Rigger Cocoon (CF Mod)`); of
    several levels, the rating's. None when none or several."""
    want = catalog.word_stems(name)
    for test in (lambda s: s == want, lambda s: len(s & want) >= 2 and (s <= want or want <= s)):
        hits = list(dict.fromkeys(i for i, ns in mods if any(test(catalog.word_stems(_LEVEL.sub("", n))) for n in ns)))
        if len(hits) > 1 and rating:
            names = dict(mods)
            hits = [i for i in hits if any(re.search(rf"\((?:rating|level)\s*{rating}\)", n, re.I) for n in names[i])]
        if hits:
            return hits[0] if len(hits) == 1 else None
    return None


def _alternatives(name):
    """A vehicle name's squashed forms, each of a slash name's (`Federated-Boeing Commuter/Osprey X`: `Federated-Boeing
    Commuter`, `Federated-Boeing Osprey X`)."""
    out = {catalog.squash(name)}
    if name.count("/") == 1:
        a, b = (x.strip() for x in name.split("/"))
        out |= {catalog.squash(a), catalog.squash(" ".join(a.split()[:-1] + [b]))}
    return out


def _builtin_mods(bs, entries, changed):
    """A book's built-in modifications box (builtin_box) on the vehicles it names in the library's other books: each
    named vehicle (by name, alias or a slash name's part) gets the box line's `builtin` children (ref: the box book's
    gear entry of the modification's name, _mod_ref; source and page: the box's) and `note`s (builtin_parts), replacing
    the ones an earlier pass gave it. Returns how many vehicles got them."""
    done = 0
    for b in bs:
        path = os.path.join(b.dir, "regrouped.md")
        if b.state != "done" or not os.path.exists(path):
            continue
        with open(path, encoding="utf8") as f:
            box = builtin_box(f.read())
        if not box:
            continue
        mine = [(el, kind) for ob, src, kind, el, _ in entries if ob is b and src == b.src]
        mods = [
            (el.get("id"), [el.findtext("name") or ""] + [a.text or "" for a in kids(el, "alias")])
            for el, kind in mine
            if kind == "gear"
        ]
        page = next(
            (el.get("page") for el, kind in mine if kind == "rules" and _BUILTIN_BOX.match(el.findtext("name") or "")),
            None,
        )
        lines = {}
        for name, text, _ in box:
            for k in _alternatives(name):
                lines[k] = text
        for ob, src, kind, el, epath in entries:
            if kind != "vehicles" or ob is b:
                continue
            keys = set().union(
                *(_alternatives(n) for n in [el.findtext("name") or ""] + [a.text or "" for a in kids(el, "alias")])
            )
            text = next((lines[k] for k in keys if k in lines), None)
            if text is None:
                continue
            for k in kids(el, "builtin") + [x for x in kids(el, "note") if x.get("field") == "builtin"]:
                el.remove(k)
            for tag, attrs, t in builtin_parts(text):
                if tag == "builtin":
                    attrs = {
                        **attrs,
                        "ref": _mod_ref(attrs["name"], attrs.get("rating"), mods),
                        "source": b.src.upper(),
                        "page": page,
                    }
                add_kid(el, tag, attrs, t)
            changed.add(epath)
            done += 1
    return done


VEHICLE_PARTS = Path(__file__).with_name("classes") / "vehicle_parts.json"
_PART_ATTRS = ("id", "ref", "hook", "cost", "rating", "variant", "count", "included", "parent", "origin", "review")


def vehicle_parts(entries, changed, data=None):
    """Each vehicle the committed table (classes/vehicle_parts.json, made by tools/cl6check/vehicleparts.py from
    Commlink6's embeds: the importer never reads the jar) has rows for gets them as `part` children, and loses its
    `builtin` names (owner ruling D2: Commlink6's structured parts replace the box-text ones). A `builtin` that grants
    slots stays: that is a hook budget, not a part. A vehicle is HELD, keeping its builtins (never below today's
    factory fit), when it has no rows (book-only), when the table lists a part of it as unmatched, or when a row's ref
    is no entry of this library (an entry only the optional Commlink6 module has: no dangling `part`, the row is
    skipped), or when its only parts are synthesized ones (origin synth: no Commlink6 part replaces its builtins).
    Returns how many vehicles got parts."""
    if data is None:
        data = json.loads(VEHICLE_PARTS.read_text(encoding="utf8")) if VEHICLE_PARTS.is_file() else {}
    known = {el.get("id") for _ob, _src, _kind, el, _path in entries}
    by, held = {}, {v for u in data.get("unmatched", ()) for v in u.get("vehicle", ())}
    for r in data.get("rows", ()):
        if r["ref"] in known:
            by.setdefault(r["vehicle"], []).append(r)
        else:
            held.add(r["vehicle"])
    done = 0
    for _ob, _src, kind, el, epath in entries:
        rows = by.get(el.get("id")) if kind == "vehicles" else None
        if not rows:
            continue
        for k in kids(el, "part"):
            el.remove(k)
        # (a synthesized powerplant alone, Stage 2b, replaces nothing: builtins stay unless Commlink6 parts came)
        if el.get("id") not in held and any(r.get("origin") != "synth" for r in rows):
            for k in [x for x in kids(el, "builtin") if not x.get("slots")]:
                el.remove(k)
        for r in rows:
            add_kid(el, "part", {**{a: r.get(a) for a in _PART_ATTRS}, "removable": "true"})
        changed.add(epath)
        done += 1
    return done


_UPGRADES = re.compile(r"\*{0,2}Standard Upgrades:\*{0,2}\s*(.+)", re.I)


def standard_upgrades(regrouped):
    """A book's weapons' `Standard Upgrades:` lines (Krime Katalog p. 7: `Foregrip, gas-vent system, metahuman
    adaptation`) as {norm(block name): the list as printed}, the first line of each block (a block printing a second
    edition's stat line too repeats it)."""
    from importer.sr6.regroup import blocks

    out = {}
    for b in blocks(regrouped):
        lines = [f"{k}: {v}" for k, v in b.labels.items()] + (b.text or "").splitlines()
        if m := next((m for ln in lines if (m := _UPGRADES.match(ln.strip(" |>"))) and m.group(1).strip()), None):
            out.setdefault(norm(b.name or ""), m.group(1).strip(" |"))
    return out


_GENERIC_PART_WORDS = catalog.word_stems("system improved standard kit unit module")
_PLAIN = catalog.word_stems("regular")  # (a `Sling` is the Regular Sling, not the Tactical one: Firing Squad p. 74)
_QUALIFIER = re.compile(r"\s*\((?![^)]*\d)[^)]*\)\s*$")  # (a trailing note with no number: `(all models)`, not `(2)`)


def _same_part(a, b):
    """Two names for one part: less the generic part words (_GENERIC_PART_WORDS), their word stems equal or one's
    inside the other's (`gas-vent system` / `Gas Vent (improved)`), never a shared word alone (`Smartgun system` is not
    `Gas-Vent System`)."""
    x, y = catalog.word_stems(a) - _GENERIC_PART_WORDS, catalog.word_stems(b) - _GENERIC_PART_WORDS
    return bool(x and y) and (x <= y or y <= x)


def weapon_parts(bs, entries, changed):
    """Owner ruling 2026-10-30: a weapon's built-in standard upgrades are removable `part`s (the vehicle parts' pattern,
    vehicle_parts), in its price (included), their effects the weapon's while fitted. Two sources: Commlink6's GEARMOD
    modifiers on the weapon (a family row's, the accessory found by the override tables' cl6id) and the book's
    `Standard Upgrades:` line (standard_upgrades; each name the library's weapon accessory of that name, _mod_ref). A
    name matched only loosely, or a Commlink6 ref found by its words alone, is review="needs-owner". Returns (weapons
    given parts, the names no accessory was found for)."""
    from importer.sr6 import overrides

    acc = {
        el.get("id"): el
        for _ob, _src, _kind, el, _p in entries
        if (el.get("class") or "").startswith("ACCESSORY/WEAPON_ACCESSORY")
    }
    by_cl6, cl6_names = {}, {}
    for src in sorted({s for _ob, s, _k, _el, _p in entries}):
        for r in overrides.table(src):
            if r.get("cl6id") and r.get("id") and f"{src}.{r['id']}" in acc:
                by_cl6.setdefault(r["cl6id"], f"{src}.{r['id']}")
                cl6_names.setdefault(f"{src}.{r['id']}", set()).add(r.get("cl6") or "")
    # (an accessory's names: its own, its aliases and Commlink6's: `Smartgun System` is Commlink6's smartgun_system, our
    # Smartgun system, internal)
    mods = [
        (i, [el.findtext("name") or ""] + [a.text or "" for a in kids(el, "alias")] + sorted(cl6_names.get(i, ())))
        for i, el in acc.items()
    ]
    dates = {el.get("id"): getattr(ob, "date", None) or "" for ob, _s, _k, el, _p in entries if el.get("id") in acc}

    def find(name):
        name = _QUALIFIER.sub("", name)  # (`folding stock (shopkeeper only)`: the model it comes on, not the part)
        want = catalog.word_stems(name) - _PLAIN

        exact = [i for i, ns in mods if any(catalog.word_stems(n) - _PLAIN == want for n in ns if n)]
        if len(exact) > 1:  # (printings of one part, CRB's and Firing Squad's Folding Stock: the latest published wins)
            exact = [i for i in exact if dates[i] == max(dates[j] for j in exact)]
        if len(exact) == 1:
            return exact[0], "none"
        ref = _mod_ref(name, None, mods)
        return (ref, "needs-owner") if ref else (None, None)

    books = {}
    for b in bs:
        path = os.path.join(b.dir, "regrouped.md")
        if b.state == "done" and os.path.exists(path):
            with open(path, encoding="utf8") as f:
                books[id(b)] = standard_upgrades(f.read())
    done, missed = 0, []
    for ob, _src, kind, el, epath in entries:
        if kind != "weapons" or el.get("id") in acc:
            continue
        want = []  # (ref, origin, review)
        for m in kids(el, "modifier"):
            if m.get("type") == "GEARMOD" and m.get("kind") == "itemmod" and m.get("ref"):
                ref, review = (
                    (by_cl6[m.get("ref")], "none") if m.get("ref") in by_cl6 else find(m.get("ref").replace("_", " "))
                )
                if ref:
                    want.append((ref, "cl6", review))
                else:
                    missed.append(f"{el.get('id')}: {m.get('ref')}")
        line = books.get(id(ob), {}).get(norm(el.findtext("name") or ""))
        for tag, attrs, _t in builtin_parts(line) if line else ():
            if tag != "builtin" or attrs.get("slots"):
                continue
            ref, review = find(attrs["name"])
            if not ref:
                missed.append(f"{el.get('id')}: {attrs['name']}")
            # (the book's name for a part Commlink6 already gives, by another printing: `gas-vent system (2)` beside its
            # `Gas Vent (improved)`, is that part, not a second one)
            elif all(w[0] != ref and not _same_part(attrs["name"], acc[w[0]].findtext("name") or "") for w in want):
                want.append((ref, "book", review))
        want = list({w[0]: w for w in reversed(want)}.values())[::-1]  # one <part> per id (the first kept)
        old = kids(el, "part")
        if not want and not old:
            continue
        for k in old:
            el.remove(k)
        for ref, origin, review in want:
            a = acc[ref]
            hook = next((k.get("slot") for k in kids(a, "fits") if k.get("slot")), None) or "weapon"
            add_kid(
                el,
                "part",
                {
                    "id": ref.split(".", 1)[1],
                    "ref": ref,
                    "hook": hook,
                    "cost": "0",
                    "included": "true",
                    "removable": "true",
                    "origin": origin,
                    "review": review,
                },
            )
        changed.add(epath)
        done += bool(want)
    return done, missed


def library(library_dir, custom_dir):
    """corpus() over a server library: every book folder under library_dir, with its one custom_dir."""
    books = [
        (os.path.join(library_dir, d), custom_dir)
        for d in sorted(os.listdir(library_dir))
        if os.path.isdir(os.path.join(library_dir, d))
    ]
    return corpus(books)
