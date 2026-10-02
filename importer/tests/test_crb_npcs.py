"""The core rulebook's NPC chapter (importer/recipes/crb_npcs.py) on made-up stat blocks in its layout: a two-column page
of horizontal bands (a 16 pt name, the attribute table and skills on the left, amps, weapons, equipment and wounds on the
right), margin tab letters, a page number, a description band with no table, and a block running over to the next page.
Every name and number here is invented."""
import io
import os
import tempfile
import unittest
import unittest.mock
import xml.etree.ElementTree as ET
from pathlib import Path

import pdfplumber

from importer import statblock, xmlio
from importer.recipes import Result, crb_npcs
from importer.tests.minipdf import _build_pdf

ROOT = Path(__file__).resolve().parents[2]
# the made-up NPC the e2e tests load (built by characters() from GOON below, its source changed to TESTC)
FIXTURE = ROOT / "tests/fixtures/mini/custom/imported/testc/npcs/testc.npc-made-up-goon.xml"


def _t(y, text, x=71, size=8.8):
    return f"BT /F1 {size} Tf {x} {y} Td ({text}) Tj ET\n"


def _row(y, cells):
    return "".join(_t(y, t, x) for x, t in cells)


LABEL_X = (90, 120, 150, 180, 210)
PAGE_A = (_t(770, "SHADOWRUN", x=14, size=20)                              # running header: dropped
          + _t(720, "MADE-UP GOON", size=16)
          + _row(700, zip(LABEL_X, ("STR", "AGI", "WIL", "LOG", "CHA")))
          + _row(690, zip(LABEL_X, "32221"))
          + _row(680, [(86, "4"), (96, "(orks)"), (148, "3"), (158, "(dwarfs)")])  # under STR and WIL
          + _t(665, "SKILLS") + _t(655, "Athletics 3 (3+S, RR 0)")
          + _t(600, "Q", x=12, size=10)                                    # margin tab letter: dropped
          + _t(700, "WEAPONS", x=323) + _t(690, "Knife DV 3 [OK/-/-/-]", x=323)
          + _t(500, "MADE-UP BOSS", size=16)
          + _row(480, zip(LABEL_X, ("STR", "AGI", "WIL", "LOG", "CHA"))) + _row(470, zip(LABEL_X, "23332"))
          + _t(460, "SKILLS")
          + _t(480, "Network 4 (5+C, RR 0)", x=323)                         # the skills go on in the right column
          + _t(30, "244", x=11, size=24))                                  # page number: dropped
PAGE_B = (_t(740, "WOUND THRESHOLDS", x=323)                               # above the page's first name: the boss's
          + _t(700, "MADE-UP BEAST", size=16) + _t(680, "Made-up prose about a beast.", size=9.8))  # a description: no block


class LayoutTest(unittest.TestCase):
    def setUp(self):
        self.pdf = pdfplumber.open(io.BytesIO(_build_pdf([PAGE_A, PAGE_B])))

    def tearDown(self):
        self.pdf.close()

    def test_bands_read_left_then_right_with_the_table_by_column(self):
        bands = crb_npcs.page_bands(self.pdf.pages[0])
        self.assertEqual([n for n, _ in bands], ["MADE-UP GOON", "MADE-UP BOSS"])
        self.assertEqual(bands[0][1], ["STR AGI WIL LOG CHA", "STR 3 | AGI 2 | WIL 2 | LOG 2 | CHA 1", "STR 4 (orks) | WIL 3 (dwarfs)",
                                       "SKILLS", "Athletics 3 (3+S, RR 0)", "WEAPONS", "Knife DV 3 [OK/-/-/-]"])
        self.assertEqual(bands[1][1][-2:], ["SKILLS", "Network 4 (5+C, RR 0)"])

    def test_blocks_carry_over_pages_and_skip_descriptions(self):
        got = crb_npcs.blocks([(244, self.pdf.pages[0]), (245, self.pdf.pages[1])])
        self.assertEqual([(p, n) for p, n, _ in got], [(244, "MADE-UP GOON"), (244, "MADE-UP BOSS")])
        self.assertEqual(got[1][2][-1], "WOUND THRESHOLDS")


