"""Powers a book describes under a heading of their own. A creature's `Powers` line names powers; most are defined as
critter powers, qualities or bioware. One a book describes in a section of its own (`Tech Infestation` and `Mental
Attribute Boost` under a monad chapter's headings, `Wild Spirits` under the dinosaur spirits that name `Wild Spirit`) is
a rule section there, and the stat block's name links to nothing. This pass, over every source on disk, makes such a
section a critter power of that source, with the section's text: for each power a stat block names that no kind defines,
the rules section of that name (or its plural). The entries are in the file `section-powers.xml` of the section's
source, their texts in its texts file; both are made afresh each time (a power a later book defines leaves them, a
book removed takes its sections with it). The pass reads the files the books wrote, so it runs after any book is
imported or removed (run.py), whatever the order. A power no book describes is left as the stat block prints it."""

import difflib
import os
import re
from xml.sax.saxutils import escape, quoteattr

from importer import xmlio
from importer.sr6 import ROOT
from importer.sr6.ids import slug
from importer.sr6.regroup import norm

FILE = "section-powers.xml"
ID_PREFIX = "section-"  # (their own ids, so none is a real entry's: `cln.section-tech-infestation`)
# the kinds whose entries a stat block's power may be (a name any of them has needs no section)
DEFINED = {
    "critterpowers",
    "adeptpowers",
    "qualities",
    "augmentations",
    "spells",
    "rituals",
    "complexforms",
    "echoes",
    "metamagics",
}
BEINGS = {"critters", "spirits", "npcs", "sprites"}
LISTS = ("powers", "optionalPowers")
# a chapter of a book that describes beings and their powers (a section there that a stat block names is a power; so is
# one in the book of the stat block)
POWER_CHAPTER = re.compile(r"monad|critter|spirit|sprite|beast|creature|power", re.I)
SAME = 0.75  # (a name this alike an entry's is that entry's, as the app links it: `Natural Weapons`, `Wall Walk`)


def _key(s):
    return re.sub(r"[^a-z0-9]", "", norm(s))


def power_names(value):
    """The powers a list prints as (name, name with its bracket): each without its rating and footnote marks."""
    items, depth, cur = [], 0, ""
    for ch in value or "":
        depth += (ch in "([") - (ch in ")]" and depth > 0)
        if ch == "," and not depth:
            items.append(cur)
            cur = ""
        else:
            cur += ch
    out = []
    for item in [*items, cur]:
        whole = re.sub(r"[\s*†‡]*(?:\d+(?:\.\d+)?)?[\s*†‡]*$", "", item.strip())
        name = re.sub(r"\s*[(\[].*$", "", whole).strip()
        if re.fullmatch(r"[A-Za-z][A-Za-z' -]{2,40}", name):
            out.append((name, whole))
    return out


def _sources(root):
    return sorted(s for s in os.listdir(root) if os.path.isdir(os.path.join(root, s)) and s != "core")


def _texts_path(custom_dir, src):
    return os.path.join(custom_dir, "texts", f"{src}.xml")


def _read_texts(path):
    """{(of, id): text} of a texts file; {} when there is none. Raises on a corrupt one."""
    if not os.path.isfile(path):
        return {}
    with open(path, encoding="utf8") as f:
        return {(of, i): t for of, i, t in xmlio.texts_entries(f.read())}


def _texts_xml(entries):
    """A texts file's text holding these {(of, id): text}."""
    start, end = xmlio.data_root("texts", ROOT)
    body = "".join(
        f"  <text of={quoteattr(of)} id={quoteattr(i)}>{escape(t)}</text>\n" for (of, i), t in entries.items()
    )
    return xmlio.HEAD + "<!-- PRIVATE: book text. Do not commit. -->\n" + start + body + end


