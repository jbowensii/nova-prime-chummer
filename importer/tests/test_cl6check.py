"""The Commlink6 comparison tool (tools/cl6check) on invented data: a made-up jar, invented records and invented
entries. No Commlink6 data, no book text: every name, id and number here is made up."""
import io
import json
import os
import tempfile
import unittest
import unittest.mock
import xml.etree.ElementTree as ET
import zipfile
from contextlib import redirect_stdout

from tools.cl6check import __main__ as cli
from tools.cl6check import canon, fields, match, modifiers, ours, patterns, reader, report
from tools.cl6check import optional as optional_package

R = reader.ROOT


def jar(files):
    """An invented jar at a temp path: {path under the data root: text}."""
    fd, path = tempfile.mkstemp(suffix=".jar")
    os.close(fd)
    with zipfile.ZipFile(path, "w") as z:
        for n, t in files.items():
            z.writestr(R + n, t.encode("utf8"))
    return path


def rec(xml, name="Zorp", page="10", variants=None, book="gizmo"):
    el = reader.normalise(ET.fromstring(xml))
    return {"book": book, "file": "gear", "tag": el.tag, "id": el.get("id"), "name": name, "page": page, "wifi": False,
            "variants": variants or {}, "attrs": dict(el.attrib), "el": el}


def entry(name, kind="gear", page="10", **attrs):
    e = ET.Element("x", attrs)
    return {"src": "gz", "kind": kind, "id": "gz." + name.lower(), "name": name, "page": page, "aliases": [],
            "attrs": attrs, "families": ours.families(e)}


class ReaderTest(unittest.TestCase):
    def setUp(self):
        self.path = jar({
            "gizmo/data/npcs.xml": '<npcs><npc id="sage" type="GRUNT"/></npcs>',
            "gizmo/data/traditions.xml": '<traditions><tradition id="sage"/></traditions>',
            "gizmo/data/gear_harbor.xml": '<items><item id="buoy" type="TOOLS" subtype="TOOLS" price="5"/>'
                                          '<item id="buoy2" type="TOOLS" lang="de"/><item id="nameless"/></items>',
            "gizmo/data/powers.xml": '<powers><power id="leap" cost="0.5"/></powers>',
            "gizmo/i18n/gizmo.properties": "npc.sage=Sage Thug\nnpc.sage.page=3\ntradition.sage=Sage Way\n"
                                           "tradition.sage.page=7\nadeptpower.leap=Leap\nitem.buoy=Wrong Buoy\n",
            "gizmo/i18n/gizmo_harbor.properties": "item.buoy=Harbor Buoy\nitem.buoy.page=99\n"
                                                  "item.buoy.variant.big=Big\\u00e9 \\\n  one\n",
            "gizmo/i18n/gizmo_de.properties": "npc.sage=Weiser\n",
            "de_land/data/x.xml": '<items><item id="k"/></items>',
        })

    def tearDown(self):
        os.remove(self.path)

    def test_text_is_keyed_by_prefix_and_id(self):
        recs, excluded = reader.read(self.path)
        by = {(r["tag"], r["id"]): r for r in recs}
        self.assertEqual((by["npc", "sage"]["name"], by["npc", "sage"]["page"]), ("Sage Thug", "3"))
        self.assertEqual((by["tradition", "sage"]["name"], by["tradition", "sage"]["page"]), ("Sage Way", "7"))
        self.assertEqual(by["power", "leap"]["name"], "Leap")  # power's text prefix is adeptpower

    def test_the_file_named_like_the_record_file_wins(self):
        buoy = next(r for r in reader.read(self.path)[0] if r["id"] == "buoy")
        self.assertEqual((buoy["name"], buoy["page"], buoy["variants"]), ("Harbor Buoy", "99", {"big": "Bigé one"}))

    def test_german_books_records_and_nameless_records_are_left_out(self):
        recs, excluded = reader.read(self.path)
        self.assertEqual({r["book"] for r in recs}, {"gizmo"})
        self.assertEqual(excluded[("gizmo", "item", "lang=de (German-rules duplicate)")], 1)
        self.assertEqual(excluded[("gizmo", "item", "no English name in the jar")], 1)

    def test_spelling_variants(self):
        el = reader.normalise(ET.fromstring('<m><valmod type="glide" ref="SKILL" val="2" multi="Y"/>'
                                            '<valmod ref="choice" neg="FALSE"/></m>'))
        a, b = el[0].attrib, el[1].attrib
        self.assertEqual((a["type"], a["ref"], a["value"], a["multi"], b["ref"], b["neg"]),
                         ("SKILL", "glide", "2", "true", "CHOICE", "false"))

    def test_no_jar_skips_cleanly(self):
        out = io.StringIO()
        with redirect_stdout(out):
            self.assertEqual(cli.main(["--jar", os.path.join(tempfile.gettempdir(), "no-such.jar")]), 0)
        self.assertIn("skipped", out.getvalue())


