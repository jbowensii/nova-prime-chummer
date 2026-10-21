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
## Life and Death
#### Made-Up Development Table
| METAVARIANT | AVERAGE HEIGHT (M) | CUSTOMIZATION KARMA | PRIORITY A | PRIORITY B | ADJUSTMENT POINTS PRIORITY C | PRIORITY D | PRIORITY E |
|---|---|---|---|---|---|---|---|
| Glimmerlings | 1.10 | 5 | 12 | 10 | 8 | 3 | N/A |
| Stonekin | 2.20 | 10 | N/A | 11 | 9 | 4 | 1 |
| Human | 1.70 | 0 | N/A | N/A | 9 | 4 | 1 |
| Shadowkin | 1.50 | 5 | 13 | 11 | 9 | 4 | 1 |
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
#### Made-Up Strains
##### Made-Up Optional Powers Table
| QUALITY | KARMA |
|---|---|
| Glow Burst | 7 |
| Thick Hide (per point) | 3 |
| Odd Gift | see text |
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
        self.assertEqual(
            m["Born This Way"].attrib, {"id": "born-this-way", "source": "SWC", "page": "9", "stage": "opening"}
        )
        g = m["Growing Up: Made-Up Years"].attrib
        self.assertEqual((g["stage"], g["skillPoints"], g["knowledgeSkills"]), ("opening", "6", "1"))
        c = m["Coming of Age: Made-Up Days"].attrib
        self.assertEqual((c["skillPoints"], c["nuyen"], c["contactPoints"]), ("3", "12000", "2"))

    def test_adult_module_grants_and_choices(self):
        p = entries(self.res, "lifemodules")["Gutter Poet"]
        self.assertEqual(
            {k: p.get(k) for k in ("stage", "nuyen", "contactPoints", "contactTypes", "knowledgeSkills")},
            {
                "stage": "adult",
                "nuyen": "7000",
                "contactPoints": "3",
                "contactTypes": "media street",
                "knowledgeSkills": "2",
            },
        )
        self.assertEqual(
            choices(p),
            [
                ("1", "agi bod rea"),
                ("2", "skill:crb.con skill:crb.exotic-weapons"),
                ("1", "edg nuyen:5000"),
                ("1", "skill:crb.stealth skill:crb.perception"),
                ("1", "skill:crb.stealth skill:crb.perception"),
            ],
        )
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
        self.assertEqual(
            ranges("Glimmerling"),
            {
                "bod": ("1", "5"),
                "agi": ("1", "7"),
                "rea": ("1", "6"),
                "str": ("1", "5"),
                "wil": ("1", "6"),
                "log": ("1", "6"),
                "int": ("1", "6"),
                "cha": ("1", "7"),
                "edg": ("1", "6"),
            },
        )
        self.assertEqual([t.text for t in mt["Glimmerling"].iter("trait")], ["Night Eyes", "Glow (2, very bright)"])
        self.assertEqual((ranges("Dimling")["int"], ranges("Dimling")["cha"]), (("1", "7"), ("1", "6")))
        self.assertEqual((ranges("Stonekin")["int"], ranges("Stonekin")["cha"]), (("1", "6"), ("1", "5")))
        self.assertEqual(mt["Stonekin"].get("page"), "19")
        self.assertEqual(self.rep("missing-value"), [])

    def test_metavariants_priority_points(self):
        """The development table: a metavariant's adjustment points at each priority it can be taken at; N/A: none."""
        mt = entries(self.res, "metatypes")
        pts = lambda n: {p.get("letter"): p.get("points") for p in mt[n].iter("priority")}
        self.assertEqual(
            pts("Glimmerling"), {"A": "12", "B": "10", "C": "8", "D": "3"}
        )  # `Glimmerlings`: the plural row
        self.assertEqual(pts("Stonekin"), {"B": "11", "C": "9", "D": "4", "E": "1"})
        self.assertEqual(pts("Dimling"), {})
        self.assertEqual([r["name"] for r in self.rep("unmatched") if r.get("file") == "metatypes.xml"], ["Shadowkin"])

    def test_qualities_and_sub_qualities(self):
        q = entries(self.res, "qualities")
        self.assertEqual(
            {n: (e.get("kind"), e.get("karma")) for n, e in q.items()},
            {
                "Lucky Charm": ("positive", "5"),
                "Spiky Hair": ("positive", "3"),
                "Long Nose": ("positive", "4"),
                "Clumsy Oaf": ("negative", "7"),
                "Glow Burst": ("positive", "7"),
                "Thick Hide (per point)": ("positive", "3"),
                "Odd Gift": ("positive", None),
            },
        )
        self.assertEqual((q["Long Nose"].get("perLevel"), q["Long Nose"].get("maxLevel")), ("true", "3"))
        # a sub-quality's description is its own lines, not its neighbours' (the block's)
        texts = {t.get("id"): t.text or "" for t in ET.fromstring(self.res.texts) if t.get("of") == "qualities"}
        spiky = next(v for k, v in texts.items() if k.endswith("spiky-hair"))
        self.assertIn("Hair that is made up.", spiky)
        self.assertNotIn("Long Nose", spiky)

    def test_a_priced_quality_table_lists_qualities(self):
        """A block that is only a `QUALITY | KARMA` table: each row a positive quality at its printed price, the name as
        printed (`(per point)`: per level), the table's title its category, its own id; a row printing no description reads
        the book's critter power of its name; a price that isn't a number is reported, never guessed."""
        q = entries(self.res, "qualities")
        g, h = q["Glow Burst"], q["Thick Hide (per point)"]
        self.assertEqual(
            (g.get("id"), g.get("category"), g.get("page"), g.get("perLevel")),
            ("made-up-optional-powers.glow-burst", "Made-Up Optional Powers", "39", None),
        )
        self.assertEqual(
            (h.get("perLevel"), h.get("maxLevel"), h.get("category")), ("true", None, "Made-Up Optional Powers")
        )
        texts = {t.get("id"): t.text or "" for t in ET.fromstring(self.res.texts) if t.get("of") == "qualities"}
        self.assertIn("made-up light", texts["made-up-optional-powers.glow-burst"])
        self.assertNotIn("made-up-optional-powers.thick-hide-per-point", texts)
        self.assertEqual(
            [(r["name"], r["value"]) for r in self.rep("book-value") if r["file"] == "qualities.xml"],
            [("Odd Gift", "see text")],
        )
        self.assertNotIn("Made-Up Optional Powers Table", entries(self.res, "rules"))

    def test_critter_power_contact_and_rules(self):
        cp = entries(self.res, "critterpowers")["Glow Burst"].attrib
        self.assertEqual((cp["type"], cp["action"], cp["range"], cp["duration"]), ("M", "Major", "LOS", "Instant"))
        c = entries(self.res, "contacts")["Dock Boss"].attrib
        self.assertEqual((c["archetype"], c["connection"]), ("Dock Boss", "3"))
        n = entries(self.res, "npcs")["Dock Boss"]
        self.assertEqual(
            (n.get("group"), n.get("bod"), n.get("log"), n.get("ess"), n.findtext("skills")),
            ("Contact", "3", "2", "6", "Con 3, Influence 2"),
        )
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


