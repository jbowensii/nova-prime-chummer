"""The effects reader's entries: a book section split into entries, their rating tables, variants and section
effects."""

import re

from importer.reflow import reflow

from .words import ATTRIBUTES, MATRIX, SKILLS, _key, _norm, sentences
from .values import _fx, number
from .reader import read
from .tables import STAT_COLUMNS, _init_column, _stat_mod

# ---------- the import's pass over every entry ----------
# kinds whose entries print no effects of their own in prose the grammar reads (stat blocks, rules, vocabularies, and
# life modules, whose points are their own attributes and choices)
SKIP_KINDS = {
    "rules",
    "actions",
    "npcs",
    "contacts",
    "critters",
    "spirits",
    "sprites",
    "categories",
    "priorities",
    "metatypes",
    "skills",
    "lifemodules",
    "grades",
    "attributes",
    "samples",
    "sources",
    "index",
    "packs",
    "contacttypes",
    "licencetypes",
    "magictypes",
    "senses",
    "trueelements",
    "ruleoptions",
    "spellfeatures",
    "qualitysets",
}
ENTRY = re.compile(
    r'^(\s*)<([\w]+) id="([^"]+)"(.*?)><name>(.*?)</name>(.*)</\2>(?:</sr6:data>)?\s*$'
)  # (the file's last entry may close the root on its line: an override's)
_KEEP = re.compile(
    r'<effect [^>]*target="item:[^"]*"[^>]*/>'
)  # (an add-on's effect read from its host's text: prose_items.add_ons)
_DROP = re.compile(r"<(?:effect|test|link|incompatible|compatible) [^>]*/>")


def split_entries(xml):
    """The catalog one entry a line again: the entries an override appended run together on the file's last line."""
    return re.sub(r"(</(\w+)>)(?=<\2 id=)", r"\1\n  ", xml) if xml else xml


def _block_tables(regrouped):
    """{item name key: [(header, rows)]}: every markdown table printed inside an item block, by the block's name."""
    out, block, lines = {}, None, (regrouped or "").splitlines()
    i = 0
    while i < len(lines):
        ln = lines[i]
        if ln.startswith("<!-- item"):
            mm = re.search(r'"name": "([^"]*)"', ln)
            block = _key(mm.group(1)) if mm else None
        elif ln.startswith("<!-- end"):
            block = None
        elif block and ln.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*-", lines[i + 1]):
            header = [c.strip() for c in ln.strip().strip("|").split("|")]
            rows, j = [], i + 2
            while j < len(lines) and lines[j].startswith("|"):
                rows.append([c.strip() for c in lines[j].strip().strip("|").split("|")])
                j += 1
            out.setdefault(block, []).append((header, rows))
            i = j
            continue
        i += 1
    return out


def rating_table(header, rows, kind):
    """Effects of a per-rating table printed under an entry (`RATING | DV | AR`, one row a rating 1, 2, 3 …: the bone
    density augmentation, CRB p. 291): each stat column's values as the book's own value per rating, `R[1,1,2,2]`
    (owner decision 3, 2026-10-11); an augmentation's DV and AR are its unarmed ones."""
    h = [re.sub(r"\s+", " ", x.strip().casefold()) for x in header]
    if len(h) < 2 or h[0] not in ("rating", "level", "force") or not rows:
        return []
    ratings = [number(_norm(r[0])) if r else None for r in rows]
    if any(x is None for x in ratings) or [int(float(x)) for x in ratings] != list(range(1, len(rows) + 1)):
        return []
    out = []
    for i, c in enumerate(h[1:], 1):
        t = STAT_COLUMNS.get(c) or _init_column(c)
        if not t:
            continue
        if kind == "augmentations" and t in ("item:ar", "item:dv"):
            t = "derived:unarmed-" + t[5:]
        vals = [number(_stat_mod(r[i])) if i < len(r) else None for r in rows]
        if any(v is None for v in vals):
            continue
        out.append(_fx(t, "add", "R[" + ",".join(vals) + "]"))
    return out