GOON = ["STR AGI WIL LOG CHA", "STR 3 | AGI 2 | WIL 2 | LOG 2 | CHA 2", "STR 4 (orks) | WIL 3 (dwarfs)", "SKILLS",
        "• Athletics 3 (trolls 4) (3+S, RR 0)", "◊ Ranged defense 3 (3+A, RR 0)",
        "• Close Combat 3 (4+A, RR 0) [with toy arm 4 (4+A, RR 1)]", "◊ Grappling 4 (6+A, RR 0)", "[with toy arm 5 (6+A, RR 1)]",
        "• Influence 2 (1+C , RR 0)",
        "CHOOSE 1 SHADOW AMP", "• Toy arm (cyberware): RR 1 on Close Combat Tests\ufffd", "• Fizzy pop (drug): +1 action per fight.",
        "• Grumpy (quality): Advantage when made-up things", "happen; high fighting spirit.",
        "WEAPONS", "• Unarmed DV 3 (orks 4) [OK/–/–/–]", "[with toy arm: DV 4 (orks 5),", "one made-up thing]",
        "• Knife DV 4 [OK/–/–/–]", "CHOOSE 1 WEAPON", "• Light pistol DV 4 [OK/OK/Dis\ufffd/–]", "• Shotgun DV 8 [Dis\ufffd/OK/Dis\ufffd/–]",
        "EQUIPMENT", "• Commlink", "• Padded jacket (Armor 2) + optional made-up shield (+1 Armor)",
        "WOUND THRESHOLDS \uf071\uf071/\uf071/\uf071", "• Low fighting spirit [high if grumpy]", "• Physical 4/7/10 (orks 5/8/11)"]
FOG = ["Minor / Regular / Major", "STR AGI WIL LOG CHA", "STR 1/2/3 | AGI 3/4/5 | WIL 2/3/4 | LOG 2/3/4 | CHA 2/3/4", "SKILLS",
       "• Stealth 2/3/4 (2/4/6+A, RR 0)", "SHADOW AMPS", "• Materialization (power): made-up mist can materialize\ufffd",
       "• [Made-up toxic spirits only] Smog (power): RR 1 on Stealth Tests\ufffd",
       "CHOOSE 1/2/2 SHADOW AMPS", "• Murk (power): RR 1/2/3 on Stealth Tests\ufffd", "• Drizzle (power): made-up rain\ufffd",
       "• Puddle (power): made-up wet feet\ufffd",
       "WEAPONS (DEPENDING ON SHADOW AMPS)", "• Astral combat DV 2/3/4 [OK/–/–/–]", "WOUND THRESHOLDS", "• Extreme fighting spirit"]
NEWT = ["STR AGI WIL LOG CHA", "STR 1 | AGI 4 | WIL 1 | LOG 1 | CHA 1", "SKILLS", "• Close Combat 2 (3+A, RR 0)", "◊ Bite 3 (5+A, RR 0)",
        "SHADOW AMP", "• Slime (power): RR 1 on Close Combat Tests\ufffd", "WEAPON", "• Bite DV 2 [OK/–/–/–]",
        "WOUND THRESHOLDS //", "• High fighting spirit"]