class CanonTest(unittest.TestCase):
    def test_formulas_evaluate_at_each_rating(self):
        self.assertEqual([canon.cl6_value("$RATING*250", r) for r in (1, 3)], [250, 750])
        self.assertEqual(canon.cl6_value("$RATING*$RATING*10+5", 2), 45)
        self.assertEqual(canon.cl6_value("$RATING", 2, "7,9,3L"), 9)
        self.assertEqual(canon.cl6_value("$RATING", 3, "7,9,3L"), "3L")
        self.assertIsNone(canon.cl6_value("$$BODY*100", 1))  # the host's value: not ours to evaluate
        self.assertIsNone(canon.cl6_value("lots"))

    def test_a_canonical_record(self):
        r = rec('<item id="zorp" type="CYBERWARE" subtype="CYBER_HEADWARE" avail="2">'
                '<attrdef id="PRICE" value="$RATING*300"/><attrdef id="AVAILABILITY" value="$RATING" table="2,3,4L"/>'
                '<usage mode="IMPLANTED" value="$RATING*0.1"/><usage mode="EMBEDDED" slot="HEADWARE_IMPLANT" value="1"/>'
                '<choices><choice type="ITEM_ATTRIBUTE" ref="RATING" options="1,2,3"/><choice type="SKILL"/></choices>'
                '<variant id="big"><attrdef id="PRICE" value="999"/></variant>'
                '<modifications><valmod type="ATTRIBUTE" ref="AGILITY" value="$RATING"/>'
                '<itemmod type="HOOK" ref="OPTICAL"/><relevancemod topic="MATRIX"/></modifications></item>',
                variants={"big": "Big"})
        c = canon.canonical(r)
        f = c["fields"]
        self.assertEqual((c["kind"], c["modelled"], f["rating"]), ("augmentations", True, (1, 3)))
        self.assertEqual(f["cost"], {1: 300, 2: 600, 3: 900})
        self.assertEqual(f["avail"], {1: (2, ""), 2: (3, ""), 3: (4, "L")})
        self.assertEqual(f["essence"][3], 0.30000000000000004)
        self.assertEqual(f["cost_variants"], [999])
        fam = c["families"]
        self.assertEqual(fam["subtype"], ("cyber-headware",))
        self.assertEqual(fam["slots"], frozenset({("slot", "optical"), ("fits", "headware-implant")}))
        self.assertEqual(fam["effects"], (("effect", "attribute:agility", "r"),))
        self.assertEqual((fam["choices"], fam["variants"], fam["relevance"]), (("skill",), frozenset({"big"}),
                                                                               frozenset({"matrix"})))
        self.assertEqual(canon.labels(fam), {"relevance:matrix"})
        self.assertIn("Zorp Big", c["aliases"])

    def test_commlink6_only_records(self):
        only = lambda x: canon.canonical(rec(x))["cl6only"]
        self.assertTrue(only('<item id="z" type="ACCESSORY" avail="99" price="0" modonly="true"/>'))
        self.assertFalse(only('<item id="z" type="ACCESSORY" avail="4" price="0" modonly="true"/>'))
        self.assertFalse(only('<item id="z" type="ACCESSORY" modonly="true"/>'))

    def test_kinds_and_sources(self):
        self.assertEqual(canon.kind_of("item", {"type": "PACK"}), ("packs", True))  # (read from the books' sections)
        self.assertEqual(canon.kind_of("action", {}), ("actions", True))
        self.assertEqual(canon.kind_of("unheardof", {}), ("unheardof", False))
        self.assertEqual(canon.kind_of("npc", {"type": "SPIRIT"}), ("spirits", True))
        self.assertEqual(canon.source_of("core", "gear_seattle"), "crb-sea")
        self.assertEqual(canon.source_of("core", "gear"), "crb")
        self.assertIn("Party Grenade", canon.aliases("Grenade, Party", {}))


class OursTest(unittest.TestCase):
    def test_values_read_as_the_app(self):
        self.assertEqual([ours.value(v, 3) for v in ("Rating x 250", "(Rating × 2) + 1", "4(L)", "1,500¥", "—",
                                                     "300/350", "Rating/2")], [750, 7, 4, 1500, None, None, 2])
        self.assertEqual(ours.numbers("100/month or 1,000/year"), {100, 1000})
        self.assertEqual(ours.rating_range("1–6"), (1, 6))

    def test_mount_column_gives_fits(self):
        e = ET.Element("weapon", {"mount": "Top or Under"})
        self.assertEqual(ours.families(e)["slots"], frozenset({("fits", "top"), ("fits", "under")}))

    def test_kind_flags_and_social_dashes(self):
        fl = lambda kind, **a: ours.families(ET.Element("x", a), kind).get("flags")
        self.assertEqual(fl("augmentations"), frozenset({"augmentation"}))
        self.assertEqual(fl("electronics"), frozenset({"matrix_device"}))
        self.assertEqual(fl("gear", category="Attribute codemod"), frozenset({"codemod"}))
        self.assertIsNone(fl("gear", category="Tools"))
        soc = lambda kind, **a: ours.families(ET.Element("x", a), kind)["social"]
        self.assertEqual(soc("armor", social="–2"), soc("armor", social="-2"))  # (the printed en dash)
        self.assertEqual(soc("armor", social="—"), soc("armor"))  # (a dash, or no column: 0)
        self.assertEqual(soc("armor"), (str(canon.cl6_value("0")),))

    def test_load_reads_runs_once_per_source(self):
        with tempfile.TemporaryDirectory() as d:
            for run in ("a_run", "b_run"):
                imp = os.path.join(d, run, "custom", "sr6", "imported", "gz")
                os.makedirs(imp)
                with open(os.path.join(imp, "gear.xml"), "w", encoding="utf8") as f:
                    f.write(f'<data><gear id="gz.q" page="4"><name>{run}</name></gear></data>')
                lib = os.path.join(d, run, "library", "sr6", "book1")
                os.makedirs(lib)
                with open(os.path.join(lib, "import.xml"), "w", encoding="utf8") as f:
                    f.write('<import source="GZ" pages="20"/>')
            got = ours.load(d)
            self.assertEqual([e["name"] for e in got["gz"].entries], ["a_run"])
            self.assertTrue(got["gz"].book_dir.endswith(os.path.join("a_run", "library", "sr6", "book1")))


    def test_the_newest_printing_wins_whatever_the_run_names(self):
        from unittest import mock
        from importer.sr6.recipes import crb
        from tools.cl6check import corpus
        with tempfile.TemporaryDirectory() as d:
            for run, cost in (("a_berlin", "2100"), ("b_current", "5100"), ("c_seattle", "2100")):
                imp = os.path.join(d, run, "custom", "sr6", "imported", "gz")
                os.makedirs(imp)
                with open(os.path.join(imp, "gear.xml"), "w", encoding="utf8") as f:
                    f.write(f'<data><gear id="gz.q" cost="{cost}"><name>{run}</name></gear></data>')
                lib = os.path.join(d, run, "library", "sr6", "book1")
                os.makedirs(lib)
                with open(os.path.join(lib, "import.xml"), "w", encoding="utf8") as f:
                    f.write(f'<import source="GZ" sha256="{crb.SHA256[0] if run == "b_current" else "x"}"/>')
            dates = {"a_berlin": "2025-06-01", "b_current": "2019-08-25", "c_seattle": "2021-09-01"}  # (the Current Printing's PDF is the oldest)
            meta = lambda p: (dates[p.split(os.sep)[-5]], "")  # noqa: E731
            with mock.patch.object(corpus, "pdf_meta", meta):
                self.assertEqual([e["name"] for e in ours.load(d)["gz"].entries], ["b_current"])
                os.remove(os.path.join(d, "b_current", "library", "sr6", "book1", "import.xml"))  # no Current Printing: the PDF date
                self.assertEqual([e["name"] for e in ours.load(d)["gz"].entries], ["a_berlin"])
                dates["a_berlin"] = dates["c_seattle"] = dates["b_current"]  # a tie: the first in name order
                self.assertEqual([e["name"] for e in ours.load(d)["gz"].entries], ["a_berlin"])


