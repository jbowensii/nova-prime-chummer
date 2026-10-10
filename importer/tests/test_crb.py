"""CRB recipe: spells from made-up boxes in the converter's shape, and (gated) parity with the oracle
captured before the importer existed."""
import unittest
from collections import Counter
import xml.etree.ElementTree as ET
from pathlib import Path

from importer import statblock
from importer.recipes import crb, identify

# Invented spells, laid out as the converter prints the CRB's spell boxes: a one-cell table titled
# "<FAMILY> SPELLS" whose lines are <br>-separated, two text columns interleaved, the chapter's margin
# tab letters as lone lines or glued to a line's ends, "�" for a period, names wrapping onto the
# second line, and grouped names ("A / B*") sharing one row. The printed page is the PDF page - 2.
MD = """<!-- page 12 -->
**SHADOWRUN**
Prose that names the Glimmer Sight spell in passing.
| DETECTION SPELLS |
|---|
| Made-up intro to the box� Left column text Right column text<br>SPELL TYPE THRESHOLD NOTES<br>Glimmer Sight Detection (analysis, I) 2 Invented notes for the spell�<br>A<br>Know Detection 4 Tells the caster tomorrow’s weather� N<br>Weather (enhancement, S) more notes here�<br>W<br>d Odd Hunch Detection 0 Hits determine nothing�<br>(enhancement, S)<br>**Area-based threshold:** 0 for a made-up rule� |
**10**
<!-- page 13 -->
| d COMBAT SPELLS |
|---|
| SPELL TYPE THRESHOLD OR NOTES<br>OPPOSING POOL<br>Frost Kiss / Combat Area-based On a hit, invented damage:<br>L<br>Ember Kiss* (direct, I) • **DV:** made up<br>r<br>Zap / Combat Athletics Invented notes<br>Big Zap / (indirect, I) more notes<br>E Small zap* Close Combat • **Zap:** a made-up effect<br>A * Frost Kiss, Ember Kiss, Zap, Big Zap and Small zap are different spells� |
| NOT A SPELL BOX |
|---|
| SPELL TYPE THRESHOLD NOTES<br>Fake Row Detection 3 Ignored� |
**11**
"""


class SpellsTest(unittest.TestCase):
    def setUp(self):
        self.res = crb.extract(MD)
        self.items = [(e.get("id"), e.get("kind"), e.get("category"), e.get("source"), e.get("page"), e.find("name").text)
                      for e in ET.fromstring(self.res.files["spells.xml"])]

    def test_spells(self):
        self.assertEqual(self.items, [
            ("spell-glimmer-sight", "spell", "detection", "CRB", "10", "Glimmer Sight"),
            ("spell-know-weather", "spell", "detection", "CRB", "10", "Know Weather"),
            ("spell-odd-hunch", "spell", "detection", "CRB", "10", "Odd Hunch"),
            ("spell-frost-kiss", "spell", "combat", "CRB", "11", "Frost Kiss"),
            ("spell-ember-kiss", "spell", "combat", "CRB", "11", "Ember Kiss"),
            ("spell-zap", "spell", "combat", "CRB", "11", "Zap"),
            ("spell-big-zap", "spell", "combat", "CRB", "11", "Big Zap"),
            ("spell-small-zap", "spell", "combat", "CRB", "11", "Small zap"),
        ])

    def test_overlay_keeps_texts_out(self):
        for e in ET.fromstring(self.res.files["spells.xml"]):
            self.assertEqual(e.find("text").text or "", "")

    def test_texts_hold_the_row_without_margin_letters(self):
        texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts["spell-know-weather"],
                         "Detection 4 Tells the caster tomorrow’s weather. (enhancement, S) more notes here.")
        self.assertEqual(texts["spell-odd-hunch"], "Detection 0 Hits determine nothing. (enhancement, S)")
        self.assertEqual(texts["spell-ember-kiss"], texts["spell-frost-kiss"])  # a group shares its row

    def test_source(self):
        self.assertEqual(self.res.source, {"id": "CRB", "name": crb.NAME, "publisher": "Catalyst Game Labs", "canon": True})


class FurnitureTest(unittest.TestCase):
    def test_real_words_survive(self):
        lines = ["Oracle of the made-up kind", "Lore about nothing", "A spell of invented use", "I made this up",
                 "Detection 4 An invented note", "Eerie hum"]
        self.assertEqual(crb._furniture(lines), lines)

    def test_tab_letters_go(self):
        self.assertEqual(crb._furniture(["W", "d Odd Hunch Detection 0", "A * Made-up footnote", "Some notes N"]),
                         ["Odd Hunch Detection 0", "* Made-up footnote", "Some notes"])


    def test_other_chapters_tabs(self):
        self.assertEqual(crb._furniture(["I Tests; more", "I made this", "v", "u **Name:** words"], "vIrTuALWOd"),
                         ["Tests; more", "I made this", "**Name:** words"])


