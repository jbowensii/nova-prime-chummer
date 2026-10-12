"""SR6 Johnson 'Dex recipe (importer/sr6/recipes/jd.py) on a made-up book.md in the converter's sr6 shape (the deck's:
a card's front with its title, metatype line and bio, its back with plot hooks, a stat line in bold over its values,
labelled stats and favors), and the converter's card pages (text to the edge, a sideways line dropped). Every name,
number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6 import shapes
from importer.sr6.recipes import crb, identify, jd

BOOK_MD = """<!-- page 1 -->
<!-- page 2 -->
# ABOUT THIS DECK
Made-up rules for the deck's gear levels.
<!-- page 4 -->
# GLOW ‘ZAPPER’ M c FIZZ
FEMALE ELF
A made-up Johnson who glows in the dark.
SHADOWRUN: JOHNSON ‘DEX
<!-- page 5 -->
## GLOW ‘ZAPPER’ M c FIZZ
#### Plot Hooks
**Glow job:** Fetch a made-up glow. Pay: 100 nuyen per runner.
#### STATS
**B A R S W L I C EDG ESS**
2 3 4 (6) 2 3 4 5 6 3 5.5
**Active Skills:** Con 4, Influ-
ence 5
**Gear Level:** 3
**Other:** Made-up implant
#### FAVORS
**Advance:** 5 Karma per 1,000¥
**Reference:** 20 Karma
FEMALE ELF
<!-- page 6 -->
# BRIGHT BOB
male troll
A made-up Johnson who hums.
<!-- page 7 -->
# BRIGHT BOB
#### Plot Hooks
**Hum job:** Hum in a made-up way. Pay: 200 nuyen per runner.
**B A R S W L I C EDG ESS**
2(+4)3(7) 3 2 4 3 5 6(+4) 4 1.5
**Skills:** Athletics 2
**Gear Level:** 4
#### FAVORS
**Advance:** 6 Karma per 1,000¥
<!-- page 42 -->
# Credits
Made-up back cover.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, jd.ALIASES, name_headers=jd.NAME_HEADERS, end_page=jd.END_PAGE)
    return jd.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


class JdRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_johnsons_as_contacts(self):
        c = entries(self.res, "contacts")
        self.assertEqual({k: v.get("archetype") for k, v in c.items()},
                         {"Glow ‘Zapper’ McFizz": "Mr. Johnson", "Bright Bob": "Mr. Johnson"})
        n = entries(self.res, "npcs")
        g = n["Glow ‘Zapper’ McFizz"]
        self.assertEqual((g.get("group"), g.get("rea"), g.get("ess"), g.findtext("skills")),
                         ("Contact", "4(6)", "5.5", "Con 4, Influence 5"))
        self.assertEqual((n["Bright Bob"].get("bod"), n["Bright Bob"].get("agi")), ("2(+4)", "3(7)"))
        text = self.texts[("contacts", "glow-zapper-mcfizz")]
        for part in ("glows in the dark", "Glow job", "**Gear Level:** 3", "**Reference:** 20 Karma"):
            self.assertIn(part, text)
        self.assertNotIn("JOHNSON ‘DEX", text)
        self.assertFalse(text.rstrip().endswith("FEMALE ELF"))  # the back's metatype line
        self.assertIn("Hum job", self.texts[("contacts", "bright-bob")])  # a stat line under the plot hooks

    def test_rules(self):
        self.assertEqual(list(entries(self.res, "rules")), ["ABOUT THIS DECK"])

    def test_text_bands(self):
        row, text = shapes.text_bands("x\n**DR I/ID AC CM**\n10 11/4 A1/I5 14/10\n**B A R**\n1 2\ny")
        self.assertEqual(row, {"DR": "10", "I/ID": "11/4", "AC": "A1/I5", "CM": "14/10"})
        self.assertEqual(text, "x\n**B A R**\n1 2\ny")  # values that don't line up stay text

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(jd.match({"sha256": jd.SHA256[0]}, ""), 1.0)
        self.assertEqual(jd.match({"sha256": "x", "title": "Shadowrun: Johnson ‘Dex"}, ""), 0.9)
        self.assertIs(identify({"sha256": jd.SHA256[0]}, BOOK_MD[:4000])[0], jd)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
