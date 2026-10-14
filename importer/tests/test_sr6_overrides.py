"""Brand headings, the per-book override tables, and the cl6check matching rules of 2026-10-13. Every name here is
invented."""
import json
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET

from importer.sr6 import overrides, regroup
from importer.sr6.recipes import fs
from importer.tests.test_cl6check import entry
from tools.cl6check import canon, match

BRANDS = """<!-- page 10 -->
# WEAPONS RACK
## Melee Weapons
### Exotic Melee Weapons
#### Qux Rampart Shield
A made-up shield, braced on the arm.
##### qux rampart shield
| ITEM | DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Mk1 | +1 | –1 | 4 | 2 | 100¥ |
| Mk2 | +2 | –1 | 6 | 3 | 200¥ |
#### Qux Spark Lamp
A made-up lamp.
#### Zed Defense-Com Weapons
Zed sells made-up weapons.
##### defense-com weapons
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Garotte | 2P | 7/—/—/—/— | 3(L) | 125¥ |
| Holdout | 3P | 6/—/—/—/— | 4(L) | 300¥ |
#### Zed Spark Gun
Another made-up Zed item.
"""


def weapons(md):
    regrouped, _ = regroup.regroup(md, fs.ALIASES, name_headers=fs.NAME_HEADERS, end_page=150)
    xml = fs.extract(regrouped).files["weapons.xml"]
    return {e.findtext("name"): (e.attrib, [a.text for a in e.findall("alias")]) for e in ET.fromstring(xml.encode())}


class BrandHeadingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.w = weapons(BRANDS)

    def test_a_heading_titling_its_table_is_the_brand_when_its_first_word_is_a_maker(self):
        a, al = self.w["Mk1"]  # (the printed name stays; the heading and the maker are on the row)
        self.assertEqual((a["group"], a["maker"]), ("Qux Rampart Shield", "Qux"))
        self.assertEqual([x.lower() for x in al], ["qux rampart shield mk1"])

    def test_a_type_table_under_a_makers_heading_is_read(self):
        a, al = self.w["Zed Defense-Com Garotte"]  # (TYPE rows: items; the brand's own name for it an alias)
        self.assertEqual(a["maker"], "Zed Defense-Com Weapons")
        self.assertEqual(al, ["Defense-Com Garotte", "Zed Garotte"])

    def test_a_type_table_under_a_heading_with_no_maker_is_left_to_the_recipe(self):
        md = BRANDS.replace("Zed Defense-Com Weapons", "Defense-Com Weapons").replace("Zed Spark Gun", "Spark Gun")
        self.assertNotIn("Defense-Com Garotte", weapons(md))


class OverridesTest(unittest.TestCase):
    XML = ('<?xml version="1.0" encoding="UTF-8"?>\n<d kind="gear"><gear id="a"><name>Real Name</name><alias>Old</alias>'
           '<text/></gear><gear id="b"><name>Other</name></gear></d>\n')
    ROWS = [{"cl6": "Odd Name", "kind": "gear", "ours": ["real name", "Missing"], "set": {"cost": "5"}}]

    def test_the_cl6_name_becomes_an_alias_and_a_value_is_set(self):
        out = overrides.apply("zz", {"gear.xml": self.XML}, self.ROWS)["gear.xml"]
        e = ET.fromstring(out.encode())
        a = e.find("gear")
        self.assertEqual(([x.text for x in a.findall("alias")], a.get("cost")), (["Old", "Odd Name"], "5"))
        self.assertEqual([x.tag for x in a], ["name", "alias", "alias", "text"])
        self.assertIsNone(e[1].get("cost"))
        self.assertEqual(overrides.apply("zz", {"gear.xml": out}, self.ROWS)["gear.xml"], out)  # (again: no 2nd alias)

    def test_no_table_changes_nothing_and_a_description_is_refused(self):
        self.assertEqual(overrides.apply("zz", {"gear.xml": self.XML}), {"gear.xml": self.XML})
        with self.assertRaises(ValueError):
            overrides.apply("zz", {}, [{"cl6": "x", "kind": "gear", "ours": ["y"], "set": {"description": "t"}}])

    def test_every_shipped_table_is_well_formed_and_sets_no_text(self):
        for p in overrides.DIR.glob("*.json"):
            for r in json.loads(p.read_text(encoding="utf8")):
                self.assertTrue(({"cl6", "kind"} <= set(r) or "move_kind" in r) and (r.get("ours") or r.get("add") or r.get("id") or r.get("merge") or r.get("move_kind")), (p.name, r))
            overrides.table(p.stem)  # (raises on a description field)


def cl6(name, page="10", kind="gear", **more):
    return {"name": name, "page": page, "kind": kind, "pool": (kind,), "aliases": canon.aliases(name, {}), **more}


def got(records, mine):
    return {c["name"]: (how, [o["name"] for o in hits]) for c, hits, how in match.match(records, mine)}


