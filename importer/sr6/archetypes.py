"""The core rulebook's archetypes (sample characters) -> SR6 runner files (sr6:character, docs/sr6-character-format.md),
built from each printed stat block against the book's own catalog (the recipe's entries, ids scoped as run() scopes them)
and, for another book's samples (Smooth Operations' faces), the core rulebook's catalog as already imported.

What maps: the metatype, the priorities that overspend least for what the block prints (fit.py, Sum-to-Ten when no
priority assignment fits: the attributes and skills spent from their pools, karma past them; without a priority table
that holds the runner, none, and each rank sits in the attribute or skill points, R), the attributes' natural values,
the magic kind (spells, adept powers, complex forms), skills with their specialization (+2) or expertise (+3),
knowledge skills and languages (Logic's points first, the rest bought with karma), qualities (one of the metatype's
own, or one printed "(… trait)", is a free metatype trait), spells, adept powers and complex forms, contacts (C/L),
the lifestyle, gear, augmentations (with a printed grade), vehicles and weapons found in the catalog by name, and fake
SINs with their licences. A standard boost carries the bonuses it gives (BOOSTS). The printed attributes, Essence,
initiative, condition monitors and Defense Rating go in <printed> for Review to compare, never corrected. Everything
else (the printed lines, starting nuyen, what the catalog doesn't have) goes in the notes and, when a listed thing
isn't found, in the report (unmatched-item).
No description text is copied."""
import math
import re
from xml.sax.saxutils import escape, quoteattr

from importer.recipes.dhsa import slug
from importer.sr6 import fit
from importer.sr6.regroup import keys, norm
from importer.xmlio import HEAD, ILLEGAL

CHAR_NS = "urn:chummer-sr6:character:1"
ATTRS = ("bod", "agi", "rea", "str", "wil", "log", "int", "cha", "edg", "mag", "res")
BAND = {"B": "bod", "BOD": "bod", "A": "agi", "AGI": "agi", "R": "rea", "REA": "rea", "S": "str", "STR": "str", "W": "wil",
        "WIL": "wil", "L": "log", "LOG": "log", "I": "int", "INT": "int", "C": "cha", "CHA": "cha", "EDG": "edg",
        "EDGE": "edg", "M": "mag", "MAG": "mag", "RES": "res", "ESS": "ess"}
PURCHASES = {"gear": ("armor", "electronics", "gear", "vehicles", "weapons"),  # (an implant is printed under Augmentations)
             "augmentations": ("augmentations",), "cyberware": ("augmentations",), "bioware": ("augmentations",),
             "vehicles": ("vehicles",), "drones": ("vehicles",)}
PICKS = {"spells": "spells", "adept powers": "adeptpowers", "complex forms": "complexforms", "rituals": "rituals"}
# the labels read into the build; any other label goes in the notes as printed
READ = {"active skills", "skills", "knowledge skills", "languages", "qualities", "contacts", "lifestyle", "weapons",
        *PURCHASES, *PICKS}
PRINTED = ("initiative/actions", "initiative", "condition monitors (p/s)", "condition monitor", "defense rating",
           "starting nuyen")


def is_archetype(b):
    """A sample character's stat block: an item whose box is titled `metatype: <name>`."""
    return b.type == "item" and b.label.lower().startswith("metatype:")


def split(s):
    """A printed list split at its top-level commas (a comma inside ( ) or [ ] stays)."""
    out, cur, depth = [], "", 0
    for ch in s:
        depth = depth + 1 if ch in "([" else max(0, depth - 1) if ch in ")]" else depth
        if ch == "," and depth == 0:
            out.append(cur)
            cur = ""
        else:
            cur += ch
    return [x.strip(" .;") for x in out + [cur] if x.strip(" .;")]


