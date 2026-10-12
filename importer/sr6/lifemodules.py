"""SR6 life modules (the Sixth World Companion's lifepath), read from a book's text: the grants an opening or adult
module's lines print (lifemodule: one lifemodules entry), and the adult modules a book prints in body type under a
`Life Modules` heading or line (modules: the companion's form, an adventure's or an errata's). Shared by the SWC and
general recipes and the errata reading (resolve.py)."""
import re

from importer.sr6 import regroup
from importer.sr6.ids import slug
from importer.sr6.regroup import norm

# the core rulebook's attributes and skills, by name (game terms): a life module's options name them
ATTRS = {"body": "bod", "agility": "agi", "reaction": "rea", "strength": "str", "willpower": "wil", "logic": "log",
         "intuition": "int", "charisma": "cha", "edge": "edg", "magic": "mag", "resonance": "res"}
SKILLS = ("Astral", "Athletics", "Biotech", "Close Combat", "Con", "Conjuring", "Cracking", "Electronics", "Enchanting",
          "Engineering", "Exotic Weapons", "Firearms", "Influence", "Outdoors", "Perception", "Piloting", "Sorcery",
          "Stealth", "Tasking")
SKILL_IDS = {norm(s): f"skill:crb.{slug(s)}" for s in SKILLS}
CONTACT_TYPES = ("academic", "corporate", "criminal", "engineering", "government", "magic", "matrix", "media", "medical",
                 "street")
NUMBERS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8}
REQUIRES = {"awakened": "awakened", "adepts": "adept", "adept": "adept", "emerged": "emerged", "magicians": "magician"}


def plain(text):
    """Text with the bold markers, bullets and line breaks gone, words split at a line end joined."""
    s = re.sub(r"\*\*|•", " ", text)
    s = re.sub(r"(?<=[a-z])-\n(?=[a-z])", "", s)
    return " ".join(s.split())


_ONLY = re.compile(r"\s*[\[(]\s*(\w+)\s+only\s*[\])]", re.I)
_ITEM = re.compile(r"(?=Choose (?:one|two|three|an? \w+):|(?<!: )\+\d+ to |Resources:|Contact Points:|Contact Types:|"
                   r"Knowledge [Ss]kills?\b|One rank in|Option:)")


def _options(word):
    """An option word -> its tokens: an attribute, a skill (`Exotic Weapon` too), `+25,000 nuyen`, or a group (`any
    mental attribute`, `any other skill or attribute`)."""
    w = re.sub(r"^(?:or|and)\s+", "", norm(re.sub(r"\(.*?\)", "", word)))
    if m := re.fullmatch(r"(?:or\s+)?\+?\s*([\d,]+)\s*nuyen", word.strip()):
        return [f"nuyen:{m.group(1).replace(',', '')}"]
    w = re.sub(r"^\d+\s+(?=[a-z])", "", w)  # (an errata's `+1 Con or +1 Influence`: each option its own bonus)
    # the tradition's drain attribute besides Willpower (every drain has Willpower: an option of its own when offered)
    if re.fullmatch(r"(?:your )?(?:other )?drain attribute", w):
        return ["log", "int", "cha"]
    if w in ATTRS or w in SKILL_IDS or w + "s" in SKILL_IDS:
        return [ATTRS.get(w) or SKILL_IDS.get(w) or SKILL_IDS[w + "s"]]
    if m := re.fullmatch(r"(?:any )?(?:other )?(mental |physical )?(skill|attribute)(?: or (skill|attribute))?", w):
        groups = {"mental ": ["wil", "log", "int", "cha"], "physical ": ["bod", "agi", "rea", "str"],
                  None: ["bod", "agi", "rea", "str", "wil", "log", "int", "cha"]}
        return [t for g in (m.group(2), m.group(3)) if g
                for t in (list(SKILL_IDS.values()) if g == "skill" else groups[m.group(1)])]
    return None


def _choice(body, module, page, report):
    """`+N to A, B, or C` (or `+N A, or +25,000 nuyen`) -> (points, [options]); words that are no attribute or skill
    are reported."""
    m = re.match(r"\+(\d+)\s+(?:to\s+)?(.*)", body)
    if not m:
        return None
    points, rest = int(m.group(1)), re.sub(r"\s*\(\s*\w+ only\s*\)", "", m.group(2)).strip(" .")
    words = [w.strip() for w in re.split(r",?\s+or\s+|,\s+", rest) if w.strip()]
    if any(len(w.split()) > 4 for w in words):  # prose (a sidebar run into the list), not options
        report.append({"kind": "unread-line", "file": "lifemodules.xml", "name": module, "value": body[:80], "page": page})
        return None
    opts, bad = [], []
    for w in words:
        o = _options(w)
        (opts if o else bad).extend(o or [w])
    for w in bad:
        report.append({"kind": "unread-option", "file": "lifemodules.xml", "name": module, "value": w, "page": page})
    return (points, list(dict.fromkeys(opts))) if opts else None


