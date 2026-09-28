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

from importer import DATA_DIR, xmlio
from importer.ai.providers import ProviderError, TruncatedReply
from importer.ai.schema import SCHEMA

DATA = DATA_DIR
LIMIT = 12000
HEADING = re.compile(r"^#{1,2} ", re.M)
PAGE = re.compile(r"<!-- page (\d+) -->")
PREFIX = {"spell": "spell-", "complex-form": "cf-", "gear": "gear-"}  # as the shipped files name them
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


def mechanics(data_dir=DATA):
    def ids(name, tag):
        return {e.get("id") for e in ET.parse(os.path.join(data_dir, name)).getroot() if e.tag == tag}
    effects = {e.get("id"): e for e in ET.parse(os.path.join(data_dir, "ampeffects.xml")).getroot() if e.tag == "effect"}
    skills = ET.parse(os.path.join(data_dir, "skills.xml")).getroot()
    return {"effects": effects, "amptypes": ids("amptypes.xml", "amptype"), "attributes": ids("attributes.xml", "attribute"),
            "skills": {s.get("id") for s in skills.iter("skill")}, "specs": {s.get("id") for s in skills.iter("spec")}}


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


def parse(text):
    """The first JSON object in the reply with one of our top-level keys (some servers wrap it in prose
    despite JSON mode), or None."""
    text, i = text or "", 0
    while (i := text.find("{", i)) != -1:
        try:
            obj, end = json.JSONDecoder().raw_decode(text, i)
        except ValueError:
            i += 1
            continue
        if any(isinstance(obj.get(k), list) for k in KEYS):
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


def propose(book_dir, ask, provider=None, data_dir=DATA, fresh=False):
    """Run `ask(system, user) -> str` over book.md's chunks and write review.xml; returns the proposal count.
    review.xml is rewritten after every chunk (done="n" of parts="N"), so a failure keeps the work paid
    for and a re-run of the same book.md resumes after the last finished chunk. A chunk whose reply is
    cut off or has no JSON is skipped with a <skip> note; any other ProviderError fails the book.
    A finished review.xml holds paid-for proposals and the user's decisions: it is kept, and nothing sent,
    unless `fresh` asks to replace it."""
    path = os.path.join(book_dir, "review.xml")
    if not fresh and (n := _finished(path)) is not None:
        xmlio.write_status(book_dir, "review", "Proposals from an earlier run are waiting for review; nothing was sent")
        return n
    try:
        m = mechanics(data_dir)
        with open(os.path.join(book_dir, "book.md"), encoding="utf8") as f:
            md = f.read()
        sha = hashlib.sha256(md.encode("utf8")).hexdigest()
        book = os.path.basename(os.path.normpath(book_dir))
        source = book.upper()  # provisional; the review screen sets it
        system, parts = system_prompt(m), chunks(md)
        done, rows, skips, seen = (0, [], [], set()) if fresh else _resume(path, sha, len(parts))
        created = datetime.now(timezone.utc).isoformat(timespec="seconds")

        def save(n):
            attrs = {"book": book, "source": source, "provider": provider, "created": created, "bookSha256": sha,
                     "parts": len(parts), "done": n}
            xmlio.write_file(path, xmlio.HEAD + "<!-- PRIVATE: proposals from a book. Do not commit. -->\n"
                             f"<review{xmlio._attrs(attrs)}>\n{''.join(skips)}{''.join(rows)}</review>\n")

        for n in range(done + 1, len(parts) + 1):
            chunk = parts[n - 1]
            xmlio.write_status(book_dir, "proposing", f"part {n} of {len(parts)}")
            try:
                obj, why = parse(ask(system, chunk)), "the reply had no JSON with amps, items, spells or complexForms"
            except TruncatedReply as e:
                obj, why = None, str(e)
            if obj is None:
                skips.append(f"  {_el('skip', {'part': n}, escape(why))}\n")
            else:
                pages = PAGE.findall(chunk)
                rows += [_proposal(*e) for e in _entries(obj, source, int(pages[0]) if pages else 1, m, seen)]
            save(n)
        if not parts:
            save(0)
        xmlio.write_status(book_dir, "review", f"{len(rows)} proposals to review")
        return len(rows)
    except Exception as e:
        xmlio.write_status(book_dir, "failed", str(e) if isinstance(e, ProviderError) else f"{type(e).__name__}: {e}")
        raise
