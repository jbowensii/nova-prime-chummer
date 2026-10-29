"""Commlink6's own classification on our entries (docs/sr6-data-format.md, the `class` attribute): its TYPE/SUBTYPE
keys, verbatim. classes/category_class.json ({kind: {category: class}}, made by tools/cl6check/classmap.py from the
categories whose entries Commlink6 classes alike, 90% or more) gives every entry of such a category its class; one the
table doesn't reach gets none (we invent no class for what Commlink6 doesn't have), and an entry that has a class
already, one the per-book override table set, keeps it. The Foundry module translates the keys to Eden's later.
classes/section_prefix.json then gives every entry of a source's section, by kind and printed page, one class, whatever
it had: a deliberate extra (classes/extra_classes.json: not Commlink6's), or Commlink6's own where the rule says so
(`"commlink6": true`). Body Shop's critter-only chapter is all `CRITTERWARE/AUGMENTATION`, which the app keeps out of
the player's pickers; the Companion's Infected qualities are `INFECTED` and its Infected optional powers
`INFECTED/OPTIONAL_POWER`, which the app offers only with the table's infectedAllowed rule on."""

import json
import re
from collections import Counter
from pathlib import Path

from importer.sr6 import hooks, overrides

FILE = Path(__file__).with_name("classes") / "category_class.json"
PREFIXES = Path(__file__).with_name("classes") / "section_prefix.json"
EXTRA = Path(__file__).with_name("classes") / "extra_classes.json"


def table(path=FILE):
    """The class table read from `path`, else empty."""
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else {}


def extra(path=EXTRA):
    """{class: reason} of the deliberate extra classes (not Commlink6's): a class of ours that no Commlink6 record
    has."""
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else {}


def prefixes(path=PREFIXES):
    """The section classes: [{src, kinds, pages: [first, last], class}]."""
    return json.loads(Path(path).read_text(encoding="utf8")) if Path(path).is_file() else []


def in_section(rule, src, kind, page):
    """Whether an entry of source `src`, `kind` and printed `page` lies in the section `rule` names."""
    try:
        n = int(page)
    except (TypeError, ValueError):
        return False
    return (
        (src or "").lower() == rule["src"].lower()
        and kind in rule["kinds"]
        and rule["pages"][0] <= n <= rule["pages"][1]
    )


def apply(files, cmap=None, src=None, rules=None):
    """files ({<kind>.xml: xml}) with `class` set on each entry whose (kind, category) is in the map, and on each
    categories.xml entry of such a category (its `of` kind and name)."""
    cmap = table() if cmap is None else cmap
    rules = [r for r in (prefixes() if rules is None else rules) if (src or "").lower() == r["src"].lower()]
    if not cmap and not rules:
        return files
    from lxml import etree

    out = dict(files)
    for name, xml in files.items():
        kind = name[:-4]
        sect = [r for r in rules if kind in r["kinds"]]
        if not xml or not name.endswith(".xml") or kind not in cmap and kind != "categories" and not sect:
            continue
        root = etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))
        changed = False
        for e in root:
            if not isinstance(e.tag, str):
                continue
            if not e.get("class"):
                if kind == "categories":
                    cls = cmap.get(e.get("of") or "", {}).get(e.findtext("name") or "")
                else:
                    cls = cmap.get(kind, {}).get(
                        e.get("category") or (e.get("type") if kind == "programs" else "") or ""
                    )
                if cls:
                    e.set("class", cls)
                    changed = True
            for r in sect:  # (the section's class, whatever the entry had: the map's, a row's, Commlink6's)
                if in_section(r, src, kind, e.get("page")) and e.get("class") != r["class"]:
                    e.set("class", r["class"])
                    changed = True
        if changed:
            out[name] = overrides.dump(xml, root)
    return out


HOST_SLOTS = {"CYBERWARE/CYBER_EYEWARE": "cybereye-implant", "CYBERWARE/CYBER_EARWARE": "cyberear-implant"}
IMPLANT_HOST_SLOTS = {"cybereye-implant", "cyberear-implant", "cyberlimb-implant", "headware-implant"}

MOUNTS = {
    "top": ("top",),
    "under": ("under",),
    "barrel": ("barrel",),
    "stock": ("stock",),
    "side": ("side-l", "side-r"),
}
# a weapon with no class subtype and no size: its size guessed from its printed category (fit plan Stage 2.5, owner
# ruling 3: every guess is flagged `sizeFrom="category"` for review, never silent). Same bands as rule Z.
SIZE_GUESS = (
    (r"hold-?out|taser|light pistol", "TINY"),
    (r"heavy pistol|machine pistol|dart", "SMALL"),
    (r"submachine|\bsmg", "MEDIUM"),
    (r"shotgun|assault rifle", "LARGE"),
    (r"sniper|hunting|rifle|\b[lmh]mg\b|machine gun|cannon|launcher|thrower|ballista", "BIG"),
)