def _module_grants(name, text, page, report):
    """attrs, children (choices) from an adult module's labelled lines."""
    attrs, kids = {}, []
    s = re.sub(r"\+\s(?=\d)", "+", plain(text))  # `+ 1 to`
    items = [x.strip() for x in _ITEM.split(s)[1:]]

    def add(k, v):
        attrs[k] = attrs.get(k, 0) + v
    for it in items:
        # `Choose two: …`, or one: `Choose an Attribute: +1 to Agility or Strength` (an Alignment's is no grant)
        if m := re.match(r"Choose (one|two|three|an? \w+):\s*(.*)", it):
            body, times = m.group(2), NUMBERS.get(m.group(1), 1)
            if re.match(r"\+\d+ to (?:any|an) (?:one )?skill", body):
                add("skillPoints", int(re.match(r"\+(\d+)", body).group(1)) * times)
                continue
            c = _choice(body, name, page, report)
            if c:
                kids += [("choice", {"kind": "mixed", "points": c[0], "options": " ".join(c[1])}, None)] * times
            continue
        if m := re.match(r"\+(\d+) to (?:any|an) (?:one )?(attribute|skill)", it):
            add("attributePoints" if m.group(2) == "attribute" else "skillPoints", int(m.group(1)))
            continue
        if m := re.match(r"\+(\d+) to (\w+) different skills", it):
            add("skillPoints", int(m.group(1)) * NUMBERS.get(m.group(2), 1))
            continue
        if it.startswith("+"):
            if c := _choice(it, name, page, report):
                kids.append(("choice", {"kind": "mixed", "points": c[0], "options": " ".join(c[1])}, None))
            continue
        if m := re.match(r"Resources:\s*\+?([\d,]+)(?:\s*(?:nuyen|¥))?", it):  # (an errata's `Resources: +75,000`)
            add("nuyen", int(m.group(1).replace(",", "")))
        elif m := re.match(r"Contact Points:\s*(\d+)", it):
            add("contactPoints", int(m.group(1)))
        elif m := re.match(r"Contact Types:\s*(.*)", it):
            types = [norm(t) for t in re.split(r",\s*|\s+or\s+|\s+and\s+", m.group(1).strip(" ."))]
            types = [t for t in types if t]
            # (the last type run into the prose after the list: `Media Add a negative quality …`)
            types = [t if t in CONTACT_TYPES or t.split()[0] not in CONTACT_TYPES else t.split()[0] for t in types]
            if types and types[0] != "any":
                bad = [t for t in types if t not in CONTACT_TYPES]
                for t in bad:
                    report.append({"kind": "unread-option", "file": "lifemodules.xml", "name": name, "field": "contactTypes",
                                   "value": t, "page": page})
                attrs["contactTypes"] = " ".join(t for t in types if t in CONTACT_TYPES) or None
        elif m := re.match(r"Knowledge skills?\s*(?:\(choose (\w+)\)|:\s*choose (?:any |up to )?(\w+))", it, re.I):
            add("knowledgeSkills", NUMBERS.get(m.group(1) or m.group(2), 1))
        elif it.startswith("One rank in"):
            add("knowledgeSkills", 1)
        # Choose an Alignment, Option: (karma spends) and qualities are no grants
    return attrs, kids


def _opening_grants(text):
    """The opening modules print their grants as sentences."""
    s, attrs = plain(text), {}
    if m := re.search(r"Choose (\w+) of the following skills.*?at rank (\d)", s):
        attrs["skillPoints"] = NUMBERS.get(m.group(1), 0) * int(m.group(2))
    if m := re.search(r"Gain that skill at rank (\d)", s):
        attrs["skillPoints"] = attrs.get("skillPoints", 0) + int(m.group(1))
    if re.search(r"Gain the .{0,40}?Knowledge skill", s):
        attrs["knowledgeSkills"] = 1
    if m := re.search(r"Gain ([\d,]+) nuyen", s):
        attrs["nuyen"] = int(m.group(1).replace(",", ""))
    if m := re.search(r"Assign (\w+) total points", s):
        attrs["contactPoints"] = NUMBERS.get(m.group(1), 0)
    return attrs


def lifemodule(cat, stage, name, text, page):
    req = None
    if m := _ONLY.search(name):
        req, name = REQUIRES.get(m.group(1).lower()), _ONLY.sub("", name).strip()
    first = text.strip().splitlines()[0] if text.strip() else ""
    if m := re.fullmatch(r"\s*\(\s*(\w+)\s+only\s*\)\s*", first):  # `( Awakened only )` on the line under the heading
        req = REQUIRES.get(m.group(1).lower())
    if stage == "opening":
        attrs, kids = _opening_grants(text), []
    else:
        attrs, kids = _module_grants(name, text, page, cat.report)
        if not attrs and not kids:
            cat.report.append({"kind": "missing-value", "file": "lifemodules.xml", "name": name, "field": "grants",
                               "page": page})
    cat.add("lifemodules", name, page, {"stage": stage, "requires": req, **attrs}, kids)


