"""Commlink6's hook graph, item by item: the hooks each item OFFERS (with capacity), the usages it DECLARES (hook, mode,
cost) and its grouped requirements, plus a census against what our importer emits (fit plan Stage 0,
docs/analysis/sr6-fit-stage0-findings.md):

  python -m tools.cl6check.hookmap [--jar JAR] [--ours <runs dir>]

Commlink6 gets hooks from the data (`itemmod/valmod type=HOOK`, `itemhookmod`, `remove="true"`) AND from code. The
code rules below were read from the 1.14.0 jar by decompiling (CFR, 2026-10-29); they are written here as rules in our
own words, no Commlink6 code or data is in the repo. Read-only: no override table, no report file."""

import sys
from collections import Counter

from tools.cl6check import canon

from importer.sr6.hooks import (  # (the rules live with the importer, which applies them; this tool measures with them)
    UNBOUNDED,
    fashion_hook,
    standard_hooks,
    synth_usages,
    vehicle_hooks,
    weapon_size,
)


def _int(s):
    """The leading whole number of a stat (`10`, `4+2`), else 0."""
    digits = ""
    for ch in (s or "").strip():
        if not ch.isdigit():
            break
        digits += ch
    return int(digits) if digits else 0


def _stats(el):
    """(body, seats, pilot, social) the record gives (0/None when it gives none)."""
    v = next(iter(canon._own(el, "vehicle")), None)  # pylint: disable=protected-access
    a = next(iter(canon._own(el, "armor")), None)  # pylint: disable=protected-access
    social = (a.get("social") if a is not None else None) or canon.attrdef(el, "DEFENSE_SOCIAL")[0]
    seats = _int(v.get("sea")) if v is not None else _int(canon.attrdef(el, "SEATS")[0])
    try:
        social = int(social.replace("–", "-")) if social not in (None, "") else None
    except ValueError:
        social = None
    if v is None:
        return 0, seats, 0, social
    return _int(v.get("bod")), seats, _int(v.get("pil")), social


def _num(s):
    try:
        return float(s)
    except (TypeError, ValueError):
        return s  # (a formula: `$RATING`, a table)


def _scopes(el):
    """[(variant id | None, element)]: the record, then each variant."""
    return [(None, el)] + [(v.get("id"), v) for v in canon._own(el, "variant")]  # pylint: disable=protected-access


def _walk(scope):
    """Every descendant of `scope`, except what sits inside a nested `<variant>` or `<mode>` (their own scopes) or a
    `<geardef>` (another item)."""
    for c in scope:
        if c.tag in ("variant", "mode", "geardef"):
            continue
        yield c
        yield from _walk(c)


def requirements(el):
    """[{variant, group, negate, apply, tag, type, ref, value}]: each test of the record's (and its variants')
    `<requires>`, outside a `<mode>`. group 0 = the plain tests (all must hold); each `<selreq>` is its own group
    1, 2, … (any one of its tests holds)."""
    out = []
    for var, scope in _scopes(el):
        n = 0
        for rq in canon._own(scope, "requires"):  # pylint: disable=protected-access
            for q in rq:
                if q.tag == "selreq":
                    n += 1
                    tests, g = list(q), n
                else:
                    tests, g = [q], 0
                for t in tests:
                    if t.tag in ("datareq", "valuereq"):
                        out.append(
                            {
                                "variant": var,
                                "group": g,
                                "negate": t.get("negate") == "true",
                                "apply": t.get("apply"),
                                "tag": t.tag,
                                "type": t.get("type"),
                                "ref": t.get("ref"),
                                "value": t.get("value"),
                            }
                        )
    return out


def usages(el):
    """[{hook, mode, cost, variant, source}]: the usages the data declares (source "data"; an item declaring none
    is CARRIED by code, source "C"), then the ones code adds to weapons (source "W"/"I"). cost: the usage `value`
    (capacity in the hook, or Essence when IMPLANTED with no hook), else None."""
    typ, sub = el.get("type") or "", el.get("subtype") or ""
    out = []
    for var, scope in _scopes(el):
        for u in canon._own(scope, "usage"):  # pylint: disable=protected-access
            out.append(
                {
                    "hook": u.get("slot"),
                    "mode": u.get("mode"),
                    "cost": _num(u.get("value")),
                    "variant": var,
                    "source": "data",
                }
            )
    if not any(u["variant"] is None for u in out) and not (el.get("reqVariant") == "true" and out):
        out.append({"hook": None, "mode": "CARRIED", "cost": None, "variant": None, "source": "C"})
    size = weapon_size(typ, sub, canon.attrdef(el, "WEAPON_SIZE")[0])
    embedded = {u["hook"] for u in out if u["mode"] == "EMBEDDED" and u["variant"] is None and u["hook"]}
    for hook, rule in synth_usages(typ, sub, size, embedded):
        out.append({"hook": hook, "mode": "EMBEDDED", "cost": None, "variant": None, "source": rule})
    return out


