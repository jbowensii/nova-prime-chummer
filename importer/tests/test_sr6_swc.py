"""SR6 Sixth World Companion recipe (importer/sr6/recipes/swc.py) on a made-up book.md in the converter's sr6 shape (the
Companion's: labels unbolded, tables as text). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, swc

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents: Sum-to-Ten ........ 9, Event Life Modules ........ 12
<!-- page 10 -->
# BUILDING A SHADOW
## Life Path
Made-up lifepath rules.
#### Starting down the life path
Every made-up runner starts here.
##### Born This Way
You are born, in a made-up way. Choose your metatype.
##### Growing Up: Made-Up Years
Choose three of the following skills: Athletics, Con, Stealth. You gain each of the chosen skills at rank 2.
Gain the [Area] Knowledge skill about the place you grew up.
##### Coming of Age: Made-Up Days
Choose any one skill. Gain that skill at rank 3.
Gain 12,000 nuyen in resources.
Gain one contact of any type. Assign two total points among their ratings.
#### Choices Life Modules
##### Gutter Poet
You wrote made-up poems in a gutter.
• Choose one: +1 to Agility, Body, or
Reaction
Choose one: +2 to Con or Exotic Weapon
•
• Choose one: +1 to Edge, or +5,000
nuyen
• Choose two: +1 to Juggling, Stealth, or Perception
• Resources: +7,000 nuyen
• Contact Points: 3
• Contact Types: Media, Street
• Knowledge skill (choose two): Made-Up Verse, Gutters
Glow Reader [ Awakened only ]
You read made-up glows.
• Choose one: +1 to any mental attribute
• Contact Points: 2
• Contact Types: Any
##### Static Sweeper (Emerged only)
You swept made-up static.
• Choose one: + 1 to Electronics, Cracking, or
Tasking (Emerged only)
• +1 to any skill
#### Event Life Modules
**Event:** You found a made-up thing
Something made up happened.
• +1 to an attribute or special attribute
• Resources: +9,000 nuyen
• Contact Points: 4
##### Event: You lost a made-up bet
• +1 to three different skills
• Knowledge skills: choose up to two
<!-- page 20 -->
# TYPES AND SHADOWS
## Creating a Metavariant or Metasapient Player Character
#### Made-Up Modifications
Made-up notes.
##### Plainfolk Variant Attribute Ranges
**BOD AGI REA STR WIL LOG INT**
**Glimmerling 1–5 1–7 1–6 1–5 1–6 1–6 1–6**
**Racial Traits:Night Eyes, Glow (2, very**
**bright)**
**Dimling 1–6 1–6 1–6 1–6 1–6 1–6 1–7**
**Racial Traits:Dim Skin**
**BOD AGI REA STR WIL LOG**
**Stonekin 1–9 1–5 1–6 1–9 1–6 1–6**
**Racial Traits:Hard Hide**
**CHA EDG**
**1–7 1–6**
**1–6 1–6**
**INT CHA EDG**
**1–6 1–5 1–6**
<!-- page 30 -->
# PEOPLE OF EXCEPTIONAL QUALITY
#### Lucky Charm
You carry a made-up charm.
Cost: 5 Karma
#### Odd Bits
A made-up group of oddities.
Spiky Hair
Cost: 3 Karma
Hair that is made up.
Long Nose
• Cost: 4 Karma per level (max 3 levels)
## Negative Qualities
#### Clumsy Oaf
• Bonus: 7 Karma
• Game Effect: You drop made-up things.
<!-- page 40 -->
# DARKER ALTERATIONS
#### New Critter Powers
##### Glow Burst
• Type: M
• Action: Major
Range: LOS
•
Duration: Instant
The critter bursts with made-up light.
<!-- page 50 -->
# (META)HUMAN RESOURCES
## New Contacts
#### Dock Boss
• Typical Connection Rating: 3
Type: Street
A made-up boss of made-up docks.
Dock Boss
**B A R S W L I C ESS**
**3 3 3 3 3 2 2 2 6**
**Active Skills: Con 3, Influence 2**
<!-- page 60 -->
# WAYS TO PLAY
## Made-Up Rule
Roll made-up dice.
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, swc.ALIASES, name_headers=swc.NAME_HEADERS, end_page=swc.END_PAGE)
    return swc.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


def choices(e):
    return [(c.get("points"), c.get("options")) for c in e.iter("choice")]


class SwcRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def rep(self, kind):
        return [r for r in self.res.report if r["kind"] == kind]

    def test_opening_modules_from_their_sentences(self):
        m = entries(self.res, "lifemodules")
        self.assertEqual(m["Born This Way"].attrib, {"id": "born-this-way", "source": "SWC", "page": "9", "stage": "opening"})
        g = m["Growing Up: Made-Up Years"].attrib
        self.assertEqual((g["stage"], g["skillPoints"], g["knowledgeSkills"]), ("opening", "6", "1"))
        c = m["Coming of Age: Made-Up Days"].attrib
        self.assertEqual((c["skillPoints"], c["nuyen"], c["contactPoints"]), ("3", "12000", "2"))

    def test_adult_module_grants_and_choices(self):
        p = entries(self.res, "lifemodules")["Gutter Poet"]
        self.assertEqual({k: p.get(k) for k in ("stage", "nuyen", "contactPoints", "contactTypes", "knowledgeSkills")},
                         {"stage": "adult", "nuyen": "7000", "contactPoints": "3", "contactTypes": "media street",
                          "knowledgeSkills": "2"})
        self.assertEqual(choices(p), [("1", "agi bod rea"), ("2", "skill:crb.con skill:crb.exotic-weapons"),
                                      ("1", "edg nuyen:5000"), ("1", "skill:crb.stealth skill:crb.perception"),
                                      ("1", "skill:crb.stealth skill:crb.perception")])
        self.assertEqual([(r["name"], r["value"]) for r in self.rep("unread-option")], [("Gutter Poet", "Juggling")])

    def test_hidden_heading_requires_and_events(self):
        m = entries(self.res, "lifemodules")
        g = m["Glow Reader"]
        self.assertEqual((g.get("requires"), g.get("contactPoints"), g.get("contactTypes")), ("awakened", "2", None))
        self.assertEqual(choices(g), [("1", "wil log int cha")])
        s = m["Static Sweeper"]
        self.assertEqual((s.get("requires"), s.get("skillPoints")), ("emerged", "1"))
        self.assertEqual(choices(s), [("1", "skill:crb.electronics skill:crb.cracking skill:crb.tasking")])
        self.assertNotIn("Tasking", m)  # an option line `Tasking (Emerged only)` is no hidden heading
        f = m["Event: You found a made-up thing"]
        self.assertEqual((f.get("attributePoints"), f.get("nuyen"), f.get("contactPoints")), ("1", "9000", "4"))
        b = m["Event: You lost a made-up bet"]
        self.assertEqual((b.get("skillPoints"), b.get("knowledgeSkills")), ("3", "2"))
        self.assertEqual(len(m), 8)

    def test_metavariants_from_the_text_tables(self):
        mt = entries(self.res, "metatypes")
        ranges = lambda n: {r.get("attr"): (r.get("min"), r.get("max")) for r in mt[n].iter("range")}
        self.assertEqual(ranges("Glimmerling"), {"bod": ("1", "5"), "agi": ("1", "7"), "rea": ("1", "6"), "str": ("1", "5"),
                                                 "wil": ("1", "6"), "log": ("1", "6"), "int": ("1", "6"), "cha": ("1", "7"),
                                                 "edg": ("1", "6")})
        self.assertEqual([t.text for t in mt["Glimmerling"].iter("trait")], ["Night Eyes", "Glow (2, very bright)"])
        self.assertEqual((ranges("Dimling")["int"], ranges("Dimling")["cha"]), (("1", "7"), ("1", "6")))
        self.assertEqual((ranges("Stonekin")["int"], ranges("Stonekin")["cha"]), (("1", "6"), ("1", "5")))
        self.assertEqual(mt["Stonekin"].get("page"), "19")
        self.assertEqual(self.rep("missing-value"), [])

    def test_qualities_and_sub_qualities(self):
        q = entries(self.res, "qualities")
        self.assertEqual({n: (e.get("kind"), e.get("karma")) for n, e in q.items()},
                         {"Lucky Charm": ("positive", "5"), "Spiky Hair": ("positive", "3"), "Long Nose": ("positive", "4"),
                          "Clumsy Oaf": ("negative", "7")})
        self.assertEqual((q["Long Nose"].get("perLevel"), q["Long Nose"].get("maxLevel")), ("true", "3"))

    def test_critter_power_contact_and_rules(self):
        cp = entries(self.res, "critterpowers")["Glow Burst"].attrib
        self.assertEqual((cp["type"], cp["action"], cp["range"], cp["duration"]), ("M", "Major", "LOS", "Instant"))
        c = entries(self.res, "contacts")["Dock Boss"].attrib
        self.assertEqual((c["archetype"], c["connection"]), ("Dock Boss", "3"))
        n = entries(self.res, "npcs")["Dock Boss"]
        self.assertEqual((n.get("group"), n.get("bod"), n.get("log"), n.get("ess"), n.findtext("skills")),
                         ("Contact", "3", "2", "6", "Con 3, Influence 2"))
        r = entries(self.res, "rules")
        self.assertIn("Made-Up Rule", r)
        self.assertIn("Starting down the life path", r)
        self.assertNotIn("Gutter Poet", r)

    def test_files_validate_and_hold_no_prose(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")
            if name != "texts":
                self.assertNotIn("<text", xml)
                for prose in ("poems", "carry", "light", "docks", "dice"):
                    self.assertNotIn(prose, xml)
        texts = {(t.get("of"), t.get("id")) for t in ET.fromstring(self.res.texts)}
        self.assertIn(("qualities", "lucky-charm"), texts)
        self.assertFalse(any(of == "lifemodules" for of, _ in texts))  # life modules are grants, no prose

    def test_match(self):
        self.assertEqual(swc.match({"sha256": swc.SHA256[0]}, ""), 1.0)
        self.assertEqual(swc.match({"sha256": "x", "title": "Shadowrun: Sixth World Companion"}, ""), 0.9)
        self.assertEqual(swc.match({"sha256": "x"}, BOOK_MD[:4000]), 0.75)
        self.assertIs(identify({"sha256": "x"}, BOOK_MD[:4000])[0], swc)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