class _Index:
    """The catalog's names per kind: exact (norm; a `Jammer, area` also as `area jammer`, a `Combat/survival knife` also
    as `Combat knife` and `survival knife`) first, then looser (regroup.keys: a trailing ( … ), number or plural s cut;
    and an "es" plural). The book's own entries (ids unscoped) come first, then `core`'s (the core rulebook's as
    imported, ids scoped), which another book's samples cite."""

    def __init__(self, entries, src, core=None):
        self.exact, self.loose = {}, {}
        for pre, cat in ((src.lower() + ".", entries), ("", core or {})):
            for kind, e in ((kind, {**e, "id": pre + e["id"]}) for kind, es in cat.items() for e in es):
                m = re.fullmatch(r"([^,]+),\s*([^,]+)", e["name"])
                for n in [e["name"]] + ([f"{m.group(2)} {m.group(1)}"] if m else []) + _slashed(e["name"]):
                    for k in {norm(n), norm(n).replace(" ", "")}:  # (`Roto-Drone` printed `Rotodrone`)
                        _add(self.exact.setdefault((kind, k), []), e)
                    for k in keys(n):
                        _add(self.loose.setdefault((kind, k), []), e)

    def find(self, kinds, name, loose=True, accept=None):
        """(kind, scoped id, catalog name, entry) of the first kind with an entry named `name` (exactly: `loose` False)
        that `accept` (entry -> bool) takes, else None."""
        ks = keys(name) if loose else []
        for table, ks in ((self.exact, [norm(name), norm(name).replace(" ", "")]), (self.loose, ks + [k[:-2] for k in ks if k.endswith("es")])):
            for kind in kinds:
                for k in ks:
                    for e in table.get((kind, k), ()):
                        if accept is None or accept(e):
                            return kind, e["id"], e["name"], e
        return None

    def prefix(self, kinds, name, rating):
        """The first entry whose name starts with `name` (`Cybereyes basic system (Rating 4)` for `cybereyes`), one
        naming `rating` first."""
        n = norm(name)
        hits = [(kind, es[0]) for kind in kinds for (k2, key), es in self.exact.items() if k2 == kind and key.startswith(n + " ")]
        hits.sort(key=lambda h: not (rating and norm(h[1]["name"]).endswith(f"rating {rating}")))
        return (hits[0][0], hits[0][1]["id"], hits[0][1]["name"], hits[0][1]) if n and hits else None


def _add(es, e):
    if all(x["id"] != e["id"] for x in es):  # (a name and its alternate form land on one key)
        es.append(e)


def _leveled(level):
    """A quality printed at `level` (`Addiction 5`) is an entry that comes in levels up to it (CRB p.74's Addiction
    (Substance, 1 to 6), not a quality path's one-level step of the same name)."""
    def ok(e):
        a = e.get("attrs", {})
        top = a.get("maxLevel")
        return a.get("perLevel") == "true" and (fit.value(str(top)) if top not in (None, "") else level) >= level
    return ok


def _rated(rating):
    """An item printed at `rating`: not an entry whose name is another rating's (`Cybereyes (Rating 6)` for `cybereyes
    3`; the core rulebook's `Cybereyes basic system (Rating 3)` is found by prefix)."""
    def ok(e):
        m = re.search(r"\(\s*rating\s*(\d+)\s*\)\s*$", e["name"], re.I)
        return not (rating and m and int(m.group(1)) != rating)
    return ok


def _slashed(name):
    """`Spirit/Sprite Bane` -> [`Spirit Bane`, `Sprite Bane`]: each word of a slashed pair in its place; else []."""
    m = re.search(r"(\w+)/(\w+)", name)
    return [name[:m.start()] + w + name[m.end():] for w in m.groups()] if m else []


def _num(v):
    m = re.match(r"\s*(\d+(?:\.\d+)?)\s*(?:\((\d+(?:\.\d+)?)\))?", v or "")
    return (float(m.group(1)), m.group(2) and float(m.group(2))) if m else (None, None)


def _named(idx, kinds, text):
    """A listed thing with an optional trailing level: (found, level, note), found None when the catalog lacks it."""
    m = re.fullmatch(r"(.*?)(?:\s+(\d+))?\s*(?:\((.*)\))?", text.strip())
    name, level, note = m.group(1), m.group(2) and int(m.group(2)), m.group(3)
    hit = idx.find(kinds, text) if not level else None  # `Combat Sense 2`: the name without its level
    want = level or (note and (lv := re.search(r"\blevel\s*(\d+)", note, re.I)) and int(lv.group(1)))
    hit = hit or (want and idx.find(kinds, name, accept=_leveled(want)))  # (one that comes in levels first)
    hit = hit or idx.find(kinds, name) or idx.find(kinds, re.sub(r"\s*\(.*$", "", text))
    if not hit and (of := re.fullmatch(r"(.+?)\s+of\s+(.+)", name)):  # `Diffusion of Firewall`: Diffusion (Matrix Attribute)
        hit, note = idx.find(kinds, of.group(1)), of.group(2)
    if note and (lv := re.search(r"\blevel\s*(\d+)", note, re.I)) and not level:
        level = int(lv.group(1))
    return hit, level, note