def _tables(regrouped):
    """[(title, header, row)] of every markdown table in the regrouped text."""
    out, lines = [], (regrouped or "").splitlines()
    for i, ln in enumerate(lines):
        if ln.startswith("|") and i + 1 < len(lines) and re.match(r"^\|\s*-", lines[i + 1]):
            header = [c.strip() for c in ln.strip().strip("|").split("|")]
            j = i + 2
            while j < len(lines) and lines[j].startswith("|"):
                out.append((header, [c.strip() for c in lines[j].strip().strip("|").split("|")]))
                j += 1
    return out


_VARIANT = re.compile(
    r"(.+?) \(((?:[^()]|\([^()]*\))+)\)"
)  # (a name and its variant, which may end in its own parenthesis)


def _label(variant):
    """The run-in label key of a variant: `Fear Response Dampener` for `Fear Response Dampener (basic)`, the book
    printing one paragraph for both."""
    return _key(re.sub(r"\s*\([^()]*\)$", "", variant))


def _own_part(text, name, siblings):
    """An entry's part of a description it shares with entries of the same kind (`High performance engines … Racing
    engines … Economy engines …`): the sentences from the one naming it to the next naming a sibling, with any
    before the first naming one; the whole text when it doesn't name the entry."""

    def word(
        n,
    ):  # (the name as a sentence opens with it: `Racing` for `Racing engines …`; a variant's word, `Medium` for
        # `Mil-Spec Armor (Medium)`: `Medium armor reduces incoming DV by 2`)
        if pm := re.fullmatch(r"(.+?)\s*\(((?:[^()]|\([^()]*\))+)\)\s*", n):
            return " ".join(
                re.sub(r"\s*\([^()]*\)$", "", pm.group(2)).casefold().split()
            )  # (raw, not _key: `Semi-Rigid` stays as the sentence prints it)
        return " ".join(re.sub(r"\s*\(.*?\)\s*$", "", n).casefold().split())

    me = word(name)
    sib = {word(n) for n in siblings if n != name and word(n) != me and len(word(n)) > 3}
    if not me or len(me) < 4 or not sib:
        return text
    ss = sentences(text)
    tag = [
        next(
            (
                w
                for w in [me, *sib]
                if re.match(rf"\W*{re.escape(w)}\b", x.casefold())
                or re.match(rf"\W*{re.escape(w)}\b", re.sub(r"^[•*\s]*[A-Z][\w ]{1,30}:\s+", "", x).casefold())
            ),
            None,
        )
        for x in ss
    ]
    if me not in tag or not any(t in sib for t in tag):
        return text
    out, cur = [], None
    for x, t in zip(ss, tag):
        cur = t or cur
        if cur in (None, me):
            out.append(x)
    return " ".join(out)


