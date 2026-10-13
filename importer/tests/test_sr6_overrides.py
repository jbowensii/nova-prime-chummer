"""Brand headings, the per-book override tables, and the cl6check matching rules of 2026-10-13. Every name here is
invented."""
import json
import unittest
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
                self.assertTrue({"cl6", "kind"} <= set(r) and (r.get("ours") or r.get("add") or r.get("id")), (p.name, r))
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
        self.assertTrue(canon.cl6_only("gear", "Kalte Munition", {}, "item"))  # (German)


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
        rows = [r for p in overrides.DIR.glob("*.json") for r in overrides.table(p.stem) if "id" in r]
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
               for r in overrides.table(p.stem) if "id" in r and not r.get("gen")}
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
