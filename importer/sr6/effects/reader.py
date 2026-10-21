"""The effects reader's entry point for prose: read() turns an entry's text into <effect>s."""

import re

from .words import (
    ATTRIBUTES,
    NUMBERS,
    ROLES,
    SKILLS,
    VEHICLE_KINDS,
    _BONUS_ACTION,
    _CHOOSE_ONE,
    _CONDITION,
    _DRUG_CRASH,
    _EDGE_OTHERS,
    _GENERIC_RESIST,
    _REFUND,
    _RESIST_CLAUSE,
    _SEVERITIES,
    _SPEND_ACTION,
    _THEY_EDGE,
    _WILD_CONV,
    _drug_cut,
    _slug,
    sentences,
)
from .values import (
    _ALWAYS,
    _BACK_REF,
    _EDGE_OPS,
    _HELD,
    _LEVELS_AFTER_FIRST,
    _NARROW,
    _NATURAL,
    _NATURAL_KINDS,
    _NOT_NATURAL,
    _PER_RATED,
    _PER_THING,
    _REMOVED_BAND,
    _RESIST_OF,
    _ROUNDING,
    _STATED,
    _USE_OR_LOSE,
    _WIELD,
    _activity,
    _clauses,
    _fx,
    _keep_on,
    _natural_entry,
    _qualified,
    _rounding,
    _scoped,
    _situations,
    _spec,
    _sw,
    _unplaced,
    _val,
    targets,
)
from .rules import _rules


