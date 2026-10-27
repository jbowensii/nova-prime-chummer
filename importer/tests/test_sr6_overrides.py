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

# tests read the private helpers they check
# a test's local names (got, rows, entry) shadow the module's helpers on purpose
# pylint: disable=protected-access,redefined-outer-name

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
    """{weapon name: (attributes, [alias texts])} of the weapons the Firing Squad reader makes from `md`."""
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
    XML = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<d kind="gear"><gear id="a"><name>Real Name</name><alias>Old</alias>'
        '<text/></gear><gear id="b"><name>Other</name></gear></d>\n'
    )
    ROWS = [{"cl6": "Odd Name", "kind": "gear", "ours": ["real name", "Missing"], "set": {"cost": "5"}}]

    def test_the_cl6_name_becomes_an_alias_and_a_value_is_set(self):
        out = overrides.apply("zz", {"gear.xml": self.XML}, self.ROWS)["gear.xml"]
        e = ET.fromstring(out.encode())
        a = e.find("gear")
        self.assertEqual(([x.text for x in a.findall("alias")], a.get("cost")), (["Old", "Odd Name"], "5"))
        self.assertEqual([x.tag for x in a], ["name", "alias", "alias", "text"])
        self.assertIsNone(e[1].get("cost"))
        self.assertEqual(overrides.apply("zz", {"gear.xml": out}, self.ROWS)["gear.xml"], out)  # (again: no 2nd alias)

    def test_a_sub_rows_name_takes_its_parents_and_an_artifact_goes(self):
        rows = [
            {"cl6": "Zorp (Spit)", "kind": "gear", "id": "b", "rename": "Zorp (Spit)"},
            {"cl6": "A", "kind": "gear", "id": "a", "remove": True},
        ]
        e = ET.fromstring(overrides.apply("zz", {"gear.xml": self.XML}, rows)["gear.xml"].encode())
        self.assertEqual(
            [(g.get("id"), g.findtext("name"), [x.text for x in g.findall("alias")]) for g in e],
            [("b", "Zorp (Spit)", ["Other"])],
        )  # (the old name stays a search name)

    def test_the_shipped_name_fixes_rename_each_id_once_to_a_name_with_its_parent(self):
        for p in overrides.DIR.glob("*.json"):
            rows = [r for r in overrides.table(p.stem) if "rename" in r or "remove" in r]
            keys = [(r["kind"], r["id"]) for r in rows]
            self.assertEqual(len(keys), len(set(keys)), p.name)
            for r in rows:
                self.assertTrue(r.get("remove") or r["rename"].strip(), (p.name, r["id"]))

    def test_no_table_changes_nothing_and_a_description_is_refused(self):
        self.assertEqual(overrides.apply("zz", {"gear.xml": self.XML}), {"gear.xml": self.XML})
        with self.assertRaises(ValueError):
            overrides.apply("zz", {}, [{"cl6": "x", "kind": "gear", "ours": ["y"], "set": {"description": "t"}}])

    def test_every_shipped_table_is_well_formed_and_sets_no_text(self):
        for p in overrides.DIR.glob("*.json"):
            for r in json.loads(p.read_text(encoding="utf8")):
                self.assertTrue(
                    ({"cl6", "kind"} <= set(r) or "move_kind" in r)
                    and (r.get("ours") or r.get("add") or r.get("id") or r.get("merge") or r.get("move_kind")),
                    (p.name, r),
                )
            overrides.table(p.stem)  # (raises on a description field)


def cl6(name, page="10", kind="gear", **more):
    """A Commlink6 record: its name, page, kind and aliases, plus any extra fields."""
    return {"name": name, "page": page, "kind": kind, "pool": (kind,), "aliases": canon.aliases(name, {}), **more}


def got(records, mine):
    """{record name: (how it matched, [names of the entries it matched])} of Commlink6 `records` against `mine`."""
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
        self.assertFalse(
            canon.cl6_only("gear", "Kalte Munition", {}, "item")
        )  # (German names are entries now: importer/sr6/overrides/dod.json)


if __name__ == "__main__":
    unittest.main()


class AddTest(unittest.TestCase):
    ROW = {
        "cl6": "Zork Kit",
        "kind": "gear",
        "add": {
            "page": 7,
            "attrs": {"category": "Biotech", "avail": "1", "cost": "5"},
            "kids": [{"tag": "effect", "attrs": {"target": "item:concealability", "op": "add", "value": "1"}}],
        },
    }

    def test_add_creates_the_entry_once_and_writes_no_text(self):
        out = overrides.apply("zz", {}, [self.ROW])["gear.xml"]
        e = ET.fromstring(out.encode())
        self.assertEqual((e.get("kind"), len(e)), ("gear", 1))
        g = e[0]
        self.assertEqual(
            (g.tag, g.get("id"), g.get("source"), g.get("page"), g.findtext("name")),
            ("gear", "zork-kit", "ZZ", "7", "Zork Kit"),
        )
        self.assertEqual([c.tag for c in g], ["name", "effect"])  # (no <text>)
        self.assertEqual(overrides.apply("zz", {"gear.xml": out}, [self.ROW])["gear.xml"], out)  # again: no duplicate

    def test_add_to_an_existing_file_keeps_its_entries_and_a_description_or_no_page_is_refused(self):
        xml = OverridesTest.XML
        out = overrides.apply("zz", {"gear.xml": xml}, [self.ROW])["gear.xml"]
        self.assertEqual([x.get("id") for x in ET.fromstring(out.encode())], ["a", "b", "zork-kit"])
        for bad in (
            {**self.ROW["add"], "text": "t"},
            {**self.ROW["add"], "attrs": {"description": "t"}},
            {**self.ROW["add"], "kids": [{"tag": "text"}]},
            {"attrs": {}},
        ):
            with self.assertRaises(ValueError):
                overrides.apply("zz", {}, [{**self.ROW, "add": bad}])

    def test_every_added_entry_of_the_real_tables_is_schema_valid(self):
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
        self.assertEqual(
            [(e.get("id"), e.get("type")) for e in ET.fromstring(acts.encode())],
            [("compile-sprite", "major"), ("decompile-sprite", "major")],
        )

    def test_the_da_table_gives_the_four_polearm_rows_the_cougar_brand(self):
        xml = (
            '<?xml version="1.0" encoding="UTF-8"?>\n<d kind="weapons">'
            + "".join(
                f'<weapon id="da.{n.lower()}" source="DA" page="47"><name>{n}</name></weapon>'
                for n in ("Knife", "One-hand", "Spear", "Pike")
            )
            + "</d>\n"
        )
        out = ET.fromstring(overrides.apply("da", {"weapons.xml": xml})["weapons.xml"].encode())
        self.assertEqual(
            [(e.findtext("name"), [a.text for a in e.findall("alias")]) for e in out],
            [(n, [f"Cougar Polearm ({n})"]) for n in ("Knife", "One-hand", "Spear", "Pike")],
        )


class TextFromTest(unittest.TestCase):
    FILES = {"rules.xml": '<d kind="rules"><rule id="zz-heading" page="1"><name>Zork a Thing</name></rule></d>'}
    TEXTS = (
        '<?xml version="1.0"?>\n<sr6:data xmlns:sr6="urn:x" kind="texts" version="1">\n  <text of="rules" '
        'id="zz-heading">Invented body.\n• item one</text>\n</sr6:data>\n'
    )
    ROW = {
        "cl6": "Zork Thing",
        "kind": "actions",
        "add": {"page": 3, "attrs": {"type": "major"}, "text_from": "Zork a Thing"},
    }

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
        cls.gear = {
            e.findtext("name"): e.attrib for e in ET.fromstring(fs.extract(regrouped).files["gear.xml"].encode())
        }

    def test_rows_naming_themselves_with_a_word_of_the_heading_are_grouped_under_it(self):  # (G4: Liar's Medium)
        self.assertEqual(self.gear["Zed Token"].get("group"), "Zed Charm")
        self.assertEqual(self.gear["Lucky Charm"].get("group"), "Zed Charm")

    def test_a_type_table_titled_modifications_gives_the_heading_its_versions(self):  # (G8: Hunter's Alloy)
        self.assertIn("Plain Oddity (Regular)", self.gear)
        self.assertEqual(self.gear["Plain Oddity (Orichalcum)"].get("cost"), "7500")