def _variant_part(text, name, siblings):
    """A variant's part of a description its siblings share, the book printing each under a bold run-in label
    (`Endosymbionts (Halcyon)`: `… **Halcyon:** …`): the lines before the first sibling's label, then its own from its
    label to the next sibling's (its own sub-labels, `**Overdrive:**`, stay); the whole text when it has no label of
    its own."""
    pm = _VARIANT.match(name)
    if not pm:
        return text
    base, me = pm.group(1), _label(pm.group(2))
    sib = {_label(m.group(2)) for n in siblings if (m := _VARIANT.match(n)) and m.group(1) == base} - {me}
    labels = [(m.start(), _key(m.group(1))) for m in re.finditer(r"(?m)^\W*\*\*([^*\n]{2,40}?):\*\*", text)]
    # (a label may carry a prefix, `Endo-Booster` for `Endosymbionts (Booster)`: the key then ends with the variant's)
    labels = [
        (
            at,
            next(
                (
                    s
                    for s in sib | {me}
                    if len(s) > 3 and (k.endswith(" " + s) or k.startswith(s + " tail") or k == s + " tail")
                ),
                k,
            ),
        )
        for at, k in labels
    ]
    mine = [i for i, (_, k) in enumerate(labels) if k == me]
    if not mine and sib:
        # (`Genotype Enhancement (NDI)`, the book printing its paragraph under `**NDE:**`: the one paragraph label no
        # sibling claims is its own; a label with a value only, `**Treatment time:** 2 months`, is no paragraph)
        para = {m.start() for m in re.finditer(r"(?m)^\W*\*\*[^*\n]{2,40}?:\*\*[ \t]*(?=\S+[ \t]+\S+[ \t]+\S+)", text)}
        free = [i for i, (at, k) in enumerate(labels) if at in para and k not in sib]
        if (
            len(free) == 1 and len(({me} | sib) - {k for _, k in labels}) == 1
        ):  # (and it is the one entry without a label)
            mine, me = free, labels[free[0]][1]
    if not mine or not sib or not any(k in sib for _, k in labels):
        return text
    first = next(at for at, k in labels if k in sib or k == me)
    start = labels[mine[0]][0]
    end = next((at for at, k in labels[mine[0] + 1 :] if k in sib), len(text))
    # (the paragraphs after the last variant's, `**Cyberware overdrive:**`, `**Wireless bonus:**`, are every variant's:
    # Cybertails)
    last = max(at for at, k in labels if k in sib or k == me)
    shared = next((at for at, k in labels if at > last and re.search(r"\b(?:overdrive|wireless)\b", k)), None)
    return (text[:first] + text[start:end] + (text[shared:] if shared is not None and end <= shared else "")).strip()


def _runins(regrouped):
    """{label key: [(block name key, paragraph)]}: every bold run-in paragraph of the book (`**NeoElastian:** A
    metahuman body …`), with the block it is printed in."""
    out, block, cur = {}, "", None
    order, loose, subs = (
        [],
        None,
        set(),
    )  # (a block's labels in order; an unlabelled paragraph after them; bullets' labels)
    for ln in (regrouped or "").splitlines():
        if ln.startswith("<!-- item") or ln.startswith("<!-- section"):
            mm = re.search(r'"name": "([^"]*)"', ln)
            block, cur, order, loose, subs = _key(mm.group(1)) if mm else "", None, [], None, set()
            continue
        if ln.startswith(("#", "|", "<!--")) or not ln.strip():
            cur = None
            if order and loose is None and not ln.strip():
                loose = []
            continue
        if (mm := re.match(r"^\W*\*\*([^*]{2,40}?):\*\*\s*(.*)$", ln)) and ln.lstrip().startswith("•") and order:
            # (a bullet's sub-label, `• **Overdrive:**`: part of the paragraph it is printed in)
            cur = loose if loose is not None else cur if cur is not None else order[-1][1]
            cur.append(f"{mm.group(1)}: {mm.group(2)}")
            subs.add(_key(mm.group(1)))
            continue
        if mm:
            k = _key(mm.group(1))
            seen = [x for x, _ in order]
            main = [x for x in seen[: seen.index(k)] if x not in subs] if k in seen else []
            if loose and main:
                # (a block printing each label's first lines as a list, then the rest flowing: `**Cerebral …:** …` then
                # `This genetic modification …` before `**Synaptic …:**` again: the rest is the label's before it)
                order[seen.index(main[-1])][1].extend(loose)
            loose = None
            cur = [mm.group(2)]
            out.setdefault(k, []).append((block, cur))
            if k not in [x for x, _ in order]:
                order.append((k, cur))
        elif cur is not None:
            cur.append(ln.strip())
        elif loose is not None:
            loose.append(ln.strip())
    return {k: [(b, re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(p))) for b, p in v] for k, v in out.items()}


