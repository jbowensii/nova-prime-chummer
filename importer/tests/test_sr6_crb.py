"""SR6 core rulebook recipe (importer/sr6/recipes/crb.py) on a made-up book.md in the converter's sr6 shape, regrouped
with the recipe's aliases and name headers. Every name, number and line is invented."""

import os
import re
import unittest
from unittest import mock
import xml.etree.ElementTree as ET
from pathlib import Path

from lxml import etree

from importer import sr6
from importer.sr6 import archetypes, catalog, regroup
from importer.sr6.recipes import crb, identify

BOOK_MD = """<!-- page 1 -->
Made-up cover. Shadowrun, Sixth World Core Rulebook (invented test book)
<!-- page 3 -->
# GAME CONCEPTS
Intro text about made-up concepts.
## Making Trouble
Trouble rules text.
| ROLL | RESULT |
|---|---|
| 1 | Nothing |
| 2 | Sparks |
### Trouble Dice
Dice text.
#### Rolling Over
Rolling text.
#### Body
Body is a made-up measure of toughness.
## Lifestyles
Lifestyles are made up.
### Gutter
##### Cost: Free
You sleep in a made-up gutter.
### Shoebox
##### Cost: 200 nuyen a month
Tiny made-up rooms.
<!-- page 41 -->
# CHARACTER CREATION
Creation intro.
## Picking Priorities
Pick made-up priorities.
| PRIORITY | METATYPE | ATTRIBUTES | SKILLS | MAGIC OR RESONANCE | RESOURCES |
|---|---|---|---|---|---|
| A | Glimmerkin (13), Stonefolk (11) | 22 | 30 | Full: 3 Magic, Mystic Adept: 3 Magic, Adept: 5 Magic, Technomancer: 3 Resonance | 420,000¥ |
| E | Glimmerkin (1) | 3 | 2 | — | 8,200¥ |
## Metatypes
| METATYPE | BOD | AGI | REA | STR | WIL | LOG | INT | CHA | EDG |
|---|---|---|---|---|---|---|---|---|---|
| Plainfolk | 1–6 | 1–6 | 1–6 | 1–6 | 1–6 | 1–6 | 1–6 | 1–6 | 1–8 |
| Racial Qualities: None | | | | | | | | | |
| Glimmerkin | 1–6 | 1–7 | 1–6 | 1–5 | 1–6 | 1–6 | 1–6 | 1–7 | 1–7 |
| Racial Qualities: Glowing Skin, Night Eyes | | | | | | | | | |
| Stonefolk | 1–9 | 1–5 | 1–6 | 1–9 | 1–6 | 1–6 | 1–6 | 1–5 | 1–6 |
**Racial Qualities:** Hard Hide, Built Big 2
## Qualities
### Positive Qualities
#### Lucky Streak (1 to 3)
• **Cost:** 4 Karma per level
Invented luck, a little at a time.
#### Steady Hands
Hands that never shake. Cost: 5 Karma
• **Game Effect:** Made-up steadiness.
### Negative Qualities
#### Butterfingers
**Bonus:** 6 Karma
Drops made-up things.
#### Spark/Fizz Bane
**Bonus:** 5 Karma
An invented bane.
#### Odd Habit (Vice, 1 to 4)
**Bonus:** 3 Karma per level
An invented habit.
<!-- page 81 -->
# Archetypes
<!-- page 82 -->
## Glow Runner
A made-up runner who glows.
##### metatype: glimmerkin
| B | A | R | S | W | L | I | C | EDG | M | ESS |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 5(6) | 4 | 2 | 3 | 2 | 4 | 3 | 4 | 5 | 6 |
**Initiative/Actions:** 8 + 2D6/1 Major, 3 Minor
**Defense Rating:** 5
**Active Skills:** Tinkering 3 (Gizmos +2), Basket Weaving 2
**Knowledge Skills:** Glow Lore, Puddle Streets
**Languages:** Plainspeak (Native), Glimmertongue
**Qualities:** Lucky Streak 2, Butterfingers, Steady Hands (glimmerkin trait), Night Eyes (glimmerkin trait), Odd Quirk, Fizz Bane (Water)
**Adept Powers:** Quick Feet 2, Glow Sense
**Contacts:** Fixer Fred (C3/L2), Glow Dealer C1/L4)
**Lifestyle:** Shoebox (2 months prepaid)
**Augmentations:** Glow Gland 2 (alpha), cybertail (obvious, w/ glow tip)
**Gear:** Padded Vest, 2 x fake SIN (rating 3; w/ zap license), Gizmo Kit (rating 4), Mystery Box, Glue gun
**Vehicles:** Zoom Bike
**Starting Nuyen:** 1,234¥
**Weapons:** Zap Gun [Pistol, DV 3P, SA, 8/10/—/—, 10(c), w/ 50 rounds] Odd Sword [Blade, DV 3P, 9/—/—/—/—]
<!-- page 83 -->
## Bit Whisperer
A made-up technomancer.
##### metatype: plainfolk
| B | A | R | S | W | L | I | C | EDG | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 3 | 2 | 5 | 5 | 4 | 3 | 3 | 6 |
**Active Skills:** Tinkering 4 (Clockwork +3)
**Augmentations:** Tail (obvious)
**Vehicles:** Zoombike
**Complex Forms:** Static Fizz
**Lifestyle:** Gutter
<!-- page 91 -->
# SKILLS
Skill intro.
## Skill List
### Tinkering
##### Untrained: Yes
##### Linked Attribute: Logic
Tinkering is made up.
**Specializations:** Gizmos, Clockwork (Wind-up, Spring)
<!-- page 131 -->
# MAGIC
Magic intro.
## Spells
### Spell Descriptions
How made-up spells read.
##### Zappy Combat Spells
#### Zap Bolt
##### (Direct, Area)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | P | I | 3 |
Zap bolt text.
### Detection Spells
#### Glow Sense
##### (Passive, Area)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| T | M | S | 2 |
The spell senses glow.
## Rituals
### Glow Circle
##### Keywords: Anchored, Spell
##### Threshold: 4
Glow circle text.
## Conjuring
### Types of Spirits
#### Spirits of Fizz
##### SPIRITS OF FIZZ
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| F | F+1 | F | F–1 | F | F | F | F | F | F |
| AC | CM | MOVE |
|---|---|---|
| A1, I2 | (F/2)+7 | 5/10/+2 |
**Initiative:** [(F x 2) + 1] + 2D6
**Defense Rating:** F – 1
**Powers:** Fizzing.
## Adept Powers
#### Quick Feet
**Cost:** 0.5 PP per level
**Activation:** Minor Action
Fast feet text.
#### Glow Sense
**Cost:** 0.25 PP
**Activation:** Passive
The adept senses glow.
## Metamagics
#### Bright Aura
Aura text.
<!-- page 171 -->
# MATRIX
Matrix intro.
## Gear Reprinted
#### commlinks
| ITEM | DEVICE RATING | AVAIL | COST |
|---|---|---|---|
| Clunker Deck | 1 | 2 | 49,500¥ |
| Brick Phone | 1 | 1 | 50¥ |
## Complex Forms
#### Static Fizz
**Duration:** Sustained
**Fade:** 3
Static text.
## Technomancers
### Types of Sprites
#### Gadget Sprite
Gadget sprites fix gadgets.
| ATTACK | SLEAZE | DATA PROC | FIREWALL | INIT | RES |
|---|---|---|---|---|---|
| L | L+1 | L+2 | L | (L x 2) +1 + 4D6 | L |
**Skills:** Hacking, Electronics; **Powers:** Zap,
Fizz
### Echoes
Echoes are made up.
• **Quick Think:** You think made-up thoughts faster.
• **Wide Net:** Your made-up net is wider.
## Programs
#### Basic
• **Glow Scan:** Scan in a
Glowing made-up way.
• **Fizz Wall:** Wall of made-up fiz-
zing code.
## Matrix Actions
### Poke Host
##### Major Action
Poking text.
# RIGGING
## Drone Rigging
### Autosofts
**Glide:** This acts as a made-up gliding skill. Attribute: Pilot
**[Weapon] Aiming:** This aims a made-up weapon. Attribute: Sensor

Autosofts are made up.
**Glide:** This acts as a made-up gliding
skill. Attribute: Pilot
**[Weapon] Aiming:** This aims a made-up
weapon. Attribute: Sensor
<!-- page 201 -->
# WILD LIFE
Wild intro.
## Non-Player Characters
### Professional Rating 2: Street Crew
Street crew text.
##### Corner Goon
| B | A | R | S | W | L | I | C | ESS | EDG |
|---|---|---|---|---|---|---|---|---|---|
| 3 | 3 | 3 | 3 | 2 | 2 | 3 | 2 | 6 | 1 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 6 + 1D6 | 1/2 | 10 | 10/15/+1 |
**Skills:** Close Combat 4, Firearms 3
**Gear:** Padded Vest
**Weapons:** Zap Gun
## Sample Contacts
Contacts are made up.
#### metahuman adjustment chart
| METATYPE | ATTRIBUTE CHANGES |
|---|---|
| Glimmerkin | +1 Charisma |
| Stonefolk | +2 Body |
#### Fixer Fred
**Uses:** Made-up deals
A made-up fixer.
##### fixer fred
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 3 | 2 | 3 | 4 | 4 | 5 | 6 |
**Skills:** Haggling 5
## Critters
#### Fuzzbeast
A made-up beast, mostly fuzz.
##### fuzzbeast
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 4 | 3 | 4 | 5 | 2 | 1 | 3 | 1 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 6 | 7 + 1D6 | 1/1 | 10 | 10/15/+1 |
**Skills:** Sneaking 3, Running 2
**Powers:** Glimmer, Thick Fur
**Attacks:** Bite 4P
##### ice wyrm fire wyrm
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 12 | 5 | 6 | 20 | 6 | 6 | 6 | 6 | 8 | 8 |
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 11 | 6 | 5 | 19 | 7 | 7 | 6 | 7 | 8 | 8 |
**Attack:** Bite: DV 9P **Attack:** Bite: DV 10P
## Powers
Each power lists made-up columns.
### Glimmer
| TYPE | ACTION | RANGE | DURATION |
|---|---|---|---|
| P | Minor | Self | Always |
Glimmer text.
<!-- page 221 -->
# RUNNING THE GAME
GM intro.
## Grunt Rules
Made-up grunt rules.
<!-- page 251 -->
# GEAR
Gear intro.
## Firearms
#### zappers
| WEAPON | DV | MODES | ATTACK RATINGS | AMMO | HEFT | AVAIL | COST |
|---|---|---|---|---|---|---|---|
| Zap Gun | 3P | SA | 8/10/—/— | 10(c) | 2 | 2 | 1,250¥ |
| Zapp Rifle | 4P | SA/BF | 3/9/7/— | 12(c) | 4 | 3 | 12x |
| Lost Blaster | 5P | SS | 9/—/—/— | 5(m) | 1 | - | 900¥ |
| Zip Pistol I/II | 2P | SA | 7/6/—/— | 8(c) | 1 | 2 | 300¥/350¥ |
#### Zap Gun
A made-up gun that zaps.
#### Zap Rifle
A rifle that zaps further.
## Armor
#### vests
| ARMOR | DEFENSE RATING | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Padded Vest | +2 | 6 | 2 | 500¥ |
#### Padded Vest
A soft made-up vest.
## Electronics
#### decks
| DEVICE | DEVICE RATING | ATTRIBUTE ARRAY | PROGRAMS | AVAIL | COST |
|---|---|---|---|---|---|
| Clunker Deck | 1 | 4 3 2 1 | 2 | 2 | 49,500¥ |
#### Clunker Deck
A slow made-up deck.
#### lenses
| DEVICE | CAPACITY | AVAIL | COST |
|---|---|---|---|
| Spy Lens | 1–4 | 1 | Capacity x 70¥ |
## Software
#### software
| SOFTWARE | AVAIL | COST |
|---|---|---|
| Cyberprogram, basic | 3 | 77¥ |
| Autosoft (Rating 1–6) | Rating (1–6) | Rating x 50¥ |
#### Cyberprogram, basic
Made-up programs.
## Tools
#### kits
| ITEM | RATING | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Gizmo Kit | 1–6 | — | 2 | Rating x 100 |
| Fizz rope | — | — | 2 | 40¥ per 100m |
| Patches | | | | |
| Glue patch | — | — | 1 | 30¥ |
| Bronze plan | — | — | 1 | 100¥/month or 1,000¥/year |
#### Gizmo Kit
A kit of made-up gizmos.
## Biotech
#### bioware
| BODYWARE | RATING | ESSENCE | AVAILABILITY | COST |
|---|---|---|---|---|
| Glow Gland | 1–3 | 0.2 | 4 | 2,000¥ |
#### Glow Gland
A made-up gland.
#### Grades
Made-up grades.
| GRADE | ESS COST | COST | AVAIL |
|---|---|---|---|
| Shinyware | x0.9 | x1.3 | +2 |
| Rustyware | x1.2 | x0.4 | –1 |
| Oddware | x0.7 | lots | +1 |
#### headware
| HEADWARE | ESSENCE | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Brain Fizzer (rating 1–4) | Rating x 0.1 | — | 4(L) | Rating^2 x 100¥ |
#### cyberlimb cost and capacity
| LIMB | ESSENCE | AVAIL | SYNTHETIC COST (CAPACITY) | OBVIOUS COST (CAPACITY) |
|---|---|---|---|---|
| Tail | 0.5 | 3 | 9,000¥(3) | 7,000¥(6) |
## Vehicles
#### vehicles
| CARS | HAND (ON/OFF ROAD) | ACCEL | SPEED INTERVAL | TOP SPEED | BODY | ARMOR | PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Zoom Bike | 4/3 | 15 | 20 | 160 | 5 | 4 | 1 | 1 | 1 | 2 | 8,000¥ |
#### Zoom Bike
A made-up bike.
#### look-alikes
Other made-up makes.
| VEHICLE | SIMILAR MODELS |
|---|---|
| Zoom Bike | Vroom Bike |
| Hover Pod | Float Pod |
<!-- page 305 -->
# INDEX
Zap Gun, 250
#### reprinted tables
| PRIORITY | METATYPE | ATTRIBUTES | SKILLS | MAGIC OR RESONANCE | RESOURCES |
|---|---|---|---|---|---|
| B | Glimmerkin (11) | 16 | 24 | — | 275,000¥ |
"""
ALIASES = {"zapp rifle": "zap rifle"}  # a made-up spelling difference