class MatchRulesTest(unittest.TestCase):
    def test_numerals_hold_out_and_smg_are_spelled_alike(self):
        self.assertEqual(match.n1("Guizhen I Shields"), match.n1("Guizhen 1 Shields"))
        self.assertEqual(match.n1("Ares Predator VI"), match.n1("Ares Predator 6"))
        self.assertEqual(match.n1("Hold-out Pistol"), match.n1("Holdout Pistol"))
        self.assertEqual(match.n1("Implanted SMG"), match.n1("Implanted Submachine Gun"))
        self.assertNotEqual(match.n1("Ares Predator V"), match.n1("Ares Predator VI"))

    def test_the_makers_and_groups_words_are_left_out_of_both_names(self):
        mine = [entry("Party Grenade", page="90", maker="Krime")]  # (far from the record: not the contained stage)
        self.assertEqual(got([cl6("Krime Party Grenade")], mine)["Krime Party Grenade"][0], "unbranded")

    def test_the_contained_stage_reads_the_records_aliases(self):
        mine = [entry("Krime Party (Frag)", maker="Krime"), entry("Krime Spark (Flash)", maker="Krime")]
        self.assertEqual(got([cl6("Grenade, Party")], mine)["Grenade, Party"], ("contained", ["Krime Party (Frag)"]))

    def test_names_ninety_percent_alike_match_but_not_with_other_numbers(self):
        mine = [entry("Zorp Missile Launcher"), entry("Zorp Model 7"), entry("Gizmo Model 70")]
        r = got([cl6("Zorp Missle Launcher"), cl6("Zorp Model 9"), cl6("Gizmo Model 7")], mine)
        self.assertEqual(r["Zorp Missle Launcher"][1], ["Zorp Missile Launcher"])
        self.assertTrue(r["Zorp Missle Launcher"][0].startswith("similar"))
        # (the digits differ: 0.9 alike, still two items; the new stage leaves them)
        self.assertFalse(r["Zorp Model 9"][0].startswith("similar") or r["Gizmo Model 7"][0].startswith("similar"))

    def test_the_same_name_in_another_kind_is_a_match_only_when_exact(self):
        mine = [entry("Rigger Console", kind="augmentations"), entry("Rigger Consoles Plus", kind="augmentations")]
        r = got([cl6("Rigger Console")], mine)
        self.assertEqual(r["Rigger Console"][1], ["Rigger Console"])
        near = got([cl6("Rigger Consol")], [entry("Rigger Console Z", kind="augmentations")])
        self.assertEqual(near["Rigger Consol"][1], [])


class PseudoRecordTest(unittest.TestCase):
    def test_table_cells_are_commlink6_only_when_priced_at_nothing(self):
        for name in ("SS(1-2)", "BF(4)", "Pilot 3", "12 km", "Uses 2 Energy per shot", "Crew Served (2)"):
            self.assertTrue(canon.cl6_only("gear", name, {"price": "0"}, "item"), name)
        self.assertFalse(canon.cl6_only("gear", "Pilot 3", {"price": "300"}, "item"))  # (guarded by the price)
        self.assertFalse(canon.cl6_only("gear", "Pilot Program", {"price": "0"}, "item"))
        self.assertFalse(canon.cl6_only("gear", "Kalte Munition", {}, "item"))  # (German names are entries now: importer/sr6/overrides/dod.json)


if __name__ == "__main__":
    unittest.main()


class AddTest(unittest.TestCase):
    ROW = {"cl6": "Zork Kit", "kind": "gear", "add": {"page": 7, "attrs": {"category": "Biotech", "avail": "1", "cost": "5"},
           "kids": [{"tag": "effect", "attrs": {"target": "item:concealability", "op": "add", "value": "1"}}]}}

    def test_add_creates_the_entry_once_and_writes_no_text(self):
        out = overrides.apply("zz", {}, [self.ROW])["gear.xml"]
        e = ET.fromstring(out.encode())
        self.assertEqual((e.get("kind"), len(e)), ("gear", 1))
        g = e[0]
        self.assertEqual((g.tag, g.get("id"), g.get("source"), g.get("page"), g.findtext("name")), ("gear", "zork-kit", "ZZ", "7", "Zork Kit"))
        self.assertEqual([c.tag for c in g], ["name", "effect"])  # (no <text>)
        self.assertEqual(overrides.apply("zz", {"gear.xml": out}, [self.ROW])["gear.xml"], out)  # again: no duplicate

    def test_add_to_an_existing_file_keeps_its_entries_and_a_description_or_no_page_is_refused(self):
        xml = OverridesTest.XML
        out = overrides.apply("zz", {"gear.xml": xml}, [self.ROW])["gear.xml"]
        self.assertEqual([x.get("id") for x in ET.fromstring(out.encode())], ["a", "b", "zork-kit"])
        for bad in ({**self.ROW["add"], "text": "t"}, {**self.ROW["add"], "attrs": {"description": "t"}},
                    {**self.ROW["add"], "kids": [{"tag": "text"}]}, {"attrs": {}}):
            with self.assertRaises(ValueError):
                overrides.apply("zz", {}, [{**self.ROW, "add": bad}])

    def test_every_added_entry_of_the_real_tables_is_schema_valid(self):
        from pathlib import Path
        from lxml import etree
        schemas = Path(__file__).resolve().parents[2] / "public" / "data" / "sr6" / "schema"
        n = 0
        for p in overrides.DIR.glob("*.json"):
            for r in (r for r in overrides.table(p.stem) if "add" in r):
                out = overrides.apply(p.stem, {}, [r])[f"{r['kind']}.xml"]
                xsd = etree.XMLSchema(etree.parse(str(schemas / f"{r['kind']}.xsd")))
                doc = etree.fromstring(out.encode())
                self.assertTrue(xsd.validate(doc), f"{p.stem} {r['cl6']}: {xsd.error_log}")
                n += 1
        self.assertGreaterEqual(n, 19)


class LowerCaseHeadingTest(unittest.TestCase):
    def test_a_lone_lower_case_letter_before_a_capitalised_word_is_a_name_not_a_caption(self):
        self.assertFalse(regroup._is_label(4, "x Guide Override"))  # (the converter's split of `xGuide`)
        self.assertTrue(regroup._is_label(4, "r EVO lution Arms"))  # (a split brand stays a caption)
        self.assertTrue(regroup._is_label(4, "iron bear combat axe"))


