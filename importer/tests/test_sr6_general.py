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

# pylint: disable=protected-access  # tests reach into the module internals they cover

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
Fizz Guard
(Professional Rating 5)
fizz guard
Fizz Mage
(Professional Rating 6)
fizz mage
| B | A | R | S | W | L | I | C | ESS | B | A | R | S | W | L | I | C | ESS | M |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 3 | 4 | 3 | 4 | 2 | 4 | 3 | 5.5 | 3 | 3 | 3 | 2 | 5 | 4 | 4 | 4 | 6 | 5 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 9 | 8/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Firearms 5, Perception 3
**Gear:** Made-up armor
#### Glow Priest/priestess
##### (Professional Rating 6)
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 3 | 2 | 6 | 3 | 5 | 5 | 6 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 8/1 | A1, I2 | 9 | 10/15/+1 |
**Skills:** Sorcery 5
#### Grey Watcher/Seeker
##### (Professional Rating 3)
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 6/1 | A1, I2 | 10 | 10/15/+1 |
**Skills:** Perception 4
#### Grey Watcher/Decker
##### (Professional Rating 4)
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 3 | 2 | 4 | 6 | 4 | 5 | 5 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 4 | 8/1 | A1, I2 | 9 | 10/15/+1 |
**Skills:** Cracking 5
## Made-Up Chimeras
#### Fizz Chimera
A made-up chimera.
#### Puff Chimera
Another made-up chimera.
fizz chimera
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 5 | 4 | 5 | 5 | 3 | 2 | 4 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 7 | 9/2 | A1, I3 | 11 | 12/17/+3 |
**Skills:** Athletics 4
**Weapons:** As applicable
puff chimera
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 4 | 6 | 4 | 4 | 3 | 3 | 4 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 4 | 10/3 | A1, I4 | 10 | 8/13/+3 |
**Skills:** Close Combat 5
**Weapons:**
Claws [Blades, DV 3P, 8/—/—/—/—]
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
### Zorp Local
A made-up local quality.
**Cost:** 5 Points
**Game Effect:** Made-up local pride.
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
    """The reading of the made-up book `md`."""
    regrouped, _ = regroup.regroup(book.prepare_md(md), book.ALIASES, name_headers=book.NAME_HEADERS)
    return book.extract(regrouped)


def entries(res, kind):
    """{name: attributes} of the `kind` entries of a reading."""
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
        self.assertEqual(
            (n["Fizz Trooper"]["rating"], n["Fizz Trooper"]["group"], n["Fizz Trooper"]["dr"]), ("3", "Grunts", "7")
        )
        g = n["Glow Hacker"]  # a second R is Resonance
        self.assertEqual((g["rating"], g["rea"], g["res"]), ("4", "3", "6"))

    def test_two_beings_in_one_band(self):
        """Two names stacked over one band printing both beings: one NPC each, its own attributes (a column after the
        last group is the second's), the defense band and labels after it shared."""
        n = entries(self.res, "npcs")
        g, m = n["Fizz Guard"], n["Fizz Mage"]
        self.assertEqual((g["rating"], g["bod"], g["ess"], g.get("mag"), g["dr"]), ("5", "4", "5.5", None, "9"))
        self.assertEqual((m["rating"], m["bod"], m["ess"], m["mag"], m["dr"]), ("6", "3", "6", "5", "9"))
        lines = {
            e.findtext("name"): [p.text for p in e if p.tag == "skills"]
            for e in ET.fromstring(self.res.files["npcs.xml"])
        }
        self.assertEqual(lines["Fizz Guard"], lines["Fizz Mage"])

    def test_one_stat_block_for_several_names(self):
        n = entries(self.res, "npcs")
        p, q = n["Glow Priest"], n["Glow Priestess"]  # `Priest/priestess`: one NPC a name, the same stats
        self.assertEqual(
            {k: v for k, v in p.items() if k not in ("id",)}, {k: v for k, v in q.items() if k not in ("id",)}
        )
        # names one of them shares with another block's (`Grey Watcher`) aren't split
        self.assertLessEqual({"Grey Watcher/Seeker", "Grey Watcher/Decker"}, set(n))
        self.assertNotIn("Grey Watcher", n)

    def test_slash_names(self):
        self.assertEqual(
            [
                general._slash_names(n)
                for n in (
                    "Fake Ho uncho/Mamo",
                    "Glow Agent/Corp Fixer",
                    "UCAS/Fake Border",
                    "Fake Gun, marksman/sniper",
                    "Rating 1/2",
                )
            ],
            [
                ["Fake Ho uncho", "Fake Mamo"],
                ["Glow Agent", "Corp Fixer"],
                ["UCAS Border", "Fake Border"],
                ["Fake Gun, marksman", "Fake Gun, sniper"],
                ["Rating 1/2"],
            ],
        )

    def test_a_box_printing_several_beings(self):
        """A lower-case box title right over a band after a labelled line or a weapon's stats names the next being."""
        n = entries(self.res, "npcs")
        self.assertEqual(
            (n["Fizz Chimera"]["bod"], n["Puff Chimera"]["bod"], n["Puff Chimera"]["agi"]), ("5", "4", "6")
        )

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
        q = entries(self.res, "qualities")["Zorp Local"]  # `5 Points`: Karma points
        self.assertEqual((q["kind"], q["karma"]), ("positive", "5"))
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
        def meta(title=""):
            return {"sha256": "x", "title": title}

        self.assertEqual(identify(meta("Shadowrun: 30 Nights (Campaign Book)"), "")[0].ID, "THN")
        self.assertEqual(
            identify(meta(), "# CONTENTS\nChaos Tacos ..... 6\nstate of the world ..... 10\n")[0].ID, "FPT"
        )
        # the conversion guide names the core rulebook: its three phrases win over the core rulebook's loose match
        guide = "# SHADOWRUN, SIXTH WORLD\n## CHARACTER CONVERSION GUIDE\nMade-up core rulebook words.\n## Using this Guide\n"  # pylint: disable=line-too-long
        self.assertGreater(crb.match(meta(), guide), 0)
        self.assertEqual(identify(meta(), guide)[0].ID, "CCG")
        qsr = 'Made-up note: for the Shadowrun Quick-Start Rules.\n**"Help her."** Andrew sent it.\n'
        self.assertEqual(identify(meta(), qsr)[0].ID, "EOLSQ")
        self.assertEqual(identify(meta(), qsr.replace("Quick-Start Rules", "rules"))[0].ID, "EOLS")
        self.assertIsNone(identify(meta(), "# Something else entirely")[0])
        self.assertEqual({b.ID for b in general.RECIPES if not b.CANON}, {"EOLS", "EOLSQ"})

    def test_sources_list_every_book(self):
        path = os.path.join(os.path.dirname(sr6.SCHEMA_DIR), "sources.xml")
        ids = {s.get("id") for s in ET.parse(path).getroot()}
        self.assertLessEqual({b.ID for b in general.RECIPES}, ids)


