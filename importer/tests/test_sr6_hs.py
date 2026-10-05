"""SR6 Hack & Slash recipe (importer/sr6/recipes/hs.py) on a made-up book.md in the converter's sr6 shape (the book's:
gear tables under a lower-case title, a rating table, complex forms' `Fade Value Duration` line, echoes and programs
as labelled lines, a sprite's band in its section, an NPC's rating over its section). Every name, number and line is
invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, hs, identify

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 35 -->
# GADGETS & GIZMOS
## Zaphacks
A made-up homemade deck.
#### zaphacks
| RATING | DATA PROCESSING | FIREWALL | AVAIL | COST |
|---|---|---|---|---|
| 1 | 1 | 3 | 3(I) | 20,000¥ |
| 2 | 2 | 4 | 4(I) | 40,000¥ |
## Gizmos
### Data Taps
#### Glow Tap
A made-up tap that glows.
#### Fizz Tap
A made-up tap that fizzes.
#### gizmos
| DATA TAP | AVAIL | COST |
|---|---|---|
| Glow Tap | 4(I) | 2,000¥ |
| Fizz Tap | 2 | 500¥ |
| MATRIX RELAY | AVAIL | COST |
|---|---|---|
| Rating 1–3 | 2 | Rating x 1,000¥ |
<!-- page 57 -->
# DIGITAL TOOLBOX
## Commlink Apps
**Glow Buddy:** A made-up app that glows.
#### commlink apps
| APP | AVAIL | COST |
|---|---|---|
| Glow Buddy | 2 | 30¥ |
## New Cyberprograms
### Basic Cyberprograms
**Fizz Host:** A made-up program.
<!-- page 63 -->
# TECHNO TOOLS
## New Complex Forms
#### Glow Spike
**Fade Value Duration**
3 S
Spike in a made-up way.
### New Echoes
**Bright Link:** A made-up echo.
**Wide Hum:** Another made-up echo.
<!-- page 73 -->
# POINTS OF SPRITE
## New Sprite Types
### Glow Sprite
A made-up sprite that glows.
| A | S | D | F | INIT | RES |
|---|---|---|---|---|---|
| L | L + 1 | L + 2 | L | (L x 2) + 4D6 | L |
• **Skills:** Electronics, Cracking
• **Powers:** Shine
<!-- page 81 -->
# QUALITY HACKING
## Positive Qualities
### Made Hacker
**Cost:** 5 Karma
**Game Effect:** You hack in a made-up way.
<!-- page 161 -->
# KNOW YOUR enemy
## Game Information
### Matrix Security Operatives
##### Glow Spider (Professional Rating 3)
A made-up spider of the made-up Matrix.
##### glow spider
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 2 | 2 | 5 | 5 | 4 | 3 | 6 |
| DR | I/ID | AC | CM |
|---|---|---|---|
| 5 | 6/1 | A1,I2 | 11 |
**Skills:** Cracking 5, Electronics 5
<!-- page 184 -->
## Not Read
A made-up back cover.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, hs.ALIASES, name_headers=hs.NAME_HEADERS, end_page=184)
    return hs.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class HsRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_matrix_gear(self):
        e = entries(self.res, "electronics")["Zaphacks (Rating 2)"]
        self.assertEqual((e["category"], e["avail"], e["cost"]), ("zaphacks", "4(I)", "40000"))
        g = entries(self.res, "gear")
        self.assertEqual((g["Glow Tap"]["category"], g["Glow Tap"]["cost"]), ("data-tap", "2000"))
        self.assertIn("tap that glows", self.texts[("gear", "glow-tap")])
        self.assertEqual((g["Matrix Relay"]["rating"], g["Matrix Relay"]["cost"]), ("1–3", "Rating x 1000"))
        self.assertEqual(g["Glow Buddy"]["category"], "commlink-apps")
        self.assertIn("app that glows", self.texts[("gear", "glow-buddy")])  # its labelled line

    def test_forms_echoes_sprites(self):
        f = entries(self.res, "complexforms")["Glow Spike"]
        self.assertEqual((f["fade"], f["duration"]), ("3", "S"))
        self.assertEqual(set(entries(self.res, "echoes")), {"Bright Link", "Wide Hum"})
        s = entries(self.res, "sprites")["Glow Sprite"]
        self.assertEqual((s["sleaze"], s["init"]), ("L + 1", "(L x 2) + 4D6"))

    def test_qualities_npcs_rules(self):
        q = entries(self.res, "qualities")["Made Hacker"]
        self.assertEqual((q["kind"], q["karma"]), ("positive", "5"))
        n = entries(self.res, "npcs")["Glow Spider"]
        self.assertEqual((n["rating"], n["group"], n["log"], n["dr"]), ("3", "Matrix Security Operatives", "5", "5"))
        r = entries(self.res, "rules")
        self.assertIn("Basic Cyberprograms", r)  # programs: rule sections, as in the core rulebook
        self.assertNotIn("Not Read", r)

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(hs.match({"sha256": hs.SHA256[0]}, ""), 1.0)
        self.assertEqual(hs.match({"sha256": "x", "title": "Shadowrun: Hack & Slash"}, ""), 0.9)
        self.assertIs(identify({"sha256": hs.SHA256[0]}, BOOK_MD[:4000])[0], hs)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