# Invented Amps and gear, laid out as the converter (v5) prints the CRB's equipment boxes: a one-cell table
# per box, bold run-in names "**Name:** (paren) effects", lines <br>-separated, "�" for a period, words
# hyphenated at a line's end, the chapter's margin tab letters (MUNDANE / AWAKENED / VIRTUAL / MECHANICAL
# WORLD) as lone lines or glued to a line's start, and a paren the layout pushed before its name.
AMPS_MD = """<!-- page 140 -->
| MADE UP GEAR SELECTION |
|---|
| A few **examples** of made-up gear�<br>**Glow stick:** (Equipment, 2,500¥) makes a dim light�<br>**Zoom goggles:** (Rating 9 Equipment<br>M<br>Amp, 27,500¥) RR 1 on Perception (watching) and Stealth<br>u (physical) Tests; night vision� |
| ZAP GUN AMPS |
|---|
| **Zapper X:** (taser, Rating 7 Equipment Amp, 27,500¥) DV 5; range [OK/<br>OK/Dis�/–]; RR 1 on Ranged Weapons (handguns) Tests� N<br>**Buzz blade:** (stun baton, Rating 3 Equipment Amp, 7,500¥) DV 6; range [OK/–/Dis�/–]; glows� |
| PADDED WEAR AMPS |
|---|
| **Padded vest:** (Rating 4 Equipment Amp, 12,500¥) Armor 2, RR 1 on Influence (manners) Tests� |
| MADE UP TOXINS |
|---|
| Some prose� **Sleepdust** and **Nod** are always equipment that needs an Edge� |
**138**
<!-- page 157 -->
| MADE UP HEADWARE |
|---|
| **Brain box:** (Rating 10, Cyberware Amp, Essence -1, 55,000 ¥) RR 1 on all Logic-<br>based Tests�<br>**Jack plug:** (Rating 5 Cyberware Amp, Essence -1, 20,000¥) Socket for a cable; cold-<br>sim VR; lets you jump into vehicles� |
| MADE UP CONTACTS |
|---|
| **Fence:** (Rating 4 Contact Amp, 10,000¥) RR 1 on Network (gutter) Tests�<br>(Rating 7 Contact Amp, 20,000¥) RR 1<br>**Night clerk:**<br>on Network (gutter and underworld) Tests� |
**155**
<!-- page 176 -->
| FOLLOWING A MADE UP SPIRIT |
|---|
| **Owl:** (Rating 7 Quality Amp, 20,000¥) RR 1 on Perception (watching), Stealth (physical), or Sorcery (glamour) Tests (choose 2 out of the 3)�<br>**Watchful (disposition):** Made up�<br>**Similar Archetypes:** Night, Wisdom<br>**Glow Fist:** (Rating 6 Adept power Amp, 15,000¥) DV +2 on unarmed attacks� |
**174**
<!-- page 212 -->
| CYBERDECKS AND MADE UP PROGRAMS |
|---|
| **Echo:** (narrative effect, Amp Rating +2) repeats things�<br>**Toy deck:** (Rating 11 Cyberdeck Amp, 30,000¥)<br>Firewall 2; Attack 2; RR 1 on Cracking (battering)<br>I Tests� |
**210**
<!-- page 240 -->
| MADE UP VEHICLES |
|---|
| **Hover sled:** (Rating 8 Vehicle Amp, 20,000¥) Pilot 5, Body 6, Handling 1, Speed 12, Armor 2; flying�<br>**Sports Car:** (Rating 2 Vehicle Amp, 6,500¥) Pilot 5, Body 4, Handling 3, Speed 7, Armor 0�<br>**Big Van:** Pilot 5, Body 9, Handling 2, Speed 2, Armor 9�<br>**Nurse bot:** (Rating 6 Drone Amp, 15,000¥) Small drone, Pilot 7, stationary�<br>C<br>**Tiny Scout:** (Rating 2 Drone Amp, 6,500¥) Pilot 5, Body 1, Handling 9, Speed 1 (Flying 2), Armor 0; no weapon mount� |
**238**
"""


# An invented runner laid out as the converter (v6) prints the CRB's pregens: a story page (the name in small caps,
# the role in bold on two lines), then a stat page: attribute labels with the values detached (the first two on the
# AGILITY and STRENGTH lines: Edge 3, Charisma 2; then Logic 3, Willpower 2, Agility 4, Strength 3), skill rows
# plain and as 4-cell pipe rows, a spec with two attributes, amps "**Name (type)** [Essence] Rating", weapons and
# spells in one list, equipment and threshold rows sharing lines (one wrapped), small-caps keywords and cues.
# Plus a character creation example box (p.85, with its margin tab letters) whose prose builds a second runner.
PREGEN_MD = """<!-- page 87 -->
| CHARACTER CREATION EXAMPLE |
|---|
| Ann wants Spark, her character, to be a made-up elf mage� She chose as Keywords: Elf, Test mage, and Low life-<br>style� For her Dispositions, she chose: Quiet, Bold, which she gets from Owl, and Kind�<br>She decides to take: Strength 2, Agility 3, Willpower 4 (max rating), Logic 2, Charisma 3� G<br>A<br>She takes Sorcery 5 (glamour +2) and Stealth 3, then Network 2 (gutter +2)�<br>For her Awakened abilities, she spends 6 points (3 for astral perception and projection, 2 for sorcery)� She picks Owl as a mentor spirit at rating 4 (base rating 1 for the first quality, 3 for Risk Reduction 1 on Sorcery (glamour) Tests)� She picks a sustaining focus, a rating 2 Amp (0 for the equipment, and 1 to sustain up to 1 additional spells)�<br>The next 4 points are used for one contact: Old Pal, a made-up fixer (Risk Reduction 1 for Network (gutter) Tests)� She wears an armor jacket (Armor 3) and carries a traditional knife (standard weapon)� She decides to increase Stealth from 3 to 4� Then she adds some reagents� Finally, she picks up her 2 spells: Glimmer, her favorite; and Zap� |
**85**
<!-- page 90 -->
**SHADOWRUN**
S
N
**88**
TeST RiGGER
**Made-up rigger,**
**male troll**
Invented story prose about the runner.
<!-- page 91 -->
ger
T e
EDGE
CHARISMA
LOGIC
WILLPOWER
AGILITY 3
STRENGTH 2
3
2
4
3
ESSENCE: 3.5
SKILLS RATING +ATT. = DP RR
**Athletics** 2 STR **5**
(dodging +2) WIL **6**
| **Close Combat** | 1 | STR | **4** |
|---|---|---|---|
| (grappling +2) |  | STR | **6** |
**Engineering** 3 LOG **6**
(welding) AGI **7**
| **Stealth** | 2 | AGI | **6** |
|---|---|---|---|
| (lock work +2) |  | LOG/AGI | **7/8** |
**Piloting** 5 AGI **9**
KNOWLEDGE SKILLS
Made-up lore, Toy trains
SHADOW AMPS ESSENCE RATING
**Toy Jack (cyberware)** 1.25 7
Head socket; cold- and hot-sim VR
**Toy Arm with a Heavy pistol (cyberware)** 1.25 7
RR 1 on Ranged Weapons (handguns) Tests
**Rusty Sedan (vehicle)** 4
Sedan: Pilot 5, Body 7, Handling 3, Speed 3, Armor 1
Gun on the roof
**2 Buzz Copter (drones)** 7
Flying Drone: Pilot 5, Body 2, Handling 8, Speed 6, Armor 0
**Old Pal, fixer (contact)** 4
RR 1 on Tests for Network (gutter) Tests
**Jolt (equipment)** 3
Chip: DV +1 in melee� RR 1 on Close Combat Tests
Disadvantage on all their other
Tests
WEAPONS & SPELLS TYPE
**Unarmed** DV 3 [OK/–/–/–] Weapon
**Unarmed** (astral only) DV 4 [OK/–/–/–] Weapon
**2 x Wrench** (club) DV 5 [OK/–/–/–] Weapon
**Zap Pistol** (heavy pistol) DV 5 [OK/OK/Dis�/–] (Rusty Sedan) Weapon
**Za** p (combat spell, physical) Spell
**2 × Submachine Gun** DV 5 [Dis�/OK/OK/–] (Buzz Copter) Weapon
**Fizz** (made-up spell, S) Spell
EQUIPMENT WOUNDS
Fake SIN, Commlink, **Thresholds Light Serious Incap�**
Toolkit No armor 3 6 9
Main armor
6 9 12
(Padded Coat 3)
Secondary armor (Clothes 2) 5 8 11
Mental 2 5 8
KEYWORDS
tRoLl
teSt city / DowntOwn
DISPOSITIONS
GrumPy
CUES
i fix it. yOu paY
fOr it.
RISK LEVEL
0 1 die 2 dice 4 dice 6+ dice
"""


class PregensTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = crb.extract(MD + PREGEN_MD)
        cls.block = statblock.crb_statblock(PREGEN_MD.split("<!-- page 91 -->")[1])
        cls.xml = {s["file"]: ET.fromstring(s["xml"]) for s in cls.res.samples}

    def test_stat_page(self):
        b = self.block
        self.assertEqual(b["attributes"], {"cha": 2, "log": 3, "wil": 2, "agi": 4, "str": 3})
        self.assertEqual(b["knowledge"], ["Made-up lore", "Toy trains"])
        self.assertEqual([(s["name"], s["rating"], s["attr"], s["dp"], [(x["name"], x["plus2"], x["attr"], x["dp"]) for x in s["specs"]])
                          for s in b["skills"]], [
            ("Athletics", 2, "str", 5, [("Dodging", True, "wil", 6)]),
            ("Close Combat", 1, "str", 4, [("Grappling", True, "str", 6)]),
            ("Engineering", 3, "log", 6, [("Welding", False, "agi", 7)]),
            ("Stealth", 2, "agi", 6, [("Lock work", True, "log", 7), ("Lock work", True, "agi", 8)]),
            ("Piloting", 5, "agi", 9, []),
        ])
        self.assertEqual([(a["name"], a["type"], a["ess"], a["rating"], a["count"], a["lines"]) for a in b["amps"]], [
            ("Toy Jack", "cyberware", 1.25, 7, 1, ["Head socket", "Cold-sim and hot-sim VR"]),
            ("Toy Arm with a Heavy pistol", "cyberware", 1.25, 7, 1, ["Integrated heavy pistol", "RR 1 on Ranged Weapons (handguns) Tests"]),
            ("Rusty Sedan", "vehicle", None, 4, 1, ["Sedan: Pilot 5, Body 7, Handling 3, Speed 3, Armor 1", "Gun on the roof"]),
            ("Buzz Copter", "drones", None, 7, 2, ["Flying Drone: Pilot 5, Body 2, Handling 8, Speed 6, Armor 0"]),
            ("Old Pal, fixer", "contact", None, 4, 1, ["RR 1 on Network (gutter) Tests"]),
            ("Jolt", "equipment", None, 3, 1, ["Chip: DV +1 in melee", "RR 1 on Close Combat Tests", "Disadvantage on all their other Tests"]),
        ])
        self.assertEqual([(w["name"], w["kind"], w["dv"], w["count"]) for w in b["weapons"]],
                         [("Unarmed", None, "3", 1), ("Wrench", "club", "5", 2), ("Zap Pistol", "heavy pistol", "5", 1),
                          ("Submachine Gun", None, "5", 2)])
        self.assertEqual(b["spells"], ["Zap", "Fizz"])
        self.assertEqual([(r["name"], r["armor"], r["l"]) for r in b["armor"]],
                         [("No armor", None, 3), ("Padded Coat", "3", 6), ("Clothes", "2", 5), ("Mental", None, 2)])
        self.assertEqual(b["equipment"], ["Fake SIN", "Commlink", "Toolkit"])
        self.assertEqual((b["keywords"], b["dispositions"], b["cues"]),
                         (["Troll", "Test city / downtown"], ["Grumpy"], ["I fix it.", "You pay for it."]))

    def test_samples(self):
        self.assertEqual([(s["file"], s["name"], s["role"], s["page"]) for s in self.res.samples], [
            ("crb.spark.xml", "Spark", "Character creation example", 85),
            ("crb.test-rigger.xml", "Test Rigger", "Made-up rigger, male troll", 88),
        ])
        root = self.xml["crb.test-rigger.xml"]
        self.assertEqual((root.get("id"), root.get("origin"), root.get("metatype")), ("crb.test-rigger", "CRB", "troll"))
        self.assertEqual(root.find("build/attributes").attrib, {"str": "3", "agi": "4", "wil": "2", "log": "3", "cha": "2"})
        self.assertEqual([k.text for k in root.iter("knowledge")], ["Made-up lore", "Toy trains"])
        # a pair is two items; a weapon printed without a type is named by it; spells link to the book's catalog
        self.assertEqual([(i.get("kind"), i.get("name"), i.get("catalogId")) for i in root.iter("item") if i.get("kind") != "gear"], [
            ("armor", "Padded Coat", "armored-clothes-coat"), ("armor", "Clothes", "armored-clothes"),  # the made-up ratings 3 and 2
            ("weapon", "Wrench", "long-weapon"), ("weapon", "Wrench", "long-weapon"), ("weapon", "Zap Pistol", "heavy-pistol"),
            ("weapon", "Submachine Gun", "submachine-gun"), ("weapon", "Submachine Gun", "submachine-gun"),
            ("spell", "Zap", "crb.spell-zap"), ("spell", "Fizz", None)])

    def test_amps(self):
        def fx(root):
            return {a.get("name"): ([e.get("ref") + (f":{e.get('param')}" if e.get("param") else "") for e in a.iter("effect")], a.get("vehicle"))
                    for a in root.find("build").findall("amp")}  # not the snapshots' printed amps
        self.assertEqual(fx(self.xml["crb.test-rigger.xml"]), {
            "Toy Jack": (["vr-cold", "vr-hot"], None),
            "Toy Arm with a Heavy pistol": (["rr-spec:ranged-weapons.pistols"], None),  # "Integrated heavy pistol" stays text
            "Rusty Sedan": (["vehicle-armor"], "sedan"),
            "Buzz Copter": (["flying", "extra-drone"], "small-drone"),
            "Old Pal, fixer": (["rr-spec:network.street"], None),
            "Jolt": (["dv-plus", "rr-skill:close-combat", "disadvantage"], None),  # its printed limitation: a Disadvantage, not a Negative effect
        })
        # the printed ratings, on the snapshots
        self.assertEqual([(a.get("printedRating"), a.get("source"), a.get("page")) for a in self.xml["crb.test-rigger.xml"].iter("snapshot")
                          for a in a][:2], [("7", "CRB", "88"), ("7", "CRB", "88")])
        self.assertEqual(fx(self.xml["crb.spark.xml"]), {
            "Awakened": (["awk-sorcery", "awk-astral-projection"], None),
            "Owl mentor spirit": (["rr-spec:sorcery.illusion-spells"], None),
            "Sustaining focus": (["sustain-spell"], None),
            "Old Pal, made-up fixer": (["rr-spec:network.street"], None),
        })

    def test_sheet_only_amps(self):
        # an amp no box prints (by type and name) joins the catalog from its sheet, with the sample's effects; the
        # box's Owl covers "Owl mentor spirit"; the Awakened amp and contacts are the runner's own; no sheet text
        # reaches the overlay
        res = crb.extract(AMPS_MD + PREGEN_MD)
        amps = {a.get("id"): a for a in ET.fromstring(res.files["amps.xml"]) if a.get("page") in ("85", "88")}
        self.assertEqual([(i, a.get("type"), a.get("printedRating"), a.get("page"), a.get("source"), a.get("vehicle"))
                          for i, a in amps.items()], [
            ("sustaining-focus", "equipment", "2", "85", "CRB", None),
            ("toy-jack", "cyberware", "7", "88", "CRB", None),
            ("toy-arm-with-a-heavy-pistol", "cyberware", "7", "88", "CRB", None),
            ("rusty-sedan", "vehicle", "4", "88", "CRB", "sedan"),
            ("buzz-copter", "vehicle", "7", "88", "CRB", "small-drone"),
            ("jolt", "equipment", "3", "88", "CRB", None)])
        arm = amps["toy-arm-with-a-heavy-pistol"]
        self.assertEqual([(f.get("ref"), f.get("param"), f.get("note")) for f in arm.findall("effect")],
                         [("rr-spec", "ranged-weapons.pistols", None), ("narrative", None, "balances printed rating")])
        self.assertIsNone(arm.find("narrative").text)
        self.assertIn('<text of="amps" id="toy-jack">Head socket; Cold-sim and hot-sim VR</text>', res.texts)
        # the same words in another order or number are the box's amp
        rows = [{"type": "cyberware", "name": "Jacks toy", "id": "jacks-toy"}, {"type": "vehicle", "name": "Rusty Sedan Deluxe", "id": "x"}]
        got = crb.sheet_amps([(88, self.block)], rows, statblock.load_rules())
        self.assertEqual([a["id"] for a in got], ["toy-arm-with-a-heavy-pistol", "buzz-copter", "jolt"])

    def test_creation_example(self):
        root = self.xml["crb.spark.xml"]
        self.assertEqual((root.get("metatype"), [k.text for k in root.iter("keyword")], [d.text for d in root.iter("disposition")]),
                         ("elf", ["Elf", "Test mage", "Low lifestyle"], ["Quiet", "Bold", "Kind"]))
        self.assertEqual(root.find("build/attributes").attrib, {"str": "2", "agi": "3", "wil": "4", "log": "2", "cha": "3"})
        self.assertEqual([(s.get("id"), s.get("rating"), [x.text for x in s]) for s in root.iter("skill")], [
            ("sorcery", "5", ["sorcery.illusion-spells"]), ("stealth", "4", []), ("network", "2", ["network.street"])])
        self.assertEqual([(i.get("kind"), i.get("name"), i.get("catalogId")) for i in root.iter("item")], [
            ("armor", "Armor jacket", "armored-clothes-coat"), ("weapon", "Traditional knife", "short-weapon"),
            ("spell", "Glimmer", "crb.spell-glimmer-sight"), ("spell", "Zap", "crb.spell-zap"), ("gear", "Reagents", None)])
        # the focus amp's item isn't printed: none is made up (Review says it needs one)
        self.assertIsNone(next(a for a in root.find("build").findall("amp") if a.get("name") == "Sustaining focus").get("linkedItem"))

    def test_every_printed_number_is_a_report_row(self):
        rows = [r for r in self.res.report if r.get("sample")]
        self.assertEqual({r["sample"] for r in rows}, {"crb.spark", "crb.test-rigger"})
        self.assertEqual({r["kind"] for r in rows if r["sample"] == "crb.spark"}, {"amp"})  # the prose prints no pools
        self.assertEqual([(r["kind"], r.get("key") or r.get("name"), r.get("printed")) for r in rows if r["status"] != "ok"],
                         [("amp", "amp-2", 7), ("amp", "amp-6", 3),  # as printed, the rules rate them otherwise
                          ("pool", "stealth.lockpicking@log", 7),  # Stealth's LOG isn't the spec's attribute
                          ("unmatched-item", "Fizz", None)])  # not in the book's spell boxes
        self.assertEqual(sum(r["kind"] == "pool" for r in rows), 10)
        self.assertEqual([(r["key"], r["printed"]) for r in rows if r["kind"] == "threshold"],
                         [("physicalNone", 3), ("physicalMain", 6), ("physicalAlt", 5), ("mental", 2)])
        self.assertEqual([(r["printed"], r["computed"]) for r in rows if r["kind"] == "essence"], [(3.5, 3.5)])
        self.assertEqual({r["page"] for r in rows}, {85, 88})


class AmpsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = crb.extract(AMPS_MD)
        cls.amps = {a.get("id"): a for a in ET.fromstring(cls.res.files["amps.xml"])}

    def fx(self, aid):
        return [f.get("ref") + (f":{f.get('param')}" if f.get("param") else "") + (f"={f.get('value')}" if f.get("value") else "")
                for f in self.amps[aid].findall("effect")]

    def test_entries(self):
        self.assertEqual([(i, a.get("type"), a.get("printedRating"), a.get("page"), a.find("name").text) for i, a in self.amps.items()], [
            ("zoom-goggles", "equipment", "9", "138", "Zoom goggles"),
            ("zapper-x-taser", "equipment", "7", "138", "Zapper X (Taser)"),
            ("buzz-blade", "equipment", "3", "138", "Buzz blade"),
            ("padded-vest", "equipment", "4", "138", "Padded vest"),
            ("brain-box", "cyberware", "10", "155", "Brain box"),
            ("jack-plug", "cyberware", "5", "155", "Jack plug"),
            ("fence", "contact", "4", "155", "Fence"),
            ("night-clerk", "contact", "7", "155", "Night clerk"),
            ("owl-mentor-spirit-night-wisdom", "quality", "7", "174", "Owl Mentor Spirit Night Wisdom"),
            ("glow-fist", "adept", "6", "174", "Glow Fist"),
            ("mod-echo", "cyberdeck", "2", "210", "Echo"),
            ("toy-deck", "cyberdeck", "11", "210", "Toy deck"),
            ("hover-sled", "vehicle", "8", "238", "Hover sled"),
            ("sports-car", "vehicle", "2", "238", "Sports Car"),
            ("nurse-bot", "vehicle", "6", "238", "Nurse bot"),
            ("tiny-scout", "vehicle", "2", "238", "Tiny Scout"),
        ])
        self.assertEqual(self.amps["mod-echo"].get("mod"), "true")

    def test_effects_reproduce_the_printed_rating(self):
        self.assertEqual({i: self.fx(i) for i in self.amps}, {
            "zoom-goggles": ["rr-spec:perception.physical", "rr-spec:stealth.physical-sneaking", "no-disadvantage:Night vision", "narrative"],
            "zapper-x-taser": ["dv-plus", "range-improve:OK/Dis/-/- -> OK/OK/Dis/-", "rr-spec:ranged-weapons.pistols"],
            "buzz-blade": ["narrative"],
            "padded-vest": ["rr-spec:influence.etiquette"],
            "brain-box": ["rr-attr:log"],
            "jack-plug": ["vr-cold", "vcr"],
            "fence": ["rr-spec:network.street"],
            "night-clerk": ["rr-spec:network.street", "rr-spec:network.criminal"],
            "owl-mentor-spirit-night-wisdom": ["rr-spec", "rr-spec"],
            "glow-fist": ["dv-plus", "dv-plus"],
            "mod-echo": ["narrative"],
            "toy-deck": ["firewall-plus", "attack-plus", "attack-plus", "rr-spec:cracking.brute-force"],
            "hover-sled": ["vehicle-armor", "vehicle-armor", "flying"],
            "sports-car": [],
            "nurse-bot": ["pilot-plus", "pilot-plus"],
            "tiny-scout": [],
        })
        self.assertEqual([r for r in self.res.report if r["kind"] == "rating-mismatch"], [])

    def test_items_and_chassis(self):
        item = {i: dict(a.find("item").attrib) for i, a in self.amps.items() if a.find("item") is not None}
        self.assertEqual(item["zapper-x-taser"], {"kind": "weapon", "dv": "5", "ranges": "OK/OK/Dis/-"})
        self.assertEqual(item["buzz-blade"], {"kind": "weapon", "dv": "6", "ranges": "OK/-/Dis/-"})
        self.assertEqual(item["padded-vest"], {"kind": "armor", "armor": "2"})
        self.assertEqual(item["zoom-goggles"], {"kind": "gear"})
        self.assertEqual({i: a.get("vehicle") for i, a in self.amps.items() if a.get("vehicle")},
                         {"hover-sled": "chopper", "sports-car": "sports-car", "nurse-bot": "small-drone", "tiny-scout": "microdrone"})

    def test_gear(self):
        self.assertEqual([(g.get("id"), g.get("kind"), g.get("page"), g.find("name").text) for g in ET.fromstring(self.res.files["gear.xml"])], [
            ("gear-glow-stick", "gear", "138", "Glow stick"),
            ("gear-sleepdust", "gear", "138", "Sleepdust"),
            ("gear-nod", "gear", "138", "Nod"),
        ])

    def test_texts_hold_the_entry_without_furniture(self):
        texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts["zoom-goggles"], "RR 1 on Perception (watching) and Stealth (physical) Tests; night vision.")
        self.assertEqual(texts["jack-plug"], "Socket for a cable; cold-sim VR; lets you jump into vehicles.")
        self.assertEqual(texts["gear-glow-stick"], "makes a dim light.")
        for a in self.amps.values():
            self.assertEqual(a.find("narrative").text or "", "")


