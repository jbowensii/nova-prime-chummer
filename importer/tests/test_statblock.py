"""Stat-block parser and the pregen recipe, on a made-up runner ("Test Face") laid out as the converter prints
the pregen booklet: a story page ("# NAME", "(ROLE)"), then a stat page with section anchors, bold skill rows,
"(Spec +2) ATT DP RR" rows, bold weapon/armor/amp names, "•" bullets that wrap."""
import json
import os
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from importer import statblock
from importer.__main__ import run
from importer.recipes import identify, pregens

ROOT = Path(__file__).resolve().parents[2]
GOLDEN = ROOT / "tests" / "fixtures" / "mini" / "custom" / "imported" / "pregens" / "samples" / "pregens.test-face.xml"
NPC_GOLDEN = ROOT / "tests" / "fixtures" / "npc-critter.xml"

STAT = """## S HADOWRUN
KEYWORDS
• Elf
• Nowhere, Testland
• Made-up face
SKILLS RATING ATT DP RR
**Athletics 3 STR 5**
(Dodging +2) WIL 8
**Stealth - AGI 3**
**Perception 2 LOG 5**
(Watching) LOG 5 1
**Survival 1 LOG 4**
(Nerves +2) WIL 6
**Close combat 1 AGI 4**
**Electronics 1 LOG 5**
(Mystery trick +2) LOG 6
**Influence 5 CHA 9 (1)**
(Fibbing +2) CHA 11 1
(Menace +2) AGI 9
**Network 2 CHA 6**
(Gutter +2) CHA 8
WEAPONS DV RANGE
**Unarmed** 2 [OK/–/–/–]
**Zap Pistol** (Heavy pistol) 5 [OK/OK/Dis/–]
Against robots 7
ARMOR L S INC.
**No armor** 2 5 8
**Padded coat (2)** 4 7 10
**Padded coat and hat (+1)** 5 8 11
**Mental** 3 6 9
WOUNDS
DISPOSITIONS
• Smiles a lot, and then
some more.
• Never early.
CUES
• “Hello there.”
• “Trust me.”
SHADOW AMPS ESS COST
**Natural Low-Light Vision** (Elf) **0**
**Big Grin** (Quality) **4**
RR 1 on Influence tests (first meeting only).
**Toy Eyes** (Cyberware) **-1 9**
Delta Grade (-0.25 Essence)
RR 1 on Ranged Weapons (Handguns) tests
Glows in the dark
**Zap Pistol** (Weapon) **4**
Heavy pistol VD 5 (OK/OK/Dés/–)
Smartlink: RR 1 on Ranged weapon (Handguns) tests
**Pocket Buzzer** (Drone) **6**
Flying microdrone
Pilot 5, Body 1, Handling 9, Speed 1, Armor 0
Beeps loudly
**Old Friend** (Contact) **0**
Knows a guy.
RR 1 on Network (Gutter) tests
EQUIPMENT
Fake SIN, Commlink,
Zap Pistol
"""
MD = f"""<!-- page 1 -->
## S HADOWRUN
<!-- page 2 -->
daegann.fr
# TABLE OF CONTENTS
**Introduction ........................ 3**
**Test Face (Made-up face) ............ 4**
<!-- page 3 -->
Here are 1 new pregen characters.
<!-- page 4 -->
daegann.fr
# TEST FACE
(MADE-UP FACE)
Some invented story.
<!-- page 5 -->
{STAT}"""


