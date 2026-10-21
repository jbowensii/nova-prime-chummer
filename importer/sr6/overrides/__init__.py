"""Per-book override tables (importer/sr6/overrides/<recipe id>.json, lower case; absent = empty): a last resort, applied
after the import reads a book. Each row maps a Commlink6 name to our item(s), source-scoped (one table per recipe):
  {"cl6": "<Commlink6's name>", "kind": "<catalog file stem>", "ours": ["<our entry's printed name>", ...],
   "set": {"<attribute>": "<value taken from Commlink6>"}}   ("set" optional)
It adds the Commlink6 name as an <alias> child (a name only) to each entry of `ours`, and sets the listed attributes.
A row with "add" instead of "ours" CREATES an entry the books print only inside other items' text (Commlink6 has it):
  {"cl6": "<Commlink6's name>", "kind": "<catalog file stem>", "add": {"page": <int>, "attrs": {...rule data from
   Commlink6}, "kids": [{"tag": "effect|choice|alias|...", "attrs": {...}}], "name": "<optional, default cl6>"}}
id = slug(name) (scoped to the source by the importer); an id already in the file is left alone (logged). No text of
any kind is written: the entry's description, if the book has one, comes from the texts step. "text_from": "<heading
name>" (a name, never text) in an add row gives the entry the description the book's text already has under that
heading (`texts()`: the owner's PDF text of the catalog entry of that name, copied to the new entry).
A row with "id" (an entry's unscoped id, the importer's own) and "set" {"class": "<TYPE/SUBTYPE>"} sets Commlink6's
classification on that entry (rows made by tools/cl6check/classmap.py carry "gen": "class"); an id no entry has is
reported once on stderr, nothing guessed.
An id row's "kind" is the file of OUR entry; a row filed under another kind (Commlink6's: gear for a weapon accessory) lands on
the one other kind file that holds the id, and is reported when none or several do.
An id row with "gen": "errata" is written by hand, never regenerated (an errata PDF's statements the importer's per-book
runs cannot see: the No Future errata, nf.json): "set" values (null drops the attribute: a rating the errata removes), "formula"
and "effects" (a list of effect attribute dicts, each with its "target": the entry's effect of that target is
replaced), and "kids" (a <status name level> the item applies). It applies after every other id row, so it wins over
Commlink6's values.
An id row with "gen": "cl6" is an effect only Commlink6 has (the book's text states none, or states it in a form the format cannot read:
the owner's direction 2026-10-17, our reader is the primary source and Commlink6 a rare override), written by hand, never regenerated: its
"effects" (a list of effect attribute dicts, each with its "target" and "op": the entry's effect of that target and op is replaced; each is written with `gen="cl6"`, so
the app, the export and the Foundry module can tell it from the book reader's) and its "why", one line. An effect may carry "replaces"
(a target): the entry's effect of that target and this op goes instead of the one of the effect's own target (the book's words name no
test, `those tests`, and Commlink6 names the one it is for).
An id row with "gen": "book" (<recipe id>.book.json) is a correction of what the book's text says that no reader rule in effects.py expresses
(the effects review of 2026-10-18: one confirmed fact about one entry), kept few, each with its "why" in one line naming the review's findings.
Its "effects" are written with `gen="book"` and REPLACE the entry's reader effects of the same target and operation (as a Commlink6 row's do; a row
with "keep": true adds only what is not there), one already there is not added twice; an effect with "keep": true is a reader effect the row restates
so the replacement leaves it (written without the mark); its "drops" are further effects to take out (a dict of target,
op, value, switch, when, spec, affects, from: those equal, the ones it leaves out absent; one that matches nothing is reported, UNMATCHED_DROPS); its
"kids" are links to add. Most of the rows were GENERATED from the review's findings against the reader of the day (the review's scripts, not in the
repository), a few written by hand; regenerate them when the reader changes, and prefer a rule in effects.py to a row.
An id row with "gen": "owner" is the owner's correction of a book's misprint, by hand, never regenerated: its "kids" may
carry "replaces" {"<attribute>": "<value>"}, the entry's child of the kid's tag with those attributes replaced in place
(a name the book prints that is no entry: Nibiinaabe's gained power `Darkness`, a spell, is the critter power
`Innate Spell (Darkness)`, swc.json); a child it doesn't find is reported, nothing added. An owner row may also "set"
values (and a "formula") as a value row does, its stale <formula>/<issue>/<found> children going the same way; its "note"
says why (`range not printed; CL6 value, owner-accepted`). valuemap.py regenerates "value" rows only, so these stay.
An id row with "gen": "value" or "family" (made by tools/cl6check/valuemap.py and familymap.py) sets printed values taken from Commlink6 (VALUE_ATTRS:
cost, avail, karma, dv, ar …; the owner's rule: where the book and the reviewers could not confirm ours) and optional
"formula" {"<field>": "<expr>"} (a per-rating table as a tier(), see docs/sr6-data-format.md). The entry's own <formula>,
<issue> and <found> children for each field set go (they described the value being replaced). A "note" on the row
(why the value is the table's: `range not printed; CL6 value`) is for the table's reader, never applied.
Further ops on the entries of a kind, by their unscoped id (docs/sr6-data-format.md):
  {"kind","id","remove":true}                     the entry goes (its aliases with it, its text in `texts()`)
  {"kind","merge":{"into","from","from_kind"}}    the attributes `into` lacks come from `from` (the table's copy), which goes
  {"kind","id","rename":"<name>"}                 a new name (names only); the old one stays as an alias unless "alias": false
  {"move_kind":{"id","from","to"}}                the entry re-filed in another kind's file (gear -> weapons: a melee weapon; armor -> gear)
  {"kind","id","notext":true}                     no description: the book prints none for it, and a text the import gave
                                                  it from elsewhere (effects.py: a rule whose name holds its words) goes
  {"kind","id","split":[{"id","name","set"?,"note"?}]}  the entry becomes one entry per part (a row the book prints once for several
                                                  things): a copy with the part's id and name, "set" values (VALUE_ATTRS, null drops
                                                  one; their formula/issue go),
                                                  "note" {"field","text"} (the printed rule the value comes from); the book's text goes to each
An attribute the entry's kind schema lacks (class on a rules entry, social on gear) is skipped with one stderr line per row, and
an id row is never refiled to a kind whose schema lacks its attributes (allowed(), fit()).
A description is never an override: "set" and "add" refuse a text field. See docs/sr6-data-format.md.

The package: rules (check: what a row may say), schema (allowed, fit: what a kind's schema lets a row write), xmlops (the
rows applied to the xml, dump). This module loads a book's table (table) and applies it (apply, texts); it re-exports
the names the importer, its tests and tools/ use (tools/cl6effects/rebuild.py imports `importer.sr6.overrides` by name,
from older trees too)."""