INFECTED_MD = """<!-- page 1 -->
<!-- page 70 -->
# DARKER ALTERATIONS
#### Made-Up Strain Rules
Made-up rules about made-up strains.
##### Made-Up Optional Powers Table
| QUALITY | KARMA |
|---|---|
| Glow Sense (Smell) | 4 |
| Glow Sense (Sight) | 5 |
| Hard Hide (per point) | 3 |
| Hush | 6 |
| Mendflesh | 9 |
##### made-up metatype attributes table
| TYPE | BASE | BOD | AGI | REA | STR | WIL | LOG | INT | CHA |
|---|---|---|---|---|---|---|---|---|---|
| Dusker | Human | 7 | 6 | 8 | 7 | 7 | 6 | 7 | 8 |
| Grubber | Dwarf | 9 | 5 | 6 | 9 | 8 | 4 | 6 | 3 |
| Grubber | Troll | 12 | 4 | 6 | 12 | 8 | 4 | 6 | 2 |
| Marrowkin | Ork | 9 | 6 | 7 | 10 | 7 | 5 | 7 | 4 |
| Gloamer | Elf | 6 | 8 | 7 | 6 | 6 | 6 | 7 | 9 |
| Murkling | Human | 7 | 6 | 7 | 7 | 6 | 6 | 6 | 5 |
<!-- box -->
##### NON-HUMAN GLOAMERS
Made-up gloamers of other kinds exist, but this sidebar prices nothing.
<!-- /box -->
<!-- box -->
##### NON-HUMAN DUSKERS
Made-up dusk folk of other kinds: apply these modifiers to maximums: +1 BOD, WILL, and +2 CHA. The made-up
template has a total cost of 30, as opposed to 25.
<!-- /box -->
<!-- page 71 -->
#### Made-Up Infected Qualities
##### Dusker
**Cost:** 25 Karma (–10 Karma if character is already
Awakened)
**Gained Powers:** Dual Natured, Movement (Self Only), +1 initiative die. Gain one of the
Glow Senses as a free Optional Power.
**Optional Powers:** Glow Senses (Smell, Sight), Hush (p. 12), Immunity (Age)
**Gained Weaknesses:** Allergy (Dawn, Mild)
**Notes:** All duskers Awaken as magicians if they were not already Awakened. Duskers carry HMHVV Strain Ia.
##### Grubber
**Cost:** 21 Karma
**Gained Powers:** Dual Natured, Sapience. Gain one Optional Powers (except Mendflesh) for free.
**Optional Powers:** Hard Hide +1, Mendflesh
**Gained Weaknesses:** Allergy (Dusk, Mild)
**Notes:** Grubbers carry HMHVV Strain III.
##### Marrowkin
**Cost:** 18 Karma
**Gained Powers:** Dual Natured
**Gained Weaknesses:** Allergy (Noon, Mild)
**Notes:** Marrowkin carry HMHVV Strain II.
##### Gloamer
**Cost:** 16 Karma
**Gained Powers:** Dual Natured. Gain either Hush or Ghost Step for free.
**Optional Powers:** Hush
**Notes:** Gloamers carry HMHVV Strain II.
##### Murkling
**Cost:** 15 Karma
**Gained Powers:** Dual Natured
**Notes:** Murklings carry a made-up strain.
<!-- page 80 -->
# EXPRESS YOURSELF
#### Mana Itch
**Bonus:** See text
Made-up itching mana around the made-up bearer.
For non-Awakened characters, this quality has a
bonus of 4 Karma. For Awakened individuals, this
quality has a bonus of 9 Karma.
"""