def build(src, name, b, page, entries, updated, core=None, cs=None):
    """One archetype block -> (file id, sr6:character XML, report rows). `entries`: the recipe's catalog (kind -> its
    entries, ids unscoped); `core`: the core rulebook's as imported (ids scoped), for what the book cites from it; `cs`:
    the creation settings the priorities are fitted with (fit.py; default the shipped standard ones)."""
    idx, sid = _Index(entries, src, core), f"{src.lower()}.{slug(name) or 'runner'}"
    cs = fit.settings() if cs is None else cs
    num = lambda v: fit.value(str(v)) or 0
    setting = lambda k: cs.get(k) if isinstance(cs.get(k), float) else 0
    # what the printed things cost, for fitting the priorities (fit.spend's `need`)
    need = {"raised": set(), "skills": [], "karma": 0, "neg": 0, "spells": 0, "forms": 0, "pp": 0, "nuyen": 0,
            "debt": False}
    labels = {k.lower(): v for k, v in b.labels.items()}
    notes, missing, report = [], {}, []
    uid = iter(range(1, 10_000))

    def miss(field, item):
        missing.setdefault(field, []).append(item)
        report.append({"kind": "unmatched-item", "name": name, "field": field, "value": item, "page": page})

    meta = idx.find(["metatypes"], b.label.split(":", 1)[1].strip())
    if not meta:
        miss("Metatype", b.label.split(":", 1)[1].strip())
    band = {BAND[k.upper()]: v for s in b.stats for k, v in s.items() if k.upper() in BAND}
    attrs, augmented = {}, []
    for a in ATTRS:
        nat, aug = _num(band.get(a))
        if nat is not None:
            attrs[a] = int(nat)
            if aug is not None:
                augmented.append(f"{a.upper()} {band[a]}")
    picks = {kind: split(labels[label]) for label, kind in PICKS.items() if labels.get(label)}
    magic = ("technomancer" if "complexforms" in picks or "res" in attrs else
             "mystic-adept" if "spells" in picks and "adeptpowers" in picks else
             "full" if "spells" in picks else "adept" if "adeptpowers" in picks else "mundane")
    if magic == "technomancer" and "res" not in attrs:
        notes.append("Resonance isn’t printed: set it on Attributes.")

    lines, skills = [], []
    if meta:  # its core attributes whose maximum is above the base take adjustment points too (rules.ts adjustTargets)
        need["raised"] = {c[1]["attr"] for c in meta[3].get("children", []) if c[0] == "range" and c[1].get("attr") in fit.CORE
                          and num(c[1].get("max")) > setting("attributeBaseMax")}

    for s in split(labels.get("active skills") or labels.get("skills") or ""):
        m = re.fullmatch(r"([^\d(]+?)\s*(?:\(([^()]*)\)\s*)?(\d+)(?:\s*\((\d+)\))?\s*(?:\((.*)\))?", s)
        hit = m and idx.find(["skills"], m.group(1))
        if not hit:
            miss("Skills", s)
            continue
        spec = expertise = None
        for part in split(", ".join(x for x in (m.group(2), m.group(5)) if x)):
            p = re.fullmatch(r"(.*?)\s*\+\s*(\d)", part)
            if p and p.group(2) == "3":
                expertise = p.group(1)
            else:
                spec = p.group(1) if p else part
        # CRB p.92: an expertise is a specialization turned into one, so `(Acting +3)` is the specialization Acting, paid
        # for, then made an expertise (a second specialization printed beside it keeps its own)
        spec = spec or expertise
        if m.group(4):
            augmented.append(f"{hit[2]} {m.group(3)}({m.group(4)})")
        skills.append((hit[1], int(m.group(3)), spec, expertise))
    # an expertise is bought with the customization karma at its advancement price (owner, 2026-10-09: CRB p.66's
    # step four buys advancement at p.68's prices; budgets.ts skillSpend)
    need["karma"] += setting("advance.expertise") * sum(1 for *_, ex in skills if ex)
    free = attrs.get("log", 1)  # Logic's knowledge points (CRB p.67) go first; a skill or language past them is karma's
    for k in split(labels.get("knowledge skills", "")):
        lines.append(f'<knowledge uid="k{next(uid)}" kind="knowledge" {_rank(free)}>{_x(k)}</knowledge>')
        need["karma"] += 0 if free > 0 else setting("karmaKnowledge")
        free -= 1
    for k in split(labels.get("languages", "")):
        native = re.search(r"\(\s*native\s*\)", k, re.I)
        lang = re.sub(r"\s*\(\s*native\s*\)", "", k, flags=re.I)
        ranks = 'points="0" karma="0"' if native else _rank(free)
        need["karma"] += 0 if native or free > 0 else setting("karmaKnowledge")
        free -= 0 if native else 1
        lines.append(f'<knowledge uid="k{next(uid)}" kind="language"{_a("native", native and "true")} {ranks}>{_x(lang)}</knowledge>')
    # the metatype's own qualities (CRB p.64) are free whether or not the block marks them "(… trait)"
    traits = {norm(t or "") for tag, _, t in meta[3].get("children", []) if tag == "trait"} if meta else set()
    flat = []  # (quality id, as printed) of a level printed on a quality without levels
    for q in split(labels.get("qualities", "")):
        hit, level, note = _named(idx, ["qualities"], q)
        if not hit:
            miss("Qualities", q)
            continue
        if level and level > 1 and hit[3].get("attrs", {}).get("perLevel") != "true":
            # (owner, 2026-10-09) a level printed on a quality that has none (`Magic Resistance 2`: CRB p.72 prints one
            # flat cost): a misprint the books repeat; taken without it, the printed level kept for Review's note
            flat.append((hit[1], f"{hit[2]} {level}"))
            level = None
        free =(note and re.search(r"\btrait\b", note, re.I)) or norm(f"{hit[2]} {level or ''}") in traits
        qa = hit[3].get("attrs", {})  # its karma (budgets.ts qualityCost): × level when per level; a ranged one's own
        took = _allergy(hit[2], note, num(qa.get("karmaMax"))) if qa.get("karmaMax") else None
        cost = 0 if free else took or abs(num(qa.get("karma"))) * ((level or 1) if qa.get("perLevel") == "true" else 1)
        if qa.get("kind") == "negative":
            need["neg"] += cost
        else:
            need["karma"] += cost * (setting("positiveQualityFactor") or 1)
        need["debt"] |= hit[1] == cs.get("inDebtQuality")
        lines.append(f'<quality uid="q{next(uid)}" id={quoteattr(hit[1])} level="{level or 1}"{_a("karma", took)}{_a("free", free and "true")}'
                     f'{_a("note", None if free else note)} name={quoteattr(hit[2])}/>')
    for kind, items in picks.items():
        for p in items:
            hit, level, _ = _named(idx, [kind], p)
            if not hit:
                miss(next(k for k, v in PICKS.items() if v == kind).title(), p)
                continue
            pa = hit[3].get("attrs", {})
            need["spells" if kind in ("spells", "rituals") else "forms" if kind == "complexforms" else "pp"] += (
                num(pa.get("cost")) * ((level or 1) if pa.get("perLevel") == "true" else 1) if kind == "adeptpowers" else 1)
            lines.append(_closed(f'<pick uid="p{next(uid)}" kind="{kind}" id={quoteattr(hit[1])}{_a("level", level)} name={quoteattr(hit[2])}',
                                 _bonuses(hit[2], level), "pick"))

    sins, worn, legal_over, dice = [], False, [], []  # dice: (skill id, dice, item) a line's bonus adds to a skill's tests
    skill_of = lambda n: (h := idx.find(["skills"], n)) and h[1]  # noqa: E731
    for label, kinds in PURCHASES.items():
        for item in _per_skill(split(labels.get(label, "")), skill_of):
            if m := re.match(r"(?:(\d+)\s*x\s+)?fake\s+sin\b\s*(?:\((.*)\))?", item, re.I):
                r = re.search(r"rating\s*(\d+)", m.group(2) or "", re.I)
                lic = re.search(r"w/\s*(.*)", m.group(2) or "")
                for _ in range(int(m.group(1) or 1)):
                    sins.append((int(r.group(1)) if r else None, split(lic.group(1)) if lic else []))
                continue
            line, worn, cost = _purchase(idx, kinds, item, next(uid), worn, cs, legal_over=legal_over, dice=dice, skill_of=skill_of)
            need["nuyen"] += cost
            if line:
                lines.append(line)
            else:
                miss(label.title(), item)
    for m in re.finditer(r"\s*([^\[\]]+?)\s*\[([^\[\]]*)(?:\]|$)", labels.get("weapons", "")):
        item = f"{m.group(1)} [{m.group(2)}]"
        line, worn, cost = _purchase(idx, ["weapons"], m.group(1), next(uid), worn, cs, note=item, legal_over=legal_over, dice=dice, skill_of=skill_of)
        need["nuyen"] += cost
        if line:
            lines.append(line)
        else:
            miss("Weapons", item)

    for c in split(labels.get("contacts", "")):
        m = re.fullmatch(r"(.*?)\s*\(?\s*C\s*(\d+)\s*/\s*L\s*(\d+)\s*\)?", c)
        if not m:
            miss("Contacts", c)
            continue
        lines.append(f'<contact uid="c{next(uid)}" name={quoteattr(_s(m.group(1)))} archetype={quoteattr(_s(m.group(1)))} '
                     f'connection="{m.group(2)}" loyalty="{m.group(3)}"/>')
    if ls := labels.get("lifestyle"):
        hit = idx.find(["lifestyles"], re.sub(r"\s*\(.*$", "", ls))
        months = re.search(r"(\d+)\s*months?", ls)
        if hit:
            lines.append(f'<lifestyle id={quoteattr(hit[1])} months="{months.group(1) if months else 1}"/>')
            need["nuyen"] += num(hit[3].get("attrs", {}).get("cost")) * int(months.group(1) if months else 1)
        else:
            miss("Lifestyle", ls)
    for i, (rating, lic) in enumerate(sins, 1):
        need["nuyen"] += (rating or 1) * (setting("fakeSinPerRating") + len(lic) * setting("licencePerRating"))
        kids = "".join(f'<licence name={quoteattr(_s(x))} rating="{rating or 1}"/>' for x in lic)
        lines.append(f'<sin uid="s{i}" name={quoteattr(f"Fake SIN {i}")} kind="fake"{_a("rating", rating)}>{kids}</sin>'
                     if kids else f'<sin uid="s{i}" name={quoteattr(f"Fake SIN {i}")} kind="fake"{_a("rating", rating)}/>')

    # (owner, 2026-10-09, reading 2) a printed rank above the creation cap, on a skill a line's bonus adds dice to (a voice
    # modulator's to sound-based Con): the printed rank includes that bonus; the natural rank is the printed less it when
    # that lands within the cap. The line keeps its bonus (on the tests it holds for); Review notes the reading.
    aptitude = cs.get("aptitudeQuality")
    cap = setting("skillCapAptitude") if aptitude and any(f'id="{aptitude}"' in x or f"id='{aptitude}'" in x for x in lines) else setting("skillCap")
    read_as = {}
    for i, (sid_, rank, sp, ex) in enumerate(skills):
        plus = [(n, v) for k, v, n in dice if k == sid_]
        bonus = sum(v for _, v in plus)
        if cap and rank > cap and plus and 1 <= rank - bonus <= cap:
            skills[i] = (sid_, rank - bonus, sp, ex)
            read_as[f"rank:{sid_}"] = f"{rank}|" + " + ".join(f"{n.lower()} {v}" for n, v in plus)
    printed = [f"{k}: {v}" for k, v in b.labels.items() if k.lower() in PRINTED]
    if band.get("ess"):
        printed.append(f"Essence: {band['ess']}")
    if printed:
        notes.append("As printed: " + "; ".join(printed) + ".")
    if augmented:
        notes.append("Augmented as printed: " + ", ".join(augmented) + ".")
    for field, items in missing.items():
        notes.append(f"{field} not in the catalog: " + "; ".join(items) + ".")
    notes += [f"{k}: {v}" for k, v in b.labels.items() if k.lower() not in READ and k.lower() not in PRINTED]

    # the priorities that overspend least (fit.py): the attributes and skills spent from their pools, karma past them
    left = re.sub(r"\D", "", labels.get("starting nuyen", ""))
    ess = _num(band.get("ess"))[0]
    need.update(meta=meta[2] if meta else "", magic=magic, left=int(left) if left else None,
                loss=math.ceil(setting("essence") - ess - 1e-9) if ess is not None and setting("essence") > ess else 0,
                attrs={a: attrs.get(a, 0 if a in ("mag", "res") else 1) for a in ATTRS},
                skills=[(r, 1 if sp else 0) for _, r, sp, _ in skills])
    rows = {}
    for e in entries.get("priorities") or (core or {}).get("priorities") or []:
        r = rows.setdefault(e.get("attrs", {}).get("letter"), {"metas": {}, "magic": {}})
        for tag, ca, _ in e.get("children", []):
            if tag == "metatype":
                r["metas"][ca["name"].lower()] = int(num(ca["points"]))
            elif tag == "magic":
                r["magic"][ca["kind"]] = int(num(ca.get("rating") or 0))
            elif tag in ("attributes", "skills"):
                r[tag] = int(num(ca["points"]))
            elif tag == "resources":
                r["nuyen"] = num(ca["nuyen"])
    got = fit.fit(need, rows, cs) if meta and rows and cs else None
    # the options a book rule gives that the printed numbers need (owner, 2026-10-09), written as the runner's own rules,
    # marked assumed (the book doesn't say): the prime runner's doubled customization Karma (CRB p.64) when no priority
    # assignment holds the build within the standard Karma; the first printing's cap on illegal gear only (CRB p.66) when
    # a legal item is past the Availability cap. Nothing a book rule doesn't explain.
    assumed = []
    if got and got.get("over", 0) > 0 and isinstance(cs.get("startingKarma"), float):
        prime = {**cs, "startingKarma": cs["startingKarma"] * 2}
        better = fit.fit(need, rows, prime)
        if better and better["over"] < got["over"]:
            got = better
            assumed.append(("startingKarma", f"{prime['startingKarma']:g}", "CRB", 64))
    if legal_over:
        assumed.append(("availabilityCapIllegalOnly", "true", "CRB", 66))
    rules = "".join(f'<setting key="{k}" value="{v}" assumed="true" source="{so}" page="{pg}"/>' for k, v, so, pg in assumed)
    method = got["method"] if got else "priority"
    if got:
        head = [f'<priority column="{c}" letter="{L}"/>' for c, L in got["letters"].items()]
        head += [f'<attribute id="{a}" points="{p}" adjust="{j}" karma="{k}"/>' for a, (p, j, k) in ((a, got["attrs"][a]) for a in ATTRS)]
        head += [f'<skill id={quoteattr(i)} points="{p}" karma="{k}"{_a("spec", sp)}{_a("expertise", ex)}/>'
                 for (i, _, sp, ex), (p, k) in zip(skills, got["skills"])]
        notes.append("Priorities fitted to the printed stat block: the letters that overspend least; what the attribute, "
                     "adjustment and skill points can’t hold is bought with karma, and nuyen past the resources with karma."
                     + (" No priority assignment holds it within the karma, so it’s built with Sum-to-Ten (Sixth World "
                        "Companion), whose letters may repeat." if got["method"] == "sumtoten" else ""))
    else:  # natural = 1 + points for the eight and Edge; Magic and Resonance start at 0 without priorities
        head = [f'<attribute id="{a}" points="{max(0, v - (0 if a in ("mag", "res") else 1))}" adjust="0" karma="0"/>'
                for a, v in need["attrs"].items()]
        head += [f'<skill id={quoteattr(i)} points="{r}" karma="0"{_a("spec", sp)}{_a("expertise", ex)}/>' for i, r, sp, ex in skills]
        notes.append("Built from the printed stat block: the priorities aren’t set, so the budgets read overspent until they are.")

    # the numbers Review compares with the rules' (the book's, never corrected): attributes as printed (`5(7)`), Essence,
    # initiative (`8(10) + 3D6`, the actions left out), the condition monitors (`11/10`) and the Defense Rating
    # (a book printing them in a second band, `DR | I/ID | AC | CM`: initiative `10/1` is 10 + 1D6)
    row = {k.upper(): v for s in b.stats for k, v in s.items()}
    iid = re.fullmatch(r"\s*(\S+)\s*/\s*(\d+)\s*", row.get("I/ID", ""))
    shown = {**{a: band[a] for a in (*ATTRS, "ess") if band.get(a)},
             "init": (labels.get("initiative/actions") or labels.get("initiative") or "").split("/")[0]
             or (iid and f"{iid.group(1)} + {iid.group(2)}D6"),
             "cm": labels.get("condition monitors (p/s)") or labels.get("condition monitor") or row.get("CM"),
             "dr": labels.get("defense rating") or row.get("DR")}
    shown.update({f"level:{i}": as_printed for i, as_printed in flat}, **read_as)
    shown = "".join(f'<value key="{k}" value={quoteattr(_s(v))}/>' for k, v in shown.items() if v and _s(v))

    root = {"formatVersion": 1, "id": sid, "streetName": name, "metatype": meta[1] if meta else "", "method": method,
            "updatedAt": updated}
    xml = (HEAD + f'<sr6:character xmlns:sr6="{CHAR_NS}"' + "".join(_a(k, v) for k, v in root.items()) + ">\n"
           f"  <background>{_x(f'{name} archetype. {src} p.{page}.')}</background>\n"
           f"  <notes>{_x(chr(10).join(notes))}</notes>\n"
           + (f'  <printed source={quoteattr(src)} page="{page}">{shown}</printed>\n' if shown else "")
           + (f"  <rules>{rules}</rules>\n" if rules else "") +
           f'  <build method="{method}" magic="{magic}"{_a("karmaToNuyen", got and got["karmaToNuyen"])}>\n    '
           + "\n    ".join(head + lines) + "\n  </build>\n</sr6:character>\n")
    return sid, xml, report