class ActionAndPolearmRowsTest(unittest.TestCase):
    def test_the_new_action_rows_validate_as_actions(self):
        acts = overrides.apply("crb", {}, [r for r in overrides.table("crb") if r["kind"] == "actions"])["actions.xml"]
        self.assertEqual([(e.get("id"), e.get("type")) for e in ET.fromstring(acts.encode())], [("compile-sprite", "major"), ("decompile-sprite", "major")])

    def test_the_da_table_gives_the_four_polearm_rows_the_cougar_brand(self):
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n<d kind="weapons">' + "".join(
            f'<weapon id="da.{n.lower()}" source="DA" page="47"><name>{n}</name></weapon>' for n in ("Knife", "One-hand", "Spear", "Pike")) + "</d>\n"
        out = ET.fromstring(overrides.apply("da", {"weapons.xml": xml})["weapons.xml"].encode())
        self.assertEqual([(e.findtext("name"), [a.text for a in e.findall("alias")]) for e in out],
                         [(n, [f"Cougar Polearm ({n})"]) for n in ("Knife", "One-hand", "Spear", "Pike")])


class TextFromTest(unittest.TestCase):
    FILES = {"rules.xml": '<d kind="rules"><rule id="zz-heading" page="1"><name>Zork a Thing</name></rule></d>'}
    TEXTS = '<?xml version="1.0"?>\n<sr6:data xmlns:sr6="urn:x" kind="texts" version="1">\n  <text of="rules" id="zz-heading">Invented body.\n• item one</text>\n</sr6:data>\n'
    ROW = {"cl6": "Zork Thing", "kind": "actions", "add": {"page": 3, "attrs": {"type": "major"}, "text_from": "Zork a Thing"}}

    def test_an_added_entry_takes_the_text_the_book_has_under_the_named_heading(self):
        out = overrides.texts("zz", self.FILES, self.TEXTS, [self.ROW])
        got = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(out.encode())}
        self.assertEqual(got[("actions", "zork-thing")], "Invented body.\n• item one")
        self.assertEqual(overrides.texts("zz", self.FILES, out, [self.ROW]), out)  # (again: no second text)
        self.assertEqual(overrides.texts("zz", self.FILES, None, [self.ROW]), None)
        gone = {**self.ROW, "add": {**self.ROW["add"], "text_from": "No Such Heading"}}
        self.assertEqual(overrides.texts("zz", self.FILES, self.TEXTS, [gone]), self.TEXTS)  # (nothing invented)

    def test_text_from_is_a_name_not_text(self):
        with self.assertRaises(ValueError):
            overrides.apply("zz", {}, [{**self.ROW, "add": {**self.ROW["add"], "text_from": "line one\nline two"}}])


MODS = """<!-- page 10 -->
# GEAR
## Weapon Modification
#### Zed Charm
A made-up charm for a made-up game.
##### zed charm
| TYPE | AVAIL | COST |
|---|---|---|
| Zed Token | 5 | 55¥ |
| Lucky Charm | 5 | 60¥ |
#### Plain Oddity
A made-up oddity, in a regular or orichalcum finish.
##### modifications
| TYPE | AVAIL | COST |
|---|---|---|
| Regular | 5(L) | 325¥ |
| Orichalcum | 7(L) | 7,500¥ |
"""


class RowsUnderAHeadingTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        regrouped, _ = regroup.regroup(MODS, fs.ALIASES, name_headers=fs.NAME_HEADERS, end_page=150)
        cls.gear = {e.findtext("name"): e.attrib for e in ET.fromstring(fs.extract(regrouped).files["gear.xml"].encode())}

    def test_rows_naming_themselves_with_a_word_of_the_heading_are_grouped_under_it(self):  # (G4: Liar's Medium)
        self.assertEqual(self.gear["Zed Token"].get("group"), "Zed Charm")
        self.assertEqual(self.gear["Lucky Charm"].get("group"), "Zed Charm")

    def test_a_type_table_titled_modifications_gives_the_heading_its_versions(self):  # (G8: Hunter's Alloy)
        self.assertIn("Plain Oddity (Regular)", self.gear)
        self.assertEqual(self.gear["Plain Oddity (Orichalcum)"].get("cost"), "7500")