import json
import re
import sys
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr, unescape

from importer import xmlio
from importer.sr6.ids import slug
from importer.sr6.regroup import norm
from importer.sr6.resolve import add_kid

from .rules import OPS, check
from .schema import allowed, fit
from .xmlops import UNMATCHED_DROPS, _add, _ops, _set_by_id, dump

DIR = Path(__file__).parent  # (this folder: the <recipe id>.json and <recipe id>.book.json tables)
__all__ = ["DIR", "OPS", "UNMATCHED_DROPS", "allowed", "apply", "check", "dump", "fit", "table", "texts"]


def texts(recipe_id, files, texts_xml, rows=None):
    """texts_xml (the book's texts file, ids unscoped) with a <text> for each add row that has "text_from": the text the
    book already has for the catalog entry of that name, under the new entry's kind and id; and without the text of an
    entry a remove or merge row took out, or a notext row says the book prints none for. Nothing is invented: no such heading or no text for it leaves the entry without
    one (reported on stderr)."""
    every = table(recipe_id) if rows is None else check(rows)
    rows = [r for r in every if r.get("add", {}).get("text_from")]
    splits = [r for r in every if r.get("split")]
    gone = {(r["kind"], r["id"]) for r in every if r.get("remove") or r.get("notext") or r.get("split")} | {
        (r["merge"].get("from_kind", r["kind"]), r["merge"]["from"]) for r in every if "merge" in r
    }
    if not texts_xml or not (rows or gone):
        return texts_xml
    own = {(of, i): t for of, i, t in xmlio.texts_entries(texts_xml)}
    copies = "".join(
        f"  <text of={quoteattr(r['kind'])} id={quoteattr(p['id'])}>{escape(own[r['kind'], r['id']])}</text>{chr(10)}"
        for r in splits
        if (r["kind"], r["id"]) in own
        for p in r["split"]
        if (r["kind"], p["id"]) not in own
    )  # (a split's parts: the source's text each)
    for of, i in gone:
        texts_xml = re.sub(
            r"[ \t]*<text of=%s id=%s>.*?</text>\n?" % (re.escape(quoteattr(of)), re.escape(quoteattr(i))),
            "",
            texts_xml,
            flags=re.S,
        )
    have = {(of, i): t for of, i, t in xmlio.texts_entries(texts_xml)}
    heads = {}
    for fname, xml in files.items():
        for m in re.finditer(r'<\w+ id="([^"]+)"[^>]*><name>([^<]*)</name>', xml or ""):
            heads.setdefault(norm(unescape(m.group(2))), (fname[:-4], m.group(1)))
    add = copies
    for r in rows:
        a = r["add"]
        new = (r["kind"], slug(a.get("name", r["cl6"])))
        src = have.get(heads.get(norm(a["text_from"])))
        if new in have:
            continue
        if not src:
            print(f"override {r['cl6']}: no text under {a['text_from']!r}", file=sys.stderr)
            continue
        add += f"  <text of={quoteattr(new[0])} id={quoteattr(new[1])}>{escape(src)}</text>{chr(10)}"
    i = texts_xml.rindex("</sr6:data>")
    return texts_xml[:i] + add + texts_xml[i:]