RULES_MD = """<!-- page 1 -->
# CONTENTS
Made-up contents ........ 2
<!-- page 10 -->
# Game Rules
## New Toys
### Zip Pouch
A made-up armor modification that hides made-up things.
[Capacity 1, Availability 2, Cost: 150¥]
### Zap Popper “Ghost”
(Hold-Out Pistol)
A made-up hold-out pistol, printed in made-up plastic.
##### zap popper
[Hold-Out, DV 1P, SS, AR 10/5/—/—/—, 4(b), Avail:
3, Cost: 200¥]
### Paper Ward (Magical Gear)
**Cost:** 300 x Rating, Availability 4, Rating 1-4 **Paper Wards** are made-up charms.
More made-up words about the wards.
### Bleep Pup
##### bleep pup
| HAND | ACC | BOD | ARM | PIL | SEN | SEATAVAIL | COST |
|---|---|---|---|---|---|---|---|
| 2/2 | 4 | 2 | 0 | 1 | 2 — | 3 | 1,000¥ |
### Which charm works on a made-up spirit?
Any of them, and because they have no price:
Charm Availability Cost
Charm of tin 3 100 ¥
Charm of lead 4 150 ¥
<!-- page 12 -->
## Made-up Folk: Zorgs
### Zorgs as Player Characters
Made-up words about zorgs.
##### Hide (Self):
**Requirement:** Small Zorg **Major Action, Sustained.**
A made-up power: the zorg hides.
#### Zorg Character Development Table
**Customization Karma Cost:** 10
**Variant Bod Agi Rea Str**
Small Zorg 1–5 1–7 1–5 1–4
**Wil Log Int Cha Edg M**
1–6 1–6 1–6 1–7 1–6 1–6
**Racial Qualities:** Hide (Self), Low-Light Vision
**Average Height:** 1 M
<!-- page 14 -->
# Grumble
Grumble is a made-up mentor spirit who grumbles.
### Advantages
**All:** Gain a point of Edge when made-up things happen.
**Magician:** Made-up spells cost less.
**Adept:** Gain a made-up power.
### Disadvantages
Grumble followers grumble at made-up orders.
"""


class GeneralShapesTest(unittest.TestCase):
    """The item shapes the four books registered in 0.18.0 print (Seoul Survivor, the Missions Guide, Adversary)."""

    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe(RULES_MD)

    def test_bracketed_stat_lines(self):
        g = entries(self.res, "gear")["Zip Pouch"]
        self.assertEqual((g["capacity"], g["avail"], g["cost"]), ("1", "2", "150"))
        w = entries(self.res, "weapons")["Zap Popper “Ghost”"]  # the box title starts its heading's name
        self.assertEqual(
            (w["type"], w["dv"], w["ar"], w["ammo"], w["avail"], w["cost"]),
            ("Hold-Out", "1P", "10/5/—/—/—", "4(b)", "3", "200"),
        )

    def test_cost_first_price_line(self):
        g = entries(self.res, "gear")["Paper Ward"]
        self.assertEqual(
            (g["category"], g["avail"], g["cost"], g["rating"]), ("Magical Gear", "4", "300 x Rating", "1–4")
        )

    def test_glued_columns(self):
        v = entries(self.res, "vehicles")["Bleep Pup"]
        self.assertEqual((v["sensor"], v["seats"], v["avail"], v["cost"]), ("2", "—", "3", "1000"))

    def test_text_price_list(self):
        g = entries(self.res, "gear")
        self.assertEqual(
            (g["Charm of tin"]["category"], g["Charm of lead"]["avail"], g["Charm of lead"]["cost"]),
            ("Charm", "4", "150"),
        )

    def test_development_table_and_racial_power(self):
        m = ET.fromstring(self.res.files["metatypes.xml"])[0]
        self.assertEqual(m.findtext("name"), "Small Zorg")
        self.assertEqual({r.get("attr"): r.get("max") for r in m.iter("range")}["agi"], "7")
        self.assertEqual(len(list(m.iter("range"))), 9)
        self.assertEqual([t.text for t in m.iter("trait")], ["Hide (Self)", "Low-Light Vision"])
        p = entries(self.res, "critterpowers")["Hide (Self)"]
        self.assertEqual((p["action"], p["duration"]), ("Major", "Sustained"))

    def test_mentor_spirit_on_its_own(self):
        self.assertIn("Grumble", entries(self.res, "mentorspirits"))

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()):
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")


if __name__ == "__main__":
    unittest.main()
