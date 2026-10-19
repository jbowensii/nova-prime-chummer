"""The converter's opt-in SR6 layout (importer/sr6/layout.py), on the made-up sr6_layout_pdf()."""
import os
import tempfile
import unittest
from types import SimpleNamespace

from importer.convert import convert
import pdfplumber

from importer.sr6.layout import BOLD, INDENT, Fonts, _first_marks, _is_furniture, furniture, one_layer, rejoin_ligatures
from importer.tests.minipdf import sr6_doubled_pdf, sr6_layout_pdf


def _convert(sr6=True, make=sr6_layout_pdf):
    d = tempfile.mkdtemp()
    pdf, md = os.path.join(d, "sr6.pdf"), os.path.join(d, "sr6.md")
    with open(pdf, "wb") as f:
        f.write(make())
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
        self.assertEqual(self.meta["converter"], "sr6-8")
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

    def test_a_card_keeps_its_edges(self):
        book, card = SimpleNamespace(width=612, height=792), SimpleNamespace(width=360, height=216)
        self.assertTrue(_is_furniture(20, 100, book))
        self.assertFalse(_is_furniture(20, 100, card))  # a card's text runs to the edge (Johnson 'Dex)
        self.assertFalse(_is_furniture(340, 200, card))

    def test_first_cell_marks_indent_and_bold(self):
        w = lambda x, font="Sans-Regular": [{"x0": x, "chars": [{"fontname": "ABC+" + font, "text": "Z"}]}]
        # a flush-left column: the rows set 9 pt in are indented; a bold name among regular ones is marked
        self.assertEqual(_first_marks([w(100), w(100), w(109), w(109), w(100, "Sans-Bold"), w(109)]),
                         ["", "", INDENT, INDENT, BOLD, INDENT])
        # a centred column (a left edge for each name): no indent
        self.assertEqual(_first_marks([w(190), w(202), w(199), w(194), w(196)]), [""] * 5)

    def test_a_table_row_in_the_bottom_band_stays(self):
        page = SimpleNamespace(width=612, height=792)
        w = lambda text, top, font, size: {"text": text, "x0": 300, "top": top, "size": size, "upright": True,
                                            "chars": [{"fontname": "ABC+" + font}]}
        words = [w("Fizz", 700, "Sans-Regular", 7), w("Zen", 770, "Sans-Regular", 7), w("17", 775, "Disp-Regular", 9)]
        fonts = Fonts("Serif", 10.5, "Disp", {}, frozenset({("Disp", 9.0)}))  # the running feet: 9 pt display face
        self.assertEqual([x["text"] for x in furniture(page, words, fonts)], ["Fizz", "Zen"])
        self.assertEqual([x["text"] for x in furniture(page, words)], ["Fizz"])  # (no fonts: the whole band goes)

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
        self.assertIn("| DR | CM |", self.lines)  # its header on the baseline of the right column's label line
        self.assertIn("| 4 | 9 |", self.lines)
        self.assertIn("**Powers:** Zip", self.lines)
        self.assertNotIn("Skills", self.lines[self.lines.index("| Touch | 2 |") - 1])

    def test_shaded_table_by_cell_rects(self):
        i = self.lines.index("| THING | UNIT PRICE | NOTES |")
        self.assertEqual(self.lines[i + 2:i + 9], [
            "| Widget | 5 | a small note |", "| Big Long Widget | 8 | a big note |", "| Gizmo | 7 | b note |",
            "| Extras: spare parts |  |  |", "| Doohickey | 9 | c note |", "|  Spare Kit |  |  |",  # (bold among regular names: marked)
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

    def test_heading_levels_given_by_a_recipe(self):
        d = tempfile.mkdtemp()
        pdf, md = os.path.join(d, "sr6.pdf"), os.path.join(d, "sr6.md")
        with open(pdf, "wb") as f:
            f.write(sr6_layout_pdf())
        convert(pdf, md, sr6=True, levels={21.0: 1, 15.0: 2})
        with open(md, encoding="utf8") as f:
            lines = f.read().splitlines()
        self.assertIn("# Gadget Shop", lines)
        self.assertIn("## Shop Rules", lines)
        self.assertNotIn("# GADGETS", lines)
        convert(pdf, md, sr6=True, heading="Helvetica")  # a family set in no line: no headings by font
        with open(md, encoding="utf8") as f:
            lines = f.read().splitlines()
        self.assertNotIn("# GADGETS", lines)
        self.assertIn("GADGETS", lines)

    def test_anarchy_mode_unchanged(self):
        _, lines = _convert(sr6=False)
        self.assertNotIn("| GADGET | DV | COST |", lines)  # no header-band tables
        self.assertFalse(any(ln.startswith("#### ") for ln in lines))  # Anarchy's 3 size bands



class DoubledLayerTest(unittest.TestCase):
    """A page whose text layer is drawn twice (the made-up sr6_doubled_pdf())."""

    def test_second_layer_dropped_double_letters_kept(self):
        _, lines = _convert(make=sr6_doubled_pdf)
        page1 = lines[1:lines.index("<!-- page 2 -->")]
        self.assertEqual(page1, ["# Arrow Kill Drill", "**Bold Lead:** the first office was difficult"]
                         + [f"Plain words for the doubled page, line {i}" for i in range(5)])

    def test_faux_bold_drawn_twice_deduped_page_drawn_once_kept(self):
        _, lines = _convert(make=sr6_doubled_pdf)
        self.assertIn("# Faux Bold Heading", lines)
        self.assertIn("Plain words for the single page, line 4", lines)

    def test_one_layer_keeps_first_layer_and_a_char_drawn_once_after_the_copy(self):
        d = tempfile.mkdtemp()
        pdf = os.path.join(d, "x.pdf")
        with open(pdf, "wb") as f:
            f.write(sr6_doubled_pdf())
        with pdfplumber.open(pdf) as doc:
            chars = doc.pages[0].chars
            kept = one_layer(chars)
            single = doc.pages[1].chars
            self.assertEqual(one_layer(single[17:]), single[17:])  # no copy, nothing on top of another: untouched
        self.assertEqual(len(kept), (len(chars) - 1) // 2 + 1)
        self.assertEqual(kept[:-1], chars[:len(kept) - 1])
        self.assertEqual(kept[-1]["text"], "9")

    def test_anarchy_mode_keeps_the_doubled_text(self):
        _, lines = _convert(sr6=False, make=sr6_doubled_pdf)
        self.assertTrue(any("fi rst" in ln for ln in lines))  # Anarchy's converter is unchanged


class LigatureTest(unittest.TestCase):
    VOCAB = " Stuff, off. A payoff. Until is the light and dawn, a movie."

    def test_joined(self):
        for split, whole in [("the fi rst step", "the first step"), ("an offi ce", "an office"),
                             ("diffi cult", "difficult"), ("infl uence", "influence"), ("fl oor", "floor"),
                             ("its eff ects", "its effects"), ("a good fi t", "a good fit"), ("so fi -\nnally", "so fi-\nnally"), ("**fi nd** it", "**find** it"),
                             ("twenty-fi ve", "twenty-five"), ("a fi refi ght", "a firefight"), ("Fi nd it", "Find it")]:
            self.assertEqual(rejoin_ligatures(split + self.VOCAB), whole + self.VOCAB, split)

    def test_left_alone(self):
        for text in ["turn off the light", "the stuff is here", "a payoff until dawn", "a sci-fi movie",
                     "Arrow Kill", "fi"]:
            self.assertEqual(rejoin_ligatures(text + self.VOCAB), text + self.VOCAB, text)


if __name__ == "__main__":
    unittest.main()


def _word(text, x0, top, bold=False, base=None):
    font = "Sans-Bold" if bold else "Sans"
    return {"text": text, "x0": x0, "x1": x0 + 6 * len(text), "top": top, "bottom": top + 7, "size": 7,
            "base": top + 7 if base is None else base, "chars": [{"text": c, "fontname": font} for c in text]}


class TwoBoxesSideBySideTest(unittest.TestCase):
    """Two boxes in two text columns whose band rows line up (Double Clutch p. 130, Deadly Arts' Combat MAID), on
    made-up words: a line is split where the boxes part, or at the gutter where the baselines differ."""
    BOXES = [{"x0": 50, "x1": 280, "top": 100, "bottom": 300}, {"x0": 300, "x1": 530, "top": 100, "bottom": 300}]

    def test_rows_in_two_boxes_split(self):
        from importer.sr6.layout import _column_parts
        line = [_word("3/4", 60, 150), _word("5", 120, 150), _word("2", 320, 150), _word("9", 400, 150)]
        self.assertEqual([[w["text"] for w in p] for p in _column_parts(line, self.BOXES)], [["3/4", "5"], ["2", "9"]])

    def test_one_box_row_stays_whole(self):
        from importer.sr6.layout import _column_parts
        line = [_word("Alpha", 60, 150), _word("Beta", 220, 150)]
        self.assertEqual(len(_column_parts(line, self.BOXES)), 1)
        self.assertEqual(len(_column_parts(line)), 1)

    def test_no_boxes_split_at_the_gutter_by_baseline(self):
        from importer.sr6.layout import _column_parts
        line = [_word("AVAIL", 60, 150, True), _word("COST", 120, 150, True),
                _word("SLOTS", 320, 152, True, base=159.5), _word("RATING", 400, 152, True, base=159.5)]
        self.assertEqual([[w["text"] for w in p] for p in _column_parts(line, mid=250)], [["AVAIL", "COST"], ["SLOTS", "RATING"]])
        self.assertEqual(len(_column_parts(line)), 1)  # (not across the gutter: one table's two-line header)

    def test_a_header_with_values_beside_it_never_stacks(self):
        from importer.sr6.layout import _headers
        left = [_word("AVAIL", 60, 140, True), _word("COST", 120, 140, True)]
        line = [_word("2", 62, 150), _word("70", 122, 150), _word("OPTIONS", 200, 150, True), _word("CAP", 260, 150, True)]
        heads = _headers([left, line], 7)
        self.assertEqual(sorted(" ".join(w["text"] for w in h) for h in heads), ["AVAIL COST", "OPTIONS CAP"])


class WordsLineByLineTest(unittest.TestCase):
    """A two-line header cell (made-up letters) next to a one-line cell centred between its lines: the word finder's
    3 pt line tolerance chains the three and interleaves the two lines' letters; layout.words keeps them apart."""

    @staticmethod
    def _char(t, x0, top, i):
        return {"text": t, "x0": x0, "x1": x0 + 4, "top": top, "bottom": top + 5, "doctop": top, "upright": True,
                "size": 5, "i": i, "matrix": (5, 0, 0, 5, x0, 700 - top)}

    def test_two_header_lines_stay_two_words(self):
        from importer.sr6.layout import words
        cs = [self._char("A", 0, 10, 0), self._char("B", 4, 10, 1), self._char("C", 50, 13, 2), self._char("D", 54, 13, 3),
              self._char("E", 1.5, 16, 4), self._char("F", 5.5, 16, 5)]
        kw = dict(extra_attrs=["size"], keep_blank_chars=False, return_chars=True)
        self.assertNotEqual(sorted(w["text"] for w in pdfplumber.utils.extract_words(cs, **kw)), ["AB", "CD", "EF"])
        got = words(cs, **kw)
        self.assertEqual(sorted(w["text"] for w in got), ["AB", "CD", "EF"])
        self.assertEqual({w["text"]: w["top"] for w in got}, {"AB": 10, "CD": 13, "EF": 16})


class StaggeredColumnsTest(unittest.TestCase):
    """Two text columns whose lines sit a few points apart (a rules box on a Street Wyrd page), so no row holds a word
    from each side: the gutter is a clear strip down the page, not a gap in any row. Made-up words."""

    @staticmethod
    def _rows():
        w = lambda x0, x1, top: {"x0": x0, "x1": x1, "top": top, "bottom": top + 8, "size": 8, "text": "w", "chars": [{}]}
        rows = [[w(90, 199, 39), w(344, 558, 39)]]  # a heading over the left column, beside the right one's first line
        for k in range(1, 6):
            rows += [[w(331, 558, 39 + 12 * k + 3)], [w(90, 318, 39 + 12 * k + 6)]]
        return rows

    def test_the_clear_strip_is_the_gutter(self):
        from importer.pdf.columns import find_gutter
        from importer.sr6.layout import GUTTER_TOL
        self.assertTrue(318 < find_gutter(self._rows(), 612, tol=GUTTER_TOL) < 331)

    def test_the_other_game_is_not_asked(self):
        from importer.pdf.columns import find_gutter
        self.assertIsNone(find_gutter(self._rows(), 612))
