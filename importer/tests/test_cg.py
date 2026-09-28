"""CG recipe: technomancer complex forms and rules reference from made-up text in the converter's
real shape, and (gated) a report of every complex form the real book extracts."""
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from importer.recipes import cg, identify

# Made-up text mimicking the converter's real shape and this book's known quirks: <!-- page N -->
# markers, bold running heads/page numbers on their own line, a margin tab letter glued to a line's
# start/end or alone on its own line, a heading glued to the next column's prose ("COMPLEX FORMS..."),
# a clean pipe table for some complex forms and plain "Name TYPE threshold text" rows for others
# (one of which wraps its second word onto the next line, "Arc"/"feedback" as CG's own book does).
MD = """<!-- page 1 -->
h
TECHNOMANCERS
S
&
Some intro nobody should capture.
BORN TECHNOMANCER
A character becomes a
**1**
y test technomancer.
It grants a few made-up abilities.
<!-- page 2 -->
COMPLEX FORMS extra glued prose from the next column, ignored.
Complex form rules text goes here.
It keeps going for a line.
| COMPLEX |  | FORMS |  |
|---|---|---|---|
| **COMPLEX**<br>**FORM** | **TYPE** | **THRESHOLD** | **NOTES** |
| Alpha<br>ping | I | 0 | Does a simple thing. |
|---|---|---|---|
Beta S Firewall Does another thing over
several lines of notes.
Arc S 0 The next test event happens
feedback and keeps going here.
SPRITES
Sprite intro text before the stat table.
| **WIL** | **LOG** |
|---|---|
3/4/5 3/4/5
SKILLS
n
• something not captured
COURIER SPRITE
Courier sprite rule text here.
CRACK SPRITE
Crack sprite rule text here.
DATA SPRITE
Data sprite rule text here.
FAULT SPRITE
Fault sprite rule text here.
MACHINE SPRITE
Machine sprite rule text here.
WEAPONS
Cybercombat DV 3, not captured.
"""


class FurnitureTest(unittest.TestCase):
    def test_lone_and_glued_letters_go(self):
        lines = [l for _, l in cg.clean_lines(MD)]
        self.assertNotIn("h", lines)
        self.assertNotIn("S", lines)
        self.assertNotIn("&", lines)
        self.assertNotIn("n", lines)

    def test_real_words_survive(self):
        lines = [l for _, l in cg.clean_lines(MD)]
        self.assertIn("test technomancer.", lines)  # leading "y " stripped, not the sentence
        self.assertIn("A character becomes a", lines)  # leading "A" is a real word, kept

    def test_decorative_lines_dropped(self):
        lines = [l for _, l in cg.clean_lines(MD)]
        self.assertFalse(any(l.startswith("**") and l.endswith("**") and "." not in l for l in lines))


class RulesTest(unittest.TestCase):
    def setUp(self):
        self.rules = {r["title"]: r for r in cg.extract_rules(cg.clean_lines(MD))}

    def test_all_eight_headings_captured(self):
        self.assertEqual(set(self.rules), {
            "Born Technomancer", "Complex Forms", "Sprites", "Courier Sprite", "Crack Sprite",
            "Data Sprite", "Fault Sprite", "Machine Sprite"})

    def test_pages(self):
        self.assertEqual(self.rules["Born Technomancer"]["page"], 1)
        self.assertEqual(self.rules["Complex Forms"]["page"], 2)
        self.assertEqual(self.rules["Courier Sprite"]["page"], 2)

    def test_glued_heading_keeps_its_prose(self):
        self.assertIn("extra glued prose", self.rules["Complex Forms"]["text"])
        self.assertIn("Complex form rules text goes here.", self.rules["Complex Forms"]["text"])

    def test_text_stops_at_the_table(self):
        self.assertNotIn("Alpha", self.rules["Complex Forms"]["text"])

    def test_intro_before_the_first_heading_is_not_captured(self):
        self.assertNotIn("nobody should capture", " ".join(r["text"] for r in self.rules.values()))

    def test_content_after_an_untracked_heading_is_not_captured(self):
        self.assertNotIn("not captured", self.rules["Sprites"]["text"])
        self.assertNotIn("not captured", self.rules["Machine Sprite"]["text"])