def table(recipe_id):
    """The book's rows: its Commlink6 name table (`<id>.json`) and its book corrections (`<id>.book.json`, "gen": "book")."""
    rows = []
    for name in (f"{(recipe_id or '').lower()}.json", f"{(recipe_id or '').lower()}.book.json"):
        p = DIR / name
        if p.is_file():
            rows += json.loads(p.read_text(encoding="utf8"))
    return check(rows) if rows else []


def apply(recipe_id, files, rows=None):
    """files ({<kind>.xml: xml}) with the recipe's override rows applied."""
    rows = table(recipe_id) if rows is None else check(rows)
    if not rows:
        return files
    from lxml import etree

    out = dict(files)
    for r in rows:
        if "id" in r or any(k in r for k in OPS):
            continue
        name = f"{r['kind']}.xml"
        if "add" in r:
            _add(out, name, r, recipe_id.upper() if recipe_id else None)
            continue
        if not out.get(name):
            print(f"override {r['cl6']}: no {name}", file=sys.stderr)
            continue
        root = etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", out[name]).encode("utf8"))
        sets = (fit([r]) or [{}])[0].get("set", {}) if r.get("set") else {}
        for want in r["ours"]:
            hit = [e for e in root if isinstance(e.tag, str) and norm(e.findtext("name") or "") == norm(want)]
            if not hit:
                print(f"override {r['cl6']}: no {want!r} in {name}", file=sys.stderr)
            for e in hit:
                have = {norm(a.text or "") for a in e.findall("alias")} | {norm(e.findtext("name") or "")}
                if norm(r["cl6"]) not in have:
                    add_kid(e, "alias", {}, r["cl6"])  # (before the entry's text, after its other aliases)
                for k, v in sets.items():
                    e.set(k, str(v))
        out[name] = dump(out[name], root)
    _ops(out, [r for r in rows if any(k in r for k in ("remove", "merge", "split"))])
    _set_by_id(
        out,
        [
            r
            for r in rows
            if "id" in r
            and ("set" in r or "kids" in r or "effects" in r or "drops" in r)
            and not any(k in r for k in OPS)
        ],
    )  # (after the adds: a created entry takes its class too)
    _ops(out, [r for r in rows if any(k in r for k in ("rename", "move_kind"))])
    return out