class ClassTest(unittest.TestCase):
    XML = ('<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by the importer (recipe sr6 zz). -->\n<d kind="gear">'
           '<gear id="zz.a" source="ZZ" page="1" category="Zorp"><name>A</name></gear>'
           '<gear id="zz.b" source="ZZ" page="1" category="Zorp" class="OWN/KEPT"><name>B</name></gear>'
           '<gear id="zz.c" source="ZZ" page="1" category="Other"><name>C</name></gear></d>\n')
    CATS = ('<?xml version="1.0" encoding="UTF-8"?>\n<d kind="categories"><category id="zz.gear.zorp" source="ZZ" page="1" of="gear">'
            '<name>Zorp</name></category></d>\n')
    MAP = {"gear": {"Zorp": "TOOLS/TOOLS"}}

    def test_the_category_map_gives_class_to_its_entries_and_never_overwrites_one_they_have(self):
        from importer.sr6 import classes
        out = classes.apply({"gear.xml": self.XML, "categories.xml": self.CATS}, self.MAP)
        got = {e.get("id"): e.get("class") for e in ET.fromstring(out["gear.xml"].encode())}
        self.assertEqual(got, {"zz.a": "TOOLS/TOOLS", "zz.b": "OWN/KEPT", "zz.c": None})  # (Other: no class invented)
        self.assertEqual(ET.fromstring(out["categories.xml"].encode())[0].get("class"), "TOOLS/TOOLS")
        self.assertIn("Generated by the importer", out["gear.xml"])  # (the header comment stays)
        self.assertEqual(classes.apply({"gear.xml": self.XML}, {}), {"gear.xml": self.XML})

    def test_an_id_row_sets_class_only_and_an_unknown_id_is_reported_not_guessed(self):
        rows = [{"cl6": "A", "kind": "gear", "id": "zz.a", "set": {"class": "ELECTRONICS/IMAGING"}},
                {"cl6": "Z", "kind": "gear", "id": "zz.nope", "set": {"class": "X/Y"}}]
        out = ET.fromstring(overrides.apply("zz", {"gear.xml": self.XML}, rows)["gear.xml"].encode())
        self.assertEqual([e.get("class") for e in out], ["ELECTRONICS/IMAGING", "OWN/KEPT", None])
        for bad in ({"class": "a b"}, {"cost": "1"}, {"description": "t"}):
            with self.assertRaises(ValueError):
                overrides.apply("zz", {}, [{"cl6": "A", "kind": "gear", "id": "zz.a", "set": bad}])

    def test_the_category_map_generator_keeps_clear_categories_with_a_class(self):
        import csv
        import tempfile
        from tools.cl6check import classmap
        head = ["kind", "category", "majority_cl6", "status"]
        rows = [["gear", "Zorp", "TOOLS/TOOLS", "CLEAR"], ["gear", "Mixed", "TOOLS/TOOLS", "MIXED"], ["gear", "Blank", "", "CLEAR"],
                ["armor", "Coat", "ARMOR/ARMOR_BODY", "CLEAR"], ["rules", "Oddly", "X/Y", "CLEAR"]]
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8-sig") as f:
            csv.writer(f).writerows([head] + rows)
        self.assertEqual(classmap.category_map(f.name), {"armor": {"Coat": "ARMOR/ARMOR_BODY"}, "gear": {"Zorp": "TOOLS/TOOLS"}})

    def test_the_shipped_map_and_every_class_in_the_override_tables_are_class_keys(self):
        import re
        from importer.sr6 import classes
        key = re.compile(r"[A-Za-z0-9_]+(/[A-Za-z0-9_]+)?")
        m = classes.table()
        self.assertGreater(sum(len(v) for v in m.values()), 200)
        self.assertTrue(all(key.fullmatch(c) for v in m.values() for c in v.values()))
        rows = [r for p in overrides.DIR.glob("*.json") for r in overrides.table(p.stem) if "id" in r and "set" in r and r.get("gen") not in ("value", "family")]
        self.assertGreater(len(rows), 500)
        self.assertTrue(all(key.fullmatch(r["set"]["class"]) and r.get("gen") in ("class", None) for r in rows))

    def test_class_validates_on_an_entry_of_every_kind_that_carries_one(self):
        from pathlib import Path
        from lxml import etree
        schemas = Path(__file__).resolve().parents[2] / "public" / "data" / "sr6" / "schema"
        tags = {"weapons": "weapon", "armor": "armor", "augmentations": "augmentation", "electronics": "device",
                "gear": "gear", "vehicles": "vehicle", "programs": "program", "spells": "spell", "ammotypes": "ammotype"}
        need = {"weapons": 'category="Blade"', "armor": 'category="Body"', "augmentations": 'category="Cyberware" type="cyberware"',
                "electronics": 'category="Commlink"', "gear": 'category="Tool"', "vehicles": 'category="Car"',
                "programs": 'type="basic"', "spells": 'category="combat"', "ammotypes": ""}
        for kind, tag in tags.items():
            xml = (f'<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="{kind}" version="1"><{tag} id="zz.a" source="ZZ" page="1" '
                   f'{need[kind]} class="TYPE/SUB_TYPE"><name>A</name></{tag}></sr6:data>')
            xsd = etree.XMLSchema(etree.parse(str(schemas / f"{kind}.xsd")))
            self.assertTrue(xsd.validate(etree.fromstring(xml.encode())), f"{kind}: {xsd.error_log}")
            self.assertFalse(xsd.validate(etree.fromstring(xml.replace("TYPE/SUB_TYPE", "a b").encode())))


class HandClassRowsTest(unittest.TestCase):
    WANT = {("crb", "gear", "standard"): "ELECTRONICS/ID_CREDIT", ("crb", "weapons", "smartgun-system-internal"): "ACCESSORY/WEAPON_ACCESSORY",
            ("crb-sea", "armor", "ballistic-hood"): "ARMOR/ARMOR_HELMET", ("da", "weapons", "al-assad"): "WEAPON_SPECIAL/LAUNCHERS",
            ("da", "weapons", "ballista-ii"): "WEAPON_SPECIAL/LAUNCHERS", ("da", "weapons", "carl-gustaf"): "WEAPON_SPECIAL/LAUNCHERS",
            ("sif-no", "gear", "uv-light-uv-flashlight"): "TOOLS/TOOLS"}

    def test_the_owners_class_decisions_are_hand_rows_the_generator_leaves_alone(self):
        from tools.cl6check import classmap
        got = {(p.stem, r["kind"], r["id"]): r["set"]["class"] for p in overrides.DIR.glob("*.json")
               for r in overrides.table(p.stem) if "id" in r and "set" in r and not r.get("gen")}
        self.assertEqual({k: got.get(k) for k in self.WANT}, self.WANT)
        self.assertLessEqual(set(self.WANT), classmap.hand_ids())

    def test_the_generator_skips_a_hand_row_and_a_record_with_no_class(self):
        from tools.cl6check import classmap
        o = {"src": "zz", "kind": "gear", "id": "zz.a", "name": "A", "attrs": {"category": "Odd"}}
        pairs = [({"cl6_class": "X/Y", "name": "A"}, o), ({"cl6_class": "", "name": "B"}, {**o, "id": "zz.b", "name": "B"})]
        self.assertEqual(classmap.item_rows(pairs, {}, frozenset())[0]["zz"], [{"cl6": "A", "kind": "gear", "id": "a", "set": {"class": "X/Y"}, "gen": "class"}])
        self.assertEqual(dict(classmap.item_rows(pairs, {}, frozenset({("zz", "gear", "a")}))[0]), {})

    def test_the_rigger_program_encryption_is_its_own_entry_with_its_class(self):
        row = next(r for r in overrides.table("crb") if r["kind"] == "programs" and r["add"].get("id") == "encryption-rcc")
        out = ET.fromstring(overrides.apply("crb", {}, [row])["programs.xml"].encode())[0]
        self.assertEqual((out.get("id"), out.findtext("name"), out.get("class"), out.get("cost")), ("encryption-rcc", "Encryption", "SOFTWARE/RIGGER_PROGRAM", "250"))