def _num(s):
    """A capacity as a number (`4`, `0.5`), else None (a formula, nothing)."""
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def _seats(s):
    """The seats a vehicle has for Cargo Factor, as Commlink6 counts them: `2+2` (front and back) adds up, `2/10` is the
    larger (Commlink6 gives the GMC Bulldog 10, not 12)."""
    return max((sum(int(n) for n in re.findall(r"\d+", part)) for part in (s or "").split("/")), default=0)


def _first(s):
    """The first whole number printed (`5`, `4/6`: 4), else 0."""
    m = re.search(r"\d+", s or "")
    return int(m.group()) if m else 0


def _social(s):
    """An armor's printed Social (`+2`, `–4`), else None (`—`, nothing)."""
    m = re.fullmatch(r"\s*([+\-–]?)\s*(\d+)\s*", s or "")
    if not m:
        return None
    return -int(m.group(2)) if m.group(1) in ("-", "–") else int(m.group(2))


def _fmt(x):
    return f"{x:g}"


def _host_hooks(e, kind, typ, sub, slots):
    """{slot id: (capacity, maxSize, rule)} Commlink6's code adds (rules S, V, F), the vehicle bases with the data's
    HOOK value added to them (the stock-modifications step runs after the vehicle step: a valmod adds, an itemmod with
    no value adds 1, Stage 1-4 decompile). slots: {id: element} the entry offers already; one a rule made (`rule`) is
    done (a second run changes nothing)."""
    out = {}
    if kind == "vehicles" and (e.get("body") or "").strip():
        body = max(map(int, re.findall(r"\d+", e.get("body"))), default=0)  # (`12(16)`: Commlink6 takes 16)
        vhooks, max_size = hooks.vehicle_hooks(typ, sub, body, _seats(e.get("seats")), _first(e.get("pilot")))
        for hook, cap in vhooks.items():
            sid = hooks.slot_id(hook)
            if hook == "SOFTWARE" and sid in slots:
                continue  # (autosofts by Pilot only where the data gives no SOFTWARE hook)
            have = slots.get(sid)
            if have is not None and have.get("rule"):
                continue
            add = 0.0 if have is None else (_num(have.get("value")) if have.get("value") else 1.0)
            if add is None:
                continue  # (a formula the data gives: left as it is)
            out[sid] = (cap + add, max_size.get(hook), "V")
    std = {h: (c, "S") for h, c in hooks.standard_hooks(typ, sub).items()}
    if kind == "armor":
        std.update({h: (c, "F") for h, c in hooks.fashion_hook(typ, sub, _social(e.get("social"))).items()})
    for hook, (cap, rule) in std.items():  # (S and F: a base too, the data's HOOK added, as V)
        sid, have = hooks.slot_id(hook), slots.get(hooks.slot_id(hook))
        if sid in out or (have is not None and have.get("rule")):
            continue
        add = 0.0 if have is None else (_num(have.get("value")) if have.get("value") else 1.0)
        if add is not None:
            out[sid] = (cap + add, None, rule)
    return out


def _weapon_size(e, typ, sub):
    """(size, how) of a weapon: the data's (how None), Commlink6's subtype rule (`class`), a guess from its printed
    category for one with no subtype (`category`), else (None, None)."""
    if e.get("size"):
        return e.get("size").upper(), None
    size = hooks.weapon_size(typ, sub, None)
    if size:
        return size, "class"
    if not sub and not typ.startswith(("WEAPON_CLOSE", "WEAPON_RANGED")):
        cat = f"{e.get('category') or ''} {e.findtext('name') or ''}".casefold()
        for pat, s in SIZE_GUESS:
            if re.search(pat, cat):
                return s, "category"
    return None, None