class FieldsTest(unittest.TestCase):
    def cmp(self, xml, **attrs):
        c = canon.canonical(rec(xml))
        return fields.compare(c, entry("Zorp", **attrs))

    def test_a_rating_formula_settles_against_a_per_rating_table(self):
        x = ('<item id="z" type="TOOLS" avail="2"><attrdef id="PRICE" value="$RATING" table="250,500,750"/>'
             '<choices><choice type="ITEM_ATTRIBUTE" ref="RATING" options="1,2,3"/></choices></item>')
        self.assertEqual(self.cmp(x, cost="Rating x 250", avail="2", rating="1–3")[1], [])
        d = self.cmp(x, cost="Rating x 300", avail="2", rating="1–3")[1]
        self.assertEqual((d[0]["field"], d[0]["why"]), ("cost", "differs at rating 1"))
        d = self.cmp(x, cost="Rating x 250", avail="2")[1]
        self.assertEqual(d[0]["why"], "ours empty (our cost/avail/essence is per rating)")

    def test_variants_ranges_and_cells_printing_several_values(self):
        x = '<item id="z" type="TOOLS" price="100"><variant id="v"><attrdef id="PRICE" value="900"/></variant></item>'
        self.assertEqual(self.cmp(x, cost="900")[1], [])  # our row prints the variant
        self.assertEqual(self.cmp(x, cost="50–5,000")[1], [])  # a printed range
        self.assertEqual(self.cmp(x, cost="100 + 1 dose")[1], [])
        self.assertEqual(self.cmp(x, cost="120 + 1 dose")[1][0]["why"], "ours unreadable or several values")

    def test_legality_apart_and_shifted_columns(self):
        x = '<item id="z" type="TOOLS" price="10" avail="4L"/>'
        compared, d = self.cmp(x, cost="10", avail="4(I)")
        self.assertEqual([(y["field"], y["cl6"]) for y in d], [("legality", "L")])
        d = self.cmp(x, cost="10", avail="2500")[1]
        self.assertEqual(d[0]["why"], "ours holds a price (columns shifted)")
        # (owner 2026-10-15) nuyen alone under AVAIL is a licence fee on a freely available item: no avail or legality diff;
        # `4(I), 2,500¥` is rating 4 plus the fee, compared on the 4(I)
        self.assertEqual(self.cmp(x, cost="10", avail="2,500¥")[1], [])
        self.assertEqual(fields.licence("4(I), 2,500¥"), ("4(I)", 2500.0))
        self.assertEqual(fields.licence("2,500¥"), ("", 2500.0))
        self.assertEqual(fields.licence("4(L)"), ("4(L)", None))
        d = self.cmp(x, cost="10", avail="4(I), 2,500¥")[1]
        self.assertEqual([(y["field"], y["cl6"]) for y in d], [("legality", "L")])
        self.assertNotIn("legality", self.cmp(x, cost="10", avail="—")[0])  # an empty avail is the avail's diff

    def test_a_quality_s_awakened_price_matches_the_second_record(self):
        """(owner 2026-10-16) one quality, its price when Awakened a <karmaif>: both of Commlink6's records (mundane,
        awakened) agree on karma."""
        karma = lambda k, **a: [d for d in fields.compare(canon.canonical(rec(f'<quality id="z" karma="{k}" pos="true"/>')),
                                                          entry("Zorp", kind="qualities", **a))[1] if d["field"] == "karma"]
        self.assertEqual(karma(54, karma="54", karmaIf="44"), [])
        self.assertEqual(karma(44, karma="54", karmaIf="44"), [])
        self.assertEqual(len(karma(44, karma="54")), 1)
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "qualities.xml"), "w", encoding="utf8") as f:
                f.write('<d kind="qualities"><quality id="gz.zorp" source="GZ" page="1" kind="positive" karma="54"><name>Zorp</name>'
                        '<karmaif flag="awakened" value="44"/></quality></d>')
            self.assertEqual(ours._entries(d, "gz")[0]["attrs"]["karmaIf"], "44")

    def test_ammo_with_what_else_it_draws_on(self):
        c = {"fields": {"ammo": "20(c)"}, "tag": "item"}  # (a canonical record's ammo field, invented)
        self.assertEqual(fields.compare(c, entry("Zorp", kind="weapons", ammo="20(c) + Energy")), (["ammo"], []))
        self.assertEqual(len(fields.compare(c, entry("Zorp", kind="weapons", ammo="30(c) + Energy"))[1]), 1)

    def test_a_drain_per_variant_matches_any_listed(self):
        c = {"tag": "spell", "fields": {"drain": "6"}}
        self.assertEqual(fields.compare(c, entry("Zorp", kind="spells", dv="4, 6, 8"))[1], [])
        self.assertEqual(fields.compare(c, entry("Zorp", kind="spells", dv="4, 8"))[1][0]["field"], "drain")

    def test_weapon_bands(self):
        self.assertEqual(fields.bands("10,10,8,,"), fields.bands("10/10/8/—/—"))