def read(text, kind=None, name=None, cls=""):
    """[(tag, attrs, None)]: the effects, tests and links the text states, in the order printed, each once."""
    out = []
    natural_entry = kind in _NATURAL_KINDS and _natural_entry(text, kind, name, cls)
    # (a table of `DICE POOL MODIFIER`s by situation, `TIME SINCE IMPRESSION | 1 week | –2`, `NATURE OF ITEM`: the gamemaster's, no
    # flat effect of the entry; Paradigm Shift)
    text = _situations(text)
    prev_tests = []  # (the last sentence's skill and test targets: `… for such tests` in the next one)
    last_named = (
        []
    )  # (the clause before's skill and test targets, effects or not: `… hindered in Athletics tests …; Edge Actions cost 1 point higher`)
    carried = None  # (`Once activated, roll …`: the sentences after it are the activated thing's, owner 2026-10-11)
    stated = (
        {}
    )  # (owner decision 8, 2026-10-11: a stat with its number in one sentence, `Firewall 2`, for the next one's back-reference)
    edge_actions = bool(re.search(r"\bedge cost\b", text or "", re.I))
    ai = bool(re.search(r"\bAIs?\b|\bAI's\b", text or ""))  # (an AI's initiative is its Matrix initiative)
    last_who = "caster"
    opposed = bool(re.search(r"\bopposed test\b", text or "", re.I))
    drug = kind == "gear" and bool(
        re.search(r"^[^\n]{0,30}?\bVector:", text or "", re.M)
    )  # (a drug's or toxin's stat lines: Vector, Speed, Duration, Power, Effect)
    prev_pl, carry_label = (
        None,
        None,
    )  # (a label run into a paragraph, `… **Cyberware overdrive:** Gain +2 dice … One of these dice must be a wild die.`, holds for the sentences after it)
    prev_test = (
        None  # (the one `Skill (Spec) + Attribute (N) test` the sentence before names: (target, specialization))
    )
    last_fx = (
        None  # (the paragraph and effects of the last sentence that had any: `This bonus only applies …` limits them)
    )
    act_on = None  # (the paragraph a switch-only sentence, `This bioware requires a Minor Action to activate`, turns on: its later sentences are activated)
    for label, s, para in [(l_, c_, n_) for l_, s_, n_ in sentences(text, labels=True) for c_ in _clauses(s_)]:
        if label != prev_pl:
            carry_label = None
        prev_pl = label
        if m := re.match(r"^[•*\s]*([A-Z][\w ]{1,30}):\s+(.*)$", s):
            label, s = m.group(1), m.group(2)
            carry_label = label
            if (
                kind == "adeptpowers"
                and label.casefold() == "activation"
                and re.match(r"(?:minor|major) action\b", s, re.I)
            ):
                act_on = "entry"  # (an adept power's `**Activation:** Major Action`: what the power does is while it is activated)
            if targets(label, kind) and re.match(r"[+-]\s?\d", s):
                s = f"{label} {s}"  # (`**AR:** +2`, `**Body:** +1`: the label names the target)
            if drug and label.casefold() in ("effect", "effects"):
                s = _drug_cut(
                    s
                )  # (`+2D6 Initiative Dice When the kamikaze …`: the line ends where the drug's story begins)
        elif carry_label:
            label = carry_label
        if re.match(r"\W*(?:for (?:example|instance)\b|e\.g\.|such as\b)", s, re.I):
            # (`For example, the −1 modifier for 3 boxes can be removed`: an illustration of
            # a rule, no effect of its own; a worked `Example:` of an entry's own numbers stays read, Off Road Chassis)
            continue
        if (
            any(x[0] == "effect" for x in out)
            and not re.search(r"\b(?:each|per)\b", s, re.I)
            and re.match(
                r"\W*(?:it )?(?:may|can) be (?:purchased|taken|bought|selected) (?:twice|two times|up to \w+ times|multiple times)\b[^.]*\btotal\b",
                s,
                re.I,
            )
        ):
            continue  # (`+1 DV. May be purchased twice for a total +2`: the sum of buying it again, after the effect itself was read)
        if (
            kind == "weapons"
            and (wd_ := re.search(r"\bwild die on (?:any )?([a-z-]+) attacks", s, re.I))
            and wd_.group(1).casefold() not in (name or "").casefold()
        ):
            continue  # (`Use the wild die on garrote attacks`: a table note for the garrote model, printed under the other models too)
        if re.search(
            r"\b(?:does not|doesn't|cannot|can't|may not|can not) (?:allow (?:you|them|the \w+) to )?exceed\b", s, re.I
        ) or re.search(r"\bradius\b[^.]*\bequal to\b", s, re.I):
            continue  # (a cap on a stat or on initiative dice, `can't exceed`; a radius equal to an attribute: a limit, a size, no bonus)
        s = re.sub(
            r"\b(?:a|the) number of (?:[a-z-]+ ){0,2}?(?:doses|hours|minutes|days|rounds|turns|times|uses|charges|meters|targets|items|devices|agents|sprites|spirits|contacts)\b[a-z' -]{0,40}?\s(?:equal to|=)\s+(?:its|their|the|your)\s+[a-z ]{3,20}?(?:\s*(?:x|×)\s*\d+)?(?=[.;,]|$)",
            "",
            s,
        )  # (`a number of additional doses equal to its rating`, `for a number of hours equal to its rating x 2`: a count, no bonus)
        role = ROLES.get(label.casefold())
        # (`on all tests involving balance, such as climbing, landing after a jump`: examples of an activity the reader knows are no tests of
        # their own, nor conditions; `involving very fine detail work such as surgery` names the tests by its examples)
        s = re.sub(
            r"(\b(?:involving|related to)\s+([a-z ]+?)),?\s+such as\b(?:(?!,? and [+-]?\s?\d)[^.;])*",
            lambda m: m.group(1) if _activity(m.group(2)) else m.group(0),
            s,
        )
        s = re.sub(
            r"\btouch-?based\b", "tactile", s, flags=re.I
        )  # (`touchbased Perception tests`: the Tactile specialization)
        choose_one = bool(_CHOOSE_ONE.search(s))
        choice_list = ""
        if choose_one:
            # (the skills of the list the choice is of: the last `and`-less run before it, `Athletics or Stealth tests`, not every skill of the sentence)
            choice_list = re.split(
                r";|\band (?=(?:they|you|the|gain|may|cannot|can)\b)", s[: _CHOOSE_ONE.search(s).start()]
            )[-1]
            s = re.sub(
                r"\s*\((?:the choice|choice of|choose)[^)]*\)", "", s
            )  # (`(the choice of which skill is permanent …)`: the choice, not tests of its own)
        s = re.sub(r"\bvs\.(?=\s)", "versus", s)  # (`vs. astral attacks`: the full stop ends no clause)
        s = _USE_OR_LOSE.sub(
            _keep_on, s
        )  # (`a point of Edge that must be spent on that test`, then a loss clause: use it or lose it, no condition)
        s = re.sub(
            r"\s*\((?:that is|e\.g\.|i\.e\.|for example|for instance|also reflected)\b[^)]*\)?", "", s, flags=re.I
        )  # (an example in parentheses; `(also reflected in their Attack Rating)`: the number again, no effect of its own, CRB p. 264)
        # (a critter power's restriction in its name, `Movement (Self Only)`, `Magical Guard (self only, p. 69 …)`, and a
        # price's note, `(–10 Karma if character is already Awakened)`: no condition on the sentence's effects)
        s = re.sub(r"\s*\((?:self only\b|[+–-]\s*\d+\s+Karma\b)[^()]*\)", "", s, flags=re.I)
        s = _DRAIN_UP.sub(
            "", s
        )  # (`a cost of +1 Drain for each additional status`, `increases the spell's Drain by 1`: the spell's own cost)
        if last_fx and last_fx[0] == para and (nm := _NARROW.match(s)):
            # (`This bonus only applies while the user is jumped-in`, `This only applies to Matrix actions`: no effect of its own, a limit on the
            # sentence before's (those it names, else all): its tests when it names tests, else its condition)
            q = " ".join(
                re.sub(
                    r"^(?:to|on|for)\s+", "", re.split(r",?\s+(?:and|but) (?:are|is|it|they)\b", nm.group("q"))[0]
                ).split()[:12]
            ).casefold()
            named = {t for t, _ in targets(s[: nm.start("q")], kind)}
            to = (
                [(t, sp) for t, sp in targets(nm.group("q"), kind) if t.startswith(("skill:", "test:"))]
                if re.match(r"(?:to|on|for)\b", nm.group("q"), re.I)
                else []
            )
            for a in [a for a in last_fx[1] if a["target"] in named] or [
                a for a in last_fx[1] if not a["target"].startswith("pricemod:")
            ]:  # (`This increased cost only applies to the cyberlimb itself`: no condition on a price)
                if to and a["target"].startswith(("skill:", "test:")):
                    a["target"] = to[0][0]
                    a.pop("spec", None)
                    if sp_ := _spec(to[0][0], to[0][1]):
                        a["spec"] = sp_
                else:
                    a["switch"], a["when"] = (
                        a.get("switch") or "conditional",
                        (a["when"] + ", " if a.get("when") else "") + q,
                    )
            continue
        sw, when = _sw(s, label)
        sw_when = (
            when if sw == "conditional" else None
        )  # (the condition _sw took: _scoped checks it is the effect's own clause's)
        q_cond = None
        if sw is None and (q_cond := _qualified(s, kind)):
            sw, when = "conditional", q_cond
        if (refund := _REFUND.search(s)) and _BONUS_ACTION.search(s):
            # (`a bonus Minor Action on a turn when you extend the blades`: the Minor Action it cost, handed back; the switch stays, the trigger is the condition)
            when = " ".join(refund.group(0).split()[:12]).strip(" ,").casefold()
            sw = (
                sw if sw == "wireless" else "conditional"
            )  # (the trigger is a condition, an `activated` Minor Action to command a sprite is not the switch)
        if drug:
            if crash := _DRUG_CRASH.search(
                s
            ):  # (`Once the drug wears off, the user experiences -1 Intuition`: after it, not while it acts)
                sw, when = "conditional", crash.group(0).casefold()
            elif sw is None:
                sw = "activated"  # (what a drug does is while it acts)
        if sw is None and carried and not _CONDITION.search(s.casefold()):
            sw = carried
        carried = (
            "activated"
            if re.match(r"\W*(?:once|when|while) (?:activated|active)\b", s, re.I)
            else carried if sw == carried else None
        )
        own_sw = sw
        if act_on is not None and (sw is not None or _ALWAYS.search(s)):
            act_on = None  # (a sentence with its own condition, or one that holds at all times, ends it)
        elif act_on in (para, "entry"):
            sw = "activated"
        when = when or role
        low_formula = False
        if role and not sw:
            sw = "conditional"
        per_n = None
        if (
            (
                per := re.search(
                    r"\b(?:each|every|per) (?P<n>whole |two |three |four )?points? of (?:your |their |the )?(?:own )?(?!rating|force|level)([a-z][a-z -]{2,25}?)(?=[,.;:)]|\s*\(|\s+(?:and|or|that|which|you|they|the|to|for|above|below|beyond|over|put|adds?|added|provides?|may|can|grants?|gives?)\b|$)",
                    s,
                    re.I,
                )
            )
            and not _PER_RATED.search(s)
            and not re.search(r"\b(?:rating|level|force)\b", per.group(2), re.I)
            and not re.search(r"points? of (?:standard )?armor added over", s, re.I)
        ):  # (read in _rules: a stat lost per point of armor)
            sw, when = (
                "conditional",
                f"per point of {per.group(2).lower()}",
            )  # (`each point of your Essence loss`: a formula)
            low_formula = True
            if re.search(r"\bessence loss\b", per.group(2), re.I):
                # (`each point of your own Essence loss (round up)`: a formula over the Essence lost, shown, never applied)
                sw, when, per_n = None, None, f"(6-ess) {_rounding(s)}"
            if label and "overdrive" in label.casefold() or re.search(r"\bput in overdrive\b", s, re.I):
                # (`Each point of nanite volume put in overdrive adds`: what overdrive adds, per point put into it)
                sw, when = "activated", "overdrive"
                per_n = re.split(r"\s+put in\b", _slug(per.group(2)).replace("-", " "))[0].replace(" ", "-")
            if (
                n := NUMBERS.get((per.group("n") or "").strip().lower())
            ) and n != "1":  # (`every two points of nanite volume`: a formula over the quantity)
                per_n = f"{_slug(per.group(2))}/{n} {_rounding(s)}"
                low_formula = False
        elif (pm := _PER_THING.search(s)) and not re.search(
            r"\bper \w+\s*$", s[: pm.start()], re.I
        ):  # (`2 meters per round per pair`: a rate's, not the effect's)
            # (`+1 Willpower for each pair of cyberlimbs`, `For every 5 crew who are unable …`: a value per something that is not the rating, shown, never applied)
            sw, when = sw or "conditional", f"per {pm.group('x').lower()}" + (f", {when}" if when else "")
            low_formula = True
        rounding = _ROUNDING.search(s)
        if kind == "datastructures" and sw is None:
            sw = "activated"  # (a data structure is activated with a Minor Action for the next action, Hack & Slash p. 70)
        if kind in ("spells", "rituals", "complexforms") and sw in (None, "activated"):
            sw = "sustained"  # (a spell's, ritual's or complex form's: while it is cast and lasts)
        if label.casefold() in ("effect", "effects") and kind == "gear" and not sw:
            sw = "activated"  # (a drug's or toxin's `Effect:` line: while it acts)
        om_ = _OTHERS.search(s) or (not re.match(r"\W*(?:if|when|whenever|while)\b", s, re.I) and _OTHERS_MID.search(s))
        others = (
            om_
            and not (
                om_.start() > 0
                and re.search(
                    r"(?<!against )(?<!to )(?<!for )(?<!with )(?<!on )(?<!at )(?<!of )(?<!by )(?<!if )\byou (?:also |then )?(?:gain|receive|get|may gain|can gain|add|may add)\b",
                    s,
                    re.I,
                )
            )
            and not (
                kind in ("spells", "rituals", "complexforms")
                and re.match(r"\W*(?:the )?(?:targets?|subjects?)\b", s, re.I)
            )
            and not re.search(
                r"\b(?:oppose|resist|counter|defend against)\b[^.]*\btests? to (?:see|spot|notice|find|hear|track|detect)\b",
                s,
                re.I,
            )
        )  # (dice to oppose the tests to spot them: the owner's)
        if re.search(
            r"\b(?:it|this|the \w+) has an? (?:initiative|body|armor|pilot|sensor|device rating)\b", s, re.I
        ) or re.search(r"\b(?:required|needed) to (?:reload|ready|fire|operate|set up)\b", s, re.I):
            continue  # (what it costs to use, or its own stat line: not the entry's effect)
        if (
            others
        ):  # (owner decision 16, 2026-10-11: what others get against the entry is kept, `affects="others"`, never counted on the runner)
            who = "others"
        elif kind in (
            "spells",
            "rituals",
            "complexforms",
        ):  # (a sentence opening with a pronoun is about whom the one before was)
            # (`However, … they cannot gain or spend Edge`: a they with no one named is the sentence
            # before's target, as one opening with it)
            # (`They can select how many net hits they apply to the target`: the target named, it is the target's)
            if (
                re.match(r"\W*(?:they|them|it|he|she|this|these|their|its)\b", s, re.I)
                and not (_TARGET_WORDS.search(s) and not _CASTER_WORDS.search(s))
            ) or (
                re.search(r"\b(?:they|them|their)\b", s, re.I)
                and not _TARGET_WORDS.search(s)
                and not _CASTER_WORDS.search(s)
            ):
                who = last_who
            elif (
                (who := _affects(s)) == "caster"
                and opposed
                and not _TARGET_WORDS.search(s)
                and not _CASTER_WORDS.search(s)
                and re.search(r"\b(?:each|every|per)\s+(?:net\s+)?hits?\b[^.]*\b(?:reduc|lower|decreas)\w+", s, re.I)
            ):
                who = "target"  # (`Each net hit reduces (attribute) by 1` after an opposed test: what it does to the one it is rolled against)
            last_who = who
        else:
            who = None
        if stated and (bm := _BACK_REF.search(s)):  # (`Its Firewall attribute is cumulative with other devices`)
            for t, _ in targets(bm.group("t"), kind):
                if t in stated:
                    out.append(_fx(t, "add", stated[t], sw, when))
        stated = {t: v for m in _STATED.finditer(s) for t, _ in targets(m.group("t"), kind)[:1] for v in [m.group("v")]}
        if (
            lm := _LEVELS_AFTER_FIRST.search(s)
        ) and prev_tests:  # (owner 2026-10-11: `R-1`, a value per level after the first)
            n = lm.group("v")
            for t, spec in prev_tests:
                out.append(_fx(t, "add", "R-1" if n == "1" else f"R*{n}-{n}", sw, when, spec))
        here = []
        resist = _RESIST_OF.search(s)
        got = _rules(s, kind, sw, when, edge_actions, label, ai, last_named, name)
        if (
            sw == "conditional" and when and when in (sw_when, q_cond)
        ):  # (a condition from _sw or the words after the tests: each effect's own clause's)
            got = _scoped(
                got,
                s,
                kind,
                label,
                when,
                lambda t: _rules(t, kind, None, None, edge_actions, label, ai, last_named, name),
            )
        rs = _RESIST_CLAUSE.search(s)
        if rs and not others and not _EDGE_OTHERS.search(s):
            # (`Edge when resisting Intimidation`, `+1 die to resist Manipulation spells`: the defender's, not the attacker's skill or the casting of the spell)
            xl = rs.group("x").casefold()
            xt = {t for t, _ in targets(rs.group("x"), kind)} | {a_[0] for a_ in _activity(rs.group("x"))}
            for x in got:
                if (
                    x[0] == "effect"
                    and x[1]["target"].startswith(("skill:", "test:spell-", "action:"))
                    and x[1]["op"] in ("add", "edge", "edge-cost", "wild-die", "hits")
                    and (
                        x[1]["target"] in xt
                        or x[1]["target"].split(":", 1)[1].replace("-", " ") in xl
                        or (x[1].get("spec") and x[1]["spec"].casefold() in xl)
                    )
                ):
                    x[1]["target"] = (
                        "test:magic-resistance" if x[1]["target"].startswith("test:spell-") else "test:other"
                    )
                    x[1].pop("spec", None)
                    if not x[1].get("when"):
                        x[1]["switch"], x[1]["when"] = (
                            x[1].get("switch") or "conditional",
                            "resisting " + " ".join(rs.group("x").split()[:10]).casefold(),
                        )  # (a drug's stays `activated`)
        if (
            rs is not None and not others
        ):  # (`a +1 dice pool bonus to resist biofeedback damage`: only that damage, not every resistance test)
            xl_ = re.sub(r"\s*\([^)]*\)", "", rs.group("x")).strip()
            # (the resistance the object names, `magic where Body is used` is magic resistance: soaking damage beside it stays unconditional)
            res_t_ = (
                "test:magic-resistance"
                if re.search(r"spell|magic", xl_)
                else (
                    "test:damage-resistance"
                    if "damage" in xl_
                    else "test:toxin-resistance" if re.search(r"toxin|poison|disease|pathogen", xl_) else None
                )
            )
            if not re.fullmatch(
                r"(?:all |any |the |your |their )*(?:(?:physical|stun|matrix|mental|incoming) )?(?:damage|drain|fading|toxins?|spells?|magic|attacks?|effects?|it|them|that|this)",
                xl_,
            ) and not _GENERIC_RESIST.search(xl_):
                for x in got:
                    if (
                        x[0] == "effect"
                        and x[1]["target"].endswith("-resistance")
                        and (res_t_ is None or x[1]["target"] == res_t_)
                        and not x[1].get("when")
                        and not x[1].get("switch")
                    ):
                        x[1]["switch"], x[1]["when"] = "conditional", "to resist " + " ".join(xl_.split()[:10])
        if (
            choose_one
        ):  # (`Athletics or Stealth tests (choose one)`, `the choice of one skill is permanent`: one skill of those listed, not every one)
            listed = {t for t, _ in targets(choice_list, kind)}
            picks = [
                x
                for x in got
                if x[0] == "effect"
                and x[1]["target"].startswith("skill:")
                and x[1]["target"] != "skill:choice"
                and x[1]["target"] in listed
            ]
            if len({x[1]["target"] for x in picks}) >= 2:
                got = [x for x in got if x not in picks] + [
                    _fx(
                        "skill:choice",
                        picks[0][1]["op"],
                        picks[0][1]["value"],
                        picks[0][1].get("switch"),
                        picks[0][1].get("when"),
                    )
                ]
        if drug and kind == "gear" and label.casefold() in ("effect", "effects"):
            # (a BTL's or personafix's skills in its Effect line, `Con 2 (Seduction +2), Influence 1`: the skill at that rating while it lasts, a specialization's bonus beside it)
            for bm in re.finditer(
                r"(?:^|,)\s*(?P<s>[a-z][a-z ]*?)\s+(?P<n>\d)\s*(?:\((?P<sp>[a-z][a-z ]*?)\s*\+(?P<v>\d)\))?\s*(?=,|$)",
                s.casefold(),
            ):
                sk_ = bm.group("s").strip()
                if sk_ in SKILLS:
                    got = got + [_fx(f"skill:{sk_.replace(' ', '-')}", "set", bm.group("n"), "activated")]
                    if bm.group("sp"):
                        got = got + [
                            _fx(
                                f"skill:{sk_.replace(' ', '-')}",
                                "add",
                                bm.group("v"),
                                "activated",
                                None,
                                bm.group("sp").title(),
                            )
                        ]
        if (
            q_cond
        ):  # (a limit on the tests, `with activists`: not on what the sentence grants besides, `the Kiezspeak language skill`)
            for x in got:
                if x[0] == "effect" and x[1]["op"] == "set" and x[1].get("when") == q_cond:
                    x[1].pop("switch", None), x[1].pop("when", None)
        if (
            kind in _NATURAL_KINDS
            and (natural_entry or _NATURAL.search(s))
            and not _NOT_NATURAL.search(s)
            and (natural_entry or not _HELD.search(s) or (_WIELD.search(s) and _NATURAL.search(s)))
        ):
            # (a body modification's, quality's, critter power's or martial technique's Attack Rating or Damage Value is the natural
            # weapon's: the unarmed attack's, not an item's; thorns, horns, tusks, `Iron Limbs`. A sentence that names a wielded weapon
            # covers both the unarmed attack and the item: `including when wielding weapons`)
            both = bool(
                _WIELD.search(s) or re.search(r"\bmelee attacks?\b|\barmed or unarmed\b", s, re.I)
            )  # (`+1 AR for melee attacks`: with a weapon or without)
            got = [
                y
                for t, a, x in got
                for y in (
                    [(t, {**a, "target": "derived:unarmed-" + a["target"][5:]}, x)] + ([(t, a, x)] if both else [])
                    if t == "effect" and a["target"] in ("item:ar", "item:dv")
                    else [(t, a, x)]
                )
            ]
        if not _WILD_CONV.search(s):
            got = got + _unplaced(s, sw, when, kind)  # (a dice modifier on tests the reader names no target of)
        if (
            name is not None
            and sw == "wireless"
            and not any(x[0] == "effect" for x in got)
            and (im := re.search(r"\bbonus\b[^.;]{0,40}?\bincreases? to \+?(?P<v>\d+)\b", s, re.I))
            and (
                base := next(
                    (
                        y
                        for y in reversed(out)
                        if y[0] == "effect"
                        and y[1].get("switch") != "wireless"
                        and re.fullmatch(r"-?\d+", y[1]["value"])
                    ),
                    None,
                )
            )
        ):
            # (`The bonus increases to +3 if used when prone`: no target named, the bonus of the effect before: a total, apply() takes the base from it)
            fx_ = _fx(base[1]["target"], base[1]["op"], im.group("v"), "wireless", when, base[1].get("spec"))
            fx_[1]["_total"] = "1"
            got = got + [fx_]
        if (
            sw == "wireless"
            and not any(x[0] == "effect" for x in got)
            and (
                am := re.search(
                    r"\balso adds? its (?:bonus|rating) to (?:all |your |their |the )*(?P<t>[^.;]+)", s, re.I
                )
            )
            and (ts_ := targets(am.group("t"), kind))
        ):
            # (`The attention coprocessor also adds its bonus to Surprise tests`: the bonus of the effect before, on the tests it names)
            base_ = next((y for y in reversed(out) if y[0] == "effect" and y[1].get("switch") != "wireless"), None)
            got = got + [
                _fx(t, "add", base_[1]["value"] if base_ else "R", "wireless", when, spec) for t, spec in ts_[:2]
            ]
        if wm := _WILD_CONV.search(
            s
        ):  # (a wild die from converting one of the pool's dice: the tests the sentence names, or its own bonus's, or the sentence before's)
            named_ = [
                (t, sp_) for t, sp_ in targets(wm.groupdict().get("t") or "", kind) if t.startswith(("skill:", "test:"))
            ]
            own_ = [
                (x[1]["target"], x[1].get("spec"))
                for x in got
                if x[0] == "effect"
                and x[1]["op"] in ("add", "threshold", "edge")
                and x[1]["target"].startswith(("skill:", "test:"))
            ]
            if wm.group(0).casefold().startswith("convert"):
                got = [
                    x for x in got if x[0] != "effect"
                ]  # (`Convert one die on the Sprinting test`: not a bonus of one)
            got = got + [
                _fx(t, "wild-die", "1", sw, when, _spec(t, sp_)) for t, sp_ in (named_ or own_ or list(prev_tests))
            ]
        if (
            prev_tests
            and not any(x[0] == "effect" for x in got)
            and (
                bm := re.search(
                    r"\b(?:gains?|receives?|gets?) (?:an? )?(?P<v>[+-]?\d+) (?:dice pool )?(?:bonus|modifier)\b(?!\s+(?:to|on|for|when|against))",
                    s,
                    re.I,
                )
            )
        ):
            # (`if both hands and feet have setae, they gain a +4 dice pool bonus`: the tests of the clause before)
            got = [_fx(t, "add", _val(bm.group("v"), s), sw, when, spec) for t, spec in prev_tests]
        # (`That attribute's maximum (but not current) rank increases by 1`: the maximum, not the attribute; Exceptional
        # (Attribute), CRB Hong Kong p. 71)
        tattr = {
            (x[1]["target"][10:], x[1]["value"])
            for x in got
            if x[0] == "effect" and x[1]["target"].startswith("test:attr-") and x[1]["op"] == "add"
        }
        got = [
            x
            for x in got
            if not (
                x[0] == "effect"
                and x[1]["target"].startswith("attr:")
                and x[1]["op"] == "add"
                and (x[1]["target"][5:], x[1]["value"]) in tattr
            )
        ]  # (`+1 to all Logic-linked skill tests`: the tests, not the attribute too)
        maxed = {x[1]["target"][9:] for x in got if x[0] == "effect" and x[1]["target"].startswith("attr-max:")}
        got = [
            x
            for x in got
            if not (x[0] == "effect" and x[1]["target"].startswith("attr:") and x[1]["target"][5:] in maxed)
        ]
        for x in got:
            if x[0] == "effect":
                if (
                    label and label.casefold() in _SEVERITIES
                ):  # (`**Mild:** … a -2 modifier`, `**Severe:** … -4`: each severity's own, not all at once)
                    x[1]["switch"], x[1]["when"] = "conditional", label.casefold() + (
                        ": " + x[1]["when"] if x[1].get("when") else ""
                    )
                if (
                    sw == "wireless"
                    and re.search(r"\bincreases? to\b", s, re.I)
                    and re.fullmatch(r"-?\d+", x[1]["value"])
                ):
                    if name is not None:
                        x[1][
                            "_total"
                        ] = "1"  # (`increases to 2`: a total; apply() takes the base from it once all of the entry's effects are read)
                if who:
                    x[1]["affects"] = _edge_who(s, who) if x[1]["op"] in _EDGE_OPS and who != "others" else who
                elif (
                    x[1]["op"] in _EDGE_OPS
                    and (_EDGE_OTHERS.search(s) or (_THEY_EDGE.search(s) and re.search(r"\byour?\b", s, re.I)))
                    and not re.search(
                        r"\byou (?:also |then )?(?:gain|receive|get|may gain|can gain)\b[^.;]*\bedge", s, re.I
                    )
                ):
                    x[1][
                        "affects"
                    ] = "others"  # (`the opposing individual gains a point of Edge`: theirs, not the owner's)
                if (
                    kind == "spells"
                    and x[1]["op"] in _EDGE_OPS
                    and x[1]["target"] == "test:other"
                    and (cm := re.match(r"(?:when|while) casting (?:the|this) spell\b\s*", x[1].get("when") or ""))
                ):
                    # (`Gain +1 Edge when casting the spell if the object is narrow`: the caster's Edge on the casting test, Sorcery (Spellcasting))
                    x[1].update(target="skill:sorcery", spec="Spellcasting", affects="caster")
                    if x[1]["when"][cm.end() :]:
                        x[1]["when"] = x[1]["when"][cm.end() :]
                    else:
                        x[1].pop("when"), x[1].pop("switch", None)
                if low_formula:
                    x[1]["confidence"] = "low"
                if per_n and re.fullmatch(r"-?1", x[1]["value"]):
                    x[1]["value"] = ("-" if x[1]["value"].startswith("-") else "") + per_n
                    if sw == "activated" and when == "overdrive":
                        x[1]["confidence"] = "low"
                if re.fullmatch(r"-?[a-z][a-z-]*/\d+", x[1]["value"]):
                    x[1]["value"] = f"{x[1]['value']} {_rounding(s)}"  # (`edg/2`: the book's rounding, RU when silent)
                if resist and x[1]["target"].endswith("-resistance") and not x[1].get("switch"):
                    # (owner 2026-10-11: `resistant to ingested poisons … Edge on tests to resist`: a condition, noted)
                    x[1]["switch"], x[1]["when"] = "conditional", resist.group("obj").strip().lower()
                if x[1]["target"].startswith(("skill:", "test:")) and (x[1]["target"], x[1].get("spec")) not in here:
                    here.append((x[1]["target"], x[1].get("spec")))
                if re.search(
                    r"\bnet hits?\b|\b(?:each|every|per) hit\b",
                    re.sub(r"\bat least (?:\w+ )?net hits?\b", "", s, flags=re.I),
                    re.I,
                ) and re.fullmatch(r"-?(?:1|R)", x[1]["value"]):
                    x[1]["value"] = (
                        "-" if x[1]["value"].startswith("-") else ""
                    ) + "hits"  # (`1 per net hit`: shown, never applied)
            out.append(x)
        if prev_test and re.search(r"\b(?:this|that|the) test\b", s, re.I):
            for (
                x
            ) in (
                got
            ):  # (`… with a successful Influence (Etiquette) + Charisma (2) test. You gain an Edge on this test if …`: that skill's test)
                if (
                    x[0] == "effect"
                    and x[1]["op"] in _EDGE_OPS
                    and x[1]["target"] == "test:other"
                    and not x[1].get("affects")
                ):
                    x[1]["target"] = prev_test[0]
                    if sp_ := _spec(*prev_test):
                        x[1]["spec"] = sp_
        tests_ = list(_SKILL_TEST.finditer(s))
        prev_test = (
            (f"skill:{tests_[0].group(1).casefold().replace(' ', '-')}", tests_[0].group("sp"))
            if len(tests_) == 1
            else None
        )
        if any(x[0] == "effect" for x in got):
            last_fx = (para, [x[1] for x in got if x[0] == "effect"])
        if here:
            prev_tests = here
        if (
            own_sw == "activated"
            and not any(x[0] == "effect" for x in got)
            and re.search(r"\bactivat\w*|\bengag\w*|" + _SPEND_ACTION.pattern, s, re.I)
        ):
            act_on = para  # (`With a Minor Action, a secondary function can be activated.`: the switch for the rest of its paragraph)
        if re.search(r"\b(?:is|are) also (?:active|effective|in effect) (?:on|in) the astral plane\b", s, re.I):
            # (Mystic Armor, CRB p. 158: `Gain 1 point of Armor for each level … Mystic Armor is also active on the astral plane`: the
            # Defense Rating it gave is the astral one too)
            out += [
                ("effect", {**x[1], "target": "derived:defense-astral"}, None)
                for x in list(out)
                if x[0] == "effect" and x[1]["target"] == "derived:defense"
            ]
        last_named = here or [(t, w) for t, w in targets(s, kind) if t.startswith(("skill:", "test:"))]
        for m in _TEST.finditer(s):
            out.append(
                (
                    "test",
                    {
                        "skill": f"skill:{m.group(1).casefold().replace(' ', '-')}",
                        "attr": f"attr:{ATTRIBUTES[m.group(2).casefold()]}",
                        "threshold": m.group(3),
                    },
                    None,
                )
            )
    uniq, at = [], {}
    for (
        x
    ) in out:  # each once; the same effect on several of a skill's tests: one, its conditions (specializations) joined
        k = (
            x[0],
            tuple(sorted((a, b) for a, b in x[1].items() if a not in ("when", "spec"))),
            "spec" in x[1],
            x[1].get("when") if x[1].get("target") == "test:other" else None,
        )  # (`test:other` is told apart by its words: two conditions, two effects)
        if k in at:
            for f in ("when", "spec"):
                w0, w1 = uniq[at[k]][1].get(f), x[1].get(f)
                if (
                    w1 and w0 and f", {w1}, " not in f", {w0}, "
                ):  # (the words may hold commas themselves: `yakuza, bunraku puppets, or …`)
                    uniq[at[k]][1][f] = f"{w0}, {w1}"
            continue
        at[k] = len(uniq)
        uniq.append((x[0], dict(x[1]), x[2]))
    if _REMOVED_BAND.search(text or ""):  # (owner 2026-10-11: the longest range band removed, shown `—`)
        ar = next(
            (
                x
                for x in uniq
                if x[0] == "effect"
                and x[1]["target"] == "item:ar"
                and x[1]["op"] == "add"
                and x[1]["value"].count(",") == 4
            ),
            None,
        )
        if ar:
            ar[1]["value"] = ",".join(ar[1]["value"].split(",")[:4] + ["x"])
        else:
            uniq.append(_fx("item:ar", "add", "0,0,0,0,x"))
    for (
        x
    ) in (
        uniq
    ):  # (a defense pool the book names by what it defends against, `against astral attacks`, needs no condition saying so)
        if (
            x[0] == "effect"
            and x[1]["target"] in ("test:defense-astral", "test:defense-spell-direct", "test:defense-spell-indirect")
            and re.match(r"(?:against|versus)\b", x[1].get("when", ""))
        ):
            x[1].pop("when")
            if x[1].get("switch") == "conditional":
                x[1].pop("switch")
    # (`+1 die for any Perception (Hearing) tests`: read twice, the plain skill and the specialization: the specialization only)
    same = lambda x, y: x[0] == y[0] == "effect" and all(
        x[1].get(k) == y[1].get(k) for k in ("target", "op", "value", "switch", "when")
    )  # noqa: E731
    uniq = [
        x
        for x in uniq
        if not (x[0] == "effect" and "spec" not in x[1] and any(same(x, y) and "spec" in y[1] for y in uniq))
    ]
    if kind in VEHICLE_KINDS | {"gear"} and (pairs := _road_pairs(text)):
        # (tires that give on the road and take off it: the stat as the on-road/off-road pair, not two conditions)
        gone = {f"item:{k}" for k in pairs}
        uniq = [x for x in uniq if not (x[0] == "effect" and x[1]["target"] in gone and x[1]["op"] == "add")] + [
            _fx(f"item:{k}", "add", v) for k, v in pairs.items()
        ]
    return uniq


