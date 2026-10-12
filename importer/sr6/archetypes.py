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

from importer.sr6.ids import slug
from importer.sr6 import fit, formula
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

    def entries(self, kind):
        """Every entry of `kind`, once each."""
        return list({e["id"]: e for (k, _), es in self.exact.items() if k == kind for e in es}.values())

    def prefix(self, kinds, name, rating):
        """The first entry whose name starts with `name` (`Cybereyes basic system (Rating 4)` for `cybereyes`), one
        naming `rating` first."""
        n = norm(name)
        hits = [(kind, es[0]) for kind in kinds for (k2, key), es in self.exact.items() if k2 == kind and key.startswith(n + " ")]
        hits.sort(key=lambda h: not (rating and norm(h[1]["name"]).endswith(f"rating {rating}")))
        return (hits[0][0], hits[0][1]["id"], hits[0][1]["name"], hits[0][1]) if n and hits else None

    def near(self, kinds, name, parts=()):
        """The one entry naming every word of `name` but its first or its last (a maker before it, `Ares Securetech
        SkinShield`; a garment word the book swaps, `… Crimson Sky Dress` for the `Crimson Sky Suit` row), an initialism
        read as the entry's words (`o.L.`: of London); several: the one naming one of `parts` (a variant printed in its
        parentheses: `diamond`), else None. At least two words shared, or the one word printed the entry's last."""
        raw = re.findall(r"(?:[A-Za-z]\.){2,}|[^\s]+", re.sub(r"\b((?:[A-Za-z]\.){2,})", r" \1 ", name))
        found = {}
        for (kind, k), es in self.exact.items():
            if kind not in kinds:
                continue
            for e in es:
                have = [_one(w) for w in norm(e["name"]).split()]
                mine = []
                for t in raw:  # an initialism: the entry's words with those initials, in order
                    letters = re.findall(r"[A-Za-z]", t) if re.fullmatch(r"(?:[A-Za-z]\.){2,}", t) else None
                    at = next((i for i in range(len(have) - len(letters) + 1)
                               if [w[0] for w in have[i:i + len(letters)]] == [c.lower() for c in letters]), None) if letters else None
                    mine += have[at:at + len(letters)] if at is not None else ([norm(t)] if norm(t) else [])
                mine = [_one(w) for x in mine for w in x.split()]
                missing = [i for i, w in enumerate(mine) if w not in have]
                # (one word printed: the entry's last, `Greatcoat` for `Mortimer of London Greatcoats`)
                if mine and len(missing) <= 1 and set(missing) <= {0, len(mine) - 1} and len(mine) - len(missing) >= 2 \
                        or mine == have[-1:]:
                    found[e["id"]] = (kind, e)
        if len(found) > 1:
            found = {i: v for i, v in found.items() if any(norm(p) and re.search(rf"\b{re.escape(norm(p))}\b", norm(v[1]["name"])) for p in parts)}
        if len(found) != 1:
            return None
        kind, e = next(iter(found.values()))
        return kind, e["id"], e["name"], e


def _one(w):
    """A word without its plural s (`suits`: suit; `s`, `gas` kept)."""
    return w[:-1] if len(w) > 3 and w.endswith("s") else w


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