def _sections(regrouped):
    """({item name key: section name}, {section name: its intro text}, {item name key: its prose}): which section each
    item is printed in, the text a section prints above its first item, and each item block's own prose (a parent row
    printed with the text its variant rows share, `Cyberjack Boosters`)."""
    of, intro, prose, cur, item = {}, {}, {}, None, None
    for ln in (regrouped or "").splitlines():
        if ln.startswith("<!-- section") or ln.startswith("<!-- item"):
            mm = re.search(r'"name": "([^"]*)".*?"section": "([^"]*)"', ln)
            if ln.startswith("<!-- section") and mm:
                cur, item = mm.group(1), None
                intro.setdefault(cur, [])
            else:
                cur = None
                item = _key(mm.group(1)) if mm else None
                if mm:
                    of.setdefault(_key(mm.group(1)), mm.group(2))
                    prose.setdefault(item, [])
            continue
        if ln.startswith("<!-- end"):
            cur = item = None
        elif cur is not None and not ln.startswith(("|", "#")):
            intro[cur].append(ln.strip())
        elif item is not None and not ln.startswith(("|", "#")) and (ln.strip() or prose[item] and prose[item][-1]):
            prose[item].append(ln.strip())

    def join(v):
        return re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(v)).strip()

    # (a block's prose keeps its lines and its blank ones, for _block_text: a mentor spirit's `**Magician:**` role lines
    # read by their labels)
    return of, {k: join(v) for k, v in intro.items()}, {k: "\n".join(v).strip() for k, v in prose.items() if any(v)}


def _block_text(prose):
    """An entry's description from its book block's prose (`_sections`), where the entry has none of its own: the
    paragraphs (a bold label line holds a wrapped sentence's lines, `**Disadvantage:** Cannot gain … for` / `Snoop
    actions.`), less the fluff after a mentor spirit's `Similar Archetypes` line and a label line the heading cut short
    (printed whole below)."""
    lines = []
    for ln in reflow(prose.split("**Similar Archetypes:**")[0]).split("\n"):
        if (
            lines
            and lines[-1].startswith("**")
            and ln
            and not ln.startswith("**")
            and not re.search(r"[.!?:]$", lines[-1])
        ):
            lines[-1] = re.sub(r"(?<=[a-z])-$", "", lines[-1]) + ("" if lines[-1].endswith("-") else " ") + ln
        else:
            lines.append(ln)
    return "\n".join(
        x
        for i, x in enumerate(lines)
        if not (x.startswith("**") and any(y != x and y.startswith(x) for y in lines[i + 1 :]))
    )


def _variant_sentences(text, mine, others, label=None):
    """The sentences of a parent's description about this variant (`Cyberjack Boosters (Firewall)`: `A Data Processing
    or Firewall cyberjack booster improves …`) or about no variant; the whole text when no sentence names a variant."""
    ss = sentences(text)
    me = {w.casefold() for w in mine if w}
    sib = {w.casefold() for w in others if w} - me

    def names(x, ws):
        # (with a label, a version named as one: `the general version`, `general toxin resistance`; not `in general`)
        tail = rf"\s+(?:versions?|types?|forms?|variants?|{re.escape(label)})" if label else ""
        return any(re.search(rf"\b{re.escape(w)}\b{tail}", x.casefold()) for w in ws)

    if not me or not any(names(x, me | sib) for x in ss):
        return text
    return " ".join(x for x in ss if names(x, me) or not names(x, sib))


_FAMILY = {
    "attr": lambda w: ATTRIBUTES.get(w),  # pylint: disable=unnecessary-lambda  # looked up when called
    "attr-max": lambda w: ATTRIBUTES.get(w),  # pylint: disable=unnecessary-lambda  # looked up when called
    "matrix": lambda w: MATRIX.get(w) or MATRIX.get(w + " attribute"),
    "skill": lambda w: w.replace(" ", "-") if w in SKILLS else None,
    "skill-max": lambda w: w.replace(" ", "-") if w in SKILLS else None,
}
_VARIANT_FAMILY = {
    "attribute": ("attr", "attr-max"),
    "attributes": ("attr", "attr-max"),
    "skill": ("skill", "skill-max"),
    "skills": ("skill", "skill-max"),
}