_ROAD_STAT = r"(?P<stat>acceleration|speed interval|handling)"
_ROAD_SIDE = (
    (re.compile(r"\boff[- ]?road\b"), 1),
    (re.compile(r"\bon[- ]?road\b|\bon (?:the )?(?:pavement|street)\b"), 0),
)


def _road_pairs(text):
    """{stat: 'on-road/off-road'} for a tire's Acceleration and Speed Interval as the book prints them for the road and for the
    off-road (Double Clutch pp. 122-123: one sentence gives the figures for one, another turns them into penalties for the
    other): a stat in a sentence about the road and in one about the off-road; {} when it isn't printed both ways."""
    got = {}
    for s in sentences(text):
        low = s.casefold().replace("–", "-").replace("−", "-")
        side = next((i for rx, i in _ROAD_SIDE if rx.search(low)), None)
        if side is None:
            continue
        for m in re.finditer(
            r"(?<![\w.])(?P<n>[+-]?\d+)\s+(?:to (?:the )?)?"
            + _ROAD_STAT.replace("?P<stat>", "?P<s1>")
            + r"|"
            + _ROAD_STAT.replace("?P<stat>", "?P<s2>")
            + r"\s+by\s+(?P<n2>[+-]?\d+)",
            low,
        ):
            stat, n = (m.group("s1"), m.group("n")) if m.group("s1") else (m.group("s2"), m.group("n2"))
            got.setdefault(stat.replace(" ", "-"), {}).setdefault(side, n.lstrip("+"))
    return {k: f"{v[0]}/{v[1]}" for k, v in got.items() if len(v) == 2}