_MODULES = re.compile(r"(?:new\s+)?(?:adult\s+|event\s+)?life\s+modules?", re.I)
# a grant: a bold label (the companion's), or a bulleted one (an errata's: `• Contact Points: 4`)
_GRANT = re.compile(r"\*\*(?:choose \w+|contact points|resources):\*\*|^\s*•\s*(?:choose \w+|contact points|resources):",
                    re.I | re.M)


def _unbold(s):
    return re.sub(r"\*\*", "", s or "").strip()


def _bare(s):
    """A line without its bold and a trailing colon (`**Adult Life Modules:**`)."""
    return _unbold(s).rstrip(":").strip()


def _title_line(s):
    # (an `Event:` kicker on the title's own line: `Event: You had Fifteen Minutes of Fame`)
    words = len(re.sub(r"^Event:\s*", "", s or "").split())
    return bool(s) and s[0].isupper() and words <= (6 if s.startswith("Event:") else 5) and s[0] not in "•*#|>" \
        and "," not in s and not re.search(r"[.;!?-]$", s)


def modules(bs):
    """(name, text, PDF page) of each adult life module a book prints in body type under a `Life Modules` heading or
    line (the Sixth World Companion's form): a module's title is a run of short lines (`Event:` `Brush With Death`)
    that prose follows, its grants its labelled lines. The run goes on through the page's running head (a section
    named like the chapter, a page number) and stops at the next heading. A part with no grant is no module (a
    quality printed before them). A module set as a heading under the `Life Modules` heading (its title the heading,
    a kicker `Event:` joined to it: prepare_md) is one with its labelled lines, read the same way."""
    lines, page, on, level, heads = [], 0, False, None, []
    for b in bs:
        head = norm(b.name)
        if on and (head in (norm(b.chapter), "") or head.isdigit()):
            lines += _paged(b)
            continue
        if level is not None and b.level > level:  # a module under its own heading
            # (its labelled lines once: the text's own, else regroup's labels)
            body = b.text if _GRANT.search(b.text) else "\n".join([f"**{k}:** {v}" for k, v in b.labels.items()] + [b.text])
            if _GRANT.search(body):
                heads.append((b.name.strip(), body, b.page))
            continue
        on, level = False, None
        if b.level and _MODULES.fullmatch(b.name.strip()):
            level = b.level
        text = _paged(b)
        at = 0 if _MODULES.fullmatch(b.name.strip()) else next(
            (i + 1 for i, ln in enumerate(text) if _MODULES.fullmatch(_bare(ln))), None)
        if at is not None:
            lines, page, on = lines + [""] + text[at:], page or b.page, True
    out, cur, name, at = [], [], [], 0
    pg = lambda: getattr(lines[at], "page", 0) or page  # noqa: E731  (the module's title line's page)
    i = 0
    while i < len(lines):
        s = _unbold(lines[i])
        if _MODULES.fullmatch(_bare(s)):  # (a second list's line, `New Event Life Modules`: no title)
            if cur and name and any(_GRANT.search(c) for c in cur):
                out.append((" ".join(name), "\n".join(cur), pg()))
            name, cur, i = [], [], i + 1
            continue
        # (a title set in bold starts a module after lines with no grant too: an errata's `Student Athlete: Use …`)
        if _title_line(s) and (not "".join(cur).strip() or any(_GRANT.search(c) for c in cur)
                               or re.fullmatch(r"\*\*[^*]+\*\*", lines[i].strip())):
            j = i
            while j < len(lines) and _title_line(_unbold(lines[j])) and not _MODULES.fullmatch(_bare(lines[j])):
                j += 1
            if j < len(lines) and lines[j].strip() and not lines[j].lstrip().startswith(("•", "**")) and j - i <= 3:
                if cur and any(_GRANT.search(c) for c in cur):
                    out.append((" ".join(name), "\n".join(cur), pg()))
                name, cur, at, i = [_unbold(lines[k]) for k in range(i, j)], [], i, j
                continue
        cur.append(lines[i])
        i += 1
    if cur and name and any(_GRANT.search(c) for c in cur):
        out.append((" ".join(name), "\n".join(cur), pg()))
    return out + heads


def _paged(b):
    """Block b's text lines, each keeping the PDF page it is printed on (regroup's page breaks)."""
    return [regroup._pline(ln, regroup.line_page(b, k)) for k, ln in enumerate((b.text or "").splitlines())]