class BlockTest(unittest.TestCase):
    """One block's text -> NPCs, with the made-up core files (tests/fixtures/mini)."""

    @classmethod
    def setUpClass(cls):
        cls.rules = statblock.load_rules()

    def chars(self, page, name, lines):
        got, _ = crb_npcs.characters(page, name, lines, self.rules, {}, "2026-10-02T00:00:00.000Z", [])
        return got, [ET.fromstring(g["xml"]) for g in got]

    def test_an_npc_takes_the_human_row_and_the_first_choice(self):
        (e,), (x,) = self.chars(250, "MADE-UP GOoN", GOON)
        self.assertEqual({k: e[k] for k in ("file", "name", "kind", "tier", "page")},
                         {"file": "crb.npc-made-up-goon.xml", "name": "Made-Up Goon", "kind": "npc", "tier": "regular", "page": 250})
        self.assertEqual((x.get("id"), x.get("metatype"), x.get("origin")), ("crb.npc-made-up-goon", "human", "CRB"))
        self.assertEqual(x.find("npc").attrib, {"kind": "npc", "tier": "regular", "fightingSpirit": "low"})
        b = x.find("build")
        self.assertEqual(b.find("attributes").attrib, {"str": "3", "agi": "2", "wil": "2", "log": "2", "cha": "2"})
        self.assertEqual([(s.get("id"), s.get("rating"), [p.text for p in s]) for s in b.findall("skill")],
                         [("athletics", "3", []), ("close-combat", "4", ["close-combat.grappling"]), ("influence", "1", [])])
        self.assertEqual([(a.get("name"), a.get("type"), [f.get("ref") for f in a.findall("effect")]) for a in b.findall("amp")],
                         [("Toy arm", "cyberware", ["rr-skill"])])
        self.assertIsNone(b.find("amp/snapshot"))  # no rating is printed
        self.assertEqual([(i.get("kind"), i.get("name"), i.get("catalogId"), i.get("armor"), i.get("dv"), i.get("ranges")) for i in b.findall("item")],
                         [("armor", "Padded jacket", "armored-clothes", "2", None, None), ("gear", "Commlink", None, None, None, None),
                          ("weapon", "Knife", "short-weapon", None, "4", "OK/-/-/-"),
                          ("weapon", "Light pistol", "light-pistol", None, "4", "OK/OK/Dis/-")])
        self.assertEqual(x.find("notes").text.split("\n"), [
            "Other metatypes: STR 4 (orks), WIL 3 (dwarfs).", "Fizzy pop (drug): +1 action per fight.",
            "Grumpy (quality): Advantage when made-up things happen; high fighting spirit.", "Shotgun DV 8 [Dis./OK/Dis./–]"])

    def test_the_e2e_fixture_is_this_block(self):
        (e,), _ = self.chars(250, "MADE-UP GOON", GOON)
        self.assertEqual(FIXTURE.read_text(encoding="utf8"), e["xml"].replace("crb.npc-", "testc.npc-").replace('origin="CRB"', 'origin="TESTC"')
                         .replace("CRB p.250.", "Test canon book p.250."))

    def test_a_spirit_imports_once_per_force(self):
        got, xs = self.chars(262, "SPIrIT OF FOG", FOG)
        self.assertEqual([(g["name"], g["kind"], g["file"]) for g in got], [
            ("Spirit of Fog (Minor)", "spirit", "crb.npc-spirit-of-fog-minor.xml"),
            ("Spirit of Fog (Regular)", "spirit", "crb.npc-spirit-of-fog-regular.xml"),
            ("Spirit of Fog (Major)", "spirit", "crb.npc-spirit-of-fog-major.xml")])
        x = xs[1]
        self.assertEqual((x.get("metatype"), x.find("npc").get("fightingSpirit")), ("", "extreme"))
        self.assertEqual(x.find("build/attributes").attrib, {"str": "2", "agi": "4", "wil": "3", "log": "3", "cha": "3"})
        self.assertEqual(x.find("build/skill").attrib, {"id": "stealth", "rating": "4"})
        self.assertEqual([a.get("name") for a in xs[0].findall("build/amp")], ["Materialization", "Murk"])
        self.assertEqual([a.get("name") for a in x.findall("build/amp")], ["Materialization", "Murk", "Drizzle"])
        self.assertEqual([f.get("ref") for f in x.findall("build/amp[@name='Murk']/effect")], ["rr-skill", "rr-skill"])  # RR 2
        self.assertEqual(x.find("notes").text.split("\n"), ["[Made-up toxic spirits only] Smog (power): RR 1 on Stealth Tests.",
                                                            "Puddle (power): made-up wet feet."])
        self.assertEqual([(i.get("name"), i.get("dv")) for i in x.findall("build/item")], [("Astral combat", "3")])

    def test_a_critter_has_no_metatype(self):
        (e,), (x,) = self.chars(257, "MADE-UP NEWT", NEWT)
        self.assertEqual((e["kind"], x.get("metatype"), x.find("npc").get("fightingSpirit")), ("critter", "", "high"))
        self.assertEqual([(i.get("name"), i.get("catalogId"), i.get("dv")) for i in x.findall("build/item")], [("Bite", None, "2")])
        self.assertIsNone(x.find("notes"))

    def test_a_block_that_fails_is_reported_and_the_rest_import(self):
        class Page:  # stands in for a pdfplumber page: its bands are all npcs() reads
            bands = [("MADE-UP NEWT", NEWT), ("MADE-UP BROKEN", ["STR AGI WIL LOG CHA", None])]  # a line it can't read
        orig = crb_npcs.page_bands
        crb_npcs.page_bands = lambda p: p.bands
        try:
            out, report = crb_npcs.npcs([(257, Page())], self.rules, {}, "2026-10-02T00:00:00.000Z")
        finally:
            crb_npcs.page_bands = orig
        self.assertEqual([o["name"] for o in out], ["Made-Up Newt"])
        self.assertEqual([(r["kind"], r["name"], r["page"]) for r in report if r["kind"] == "npc-failed"], [("npc-failed", "Made-Up Broken", 257)])


