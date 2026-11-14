"""Evaluates every matched (CL6 modification, our entry) pair: does our entry carry the same effect? Pure: rows in,
statuses out."""

import json
import os
import re
from collections import Counter, defaultdict

from tools.cl6effects import xlate as X
from tools.cl6effects.xlate import GROUPS, ABBR, CHECK_KIND, _slug

# pylint: disable=invalid-name  # short names from the Commlink6 tables: R, A, BR, PH, IDX, X_sig

HERE = os.path.dirname(os.path.abspath(__file__))
# (3a: each CL6 Speciality Tires variant is our own tire entry)
TIRE_MAP = {
    "offroad": "dc.off-road-tires",
    "offroad_runflat": "dc.off-road-tires",
    "racing": "dc.racing-tires",
    "racing_runflat": "dc.racing-tires",
    "smart": "dc.smart-tires",
    "shredders": "dc.shredders",
}
CHARGEN = ("metatype", "lifemod", "set", "draketype", "magicreson")
STRUCT = {"HOOK", "GEAR", "GEARMOD"}

# ---------------------------------------------------------------- values
NUM = r"-?\d+(?:\.\d+)?"


def _eval(expr, rating):
    e = re.sub(r"\$(?:RATING|LEVEL|FORCE)|\bR\b", str(rating), expr.replace(" ", ""), flags=re.I)
    e = e.replace("+", "+").lstrip("+")
    if re.fullmatch(r"[-+*/().\d]+", e or "x"):
        try:
            return float(eval(e, {"__builtins__": {}}))  # pylint: disable=eval-used  # e is digits and operators only
        except Exception:  # pylint: disable=broad-exception-caught  # any arithmetic failure is no value
            return None
    return None


def pv(v, rating=1):
    """-> ('' ) | ('n', x) | ('list', (..)) | ('slash', (..)) | ('f', str)"""
    s = (v or "").strip().casefold().replace("¥", "")
    if s == "":
        return ("",)
    s2 = re.sub(r"\s+", "", s)
    s2 = re.sub(r"\((?:belt|drum|clip|magazine)\)$", "", s2)  # (`1000(belt)`: the number)
    if re.fullmatch(r"[+-]?\d+(?:\.\d+)?/[+-]?\d+(?:\.\d+)?", s2):  # (`+3/+3`, `5/-5`: a pair, never a quotient)
        return ("slash", tuple(float(p.lstrip("+")) for p in s2.split("/")))
    if re.fullmatch(r"[-+]?\$?[a-z_0-9.*+\-/()]*", s2) is None and "," not in s2:
        return ("f", s2)
    if "," in s2 and "[" not in s2:
        parts = [p.lstrip("+") for p in s2.split(",")]
        vals = tuple(
            _eval(p, rating) if p not in ("x", "-99") else "x" for p in parts
        )  # (-99: the band removed, shown x)
        return ("list", vals) if None not in vals else ("f", s2)
    if s2.startswith("r[") or "[" in s2:
        return ("f", s2)
    x = _eval(s2.lstrip("+"), rating)
    if x is not None:
        return ("n", x)
    if "/" in s2:
        parts = [p.lstrip("+") for p in s2.split("/")]
        vals = tuple(_eval(p, rating) for p in parts)
        if None not in vals:
            return ("slash", vals)
    return ("f", s2)


def vcmp(cl, our, kind="", apply="", r0=1):
    """-> 'eq' | 'eq-rating1' | 'blank' | 'unverified' | 'differ'. r0: the rating the first comparison is made at (a
    variant `tactical2` is rating 2)."""
    if kind in ("no-edge", "no-edge-gain", "wild-die", "other"):
        return "eq"
    a1, b1 = pv(cl, r0), pv(our, r0)
    if "" in (a1[0], b1[0]):
        return "blank"
    if (
        kind == "edge-cost" and a1[0] == b1[0] == "n" and apply == "BOOST"
    ):  # (CL6 prints an Edge-cost change either sign, a reduction or a malus: the size is compared)
        a1 = ("n", -abs(a1[1])) if b1[1] < 0 else a1
    same = _same(a1, b1, apply)
    if same:
        a2, b2 = pv(cl, r0 + 1), pv(our, r0 + 1)
        if apply == "BOOST" and a2[0] == "n" and b2[0] == "n":
            a2 = ("n", -abs(a2[1])) if b2[1] < 0 else a2
        return "eq" if _same(a2, b2, apply) else "eq-rating1"
    if a1[0] == "f" or b1[0] == "f":
        return "unverified"
    return "differ"