class ParseTest(unittest.TestCase):
    def setUp(self):
        self.b = statblock.parse_statblock(STAT)

    def test_sections(self):
        b = self.b
        self.assertEqual(b["keywords"], ["Elf", "Nowhere, Testland", "Made-up face"])
        self.assertEqual(b["dispositions"], ["Smiles a lot, and then some more.", "Never early."])
        self.assertEqual(b["cues"], ["Hello there.", "Trust me."])
        self.assertEqual(b["equipment"], ["Fake SIN", "Commlink", "Zap Pistol"])

    def test_skills(self):
        sk = {s["name"]: s for s in self.b["skills"]}
        self.assertEqual((sk["Athletics"]["rating"], sk["Athletics"]["attr"], sk["Athletics"]["dp"]), (3, "str", 5))
        self.assertIsNone(sk["Stealth"]["rating"])
        self.assertEqual(sk["Influence"]["rr"], "(1)")
        self.assertEqual([(x["name"], x["plus2"], x["attr"], x["dp"]) for x in sk["Influence"]["specs"]],
                         [("Fibbing", True, "cha", 11), ("Menace", True, "agi", 9)])
        self.assertEqual(sk["Perception"]["specs"], [{"name": "Watching", "plus2": False, "attr": "log", "dp": 5, "rr": "1"}])

    def test_weapons_armor_amps(self):
        b = self.b
        self.assertEqual(b["weapons"][1], {"name": "Zap Pistol", "kind": "Heavy pistol", "dv": "5", "ranges": "OK/OK/Dis/–",
                                           "count": 1, "notes": ["Against robots 7"]})
        self.assertEqual([(a["name"], a["armor"], a["l"]) for a in b["armor"]],
                         [("No armor", None, 2), ("Padded coat", "2", 4), ("Padded coat and hat", "+1", 5), ("Mental", None, 3)])
        eyes = b["amps"][2]
        self.assertEqual((eyes["name"], eyes["type"], eyes["ess"], eyes["rating"], eyes["count"]), ("Toy Eyes", "Cyberware", 1.0, 9, 1))
        self.assertEqual(eyes["lines"], ["Delta Grade (-0.25 Essence)", "RR 1 on Ranged Weapons (Handguns) tests", "Glows in the dark"])