class ClassTest(unittest.TestCase):
    XML = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by the importer (recipe sr6 zz). -->\n<d kind="gear">'
        '<gear id="zz.a" source="ZZ" page="1" category="Zorp"><name>A</name></gear>'
        '<gear id="zz.b" source="ZZ" page="1" category="Zorp" class="OWN/KEPT"><name>B</name></gear>'
        '<gear id="zz.c" source="ZZ" page="1" category="Other"><name>C</name></gear></d>\n'
    )
    CATS = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<d kind="categories"><category id="zz.gear.zorp" source="ZZ" page="1" '
        'of="gear">'
        "<name>Zorp</name></category></d>\n"
    )
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
        rows = [
            {"cl6": "A", "kind": "gear", "id": "zz.a", "set": {"class": "ELECTRONICS/IMAGING"}},
            {"cl6": "Z", "kind": "gear", "id": "zz.nope", "set": {"class": "X/Y"}},
        ]
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
        rows = [
            ["gear", "Zorp", "TOOLS/TOOLS", "CLEAR"],
            ["gear", "Mixed", "TOOLS/TOOLS", "MIXED"],
            ["gear", "Blank", "", "CLEAR"],
            ["armor", "Coat", "ARMOR/ARMOR_BODY", "CLEAR"],
            ["rules", "Oddly", "X/Y", "CLEAR"],
        ]
        with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="", encoding="utf-8-sig") as f:
            csv.writer(f).writerows([head] + rows)
        self.assertEqual(
            classmap.category_map(f.name), {"armor": {"Coat": "ARMOR/ARMOR_BODY"}, "gear": {"Zorp": "TOOLS/TOOLS"}}
        )

    def test_the_shipped_map_and_every_class_in_the_override_tables_are_class_keys(self):
        import re
        from importer.sr6 import classes

        key = re.compile(r"[A-Za-z0-9_]+(/[A-Za-z0-9_]+)?")
        m = classes.table()
        self.assertGreater(sum(len(v) for v in m.values()), 200)
        self.assertTrue(all(key.fullmatch(c) for v in m.values() for c in v.values()))
        rows = [
            r
            for p in overrides.DIR.glob("*.json")
            for r in overrides.table(p.stem)
            if "id" in r and "set" in r and r.get("gen") not in ("value", "family", "errata", "owner")
        ]
        self.assertGreater(len(rows), 500)
        self.assertTrue(all(key.fullmatch(r["set"]["class"]) and r.get("gen") in ("class", None) for r in rows))

    def test_class_validates_on_an_entry_of_every_kind_that_carries_one(self):
        from lxml import etree

        schemas = Path(__file__).resolve().parents[2] / "public" / "data" / "sr6" / "schema"
        tags = {
            "weapons": "weapon",
            "armor": "armor",
            "augmentations": "augmentation",
            "electronics": "device",
            "gear": "gear",
            "vehicles": "vehicle",
            "programs": "program",
            "spells": "spell",
            "ammotypes": "ammotype",
        }
        need = {
            "weapons": 'category="Blade"',
            "armor": 'category="Body"',
            "augmentations": 'category="Cyberware" type="cyberware"',
            "electronics": 'category="Commlink"',
            "gear": 'category="Tool"',
            "vehicles": 'category="Car"',
            "programs": 'type="basic"',
            "spells": 'category="combat"',
            "ammotypes": "",
        }
        for kind, tag in tags.items():
            xml = (
                f'<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="{kind}" version="1"><{tag} id="zz.a" source="ZZ" '
                'page="1" '
                f'{need[kind]} class="TYPE/SUB_TYPE"><name>A</name></{tag}></sr6:data>'
            )
            xsd = etree.XMLSchema(etree.parse(str(schemas / f"{kind}.xsd")))
            self.assertTrue(xsd.validate(etree.fromstring(xml.encode())), f"{kind}: {xsd.error_log}")
            self.assertFalse(xsd.validate(etree.fromstring(xml.replace("TYPE/SUB_TYPE", "a b").encode())))


class HandClassRowsTest(unittest.TestCase):
    WANT = {
        ("crb", "gear", "standard"): "ELECTRONICS/ID_CREDIT",
        ("crb", "weapons", "smartgun-system-internal"): "ACCESSORY/WEAPON_ACCESSORY",
        ("crb-sea", "armor", "ballistic-hood"): "ARMOR/ARMOR_HELMET",
        ("da", "weapons", "al-assad"): "WEAPON_SPECIAL/LAUNCHERS",
        ("da", "weapons", "ballista-ii"): "WEAPON_SPECIAL/LAUNCHERS",
        ("da", "weapons", "carl-gustaf"): "WEAPON_SPECIAL/LAUNCHERS",
        ("sif-no", "gear", "uv-light-uv-flashlight"): "TOOLS/TOOLS",
    }

    def test_the_owners_class_decisions_are_hand_rows_the_generator_leaves_alone(self):
        from tools.cl6check import classmap

        got = {
            (p.stem, r["kind"], r["id"]): r["set"]["class"]
            for p in overrides.DIR.glob("*.json")
            for r in overrides.table(p.stem)
            if "id" in r and "set" in r and not r.get("gen")
        }
        self.assertEqual({k: got.get(k) for k in self.WANT}, self.WANT)
        self.assertLessEqual(set(self.WANT), classmap.hand_ids())

    def test_the_generator_skips_a_hand_row_and_a_record_with_no_class(self):
        from tools.cl6check import classmap

        o = {"src": "zz", "kind": "gear", "id": "zz.a", "name": "A", "attrs": {"category": "Odd"}}
        pairs = [
            ({"cl6_class": "X/Y", "name": "A"}, o),
            ({"cl6_class": "", "name": "B"}, {**o, "id": "zz.b", "name": "B"}),
        ]
        self.assertEqual(
            classmap.item_rows(pairs, {}, frozenset())[0]["zz"],
            [{"cl6": "A", "kind": "gear", "id": "a", "set": {"class": "X/Y"}, "gen": "class"}],
        )
        self.assertEqual(dict(classmap.item_rows(pairs, {}, frozenset({("zz", "gear", "a")}))[0]), {})

    def test_the_rigger_program_encryption_is_its_own_entry_with_its_class(self):
        row = next(
            r for r in overrides.table("crb") if r["kind"] == "programs" and r["add"].get("id") == "encryption-rcc"
        )
        out = ET.fromstring(overrides.apply("crb", {}, [row])["programs.xml"].encode())[0]
        self.assertEqual(
            (out.get("id"), out.findtext("name"), out.get("class"), out.get("cost")),
            ("encryption-rcc", "Encryption", "SOFTWARE/RIGGER_PROGRAM", "250"),
        )


class ConsensusClassRowsTest(unittest.TestCase):
    CSV = Path(__file__).resolve().parents[2] / ".extract" / "class-patterns" / "consensus_rows.csv"

    def test_every_consensus_class_is_a_hand_row_in_its_sources_table(self):
        import csv

        if not self.CSV.is_file():
            self.skipTest("the consensus csv is the owner's local study")
        have = {
            (p.stem, r["kind"], r["id"]): r["set"]["class"]
            for p in overrides.DIR.glob("*.json")
            for r in overrides.table(p.stem)
            if "id" in r and "set" in r and not r.get("gen")
        }
        with open(self.CSV, encoding="utf-8-sig") as fh:
            rows = list(csv.DictReader(fh))
        self.assertEqual(len(rows), 287)
        missing = [
            r["our_id"] for r in rows if have.get((r["src"], r["kind"], r["our_id"][len(r["src"]) + 1 :])) != r["class"]
        ]
        self.assertEqual(missing, [])

    def test_no_class_row_is_listed_twice_in_a_table(self):
        for p in overrides.DIR.glob("*.json"):
            keys = [
                (r["kind"], r["id"], r.get("gen"), tuple(k for k in ("set", "remove", "rename") if k in r))
                for r in overrides.table(p.stem)
                if "id" in r
            ]
            self.assertEqual(len(keys), len(set(keys)), p.name)


class SectionClassTest(unittest.TestCase):
    RULES = [{"src": "zz", "kinds": ["gear"], "pages": [10, 20], "class": "CRITTERWARE/AUGMENTATION"}]
    XML = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<d kind="gear">'
        '<gear id="zz.in" source="ZZ" page="10" category="Zorp"><name>In</name></gear>'
        '<gear id="zz.had" source="ZZ" page="20" category="Zorp" class="BIOWARE/BIOWARE_STANDARD"><name>Had</name>'
        "</gear>"
        '<gear id="zz.none" source="ZZ" page="15" category="Other"><name>None</name></gear>'
        '<gear id="zz.out" source="ZZ" page="21" category="Zorp"><name>Out</name></gear></d>\n'
    )

    def test_a_sections_entries_all_take_its_class_whatever_they_had_and_others_are_left(self):
        from importer.sr6 import classes

        out = classes.apply({"gear.xml": self.XML}, {"gear": {"Zorp": "TOOLS/TOOLS"}}, "zz", self.RULES)
        got = {e.get("id"): e.get("class") for e in ET.fromstring(out["gear.xml"].encode())}
        self.assertEqual(
            got,
            {
                "zz.in": "CRITTERWARE/AUGMENTATION",
                "zz.had": "CRITTERWARE/AUGMENTATION",
                "zz.none": "CRITTERWARE/AUGMENTATION",
                "zz.out": "TOOLS/TOOLS",
            },
        )  # (an unclassed one in range is filled)
        other = classes.apply({"gear.xml": self.XML}, {}, "yy", self.RULES)  # (another source: not its section)
        self.assertEqual(other, {"gear.xml": self.XML})

    def test_the_shipped_section_rule_and_its_extra_class_agree(self):
        import re
        from importer.sr6 import classes

        extra = json.loads(classes.EXTRA.read_text(encoding="utf8"))
        for r in classes.prefixes():
            self.assertTrue(r["class"] in extra or r.get("commlink6"), r["class"])
            self.assertTrue(re.fullmatch(r"[A-Za-z0-9_]+(/[A-Za-z0-9_]+)?", r["class"]))
        self.assertEqual(
            [(r["src"], r["pages"], r["class"]) for r in classes.prefixes()],
            [
                ("bs", [134, 166], "CRITTERWARE/AUGMENTATION"),
                ("swc", [109, 109], "INFECTED/OPTIONAL_POWER"),
                ("swc", [110, 114], "INFECTED"),
                # (owner 2026-10-16: Wild Life's critter purchase rows and companion qualities are a critter's)
                ("wl", [180, 180], "CRITTERWARE/PURCHASE"),
                ("wl", [184, 186], "CRITTERWARE/QUALITY"),
            ],
        )

    def test_cl6check_accepts_a_section_class_whatever_commlink6s_is(self):
        from types import SimpleNamespace
        from importer.tests.test_cl6check import rec
        from tools.cl6check import __main__ as cli

        a = canon.canonical(
            rec('<item id="aaa" type="BIOWARE" subtype="BIOWARE_STANDARD"/>', name="Beast Eye", book="bs")
        ) | {"src": "gz"}
        mine = {
            "gz": SimpleNamespace(
                entries=[entry("Beast Eye", kind="gear", page="15", **{"class": "CRITTERWARE/AUGMENTATION"})],
                book_dir=None,
            )
        }
        rules = [{"src": "gz", "kinds": ["gear"], "pages": [10, 20], "class": "CRITTERWARE/AUGMENTATION"}]
        r = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=rules)[0][0]
        self.assertEqual((r["families"]["class"], r.get("class_via")), (True, "section class"))
        r = cli.compare([a], mine, pdf=False, package=({}, {}, {}), accept={}, sections=[], extra={})[0][0]
        self.assertFalse(r["families"]["class"])