class MatchTest(unittest.TestCase):
    def test_known_file(self):
        self.assertEqual(crb.match({"sha256": crb.SHA256[0], "title": ""}, ""), 1.0)

    def test_markers(self):
        head = "<!-- page 2 -->\nThe new alternate core rulebook for the Shadowrun game, Anarchy 2.0.\n"
        self.assertEqual(identify({"sha256": "", "title": ""}, head)[0], crb)

    def test_other_books(self):
        self.assertEqual(crb.match({"sha256": "", "title": ""}, "daegann shadow amps base"), 0.0)


ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / ".extract/private/library/crb/book.md"
ORACLE = ROOT / ".extract/private/oracle/spells.xml"
# Differences with the old catalog, each with its cause (ids only, no book text):
# - the old catalog cited a prose mention, not the spell box: Increase Reflexes (179), Heal and
#   Control Thoughts (184); the recipe cites the box (182, 182, 183);
# - the old catalog wrote "Magic fingers"; the box prints "Magic Fingers";
# - Elemental Aura is in the CRB v1.8 manipulation box; the old catalog listed it as DHSA only.
KNOWN_PAGES = {"spell-increase-reflexes": ("179", "182"), "spell-heal": ("184", "182"),
               "spell-control-thoughts": ("184", "183")}
