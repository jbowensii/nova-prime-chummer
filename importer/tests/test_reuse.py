"""run --reuse (Books → Re-import all): a book folder holding only its PDF (and its upload record) imports from scratch; a
re-import after that keeps book.md when the same file was converted by the same converter, and converts again when the
PDF or the converter changed. Made-up PDF only (minipdf)."""
import io
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest import mock

from importer import convert as conv
from importer.__main__ import main
from importer.convert import CONVERTER_VERSION, reusable
from importer.tests.minipdf import two_page_pdf


def book_with_pdf_only():
    root = tempfile.mkdtemp()
    book, custom = os.path.join(root, "library", "b1"), os.path.join(root, "custom")
    os.makedirs(book)
    os.makedirs(custom)
    Path(book, "original.pdf").write_bytes(two_page_pdf())
    Path(book, "upload.xml").write_text('<upload file="made-up.pdf" size="1" sha256="00" uploaded="2026-10-06T00:00:00Z"/>\n', encoding="utf8")
    return book, custom


def run(book, custom, *flags):
    with redirect_stdout(io.StringIO()):
        return main(["run", book, "--custom", custom, "--reuse", "--file", "made-up.pdf", *flags])


class ReuseTest(unittest.TestCase):
    def test_pdf_only_imports_from_scratch(self):
        book, custom = book_with_pdf_only()
        self.assertFalse(reusable(book, CONVERTER_VERSION))  # nothing converted yet
        self.assertEqual(run(book, custom), 0)
        self.assertTrue(Path(book, "book.md").read_text(encoding="utf8").startswith("<!-- page 1 -->"))
        imp = Path(book, "import.xml").read_text(encoding="utf8")
        self.assertIn(f'converter="{CONVERTER_VERSION}"', imp)
        self.assertIn('file="made-up.pdf"', imp)
        # no recipe knows the made-up book: identified as one for the AI, the run itself done
        self.assertIn('state="needs-ai"', Path(book, "status.xml").read_text(encoding="utf8"))

    def test_reimport_keeps_book_md_from_the_same_pdf(self):
        book, custom = book_with_pdf_only()
        run(book, custom)
        with redirect_stdout(io.StringIO()):
            main(["remove", book, "--custom", custom])  # a re-import's first step; it keeps converter and sha256
        self.assertTrue(reusable(book, CONVERTER_VERSION))
        with mock.patch("importer.__main__.convert", side_effect=AssertionError("converted again")):
            self.assertEqual(run(book, custom), 0)

    def test_converts_again_after_the_pdf_or_the_converter_changed(self):
        book, custom = book_with_pdf_only()
        run(book, custom)
        self.assertFalse(reusable(book, CONVERTER_VERSION + "-next"))
        Path(book, "original.pdf").write_bytes(two_page_pdf() + b"\n% another printing\n")
        self.assertFalse(reusable(book, CONVERTER_VERSION))
        with mock.patch("importer.__main__.convert", wraps=conv.convert) as c:
            run(book, custom)
        c.assert_called_once()


if __name__ == "__main__":
    unittest.main()