class StructureOpsTest(unittest.TestCase):
    GEAR = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Generated by the importer. -->\n<d kind="gear">'
        '<gear id="zz.a" source="ZZ" page="1" category="Branded weapon" avail="4" cost="9" capacity="2" '
        'class="WEAPON_CLOSE_COMBAT/CLUBS"><name>Alpha</name><alias>Old</alias></gear>'
        '<gear id="zz.b" source="ZZ" page="1" category="Tool"><name>Beta</name></gear>'
        '<gear id="zz.dup" source="ZZ" page="1" category="Tool"><name>Dup</name><alias>Dupe</alias></gear></d>\n'
    )
    WEAPONS = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<d kind="weapons">'
        '<weapon id="zz.a" source="ZZ" page="1" category="New powered weapon" type="Chain" dv="4P" ar="9/—/—/—/—" '
        'avail="7" class="X/Y"><name>Alpha</name></weapon>'
        '<weapon id="zz.w" source="ZZ" page="2" category="Blade"><name>W</name></weapon></d>\n'
    )
    TEXTS = (
        '<?xml version="1.0"?>\n<sr6:data xmlns:sr6="urn:x" kind="texts" version="1">\n  <text of="gear" '
        'id="zz.dup">Invented.</text>\n'
        '  <text of="gear" id="zz.b">Kept.</text>\n</sr6:data>\n'
    )

    def run_ops(self, rows, files=None):
        """Apply override `rows` to the invented book's gear and weapons files (or `files`)."""
        return overrides.apply("zz", files or {"gear.xml": self.GEAR, "weapons.xml": self.WEAPONS}, rows)

    @staticmethod
    def ids(xml):
        """[(id, name)] of each entry in an xml string."""
        return [(e.get("id"), e.findtext("name")) for e in ET.fromstring(xml.encode())]

    def test_remove_deletes_the_entry_and_its_text_and_is_idempotent_and_logs_a_missing_id(self):
        rows = [
            {"cl6": "Dup", "kind": "gear", "id": "zz.dup", "remove": True},
            {"cl6": "N", "kind": "gear", "id": "zz.nope", "remove": True},
        ]
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
        self.assertEqual(
            (a.get("type"), a.get("dv"), a.get("avail"), a.get("category"), a.get("class")),
            ("Chain", "4P", "4", "Branded weapon", "WEAPON_CLOSE_COMBAT/CLUBS"),
        )  # (what it had stays)
        self.assertEqual(self.ids(out["weapons.xml"]), [("zz.w", "W")])
        self.assertEqual(self.run_ops(rows, out), out)  # again: both gone or merged, logged, nothing changed

    def test_rename_sets_the_name_keeps_the_old_one_as_an_alias_and_is_idempotent(self):
        rows = [
            {"cl6": "N", "kind": "gear", "id": "zz.b", "rename": "Beta (Big)"},
            {"cl6": "N", "kind": "gear", "id": "zz.dup", "rename": "Dup 2", "alias": False},
        ]
        out = self.run_ops(rows)
        e = {x.get("id"): x for x in ET.fromstring(out["gear.xml"].encode())}
        self.assertEqual(
            (e["zz.b"].findtext("name"), [a.text for a in e["zz.b"].findall("alias")]), ("Beta (Big)", ["Beta"])
        )
        self.assertEqual([a.text for a in e["zz.dup"].findall("alias")], ["Dupe"])  # (no alias of the old name)
        self.assertEqual(self.run_ops(rows, out), out)
        with self.assertRaises(ValueError):
            self.run_ops([{"cl6": "N", "kind": "gear", "id": "zz.b", "rename": "two\nlines"}])

    def test_move_kind_files_a_gear_entry_as_a_close_combat_weapon_and_leaves_one_the_target_has(self):
        rows = [
            {"cl6": "Alpha", "move_kind": {"id": "zz.b", "from": "gear", "to": "weapons"}},
            {"cl6": "A", "move_kind": {"id": "zz.a", "from": "gear", "to": "weapons"}},
        ]
        out = self.run_ops(rows)
        self.assertEqual(
            [i for i, _ in self.ids(out["gear.xml"])], ["zz.a", "zz.dup"]
        )  # (zz.a: the weapons file has it: left)
        w = {x.get("id"): x for x in ET.fromstring(out["weapons.xml"].encode())}
        self.assertEqual(
            (w["zz.b"].tag, w["zz.b"].get("skill"), w["zz.b"].get("category")), ("weapon", "Close Combat", "Tool")
        )
        solo = self.run_ops(
            [{"cl6": "Alpha", "move_kind": {"id": "zz.a", "from": "gear", "to": "weapons"}}], {"gear.xml": self.GEAR}
        )
        a = ET.fromstring(solo["weapons.xml"].encode())[0]
        self.assertEqual(
            (a.get("spec"), a.get("capacity"), a.get("cost"), a.get("class")),
            ("Clubs", None, "9", "WEAPON_CLOSE_COMBAT/CLUBS"),
        )
        self.assertEqual(self.run_ops(rows, out), out)

    def test_no_op_names_a_description_field(self):
        for bad in (
            {"cl6": "x", "kind": "gear", "merge": {"into": "a", "from": "b", "description": "t"}},
            {"cl6": "x", "move_kind": {"id": "a", "from": "gear", "to": "weapons", "text": "t"}},
        ):
            with self.assertRaises(ValueError):
                self.run_ops([bad])

    def test_the_decisions_are_in_the_tables_and_every_class_is_known(self):
        extra = json.loads((overrides.DIR.parent / "classes" / "extra_classes.json").read_text(encoding="utf8"))
        for k in (
            "CRITTERWARE/AUGMENTATION",
            "CRITTERWARE/GEAR",
            "DRONE_SMALL/SPACE",
            "DRONE_LARGE/SPACE",
            "VEHICLES/SPACE_BIKES",
            "VEHICLES/SPACE_BOARDS",
            "WEAPON_LASER",
            "WEAPON_LASER/PISTOLS_LIGHT",
            "WEAPON_LASER/PISTOLS_MEDIUM",
            "WEAPON_LASER/PISTOLS_HEAVY",
            "WEAPON_LASER/SUBMACHINE_GUNS_LIGHT",
            "WEAPON_LASER/SUBMACHINE_GUNS_MEDIUM",
            "WEAPON_LASER/RIFLE_ASSAULT",
            "WEAPON_LASER/ASSAULT_CANNON",
        ):
            self.assertIn(k, extra)
        t = overrides.table
        self.assertEqual(sum(1 for r in t("lhv") if "move_kind" in r), 14)
        self.assertEqual(sum(1 for r in t("lhv") if "merge" in r), 4)
        self.assertEqual(
            {r["id"] for s in ("thn", "lhv", "so", "tne", "wl", "sif-no") for r in t(s) if r.get("remove")},
            {
                "knight-errant-swat-officers",
                "toxins-drugs-and-diseases.scourge",
                "grooming-1-hour",
                "grooming-2-hours",
                "special-notes",
                "ammunition",
            },
        )  # (Wild Life's purchase options stay since 2026-10-16: the owner's builder decisions)
        self.assertLessEqual(
            {
                "Biosprayer (Blind)",
                "Biosprayer (Confused)",
                "Biosprayer (Nauseated)",
                "Biosprayer (Dazed)",
                "Power hammer (Double-sided)",
                "Power maul (Double-sided)",
                "Pocket Secretary ’85",
            },
            {r["rename"] for s in ("bs", "sco", "fpt") for r in t(s) if "rename" in r},
        )  # (the name fixes of 2026-10-15 join them)


class LatestDecisionsTest(unittest.TestCase):
    def test_the_whole_critter_chapter_is_one_class_and_the_chainblade_duplicate_goes(self):
        from importer.sr6 import classes

        self.assertNotIn("CRITTERWARE/CYBER_BODYWARE", classes.extra())
        bs = overrides.table("bs")
        self.assertEqual(
            [
                r["id"]
                for r in bs
                if r.get("id") in {"spikes-module", "turret-mount-small", "turret-mount-large"} and "set" in r
            ],
            [],
        )
        xml = (
            '<?xml version="1.0"?>\n<d kind="augmentations"><augmentation id="bs.x" source="BS" page="140" '
            'type="cyberware" category="Odd" '
            'class="CRITTERWARE/CYBER_BODYWARE"><name>X</name></augmentation></d>\n'
        )
        out = classes.apply({"augmentations.xml": xml}, {}, "bs")["augmentations.xml"]  # (the shipped section rule)
        self.assertEqual(ET.fromstring(out.encode())[0].get("class"), "CRITTERWARE/AUGMENTATION")
        sco = overrides.table("sco")
        self.assertIn({"cl6": "Chainblade", "kind": "gear", "id": "chainblade", "remove": True}, sco)
        self.assertTrue(
            any(
                r.get("kind") == "weapons"
                and r.get("id") == "chainblade"
                and r["set"]["class"] == "WEAPON_CLOSE_COMBAT/BLADES"
                for r in sco
                if "set" in r
            )
        )
        self.assertFalse(any(r.get("move_kind", {}).get("id") == "chainblade" for r in sco))