KNOWN_NAMES = {"spell-magic-fingers": ("Magic fingers", "Magic Fingers")}
KNOWN_EXTRA = {"spell-elemental-aura"}


LIBRARY = ROOT / ".extract/private/library"
OWN = {"crb": "CRB", "dhsa": "DHSA", "pregens": "PREGENS", "cg": "CG"}  # qref-* -> QREF


@unittest.skipUnless(BOOK.exists(), "owner's converted books not present")
class IdentifyBooksTest(unittest.TestCase):
    """Every recipe's match() on each converted book's head: only the book's own recipe reaches the threshold."""

    def test_each_book_has_one_recipe(self):
        from importer.recipes import RECIPES, THRESHOLD
        books = sorted(p for p in LIBRARY.glob("*/book.md"))
        self.assertGreaterEqual(len(books), 3)
        for b in books:
            own = OWN.get(b.parent.name, "QREF" if b.parent.name.startswith("qref") else None)
            head = b.read_text(encoding="utf8")[:4000]
            scores = {r.ID: r.match({"sha256": "", "title": ""}, head) for r in RECIPES}
            self.assertEqual({i for i, s in scores.items() if s >= THRESHOLD}, {own}, (b.parent.name, scores))
            self.assertEqual(identify({"sha256": "", "title": ""}, head)[0].ID, own)


@unittest.skipUnless(BOOK.exists() and ORACLE.exists(), "owner's converted CRB book and oracle not present")
class ParityTest(unittest.TestCase):
    """The 33 source="CRB" spells of today's catalog: id, kind, category, page and name."""

    @classmethod
    def setUpClass(cls):
        res = crb.extract(BOOK.read_text(encoding="utf8"))
        cls.new = {e.get("id"): e for e in ET.fromstring(res.files["spells.xml"])}
        cls.old = {e.get("id"): e for e in ET.parse(ORACLE).getroot() if e.get("source") == "CRB"}

    def test_book_matches_without_its_hash(self):
        self.assertEqual(crb.match({"sha256": ""}, BOOK.read_text(encoding="utf8")[:4000]), 0.9)

    def test_ids(self):
        self.assertEqual(len(self.old), 33)
        self.assertEqual((set(self.old) - set(self.new), set(self.new) - set(self.old)), (set(), KNOWN_EXTRA))

    def test_fields(self):
        diffs = {}
        for i, o in self.old.items():
            n = self.new[i]
            for f in ("kind", "category", "source"):
                self.assertEqual(n.get(f), o.get(f), i)
            if n.get("page") != o.get("page"):
                diffs.setdefault("page", {})[i] = (o.get("page"), n.get("page"))
            if n.find("name").text != o.find("name").text:
                diffs.setdefault("name", {})[i] = (o.find("name").text, n.find("name").text)
        self.assertEqual(diffs, {"page": KNOWN_PAGES, "name": KNOWN_NAMES})