class CharacterTest(unittest.TestCase):
    def setUp(self):
        self.rules = statblock.load_rules()
        self.ch, self.rows = statblock.to_character(statblock.parse_statblock(STAT), self.rules,
                                                    sid="pregens.test-face", name="Test Face", role="Made-up face",
                                                    origin="PREGENS", background="Made-up face. Test book p.5.",
                                                    updated="2026-09-27T00:00:00.000Z", page=5)
        self.b = self.ch["build"]

    def test_attributes_are_the_majority_of_the_printed_pools(self):
        # Electronics LOG 5 says LOG 4; Perception, its Physical row and Survival say LOG 3
        self.assertEqual(self.b["attributes"], {"str": 2, "agi": 3, "wil": 3, "log": 3, "cha": 4})
        self.assertEqual(self.ch["identity"]["metatype"], "elf")

    def test_skills_and_specs(self):
        sk = {s["id"]: s for s in self.b["skills"]}
        self.assertNotIn("stealth", sk)  # unrated
        self.assertEqual(sk["athletics"], {"id": "athletics", "rating": 3, "specs": ["athletics.ranged-defense"]})
        self.assertEqual(sk["perception"]["specs"], [])  # "(Watching)" without +2 is a pool, not a specialization
        self.assertEqual(sk["electronics"]["specs"], ["custom:Mystery trick"])
        self.assertEqual(sk["network"]["specs"], ["network.street"])

    def test_amps(self):
        amps = {a["name"]: a for a in self.b["amps"]}
        self.assertNotIn("Natural Low-Light Vision", amps)  # a metatype trait, not an amp
        fx = lambda n: [(e["ref"], e.get("param"), e.get("value")) for e in amps[n]["effects"]]
        # the rules price it 5, the book 4, and the line limits it ("first meeting only"): that limitation is the Negative
        # effect of the difference (CRB p.61), its note the printed line; as printed, Review needs no GM for it
        self.assertEqual(fx("Big Grin"), [("rr-skill", "influence", None), ("negative", None, 1)])
        self.assertEqual(amps["Big Grin"]["effects"][1]["note"], "RR 1 on Influence tests (first meeting only).")
        # a line no effect reads stays the amp's text, it isn't priced as a narrative effect to meet the printed rating
        self.assertEqual(fx("Toy Eyes"), [("grade-delta", None, None), ("rr-spec", "ranged-weapons.pistols", None)])
        self.assertEqual(amps["Toy Eyes"]["narrative"], "Glows in the dark")
        self.assertEqual(fx("Zap Pistol"), [("rr-spec", "ranged-weapons.pistols", None)])
        self.assertEqual((amps["Zap Pistol"]["type"], amps["Zap Pistol"]["linkedItem"]), ("equipment", "it-3"))
        self.assertEqual((amps["Pocket Buzzer"]["type"], amps["Pocket Buzzer"]["vehicle"]), ("vehicle", "microdrone"))
        self.assertEqual(fx("Pocket Buzzer"), [("flying", None, None)])
        # the printed rating, kept on the amp's snapshot for Review
        self.assertEqual({n: (a["snapshot"]["printedRating"], a["snapshot"]["source"], a["snapshot"]["page"]) for n, a in amps.items()},
                         {"Big Grin": (4, "PREGENS", 5), "Toy Eyes": (9, "PREGENS", 5), "Zap Pistol": (4, "PREGENS", 5),
                          "Pocket Buzzer": (6, "PREGENS", 5), "Old Friend": (0, "PREGENS", 5)})

    def test_items(self):
        its = [(i["uid"], i["kind"], i["name"], i.get("armor"), i.get("catalogId")) for i in self.b["items"]]
        self.assertEqual(its, [("it-1", "armor", "Padded coat", 2, "armored-clothes"),  # the made-up armor with that rating
                               ("it-2", "armor", "Padded coat and hat", 1, None),  # "(+1)": an add-on worn over it, its own point
                               ("it-3", "weapon", "Zap Pistol", None, "heavy-pistol"),
                               ("it-4", "gear", "Fake SIN", None, None), ("it-5", "gear", "Commlink", None, None)])
        self.assertEqual((self.b["mainArmor"], self.b["altArmor"], self.b["items"][1]["over"]), ("it-1", "it-2", "it-1"))

    def test_nothing_is_written_to_explain_or_approve_the_book(self):
        # what the made-up page prints against the guidelines (Stealth unrated, its own spec, 3/2/2 narrative, amp ratings
        # the rules price otherwise) is left for Review to show: no override, no approving drawback note, no price
        self.assertEqual(self.ch["overrides"], [])
        self.assertFalse([i for i in self.b["items"] if {"note", "price"} & set(i)])
        xml = statblock.character_xml(self.ch)
        for marker in ("<override", "book drawback", "As printed in"):
            self.assertNotIn(marker, xml)

    def test_equipment_amps_get_their_items(self):
        stat = STAT.replace("**Old Friend** (Contact) **0**", "**Bag of Tricks** (Equipment) **2**\nRR 1 on Stealth tests\n"
                            "**Tailored Wardrobe** (Equipment) **2**\nArmor 1\nRR 1 on Influence tests\n"
                            "**Hyper-phone** (Equipment) **1**\nFirewall 2\n**Old Friend** (Contact) **0**")
        stat = stat.replace("**Padded coat and hat (+1)** 5 8 11", "**Clothes (1)** 3 6 9")
        stat = stat.replace("Fake SIN, Commlink,\nZap Pistol", "Fake SIN, Hyper-phone commlink, Zap Pistol, Integrated toy radio,\nSatchel of tricks")
        stat = stat.replace("Glows in the dark", "Integrated toy radio")
        ch, _ = statblock.to_character(statblock.parse_statblock(stat), statblock.load_rules(), sid="x", name="X", role="",
                                       origin="PREGENS", background="", updated="")
        items = {i["uid"]: i for i in ch["build"]["items"]}
        link = {a["name"]: items[a["linkedItem"]]["name"] if a.get("linkedItem") else None for a in ch["build"]["amps"] if a["type"] == "equipment"}
        # the wardrobe's "Armor 1" isn't read as the clothes: no printed item has its name, the amp brings its own
        self.assertEqual(link, {"Zap Pistol": "Zap Pistol", "Bag of Tricks": "Satchel of tricks", "Tailored Wardrobe": "Tailored Wardrobe",
                                "Hyper-phone": "Hyper-phone commlink"})
        # the list prints no plain "Commlink": the branded phone is the runner's one commlink, the free one (CRB p.85), and
        # the radio the eyes have built in ("Integrated …") is part of that implant, not bought again
        self.assertEqual([i["name"] for i in items.values() if i["kind"] == "gear"],
                         ["Fake SIN", "Hyper-phone commlink", "Satchel of tricks", "Tailored Wardrobe"])
        self.assertEqual([i["name"] for i in items.values() if i.get("starting") == "commlink"], ["Hyper-phone commlink"])

    def test_an_amp_without_a_printed_item_brings_its_own(self):
        # the book's Equipment Amps cost the item and the upgrades (CRB p.144): one printed with no gear line is bought with
        # a gear item of its name, as a catalog amp is in the app; no price, note or marker on it
        stat = STAT.replace("**Old Friend** (Contact) **0**", "**Pep Pills** (Equipment) **1**\nWakes you up\n**Old Friend** (Contact) **0**")
        ch, _ = statblock.to_character(statblock.parse_statblock(stat), statblock.load_rules(), sid="x", name="X", role="",
                                       origin="PREGENS", background="", updated="")
        pills = next(a for a in ch["build"]["amps"] if a["name"] == "Pep Pills")
        self.assertEqual(ch["build"]["items"][-1], {"uid": pills["linkedItem"], "kind": "gear", "name": "Pep Pills"})
        self.assertEqual(len(ch["build"]["items"]), 6)

    def test_a_quality_the_equipment_list_prints_is_an_equipment_amp(self):
        # a focus printed "(Quality)" and on the equipment list too: bought gear made an Amp (CRB p.60), on that item
        stat = STAT.replace("**Old Friend** (Contact) **0**", "**Made-up focus** (Quality) **2**\nRR 1 on Stealth tests\n**Old Friend** (Contact) **0**")
        stat = stat.replace("Fake SIN, Commlink,", "Fake SIN, Commlink, Made-up focus,")
        ch, _ = statblock.to_character(statblock.parse_statblock(stat), statblock.load_rules(), sid="x", name="X", role="",
                                       origin="PREGENS", background="", updated="")
        items = {i["uid"]: i["name"] for i in ch["build"]["items"]}
        focus = next(a for a in ch["build"]["amps"] if a["name"] == "Made-up focus")
        self.assertEqual((focus["type"], items[focus["linkedItem"]]), ("equipment", "Made-up focus"))
        # a Quality the list doesn't print stays a Quality
        self.assertEqual(next(a for a in ch["build"]["amps"] if a["name"] == "Big Grin")["type"], "quality")

    def test_weapons_without_a_type_and_repeated_rows(self):
        stat = STAT.replace("**Unarmed** 2 [OK/–/–/–]", "**Unarmed** 2 [OK/–/–/–]\n**Hidden knuckles** 4 [OK/–/–/–]\n"
                            "**Zap Pistol in astral** (Heavy pistol) 5 [OK/OK/Dis/–]\n**Boom tube** (Rocket launcher) 12 [–/–/Dis/OK]")
        ch, _ = statblock.to_character(statblock.parse_statblock(stat), statblock.load_rules(), sid="x", name="X", role="",
                                       origin="PREGENS", background="", updated="")
        self.assertEqual([(i["name"], i.get("catalogId"), i.get("specialist")) for i in ch["build"]["items"] if i["kind"] == "weapon"],
                         [("Hidden knuckles", "short-weapon", None), ("Boom tube", "rocket-launcher", True), ("Zap Pistol", "heavy-pistol", None)])

    def test_a_runners_amp_is_as_printed_a_catalog_amp_meets_its_printed_rating(self):
        rules = statblock.load_rules()
        mapper = statblock.Mapper({**rules["specs"], **statblock.SPEC_NAMES})
        grin = {"name": "Grin", "type": "Quality", "rating": 1, "count": 1, "lines": ["RR 1 on Influence tests (first meeting only)."]}
        # the limitation is the Negative effect on both; a catalog amp's notes "book drawback", a runner's the printed line
        self.assertEqual([f[3] for f in statblock.map_amp(grin, rules, mapper, False)[1] if f[0] == "negative"],
                         ["RR 1 on Influence tests (first meeting only)."])
        self.assertEqual([f[3] for f in statblock.map_amp(grin, rules, mapper, False, catalog=True)[1] if f[0] == "negative"],
                         ["book drawback"])
        # a deck printed as a Quality is a cyberdeck, on a runner as in the catalog: only a deck has Firewall – Attack (CRB p.62)
        deck = {"name": "Old deck", "type": "Quality", "rating": 3, "count": 1, "lines": ["Firewall 2 – Attack 1"]}
        self.assertEqual(statblock.map_amp(deck, rules, mapper, False)[0], "cyberdeck")
        self.assertEqual(statblock.map_amp(deck, rules, mapper, False, catalog=True)[0], "cyberdeck")
        # a runner's other printed types stay: an Equipment amp with a deck's stats is gear made an Amp
        self.assertEqual(statblock.map_amp({**deck, "type": "Equipment"}, rules, mapper, False)[0], "equipment")
        # a runner's drone, as a catalog one: the chassis' own front-facing mount takes the first weapon (CRB p.60, p.241)
        mounted = {"name": "D", "type": "Drone", "rating": 0, "count": 1, "lines": ["Pilot 5, Body 2, Handling 8, Speed 3, Armor 0", "Integrated zap SMG"]}
        self.assertNotIn("weapon-mount", [f[0] for f in statblock.map_amp(mounted, rules, mapper, True)[1]])
        # a storage rail isn't that mount
        rail = {**mounted, "lines": [mounted["lines"][0], "Storage rail holding a zap SMG"]}
        self.assertIn("weapon-mount", [f[0] for f in statblock.map_amp(rail, rules, mapper, True)[1]])

    def test_a_limitation_is_a_negative_effect_only_where_it_explains_the_printed_rating(self):
        rules = statblock.load_rules()
        mapper = statblock.Mapper({**rules["specs"], **statblock.SPEC_NAMES})
        amp = lambda rating, *lines: {"name": "A", "type": "Quality", "rating": rating, "count": 1, "lines": list(lines)}  # noqa: E731
        neg = lambda a: [f[2] for f in statblock.map_amp(a, rules, mapper, True)[1] if f[0] == "negative"]  # noqa: E731
        self.assertEqual(neg(amp(3, "RR 1 on Influence tests (only at night)")), [2])  # the rules give 2 more
        self.assertEqual(neg(amp(5, "RR 1 on Influence tests (only at night)")), [])  # the rules give the printed rating
        self.assertEqual(neg(amp(3, "RR 1 on Influence tests")), [])  # nothing printed limits it: the book's rating stands
        self.assertEqual(neg(amp(3, "RR 1 on Influence tests", "Imposes a Disadvantage on anyone reading her aura")), [])  # on others
        self.assertEqual(neg(amp(None, "RR 1 on Influence tests (only at night)")), [])  # an NPC prints no rating

    def test_a_hacking_scenes_edge_is_initiative_in_vr(self):
        # "hacking scene" as "cracking scene": the first initiative level, limited to VR (CRB p.61)
        mapper = statblock.Mapper({})
        self.assertEqual([f[:2] for f in mapper.effects("+1 Edge point per hacking scene in VR")], [("init-1", None), ("init-realm", "vr")])

    def test_a_shamanic_mask_is_the_awakened_amps_option_where_the_core_has_it(self):
        rules = statblock.load_rules()
        mapper = statblock.Mapper({**rules["specs"], **statblock.SPEC_NAMES})
        awk = {"name": "Mage", "type": "Awakened", "rating": 4, "count": 1,
               "lines": ["Sorcery, Conjuring, Astral perception & projection", "Shamanic mask"]}
        with_mask = {**rules, "effects": {**rules["effects"], "awk-shamanic-mask": {"rating": -1, "types": ["awakened"], "essence": 0}}}
        _, fx, loose, _, rating = statblock.map_amp(awk, with_mask, mapper, True)
        self.assertEqual(([f[0] for f in fx][-1], loose), ("awk-shamanic-mask", []))
        self.assertEqual(rating, statblock.map_amp({**awk, "lines": awk["lines"][:1]}, rules, mapper, True)[4] - 1)
        # a core without it: the line stays text
        self.assertEqual(statblock.map_amp(awk, rules, mapper, True)[2], ["Shamanic mask"])

    def test_a_weapon_the_chassis_mounts_needs_no_enhanced_mount_on_a_catalog_amp(self):
        rules = statblock.load_rules()
        mapper = statblock.Mapper({**rules["specs"], **statblock.SPEC_NAMES})
        drone = lambda *lines: statblock.map_amp({"name": "D", "type": "Drone", "rating": 0, "count": 1, "lines": list(lines)}, rules, mapper, True, catalog=True)  # noqa: E731
        small = "Pilot 5, Body 2, Handling 8, Speed 3, Armor 0"
        self.assertNotIn("weapon-mount", [f[0] for f in drone(small, "Integrated zap SMG")[1]])  # the made-up "light guns" mount takes it
        self.assertIn("weapon-mount", [f[0] for f in drone(small, "Turret-mounted zap SMG")[1]])  # a turret isn't the chassis' own
        self.assertIn("weapon-mount", [f[0] for f in drone("Microdrone", "Integrated zap pistol")[1]])  # the made-up micro mounts none
        # one mount per chassis: the second weapon needs an Enhanced weapon mount
        self.assertEqual([f[0] for f in drone(small, "Integrated zap SMG", "Mounted zap rifle")[1]].count("weapon-mount"), 1)

    def test_a_spec_rolled_with_two_attributes_is_bought_once(self):
        stat = STAT.replace("(Dodging +2) WIL 8", "(Dodging +2) WIL 8\n(Dodging +2) STR 7")
        ch, _ = statblock.to_character(statblock.parse_statblock(stat), statblock.load_rules(), sid="x", name="X", role="",
                                       origin="PREGENS", background="", updated="")
        self.assertEqual(next(s for s in ch["build"]["skills"] if s["id"] == "athletics")["specs"], ["athletics.ranged-defense"])

    def test_printed_numbers_are_report_rows(self):
        rows = {(r["kind"], r.get("key")): r for r in self.rows}
        self.assertEqual(rows[("pool", "influence.intimidation@agi")]["status"], "attribute")
        self.assertEqual(rows[("pool", "electronics@log")]["status"], "contradicts")
        self.assertEqual(rows[("pool", "athletics.ranged-defense@wil")]["status"], "ok")
        self.assertEqual(rows[("pool", "perception@log")]["status"], "ok")
        self.assertEqual((rows[("threshold", "physicalAlt")]["printed"], rows[("threshold", "physicalAlt")]["status"]), (5, "ok"))
        self.assertEqual((rows[("essence", None)]["printed"], rows[("essence", None)]["status"]), (5, "ok"))
        drone = rows[("amp", "amp-4")]  # the drone: its "Beeps loudly" is text, not a narrative effect priced to meet the book
        self.assertEqual((drone["printed"], drone["status"]), (6, "mismatch"))
        friend = rows[("amp", "amp-5")]
        self.assertEqual((friend["printed"], friend["computed"], friend["status"]), (0, 4, "mismatch"))
        self.assertTrue(all(r["sample"] == "pregens.test-face" for r in self.rows))

    def test_character_xml_matches_the_fixture_the_ts_reader_is_tested_on(self):
        # regenerate after an intended change: py -3.12 -c "from importer.tests.test_statblock import write_golden; write_golden()"
        self.assertEqual(statblock.character_xml(self.ch), GOLDEN.read_text(encoding="utf8"))

    def test_character_xml_of_an_npc_matches_the_apps(self):
        # tests/ca2/runner-builder/pregen-sample.test.ts holds the app's writer to the same file
        npc = json.loads(NPC_GOLDEN.with_suffix(".json").read_text(encoding="utf8"))
        self.assertEqual(statblock.character_xml(npc), NPC_GOLDEN.read_text(encoding="utf8"))

    def test_character_xml_writes_a_token_after_the_portrait_as_the_app_does(self):
        # tests/ca2/runner-builder/pregen-sample.test.ts expects the same line from the app's writer
        npc = json.loads(NPC_GOLDEN.with_suffix(".json").read_text(encoding="utf8"))
        npc["identity"].update(portrait="data:image/jpeg;base64,/9j/P", token="data:image/png;base64,iVBO")
        self.assertIn("\n  <portrait>data:image/jpeg;base64,/9j/P</portrait><token>data:image/png;base64,iVBO</token>\n  <background>",
                      statblock.character_xml(npc))