class ArmorToGearMoveTest(unittest.TestCase):
    def test_move_kind_files_an_armor_entry_as_gear_dropping_the_armor_only_attributes(self):
        armor = (
            '<?xml version="1.0"?>\n<d kind="armor"><armor id="zz.suit" source="ZZ" page="78" category="Spacesuit" '
            'defense="—" social="+1" '
            'capacity="2" avail="3" cost="1000" class="SURVIVAL/SURVIVAL_GEAR"><name>Suit</name></armor></d>\n'
        )
        rows = [{"cl6": "Suit", "move_kind": {"id": "zz.suit", "from": "armor", "to": "gear"}}]
        out = overrides.apply("zz", {"armor.xml": armor}, rows)
        g = ET.fromstring(out["gear.xml"].encode())[0]
        self.assertEqual(
            (
                g.tag,
                g.get("defense"),
                g.get("social"),
                g.get("skill"),
                g.get("capacity"),
                g.get("cost"),
                g.get("page"),
                g.get("class"),
            ),
            ("gear", None, None, None, "2", "1000", "78", "SURVIVAL/SURVIVAL_GEAR"),
        )
        self.assertEqual(len(ET.fromstring(out["armor.xml"].encode())), 0)
        self.assertEqual(overrides.apply("zz", out, rows), out)  # again: nothing to move
        with self.assertRaises(ValueError):
            overrides.apply(
                "zz", {}, [{"cl6": "x", "move_kind": {"id": "a", "from": "armor", "to": "gear", "text": "t"}}]
            )
        self.assertIn(
            {
                "cl6": "Emergency Rescue System",
                "move_kind": {"id": "emergency-rescue-system", "from": "armor", "to": "gear"},
            },
            overrides.table("ed"),
        )

    def test_the_gti_drones_are_space_drones_and_the_class_is_registered(self):
        from importer.sr6 import classes

        got = {
            r["id"]: r["set"]["class"]
            for r in overrides.table("ed")
            if r.get("id") in ("gti-dagger", "gti-falchion") and "set" in r
        }
        self.assertEqual(got, {"gti-dagger": "DRONE_MEDIUM/SPACE", "gti-falchion": "DRONE_LARGE/SPACE"})
        self.assertIn("DRONE_MEDIUM/SPACE", classes.extra())


class ValueRowTest(unittest.TestCase):
    GEAR = (
        '<?xml version="1.0"?>\n<d kind="gear"><gear id="zz.lamp" source="ZZ" page="5" avail="2" cost="Rating x 10" '
        'rating="1-3">'
        '<name>Lamp</name><formula field="cost">R * 10</formula><issue field="avail" '
        'code="missing">x</issue><text/></gear></d>\n'
    )

    def test_a_value_row_sets_the_value_and_drops_what_described_the_old_one(self):
        rows = [
            {
                "cl6": "Lamp",
                "kind": "gear",
                "id": "zz.lamp",
                "gen": "value",
                "set": {"cost": "50", "avail": "3(L)"},
                "formula": {"avail": "tier(R; 1: 3; 2: 4)"},
            }
        ]
        g = ET.fromstring(overrides.apply("zz", {"gear.xml": self.GEAR}, rows)["gear.xml"].encode())[0]
        self.assertEqual((g.get("cost"), g.get("avail")), ("50", "3(L)"))
        self.assertEqual([(c.tag, c.get("field")) for c in g], [("name", None), ("formula", "avail"), ("text", None)])

    def test_a_value_row_refuses_what_it_may_not_set(self):
        for bad in ({"description": "x"}, {"id": "y"}, {}):
            with self.assertRaises(ValueError):
                overrides.check([{"cl6": "Lamp", "kind": "gear", "id": "lamp", "gen": "value", "set": bad}])


class RefileTest(unittest.TestCase):
    GEAR = '<d kind="gear"><gear id="zz.lamp"><name>Lamp</name></gear><gear id="zz.both"><name>B</name></gear></d>'
    WEAPONS = (
        '<d kind="weapons"><weapon id="zz.gun"><name>Gun</name></weapon><weapon '
        'id="zz.both"><name>B</name></weapon></d>'
    )

    def test_a_row_filed_under_the_wrong_kind_lands_on_the_one_file_holding_the_id(self):
        rows = [
            {"cl6": "G", "kind": "gear", "id": "zz.gun", "gen": "value", "set": {"cost": "5"}},
            {
                "cl6": "B",
                "kind": "armor",
                "id": "zz.both",
                "gen": "value",
                "set": {"cost": "7"},
            },  # (two files hold it: left)
            {"cl6": "N", "kind": "gear", "id": "zz.none", "gen": "value", "set": {"cost": "9"}},
        ]
        out = overrides.apply("zz", {"gear.xml": self.GEAR, "weapons.xml": self.WEAPONS}, rows)
        self.assertEqual([e.get("cost") for e in ET.fromstring(out["weapons.xml"].encode())], ["5", None])
        self.assertEqual([e.get("cost") for e in ET.fromstring(out["gear.xml"].encode())], [None, None])


class SlotIdTest(unittest.TestCase):
    def test_a_slot_id_is_never_source_prefixed_but_an_entry_id_and_a_fits_slot_are_as_before(self):
        from importer import xmlio

        xml = '<gear id="armor"><slot id="armor" value="3"/><fits slot="armor"/></gear>'
        got = xmlio.scope(xml, "CRB", {"armor"}, root=("sr6", "urn:x"))
        self.assertEqual(got, '<gear id="crb.armor"><slot id="armor" value="3"/><fits slot="armor"/></gear>')


class FamilyMergeTest(unittest.TestCase):
    V = [{"tag": "variant", "attrs": {"name": "Hands"}}]

    def test_old_rows_are_refiled_and_widened_stale_ones_go_and_unlanded_variants_wait(self):
        from tools.cl6check import familymap, ours

        idx = {
            ("zz", "weapons", "zz.a"): {"name": "A"},
            ("zz", "gear", "zz.setae"): {"name": "Setae (hands or feet)"},
            ("zz", "gear", "zz.b"): {"name": "B"},
            ("zz", "gear", "zz.c"): {"name": "C"},
            ("zz", "gear", "zz.twin"): {"name": "T"},
            ("zz", "armor", "zz.twin"): {"name": "T"},
        }
        old = [
            {"cl6": "hand", "kind": "gear", "id": "hand"},
            {"cl6": "A", "kind": "gear", "id": "a", "set": {"skill": "Firearms"}, "gen": "family"},
            {"cl6": "S", "kind": "gear", "id": "gone", "set": {"skill": "x"}, "gen": "family"},
            {"cl6": "T", "kind": "gear", "id": "twin", "set": {"size": "g"}, "gen": "family"},
            {"cl6": "T", "kind": "armor", "id": "twin", "set": {"social": "-1"}, "gen": "family"},
        ]
        new = [
            {"cl6": "A", "kind": "weapons", "id": "a", "set": {"skill": "Other", "spec": "Rifles"}, "gen": "family"},
            {"cl6": "Setae", "kind": "gear", "id": "setae", "kids": self.V, "gen": "family"},
            {"cl6": "B", "kind": "gear", "id": "b", "kids": self.V, "gen": "family"},
            {"cl6": "C", "kind": "gear", "id": "c", "set": {"size": "Tiny"}, "kids": self.V, "gen": "family"},
        ]
        got = {(r["kind"], r["id"]): r for r in familymap.merge(old, new, idx, "zz")}
        # (gone: stale; setae and b: variants only, held; twin: in two files, each row keeps its own)
        self.assertEqual(
            set(got), {("gear", "hand"), ("weapons", "a"), ("gear", "c"), ("gear", "twin"), ("armor", "twin")}
        )
        self.assertEqual(got["weapons", "a"]["set"], {"skill": "Firearms", "spec": "Rifles"})
        self.assertNotIn("kids", got["gear", "c"])
        both = [
            {"cl6": "E", "kind": "gear", "id": "dev", "set": {"size": "Tiny"}, "gen": "family"},
            {"cl6": "D", "kind": "electronics", "id": "dev", "set": {"modonly": "true"}, "gen": "family"},
        ]
        (only,) = familymap.merge(
            both, [], {("zz", "gear", "zz.dev"): {"name": "D"}}, "zz"
        )  # (the gear entry is the entry's; the device row is not refiled onto it)
        self.assertEqual((only["kind"], only["set"]), ("gear", {"size": "Tiny"}))
        self.assertEqual(
            {r["id"] for r in familymap.merge([], new, idx, "zz", variants=True)}, {"a", "b", "c"}
        )  # (--variants: b keeps its list; setae carries its variants)
        self.assertTrue(
            ours.carries("Setae (hands or feet)", ["Hands", "Feet"]) and not ours.carries("Setae", ["Hands"])
        )


class ValueMapTest(unittest.TestCase):
    def test_numbers_formulas_and_legality(self):
        from tools.cl6check import valuemap as V

        def row(f, cl6, ours="", **k):
            return {"field": f, "cl6": cl6, "ours": ours, "our_id": k.get("id", "zz.thing")}

        self.assertEqual(V.numeric("cost", "R1 500, R2 1000, R3 1500", "")[0:2], ("Rating x 500", "R * 500"))
        self.assertEqual(V.numeric("cost", "R1 500, R2 900", "")[1], "tier(R; 1: 500; 2: 900)")
        self.assertEqual(V.numeric("cost", "R1 500, R2 900", "", 2), ("900", None))  # (a level's own entry)
        self.assertEqual(
            V.row_values([row("avail", "4", "6(L)"), row("legality", "(legal)", "6(L)")])[0], {"avail": "4"}
        )
        self.assertEqual(V.row_values([row("legality", "I", "(Force +3) L")])[0], {"avail": "(Force +3)(I)"})
        self.assertEqual(V.row_values([row("ar", "11,9,7,,", "")])[0], {"ar": "11/9/7/—/—"})
        self.assertEqual(V.row_values([row("positive", "false", "negative")])[0], {"kind": "negative"})
        self.assertEqual(
            V.row_values(
                [row("rating", "1–4", "1")],
            )[0],
            {"rating": "1–4"},
        )
        self.assertEqual(
            V.row_values([row("rating", "1–4", "1", id="zz.thing-2"), row("cost", "R1 5, R2 9", "", id="zz.thing-2")])[
                0
            ],
            {"cost": "9"},
        )

    def test_refile_moves_a_value_row_to_the_kind_file_holding_its_entry(self):
        import tempfile
        from unittest import mock
        from tools.cl6check import valuemap as V

        rows = [
            {"kind": "gear", "id": "a", "set": {"cost": "5"}, "gen": "value"},  # (our entry is a weapon)
            {"kind": "gear", "id": "b", "set": {"cost": "6"}, "gen": "value"},  # (already gear)
            {"kind": "gear", "id": "a", "set": {"class": "X/Y"}, "gen": "class"},
        ]  # (not a value row: left)
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "zz.json")
            p.write_text(json.dumps(rows), encoding="utf8")
            Path(d, "yy.json").write_text("[]", encoding="utf8")
            with mock.patch.object(
                V.ours, "index", return_value={("zz", "weapons", "zz.a"): {}, ("zz", "gear", "zz.b"): {}}
            ):
                self.assertEqual(V.refile("runs", root=d), {"zz": 1})
            self.assertEqual([r["kind"] for r in json.loads(p.read_text(encoding="utf8"))], ["weapons", "gear", "gear"])


