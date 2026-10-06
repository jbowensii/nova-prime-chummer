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
3. the old name abbreviates the new one's words ('Laser mic' -> 'Laser microphone').
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


TIERS = (lambda o, n: o == n, lambda o, n: len(n) > len(o) and n[-len(o):] == o, _abbrev)


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
                                                     if a.get("id")], _cat(el.get("category")))
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
    for old, (names, olds, *cat) in prev.items():
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