# CRB p.75, Allergy: its most karma less the allergen's modifier and the severity's; an allergen printed without its kind
# takes the kind of the book's example it names
ALLERGEN = {"common": 0, "seasonal": 3, "uncommon": 6, "rare": 9}
SEVERITY = {"extreme": 0, "severe": 3, "moderate": 6, "mild": 9}
EXAMPLES = {"pollen": "seasonal", "insect stings": "seasonal", "seasonal molds": "seasonal", "grass": "common",
            "molds": "common", "soy": "common", "strawberries": "uncommon", "wheat": "uncommon", "dairy": "uncommon",
            "precious metals": "rare"}


def _allergy(name, note, top):
    """An Allergy's karma from its printed `(severity, allergen)`, or None when it isn't one or doesn't say both."""
    words = [norm(w) for w in split(note or "")]
    kind = next((w for w in words if w in ALLERGEN), None) or next((EXAMPLES[w] for w in words if w in EXAMPLES), None)
    sev = next((SEVERITY[w] for w in words if w in SEVERITY), None)
    return int(top - ALLERGEN[kind] - sev) if norm(name).startswith("allergy") and kind and sev is not None else None


def _rank(free):
    return 'points="1" karma="0"' if free > 0 else 'points="0" karma="1"'


# a cyberlimb printed by its part and kind (`cyberarm (obvious left, …)`): the catalog's `Arm (obvious)`
_LIMB = re.compile(r"cyber\s?(\w+)\s*\(\s*(obvious|synthetic)\b", re.I)