def run_recipe(md=BOOK_MD):
    regrouped, report = regroup.regroup(md, ALIASES, name_headers=crb.NAME_HEADERS, end_page=crb.END_PAGE)
    return crb.extract(regrouped), report


def entries(res, kind):
    return {e.findtext("name"): e for e in ET.fromstring(res.files[f"{kind}.xml"])}


class CrbRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res, cls.regroup_report = run_recipe()

    def rep(self, kind):
        return [r for r in self.res.report if r["kind"] == kind]

    def test_every_kind_has_its_entry(self):
        expect = {
            "priorities": "Priority A",
            "metatypes": "Glimmerkin",
            "attributes": "Body",
            "skills": "Tinkering",
            "qualities": "Lucky Streak",
            "weapons": "Zap Gun",
            "armor": "Padded Vest",
            "augmentations": "Glow Gland",
            "grades": "Shinyware",
            "electronics": "Clunker Deck",
            "programs": "Glow Scan",
            "gear": "Gizmo Kit",
            "vehicles": "Zoom Bike",
            "spells": "Zap Bolt",
            "rituals": "Glow Circle",
            "adeptpowers": "Quick Feet",
            "complexforms": "Static Fizz",
            "metamagics": "Bright Aura",
            "echoes": "Quick Think",
            "critterpowers": "Glimmer",
            "critters": "Fuzzbeast",
            "spirits": "Spirits of Fizz",
            "npcs": "Corner Goon",
            "sprites": "Gadget Sprite",
            "lifestyles": "Shoebox",
            "contacts": "Fixer Fred",
            "rules": "Making Trouble",
            "categories": "Zappers",
        }
        # the core rulebook has no life modules (the Companion's), martial arts (Firing Squad's, Deadly Arts') nor
        # traditions of their own (Street Wyrd's)
        # (nor the kinds read from sections, sections.py: test_sr6_sections)
        self.assertEqual(
            set(expect),
            set(sr6.KINDS) - {"lifemodules", "martialarts", "martialtechniques", "traditions"} - set(sr6.SECTION_KINDS),
        )
        for kind, name in expect.items():
            self.assertIn(name, entries(self.res, kind), kind)

    def test_attributes(self):
        w = entries(self.res, "weapons")["Zap Gun"].attrib
        self.assertEqual(
            w,
            {
                "id": "zap-gun",
                "source": "CRB",
                "page": "250",
                "category": "Zappers",
                "dv": "3P",
                "modes": "SA",
                "ar": "8/10/—/—",
                "ammo": "10(c)",
                "avail": "2",
                "cost": "1250",
            },
        )
        self.assertEqual(entries(self.res, "weapons")["Lost Blaster"].get("avail"), "—")
        a = entries(self.res, "augmentations")["Glow Gland"].attrib
        self.assertEqual((a["type"], a["category"], a["rating"], a["essence"]), ("bioware", "Bioware", "1–3", "0.2"))
        self.assertEqual(entries(self.res, "electronics")["Clunker Deck"].get("array"), "4 3 2 1")
        self.assertEqual(entries(self.res, "gear")["Gizmo Kit"].get("cost"), "Rating x 100")
        v = entries(self.res, "vehicles")["Zoom Bike"].attrib
        self.assertEqual((v["handling"], v["interval"], v["topSpeed"], v["seats"]), ("4/3", "20", "160", "1"))
        s = entries(self.res, "spells")["Zap Bolt"].attrib
        self.assertEqual((s["category"], s["tags"], s["range"], s["dv"]), ("combat", "Direct, Area", "LOS", "3"))
        self.assertEqual(entries(self.res, "rituals")["Glow Circle"].get("keywords"), "Anchored, Spell")
        self.assertEqual(entries(self.res, "adeptpowers")["Quick Feet"].attrib["cost"], "0.5")
        self.assertEqual(entries(self.res, "adeptpowers")["Quick Feet"].attrib["perLevel"], "true")
        self.assertEqual(entries(self.res, "complexforms")["Static Fizz"].get("fade"), "3")
        sk = entries(self.res, "skills")["Tinkering"]
        self.assertEqual(
            (sk.get("attr"), sk.get("untrained"), [x.text for x in sk.iter("spec")]),
            ("log", "true", ["Gizmos", "Clockwork (Wind-up, Spring)"]),
        )  # (a comma inside parentheses is not a split)
        self.assertEqual(entries(self.res, "attributes")["Body"].attrib["abbr"], "BOD")
        self.assertEqual(
            [(n, e.get("cost")) for n, e in entries(self.res, "lifestyles").items()],
            [("Gutter", "0"), ("Shoebox", "200")],
        )
        self.assertEqual(entries(self.res, "contacts")["Fixer Fred"].get("archetype"), "Fixer Fred")
        self.assertEqual(entries(self.res, "critterpowers")["Glimmer"].get("duration"), "Always")
        self.assertEqual(entries(self.res, "qualities")["Butterfingers"].attrib["kind"], "negative")

    def test_beings(self):
        f = entries(self.res, "critters")["Fuzzbeast"]
        self.assertEqual(
            (f.get("category"), f.get("bod"), f.get("int"), f.get("init"), f.get("move")),
            ("critter", "4", "3", "7 + 1D6", "10/15/+1"),
        )
        self.assertEqual([c.tag for c in f][1:], ["skills", "powers", "attacks"])
        g = entries(self.res, "npcs")["Corner Goon"]
        self.assertEqual((g.get("rating"), g.get("group"), g.findtext("weapons")), ("2", "Street Crew", "Zap Gun"))
        sp = entries(self.res, "sprites")["Gadget Sprite"]
        self.assertEqual(
            (sp.get("data"), sp.get("init"), sp.findtext("skills"), sp.findtext("powers")),
            ("L+2", "(L x 2) +1 + 4D6", "Hacking, Electronics", "Zap, Fizz"),
        )  # the band after the text
        sf = entries(self.res, "spirits")["Spirits of Fizz"]
        self.assertEqual(
            (sf.get("category"), sf.get("str"), sf.get("init"), sf.get("dr"), sf.get("cm")),
            ("spirit", "F–1", "[(F x 2) + 1] + 2D6", "F – 1", "(F/2)+7"),
        )

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            self.assertEqual(doc.tag, f"{{{sr6.NS}}}data")
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_no_prose_in_overlays_and_texts_hold_descriptions(self):
        for xml in self.res.files.values():
            self.assertNotIn("<text", xml)
            self.assertNotIn("made-up", xml.lower())
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts[("weapons", "zap-gun")], "**Heft:** 2\nA made-up gun that zaps.")  # an unknown column
        self.assertIn("**Cost:** 4 Karma per level", texts[("qualities", "lucky-streak")])
        self.assertIn("| ROLL | RESULT |", texts[("rules", "making-trouble")])
        self.assertEqual(texts[("critters", "fuzzbeast")], "A made-up beast, mostly fuzz.")  # the lists aren't prose

    def test_priority_and_metatype(self):
        a = entries(self.res, "priorities")["Priority A"]
        self.assertEqual(a.get("letter"), "A")
        self.assertEqual(
            [(m.get("name"), m.get("points")) for m in a.iter("metatype")], [("Glimmerkin", "13"), ("Stonefolk", "11")]
        )
        self.assertEqual(
            [(m.get("kind"), m.get("rating")) for m in a.iter("magic")],
            [("full", "3"), ("mystic-adept", "3"), ("adept", "5"), ("technomancer", "3")],
        )
        self.assertEqual((a.find("attributes").get("points"), a.find("resources").get("nuyen")), ("22", "420000"))
        e = entries(self.res, "priorities")["Priority E"]
        self.assertEqual([m.get("kind") for m in e.iter("magic")], ["mundane"])
        g = entries(self.res, "metatypes")["Glimmerkin"]
        self.assertEqual(len(g.findall("range")), 9)
        self.assertEqual(
            (g.find("range").get("attr"), g.find("range").get("min"), g.find("range").get("max")), ("bod", "1", "6")
        )
        self.assertEqual([t.text for t in g.iter("trait")], ["Glowing Skin", "Night Eyes"])
        self.assertEqual([t.text for t in entries(self.res, "metatypes")["Plainfolk"].iter("trait")], [])  # "None"
        # printed as a labelled line under the table
        self.assertEqual(
            [t.text for t in entries(self.res, "metatypes")["Stonefolk"].iter("trait")], ["Hard Hide", "Built Big 2"]
        )
        self.assertEqual(
            list(entries(self.res, "metatypes")), ["Plainfolk", "Glimmerkin", "Stonefolk"]
        )  # no chart rows
        self.assertEqual(list(entries(self.res, "priorities")), ["Priority A", "Priority E"])  # the index left out

    def test_quality_levels(self):
        q = entries(self.res, "qualities")["Lucky Streak"].attrib
        self.assertEqual((q["kind"], q["karma"], q["perLevel"], q["maxLevel"]), ("positive", "4", "true", "3"))
        self.assertEqual(q["id"], "lucky-streak")
        h = entries(self.res, "qualities")["Odd Habit (Vice, 1 to 4)"].attrib  # the levels in the name's note: kept
        self.assertEqual((h["kind"], h["perLevel"], h["maxLevel"]), ("negative", "true", "4"))

    def test_unknown_column_and_book_value(self):
        self.assertEqual([(r["file"], r["column"]) for r in self.rep("unknown-column")], [("weapons.xml", "HEFT")])
        self.assertNotIn("heft", entries(self.res, "weapons")["Zap Gun"].attrib)
        self.assertEqual(entries(self.res, "weapons")["Zapp Rifle"].get("cost"), "12x")
        self.assertEqual(
            [(r["name"], r["field"], r["value"]) for r in self.rep("book-value")],
            [("Zapp Rifle", "cost", "12x"), ("Autosoft", "avail", "Rating (1–6)"), ("Oddware", "cost", "lots")],
        )

    def test_rules_tree_and_pages(self):
        r = entries(self.res, "rules")
        self.assertEqual((r["GAME CONCEPTS"].get("level"), r["GAME CONCEPTS"].get("parent")), ("1", None))
        self.assertEqual((r["Making Trouble"].get("level"), r["Making Trouble"].get("parent")), ("2", "game-concepts"))
        self.assertEqual(r["Trouble Dice"].get("parent"), "making-trouble")
        self.assertEqual((r["Rolling Over"].get("level"), r["Rolling Over"].get("parent")), ("4", "trouble-dice"))
        self.assertEqual(r["Poke Host"].get("chapter"), "MATRIX")  # matrix actions are rule sections
        self.assertNotIn("Body", r)
        self.assertEqual(r["Making Trouble"].get("page"), "2")  # PDF page 3 - 1
        self.assertEqual(entries(self.res, "priorities")["Priority A"].get("page"), "40")

    def test_real_book_shapes(self):
        """The shapes of the real book (made up here): sample contacts, side-by-side boxes, a spell named like an adept
        power, a matrix reprint, a look-alike list, a group-heading row."""
        n = entries(self.res, "npcs")
        self.assertEqual(
            (n["Fixer Fred"].get("group"), n["Fixer Fred"].get("cha"), n["Fixer Fred"].get("rating")),
            ("Contact", "5", None),
        )
        c = entries(self.res, "critters")
        self.assertEqual(
            [(k, c[k].get("bod"), c[k].findtext("attacks")) for k in ("Ice Wyrm", "Fire Wyrm")],
            [("Ice Wyrm", "12", "Bite: DV 9P"), ("Fire Wyrm", "11", "Bite: DV 10P")],
        )
        self.assertEqual(entries(self.res, "spells")["Glow Sense"].get("category"), "detection")
        self.assertEqual(entries(self.res, "adeptpowers")["Glow Sense"].get("cost"), "0.25")
        self.assertEqual(list(entries(self.res, "electronics")), ["Clunker Deck", "Spy Lens"])  # no matrix reprint
        self.assertEqual(list(entries(self.res, "vehicles")), ["Zoom Bike"])  # no look-alike rows
        self.assertNotIn("Patches", entries(self.res, "gear"))
        self.assertEqual(list(entries(self.res, "echoes")), ["Quick Think", "Wide Net"])
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts[("echoes", "wide-net")], "Your made-up net is wider.")
        p = entries(self.res, "programs")  # a type's price from its `Cyberprogram, <type>` row; its paragraph's text
        self.assertEqual(
            {k: (v.get("type"), v.get("rating"), v.get("avail"), v.get("cost")) for k, v in p.items()},
            {
                "Glow Scan": ("basic", None, "3", "77"),
                "Fizz Wall": ("basic", None, "3", "77"),
                # the autosofts, priced by the `Autosoft` row's rating formula
                "Glide": ("autosoft", "1–6", "Rating", "Rating x 50"),
                "[Weapon] Aiming": ("autosoft", "1–6", "Rating", "Rating x 50"),
            },
        )
        self.assertEqual(texts[("programs", "fizz-wall")], "Wall of made-up fiz-\nzing code.")
        self.assertEqual(entries(self.res, "qualities")["Steady Hands"].get("karma"), "5")  # a cost in the text

    def test_grades(self):
        """The implant grades table: multipliers and the Availability modifier as numbers; a cell that isn't one is
        reported, the grade kept."""
        g = entries(self.res, "grades")
        self.assertEqual(
            {k: (v.get("essence"), v.get("cost"), v.get("avail")) for k, v in g.items()},
            {"Shinyware": ("0.9", "1.3", "2"), "Rustyware": ("1.2", "0.4", "-1"), "Oddware": ("0.7", None, "1")},
        )
        self.assertIn(
            ("grades.xml", "Oddware", "cost", "lots"),
            [(r["file"], r["name"], r["field"], r["value"]) for r in self.rep("book-value")],
        )

    def test_prices(self):
        """Formula prices are kept for the app to evaluate; rows printing two items split; units go to per."""
        w = entries(self.res, "weapons")
        self.assertEqual(
            [(k, w[k].get("cost")) for k in ("Zip Pistol I", "Zip Pistol II")],
            [("Zip Pistol I", "300"), ("Zip Pistol II", "350")],
        )
        g = entries(self.res, "gear")
        self.assertEqual((g["Fizz rope"].get("cost"), g["Fizz rope"].get("per")), ("40", "100m"))
        self.assertEqual(
            [(k, g[k].get("cost"), g[k].get("per")) for k in ("Bronze plan (month)", "Bronze plan (year)")],
            [("Bronze plan (month)", "100", "month"), ("Bronze plan (year)", "1000", "year")],
        )
        lens = entries(self.res, "electronics")["Spy Lens"]
        self.assertEqual((lens.get("cost"), lens.get("capacity"), lens.get("rating")), ("Capacity x 70", "1–4", "1–4"))
        b = entries(self.res, "augmentations")["Brain Fizzer"]  # the rating range printed in the name
        self.assertEqual((b.get("rating"), b.get("cost"), b.get("category")), ("1–4", "Rating^2 x 100", "Headware"))
        t = entries(self.res, "augmentations")
        self.assertEqual(
            [(k, t[k].get("cost"), t[k].get("capacity")) for k in ("Tail (synthetic)", "Tail (obvious)")],
            [("Tail (synthetic)", "9000", "3"), ("Tail (obvious)", "7000", "6")],
        )
        self.assertEqual(entries(self.res, "vehicles")["Zoom Bike"].get("category"), "Cars")
        for v in (
            "Capacity x 70",
            "Rating^2 x 100",
            "(Force +3) L",
            "+500",
            "(Rating/3)(L)",
            "100 + (rating x 10)",
            "—",
            "Rating x .3",
        ):
            self.assertTrue(catalog.readable(v), v)
        for v in ("12x", "900 + Gizmo", "300/350", "10–900", "Rating^"):
            self.assertFalse(catalog.readable(v), v)

    def test_archetypes(self):
        """The archetypes chapter's sample characters: SR6 runner files built from the stat block against the catalog,
        valid against character.xsd, what doesn't map in the notes and the report, no description."""
        self.assertEqual(
            [(s["file"], s["name"], s["role"], s["page"]) for s in self.res.samples],
            [
                ("crb.glow-runner.xml", "Glow Runner", "Archetype", 81),
                ("crb.bit-whisperer.xml", "Bit Whisperer", "Archetype", 82),
            ],
        )
        schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, "character.xsd")))
        for s in self.res.samples:
            doc = etree.fromstring(s["xml"].encode("utf8"))
            self.assertTrue(schema.validate(doc), f"{s['file']}: {schema.error_log.last_error}")
            self.assertNotIn("A made-up", s["xml"])  # the description stays in the book
        g = ET.fromstring(self.res.samples[0]["xml"])
        b = g.find("build")
        self.assertEqual(
            (g.get("id"), g.get("streetName"), g.get("metatype"), b.get("magic")),
            ("crb.glow-runner", "Glow Runner", "crb.glimmerkin", "adept"),
        )
        # the priorities fitted (importer/sr6/fit.py): this book's rows hold the adept only at A and Glimmerkin at A and E;
        # B to D print nothing, so no priority assignment holds it within the karma; Sum-to-Ten's letters (which may
        # repeat) do better, attributes at A as well as magic, and still overspend, so the prime runner's doubled Karma
        # (CRB Hong Kong p.63, levelPrime) is assumed: the skill and the nuyen with karma (D's rows print nothing); its
        # contacts take more points than Charisma x 6, so the Sixth World Companion's expanded contacts (p.161) too
        self.assertEqual((g.get("method"), b.get("method")), ("sumtoten", "sumtoten"))
        self.assertEqual(
            [(x.get("column"), x.get("letter")) for x in b.iter("priority")],
            [("metatype", "E"), ("attributes", "A"), ("magic", "A"), ("skills", "D"), ("resources", "D")],
        )
        self.assertEqual(
            [(x.get("key"), x.get("value"), x.get("assumed"), x.get("page")) for x in g.find("rules")],
            [("levelPrime", "true", "true", "63"), ("expandedContacts", "true", "true", "161")],
        )
        self.assertEqual(
            {a.get("id"): (a.get("points"), a.get("adjust"), a.get("karma")) for a in b.iter("attribute")},
            {
                "bod": ("2", "0", "0"),
                "agi": ("4", "0", "0"),
                "rea": ("3", "0", "0"),
                "str": ("1", "0", "0"),
                "wil": ("2", "0", "0"),
                "log": ("1", "0", "0"),
                "int": ("3", "0", "0"),
                "cha": ("2", "0", "0"),
                "edg": ("0", "1", "2"),
                "mag": ("0", "0", "0"),
                "res": ("0", "0", "0"),
            },
        )  # Magic 5: the priority's; Edge's 3 ranks past 1: the 1 adjustment point, then karma
        self.assertEqual(
            [(x.get("id"), x.get("points"), x.get("karma"), x.get("spec")) for x in b.iter("skill")],
            [("crb.tinkering", "0", "3", "Gizmos")],
        )
        self.assertEqual(b.get("karmaToNuyen"), "19")  # (the prime Karma left can't come within 5 by more: as printed)
        self.assertIn("Priorities fitted to the printed stat block", g.findtext("notes"))
        self.assertIn("built with Sum-to-Ten", g.findtext("notes"))
        self.assertEqual(
            [(x.text, x.get("kind"), x.get("native")) for x in b.iter("knowledge")],
            [
                ("Glow Lore", "knowledge", None),
                ("Puddle Streets", "knowledge", None),
                ("Plainspeak", "language", "true"),
                ("Glimmertongue", "language", None),
            ],
        )
        # Logic 2: two knowledge points; the language past them is bought with karma
        self.assertEqual(
            [(x.get("points"), x.get("karma")) for x in b.iter("knowledge")],
            [("1", "0"), ("1", "0"), ("0", "0"), ("0", "1")],
        )
        self.assertEqual(
            [(x.get("id"), x.get("level"), x.get("free")) for x in b.iter("quality")],
            [
                ("crb.lucky-streak", "2", None),
                ("crb.butterfingers", "1", None),
                ("crb.steady-hands", "1", "true"),
                ("crb.spark-fizz-bane", "1", None),
            ],
        )  # `Fizz Bane`: one of a slashed pair
        self.assertEqual(
            [(x.get("kind"), x.get("id"), x.get("level")) for x in b.iter("pick")],
            [("adeptpowers", "crb.quick-feet", "2"), ("adeptpowers", "crb.glow-sense", None)],
        )
        self.assertEqual(
            [(x.get("name"), x.get("connection"), x.get("loyalty")) for x in b.iter("contact")],
            [("Fixer Fred", "3", "2"), ("Glow Dealer", "1", "4")],
        )
        self.assertEqual((b.find("lifestyle").get("id"), b.find("lifestyle").get("months")), ("crb.shoebox", "2"))
        self.assertEqual(
            [(x.get("kind"), x.get("id"), x.get("rating"), x.get("worn")) for x in b.iter("purchase")],
            [
                ("armor", "crb.padded-vest", None, "true"),
                ("gear", "crb.gizmo-kit", "4", None),
                ("augmentations", "crb.glow-gland", "2", None),
                ("augmentations", "crb.tail-obvious", None, None),
                ("vehicles", "crb.zoom-bike", None, None),
                ("weapons", "crb.zap-gun", None, None),
            ],
        )  # a cybertail is the catalog's Tail
        self.assertEqual(
            [(x.get("kind"), x.get("rating"), [l.get("name") for l in x]) for x in b.iter("sin")],
            [("fake", "3", ["zap license"]), ("fake", "3", ["zap license"])],
        )
        notes = g.findtext("notes")
        for bit in (
            "Initiative/Actions: 8 + 2D6/1 Major, 3 Minor",
            "Starting Nuyen: 1,234¥",
            "Augmented as printed: AGI 5(6).",
            "Skills not in the catalog: Basket Weaving 2.",
            "Qualities not in the catalog: Night Eyes (glimmerkin trait); Odd Quirk.",
            "Gear not in the catalog: Mystery Box; Glue gun.",
            "Weapons not in the catalog: Odd Sword [Blade, DV 3P, 9/—/—/—/—].",
        ):
            self.assertIn(bit, notes)
        self.assertEqual(
            [(r["name"], r["field"], r["value"]) for r in self.rep("unmatched-item")][:2],
            [
                ("Glow Runner", "Skills", "Basket Weaving 2"),
                ("Glow Runner", "Qualities", "Night Eyes (glimmerkin trait)"),
            ],
        )
        t = ET.fromstring(self.res.samples[1]["xml"])
        tb = t.find("build")
        self.assertEqual(
            (
                tb.get("magic"),
                tb.find("skill").get("expertise"),
                tb.find("pick").get("id"),
                tb.find("lifestyle").get("months"),
            ),
            ("technomancer", "Clockwork", "crb.static-fizz", "1"),
        )
        self.assertIn("Resonance isn’t printed", t.findtext("notes"))
        self.assertEqual(tb.find("purchase").get("id"), "crb.tail-obvious")  # the printed variant, not the first Tail
        self.assertEqual([x.get("id") for x in tb.iter("purchase")][1:], ["crb.zoom-bike"])  # `Zoombike`: spaces aside
        self.assertEqual(b.find("purchase[@id='crb.glow-gland']").get("grade"), "alpha")  # the grade printed with it
        p = g.find("printed")  # the numbers Review compares, as printed
        self.assertEqual((p.get("source"), p.get("page")), ("CRB", "81"))
        self.assertEqual(
            {v.get("key"): v.get("value") for v in p},
            {
                "bod": "3",
                "agi": "5(6)",
                "rea": "4",
                "str": "2",
                "wil": "3",
                "log": "2",
                "int": "4",
                "cha": "3",
                "edg": "4",
                "mag": "5",
                "ess": "6",
                "init": "8 + 2D6",
                "dr": "5",
            },
        )
        # the golden file the app's tests read (tests/fixtures/sr6/sample-glow-runner.xml): the same but its date
        golden = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "sr6" / "sample-glow-runner.xml"
        self.assertEqual(
            re.sub(r'updatedAt="[^"]+"', "", self.res.samples[0]["xml"]),
            re.sub(r'updatedAt="[^"]+"', "", golden.read_text(encoding="utf8")),
        )

    def test_standard_boosts_as_bonuses(self):
        """A sample's standard boost carries what it adds (the engine counts only a line's bonuses): per rating or level
        when the line has one, else at the level its name ends with; anything else carries none."""
        self.assertEqual(
            archetypes._bonuses("Wired Reflexes 2", None),  # turned on by a trigger: switchable
            '<bonus target="rea" value="2" switch="activated"/><bonus target="initDice" value="2" switch="activated"/>',
        )
        self.assertEqual(archetypes._bonuses("Muscle toner", 3), '<bonus target="agi" value="1" perRating="true"/>')
        self.assertEqual(archetypes._bonuses("Bone Lacing (Titanium)", None), '<bonus target="defense" value="2"/>')
        self.assertEqual(archetypes._bonuses("Glow Gland", 2), "")
        self.assertEqual(
            archetypes._bonuses("Arm (obvious)", None), '<bonus target="physical" value="1"/>'
        )  # a full limb's box
        self.assertEqual(archetypes._bonuses("Hand (obvious)", None), "")  # a partial one adds none
        # a reflex recorder: +1 to the rating of the skill printed with it, one line per skill (made-up skills)
        skill_of = {"zapping": "x.zapping", "lurking": "x.lurking"}.get
        self.assertEqual(
            list(
                archetypes._per_skill(
                    ["reflex recorder (Zapping & Lurking)", "goggles (rating 2, w/ zoom)"],
                    lambda n: skill_of(n.lower()),
                )
            ),
            ["reflex recorder (Zapping)", "reflex recorder (Lurking)", "goggles (rating 2, w/ zoom)"],
        )
        self.assertEqual(
            archetypes._bonuses("Reflex recorder (Skill)", None, lambda n: skill_of(n.lower()), chosen="Lurking"),
            '<bonus target="skill" skill="x.lurking" value="1"/>',
        )
        self.assertEqual(
            archetypes._bonuses("Reflex recorder (Skill)", None, lambda n: skill_of(n.lower())), ""
        )  # none named

    def test_what_a_sample_line_is_printed_with(self):
        """A weapon's `w/` list: accessories fitted to it (a count its quantity; one its text names left out), ammunition
        as the row of its kind (per 10 rounds) and grenades as lines of their own, each per weapon on the line; a
        gadget's enhancements found among the line's kinds (Smooth Operations drops the `w/`), an unrated one at the
        rating its Capacity needs; a commlink's accessories (made-up catalog)."""
        e = lambda i, n, **a: {"id": i, "name": n, "attrs": a, "children": [], "text": a.pop("text", "")}  # noqa: E731
        idx = archetypes._Index(
            {
                "weapons": [
                    e("zapper", "Zapper", category="Heavy pistol", cost="300", text="Comes with a glow sight."),
                    e("glow-sight", "Glow sight", category="Weapon accessory", cost="200"),
                    e("spare-clip", "Spare clip", category="Weapon accessory", cost="5"),
                    e("fizz", "Fizz", category="Grenade", cost="40"),
                ],
                "gear": [
                    e("hp-ammo", "Heavy Pistol/SMG", category="Ammo by weapon type", per="10 rounds", cost="10"),
                    e("zoom", "Zoom", category="Visual enhancement", capacity="[1]", cost="+50"),
                    e("tingle", "Tingle", category="Visual enhancement", capacity="[2]", cost="+80"),
                    e("hum-mic", "Hum mic", category="Accessory", cost="30"),
                ],
                "electronics": [
                    e("specs", "Specs", capacity="1–3", rating="1–3", cost="Capacity x 100"),
                    e("talker", "Talker", rating="2", cost="500"),
                ],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(
            idx,
            ["weapons"],
            "2 x Zapper",
            7,
            [],
            {},
            note="2 x Zapper [Heavy Pistol, SA, w/ glow sight, 3 spare clips, 30 rounds fizzy ammo, 2 fizz grenades]",
        )
        self.assertIn('<purchase uid="g7a4" kind="weapons" id="nb.spare-clip" name="Spare clip" qty="6"/>', line)
        self.assertNotIn("nb.glow-sight", line)  # (the Zapper's text names it: built in)
        self.assertIn(
            '<purchase uid="g7x5" kind="gear" id="nb.hp-ammo" name="Heavy Pistol/SMG" qty="6" note="30 rounds fizzy ammo"/>',
            line,
        )
        self.assertIn(
            '<purchase uid="g7x6" kind="weapons" id="nb.fizz" name="Fizz" qty="4" note="2 fizz grenades"/>', line
        )
        self.assertEqual(cost, 2 * 300 + 6 * 5 + 6 * 10 + 4 * 40)
        kinds = ["electronics", "gear"]
        line, _, cost = archetypes._purchase(idx, kinds, "specs (zoom, tingle)", 8, [], {})
        self.assertIn('id="nb.specs" name="Specs" rating="3"', line)  # [1] + [2]: rating 3 holds them
        self.assertEqual(cost, 300 + 50 + 80)
        line, _, cost = archetypes._purchase(
            idx, kinds, "Talker commlink (Device Rating 2, w/ hum mic, zoom)", 9, [], {}
        )
        self.assertIn('id="nb.hum-mic"', line)
        self.assertNotIn("nb.zoom", line)  # (no Capacity: an accessory table's only)
        self.assertEqual(cost, 530)
        # (owner, 2026-10-19) a count in the unit the entry is priced per, a host's own supplies, a book misprint
        kit = archetypes._Index(
            {
                "gear": [
                    e("dram", "Reagents, per dram", cost="50"),
                    e("kit", "Medkit", rating="1–6", cost="Rating x 250"),
                    e("kit-supplies", "Medkit supplies", cost="100", text=""),
                ],
                "armor": [e("lined", "Lined coat", cost="900")],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(kit, ["gear"], "reagents (20 drams)", 12, [], {})
        self.assertEqual((cost, 'qty="20"' in line), (1000, True))
        line, _, cost = archetypes._purchase(kit, ["gear"], "medkit (rating 4; 4 x supplies)", 13, [], {})
        self.assertEqual((cost, 'id="nb.kit-supplies" name="Medkit supplies" qty="4"' in line), (1400, True))
        line, _, cost = archetypes._purchase(kit, ["armor"], "long coat", 14, [], {})
        self.assertEqual(
            (cost, 'id="nb.lined" name="Lined coat"' in line, 'note="long coat"' in line), (900, True, True)
        )
        limbs = archetypes._Index(
            {
                "augmentations": [
                    e("arm-synthetic", "Arm (synthetic)", capacity="8", cost="20000"),
                    e("arm-obvious", "Arm (obvious)", capacity="15", cost="15000"),
                ]
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(limbs, ["augmentations"], "cyberarm (Agility 5; gizmo)", 10, [], {})
        self.assertIn('id="nb.arm-obvious"', line)  # its kind not printed: the obvious one
        self.assertIn(
            'id="nb.arm-synthetic"',
            archetypes._purchase(limbs, ["augmentations"], "cyberarm (synthetic left)", 11, [], {})[0],
        )

    def test_ammunition_types_limb_parts_and_increases(self):
        """An ammunition type the line names is fitted to its row at the row's price times the type's; a limb's
        accessory printed with other words (`arm slide`, `small smugglers compartment`) is the one whose every word it
        prints; a limb's Agility or Strength above the user's natural (base 2) is that many Attribute increases
        (made-up catalog)."""
        e = lambda i, n, **a: {"id": i, "name": n, "attrs": a, "children": [], "text": ""}  # noqa: E731
        idx = archetypes._Index(
            {
                "weapons": [e("zapper", "Zapper", category="Heavy pistol", cost="300")],
                "gear": [e("hp-ammo", "Heavy Pistol/SMG", category="Ammo by weapon type", per="10 rounds", cost="10")],
                "ammotypes": [e("fizzy", "Fizzy", cost="x1.5")],
                "augmentations": [
                    e("leg-obvious", "Leg (obvious)", category="Cyberlimb", capacity="20", cost="15000"),
                    e("glide", "Glide", category="Cyberlimb accessory", capacity="[3]", cost="3000"),
                    e("hidey-hole", "Hiding compartment", category="Cyberlimb accessory", capacity="[5]", cost="6000"),
                    e(
                        "attribute-increase",
                        "Attribute increase",
                        category="Cyberlimb accessory",
                        capacity="[Rating]",
                        cost="Rating x 5000",
                    ),
                ],
            },
            "NB",
        )
        line, _, cost = archetypes._purchase(
            idx, ["weapons"], "Zapper", 1, [], {}, note="Zapper [Heavy Pistol, w/ 20 rounds fizzy ammo]"
        )
        self.assertIn(
            '<purchase uid="g1x2" kind="gear" id="nb.hp-ammo" name="Heavy Pistol/SMG" qty="2" note="20 rounds fizzy ammo">'
            '<purchase uid="g1x2t1" kind="ammotypes" id="nb.fizzy" name="Fizzy" qty="1"/></purchase>',
            line,
        )
        self.assertEqual(cost, 300 + 20 * 1.5)
        line, _, cost = archetypes._purchase(
            idx,
            ["augmentations"],
            "cyberleg (Agility 5, Strength 2; leg glide, small hiding compartments)",
            2,
            [],
            {},
            nat={"agi": 3, "str": 1},
        )
        self.assertIn('id="nb.glide"', line)
        self.assertIn('id="nb.hidey-hole"', line)
        self.assertIn('id="nb.attribute-increase" name="Attribute increase" rating="2" qty="1" note="Agility 5"', line)
        self.assertNotIn('note="Strength 2"', line)  # (2 is the limb's base)
        self.assertEqual(cost, 15000 + 3000 + 6000 + 2 * 5000)

    def test_sample_karma_the_fit_counts(self):
        """`fake SIN 3` is rating 3; In Debt's printed debt is the Karma turned into nuyen (5,000¥ each); contacts past
        Charisma x 6 cost Karma when the expanded contacts are on or assumed (made-up catalog and settings)."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "qualities": [{"id": "deep-debt", "name": "Deep Debt", "attrs": {"kind": "negative", "karma": "0"}}],
            "priorities": [
                {
                    "id": "a",
                    "name": "A",
                    "attrs": {"letter": "A"},
                    "children": [("metatype", {"name": "Glim", "points": "1"}, None)],
                }
            ],
        }
        seen = {}
        orig = archetypes.fit.fit
        archetypes.fit.fit = lambda need, rows, cs: seen.update(need) or None
        try:
            b = SimpleNamespace(
                label="metatype: Glim",
                stats=[{"C": "2"}],
                labels={
                    "Gear": "fake SIN 3",
                    "Qualities": "Deep Debt (Sharks, 15,000¥, 1,500¥/month interest)",
                    "Contacts": "Fixer (C4/L4), Fence (C2/L3)",
                },
            )
            cs = {
                "fakeSinPerRating": 2500.0,
                "licencePerRating": 200.0,
                "inDebtQuality": "nb.deep-debt",
                "karmaToNuyenRateInDebt": 5000.0,
                "contactPointsPerCha": 6.0,
                "contactKarma": 1.0,
            }
            _, xml, _ = archetypes.build("NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs=cs)
        finally:
            archetypes.fit.fit = orig
        self.assertEqual([s.get("rating") for s in ET.fromstring(xml).iter("sin")], ["3"])
        self.assertEqual((seen["nuyen"], seen["toNuyen"], seen["karma"]), (7500, 3, 1))  # 13 contact points of 12

        """A quality whose text says it doesn't count toward the six at creation is marked uncounted (made-up text)."""
        from importer.sr6 import flags

        self.assertEqual(
            flags.uncounted("Note: This quality does not count to- ward the six total qualities limitation."),
            {"uncounted": "true"},
        )
        self.assertEqual(
            flags.uncounted("This does not count toward your maximum of six qualities at creation."),
            {"uncounted": "true"},
        )
        self.assertEqual(flags.uncounted("The limit of six qualities at character creation still applies."), {})

    def test_sample_overrides_replace_printed_text_and_note_it(self):
        """A row of overrides/samples/<book>.json replaces a printed line's text (or appends to a line) and puts its note
        on that sample only; text the book no longer prints is reported on stderr and its note left out (made-up rows).
        """
        import contextlib
        import io
        import json
        import tempfile

        rows = [
            {
                "sample": "Tester",
                "note": "Misprint.",
                "edits": [{"field": "Spells", "from": "Burst", "to": "Blast"}, {"field": "Gear", "add": "widget"}],
            },
            {"sample": "Tester", "note": "Gone.", "edits": [{"field": "Spells", "from": "Nope", "to": "Yes"}]},
        ]
        labels = {"Spells": "Armor, Burst, Chaos", "Gear": "coat"}
        with tempfile.TemporaryDirectory() as d, mock.patch.object(archetypes, "SAMPLES_DIR", Path(d)):
            (Path(d) / "nb.json").write_text(json.dumps(rows), encoding="utf8")
            err = io.StringIO()
            with contextlib.redirect_stderr(err):
                got, notes = archetypes._overridden("NB", "Tester", labels, 9)
            self.assertEqual(archetypes._overridden("NB", "Other", labels, 9), (labels, []))
        self.assertEqual((got, notes), ({"Spells": "Armor, Blast, Chaos", "Gear": "coat, widget"}, ["Misprint."]))
        self.assertEqual(labels["Spells"], "Armor, Burst, Chaos")  # (the book's labels are not changed)
        self.assertIn("Spells has no 'Nope'", err.getvalue())

    def test_a_level_printed_on_a_quality_without_levels(self):
        """`Stubborn Shell 2` on a quality with one flat cost: taken once, the printed level kept for Review's note; a
        quality with levels keeps its printed level (made-up catalog)."""
        from types import SimpleNamespace

        q = lambda i, n, **a: {"id": i, "name": n, "attrs": {"kind": "positive", "karma": "8", **a}}
        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "qualities": [q("stubborn-shell", "Stubborn Shell"), q("lucky", "Lucky", perLevel="true", maxLevel="3")],
        }
        b = SimpleNamespace(label="metatype: Glim", labels={"Qualities": "Stubborn Shell 2, Lucky 2"}, stats=[])
        _, xml, _ = archetypes.build("NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs={})
        g = ET.fromstring(xml)
        self.assertEqual(
            [(x.get("id"), x.get("level")) for x in g.iter("quality")], [("nb.stubborn-shell", "1"), ("nb.lucky", "2")]
        )
        self.assertEqual(
            {v.get("key"): v.get("value") for v in g.find("printed")}, {"level:nb.stubborn-shell": "Stubborn Shell 2"}
        )

    def test_a_rank_printed_without_brackets_is_the_natural_rank(self):
        """`Con 7` with a voice modulator at rating 3, the skill cap 6: Con 7 as printed (an error on the runner, not read
        away); the modulator's dice stay on its line for the tests they hold on (`when`), nothing noted (made-up catalog
        and settings)."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "skills": [{"id": "con", "name": "Con", "attrs": {"attr": "cha"}}],
            "augmentations": [
                {"id": "voice-modulator", "name": "Voice modulator", "attrs": {"rating": "1–3", "cost": "Rating x 10"}}
            ],
        }
        b = SimpleNamespace(
            label="metatype: Glim",
            stats=[],
            labels={"Active Skills": "Con 7", "Augmentations": "Voice modulator (rating 3)"},
        )
        _, xml, _ = archetypes.build("NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs={"skillCap": 6.0})
        g = ET.fromstring(xml)
        self.assertEqual(
            [(x.get("id"), int(x.get("points")) + int(x.get("karma"))) for x in g.iter("skill")], [("nb.con", 7)]
        )
        self.assertEqual(
            [(x.get("skill"), x.get("value"), x.get("perRating"), bool(x.get("when"))) for x in g.iter("bonus")],
            [("nb.con", "1", "true", True)],
        )
        self.assertFalse(any((v.get("key") or "").startswith("rank:") for v in g.iter("value")))

    def test_a_near_name_finds_one_entry(self):
        """A maker before the name, a garment word swapped, an initialism, a variant in parentheses: the one entry left;
        two words shared at least, else none (made-up catalog)."""
        e = lambda i, n: {"id": i, "name": n, "attrs": {}}  # noqa: E731
        idx = archetypes._Index(
            {
                "armor": [
                    e("zl", "Zig Line (Plain)"),
                    e("zd", "Zig Line (Deluxe)"),
                    e("ft", "Fop of Tarn Coats (Blue Moon Coat)"),
                    e("fg", "Fop of Tarn Gloves"),
                    e("gs", "Glimmer Shield"),
                    e("pj", "Puff jacket"),
                ]
            },
            "nb",
        )
        near = lambda n, p=(): (h := idx.near(["armor"], n, p)) and h[1]  # noqa: E731
        self.assertEqual(
            [near("QX Zig Line", ["sticky", "deluxe"]), near("Fop o.T. Blue Moon Cape"), near("Acme Glimmer Shield")],
            ["nb.zd", "nb.ft", "nb.gs"],
        )
        self.assertEqual(near("Gloves"), "nb.fg")  # one word: the entry's last
        self.assertEqual([near("QX Zig Line"), near("Puff vest"), near("Line")], [None, None, None])

    def test_what_is_fitted_to_a_host_with_capacity(self):
        """`Zing ears (rating 2; w/ hum filter 2, buzz link, fizz)`: each one found is the host's accessory at its
        rating and adds its cost; one the host's text says it has (a buzz link) and one not in the catalog are left to the
        note (made-up catalog)."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "augmentations": [
                {
                    "id": "zing-ears",
                    "name": "Zing ears",
                    "attrs": {"capacity": "Rating x 4", "rating": "1–3", "cost": "Rating x 100"},
                    "text": "Zing ears come with a buzz link.",
                },
                {
                    "id": "hum-filter",
                    "name": "Hum filter",
                    "attrs": {"capacity": "[Rating]", "rating": "1–6", "cost": "Rating x 10"},
                },
                {"id": "buzz-link", "name": "Buzz link", "attrs": {"capacity": "[1]", "cost": "50"}},
            ],
        }
        b = SimpleNamespace(
            label="metatype: Glim",
            stats=[],
            labels={"Augmentations": "Zing ears (rating 2; w/ hum filter 2, buzz link, fizz)"},
        )
        _, xml, _ = archetypes.build("NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs={})
        host = next(x for x in ET.fromstring(xml).iter("purchase") if x.get("id") == "nb.zing-ears")
        self.assertEqual([(a.get("id"), a.get("rating")) for a in host.findall("purchase")], [("nb.hum-filter", "2")])

    def test_the_fit_prices_the_metatype_size_as_the_app(self):
        """metatypeSizePricing on (budgets.ts nuyenBudget): a troll-sized runner's gear costs 10% more, a dwarf-sized
        one's armor only; off, the printed prices (made-up catalog)."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [
                {"id": "rt", "name": "Rock Troll", "attrs": {}, "children": []},
                {"id": "hd", "name": "Hill Dwarf", "attrs": {}, "children": []},
            ],
            "armor": [{"id": "coat", "name": "Thick Coat", "attrs": {"defense": "+4", "cost": "1000"}}],
            "gear": [{"id": "lamp", "name": "Glow Lamp", "attrs": {"cost": "205"}}],
            "priorities": [
                {"id": "a", "name": "A", "attrs": {"letter": "A"}, "children": [("resources", {"nuyen": "5000"}, None)]}
            ],
        }
        seen = []
        orig = archetypes.fit.fit
        archetypes.fit.fit = lambda need, rows, cs: seen.append(need["nuyen"])
        try:
            for meta, on in (("Rock Troll", "true"), ("Hill Dwarf", "true"), ("Rock Troll", "false")):
                b = SimpleNamespace(label=f"metatype: {meta}", stats=[], labels={"Gear": "Thick Coat, Glow Lamp"})
                archetypes.build(
                    "NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs={"metatypeSizePricing": on}
                )
        finally:
            archetypes.fit.fit = orig
        self.assertEqual(seen, [1205 + 121, 1205 + 100, 1205])  # (120.5 rounded half up)

    def test_the_metatype_size_words_are_the_apps(self):
        """fit.py's troll- and dwarf-sized words are budgets.ts metatypeSize's."""
        ts = (
            Path(__file__).parents[2] / "src" / "sr6" / "runner-builder" / "domain" / "creation" / "budgets.ts"
        ).read_text(encoding="utf8")
        body = ts.split("export function metatypeSize", 1)[1].split("\n}", 1)[0]
        lists = [tuple(re.findall(r"'([^']+)'", x)) for x in re.findall(r"\[([^\]]*)\]\.includes", body)]
        self.assertEqual(lists, [archetypes.fit.TROLL_SIZED, archetypes.fit.DWARF_SIZED])

    def test_the_armor_worn_is_the_highest_defense_rating(self):
        """Two armors printed: the higher Defense Rating is worn, the other carried (made-up catalog)."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "armor": [
                {"id": "thin", "name": "Thin Wrap", "attrs": {"defense": "+2", "cost": "10"}},
                {"id": "thick", "name": "Thick Coat", "attrs": {"defense": "+4", "cost": "10"}},
            ],
        }
        b = SimpleNamespace(label="metatype: Glim", stats=[], labels={"Gear": "Thin Wrap, Thick Coat"})
        _, xml, _ = archetypes.build("NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs={})
        self.assertEqual(
            {x.get("id"): x.get("worn") for x in ET.fromstring(xml).iter("purchase")},
            {"nb.thin": None, "nb.thick": "true"},
        )

    def test_the_armor_worn_is_the_one_that_makes_the_printed_defense_rating(self):
        """Body 3, Defense Rating 5 printed: the +2 armor is worn, not the higher +3 one; no Defense Rating printed: the highest."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "armor": [
                {"id": "thin", "name": "Thin Wrap", "attrs": {"defense": "+2", "cost": "10"}},
                {"id": "thick", "name": "Thick Coat", "attrs": {"defense": "+3", "cost": "10"}},
            ],
        }
        worn = lambda stats: {
            x.get("id"): x.get("worn")
            for x in ET.fromstring(
                archetypes.build(  # noqa: E731
                    "NB",
                    "Tester",
                    SimpleNamespace(label="metatype: Glim", stats=stats, labels={"Gear": "Thin Wrap, Thick Coat"}),
                    9,
                    entries,
                    "2026-10-09T00:00:00.000Z",
                    cs={},
                )[1]
            ).iter("purchase")
        }
        self.assertEqual(worn([{"B": "3"}, {"DR": "5"}]), {"nb.thin": "true", "nb.thick": None})
        self.assertEqual(worn([{"B": "3"}]), {"nb.thin": None, "nb.thick": "true"})

    def test_an_always_on_bonus_is_folded_into_the_printed_number(self):
        """(owner, 2026-10-10) `Zap 4` with a reflex recorder (always on): natural Zap 3, noted; `Lurk 4(5)` with one: the
        brackets hold it, natural 4; `A 5` with muscle toner 2: natural 3; `R 3(4)` with wired reflexes 1 (switchable):
        natural 3; `Gab 7` with a voice modulator (wireless, conditional): 7 (made-up catalog and skills)."""
        from types import SimpleNamespace

        entries = {
            "metatypes": [{"id": "glim", "name": "Glim", "attrs": {}, "children": []}],
            "skills": [{"id": n.lower(), "name": n, "attrs": {"attr": "agi"}} for n in ("Zap", "Lurk", "Gab")],
            "augmentations": [
                {"id": "reflex-recorder", "name": "Reflex recorder (Skill)", "attrs": {"cost": "10"}},
                {"id": "muscle-toner", "name": "Muscle toner", "attrs": {"rating": "1–4", "cost": "Rating x 10"}},
                {"id": "wired-reflexes", "name": "Wired reflexes", "attrs": {"rating": "1–3", "cost": "Rating x 10"}},
                {"id": "voice-modulator", "name": "Voice modulator", "attrs": {"rating": "1–3", "cost": "Rating x 10"}},
            ],
        }
        b = SimpleNamespace(
            label="metatype: Glim",
            stats=[{"A": "5", "R": "3(4)"}],
            labels={
                "Active Skills": "Zap 4, Lurk 4(5), Gab 7",
                "Augmentations": "reflex recorder (Zap & Lurk), muscle toner 2, wired reflexes 1, voice modulator (rating 3)",
            },
        )
        _, xml, _ = archetypes.build("NB", "Tester", b, 9, entries, "2026-10-09T00:00:00.000Z", cs={"skillCap": 6.0})
        g = ET.fromstring(xml)
        self.assertEqual(
            {x.get("id"): int(x.get("points")) + int(x.get("karma")) for x in g.iter("skill")},
            {"nb.zap": 3, "nb.lurk": 4, "nb.gab": 7},
        )
        printed = {v.get("key"): v.get("value") for v in g.find("printed")}
        self.assertEqual(
            (printed["natural:skill:nb.zap"], printed["natural:agi"]),
            ("4|reflex recorder (skill) 1", "5|muscle toner 2"),
        )
        self.assertNotIn("natural:skill:nb.lurk", printed)
        self.assertNotIn("natural:rea", printed)
        self.assertNotIn("natural:skill:nb.gab", printed)

    def test_sample_lookups_keep_the_printed_level_and_rating(self):
        """A level printed with a quality finds an entry that comes in levels (not a path step of the same name); a
        rating printed with an item never finds an entry named for another rating; a `+3` is the specialization made
        an expertise (made-up catalogs)."""
        q = lambda i, n, **a: {"id": i, "name": n, "attrs": a}
        own = {"qualities": [q("craving", "Craving")]}  # a path's one-level step, exact
        core = {
            "qualities": [
                q("crb.craving-substance-1-to-6", "Craving (Substance, 1 to 6)", perLevel="true", maxLevel="6")
            ],
            "augmentations": [
                q("nb.glow-eyes-rating-6", "Glow eyes (Rating 6)"),
                q("crb.glow-eyes-basic-system-rating-3", "Glow eyes basic system (Rating 3)"),
            ],
        }
        idx = archetypes._Index(own, "NB", core)
        self.assertEqual(
            archetypes._named(idx, ["qualities"], "Craving 4 (glitter)")[0][1], "crb.craving-substance-1-to-6"
        )
        self.assertEqual(archetypes._named(idx, ["qualities"], "Craving")[0][1], "nb.craving")
        line = archetypes._purchase(idx, ["augmentations"], "glow eyes 3 (w/ flare)", 1, False, {})[0]
        self.assertIn('id="crb.glow-eyes-basic-system-rating-3"', line)
        line = archetypes._purchase(idx, ["augmentations"], "Glow eyes (rating 6)", 1, False, {})[0]
        self.assertIn('id="nb.glow-eyes-rating-6"', line)

    def test_sample_item_priced_as_the_app_prices_it(self):
        """An item printed at a rating with a word the catalog's name lacks takes the row of that rating (not rating
        1's), and is priced by the entry's formula as the app prices it, not its printed first-row value (made-up)."""
        tier = ("formula", {"field": "cost"}, "tier(R; 1: 100; 2: 300; 3: 900)")
        row = lambda r: {
            "id": f"zap-jack-rating-{r}",
            "name": f"Zap jack (Rating {r})",
            "attrs": {"cost": "100"},
            "children": [tier],
        }
        idx = archetypes._Index({"augmentations": [row(1), row(3)]}, "NB")
        line, _, cost = archetypes._purchase(idx, ["augmentations"], "zap jack MPI (rating 3)", 1, [], {})
        self.assertIn('id="nb.zap-jack-rating-3"', line)
        self.assertEqual(cost, 900)
        per = {
            "id": "glow",
            "name": "Glow",
            "attrs": {"cost": "5"},
            "children": [("formula", {"field": "cost"}, "Q*2")],
        }
        self.assertEqual(archetypes._value(per, "cost", 1, 10), 20)  # (a formula counting Q is the whole line's)
        self.assertEqual(archetypes._value({"attrs": {"cost": "Rating x 50"}}, "cost", 4, 2), 400)

    def test_nothing_unmapped(self):
        self.assertEqual(self.rep("unmapped"), [])
        self.assertEqual(self.rep("missing-value"), [])
        self.assertEqual(self.rep("duplicate-id"), [])

    def test_match(self):
        self.assertEqual(crb.match({"sha256": crb.SHA256[0]}, ""), 1.0)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.9)
        self.assertEqual(
            crb.match(
                {"sha256": "x", "title": "Shadowrun Anarchy 2.0 Alternative Core Rulebook"},
                "# Shadowrun Anarchy\nAlternative Core Rulebook",
            ),
            0.0,
        )
        self.assertIs(identify({"sha256": "x"}, BOOK_MD[:4000])[0], crb)
        self.assertIsNone(identify({"sha256": "x"}, "# Some Other Game")[0])

    def test_city_editions_known_by_fingerprint_with_their_heading_sizes(self):
        for sha in crb.SHA256[1:]:  # their first pages name no core rulebook
            self.assertIs(identify({"sha256": sha}, "CITY EDITION")[0], crb)
        self.assertEqual(sorted(crb.HEADING_LEVELS.values()), [1, 2, 3, 4, 5])

    def test_footnote_mark_left_out_of_a_name(self):
        cat = catalog.Catalog(crb.ID, "crb", crb.BOOK)
        self.assertEqual(cat.add("weapons", "Zap Whip*", 1)["name"], "Zap Whip")
        self.assertEqual(cat.add("rules", "Glow Up * cannot be bought", 1)["name"], "Glow Up")

    def test_committed_aliases(self):
        self.assertGreaterEqual(len(crb.ALIASES), 39)
        self.assertTrue(all(k == regroup.norm(k) and v == regroup.norm(v) for k, v in crb.ALIASES.items()))


if __name__ == "__main__":
    unittest.main()


class CodeAliasTest(unittest.TestCase):
    def test_a_row_named_by_a_code_takes_its_tables_title(self):
        self.assertEqual(catalog.code_alias("m60", "Zap bombs"), ["Zap bomb m60"])
        self.assertEqual(catalog.code_alias("B25", "Zapcannon Ammunition"), ["Zapcannon B25"])
        self.assertEqual(catalog.code_alias("Zap Gun", "Zappers"), [])
        self.assertEqual(catalog.code_alias("ZX-9", ""), [])

    def test_a_grouped_row_is_named_within_its_group(self):
        self.assertEqual(
            (catalog.group_name("Zorp contracts"), catalog.group_name("Glow patches")), ("Zorp contract", "Glow patch")
        )
        self.assertEqual(
            catalog.grouped_names("Bronze (month)", "Zorp contract"),
            ["Zorp Bronze contract (month)", "Bronze Zorp contract (month)"],
        )
        self.assertEqual(
            catalog.grouped_names("Fizz patch", "Glow patch"), ["Glow Fizz patch"]
        )  # (its own last word once)

    def test_a_split_name_the_book_never_prints_takes_its_printed_short_form(self):
        class Index:  # the book's sentences (invented): the short form only
            def mentions(self, name):
                return [(9, "a Zorp Blaster [Pistol]")] if name.lower() == "zorp blaster" else []

        self.assertEqual(catalog.printed_short("Zorp Mark Blaster", Index()), ["Zorp Blaster"])
        self.assertEqual(catalog.printed_short("Zorp Blaster", Index()), [])  # (two words: nothing to drop)
        self.assertEqual(catalog.printed_short("Zorp Mark Zapper", Index()), [])  # (not printed either way)

    def test_a_placeholder_series_names_its_models(self):
        self.assertEqual(
            catalog.series_models("Zap XX-10 Series", "Formula: Zapbolt (ZB-10) or Quakebolt (QB-10)"),
            ["Zap ZB-10", "Zap QB-10"],
        )
        self.assertEqual(catalog.series_models("Zap Ten", "ZB-10"), [])