def _resolve_variant(found, words):
    """A variant row's effects (owner decision 2026-10-10: a choice the row makes): `<family>:choice` becomes the member
    the variant's words name (`(Firewall)`: matrix:firewall; `(Agility)`: attr:agi); a variant named for a target family
    (`(attribute)`, `(skill)`) keeps that family's effects only."""
    fam = next((f for w in words for f in [_VARIANT_FAMILY.get(_key(w))] if f), None)
    out = []
    for t, a, _ in found:
        if (
            t == "effect"
            and fam
            and a["target"].split(":")[0] in {k for v in _VARIANT_FAMILY.values() for k in v}
            and a["target"].split(":")[0] not in fam
        ):
            continue
        if t == "effect" and a["target"].endswith(":choice"):
            k = a["target"][:-7]
            member = next((m for w in words for m in [_FAMILY.get(k, lambda w: None)(_key(w))] if m), None)
            if member:
                a = {**a, "target": f"{k}:{member}"}
        out.append((t, a, None))
    return out


# programs and gear named for what a skillsoft kind gives (CRB p. 272, Skillsofts): its skill at its rating
SOFTS = {
    "activesoft": "skill:choice",
    "activesofts": "skill:choice",
    "skillsoft": "skill:choice",
    "skillsofts": "skill:choice",
    "knowsoft": "skill:knowledge",
    "knowsofts": "skill:knowledge",
    "linguasoft": "skill:language",
    "linguasofts": "skill:language",
    "knowledge": "skill:knowledge",
    "language": "skill:language",
}
_EACH = re.compile(r"^\W*(?:each|every|all|any)\b", re.I)
_NOT = re.compile(r"\b(?:not|nor|no|never|n't)\b", re.I)


_PLURAL_SUBJECT = (
    r"^\W*(?:[a-z-]+ and )?((?:[a-z-]+ ){0,2}[a-z-]+s)\s+"
    r"(?:are|have|has|carry|get|gain|receive|add|adds|provide|grant|use|come|include|count|can|may|must|do)\b"
)


