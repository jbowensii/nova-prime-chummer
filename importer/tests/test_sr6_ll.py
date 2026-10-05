"""SR6 Lofwyr's Legions recipe (importer/sr6/recipes/ll.py) on a made-up book.md in the converter's sr6 shape (the
book's: a running head on every page, an NPC a page under a heading with its `Professional rating` line, the drake
qualities and powers, a bold label hyphenated over two lines, a martial art's closing lines). Every name, number and
line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, ll

BOOK_MD = """<!-- page 1 -->
# made-up legions
<!-- page 2 -->
# Scales
A made-up story that isn't read.
<!-- page 5 -->
#### shadow stock
**PAGE**
LOFWYR'S 5
LEGIONS
# Those Who Serve The Dragon
### Glowing Fizzcorp Clerk
Metatype: Human
Professional rating 2
A made-up clerk who files glowing forms.
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 3 | 2 | 4 | 5(7) | 3 | 4 | 5.5 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 4 | 8/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Con 3, Influence 4
**Qualities:** Made Up
**Gear:** Fizz commlink
<!-- page 16 -->
#### shadow stock
**PAGE**
LOFWYR'S 16
LEGIONS
# Drakes
### Positive Qualities
#### Glow Drake
**Cost:** 40 Karma
**Game Effect:** You glow like a made-up drake.
### Basic Drake Powers
• **Zap Scales:** You zap in a made-up way.
• **Glow Sense (Far Vi-**
**sion):** Made-up far sight.
<!-- page 25 -->
# New Martial Art
### Fizzklaue
A made-up art of fizzing claws.
• **Categories:** Grappling, Striking
• **Signature Technique:** Fizz Rake. Your made-up rake fizzes harder.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, ll.ALIASES, name_headers=ll.NAME_HEADERS, end_page=ll.END_PAGE)
    return ll.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


class LlRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_npc(self):
        n = entries(self.res, "npcs")["Glowing Fizzcorp Clerk"]
        self.assertEqual((n.get("rating"), n.get("group"), n.get("log"), n.get("init")),
                         ("2", "Those Who Serve The Dragon", "5(7)", "8/1"))
        self.assertEqual(n.findtext("skills"), "Con 3, Influence 4")
        text = self.texts[("npcs", "glowing-fizzcorp-clerk")]
        self.assertIn("files glowing forms", text)
        self.assertNotIn("LEGIONS", text)  # the running head is out

    def test_qualities_powers_martial_art(self):
        q = entries(self.res, "qualities")["Glow Drake"]
        self.assertEqual((q.get("kind"), q.get("karma")), ("positive", "40"))
        self.assertEqual(list(entries(self.res, "critterpowers")), ["Zap Scales", "Glow Sense (Far Vision)"])
        m = entries(self.res, "martialarts")["Fizzklaue"]
        self.assertEqual((m.get("categories"), m.get("signature")), ("Grappling, Striking", "Fizz Rake"))

    def test_rules(self):
        r = entries(self.res, "rules")
        self.assertIn("Drakes", r)
        self.assertNotIn("Scales", r)  # the fiction

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(ll.match({"sha256": ll.SHA256[0]}, ""), 1.0)
        self.assertEqual(ll.match({"sha256": "x", "title": "Shadowrun: Lofwyr's Legions"}, ""), 0.9)
        self.assertIs(identify({"sha256": ll.SHA256[0]}, BOOK_MD[:4000])[0], ll)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
