import os
import tempfile
import unittest

from importer.convert import convert
from importer.tests.minipdf import two_page_pdf


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


if __name__ == "__main__":
    unittest.main()