def write_golden():
    t = CharacterTest("test_amps")
    t.setUp()
    GOLDEN.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN.write_text(statblock.character_xml(t.ch), encoding="utf8", newline="\n")


def _line(y, text, x=420, size=11):
    return f"BT /F1 {size} Tf {x} {y} Td ({text}) Tj ET\n"


# A made-up core-rulebook stat page's right column: items start a slot 16-20pt below the last line, a wrapped line
# sits 11pt below; the left column (skills) must be ignored.
NARRATIVE_OPS = (_line(700, "ATHLETICS 3", x=72) + _line(600, "KEYWORDS", size=12) + _line(580, "tESt town")
                 + _line(540, "DISPOSITIONS", size=12) + _line(520, "caLm") + _line(500, "hateS rain anD")
                 + _line(489, "wet SOckS") + _line(469, "LOuD") + _line(449, "Stubborn")
                 + _line(420, "CUES", size=12) + _line(400, "hi there. gO nOw,") + _line(389, "pleaSe.")
                 + _line(372, "trust me.") + _line(355, "nO.") + _line(338, "maybe") + _line(327, "tOmorrow.")
                 + _line(290, "RISK LEVEL", size=12) + _line(270, "0 1 die 2 dice", size=7))


class PdfNarrativeTest(unittest.TestCase):
    def test_items_are_the_slots_not_the_lines(self):
        import io
        import pdfplumber
        from importer.tests.minipdf import _build_pdf
        with pdfplumber.open(io.BytesIO(_build_pdf([NARRATIVE_OPS]))) as pdf:
            got = statblock.pdf_narrative(pdf.pages[0])
        self.assertEqual(got, {"dispositions": ["Calm", "Hates rain and wet socks", "Loud", "Stubborn"],
                               "cues": ["Hi there. Go now, please.", "Trust me.", "No.", "Maybe tomorrow."]})


