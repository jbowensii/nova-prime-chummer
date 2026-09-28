import os
import tempfile
import unittest

from importer.convert import convert
from importer.tests.minipdf import (
    JUSTIFIED_WORDS,
    bold_label_pdf,
    bullets_then_indented_block_pdf,
    justified_paragraph_pdf,
    nested_table_pdf,
    single_column_with_outlier_pdf,
    striped_table_pdf,
    two_column_page_pdf,
    two_columns_uneven_sidebar_pdf,
    two_columns_with_band_pdf,
    two_page_pdf,
)


def _convert_to_lines(pdf_bytes, tmp_name):
    d = tempfile.mkdtemp()
    pdf, md = os.path.join(d, f"{tmp_name}.pdf"), os.path.join(d, f"{tmp_name}.md")
    open(pdf, "wb").write(pdf_bytes)
    meta = convert(pdf, md)
    text = open(md, encoding="utf8").read()
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.startswith("<!--")]
    return meta, text, lines


class ConvertTest(unittest.TestCase):
    def test_bold_runs_are_marked(self):
        _, _, lines = _convert_to_lines(bold_label_pdf(), "bold")
        self.assertEqual(lines, ["**Made Up Label:** some regular words.", "A plain line with no label.",
                                 "x **Solo:** more words.", "**Note - Topic:** words."])

    def test_pages_headings_tables(self):
        meta, text, _ = _convert_to_lines(two_page_pdf(), "t")
        self.assertEqual(meta["pages"], 2)
        self.assertEqual(meta["converter"], "4")
        self.assertIn("<!-- page 1 -->", text)
        self.assertIn("<!-- page 2 -->", text)
        self.assertRegex(text, r"(?m)^# Shadow Test$")
        self.assertRegex(text, r"(?m)^\| Name \| Rating \|$")
        self.assertIn("|---|---|", text)
        self.assertEqual(len(meta["sha256"]), 64)

    def test_merged_table_row_is_split_on_the_column_grid(self):
        _, _, lines = _convert_to_lines(striped_table_pdf(), "striped")
        self.assertEqual(lines, ["| Name | Effect |", "|---|---|", "| **Made Up Rig** | Plus one |",
                                 "| **Toy Kit** | Line one<br>line two |"])

    def test_table_nested_in_a_cell_is_part_of_the_outer_table(self):
        _, _, lines = _convert_to_lines(nested_table_pdf(), "nested")
        self.assertEqual(lines, ["| Name | Effect |", "|---|---|", "| **Made Up Rig** | Boxed<br>Inner |"])

    def test_two_columns_read_top_to_bottom_then_next_column(self):
        _, _, lines = _convert_to_lines(two_column_page_pdf(), "cols")
        self.assertEqual(
            lines, ["Alpha one", "Alpha two", "Alpha three", "Beta one", "Beta two", "Beta three"]
        )
        for ln in lines:
            self.assertFalse("Alpha" in ln and "Beta" in ln, f"columns merged in line: {ln!r}")

    def test_single_column_with_outlier_is_not_split_into_columns(self):
        # One centered/indented line among left-aligned body text must not
        # trick the gutter detector into treating the page as 2-column
        # (only one line would ever land on the "other side").
        _, _, lines = _convert_to_lines(single_column_with_outlier_pdf(), "outlier")
        self.assertEqual(
            lines,
            ["Intro one.", "Intro two.", "Special Note", "Intro three.", "Intro four."],
        )

    def test_full_width_band_splits_two_column_page_into_segments(self):
        _, _, lines = _convert_to_lines(two_columns_with_band_pdf(), "band")
        self.assertEqual(
            lines,
            [
                "Left one",
                "Left two",
                "Left three",
                "Right one",
                "Right two",
                "Right three",
                "Full width heading spans both columns right here now",
                "Left four",
                "Left five",
                "Right four",
                "Right five",
            ],
        )

    def test_uneven_sidebar_column_is_not_interleaved_with_main_column(self):
        # A short sidebar (2 lines) next to a long main column (5 lines) is
        # still a real gutter and must come out as two blocks, not
        # interleaved by y with the main column.
        _, _, lines = _convert_to_lines(two_columns_uneven_sidebar_pdf(), "sidebar")
        self.assertEqual(
            lines, ["Left0", "Left1", "Left2", "Left3", "Left4", "Side0", "Side1"]
        )

    def test_indented_block_below_bullets_is_not_a_second_column(self):
        # The indented block sits below the bullets, not beside them: no
        # vertical overlap between the two sides, so it's one column.
        _, _, lines = _convert_to_lines(bullets_then_indented_block_pdf(), "indent")
        self.assertEqual(
            lines, [f"- Bullet {i}" for i in range(6)] + ["Indented one", "Indented two", "After one", "After two"]
        )

    def test_justified_wide_word_gaps_keep_lines_intact(self):
        # Wide justified word gaps (> 1 em) that shift from line to line are
        # not a gutter, even where a few consecutive lines happen to align.
        _, _, lines = _convert_to_lines(justified_paragraph_pdf(), "justified")
        self.assertEqual(lines, [" ".join(ws) for ws in JUSTIFIED_WORDS])


if __name__ == "__main__":
    unittest.main()