def _value(e, field, rating, qty=1):
    """An entry's `field` for `qty` bought at `rating`, as the app prices it (budgets.ts priced, values.ts bookValue): its
    <formula> when it has one (B the printed value; a formula counting Q is the whole line's), else the printed value,
    times qty; 0 when neither reads (the Cyberjack (Rating 1) row's tier formula prices rating 6 at 210,000¥, not its
    printed 45,000¥)."""
    raw = e.get("attrs", {}).get(field)
    f = next((t for tag, ca, t in e.get("children", []) if tag == "formula" and ca.get("field") == field and t), None)
    try:
        n = f and formula.evaluate(f, R=rating, Q=qty, B=fit.value(raw, rating))
    except (formula.FormulaError, ValueError, KeyError, TypeError):
        n = None
    if n is not None:
        return n if "Q" in formula.variables(f) else n * qty
    return (fit.value(raw, rating) or 0) * qty


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
    raw = fit.settings() if cs is None else cs
    cs = fit.resolve(raw)  # (as the app applies them: nested rules, levels of play)
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

    lines, skills, bracket = [], [], {}  # bracket: a skill's printed `4(5)` value in brackets
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
        if m.group(4):
            bracket[f"skill:{hit[1]}"] = int(m.group(4))
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
        # In Debt printed with its debt (`Mafia, 25,000¥, 2,500¥/month interest`): each Karma turned into nuyen puts
        # that much into debt (CRB Hong Kong p.77: 5,000¥, the In Debt rate), so the debt says how many were turned
        if hit[1] == cs.get("inDebtQuality") and (owed := re.search(r"([\d,]+)\s*¥(?!\s*/)", note or "")) and setting("karmaToNuyenRateInDebt"):
            need["toNuyen"] = round(int(owed.group(1).replace(",", "")) / setting("karmaToNuyenRateInDebt"))
        lines.append(f'<quality uid="q{next(uid)}" id={quoteattr(hit[1])} level="{level or 1}"{_a("karma", took)}{_a("free", free and "true")}'
                     f'{_a("note", None if free else note)} name={quoteattr(hit[2])}/>')
    boosts = []  # what a line's bonuses add: (attribute or skill:<id>, total, switch, name) (_bonuses)
    skill_of = lambda n: (h := idx.find(["skills"], n)) and h[1]  # noqa: E731
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
                                 _bonuses(hit[2], level, skill_of, chosen=_chosen(p), seen=boosts), "pick"))

    sins, worn, legal_over = [], [], []  # worn: (Defense Rating, uid) of each armor line
    bought = []  # (purchase XML, its cost) of each gear line: the metatype's size pricing below
    for label, kinds in PURCHASES.items():
        for item in _per_skill(split(labels.get(label, "")), skill_of):
            # (`fake SIN 3`: rating 3, as a trailing number is any item's rating)
            if m := re.match(r"(?:(\d+)\s*x\s+)?fake\s+sin\b\s*(\d+)?\s*(?:\((.*)\))?", item, re.I):
                r = re.search(r"rating\s*(\d+)", m.group(3) or "", re.I)
                lic = re.search(r"w/\s*(.*)", m.group(3) or "")
                for _ in range(int(m.group(1) or 1)):
                    sins.append((int(r.group(1)) if r else int(m.group(2)) if m.group(2) else None, split(lic.group(1)) if lic else []))
                continue
            line, worn, cost = _purchase(idx, kinds, item, next(uid), worn, cs, legal_over=legal_over, skill_of=skill_of, seen=boosts, nat=attrs)
            need["nuyen"] += cost
            bought.append((line, cost))
            if line:
                lines.append(line)
            else:
                miss(label.title(), item)
    for m in re.finditer(r"\s*([^\[\]]+?)\s*\[([^\[\]]*)(?:\]|$)", labels.get("weapons", "")):
        item = f"{m.group(1)} [{m.group(2)}]"
        line, worn, cost = _purchase(idx, ["weapons"], m.group(1), next(uid), worn, cs, note=item, legal_over=legal_over, skill_of=skill_of, seen=boosts)
        need["nuyen"] += cost
        bought.append((line, cost))
        if line:
            lines.append(line)
        else:
            miss("Weapons", item)

    # the metatype's size pricing as the app's nuyen budget adds it (metatypeSizePricing, budgets.ts nuyenBudget): 10% of
    # everything bought for a troll-sized runner, of the armor for a dwarf-sized one, one rounded line
    size = fit.metatype_size(meta[2]) if meta and cs.get("metatypeSizePricing") == "true" else None
    if size:
        # (a line's kind its first purchase's; Math.round's half up)
        need["nuyen"] += math.floor(sum(c for x, c in bought if x and (size == "troll" or ' kind="armor"' in x.split(">", 1)[0])) * 0.1 + 0.5)
    if worn:  # the armor worn: the highest Defense Rating (the first of equals); the rest carried
        best = max(worn, key=lambda w: w[0])[1]
        lines = [re.sub(rf'^(<purchase uid="g{best}" [^>]*?qty="\d+"(?: grade="\w+")?)', r'\1 worn="true"', x) for x in lines]
    pairs = []
    for c in split(labels.get("contacts", "")):
        m = re.fullmatch(r"(.*?)\s*\(?\s*C\s*(\d+)\s*/\s*L\s*(\d+)\s*\)?", c)
        if not m:
            miss("Contacts", c)
            continue
        pairs.append((int(m.group(2)), int(m.group(3))))
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

    # (owner, 2026-10-10) a stat block prints a switchable bonus (wireless, activated, sustained) in brackets, `4(5)`,
    # and folds an always-on one (a reflex recorder, muscle toner, a passive power) into the printed number: the natural
    # value is the printed less every always-on bonus, unless the brackets already hold them all (the core rulebook's
    # `Firearms 4(5)` with a reflex recorder, `A 3(5)` with muscle toner 2: natural 4 and 3). Review notes a reading.
    folded = {}

    def natural(key, printed, nat, aug):
        mine = [(v, sw, n) for k, v, sw, n in boosts if k == key and v]
        always = sum(v for v, sw, _ in mine if not sw)
        if not always or (aug is not None and aug - nat == sum(v for v, sw, _ in mine if sw != "conditional")) or nat - always < 1:
            return nat
        folded[f"natural:{key}"] = f"{printed}|" + " + ".join(f"{n.lower()} {v}" for v, sw, n in mine if not sw)
        return nat - always
    for a in list(attrs):
        attrs[a] = int(natural(a, band[a], *_num(band.get(a))))
    skills = [(i, natural(f"skill:{i}", f"{r}" + (f"({bracket[f'skill:{i}']})" if f"skill:{i}" in bracket else ""), r,
                          bracket.get(f"skill:{i}")), sp, ex) for i, r, sp, ex in skills]
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
                skills=[(r, 1 if sp else 0, 1 if ex else 0) for _, r, sp, ex in skills])  # (an expertise: fit.spend)
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
    # contacts past Charisma's points (or a pair past its cap) under the Sixth World Companion's expanded contacts (SWC
    # p.161; on, or assumed below when the contacts need it): their karma (budgets.ts contactPoints)
    cha, per = attrs.get("cha", 0), setting("contactPointsPerCha")
    expanded = cs.get("expandedContacts") == "true"
    wants = pairs and not expanded and (sum(c + l for c, l in pairs) > cha * per or any(max(c, l) > cha for c, l in pairs))
    if pairs and (expanded or wants):
        ex = cs if expanded else fit.resolve({**raw, "expandedContacts": "true"})  # (assumed: its nested settings apply)
        soft = cha * ex["contactPairPerCha"] if isinstance(ex.get("contactPairPerCha"), float) else math.inf
        past = max(0, sum(c + l for c, l in pairs) - cha * per) + sum(max(0, c + l - soft) for c, l in pairs)
        need["karma"] += past * (ex["contactKarma"] if isinstance(ex.get("contactKarma"), float) else 0)
    got = fit.fit(need, rows, cs) if meta and rows and cs else None
    # the options a book rule gives that the printed numbers need (owner, 2026-10-09), written as the runner's own rules,
    # marked assumed (the book doesn't say): the prime runner's doubled customization Karma (CRB Hong Kong p.63) when no
    # priority assignment holds the build within the standard Karma; the first printing's cap on illegal gear only (CRB
    # p.66) when a legal item is past the Availability cap; the Sixth World Companion's expanded contacts (p.161) when the
    # contacts take more than Charisma x 6 points or a rating above Charisma. Nothing a book rule doesn't explain.
    assumed = []
    if got and got.get("over", 0) > 0 and isinstance(cs.get("startingKarma"), float):
        better = fit.fit(need, rows, fit.resolve({**raw, "levelPrime": "true"}, own={"levelPrime"}))
        if better and better["over"] < got["over"]:
            got = better
            assumed.append(("levelPrime", "true", "CRB-HK", 63))
    if legal_over:
        assumed.append(("availabilityCapIllegalOnly", "true", "CRB", 66))
    if wants:
        assumed.append(("expandedContacts", "true", "SWC", 161))
    # spells, rituals or complex forms past the free ones: bought with the customization Karma, which CRB p.66's list
    # doesn't name (an optional rule, off; Commlink6 has it as an option, off)
    if got and got.get("extraMagic") and got.get("method") in ("priority", "sumtoten") and cs.get("karmaSpellsAtCreation") != "true":
        assumed.append(("karmaSpellsAtCreation", "true", "CRB", 66))
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
    shown.update({f"level:{i}": as_printed for i, as_printed in flat}, **folded)
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


