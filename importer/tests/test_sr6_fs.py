"""SR6 Firing Squad recipe (importer/sr6/recipes/fs.py) on a made-up book.md in the converter's sr6 shape (the book's:
an item's heading, its text and a stat box titled with its name). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, fs, identify

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 10 -->
# WEAPONS RACK
## Melee Weapons
### Blades
#### Zap Knife
A made-up knife that zaps.
##### zap knife
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Blade | 2P | 7/—/—/—/— | 2(L) | 150¥ |
## Ranged Weapons
### Rifles
#### Glow Rifle Mk II
A made-up rifle that glows.
##### glow rifle
| TYPE | DV | MODE | ATTACK | RATINGSAMMOAVAIL | COST |
|---|---|---|---|---|---|
| Rifle | 5P | SA/BF | 3/9/11/7/2 | 24(c) 4(L) | 3,300¥ |
**Note:** Includes a made-up glow.
## Ammo
#### Fizz Rounds
Made-up rounds that fizz.
##### fizz rounds
| DV | ATTACK RATING | AVAIL | COST |
|---|---|---|---|
| +1 | –1 | 2(L) | x3 |
<!-- page 40 -->
# SUIT UP
### Puff Jacket
A made-up jacket, puffy.
##### puff jacket
| DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| +3 | –1 | 6 | 3 | 900¥ |
### Layer Suit
A made-up suit in layers.
##### Layer Suit
| TYPE | DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Light | +4 | –2 | 8 | 4(L) | 4,000¥ |
| Heavy | +6 | –4 | 10 | 6(L) | 9,000¥ |
### Card House
The Card House sells the Jack of Dice and the Queen of Cups.
### Zing Shield
A made-up shield that zings, with a coach horn.
##### Zing Shield
| DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| +2 | — | 2 | 3 | 3,000¥ |
#### Rail Line
The made-up Rail Line comes in Coach and Sleeper editions.
| TYPE | DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Coach | +2 | –1 | 2 | 1 | 200¥ |
| Sleeper | +2 | +2 | 2 | 2 | 500¥ |
## Accessories and Modifications
### Stacking
Made-up stacking.
| TYPE | DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Jack of Dice | +3 | +2 | 6 | 4 | 1,000¥ |
| Extras: None |  |  |  |  |  |
| Queen of Cups | +4 | +3 | 8 | 5 | 1,500¥ |
**Extras:** Pocket Patch
### Pocket Patch
A made-up patch with a pocket.
### Glow Lining
A made-up lining that glows.
##### ARMOR ACCESSORIES AND MODIFICATIONS
| GEAR | CAPACITY | AVAILABILITY | COST |
|---|---|---|---|
| Pocket Patch | [1] | 2 | 60¥ |
| GEAR | CAPACITY | AVAILABILITY | COST |
|---|---|---|---|
| Glow Lining | [2] | 3 | 120¥ |
## Weapon Modifications
### Grip Tape
A made-up tape for a grip.
##### grip tape
| AVAIL | COST |
|---|---|
| 1 | 25¥ |
<!-- page 80 -->
# HONING YOUR EDGE
## Made-Up Martial Art
Kick in a made-up way.
### Traditional Martial Arts
#### Glow Fist
A made-up style of punching.
Similar Styles: Made Boxing
Category: Mobility, Striking
Signature Technique: Glow Jab
## Martial Art Techniques
#### Glow Jab
Jab in a made-up way. **Category:** Striking; may only be
used with glowing **Catego-**
#### Glow Kick
Kick glowingly. **Catego-**
**ry:** Striking
#### Glow Leap
Leap and kick glowingly. **Category:** Striking; requires the Glow Kick technique
#### Glow Step
Gain a made-up edge against near _or_ far zaps (choose which kind when learning this technique). This technique may
be taken up to twice in order to gain both the near and the far bonus. **Category:** Mobility
#### Hum Palm
If the adept has the Hum Touch power active, the palm hums. **Category:** Striking; requires
Hum Touch
<!-- page 120 -->
# VIOLENT ENDS
## Game Information
### Twitchy
You twitch in a made-up way.
**Bonus:** 3 Karma
**Game Effect:** Made-up twitches.
### Jitters
You jitter in a made-up way.
**Bonus:** Often: 8 Karma; Seldom: 4
Karma; Never: 2 Karma
**Game Effect:** Made-up jitters.
### Fussy
#### (Habit, 1 to 4)
**Bonus:** 2 Karma per level
**Game Effect:** Made-up fuss.
You fuss in a made-up way.
<!-- page 130 -->
# FIGHTING FORCES
## Corporate Security Forces
### Made Star
#### Door Basher
##### (Professional Rating 4)
A made-up guard who bashes doors.
##### door basher
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 5 | 4 | 4 | 5 | 3 | 2 | 3 | 2 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 9 | 7/1 | A1, I2 | 11 | 10/15/+1 |
**Skills:** Athletics 3, Close Combat 4
<!-- page 150 -->
## weapon & armor stats
| ITEM | DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Puff Jacket | +3 | –1 | 6 | 3 | 900¥ |
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, fs.ALIASES, name_headers=fs.NAME_HEADERS, end_page=150)
    return fs.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class FsRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def test_weapons_from_their_boxes_merged_headers_split(self):
        w = entries(self.res, "weapons")
        self.assertEqual(w["Zap Knife"], {"id": "zap-knife", "source": "FS", "page": "9", "category": "Blades", "skill": "Close Combat", "spec": "Blades",
                                          "type": "Blade", "dv": "2P", "ar": "7/—/—/—/—", "avail": "2(L)", "cost": "150"})
        r = w["Glow Rifle Mk II"]  # its box titled shorter than its heading
        self.assertEqual((r["category"], r["ar"], r["ammo"], r["avail"], r["cost"]), ("Rifle", "3/9/11/7/2", "24(c)", "4(L)", "3300"))
        self.assertEqual(w["Grip Tape"]["category"], "Weapon modifications")
        self.assertFalse(any(n.startswith("*") for n in w))

    def test_ammo_armor_and_modifications(self):
        # (priced as a multiple of the ammunition: an ammunition type, catalog.ammo_type)
        self.assertEqual(entries(self.res, "ammotypes")["Fizz Rounds"]["category"], "Ammo")
        a = entries(self.res, "armor")
        self.assertEqual({k: a["Puff Jacket"][k] for k in ("category", "defense", "capacity", "cost")},
                         {"category": "Armor", "defense": "+3", "capacity": "6", "cost": "900"})
        self.assertEqual((a["Layer Suit (Light)"]["defense"], a["Layer Suit (Heavy)"]["cost"]), ("+4", "9000"))
        # its SOCIAL column: the social attribute, as printed
        self.assertEqual((a["Puff Jacket"]["social"], a["Layer Suit (Heavy)"]["social"], a["Card House (Jack of Dice)"]["social"]),
                         ("–1", "–4", "+2"))
        self.assertEqual((a["Pocket Patch"]["category"], a["Glow Lining"]["capacity"]), ("Armor modifications", "[2]"))
        # a suit table printed in the next section's text: back to the section naming its rows, its Extras rows folded
        self.assertEqual((a["Card House (Jack of Dice)"]["cost"], a["Card House (Queen of Cups)"]["defense"]), ("1000", "+4"))
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("**Extras:** Pocket Patch", texts[("armor", "card-house-queen-of-cups")])
        self.assertNotIn("Jack of Dice", texts[("rules", "stacking")])
        # a box titled as its heading: one armor entry with the heading's text, no rule of its own; a TYPE table in an
        # item's own text naming its rows (`comes in Coach and Sleeper`): its own variants, never an earlier section's
        self.assertEqual((a["Zing Shield"]["defense"], a["Rail Line (Coach)"]["cost"], a["Rail Line (Sleeper)"]["social"]), ("+2", "200", "+2"))
        self.assertIn("shield that zings", texts[("armor", "zing-shield")])
        self.assertNotIn("Zing Shield", {e.findtext("name") for e in ET.fromstring(self.res.files["rules.xml"])})
        self.assertEqual(len(a), 10)  # the reprinted stats at the back are left out

    def test_qualities_npcs_and_rules(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Twitchy"]["kind"], q["Twitchy"]["karma"]), ("negative", "3"))
        self.assertEqual((q["Jitters"]["karma"], q["Jitters"]["karmaMax"]), ("2", "8"))  # its prices wrap a line
        self.assertNotIn("karmaMax", q["Twitchy"])
        self.assertEqual((q["Fussy"]["karma"], q["Fussy"]["perLevel"], q["Fussy"]["maxLevel"]), ("2", "true", "4"))
        n = entries(self.res, "npcs")["Door Basher"]
        self.assertEqual((n["rating"], n["group"], n["bod"], n["dr"]), ("4", "Made Star", "5", "9"))
        r = entries(self.res, "rules")
        self.assertIn("Made-Up Martial Art", r)
        self.assertNotIn("Pocket Patch", r)  # its text went to the modification
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("patch with a pocket", texts[("armor", "pocket-patch")])
        self.assertIn("rifle that glows", texts[("weapons", "glow-rifle-mk-ii")])

    def test_martial_arts(self):
        s = entries(self.res, "martialarts")["Glow Fist"]
        self.assertEqual((s["categories"], s["signature"]), ("Mobility, Striking", "Glow Jab"))
        t = entries(self.res, "martialtechniques")
        self.assertEqual((t["Glow Jab"]["category"], t["Glow Kick"]["category"]), ("Striking", "Striking"))
        texts = {(x.get("of"), x.get("id")): x.text for x in ET.fromstring(self.res.texts)}
        self.assertIn("Similar Styles:** Made Boxing", texts[("martialarts", "glow-fist")])
        # the prerequisites its category line prints: the kind from its word, else from the technique's own text
        req = {e.findtext("name"): [(r.get("kind"), r.text) for r in e.iter("requires")]
               for e in ET.fromstring(self.res.files["martialtechniques.xml"])}
        self.assertEqual((req["Glow Leap"], req["Hum Palm"], req["Glow Jab"]),
                         ([("technique", "Glow Kick")], [("adeptpower", "Hum Touch")], []))
        self.assertEqual(t["Glow Leap"]["category"], "Striking")
        # learned near or far, up to twice: an entry each, the printed heading their search name
        mt = {e.findtext("name"): e for e in ET.fromstring(self.res.files["martialtechniques.xml"])}
        self.assertEqual([(n, mt[n].get("id"), mt[n].get("category"), [a.text for a in mt[n].iter("alias")])
                          for n in mt if n.startswith("Glow Step")],
                         [("Glow Step (Near)", "glow-step-near", "Mobility", ["Glow Step"]),
                          ("Glow Step (Far)", "glow-step-far", "Mobility", ["Glow Step"])])

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(fs.match({"sha256": fs.SHA256[0]}, ""), 1.0)
        self.assertEqual(fs.match({"sha256": "x", "title": "Shadowrun: Firing Squad (Core Combat Rulebook)"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": "Shadowrun: Firing Squad"}, BOOK_MD[:4000])[0], fs)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