class StructureKidsTest(unittest.TestCase):
    GEAR = (
        '<?xml version="1.0"?>\n<d kind="gear"><gear id="zz.lamp" source="ZZ" page="5" category="Zed"><name>Lamp</name>'
        '<fits slot="under"/><text/></gear></d>\n'
    )

    def test_kids_are_added_before_the_text_once_and_only_the_known_tags(self):
        rows = [
            {
                "cl6": "Lamp",
                "kind": "gear",
                "id": "zz.lamp",
                "gen": "family",
                "set": {"modonly": "true"},
                "kids": [
                    {"tag": "fits", "attrs": {"slot": "under"}},
                    {"tag": "slot", "attrs": {"id": "top", "value": "2"}},
                    {
                        "tag": "modifier",
                        "attrs": {"kind": "valmod", "type": "ATTRIBUTE", "ref": "AGILITY", "value": "1"},
                    },
                    {"tag": "flag", "text": "codemod"},
                ],
            }
        ]
        out = overrides.apply("zz", {"gear.xml": self.GEAR}, rows)
        g = ET.fromstring(out["gear.xml"].encode())[0]
        self.assertEqual(
            (g.get("modonly"), [c.tag for c in g]), ("true", ["name", "fits", "slot", "modifier", "flag", "text"])
        )
        self.assertEqual(overrides.apply("zz", out, rows), out)  # again: nothing is added twice
        with self.assertRaises(ValueError):
            overrides.check([{"cl6": "x", "kind": "gear", "id": "a", "gen": "family", "kids": [{"tag": "effect"}]}])


class SchemaAttrsTest(unittest.TestCase):
    """An override writes no attribute the kind's schema lacks: it is skipped (one stderr line per row), never invalid
    xml."""

    RULES = (
        '<?xml version="1.0"?>\n<d kind="rules"><rule id="zz.launch" source="ZZ" page="5" chapter="C" '
        'level="2"><name>Launch</name></rule></d>\n'
    )
    GEAR = (
        '<?xml version="1.0"?>\n<d kind="gear"><gear id="zz.coat" source="ZZ" page="6" '
        'category="Zed"><name>Coat</name></gear></d>\n'
    )

    def test_allowed_is_the_schemas(self):
        self.assertNotIn("class", overrides.allowed("rules"))
        self.assertIn("class", overrides.allowed("gear"))
        self.assertNotIn("social", overrides.allowed("gear"))
        self.assertIn("social", overrides.allowed("armor"))
        self.assertNotIn("modonly", overrides.allowed("echoes"))
        self.assertIsNone(overrides.allowed("nokind"))

    def test_disallowed_attributes_are_skipped_and_the_rest_lands(self):
        import contextlib
        import io

        rows = [
            {"cl6": "Coat", "kind": "gear", "id": "zz.coat", "gen": "value", "set": {"social": "2", "cost": "99"}},
            {
                "cl6": "Launch",
                "kind": "weapons",
                "id": "zz.launch",
                "gen": "class",
                "set": {"class": "A/B"},
            },  # (filed wrong; only rules holds it)
            {"cl6": "Launch", "kind": "rules", "id": "zz.launch", "gen": "class", "set": {"class": "A/B"}},
        ]
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            out = overrides.apply("zz", {"gear.xml": self.GEAR, "rules.xml": self.RULES}, rows)
        g, r = (ET.fromstring(out[f].encode())[0] for f in ("gear.xml", "rules.xml"))
        self.assertEqual((g.get("cost"), g.get("social"), r.get("class")), ("99", None, None))
        self.assertIn("gear.xml has no social", err.getvalue())
        self.assertEqual(len([x for x in err.getvalue().splitlines() if "rules.xml has no class" in x]), 1)

    def test_a_row_left_with_no_value_but_an_effect_still_lands(self):
        import contextlib
        import io

        row = {
            "kind": "gear",
            "id": "zz.coat",
            "gen": "errata",
            "set": {"social": "2"},
            "effects": [{"target": "item:zz", "op": "add", "value": "1"}],
        }
        with contextlib.redirect_stderr(io.StringIO()):
            g = ET.fromstring(overrides.apply("zz", {"gear.xml": self.GEAR}, [row])["gear.xml"].encode())[0]
        self.assertEqual((g.get("social"), [x.get("target") for x in g.findall("effect")]), (None, ["item:zz"]))
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(overrides.fit([{**row, "effects": []}]), [])  # (nothing left to set: dropped)

    def test_generators_drop_the_rows_too(self):
        from tools.cl6check import classmap

        pairs = [
            (
                {"cl6_class": "A/B", "name": "Launch"},
                {"src": "zz", "kind": "rules", "id": "zz.launch", "name": "Launch", "attrs": {}},
            )
        ]
        classmap.canon.CLASS_KINDS.add("rules")
        try:
            self.assertEqual(classmap.item_rows(pairs, {}, frozenset())[0]["zz"], [])
        finally:
            classmap.canon.CLASS_KINDS.discard("rules")


class OwnerNameBugRowsTest(unittest.TestCase):
    """The 2026-10-15 owner decisions: three values take Commlink6's (a row each), the ones the book prints stay ours
    (value_keep.json)."""

    FILES = {
        "swc": ("qualities", "quality", "ghoul-dwarf", 'karma="27"', "karma"),
        "crb": ("weapons", "weapon", "mossberg-cmdt", 'ammo="10(c)"', "ammo"),
        "da": ("adeptpowers", "adeptpower", "motion-sense", 'activation="See Notes"', "activation"),
    }
    WANT = {"swc": "29", "crb": "10(c)/24(d)", "da": "Passive / Major Action"}

    def test_the_three_value_rows_land(self):
        for src, (kind, tag, iid, attr, name) in self.FILES.items():
            xml = (
                f'<?xml version="1.0"?>\n<d kind="{kind}"><{tag} id="{iid}" source="ZZ" page="1" '
                f"{attr}><name>X</name></{tag}></d>\n"
            )
            got = ET.fromstring(overrides.apply(src, {f"{kind}.xml": xml})[f"{kind}.xml"].encode())[0]
            self.assertEqual(got.get(name), self.WANT[src], src)

    def test_keep_list_holds_the_printed_values_and_not_the_ones_taken_from_commlink6(self):
        from tools.cl6check import optional

        keep = optional.load_keep()
        for k in [
            ("bs", "augmentations", "bs.fangs", "cost"),
            ("bs", "augmentations", "bs.thermosense-organs", "cost"),
            ("crb", "weapons", "crb.colt-cobra-tz-100", "ar"),
            ("crb", "weapons", "crb.ares-viper-slivergun", "ar"),
            ("da", "adeptpowers", "da.motion-sense", "activation"),
        ]:
            self.assertIn(k, keep)
        self.assertNotIn(("swc", "qualities", "swc.ghoul", "karma"), keep)
        self.assertNotIn(("crb", "weapons", "crb.mossberg-cmdt", "ammo"), keep)
        held = {tuple(h[:4]) for h in json.loads(Path(optional.KEEP).read_text(encoding="utf8"))["hold"]}
        self.assertNotIn(
            ("bs", "augmentations", "bs.fangs", "cost"), held
        )  # (the owner keeps ours: it is no longer left open)


class OwnerInfectedRowsTest(unittest.TestCase):
    """The 2026-10-16 decisions in the per-book tables: the Ghoul per base metatype, the Companion's Armor optional
    power with no description, the Silencer's exclusion, and what cl6check keeps for them (value_keep.json)."""

    def test_each_ghoul_takes_29_karma_and_its_own_metatype(self):
        bases = ("human", "dwarf", "elf", "ork", "troll")
        xml = (
            '<?xml version="1.0"?>\n<d kind="qualities">'
            + "".join(
                f'<quality id="ghoul-{b}" source="ZZ" page="1" kind="positive" karma="27"><name>Ghoul '
                f"({b.title()})</name></quality>"
                for b in bases
            )
            + "</d>\n"
        )
        root = ET.fromstring(overrides.apply("swc", {"qualities.xml": xml})["qualities.xml"].encode())
        for e, b in zip(root, bases):
            self.assertEqual(e.get("karma"), "29", b)
            self.assertEqual([p.get("ref") for p in e.findall("prerequisite")], [b], b)
            self.assertEqual(len([m for m in e.findall("modifier") if m.get("set") == "MAX"]), 8, b)
        self.assertEqual(
            [a.text for a in root[0].findall("alias")], ["Ghoul"]
        )  # (Commlink6's name for the human ghoul)

    def test_the_armor_optional_power_has_no_description(self):
        texts = (
            '<?xml version="1.0"?>\n<sr6:data xmlns:sr6="urn:x" kind="texts" version="1">\n'
            '  <text of="qualities" id="infected-optional-powers.armor-per-point">A made-up section text.</text>\n'
            '  <text of="qualities" id="infected-optional-powers.fear">Kept.</text>\n</sr6:data>\n'
        )
        got = [x.get("id") for x in ET.fromstring(overrides.texts("swc", {}, texts).encode())]
        self.assertEqual(got, ["infected-optional-powers.fear"])

    def test_the_silencer_excludes_revolvers_and_shotguns_and_lists_no_allowed_weapon(self):
        row = next(r for r in overrides.table("crb") if r.get("id") == "silencer-suppressor")
        self.assertEqual(row["kind"], "weapons")  # (our entry's kind: the id is an implant weapon's too)
        req = [k["attrs"] for k in row["kids"] if k["tag"] == "prerequisite"]
        self.assertEqual(
            [(p["type"], p["ref"], p.get("negate")) for p in req],
            [("WEAPON_TYPE", "revolvers", "true"), ("WEAPON_TYPE", "shotguns", "true")],
        )
        self.assertEqual([k["tag"] for k in row["kids"] if k["tag"] != "prerequisite"], ["fits", "variant"])

    def test_cl6check_keeps_the_structural_differences(self):
        from tools.cl6check import optional

        keep = optional.load_keep()
        self.assertIn(("crb", "weapons", "crb.silencer-suppressor", "requires"), keep)
        self.assertIn(("swc", "qualities", "swc.astral-hazing", "requires"), keep)
        held = {tuple(h[:4]) for h in json.loads(Path(optional.KEEP).read_text(encoding="utf8"))["hold"]}
        for q in (
            "mutaqua",
            "nosferatu",
            "wendigo",
        ):  # (their Awakened price is a karmaif now: no longer two disagreeing records)
            self.assertNotIn(("swc", "qualities", f"swc.{q}", "karma"), held)


