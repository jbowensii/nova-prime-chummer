"""AI proposals for a book no recipe knows: split book.md by headings, ask the model for each chunk's
amps, items, spells and complex forms (schema.py), check each against the shipped mechanics with
the reference rules of tools/validate-data.mjs, and write library/<id>/review.xml for the user.
Model output is untrusted: every value is type-checked, cleaned and escaped before it reaches XML."""
import hashlib
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from importer import core_file, mechanics_roots, xmlio
from importer.ai.providers import ProviderError, TruncatedReply
from importer.ai.schema import CORE, SCHEMA, core_schema

LIMIT = 12000
HEADING = re.compile(r"^#{1,2} ", re.M)
PAGE = re.compile(r"<!-- page (\d+) -->")
PREFIX = {"spell": "spell-", "complex-form": "cf-", "gear": "gear-"}  # as the shipped files name them
# core files a recipe couldn't read (import.xml rows kind="core-unread") -> the proposal kind of their rows: every core
# table. Weapons and armor rows are <item>s; every other kind is its entry's tag (<level>, <effect>…)
CORE_KINDS = {"weapons.xml": "weapon", "armor.xml": "armor", "levels.xml": "level", "metatypes.xml": "metatype",
              "attributes.xml": "attribute", "skills.xml": "skill", "pricing.xml": "pricing", "amptypes.xml": "amptype",
              "ampeffects.xml": "effect", "packages.xml": "package", "vehicles.xml": "vehicle", "lifestyles.xml": "lifestyle"}
ITEM_KINDS = ("gear", "weapon", "armor")
CATEGORIES = {"spell": ("combat", "detection", "health", "illusion", "manipulation"), "complex-form": ("sustained", "instant")}
KEYS = ("amps", "items", "spells", "complexForms")
ILLEGAL = xmlio.ILLEGAL


def chunks(md, limit=LIMIT):
    """book.md cut at `#`/`##` headings (then paragraphs, then hard) and packed into chunks of at most
    `limit` characters; each chunk starts with the page marker it begins on."""
    body = limit - 24  # room for the page marker
    starts = [0]
    for m in HEADING.finditer(md):  # a heading after only page markers stays with them
        if PAGE.sub("", md[starts[-1]:m.start()]).strip():
            starts.append(m.start())
    pieces = []
    for sec in (md[a:b] for a, b in zip(starts, starts[1:] + [len(md)])):
        for para in [sec] if len(sec) <= body else re.split(r"(?<=\n\n)", sec):
            pieces += [para[i:i + body] for i in range(0, len(para), body)]
    out, cur, at = [], "", 0
    for p in pieces:
        if cur and len(cur) + len(p) > body:
            out.append((at, cur))
            at, cur = at + len(cur), ""
        cur += p
    if cur.strip():
        out.append((at, cur))
    result = []
    for at, c in out:
        pages = PAGE.findall(md, 0, at)
        result.append(c if c.startswith("<!-- page") or not pages else f"<!-- page {pages[-1]} -->\n{c}")
    return result


def count_chunks(book_md):
    """How many requests proposing this book.md takes (the Books page shows it before the user confirms)."""
    with open(book_md, encoding="utf8") as f:
        return len(chunks(f.read()))


def mechanics(data_dir=None):
    """Ids the proposals are checked against: the core files (`data_dir`, else importer.core_dir) plus what imported
    books add to skills, amp types and effects."""
    def roots(name):
        return [ET.parse(os.path.join(data_dir, name)).getroot()] if data_dir else mechanics_roots(name)
    effects = {e.get("id"): e for r in roots("ampeffects.xml") for e in r if e.tag == "effect"}
    skills = roots("skills.xml")
    attrs = ET.parse(os.path.join(data_dir, "attributes.xml") if data_dir else core_file("attributes.xml")).getroot()
    return {"effects": effects, "amptypes": {t.get("id") for r in roots("amptypes.xml") for t in r if t.tag == "amptype"},
            "attributes": {a.get("id") for a in attrs if a.tag == "attribute"},
            "skills": {s.get("id") for r in skills for s in r.iter("skill")}, "specs": {s.get("id") for r in skills for s in r.iter("spec")}}