AMPS_ORACLE = ROOT / ".extract/private/oracle"
# The old catalog's CRB amps were DHSA rows that DHSA prints in black (core-book content), paged by a name
# search in an older core book. Differences with what the v1.8 boxes print, each with its cause (ids only):
# - renamed: DHSA added the model's type ("… (Combat Bike)", "… (Small drone - wheeled)", "(BTL)", the
#   underbarrel launcher) where v1.8 prints the model name alone, or named it differently (v1.8's paren:
#   sniper rifle, submachine gun, taser; the plural "recorders"; mentor archetypes in printed order;
#   "Muscle augmentation", "Medium drone", "Revolution Bike", the sword weapon focus, plural patches).
RENAMED = {
    "ares-alpha-mk-ii-assault-rifle-underbarrel-grenade-launcher": "ares-alpha-mk-ii-assault-rifle",
    "ares-docwagon-first-responder-medium-drone-tracked": "ares-docwagon-first-responder",
    "artemis-industries-nightwing-personal-glider-wing": "artemis-industries-nightwing",
    "barrett-model-122-anti-materiel-rifle": "barrett-model-122-sniper-rifle",
    "bear-mentor-spirit-strength-protection": "bear-mentor-spirit-protection-strength",
    "berserker-btl": "berserker", "casanova-btl": "casanova",
    "chrysler-nissan-pursuit-v-small-drone-wheeled": "chrysler-nissan-pursuit-v",
    "cyberspace-design-quadrotor-small-flying-drone-rotor": "cyberspace-design-quadrotor",
    "dragonslayer-mentor-spirit-heroism-adventure": "dragonslayer-mentor-spirit-adventure-heroism",
    "evo-reflexultra-reflex-recorder": "evo-reflexultra-reflex-recorders",
    "gm-nissan-doberman-medium-drone-tracked": "gm-nissan-doberman",
    "harley-davidson-centaur-combat-bike": "harley-davidson-centaur",
    "horizon-doble-revolution-monocycle": "horizon-doble-revolution-bike",
    "ingram-smartgun-smg": "ingram-smartgun-submachine-gun",
    "lockheed-optic-x2-small-flying-drone-winged": "lockheed-optic-x2",
    "mct-nissan-roto-drone-medium-flying-drone-rotor": "mct-nissan-roto-drone",
    "medium-drones": "medium-drone",
    "mitsubishi-nightsky-stretch-limousine": "mitsubishi-nightsky",
    "muscle-replacement-2": "muscle-augmentation",
    "rigid-inflatable-boat-boat": "rigid-inflatable-boat",
    "shiawase-kanmushi-microdrone-arthropod": "shiawase-kanmushi",
    "steel-lynx-large-drone-wheeled-on-legs": "steel-lynx",
    "weapon-focus-katana": "weapon-focus-sword",
    "yamaha-pulsar-tasers": "yamaha-pulsar-taser",
    "gear-stim-patch": "gear-stim-patches", "gear-trauma-patch": "gear-trauma-patches",
}
# - not rulebook entries (owner's rule: an oracle amp the rulebook doesn't print stays non-canon; these are
#   Daegann's editing and import as DHSA entries only): the three flying drones are the base microdrone, small
#   and medium drone of the DRONES box (p.241), which print "Speed N (flying M)" on the base drone (the flying
#   names only describe NPCs' drones); the deck Attack/Firewall and vehicle Flying add-ons are rows of the
#   SHADOW AMP EFFECTS table (pp.61-63), shipped as the effects attack-plus, firewall-plus and flying.
#   (Concealment was here too: the rulebook prints it only on Hercules' pregen sheet, p.88; see sheet_amps.)
UNREACHABLE = {"flying-microdrone", "small-flying-drone", "medium-flying-drones", "mod-attack", "mod-firewall", "mod-flying"}
# - page: the box, not a prose mention (Actioneer on p.149, bioware muscle on p.159, the patches on p.160;
#   every mentor spirit is in the p.174 box); Concealment: the Hercules pregen sheet (p.88).
AMP_PAGES = {"actioneer-business-suit": ("148", "149"), "concealment": ("143", "88"), "muscle-replacement-2": ("158", "159"),
             "gear-stim-patch": ("158", "160"), "gear-trauma-patch": ("158", "160"),
             **{f"{m}-mentor-spirit-{a}": ("175", "174") for m, a in (
                 ("coyote", "deceit-mischief"), ("dog", "friendship-loyalty"), ("raccoon", "cat-burglar"),
                 ("thunderbird", "anger-war"), ("wolf", "community-hunt"), ("dragonslayer", "heroism-adventure"))}}
# - v1.8 prints the autonomous medkits as Drone Amps (DHSA: equipment); their Pilot now explains the rating.
AMP_TYPES = {"crashcart-essential-autonomous-medkit": ("equipment", "vehicle"),
             "docwagon-pro-autonomous-medkit": ("equipment", "vehicle")}
# - effects (new effects pinned, as (ref, param, value)): the old reader missed the Red Dog's 5 vehicles
#   (read 3), counted "combat" as a club ("bat") for the lethal-toxin knife and couldn't map Novacoke's RRs;
#   DHSA gives the Ingram RR on pistols (v1.8: submachine guns); the medkits above (their Pilot ratings).
AMP_EFFECTS = {
    "ares-red-dog-series": [("firewall-plus", "", ""), ("firewall-plus", "", ""), ("rcc", "", "5"), ("rr-skill", "piloting", "")],
    "combat-knife-coated-with-a-lethal-toxin": [("dv-plus", "", ""), ("dv-plus", "", "")],
    "novacoke": [("negative", "", "2"), ("rr-attr", "cha", ""), ("rr-spec", "perception.social", "")],
    "ingram-smartgun-smg": [("narrative", "", ""), ("rr-spec", "ranged-weapons.submachine-guns", "")],
    "crashcart-essential-autonomous-medkit": [],
    "docwagon-pro-autonomous-medkit": [("pilot-plus", "", "")] * 3,
}
# - items (new descriptor pinned): the weapon foci were gear; v1.8 prints them as melee weapons with DV and
#   range. The medkits are vehicles now, with no item.
AMP_ITEMS = {
    "weapon-focus-knife": {"kind": "weapon", "dv": "S+1/CHA+1", "ranges": "OK/-/-/-"},
    "weapon-focus-katana": {"kind": "weapon", "dv": "S+2/CHA+2", "ranges": "OK/-/-/-"},
    "crashcart-essential-autonomous-medkit": None,
    "docwagon-pro-autonomous-medkit": None,
}
# v1.8 prints Amps DHSA doesn't reprint in black (contacts, vehicle control rigs, eyes and ears, bone lacing,
# base vehicles, more weapons, drugs and drones): counted by type, no names. Of these, 22 are printed only on the
# pregen sheets (adept 2, cyberdeck 1, cyberware 5, equipment 5, quality 4, vehicle 5).
EXTRA_BY_TYPE = {"adept": 2, "bioware": 1, "contact": 16, "cyberdeck": 2, "cyberware": 20, "equipment": 9, "quality": 5,
                 "vehicle": 15}


def _fx(e):
    return sorted((f.get("ref"), f.get("param") or "", f.get("value") or "") for f in e.findall("effect"))