class ConsensusClassRowsTest(unittest.TestCase):
    CSV = Path(__file__).resolve().parents[2] / ".extract" / "class-patterns" / "consensus_rows.csv"

    def test_every_consensus_class_is_a_hand_row_in_its_sources_table(self):
        import csv
        if not self.CSV.is_file():
            self.skipTest("the consensus csv is the owner's local study")
        have = {(p.stem, r["kind"], r["id"]): r["set"]["class"] for p in overrides.DIR.glob("*.json")
                for r in overrides.table(p.stem) if "id" in r and "set" in r and not r.get("gen")}
        rows = list(csv.DictReader(open(self.CSV, encoding="utf-8-sig")))
        self.assertEqual(len(rows), 287)
        missing = [r["our_id"] for r in rows if have.get((r["src"], r["kind"], r["our_id"][len(r["src"]) + 1:])) != r["class"]]
        self.assertEqual(missing, [])

    def test_no_class_row_is_listed_twice_in_a_table(self):
        for p in overrides.DIR.glob("*.json"):
            keys = [(r["kind"], r["id"], r.get("gen"), tuple(k for k in ("set", "remove", "rename") if k in r)) for r in overrides.table(p.stem) if "id" in r]
            self.assertEqual(len(keys), len(set(keys)), p.name)


class SectionClassTest(unittest.TestCase):
    RULES = [{"src": "zz", "kinds": ["gear"], "pages": [10, 20], "class": "CRITTERWARE/AUGMENTATION"}]
    XML = ('<?xml version="1.0" encoding="UTF-8"?>\n<d kind="gear">'
           '<gear id="zz.in" source="ZZ" page="10" category="Zorp"><name>In</name></gear>'
           '<gear id="zz.had" source="ZZ" page="20" category="Zorp" class="BIOWARE/BIOWARE_STANDARD"><name>Had</name></gear>'
           '<gear id="zz.none" source="ZZ" page="15" category="Other"><name>None</name></gear>'
           '<gear id="zz.out" source="ZZ" page="21" category="Zorp"><name>Out</name></gear></d>\n')

    def test_a_sections_entries_all_take_its_class_whatever_they_had_and_others_are_left(self):
        from importer.sr6 import classes
        out = classes.apply({"gear.xml": self.XML}, {"gear": {"Zorp": "TOOLS/TOOLS"}}, "zz", self.RULES)
        got = {e.get("id"): e.get("class") for e in ET.fromstring(out["gear.xml"].encode())}
        self.assertEqual(got, {"zz.in": "CRITTERWARE/AUGMENTATION", "zz.had": "CRITTERWARE/AUGMENTATION",
                               "zz.none": "CRITTERWARE/AUGMENTATION", "zz.out": "TOOLS/TOOLS"})  # (an unclassed one in range is filled)
        other = classes.apply({"gear.xml": self.XML}, {}, "yy", self.RULES)  # (another source: not its section)
        self.assertEqual(other, {"gear.xml": self.XML})

    def test_the_shipped_section_rule_and_its_extra_class_agree(self):
        import json
        import re
        from importer.sr6 import classes
        extra = json.loads(classes.EXTRA.read_text(encoding="utf8"))
        for r in classes.prefixes():
            self.assertIn(r["class"], extra)
            self.assertTrue(re.fullmatch(r"[A-Za-z0-9_]+(/[A-Za-z0-9_]+)?", r["class"]))
        self.assertEqual([(r["src"], r["pages"]) for r in classes.prefixes()], [("bs", [134, 166])])

    def test_cl6check_accepts_a_section_class_whatever_commlink6s_is(self):
        from types import SimpleNamespace
        from importer.tests.test_cl6check import rec, entry
        from tools.cl6check import __main__ as cli, canon
        a = canon.canonical(rec('<item id="aaa" type="BIOWARE" subtype="BIOWARE_STANDARD"/>', name="Beast Eye", book="bs")) | {"src": "gz"}
        mine = {"gz": SimpleNamespace(entries=[entry("Beast Eye", kind="gear", page="15", **{"class": "CRITTERWARE/AUGMENTATION"})], book_dir=None)}
        rules = [{"src": "gz", "kinds": ["gear"], "pages": [10, 20], "class": "CRITTERWARE/AUGMENTATION"}]
        r = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=rules)[0][0]
        self.assertEqual((r["families"]["class"], r.get("class_via")), (True, "section class"))
        r = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0][0]
        self.assertFalse(r["families"]["class"])