# a cyberlimb printed by its part and kind (`cyberarm (obvious left, …)`): the catalog's `Arm (obvious)`; printed without
# its kind (`cyberarm (Agility 5, …)`, CRB p.87), the obvious one: CRB p.290 prices both, and the Street Samurai's
# printed nuyen holds only the obvious arm's
_LIMB = re.compile(r"cyber\s?(\w+)\s*\(\s*(?:(obvious|synthetic)\b)?", re.I)


def _purchase(idx, kinds, item, n, worn, cs, note=None, legal_over=None, skill_of=None, seen=None, nat=None):
    """A gear line -> (purchase XML or None when the catalog lacks it, worn, its cost at its rating, grade and quantity
    (budgets.ts priced), 0 when it can't be read): `3 x …` the quantity, `(rating N …)` or a trailing number the rating;
    the printed text in its note when it says more than the name. `nat`: the runner's natural attributes (a
    cyberlimb's attribute increases)."""
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
    if (limb := _LIMB.match(rest)) and (limb.group(2) or idx.find(kinds, f"{limb.group(1)} (obvious)", loose=False)):
        whole = f"{limb.group(1)} ({limb.group(2) or 'obvious'})"
    hit = r = None
    # `Hand razors (retractable, alpha)`: the catalog's `Retractable hand razors`, the variant word before the name
    paren = re.search(r"\(([^()]*)\)", rest)
    lead = [f"{p.strip()} {base}" for p in (paren.group(1).split(",") if paren else []) if re.fullmatch(r"\s*[A-Za-z-]+\s*", p)]
    if found := idx.find(kinds, whole, loose=False) or next((f for x in lead if (f := idx.find(kinds, x, loose=False))), None):
        hit, names, r = found, [], printed
    for name, rating in names:
        r = printed or rating
        hit = ((r and idx.find(kinds, f"{name} (Rating {r})", accept=_rated(r))) or idx.find(kinds, name, accept=_rated(r))
               or idx.prefix(kinds, name, r))
        if hit:
            break
    if not hit and len(base.split()) > 1:  # `Sony Emperor commlink`, `Honda Spirit car`; no prefix match (`Combat` axe)
        # but a rated row of the name when a rating is printed (`cyberjack MPI (rating 6)`: `Cyberjack (Rating 6)`)
        r, short = printed, base.rsplit(None, 1)[0]
        hit = idx.find(kinds, short, accept=_rated(r))
        if not hit and r and (p := idx.prefix(kinds, short, r)) and norm(p[2]).endswith(f"rating {r}"):
            hit = p
    if not hit:  # a maker before the name, a garment word swapped, a variant in its parentheses (_Index.near)
        parts = re.split(r"\s*,\s*", m2.group(1)) if (m2 := re.search(r"\(([^()]*)\)", rest)) else []
        r, hit = printed, idx.near(kinds, base, parts)
    if not hit:
        return None, worn, 0
    if hit[0] == "armor":  # (the one worn: the highest Defense Rating, set in build)
        worn.append((int(d.group()) if (d := re.search(r"\d+", hit[3].get("attrs", {}).get("defense") or "")) else 0, n))
    grade = hit[0] == "augmentations" and re.search(r"\((?:[^()]*\W)?(alpha|beta|delta|used)(?:ware)?\s*\)", rest, re.I)
    note = note or (rest if norm(rest) != norm(hit[2]) else None)
    ha = hit[3].get("attrs", {})
    low = re.match(r"\s*(\d*)", ha.get("rating") or "").group(1)  # unrated: the lowest it comes in (budgets.ts ratingOf)
    gf = cs.get(f"grade:{grade.group(1).lower()}:cost", 1) if grade else 1  # (an add-on has its implant's grade, CRB p. 282)
    cost = _value(hit[3], "cost", r or int(low or 1), qty) * gf
    if legal_over is not None:  # a legal item above the Availability cap (the core rulebook's first printing caps only illegal gear)
        avail = _value(hit[3], "avail", r or int(low or 1)) + (cs.get(f"grade:{grade.group(1).lower()}:avail", 0) if grade else 0)
        top = cs.get("maxAvailability")
        if isinstance(top, float) and avail > top and not re.search(r"I\)?\s*$", ha.get("avail") or ""):
            legal_over.append(hit[2])
    # a host with Capacity (`8`, not an accessory's `[2]`) printed with what is fitted to it (`Cyberears (rating 3; w/
    # audio enhancement, select sound filter 3, soundlink)`; Smooth Operations drops the `w/`: `earbuds (rating 3, audio
    # enhancement)`): each one found among the line's kinds is its accessory, at its rating (the engine checks the
    # capacity they take); one the host's text says it has (a sound link) takes none. A host without Capacity takes
    # what is printed with it from an accessory table (a commlink's subvocal microphone, CRB p.268; a car's spoof kit,
    # Double Clutch p.122). An unrated
    # host whose rating is its Capacity (contacts, glasses) comes at the lowest rating that holds what is fitted.
    fitted, room = [], 0
    holds = (hc := ha.get("capacity") or "") and not hc.lstrip().startswith("[") and re.search(r"\d|rating", hc, re.I)
    w = re.search(r"\bw/\s*([^()]*)", rest)
    listed = w.group(1).split(",") if w else [x for x in re.split(r"[,;]", m2.group(1)) if not re.search(r"\brating\b|\d\s*$", x, re.I)] \
        if hit[0] != "weapons" and (m2 := re.search(r"\(([^()]*)\)", rest)) else []
    for i, a in enumerate(x.strip() for x in listed if x.strip()):
        if hit[0] == "weapons":
            break  # (_carried reads a weapon's)
        c = re.fullmatch(r"(\d+)\s+(.*)", a)  # (`10 sheets electronic paper`: 10 of it)
        count, a = (int(c.group(1)), c.group(2)) if c else (1, a)
        t = re.fullmatch(r"(.*?)\s+(\d{1,2})", a)
        an, ar = (t.group(1), int(t.group(2))) if t else (a, None)
        ok = lambda e: _rated(ar)(e) and (holds or bool(re.search(r"accessor", e.get("attrs", {}).get("category") or "", re.I)))  # noqa: E731
        searched = list(dict.fromkeys([hit[0], *kinds, "gear"]))
        got = idx.find(searched, an, accept=ok) or _worded(idx, searched, an)  # (a vehicle's spoof kit is gear)
        if not got or norm(an).replace(" ", "") in norm(hit[3].get("text") or "").replace(" ", ""):
            continue  # (included in the host, its text naming it, or not in the catalog: the note keeps it as printed)
        took = re.fullmatch(r"\s*\[\s*(\d+|rating)\s*\]\s*", got[3].get("attrs", {}).get("capacity") or "", re.I)
        room += (ar or 1 if took.group(1).lower() == "rating" else int(took.group(1))) if took else 0
        cost += _value(got[3], "cost", ar or 1, qty * count) * gf  # (budgets.ts fitted)
        fitted.append(f'<purchase uid="g{n}a{i + 1}" kind="{got[0]}" id={quoteattr(got[1])} name={quoteattr(got[2])}{_a("rating", ar)} qty="{qty * count}"/>')
    # a cyberlimb's printed Agility or Strength above the user's own (CRB p. 289: the increase "add[s] to" the user's
    # attribute, at most 4 over it; a limb's base is 2): that many Attribute increases (p. 290, Rating x 5,000¥) each
    if nat and re.search(r"cyberlimb", ha.get("category") or "", re.I) and (up := idx.find(["augmentations"], "Attribute increase")):
        for word, key in (("agility", "agi"), ("strength", "str")):
            if (v := re.search(rf"\b{word}\s+(\d+)", rest, re.I)) and (inc := int(v.group(1)) - max(nat.get(key, 1), 2)) > 0:
                cost += _value(up[3], "cost", inc, qty) * gf
                fitted.append(f'<purchase uid="g{n}a{key}" kind="{up[0]}" id={quoteattr(up[1])} name={quoteattr(up[2])} rating="{inc}" '
                              f'qty="{qty}" note="{word.title()} {v.group(1)}"/>')
    if r is None and holds and re.fullmatch(r"\s*(?:\d+\s*[–-]\s*(\d+)|rating)\s*", hc, re.I) and room > int(low or 1):
        top = re.search(r"[–-]\s*(\d+)", ha.get("rating") or "")
        r = min(room, int(top.group(1))) if top else room
        cost += (_value(hit[3], "cost", r, qty) - _value(hit[3], "cost", int(low or 1), qty)) * gf
    own = []
    if hit[0] == "weapons":  # its accessories, ammunition and grenades as printed
        kids, own, more = _carried(idx, hit, rest, (b := re.search(r"\[(.*)", note or "")) and b.group(1), qty, n)
        fitted.append(kids)
        cost += more
    return "\n    ".join([_closed(f'<purchase uid="g{n}" kind="{hit[0]}" id={quoteattr(hit[1])} name={quoteattr(hit[2])}{_a("rating", r)} '
                   f'qty="{qty}"{_a("grade", grade and grade.group(1).lower())}{_a("note", note)}',
                   _bonuses(hit[2], r, skill_of, chosen=_chosen(rest), seen=seen) + "".join(fitted), "purchase")] + own), worn, cost


