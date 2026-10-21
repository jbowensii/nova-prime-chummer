"""The effects reader's phrasing rules: _rules(), the general rules read() applies to each clause."""
import re

from .words import ATTRIBUTES, FIRE_MODES, ITEM_KINDS, MATRIX, NUMBERS, SENSES, SKILLS, TEST_TYPES, VEHICLE_KINDS, _ATTR_RX, _CONDITION, _ITEM_SCOPE, _PRONOUN_TEST, _THRESHOLD, _slug
from .values import _BANDS, _EDGE_OPS, _EDGE_SET, _PER_LEVEL, _activity, _cond_words, _fx, _negated, _rated, _spec, _val, number, targets


_VAL = r"(?P<v>[+-]?\s?\d+(?:\.\d+)?|one|two|three|four|five|six|an?|single)"
_LOSS = re.compile(r"\b(?:lose[sd]?|losing|suffers?|subtract\w*|minus|penalt\w*|fewer|reduc\w*)\b[^.;]{0,30}$")  # (`loses 2 dice for …`: a penalty, not a bonus; left unread)
_PER = r"(?:\s+(?:per|for each|each)\s+(?:level|rating(?: point)?|point of (?:rating|force)|hit))?"


_ATTR_TARGETS = {f"attr:{v}": k for k, v in ATTRIBUTES.items() if v != "edg"}


def _attr_tests(a, low):
    """Whether the sentence names tests by the attribute `a` (`Logic tests`, `tests that include the Magic attribute`, `an action linked to a Physical
    Attribute (Agility, …)`), not only its word."""
    return bool(re.search(rf"\b{a}(?: attributes?)?(?:[- ](?:based|linked))? (?:tests?|rolls?|checks?)\b|\b(?:tests?|actions?|rolls?|checks?)\b[^.;]{{0,40}}?\b(?:us(?:e|es|ing)|involv\w*|includ\w*|linked to|tied to|based on)\b"
                          rf"[^.;]{{0,60}}?\b{a}\b|\battributes? \([^)]*\b{a}\b|\bus(?:e|es|ing) (?:the |your |their )?{a} attribute\b|\b{a}\s*\+\s*[a-z]+ (?:\(\d+\) )?(?:tests?|rolls?)\b|\b(?:on|for) (?:your |their )?{a}\s*(?:[.;,]|$)", low))