_TARGET_WORDS = re.compile(
    r"\b(?:the |a |each |any |one )?(?:voluntary )?(?:targets?|subjects?|recipients?|affected|device|object|vehicle|drone|"
    r"ally|allies|individual|person|creature|item)\b",
    re.I,
)
_CASTER_WORDS = re.compile(r"\b(?:the (?:caster|spellcaster|magician|technomancer|shaman)|you|your)\b", re.I)


def _affects(s):
    """Whom a spell's or complex form's sentence says it affects (owner decisions 2026-10-10): `target` when it names the
    target, subject, device … before the caster; else `caster` (it names the caster, `you gain`, or no one)."""
    t, c = _TARGET_WORDS.search(s), _CASTER_WORDS.search(s)
    return "target" if t and (not c or t.start() < c.start()) else "caster"


def _edge_who(s, who):
    """Whom an Edge sentence gives (or denies) the Edge: the caster or target named nearest before its verb, `the caster gains
    1 Edge` in `… in an area affected by …, the caster gains 1 Edge`, `you gain` in `When using this form on a target …, you gain …`; `who` (the sentence's first named) when none is.
    """
    v = re.search(r"\b(?:gains?|gets?|receives?|spend)\b", s, re.I)
    head = (s[: v.start()] if v else "").rsplit(",", 1)[
        -1
    ]  # (the verb's own clause: `If the subject resists your spell, they gain 1 Edge`)
    last = [(m.end(), w) for w, rx in (("target", _TARGET_WORDS), ("caster", _CASTER_WORDS)) for m in rx.finditer(head)]
    return max(last)[1] if last else who