def _times(v):
    """`x1.5`, `×2`: an add-on's price as a multiple of its host's (budgets.ts hostTimes), else None."""
    m = re.fullmatch(r"\s*[x×]\s*(\d+(?:\.\d+)?)\s*", v or "")
    return float(m.group(1)) if m else None


def _worded(idx, kinds, name):
    """The one accessory-table entry each of whose words is printed in `name` (a word by its first five letters:
    `small smugglers compartment` the cyberlimb's Smuggling compartment), its last word among them (`arm slide`: the
    Slide); else None."""
    words = norm(name).split()
    same = lambda a, b: a == b or (len(a) >= 5 and len(b) >= 5 and a[:5] == b[:5])  # noqa: E731
    found = {}
    for kind in kinds:
        for e in idx.entries(kind):
            ew = norm(e["name"]).split()
            if ew and re.search(r"accessor", e.get("attrs", {}).get("category") or "", re.I) and words \
                    and all(any(same(x, w) for w in words) for x in ew) and any(same(x, words[-1]) for x in ew):
                found.setdefault(norm(e["name"]), (kind, e["id"], e["name"], e))
    return next(iter(found.values())) if len(found) == 1 else None


def _kinds(name):
    """The kinds of weapon a name says (rules.ts ammoKinds): `Holdout/Light Pistol` -> holdout, light pistol; `SMG` ->
    submachine gun; a plural s cut."""
    out = []
    for part in name.split("/"):
        k = re.sub(r"^hold ?out$", "holdout", norm(part))
        out.append(re.sub(r"s$", "", "submachine gun" if re.fullmatch(r"smgs?", k) else k))
    return [k for k in out if k]