class RunTest(unittest.TestCase):
    """run() writes a recipe's NPCs to custom/imported/<source>/npcs/ and lists them in custom/imported/npcs.xml, keeping
    other sources' rows; remove() takes the source's rows out again."""

    def test_run_writes_and_remove_drops_the_npcs(self):
        from importer.__main__ import remove, run
        from importer.recipes import qref
        from importer.tests.test_qref import MD
        from importer.tests.test_run import SCHEMA, XSD_CHECK, node
        tmp = tempfile.mkdtemp()
        book, custom = os.path.join(tmp, "library", "b1"), os.path.join(tmp, "custom")
        os.makedirs(book)
        Path(book, "book.md").write_text(MD, encoding="utf8")
        imported = os.path.join(custom, "imported")
        os.makedirs(imported)
        xmlio.write_file(os.path.join(imported, "npcs.xml"), xmlio.merged_npcs(
            custom, "OTHER", [{"file": "other.npc-x.xml", "name": "Other X", "kind": "critter", "tier": "prime", "page": 3}]))
        goon = Path(FIXTURE).read_text(encoding="utf8")
        npc = {"file": "qref.npc-made-up-goon.xml", "xml": goon, "name": "Made-Up Goon", "kind": "npc", "tier": "regular", "page": 250}
        real = qref.extract

        def extract(md, ctx=None):  # the quick-reference recipe, with one NPC
            res = real(md, ctx)
            res.npcs = [npc]
            return res
        with unittest.mock.patch.object(qref, "extract", extract):
            run(book, custom, convert_pdf=False)
        self.assertEqual(Path(imported, "qref", "npcs", "qref.npc-made-up-goon.xml").read_text(encoding="utf8"), goon)
        index = os.path.join(imported, "npcs.xml")
        self.assertEqual([n.attrib for n in ET.parse(index).getroot()], [
            {"source": "OTHER", "href": "other/npcs/other.npc-x.xml", "name": "Other X", "kind": "critter", "tier": "prime", "page": "3"},
            {"source": "QREF", "href": "qref/npcs/qref.npc-made-up-goon.xml", "name": "Made-Up Goon", "kind": "npc", "tier": "regular",
             "page": "250"}])
        self.assertNotIn("npcs", Path(imported, "index.xml").read_text(encoding="utf8"))  # not an overlay
        for f, xsd in [(index, "npcs.xsd"), (FIXTURE, "character.xsd")]:
            r = node("--input-type=module", "-e", XSD_CHECK, str(f), os.path.join(SCHEMA, xsd), os.path.join(SCHEMA, "common.xsd"))
            self.assertEqual(r.returncode, 0, f"{f}: {r.stderr}")
        remove(book, custom)
        self.assertEqual([n.get("source") for n in ET.parse(index).getroot()], ["OTHER"])
        self.assertFalse(os.path.exists(os.path.join(imported, "qref")))
        self.assertEqual(Result(files={}, texts=None).npcs, [])


PDF = ROOT / ".extract/private/library/crb/original.pdf"


@unittest.skipUnless(PDF.exists(), "owner's CRB PDF not present")
class BookTest(unittest.TestCase):
    """The owner's book: every stat block of the chapter imports (counts only, no book text)."""

    def test_every_block_imports(self):
        from importer import use_custom
        with pdfplumber.open(PDF) as pdf, use_custom(str(ROOT / ".extract/private/custom")):
            os.environ.pop("CA2_CORE_DIR", None)
            try:
                out, report = crb_npcs.npcs(crb_npcs.chapter(pdf), statblock.load_rules(), {}, "2026-10-02T00:00:00.000Z")
            finally:
                os.environ["CA2_CORE_DIR"] = str(ROOT / "tests/fixtures/mini/custom/imported/core")
        kinds = {k: sum(o["kind"] == k for o in out) for k in ("npc", "critter", "spirit")}
        self.assertEqual(kinds, {"npc": 25, "critter": 10, "spirit": 22})  # 7 spirits x 3 Forces, and one with no Forces
        self.assertEqual([r for r in report if r["kind"] == "npc-failed"], [])


if __name__ == "__main__":
    unittest.main()