def section_powers(custom_dir):
    """Write (or remove) every source's `section-powers.xml` and its texts; the number of powers made. Everything is
    worked out before anything is written, so a corrupt file leaves the files as they were."""
    root = os.path.join(custom_dir, "imported")
    if not os.path.isdir(root):
        return 0
    defined, used, rules = set(), {}, {}  # keys of defined names; key -> first stat block; key -> its rules sections
    users = {}  # key -> the sources whose stat blocks print it
    for src in _sources(root):
        for f in sorted(os.listdir(os.path.join(root, src))):
            if f[:-4] not in DEFINED | BEINGS | {"rules"} or not f.endswith(".xml"):  # (a kind's file is named for it)
                continue
            tree = xmlio.ET.parse(os.path.join(root, src, f)).getroot()
            kind = tree.get("kind")
            for el in tree:
                if kind in DEFINED:
                    defined.update(
                        _key(n.text or "") for n in el.iter() if n.tag in ("name", "alias") and n.get("id") is None
                    )
                elif kind == "rules":
                    rules.setdefault(_key(el.findtext("name") or ""), []).append((src, el))
                elif kind in BEINGS:
                    for tag in LISTS:
                        for name, whole in power_names(el.findtext(tag)):
                            used.setdefault(_key(name), (name, whole))
                            users.setdefault(_key(name), set()).add(src)
    keys = sorted(defined)

    def known(name, whole):
        if _key(whole) in defined:  # (`Heavy Scales (Western Drake)`: a book's name with its bracket)
            return True
        words = name.split()
        # (the whole name, or its first words: `Immunity to fire`, `Sapience digital assault`)
        if any(_key(" ".join(words[:n])) in defined for n in range(len(words), 0, -1)):
            return True
        k = _key(name)
        for d in keys:
            like = difflib.SequenceMatcher(None, k, d)
            if like.real_quick_ratio() >= SAME and like.ratio() >= SAME:
                return True
        return False

    made = (
        {}
    )  # source -> {id: (name, rule element)}: a section once, whether the stat blocks print it singular or plural
    for key, (name, whole) in sorted(used.items()):
        section = rules.get(key) or rules.get(key + "s")  # (`Wild Spirit`: the section `Wild Spirits`)
        if section and not known(name, whole):
            for src, rule in section:  # (every book's: the app takes the NPC's own, then the latest printing)
                if src not in users[key] and not POWER_CHAPTER.search(rule.get("chapter") or ""):
                    continue  # (a generic section, `Armor` in a gear chapter, is no power's)
                made.setdefault(src, {}).setdefault(f"{src}.{ID_PREFIX}{slug(name)}", (name, rule))
    texts = {src: _read_texts(_texts_path(custom_dir, src)) for src in _sources(root)}
    plan = {}  # source -> (section-powers.xml text or None, texts file text or None)
    for src in _sources(root):
        path = os.path.join(root, src, FILE)
        old = set()
        if os.path.isfile(path):
            old = {("critterpowers", e.get("id")) for e in xmlio.ET.parse(path).getroot()}
        rows, said = "", {}
        for cid, (name, rule) in made.get(src, {}).items():
            title = name[:1].upper() + name[1:]
            rows += (
                f"  <critterpower id={quoteattr(cid)} source={quoteattr(rule.get('source'))}"
                f" page={quoteattr(rule.get('page') or '1')}><name>{title}</name></critterpower>\n"
            )
            said[("critterpowers", cid)] = texts[src].get(("rules", rule.get("id")), "")
        if rows or old:
            xml = (
                xmlio.HEAD
                + "<!-- Generated by the importer (statpowers.py): sections a stat block's powers name. -->\n"
                + '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="critterpowers" version="1">\n'
                + rows
                + "</sr6:data>\n"
            )
            kept = {k: v for k, v in texts[src].items() if k not in old}
            plan[src] = (xml if rows else None, _texts_xml({**kept, **said}) if (old or said) and texts[src] else None)
    for src, (xml, text) in plan.items():
        path = os.path.join(root, src, FILE)
        if xml:
            xmlio.write_file(path, xml)
        elif os.path.isfile(path):
            os.remove(path)
        if text:
            xmlio.write_file(_texts_path(custom_dir, src), text)
    xmlio.update_index(custom_dir)
    return sum(len(v) for v in made.values())