class MatchTest(unittest.TestCase):
    def test_stages(self):
        def c(name, page="10"):
            return {"name": name, "page": page, "kind": "gear", "pool": ("gear",), "aliases": canon.aliases(name, {})}
        mine = [entry("Party grenade"), entry("Zorp Buoys"), entry("Gills", page="11"), entry("Far away", page="90"),
                entry("Glow/Bright Glow Flare", page="40"), entry("Small Zorp/Medium Zorp", page="50")]
        got = {x[0]["name"]: (x[2], [o["name"] for o in x[1]]) for x in match.match(
            [c("Grenade, Party"), c("Zorp buoy"), c("Transgenic Gills"), c("Nothing like it"), c("Flare Glow"),
             c("Sm. Zorp/Med. Zorp (10x)")], mine)}
        self.assertEqual(got["Flare Glow"], ("split word-order", ["Glow/Bright Glow Flare"]))
        self.assertEqual(got["Sm. Zorp/Med. Zorp (10x)"], ("abbreviated", ["Small Zorp/Medium Zorp"]))
        rows = [entry("Bronze (year)", group="Zorp contract"), entry("Gold (year)", group="Zorp contract")]
        two = {x[0]["name"]: (x[2], [o["name"] for o in x[1]]) for x in match.match([c("Zorp Contract"), c("Zorp Gold (1 Year)")], rows)}
        self.assertEqual(two["Zorp Contract"], ("group head", ["Bronze (year)", "Gold (year)"]))  # (its rows)
        self.assertEqual(two["Zorp Gold (1 Year)"], ("contained", ["Gold (year)"]))
        self.assertEqual(got["Grenade, Party"], ("alias", ["Party grenade"]))
        self.assertEqual(got["Zorp buoy"], ("loose", ["Zorp Buoys"]))
        self.assertEqual(got["Transgenic Gills"], ("contained", ["Gills"]))
        self.assertEqual(got["Nothing like it"], ("", []))

    def test_one_nanite_record_is_both_of_our_items(self):
        c = lambda name: {"name": name, "page": "10", "kind": "gear", "pool": ("gear",), "aliases": []}  # noqa: E731
        nano = {"category": "Colony & nanite"}
        mine = [entry("Fizz Swarm Colony", **nano), entry("Fizz Swarm Nanites", **nano), entry("Zap Nanites (Buzz) Colony", **nano),
                entry("Zap Nanites (Buzz) Nanites", **nano), entry("Mars Colony")]
        got = {x[0]["name"]: (x[2], sorted(o["name"] for o in x[1])) for x in match.match([c("Fizz Swarm"), c("Buzz")], mine)}
        self.assertEqual(got["Fizz Swarm"], ("nanite colony and nanites", ["Fizz Swarm Colony", "Fizz Swarm Nanites"]))
        self.assertEqual(got["Buzz"], ("nanite colony and nanites", ["Zap Nanites (Buzz) Colony", "Zap Nanites (Buzz) Nanites"]))
        # (an entry that only ends in `Colony` is no nanite row)
        self.assertEqual(match.match([c("Mars")], mine)[0][1], [])

    def test_names_apart_by_a_number_never_pair(self):
        c = {"name": "Zorp Model 9", "page": "10", "kind": "gear", "pool": ("gear",), "aliases": []}
        for stage_page in ("10", "99"):
            self.assertEqual(match.match([c], [entry("Zorp Model 7", page=stage_page)])[0][1], [])

    def test_parentheticals_and_the_records_page(self):
        # a rating's parenthetical is set aside, a variant's word starting with r is not
        self.assertEqual(match.n1("Zorp (R 1-6)"), match.n1("Zorp"))
        self.assertNotEqual(match.n1("Zorp (Ribbonwire)"), match.n1("Zorp"))
        # rows a record's words are all in: the ones on its own page when some are
        c = {"name": "Boom Gun ZAP", "page": "20", "kind": "gear", "pool": ("gear",), "aliases": []}
        mine = [entry("Q1 (ZAP Boom Gun)", page="20"), entry("Q9 (ZAP Boom Gun)", page="27")]
        self.assertEqual([o["name"] for o in match.match([c], mine)[0][1]], ["Q1 (ZAP Boom Gun)"])

    def test_a_pack_paired_by_its_price_and_name(self):
        # (a PACK's only stat is its price: that price on its page and its name after Commlink6's section, a compound
        # of two of our words counting: `Zapports` for `Zap Ports`)
        c = {"name": "Upgrades-Zapports", "page": "71", "kind": "packs", "pool": ("packs",), "aliases": [],
             "fields": {"cost": {None: 4000.0}}}
        o = entry("Zap Ports Vehicle", page="71", cost="4000")
        o["kind"] = "packs"
        ok, bad = match.stat_agreement(c, o)
        self.assertEqual((ok, bad), (["cost"], []))
        self.assertTrue(match.strong(c, o, ok))
        self.assertFalse(match.strong(c, dict(o, name="Glow Vehicle"), ok))