def _same(a, b, apply=""):
    if a == b:
        return True
    if a[0] == "list" and b[0] == "n":
        vals = list(a[1])
        if all(v == b[1] for v in vals if v != "x"):
            return True
        if vals[0] == b[1] and all(v in (0, "x") for v in vals[1:]):  # (`a,0,0,0,0` is `a`: the close band only)
            return True
    if a[0] == "n" and b[0] == "list":
        return _same(b, a, apply)  # pylint: disable=arguments-out-of-order  # the symmetric case, swapped on purpose
    if a[0] == "slash" and b[0] == "n" and len(set(a[1])) == 1 and a[1][0] == b[1]:
        return True
    if (
        a[0] == "slash" and b[0] == "n" and sorted(set(a[1]) - {0}) == [b[1]]
    ):  # (`0/-1`: the off-road side of an item that applies to both, the name picks the side)
        return True
    if b[0] == "slash" and a[0] == "n" and len(set(b[1])) == 1 and b[1][0] == a[1]:
        return True
    return False


# ---------------------------------------------------------------- atoms
def cl6_atoms4(m, rec_class=""):
    """The comparable atoms of one Commlink6 effect row, with its kind."""
    t, ty, ref, st, wh, ap = (
        m["_tag"],
        m.get("type", ""),
        m.get("ref", ""),
        m.get("set", ""),
        m.get("what", ""),
        m.get("apply", ""),
    )
    R = ref.upper() if ty in ("ATTRIBUTE", "ITEM_ATTRIBUTE", "RESISTANCE") else ref
    if (
        t == "checkmod"
        and ty == "SKILLSPECIALIZATION"
        and ref.casefold().startswith("electronics/complex")
        and wh == "EDGE_BOOST"
    ):
        return {"complex-form:threading"}, "edge-cost", "", {}
    if (
        t == "checkmod" and ty == "SKILLSPECIALIZATION" and ref.casefold() == "cracking/cybercombat" and wh == "DICE"
    ):  # (`targets IC`: Matrix actions against IC)
        return {"skill:cracking"}, "add", "", {}
    if t == "valmod" and ty == "ATTRIBUTE":
        if R in ABBR and st == "ARTIFICIAL" and ABBR[R] in ("agi", "str"):
            return {"limb-attr:" + ABBR[R]}, "set", "", {}
        if R == "ATTACK_RATING_MATRIX" and "DIGITAL" in rec_class:
            return {"item:ar"}, "add", "", {}
        if R == "DEFENSE_POOL_ASTRAL":
            return {"test:defense-astral"}, "add", "", {}
        if R == "DEFENSE_POOL_COMBAT_DIRECT":
            return {"test:defense-spell-direct"}, "add", "", {}
        if R == "DEFENSE_POOL_COMBAT_INDIRECT":
            return {"test:defense-spell-indirect"}, "add", "", {}
        if R == "DEFENSE_POOL_MATRIX":
            return {"derived:matrix-defense"}, "add", "", {}  # (category 4: the Matrix Defense Rating)
        if R == "RESIST_DAMAGE_ASTRAL":
            return {"test:damage-resistance-astral"}, "add", "", {"needs": "astral damage target"}
        if R in ("DRAKE_EDGE",):
            return {"attr:edg"}, "add", "", {"form": "drake"}
    if t == "valmod" and ty == "SKILL" and st == "MIN":
        return {"skill:" + _slug(ref)}, "set", "", {}
    if t == "valmod" and ty == "SKILL" and ap == "DATA_ITEM":
        return {"skill:" + _slug(ref)}, "set", "", {}
    if t == "valmod" and ty == "CRITTER_POWER" and ref == "hardened_armor":
        return {"derived:hardened-armor"}, "add", "", {}
    if t == "valmod" and ty == "ITEM_ATTRIBUTE" and R == "CHOICE":
        return {"matrix:choice"}, "add", "", {}
    if t == "valmod" and ty == "ITEM_ATTRIBUTE" and R == "DEFENSE_MATRIX":
        return {"derived:matrix-defense"}, "add", "", {}
    if t == "checkmod":
        if ty == "ATTRIBUTE" and R == "CHOICE":
            return {"test-attr:choice"}, CHECK_KIND.get(wh, "other"), "", {}
        if ty == "SKILLSPECIALIZATION":
            sk, _, sp = ref.partition("/")
            return {"skill:" + _slug(sk)}, CHECK_KIND.get(wh, "other"), "", {"spec": sp}
        if ty == "ATTRIBUTE" and R in ("DEFENSE_POOL_ASTRAL",):
            return {"test:defense-astral"}, CHECK_KIND.get(wh, "other"), "", {}
        if ty == "ATTRIBUTE" and R == "DEFENSE_POOL_COMBAT_DIRECT":
            return {"test:defense-spell-direct"}, CHECK_KIND.get(wh, "other"), "", {}
        if ty == "ATTRIBUTE" and R in ("DEFENSE_POOL_MATRIX",):
            return {"derived:matrix-defense"}, CHECK_KIND.get(wh, "other"), "", {}
        if ty == "ATTRIBUTE" and R == "DEFENSE_POOL_COMBAT_INDIRECT":
            return {"test:defense-spell-indirect"}, CHECK_KIND.get(wh, "other"), "", {}
        if wh == "EDGE_CHASE":
            return {"pool:chase"}, "edge", "", {}
        if wh in ("USAGE", "OTHER"):
            return None, "rule marker (checkmod what=" + wh + ")"
        if wh == "":
            try:
                zero = float(re.sub(r"[^\d.\-]", "", m.get("value", "0")) or "0") == 0
            except ValueError:
                zero = False
            if zero and "$" not in m.get("value", ""):
                return None, "rule marker (checkmod, value 0)"
            base = X.cl6_atoms({**m, "what": "DICE"})
            return base[0], "add", "", {}
        if wh == "REDUCE_THRESHOLD":
            return {"test:toxin-resistance"}, "threshold", "", {"negate": True}
    if (
        t == "checkmod" and ty == "SKILL" and ref.upper() == "ANY" and wh == "REPLACE_WITH_WILD"
    ):  # (the wild die in an attack: the combat tests)
        return set("skill:" + x for x in GROUPS["combat"]), "wild-die", "", {}
    if t == "checkmod" and ty == "SKILL" and ref.upper() == "ITEM":  # (`tests with the attuned item`)
        return {"test:other"}, "add", "", {}
    if t == "checkmod" and ty == "ACTION" and ref == "aimbot":  # (our name for the Edge action is Dead to Rights)
        return {"action:dead-to-rights"}, "edge-cost-set", "", {}
    if (
        t == "checkmod" and ty == "ITEM_ATTRIBUTE" and R == "DAMAGE" and wh == "DICE"
    ):  # (dice to the damage: our damage value)
        return {"item:dv"}, "add", "", {"alt": {"derived:unarmed-dv"}}
    if t == "checkmod" and ty == "ACTION" and wh == "DICE":  # (`increases the maximum dice pool bonus for Take Aim`)
        return {"action:" + _slug(ref)}, "add", "", {"alt": {"action-max:" + _slug(ref)}}
    if (
        t == "checkmod" and ty == "SKILL" and ref.casefold() == "electronics" and wh == "EDGE_BOOST"
    ):  # (Edit and Snoop are Electronics actions, threading an Electronics specialization)
        return (
            {"skill:electronics"},
            "edge-cost",
            "",
            {"alt": {"action:edit", "action:snoop", "complex-form:threading"}},
        )
    if (
        t == "checkmod"
        and ty == "ATTRIBUTE"
        and R == "DEFENSE_RATING_PHYSICAL"
        and wh in ("NOT_EARN_EDGE", "NOT_SPEND_EDGE")
    ):
        return {"test:defense"}, CHECK_KIND.get(wh, "other"), "", {}
    if (
        t == "valmod" and ty == "ATTRIBUTE" and R == "EDGE" and m.get("cond")
    ):  # (a conditional +1 Edge: the chase pool's)
        return {"pool:chase"}, "add", "", {}
    if (
        t == "valmod" and ty == "ITEM_ATTRIBUTE" and R in ("ATTACK_RATING", "DAMAGE") and ap in ("ANIMAL", "DRAKE")
    ):  # (natural weapons are kept as the unarmed attack: owner/book)
        return {"derived:unarmed-ar" if R == "ATTACK_RATING" else "derived:unarmed-dv"}, "add", "", {}
    if (
        t == "valmod" and ty == "PRICEMOD" and ref.upper() == "LIFESTYLE_NECESSITIES"
    ):  # (a small whole number is lifestyle points, a larger one percent)
        try:
            small = abs(float(m.get("value", "0"))) <= 3
        except ValueError:
            small = False
        return ({"lifestyle:necessities"} if small else {"pricemod:lifestyle"}), "add", "", {}
    if t == "valmod" and ty == "CREATION_POINTS":
        return {"resource:" + _slug(ref)}, "set", "", {}  # (`add N` to a count of maxed-out attributes is `set N`)
    if t == "valmod" and ty == "ATTRIBUTE" and m.get("set") == "MIN" and ref.upper() in ABBR:
        return {"attr:" + ABBR[ref.upper()]}, "set", "", {}  # (a minimum we write as the attribute set)
    if t == "valmod" and ty == "SKILL" and ref.upper() == "LANGUAGE":
        return {"skill:language"}, "set", "", {}
    res = X.cl6_atoms(m)
    if res[0] is None:
        return res
    A, k, q = res
    if t == "valmod" and ty == "ITEM_ATTRIBUTE" and ap == "UNARMED":
        pass  # handled in xlate
    extra = {}
    if ap in ("ANIMAL", "DRAKE"):
        extra["form"] = ap.lower()
    if t == "checkmod" and ty == "ACTION" and wh == "EDGE_BOOST":
        k = "edge-cost-set"
    if t == "checkmod" and wh == "EDGE" and m.get("value", "").strip() == "-99":  # (no Edge at all: CL6's -99)
        k = "no-edge-gain"
    return A, k, q, extra