class OwnerClassCRowsTest(unittest.TestCase):
    """The 2026-10-15 class c decisions: three transgenic skins, the Sim module row as two items, the printed values
    kept."""

    def test_transgenic_chameleon_skin_is_two_items_and_rhino_skin_a_third(self):
        xml = (
            '<?xml version="1.0"?>\n<d kind="augmentations"><augmentation id="transgenic-chameleon-skin" source="BS" '
            'page="101" avail="6" '
            'essence="0.15" cost="2100"><name>Transgenic chameleon skin</name></augmentation></d>\n'
        )
        root = ET.fromstring(overrides.apply("bs", {"augmentations.xml": xml})["augmentations.xml"].encode())
        got = {e.get("id"): e for e in root}
        self.assertNotIn("transgenic-chameleon-skin", got)
        want = {
            "transgenic-chameleon-skin-basic": ("0.3", "6", "1400"),
            "transgenic-chameleon-skin-dynamic": ("0.45", "7", "2800"),
            "transgenic-rhino-skin": ("0.15", "4", "2100"),
        }
        for i, vals in want.items():
            e = got[i]
            self.assertEqual((e.get("essence"), e.get("avail"), e.get("cost")), vals, i)
            self.assertEqual(e.get("class"), "GENEWARE/TRANSGENIC_BIOWARE", i)
            self.assertEqual(e.findall("variant"), [], i)  # (one catalog item per variant)
        self.assertEqual(got["transgenic-rhino-skin"].find("effect").get("target"), "derived:defense")

    def test_the_sim_module_row_is_two_items_with_the_hot_sim_one_at_2_i(self):
        from importer.sr6.catalog import Catalog

        got = dict(
            Catalog.variants(
                "Sim module / w Hot sim", {"rating": "– / –", "avail": "– / 2(I)", "cost": "+100¥ / +250¥"}
            )
        )
        self.assertEqual(list(got), ["Sim module", "Sim module w/ Hot sim"])
        self.assertEqual((got["Sim module"]["avail"], got["Sim module"]["cost"]), ("–", "+100¥"))
        self.assertEqual(
            (got["Sim module w/ Hot sim"]["avail"], got["Sim module w/ Hot sim"]["cost"]), ("2(I)", "+250¥")
        )

    def test_keep_list_holds_the_printed_values_but_not_the_two_fixed_rows(self):
        from tools.cl6check import optional

        keep = optional.load_keep()
        for k in [
            ("bs", "gear", "bs.bulk-modification", "cost"),
            ("crb", "programs", "crb.tutorsoft", "avail"),
            ("crb", "augmentations", "crb.control-rig", "cost"),
            ("so", "electronics", "so.swindler-stick-gold", "legality"),
            ("so", "weapons", "so.explosive-cosmetics-nail-polish-remover", "legality"),
            ("nf", "armor", "nf.bowler", "avail"),
        ]:
            self.assertIn(k, keep)
        self.assertNotIn(("bs", "augmentations", "bs.transgenic-chameleon-skin", "avail"), keep)
        self.assertNotIn(("crb", "gear", "crb.sim-module-w-hot-sim", "legality"), keep)


class OwnerVariantSplitsTest(unittest.TestCase):
    """The 2026-10-15 variant decisions: one catalog item per variant the book prints a value for."""

    def test_gonzo_case_cell_with_a_price_per_variant_is_two_items(self):
        from importer.sr6.catalog import Catalog

        got = dict(
            Catalog.variants("Gonzo Case", {"avail": "5(I)", "cost": "1,000¥ for cyberdeck/5,000¥ for cyberhack"})
        )
        self.assertEqual(list(got), ["Gonzo Case (cyberdeck)", "Gonzo Case (cyberhack)"])
        self.assertEqual([g["cost"] for g in got.values()], ["1,000¥", "5,000¥"])
        self.assertEqual({g["avail"] for g in got.values()}, {"5(I)"})
        self.assertEqual(
            Catalog.variants("Zed Case", {"cost": "500¥"}), [("Zed Case", {"cost": "500¥"})]
        )  # (a plain price is untouched)

    def test_fs_pouch_shield_and_medkit_rows(self):
        armor = (
            '<?xml version="1.0"?>\n<d kind="armor">'
            '<armor id="concealable-ammo-pouch" source="FS" page="55" capacity="[3]" avail="2(L)" '
            'cost="100"><name>Concealable ammo pouch</name></armor>'
            '<armor id="modular-equipment-mounting-system-mems-mems-medkit-pouch" source="FS" page="48" '
            'capacity="[2-3]" avail="2" cost="200">'
            "<name>MEMS Medkit Pouch</name></armor></d>\n"
        )
        weapons = (
            '<?xml version="1.0"?>\n<d kind="weapons"><weapon id="machine-gun-blast-shields" source="FS" page="73" '
            'avail="4(I)" cost="250">'
            '<name>Machine Gun Blast Shields</name><effect target="derived:defense" op="add" value="1"/></weapon></d>\n'
        )
        out = overrides.apply("fs", {"armor.xml": armor, "weapons.xml": weapons})
        a = {e.get("id"): e for e in ET.fromstring(out["armor.xml"].encode())}
        self.assertEqual(
            (a["concealable-ammo-pouch"].get("cost"), a["concealable-ammo-pouch-sealed"].get("cost")), ("100", "200")
        )
        self.assertEqual(
            {a[i].get(k) for i in ("concealable-ammo-pouch", "concealable-ammo-pouch-sealed") for k in ("capacity",)},
            {"[3]"},
        )
        self.assertEqual(a["concealable-ammo-pouch-sealed"].get("avail"), "2(L)")
        m1 = a["modular-equipment-mounting-system-mems-mems-medkit-pouch"]
        m2 = a["mems-medkit-pouch-rank-4-6"]
        self.assertEqual(
            (m1.findtext("name"), m1.get("capacity"), m2.get("capacity"), m2.get("cost")),
            ("MEMS Medkit Pouch (rank 1-3)", "[2]", "[3]", "200"),
        )
        w = {e.get("id"): e for e in ET.fromstring(out["weapons.xml"].encode())}
        small, large = w["machine-gun-blast-shields"], w["machine-gun-blast-shield-large"]
        self.assertEqual(
            (small.findtext("name"), small.get("cost"), large.get("cost"), large.get("avail")),
            ("Machine Gun Blast Shield (small)", "250", "350", "4(I)"),
        )
        self.assertEqual((small.find("effect").get("value"), large.find("effect").get("value")), ("1", "2"))

    def test_sim_module_names_of_commlink6_hot_name_is_an_alias_of_the_hot_sim_item(self):
        gear = (
            '<?xml version="1.0"?>\n<d kind="gear"><gear id="sim-module" source="CRB" page="268" cost="100"><name>Sim '
            "module</name></gear>"
            '<gear id="sim-module-w-hot-sim" source="CRB" page="268" cost="250"><name>Sim module w/ Hot '
            "sim</name></gear></d>\n"
        )
        got = {
            e.get("id"): [a.text for a in e.findall("alias")]
            for e in ET.fromstring(overrides.apply("crb", {"gear.xml": gear})["gear.xml"].encode())
        }
        self.assertIn("SIM module (hot)", got["sim-module-w-hot-sim"])
        self.assertNotIn("SIM module (hot)", got["sim-module"])

    def test_accepted_variant_tags_and_costs_are_in_the_keep_list(self):
        from tools.cl6check import optional

        keep = optional.load_keep()
        for k in [
            ("crb", "gear", "crb.sim-module", "cost"),
            ("crb", "gear", "crb.sim-module-w-hot-sim", "cost"),
            ("crb", "gear", "crb.laser-sight", "variants"),
            ("da", "weapons", "da.m40", "variants"),
            ("ts", "electronics", "ts.full-body-scanner-booth", "variants"),
        ]:
            self.assertIn(k, keep)