def _purchase(idx, kinds, item, n, worn, cs, note=None, legal_over=None, dice=None, skill_of=None):
    """A gear line -> (purchase XML or None when the catalog lacks it, worn, its cost at its rating, grade and quantity
    (budgets.ts priced), 0 when it can't be read): `3 x …` the quantity, `(rating N …)` or a trailing number the rating;
    the printed text in its note when it says more than the name."""
    m = re.match(r"(?:(\d+)\s*x\s+)?(.*)", item.strip(), re.I)
    qty, rest = int(m.group(1) or 1), m.group(2)
    base = re.split(r"\s*\(|\s+w/", rest, maxsplit=1)[0].strip()
    printed = re.search(r"\b(?:device\s+)?rating\s*(\d+)", rest, re.I)
    printed = printed and int(printed.group(1))
    tail = re.fullmatch(r"(.*?)\s+(\d{1,2})", base)  # `muscle toner 1`: rating 1 (`Beretta 201`: a model)
    names = ([(tail.group(1), int(tail.group(2)))] if tail else []) + [(base, None)]
    if idx.find(kinds, base, loose=False):  # `Ares Light Fire 75`: the number is the name's
        names = [(base, None)]
    # `Bone lacing (titanium)`: the catalog's own variant (a grade printed with it, `(plastic, alpha)`, left out)
    whole = re.sub(r"\s*,?\s*\b(?:alpha|beta|delta|used)(?:ware)?\b", "", re.split(r"\s+w/", rest, maxsplit=1)[0]).strip()
    if limb := _LIMB.match(rest):
        whole = f"{limb.group(1)} ({limb.group(2)})"
    hit = r = None
    if found := idx.find(kinds, whole, loose=False):
        hit, names, r = found, [], printed
    for name, rating in names:
        r = printed or rating
        hit = ((r and idx.find(kinds, f"{name} (Rating {r})", accept=_rated(r))) or idx.find(kinds, name, accept=_rated(r))
               or idx.prefix(kinds, name, r))
        if hit:
            break
    if not hit and len(base.split()) > 1:  # `Sony Emperor commlink`, `Honda Spirit car`; no prefix match (`Combat` axe)
        r, hit = printed, idx.find(kinds, base.rsplit(None, 1)[0])
    if not hit:
        return None, worn, 0
    wear = hit[0] == "armor" and not worn
    grade = hit[0] == "augmentations" and re.search(r"\((?:[^()]*\W)?(alpha|beta|delta|used)(?:ware)?\s*\)", rest, re.I)
    note = note or (rest if norm(rest) != norm(hit[2]) else None)
    ha = hit[3].get("attrs", {})
    low = re.match(r"\s*(\d*)", ha.get("rating") or "").group(1)  # unrated: the lowest it comes in (budgets.ts ratingOf)
    cost = (fit.value(ha.get("cost"), r or int(low or 1)) or 0) * qty * (cs.get(f"grade:{grade.group(1).lower()}:cost", 1) if grade else 1)
    if legal_over is not None:  # a legal item above the Availability cap (the core rulebook's first printing caps only illegal gear)
        avail = (fit.value(ha.get("avail"), r or int(low or 1)) or 0) + (cs.get(f"grade:{grade.group(1).lower()}:avail", 0) if grade else 0)
        top = cs.get("maxAvailability")
        if isinstance(top, float) and avail > top and not re.search(r"I\)?\s*$", ha.get("avail") or ""):
            legal_over.append(hit[2])
    return _closed(f'<purchase uid="g{n}" kind="{hit[0]}" id={quoteattr(hit[1])} name={quoteattr(hit[2])}{_a("rating", r)} '
                   f'qty="{qty}"{_a("grade", grade and grade.group(1).lower())}{_a("worn", wear and "true")}{_a("note", note)}',
                   _bonuses(hit[2], r, skill_of, dice, chosen=_chosen(rest)), "purchase"), worn or wear, cost


