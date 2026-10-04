"""SR6 core rulebook recipe (importer/sr6/recipes/crb.py) on a made-up book.md in the converter's sr6 shape, regrouped
with the recipe's aliases and name headers. Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

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
<!-- page 41 -->
# CHARACTER CREATION
Creation intro.
## Picking Priorities
Pick made-up priorities.
| PRIORITY | METATYPE | ATTRIBUTES | SKILLS | MAGIC OR RESONANCE | RESOURCES |
|---|---|---|---|---|---|
| A | Glimmerkin (13), Stonefolk (11) | 24 | 32 | Full: 4 Magic, Mystic Adept: 4 Magic, Adept: 4 Magic, Technomancer: 4 Resonance | 450,000¥ |
| E | Glimmerkin (1) | 2 | 2 | — | 8,000¥ |
## Metatypes
| METATYPE | BOD | AGI | REA | STR | WIL | LOG | INT | CHA | EDG |
|---|---|---|---|---|---|---|---|---|---|
| Glimmerkin | 1–6 | 1–7 | 1–6 | 1–5 | 1–6 | 1–6 | 1–6 | 1–7 | 1–7 |
| Racial Qualities: Glowing Skin, Night Eyes | | | | | | | | | |
## Qualities
### Positive Qualities
#### Lucky Streak (1 to 3)
• **Cost:** 4 Karma per level
Invented luck, a little at a time.
### Negative Qualities
#### Butterfingers
**Bonus:** 6 Karma
Drops made-up things.
## Contacts
Contact rules.
#### Fixer Fred
**Connection:** 4
**Loyalty:** 2
A made-up fixer.
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
### Combat Spells
#### Zap Bolt
##### (Direct, Area)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | P | I | 3 |
Zap bolt text.
## Rituals
### Glow Circle
##### Keywords: Anchored, Spell
##### Threshold: 4
Glow circle text.
## Adept Powers
#### Quick Feet
**Cost:** 0.5 PP per level
**Activation:** Minor Action
Fast feet text.
## Metamagics
#### Bright Aura
Aura text.
<!-- page 171 -->
# MATRIX
Matrix intro.
## Complex Forms
#### Static Fizz
**Duration:** Sustained
**Fade:** 3
Static text.
## Echoes
#### Quick Think
Echo text.
## Sprites
#### Gadget Sprite
| ATTACK | SLEAZE | DATA PROCESSING | FIREWALL | INITIATIVE |
|---|---|---|---|---|
| L | L+1 | L+2 | L | (L×2)+1 |
**Skills:** Hacking, Electronics
**Powers:** Zap.
Sprite text.
## Matrix Actions
### Poke Host
##### Major Action
Poking text.
<!-- page 201 -->
# WILD LIFE
Wild intro.
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
## Spirits
#### Spirit of Fizz
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| F | F+1 | F | F-1 | F | F | F | F | F |
**Powers:** Fizzing.
Fizz spirit text.
## Critter Powers
#### Glimmer
**Type:** P
**Action:** Minor
**Range:** Self
**Duration:** Always
Glimmer text.
<!-- page 221 -->
# RUNNING THE GAME
GM intro.
## Grunts
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
## Tools
#### kits
| ITEM | RATING | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Gizmo Kit | 1–6 | — | 2 | Rating x 100 |
#### Gizmo Kit
A kit of made-up gizmos.
## Bioware
#### glands
| AUGMENTATION | RATING | ESSENCE | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Glow Gland | 1–3 | 0.2 | — | 4 | 2,000¥ |
#### Glow Gland
A made-up gland.
## Vehicles
#### bikes
| VEHICLE | HAND | ACCEL | SPEED INTERVAL | TOP SPEED | BODY | ARMOR | PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Zoom Bike | 4/3 | 15 | 20 | 160 | 5 | 4 | 1 | 1 | 1 | 2 | 8,000¥ |
#### Zoom Bike
A made-up bike.
## Lifestyles
### Shoebox
##### Cost: 200¥ a month
Tiny made-up rooms.
"""
ALIASES = {"zapp rifle": "zap rifle"}  # a made-up spelling difference


def run_recipe(md=BOOK_MD):
    regrouped, report = regroup.regroup(md, ALIASES, name_headers=crb.NAME_HEADERS)
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
                  "critterpowers": "Glimmer", "critters": "Fuzzbeast", "spirits": "Spirit of Fizz",
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
        self.assertEqual((a["type"], a["category"], a["essence"], a["capacity"]), ("bioware", "glands", "0.2", "—"))
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
        self.assertEqual(entries(self.res, "lifestyles")["Shoebox"].get("cost"), "200 a month")
        self.assertEqual(entries(self.res, "contacts")["Fixer Fred"].get("loyalty"), "2")
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
        self.assertEqual((sp.get("data"), sp.get("init"), sp.findtext("skills")), ("L+2", "(L×2)+1", "Hacking, Electronics"))
        self.assertEqual(entries(self.res, "spirits")["Spirit of Fizz"].get("category"), "spirit")

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
        self.assertEqual(texts[("weapons", "zap-gun")], "A made-up gun that zaps.")
        self.assertIn("**Cost:** 4 Karma per level", texts[("qualities", "lucky-streak")])
        self.assertIn("| ROLL | RESULT |", texts[("rules", "making-trouble")])
        self.assertEqual(texts[("critters", "fuzzbeast")], "A made-up beast, mostly fuzz.")  # the lists aren't prose

    def test_priority_and_metatype(self):
        a = entries(self.res, "priorities")["Priority A"]
        self.assertEqual(a.get("letter"), "A")
        self.assertEqual([(m.get("name"), m.get("points")) for m in a.iter("metatype")], [("Glimmerkin", "13"), ("Stonefolk", "11")])
        self.assertEqual([(m.get("kind"), m.get("rating")) for m in a.iter("magic")],
                         [("full", "4"), ("mystic-adept", "4"), ("adept", "4"), ("technomancer", "4")])
        self.assertEqual((a.find("attributes").get("points"), a.find("resources").get("nuyen")), ("24", "450000"))
        e = entries(self.res, "priorities")["Priority E"]
        self.assertEqual([m.get("kind") for m in e.iter("magic")], ["mundane"])
        g = entries(self.res, "metatypes")["Glimmerkin"]
        self.assertEqual(len(g.findall("range")), 9)
        self.assertEqual((g.find("range").get("attr"), g.find("range").get("min"), g.find("range").get("max")), ("bod", "1", "6"))
        self.assertEqual([t.text for t in g.iter("trait")], ["Glowing Skin", "Night Eyes"])

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

    def test_committed_aliases(self):
        self.assertGreaterEqual(len(crb.ALIASES), 39)
        self.assertTrue(all(k == regroup.norm(k) and v == regroup.norm(v) for k, v in crb.ALIASES.items()))



if __name__ == "__main__":
    unittest.main()
