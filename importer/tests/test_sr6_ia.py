"""SR6 Ingentis Athletes recipe (importer/sr6/recipes/ia.py) on a made-up book.md in the converter's sr6 shape (the
book's: a running head on every page, stat blocks printed as bold text lines under the athlete's name and `metatype:`
line, two in a row with commentary between, a priced weapon in one, the game information under headings of its own).
Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, ia, identify

BOOK_MD = """<!-- page 1 -->
# MADE-UP ATHLETES
<!-- page 2 -->
### Zed “Bolt” Glimmer
Made-up commentary about Zed.
<!-- page 3 -->
shadow stock
**PAGE**
ingentis athletes
3
Zed “Bolt” Glimmer
metatype: Troll (cyclops)
**B A R S W L I C EDG ESS**
7 5 5(8) 5 4 2 3 4 5 6
**DR I/ID AC CM MOVE**
10 11/4 A1/I5 14/10 10/15/+1
**Skills:** Athletics 3, Close Com-
bat 2
**Qualities:** Made Up
**Weapons:**
4 x glow ball [Throwing Weapon, DV 2S, 6/8/—/—/—, Avail
1, Cost 40¥]
A made-up line of commentary on Amy.
Amy “Arc” Fizz
Metatype: Troll (giant)
**B A R S W L I C EDG ESS**
9(+2) 5 4 7 5 2 2 4 6 3.5
**DR I/ID AC CM MOVE**
19 6/1 A1/I2 15/11 10/15/+1
**Gear:** Fizz jacket
### Amy “Arc” Fizz
More made-up commentary.
<!-- page 16 -->
Game Information
### Troll Variants
Made-up variants.
#### Glowclops
A made-up variant that glows.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, ia.ALIASES, name_headers=ia.NAME_HEADERS, end_page=ia.END_PAGE)
    return ia.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


class IaRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_athletes(self):
        n = entries(self.res, "npcs")
        self.assertEqual(list(n), ["Zed “Bolt” Glimmer", "Amy “Arc” Fizz"])
        z, a = n["Zed “Bolt” Glimmer"], n["Amy “Arc” Fizz"]
        self.assertEqual((z.get("group"), z.get("rating"), z.get("rea"), z.get("init"), z.get("move")),
                         ("Ingentis Athletes", None, "5(8)", "11/4", "10/15/+1"))
        self.assertEqual(z.findtext("skills"), "Athletics 3, Close Combat 2")
        self.assertNotIn("commentary", z.findtext("weapons"))  # the weapons end where the commentary goes on
        self.assertEqual((a.get("bod"), a.get("dr"), a.findtext("gear")), ("9(+2)", "19", "Fizz jacket"))
        text = self.texts[("npcs", "zed-bolt-glimmer")]
        self.assertIn("metatype: Troll (cyclops)", text)
        self.assertIn("**Qualities:** Made Up", text)

    def test_priced_weapon(self):
        w = entries(self.res, "weapons")["Glow ball (4)"]  # `4 x glow ball`: the price of four
        self.assertEqual((w.get("category"), w.get("dv"), w.get("ar"), w.get("avail"), w.get("cost")),
                         ("Throwing weapon", "2S", "6/8/—/—/—", "1", "40"))

    def test_rules(self):
        r = entries(self.res, "rules")
        self.assertEqual(list(r), ["Troll Variants", "Glowclops"])
        self.assertEqual(r["Glowclops"].get("chapter"), "Game Information")

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(ia.match({"sha256": ia.SHA256[0]}, ""), 1.0)
        self.assertEqual(ia.match({"sha256": "x", "title": "Shadowrun: Ingentis Athletes"}, ""), 0.9)
        self.assertIs(identify({"sha256": ia.SHA256[0]}, BOOK_MD[:4000])[0], ia)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