class PatternsTest(unittest.TestCase):
    def test_general_rules_are_scored_against_the_tags(self):
        """Six invented entries: every widget-table entry carries the flag but one, one gizmo does too. The table rule
        wins with precision 1 and recall 3/4; a pair of features is tried as one rule; extras the rule set tags are
        counted."""
        mk = lambda cat, *w: patterns.features({"kind": "gear", "name": " ".join(w), "attrs": {"category": cat}})
        data = [({"flag:wobble"}, mk("widgets", "zap")), ({"flag:wobble"}, mk("widgets", "zip")),
                ({"flag:wobble"}, mk("widgets", "zop")), (set(), mk("gizmos", "zap")),
                ({"flag:wobble"}, mk("gizmos", "quux")), (set(), mk("gizmos", "zip"))]
        got = patterns.analyse(data, [mk("widgets", "new"), mk("gizmos", "new")])["flag:wobble"]
        best = got["top"][0]
        self.assertEqual((best["rule"], best["precision"], best["recall"]), ("category=widgets", 1.0, 0.75))
        self.assertEqual(got["set"]["rules"][0], "category=widgets")
        self.assertEqual(got["set"]["tags_extras"], 1)
        self.assertTrue(patterns.fires("kind=gear AND name~zap", mk("widgets", "zap")))
        self.assertIn("capacity=[bracketed]", patterns.features({"kind": "augmentations", "name": "Q",
                                                                  "attrs": {"capacity": "[2]"}}))


class ModifiersTest(unittest.TestCase):
    EL = ('<item id="z"><modifications><checkmod type="SKILL" ref="juggling" value="2" what="DICE"/>'
          '<valmod type="ATTRIBUTE" ref="INITIATIVE_DICE_PHYSICAL" value="$RATING"/>'
          '<itemmod type="QUALITY" ref="glow_skin"/><relevancemod topic="MAGICAL"/></modifications>'
          '<mode id="wireless"><modifications><valmod type="ITEM_ATTRIBUTE" ref="ATTACK_RATING" value="1"/>'
          '</modifications></mode></item>')

    def test_paths_operators_and_conditions(self):
        got = [(m["path"], m["op"], m["rated"], m["cond"]) for m in modifiers.modifiers(ET.fromstring(self.EL))]
        self.assertEqual(got, [("character/roll/skill:juggling", "+dice", False, []),
                               ("character/initiative/initiative-dice-physical", "+", True, []),
                               ("character/quality/glow-skin", "grant", False, []),
                               ("item/attack-rating", "+", False, ["mode:wireless"])])

    def test_alignment_templates_and_their_reach(self):
        mods = modifiers.modifiers(ET.fromstring(self.EL))
        toks = modifiers.tokens("You gain +2 dice on Juggling tests while it runs.")
        self.assertEqual(modifiers.align(mods[0], toks), "{N} dice on {T} tests")
        self.assertEqual(modifiers.align(mods[1], modifiers.tokens("It adds one Initiative Die per Rating.")),
                         "{T} per {R}")
        self.assertIsNone(modifiers.align(mods[0], modifiers.tokens("Juggling is fun.")))  # no value printed
        pairs = [(mods, "You gain +2 dice on Juggling tests."), (mods, "Grants +2 dice on Juggling tests too."),
                 ([], "Add +3 dice on Juggling tests.")]
        got = modifiers.analyse(pairs, [mods])
        t = next(x for x in got["templates"] if x["template"] == "{N} dice on {T} tests")
        self.assertEqual((t["seeds"], t["fires"], t["reproduced"]), (2, 3, 2))  # the third fires on an item without it
        self.assertEqual(got["vocabulary"]["character/roll"]["specific"], {"skill:juggling": 1})


class ReportTest(unittest.TestCase):
    def test_miss_causes(self):
        bt = report.BookText(None)
        bt.blocks, bt.rows, bt.heads, bt.text = {"zorp"}, {"quux"}, {"party"}, " a blarg in running text "
        r = {"modelled": True, "name": "Zorp", "page": "5", "aliases": [], "kind": "gear"}
        src = object()
        self.assertTrue(report.miss_cause(r, src, bt, None).startswith("regroup block"))
        self.assertTrue(report.miss_cause(r | {"name": "Quux"}, src, bt, None).startswith("table row"))
        self.assertTrue(report.miss_cause(r | {"name": "Blarg"}, src, bt, None).startswith("name only in running"))
        self.assertTrue(report.miss_cause(r | {"name": "Grenade Party"}, src, bt, None).startswith("printed under"))
        self.assertTrue(report.miss_cause(r | {"modelled": False, "kind": "packs"}, src, bt, None).startswith("scope"))
        self.assertTrue(report.miss_cause(r | {"page": ""}, src, bt, None).startswith("Commlink6 gives no page"))

    def test_diffs_csv_marks_what_the_metrics_leave_out(self):
        import csv
        base = {"src": "gz", "kind": "gear", "name": "Z", "page": "1", "our_name": "", "our_page": "", "how": "",
                "id": "z", "our_id": "", "compared": [], "diffs": [], "cause": "x", "modelled": True, "excluded": None}
        d = {"field": "cost", "class": "c", "pdf": "neither", "why": "ours empty", "cl6": "1", "ours": ""}
        rs = [base | {"matched": False, "families": {"flags": False}},
              base | {"matched": False, "cl6only": True, "families": {}},
              base | {"matched": True, "families": {"slots": False}, "diffs": [d, d | {"field": "avail", "pdf": "ours"}]}]
        with tempfile.TemporaryDirectory() as out, unittest.mock.patch.object(report, "markdown", return_value=""):
            report.write(out, {}, rs, [{"src": "gz", "kind": "gear", "name": "E", "page": "2", "id": "e"}])
            rows = list(csv.DictReader(open(os.path.join(out, "cl6-diffs.csv"), encoding="utf-8-sig")))
        self.assertEqual([(r["row"], r["status"]) for r in rows],
                         [("missing", "unmatched"), ("family", "unmatched"), ("missing", "cl6_only"),
                          ("field", "cl6_only"), ("field", "counted"), ("family", "counted"), ("extra", "extra")])

    def test_deltas_against_a_baseline(self):
        base = {"completeness": {"all": {"pct": 50.0}}, "accuracy": {"pct": 80.0, "by_field": {"cost": {"pct": 9.0}}}}
        now = {"completeness": {"all": {"pct": 55.0}}, "accuracy": {"pct": 80.0, "by_field": {"cost": {"pct": 10.0}}}}
        self.assertEqual(report.deltas(now, base), {"accuracy.by_field.cost.pct": (9.0, 10.0),
                                                    "completeness.all.pct": (50.0, 55.0)})


