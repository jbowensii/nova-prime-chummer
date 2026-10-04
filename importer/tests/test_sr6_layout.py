"""The converter's opt-in SR6 layout (importer/sr6/layout.py), on the made-up sr6_layout_pdf()."""
import os
import tempfile
import unittest

from importer.convert import convert
from importer.tests.minipdf import sr6_layout_pdf


def _convert(sr6=True):
    d = tempfile.mkdtemp()
    pdf, md = os.path.join(d, "sr6.pdf"), os.path.join(d, "sr6.md")
    with open(pdf, "wb") as f:
        f.write(sr6_layout_pdf())
    meta = convert(pdf, md, sr6=sr6)
    with open(md, encoding="utf8") as f:
        lines = [ln for ln in f.read().splitlines() if ln.strip()]
    return meta, lines


class Sr6LayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.meta, cls.lines = _convert()
        cls.text = "\n".join(cls.lines)

    def test_converter_version(self):
        self.assertEqual(self.meta["converter"], "sr6-2")
        self.assertEqual(_convert(sr6=False)[0]["converter"], "6")

    def test_headings_by_font(self):
        for h in ["# GADGETS", "## Gadget Shop", "### Shop Rules", "#### zappers", "#### Zap Gun",
                  "##### (made up tags)", "#### Sledge Hammer Time"]:
            self.assertIn(h, self.lines)

    def test_band_table_with_wrapped_cell_and_long_name(self):
        i = self.lines.index("| GADGET | DV | COST |")
        self.assertEqual(self.lines[i - 1], "#### zappers")
        self.assertEqual(self.lines[i + 2:i + 5], ["| Zap Gun | 3P | 250 |", "| Big Fizz Rifle | 5P | 1,200 (each) |",
                                                   "| Tiny Zapper | 2S | 100 |"])

    def test_margin_letter_and_page_numbers_dropped(self):
        for ln in self.lines:
            self.assertNotIn(ln, ("G", "6", "7"))
            self.assertFalse(ln.endswith((" G", " 6", " 7")), ln)

    def test_two_columns_read_column_by_column(self):
        left = [ln for ln in self.lines if ln.startswith("Left column")]
        right = [ln for ln in self.lines if ln.startswith("Right text")]
        self.assertEqual((len(left), len(right)), (4, 4))
        self.assertLess(self.lines.index(left[-1]), self.lines.index(right[0]))
        self.assertLess(self.lines.index("Lower left 2"), self.lines.index("Lower right 0"))

    def test_side_by_side_bands_are_two_tables(self):
        self.assertEqual(self.lines.count("| RANGE | DV |"), 2)
        self.assertIn("| Touch | 2 |", self.lines)
        self.assertIn("| LOS | 4 |", self.lines)

    def test_stat_box_label_stays_text(self):
        self.assertIn("**Skills:** Sneaking 3", self.lines)
        self.assertNotIn("Skills", self.lines[self.lines.index("| Touch | 2 |") - 1])

    def test_shaded_table_by_cell_rects(self):
        i = self.lines.index("| THING | UNIT PRICE | NOTES |")
        self.assertEqual(self.lines[i + 2:i + 9], [
            "| Widget | 5 | a small note |", "| Big Long Widget | 8 | a big note |", "| Gizmo | 7 | b note |",
            "| Extras: spare parts |  |  |", "| Doohickey | 9 | c note |", "| Spare Kit |  |  |",
            "| Sprocket | 2 | d note |"])

    def test_offset_sidebar_columns_read_column_by_column(self):
        order = [next(i for i, ln in enumerate(self.lines) if ln.endswith(" " + t) or ln.startswith(t + " "))
                 for t in ("a3", "b0", "b3", "c0", "c3", "d0")]
        self.assertEqual(order, sorted(order))
        self.assertLess(self.lines.index("#### A Sidebar Title Across The Two Text Columns"), order[3])

    def test_lookalikes_are_no_tables(self):
        self.assertFalse(any(ln.startswith(("| 1.", "| and talking", "| Made Powers")) for ln in self.lines))
        self.assertTrue(any("**Made Powers:**" in ln for ln in self.lines))

    def test_header_smaller_than_rows_and_wraps_after_dash_or_slash(self):
        i = self.lines.index("| TONIC IS: | AVAIL | COST |")
        self.assertEqual(self.lines[i + 2:i + 5], ["| Fizz Pop | 2(L) | 20 |", "| Glow Juice | 4 | 75/80 |",
                                                   "| Zing-Zang | 1 | 5 |"])

    def test_header_sign_stays_in_its_cell(self):
        i = self.lines.index("| # OF ZAPS | EFFECT |")
        self.assertEqual(self.lines[i + 2], "| 1 | Tingle |")
        self.assertNotIn("#", self.lines)

    def test_columns_with_no_whitespace_gutter_split_by_stream_order(self):
        left = [ln for ln in self.lines if ln.startswith("oooo")]
        self.assertEqual(left, ["o" * 40 + str(i) for i in range(4)])
        self.assertLess(self.lines.index(left[-1]), self.lines.index("right0 words"))
        self.assertIn("right3 words", self.lines)

    def test_small_label_and_tiny_raised_glyph_stay_on_their_line(self):
        self.assertIn("• **Points:** 2", self.lines)

    def test_anarchy_mode_unchanged(self):
        _, lines = _convert(sr6=False)
        self.assertNotIn("| GADGET | DV | COST |", lines)  # no header-band tables
        self.assertFalse(any(ln.startswith("#### ") for ln in lines))  # Anarchy's 3 size bands


if __name__ == "__main__":
    unittest.main()
