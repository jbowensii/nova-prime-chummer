import unittest

from importer.recipes import identify, qref

# Made-up text in the converter's real shape: "#" only for the big page title, sub-heads are
# all-caps plain lines (sometimes "##"), bullets start with "•", no bold markers.
MD = """<!-- page 1 -->
# Matrix Quick REFerENCe
ACTIONS
• Bricking: damages a device. Test text.
Roll a thing + LOG
• Brute Force: direct hack. Test text.
Common Test Options:
• Sub One: not a rule on its own
• Sub Two: also folded into Brute Force
## CONNECTION MODES
• VR hot-sim: full immersion. Test text.
• Long Note: a bullet whose sentence wraps onto
the next line.
<!-- page 2 -->
# Matrix Quick REFerENCe
STEPS AND TURNS
1. First: numbered steps have no bullet title
2. Second: they become one rule named after the section
LABELS
Grouped Effects:
• Alpha: first grouped rule.
design by someone
"""


class QrefTest(unittest.TestCase):
    def test_extract(self):
        r = qref.extract_sheet("matrix", MD)
        ids = [x["id"] for x in r]
        self.assertEqual(ids[:3], ["matrix-bricking", "matrix-brute-force", "matrix-vr-hot-sim"])
        self.assertEqual(r[2]["effects"], "vr-hot")

    def test_titles_sections_pages_text(self):
        r = qref.extract_sheet("matrix", MD)
        self.assertEqual([x["title"] for x in r], [
            "Bricking", "Brute Force", "VR hot-sim", "Long Note", "Steps And Turns", "Grouped Effects", "Alpha"])
        self.assertEqual([x["section"] for x in r][:3], ["Actions", "Actions", "Connection Modes"])
        self.assertEqual([x["page"] for x in r], [1, 1, 1, 1, 2, 2, 2])
        self.assertIn("Sub Two: also folded", r[1]["text"])
        self.assertEqual(r[0]["text"], "damages a device. Test text. Roll a thing + LOG")
        self.assertNotIn("design by", " ".join(x["text"] for x in r))

    def test_ids_deduplicate(self):
        md = "<!-- page 1 -->\nSECTION\n• Same: one.\n• Same: two.\n"
        self.assertEqual([x["id"] for x in qref.extract_sheet("base", md)], ["base-same", "base-same-2"])

    def test_extract_result(self):
        res = qref.extract(MD)
        self.assertEqual(list(res.files), ["rules-matrix.xml"])
        xml = res.files["rules-matrix.xml"]
        self.assertIn('<rule id="matrix-vr-hot-sim" sheet="matrix" section="Connection Modes" effects="vr-hot" source="QREF" page="1">', xml)
        self.assertIn('<text of="rules" id="matrix-bricking">damages a device.', res.texts)
        self.assertEqual(res.source["id"], "QREF")

    def test_sheet_from_heading(self):
        self.assertEqual(qref.sheet_of("# Rules QUICK REFEReNCE"), "base")
        self.assertEqual(qref.sheet_of("# Vehicle QUICK REFEReNCE"), "vehicles")

    def test_match(self):
        self.assertGreater(qref.match({"title": ""}, "# MATRIX QUICK REFERENCE\n## ACTIONS"), 0.6)
        self.assertLess(qref.match({"title": ""}, "# Something else"), 0.2)

    def test_identify(self):
        self.assertIs(identify({"title": ""}, MD[:500])[0], qref)
        self.assertIsNone(identify({"title": ""}, "# Something else")[0])


if __name__ == "__main__":
    unittest.main()