if __name__ == "__main__":
    unittest.main()


class InlineRefsTest(unittest.TestCase):
    def test_a_ref_takes_the_cited_entrys_formula_or_number(self):
        es = [{"kind": "gear", "id": "gz.a", "attrs": {"cost": "Rating x 100", "formula:cost": "R*100"}},
              {"kind": "gear", "id": "gz.b", "attrs": {"cost": "2,000¥"}},
              {"kind": "gear", "id": "gz.c", "attrs": {"formula:cost": "ref(gear:gz.a, cost, R)*0.7"}},
              {"kind": "gear", "id": "gz.d", "attrs": {"formula:cost": "ref(gear:gz.b, cost)*0.5|unit=x"}}]
        out = {e["id"]: e["attrs"].get("formula:cost") for e in ours._inline_refs(es)}
        self.assertEqual((out["gz.c"], out["gz.d"]), ("(R*100)*0.7", "(2000)*0.5|unit=x"))


class SettleTest(unittest.TestCase):
    class Book:  # a one-page stand-in for the PDF
        def __init__(self, text):
            self.text = text

        def page_text(self, p):
            return self.text

    def settle(self, text, **diff):
        from tools.cl6check import arbitrate
        return arbitrate.settle(self.Book(text), {"page": 1, "name": "Milk"}, {"page": 1}, diff)

    def test_a_printed_dash_or_formula_is_not_an_importer_error(self):
        # the row prints a dash; the one digit Commlink6 holds sits elsewhere in the window
        self.assertEqual(self.settle("Milk — 3 1", why="ours empty", ours="—", cl6_tok="1")[0], "b")
        # the row prints our formula; Commlink6 flattens it to the rating-1 number
        self.assertEqual(self.settle("Milk 1-3 1 Capacity x 50", why="differs at rating 2", ours="Capacity x 50",
                                     ours_tok="100", cl6_tok="50")[0], "b")
        # a genuine miss still counts
        self.assertEqual(self.settle("Milk 4 20", why="ours empty", ours="", cl6_tok="4")[0], "a")


class PerEffectTest(unittest.TestCase):
    def test_counts_cl6_modifiers_ours_reproduces_by_target_and_value(self):
        c = {"families": {"effects": (("effect", "attribute:strength", "1"), ("test", "skill:stealth", "2"))}}
        o = {"families": {"effects": (("effect", "attribute:strength", "1"),)}}
        self.assertEqual(modifiers.per_effect([(c, o)]), {"reproduced": 1, "of": 2, "pct": 50.0})


class OptionalPackageTest(unittest.TestCase):
    def test_optional_and_relocated_records_count_as_matches_in_the_analysis_only(self):
        from types import SimpleNamespace
        a = canon.canonical(rec('<item id="aaa"/>', name="Alpha")) | {"src": "gz"}
        b = canon.canonical(rec('<item id="bbb"/>', name="Beta")) | {"src": "gz"}
        c = canon.canonical(rec('<item id="ccc"/>', name="Gamma")) | {"src": "gz"}
        mine = {"gz": SimpleNamespace(entries=[entry("Beta"), entry("Other")], book_dir=None),
                "kz": SimpleNamespace(entries=[entry("Moved") | {"id": "kz.moved"}], book_dir=None)}
        pkg = ({("gz", "aaa"): {}}, {("gz", "ccc"): {"our_id": "kz.moved"}})
        results, extras, _ = cli.compare([a, b, c], mine, pdf=False, package=pkg)
        by = {r["id"]: r for r in results}
        self.assertEqual([(by[i]["matched"], by[i]["how"]) for i in ("aaa", "bbb", "ccc")],
                         [(True, "optional package"), (True, "exact"), (True, "relocated")])
        self.assertEqual(by["ccc"]["our_id"], "kz.moved")
        self.assertEqual([e["name"] for e in extras], ["Other"])  # (the relocated entry is not an extra)
        m = report.metrics(results, extras, {}, {"jar": "", "ours": "", "when": ""})
        self.assertEqual((m["optional_package"], m["accuracy"]["matched"]), (1, 2))  # (no entry to compare for the first)

    def test_the_json_and_the_doc_list_the_same_records(self):
        import re
        optional, relocated = __import__("tools.cl6check.optional", fromlist=["x"]).load()
        self.assertEqual(json.load(open(__import__("tools.cl6check.optional", fromlist=["x"]).FILE, encoding="utf8"))["package"],
                         "commlink6-sr6-optional")
        doc = open(os.path.join(os.path.dirname(__file__), "..", "..", "docs", "sr6-cl6-optional-package.md"),
                   encoding="utf8").read()
        self.assertEqual({i for _, i in optional}, set(re.findall(r"CL6 id `([a-z0-9_]+)`", doc)))
        self.assertEqual(relocated, {})  # (nothing is relocated now; the mechanism stays for a record found in another book)