def associations(files, report=None):
    """files with the hooks Commlink6's model gives each entry (importer/sr6/hooks.py), wherever a row has not given
    them: a host's `<slot id value unit maxSize rule>` by its class (standard hooks, the vehicle capacities
    computed from Body, Seats and Pilot, fashion on armor), a weapon's size and its synthesized `<fits rule="W|I">`
    (vehicle mounts, implants), and a weapon accessory's `<fits>` for each mount its MOUNT column names. Slots apply in
    the data's order: a `remove="true"` takes the hook away, a slot two rows give is kept once (the one with a value).
    An eyeware/earware/cyberlimb host with no implant slot from Commlink6 gets one from its printed capacity (a
    book-only item). report: a Counter, given the counts (sizes guessed, fallbacks)."""
    from lxml import etree

    report = Counter() if report is None else report
    out = dict(files)
    for name, xml in files.items():
        kind = name[:-4]
        if not xml or not name.endswith(".xml") or kind not in KINDS_WITH_HOOKS:
            continue
        root = etree.fromstring(re.sub(r"^<\?xml[^>]*\?>\s*", "", xml).encode("utf8"))
        changed = False
        for e in root:
            if not isinstance(e.tag, str):
                continue
            cls = e.get("class") or ""
            typ, _, sub = cls.partition("/")
            before = etree.tostring(e)

            def add(tag, attrs, e=e):
                k = etree.Element(tag, attrs)
                t = next((c for c in e if c.tag == "text"), None)
                e.insert(list(e).index(t) if t is not None else len(e), k)
                return k

            # slots in the data's order, as Commlink6 applies them: a removal takes away what came before it (the code's
            # hooks too) and stays as the one marker; a slot after it gives the hook back (the quadrotor: remove, then a
            # valmod 0); otherwise one per id, the one with a value
            gone, back, slots = set(), set(), {}
            for c in [c for c in e if c.tag == "slot"]:
                sid = c.get("id")
                old = slots.get(sid)
                if c.get("remove") == "true":
                    if old is not None:
                        e.remove(old)
                    gone.add(sid)
                    slots[sid] = c
                elif old is not None and old.get("remove") == "true":
                    e.remove(old)
                    gone.discard(sid)
                    back.add(sid)  # (given back after the code's hook was taken: no code base under it)
                    slots[sid] = c
                elif old is not None and (old.get("value") or not c.get("value")):
                    e.remove(c)
                else:
                    if old is not None:
                        e.remove(old)
                    slots[sid] = c
            for sid, (cap, max_size, rule) in _host_hooks(e, kind, typ, sub, slots).items():
                if sid in gone or sid in back:
                    continue
                attrs = {
                    "id": sid,
                    "value": _fmt(cap),
                    **({"maxSize": _fmt(max_size)} if max_size else {}),
                    "rule": rule,
                }
                if sid in slots:
                    slots[sid].attrib.update(attrs)
                else:
                    slots[sid] = add("slot", attrs)
            cap = (e.get("capacity") or "").strip()
            # ponytail: a bare-integer capacity marks the eyeware/earware/cyberlimb HOST of a book-only item
            # (Commlink6's variant HOOK gives a matched one its slot); an accessory prints `[n]`. Tighten if an
            # accessory ever prints a bare integer.
            if re.fullmatch(r"\d+", cap) and not IMPLANT_HOST_SLOTS & set(slots):
                sid = HOST_SLOTS.get(cls) or ("cyberlimb-implant" if cls == "CYBERWARE/CYBER_LIMBS" else None)
                if sid:
                    add("slot", {"id": sid, "value": cap})
                    report["fallback.implant-slot"] += 1
            for c in e:
                if c.tag == "slot" and not c.get("unit"):
                    c.set("unit", hooks.unit(c.get("id")))
                    if c.get("unit") == "capacity" and not c.get("value") and c.get("remove") != "true":
                        c.set("value", "1")  # (a capacity hook the data gives with no value: Commlink6 makes it 1)
            # fits: one per slot (the one with a cost or mode: the latest generator's)
            fits = {}
            for c in [c for c in e if c.tag == "fits"]:
                s = c.get("slot")
                if s in fits:
                    keep, drop = (c, fits[s]) if len(c.attrib) > len(fits[s].attrib) else (fits[s], c)
                    e.remove(drop)
                    fits[s] = keep
                else:
                    fits[s] = c
            if kind == "weapons" and (typ.startswith("WEAPON_") or not cls):
                size, how = _weapon_size(e, typ, sub)
                if how:
                    e.set("size", size.capitalize())
                    e.set("sizeFrom", how)
                    report[f"size.{how}"] += 1
                embedded = {hooks.hook_of(s) for s, c in fits.items() if c.get("mode", "embedded") == "embedded"}
                for hook, rule in hooks.synth_usages(typ or "WEAPON_FIREARMS", sub, size, embedded):
                    if hooks.slot_id(hook) not in fits:
                        add("fits", {"slot": hooks.slot_id(hook), "mode": "embedded", "rule": rule})
                        fits[hooks.slot_id(hook)] = True
            elif cls == "ACCESSORY/WEAPON_ACCESSORY":
                for m in re.split(r"\s*(?:/|,|\bor\b)\s*", e.get("mount") or ""):
                    for x in MOUNTS.get(m.strip().casefold(), ()):
                        if x not in fits:
                            add("fits", {"slot": x})
                            fits[x] = True
            changed = changed or etree.tostring(e) != before
        if changed:
            out[name] = overrides.dump(xml, root)
    return out


KINDS_WITH_HOOKS = ("augmentations", "weapons", "gear", "vehicles", "armor", "electronics")
