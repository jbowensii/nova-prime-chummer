import os
import tempfile
import unittest

from importer.convert import convert
from importer.tests.minipdf import two_column_page_pdf, two_page_pdf


class ConvertTest(unittest.TestCase):
    def test_pages_headings_tables(self):
        d = tempfile.mkdtemp()
        pdf, md = os.path.join(d, "t.pdf"), os.path.join(d, "t.md")
        open(pdf, "wb").write(two_page_pdf())
        meta = convert(pdf, md)
        text = open(md, encoding="utf8").read()
        self.assertEqual(meta["pages"], 2)
        self.assertEqual(meta["converter"], "1")
        self.assertIn("<!-- page 1 -->", text)
        self.assertIn("<!-- page 2 -->", text)
        self.assertRegex(text, r"(?m)^# Shadow Test$")
        self.assertRegex(text, r"(?m)^\| Name \| Rating \|$")
        self.assertIn("|---|---|", text)
        self.assertEqual(len(meta["sha256"]), 64)

    def test_two_columns_read_top_to_bottom_then_next_column(self):
        d = tempfile.mkdtemp()
        pdf, md = os.path.join(d, "cols.pdf"), os.path.join(d, "cols.md")
        open(pdf, "wb").write(two_column_page_pdf())
        convert(pdf, md)
        text = open(md, encoding="utf8").read()
        lines = [ln for ln in text.splitlines() if ln.strip()]
        self.assertIn("Alpha one", lines)
        self.assertIn("Alpha two", lines)
        self.assertIn("Beta one", lines)
        self.assertIn("Beta two", lines)
        self.assertLess(lines.index("Alpha one"), lines.index("Alpha two"))
        self.assertLess(lines.index("Alpha two"), lines.index("Beta one"))
        self.assertLess(lines.index("Beta one"), lines.index("Beta two"))
        for ln in lines:
            self.assertFalse("Alpha" in ln and "Beta" in ln, f"columns merged in line: {ln!r}")


if __name__ == "__main__":
    unittest.main()
