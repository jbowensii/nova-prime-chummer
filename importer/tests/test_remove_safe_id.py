"""Removing a book never deletes outside custom/imported when its import.xml has been tampered with (a source id
or an extra source id that is a path, e.g. from a hand-edited backup)."""
import os
import tempfile
import unittest

from importer import __main__ as anarchy, library, xmlio
from importer.sr6 import run as sr6


class RemoveSafeIdTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = self.tmp.name
        self.custom = os.path.join(root, "data", "custom")
        self.book = os.path.join(root, "data", "library", "book1")
        self.victim = os.path.join(root, "data", "victim")
        for d in (os.path.join(self.custom, "imported"), self.book, self.victim):
            os.makedirs(d)
        with open(os.path.join(self.victim, "keep.txt"), "w") as f:
            f.write("keep")

    def tearDown(self):
        self.tmp.cleanup()

    def test_safe_id_pattern(self):
        for ok in ("CRB", "crb-hk", "SWC", "ml2083-03", "a_b"):
            self.assertTrue(library.SAFE_SOURCE_ID.fullmatch(ok), ok)
        for bad in ("..", "../victim", "..\\victim", "a/b", ".hidden", "", "x" * 65):
            self.assertIsNone(library.SAFE_SOURCE_ID.fullmatch(bad), bad)

    def test_anarchy_remove_ignores_a_path_source(self):
        xmlio.write_import(self.book, source="../../victim", file="book.pdf")
        anarchy.remove(self.book, self.custom, status=False)
        self.assertTrue(os.path.exists(os.path.join(self.victim, "keep.txt")))

    def test_sr6_drop_ignores_a_path_extra(self):
        sr6._drop(self.custom, "../../victim")
        sr6._drop(self.custom, "..")
        self.assertTrue(os.path.exists(os.path.join(self.victim, "keep.txt")))

    def test_sr6_drop_removes_a_plain_extra(self):
        d = os.path.join(self.custom, "imported", "crb-hk")
        os.makedirs(d)
        sr6._drop(self.custom, "CRB-HK")
        self.assertFalse(os.path.exists(d))


if __name__ == "__main__":
    unittest.main()