class RecipeTest(unittest.TestCase):
    def test_match(self):
        self.assertIs(identify({}, MD[:4000])[0], pregens)

    def test_extract(self):
        res = pregens.extract(MD)
        self.assertEqual(res.files, {})
        s = res.samples[0]
        self.assertEqual((s["file"], s["name"], s["role"], s["page"]), ("pregens.test-face.xml", "Test Face", "Made-up face", 5))
        root = ET.fromstring(s["xml"])
        self.assertEqual((root.get("id"), root.get("origin"), root.get("streetName")), ("pregens.test-face", "PREGENS", "Test Face"))

    def test_two_runners_with_one_name_get_distinct_ids(self):
        twin = MD + "<!-- page 6 -->\ndaegann.fr\n# TEST FACE\n(MADE-UP FACE)\n<!-- page 7 -->\n" + STAT
        ids = [ET.fromstring(s["xml"]).get("id") for s in pregens.extract(twin).samples]
        self.assertEqual(ids, ["pregens.test-face", "pregens.test-face-2"])
        self.assertEqual([s["file"] for s in pregens.extract(twin).samples], ["pregens.test-face.xml", "pregens.test-face-2.xml"])

    def test_corrupt_samples_list_fails_before_any_sample_is_written(self):
        tmp = tempfile.mkdtemp()
        book, custom = os.path.join(tmp, "library", "pg"), os.path.join(tmp, "custom")
        os.makedirs(book)
        Path(book, "book.md").write_text(MD, encoding="utf8")
        Path(custom, "imported").mkdir(parents=True)
        Path(custom, "imported", "samples.xml").write_text("<not xml", encoding="utf8")
        with self.assertRaises(ET.ParseError):
            run(book, custom, convert_pdf=False)
        self.assertFalse(Path(custom, "imported", "pregens").exists())

    def test_run_writes_samples_and_the_samples_list(self):
        tmp = tempfile.mkdtemp()
        book, custom = os.path.join(tmp, "library", "pg"), os.path.join(tmp, "custom")
        os.makedirs(book)
        Path(book, "book.md").write_text(MD, encoding="utf8")
        run(book, custom, convert_pdf=False)
        sample = Path(custom, "imported", "pregens", "samples", "pregens.test-face.xml")
        self.assertTrue(sample.exists())
        lst = ET.parse(os.path.join(custom, "imported", "samples.xml")).getroot()
        self.assertEqual([s.attrib for s in lst], [{"source": "PREGENS", "href": "pregens/samples/pregens.test-face.xml",
                                                    "name": "Test Face", "role": "Made-up face", "page": "5"}])
        rows = ET.parse(os.path.join(book, "import.xml")).getroot().find("report")
        self.assertIn("contradicts", {r.get("status") for r in rows})
        schema = ROOT / "public" / "data" / "schema"
        from importer.tests.test_run import XSD_CHECK
        for f, xsd in [(sample, "character.xsd"), (Path(custom, "imported", "samples.xml"), "samples.xsd"),
                       (Path(book, "import.xml"), "import.xsd")]:
            r = subprocess.run(["node", "--input-type=module", "-e", XSD_CHECK, str(f), str(schema / xsd), str(schema / "common.xsd")],
                               cwd=ROOT, capture_output=True, text=True, encoding="utf8")
            self.assertEqual(r.returncode, 0, f"{f}: {r.stderr}")


if __name__ == "__main__":
    unittest.main()