# (a rise in the spell's, form's or preparation's own Drain is its cost, no effect: `Drain Value is also increased by +2`,
# `each additional person increases the spell's Drain by 1`, `+1 Drain for each additional status`, `Poor Healer`'s `+1 Drain
# Value`; a rise of the Drain *resistance* is not)
_DRAIN_UP = re.compile(
    r"\bincreas\w*\s+(?:the |a |an |its |your |their )?(?:[a-z]+['’]s\s+)?drain(?: value)?(?![\s-]+resist)(?:\s+by\s+(?:\+?\d+|one|two|three)\b)?|"
    r"(?<!resist )(?<!resisting )\bdrain(?: value)?(?:\s+of\s+the\s+\w+)?\s+(?:is |are |being )?(?:also )?(?:increas\w*|rais\w*)(?:\s+by\s+(?:\+?\d+|one|two|three)\b)?|"
    r"\+\d+\s+drain(?: value)?\b(?![\s-]+resist)",
    re.I,
)
_OTHERS = re.compile(
    r"^\W*(?:(?:additionally|also|however|furthermore|in addition|but|and)\W+)?"
    r"(?:those(?! with)|anyone|anybody|someone|others|opponents?|attackers?|enemies|observers?|onlookers?|"
    r"spellcasters?|targets?|the target|anyone else|an? (?:observer|opponent|attacker|enemy|onlooker)|"
    r"other (?:individuals|characters|people|runners|players)|(?:npcs|pcs)\b|"
    r"(?:characters|people|individuals|anyone) (?:trying|attempting|looking|who|that))\b|"
    r"\b(?:tests?|attacks?|spells?) (?:made |cast )?against (?:you|them|the character|the user)\b|"
    r"\btests? to (?!(?:hide|conceal|disguise|mask|pass|blend|impersonate|appear|pretend|keep|maintain|protect|make|use|avoid|sneak|escape|sell|prevent)\b)(?:[a-z]+ ){1,3}(?:for )?(?:your|you)\b|"
    r"\bfor (?:anyone|others|those(?! with))\b|"
    # (`your targets suffer -2`, not `a bonus when interacting with your target`: the one the bonus is rolled against)
    r"\byour (?:opponents?|enemies|attackers?)\b|(?<!with )(?<!against )(?<!of )\byour targets?\b|"
    # (the pursued one's gear against the pursuers: `any ground vehicles in pursuit suffer`, not `your vehicle in pursuit gains`)
    r"\b(?:(?:any|all|other|enemy|opposing) (?:[a-z-]+ )?(?:vehicles?|drones?) (?:in pursuit|pursuing)|pursuing (?:[a-z-]+ )?(?:vehicles?|drones?))\b(?! of\b)|"
    r"\b(?:to|for) (?:anyone|anybody) (?:who|that|conducting|attempting|trying|making|performing|looking)\b|"
    r"\b(?:perception )?tests? to (?:see|spot|notice|find|hear|track|detect) (?:them|you|the (?:character|user|individual))\b|"
    r"^\W*users? of (?:the|this) \w+ grants?\b",
    re.I,
)
# (a third party, the subject of a clause after a comma: `In addition …, anyone affiliated with Aztechnology … gains +2 dice`, `…, so any observers get a +1 dice pool bonus`)
_OTHERS_MID = re.compile(
    r",\s+(?:so |and |then )?(?:anyone|any (?:observers?|opponents?|attackers?|enemies)|observers|opponents|attackers|enemies|others)\b[^.;,]{0,80}?\b(?:gains?|gets?|receives?)\b",
    re.I,
)
_TEST = re.compile(
    rf"\b({'|'.join(s.title() for s in SKILLS)})\s*\+\s*({'|'.join(a.title() for a in ATTRIBUTES)})"
    rf"\s*\((\d+)\)\s+test\b"
)
_SKILL_TEST = re.compile(
    rf"\b({'|'.join(s.title() for s in SKILLS)})(?: \((?P<sp>[A-Z][\w' -]+)\))?\s*\+\s*(?:{'|'.join(a.title() for a in ATTRIBUTES)})(?:\s*\(\d+\))?\s+tests?\b"
)