def our_atoms4(e):
    """The comparable atoms of one of our effects, with its kind."""
    A, k = X.our_atoms(e)
    if e.get("op") == "edge-cost-set":
        k = "edge-cost-set"
    if e.get("target") == "pool:chase":
        return {"pool:chase"}, k
    return A, k


def _range_max_is(kids, atoms, value):
    """True when one of our `<range attr max>` children states the attribute maximum `value` that `atoms` names."""
    return any(k["_tag"] == "range" and k.get("max") == value and f'attr-max:{k.get("attr")}' in atoms for k in kids)


def eval_all(rows, IDX):
    """Compare every row's Commlink6 effects with ours; the verdict per row."""
    out = []
    for r in rows:
        oe = [k for k in r["our"]["kids"] if k["_tag"] == "effect"]
        sib_kids = {sb["name"]: [k for k in sb["kids"] if k["_tag"] == "effect"] for sb in r.get("siblings", [])}
        own_name = r["our"]["name"].casefold()
        cl6class = r["cl6"]["class"] or ""
        # all CL6 atoms on the record per kind (for ours-broader check)
        rec_atoms = defaultdict(set)
        parsed = {}
        for i, m in enumerate(r["cl6"]["mods"]):
            if m["_tag"] in ("valmod", "checkmod") and m.get("type") not in STRUCT:
                res = cl6_atoms4(m, cl6class)
                parsed[i] = res
                if res[0] is not None:
                    rec_atoms[res[1]] |= res[0]
        for i, m in enumerate(r["cl6"]["mods"]):
            if i not in parsed:
                continue
            res = parsed[i]
            ctx = m["_ctx"]
            rec = {
                "pair": (r["cl6"]["src"], r["cl6"]["id"], r["cl6"]["tag"]),
                "tag": r["cl6"]["tag"],
                "cl6class": cl6class,
                "bucket": "chargen" if r["cl6"]["tag"] in CHARGEN else "feature",
                "sig": X_sig(m),
                "value": m.get("value", ""),
                "ctx": ctx,
                "sel": m["_sel"],
                "name": r["cl6"]["name"],
            }
            if res[0] is None:
                rec["status"] = "not-a-variable: " + res[1]
                out.append(rec)
                continue
            A, k, _, extra = res
            A = set(A)
            if extra.get("needs"):
                rec["status"] = "needs-new-target: " + extra["needs"]
                rec["atoms"] = sorted(A)
                out.append(rec)
                continue
            # which of our effects to use
            pool = list(oe)
            if ctx.startswith("variant:"):
                vid = ctx.split(":", 1)[1].casefold().replace("aluminium", "aluminum").replace("extender", "expander")
                if not vid or vid in own_name.replace("aluminium", "aluminum").replace("extender", "expander"):
                    pass
                else:
                    toks = [t for t in re.split(r"[^a-z]+", vid) if len(t) >= 3]

                    def flat(n):
                        return re.sub(
                            r"[^a-z]", "", n.casefold().replace("aluminium", "aluminum").replace("extender", "expander")
                        )

                    sel = [
                        kids
                        for nm, kids in sib_kids.items()
                        if vid in nm.casefold().replace("aluminium", "aluminum").replace("extender", "expander")
                    ] or [kids for nm, kids in sib_kids.items() if toks and all(t in flat(nm) for t in toks)]
                    if sel:
                        pool = [x for kids in sel for x in kids]
            if (
                ctx == "variant:cyberimplantweapon" and ("augmentations", r["our"]["id"]) in IDX
            ):  # (the implant version is the augmentation of the same id)
                pool = [k for k in IDX[("augmentations", r["our"]["id"])] if k["_tag"] == "effect"]
            if r["cl6"]["id"].startswith("tires_") and ctx.startswith("variant:") and TIRE_MAP.get(ctx[8:]) in IDX:
                pool = [k for k in IDX[TIRE_MAP[ctx[8:]]] if k["_tag"] == "effect"]
            if (
                "german" in r["cl6"]["name"].casefold()
            ):  # (a record for the sibling that has the ranges: the high-power laser sight)
                pool = pool + [k for k in IDX.get("fs.laser-sight-high-power", []) if k["_tag"] == "effect"]
            pm = re.search(
                r"\(([^)]+)\)", r["cl6"]["name"]
            )  # (`Enhanced Senses (Vomeronasal)`: the sibling that has the word)
            if pm and not ctx.startswith("variant:"):
                pool = pool + [
                    x for nm, kids in sib_kids.items() if pm.group(1).casefold() in nm.casefold() for x in kids
                ]
            # CHOICE: do not fill from our own atoms
            is_choice = any(a.endswith(":choice") for a in A)
            apply = m.get("apply", "")
            cond = bool(m.get("cond")) or ctx.startswith("mode:")
            rec["atoms"] = sorted(A)
            rec["kind"] = k
            cov = set()
            touched_fx = []
            touched = set()
            used = []
            targets = [A] + ([extra["alt"]] if extra.get("alt") else [])
            for tgt in targets:
                for e in pool:
                    at, ek = our_atoms4(e)
                    common = (
                        (at & tgt)
                        if not is_choice
                        else {
                            a
                            for a in at
                            if {a.split(":")[0], next(iter(A)).split(":")[0]} <= {"attr", "matrix"}
                            or a.split(":")[0] == next(iter(A)).split(":")[0]
                        }
                    )
                    if not common:
                        continue
                    touched |= common
                    touched_fx.append(f'{e.get("target")} {e.get("op")} {e.get("value")}')
                    if is_choice:
                        used.append((e, "choice"))
                        cov |= A
                        continue
                    cvv0 = m.get("value", "")
                    sets_rating = bool(
                        re.fullmatch(r"\$rating-\$\$(?:pilot|sensors)", cvv0.replace(" ", "").casefold())
                    )
                    loose = (at <= {"item:dv", "item:ammo"} or at <= {"pool:chase"}) and {k, ek} <= {
                        "set",
                        "add",
                        "edge",
                    }
                    loose = loose or (k == "no-edge-gain" and ek in ("no-edge", "no-edge-gain"))
                    loose = loose or (
                        at <= {"derived:unarmed-dv"} and {k, ek} <= {"set", "add"} and "str" in e.get("value", "")
                    )  # (`str/2+1`: the base damage value Dermal Deposits sets)
                    if ek != k and not (k == "set" and ek == "add") and not loose and not (sets_rating and ek == "set"):
                        continue
                    if extra.get("spec"):
                        want = re.sub(r"[^a-z]", "", extra["spec"].casefold())
                        have = [
                            re.sub(r"[^a-z]", "", x.casefold().replace("smell", "scent"))
                            for x in re.split(r",|/| and ", e.get("spec", "") or "")
                        ]
                        if not any(h and (h in want or want in h) for h in have):
                            continue
                    cvv = m.get("value", "")
                    if "derived:essence-hole" in A and cvv and "$" not in cvv:
                        cvv = f"({cvv})/1000"
                    if "attr:ess" in A and cvv and re.fullmatch(r"[-+]?\d{3,}", cvv.strip()):
                        cvv = str(float(cvv) / 1000)  # (Essence in thousandths)
                    if "$" in cvv.replace("$RATING", "").replace("$LEVEL", "") and sets_rating:
                        cvv = "R"
                    if (
                        any(a.startswith("pricemod:") and a != "pricemod:armor" for a in A)
                        and cvv
                        and re.fullmatch(r"[-+]?\d+(\.\d+)?", cvv.strip())
                    ):
                        cvv = str(float(cvv) / 100)
                    if extra.get("negate"):
                        cvv = "-" + cvv.lstrip("+-")
                    code = "BOOST" if (m.get("what") in ("EDGE_BOOST", "EDGE_COST_MALUS")) else apply
                    r0 = int(re.search(r"(\d)$", ctx).group(1)) if re.search(r"^variant:[a-z_]+\d$", ctx) else 1
                    c = vcmp(cvv, e.get("value", ""), k, code, r0)
                    if (
                        c not in ("eq", "eq-rating1", "blank", "unverified")
                        and e.get("switch") in ("wireless", "conditional")
                        and re.fullmatch(r"-?\d+", e.get("value", ""))
                    ):
                        # (effects review 2026-10-18: a wireless line that brings a bonus to N is the difference, base +
                        # it = CL6's total)
                        for b in pool:
                            if (
                                b is not e
                                and b.get("target") == e.get("target")
                                and b.get("op") == e.get("op")
                                and (
                                    b.get("switch") != "wireless"
                                    if e.get("switch") == "wireless"
                                    else not b.get("switch")
                                )
                                and re.fullmatch(r"-?\d+", b.get("value", ""))
                            ):
                                c2 = vcmp(cvv, str(int(b["value"]) + int(e["value"])), k, code, r0)
                                if c2 in ("eq", "eq-rating1", "blank", "unverified"):
                                    c = c2
                                    break
                    if c in ("eq", "eq-rating1", "blank", "unverified"):
                        cov |= common
                        used.append((e, c))
            if A <= cov or (extra.get("alt") and cov):
                best = [c for _, c in used]
                if is_choice:
                    st = "match-choice"
                elif "eq" in best:
                    st = "match"
                elif "eq-rating1" in best:
                    st = "match-rating1"
                elif "blank" in best:
                    st = "match-value-blank"
                else:
                    st = "match-unverified-formula"
                rec["status"] = st
                # ours broader than CL6?
                ours_atoms = set().union(*[our_atoms4(e)[0] for e, _ in used]) if used else set()
                if not is_choice and ours_atoms and not ours_atoms <= (rec_atoms[k] | A):
                    rec["flag_ours_broader"] = True
                # switch disagreement
                sw = [(e.get("switch", "") or "") for e, _ in used]
                oc = any(s or e.get("when") for (e, _), s in zip(used, sw))
                if cond and not oc:
                    rec["flag_switch"] = "cl6-conditional-ours-always"
                elif not cond and oc:
                    rec["flag_switch"] = "ours-switched-cl6-plain"
                if extra.get("form") and not any(e.get("when") for e, _ in used):
                    rec["flag_form"] = extra["form"]
            elif k == "max" and _range_max_is(r["our"]["kids"], A, m.get("value", "")):
                rec["status"] = "match"  # (a metatype holds its attribute maximum as <range attr max>, not an effect)
            elif touched and not cov:
                rec["status"] = "miss-value-or-kind"
                rec["ours"] = sorted(set(touched_fx))
            elif cov:
                rec["status"] = "miss-partial-atoms"
            elif not pool and not oe:
                rec["status"] = "miss-entry-has-no-effects"
            else:
                rec["status"] = "miss-variable-absent"
            rec["ours_all"] = sorted(
                {f'{k.get("target")} {k.get("op")} {k.get("value")}' for k in pool if k["_tag"] == "effect"}
            )  # (any target: what the entry carries at all)
            out.append(rec)
    return out