class StructureOpsTest(unittest.TestCase):
    GEAR = ('<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by the importer. -->\n<d kind="gear">'
            '<gear id="zz.a" source="ZZ" page="1" category="Branded weapon" avail="4" cost="9" capacity="2" class="WEAPON_CLOSE_COMBAT/CLUBS"><name>Alpha</name><alias>Old</alias></gear>'
            '<gear id="zz.b" source="ZZ" page="1" category="Tool"><name>Beta</name></gear>'
            '<gear id="zz.dup" source="ZZ" page="1" category="Tool"><name>Dup</name><alias>Dupe</alias></gear></d>\n')
    WEAPONS = ('<?xml version="1.0" encoding="UTF-8"?>\n<d kind="weapons">'
               '<weapon id="zz.a" source="ZZ" page="1" category="New powered weapon" type="Chain" dv="4P" ar="9/—/—/—/—" avail="7" class="X/Y"><name>Alpha</name></weapon>'
               '<weapon id="zz.w" source="ZZ" page="2" category="Blade"><name>W</name></weapon></d>\n')
    TEXTS = ('<?xml version="1.0"?>\n<sr6:data xmlns:sr6="urn:x" kind="texts" version="1">\n  <text of="gear" id="zz.dup">Invented.</text>\n'
             '  <text of="gear" id="zz.b">Kept.</text>\n</sr6:data>\n')

    def run_ops(self, rows, files=None):
        return overrides.apply("zz", files or {"gear.xml": self.GEAR, "weapons.xml": self.WEAPONS}, rows)

    @staticmethod
    def ids(xml):
        return [(e.get("id"), e.findtext("name")) for e in ET.fromstring(xml.encode())]

    def test_remove_deletes_the_entry_and_its_text_and_is_idempotent_and_logs_a_missing_id(self):
        rows = [{"cl6": "Dup", "kind": "gear", "id": "zz.dup", "remove": True}, {"cl6": "N", "kind": "gear", "id": "zz.nope", "remove": True}]
        out = self.run_ops(rows)
        self.assertEqual(self.ids(out["gear.xml"]), [("zz.a", "Alpha"), ("zz.b", "Beta")])
        self.assertNotIn("Dupe", out["gear.xml"])  # (its aliases went with it)
        self.assertIn("Generated by the importer", out["gear.xml"])
        self.assertEqual(self.run_ops(rows, out), out)  # again: nothing more
        t = overrides.texts("zz", out, self.TEXTS, rows)
        self.assertEqual([(x.get("id"), x.text) for x in ET.fromstring(t.encode())], [("zz.b", "Kept.")])

    def test_merge_copies_the_attributes_the_target_lacks_and_removes_the_copy(self):
        rows = [{"cl6": "Alpha", "kind": "gear", "merge": {"into": "zz.a", "from": "zz.a", "from_kind": "weapons"}}]
        out = self.run_ops(rows)
        a = ET.fromstring(out["gear.xml"].encode())[0]
        self.assertEqual((a.get("type"), a.get("dv"), a.get("avail"), a.get("category"), a.get("class")),
                         ("Chain", "4P", "4", "Branded weapon", "WEAPON_CLOSE_COMBAT/CLUBS"))  # (what it had stays)
        self.assertEqual(self.ids(out["weapons.xml"]), [("zz.w", "W")])
        self.assertEqual(self.run_ops(rows, out), out)  # again: both gone or merged, logged, nothing changed

    def test_rename_sets_the_name_keeps_the_old_one_as_an_alias_and_is_idempotent(self):
        rows = [{"cl6": "N", "kind": "gear", "id": "zz.b", "rename": "Beta (Big)"}, {"cl6": "N", "kind": "gear", "id": "zz.dup", "rename": "Dup 2", "alias": False}]
        out = self.run_ops(rows)
        e = {x.get("id"): x for x in ET.fromstring(out["gear.xml"].encode())}
        self.assertEqual((e["zz.b"].findtext("name"), [a.text for a in e["zz.b"].findall("alias")]), ("Beta (Big)", ["Beta"]))
        self.assertEqual([a.text for a in e["zz.dup"].findall("alias")], ["Dupe"])  # (no alias of the old name)
        self.assertEqual(self.run_ops(rows, out), out)
        with self.assertRaises(ValueError):
            self.run_ops([{"cl6": "N", "kind": "gear", "id": "zz.b", "rename": "two\nlines"}])

    def test_move_kind_files_a_gear_entry_as_a_close_combat_weapon_and_leaves_one_the_target_has(self):
        rows = [{"cl6": "Alpha", "move_kind": {"id": "zz.b", "from": "gear", "to": "weapons"}},
                {"cl6": "A", "move_kind": {"id": "zz.a", "from": "gear", "to": "weapons"}}]
        out = self.run_ops(rows)
        self.assertEqual([i for i, _ in self.ids(out["gear.xml"])], ["zz.a", "zz.dup"])  # (zz.a: the weapons file has it: left)
        w = {x.get("id"): x for x in ET.fromstring(out["weapons.xml"].encode())}
        self.assertEqual((w["zz.b"].tag, w["zz.b"].get("skill"), w["zz.b"].get("category")), ("weapon", "Close Combat", "Tool"))
        solo = self.run_ops([{"cl6": "Alpha", "move_kind": {"id": "zz.a", "from": "gear", "to": "weapons"}}], {"gear.xml": self.GEAR})
        a = ET.fromstring(solo["weapons.xml"].encode())[0]
        self.assertEqual((a.get("spec"), a.get("capacity"), a.get("cost"), a.get("class")), ("Clubs", None, "9", "WEAPON_CLOSE_COMBAT/CLUBS"))
        self.assertEqual(self.run_ops(rows, out), out)

    def test_no_op_names_a_description_field(self):
        for bad in ({"cl6": "x", "kind": "gear", "merge": {"into": "a", "from": "b", "description": "t"}},
                    {"cl6": "x", "move_kind": {"id": "a", "from": "gear", "to": "weapons", "text": "t"}}):
            with self.assertRaises(ValueError):
                self.run_ops([bad])

    def test_the_decisions_are_in_the_tables_and_every_class_is_known(self):
        import json as j
        extra = j.loads((overrides.DIR.parent / "classes" / "extra_classes.json").read_text(encoding="utf8"))
        for k in ("CRITTERWARE/AUGMENTATION", "CRITTERWARE/GEAR", "DRONE_SMALL/SPACE", "DRONE_LARGE/SPACE", "VEHICLES/SPACE_BIKES",
                  "VEHICLES/SPACE_BOARDS", "WEAPON_LASER", "WEAPON_LASER/PISTOLS_LIGHT", "WEAPON_LASER/PISTOLS_MEDIUM",
                  "WEAPON_LASER/PISTOLS_HEAVY", "WEAPON_LASER/SUBMACHINE_GUNS_LIGHT", "WEAPON_LASER/SUBMACHINE_GUNS_MEDIUM",
                  "WEAPON_LASER/RIFLE_ASSAULT", "WEAPON_LASER/ASSAULT_CANNON"):
            self.assertIn(k, extra)
        t = lambda s: overrides.table(s)  # noqa: E731
        self.assertEqual(sum(1 for r in t("lhv") if "move_kind" in r), 14)
        self.assertEqual(sum(1 for r in t("lhv") if "merge" in r), 4)
        self.assertEqual({r["id"] for s in ("thn", "lhv", "so", "tne", "wl", "sif-no") for r in t(s) if r.get("remove")},
                         {"knight-errant-swat-officers", "toxins-drugs-and-diseases.scourge", "grooming-1-hour", "grooming-2-hours", "special-notes",
                          "negative-quality", "positive-quality", "trained-command", "ammunition"})
        self.assertEqual({r["rename"] for s in ("bs", "sco", "fpt") for r in t(s) if "rename" in r},
                         {"Biosprayer (Blind)", "Biosprayer (Confused)", "Biosprayer (Nauseated)", "Biosprayer (Dazed)",
                          "Power hammer (Double-sided)", "Power maul (Double-sided)", "Pocket Secretary ’85"})