class AlreadyHaveTest(unittest.TestCase):
    def test_a_record_we_have_under_another_name_is_matched_not_compared_and_not_an_extra(self):
        from types import SimpleNamespace
        a = canon.canonical(rec('<item id="aaa" avail="9"/>', name="Alpha")) | {"src": "gz"}
        mine = {"gz": SimpleNamespace(entries=[entry("Unlike", avail="1")], book_dir=None)}
        pkg = ({}, {}, {("gz", "aaa"): {"src": "gz", "cl6_id": "aaa", "our_id": "gz.unlike"}})
        results, extras, pairs = cli.compare([a], mine, pdf=False, package=pkg)
        r = results[0]
        self.assertEqual((r["matched"], r["how"], r["our_id"], r["diffs"], extras, pairs), (True, "already have", "gz.unlike", [], [], []))
        m = report.metrics(results, extras, {}, {"jar": "", "ours": "", "when": ""})
        self.assertEqual((m["already_have"], m["accuracy"]["matched"], m["completeness"]["all"]["matched"]), (1, 0, 1))
        # an entry that isn't a loaded catalog entry (a rules section, say): the owner still counts it complete
        gone = cli.compare([a], mine, pdf=False, package=({}, {}, {("gz", "aaa"): {"our_id": "gz.nope"}}))[0][0]
        self.assertEqual((gone["matched"], gone["how"], gone["our_id"]), (True, "already have", "gz.nope"))

    def test_relocated_json_is_well_formed_and_every_id_is_in_a_catalog_when_one_is_given(self):
        import glob
        import re
        have = __import__("tools.cl6check.optional", fromlist=["x"]).load_have()
        self.assertGreater(len(have), 80)
        for (src, cid), r in have.items():
            self.assertTrue(src and cid and r["our_id"].startswith(r["our_id"].split(".")[0] + ".") and r["note"], r)
        root = os.environ.get("CL6_RUNS")  # (a folder of importer runs, e.g. .extract/cl6check-runs3: the owner's machine)
        if root:
            ids = set()
            for f in glob.glob(os.path.join(root, "*", "custom", "sr6", "imported", "*", "*.xml")):
                ids.update(re.findall(r'<\w+ id="([^"]+)"', open(f, encoding="utf8").read()))
            self.assertEqual([r["our_id"] for r in have.values() if r["our_id"] not in ids], [])


class ClassFamilyTest(unittest.TestCase):
    def test_ours_class_is_compared_with_commlink6s_type_and_subtype_case_insensitively(self):
        from types import SimpleNamespace
        a = canon.canonical(rec('<item id="aaa" type="ARMOR" subtype="ARMOR_BODY"/>', name="Alpha")) | {"src": "gz"}
        b = canon.canonical(rec('<item id="bbb" type="TOOLS" subtype="TOOLS"/>', name="Beta")) | {"src": "gz"}
        c = canon.canonical(rec('<item id="ccc" type="TOOLS"/>', name="Gamma")) | {"src": "gz"}
        self.assertEqual((a["cl6_class"], c["cl6_class"]), ("ARMOR/ARMOR_BODY", "TOOLS"))
        mine = {"gz": SimpleNamespace(entries=[entry("Alpha", **{"class": "armor/armor_body"}), entry("Beta", **{"class": "TOOLS/SURVIVAL"}),
                                               entry("Gamma")], book_dir=None)}
        results, _, _ = cli.compare([a, b, c], mine, pdf=False, package=({}, {}, {}))
        by = {r["id"]: r for r in results}
        self.assertEqual([by[i]["families"].get("class") for i in ("aaa", "bbb", "ccc")], [True, False, False])
        self.assertTrue(all("subtype" not in r["families"] for r in results))  # (replaced by the class family)
        self.assertEqual((by["bbb"]["cl6_class"], by["bbb"]["our_class"]), ("TOOLS/TOOLS", "TOOLS/SURVIVAL"))
        m = report.metrics(results, [], {}, {"jar": "", "ours": "", "when": ""})
        self.assertEqual((m["class_match"]["equal"], m["class_match"]["matched"]), (1, 3))
        self.assertIn("class match", report.markdown(m))
        with tempfile.TemporaryDirectory() as out, unittest.mock.patch.object(report, "markdown", return_value=""):
            import csv
            report.write(out, m, results, [])
            with open(os.path.join(out, "cl6-diffs.csv"), encoding="utf-8-sig") as f:
                rows = [r for r in csv.DictReader(f) if r["field"] == "class"]
        self.assertEqual(sorted((r["name_cl6"], r["cl6"], r["ours"]) for r in rows),
                         [("Beta", "TOOLS/TOOLS", "TOOLS/SURVIVAL"), ("Gamma", "TOOLS", "")])

    def test_a_spells_class_is_its_tag_not_its_spell_type(self):
        s = canon.canonical(rec('<spell id="sss" cat="COMBAT" type="PHYSICAL"/>', name="Spark"))
        self.assertEqual(s["cl6_class"], "spell")