def offered(el):
    """[{hook, capacity, variant, source, maxSize}]: every hook the item offers, by source. data: an itemmod/valmod
    HOOK (capacity: the valmod value, an adjustment where code computes a base: zodiac VEHICLE_CHASSIS -3);
    hookmod: an `itemhookmod attr=CAPACITY`; remove: an `itemmod remove="true"` (takes a code hook away);
    S/V/F: the code's standard, vehicle and fashion rules, each only where the data offers no such hook."""
    typ, sub = el.get("type") or "", el.get("subtype") or ""
    out = []
    for var, scope in _scopes(el):
        for x in _walk(scope):
            if x.tag in ("valmod", "itemmod") and x.get("type") == "HOOK" and x.get("ref"):
                src = "remove" if x.get("remove") == "true" else "data"
                out.append({"hook": x.get("ref"), "capacity": _num(x.get("value")), "variant": var, "source": src})
            elif x.tag == "itemhookmod" and (x.get("attr") or "").upper() == "CAPACITY":
                out.append(
                    {"hook": x.get("hook"), "capacity": _num(x.get("value")), "variant": var, "source": "hookmod"}
                )
    have = {o["hook"] for o in out if o["source"] != "remove"}
    body, seats, pilot, social = _stats(el)
    vhooks, max_size = vehicle_hooks(typ, sub, body, seats, pilot)
    if "SOFTWARE" in have:
        vhooks.pop("SOFTWARE", None)
    for src, hooks in (("V", vhooks), ("S", standard_hooks(typ, sub)), ("F", fashion_hook(typ, sub, social))):
        for hook, cap in hooks.items():
            if src == "V" or hook not in have:  # (vehicle capacities are SET by code; a data valmod adjusts them)
                out.append(
                    {"hook": hook, "capacity": cap, "variant": None, "source": src, "maxSize": max_size.get(hook)}
                )
                have.add(hook)
    return out


def final_hooks(el):
    """{hook} the item offers once code has run: every hook offered, less the ones a `remove` takes away."""
    rows = offered(el)
    gone = {o["hook"] for o in rows if o["source"] == "remove"}
    return {o["hook"] for o in rows if o["source"] != "remove"} - gone


def capacities(el):
    """{hook: capacity | None} the item ends up with, as Commlink6 builds it: the vehicle (V), standard (S) and fashion
    (F) hooks first, then the record's own HOOK modifications (not its variants'): a valmod adds to a hook that exists
    and makes one that doesn't, an itemmod adds 1 to a capacity hook (makes it at 1; a one-item hook at None), a remove
    takes it away (Stage 1-4 decompile). `itemhookmod` is ignored, as Commlink6 1.14.0 ignores it."""
    from importer.sr6.hooks import CAPACITY_HOOKS  # pylint: disable=import-outside-toplevel

    typ, sub = el.get("type") or "", el.get("subtype") or ""
    body, seats, pilot, social = _stats(el)
    out = dict(vehicle_hooks(typ, sub, body, seats, pilot)[0])
    mods = [x for x in _walk(el) if x.tag in ("valmod", "itemmod") and x.get("type") == "HOOK" and x.get("ref")]
    if any(x.get("ref") == "SOFTWARE" and x.get("remove") != "true" for x in mods):
        out.pop("SOFTWARE", None)
    for h, c in {**standard_hooks(typ, sub), **fashion_hook(typ, sub, social)}.items():
        out.setdefault(h, c)  # (S runs before the data's mods are applied: a base they add to, as V)
    for x in mods:
        h = x.get("ref")
        if x.get("remove") == "true":
            out.pop(h, None)
        elif x.tag == "valmod" and isinstance(_num(x.get("value")), float):
            out[h] = (out.get(h) or 0.0) + _num(x.get("value"))
        elif h in CAPACITY_HOOKS and x.tag == "itemmod":
            out[h] = (out.get(h) or 0.0) + 1.0
        else:
            out.setdefault(h, None)
    return out


def norm(h):
    """Our slot id for a Commlink6 hook (`VEHICLE_CF` -> `vehicle-cf`)."""
    return canon._norm(h)  # pylint: disable=protected-access


