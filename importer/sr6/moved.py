"""Old ids keep loading (owner decision D2). When a re-import renames, moves or re-kinds an entry, its new entry gets an
`<alias id="<old id>" kind="<old kind>"/>` child: the app's catalog resolves the old id to it (src/sr6/engine/load.ts),
and a saved runner's old ids are turned into the new ones on load (src/sr6/engine/migrate.ts).

The previous import of the source (its folder, read before this import replaces it) is the record of the old ids. An
old entry whose (kind, id) the new import no longer has is matched with the new entries this import added (same
source, any kind), by its names (its name and its name aliases) against theirs, in tiers; the first tier with exactly
one match wins:
1. the same words, once a rating range printed in the name ('(1-4)', '(Rating 1-6)'), case, punctuation and a plural
   s are set aside ('Spy Tag' -> 'Spy Tags', 'X (Y (1-4))' -> 'X (Y)', 'APDS' gear -> 'APDS' ammunition type);
2. the new name ends with the old one's words (a maker's name added: 'GE Vindicator' -> 'Ares-GE Vindicator');
3. the old name abbreviates the new one's words ('Laser mic' -> 'Laser microphone');
3a. the old name is the new one plus a qualifier the new reads as a field ('Ascalon Rail Gun (Assault Cannon)' ->
   'Ascalon Rail Gun', its type now `Assault Cannon`);
4. an old name naming several (`A and B`, `A, B`, `A/B C`) whose every part is a new entry's name: the old id goes to
   the first;
5. the new name starts with the old one's words (a name now printed whole: `Ordo` -> `Ordo Field Operative`); several
   such (the old item split into its variants, `Silver Bullets` -> `(copper)`, `(silver)`, `(gold)`): the first;
6. a row renamed: the same kind, page and printed values, a word of four letters or more shared (`Anthroform Arms and Legs (Level 1)` read under a sidebar's
   heading -> `Life Safety System (Level 1)`);
7. a level renamed with its heading: the same kind, page and qualifier (`Ejection Seat (Version 2 (…))` ->
   `Extreme Interior Security (Version 2 (…))`);
8. re-kinded to an entry of another kind the old import had too (`Burning Down Divinity`, an action, now a rule);
8a. merged into an entry of its kind the old import had too, its name now that one's alias (a path step read
   twice, `Obsession: Consumed` beside `Consumed`, now one entry);
9. on its page, the old name's words inside one new entry's (`De`, a split stat block's half -> `Saul De Haro`).
A tier matching several new entries keeps those of the old entry's category, when that leaves one (`Armor` in the
cyberlimb accessories and in another accessory category: two items, the second id now naming its category; a category
renamed with its title, `cyberlimb-accessories` -> `Cyberlimb accessory`, compares by its words).
An old entry's own id aliases go with it, so a chain of re-imports keeps every old id."""
import os
import re

from lxml import etree

from importer.sr6 import categories

RANGE = re.compile(r"\(\s*(?:rating\s*)?\d+\s*[-‐-―]\s*\d+\s*\)", re.I)


def words(name):
    ws = re.findall(r"[a-z0-9]+", RANGE.sub(" ", name.casefold()))
    return tuple(w[:-1] if len(w) > 3 and w.endswith("s") and not w.endswith("ss") else w for w in ws)


def _abbrev(old, new):
    """Each new word starts with the next old word, or several ('omni directional mic' -> 'omnidirectional
    microphone')."""
    i = 0
    for w in new:
        if i >= len(old) or not w.startswith(old[i]):
            return False
        rest, i = w[len(old[i]):], i + 1
        while rest and i < len(old) and rest.startswith(old[i]):
            rest, i = rest[len(old[i]):], i + 1
    return i == len(old) and old != new


TIERS = (lambda o, n: o == n, lambda o, n: len(n) > len(o) and n[-len(o):] == o, _abbrev,
         lambda o, n: len(o) > len(n) and o[:len(n)] == n,
         lambda o, n: len(n) > len(o) and n[:len(o)] == o)  # (5. a name now printed whole: `Ordo` -> `Ordo Field Operative`)
_SAME = ("page", "avail", "cost", "slots", "essence", "rating", "capacity", "dv", "ar")  # what a renamed row keeps


def _slashed(name):
    """`Sinister/dexter coprocessor` -> [`Sinister coprocessor`, `dexter coprocessor`]; [] for no one-word slash pair."""
    m = re.fullmatch(r"(.*?)\b(\w+)/(\w+)\b(.*)", name or "")
    return [f"{m.group(1)}{m.group(2)}{m.group(4)}", f"{m.group(1)}{m.group(3)}{m.group(4)}"] if m else []


def _sig(el):
    """A row's printed values on its page (a renamed row keeps them: `Anthroform Arms and Legs (Level 1)`, read under the
    wrong heading, is `Life Safety System (Level 1)`), or None when it prints fewer than two."""
    vals = tuple(el.get(a) or "" for a in _SAME)
    return vals if vals[0] and sum(1 for v in vals[1:] if v) >= 2 else None


def _qualifier(name):
    m = re.search(r"\(([^()]*(?:\([^()]*\))?[^()]*)\)\s*$", name or "")
    return m.group(1) if m and len(m.group(1).split()) >= 2 else None


def _cat(c):
    """A category, old (`cyberlimb-cost-and-capacity`) or new (`Cyberlimb`), as its words compare."""
    return categories.key(categories.category_name((c or "").replace("-", " ")) or "")