def _rules(s, kind, sw, when, edge_actions, label, ai=False, prev=(), name=None):
    """The effects one sentence states (`ai`: the entry is an AI's, whose initiative is its Matrix initiative; `prev`:
    the clause before's tests, for an Edge cost stated after a semicolon)."""
    low = s.casefold()
    out = []
    matrix_init = bool(re.search(r"\b(?:vr|matrix|hot sim|cold sim)\b", low)) or ai

    def emit(ts, op, value, w=None, phrase=""):
        if op in _EDGE_OPS and ts:  # (Edge on tests using an attribute, not the word in another noun: `toxic magic`, `a Resonance Spike`, `use Strength for any grappling test`)
            kept = [x for x in ts if x[0] not in _ATTR_TARGETS or _attr_tests(_ATTR_TARGETS[x[0]], low)]
            if not kept and sw == "conditional" and when and not (phrase and _activity(phrase)):
                kept = [("test:other", None, when)]  # (`a bonus Edge when trying to move through cramped spaces`: Edge then, shown with its words)
            ts = kept
        if not ts and phrase:  # (tests the book names by activity, `tests involving grappling`: shown with its words)
            ts = _activity(phrase)
        for t, spec, *words in ts:  # (an activity's: the words it is named by, `escaping bonds, flexibility`)
            if t == "attr:edg" and op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die"):
                if op == "edge-cost":
                    t = "test:all"  # (`Edge Boosts cost 1 less`: every Edge Boost)
                else:
                    continue  # (`a bonus Edge when making any Logic-based test`: the word Edge, not tests that use the Edge attribute)
            if t.startswith("attr:") and op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die"):
                t = "test:attr-" + t[5:]  # (Edge on Logic tests: tests using the attribute)
            if op in ("edge", "no-edge", "no-edge-gain", "edge-cost", "wild-die") and t.startswith(("item:", "matrix:")):
                continue
            out.append(_fx(t, op, value, sw or ("conditional" if words else None), (words[0] if words else None) or w or when, _spec(t, spec)))

    # thresholds the entry changes (_THRESHOLD): read here, the words left out of what follows
    for m in list(_THRESHOLD.finditer(low)):
        d = (m.group("d") or m.group("d2") or m.group("d4") or "").casefold()
        raw = next((g for g in (m.group("v"), m.group("v2"), m.group("s3"), m.group("v4"), m.group("s5")) if g), "").strip()
        num = NUMBERS.get(raw.casefold(), raw).replace(" ", "").lstrip("+")
        neg = d.startswith(("reduc", "lower", "decreas")) or (not d and num.startswith("-"))
        if not num.lstrip("-").isdigit():
            continue
        phrase = m.group("t") or m.group("t2") or m.group("t3") or m.group("t4") or m.group("t5") or ""
        if not targets(phrase, kind):
            phrase = next((x for x in (re.sub(r"^\s*(?:for|of|on)\s+", "", m.group("mid") or ""), re.sub(r"^\s*(?:for|on|of)\s+", "", m.group("after") or "")) if targets(x, kind)), phrase)
        # (no tests named with it, `useful for climbing tests, reducing thresholds by 1`: the tests the clause before names)
        ts = targets(phrase, kind) or (([x for x in targets(low[:m.start()], kind) if x[0].startswith(("skill:", "test:"))] or list(prev)) if not (phrase + (m.group("mid") or "")).strip() else list(prev))
        if ts and all(t.startswith(("item:", "derived:")) for t, _ in ts):
            continue  # (`increases the concealability threshold by 1`: the item's stat, read below)
        end = m.end("v") if m.group("v") else m.end("v2") if m.group("v2") else m.end()
        low = low[:m.start()] + " " * (end - m.start()) + low[end:]
        if not ts:
            continue
        sp = re.split(r"\b(tests?|checks?|rolls?)\b", phrase, maxsplit=1)
        head, qual = (sp[0], sp[2]) if len(sp) == 3 else (phrase, "")
        w = " ".join(qual.split()[:12]).strip(" ,") or (" ".join(phrase.split()[:12]) if len(head.split()) >= 3 else None)
        for t, spec in ts:
            fx = _fx(t, "threshold", ("-" if neg else "") + num.lstrip("-"), sw or ("conditional" if w and not when else None), when or w, _spec(t, spec))
            if not neg and not re.search(r"\byou(?:r)? (?:make|roll)", s):
                fx[1]["affects"] = "others"  # (a higher threshold is the opposition's: it is harder for them)
            out.append(fx)
    # an attribute's maximum (`maximum (but not current) rank increases by 1`, `maximum Body and Strength by one point`)
    bare = re.sub(r"\s*\([^)]*\)", "", low)  # (`(as listed in the Metatype Attribute Table, p. 64, SR6)`)
    for m in re.finditer(r"\b(?:maxim(?:um|ums|a)|racial limits?)\b(?:\s*\(but not current\))?(?P<t>[^.]{0,60}?)(?:rank\s+)?(?:is |are )?(?P<dir>increas\w*|decreas\w*|rais\w*|lower\w*)"
                         r"\s+by\s+" + _VAL, bare):
        ts = [(t, w) for t, w in targets(bare[:m.start("dir")], kind) if t.startswith("attr:")] or \
            ([("attr:choice", None)] if re.search(r"chosen|select|choose|that attribute", low) else [])
        v = _val(m.group("v"), low)
        if m.group("dir").startswith(("decreas", "lower")):
            v = "-" + v.lstrip("-")
        for t, _ in ts:
            out.append(_fx("attr-max:" + t[5:], "add", v, sw, when))
    for m in re.finditer(r"\bincreas\w* (?:the (?:individual|character)'s |your |their )?maximum (?P<t>[^.]*?) by " + _VAL, low):
        for t, _ in targets(m.group("t"), kind):
            if t.startswith("attr:"):
                out.append(_fx("attr-max:" + t[5:], "add", _val(m.group("v"), low), sw, when))
    for m in re.finditer(r"\b(physical|mental) attribute maxim(?:um|ums|a) (?:are |is )?(?P<dir>increas\w*|reduc\w*|decreas\w*|lower\w*) by " + _VAL, low):
        sign = "-" if re.match(r"reduc|decreas|lower", m.group("dir")) else ""
        for a in TEST_TYPES[m.group(1)]:
            out.append(_fx(f"attr-max:{a}", "add", sign + _val(m.group("v"), low).lstrip("-"), sw, when))
    maxed = any(x[1]["target"].startswith("attr-max:") for x in out)

    # Edge: bonus Edge, no Edge, Edge costs
    for m in re.finditer(r"(?:\bcannot|\bcan't|\bmay not|\bcan not|\bcan never|\bmay never|\bnever|\bunable to|\bnot (?:be |being )?able to|\bdoes not|\bdo not|n't) (?P<what>(?:gain|earn|spend|use)"
                         r"(?:(?: any)? edge(?: points?)?)?(?: or (?:gain|earn|spend|use))?)(?: any)? edge(?: in any form)?(?: (?:points?|boosts?|actions?))?(?: (?P<p>on|for|in|during|when making|when|to)\s+"
                         r"(?P<t>[^.;]*))?", low):
        what = m.group("what")
        before = low[:m.start()] if re.search(r"\b(?:tests?|rolls?|checks?|skills?)\b", low[:m.start()]) else ""
        named = m.group("t") or ""
        if re.match(r"the purposes? of\b", named):  # (`for the purposes of sneaking while carrying …`: the activity, as a test)
            named = re.split(r"\s+(?:while|when|if|whenever|during)\b", re.sub(r"^the purposes? of\s+", "", named))[0] + " tests"
        qual_ = None
        ts = [] if m.group("p") == "to" else targets(named, kind)  # (`Edge to influence a SIN check`: what it is for, not the Influence skill)
        if not ts and named and not _PRONOUN_TEST.fullmatch(named.strip()):
            if re.search(r"\b(?:tests?|checks?|rolls?)\b", named) and (act := _activity(named)):
                ts = act  # (`tests involving grappling`)
            else:
                qual_ = " ".join(named.split()[:12]).strip(" ,")  # (`on any action that would generate a Heat modifier`: on any test, only then)
        ts = ts or [x for x in targets(before, kind) if x[0] != "attr:edg"] or \
            [("test:all", None)]  # (`When using that skill …, you may not …`; `you may not gain or spend Edge`: on any test)
        role = re.match(r"\W*(technomancer|magician|adept|decker|rigger)s?\b", low)  # (`Technomancers who take this drug … will not be able to`: theirs only)
        n_ = len(out)
        if what in ("gain", "earn") or re.search(r"\b(?:gain|earn)\b", what):
            emit(ts, "no-edge-gain", "1")
        if re.search(r"\b(?:spend|use)\b", what):
            emit(ts, "no-edge", "1")
        fail = re.search(r"\bfail(?:ure|s|ed)?\b", low[:m.start()])  # (`Failure means … the penalty of not being able to spend Edge`: after a failed test only)
        # (the words after the test the ban names, `social tests where they talk their way out of a fight`, `any Judge Intentions tests except during combat`, `Social
        # Tests, with the exception of Intimidation`: the ban's own limit, whatever clause of the sentence a condition word is in)
        sc_ = re.split(r"\b(?:tests?|checks?|rolls?)\b", named, maxsplit=1)
        scope_ = re.split(r",\s*(?:and|but|or)\s+(?:you|they|it|the|a|an)\b|[;:]", re.sub(r"\s*\([^)]*\)?", "", (sc_[1] if len(sc_) == 2 else "").strip(" ,")))[0] if qual_ is None and ts else ""
        scope_ = " ".join(scope_.strip(" ,").split()[:12]).strip(" ,")
        if not scope_ and named and (ex_ := re.search(r"\b(?:except(?: for)?|with the exception of|other than|apart from)\b.{3,60}", named)):
            scope_ = " ".join(re.split(r"[;:]", re.sub(r"\s*\([^)]*\)?", "", ex_.group(0)))[0].split()[:12])
        if not re.match(r"(?:where|when|whenever|while|if|unless|except|with the exception|other than|apart from|involving|using|that|which|made|against|during|after|before|with|within|outside|in|at|you|they|the user|anyone)\b", scope_):
            scope_ = ""  # (`due to trouble focusing`, `for the original duration`: the story, not a limit)
        if len(scope_.split()) < 2 and not re.match(r"except\b", scope_):
            scope_ = ""
        if (rest_ := re.sub(r"^(?:using|involving|that (?:use|involve)s?|related to)\s+", "", scope_)) != scope_ and (len(rest_.split()) <= 3 or not re.sub(
                r"\b(?:and|or|the|a|an|any|all|tests?|skills?|attributes?|" + "|".join(ATTRIBUTES) + "|" + "|".join(SKILLS) + r")\b|[^a-z]", "", rest_)):
            scope_ = ""  # (`any test using Charisma`, `tests involving Agility, Reaction, or Strength`: which tests, not a limit)
        for x in out[n_:]:
            w0_ = x[1].get("when")
            if scope_ and not (w0_ and w0_[:20] in scope_ and not re.match(r"except\b", scope_)):
                before_ = bool(w0_) and 0 <= low.find(w0_[:20]) < m.start()
                x[1]["switch"] = x[1].get("switch") if x[1].get("switch") in ("activated", "sustained", "wireless") else "conditional"  # (a drug's stays `activated`)
                x[1]["when"] = f"{w0_}; {scope_}" if before_ else scope_
            elif (role or fail) and not x[1].get("when"):
                x[1]["switch"], x[1]["when"] = "conditional", role.group(1) if role else "on failure"
            elif qual_ and not x[1].get("when"):
                x[1]["switch"], x[1]["when"] = "conditional", qual_
    for m in re.finditer(r"\bthe cost of (?:any |all )?edge (?:actions?|boosts?)(?: (?:or|and) (?:actions?|boosts?))?(?P<t>[^.;]*?) (?:are|is) "
                         r"(?P<dir>increased|raised|reduced|lowered|decreased) by (?P<v>\w+)", low):
        sign = "-" if m.group("dir") in ("reduced", "lowered", "decreased") else ""
        emit(targets(m.group("t"), kind), "edge-cost", sign + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\bedge (?:boosts?|actions?)(?: (?:and|or) (?:boosts?|actions?))? cost (?P<v>\w+) (?P<dir>less|more)"
                         r"(?: (?:for|on|when making|when|to|in|during|with)\s+(?P<t>[^.;]*))?", low):
        v = _val(m.group("v"), low)
        emit(targets(m.group("t") or "", kind), "edge-cost", ("-" if m.group("dir") == "less" else "") + v.lstrip("-"), phrase=m.group("t") or "")
    # the Edge cost of an action it names (`reduces the cost for the Charge Edge action by 2`, `the Edge cost for Protect the Principal by 2`)
    for m in re.finditer(r"\b(?:reduc|lower)\w* the (?:edge )?cost (?:of|for) (?:the )?(?P<a>[a-z][a-z' -]{2,40}?)(?: edge)?(?: action)? by (?P<v>\d+|one|two|three)"
                         r"(?: and (?P<b>[a-z][a-z' -]{2,40}?) by (?P<w>\d+|one|two|three))?\b", low):
        for a_, v_ in ((m.group("a"), m.group("v")), (m.group("b"), m.group("w"))):
            if "edge" not in m.group(0):
                break  # (`reduce the cost of the rig by 2`: a price, not an Edge cost)
            if a_ and not re.search(r"(?:\b(?:boosts?|actions?|edge|tests?|rolls?|checks?)\b|^(?:any|all)\b)", a_.strip()):
                emit([(f"action:{_slug(a_)}", None)], "edge-cost", "-" + _val(v_, low).lstrip("-"))
    # a threshold the entry sets (`reduce the threshold for Surprise tests to 2`: a new threshold, not a change by N)
    for m in re.finditer(r"\b(?:reduc|lower|rais|increas)\w* the thresholds? (?:of|for) (?:all |any |the )?(?P<t>[^.;]*?) to (?P<v>\d+)\b|"
                         r"\bthresholds? for (?:all |any |their |your )?(?P<t2>[a-z][a-z ()-]*? tests) (?:is|are) (?P<v2>\d+)\b", low):  # (`Their threshold for Surprise tests is 1`)
        emit(targets(m.group("t") or m.group("t2"), kind), "threshold-set", m.group("v") or m.group("v2"))
    for m in re.finditer(r"\b(?P<dir>reduc\w*|lower\w*|increas\w*|rais\w*) the (?:edge )?cost of (?:any |all |the |an? )?edge "
                         r"(?:boosts?|actions?)(?: (?:and|or) (?:boosts?|actions?))?(?: by (?P<v>\w+))?"
                         r"(?P<t>[^.;]*)", low):
        v = _val(m.group("v") or "1", low)
        sign = "-" if m.group("dir").startswith(("reduc", "lower")) else ""
        emit(targets(m.group("t"), kind), "edge-cost", sign + v.lstrip("-"))
    for m in re.finditer(r"\bedge (?:actions?|boosts?)(?: and (?:actions?|boosts?))? cost (?P<v>\w+) (?:points? )?(?P<dir>higher|lower)", low):
        ts = [x for x in targets(low[:m.start()], kind) if x[0] != "attr:edg"] or list(prev)  # (`… Athletics tests …; Edge Actions and Boosts cost 1 point higher`: the clause before's tests)
        emit(ts, "edge-cost", ("-" if m.group("dir") == "lower" else "") + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\b(?:reduc|lower)\w* the (?:edge )?cost (?:of|for) (?:any |all |the |your |their |an? )?edge (?:boosts?|actions?)(?P<t>[^.;]*?)\bby (?P<v>one|two|\d+)\b(?P<after>[^.;]*)", low):
        act_ = [a for a in _activity(m.group("after")) if a[0] != "test:other"]  # (`… by 1 used during a grapple test`: the activity's skill)
        if not targets(m.group("t"), kind) and (targets(m.group("after"), kind) or act_):  # (`… by one on tests like Stealth (Palming)`)
            emit(targets(m.group("after"), kind) or act_, "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))
            continue
        if re.match(r"\s*(?:(?:and|or) (?:boosts?|actions?))?\s*$", m.group("t")) and not targets(m.group("after"), kind):
            if sw == "conditional" and when and not any(x[1]["op"] == "edge-cost" for x in out):
                emit([("test:all", None)], "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))  # (`Whenever you are affected by noise, reduce the cost of any Edge boosts or actions by 1`: every test, then)
            continue  # (read above)
        emit(targets(m.group("t"), kind), "edge-cost", "-" + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\bedge (?:boost |action )?costs? (?:are |is )?(?P<dir>increas\w*|reduc\w*|lower\w*) by (?P<v>\w+)(?P<t>[^.;]*)", low):
        sign = "-" if m.group("dir").startswith(("reduc", "lower")) else ""
        ts = targets(m.group("t"), kind) or targets(low[:m.start()], kind)
        emit(ts, "edge-cost", sign + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\breduce the edge cost of the (?P<n>[\w ’'-]+?) edge action(?: by (?P<v>\w+))?", low):
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost", "-" + _val(m.group("v") or "1", low).lstrip("-"), sw, when))
    if edge_actions and (m := _EDGE_SET.fullmatch(s)):
        # (`Bootleg Turn (1 Karma)`: the Stunt Driver's list prints Karma where its lead-in says half the Edge cost; `Double Down (1,2, or 3
        # Edge only on Engineering [Gunnery] tests)`, `Double Down only on Piloting tests (1,2, or 3 Edge)` and `Double Down (1,2, or 3)
        # Edge on any test made while chasing`: the lowest, with its condition)
        cond = next((c for c in (m.group("w0"), m.group("w1"), m.group("w2")) if c), None)
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost-set", m.group("v"), "conditional" if cond else sw,
                       re.sub(r"\[([^\]]*)\]", r"(\1)", cond if cond.startswith(("on ", "only")) else "only " + cond) if cond else when))
    edge_rx = (r"(?:\b(?:in addition to(?: the)?(?= \d)|bonus of|gain(?:s|ing)?|receiv(?:es?|ing)|gets?|getting|grant(?:s|ing)?(?: you(?= an? bonus point of edge))?|gives?|giving|provid(?:es?|ing)|offers?|confers?|has|have|earns?|with|and|plus|add(?:s|ing)?)|\+)\s*(?:the (?:character|user|adept|individual) )?"
               r"(?:an? (?=\+))?(?P<v>an?|one|two|three|\d+|\+\d+)?\s*(?:additional |extra |bonus |free |situational )*(?:points? of )?"
               r"(?:situational |bonus )?edge(?: points?| bonus)?(?: (?:that|which) (?:must|can|may) be [^.,;]*?(?= on| for| when|$))?"
               r"(?: (?:to (?:your|their|the) dice pool )?(?:on|for|to use on|when (?:making|attempting|performing|using|rolling)|when|while (?=(?:attacking|defending|casting|making|rolling))|in|during|before making|to|vs\.?|versus|against)\s+(?P<t>[^.;]*))?")
    chase_pool = bool(re.search(r"\bchase pool\b|\bedge at the (?:start|beginning) of (?:every|each)", low))  # (a chase pool's Edge: pool:chase, below)
    if rw := re.search(r"\b(?:if|when) you (?:fully |completely )?(?:resist|soak) all(?: of)? (?:the )?(?P<d>fading|damage)\b[^,.;]*,\s*(?:you )?(?:gain|get|receive)s? (?:an? )?(?:point of )?edge\b", low):
        # (`If you completely resist all damage from a Data or Resonance Spike, gain a point of Edge`: a reward for the result, not Edge on the test)
        emit([("test:other" if rw.group("d") == "fading" else "test:damage-resistance", None, rw.group(0).split(",")[0])], "edge", "1")
        chase_pool = True  # (the Edge is read: no other reading of it below)
    for m in re.finditer(r"\b(?:gains?|receives?|gets?|adds?|grants?)(?: the (?:character|user|adept|magician|individual))? edge (?:and [^.;]*? )?(?:on|for|to|when making|when) (?P<t>[^.;]*)", low):
        if not re.search(r"(?:\bcannot|\bnot|n't|\bnever)\s*$", low[:m.start()]) and not chase_pool:
            emit(targets(m.group("t"), kind), "edge", "1", phrase=m.group("t"))  # (`gain Edge when searching for …`: the activity)
    for m in re.finditer(edge_rx, low):
        if chase_pool:
            break
        if re.search(r"\b(?:when|if|whenever)\s+having\b[^,.;]*$", low[:m.start()]):
            continue  # (`does not apply when having a lower Social Rating grants Edge`: a condition of the rule, no Edge given)
        if re.search(r"(?:\bcannot|n't|\bnot|\bnever)\s*$", low[:m.start()]):
            continue
        if not m.group("v") and not re.search(r"\b(?:bonus|situational|points? of|an? edge|(?:grants?|gives?) (?:the \w+ )?edge)\b", m.group(0)):
            continue
        t = m.group("t") or ""
        if t and re.search(r"(?:vs\.?|versus|against)\s+$", low[m.start():m.start("t")]) and re.match(r"(?:an? |the )?(?:target|opponent|person|individual|creature|enem|anyone|anybody)", t):
            # (`a bonus Edge vs. a target who has something interfering`: Edge against whom, not on a skill the words mention)
            emit([("test:other", None, "vs. " + " ".join(t.split(",")[0].split()[:12]))], "edge", _val(m.group("v") or "1", low).lstrip("+"))  # (up to the comma: `, and provides the ability …` is another clause)
            continue
        items_ = [i_.strip() for i_ in re.split(r",\s*(?:and\s+)?|\s+and\s+", t) if re.search(r"\b(?:tests?|rolls?)\b", i_)]
        if len(items_) >= 2 and not prev:
            # (`on the summoning test, the invocation test, and the drain resistance roll`: Edge on each of the tests listed, a test no skill names is `test:other`)
            for it_ in items_:
                emit(targets(it_, kind) or [("test:other", None, re.sub(r"^(?:the|a|an)\s+", "", it_) + (f", {when}" if when else ""))], "edge", _val(m.group("v") or "1", low).lstrip("+"))
            continue
        ts = list(prev) if prev and re.match(r"\s*(?:that|those|such|these) tests?\b", t) else targets(t, kind)  # (`a bonus point of Edge on that test`: the one before's)
        if not ts:  # (`Whenever you assense …, gain a point of Edge`, `Outdoors and Perception tests … gain an Edge`)
            clause = [c for c in re.split(r"[,;]|(?<=[a-z])-(?=(?:on|for|in|when|with)\b)", low[:m.start()]) if c.strip()]
            last = clause[-1] if clause and not re.match(r"\s*(?:or|and|nor)\b", clause[-1]) else ""  # (the end of a list is not the whole list)
            ts = (targets(last, kind) if last else []) or targets(low[:m.start()], kind)  # (the clause just before first: `on those Con (Disguise) tests, gain a point of Edge`)
        if not ts and not _activity(t):
            if not _activity(low[:m.start()]):  # (`When performing a Juryrigging test, you gain a point of Edge`)
                if sw == "conditional" and when:  # (owner decision 9, 2026-10-11: Edge on a condition, no test named: shown with its words)
                    emit([("test:other", None, when)], "edge", _val(m.group("v") or "1", low).lstrip("+"))
                continue
            t = low[:m.start()]
        n0_ = len(out)
        emit(ts, "edge", _val(m.group("v") or "1", low).lstrip("+"), phrase=t)
        if len(out) == n0_ and not ts and sw == "conditional" and when:  # (`Using the sensor in dim light offers a bonus Edge if opponents can't see`: the words before are no test)
            emit([("test:other", None, when)], "edge", _val(m.group("v") or "1", low).lstrip("+"))
    for m in re.finditer(r"\bspend (?P<v>\w+) (?:extra|additional|more) points? of edge on edge (?:boosts?|actions?)[^.;]*?"
                         r"(?: (?:on|for) (?P<t>[^.;]*?))?(?= when\b|[.;]|$)", low):
        emit(targets(m.group("t") or "", kind), "edge-cost", _val(m.group("v"), low).lstrip("+"))
    for m in re.finditer(r"\bgains? (?P<v>\d+|an?|one|two|three) (?:additional |extra |bonus )hits? when (?P<t>resisting [^.;]*)", low):
        emit(targets(m.group("t"), kind), "hits", _val(m.group("v"), low), phrase=m.group("t"))  # (`gains one bonus hit when resisting an attack`, Granite)
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three) (?:additional|extra|bonus) hits? (?:on|to|for) (?:all |any |your )*(?P<t>[^.;]*)", low):
        emit(targets(m.group("t"), kind), "hits", _val(m.group("v"), low))
    # a skill's ranks added to a test's dice pool (`add your ranks in Con to their dice pool`, Composure or Judge Intentions): the value `rank:<skill>`,
    # a formula over the character's skill, shown (owner 2026-10-17)
    for m in re.finditer(r"\badd (?:your|their|his|her) (?:ranks?|rating) in (?P<s>[a-z][a-z ]*?) to (?:(?:your |their |his |her |the )?dice pool on an? (?P<t>[a-z][a-z ]*?) tests?|"
                         r"an? (?P<t2>[a-z][a-z ]*?) dice pools?)\b", low):
        emit(targets((m.group("t") or m.group("t2")) + " test", kind)[:1], "add", "rank:" + _slug(m.group("s")))
    for m in re.finditer(r"\b(?:use|swap in|roll|adds?|gains?|and|imposes?|replace[sd]? [^.]* with)\s+(?:(?:a|the|one|an additional|an extra|a bonus)\s+)?wild die(?: (?:on|for|with|in|to)\s+(?:all (?:of )?)?(?:your )?(?P<t>[^.;]*))?", low):
        if not targets(m.group("t") or "", kind) and (ev := re.search(r"\b(?:every|any|each|all)(?: of)?(?: (?:your|their|the))? (?:skill )?(?:tests?|rolls?)\b(?P<q>[^.;]*)|\bmakes? an? skill test\b", low)) \
                and not any(t_.startswith("skill:") and t_ != "skill:choice" for t_, _ in targets(re.sub(r"\([^)]*\)", "", low), kind)):
            # (`adds a wild die to every test they make while in the Matrix`, `Whenever this critter makes a skill test, add a wild die`: every test, on the
            # sentence's condition or the one after the tests, not a skill named nearby)
            cond = when or next((_cond_words(ev.group("q"), c.start()) for c in _CONDITION.finditer(ev.group("q") or "")), None)
            emit([("test:all", None, cond) if cond else ("test:all", None)], "wild-die", "1")
            continue
        ts = targets(m.group("t") or "", kind) or targets(low[m.end():], kind) or targets(re.sub(r"\branks? in [a-z]+\b", "ranks", low[:m.start()]), kind)  # (`… with a wild die when rolling any toxin test`; `on a Judge Intentions test … replace one of the dice with a Wild Die`; `your ranks in Con` names no test)
        emit(ts or ([("test:combat", None)] if kind == "weapons" else [("skill:firearms", None)] if kind == "ammotypes" else []), "wild-die", "1")  # (`rEVO rounds use the wild die`: the shots fired with them)

    # rule changes the vocabulary has a word for since the review of 2026-10-18 (shown, never applied): the attribute adept drain is resisted with
    # (`resist adept drain with Logic instead of Willpower`), the wound penalty (`ignore one die of wound penalties`, `the negative modifiers from damage
    # move one box farther down the Condition Monitor`)
    for m in re.finditer(r"\bresist(?:s)? adept drain with (?P<a>[a-z ]+?) instead of\b", low):
        a_ = m.group("a")
        v_ = "choice" if re.search(r"\bany (?:physical )?attribute\b", a_) else "tradition" if "tradition" in a_ else ATTRIBUTES.get(a_.strip())
        if v_:
            out.append(_fx("derived:adept-drain-attribute", "set", v_, sw, when))
    for m in re.finditer(r"\bignore (?:one|a|1) die of (?:the )?wound (?:penalt\w+|modifiers?)", low):
        out.append(_fx("derived:wound-penalty", "add", "-1", sw, when))
    if re.search(r"\b(?:negative )?(?:modifiers?|penalt\w+) from damage (?:move|start|begin) (?:one|a|1) box farther down the condition monitor\b", low):
        return [_fx("derived:wound-threshold", "add", "R", sw, when)]  # (Pain Resistance: `at level 1 … until 4 boxes are filled, rather than 3`: the boxes are no monitor boxes)
    # initiative dice and score
    for m in re.finditer(r"\bwith (?P<s>\d+)\s?d6 (?:matrix )?initiative di(?:c)?e\b", low):
        out.append(_fx("derived:matrix-initiative-dice" if matrix_init else "derived:initiative-dice", "set", m.group("s"), sw, when))  # (`base initiative is Reaction + Pilot, with 4D6 Initiative Dice`: the dice it has)
    for m in re.finditer(r"(?:(?P<sa>[+-])\s?(?P<a>\d+)\s?d6 (?:to )?(?:your )?(?:matrix )?initiative|"
                         r"(?<![\w+-])(?!(?<=\bwith )\d+\s?d6)(?P<b>\d+|an?|one|two|three|four|five|its rating in|its rating as)(?:\s?d6)?\s+(?:additional |extra |bonus )?(?:matrix )?initiative di(?:c)?e|"
                         r"\+\s?(?P<c>\d+)\s+initiative di(?:c)?e|initiative di(?:c)?e(?: [^.]{0,40})? by (?P<d>\d+|its rating|one|two)|"
                         r"adds? (?P<e>\d+|an?|one)\s*d6 (?:to )?initiative)", low):
        if re.search(r"\b(?:up to|maximum of|max(?:imum)? of|more than|at most)\s*(?:a |the |normal )*(?:maximum of )?$", low[:m.start()]):
            continue  # (`up to a maximum of five initiative dice`: a cap)
        raw = next(g for g in (m.group("a"), m.group("b"), m.group("c"), m.group("d"), m.group("e")) if g)
        v = "R" if "rating" in raw else _val(raw, low)
        if m.group("sa") == "-" or m.group("b") and re.search(r"\b(?:remov|los|subtract)\w*\s+$", low[:m.start()]):
            v = "-" + v.lstrip("-")  # (`-1D6 Initiative Dice`, `removes one Initiative Die`: one fewer)
        out.append(_fx("derived:matrix-initiative-dice" if matrix_init else "derived:initiative-dice", "add", v, sw, when))
    for m in re.finditer(r"\+\s?(?P<v>\d+) (?:to )?(?:your |the )?(?P<mx>matrix )?initiative(?! di)(?: score)?\b|"
                         r"(?:matrix )?init(?:iative)? bonus of \+?(?P<w>\d+)", low):
        v = _val(m.group("v") or m.group("w"), low)
        out.append(_fx("derived:matrix-initiative" if (m.group("mx") or matrix_init) else "derived:initiative",
                       "add", v, sw, when))

    # condition monitor boxes, Minor and Major Actions, Hardened Armor, Overwatch, movement
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three|an additional|one additional|\+\d+)\s+(?:additional |extra |bonus )?boxe?s?\b(?! (?:farther|further) down| of damage)"
                         r"(?P<t>[^.;]{0,60}?)(?P<which>physical|stun|condition)? ?(?:condition )?monitor", low):
        if _negated(low, m.start()):
            continue  # (`nor do they add a Condition Monitor box`)
        which = "stun" if "stun" in m.group(0) else "matrix" if "matrix" in m.group(0) else "physical"
        v = _val(m.group("v").replace("additional", "").strip(), low)
        out.append(_fx(f"derived:{which}-monitor", "add", v, sw, when))
    for m in re.finditer(r"\+\s?(?P<v>\d+) (?P<w>physical|stun) (?:condition monitor )?boxes", low):
        out.append(_fx(f"derived:{m.group('w')}-monitor", "add", m.group("v"), sw, when))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:additional|extra|bonus|free|more)\s+(?:(?P<v2>\d+|one|two|three)\s+)?(?P<w>minor|major) actions?|"
                         r"\+\s?(?P<u>\d+) (?P<x>minor|major) actions?", low):
        if re.match(r"\s*(?:are |is )?(?:required|needed|to (?:reload|ready))", low[m.end():]) or \
                re.search(r"\b(?:with|for|using|(?:ex|s)pend(?:ing)?|invest(?:ing)?|requires?|takes?|costs?|by taking|must (?:also )?(?:use|spend|take))\s+$", low[:m.start()]):
            continue  # (`3 additional Major Actions required to reload`: a cost)
        if m.group("u"):
            v, w = m.group("u"), m.group("x")
        else:
            v, w = _val(m.group("v2") or m.group("v"), low), m.group("w")  # (`an additional two Minor Actions`)
        out.append(_fx(f"derived:{w}-actions", "add", v, sw, when))
    for m in re.finditer(r"\buse (?:the )?(?P<n>[^.;]*?) (?P<w>minor|major) actions? (?:an additional|one more|an extra|another) time\b", low):
        out.append(_fx(f"derived:{m.group('w')}-actions", "add", _val("1", low), sw, when or m.group("n").strip()))  # (`use the Move and Avoid Incoming Minor Actions an additional time per combat round per rating point`)
    # the rules of their own: a mode-limited Attack Rating modifier, an ammunition belt, a sense, a monthly cost, a chase
    # pool's Edge, a cost in percent, a skill's maximum, a Matrix attribute cumulative with other devices
    for m in re.finditer(r"\b(?P<dir>decreas|reduc|lower|increas|rais)\w* the (?P<modes>(?:" + FIRE_MODES + r")(?:(?:,\s*|\s+and\s+|\s+or\s+)(?:" + FIRE_MODES + r"))*) attack ratings? (?:modifiers?|penalt(?:y|ies)) by (?P<v>\d+|one|two|three)\b", low):
        v = _val(m.group("v"), low)
        sign = "" if m.group("dir") in ("decreas", "reduc", "lower") else "-"  # (a smaller penalty: a higher Attack Rating)
        out.append(_fx("item:ar", "add", sign + v, sw, when or re.sub(r"\s+and\s+|\s+or\s+", ", ", m.group("modes"))))
    for m in re.finditer(r"(?:^|[\n*•]\s*)\W*(?P<modes>(?:narrow burst|wide burst|" + FIRE_MODES + r")(?:(?:,\s*|\s+and\s+|\s+or\s+)(?:narrow burst|wide burst|" + FIRE_MODES + r"))*)\s+(?P<dir>increases?|raises?|decreases?|reduces?|lowers?)\s+(?:the )?(?:dv|damage value)\s+by\s+(?P<v>\d+|one|two|three)\b", low):
        # (`*Narrow Burst increases DV by 3`: a firing mode's own Damage Value modifier)
        v = _val(m.group("v"), low)
        out.append(_fx("item:dv", "add", v if m.group("dir").startswith(("increase", "raise")) else "-" + v, "conditional", re.sub(r"\s+and\s+|\s+or\s+", ", ", m.group("modes"))))
        low = low[:m.start()] + " " * (m.end() - m.start()) + low[m.end():]  # (read: no plain +3 beside it)
    for m in re.finditer(r"\bincreases? (?:the )?(?:dv|damage value) by \+?(?P<v>\d+|one|two|three) for (?:every|each) additional (?P<w>[a-z -]{3,30}?)(?: fired)?(?=[.;,]|\s+than\b|$)", low):
        # (`*Increase DV by +1 for every additional barrel fired`: a rate per barrel, shown with its words)
        out.append(_fx("item:dv", "add", _val(m.group("v"), low), "conditional", f"per additional {m.group('w').strip()} fired"))
        low = low[:m.start()] + " " * (m.end() - m.start()) + low[m.end():]  # (read: no plain +1 beside it)
    for m in re.finditer(r"(?P<v>\d[\d,]*)-round (?:belt|magazine|drum|clip|cassette)", low):
        if kind in ITEM_KINDS or kind == "accessories":
            out.append(_fx("item:ammo", "set", m.group("v").replace(",", ""), sw, when))
    for m in re.finditer(r"\b(?:gains?|grants?|provides?|has|have|possess(?:es)?|receives?|confers?)\s+(?:the (?:user |character )?|an? |its users? )?(?:ability of )?(?P<s>" + "|".join(sorted(SENSES, key=len, reverse=True)) + r")\b", low):
        if not _negated(low, m.start()) and not re.search(r"\b(?:persons?|those|people|anyone|characters) with\s*$", low[:m.start()]):
            out.append(_fx(f"sense:{SENSES[m.group('s')]}", "add", "1", sw, when))
    for m in re.finditer(r"\b(?:pays?|costs?|spend|donates?|gives?)\s+(?:at least )?\(?(?:an additional |an extra )?(?:(?:quality|the quality's|its|their) )?(?P<r>level|rating)?\s*(?:x|×|times)?\s*(?P<v>\d[\d,]*)\s*(?:nuyen|¥)?\)?(?:\s+per (?:level|rating)(?: of this \w+)?)?\s+(?:per|a|each|every) month|"
                         r"\blifestyle costs? (?:increases?|is increased|rises?) by (?P<w>\d[\d,]*) nuyen (?:per|a|each) month", low):
        v = (m.group("v") or m.group("w")).replace(",", "")
        out.append(_fx("derived:monthly-cost", "add", f"R*{v}" if m.group("r") else _rated(low, v), sw, when))
    for m in re.finditer(r"\bchase pool\b[^;]*?(?:begins|starts) with (?P<v>\d+|one|two|three) edge", low):
        out.append(_fx("pool:chase", "add", _val(m.group("v"), low)))  # (`when your chase pool becomes available`: the pool, not a condition)
    if re.search(r"\b(?:chase|race)s?\b", low) and (m := re.search(r"\bgain (?:a point of |an? |one |\d+ )?edge at the (?:start|beginning) of (?:every|each) (?:combat )?round", low)):
        out.append(_fx("pool:chase", "add", _val("1", low), sw, when or "at the start of every round"))
    for m in re.finditer(r"\b(?:increas\w*|rais\w*) the (?:cost|price)s? of (?:all |any |their |your )?(?P<t>armor|clothing|lifestyles?|gear|everything|all (?:items|gear))(?: and (?:clothing|armor|gear))? by (?P<v>[a-z-]+|\d+) percent|"
                         r"\b(?P<v2>[a-z-]+|\d+) percent (?:boost|increase|rise) in (?:the )?(?P<t2>lifestyle|armor|gear) costs?|"
                         r"\bincreas\w* (?:the )?(?P<t3>lifestyle|armor|gear) costs? by (?P<v3>[a-z-]+|\d+) percent|"
                         r"\b(?P<t4>clothing|armor|gear)\b[^.;]*?\bcost increase of (?P<v4>[a-z-]+|\d+) percent", low):
        t = next(g for g in (m.group("t"), m.group("t2"), m.group("t3"), m.group("t4")) if g)
        v = number(next(g for g in (m.group("v"), m.group("v2"), m.group("v3"), m.group("v4")) if g))
        if v:
            t = {"clothing": "armor", "lifestyles": "lifestyle", "all items": "everything", "all gear": "everything"}.get(t, t)
            out.append(_fx(f"pricemod:{t}", "add", str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
    for m in re.finditer(r"\blifestyle costs? (?:are |is )?(?:lowered|reduced|decreased) by (?P<l>[a-z-]+|\d+) percent|"
                         r"\b(?:armor and clothing|clothing and armor|armor|clothing)\b[^.;]*?\bpurchased at an? (?P<a>[a-z-]+|\d+) percent (?:increase|boost) to the base cost|"
                         r"\bincrease the cost of any fitted gear\b(?: \([^)]*\))? by (?P<f>[a-z-]+|\d+) percent per level", low):
        # (a price in percent, written as the book words it: `Lifestyle costs are lowered by fifteen percent`, `specially designed … at a fifty
        # percent increase to the base cost`, `fitted gear … ten percent per level`; Body Shop p. 104, Companion pp. 123, 126)
        if m.group("l") and (v := number(m.group("l"))):
            out.append(_fx("pricemod:lifestyle", "add", "-" + str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
        elif m.group("a") and (v := number(m.group("a"))):
            out.append(_fx("pricemod:armor", "add", str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
        elif m.group("f") and (v := number(m.group("f"))):
            out.append(_fx("pricemod:armor", "add", "R*" + str(int(v) / 100).rstrip("0").rstrip("."), sw, when))
    # prices as other sentences word them (effects review 2026-10-18): `pays ten percent extra for any worn or fitted clothing`, `Prices for all worn gear, including armor,
    # are increased by ten percent`, `fitted gear costs five percent more per additional cyberlimb`, `reduce the host's Lifestyle cost by ten percent`
    for m in re.finditer(r"\bpays? (?P<a>[a-z-]+|\d+) percent (?:extra|more) for any (?:worn|fitted)(?: or (?:worn|fitted))? (?:clothing|gear|armor)|"
                         r"\bprices? for all (?:worn|fitted)(?: or (?:worn|fitted))? (?:gear|clothing)[^.;]*? (?:are|is) increased by (?P<b>[a-z-]+|\d+) percent|"
                         r"\b(?:worn|fitted) gear costs (?P<c>[a-z-]+|\d+) percent more(?: per additional (?P<u>[a-z]+))?|"
                         r"\breduce the host's lifestyle costs? by (?P<d>[a-z-]+|\d+) percent", low):
        pct = lambda w: str(int(number(w)) / 100).rstrip("0").rstrip(".") if number(w) else None  # noqa: E731
        if (m.group("a") or m.group("b")) and pct(m.group("a") or m.group("b")):
            out.append(_fx("pricemod:armor", "add", pct(m.group("a") or m.group("b")), sw, when))
        elif m.group("c") and pct(m.group("c")):
            out.append(_fx("pricemod:gear", "add", pct(m.group("c")), "conditional", "fitted gear" + (f", per additional {m.group('u')}" if m.group("u") else "")))
        elif m.group("d") and pct(m.group("d")):
            out.append(_fx("pricemod:lifestyle", "add", "-" + pct(m.group("d")), sw or "conditional", when or "advanced lifestyle rules not used"))
    for m in re.finditer(r"\b(?:increase|raise) (?:all |your |their )?lifestyle costs? by (?P<w>\d[\d,]*) nuyen(?: per| a| each) month|\badds (?P<w2>\d[\d,]*) (?:nuyen )?per month to (?:their|your) lifestyle costs?", low):
        out.append(_fx("derived:monthly-cost", "add", (m.group("w") or m.group("w2")).replace(",", ""), sw, when))
    # a critter's table line (`Gained Powers: Armor 1, Built Tough 2, +2 to base movement rates`): the powers' numbers
    if label.casefold().startswith("gained power") or (gp := re.match(r"\W*gained powers?:?\s*", low)):
        for it in (low[gp.end():] if (gp := re.match(r"\W*gained powers?:?\s*", low)) else low).split(","):
            it = it.strip()
            if am := re.fullmatch(r"armor (\d+)", it):
                out.append(_fx("derived:defense", "add", am.group(1), sw, when))
            elif bm := re.fullmatch(r"built tough (\d+)", it):
                out.append(_fx("derived:physical-monitor", "add", bm.group(1), sw, when))
            elif mm := re.fullmatch(r"\+(\d+) to base movement rates?", it):
                out.append(_fx("derived:movement", "add", f"{mm.group(1)}/{mm.group(1)}/0", sw, when))
    for m in re.finditer(r"\bgains? (?P<v>\d+|one|two|three|four|five|six) (?:additional |extra |bonus )?(?P<w>physical|stun) condition monitor boxes?\b", low):
        out.append(_fx(f"derived:{m.group('w')}-monitor", "add", _val(m.group("v"), low), sw, when))
    for m in re.finditer(r"\badd your (?P<x>[a-z][a-z ]{2,30}?) (?:rating|level|grade|score) to (?:all |any |your |the )*(?P<t>[^.;]*)", low):
        if not re.match(r"(?:ranks? in|force|magic|resonance)\b", m.group("x")):
            for t_, sp_ in targets(m.group("t"), kind)[:2]:
                out.append(_fx(t_, "add", _slug(m.group("x")), sw, when, _spec(t_, sp_)))  # (`Add your dracogenesis rating to all flying tests`: a formula over the character's, shown)
    for m in re.finditer(r"\b(?:your |the )?skill maximum for the (?:selected|chosen) skill is (?P<v>\d+)\b|"
                         r"\bmaximum rating (?:that can be obtained |that can be reached )?(?:in|for|of) (?:a|one|any|the chosen|the selected) skill is (?:increased|raised) by (?P<w>one|two|\d+)\b", low):
        if m.group("v"):
            out.append(_fx("skill-max:choice", "set", m.group("v"), sw, when))
        else:
            out.append(_fx("skill-max:choice", "add", _val(m.group("w"), low), sw, when))
    for m in re.finditer(r"\b(?:its|the|this device's) (?P<a>firewall|data processing|sleaze|attack) attribute is cumulative with", low):
        n = re.search(r"\b" + m.group("a") + r" (\d)\b", low)
        if n:
            out.append(_fx(f"matrix:{MATRIX.get(m.group('a'), m.group('a').replace(' ', '-'))}", "add", n.group(1), sw, when))
    for m in re.finditer(r"\bwhen using (?P<n>[a-z][a-z'—–-]+(?:[ —–-](?!reduce\b)[a-z][a-z'-]+){0,3}?), reduce (?:either )?the edge cost(?: \([^)]*\))? (?:[^.;]*?\bby (?P<v>\d+|one|two))?", low):
        out.append(_fx(f"action:{_slug(m.group('n'))}", "edge-cost", "-" + _val(m.group("v") or "1", low).lstrip("-"),
                       None if (when or "").startswith("when using") else sw, None if (when or "").startswith("when using") else when))  # (the action named is the target, not a condition)
    for m in re.finditer(r"\b(?:gains?|receives?) the (?:(?P<n>[a-z][a-z' ,-]+?) )?knowledge skill(?: (?P<n2>[a-z][a-z' -]*?[a-z]))?(?=[,.;]| which| at| that| for| and|$)|"
                         r"\b(?:gains?|receives?) the (?:language )?(?P<n3>[a-z][a-z'-]+(?: [a-z][a-z'-]+)?)(?: language)? \((?P<lv>n|\d)\)(?: language)?(?: skill)?", low):
        if m.group("n3"):
            out.append(_fx("skill:language", "set", m.group("lv").upper(), sw, when, m.group("n3").title()))
        else:
            n = (m.group("n") or m.group("n2") or "").strip(" ,")
            out.append(_fx("skill:knowledge", "add", "1", sw, when, n.title() if n and n not in ("a", "an", "the", "this", "that") else None))
    if m := re.search(r"\badds? the (?:vehicle|drone)['’]s body to the attack rating(?: when (?P<w>[^,.;]+))?(?:,? one-half body if (?P<w2>[^.;]+))?", low):
        # (Shredders, Double Clutch p. 123: the vehicle's own Body, `bod`, on the item's Attack Rating when ramming; half of it against a vehicle)
        out.append(_fx("item:ar", "add", "bod", "conditional", (m.group("w") or "").strip() or None, None))
        if m.group("w2"):
            out.append(_fx("item:ar", "add", "bod/2 RU", "conditional", m.group("w2").strip()))
    # creation rules (Companion pp. 134, 138, Lofwyr's Legions p. 20): how many attributes or skills may start at their maximum, a drake's
    # Adjustment Attributes, `Gain +2 Hardened Armor`; the new targets `resource:maxed-out-attributes`, `resource:maxed-out-skills`
    # (`set`: the number allowed, 0 for `may not start with any`) and `resource:adjust-drake` (`add`)
    for m in re.finditer(r"\bup to (?P<n>\w+) (?P<w>attributes|skills) (?:at (?:their|its) maxim\w+|at rank 6)", low):
        out.append(_fx("resource:maxed-out-" + m.group("w"), "set", _val(m.group("n"), low).lstrip("+"), sw, when))
    for m in re.finditer(r"\bmay not start with any (?P<w>attributes|skills) at (?:your |their |its )?[\w’' ]*?maxim", low):
        out.append(_fx("resource:maxed-out-" + m.group("w"), "set", "0", sw, when))
    for m in re.finditer(r"\+(?P<n>\d+) to your (?:\w+ )?adjustment attributes", low):
        out.append(_fx("resource:adjust-drake", "add", m.group("n"), sw, when))
    if m := re.search(r"\bgains? \+?(\d+) hardened armor\b", low):
        out.append(_fx("derived:hardened-armor", "add", m.group(1), sw, when))
    if m := re.search(r"hardened armor(?: ability)?(?: \([^)]*\))?(?: at rating| rating| of|)\s+(\d+)", low):
        out.append(_fx("derived:hardened-armor", "add", m.group(1), sw, when))
    if m := re.search(r"\b(?:reduce (?:the )?(?:os|overwatch score)|(?:increases to the )?overwatch score (?:increases )?(?:are |is )?reduced) by (\w+)", low):
        out.append(_fx("matrix:overwatch", "add", "-" + _val(m.group(1), low).lstrip("-"), sw, when))
    for m in re.finditer(r"\b(?P<w>walking and running|walking|running|movement|flying|swimming|flight)(?: rates?| speed)? (?:by|of|to) "
                         r"\+?(?P<v>\d+/\+?\d+/\+?\d+)", low):
        w = {"flying": "flying", "flight": "flying", "swimming": "swimming"}.get(m.group("w"))
        out.append(_fx("derived:movement", "add", m.group("v").replace("+", ""), sw, ", ".join(x for x in (when, w) if x) or None))

    for m in re.finditer(r"\+?(?P<v>\d+/\+?\d+/\+?\d+)(?: per meter)? to (?:the |your |their )?(?P<w>movement|walking|running|flying|swimming)(?: rates?| speed)?\b", low):
        w = {"flying": "flying", "swimming": "swimming"}.get(m.group("w"))
        out.append(_fx("derived:movement", "add", m.group("v").replace("+", ""), sw, ", ".join(x for x in (when, w) if x) or None))
    for m in re.finditer(r"\b(?:gains?|receives?) an? essence hole of (?P<v>\d+(?:\.\d+)?)\b|\bfrees? up (?P<v2>\d+(?:\.\d+)?) essence\b", low):
        out.append(_fx("derived:essence-hole", "add", _val(m.group("v") or m.group("v2"), low), sw, when))  # (BN p. 21, SWC p. 132: per level)
    if re.search(r"temporarily increase your effective magic rating", low):
        # (a power focus, CRB p. 156: its Force added to every test where Magic is involved, the Sorcery pool among them)
        out.append(_fx("test:attr-mag", "add", "R", sw, when))
    # Essence per level or grade (Body Shop pp. 16, 169, Companion p. 146, Hack & Slash p. 129): a quality that takes Essence away at its
    # level (`attr:ess`, `-R`), an optional rule's hole by grade (`derived:essence-hole`, `R`; an AI's Spark for Neuromorphism)
    for m in re.finditer(r"\b(?:starting essence is reduced by the level|each level(?: taken)? costs? (?P<n>\w+) points? of essence)\b", low):
        n = NUMBERS.get(m.group("n"), m.group("n")) if m.group("n") else "1"
        out.append(_fx("attr:ess", "add", "-R" if n == "1" else f"-R*{n}", sw, when))
    for m in re.finditer(r"\b(?:gains?|expands?)(?: or expands?)? an essence hole\b[^.;]*?\bby (?P<v>\d+(?:\.\d+)?) essence with each (?:grade|level)\b|"
                         r"\badditional (?P<w>\d+(?:\.\d+)?) spark.s worth of codemods with each grade\b", low):
        v = m.group("v") or m.group("w")
        out.append(_fx("derived:essence-hole", "add", "R" if float(v) == 1 else f"R*{v}", sw, when))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:additional |extra |bonus )?(?:damage )?overflow box", low):
        out.append(_fx("derived:overflow", "add", _val(m.group("v"), low), sw, when))
    # a base damage value of the unarmed attack (Dermal Deposits, current printing: `Base Damage Value of [(STR/2) + 1]P`): Physical, one more
    if m := re.search(r"\bunarmed (?:combat |melee )?(?:damage|attacks?)\b[^.;]{0,30}?\bbase damage value of \[?\(?str(?:ength)?\s*/\s*2\)?\s*\+\s*(\d+)\]?\s*p\b", low):
        out.append(_fx("derived:unarmed-damage", "set", "P"))
        out.append(_fx("derived:unarmed-dv", "set", f"str/2+{m.group(1)}", sw, when))  # (a formula over Strength: shown, never applied)
    # unarmed damage made Physical (Dermal Deposits, bone lacing and bone density: CRB Hong Kong pp. 71, 286, 291)
    if (m := re.search(r"\bunarmed (?:combat |melee )?(?:damage|attacks?)\b[^.;]{0,40}?\bphysical\b", low)) and not _negated(low, m.start()) \
            and not re.search(r"\b(?:not|never|n't)\b", m.group(0)):
        out.append(_fx("derived:unarmed-damage", "set", "P", "activated" if sw == "activated" else None))  # (always: the sentence's condition is another clause's; activated stays)
    for m in re.finditer(r"(?:(?:ar|attack ratings?)[^.;]{0,40}?|^|: ?)(?P<l>(?:[+-]?\d+|-)(?:/(?:[+-]?\d+|-)){4})(?!\d)", low):
        vals = m.group("l").split("/")
        if any(v.startswith(("+", "-")) and v != "-" for v in vals):  # (a modifier per range band: `+2/–/–1/–2/–3`)
            out.append(_fx("item:ar", "add", ",".join("0" if v == "-" else v.lstrip("+") for v in vals), sw, when))
    # dice and bonuses: `+N dice (pool bonus) to X`, `a +N bonus on X`, `X +N`, `increase X by N`, `adds its rating to X`
    found = []

    def bonus(ts, v, w=None):
        for t, spec in ts:
            if t in ("item:dv", "item:ar") and re.search(r"\bresist\w* [^.;]*?\bdamage\b", low) and not re.search(r"\b(?:weapon|attack)s?\b", low):
                continue  # (`roll Body to resist 7P damage, with +1 DV per level`: damage suffered, no item's)
            if t == "item:dv" and re.search(r"\bincoming\b", low):  # (`-1 to DV on every incoming attack`: damage reduction)
                t, v = "derived:damage-reduction", (v[1:] if v.startswith("-") else "-" + v)
            if t in ("attr:edg",) and re.search(r"\bedge (?:bonus|point)|(?:bonus|situational) edge|point of edge", low):
                continue
            found.append((t, v, spec, w))
    # (`reduces incoming DV by its rating`, `reduces the Damage Value of any attack by 1 point`, `… (DV) by 2 times its rating`: the damage the wearer takes, not a weapon's DV)
    for m in re.finditer(r"\breduces? (?:all |the )?(?:incoming (?:dv|damage(?: value)?)(?: \(dv\))?|(?:dv|damage value) of (?:any|every|each|all) (?:incoming )?attacks?) by "
                         r"(?P<v>(?P<n>\d+|two|three) times its rating|\d+|one|two|three|its rating)\b", low):
        found.append(("derived:damage-reduction", f"R*{NUMBERS.get(m.group('n'), m.group('n'))}" if m.group("n") else "R" if m.group("v") == "its rating" else _val(m.group("v"), low), None, None))
        low = low[:m.start()] + " " * (m.end() - m.start()) + low[m.end():]  # (read: no item DV beside it)
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+)(?:d6)?\s*(?:(?:bonus |extra |additional )?(?:dice pool|dice|die)\s*"
                         r"(?:bonus|modifier|penalty|modifiers)?|bonus|modifier|penalty|points?)?"
                         r"(?:\s+(?:per|for each) (?:level|rating)(?: point)?(?: of [a-z ]+?)?)?(?: and [^.;]{0,25}?)?\s+(?:to|on|for|when|against)\s+"
                         r"(?:all |any |your |their |the |its |his |her |a |each )*(?P<t>(?:(?![+-]\s?\d)[^.;])*)", low):
        if re.match(r"\s?\d+\s?d6", low[m.start("v"):]):
            continue
        t = re.split(r"\b(?:up to|allowed|provided|as long as|for (?:every|each)|per|when|whenever|while)\b|\s(?:and\s+)?[+-]\s?\d+\s+(?:to|on)\b", m.group("t"))[0]  # (`+1 to DV and +2 to AR`: each its own; `for every initiative die`: a rate; `+1 to DV when defending against melee attacks`: the condition names no second target)
        # (`+2 to dice pools and +1 Edge when making Influence tests`: the tests named after the next bonus)
        # (the tests are borrowed from further on only when this one names none, `+2 to dice pools and`; `+2 to base movement rates` names
        # a thing of its own, not read here: it takes nobody else's target, Harvester)
        generic = re.fullmatch(r"\s*(?:(?:all |any )?(?:dice )?pools?|dice|tests?|rolls?)?(?:,?\s*and)?[\s,]*", t)
        ts_ = targets(" ".join(t.split()[:10]), kind)[:6] or (targets(low[m.end():], kind)[:6] if generic else [])
        if any(x[0].startswith(("skill:", "test:")) for x in ts_):
            ts_ = [x for x in ts_ if not x[0].startswith("attr:")]  # (`+1 for all Stealth tests if more than forty percent of their body`: the body is the condition's, not Body)
        bonus(ts_, _val(m.group("v"), low, m.start("v")))
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+)\s+(?:points? of |to the |to your |to )?(?P<t>(?:[a-z]+ ){0,3}[a-z]+)", low):
        if re.match(r"(?:points? of |bonus )?edge\b", m.group("t")):
            continue  # (`+1 Edge on …`: Edge on tests)
        ts = targets(re.split(r"\b(?:when|whenever|while|if)\b", m.group("t"))[0], kind)  # (`+1 to DV when defending against melee attacks`: the DV, not the defense test the condition names)
        if ts and not re.match(r"\s?\d+\s?d6", low[m.start("v"):]):
            bonus(ts[:1], _val(m.group("v"), low, m.start("v")))
    for m in re.finditer(r"(?<![a-z])(?P<t>(?:[a-z]+ ){0,2}[a-z]+)\s(?P<v>[+-]\s?\d+)\b(?!\s?(?:d6|/|%|\s?percent))", low):
        ts = targets(m.group("t"), kind)  # (`Agility +1`, `Defense Rating +2`: the target right before the number)
        if low[max(0, m.start() - 1):m.start()] == "(":
            continue  # (`Near (Magic + 2)`: a formula, not a bonus)
        if ts and not re.search(r"\b(?:tests?|rolls?|pools?|and|or|but|a|an|the|by|of|with)$", m.group("t")):
            bonus(ts[-1:], _val(m.group("v"), low))
    for m in re.finditer(r"(?<!edge )\b(?:increas|rais|boost|improv|add|enhanc)\w*\s+(?:both |all |each of )?(?:your |their |the (?:user|character|individual|wearer)'s |its |the |his |her )?"
                         r"(?P<t>(?:(?!\b(?:increas|rais|boost|add)\w*\b)[^.;]){2,90}?)\s+(?:attributes? |ratings? |values? |scores? )?by\s+(?:an? )?(?:additional |extra |further )?(?P<v>[+-]?\s?\d+|one|two|three|four|"
                         r"its rating|their rating|the rating|its force|their force|its level|the level|rating|level)\b", low):
        raw = m.group("v")
        v = "R" if re.search(r"rating|force|level", raw) else _val(raw, low)
        if re.search(r"\bmaxim", m.group("t")) or maxed and re.search(r"\bmaxim", low):
            continue
        if re.match(r"\s*(?:percent|%)", low[m.end():]):
            continue  # (`increasing the Body by 50 percent`: a percent, read below)
        rest = re.match(r"\s*(?:for|on|when making|when rolling)\s+(?:all |any |your |their )*(?P<t>[^.;]*?\btests?\b)", low[m.end():])
        own = targets(re.split(r"\s+(?:with|of|within|from|against)\s+", m.group("t"))[0], kind) or \
            ([] if re.search(r"\bthresholds?\b", m.group("t")) else targets(low[m.start():m.end()], kind))
        if rest and own and all(t.startswith("item:") for t, _ in own) and targets(rest.group("t"), kind):
            bonus(own, v, "for " + rest.group("t").strip())  # (`increases the concealability threshold by 1 for visual tests`: the item's stat, the tests are its condition)
        else:
            bonus(targets(rest.group("t"), kind) if rest and targets(rest.group("t"), kind) else own, v)
        for m2 in re.finditer(r"(?:,|\band)\s+(?:the |its |your |their )?(?P<t>[a-z][a-z' ]{1,40}?) by (?P<v>[+-]?\d+|one|two|three)\b",
                              low[m.end():]):
            v2 = _val(m2.group("v"), low)
            if re.match(r"(?:decreas|reduc|lower)\w*\b", m2.group("t")):  # (`… and decreases your Intuition by 1`)
                v2 = "-" + v2.lstrip("-")
            bonus(targets(re.sub(r"^(?:\w+s )?(?:your |their |the |its )", "", m2.group("t")), kind), v2)
    for m in re.finditer(r"\b(?:adds?|adding|gives?|provides?|grants?|gains?|receives?)\s+(?:its|their|the item's|(?P<own>the(?: [a-z-]+){1,4}'s)|the) (?:rating|force|level)"
                         r"(?: in (?:bonus |additional )?dice| as (?:a |extra |bonus )?(?:dice pool (?:bonus|modifier)|dice|bonus|modifier|extra \w+)|"
                         r" as (?:a )?(?:dice pool )?(?:bonus|modifier))?\s+(?:to|on|for|when)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        if m.group("own") and name and not (set(re.findall(r"[a-z]{4,}", m.group("own"))) - {"item", "device", "system", "implant", "unit", "module", "program", "ware", "gear"}) & set(re.findall(r"[a-z]{4,}", name.casefold())) \
                and not re.search(r"\b(?:item|device|system|implant|unit|module|program|ware|gear)'s$", m.group("own")):
            continue  # (`Add the false front's rating …` in another item's text, the drug that goes with it: the named item's, not this one's)
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\badds? the (?:rating|force|level) of (?:the |this |these |its )?[a-z' -]{0,40}? to (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:4], "R")
    # a spell's or complex form's per hit (`net hits are added to the subject's Defense Rating`, `each net hit increases
    # the target's Overwatch Score by 1`): `hits`, shown, never applied
    for m in re.finditer(r"\b(?:net )?hits\b(?: on the [a-z ]+ test)? (?:are|is) added to (?:the (?:subject|target|caster|character)'s |your |their )?(?P<t>[^.;]*)|"
                         r"\b(?:each|every|per) (?:net )?hit (?:temporarily )?(?P<dir>increases?|adds?|raises?|boosts?|reduces?|decreases?|lowers?) (?:the (?:subject|target|caster|character)'s |your |their |the )?(?P<t2>[a-z ()' -]{2,40}?) by (?P<v>\d+|one|two)\b", low):
        if m.group("t2") and re.search(r"\bnoise\b", m.group("t2")):
            continue  # (a noise rating: no target of ours)
        for t, spec in targets(m.group("t") or m.group("t2"), kind)[:3]:
            sign = "-" if m.group("dir") and m.group("dir").startswith(("reduc", "decreas", "lower")) else ""
            found.append((t, sign + "hits", spec, None))
    for m in re.finditer(r"\badds? (?P<v>a|one|two|\d+) (?:point|box)s? to (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        if _negated(low, m.start()):
            continue
        bonus(targets(m.group("t"), kind)[:2], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:each|every|per) (?:level|rating)(?: of [a-z ]+?)? adds (?P<v>\d+|one|two|three) (?P<t>[a-z]{2,20}(?: [a-z]{2,20})?)\b", low):
        bonus(targets(m.group("t"), kind)[:1], _val(m.group("v"), low))  # (`Each level adds 2 CF`: the item's cargo, per level)
    for m in re.finditer(r"\b(?:gear )?bonus of (?P<v>[+-]\s?\d+) dice (?:to|on|for) (?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low, m.start("v")))  # (`a gear bonus of +2 dice to vehicle tests`, Pilot-By-Wire)
    for m in re.finditer(r"\b(?P<t>social (?:encounters|interactions)\b[^.;]*?) (?:are done )?with an? (?P<v>[+-]\s?\d+) dice pool modifier", low):
        bonus([("test:social", None)], _val(m.group("v"), low, m.start("v")))  # (`First social encounters with metahumans are done with a -1 dice pool modifier`, Hairless)
    for m in re.finditer(r"(?<![\w/])(?P<v>[+-]\s?\d+) (?:increase|boost|bonus) (?:to|in) (?:your |their |the |its )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind)[:4], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:add|gain|receive|get)s?\s+(?:a number of )?dice equal to (?:its|their|the|your) (?P<x>[a-z][a-z ]{2,25}?)\s+"
                         r"(?:to|on|for)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        x = m.group("x")  # (`its rating`: R; `your Initiate Grade`: a formula over a value of the character's, shown)
        bonus(targets(m.group("t"), kind), "R" if re.search(r"\b(?:rating|force|level)$", x) else _slug(x))
    for m in re.finditer(r"\b(?:bonus|equal to (?:its|their) (?:rating|force|level)) (?:to|on) (?:your |their |the )?(?P<t>[^.;]*?)"
                         r"\s*(?:equal to (?:its|their) (?:rating|force|level))?$", low):
        if re.search(r"equal to (?:its|their) (?:rating|force|level)", m.group(0)):
            bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\b(?:gain|receive|get|add|grant)s?\s+(?:a |an |one |(?P<v>\d+|two|three|four) )?(?:additional |extra |bonus )+"
                         r"(?:dice|die)(?:\s+per (?:level|rating)(?: point)?)?\s+(?:to|on|for|when)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*)", low):
        # (a data structure adds its level in bonus dice, Hack & Slash p. 70: `Gain bonus dice on …` is its level)
        ts_ = targets(m.group("t"), kind)
        if not ts_ and kind == "datastructures" and (sm := re.match(r"a test to (?P<a>[a-z]+)(?: or (?P<b>[a-z]+))? an? (?:matching )?sprite", m.group("t"))):
            ts_ = [(f"action:{x}-sprite", None) for x in (sm.group("a"), sm.group("b")) if x]  # (`a test to compile or register a sprite`: those actions)
        bonus(ts_, "R" if kind == "datastructures" and not m.group("v") and " bonus dice " in m.group(0) else _val(m.group("v") or "1", low))
    for m in re.finditer(r"\b(?:grants?|gives?|provides?) (?P<v>one|two|three|an?|\d+) (?P<t>(?:[a-z-]+ ){1,3})(?:dice|die)\b", low):
        bonus([x for x in targets(m.group("t") + "dice", kind) if x[0].startswith("test:")], _val(m.group("v"), low))
    for m in re.finditer(r"(?:^|[.;]\s*)(?P<t>(?:[a-z-]+ ){0,3}(?:tests?|rolls?|checks?)\b[^.;,]*?)\s+gains?\s+(?:an? )?\+?(?P<v>\d+)\s+(?:bonus |extra |additional )?(?:dice pool bonus|dice pool modifier|dice|die)\b", low):
        # (`Perception tests made in your Territory gain +2 dice`: the tests first, then the bonus they gain; no test named but tests: every one)
        bonus(targets(m.group("t"), kind) or ([("test:all", None)] if re.match(r"(?:all |any )?(?:tests?|rolls?|checks?)\b", m.group("t")) else []), _val(m.group("v"), low))
    for m in re.finditer(r"\badds? (?P<v>one|two|three|an?|\d+) (?:die|dice) (?:to|on|for) (?:all |any |your |their |the )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:gain|add|grant|provide)s?\s+\+?(?P<v>two|three|\d+) dice(?:, one of which (?:must be|is) a wild die)?(?:,)?\s+(?:to|on|for|when)\s+"
                         r"(?:all |any |your |their |the |its )*(?P<t>(?:(?![+-]\s?\d)[^.;])*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:counts? as|considered|treated as) (?:being )?(?P<v>one|two|three|\d+) points? higher (?:for|when) (?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), _val(m.group("v"), low))
    for m in re.finditer(r"\bgain (?:its|their|the) rating as (?:extra|additional) (?P<a>" + _ATTR_RX + r") when (?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind) or [(f"attr:{ATTRIBUTES[m.group('a')]}", None)], "R")
    for m in re.finditer(r"\b(?:defense rating|dr) bonus equal to (?:its|their) rating|bonus equal to (?:its|their) rating to (?:your |the )?defense rating", low):
        bonus([("derived:defense", None)], "R")
    for m in re.finditer(r"\b(?:an? |its |their )?(?P<t>[a-z ]{2,30}?) (?P<n>attribute |rating )?equal to (?:its|their|the item's) (?:[a-z-]+ ){0,3}?rating\b", low):
        bonus((targets(m.group("t"), kind) or targets(m.group("t") + " " + (m.group("n") or ""), kind))[-1:], "R")
    for m in re.finditer(r"\bdice pool bonus (?:for|to|on) (?:all |any |your )*(?P<t>[^.;]*?) equal to (?:this [a-z]+'s|its|their|the) (?:level|rating|force)\b", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"\bbonus equal to (?:its|their) (?:rating|force|level) (?:on|to|for) (?:all |any |your )*(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three)\s+(?:extra|additional|more) boxe?s? of (?:damage )?overflow", low):
        bonus([("derived:overflow", None)], _val(m.group("v"), low))
    for m in re.finditer(r"(?P<v>\d+|an?|one|two|three) less (?P<w>(?:damage )?overflow|stun|physical)(?: condition monitor)? box", low):
        w = {"stun": "derived:stun-monitor", "physical": "derived:physical-monitor"}.get(m.group("w"), "derived:overflow")
        bonus([(w, None)], "-" + _val(m.group("v"), low).lstrip("-"))
    for m in re.finditer(r"\ba number of (?:additional |extra )?boxes on your (?P<w>physical|stun) condition monitor equal to the (?:rank|level|rating)", low):
        bonus([(f"derived:{m.group('w')}-monitor", None)], "R")
    for m in re.finditer(r"(?P<t>[a-z][a-z' ]{2,40}?) (?:is|are) (?:always |permanently |also )?(?:increased|raised|boosted|improved) by (?:the |its |their )?(?:(?:this |the )?(?:quality|power|echo|augmentation|implant|mod|codemod|focus|item)'s )?(?P<v>rating|level|force|[+-]?\d+|one|two|" + _ATTR_RX + r")", low):
        if re.search(r"\bcosts?\b", low[max(0, m.start() - 60):m.end()]):
            continue  # (`the cost of Edge actions … are increased by one`: an Edge cost, read above)
        if maxed and re.search(r"\b(?:maxim|limit)", low):
            continue  # (`Your racial limit for Charisma and Willpower are increased by 1`: the maxima, read above)
        if re.search(r"\bpercent\b", low[m.end():m.end() + 12]):
            continue  # (`is increased by 20 percent`: read as a percent above)
        v = "R" if m.group("v") in ("rating", "level", "force") else ATTRIBUTES.get(m.group("v")) or _val(m.group("v"), low)
        bonus(targets(re.sub(r"^(?:and|or|but)\s+", "", m.group("t")), kind)[-1:], v)  # (`…, and their Social Rating is increased by their Magic`)
    for m in re.finditer(r"(?P<t>[a-z][a-z' ]{2,40}?) (?:increases?|rises?|goes up) by (?P<v>[+-]?\d+|one|two|three)\b", low):
        if not re.search(r"\bcosts?\b", m.group("t")):
            bonus(targets(m.group("t"), kind)[-1:], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:each|every|per) (?:rating(?: point)?|level)\b[^.;]*?\b(?:increases?|improves?|raises?) (?:your |the |its |their )?(?P<t>[^.;]*)", low):
        if not re.search(r"\bby\b", m.group("t")) and not re.match(r"\s*(?:adds?|gives?|grants?|provides?)\b", m.group("t")):
            bonus(targets(m.group("t"), kind)[:1], "R")
    for m in re.finditer(r"\b(?:attack rating|ar) (?:bonus )?increases to \+?(?P<v>\d+)", low):
        found.append(("item:ar", m.group("v"), None, None))
    for m in re.finditer(r"\badds? (?P<v>\d+|one|two) to the rating of (?:a|one|any) skill", low):
        found.append(("skill:choice", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\b(?:its|their|the [\w' -]{2,40}?'s?) (?:rating|force|level) is added to (?:your |their |the )?(?P<t>[^.;]*)", low):
        bonus(targets(m.group("t"), kind), "R")
    for m in re.finditer(r"(?P<t>[a-z][a-z ]{2,30}?) (?:receives?|gets?|gains?) (?:an? )?(?:ongoing |permanent )?(?:boost|bonus|increase) "
                         r"equal to (?:the|its|their) (?:level|rating|force)", low):
        bonus(targets(m.group("t"), kind)[-1:], "R")
    for m in re.finditer(r"(?P<v>[+-]\s?\d+) lp modifier (?:to|toward|towards|on|applied to) (?:their |your |the )?(?P<w>necessities|comforts|security|neighborhood|entertainment)", low):
        found.append((f"lifestyle:{m.group('w')}", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"(?P<v>\d+|one|two|three|an?) (?:levels?|points?) of (?:natural )?armor\b", low):
        if kind not in VEHICLE_KINDS:
            bonus([("derived:defense", None)], _val(m.group("v"), low))
    for m in re.finditer(r"\b(?:increase|decrease|reduce|lower|raise)s? (?:the )?(?P<t>(?:close|near|medium|far|extreme)(?:(?:,\s*|\s+and\s+|\s+|,\s*and\s+)(?:close|near|medium|far|extreme))*) "
                         r"attack ratings? by (?P<v>\d+)", low):
        bands = ("close", "near", "medium", "far", "extreme")
        sign = "-" if re.match(r"\s*(?:decrease|reduce|lower)", m.group(0)) else ""
        v = ",".join(sign + m.group("v") if b in m.group("t") else "0" for b in bands)
        found.append(("item:ar", v, None, None))
    for m in re.finditer(r"\battack ratings? (?:for|at|in) (?:the )?(?P<t>(?:close|near|medium|far|extreme)(?:(?:,\s*|\s+and\s+|,\s*and\s+|\s+or\s+)(?:close|near|medium|far|extreme))*)"
                         r"(?: ranges?)? (?:are |is )?(?P<dir>increased|raised|decreased|reduced|lowered) by (?P<v>\d+)", low):
        bands = ("close", "near", "medium", "far", "extreme")
        sign = "-" if m.group("dir") in ("decreased", "reduced", "lowered") else ""
        found.append(("item:ar", ",".join(sign + m.group("v") if b in m.group("t") else "0" for b in bands), None, None))
    for m in re.finditer(r"\b(?:decrease|reduce|lower)s?\s+(?:the |its |your )?(?!(?:all )?incoming)(?P<t>[a-z ]{2,40}?)\s+by\s+(?P<v>\d+|one|two|three)\b(?!\s*(?:percent|%))", low):
        ts = targets(m.group("t"), kind)
        for t, spec in ts:
            if t.startswith(("item:", "derived:", "attr:", "matrix:")):
                found.append((t, "-" + _val(m.group("v"), low).lstrip("-"), spec, None))
    for m in re.finditer(r"\b(?:subtracts?|reduces?|lowers?|decreases?) (?:its rating|the [a-z' -]{2,40}? rating|(?P<v>\d+|one|two|three)) from the thresholds?"
                         r"(?: of (?:all |any )?(?P<t>[^.;]*))?|"
                         r"\b(?:reduces?|lowers?|decreases?) the thresholds? (?:of|for) (?:all |any )?(?P<t2>[^.;]*?) by (?:its rating|(?P<v2>\d+|one|two|three))", low):
        v = _val(m.group("v") or m.group("v2"), low) if (m.group("v") or m.group("v2")) else "R"
        # (`When making jumping tests … subtract the hydraulic jacks rating from the threshold`: the tests named before)
        before = re.search(r"\b(?:when|while) (?:making|rolling|attempting) (?P<t>[^.;(]*?\btests?)\b", low[:m.start()])
        t = m.group("t") or m.group("t2") or (before.group("t") if before else "")
        # (the tests named are no condition; a condition after them is: `… Stealth tests while sneaking` → `while sneaking`)
        w = when
        if before and when and before.group("t") in when:
            rest = when.split(before.group("t"), 1)[1].strip(" ,")
            w = rest if _CONDITION.match(rest) else None
        for t, spec in targets(t, kind):
            out.append(_fx(t, "threshold", "-" + v.lstrip("-"), sw, w, _spec(t, spec)))
    for m in re.finditer(r"\b(?:can|may) (?:be used to )?(?:add|raise|increase) (?:to )?either (?:the )?(?P<t>[a-z]+(?:, [a-z]+)*,? or [a-z]+)\b", low):
        # (`Cyberlimbs can be used to add to either Agility, Armor, or Strength`: no amount, the item's rating; the one
        # the player picks of the attributes named)
        attrs = [ATTRIBUTES[w] for w in re.findall(r"[a-z]+", m.group("t")) if w in ATTRIBUTES]
        if len(attrs) > 1:
            out.append(_fx("attr:choice", "add", "R", sw, " or ".join(k for k, a in ATTRIBUTES.items() if a in attrs)))
    for m in re.finditer(r"\b(?:decrease|reduce|lower)s?\s+(?:the |its |your )?(?P<t>[a-z ]{2,40}?)(?: of the (?:vehicle|drone|weapon|item))?\s+by\s+(?:the |its )?(?:[a-z-]+'s )?(?:rating|level)\b|"
                         r"\bsubtracts? (?:its|their|the [a-z-]+'s) rating (?:directly )?from (?:the )?(?:base |vehicle's |item's )?(?P<t2>[a-z ]{2,40}?)(?: stat| attribute| value| rating)?(?: of the (?:vehicle|drone|weapon|item))?(?=\s+and\b|[.;,]|$)", low):
        for t, spec in targets(m.group("t") or m.group("t2"), kind):
            if t.startswith(("item:", "derived:", "attr:", "matrix:")):
                found.append((t, "-R", spec, None))
    if re.search(r"\bmoves? one point of (?:the )?off-road handling to (?:the )?on-road handling", low):
        found.append(("item:handling", "R/-R", None, None))  # (on-road up, off-road down, a point a rating: shown as printed)
    for m in re.finditer(r"\badds? (?P<v>\d+|[a-z-]+) percent (?:to|of) (?:the |its )?(?:base )?(?P<t>[a-z ]{2,30}?)(?: number| value| rating| stat)?(?=[.;,]|$)", low):
        v = number(m.group("v"))
        for t, spec in targets(m.group("t"), kind)[:1]:
            if v and t.startswith("item:"):
                found.append((t, ("R*" if re.search(r"\b(?:each|per|every) (?:rating|level)", low) else "") + f"{v}%", spec, None))  # (`adds 20 percent to the base Top Speed`: a formula, shown)
    for m in re.finditer(r"\b(?:increas|rais|boost|reduc|decreas|lower)\w*\s+(?:the |its |their |your )*(?P<t>[a-z][a-z ]{1,30}?)(?: of the (?:vehicle|drone|weapon|item))?\s+by\s+(?P<v>\d+) percent", low):
        for t, spec in targets(m.group("t"), kind)[:1]:
            if t.startswith("item:"):
                found.append((t, ("-" if re.match(r"(?:reduc|decreas|lower)", m.group(0)) else "") + ("R*" if re.search(r"\b(?:each|per|every) (?:rating|level)", low) else "") + f"{m.group('v')}%", spec, None))
    if kind == "critterpowers":  # (a drake's or critter's Armor is its Defense Rating; Mystic Armor its astral one; by its Edge: a formula)
        for m in re.finditer(r"\b(?:gains?|grants?|have|has) (?P<t>mystic armor|armor) equal to (?P<half>half )?(?:(?:your|their|the|its) )?edge\b|"
                             r"\bincreas\w* (?:your |their )?(?:dracoform )?(?P<t2>armor or mystic armor|mystic armor|armor) by half (?:your|their|its) edge\b", low):
            names = (m.group("t") or m.group("t2")).split(" or ")
            for n in names:
                found.append(("derived:defense-astral" if "mystic" in n else "derived:defense", "edg/2" if m.group("t2") or m.group("half") else "edg", None, None))
    for m in re.finditer(r"\b(?:increas|rais)\w* the maximum (?:dice pool )?(?:bonus|modifier)(?: available)? (?:for|of|on|from) (?:the |a )?(?P<n>[a-z][a-z' -]{2,30}?)(?: action)?(?: \((?:see )?p\.[^)]*\))? by (?P<v>its rating|its level|the rating|\d+|one|two)\b", low):
        v = "R" if "rating" in m.group("v") or "level" in m.group("v") else _val(m.group("v"), low)
        out.append(_fx(f"action-max:{_slug(m.group('n'))}", "add", v, sw, when))
    for m in re.finditer(r"\b(?:gains?|receives?|gets?) (?P<v>an?|one|two|three|\d+) (?:additional |extra |bonus )?power points?\b", low):
        found.append(("derived:power-points", _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\b(?:the )?(?P<t>[a-z]+(?: [a-z]+)?) (?P<k>attribute|skill) at (?:rating )?(?P<v>\d+)\b", low):
        for t, _ in targets(m.group("t") + (" attribute" if m.group("k") == "attribute" else ""), kind)[-1:]:
            if t.startswith(("attr:", "skill:")):
                out.append(_fx(t, "set", m.group("v"), sw, when))
    for m in re.finditer(r"\bthe rating of the (?:artificial |chosen |selected )?skill (?:equals|is equal to|is) (?:the|its) [a-z ]{0,30}?rating\b", low):
        out.append(_fx("skill:choice", "set", "R", sw, when))
    for m in re.finditer(r"\b(?P<t>(?:" + _ATTR_RX + r")(?:,? (?:and|or) (?:" + _ATTR_RX + r"))+) (?:are|is) (?:increased|raised|boosted|improved) by (?P<v>[+-]?\d+|one|two|three)", low):
        for t, _ in targets(m.group("t"), kind):
            found.append((t, _val(m.group("v"), low), None, None))
    for m in re.finditer(r"\b(?:gain|receive|get|add)s?\s+a number of (?:bonus |additional |extra )?dice equal to (?:the|its|their) (?:level|rating|force)(?: of (?:this|the) [a-z]+)?"
                         r"(?:\s+(?:to|on|for)\s+(?:all |any |your |their |the |its )*(?P<t>[^.;]*))?", low):
        bonus(targets(m.group("t") or "", kind) or targets(low[:m.start()], kind), "R")
    # CL6 parity increment: the bare phrasings of the two largest families (character/roll, character/attribute); each needs
    # its number and a test or attribute from the vocabulary
    _tw = r"(?:all |any |your |their |the |its )*(?P<t>[^.;]*?\btests?\b)"
    for m in re.finditer(r"(?<![\w/+-])(?P<v>\d+|one|two|three|four)\s+(?:(?:bonus|extra|additional|situational)\s+)*(?:dice|die)(?: pool)?(?: bonus| modifier)?\s+(?:for|to|on)\s+" + _tw, low):
        if not _negated(low, m.start()) and not _LOSS.search(low[:m.start()]) and not _PER_LEVEL.search(low) and not re.search(r"\b(?:up to|maximum|max|only|at most)\s*$", low[:m.start()]) and \
                not (re.search(r"\b(?:roll\w*|with|of)\s+$", low[:m.start()]) and not re.search(r"bonus|extra|additional", m.group(0))):  # (`roll 6 dice for the test`: a pool, no bonus)
            bonus([x for x in targets(m.group("t"), kind) if x[0].startswith(("skill:", "test:"))][:4], NUMBERS.get(m.group("v"), m.group("v")))
    for m in re.finditer(r"(?<![\w/+-])(?P<v>\d+|one|two|three)\s+(?:(?:bonus|extra|additional|situational)\s+)*edge(?: points?)?\s+(?:for|to|on)\s+" + _tw, low):
        if not _negated(low, m.start()) and not _LOSS.search(low[:m.start()]):
            emit([x for x in targets(m.group("t"), kind) if x[0].startswith(("skill:", "test:"))][:4], "edge", _val(m.group("v"), low))
    _al = rf"(?P<t>(?:{_ATTR_RX})(?:(?:,\s*|,?\s+(?:and|or)\s+)(?:{_ATTR_RX}))*)"
    for m in re.finditer(r"\b(?:adds?|gives?|grants?|provides?|gains?|receives?)\s+(?:you |them |the (?:user|character|wearer) )?(?:a |an )?(?:bonus of )?(?P<v>\d+|one|two|three)\s+(?:points? )?to\s+(?:your |their |the (?:user's|character's|wearer's) )?" + _al + r"\b(?! (?:dice|tests?|rolls?)\b)", low):
        if not _negated(low, m.start()) and not re.search(r"\b(?:maxim|limit)", low[m.start():m.end() + 20]):
            for t, _ in targets(m.group("t"), kind):
                found.append((t, _val(m.group("v"), low), None, None))
    for m in re.finditer(r"(?:^|[.;:,]\s*|\bthe |\byour |\btheir )" + _al + r"(?: attributes?)?\s+by\s+(?P<v>[+]?\d+|one|two|three)\b(?!\s*(?:percent|%))", low):
        if not maxed and not re.search(r"\b(?:maxim|limit|decreas|reduc|lower)", low[max(0, m.start() - 40):m.end()]):
            for t, _ in targets(m.group("t"), kind):
                found.append((t, _val(m.group("v"), low), None, None))
    # (`Increase the close and near attack ratings by 2`: the bands named, not also the plain `increase … by 2`)
    # (`defense tests against astral attacks`: that pool, not also every defense test of the same number)
    pools = {v for t, v, _, _ in found if t.startswith("test:defense-")}
    found = [x for x in found if not (x[0] == "test:defense" and x[1] in pools)]
    banded = {b for t, v, _, _ in found if t == "item:ar" and v and "," in v for b in v.split(",")}
    found = [x for x in found if not (x[0] == "item:ar" and x[1] and "," not in x[1] and x[1] in banded)]
    for t, v, spec, w in found:
        if v is None:
            continue
        if matrix_init and t in ("derived:initiative", "derived:initiative-dice"):
            t = t.replace("derived:", "derived:matrix-")  # (an AI's, or in VR: Matrix initiative)
        if t == "item:ar" and v and re.fullmatch(r"-?\d+", v) and (bm := next((x for x in re.finditer(
                r"(?<![\w/])\+?(-?\d+)\s+(?:ar|attack ratings?)\s+(?:at|in|for)\s+(close|near|medium|far|extreme)(?: ranges?)?"
                r"(?P<more> only| and (?:beyond|farther|further)| or (?:farther|further)| or closer| and closer)?\b", low) if x.group(1) == v), None)):
            i = _BANDS.index(bm.group(2))  # (`+2 AR at Close range only`: that band, the number's own clause; `Medium and beyond`, `Near or closer`)
            more = (bm.group("more") or "").strip()
            on = range(i, len(_BANDS)) if more.endswith(("beyond", "farther", "further")) else range(0, i + 1) if more.endswith("closer") else [i]
            v = ",".join(v if k in on else "0" for k in range(len(_BANDS)))
        if t in ("item:ar", "item:dv", "item:concealability") and not (w or when) and (sc := _ITEM_SCOPE.search(low)):
            # (`+1 AR for all linked smartgun weapons`, `increase their AR by 1 on thrown weapons`: the weapons or fire it is for)
            w, sw = " ".join(re.split(r"\s+(?:by|per)\s+", sc.group("q") or sc.group("q2"))[0].split()[:10]), "conditional"
        out.append(_fx(t, "add", v, sw, w or when, _spec(t, spec)))
    return out