# what a standard boost adds per rating or level (the engine counts only the bonuses a line carries, the catalog has none):
# CRB p.157 (Improved Reflexes), pp.286-292 (dermal plating, bone lacing's table, wired reflexes, reaction enhancers,
# muscle toner and augmentation) and p.288 (a cyberlimb's Physical box). The book's printed augmented values are compared
# to these on Review.
BOOSTS = {"improved reflexes": (("rea", 1), ("initDice", 1)), "wired reflexes": (("rea", 1), ("initDice", 1)),
          "reaction enhancers": (("rea", 1),), "muscle toner": (("agi", 1),), "muscle augmentation": (("str", 1),),
          "dermal plating": (("defense", 1),), "bone lacing plastic": (("defense", 1),),
          "bone lacing aluminum": (("defense", 1),), "bone lacing titanium": (("defense", 2),),
          # CRB p. 288: each cyberlimb adds a Physical box; a partial one (forearm, hand, lower leg, foot) doesn't
          **{f"{part} {kind}": (("physical", 1),) for part in ("skull", "torso", "arm", "leg") for kind in ("obvious", "synthetic")},
          # CRB p.293: a reflex recorder adds 1 to the rating of the (Physical) skill it is bought for (`skill:?`: the one
          # printed with it); a stat block prints that as `Firearms 4(5)` (CRB p.87)
          "reflex recorder skill": (("skill:?", 1),),
          # dice on some tests only (shown with the pool, never added): CRB p.286 a voice modulator's wireless bonus, its
          # rating on sound-based Con tests; p.287 tailored pheromones, their rating to Charisma on Con and Influence tests
          # while the target can smell them
          "voice modulator": (("skill:con", 1, "sound-based Con tests, with its wireless bonus"),),
          "tailored pheromones": (("skill:con", 1, "Con tests within conversation range (Charisma + rating)"),
                                  ("skill:influence", 1, "Influence tests within conversation range (Charisma + rating)"))}