def _carried(idx, host, rest, bracket, qty, n):
    """What a weapon line is printed with: `w/ silencer, smartgun system, 5 spare clips` after the stats in its brackets
    (or in its name's parentheses, `Bow (Rating 5; w/ 20 arrows)`), each found among the weapon accessories,
    modifications (Firing Squad pp. 58-62) and projectiles (a count before it is its quantity) and fitted to the weapon; `100 rounds gel ammo` anywhere in the
    brackets, the ammunition row of the weapon's kind (its last word too: an assault rifle takes rifle ammunition), per
    its unit of rounds, with the ammunition type its words name fitted to it (gel, APDS); `6 stun grenades`, the
    grenade of that name. Each comes once per weapon on the line (`2 x …`). One the weapon's text names (a built-in
    smartgun) or the catalog lacks stays in the note only. -> (fitted XML, lines of their own, their cost)"""
    fitted, own, cost, i = [], [], 0, 0
    text = norm(host[3].get("text") or "").replace(" ", "")
    pieces = [(p, True) for p in split(m.group(1))] if (m := re.search(r"\bw/\s*([^()]*)", rest)) else []
    stats = split(bracket or "")
    at = next((j for j, p in enumerate(stats) if p.lstrip().lower().startswith("w/")), len(stats))
    pieces += [(re.sub(r"^\s*w/\s*", "", p), j >= at) for j, p in enumerate(stats)]
    for piece, listed in pieces:
        piece = piece.strip(" )]")
        for part in re.split(r"(?<=[a-z])\s+(?=\d+\s+rounds?\b)", piece):  # (`personalized grip 70 rounds …`: no comma)
            i += 1
            if rd := re.fullmatch(r"(\d+)\s+rounds?\b.*", part, re.I):
                ha = host[3].get("attrs", {})  # (Firing Squad's `Revolution arm` table: its type, `Assault Rifle`)
                want = _kinds(ha.get("type") or ha.get("category") or "")
                want = want and [want[0], want[0].split()[-1]]
                row = next((e for k in want or [] for e in idx.entries("gear") if re.search(r"round", e["attrs"].get("per") or "")
                            and k in _kinds(e["name"])), None)
                if row:
                    per = int(re.match(r"\s*(\d*)", row["attrs"]["per"]).group(1) or 1)
                    q = math.ceil(int(rd.group(1)) / per) * qty
                    base = _value(row, "cost", 1, q)
                    # its ammunition type (`gel`, `APDS`, `Stick-n-Shock`, `caseless`: CRB p. 261, the row's price
                    # times the type's) fitted to the row: host x (N - 1) (budgets.ts hostTimes)
                    words, types = norm(part).split(), {}
                    for t in idx.entries("ammotypes"):
                        tw = norm(t["name"]).split()
                        if tw and all(x in words for x in tw) and (f := _times(t["attrs"].get("cost"))):
                            types.setdefault(norm(t["name"]), (t, f))
                    kids = "".join(f'<purchase uid="g{n}x{i}t{j + 1}" kind="ammotypes" id={quoteattr(t["id"])} name={quoteattr(t["name"])} qty="1"/>'
                                   for j, (t, _) in enumerate(types.values()))
                    cost += base + sum(base * (f - 1) for _, f in types.values())
                    own.append(_closed(f'<purchase uid="g{n}x{i}" kind="gear" id={quoteattr(row["id"])} name={quoteattr(row["name"])} qty="{q}"{_a("note", part)}', kids, "purchase"))
                continue
            if gr := re.fullmatch(r"(\d+)\s+(.+?)\s+grenades?", part, re.I):
                e = next((e for e in idx.entries("weapons") if re.search(r"grenade", e["attrs"].get("category") or "", re.I)
                          and norm(e["name"]).startswith(norm(gr.group(2)))), None)
                if e:
                    q = int(gr.group(1)) * qty
                    cost += _value(e, "cost", 1, q)
                    own.append(f'<purchase uid="g{n}x{i}" kind="weapons" id={quoteattr(e["id"])} name={quoteattr(e["name"])} qty="{q}"{_a("note", part)}/>')
                continue
            if not listed or not part:
                continue
            c = re.fullmatch(r"(\d+)\s+(.*)", part)
            count, name = (int(c.group(1)), c.group(2)) if c else (1, part)
            ok = lambda e: bool(re.search(r"accessor|projectile|modification", e.get("attrs", {}).get("category") or "", re.I))  # noqa: E731
            got = idx.find(["weapons"], name, accept=ok) or idx.find(["weapons"], _one(norm(name)), accept=ok)
            if not got and (p := idx.prefix(["weapons"], name, None)) and ok(p[3]):  # `smartgun system`: its first row
                got = p
            if not got or norm(name).replace(" ", "") in text:
                continue
            low = re.match(r"\s*(\d*)", got[3].get("attrs", {}).get("rating") or "").group(1)
            q = count * qty
            cost += _value(got[3], "cost", int(low or 1), q)
            fitted.append(f'<purchase uid="g{n}a{i}" kind="weapons" id={quoteattr(got[1])} name={quoteattr(got[2])} qty="{q}"/>')
    return "".join(fitted), own, cost


