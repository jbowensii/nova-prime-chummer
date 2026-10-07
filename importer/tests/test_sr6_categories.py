"""An item's category is its table's title (importer/sr6/categories.py): the category records, the accessory tables and
the hosts they fit, the rows whose names need their category (group, composed search names), a name repeated in
another category, a product's configurations (shapes.configurations) and footnote marks. Every name, number and line
is invented."""
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import categories as C
from importer.sr6 import moved, regroup
from importer.sr6.recipes import crb, da

GEAR_MD = """<!-- page 251 -->
# GEAR
Gear intro.
## Zorplimbs
A zorplimb swaps a made-up limb: the zorparm and the zorpskull are popular, and every arm, leg or skull fits.
The holster, the armor and the plating are extras. A zorparm can hold a holster.
#### zorplimb cost and capacity
| LIMB | ESSENCE | AVAIL | SYNTHETIC COST (CAPACITY) | OBVIOUS COST (CAPACITY) |
|---|---|---|---|---|
| Arm | 1 | 4 | 9,000¥(8) | 7,000¥(15) |
| Skull | 0.75 | 4 | 5,000¥(2) | 4,000¥(4) |
| Leg | 1 | 4 | 9,000¥(8) | 7,000¥(15) |
## Zorplimb Accessories
Each accessory takes capacity.
#### zorplimb accessories
| ITEM | CAPACITY | AVAIL | COST |
|---|---|---|---|
| Armor | [Rating] | 6(L) | Rating x 3,000¥ |
| Holster | [2] | 4 | 1,500¥ |
## Glowware
An enhancement glows.
#### glowware enhancements
| ITEM | CAPACITY | AVAIL | COST |
|---|---|---|---|
| Armor | [1] | 2 | 500¥ |
## Gizmos
A gizmo does things.
#### gizmos
| ITEM | AVAIL | COST |
|---|---|---|
| Ares Zapmaster 9 | 4 | 300¥ |
| Ares Glowmaster | 4 | 350¥ |
"""

POLEARM_MD = """<!-- page 40 -->
# BLEEDERS & BONE BREAKERS
## Game Information: Polearms
#### Zapco Weapons Glimmer Folding Polearm
A made-up folding polearm: it folds from a knife to a spear.
##### Zapco Weapons Glimmer Folding Polearm
**WEAPON TYPE DV ATTACK RATING AVAIL COST**
Knife Blade 3P 8/—/—/—/— 4(L) 900¥
Spear Blade 4P 10/6*/—/—/— 5(I) 1,000¥
* Made-up range note
**Wireless Bonus:** A made-up wireless bonus.
<!-- page 184 -->
## Not Read
A made-up back cover.
"""


def files(res):
    return {k[:-4]: ET.fromstring(x) for k, x in res.files.items()}


class CategoryNamesTest(unittest.TestCase):
    def test_titles(self):
        self.assertEqual(C.category_name("zorplimb cost and capacity"), "Zorplimb")
        self.assertEqual(C.category_name("helmets and shields"), "Helmet and shield")
        self.assertEqual(C.category_name("throwing weapons/projectiles"), "Throwing weapon/projectile")
        self.assertEqual(C.category_name("clothes", {"clothes"}), "Clothes")  # (the book prints no `clothe`)
        self.assertIsNone(C.category_name("Table 4.2"))
        self.assertTrue(C.split_title("zorplimb cost and"))

    def test_accessory_hosts(self):
        self.assertEqual(C.hosts("Zorplimb accessory"), ["zorplimb"])
        self.assertEqual(C.hosts("Zorparm and zorpleg mods"), ["zorparm", "zorpleg"])
        self.assertEqual(C.hosts("Accessory"), [])  # an accessory table naming no host
        self.assertIsNone(C.hosts("Zorplimb"))

    def test_bare_part(self):
        voc = C.Vocabulary(["the zorparm and the arm, a glow gizmo"])
        conf, made = C.bare_part("Arm (synthetic)", "Zorplimb", voc, set(), False, 1.0, True)
        self.assertEqual(made, ["zorparm"])
        self.assertGreaterEqual(conf, C.GROUP_AT)
        self.assertEqual(C.bare_part("Ares Zapmaster 9", "Gizmo", voc, set(), False, 1.0)[0], 0.0)  # a model


class CategoriesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        text, _ = regroup.regroup(GEAR_MD, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        cls.res = crb.extract(text)
        cls.f = files(cls.res)

    def entry(self, kind, name, category=None):
        return next(e for e in self.f[kind] if e.findtext("name") == name and (category is None or e.get("category") == category))

    def test_rows_carry_their_tables_category(self):
        arm = self.entry("gear", "Arm (synthetic)")
        self.assertEqual((arm.get("category"), arm.get("group")), ("Zorplimb", "Zorplimb"))
        self.assertEqual(arm.findtext("name"), "Arm (synthetic)")  # the printed row, never prefixed
        al = [a.text for a in arm.findall("alias")]
        self.assertIn("Zorparm", al)
        self.assertIn("Synthetic zorparm", al)
        leg = [a.text for a in self.entry("gear", "Leg (obvious)").findall("alias")]
        self.assertIn("Zorpleg", leg)  # the stem its siblings print, composing every part
        self.assertIsNone(self.entry("gear", "Ares Zapmaster 9").get("group"))  # a named product

    def test_category_records_and_the_accessory_link(self):
        cats = {c.findtext("name"): c for c in self.f["categories"]}
        self.assertEqual(cats["Zorplimb"].get("table"), "zorplimb cost and capacity")
        self.assertEqual(cats["Zorplimb"].get("section"), "Zorplimbs")
        self.assertEqual(cats["Zorplimb"].get("accessories"), "Zorplimb accessory")
        self.assertEqual(cats["Zorplimb accessory"].get("fits"), "Zorplimb")
        glow = cats["Glowware enhancement"]
        self.assertIsNone(glow.get("fits"))  # no glowware table: an issue, not a guess
        self.assertEqual([(i.get("field"), i.get("code")) for i in glow.findall("issue")], [("fits", "missing")])
        self.assertIn(("category", "accessory table with no matching host"),
                      [(r["kind"], r.get("why")) for r in self.res.report])

    def test_a_name_in_another_category_is_another_item(self):
        a1, a2 = self.entry("gear", "Armor", "Zorplimb accessory"), self.entry("gear", "Armor", "Glowware enhancement")
        self.assertEqual((a1.get("id"), a2.get("id")), ("armor", "glowware-enhancements.armor"))
        self.assertEqual((a1.get("cost"), a2.get("cost")), ("Rating x 3000", "500"))

    def test_an_old_id_follows_its_category(self):
        """The import before had the two Armors as `armor` and `armor-2`: the old second id now finds the glowware
        one by its category."""
        prev = {("gear", "crb.armor"): (["Armor"], [], moved._cat("zorplimb-accessories")),
                ("gear", "crb.armor-2"): (["Armor"], [], moved._cat("glowware-enhancements"))}
        xml = crb.ET.tostring(self.f["gear"], encoding="unicode").replace(' id="', ' id="crb.')
        out, n = moved.carry(prev, {"gear.xml": xml})
        glow = next(e for e in ET.fromstring(out["gear.xml"]) if e.get("category") == "Glowware enhancement")
        self.assertEqual([a.get("id") for a in glow.findall("alias") if a.get("id")], ["crb.armor-2"])


class GeneralTableReaderTest(unittest.TestCase):
    """importer/sr6/tables.py: an item table by its columns, its kind by its column signature then its category."""

    def test_kinds_by_columns(self):
        from importer.sr6 import tables as T
        self.assertEqual(T.kind_of(["ITEM", "HANDL", "ACCEL", "BODY", "AVAIL", "COST"]), "vehicles")
        self.assertEqual(T.kind_of(["ITEM", "ESSENCE", "AVAIL", "COST"]), "augmentations")
        self.assertEqual(T.kind_of(["WEAPON", "DV", "ATTACK RATING", "AVAIL", "COST"]), "weapons")
        self.assertEqual(T.kind_of(["ITEM", "DEFENSE RATING", "AVAIL", "COST"]), "armor")
        self.assertEqual(T.kind_of(["ITEM", "AVAIL", "COST"], "glow armor jackets"), "armor")  # its category's word
        self.assertEqual(T.kind_of(["ITEM", "AVAIL", "COST"], "armor modifications"), "gear")  # (an accessory: no host's kind)
        self.assertIsNone(T.kind_of(["SITUATION", "DICE POOL MODIFIER"]))  # a rules table
        self.assertIsNone(T.kind_of(["THRESHOLD", "RESULT"]))


class ConfigurationsTest(unittest.TestCase):
    """A maker's product printed as one box of configurations (`Knife`, `Spear`): each row its own item."""

    @classmethod
    def setUpClass(cls):
        text, _ = regroup.regroup(POLEARM_MD, da.ALIASES, name_headers=da.NAME_HEADERS, end_page=184)
        cls.res = da.extract(text)
        cls.w = {e.findtext("name"): e for e in ET.fromstring(cls.res.files["weapons.xml"])}
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_rows_of_one_product(self):
        self.assertEqual(set(self.w), {"Knife", "Spear"})
        s = self.w["Spear"]
        self.assertEqual({k: s.get(k) for k in ("category", "maker", "group", "type", "skill", "spec", "ar", "cost")},
                         {"category": "Glimmer Folding Polearm", "maker": "Zapco Weapons", "group": "Glimmer Folding Polearm",
                          "type": "Blade", "skill": "Close Combat", "spec": "Blades", "ar": "10/6/—/—/—", "cost": "1000"})
        self.assertEqual(self.w["Knife"].get("cost"), "900")

    def test_footnote_and_wireless_bonus(self):
        self.assertEqual([(n.get("field"), n.text) for n in self.w["Spear"].findall("note")], [("ar", "Made-up range note")])
        self.assertEqual(self.w["Knife"].findall("note"), [])
        for n in ("knife", "spear"):
            self.assertIn("made-up wireless bonus", self.texts[("weapons", n)])


if __name__ == "__main__":
    unittest.main()
