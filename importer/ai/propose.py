"""AI proposals for a book no recipe knows: split book.md by headings, ask the model for each chunk's
amps, items, spells and complex forms (schema.py), check each against the shipped mechanics with
the reference rules of tools/validate-data.mjs, and write library/<id>/review.xml for the user."""
import json
import os
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from xml.sax.saxutils import escape

from importer import xmlio
from importer.ai.providers import ProviderError
from importer.ai.schema import SCHEMA

DATA = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data")
LIMIT = 12000
HEADING = re.compile(r"^#{1,2} ", re.M)
PAGE = re.compile(r"<!-- page (\d+) -->")
PREFIX = {"spell": "spell-", "complex-form": "cf-", "gear": "gear-"}  # as the shipped files name them


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


def mechanics(data_dir=DATA):
    def ids(name, tag):
        return {e.get("id") for e in ET.parse(os.path.join(data_dir, name)).getroot() if e.tag == tag}
    effects = {e.get("id"): e for e in ET.parse(os.path.join(data_dir, "ampeffects.xml")).getroot() if e.tag == "effect"}
    skills = ET.parse(os.path.join(data_dir, "skills.xml")).getroot()
    return {"effects": effects, "amptypes": ids("amptypes.xml", "amptype"), "attributes": ids("attributes.xml", "attribute"),
            "skills": {s.get("id") for s in skills.iter("skill")}, "specs": {s.get("id") for s in skills.iter("spec")}}


def amp_notes(amp, m):
    """validate-data.mjs's amp checks: the type, each effect ref, and rr-skill/rr-spec/rr-attr params."""
    notes = [] if amp.get("type") in m["amptypes"] else [f'unknown amp type "{amp.get("type")}"']
    for e in amp.get("effects") or []:
        ref, param = e.get("ref"), e.get("param")
        if ref not in m["effects"]:
            notes.append(f'unknown effect ref "{ref}"')
        elif param is None:
            continue  # an open pick: the player chooses in the Amp Builder
        elif ref == "rr-skill" and param not in m["skills"]:
            notes.append(f'unknown skill "{param}" for rr-skill')
        elif ref == "rr-spec" and param not in m["specs"] and not str(param).startswith("custom:"):
            notes.append(f'unknown specialization "{param}" for rr-spec')
        elif ref == "rr-attr" and param not in m["attributes"]:
            notes.append(f'unknown attribute "{param}" for rr-attr')
    return notes


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
Spell categories: combat, detection, health, illusion, manipulation. Complex form categories: sustained, instant."""


def parse(text):
    """The first JSON object in the reply (some servers wrap it in prose despite JSON mode), or None."""
    for i in [m.start() for m in re.finditer(r"\{", text or "")]:
        try:
            obj = json.JSONDecoder().raw_decode(text, i)[0]
            return obj if isinstance(obj, dict) else None
        except ValueError:
            continue
    return None


def _slug(name):
    return re.sub(r"[^a-z0-9]+", "-", str(name or "").lower()).strip("-") or "unnamed"


def _pos(v):
    return v if isinstance(v, int) and not isinstance(v, bool) and v > 0 else None


def _unique(seen, kind, i):
    """`i`, or `i-2`, `i-3`… when the book defines the same name twice: all are kept."""
    base, k = i, 2
    while f"{kind}.{i}" in seen:
        i, k = f"{base}-{k}", k + 1
    seen.add(f"{kind}.{i}")
    return i


def _entries(obj, source, page, m, seen):
    """(kind, entry id, page, entry XML, notes) for each proposed entry of one chunk."""
    lists = lambda k: [x for x in obj.get(k) or [] if isinstance(x, dict)]
    for a in lists("amps"):
        p, i = _pos(a.get("page")) or page, _unique(seen, "amp", _slug(a.get("name")))
        effects = "".join("<effect" + xmlio._attrs({"ref": e.get("ref"), "param": e.get("param"), "value": _pos(e.get("value")),
                                                    "note": e.get("note")}) + "/>" for e in a.get("effects") or [] if isinstance(e, dict))
        rating = a.get("printedRating") if isinstance(a.get("printedRating"), int) else None
        attrs = xmlio._attrs({"id": i, "type": a.get("type"), "printedRating": rating, "source": source, "page": p})
        yield "amp", i, p, f"<amp{attrs}><name>{escape(str(a.get('name') or ''))}</name>{effects}<narrative></narrative></amp>", amp_notes(a, m)
    for k, kind in (("items", None), ("spells", "spell"), ("complexForms", "complex-form")):
        for it in lists(k):
            kd = kind or it.get("kind")
            notes = [] if kd in ("gear", "weapon", "armor", "spell", "complex-form") else [f'unknown item kind "{kd}"']
            p, i = _pos(it.get("page")) or page, _unique(seen, kd, PREFIX.get(kd, "") + _slug(it.get("name")))
            attrs = xmlio._attrs({"id": i, "kind": kd, "category": it.get("category"), "dv": it.get("dv"),
                                  "armor": _pos(it.get("armor")), "ranges": it.get("ranges"), "source": source, "page": p})
            yield kd, i, p, f"<item{attrs}><name>{escape(str(it.get('name') or ''))}</name><text></text></item>", notes


def propose(book_dir, ask, provider=None, data_dir=DATA):
    """Run `ask(system, user) -> str` over book.md's chunks and write review.xml; returns the proposal count.
    A chunk whose reply has no JSON object is skipped and counted; a ProviderError fails the book."""
    try:
        m = mechanics(data_dir)
        with open(os.path.join(book_dir, "book.md"), encoding="utf8") as f:
            md = f.read()
        source = os.path.basename(os.path.normpath(book_dir)).upper()  # provisional; the review screen sets it
        system, parts, seen, rows, skipped = system_prompt(m), chunks(md), set(), [], 0
        for n, chunk in enumerate(parts, 1):
            xmlio.write_status(book_dir, "proposing", f"part {n} of {len(parts)}")
            obj = parse(ask(system, chunk))
            if obj is None:
                skipped += 1
                continue
            pages = PAGE.findall(chunk)
            for kind, i, page, xml, notes in _entries(obj, source, int(pages[0]) if pages else 1, m, seen):
                rows.append(f'  <proposal id="{kind}.{i}" kind="{kind}" state="pending" page="{page}">\n    {xml}\n'
                            + "".join(f"    <note>{escape(t)}</note>\n" for t in notes) + "  </proposal>\n")
        attrs = xmlio._attrs({"book": os.path.basename(os.path.normpath(book_dir)), "source": source, "provider": provider,
                              "created": datetime.now(timezone.utc).isoformat(timespec="seconds"), "skipped": skipped})
        xmlio.write_file(os.path.join(book_dir, "review.xml"), xmlio.HEAD + "<!-- PRIVATE: proposals from a book. Do not commit. -->\n"
                         f"<review{attrs}>\n{''.join(rows)}</review>\n")
        xmlio.write_status(book_dir, "review", f"{len(rows)} proposals to review")
        return len(rows)
    except Exception as e:
        xmlio.write_status(book_dir, "failed", str(e) if isinstance(e, ProviderError) else f"{type(e).__name__}: {e}")
        raise
