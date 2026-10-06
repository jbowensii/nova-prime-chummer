"""SR6 Street Wyrd recipe (importer/sr6/recipes/sw.py) on a made-up book.md in the converter's sr6 shape (the book's:
spells and spirit powers as in the core rulebook, a spirit's box titled with its name, a metamagic with its `Game
Information`, preparations' labelled lines, traditions under the faith and logic sections). Every name, number and line
is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, sw

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 25 -->
# THE TOME OF NOW
## Combat
#### Zap Bolt
##### (Direct Combat)
| RANGE | TYPE | DURATION | DV | DAMAGE |
|---|---|---|---|---|
| LOS | M | I | 3 | P |
A made-up bolt that zaps.
<!-- page 55 -->
# A CONGRESS OF SPIRITS
## Spirit Catalog
### Glow Spirits
Made-up spirits that glow.
##### glow spirits
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| F+1 | F | F+2 | F | F | F | F | F | F | F |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| F+2 | (Fx2)/2D6 | A1, I4 | 10 | 10/15/+1 |
**Skills:** Astral, Perception
**Powers:** Astral Form, Shine
## Spirit Powers
#### Shine Gate
##### (Free)
| TYPE | ACTION | RANGE | DURATION |
|---|---|---|---|
| M | Major | LOS | Sustained |
A made-up gate that shines.
#### Energy Sip
##### (Karma) (Free)
| TYPE | ACTION | RANGE | DURATION |
|---|---|---|---|
| M | Minor | Touch | Instant |
A made-up sip of energy.
<!-- page 73 -->
# FORCE AND GRACE
## New Adept Powers
### Glow Step
**Cost:** 0.5 PP per level
**Activation:** Passive
Step in a made-up glowing way.
## Adept Metamagics
### Glow Attunement
**Prerequisite:** Made-up focus
Attune in a made-up way.
<!-- page 87 -->
# IMBUING MAGIC
## New Preparations
#### Glow Vial
• **Formula:** Glow, Verbal
• **Drain Value:** 4
• **Cost:** 450¥/charge
A made-up vial that glows.
<!-- page 105 -->
# SEEING AND BELIEVING
## Believing: Traditions of Faith
### Made Pantheons
#### Glow Tradition
A made-up tradition of glowing gods.
### Traditions of Fizz
A made-up tradition that fizzes.
## New Qualities for Awakened Characters
### Positive Qualities
#### Glow Mage
**Cost:** 4 Karma
**Game Effect:** You glow in a made-up way.
<!-- page 116 -->
# RUNGS OF POWER
## The Importance of the Paradigm
### Practical Conjuration
#### Glow Summoning
Summon glowingly, in a made-up way.
##### Game Information
Roll made-up dice.
<!-- page 143 -->
# TOIL AND TROUBLE
## Game Information
### Blood Magic Spells
#### Clot Glow
##### (Health, Blood)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| T | P | P | 4 |
A made-up clot that glows.
<!-- page 169 -->
## Not Read
A made-up back cover.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, sw.ALIASES, name_headers=sw.NAME_HEADERS, end_page=169)
    return sw.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class SwRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_spells(self):
        s = entries(self.res, "spells")
        self.assertEqual((s["Zap Bolt"]["category"], s["Zap Bolt"]["damage"]), ("combat", "P"))
        self.assertEqual(s["Clot Glow"]["category"], "health")  # from its tags: its section names none

    def test_spirits_and_powers(self):
        g = entries(self.res, "spirits")["Glow Spirits"]
        self.assertEqual((g["category"], g["bod"], g["dr"]), ("spirit", "F+1", "F+2"))
        p = entries(self.res, "critterpowers")
        self.assertEqual(p["Shine Gate"]["action"], "Major")
        self.assertEqual(p["Energy Sip (Karma)"]["action"], "Minor")  # a heading's tags printed as a heading

    def test_adepts_metamagic_preparations(self):
        a = entries(self.res, "adeptpowers")["Glow Step"]
        self.assertEqual((a["cost"], a["perLevel"], a["activation"]), ("0.5", "true", "Passive"))
        self.assertEqual(set(entries(self.res, "metamagics")), {"Glow Attunement", "Glow Summoning"})
        self.assertIn("made-up dice", self.texts[("metamagics", "glow-summoning")])
        v = entries(self.res, "gear")["Glow Vial"]
        self.assertEqual((v["category"], v["cost"], v["per"]), ("Preparations", "450", "charge"))

    def test_traditions_and_qualities(self):
        self.assertEqual(set(entries(self.res, "traditions")), {"Glow Tradition", "Traditions of Fizz"})
        q = entries(self.res, "qualities")["Glow Mage"]
        self.assertEqual((q["kind"], q["karma"]), ("positive", "4"))
        r = entries(self.res, "rules")
        self.assertIn("Made Pantheons", r)
        self.assertNotIn("Not Read", r)

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(sw.match({"sha256": sw.SHA256[0]}, ""), 1.0)
        self.assertEqual(sw.match({"sha256": "x", "title": "Shadowrun: Street Wyrd"}, ""), 0.9)
        self.assertIs(identify({"sha256": sw.SHA256[0]}, BOOK_MD[:4000])[0], sw)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