def census(items):
    """Counter of the Stage 0 numbers over Commlink6 `<item>` elements."""
    c = Counter()
    for el in items:
        typ = el.get("type") or ""
        rows, us, rq = offered(el), usages(el), requirements(el)
        for o in rows:
            c[f"offer.{o['source']}"] += 1
            c[f"offer.{o['source']}.{o['hook']}"] += 1
            if o["source"] == "data" and o["variant"]:
                c["offer.data.variant"] += 1
            if o.get("maxSize"):
                c["offer.maxSize"] += 1
        for u in us:
            c[f"usage.{u['source']}"] += 1
            c[f"usage.mode.{u['mode']}"] += 1
            if u["source"] == "data" and u["cost"] is not None:
                c["usage.cost"] += 1
                c[f"usage.cost.{u['mode']}"] += 1
            if u["source"] in ("W", "I"):
                c[f"usage.{u['source']}.{u['hook']}"] += 1
        c["req"] += len(rq)
        c["req.selreq_groups"] += len({(r["variant"], r["group"]) for r in rq if r["group"]})
        c["req.in_selreq"] += sum(1 for r in rq if r["group"])
        c["req.negate"] += sum(1 for r in rq if r["negate"])
        c["items.with_req"] += bool(rq)
        if typ in ("CYBERWARE", "BIOWARE", "GENEWARE", "NANOWARE"):
            c["aug.vehicle_usage"] += sum(1 for u in us if (u["hook"] or "").startswith("VEHICLE"))
    c["items"] = len(items)
    return c


def compare_ours(pairs, raw):
    """Counter: for each matched (Commlink6 item, our entry) pair, which of Commlink6's offered hooks and usage hooks
    our entry carries, split by the Commlink6 source; plus our slots Commlink6 never offers. raw: {cl6 id: element}."""
    c = Counter()
    for cl, o in pairs:
        el = raw.get(cl["el"].get("id")) if cl.get("tag") == "item" else None
        if el is None:
            continue
        ours = o["families"].get("slots") or frozenset()
        oslot = {i for k, i in ours if k == "slot"}
        ofits = {i for k, i in ours if k == "fits"}
        c["pairs"] += 1
        gone = {r["hook"] for r in offered(el) if r["source"] == "remove"}
        cl6slots = set()
        for r in offered(el):
            if r["source"] == "remove" or r["hook"] in gone:
                continue
            h = norm(r["hook"])
            cl6slots.add(h)
            key = f"{r['source']}{'.variant' if r['variant'] else ''}"
            c[f"offer.{key}"] += 1
            c[f"offer.{key}.ours"] += h in oslot
            if h not in oslot:
                c[f"miss.offer.{r['source']}.{r['hook']}"] += 1
        for h in oslot - cl6slots:
            c[f"extra.slot.{h}"] += 1
        vals = o.get("slotvals") or {}
        for h, cap in capacities(el).items():  # (the capacity, where Commlink6 has a number and ours has the hook)
            if isinstance(cap, float) and norm(h) in vals:
                c["value"] += 1
                ok = _num(vals.get(norm(h))) == cap or (
                    cap >= UNBOUNDED and (_num(vals.get(norm(h))) or 0) >= UNBOUNDED
                )
                c["value.ours"] += ok
                if not ok:
                    c[f"miss.value.{h}"] += 1
        costs = o.get("fitcost") or {}
        for u in usages(el):
            if u["source"] == "data" and u["hook"] and isinstance(u["cost"], float) and norm(u["hook"]) in costs:
                c["cost"] += 1
                c["cost.ours"] += _num(costs.get(norm(u["hook"]))) == u["cost"]
        for u in usages(el):
            if u["mode"] != "EMBEDDED" or not u["hook"]:
                continue
            key = f"{u['source']}{'.variant' if u['variant'] else ''}"
            c[f"fits.{key}"] += 1
            c[f"fits.{key}.ours"] += norm(u["hook"]) in ofits
    return c


def main(argv):
    """Print the census (and, with --ours, the comparison with our catalogs)."""
    from tools.cl6check import ours, reader  # pylint: disable=import-outside-toplevel

    jar = reader.find_jar(argv[argv.index("--jar") + 1] if "--jar" in argv else None)
    if not jar:
        print("hookmap: skipped (no Commlink6 jar)")
        return 0
    recs, _ = reader.read(jar)
    raw = {}
    for r in recs:
        if r["tag"] == "item":
            raw.setdefault(r["id"], r["el"])
    for k, v in sorted(census(list(raw.values())).items()):
        print(f"{k}\t{v}")
    if "--ours" in argv:
        from tools.cl6check.__main__ import compare  # pylint: disable=import-outside-toplevel

        pairs = compare([canon.canonical(r) for r in recs], ours.load(argv[argv.index("--ours") + 1]), pdf=False)[2]
        print("--- ours vs Commlink6 ---")
        for k, v in sorted(compare_ours(pairs, raw).items()):
            print(f"{k}\t{v}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