# what a standard boost adds per rating or level (the engine counts only the bonuses a line carries, the catalog has none):
# CRB p.157 (Improved Reflexes), pp.286-292 (dermal plating, bone lacing's table, wired reflexes, reaction enhancers,
# muscle toner and augmentation) and p.288 (a cyberlimb's Physical box). The book's printed augmented values are compared
# to these on Review. Each is (target, value[, when[, switch]]): a switchable one (wireless, activated, sustained,
# conditional) is printed in a stat block's brackets, an always-on one folded into the printed number (owner, 2026-10-10).
BOOSTS = {"improved reflexes": (("rea", 1), ("initDice", 1)),
          # CRB p.287: a trigger turns wired reflexes on and off
          "wired reflexes": (("rea", 1, None, "activated"), ("initDice", 1, None, "activated")),
          # CRB p.158: Improved Ability is passive, its level added to the skill bought for (`skill:?`)
          "improved ability skill": (("skill:?", 1),),
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
          "voice modulator": (("skill:con", 1, "sound-based Con tests, with its wireless bonus", "wireless"),),
          "tailored pheromones": (("skill:con", 1, "Con tests within conversation range (Charisma + rating)", "activated"),
                                  ("skill:influence", 1, "Influence tests within conversation range (Charisma + rating)", "activated"))}