class ErrataRowsTest(unittest.TestCase):
    """`"gen": "errata"` id rows (hand-written, importer/sr6/overrides/): an errata's values win over Commlink6's and
    the book's."""

    XML = (
        '<?xml version="1.0"?>\n<d kind="augmentations">'
        '<augmentation id="zz-eyes-5" source="ZZ" page="9" rating="5" avail="15" cost="900"><name>Zeyes (Rating '
        "5)</name>"
        '<formula field="avail">tier(R; 5: 15; 6: 18)</formula><issue field="cost" code="ambiguous"/></augmentation>'
        '<augmentation id="zz-hum" source="ZZ" page="9" rating="1-3" avail="(Rating x 6)"><name>Hum</name>'
        '<formula field="avail">(R*6)</formula><effect target="item:concealability" op="add" value="-2"/><slot '
        'id="s"/></augmentation>'
        '<augmentation id="zz-gone" source="ZZ" page="9"><name>Gone</name></augmentation></d>\n'
    )

    def apply(self, rows):
        """{id: entry} of the augmentations file after the override `rows`."""
        out = overrides.apply("zz", {"augmentations.xml": self.XML}, rows)["augmentations.xml"]
        return {e.get("id"): e for e in ET.fromstring(out.encode())}

    def test_errata_values_win_over_a_commlink6_value_row_whatever_the_order(self):
        rows = [
            {"kind": "augmentations", "id": "zz-eyes-5", "set": {"avail": "4"}, "gen": "errata"},
            {
                "cl6": "Zeyes",
                "kind": "augmentations",
                "id": "zz-eyes-5",
                "set": {"avail": "9", "cost": "7"},
                "gen": "value",
            },
        ]
        e = self.apply(rows)["zz-eyes-5"]
        self.assertEqual((e.get("avail"), e.get("cost")), ("4", "7"))
        self.assertEqual(e.findall("formula"), [])  # (the value they described is replaced)

    def test_null_drops_an_attribute_effects_replace_the_same_target_and_formulas_are_set(self):
        rows = [
            {
                "kind": "augmentations",
                "id": "zz-hum",
                "set": {"rating": None, "avail": "6"},
                "formula": {"cost": "tier(R; 6: 1; 7: 2)"},
                "effects": [{"target": "item:concealability", "op": "add", "value": "2"}],
                "gen": "errata",
            }
        ]
        e = self.apply(rows)["zz-hum"]
        self.assertEqual((e.get("rating"), e.get("avail")), (None, "6"))
        self.assertEqual(
            [(x.get("target"), x.get("value")) for x in e.findall("effect")], [("item:concealability", "2")]
        )
        self.assertEqual([x.text for x in e.findall("formula")], ["tier(R; 6: 1; 7: 2)"])
        self.assertIsNotNone(e.find("slot"))

    def test_a_status_kid_is_added_once_before_the_text_and_other_kids_stay_refused(self):
        row = {
            "kind": "augmentations",
            "id": "zz-hum",
            "kids": [{"tag": "status", "attrs": {"name": "Zapped", "level": "3"}}],
            "gen": "errata",
        }
        overrides.check([row])
        e = self.apply([row, dict(row)])["zz-hum"]  # (twice: added once)
        self.assertEqual([(x.get("name"), x.get("level")) for x in e.findall("status")], [("Zapped", "3")])
        with self.assertRaisesRegex(ValueError, "kids are"):
            overrides.check([{**row, "kids": [{"tag": "text", "attrs": {}}]}])

    def test_an_effect_naming_no_target_is_refused_before_the_run(self):
        with self.assertRaisesRegex(ValueError, "names its target"):
            overrides.check(
                [{"kind": "augmentations", "id": "zz-hum", "gen": "errata", "effects": [{"op": "add", "value": "2"}]}]
            )

    def test_remove_and_rename_without_an_alias(self):
        rows = [
            {"kind": "augmentations", "id": "zz-gone", "remove": True},
            {"kind": "augmentations", "id": "zz-eyes-5", "rename": "Zeyes (Rating 6)", "alias": False},
        ]
        got = self.apply(rows)
        self.assertNotIn("zz-gone", got)
        self.assertEqual(
            (got["zz-eyes-5"].findtext("name"), got["zz-eyes-5"].findall("alias")), ("Zeyes (Rating 6)", [])
        )

    def test_rcc_headware_is_deduped_and_priced_from_commlink6(self):
        """DC p.145 printed two 'RCC Headware' rows; the dupe (rcc) is removed and the survivor (rcc-headware) carries
        Commlink6's price/avail plus the owner's capacity. See importer/sr6/overrides/dc.json."""
        rows = {r["id"]: r for r in overrides.table("dc") if "id" in r}
        self.assertTrue(rows["rcc"].get("remove"))  # the duplicate is dropped
        self.assertEqual(
            rows["rcc-headware"]["set"],
            {"capacity": "[3]", "cost": "4000", "avail": "4 (L)"},
        )  # CL6 price 4000 / avail 4 (L); capacity [3] consumed in its headware-implant host, no own Essence

    def test_no_future_errata_rows_cover_the_errata_and_leave_no_text(self):
        rows = {(r["kind"], r["id"]): r for r in overrides.table("nf") if r.get("gen") == "errata"}
        want = {
            ("gear", "rising-star"): "2",
            ("gear", "big-time"): "3",
            ("gear", "external-synth"): "+1",
            ("gear", "internal-synth"): "+2",
            ("weapons", "yo-yo-hardened"): "2",
            ("weapons", "yo-yo-bladed"): "3(L)",
            ("weapons", "yo-yo-monofilament"): "6(I)",
            ("weapons", "skateboard-hardened"): "2",
            ("weapons", "skateboard-bladed"): "3(L)",
            ("weapons", "roller-skates-bladed"): "3(L)",
            ("weapons", "molotov"): "1(I)",
            ("weapons", "pitchfork"): "1",
            ("gear", "graffiti-kit"): "1",
            ("vehicles", "ford-broadcast"): "2",
            ("vehicles", "s-b-condor"): "3",
            ("gear", "press-pass"): "2(L)",
            ("gear", "procam"): "1",
            ("gear", "smartcam-external"): "2",
            ("gear", "smartcam-internal"): "4",
            ("gear", "basic-press"): "1",
            ("gear", "small-press"): "4",
            ("gear", "industrial-press"): "7",
            ("augmentations", "cybereyes-rating-5"): "4",
            ("augmentations", "cybereyes-rating-6"): "5",
            ("augmentations", "cyberears-rating-5"): "4",
            ("augmentations", "cyberears-rating-6"): "5",
        }
        self.assertEqual({k: rows[k]["set"]["avail"] for k in want}, want)
        self.assertEqual(rows["armor", "trenchcoat"]["effects"][0]["value"], "2")
        self.assertEqual(
            rows["weapons", "molotov"]["kids"], [{"tag": "status", "attrs": {"name": "Burning", "level": "4"}}]
        )  # (also applies Burning 4)
        self.assertEqual(
            (
                rows["augmentations", "cybereyes-rating-5"]["set"]["cost"],
                rows["augmentations", "cyberears-rating-6"]["set"]["cost"],
            ),
            ("18000", "21000"),
        )
        self.assertEqual(
            [rows[("augmentations", i)]["set"]["rating"] for i in ("audiotune", "vocal-expansion")], [None, None]
        )
        gone = {r["id"] for r in overrides.table("nf") if r.get("remove")}
        self.assertEqual(gone, {"audiotune-hacked", "vision-enhancement", "audio-enhancement"})

    def test_keep_list_no_longer_keeps_the_book_s_fifth_edition_numbers_for_no_future(self):
        from tools.cl6check import optional

        keep = optional.load_keep()
        for k in [
            ("nf", "vehicles", "nf.ford-broadcast", "avail"),
            ("nf", "weapons", "nf.molotov", "legality"),
            ("nf", "augmentations", "nf.cybereyes-rating-5", "cost"),
            ("nf", "electronics", "nf.press-pass", "avail"),
        ]:
            self.assertNotIn(k, keep)


class OwnerRowsTest(unittest.TestCase):
    """`"gen": "owner"` id rows (owner 2026-10-16): a kid with "replaces" takes the place of the entry's child it
    names."""

    XML = (
        '<?xml version="1.0"?>\n<d kind="qualities"><quality id="zz-glower" source="ZZ" page="9" '
        'karma="20"><name>Glower</name>'
        '<power name="Glow"/><power name="Dusk" rating="2"/><weakness name="Dusk"/><text/></quality></d>\n'
    )
    ROW = {
        "cl6": "Glower",
        "kind": "qualities",
        "id": "zz-glower",
        "gen": "owner",
        "kids": [{"tag": "power", "attrs": {"name": "Innate Knack (Dusk)"}, "replaces": {"name": "Dusk"}}],
    }

    def apply(self, rows):
        """The quality entry after the override `rows`."""
        out = overrides.apply("zz", {"qualities.xml": self.XML}, overrides.check(rows))["qualities.xml"]
        return ET.fromstring(out.encode()).find("quality")

    def test_the_named_child_is_replaced_in_place_and_the_rest_stay(self):
        e = self.apply([self.ROW, dict(self.ROW)])  # (twice: once)
        self.assertEqual(
            [(x.tag, x.get("name"), x.get("rating")) for x in e if x.tag in ("power", "weakness")],
            [("power", "Glow", None), ("power", "Innate Knack (Dusk)", None), ("weakness", "Dusk", None)],
        )

    def test_a_child_it_does_not_find_adds_nothing(self):
        row = {**self.ROW, "kids": [{**self.ROW["kids"][0], "replaces": {"name": "Dawn"}}]}
        e = self.apply([row])
        self.assertEqual([x.get("name") for x in e.findall("power")], ["Glow", "Dusk"])

    def test_nibiinaabe_s_darkness_is_the_critter_power_innate_spell(self):
        rows = [r for r in overrides.table("swc") if r.get("gen") == "owner" and r["id"] == "nibiinaabe"]
        self.assertEqual(
            rows,
            [
                {
                    "cl6": "Nibiinaabe",
                    "kind": "qualities",
                    "id": "nibiinaabe",
                    "gen": "owner",
                    "kids": [
                        {"tag": "power", "attrs": {"name": "Innate Spell (Darkness)"}, "replaces": {"name": "Darkness"}}
                    ],
                }
            ],
        )

    def test_momentous_misfortune_reads_the_5_karma_the_book_prints_and_no_hold_row_is_left(self):
        from tools.cl6check import optional

        row = [r for r in overrides.table("swc") if r.get("gen") == "owner" and r["id"] == "momentous-misfortune"]
        self.assertEqual([r["set"] for r in row], [{"karma": "5"}])
        xml = (
            '<?xml version="1.0"?>\n<d kind="qualities"><quality id="momentous-misfortune" source="SWC" page="138" '
            'karma="25"><name>Momentous Misfortune</name></quality></d>\n'
        )
        got = ET.fromstring(overrides.apply("swc", {"qualities.xml": xml})["qualities.xml"].encode())[0]
        self.assertEqual(got.get("karma"), "5")
        self.assertEqual(json.loads(Path(optional.KEEP).read_text(encoding="utf8"))["hold"], [])
        paired = {k: r["our_id"] for k, r in optional.load_have().items()}
        self.assertEqual(paired[("swc", "obsession_misfortune")], "swc.obsession-momentous-misfortune")

    def test_an_owner_row_sets_a_rating_over_a_stale_found_and_survives_a_value_regeneration(self):
        from tools.cl6check import valuemap

        xml = (
            '<?xml version="1.0"?>\n<d kind="gear"><gear id="zz.chip" source="ZZ" page="9" rating="1"><name>Chip</name>'
            '<found field="rating">p. 9</found><text/></gear></d>\n'
        )
        row = {
            "cl6": "Chip",
            "kind": "gear",
            "id": "zz.chip",
            "gen": "owner",
            "set": {"rating": "1–6"},
            "note": "range not printed; CL6 value, owner-accepted 2026-10-17",
        }
        g = ET.fromstring(overrides.apply("zz", {"gear.xml": xml}, overrides.check([row]))["gear.xml"].encode())[0]
        self.assertEqual((g.get("rating"), [c.tag for c in g]), ("1–6", ["name", "text"]))
        old = [row, {"cl6": "Old", "kind": "gear", "id": "zz.old", "gen": "value", "set": {"cost": "5"}}]
        new = {"cl6": "New", "kind": "gear", "id": "zz.new", "gen": "value", "set": {"cost": "7"}}
        self.assertEqual(valuemap.replace_value_rows(old, [new]), [row, new])


