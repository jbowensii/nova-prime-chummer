"""The effects reader's emit stage: apply() writes every entry's effects and links, copy_links() copies linked ones."""
import re

from .words import ADDON_STATS, ITEM_KINDS, SENSES, SKILLS, SOFT_TYPES, STANDARD_ADDONS, _key, _norm, _slug, _unesc, sentences
from .values import _BANDS, _armor_performance, _fx, _source_ids, targets
from .reader import read
from .citations import addon_links, incompatibilities, links, see_links, tire_links
from .tables import less_accessory, table
from .entries import ENTRY, SKIP_KINDS, SOFTS, _DROP, _KEEP, _VARIANT, _block_tables, _block_text, _label, _own_part, _resolve_variant, _runins, _sections, _tables, _variant_part, _variant_sentences, rating_table, section_effects, split_entries, split_rating


def apply(files, texts_xml, regrouped="", only=None):
    """(files, texts): the catalog files (`{name: xml}`, catalog.Catalog.xml's one entry a line) with each entry's effects,
    tests and links as its text and the book's tables state them (read(), table(), links()), in place of the ones read
    before (an add-on's effects on its host, read from the host's text, stay); and the texts with a variant's own run-in
    paragraph added to its description where the book prints it under the parent's heading (`Genotype Enhancement
    (NeoElastian)`: `**NeoElastian:** …`). only: {(kind, id)} to read only these entries (the ones an override added)."""
    files = {f: split_entries(x) for f, x in files.items()}
    texts = {}
    for m in re.finditer(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', texts_xml or "", re.S):
        texts[(m.group(1), m.group(2))] = _unesc(m.group(3))
    rows = _tables(regrouped)
    by_name = {}
    for header, row in rows:
        if row and row[0]:
            by_name.setdefault(_key(re.sub(r"[*†‡]+$", "", row[0])), []).append((header, row))
    ids = {f[:-4]: set(re.findall(r'^\s*<\w+ id="([^"]+)"', x or "", re.M)) for f, x in files.items()}
    section_of, intros, block_prose = _sections(regrouped)
    block_tables = _block_tables(regrouped)
    # (an entry's name -> its id and type, per kind: the base item a variant is priced from)
    by_kind = {}
    for f, x in files.items():
        got = by_kind.setdefault(f[:-4], {})
        for m in re.finditer(r'<\w+ id="([^"]+)"([^>]*)><name>(.*?)</name>', x or ""):
            k, typ = _key(_unesc(m.group(3))), (re.search(r' type="([^"]*)"', m.group(2)) or [None, ""])[1]
            if k not in got or typ == "bioware":  # (the bioware one when a name is ware of two types: `Fangs`)
                got[k] = (m.group(1), typ)
    runins, added = _runins(regrouped), {}
    # (a rule's text naming an entry: where the book's description of an item went when it was read as a rule,
    # `Move-By-Wire (Rating 1-2)`, `Stealthlink Upgrade`, `ProCams and SmartCams`)
    rules = re.findall(r'<rule id="([^"]+)"([^>]*)><name>(.*?)</name>', files.get("rules.xml") or "")
    rule_name = {rid: _key(n) for rid, _, n in rules}
    rule_parent = {rid: (pm.group(1) if (pm := re.search(r' parent="([^"]*)"', a)) else None) for rid, a, _ in rules}

    def life_module(rid):  # (a rule printed under the book's `Life Modules`: a life module's text, no item's)
        for _ in range(8):
            if "life module" in rule_name.get(rid, ""):
                return True
            rid = rule_parent.get(rid)
        return False
    rule_texts = [(_key(n), texts.get(("rules", rid), "")) for rid, _, n in rules if not life_module(rid)]
    rule_texts = [(k, t) for k, t in rule_texts if t]
    names = {f[:-4]: [_unesc(n) for n in re.findall(r"<name>(.*?)</name>", x or "")] for f, x in files.items()}
    # (an entry's category -> its names, per kind: the entries that share a description are one category's, `Endosymbionts
    # (Gain)` of Symbiont is no sibling of `Awareness (Tactical)`, whose description holds `Gain a +1 dice pool bonus …`)
    categorised = {}
    for f, x in files.items():
        for m in re.finditer(r'<\w+ id="[^"]+"([^>]*)><name>(.*?)</name>', x or ""):
            cat = (re.search(r' category="([^"]*)"', m.group(1)) or [None, ""])[1].casefold()
            categorised.setdefault(f[:-4], {}).setdefault(cat, []).append(_unesc(m.group(2)))
    # (an item's add-ons the book prices in its text, catalog.add_ons: host id -> the add-ons' names; their effects are theirs)
    acc_of = {}
    for m in re.finditer(r'<\w+ id="[^"]+"[^>]*? accessoryOf="([^"]+)"[^>]*><name>(.*?)</name>', "".join(f for f in files.values() if f)):
        for hid in m.group(1).split():
            acc_of.setdefault(hid, []).append(_unesc(m.group(2)))
    # (the rows printed under a group header, `Awareness` over `Basic` and `Tactical`: by kind, group key -> names)
    grouped = {}
    for f, x in files.items():
        for m in re.finditer(r'<\w+ id="[^"]+"([^>]*)><name>(.*?)</name>', x or ""):
            if gm := re.search(r' group="([^"]*)"', m.group(1)):
                grouped.setdefault(f[:-4], {}).setdefault(_key(_unesc(gm.group(1))), []).append(_unesc(m.group(2)))
    out = {}
    for fname, xml in files.items():
        kind = fname[:-4]
        if kind in SKIP_KINDS or not xml:
            out[fname] = xml
            continue
        lines = []
        for ln in xml.splitlines(keepends=True):
            m = ENTRY.match(ln)
            if not m or only is not None and (kind, m.group(3)) not in only:
                lines.append(ln)
                continue
            ind, tag, eid, attrs, name, kids = m.groups()
            text = texts.get((kind, eid), "")
            nm = _unesc(name)
            variant_words = []
            if not text.strip():  # (a variant or rating row: its parent's description, the sentences about it)
                base_nm, pid = nm, None
                while not text.strip() and (vm := re.match(r"(.+?)\s*\(([^()]+)\)\s*$", base_nm)):
                    base_nm = vm.group(1)
                    pid = by_kind.get(kind, {}).get(_key(base_nm))
                    text = (texts.get((kind, pid[0]), "") if pid else "") or re.sub(r"(?<=[a-z])- (?=[a-z])", "", " ".join(block_prose.get(_key(base_nm), "").split()))  # (or the parent block's prose when it is no entry)
                if text.strip():
                    variant_words = [w for w in re.findall(r"\(([^()]+)\)", nm) if not re.match(r"(?i)(?:rating|level|force) \d", w)]
                    others = [w for n in names.get(kind, ()) if n != nm and _key(n).startswith(_key(base_nm) + " ")
                              for w in re.findall(r"\(([^()]+)\)", n) if not re.match(r"(?i)(?:rating|level|force) \d", w)]
                    text = _variant_sentences(text, variant_words, others)
            bare = lambda t: re.sub(r"\*\*[^*\n]+:\*\*[^\n]*", "", t).strip()  # (the text less its label lines: `**Treatment time:** 2 months`)
            if (pm := _VARIANT.match(nm)) and len(bare(text)) < 200:
                base, var = _key(pm.group(1)), _label(pm.group(2))  # (`Fear Response Dampener (basic)`: the label `Fear Response Dampener`)
                if var not in runins:  # (a label of the variant's words less one: `Synaptic Acceleration`)
                    vw = set(var.split())
                    var = next((k for k in runins if len(k.split()) >= 2 and set(k.split()) <= vw and len(vw - set(k.split())) <= 1), var)
                if var not in runins:
                    # (a label the book misprints, `**NDE:**` for `NDI`: the one paragraph label of the group's block that no row names,
                    # when this row is the only one of the group without its own; no alias yet, the corpus pass adds it after this)
                    mine_ = lambda k: [p for b, p in runins.get(k, ()) if b and (b in base or base in b) and len(p.split()) >= 3]
                    sibs = {_label(m.group(2)) for n in names.get(kind, ()) if (m := _VARIANT.match(n)) and _key(m.group(1)) == base}
                    free = {k for k in runins if mine_(k)} - sibs
                    if len(free) == 1 and len(sibs) >= 3 and [k for k in sibs if not mine_(k)] == [var]:  # (a group of three rows or more: two are no pattern)
                        var = free.pop()
                got = [p for b, p in runins.get(var, ()) if b and (b in base or base in b)] or \
                    ([p for _, p in runins[var]] if len(runins.get(var, ())) == 1 else [])
                got = sorted(got, key=len, reverse=True)  # (the label's line and the text's paragraph: the fuller)
                if got and got[0] not in text:
                    text = (text + "\n" + got[0]).strip()
                    added[(kind, eid)] = text
            ri = runins.get(_key(nm), ())
            if 'value="RCC"' in kids:  # (a rigger program, an override's `Encryption` for an RCC: the Rigger Programs block's line, not the deck program's)
                ri = [x for x in ri if "rigger" in x[0]] or ri
            if len(bare(text)) < 40 and "(" not in nm and len(ri) and len({b for b, _ in ri}) == 1:
                # (a row named by a run-in label of one block of the book, `Balance` under the Tail's `**Balance:** …`: that
                # paragraph is its description)
                got = sorted((p for _, p in ri), key=len, reverse=True)
                if got[0] not in text:
                    text = (text + "\n" + got[0]).strip()
                    added[(kind, eid)] = text
            armor_fx = []
            for thing in acc_of.get(eid, ()):
                text = less_accessory(text, thing)
            if kind == "weapons" and _key(nm).startswith("laser sight ") and (bm := re.search(r"only be used at ([a-z, ]+?) ranges|operates across (all) ranges", " ".join(_norm(text).replace("|", " ").split()), re.I)):
                # (a maker's laser sight, Firing Squad p. 72: the core rulebook's +1 Attack Rating, at the ranges it can be used at)
                bands = {b for b in _BANDS} if bm.group(2) else {b for b in _BANDS if b in bm.group(1).casefold()}
                armor_fx.append(_fx("item:ar", "add", ",".join("1" if b in bands else "0" for b in _BANDS)))
            if kind == "gear" and (sec := section_of.get(_key(nm))) and re.search(r' class="MOD_SKIN/MOD_ARMOR"', attrs):
                # (Foundations, Double Clutch p. 133: the section's own blocks `Acceleration` and `Top Speed` tell what each foundation's armor
                # does to them, the sentences naming this one: read here, not as text, the sentence's reverse and its numbers are no effect)
                armor_fx = [fx for stat in ("acceleration", "top speed") if section_of.get(stat) == sec
                            for sn in sentences(" ".join(block_prose.get(stat, "").split())) if (fx := _armor_performance(sn, _key(nm.replace("Armor", "")) + " armor"))]
            if kind == "gear" and nm.casefold().endswith(" focus") and (fr := [t for k, t in rule_texts if k == _key(nm[:-6]) + " foci" and t not in text]):
                text = (text + "\n" + fr[0]).strip()  # (`Power focus`: its Focus Types rule, `Power Foci`, tells what it does, CRB p. 156)
            if len(bare(text)) < 40 and kind != "rules":  # (a label line only: the rule the book describes it under)
                base = _key(re.sub(r"\s*\(.*$", "", nm))
                words = [w.rstrip("s") for w in base.split() if w not in ("system", "systems", "suite", "module", "unit", "kit", "external", "internal", "basic")] or [w.rstrip("s") for w in base.split()]
                got = sorted((len(k), t) for k, t in rule_texts if len(base) > 4 and words and
                             all(any(x.rstrip("s") == w for x in k.split()) for w in words))
                if got and got[0][1] not in text:
                    text = (text + "\n" + got[0][1]).strip()
                    added[(kind, eid)] = text  # (the rule's text is the item's description: kept with it)
                    if not variant_words:
                        variant_words = [w for w in re.findall(r"\(([^()]+)\)", nm) if not re.match(r"(?i)(?:rating|level|force) \d", w)]
            if not text.strip():  # (no description of its own: its book block's prose, a mentor spirit's `**All:** …` lines)
                text = _block_text(block_prose.get(_key(nm), ""))
            grp = (gm := re.search(r' group="([^"]*)"', attrs)) and _unesc(gm.group(1))
            if grp and "(" not in nm:  # (a row under a group header: its own run-in of the group's text, `**Basic:**`)
                text = _variant_part(text, f"{grp} ({nm})", [f"{grp} ({n})" for n in grouped.get(kind, {}).get(_key(grp), ())])
            text = _variant_part(text, nm, names.get(kind, ()))
            cat = (cm := re.search(r' category="([^"]*)"', attrs)) and cm.group(1).casefold() or ""
            text = _own_part(text, nm, categorised.get(kind, {}).get(cat, ()))
            if (nest := re.search(r"\(([^()]+)\)\)\s*$", nm)) and not re.match(r"(?i)(?:rating|level|force) \d", nest.group(1)):
                # (`Pathogen Resistance (general)` / `(specific)`, one paragraph for both: the sentences that name the other version are
                # not this one's)
                text = _variant_sentences(text, [nest.group(1)], [m.group(1) for n in names.get(kind, ()) if n != nm and n[:nest.start()] == nm[:nest.start()]
                                                                  and (m := re.search(r"\(([^()]+)\)\)\s*$", n)) and not re.match(r"(?i)(?:rating|level|force) \d", m.group(1))],
                                          label=_label(_VARIANT.match(nm).group(2)).split()[0])
            if kind == "qualities" and any(a_["rel"] == "as" and _key(a_["name"]) == _key(re.sub(r"\s*\(.*$", "", nm)) for t_, a_, _ in links(text, kind)) \
                    and (rt := next((t for k, t in rule_texts if k == _key(nm) and t not in text), None)):
                text = (text + "\n" + rt).strip()  # (the same, once the entry's own paragraph is in: `the same as the Synchronicity quality in the … path above`)
            # (two entries named alike but for `External` and `Internal`, one paragraph for both, `SmartCam External`: the sentences that name
            # the other one are not this one's)
            if " " in nm and "(" not in nm and nm.rsplit(" ", 1)[1].casefold() in ("external", "internal") and (last := {n.rsplit(" ", 1)[1] for n in names.get(kind, ()) if n != nm
                    and " " in n and "(" not in n and n.rsplit(" ", 1)[0].casefold() == nm.rsplit(" ", 1)[0].casefold() and n.rsplit(" ", 1)[1].casefold() in ("external", "internal")}):
                word = nm.rsplit(" ", 1)[1]
                # (a line at a time: a `**Wireless bonus:**` line stays whole; `An internal SmartCam does the same also grants …` keeps the sentence it repeats)
                text = "\n".join(ln if re.search(rf"\b{re.escape(word)}\b[^.]*\bdoes the same\b", ln, re.I) else _variant_sentences(ln, [word], last) for ln in text.split("\n"))
            found = read(text, kind, nm, (cl := re.search(r' class="([^"]*)"', attrs)) and cl.group(1) or "") + links(text, kind) + see_links(text, kind, nm) + addon_links(text, kind) + tire_links(text, kind)
            if sm := re.search(r"\b(?:the same (?:[a-z]+ )?(?:bonus|bonuses|effects?|results?) as|functions (?:just )?like|works (?:just )?like)"
                               r" (?:the |an? )?([a-z][a-z ]{2,30}?)(?=[,.;)]|$)", _norm(text), re.I):
                # (`The character receives the same Stealth bonuses as basic camouflage`, `This functions like the balance
                # tail`: as the sibling version named, a variant row of the same base or a row of the same run-in block)
                sw_, bk = set(_key(sm.group(1)).split()), _key(re.sub(r"\s*\(.*$", "", nm))
                sibs = [(_key(vm2.group(2)), n) for n in names.get(kind, ()) if n != nm and "(" in nm
                        and (vm2 := re.match(r"(.+?)\s*\(([^()]+)\)\s*$", n)) and _key(vm2.group(1)) == bk]
                if "(" not in nm and (blk := {b for b, _ in runins.get(_key(nm), ())}) and len(blk) == 1:
                    sibs += [(k, n) for k, v in runins.items() if k != _key(nm) and any(b in blk for b, _ in v)
                             for n in names.get(kind, ()) if _key(n) == k]
                for k, n in sibs:
                    if k in sw_ and (hit := by_kind.get(kind, {}).get(_key(n))):
                        found.append(("link", {"rel": "as", "kind": kind, "name": n, "ref": hit[0]}, None))
                        break
            if kind in ("augmentations", "adeptpowers", "qualities"):
                found += incompatibilities(text, nm)
            if variant_words:
                found = _resolve_variant(found, variant_words)
            nk = _key(re.sub(r"\s*\(.*$", "", nm))
            if kind in ("qualities", "augmentations", "gear", "critterpowers", "adeptpowers"):  # (an entry named for a sense has it)
                sense = SENSES.get(nk) or next((SENSES[_key(w)] for w in re.findall(r"\(([^()]+)\)", nm) if _key(w) in SENSES), None)
                if sense and not any(a.get("target") == f"sense:{sense}" for t, a, _ in found):
                    found.append(_fx(f"sense:{sense}", "add", "1"))
            if kind in ("gear", "programs") and nk in SOFTS and re.search(r' rating="|\brating\b', _unesc(attrs), re.I):  # (a skillsoft gives its skill at its rating)
                spec = re.search(r"\(([^()]+)\)", nm)
                found.append(_fx(SOFTS[nk], "set", "R", spec=spec.group(1) if spec and SOFTS[nk] != "skill:choice" else None))
            sec = section_of.get(_key(nm)) or section_of.get(_key(re.sub(r"\s*\(.*$", "", nm)))
            if not sec and kind in ITEM_KINDS:
                # (a table row of a section named for it, `Machine Gun Blast Shield (small)` of `Machine Gun “Blast Shields”`: the section's words all in its name)
                nw = {w.rstrip("s") for w in re.findall(r"[a-z]+", nm.casefold())}
                sec = max((n for n in intros if len({w.rstrip("s") for w in re.findall(r"[a-z]+", n.casefold())}) >= 3
                           and {w.rstrip("s") for w in re.findall(r"[a-z]+", n.casefold())} <= nw), key=len, default=None)
            if sec and intros.get(sec):
                found += [x for x in section_effects(intros[sec], text, nm, kind, sec) if x not in found]
            for v in re.findall(r'<variant name="([^"]*)"', kids):
                # (a variant an entry comes in, `Missile` for a rocket: its own table row, `Missile Variant` with its NOTES `+2 to
                # Attack Rating`, and the section's sentences about it, `Missiles are rockets that carry … sensor packages adding
                # their rating to the attack roll`, are effects when it is that variant, CRB p. 264)
                vk = _key(unesc_v := _unesc(v))
                if not vk or vk == "base":
                    continue
                said = [read(row[[x.strip().casefold() for x in header].index("notes")], kind) for header, row in by_name.get(_key(unesc_v + " variant"), [])
                        if "notes" in [x.strip().casefold() for x in header][:len(row)]]
                said += [read(s, kind) for s in sentences(intros.get(sec, ""))
                         if re.match(rf"^\W*{re.escape(vk)}s\s+(?:are|have|has|carry|get|gain|add|provide|grant|use|can|may|must)\b", s.casefold())] if sec else []
                found += [(t, {**a, "switch": "conditional", "when": f"{unesc_v}, {a['when']}" if a.get("when") else unesc_v, "rule": f"{unesc_v} variant"}, None)
                          for r in said for t, a, _ in r if t == "effect"]
            if re.search(r"\bthan the base item\b", _unesc(attrs)) and len(nm.split()) > 1:
                # (`Transgenic gills`: priced from the base item, the bioware it is the equivalent of: its effects)
                base = _key(nm.split(None, 1)[1])
                got = by_kind.get(kind, {})
                hit = got.get(base) or got.get(base.rstrip("s")) or \
                    next((v for k, v in sorted(got.items()) if k.startswith(base + " ") and v[1] == "bioware"), None)  # (`tails`: `Tail`; `chameleon skin`: its first variant)
                if not hit and (fm := re.search(r"ref\(\w+:(?:[a-z0-9]+\.)?([a-z0-9.-]+?)\s*[,)]", kids)):
                    hit = next((v for v in got.values() if v[0] == fm.group(1) or v[0].endswith("." + fm.group(1))), None)  # (the base its price formula cites: `webbed hands and feet` from `Hand and foot webbing`)
                if hit:
                    found.append(("link", {"rel": "as", "kind": kind, "name": nm.split(None, 1)[1], "ref": hit[0]}, None))
                    # (the version named for its base, `Transgenic hand and foot webbing` for `Transgenic webbed hands
                    # and feet`: a name the book's own words give it, as a search alias)
                    base_name = next((x for x in names.get(kind, ()) if got.get(_key(x), (None,))[0] == hit[0]), None)
                    if base_name and _key(f"{nm.split(None, 1)[0]} {base_name}") != _key(nm) and f"<alias>{base_name}" not in kids:
                        from xml.sax.saxutils import escape
                        kids = f"<alias>{escape(nm.split(None, 1)[0] + ' ' + base_name[:1].lower() + base_name[1:])}</alias>" + kids
                else:  # (a base printed as a group header over its versions: the version its name picks, else each)
                    gbase = _key(re.sub(r"\s*\([^()]*\)\s*$", "", nm.split(None, 1)[1]))
                    pick = _key(vm.group(1)) if (vm := re.search(r"\(([^()]+)\)\s*$", nm)) else None
                    for gn in grouped.get(kind, {}).get(gbase, ()) or grouped.get(kind, {}).get(gbase.rstrip("s"), ()):
                        if (gid := got.get(_key(gn))) and (pick is None or _key(gn) == pick):
                            found.append(("link", {"rel": "as", "kind": kind, "name": f"{gbase.title()}: {gn}", "ref": gid[0]}, None))
            own_src = ((sm_ := re.search(r' source="([^"]*)"', attrs)) and sm_.group(1) or "").lower()
            for t, a, _ in found:  # a link's entry: the book its citation names (`p. 70, SR6`), else this book's
                if t == "link":
                    sl = _slug(a["name"])
                    cited = (a.get("book") or "").lower()
                    local = a.get("kind") and sl in ids.get(a["kind"], ())
                    if cited in _source_ids() and (cited != own_src or not local):  # (a source's id, `swc`; a book's name or its first word is no id;
                        a["ref"] = f"{cited}.{sl}"  # another book's citation wins over this book's entry of the name: the Companion's `See Dermal Deposits, p. 71, SR6.` is the core rulebook's, not itself)
                    elif local:
                        a["ref"] = sl
                    a.pop("book", None)
            if kind == "programs" and (pm := re.search(r' type="([^"]*)"', _unesc(attrs))) and pm.group(1).casefold() in SOFT_TYPES:
                sk = _key(re.sub(r"\s*\(.*$", "", nm))
                if sk in SKILLS:  # (an autosoft named for a skill gives it at its rating, the section's general rule)
                    spec = re.search(r"\(([^()]+)\)", nm)
                    found.append(_fx(f"skill:{sk.replace(' ', '-')}", "set", "R", spec=spec.group(1) if spec else None))
            if kind == "weapons" and not any(t in ("effect", "link") for t, _, _ in found):
                k = _key(nm)
                std = next((a for a in STANDARD_ADDONS if k.endswith(" " + a) or k.endswith(" " + a + "s")), None)
                if std:
                    found.append(("link", {"rel": "as", "kind": "weapons", "name": std.capitalize()}, None))
            tab = by_name.get(_key(nm), [])
            based = lambda h: len(h) > 1 and h[1].strip().upper() == "BASE"  # noqa: E731
            if not tab and kind == "qualities" and (bm := re.fullmatch(r"(.+?) \(([^()]+)\)", nm)):
                # (`Ghoul (Dwarf)`: the row `Ghoul` whose BASE is Dwarf, the Companion's Infected Metatype Attributes, p. 109)
                tab = [(h, r) for h, r in by_name.get(_key(bm.group(1)), []) if based(h) and _key(r[1]) == _key(bm.group(2))]
            # (`Cyberjack (Rating 1)`: the row `Rating 1`; `Bone Lacing (Plastic)`, whose own row is its price's: the row
            # `Plastic` of the Bone Lacing table)
            if not any(table(h, r, kind) for h, r in tab) and (pm := re.search(r"\(([^()]+)\)\s*$", nm)):
                tab = tab + [(h, r) for h, r in by_name.get(_key(pm.group(1)), [])]
            if kind == "gear" and re.search(r' class="[^"]*INSTRUMENT', attrs) and (im := re.fullmatch(r"dice pool effect:\s*([+-]?\d+)\**", _norm(text.replace("**", "")).strip().casefold())) \
                    and int(im.group(1)) != 0:
                found.append(_fx("skill:con", "add", im.group(1).lstrip("+"), "conditional", "performance tests"))  # (a musical instrument's `Dice pool effect:`, Neo-Anarchist Streetpedia p. 156: on a Performance test)
            if kind in ("weapons", "ammotypes") and re.search(r' class="ammotype"', attrs) and (dm := re.search(r' dv="(\d+[PS])"', attrs)):
                found.append(_fx("item:dv", "set", dm.group(1)))  # (an ammo type printing a Damage Value of its own, not a modifier: the weapon's becomes it, Astral Ways p. 128)
            if kind == "ammotypes":  # (an ammo type's AR and DV: modifiers of the weapon it is loaded in, `–1S(e)`, `–2 to all`)
                at = dict(re.findall(r'(\w+)="([^"]*)"', attrs))
                attr_tab = [(["AR", "DV"], [_unesc(at.get("ar", "")), _unesc(at.get("dv", ""))])]
                tab = attr_tab if any(table(h_, r_, kind) for h_, r_ in attr_tab) else tab or attr_tab
                if tab is attr_tab and any(table(h_, r_, kind) for h_, r_ in attr_tab):
                    # (the stat line printed with the ammo type is its modifier: the text's own `**Ar:** +3` and a second table, the SR5 stats printed beside it,
                    # state it again or other numbers; Krime Katalog)
                    found = [x for x in found if not (x[0] == "effect" and x[1]["target"] in ("item:ar", "item:dv") and x[1]["op"] == "add")]
            for header, row in tab:
                # (a quality's row of a table by base metatype is that base's, `when` naming it: an Infected type's maxima)
                w = row[1] if based(header) and (len(tab) > 1 or kind == "qualities") else None
                for t, a, _ in table(header, row, kind):
                    found.append((t, {**a, **({"when": w} if w else {})}, None))
            for header, trows in block_tables.get(_key(nm), ()):  # (a per-rating table under the entry: `R[1,1,2,2]`)
                found += [x for x in rating_table(header, trows, kind) if x not in found]
            if kind == "programs":  # (a Matrix program's `+2 to Defense Rating` is the Matrix one, CRB p. 184: `Armor`, the hacking program)
                found = [(t, {**a, "target": "derived:matrix-defense"} if t == "effect" and a["target"] == "derived:defense" else a, x) for t, a, x in found]
            if kind in ITEM_KINDS and not any(t == "effect" for t, _, _ in found) and re.search(r"accessor", _unesc(attrs), re.I) \
                    and re.search(r"<formula\b[^>]*>[^<]*\bR\b", kids):
                # (a rated add-on named for the attribute it raises, a cyberlimb's `Armor`, a booster's `Firewall`: its
                # rating to it; not a derived value, whose name leaves score or dice open)
                ts = [t for t in targets(nm.casefold(), kind) if t[0].startswith(("attr:", "matrix:"))] \
                    or ([(ADDON_STATS[_key(nm)], None)] if _key(nm) in ADDON_STATS else [])
                found += [_fx(t, "add", "R", spec=sp) for t, sp in ts[:1]]
            if kind in ITEM_KINDS and not any(t == "effect" for t, _, _ in found) and re.search(r' category="[^"]*\bmod\b', attrs, re.I) \
                    and re.search(r' rating="[^"]*\d', attrs):
                # (a rated vehicle mod named for the stat it replaces, `Enhanced Sensors`, `Improved Pilot` (DC pp. 141-142:
                # `Sensors may have a rating from 1 to 9`): the stat becomes its rating)
                # (named for the stat itself, in the name less its notes: `Reduce Cargo Space` or `Increasing Cargo Space (CF Mod)`
                # lowers or raises it, its rating is a price cell, `1 per 2 CF`, never the stat's new value)
                head = re.sub(r"\s*\(.*$", "", nm).casefold()
                ts = [] if re.match(r"(?:reduc|increas|decreas|expand|extend|enlarg|add|remov|chang)\w*\b", head) else \
                    [t for t in targets(head, "vehicles") if t[0].startswith("item:")]
                # (Standard Armor, Double Clutch p. 133: `modifies the Armor attribute of the vehicle` one for one: added to it)
                found += [_fx(t, "add" if re.search(r"\bmodif\w* the \w+ attribute[^.]{0,40}1:1\b", text or "", re.I) else "set", "R") for t, _ in ts[:1]]
            found += armor_fx
            for t_, a_, _ in found:  # (a wireless line that brings a bonus to N adds the difference: N less the bonus of the entry's other effect on that target)
                if t_ == "effect" and a_.pop("_total", None):
                    base_ = next((y["value"] for u_, y, _ in found if u_ == "effect" and y["target"] == a_["target"] and y.get("switch") != "wireless" and re.fullmatch(r"-?\d+", y["value"])), None)
                    if base_ is not None and abs(int(a_["value"])) > abs(int(base_)):
                        a_["value"] = str(int(a_["value"]) - int(base_))
            kept = _KEEP.findall(kids)
            if only is not None:
                # (an entry an override added keeps the effects and links the override gave it, Commlink6's word; the text's add the targets
                # and links the override left)
                mine_fx, mine_ln = _FX.findall(kids), _LNK.findall(kids)
                set_ = {_attrs(x).get("target") for x in mine_fx}
                named = {(_attrs(x).get("name") or "").casefold() for x in mine_ln}
                found = [x for x in found if not (x[0] == "effect" and x[1]["target"] in set_) and not (x[0] == "link" and (x[1].get("name") or "").casefold() in named)]
                kept = kept + mine_fx + mine_ln
            kids = _DROP.sub("", kids)
            new = "".join(_tag(t, {k: str(v) for k, v in a.items()}) for t, a, _ in found)
            new = "".join(dict.fromkeys(kept + re.findall(r"<[^>]+/>", new)))
            cut = kids.find("<text>")
            kids = kids + new if cut < 0 else kids[:cut] + new + kids[cut:]
            attrs += split_rating(nm, attrs, kids, names.get(kind, ()))
            lines.append(f'{ind}<{tag} id="{eid}"{attrs}><name>{name}</name>{kids}</{tag}>{"</sr6:data>" if ln.rstrip().endswith("</sr6:data>") else ""}\n')
        out[fname] = "".join(lines)
    if added and texts_xml:
        from xml.sax.saxutils import escape
        done = set()

        def sub(m):
            t = added.get((m.group(1), m.group(2)))
            done.add((m.group(1), m.group(2)))
            return m.group(0) if t is None else f'<text of="{m.group(1)}" id="{m.group(2)}">{escape(t)}</text>'
        texts_xml = re.sub(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', sub, texts_xml, flags=re.S)
        # (a row with no text of its own given one, a variant's run-in or its rule: a new element)
        new = "".join(f'  <text of="{k}" id="{i}">{escape(t)}</text>\n' for (k, i), t in added.items() if (k, i) not in done and t.strip())
        if new and (cut := texts_xml.rfind("</")) >= 0:
            texts_xml = texts_xml[:cut] + new + texts_xml[cut:]
    return out, texts_xml


# ---------- links: the linked entry's effects copied into the entry (after every book is read) ----------
_FX = re.compile(r"<effect [^>]*/>")
_LNK = re.compile(r"<link [^>]*/>")
_ATTR = re.compile(r'([\w:-]+)="([^"]*)"')


def _attrs(tag):
    return {k: _unesc(v) for k, v in _ATTR.findall(tag)}


def _tag(name, a):
    from xml.sax.saxutils import escape
    return f"<{name}" + "".join(f' {k}="{escape(v, {chr(34): "&quot;"})}"' for k, v in a.items()) + "/>"


_PAIR = re.compile(r"-?\d+(?:\.\d+)?/-?\d+(?:\.\d+)?")
_NUM_ = r"\d+(?:\.\d+)?"
_PER_RATING = (re.compile(rf"(-?)R(?:\*(-?{_NUM_}))?(?:-({_NUM_}))?"), re.compile(rf"(-?)(?:({_NUM_})\*)R(?:-({_NUM_}))?"))


def _num(x):
    return str(int(x)) if x == int(x) else str(x)


def _at_level(v, n):
    """An effect value counted per rating at level n, in the forms the app reads (src/sr6/catalog/domain/effects.ts effectValue): `R`, `-R`,
    `R*2`, `2*R`, `R-1`, `R*2-2`, `R[1,1,2]`, each side of an on-road/off-road pair `R/-R`; a value with no rating as it is
    (`2`, `edg/2`, `hits`); None for a rating in any other form."""
    s = (v or "").replace(" ", "")
    if "/" in s and (parts := s.split("/")) and len(parts) == 2 and all(re.fullmatch(r"-?(?:[\d.]*[*]?R(?:[-*][\d.]+)?|[\d.]+)", p) for p in parts):
        got = [_at_level(p, n) for p in parts]
        return None if None in got else "/".join(got)
    if not re.search(r"(?<![A-Za-z])R(?![A-Za-z])", s):
        return v
    if m := re.fullmatch(r"R\[([-\d.,]+)\]", s):
        by = m.group(1).split(",")
        return by[min(n, len(by)) - 1]
    for rx in _PER_RATING:
        if m := rx.fullmatch(s):
            sign = -1 if m.group(1) else 1
            mult = float(m.group(2)) if m.group(2) else 1.0
            val = sign * mult * n
            if m.group(3):
                val = max(0.0, n * mult - float(m.group(3))) * (1 if sign > 0 else -1)
            return _num(val)
    return None


# the classes whose section or variant rules the core rulebook states for every item of them (a rule carries `rule="<its heading>"`):
# the same class in another book has them too; ponytail: two classes verified, add another when it is
CLASS_RULES = {"CYBERWARE/CYBER_LIMBS", "AMMUNITION/ROCKETS"}
_PARTIAL_LIMB = re.compile(r"\b(?:forearm|hand|lower leg|foot|feet|partial)\b", re.I)  # (partial limbs get no box: CRB p. 289, owner decision)


def _mentions(text, target):
    """Whether an entry's own text speaks of what the effect on `target` is about (`condition monitor`, a limb's attributes, Attack
    Rating …): a rule for the class does not fill in what the entry itself states."""
    tail = target.split(":", 1)[-1]
    if tail.endswith("-monitor"):
        return bool(re.search(r"condition monitor|\bboxes\b", text, re.I))
    if target.startswith("limb-attr:"):
        return bool(re.search(r"\battributes?\b", text, re.I))  # (its overdrive boosting Strength and Agility is no statement of its base ones)
    return bool(re.search(r"\b" + re.escape(tail.replace("-", " ")) + r"\b", text, re.I))


def copy_links(sources, texts=None):
    """The entries whose effects change when each link (`grants`, `as`) copies the linked entry's effects into the entry
    (owner direction 2026-10-17): {(source, file name): xml} of the changed files from `sources`, {source: {file name:
    xml}} (the catalog as on disk, ids scoped, one entry a line); texts: {source: {(kind, id): description}}, when the
    entries' own words matter (a class rule fills in nothing the entry's text speaks of). An effect the entry holds for the
    same target, op and specialization is its own and stays (the book's word for the entry wins); `when` of the link goes on
    the copies; a copy is `from` the linked id; the link is `copied`, for the app and the Foundry module not to follow it
    again. A `grants` link is counted at its `level` (the lowest when it names none: `R` is that level); a link whose entry
    is not found, or one of whose effects cannot be given at that level, is left unmarked and copies nothing (the app
    follows it). Run again, it starts from the entries' own effects."""
    texts = texts or {}
    ents, by_id, by_name, by_file = [], {}, {}, {}
    for src, files in sources.items():
        for fname, xml in files.items():
            for ln in (xml or "").splitlines():
                if not (m := ENTRY.match(ln)):
                    continue
                _, _, eid, eattrs, name, kids = m.groups()
                e = {"src": src, "file": fname, "kind": fname[:-4], "id": eid, "key": _key(name), "name": _unesc(name),
                     "cls": (re.search(r' class="([^"]*)"', eattrs) or [None, ""])[1],
                     "own": [_attrs(x) for x in _FX.findall(kids) if ' from="' not in x],
                     "links": [_attrs(x) for x in _LNK.findall(kids)]}
                ents.append(e)
                by_file.setdefault((src, fname), {})[eid] = e
                by_id.setdefault(eid, []).append(e)
                for k in (e["kind"], ""):
                    by_name.setdefault((k, e["key"]), []).append(e)

    def target(e, link):
        c = [x for x in by_id.get(link.get("ref", ""), []) if not link.get("kind") or x["kind"] == link["kind"]] \
            or by_name.get((link.get("kind", ""), _key(link["name"])), [])
        # (the entry's own kind first, then its own book, then one that has effects: `Armor` a critter power's is the critter power)
        c = sorted((x for x in c if x is not e), key=lambda x: (x["kind"] != (link.get("kind") or e["kind"]), x["src"] != e["src"], not x["own"]))
        return c[0] if c else None

    def through(l, a):  # (a linked entry's effect as the linking entry holds it: a granted level's value, the link's condition)
        a = {k: v for k, v in a.items() if k != "rule"}  # (a class rule is the donor's bookkeeping: a copy through a link is not one)
        if l.get("rel") == "grants":
            v = _at_level(a.get("value", ""), int(l["level"]) if str(l.get("level", "")).isdigit() else 1)
            if v is None:
                return None
            a = {**a, "value": v}
        if l.get("when"):
            a = {**a, "when": l["when"], **({} if a.get("switch") else {"switch": "conditional"})}
        return a

    def effects_of(e, depth=0):  # (its own, then those of the entries it links: two levels deep, as the app reads them)
        out = [dict(a) for a in e["own"]]
        for l in e["links"] if depth < 1 else ():
            if l.get("rel") in ("grants", "as") and (t := target(e, l)):
                out += [x for a in effects_of(t, depth + 1) if (x := through(l, a))]
        return out

    class_rules = {}
    for x in ents:
        for a in x["own"]:
            if a.get("rule") and x["cls"] in CLASS_RULES:
                class_rules.setdefault((x["kind"], x["cls"]), []).append((x, a))
    changed = {}
    for e in ents:
        mine = {(a["target"], a["op"], a.get("spec")) for a in e["own"]}
        copies, marks = [], {}
        for l in e["links"]:
            if l.get("rel") not in ("grants", "as") or not (t := target(e, l)):
                continue
            got = [through(l, a) for a in effects_of(t)]
            if None in got:
                continue  # (an effect that cannot be given at that level: the link stays for the app to follow)
            marks[id(l)] = t
            for a in got:
                if (a["target"], a["op"], a.get("spec")) in mine:
                    continue
                # (an on-road/off-road pair that two links both give, Smart Tires working as off-road and racing tires: the better
                # of each side, the tire that suits the road it is on)
                same = next((c for c in copies if (c["target"], c["op"], c.get("spec")) == (a["target"], a["op"], a.get("spec"))
                             and _PAIR.fullmatch(c["value"]) and _PAIR.fullmatch(a["value"])), None)
                if same:
                    same["value"] = "/".join(str(max(float(x), float(y)) if "." in x + y else max(int(x), int(y)))
                                             for x, y in zip(same["value"].split("/"), a["value"].split("/")))
                elif not any((c["target"], c["op"], c.get("spec"), c.get("when"), c.get("switch")) == (a["target"], a["op"], a.get("spec"), a.get("when"), a.get("switch")) for c in copies):
                    copies.append({**a, "from": t["id"]})  # (the first link's copy of each condition and switch: two links reading alike are not twice; a firearm's and a melee weapon's stay, a wireless one and a plain one)
        if e["cls"] in CLASS_RULES and not (e["cls"] == "CYBERWARE/CYBER_LIMBS" and _PARTIAL_LIMB.search(e["name"])):
            # (a rule the core rulebook states for all items of a class, a section's or a variant's: the same class in another book has
            # it too unless it states its own or its text speaks of it, the Foamtek rocket's `Missile` or the Additional Cyberarm's
            # attributes, CRB pp. 265, 288; `from` names the rule)
            have = {(a["target"], a["op"], a.get("spec"), a.get("when")) for a in e["own"] + copies}
            words = (texts.get(e["src"]) or {}).get((e["kind"], e["id"]), "")
            for x, a in class_rules.get((e["kind"], e["cls"]), ()):
                if x["src"] != e["src"] and (k := (a["target"], a["op"], a.get("spec"), a.get("when"))) not in have \
                        and not _mentions(words, a["target"]):
                    have.add(k)
                    copies.append({**{k: v for k, v in a.items() if k != "rule"}, "from": f"{x['src']}:{a['rule']}"})
        e["copies"], e["marks"] = copies, marks
    for src, files in sources.items():
        for fname, xml in files.items():
            out, hit = [], False
            by = by_file.get((src, fname), {})
            for ln in (xml or "").splitlines(keepends=True):
                m = ENTRY.match(ln)
                if not m or m.group(3) not in by or not (by[m.group(3)]["links"] or by[m.group(3)]["copies"] or ' from="' in ln):
                    out.append(ln)
                    continue
                e, (ind, tag, eid, attrs, name, kids) = by[m.group(3)], m.groups()
                links = _LNK.findall(kids)
                kids = _FX.sub(lambda x: "" if ' from="' in x.group(0) else x.group(0), kids)
                for old, l in zip(links, e["links"]):
                    new = {k: v for k, v in l.items() if k != "copied"}
                    if id(l) in e["marks"]:
                        new["copied"] = "yes"
                    kids = kids.replace(old, _tag("link", new), 1)
                add = "".join(_tag("effect", a) for a in e["copies"])
                ends = [x.end() for x in re.finditer(r"<(?:effect|link) [^>]*/>", kids)]
                cut = ends[-1] if ends else (kids.find("<text>") if "<text>" in kids else len(kids))
                kids = kids[:cut] + add + kids[cut:]
                nl = f'{ind}<{tag} id="{eid}"{attrs}><name>{name}</name>{kids}</{tag}>' + ("</sr6:data>" if ln.rstrip().endswith("</sr6:data>") else "") + ("\n" if ln.endswith("\n") else "")
                hit |= nl != ln
                out.append(nl)
            if hit:
                changed[(src, fname)] = "".join(out)
    return changed
