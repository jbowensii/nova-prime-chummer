import os
import tempfile
import unittest

from importer.convert import convert
from importer.tests.minipdf import (
    single_column_with_outlier_pdf,
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
    def test_pages_headings_tables(self):
        meta, text, _ = _convert_to_lines(two_page_pdf(), "t")
        self.assertEqual(meta["pages"], 2)
        self.assertEqual(meta["converter"], "1")
        self.assertIn("<!-- page 1 -->", text)
        self.assertIn("<!-- page 2 -->", text)
        self.assertRegex(text, r"(?m)^# Shadow Test$")
        self.assertRegex(text, r"(?m)^\| Name \| Rating \|$")
        self.assertIn("|---|---|", text)
        self.assertEqual(len(meta["sha256"]), 64)

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


if __name__ == "__main__":
    unittest.main()
