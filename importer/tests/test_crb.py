"""CRB recipe: spells from made-up boxes in the converter's shape, and (gated) parity with the oracle
captured before the importer existed."""
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