class LatestDecisionsTest(unittest.TestCase):
    def test_the_whole_critter_chapter_is_one_class_and_the_chainblade_duplicate_goes(self):
        import json as j
        from importer.sr6 import classes
        self.assertNotIn("CRITTERWARE/CYBER_BODYWARE", classes.extra())
        bs = overrides.table("bs")
        self.assertEqual([r["id"] for r in bs if r.get("id") in {"spikes-module", "turret-mount-small", "turret-mount-large"} and "set" in r], [])
        xml = ('<?xml version="1.0"?>\n<d kind="augmentations"><augmentation id="bs.x" source="BS" page="140" type="cyberware" category="Odd" '
               'class="CRITTERWARE/CYBER_BODYWARE"><name>X</name></augmentation></d>\n')
        out = classes.apply({"augmentations.xml": xml}, {}, "bs")["augmentations.xml"]  # (the shipped section rule)
        self.assertEqual(ET.fromstring(out.encode())[0].get("class"), "CRITTERWARE/AUGMENTATION")
        sco = overrides.table("sco")
        self.assertIn({"cl6": "Chainblade", "kind": "gear", "id": "chainblade", "remove": True}, sco)
        self.assertTrue(any(r.get("kind") == "weapons" and r.get("id") == "chainblade" and r["set"]["class"] == "WEAPON_CLOSE_COMBAT/BLADES" for r in sco if "set" in r))
        self.assertFalse(any(r.get("move_kind", {}).get("id") == "chainblade" for r in sco))


class ArmorToGearMoveTest(unittest.TestCase):
    def test_move_kind_files_an_armor_entry_as_gear_dropping_the_armor_only_attributes(self):
        armor = ('<?xml version="1.0"?>\n<d kind="armor"><armor id="zz.suit" source="ZZ" page="78" category="Spacesuit" defense="—" social="+1" '
                 'capacity="2" avail="3" cost="1000" class="SURVIVAL/SURVIVAL_GEAR"><name>Suit</name></armor></d>\n')
        rows = [{"cl6": "Suit", "move_kind": {"id": "zz.suit", "from": "armor", "to": "gear"}}]
        out = overrides.apply("zz", {"armor.xml": armor}, rows)
        g = ET.fromstring(out["gear.xml"].encode())[0]
        self.assertEqual((g.tag, g.get("defense"), g.get("social"), g.get("skill"), g.get("capacity"), g.get("cost"), g.get("page"), g.get("class")),
                         ("gear", None, None, None, "2", "1000", "78", "SURVIVAL/SURVIVAL_GEAR"))
        self.assertEqual(len(ET.fromstring(out["armor.xml"].encode())), 0)
        self.assertEqual(overrides.apply("zz", out, rows), out)  # again: nothing to move
        with self.assertRaises(ValueError):
            overrides.apply("zz", {}, [{"cl6": "x", "move_kind": {"id": "a", "from": "armor", "to": "gear", "text": "t"}}])
        self.assertIn({"cl6": "Emergency Rescue System", "move_kind": {"id": "emergency-rescue-system", "from": "armor", "to": "gear"}}, overrides.table("ed"))

    def test_the_gti_drones_are_space_drones_and_the_class_is_registered(self):
        from importer.sr6 import classes
        got = {r["id"]: r["set"]["class"] for r in overrides.table("ed") if r.get("id") in ("gti-dagger", "gti-falchion") and "set" in r}
        self.assertEqual(got, {"gti-dagger": "DRONE_MEDIUM/SPACE", "gti-falchion": "DRONE_LARGE/SPACE"})
        self.assertIn("DRONE_MEDIUM/SPACE", classes.extra())