class InfectedTest(unittest.TestCase):
    """Infected qualities as data (owner decisions 2026-10-16) on a made-up book: every name and number invented."""

    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe(INFECTED_MD)
        cls.q = entries(cls.res, "qualities")

    def kids(self, name, tag):
        return [k.attrib for k in self.q[name] if k.tag == tag]

    def optional(self, name):
        return [(k["ref"].split(".")[-1], k.get("free")) for k in self.kids(name, "optionalpower")]

    def test_a_type_of_several_bases_is_a_quality_per_base(self):
        self.assertNotIn("Grubber", self.q)
        for base in ("Dwarf", "Troll"):
            g = self.q[f"Grubber ({base})"]
            self.assertEqual(
                (g.get("id"), g.get("karma"), g.get("kind")), (f"grubber-{base.lower()}", "21", "positive")
            )
            self.assertEqual(
                self.kids(f"Grubber ({base})", "infected"),
                [
                    {
                        "strain": "III",
                        "base": base,
                        "freePhysical": "2",
                        "freeMental": "2",
                        "essence": "5",
                        "magic": "1",
                        "magicLoss": "1",
                        "magicMax": "5+initiate-grade",
                    }
                ],
            )

    def test_strain_base_awakening_and_the_awakened_price(self):
        self.assertEqual(
            self.kids("Dusker", "infected"),
            [
                {
                    "strain": "I",
                    "printed": "Ia",
                    "base": "Human",
                    "awakens": "magician",
                    "freePhysical": "2",
                    "freeMental": "2",
                    "magicMax": "ess+initiate-grade",
                }
            ],
        )  # (Ia is Strain I; no starting Essence)
        self.assertEqual(self.q["Dusker"].get("karma"), "25")  # (the note wrapped onto the next line: still one price)
        self.assertEqual(
            self.kids("Dusker", "karmaif"),
            [{"flag": "awakened", "value": "15", "note": "less 10 if the character is already Awakened"}],
        )
        self.assertEqual(self.kids("Marrowkin", "infected")[0]["strain"], "II")
        self.assertEqual(self.kids("Marrowkin", "karmaif"), [])
        # (a `See text` price with a non-Awakened and an Awakened price: one item, its Awakened price a karmaif)
        m = self.q["Mana Itch"]
        self.assertEqual(
            (m.get("kind"), m.get("karma"), m.get("karmaMax"), m.get("karmaSteps")), ("negative", "4", None, None)
        )
        self.assertEqual(
            self.kids("Mana Itch", "karmaif"),
            [{"flag": "awakened", "value": "9", "note": "9 if the character is Awakened"}],
        )

    def test_optional_powers_and_the_free_pick(self):
        self.assertEqual(
            self.optional("Dusker"), [("glow-sense-smell", "true"), ("glow-sense-sight", "true"), ("hush", None)]
        )
        self.assertEqual(self.optional("Grubber (Troll)"), [("hard-hide-per-point", "true"), ("mendflesh", None)])
        self.assertEqual(self.optional("Marrowkin"), [])
        # (an item no row prices is reported, never guessed)
        self.assertEqual(
            [
                (r["name"], r["value"])
                for r in self.res.report
                if r["kind"] == "unmatched" and r.get("field") == "optional power"
            ],
            [("Dusker", "Immunity (Age)")],
        )

    def test_a_free_pick_naming_no_optional_power_and_a_type_naming_no_strain_are_reported(self):
        self.assertEqual(self.optional("Gloamer"), [("hush", "true")])
        self.assertEqual(
            [(r["name"], r["value"]) for r in self.res.report if r.get("field") == "free optional power"],
            [("Gloamer", "Ghost Step")],
        )
        self.assertEqual(
            [r["name"] for r in self.res.report if r["kind"] == "missing-value" and r.get("field") == "strain"],
            ["Murkling"],
        )
        self.assertEqual(self.kids("Murkling", "infected"), [])
        self.assertEqual(self.kids("Gloamer", "infectedalt"), [])  # (its sidebar gives no total cost: nothing)

    def test_gained_powers_and_weaknesses(self):
        self.assertEqual(
            self.kids("Dusker", "power"), [{"name": "Dual Natured"}, {"name": "Movement (Self Only)"}]
        )  # (no modifier, no free pick)
        self.assertEqual(self.kids("Dusker", "weakness"), [{"name": "Allergy (Dawn, Mild)"}])
        self.assertEqual(self.kids("Murkling", "power"), [])  # (no strain: no rules as data)
        tags = [k.tag for k in self.q["Dusker"]]
        self.assertLess(tags.index("optionalpower"), tags.index("power"))  # (the Quality schema's order)
        self.assertLess(tags.index("weakness"), tags.index("karmaif"))

    def test_gained_items_tolerate_the_book_s_typos(self):
        own = {"glowhide": "glowhide"}
        got = swc._gains(
            "Hard Hide 1, Glow Ward (2), Grip Tough 2, Glow Sense (Smell, Sight) Glowhides, Hush (self only, p. 12, Street Wyrd), "
            "Shell (6) (replaces Shell (4)), +1 initiative die. Gain one of the Glow Senses as a free Optional Power.",
            "power",
            own,
        )
        self.assertEqual(
            [a for _, a, _ in got],
            [
                {"name": "Hard Hide", "rating": "1"},
                {"name": "Glow Ward", "rating": "2"},
                {"name": "Grip Tough", "rating": "2"},
                {"name": "Glow Sense (Smell, Sight)"},
                {"ref": "glowhide", "name": "Glowhides"},  # (a comma left out; a plural is its power)
                {"name": "Hush (self only)"},
                {"name": "Shell (replaces Shell (4))", "rating": "6"},
            ],
        )
        # (an unclosed parenthesis runs to the end; a weakness has no ref, a modifier is no item)
        got = swc._gains(
            "Allergy (Dusk, Mild) –1 Logic, Glowhide, Dozing (Lack of Light, (Essence) Minutes, (p. 9, SR6)",
            "weakness",
            own,
        )
        self.assertEqual(
            [a for _, a, _ in got],
            [
                {"name": "Allergy (Dusk, Mild)"},
                {"name": "Glowhide"},
                {"name": "Dozing (Lack of Light, (Essence) Minutes)"},
            ],
        )
        self.assertEqual(swc._gains("", "power", own), [])

    def test_the_other_base_sidebar(self):
        self.assertEqual(
            self.kids("Dusker", "infectedalt"),
            [
                {
                    "base": "other",
                    "karma": "30",
                    "bod": "1",
                    "wil": "1",
                    "cha": "2",
                    "page": "69",
                    "note": "30 Karma for a non-human dusker",
                }
            ],
        )
        self.assertEqual(self.kids("Marrowkin", "infectedalt"), [])

    def test_files_validate(self):
        doc = etree.fromstring(self.res.files["qualities.xml"].encode("utf8"))
        schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, "qualities.xsd")))
        self.assertTrue(schema.validate(doc), schema.error_log.last_error)


class ModuleGrantsTest(unittest.TestCase):
    def test_choose_an_attribute_is_one_choice(self):
        from importer.sr6.lifemodules import _module_grants

        report = []
        text = (
            "• Choose an Attribute: +1 to Agility or Strength\n• Choose an Alignment: Zorp or Blip\n"
            "• Choose a Skill: +2 to Stealth or Con\n• +1 to Willpower or your other drain attribute\n"
        )
        attrs, kids = _module_grants("Made-Up Module", text, 5, report)
        self.assertEqual((attrs, report), ({}, []))
        self.assertEqual(
            [(k[1]["points"], k[1]["options"]) for k in kids],
            [(1, "agi str"), (2, "skill:crb.stealth skill:crb.con"), (1, "wil log int cha")],
        )


if __name__ == "__main__":
    unittest.main()