def section_effects(intro, text, name, kind, section=""):
    """The effects a section's intro states of every item in it (owner decision 2026-10-10: `Each cyberlimb adds one
    box to the character's Physical Condition Monitor`), a sentence opening `Each`, `Every`, `All` or `Any`; less the
    ones the item's own text excepts (a sentence of its own, about it, saying it doesn't)."""
    out = []
    base = _key(re.sub(r"\s*\(.*$", "", name))
    own = [x.casefold() for x in sentences(text) if _NOT.search(x)]
    kinds = {w.rstrip("s") for w in re.findall(r"[a-z]+", section.casefold())}
    subjects = {
        m_.group(1)
        for x in sentences(intro)
        if (m_ := re.match(_PLURAL_SUBJECT, re.sub(r"^\W*notes?:\s*", "", x, flags=re.I).casefold()))
    }
    tails = [tuple(x.split()[1:]) for x in subjects if len(x.split()) >= 3]
    versions = any(
        tails.count(t) > 1 for t in tails
    )  # (`Small blast shields …` and `Large blast shields …`: each sentence is its version's)
    for s in sentences(intro):
        s = re.sub(r"^\W*notes?:\s*", "", s, flags=re.I)  # (a section's `Notes:` line is its intro too)
        m = re.match(r"^\W*(?:(?:each|every|all|any)\s+)?([a-z-]+)(?:\s+(?:and\s+)?([a-z-]+))?", s.casefold())
        ws = {w.rstrip("s") for w in m.groups() if w} if m else set()
        nouns = {
            k for k in kinds for w in ws if k == w or len(w) >= 4 and k.endswith(w)
        }  # (`limbs` of the section `Cyberlimbs`)
        if not nouns:
            # (about the section's items, `Each cyberlimb` under Cyberlimbs, `Missiles are …`; not `Each point of nanite
            # volume`)
            continue
        if not re.match(r"^\W*(?:each|every|all|any)\b", s.casefold()):
            # (owner decision 10, 2026-10-11: a sentence about the section's items as a class, its plural noun the
            # subject:
            # `Missiles are rockets …` under Rockets and Missiles is the missiles' rule, not a rocket's; `This genotype
            # enhancement offsets …` is one item's)
            sm = re.match(_PLURAL_SUBJECT, s.casefold())
            if not sm or nouns < kinds and not nouns & {w.rstrip("s") for w in base.split()}:
                continue
            # (`Small blast shields provide +1 … Large blast shields provide +2`: the words before the noun, the
            # version, must be in the item's name)
            if (
                versions
                and not {w.rstrip("s") for w in sm.group(1).split()[:-1]}
                <= {w.rstrip("s") for w in _key(name).split()} | kinds
            ):
                continue
        if lm := re.search(r"\binstalled with all physical attributes at (\d+)\b", s.casefold()):
            # (CRB p. 288: a basic cyberlimb's own attributes, the new target `limb-attr:<abbr>`: the limb's, never the
            # runner's)
            out += [
                (t, {**a, "rule": section or "class"}, None)
                for t, a, _ in (_fx(f"limb-attr:{x}", "set", lm.group(1)) for x in ("bod", "agi", "rea", "str"))
            ]
            continue
        got = read(s, kind)
        if (
            versions
            and not any(t == "effect" for t, _, _ in got)
            and (
                what := next(iter(re.findall(r"\bto ([a-z ]+? rating)\b", " ".join(sentences(intro)).casefold())), None)
            )
        ):
            # (`Large blast shields provide +2 (max +4) for each shield installed`: of the `Defense Rating` the sentence
            # before names)
            got = read(re.sub(r"\b(provides? [+-]?\d+)", rf"\1 to {what}", s, count=1, flags=re.I), kind)
        for t, a, _ in got:
            if t != "effect":
                continue
            words = re.split(r"[:]", a["target"])[-1].replace("-monitor", "").replace("-", " ")
            if any(
                words in x and (base and base in _key(x[: x.find(words)]) or re.match(r"\W*(?:this|it)\b", x))
                for x in own
            ):
                continue  # (`This arm does not add a box`: excepted)
            # (a rule of the section's class: copy_links gives it to the same class in other books; not a sub-class's
            # sentence this item
            # is the very one of, `Missiles are …` for the `Missile Variant` row)
            out.append(
                (
                    t,
                    (
                        a
                        if nouns < kinds and nouns & {w.rstrip("s") for w in base.split()}
                        else {**a, "rule": section or "class"}
                    ),
                    None,
                )
            )
    return out


# a rating the book prints in the entry's name, one row a rating (`Wired Reflexes 3`, `Cyberjack (Rating 2)`,
# `Telescoping modification (Level 1)`)
_NAME_RATING = re.compile(
    r"(?:^|\s)(?:(?P<word>\(\s*(?:rating|level)\s+)|(?P<base>(?<=\s)))(\d{1,2})(?(word)\)|)\s*$", re.I
)
_USES_R = re.compile(r'<effect [^>]*\bvalue="[^"]*\bR\b|<formula\b[^>]*>[^<]*\bR\b')


def split_rating(name, attrs, kids, siblings=()):
    """` rating="N"` for an entry the book splits into one row a rating, its name ending in the rating (`Cyberjack
    (Rating 2)`; a bare number, `Wired Reflexes 3`, only beside a sibling of the same name and another number), when it
    prints no rating range of its own and its effects or formulas count per rating (`R`): R is that row's rating, never
    1; '' otherwise."""
    m = _NAME_RATING.search(name or "")
    if not m or re.search(r'\srating="', attrs) or not _USES_R.search(kids) or int(m.group(3)) < 1:
        return ""
    if not m.group("word"):
        base = name[: m.start()].strip().casefold()
        if not any(
            n != name
            and (o := _NAME_RATING.search(n))
            and not o.group("word")
            and n[: o.start()].strip().casefold() == base
            for n in siblings
        ):
            return ""
    return f' rating="{m.group(3)}"'