class ValueRowTest(unittest.TestCase):
    GEAR = ('<?xml version="1.0"?>\n<d kind="gear"><gear id="zz.lamp" source="ZZ" page="5" avail="2" cost="Rating x 10" rating="1-3">'
            '<name>Lamp</name><formula field="cost">R * 10</formula><issue field="avail" code="missing">x</issue><text/></gear></d>\n')

    def test_a_value_row_sets_the_value_and_drops_what_described_the_old_one(self):
        rows = [{"cl6": "Lamp", "kind": "gear", "id": "zz.lamp", "gen": "value", "set": {"cost": "50", "avail": "3(L)"},
                 "formula": {"avail": "tier(R; 1: 3; 2: 4)"}}]
        g = ET.fromstring(overrides.apply("zz", {"gear.xml": self.GEAR}, rows)["gear.xml"].encode())[0]
        self.assertEqual((g.get("cost"), g.get("avail")), ("50", "3(L)"))
        self.assertEqual([(c.tag, c.get("field")) for c in g], [("name", None), ("formula", "avail"), ("text", None)])

    def test_a_value_row_refuses_what_it_may_not_set(self):
        for bad in ({"description": "x"}, {"id": "y"}, {}):
            with self.assertRaises(ValueError):
                overrides.check([{"cl6": "Lamp", "kind": "gear", "id": "lamp", "gen": "value", "set": bad}])


class ValueMapTest(unittest.TestCase):
    def test_numbers_formulas_and_legality(self):
        from tools.cl6check import valuemap as V
        row = lambda f, cl6, ours="", **k: {"field": f, "cl6": cl6, "ours": ours, "our_id": k.get("id", "zz.thing")}
        self.assertEqual(V.numeric("cost", "R1 500, R2 1000, R3 1500", "")[0:2], ("Rating x 500", "R * 500"))
        self.assertEqual(V.numeric("cost", "R1 500, R2 900", "")[1], "tier(R; 1: 500; 2: 900)")
        self.assertEqual(V.numeric("cost", "R1 500, R2 900", "", 2), ("900", None))  # (a level's own entry)
        self.assertEqual(V.row_values([row("avail", "4", "6(L)"), row("legality", "(legal)", "6(L)")])[0], {"avail": "4"})
        self.assertEqual(V.row_values([row("legality", "I", "(Force +3) L")])[0], {"avail": "(Force +3)(I)"})
        self.assertEqual(V.row_values([row("ar", "11,9,7,,", "")])[0], {"ar": "11/9/7/—/—"})
        self.assertEqual(V.row_values([row("positive", "false", "negative")])[0], {"kind": "negative"})
        self.assertEqual(V.row_values([row("rating", "1–4", "1")], )[0], {"rating": "1–4"})
        self.assertEqual(V.row_values([row("rating", "1–4", "1", id="zz.thing-2"), row("cost", "R1 5, R2 9", "", id="zz.thing-2")])[0],
                         {"cost": "9"})


class Cl6OnlyRowsTest(unittest.TestCase):
    def test_the_option_rows_commlink6_keeps_are_entries_of_ours_with_its_values(self):
        out = overrides.apply("da", {})
        gear = {e.findtext("name"): e for e in ET.fromstring(out["gear.xml"].encode())}
        e = gear["Crew Served (3)"]
        self.assertEqual((e.get("source"), e.get("page"), e.get("avail"), e.get("cost")), ("DA", "153", "99", "0"))
        self.assertIn("Uses 0.5 Energy per shot", gear)
        self.assertEqual(ET.fromstring(out["electronics.xml"].encode())[0].get("avail"), "99(I)")
        self.assertEqual(ET.fromstring(out["vehicledesign.xml"].encode())[0].findtext("name"), "Mil-Spec Weapon Mount")


class StructureKidsTest(unittest.TestCase):
    GEAR = ('<?xml version="1.0"?>\n<d kind="gear"><gear id="zz.lamp" source="ZZ" page="5" category="Zed"><name>Lamp</name>'
            '<fits slot="under"/><text/></gear></d>\n')

    def test_kids_are_added_before_the_text_once_and_only_the_known_tags(self):
        rows = [{"cl6": "Lamp", "kind": "gear", "id": "zz.lamp", "gen": "family", "set": {"modonly": "true"},
                 "kids": [{"tag": "fits", "attrs": {"slot": "under"}}, {"tag": "slot", "attrs": {"id": "top", "value": "2"}},
                          {"tag": "modifier", "attrs": {"kind": "valmod", "type": "ATTRIBUTE", "ref": "AGILITY", "value": "1"}},
                          {"tag": "flag", "text": "codemod"}]}]
        out = overrides.apply("zz", {"gear.xml": self.GEAR}, rows)
        g = ET.fromstring(out["gear.xml"].encode())[0]
        self.assertEqual((g.get("modonly"), [c.tag for c in g]), ("true", ["name", "fits", "slot", "modifier", "flag", "text"]))
        self.assertEqual(overrides.apply("zz", out, rows), out)  # again: nothing is added twice
        with self.assertRaises(ValueError):
            overrides.check([{"cl6": "x", "kind": "gear", "id": "a", "gen": "family", "kids": [{"tag": "effect"}]}])