@unittest.skipUnless(BOOK.exists() and (AMPS_ORACLE / "amps.xml").exists(), "owner's converted CRB book and oracle not present")
class AmpsParityTest(unittest.TestCase):
    """The 148 source="CRB" amps and 13 gear items of today's catalog: type, printed rating, effects, page."""

    @classmethod
    def setUpClass(cls):
        res = crb.extract(BOOK.read_text(encoding="utf8"))
        cls.new = {e.get("id"): e for f in ("amps.xml", "gear.xml") for e in ET.fromstring(res.files[f])}
        cls.old = {e.get("id"): e for f in ("amps.xml", "gear.xml") for e in ET.parse(AMPS_ORACLE / f).getroot()
                   if e.get("source") == "CRB"}
        cls.report = res.report

    def test_every_oracle_entry_is_found(self):
        self.assertEqual(len(self.old), 161)
        missing = set(self.old) - set(self.new) - set(RENAMED) - UNREACHABLE
        self.assertEqual((missing, set(RENAMED.values()) - set(self.new), UNREACHABLE & set(self.new)), (set(), set(), set()))

    def test_fields(self):
        diffs = {}
        for i, o in self.old.items():
            if i in UNREACHABLE:
                continue
            n = self.new[RENAMED.get(i, i)]
            self.assertEqual((n.tag, n.get("printedRating"), n.get("mod"), n.get("source")),
                             (o.tag, o.get("printedRating"), o.get("mod"), "CRB"), i)
            self.assertEqual(n.find("name").text.casefold() == o.find("name").text.casefold(), i not in RENAMED, i)
            for f, known in (("page", AMP_PAGES), ("type", AMP_TYPES)):
                if n.get(f) != o.get(f):
                    diffs.setdefault(f, {})[i] = (o.get(f), n.get(f))
            if _fx(n) != _fx(o):
                diffs.setdefault("effects", {})[i] = _fx(n)
            item = [None if e.find("item") is None else dict(e.find("item").attrib) for e in (o, n)]
            if item[0] != item[1]:
                diffs.setdefault("items", {})[i] = item[1]
        self.assertEqual(diffs, {"page": AMP_PAGES, "type": AMP_TYPES, "effects": AMP_EFFECTS, "items": AMP_ITEMS})

    def test_extras(self):
        extra = Counter(e.get("type") or e.get("kind") for i, e in self.new.items()
                        if i not in self.old and i not in RENAMED.values())
        self.assertEqual(dict(extra), EXTRA_BY_TYPE)

    def test_report(self):
        # the whip's printed rating is 1 for DV 7 (+2 over the base): the old catalog listed it as a book
        # discrepancy too; the jet-ski has no boat chassis; Luna's tattoo focus prints 13 for effects worth 10 (the
        # sample runner reports it too). The RCC's "choose 1 specialization" stays open.
        self.assertEqual(sorted((r["kind"], r.get("id") or r.get("spec")) for r in self.report if not r.get("sample")),
                         [("rating-mismatch", "jet-ski"), ("rating-mismatch", "monofilament-whip"),
                          ("rating-mismatch", "mystic-tattoo-focus"),
                          ("unresolved-spec", "piloting (choose 1 specialization)")])


if __name__ == "__main__":
    unittest.main()


# Invented text in the converter's shapes: the extended social tests box (a two-line title), the vehicle damage note as
# body prose with its run-in label on a line of its own; no planning pool box at all.
OPTIONAL_MD = """<!-- page 70 -->
**SHADOWRUN**
Made-up prose before the note ends here.
Tables may optionally borrow the rules for vehi-
**Note:**
cles for made-up folks too. It makes them sturdier in
an invented way.
To avoid made-up trouble, a table follows.
<!-- page 141 -->
| OPTIONAL RULES: |
|---|
| EXTENDED SOCIAL TESTS |
| Invented social duels go on for a while�<br>Each side marks made-up social damage� |
Prose after the box.
<!-- page 74 -->
| ALTERNATIVE RISK RULES |
|---|
| Made-up special dice replace the risky ones�<br>Nobody glitches in this invented way� |
"""


class OptionalRulesTest(unittest.TestCase):
    """The optional rules seed the app's Table rules: names and pages in the overlay, descriptions only in the texts."""

    def setUp(self):
        self.res = crb.extract(OPTIONAL_MD)
        self.rules = ET.fromstring(self.res.files["rules-optional.xml"])
        self.texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts) if t.get("of") == "rules"}

    def test_rules(self):
        self.assertEqual([(r.get("id"), r.get("sheet"), r.get("source"), r.get("page"), r.find("title").text) for r in self.rules], [
            ("optional-extended-social-tests", "optional", "CRB", "139", "Extended social tests"),
            ("optional-vehicle-damage-for-all", "optional", "CRB", "68", "Vehicle and drone damage for characters, critters and devices"),
            ("optional-planning-pool", "optional", "CRB", "80", "Planning pool or personal Edge"),  # not found: the known page
            ("optional-darker-and-more-lethal", "optional", "CRB", "69",
             "Darker and more lethal (worsening wound effects, longer natural healing)"),  # not found: the known page
            ("optional-alternative-risk", "optional", "CRB", "72", "Alternative risk rules"),
        ])
        for r in self.rules:
            self.assertEqual(r.find("text").text or "", "")

    def test_texts(self):
        self.assertEqual(self.texts, {
            "optional-extended-social-tests": "Invented social duels go on for a while. Each side marks made-up social damage.",
            "optional-vehicle-damage-for-all": "Tables may optionally borrow the rules for vehicles for made-up folks too. "
                                               "It makes them sturdier in an invented way.",
            "optional-alternative-risk": "Made-up special dice replace the risky ones. Nobody glitches in this invented way.",
        })


@unittest.skipUnless(BOOK.exists(), "owner's converted CRB book not present")
class OptionalRulesBookTest(unittest.TestCase):
    def test_all_found(self):
        rules = crb.optional_rules(BOOK.read_text(encoding="utf8"))
        self.assertEqual([(r[0], r[2]) for r in rules], [("optional-extended-social-tests", 139),
                                                         ("optional-vehicle-damage-for-all", 68), ("optional-planning-pool", 80),
                                                         ("optional-darker-and-more-lethal", 69), ("optional-alternative-risk", 72)])
        for r in rules:
            self.assertGreater(len(r[3]), 100, r[0])
