"""The Commlink6 comparison tool (tools/cl6check) on invented data: a made-up jar, invented records and invented
entries. No Commlink6 data, no book text: every name, id and number here is made up."""
import io
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from contextlib import redirect_stdout

from tools.cl6check import __main__ as cli
from tools.cl6check import canon, fields, match, modifiers, ours, patterns, reader, report

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
        d = self.cmp(x, cost="10", avail="2,500¥")[1]
        self.assertEqual(d[0]["why"], "ours holds a price (columns shifted)")
        self.assertNotIn("legality", self.cmp(x, cost="10", avail="—")[0])  # an empty avail is the avail's diff

    def test_ammo_with_what_else_it_draws_on(self):
        c = {"fields": {"ammo": "20(c)"}, "tag": "item"}  # (a canonical record's ammo field, invented)
        self.assertEqual(fields.compare(c, entry("Zorp", kind="weapons", ammo="20(c) + Energy")), (["ammo"], []))
        self.assertEqual(len(fields.compare(c, entry("Zorp", kind="weapons", ammo="30(c) + Energy"))[1]), 1)

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
        self.assertEqual(got["Grenade, Party"], ("alias", ["Party grenade"]))
        self.assertEqual(got["Zorp buoy"], ("loose", ["Zorp Buoys"]))
        self.assertEqual(got["Transgenic Gills"], ("contained", ["Gills"]))
        self.assertEqual(got["Nothing like it"], ("", []))


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