def _bonuses(name, rating, skill_of=None, dice=None, chosen=None):
    """The <bonus> lines of a catalog entry named `name` bought at `rating` (or level): per rating, or at the level its
    name ends with (`Wired Reflexes 2`); none for anything else. A skill's (`skill:con`) needs `skill_of` (a skill's name
    -> its id, None: left out); one that holds on some tests only carries `when`. `dice`: each skill bonus is added to it
    as (skill id, dice, name); `skill:?` is the skill it was bought for, `chosen` (its printed `(Firearms)`)."""
    m = re.fullmatch(r"(.*?)(?:\s+(\d+))?", norm(name))
    out = []
    for t, v, *when in BOOSTS.get(m.group(1), ()):
        total = v * (rating or int(m.group(2) or 1))
        skill = skill_of(chosen if t == "skill:?" else t[6:]) if t.startswith("skill:") and skill_of and (chosen or t != "skill:?") else None
        if t.startswith("skill:") and not skill:
            continue
        if skill and dice is not None:
            dice.append((skill, total, name))
        head = f'<bonus target="skill" skill={quoteattr(skill)}' if skill else f'<bonus target="{t}"'
        out.append(head + (f' value="{v}" perRating="true"' if rating else f' value="{total}"') + _a("when", when[0] if when else None) + "/>")
    return "".join(out)


def _chosen(rest):
    """The one thing printed in a line's parentheses (`reflex recorder (Firearms)`: Firearms), else None."""
    m = re.fullmatch(r"[^()]*\(([^(),;]+)\)\s*", rest)
    return m and m.group(1).strip()


def _per_skill(items, skill_of):
    """`reflex recorder (Close Combat & Firearms)`: one line per skill named (CRB p.293: one recorder per skill)."""
    for item in items:
        m = re.fullmatch(r"(.*?)\s*\(([^()]+)\)\s*", item)
        parts = m and [x.strip() for x in re.split(r"\s*(?:&|,|\band\b)\s*", m.group(2)) if x.strip()]
        if parts and len(parts) > 1 and all(skill_of(x) for x in parts):
            yield from (f"{m.group(1)} ({x})" for x in parts)
        else:
            yield item


def _closed(head, kids, tag):
    return f"{head}>{kids}</{tag}>" if kids else f"{head}/>"


def _s(v):
    return ILLEGAL.sub("", str(v)).strip()


def _x(v):
    return escape(_s(v))


def _a(k, v):
    return f" {k}={quoteattr(_s(v))}" if v not in (None, "", False) else ""