class FormsTest(unittest.TestCase):
    def setUp(self):
        self.forms = {f["name"]: f for f in cg.extract_forms(cg.clean_lines(MD))}

    def test_pipe_row(self):
        self.assertIn("Alpha ping", self.forms)
        f = self.forms["Alpha ping"]
        self.assertEqual((f["type"], f["page"]), ("I", 2))
        self.assertIn("Does a simple thing.", f["text"])

    def test_plain_row_with_continuation(self):
        f = self.forms["Beta"]
        self.assertEqual(f["type"], "S")
        self.assertIn("Does another thing over", f["text"])
        self.assertIn("several lines of notes.", f["text"])

    def test_wrapped_name(self):
        self.assertIn("Arc feedback", self.forms)
        self.assertNotIn("Arc", self.forms)
        f = self.forms["Arc feedback"]
        self.assertEqual(f["type"], "S")
        self.assertIn("The next test event happens", f["text"])
        self.assertIn("and keeps going here.", f["text"])

    def test_only_the_complex_forms_span_is_read(self):
        self.assertEqual(len(self.forms), 3)


class ExtractTest(unittest.TestCase):
    def setUp(self):
        self.res = cg.extract(MD)
        self.items = {i.get("id"): i for i in ET.fromstring(self.res.files["complexforms.xml"])}
        self.rules = {r.get("id"): r for r in ET.fromstring(self.res.files["rules-technomancers.xml"])}
        self.texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}

    def test_item_ids_kinds_categories(self):
        self.assertEqual(set(self.items), {"cf-alpha-ping", "cf-beta", "cf-arc-feedback"})
        self.assertEqual(self.items["cf-alpha-ping"].get("category"), "instant")
        self.assertEqual(self.items["cf-beta"].get("category"), "sustained")
        self.assertEqual(self.items["cf-alpha-ping"].get("kind"), "complex-form")
        self.assertEqual(self.items["cf-alpha-ping"].get("source"), "CG")

    def test_overlay_keeps_item_and_rule_text_out(self):
        self.assertEqual(self.items["cf-alpha-ping"].find("text").text or "", "")
        self.assertEqual(self.rules["technomancers-sprites"].find("text").text or "", "")

    def test_texts_hold_the_body(self):
        self.assertIn("Does a simple thing.", self.texts["cf-alpha-ping"])
        self.assertIn("Sprite intro text", self.texts["technomancers-sprites"])

    def test_rule_ids_and_sheet(self):
        self.assertEqual(self.rules["technomancers-born-technomancer"].get("sheet"), "technomancers")
        self.assertEqual(self.rules["technomancers-born-technomancer"].get("source"), "CG")

    def test_source(self):
        self.assertEqual(self.res.source, {"id": "CG", "name": cg.NAME, "publisher": "Catalyst Game Labs", "canon": True})


class MatchTest(unittest.TestCase):
    def test_known_file(self):
        self.assertEqual(cg.match({"sha256": cg.SHA256[0], "title": ""}, ""), 1.0)

    def test_markers(self):
        head = "OTHER EDITIONS' BOOKS\nSome Shadowrun conversion text.\n"
        self.assertEqual(identify({"sha256": "", "title": ""}, head)[0], cg)

    def test_other_books(self):
        self.assertEqual(cg.match({"sha256": "", "title": ""}, "daegann shadow amps base"), 0.0)


ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / ".extract/private/library/cg/book.md"
ORACLE = ROOT / ".extract/private/oracle/complexforms.xml"


@unittest.skipUnless(BOOK.exists(), "owner's converted CG book not present")
class RealBookTest(unittest.TestCase):
    """Every printed complex form is extracted (informational: no pass/fail on DHSA overlap)."""

    @classmethod
    def setUpClass(cls):
        cls.res = cg.extract(BOOK.read_text(encoding="utf8"))
        cls.names = [i.findtext("name") for i in ET.fromstring(cls.res.files["complexforms.xml"])]

    def test_book_matches_without_its_hash(self):
        head = BOOK.read_text(encoding="utf8")[:4000]
        self.assertEqual(cg.match({"sha256": ""}, head), 0.9)

    def test_every_form_extracted_once(self):
        self.assertEqual(len(self.names), len(set(self.names)))
        self.assertGreaterEqual(len(self.names), 10)  # the printed table has more than a handful

    @unittest.skipUnless(ORACLE.exists(), "no DHSA complex-forms oracle to compare against")
    def test_report_dhsa_overlap(self):
        dhsa_names = {e.findtext("name") for e in ET.parse(ORACLE).getroot() if e.tag == "item"}
        cg_names = set(self.names)
        print("CG forms matching a DHSA name:", sorted(cg_names & dhsa_names))
        print("CG-only:", sorted(cg_names - dhsa_names))
        print("DHSA-only:", sorted(dhsa_names - cg_names))


if __name__ == "__main__":
    unittest.main()