def _entries(xml_or_tree):
    root = xml_or_tree if not isinstance(xml_or_tree, str) else etree.fromstring(xml_or_tree.encode("utf8"))
    kind = root.get("kind")
    return kind, [el for el in root if isinstance(el.tag, str) and el.get("id") and not el.tag.endswith("remove")]


def _names(el):
    return [el.findtext("name") or ""] + [a.text or "" for a in el.findall("alias") if a.get("id") is None and a.text]


def previous(folder):
    """{(kind, id): (names, [(kind, id) of its id aliases], category)} of the import in `folder` (empty when there is
    none)."""
    out = {}
    if not os.path.isdir(folder):
        return out
    for f in sorted(os.listdir(folder)):
        if not f.endswith(".xml"):
            continue
        try:
            kind, els = _entries(etree.parse(os.path.join(folder, f)).getroot())
        except etree.XMLSyntaxError:
            continue
        for el in els:
            out[(kind, el.get("id"))] = (_names(el), [(a.get("kind") or kind, a.get("id")) for a in el.findall("alias")
                                                     if a.get("id")], _cat(el.get("category")), _sig(el), el.get("page"))
    return out


def carry(prev, files):
    """`files` ({name: xml}, ids scoped) with the id aliases of `prev` (previous()) added; returns the new dict and the
    count of old ids that found a new entry."""
    trees = {n: etree.fromstring(x.encode("utf8")) for n, x in files.items()}
    new = {}
    for root in trees.values():
        kind, els = _entries(root)
        for el in els:
            new[(kind, el.get("id"))] = el
    added = [(k, el, [words(n) for n in _names(el)]) for k, el in new.items() if k not in prev]
    give = {}  # new key -> [(kind, id)]
    for old, (names, olds, *more) in prev.items():
        cat, sig, page = (more + [None, None, None])[:3]
        cat = [cat] if cat is not None else []
        if old in new:
            target = old
        else:
            ows = [words(n) for n in names if words(n)]
            target = None
            for test in TIERS:
                hits = {k for k, _, nws in added if any(test(o, n) for o in ows for n in nws)}
                if len(hits) > 1 and cat and cat[0]:  # (the same name in several categories: the old one's)
                    hits = {k for k in hits if _cat(new[k].get("category")) == cat[0]} or hits
                if hits:
                    target = hits.pop() if len(hits) == 1 else None
                    break
            if target is None:  # (a heading naming two read as two: the first of them; `A/B C` -> `A C`, `B C`)
                split = [x for n in names for x in (_slashed(n) or re.split(r"\s+and\s+|\s*,\s*", n))]
                parts = [words(p) for p in split if words(p)]
                found = [next((k for k, _, nws in added if p in nws), None) for p in parts]
                target = found[0] if len(parts) > 1 and all(found) else None
            if target is None:  # 5b. the old name split into its variants (`Silver Bullets` -> `(copper)`, …): the first
                hits = [k for k, _, nws in added if any(len(n) > len(o) and n[:len(o)] == o for o in ows for n in nws)]
                target = hits[0] if len(hits) > 1 else None
            if target is None and sig:  # 6. a row renamed, its printed values and page the same, a word shared
                long = {w for o in ows for w in o if len(w) >= 4}
                hits = {k for k, el, nws in added if k[0] == old[0] and _sig(el) == sig and long & {w for n in nws for w in n}}
                target = hits.pop() if len(hits) == 1 else None
            if target is None and (q := _qualifier(names[0])):  # 7. a level renamed with its heading: `(Version 2 (…))`
                hits = {k for k, el, _ in added if k[0] == old[0] and el.get("page") == page
                        and _qualifier(el.findtext("name")) == q}
                target = hits.pop() if len(hits) == 1 else None
            if target is None and page:  # 9. a name now printed whole around it, on its page (`De` -> `Saul De Haro`)
                hits = {k for k, el, nws in added if k[0] == old[0] and el.get("page") == page
                        and any(o and set(o) <= set(n) for o in ows for n in nws)}
                target = hits.pop() if len(hits) == 1 else None
            if target is None:  # 8a. merged into an entry the old import had too, its name now that one's alias (a
                # path step read twice, `Obsession: Consumed` and `Consumed`, now one entry)
                hits = {k for k, el in new.items() if k[0] == old[0] and any(words(n) in ows for n in _names(el)[1:] if words(n))}
                target = hits.pop() if len(hits) == 1 else None
            if target is None:  # 8. re-kinded to an entry the old import had too (an action read as a rule now)
                hits = {k for k, el in new.items() if k[0] != old[0] and any(words(n) in ows for n in _names(el) if words(n))}
                target = hits.pop() if len(hits) == 1 else None
            if target is None:
                continue
        give.setdefault(target, []).extend(([] if old == target else [old]) + olds)
    n = 0
    for (kind, eid), olds in give.items():
        el = new[(kind, eid)]
        have = {(a.get("kind") or kind, a.get("id")) for a in el.findall("alias") if a.get("id")}
        for ok, oid in dict.fromkeys(olds):
            if (ok, oid) in have or (ok, oid) == (kind, eid):
                continue
            a = etree.Element("alias", {"id": oid, **({"kind": ok} if ok != kind else {})})
            t = el.find("text")
            if t is not None:
                t.addprevious(a)
            else:
                el.append(a)
            have.add((ok, oid))
            n += 1
    out = {}
    for name, x in files.items():
        if any(a.get("id") for a in trees[name].iter("alias")):
            head = x[:re.search(r"<(?![?!])", x).start()]  # the declaration and the comments before the root
            out[name] = head + etree.tostring(trees[name], encoding="unicode") + "\n"
        else:
            out[name] = x
    return out, n