class SplitRowsTest(unittest.TestCase):
    """`"split"` rows (owner 2026-10-16, multi-record): a row the book prints once for several things becomes one item
    each."""

    XML = (
        '<?xml version="1.0"?>\n<d kind="gear"><gear id="zz-kit" source="ZZ" page="9" avail="4(I)" cost="250 + Base '
        'Cost">'
        '<name>Zz Kit</name><alias>Old name</alias><alias id="zz.older" kind="gear"/><issue field="cost" '
        'code="ambiguous">priced off</issue>'
        '<effect target="item:concealability" op="add" value="-2"/></gear></d>\n'
    )
    ROW = {
        "cl6": "Zz Kit",
        "kind": "gear",
        "id": "zz-kit",
        "split": [
            {
                "id": "zz-kit-a",
                "name": "Zz Kit (A)",
                "set": {"cost": "255"},
                "note": {"field": "cost", "text": "250 + Base Cost"},
            },
            {"id": "zz-kit-b", "name": "Zz Kit (B)", "set": {"cost": "270"}},
        ],
    }
    TEXTS = (
        '<sr6:data xmlns:sr6="urn:zz" kind="texts">\n  <text of="gear" id="zz-kit">One printed '
        "block.</text>\n</sr6:data>\n"
    )

    def test_one_copy_per_part_with_its_own_value_and_the_printed_rule_as_a_note(self):
        out = overrides.apply("zz", {"gear.xml": self.XML}, [self.ROW])["gear.xml"]
        got = {e.get("id"): e for e in ET.fromstring(out.encode())}
        self.assertEqual(list(got), ["zz-kit-a", "zz-kit-b"])
        a, b = got["zz-kit-a"], got["zz-kit-b"]
        self.assertEqual(
            (a.findtext("name"), a.get("cost"), a.get("avail"), b.get("cost"), b.get("avail")),
            ("Zz Kit (A)", "255", "4(I)", "270", "4(I)"),
        )
        self.assertEqual([(n.get("field"), n.text) for n in a.findall("note")], [("cost", "250 + Base Cost")])
        self.assertEqual(b.findall("note"), [])
        for e in (a, b):  # (the effect is kept; the name aliases and the cost issue go, an old id alias stays)
            self.assertEqual(e.find("effect").get("value"), "-2")
            self.assertEqual(e.findall("issue"), [])
            self.assertEqual([x.get("id") for x in e.findall("alias")], ["zz.older"])

    def test_the_books_text_goes_to_each_part_and_the_source_text_goes(self):
        got = overrides.texts("zz", {"gear.xml": self.XML}, self.TEXTS, [self.ROW])
        self.assertEqual(
            sorted(i for _, i, _ in __import__("importer.xmlio", fromlist=["x"]).texts_entries(got)),
            ["zz-kit-a", "zz-kit-b"],
        )
        self.assertEqual(got.count("One printed block."), 2)

    def test_a_split_refuses_a_text_field_and_a_missing_entry_is_reported_only(self):
        with self.assertRaises(ValueError):
            overrides.apply(
                "zz",
                {"gear.xml": self.XML},
                [{**self.ROW, "split": [{"id": "x", "name": "X", "set": {"description": "t"}}]}],
            )
        self.assertEqual(
            overrides.apply("zz", {"gear.xml": self.XML}, [{**self.ROW, "id": "nope"}])["gear.xml"], self.XML
        )

    def test_a_parts_null_drops_the_attribute(self):
        row = {**self.ROW, "split": [{"id": "zz-kit-a", "name": "Zz Kit (A)", "set": {"avail": None, "cost": "255"}}]}
        e = ET.fromstring(overrides.apply("zz", {"gear.xml": self.XML}, [row])["gear.xml"].encode())[0]
        self.assertEqual((e.get("avail"), e.get("cost")), (None, "255"))

    def test_shipped_swindler_manadyne_and_skate_splits(self):
        sw = {p["id"]: p for r in overrides.table("so") for p in r.get("split", [])}
        self.assertEqual(
            {i: (p["name"], p["set"]["cost"]) for i, p in sw.items()},
            {
                "swindler-stick-standard": ("Swindler Stick (Standard)", "255"),
                "swindler-stick-silver": ("Swindler Stick (Silver)", "270"),
                "swindler-stick-gold": ("Swindler Stick (Gold)", "350"),
                "swindler-stick-platinum": ("Swindler Stick (Platinum)", "750"),
                "swindler-stick-ebony": ("Swindler Stick (Ebony)", "1250"),
            },
        )
        self.assertTrue(all(p["note"]["text"] == "250 + Certified Credstick Cost" for p in sw.values()))
        self.assertEqual(
            {p["id"]: p["name"] for r in overrides.table("sw") for p in r.get("split", [])},
            {
                "manadyne-mb-10": "Manadyne MB-10",
                "manadyne-pb-10": "Manadyne PB-10",
                "manadyne-mb-100": "Manadyne MB-100",
                "manadyne-pb-100": "Manadyne PB-100",
            },
        )
        self.assertEqual(
            {p["id"]: p["name"] for r in overrides.table("nf") for p in r.get("split", [])},
            {
                "skateboard-hardened": "Skateboard (Hardened)",
                "skateboard-bladed": "Skateboard (Bladed)",
                "roller-skates-bladed": "Roller skates (Bladed)",
            },
        )
        errata = {
            r["id"]: r["set"]["avail"] for r in overrides.table("nf") if r.get("gen") == "errata" and "skate" in r["id"]
        }
        self.assertEqual(
            errata, {"skateboard-hardened": "2", "skateboard-bladed": "3(L)", "roller-skates-bladed": "3(L)"}
        )

    def test_keep_list_holds_the_printed_availability_of_the_five_sticks_and_the_four_manadynes(self):
        from tools.cl6check import optional

        keep = optional.load_keep()
        for g in ("standard", "silver", "gold", "platinum", "ebony"):
            self.assertIn(("so", "electronics", f"so.swindler-stick-{g}", "avail"), keep)
            self.assertNotIn(("so", "electronics", f"so.swindler-stick-{g}", "cost"), keep)
        for m in ("mb-10", "pb-10", "mb-100", "pb-100"):
            self.assertIn(("sw", "gear", f"sw.manadyne-{m}", "cost"), keep)
            self.assertIn(("sw", "gear", f"sw.manadyne-{m}", "avail"), keep)


class SlotStructureRowsTest(unittest.TestCase):
    """Owner 2026-10-15: Commlink6's slots/fits for seven entries; a mount column does not add a fit beside an entry's
    own."""

    def kids(self, src, kind, eid):
        """[(tag, attributes)] of the family child rows the override table in `src` holds for one kind and id."""
        return [
            (k["tag"], k["attrs"])
            for r in overrides.table(src)
            if (r["kind"], r.get("id")) == (kind, eid) and r.get("gen") == "family"
            for k in r.get("kids", [])
        ]

    def test_the_seven_rows(self):
        hardpoint = ("slot", {"id": "vehicle-hardpoint"})
        self.assertIn(hardpoint, self.kids("crb", "weapons", "smart-firing-platform"))
        for i in ("powered-heavy-tripod", "reinforced-smart-firing-platform", "wheeled-heavy-tripod"):
            self.assertIn(hardpoint, self.kids("da", "weapons", i))
        scope = self.kids("crb", "weapons", "imaging-scope")  # (the p260 accessory: capacity 3 per its text)
        self.assertIn(("slot", {"id": "optical", "value": "3"}), scope)
        self.assertIn(("fits", {"slot": "top"}), scope)
        stock = self.kids("crb", "gear", "folding-stock")
        self.assertIn(("fits", {"slot": "stock"}), stock)
        self.assertNotIn(("slot", {"id": "stock"}), stock)
        self.assertIn(("fits", {"slot": "electronic-accessory"}), self.kids("crb", "gear", "simrig"))

    def test_a_mount_column_is_a_fit_only_as_a_written_fits_element(self):
        # (the importer writes the fit: classes.associations; the comparer reads elements, the runtime ignores `mount`)
        from tools.cl6check import ours

        def fam(xml):
            return ours.families(ET.fromstring(xml)).get("slots")

        self.assertEqual(
            fam('<weapon mount="Under"><slot id="vehicle-hardpoint"/></weapon>'), {("slot", "vehicle-hardpoint")}
        )
        self.assertIsNone(fam('<weapon mount="Under"/>'))
        self.assertEqual(fam('<weapon mount="Under"><fits slot="under"/></weapon>'), {("fits", "under")})

    def test_scavenged_rags_keep_the_printed_empty_availability(self):
        self.assertFalse(
            [r for r in overrides.table("so") if r.get("id") == "scavenged-rags" and "avail" in r.get("set", {})]
        )
        from tools.cl6check import optional

        self.assertIn(("so", "armor", "so.scavenged-rags", "avail"), optional.load_keep())
