"""Stat-block parser and the pregen recipe, on a made-up runner ("Test Face") laid out as the converter prints
the pregen booklet: a story page ("# NAME", "(ROLE)"), then a stat page with section anchors, bold skill rows,
"(Spec +2) ATT DP RR" rows, bold weapon/armor/amp names, "•" bullets that wrap."""
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
        self.ch, self.rows = statblock.to_character(statblock.parse_statblock(STAT), statblock.load_rules(),
                                                    sid="pregens.test-face", name="Test Face", role="Made-up face",
                                                    origin="PREGENS", background="Made-up face. Test book p.5.",
                                                    updated="2026-09-27T00:00:00.000Z")
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
        self.assertEqual(fx("Big Grin"), [("rr-skill", "influence", None), ("negative", None, 1)])
        self.assertEqual(fx("Toy Eyes"), [("grade-delta", None, None), ("rr-spec", "ranged-weapons.pistols", None),
                                          ("narrative", "Glows in the dark", None)])
        self.assertEqual(fx("Zap Pistol"), [("rr-spec", "ranged-weapons.pistols", None)])
        self.assertEqual((amps["Zap Pistol"]["type"], amps["Zap Pistol"]["linkedItem"]), ("equipment", "it-3"))
        self.assertEqual((amps["Pocket Buzzer"]["type"], amps["Pocket Buzzer"]["vehicle"]), ("vehicle", "microdrone"))
        self.assertEqual(fx("Pocket Buzzer"), [("flying", None, None), ("narrative", "Beeps loudly", None)])

    def test_items(self):
        its = [(i["uid"], i["kind"], i["name"], i.get("armor"), i.get("catalogId")) for i in self.b["items"]]
        self.assertEqual(its, [("it-1", "armor", "Padded coat", 2, "armored-clothes"),  # the made-up armor with that rating
                               ("it-2", "armor", "Padded coat and hat", 3, "armored-clothes-coat"),
                               ("it-3", "weapon", "Zap Pistol", None, "heavy-pistol"),
                               ("it-4", "gear", "Fake SIN", None, None), ("it-5", "gear", "Commlink", None, None)])
        self.assertEqual((self.b["mainArmor"], self.b["altArmor"]), ("it-1", "it-2"))

    def test_printed_numbers_are_report_rows(self):
        rows = {(r["kind"], r.get("key")): r for r in self.rows}
        self.assertEqual(rows[("pool", "influence.intimidation@agi")]["status"], "attribute")
        self.assertEqual(rows[("pool", "electronics@log")]["status"], "contradicts")
        self.assertEqual(rows[("pool", "athletics.ranged-defense@wil")]["status"], "ok")
        self.assertEqual(rows[("pool", "perception@log")]["status"], "ok")
        self.assertEqual((rows[("threshold", "physicalAlt")]["printed"], rows[("threshold", "physicalAlt")]["status"]), (5, "ok"))
        self.assertEqual((rows[("essence", None)]["printed"], rows[("essence", None)]["status"]), (5, "ok"))
        self.assertEqual(rows[("amp", "amp-4")]["status"], "ok")  # the drone: 1 + Flying + one narrative
        friend = rows[("amp", "amp-5")]
        self.assertEqual((friend["printed"], friend["computed"], friend["status"]), (0, 4, "mismatch"))
        self.assertTrue(all(r["sample"] == "pregens.test-face" for r in self.rows))

    def test_character_xml_matches_the_fixture_the_ts_reader_is_tested_on(self):
        # regenerate after an intended change: py -3.12 -c "from importer.tests.test_statblock import write_golden; write_golden()"
        self.assertEqual(statblock.character_xml(self.ch), GOLDEN.read_text(encoding="utf8"))


def write_golden():
    t = CharacterTest("test_amps")
    t.setUp()
    GOLDEN.parent.mkdir(parents=True, exist_ok=True)
    GOLDEN.write_text(statblock.character_xml(t.ch), encoding="utf8", newline="\n")


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