def _text(v):
    """A model value as clean text (numbers allowed), or None for null/lists/objects/booleans."""
    if isinstance(v, bool) or not isinstance(v, (str, int, float)):
        return None
    return ILLEGAL.sub("", str(v)).strip() or None


def _pos(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None


def amp_notes(amp, m):
    """validate-data.mjs's amp checks: the type, each effect ref, and rr-skill/rr-spec/rr-attr params.
    `amp` holds clean text values (see _amp)."""
    notes = [] if amp.get("type") in m["amptypes"] else [f'unknown amp type "{amp.get("type")}"']
    for e in amp.get("effects") or []:
        ref, param = e.get("ref"), e.get("param")
        if ref not in m["effects"]:
            notes.append(f'unknown effect ref "{ref}"')
        elif param is None:
            continue  # an open pick: the player chooses in the Amp Builder
        elif ref == "rr-skill" and param not in m["skills"]:
            notes.append(f'unknown skill "{param}" for rr-skill')
        elif ref == "rr-spec" and param not in m["specs"] and not param.startswith("custom:"):
            notes.append(f'unknown specialization "{param}" for rr-spec')
        elif ref == "rr-attr" and param not in m["attributes"]:
            notes.append(f'unknown attribute "{param}" for rr-attr')
    return notes


def _amp(a):
    """(clean amp, shape notes): effects must be a list of objects, printedRating an integer."""
    notes, effects = [], a.get("effects")
    if not isinstance(effects, list):
        notes += [] if effects is None else ["effects isn’t a list; dropped"]
        effects = []
    if any(not isinstance(e, dict) for e in effects):
        notes.append("an effect isn’t an object; dropped")
    effects = [{"ref": _text(e.get("ref")), "param": _text(e.get("param")), "value": _pos(e.get("value")), "note": _text(e.get("note"))}
               for e in effects if isinstance(e, dict)]
    rating = a.get("printedRating")
    if rating is not None and (isinstance(rating, bool) or not isinstance(rating, int)):
        shown = ILLEGAL.sub("", str(rating))[:40]
        notes.append(f'printedRating "{shown}" isn’t a whole number; dropped')
        rating = None
    return {"name": _text(a.get("name")), "type": _text(a.get("type")), "printedRating": rating, "effects": effects}, notes


def system_prompt(m):
    effects = "\n".join(f"- {i}: {e.findtext('name')}" + (f" (param: {e.get('param')})" if e.get("param") else "")
                        for i, e in m["effects"].items())
    return f"""You read one part of a Shadowrun Anarchy 2.0 sourcebook, converted from PDF to Markdown.
`<!-- page N -->` marks where printed page N starts. Answer with one JSON object only, matching this JSON Schema:
{json.dumps(SCHEMA)}

List only entries this text defines (Shadow Amps, gear/weapons/armor, spells, complex forms); use empty lists
when there are none. `page` is the printed page the entry is on. `printedRating` is the amp's printed rating.
Amp `type` is one of: {" ".join(sorted(m["amptypes"]))}.
Amp effects: `ref` is one of these ids; leave `param` null when the player picks, else:
rr-skill takes a skill id ({" ".join(sorted(m["skills"]))}), rr-attr an attribute id ({" ".join(sorted(m["attributes"]))}),
rr-spec a specialization id ({" ".join(sorted(m["specs"]))}) or "custom:<name>" for one not listed.
{effects}
Spell categories: {", ".join(CATEGORIES["spell"])}. Complex form categories: {", ".join(CATEGORIES["complex-form"])}."""


def core_prompt(tables):
    """The system prompt for the core tables `tables` (file stems) a recipe couldn't read. Needs no core data: any table
    may be the missing one."""
    from importer.recipes import crb_core  # the app's own ids for the tables whose ids the engine names
    hints = {"attributes": f"Attribute ids are {' '.join(crb_core.ATTR_LETTER.values())}.",
             "metatypes": "Each metatype has one range per attribute (attr: str agi wil log cha).",
             "skills": "attr and alt are attribute ids (str agi wil log cha); spec ids are <skill id>.<spec name in kebab-case>.",
             "ampeffects": f"Use these ids for the rows they name: {' '.join(e[0] for e in crb_core.EFFECTS)}. "
                           "types is the space-separated amp type ids that may take the effect.",
             "packages": "level is the level id the package is for.",
             "pricing": "One pricing row; complexForm is null unless the book prints it."}
    return f"""You read part of a Shadowrun Anarchy 2.0 core rulebook, converted from PDF to Markdown.
`<!-- page N -->` marks where printed page N starts. Answer with one JSON object only, matching this JSON Schema:
{json.dumps(core_schema(tables))}

List only the rows of the book's {" and ".join(sorted(tables))} tables printed in this text; use empty lists when there
are none. `page` is the printed page of the row. Numbers are plain numbers (nuyen without separators or ¥). `id` is the
row's name in lowercase kebab-case unless said below.
""" + "\n".join(hints[t] for t in sorted(tables) if t in hints)


def _id(v):
    return re.sub(r"[^a-z0-9.-]+", "-", (_text(v) or "").lower()).strip("-.") or "unnamed"


def schema_notes(table, xml):
    """[] when `xml` (one entry) is valid in the core file `table`, else why not (the file's schema, as a data pack is checked)."""
    from lxml import etree
    from importer import datapack
    try:
        root = etree.fromstring(f'<ca2:data xmlns:ca2="{xmlio.NS}" kind="{table}" version="1">{xml}</ca2:data>'.encode("utf8"))
    except etree.XMLSyntaxError as e:
        return [f"isn’t readable XML ({e})"]
    s = datapack._schema("items" if table in ("weapons", "armor") else table)
    return [] if s.validate(root) else [f"doesn’t fit the {table} table: {s.error_log.last_error.message}"]


def id_notes(table, i):
    """The engine names attributes and amp effects by the app's ids: another id is flagged for the reviewer."""
    from importer.recipes import crb_core
    known = {"attributes": set(crb_core.ATTR_LETTER.values()), "ampeffects": {e[0] for e in crb_core.EFFECTS}}.get(table)
    return [f'id "{i}" isn’t one the app uses for {table}'] if known and i not in known else []


def core_refs(rows=(), replacing=()):
    """{table: ids} a core row may name that its schema can't check: the levels, amp types and amp effects in place (the
    core files and what books add), plus `rows` ("kind.id", the rows of this review). A table in `replacing` (being
    written from this review) leaves out its core file's ids."""
    from importer import NoCoreData, find_core_file
    refs = {}
    for t in ("levels", "amptypes", "ampeffects"):
        try:
            roots = [ET.parse(find_core_file("levels.xml")).getroot()] if t == "levels" else mechanics_roots(f"{t}.xml")
        except (OSError, TypeError, ET.ParseError, NoCoreData):  # that table isn't in place (it may be the one being read)
            roots = []
        roots = roots[1:] if t in replacing else roots  # the core file comes first
        refs[t] = {e.get("id") for r in roots for e in r}
    table = {k: f[:-4] for f, k in CORE_KINDS.items()}
    for r in rows:
        kind, _, i = r.partition(".")
        refs.setdefault(table.get(kind), set()).add(i)
    return refs


def ref_notes(table, el, refs):
    """What a core row names that doesn't exist: attributes (the app's five), a package's level, an effect's amp types and
    the effects it requires or excludes, an amp type's required effect. The engine looks all of these up by id."""
    from importer.recipes import crb_core
    attrs, notes = set(crb_core.ATTR_LETTER.values()), []

    def need(what, v, known):
        if v is not None and v not in known:
            notes.append(f'{what} "{v}" isn’t a known id')
    if table == "skills":
        for a in ("attr", "alt"):
            need(f"attribute {a}", el.get(a), attrs)
        for s in el.iter("spec"):
            need(f"attribute of {s.get('id')}", s.get("attr"), attrs)
    if table == "metatypes":
        got = [r.get("attr") for r in el.iter("range")]
        for a in got:
            need("range attribute", a, attrs)
        if sorted(got) != sorted(attrs):
            notes.append("needs one range for each attribute")
    if table == "packages":
        need("level", el.get("level"), refs.get("levels", set()))
    if table == "ampeffects":
        for t in (el.get("types") or "").split():
            need("amp type", t, refs.get("amptypes", set()))
        for a in ("requires", "excludes"):
            need(f"{a} effect", el.get(a), refs.get("ampeffects", set()) | {el.get("id")})
    if table == "amptypes":
        need("requires effect", el.get("requires"), refs.get("ampeffects", set()))
    return notes


def core_notes(table, el, refs):
    """The checks a core row gets beyond its schema, on propose and again on apply: its id, and the ids it names."""
    return id_notes(table, el.get("id")) + ref_notes(table, el, refs)


def core_entry(table, raw, source, page, seen):
    """(kind, entry id, page, entry XML, notes) for one proposed row of the core table `table`. Only the schema's
    properties are read (in its order), every value cleaned and escaped; the entry is checked against the table's schema."""
    kind, props = CORE_KINDS[f"{table}.xml"], CORE[table]["properties"]

    def val(k):
        v = raw.get(k)
        return ("true" if v else "false") if isinstance(v, bool) else _text(v)
    i = _unique(seen, kind, "core" if table == "pricing" else _id(raw.get("id") or raw.get("name")))
    p = _pos(raw.get("page")) or page
    attrs = {"id": i, **{k: val(k) for k in props if k not in ("id", "name", "page", "racialQuality", "ranges", "specs")},
             "source": source, "page": p}
    if table == "pricing":
        attrs["complexForm"] = attrs["complexForm"] or attrs["spell"]  # as the recipe does: the spell price unless printed
        attrs["refundEffectRemoval"] = "false"  # the app's default (crb_core.DEFAULTS): the book doesn't say
    rows = lambda k: [x for x in raw.get(k) if isinstance(x, dict)] if isinstance(raw.get(k), list) else []  # noqa: E731
    inner = "" if table == "pricing" else f"<name>{escape(_text(raw.get('name')) or '')}</name>"
    if table == "metatypes":
        inner += f"<racialQuality>{escape(_text(raw.get('racialQuality')) or '')}</racialQuality>" + "".join(
            "<range" + xmlio._attrs({k: _text(r.get(k)) for k in ("attr", "min", "max")}) + "/>" for r in rows("ranges"))
    if table == "skills":
        inner += "".join(_el("spec", {"id": _id(s.get("id")), "attr": _text(s.get("attr"))}, escape(_text(s.get("name")) or ""))
                         for s in rows("specs"))
    if table == "lifestyles":
        inner += "<text></text>"
    xml = f"<{kind}{xmlio._attrs(attrs)}/>" if table == "pricing" else _el(kind, attrs, inner)
    notes = schema_notes(table, xml)
    return kind, i, p, xml, notes + core_notes(table, ET.fromstring(xml), core_refs(seen))


def core_entries(obj, tables, source, page, seen):
    """The proposals of one chunk's reply for the core tables `tables`: weapons/armor rows from `items`, the rest per table."""
    items = {CORE_KINDS[f"{t}.xml"] for t in tables} & {"weapon", "armor"}
    if items:
        yield from (e for e in _entries({"items": obj.get("items")}, source, page, None, seen) if e[0] in items)
    for t in sorted(set(tables) & set(CORE)):
        for raw in obj.get(t) if isinstance(obj.get(t), list) else []:
            if isinstance(raw, dict):
                yield core_entry(t, raw, source, page, seen)


def parse(text, keys=KEYS):
    """The first JSON object in the reply with one of our top-level keys (some servers wrap it in prose
    despite JSON mode), or None."""
    text, i = text or "", 0
    while (i := text.find("{", i)) != -1:
        try:
            obj, end = json.JSONDecoder().raw_decode(text, i)
        except ValueError:
            i += 1
            continue
        if any(isinstance(obj.get(k), list) for k in keys):
            return obj
        i = end  # never look inside an object that isn't ours
    return None


def _slug(name):
    return re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-") or "unnamed"


def _unique(seen, kind, i):
    """`i`, or `i-2`, `i-3`… when the book defines the same name twice: all are kept."""
    base, k = i, 2
    while f"{kind}.{i}" in seen:
        i, k = f"{base}-{k}", k + 1
    seen.add(f"{kind}.{i}")
    return i


def _el(tag, attrs, inner=""):
    return f"<{tag}{xmlio._attrs(attrs)}>{inner}</{tag}>"


def _entries(obj, source, page, m, seen):
    """(kind, entry id, page, entry XML, notes) for each proposed entry of one chunk."""
    lists = lambda k: [x for x in obj.get(k) if isinstance(x, dict)] if isinstance(obj.get(k), list) else []
    for raw in lists("amps"):
        a, notes = _amp(raw)
        p, i = _pos(raw.get("page")) or page, _unique(seen, "amp", _slug(a["name"]))
        effects = "".join("<effect" + xmlio._attrs(e) + "/>" for e in a["effects"])
        xml = _el("amp", {"id": i, "type": a["type"], "printedRating": a["printedRating"], "source": source, "page": p},
                  f"<name>{escape(a['name'] or '')}</name>{effects}<narrative></narrative>")
        yield "amp", i, p, xml, notes + amp_notes(a, m)
    for key, fixed in (("items", None), ("spells", "spell"), ("complexForms", "complex-form")):
        for it in lists(key):
            notes, kind, category = [], fixed or _text(it.get("kind")), _text(it.get("category"))
            if kind not in ITEM_KINDS + tuple(CATEGORIES):
                notes.append(f'unknown item kind "{kind}"; proposed as gear')
                kind = "gear"
            if kind in CATEGORIES and category not in CATEGORIES[kind]:
                notes.append(f'unknown {kind} category "{category}"')
            name = _text(it.get("name"))
            p, i = _pos(it.get("page")) or page, _unique(seen, kind, PREFIX.get(kind, "") + _slug(name))
            xml = _el("item", {"id": i, "kind": kind, "category": category, "dv": _text(it.get("dv")), "armor": _pos(it.get("armor")),
                               "ranges": _text(it.get("ranges")), "source": source, "page": p},
                      f"<name>{escape(name or '')}</name><text></text>")
            yield kind, i, p, xml, notes


def _proposal(kind, i, page, xml, notes):
    return (f"  <proposal{xmlio._attrs({'id': f'{kind}.{i}', 'kind': kind, 'state': 'pending', 'page': page})}>\n    {xml}\n"
            + "".join(f"    <note>{escape(t)}</note>\n" for t in notes) + "  </proposal>\n")


def _resume(path, sha, parts):
    """(done, rows, skips, seen) from an unfinished review.xml of the same book.md, else a fresh start."""
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        return 0, [], [], set()
    if root.get("bookSha256") != sha or root.get("parts") != str(parts) or root.get("done") == str(parts):
        return 0, [], [], set()
    rows = ["  " + ET.tostring(p, encoding="unicode").strip() + "\n" for p in root.findall("proposal")]
    skips = ["  " + ET.tostring(s, encoding="unicode").strip() + "\n" for s in root.findall("skip")]
    return int(root.get("done") or 0), rows, skips, {p.get("id") for p in root.findall("proposal")}


def _finished(path):
    """The proposal count of a finished review.xml (every part done), else None."""
    try:
        root = ET.parse(path).getroot()
    except (OSError, ET.ParseError):
        return None
    return len(root.findall("proposal")) if root.get("done") and root.get("done") == root.get("parts") else None


def core_unread(book_dir):
    """{file: book.md pages} of the core tables the recipe couldn't read and the AI can propose rows for."""
    imp = xmlio.read_import(book_dir)
    rows = [] if imp is None else [r for r in imp.iter("row") if r.get("kind") == "core-unread" and r.get("file") in CORE_KINDS]
    out = {}
    for r in rows:
        a, b = map(int, (r.get("mdPages") or "0-0").split("-"))
        out[r.get("file")] = set(range(a, b + 1))
    return out


def core_chunks(md, pages):
    """The chunks that hold one of `pages` (book.md's page markers)."""
    return [c for c in chunks(md) if pages & {int(p) for p in PAGE.findall(c)}]


def propose(book_dir, ask, provider=None, data_dir=None, fresh=False, core=False):
    """Run `ask(system, user) -> str` over book.md's chunks and write review.xml; returns the proposal count.
    review.xml is rewritten after every chunk (done="n" of parts="N"), so a failure keeps the work paid
    for and a re-run of the same book.md resumes after the last finished chunk. A chunk whose reply is
    cut off or has no JSON is skipped with a <skip> note; any other ProviderError fails the book.
    A finished review.xml holds paid-for proposals and the user's decisions: it is kept, and nothing sent,
    unless `fresh` asks to replace it.
    `core`: only the pages of the core tables the book's recipe couldn't read (core_unread), only rows of those tables
    (any of the twelve), for the core files (review.xml core="true", applied by apply-review --core). It needs no core
    data, since the missing table may be one the amp checks read."""
    path = os.path.join(book_dir, "review.xml")
    if not fresh and (n := _finished(path)) is not None:
        xmlio.write_status(book_dir, "review", "Proposals from an earlier run are waiting for review; nothing was sent")
        return n
    try:
        with open(os.path.join(book_dir, "book.md"), encoding="utf8") as f:
            md = f.read()
        sha = hashlib.sha256(md.encode("utf8")).hexdigest()
        book = os.path.basename(os.path.normpath(book_dir))
        source = book.upper()  # provisional; the review screen sets it
        if core:
            unread = core_unread(book_dir)
            if not unread:
                raise ValueError("no core table of this book is waiting for the AI")
            tables = {f[:-4] for f in unread}
            source = xmlio.read_import(book_dir).get("source")
            system, parts, keys = core_prompt(tables), core_chunks(md, set().union(*unread.values())), (*tables & set(CORE), "items")
            entries = lambda obj, page: core_entries(obj, tables, source, page, seen)  # noqa: E731
        else:
            m = mechanics(data_dir)
            system, parts, keys = system_prompt(m), chunks(md), KEYS
            entries = lambda obj, page: _entries(obj, source, page, m, seen)  # noqa: E731
        done, rows, skips, seen = (0, [], [], set()) if fresh else _resume(path, sha, len(parts))
        created = datetime.now(timezone.utc).isoformat(timespec="seconds")

        def save(n):
            attrs = {"book": book, "source": source, "core": "true" if core else None, "provider": provider, "created": created,
                     "bookSha256": sha, "parts": len(parts), "done": n}
            xmlio.write_file(path, xmlio.HEAD + "<!-- PRIVATE: proposals from a book. Do not commit. -->\n"
                             f"<review{xmlio._attrs(attrs)}>\n{''.join(skips)}{''.join(rows)}</review>\n")

        for n in range(done + 1, len(parts) + 1):
            chunk = parts[n - 1]
            xmlio.write_status(book_dir, "proposing", f"part {n} of {len(parts)}")
            try:
                obj, why = parse(ask(system, chunk), keys), f"the reply had no JSON with {', '.join(sorted(keys))}"
            except TruncatedReply as e:
                obj, why = None, str(e)
            if obj is None:
                skips.append(f"  {_el('skip', {'part': n}, escape(why))}\n")
            else:
                pages = PAGE.findall(chunk)
                rows += [_proposal(*e) for e in entries(obj, int(pages[0]) if pages else 1)]
            save(n)
        if not parts:
            save(0)
        xmlio.write_status(book_dir, "review", f"{len(rows)} proposals to review")
        return len(rows)
    except Exception as e:
        xmlio.write_status(book_dir, "failed", str(e) if isinstance(e, ProviderError) else f"{type(e).__name__}: {e}")
        raise