def _bonuses(name, rating, skill_of=None, chosen=None, seen=None):
    """The <bonus> lines of a catalog entry named `name` bought at `rating` (or level): per rating, or at the level its
    name ends with (`Wired Reflexes 2`); none for anything else. A skill's (`skill:con`) needs `skill_of` (a skill's name
    -> its id, None: left out); one that holds on some tests only carries `when`, a switchable one `switch`. `skill:?` is
    the skill it was bought for, `chosen` (its printed `(Firearms)`). `seen`: each is added to it as (attribute or
    `skill:<id>`, total, switch or None, name)."""
    m = re.fullmatch(r"(.*?)(?:\s+(\d+))?", norm(name))
    out = []
    for t, v, *more in BOOSTS.get(m.group(1), ()):
        when, switch = (more + [None, None])[:2]
        switch = switch or (when and "conditional")
        total = v * (rating or int(m.group(2) or 1))
        skill = skill_of(chosen if t == "skill:?" else t[6:]) if t.startswith("skill:") and skill_of and (chosen or t != "skill:?") else None
        if t.startswith("skill:") and not skill:
            continue
        if seen is not None:
            seen.append((f"skill:{skill}" if skill else t, total, switch, name))
        head = f'<bonus target="skill" skill={quoteattr(skill)}' if skill else f'<bonus target="{t}"'
        out.append(head + (f' value="{v}" perRating="true"' if rating else f' value="{total}"') + _a("when", when)
                   + _a("switch", switch) + "/>")
    return "".join(out)


def _chosen(rest):
    """The one thing printed in a line's parentheses (`reflex recorder (Firearms)`, `Improved Ability (Con) 3`: Firearms,
    Con), else None."""
    m = re.fullmatch(r"[^()]*\(([^(),;]+)\)\s*\d*\s*", rest)
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
