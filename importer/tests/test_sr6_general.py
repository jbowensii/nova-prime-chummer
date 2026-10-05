"""SR6 general recipe (importer/sr6/recipes/general.py) on a made-up book.md in the converter's sr6 shape (a cast
chapter with stat blocks titled in body type, a contact with its band under its description, a priced box, a list of
places, a quality, life modules in body type). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, general, identify

BOOK = next(b for b in general.RECIPES if b.ID == "THN")

BOOK_MD = """<!-- page 1 -->
# CONTENTS & CREDITS
Made-up contents ........ 2
<!-- page 20 -->
# CAST OF FAKES
## Grunts
The fakes below are made up.
Fizz Trooper
(Professional Rating 3)
fizz trooper
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 4 | 3 | 2 | 2 | 3 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 7 | 7/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Firearms 4, Stealth 2
**Gear:** Made-up vest
#### Glow Hacker
##### (Professional Rating 4), Human
| B | A | R | S | W | L | I | C | EDG | R | ESS |
|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 3 | 2 | 4 | 5 | 4 | 3 | 2 | 6 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 4 | 7/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Tasking 5
## Contacts
#### Mira Madeup
Female elf, a made-up fixer.
**Connection Rating:** 3
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 3 | 2 | 4 | 4 | 4 | 6 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 3 | 7/1 | A1, I2 | 9 | 10/15/+1 |
**Skills:** Influence 6
## Beasts
#### Puff Hound
A made-up hound that puffs.
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 4 | 4 | 5 | 4 | 2 | 1 | 4 | 1 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 6 | 9/1 | A1, I2 | 10 | 15/25/+2 |
**Skills:** Athletics 4
**Powers:** Enhanced Senses (Smell)
<!-- page 40 -->
# MADE-UP GEAR
## Toys
### Zap Stick
A made-up stick that zaps.
#### Zap Stick
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Club | 3S(e) | 6/—/—/—/— | 3 | 400¥ |
### Hum Box
A made-up box that hums.
#### Hum Box
| AVAIL | COST |
|---|---|
| 2 | 1,200¥ |
### Where to Eat
| NAME | FOOD | COST |
|---|---|---|
| Fake Diner | Soup | ¥¥ |
### Lucky Charm
A made-up quality.
• **Cost:** 6 Karma
• **Game Effect:** Made-up luck.
##### Life Modules
Fake Courier
You ran made-up parcels across a made-up town for years.
• **Choose one:** +1 to Agility or Reaction
• **Contact Points:** 2
• **Contact Types:** Street
Event:
Lost Parcel
You lost a made-up parcel and made a made-up enemy.
• **Resources:** +5,000 nuyen
• **Contact Points:** 1
"""


def run_recipe(md=BOOK_MD, book=BOOK):
    regrouped, _ = regroup.regroup(book.prepare_md(md), book.ALIASES, name_headers=book.NAME_HEADERS)
    return book.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class GeneralRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()
        cls.texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(cls.res.texts)}

    def test_prepare_titles_a_stat_block_set_in_body_type(self):
        lines = BOOK.prepare_md(BOOK_MD).splitlines()
        i = lines.index("##### Fizz Trooper")
        self.assertEqual(lines[i + 1], "##### (Professional Rating 3)")
        self.assertNotIn("fizz trooper", lines)  # the box title in body type under the tag line
        self.assertIn("##### (Professional Rating 4, Human)", lines)

    def test_npcs(self):
        n = entries(self.res, "npcs")
        self.assertEqual((n["Fizz Trooper"]["rating"], n["Fizz Trooper"]["group"], n["Fizz Trooper"]["dr"]),
                         ("3", "Grunts", "7"))
        g = n["Glow Hacker"]  # a second R is Resonance
        self.assertEqual((g["rating"], g["rea"], g["res"]), ("4", "3", "6"))

    def test_contact_with_its_band_under_its_description(self):
        self.assertIn("Mira Madeup", entries(self.res, "contacts"))
        m = entries(self.res, "npcs")["Mira Madeup"]
        self.assertEqual((m["group"], m["cha"]), ("Contact", "6"))
        self.assertIn("made-up fixer", self.texts[("npcs", "mira-madeup")])

    def test_critter(self):
        c = entries(self.res, "critters")["Puff Hound"]
        self.assertEqual((c["category"], c["rea"]), ("critter", "5"))

    def test_gear_and_weapons(self):
        w = entries(self.res, "weapons")["Zap Stick"]
        self.assertEqual((w["dv"], w["cost"]), ("3S(e)", "400"))
        self.assertEqual(entries(self.res, "gear")["Hum Box"]["cost"], "1200")
        self.assertNotIn("Fake Diner", entries(self.res, "gear"))  # a list of places: `¥¥` is no price

    def test_quality_and_life_modules(self):
        q = entries(self.res, "qualities")["Lucky Charm"]
        self.assertEqual((q["kind"], q["karma"]), ("positive", "6"))
        m = entries(self.res, "lifemodules")
        self.assertEqual((m["Fake Courier"]["contactPoints"], m["Fake Courier"]["contactTypes"]), ("2", "street"))
        self.assertEqual(m["Event: Lost Parcel"]["nuyen"], "5000")

    def test_rules_and_no_headings(self):
        self.assertIn("Grunts", entries(self.res, "rules"))
        res = run_recipe("<!-- page 1 -->\n**GM Note:** A made-up scenario with no headings.\nMore made-up words.\n")
        self.assertEqual(list(entries(res, "rules")), ["30 Nights"])  # the whole text: one rule in the book's name

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_identify(self):
        meta = lambda title="": {"sha256": "x", "title": title}
        self.assertEqual(identify(meta("Shadowrun: 30 Nights (Campaign Book)"), "")[0].ID, "THN")
        self.assertEqual(identify(meta(), "# CONTENTS\nChaos Tacos ..... 6\nstate of the world ..... 10\n")[0].ID, "FPT")
        # the conversion guide names the core rulebook: its three phrases win over the core rulebook's loose match
        guide = "# SHADOWRUN, SIXTH WORLD\n## CHARACTER CONVERSION GUIDE\nMade-up core rulebook words.\n## Using this Guide\n"
        self.assertGreater(crb.match(meta(), guide), 0)
        self.assertEqual(identify(meta(), guide)[0].ID, "CCG")
        qsr = "Made-up note: for the Shadowrun Quick-Start Rules.\n**\"Help her.\"** Andrew sent it.\n"
        self.assertEqual(identify(meta(), qsr)[0].ID, "EOLSQ")
        self.assertEqual(identify(meta(), qsr.replace("Quick-Start Rules", "rules"))[0].ID, "EOLS")
        self.assertIsNone(identify(meta(), "# Something else entirely")[0])
        self.assertEqual({b.ID for b in general.RECIPES if not b.CANON}, {"EOLS", "EOLSQ"})

    def test_sources_list_every_book(self):
        path = os.path.join(os.path.dirname(sr6.SCHEMA_DIR), "sources.xml")
        ids = {s.get("id") for s in ET.parse(path).getroot()}
        self.assertLessEqual({b.ID for b in general.RECIPES}, ids)


if __name__ == "__main__":
    unittest.main()