class ClassTieBreakTest(unittest.TestCase):
    def run_compare(self, records, entries, accept=None):
        from types import SimpleNamespace
        recs = [canon.canonical(rec(x, name=n)) | {"src": "gz"} for x, n in records]
        mine = {"gz": SimpleNamespace(entries=entries, book_dir=None)}
        res = cli.compare(recs, mine, pdf=False, package=({}, {}, {}), accept=accept or {})[0]
        return {r["id"]: r for r in res}

    def test_of_two_records_matching_one_weapon_the_one_of_its_kind_is_compared(self):
        by = self.run_compare([('<item id="launch" type="WEAPON_SPECIAL" subtype="LAUNCHERS"/>', "Zed Tube"),
                               ('<item id="rocket" type="AMMUNITION" subtype="ROCKETS"/>', "Zed Tube")],
                              [entry("Zed Tube", kind="weapons", **{"class": "WEAPON_SPECIAL/LAUNCHERS"})])
        self.assertEqual((by["launch"]["families"].get("class"), "class" in by["rocket"]["families"], by["rocket"]["matched"]),
                         (True, False, True))

    def test_an_item_enhancement_is_no_class_and_an_accepted_record_counts_equal(self):
        by = self.run_compare([('<itemenhancement id="enh"/>', "Zed Mod"), ('<item id="alt" type="MOD_ELEC" subtype="MOD_COAT"/>', "Zed Coat"),
                               ('<item id="main" type="MOD_POWER" subtype="MOD_EFFICIENCY"/>', "Zed Coat")],
                              [entry("Zed Mod", **{"class": "TOOLS/TOOLS"}), entry("Zed Coat", **{"class": "MOD_POWER/MOD_EFFICIENCY"})],
                              accept={("gz", "alt"): "gz.zed coat"})
        self.assertEqual(("class" in by["enh"]["families"], by["enh"]["cl6_class"]), (False, ""))
        self.assertEqual((by["alt"]["families"]["class"], by["main"]["families"]["class"]), (True, True))
        without = self.run_compare([('<item id="alt" type="MOD_ELEC" subtype="MOD_COAT"/>', "Zed Coat")],
                                   [entry("Zed Coat", **{"class": "MOD_POWER/MOD_EFFICIENCY"})])
        self.assertFalse(without["alt"]["families"]["class"])

    def test_a_rule_option_named_like_an_entry_is_not_matched_to_it(self):
        by = self.run_compare([('<interpretation id="std"/>', "Standard")], [entry("Standard", kind="gear", **{"class": "ELECTRONICS/ID_CREDIT"})])
        self.assertFalse(by["std"]["matched"])

    def test_the_shipped_class_accept_file_is_well_formed(self):
        accept = __import__("tools.cl6check.optional", fromlist=["x"]).load_accept()
        self.assertEqual(accept[("dc", "suncell_electr")], "dc.suncell")
        self.assertIn(("bs", "fangs"), accept)


class ExtraClassTest(unittest.TestCase):
    def test_a_deliberate_extra_class_is_accepted_and_counted_with_the_entries_commlink6_lacks(self):
        from types import SimpleNamespace
        a = canon.canonical(rec('<item id="aaa" type="WEAPON_RANGED" subtype="BOWS"/>', name="Zed Laser")) | {"src": "gz"}
        mine = {"gz": SimpleNamespace(entries=[entry("Zed Laser", kind="weapons", **{"class": "WEAPON_LASER/PISTOLS_LIGHT"}),
                                               entry("Lone", kind="weapons", **{"class": "WEAPON_LASER/RIFLE_ASSAULT"})], book_dir=None)}
        extra = {"WEAPON_LASER/PISTOLS_LIGHT": "x", "WEAPON_LASER/RIFLE_ASSAULT": "x"}
        results, extras, _ = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra=extra)
        self.assertEqual((results[0]["families"]["class"], results[0]["class_via"]), (True, "extra class"))
        m = report.metrics(results, extras, {}, {"jar": "", "ours": "", "when": ""})
        self.assertEqual(m["deliberate_extra_classes"], 2)  # (the matched one and the entry with no record)
        self.assertIn("deliberate extra classes", report.markdown(m))
        none = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0][0]
        self.assertFalse(none["families"]["class"])


class ValueKeepTest(unittest.TestCase):
    def test_a_kept_value_counts_as_printed_for_every_commlink6_record_of_the_entry(self):
        from types import SimpleNamespace
        recs = [canon.canonical(rec(f'<item id="z{i}" cost="{c}"/>', name=f"Zorp ({n})")) | {"src": "gz"}
                for i, (n, c) in enumerate([("Alpha", 100), ("Beta", 200)])]
        mine = {"gz": SimpleNamespace(entries=[entry("Zorp", cost="500")], book_dir=None)}

        def classes(keep):
            res = cli.compare(recs, mine, pdf=False, package=({}, {}, {}), accept={}, keep=keep)[0]
            return [d["class"] for r in res for d in r["diffs"] if d["field"] == "cost"]
        self.assertEqual(classes(set()), ["c", "c"])  # (no book to arbitrate: class c)
        self.assertEqual(classes({("gz", "gear", "gz.zorp", "cost")}), ["b", "b"])

    def test_a_keep_key_may_name_commlink6s_kind_when_ours_is_filed_elsewhere(self):
        from types import SimpleNamespace
        c = canon.canonical(rec('<item id="z0" cost="100"/>', name="Zorp")) | {"src": "gz"}
        mine = {"gz": SimpleNamespace(entries=[entry("Zorp", kind="augmentations", cost="500")], book_dir=None)}
        for key in (("gz", c["kind"], "gz.zorp", "cost"), ("gz", "augmentations", "gz.zorp", "cost")):
            res = cli.compare([c], mine, pdf=False, package=({}, {}, {}), accept={}, keep={key})[0]
            self.assertEqual([d["class"] for d in res[0]["diffs"] if d["field"] == "cost"], ["b"], key)

    def test_an_owner_verdict_holds_only_while_both_values_are_the_ones_ruled_on(self):
        from types import SimpleNamespace
        c = canon.canonical(rec('<item id="z0" cost="100"/>', name="Zorp")) | {"src": "gz"}

        def cls(ours_cost, v):
            mine = {"gz": SimpleNamespace(entries=[entry("Zorp", cost=ours_cost)], book_dir=None)}
            res = cli.compare([c], mine, pdf=False, package=({}, {}, {}), accept={}, keep=set(), verdicts={v})[0]
            return [d["class"] for d in res[0]["diffs"] if d["field"] == "cost"]
        v = ("gz", c["kind"], "z0", "Zorp", "gz.zorp", "cost", "100", "500")
        self.assertEqual(cls("500", v), ["b"])
        self.assertEqual(cls("600", v), ["c"])  # (our value changed: settled again)
        self.assertEqual(cls("500", v[:6] + ("90", "500")), ["c"])  # (Commlink6's changed)
        rows = json.loads(optional_package.KEEP.read_text(encoding="utf8"))["verdicts"]  # (the shipped verdicts are well formed)
        self.assertTrue(rows and all(set(optional_package.VERDICT) | {"page", "reason"} <= set(r) for r in rows))