def X_sig(m):
    """A one-line signature of an effect row, for grouping."""
    return (
        f'{m["_tag"]} {m.get("type","")} {m.get("ref","")}'
        + (f' set={m["set"]}' if m.get("set") else "")
        + (f' what={m["what"]}' if m.get("what") else "")
        + (f' apply={m["apply"]}' if m.get("apply") else "")
    )


def _load(name):
    with open(os.path.join(HERE, name), encoding="utf-8") as f:
        return json.load(f)


def tally(ev):
    """Classify the feature-bucket variables of `ev` -> dict: var, ok, ruled, placeholders, open (lists of eval rows),
    stale (book-ruled keys that fit nothing). Each variable row gets "final": match | book-ruled | placeholder |
    open."""
    var = [e for e in ev if e["bucket"] == "feature" and not e["status"].startswith("not-a-variable")]
    ok = [e for e in var if e["status"].startswith("match")]
    BR = {(tuple(r["pair"]), r["sig"], r["cl6"], tuple(sorted(r["ours"]))): r for r in _load("bookruled.json")}

    def key(e):
        return (tuple(e["pair"]), e["sig"], e["value"], tuple(sorted(e.get("ours", []))))

    # (a book-ruled row counts only when the entry carries an effect of the book's at all, any target, or the row says
    # the book gives none)
    ruled = [
        e
        for e in var
        if not e["status"].startswith("match")
        and key(e) in BR
        and (e.get("ours") or e.get("ours_all") or BR[key(e)].get("book_gives_none"))
    ]
    stale = len(BR) - len({key(e) for e in ruled})
    PH = {(tuple(r["pair"]), r["sig"], r["cl6"]) for r in _load("cl6placeholder.json")}
    placeholders = [
        e
        for e in var
        if not e["status"].startswith("match") and e not in ruled and (tuple(e["pair"]), e["sig"], e["value"]) in PH
    ]
    for e in var:
        e["final"] = (
            "match" if e in ok else "book-ruled" if e in ruled else "placeholder" if e in placeholders else "open"
        )
    return {
        "var": var,
        "ok": ok,
        "ruled": ruled,
        "placeholders": placeholders,
        "stale": stale,
        "open": [e for e in var if e["final"] == "open"],
    }


def lines(t):
    """The report lines for a result table: counts and percentages."""
    n, ok, r, p = len(t["var"]), len(t["ok"]), len(t["ruled"]), len(t["placeholders"])

    def pct(x):
        return f"{100 * x / n:.1f}%" if n else "n/a"

    return [
        f"variables: {n}, matched strictly: {ok} ({pct(ok)})",
        f"book-ruled (counted separately): {r}; book-ruled keys that no longer fit: {t['stale']}",
        f"accepted CL6 placeholders (counted separately): {p}",
        f"parity: {ok + r + p}/{n} ({pct(ok + r + p)})",
        f"still open by category: {dict(Counter(e['status'].split(':')[0] for e in t['open']))}",
    ]
