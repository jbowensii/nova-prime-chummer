"""SR6 core rulebook recipe (importer/sr6/recipes/crb.py) on a made-up book.md in the converter's sr6 shape, regrouped
with the recipe's aliases and name headers. Every name, number and line is invented."""
import os
import re
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
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
<!-- page 81 -->
# Archetypes
<!-- page 82 -->
## Glow Runner
A made-up runner who glows.
##### metatype: glimmerkin
| B | A | R | S | W | L | I | C | EDG | M | ESS |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 5(6) | 4 | 2 | 3 | 2 | 4 | 3 | 4 | 4 | 6 |
**Initiative/Actions:** 8 + 2D6/1 Major, 3 Minor
**Defense Rating:** 5
**Active Skills:** Tinkering 3 (Gizmos +2), Basket Weaving 2
**Knowledge Skills:** Glow Lore, Puddle Streets
**Languages:** Plainspeak (Native), Glimmertongue
**Qualities:** Lucky Streak 2, Butterfingers, Steady Hands (glimmerkin trait), Night Eyes (glimmerkin trait), Odd Quirk
**Adept Powers:** Quick Feet 2, Glow Sense
**Contacts:** Fixer Fred (C3/L2), Glow Dealer C1/L4)
**Lifestyle:** Shoebox (2 months prepaid)
**Augmentations:** Glow Gland 2
**Gear:** Padded Vest, 2 x fake SIN (rating 3; w/ zap license), Gizmo Kit (rating 4), Mystery Box
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
**Specializations:** Gizmos, Clockwork
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
## Matrix Actions
### Poke Host
##### Major Action
Poking text.
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
        expect = {"priorities": "Priority A", "metatypes": "Glimmerkin", "attributes": "Body", "skills": "Tinkering",
                  "qualities": "Lucky Streak", "weapons": "Zap Gun", "armor": "Padded Vest",
                  "augmentations": "Glow Gland", "electronics": "Clunker Deck", "gear": "Gizmo Kit",
                  "vehicles": "Zoom Bike", "spells": "Zap Bolt", "rituals": "Glow Circle", "adeptpowers": "Quick Feet",
                  "complexforms": "Static Fizz", "metamagics": "Bright Aura", "echoes": "Quick Think",
                  "critterpowers": "Glimmer", "critters": "Fuzzbeast", "spirits": "Spirits of Fizz",
                  "npcs": "Corner Goon", "sprites": "Gadget Sprite", "lifestyles": "Shoebox", "contacts": "Fixer Fred",
                  "rules": "Making Trouble"}
        self.assertEqual(set(expect), set(sr6.KINDS) - {"lifemodules"})  # no recipe writes life modules (S2)
        for kind, name in expect.items():
            self.assertIn(name, entries(self.res, kind), kind)

    def test_attributes(self):
        w = entries(self.res, "weapons")["Zap Gun"].attrib
        self.assertEqual(w, {"id": "zap-gun", "source": "CRB", "page": "250", "category": "zappers", "dv": "3P",
                             "modes": "SA", "ar": "8/10/—/—", "ammo": "10(c)", "avail": "2", "cost": "1250"})
        self.assertEqual(entries(self.res, "weapons")["Lost Blaster"].get("avail"), "—")
        a = entries(self.res, "augmentations")["Glow Gland"].attrib
        self.assertEqual((a["type"], a["category"], a["rating"], a["essence"]), ("bioware", "bioware", "1–3", "0.2"))
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
        self.assertEqual((sk.get("attr"), sk.get("untrained"), [x.text for x in sk.iter("spec")]),
                         ("log", "true", ["Gizmos", "Clockwork"]))
        self.assertEqual(entries(self.res, "attributes")["Body"].attrib["abbr"], "BOD")
        self.assertEqual([(n, e.get("cost")) for n, e in entries(self.res, "lifestyles").items()],
                         [("Gutter", "0"), ("Shoebox", "200")])
        self.assertEqual(entries(self.res, "contacts")["Fixer Fred"].get("archetype"), "Fixer Fred")
        self.assertEqual(entries(self.res, "critterpowers")["Glimmer"].get("duration"), "Always")
        self.assertEqual(entries(self.res, "qualities")["Butterfingers"].attrib["kind"], "negative")

    def test_beings(self):
        f = entries(self.res, "critters")["Fuzzbeast"]
        self.assertEqual((f.get("category"), f.get("bod"), f.get("int"), f.get("init"), f.get("move")),
                         ("critter", "4", "3", "7 + 1D6", "10/15/+1"))
        self.assertEqual([c.tag for c in f][1:], ["skills", "powers", "attacks"])
        g = entries(self.res, "npcs")["Corner Goon"]
        self.assertEqual((g.get("rating"), g.get("group"), g.findtext("weapons")), ("2", "Street Crew", "Zap Gun"))
        sp = entries(self.res, "sprites")["Gadget Sprite"]
        self.assertEqual((sp.get("data"), sp.get("init"), sp.findtext("skills"), sp.findtext("powers")),
                         ("L+2", "(L x 2) +1 + 4D6", "Hacking, Electronics", "Zap, Fizz"))  # the band after the text
        sf = entries(self.res, "spirits")["Spirits of Fizz"]
        self.assertEqual((sf.get("category"), sf.get("str"), sf.get("init"), sf.get("dr"), sf.get("cm")),
                         ("spirit", "F–1", "[(F x 2) + 1] + 2D6", "F – 1", "(F/2)+7"))

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
        self.assertEqual([(m.get("name"), m.get("points")) for m in a.iter("metatype")], [("Glimmerkin", "13"), ("Stonefolk", "11")])
        self.assertEqual([(m.get("kind"), m.get("rating")) for m in a.iter("magic")],
                         [("full", "3"), ("mystic-adept", "3"), ("adept", "5"), ("technomancer", "3")])
        self.assertEqual((a.find("attributes").get("points"), a.find("resources").get("nuyen")), ("22", "420000"))
        e = entries(self.res, "priorities")["Priority E"]
        self.assertEqual([m.get("kind") for m in e.iter("magic")], ["mundane"])
        g = entries(self.res, "metatypes")["Glimmerkin"]
        self.assertEqual(len(g.findall("range")), 9)
        self.assertEqual((g.find("range").get("attr"), g.find("range").get("min"), g.find("range").get("max")), ("bod", "1", "6"))
        self.assertEqual([t.text for t in g.iter("trait")], ["Glowing Skin", "Night Eyes"])
        self.assertEqual([t.text for t in entries(self.res, "metatypes")["Plainfolk"].iter("trait")], [])  # "None"
        # printed as a labelled line under the table
        self.assertEqual([t.text for t in entries(self.res, "metatypes")["Stonefolk"].iter("trait")], ["Hard Hide", "Built Big 2"])
        self.assertEqual(list(entries(self.res, "metatypes")), ["Plainfolk", "Glimmerkin", "Stonefolk"])  # no chart rows
        self.assertEqual(list(entries(self.res, "priorities")), ["Priority A", "Priority E"])  # the index left out

    def test_quality_levels(self):
        q = entries(self.res, "qualities")["Lucky Streak"].attrib
        self.assertEqual((q["kind"], q["karma"], q["perLevel"], q["maxLevel"]), ("positive", "4", "true", "3"))
        self.assertEqual(q["id"], "lucky-streak")

    def test_unknown_column_and_book_value(self):
        self.assertEqual([(r["file"], r["column"]) for r in self.rep("unknown-column")], [("weapons.xml", "HEFT")])
        self.assertNotIn("heft", entries(self.res, "weapons")["Zap Gun"].attrib)
        self.assertEqual(entries(self.res, "weapons")["Zapp Rifle"].get("cost"), "12x")
        self.assertEqual([(r["name"], r["field"], r["value"]) for r in self.rep("book-value")], [("Zapp Rifle", "cost", "12x")])

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
        self.assertEqual((n["Fixer Fred"].get("group"), n["Fixer Fred"].get("cha"), n["Fixer Fred"].get("rating")),
                         ("Contact", "5", None))
        c = entries(self.res, "critters")
        self.assertEqual([(k, c[k].get("bod"), c[k].findtext("attacks")) for k in ("Ice Wyrm", "Fire Wyrm")],
                         [("Ice Wyrm", "12", "Bite: DV 9P"), ("Fire Wyrm", "11", "Bite: DV 10P")])
        self.assertEqual(entries(self.res, "spells")["Glow Sense"].get("category"), "detection")
        self.assertEqual(entries(self.res, "adeptpowers")["Glow Sense"].get("cost"), "0.25")
        self.assertEqual(list(entries(self.res, "electronics")), ["Clunker Deck", "Spy Lens"])  # no matrix reprint
        self.assertEqual(list(entries(self.res, "vehicles")), ["Zoom Bike"])  # no look-alike rows
        self.assertNotIn("Patches", entries(self.res, "gear"))
        self.assertEqual(list(entries(self.res, "echoes")), ["Quick Think", "Wide Net"])
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts[("echoes", "wide-net")], "Your made-up net is wider.")
        self.assertEqual(entries(self.res, "qualities")["Steady Hands"].get("karma"), "5")  # a cost in the text

    def test_prices(self):
        """Formula prices are kept for the app to evaluate; rows printing two items split; units go to per."""
        w = entries(self.res, "weapons")
        self.assertEqual([(k, w[k].get("cost")) for k in ("Zip Pistol I", "Zip Pistol II")], [("Zip Pistol I", "300"), ("Zip Pistol II", "350")])
        g = entries(self.res, "gear")
        self.assertEqual((g["Fizz rope"].get("cost"), g["Fizz rope"].get("per")), ("40", "100m"))
        self.assertEqual([(k, g[k].get("cost"), g[k].get("per")) for k in ("Bronze plan (month)", "Bronze plan (year)")],
                         [("Bronze plan (month)", "100", "month"), ("Bronze plan (year)", "1000", "year")])
        lens = entries(self.res, "electronics")["Spy Lens"]
        self.assertEqual((lens.get("cost"), lens.get("capacity"), lens.get("rating")), ("Capacity x 70", "1–4", "1–4"))
        b = entries(self.res, "augmentations")["Brain Fizzer"]  # the rating range printed in the name
        self.assertEqual((b.get("rating"), b.get("cost"), b.get("category")), ("1–4", "Rating^2 x 100", "headware"))
        t = entries(self.res, "augmentations")
        self.assertEqual([(k, t[k].get("cost"), t[k].get("capacity")) for k in ("Tail (synthetic)", "Tail (obvious)")],
                         [("Tail (synthetic)", "9000", "3"), ("Tail (obvious)", "7000", "6")])
        self.assertEqual(entries(self.res, "vehicles")["Zoom Bike"].get("category"), "cars")
        for v in ("Capacity x 70", "Rating^2 x 100", "(Force +3) L", "+500", "(Rating/3)(L)", "100 + (rating x 10)", "—"):
            self.assertTrue(crb.readable(v), v)
        for v in ("12x", "900 + Gizmo", "300/350", "10–900", "Rating^"):
            self.assertFalse(crb.readable(v), v)

    def test_archetypes(self):
        """The archetypes chapter's sample characters: SR6 runner files built from the stat block against the catalog,
        valid against character.xsd, what doesn't map in the notes and the report, no description."""
        self.assertEqual([(s["file"], s["name"], s["role"], s["page"]) for s in self.res.samples],
                         [("crb.glow-runner.xml", "Glow Runner", "Archetype", 81), ("crb.bit-whisperer.xml", "Bit Whisperer", "Archetype", 82)])
        schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, "character.xsd")))
        for s in self.res.samples:
            doc = etree.fromstring(s["xml"].encode("utf8"))
            self.assertTrue(schema.validate(doc), f"{s['file']}: {schema.error_log.last_error}")
            self.assertNotIn("A made-up", s["xml"])  # the description stays in the book
        g = ET.fromstring(self.res.samples[0]["xml"])
        b = g.find("build")
        self.assertEqual((g.get("id"), g.get("streetName"), g.get("metatype"), b.get("magic")), ("crb.glow-runner", "Glow Runner", "crb.glimmerkin", "adept"))
        self.assertEqual({a.get("id"): a.get("points") for a in b.iter("attribute")},
                         {"bod": "2", "agi": "4", "rea": "3", "str": "1", "wil": "2", "log": "1", "int": "3", "cha": "2", "edg": "3", "mag": "4", "res": "0"})
        self.assertEqual([(x.get("id"), x.get("points"), x.get("spec")) for x in b.iter("skill")], [("crb.tinkering", "3", "Gizmos")])
        self.assertEqual([(x.text, x.get("kind"), x.get("native")) for x in b.iter("knowledge")],
                         [("Glow Lore", "knowledge", None), ("Puddle Streets", "knowledge", None), ("Plainspeak", "language", "true"), ("Glimmertongue", "language", None)])
        self.assertEqual([(x.get("id"), x.get("level"), x.get("free")) for x in b.iter("quality")],
                         [("crb.lucky-streak", "2", None), ("crb.butterfingers", "1", None), ("crb.steady-hands", "1", "true")])
        self.assertEqual([(x.get("kind"), x.get("id"), x.get("level")) for x in b.iter("pick")],
                         [("adeptpowers", "crb.quick-feet", "2"), ("adeptpowers", "crb.glow-sense", None)])
        self.assertEqual([(x.get("name"), x.get("connection"), x.get("loyalty")) for x in b.iter("contact")], [("Fixer Fred", "3", "2"), ("Glow Dealer", "1", "4")])
        self.assertEqual((b.find("lifestyle").get("id"), b.find("lifestyle").get("months")), ("crb.shoebox", "2"))
        self.assertEqual([(x.get("kind"), x.get("id"), x.get("rating"), x.get("worn")) for x in b.iter("purchase")],
                         [("armor", "crb.padded-vest", None, "true"), ("gear", "crb.gizmo-kit", "4", None),
                          ("augmentations", "crb.glow-gland", "2", None), ("vehicles", "crb.zoom-bike", None, None), ("weapons", "crb.zap-gun", None, None)])
        self.assertEqual([(x.get("kind"), x.get("rating"), [l.get("name") for l in x]) for x in b.iter("sin")],
                         [("fake", "3", ["zap license"]), ("fake", "3", ["zap license"])])
        notes = g.findtext("notes")
        for bit in ("Initiative/Actions: 8 + 2D6/1 Major, 3 Minor", "Starting Nuyen: 1,234¥", "Augmented as printed: AGI 5(6).",
                    "Skills not in the catalog: Basket Weaving 2.", "Qualities not in the catalog: Night Eyes (glimmerkin trait); Odd Quirk.",
                    "Gear not in the catalog: Mystery Box.", "Weapons not in the catalog: Odd Sword [Blade, DV 3P, 9/—/—/—/—]."):
            self.assertIn(bit, notes)
        self.assertEqual([(r["name"], r["field"], r["value"]) for r in self.rep("unmatched-item")][:2],
                         [("Glow Runner", "Skills", "Basket Weaving 2"), ("Glow Runner", "Qualities", "Night Eyes (glimmerkin trait)")])
        t = ET.fromstring(self.res.samples[1]["xml"])
        tb = t.find("build")
        self.assertEqual((tb.get("magic"), tb.find("skill").get("expertise"), tb.find("pick").get("id"), tb.find("lifestyle").get("months")),
                         ("technomancer", "Clockwork", "crb.static-fizz", "1"))
        self.assertIn("Resonance isn’t printed", t.findtext("notes"))
        # the golden file the app's tests read (tests/fixtures/sr6/sample-glow-runner.xml): the same but its date
        golden = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "sr6" / "sample-glow-runner.xml"
        self.assertEqual(re.sub(r'updatedAt="[^"]+"', "", self.res.samples[0]["xml"]),
                         re.sub(r'updatedAt="[^"]+"', "", golden.read_text(encoding="utf8")))

    def test_nothing_unmapped(self):
        self.assertEqual(self.rep("unmapped"), [])
        self.assertEqual(self.rep("missing-value"), [])
        self.assertEqual(self.rep("duplicate-id"), [])

    def test_match(self):
        self.assertEqual(crb.match({"sha256": crb.SHA256[0]}, ""), 1.0)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.9)
        self.assertEqual(crb.match({"sha256": "x", "title": "Shadowrun Anarchy 2.0 Alternative Core Rulebook"},
                                   "# Shadowrun Anarchy\nAlternative Core Rulebook"), 0.0)
        self.assertIs(identify({"sha256": "x"}, BOOK_MD[:4000])[0], crb)
        self.assertIsNone(identify({"sha256": "x"}, "# Some Other Game")[0])

    def test_city_editions_known_by_fingerprint_with_their_heading_sizes(self):
        for sha in crb.SHA256[1:]:  # their first pages name no core rulebook
            self.assertIs(identify({"sha256": sha}, "CITY EDITION")[0], crb)
        self.assertEqual(sorted(crb.HEADING_LEVELS.values()), [1, 2, 3, 4, 5])

    def test_footnote_mark_left_out_of_a_name(self):
        cat = crb._Catalog()
        self.assertEqual(cat.add("weapons", "Zap Whip*", 1)["name"], "Zap Whip")
        self.assertEqual(cat.add("rules", "Glow Up * cannot be bought", 1)["name"], "Glow Up")

    def test_committed_aliases(self):
        self.assertGreaterEqual(len(crb.ALIASES), 39)
        self.assertTrue(all(k == regroup.norm(k) and v == regroup.norm(v) for k, v in crb.ALIASES.items()))



if __name__ == "__main__":
    unittest.main()
