"""Several printings of one SR6 book (importer/sr6/run.py): the newest imported is the one loaded, the older ones listed
as superseded; removing the newest loads the next. And the known PDFs with nothing to import (recipes.skipped). Made-up
books (test_sr6_crb's), made-up printings."""
import hashlib
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

from importer import xmlio
from importer.sr6.recipes import crb, crb_city, skipped
from importer.sr6.run import remove, run
from importer.tests.test_sr6_crb import BOOK_MD
from importer.tests.test_sr6_crb_city import CITY, CITY_MD, SHA as CITY_SHA

OLD, MID, NEW = b"%PDF- old", b"%PDF- mid", b"%PDF- new"
PRINTINGS = {hashlib.sha256(b).hexdigest(): label for b, label in
             ((OLD, "Old Printing"), (MID, "Middle Printing"), (NEW, "New Printing"))}  # oldest first


def _sha(b):
    return hashlib.sha256(b).hexdigest()


class PrintingsTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.lib, self.custom = os.path.join(tmp, "library", "sr6"), os.path.join(tmp, "custom", "sr6")
        patch = mock.patch.dict(crb.PRINTINGS, PRINTINGS, clear=True)
        patch.start()
        self.addCleanup(patch.stop)

    def book(self, name, pdf, md=BOOK_MD):
        d = os.path.join(self.lib, name)
        os.makedirs(d)
        Path(d, "book.md").write_text(md, encoding="utf8")
        Path(d, "original.pdf").write_bytes(pdf)
        return d

    def status(self, d):
        s = ET.parse(os.path.join(d, "status.xml")).getroot()
        return s.get("state"), s.text or ""

    def weapons(self):
        p = os.path.join(self.custom, "imported", "crb", "weapons.xml")
        return Path(p).read_text(encoding="utf8") if os.path.exists(p) else ""

    def loaded_files(self):
        src = ET.parse(os.path.join(self.custom, "imported", "sources.xml")).getroot()
        return {s.get("id"): s.get("sha256") for s in src}

    def test_an_older_printing_imported_later_is_superseded(self):
        new = self.book("a-new", NEW)
        old = self.book("b-old", OLD, BOOK_MD.replace("Zap Gun", "Zip Gun"))
        run(new, self.custom, convert_pdf=False)
        self.assertIsNotNone(run(old, self.custom, convert_pdf=False))
        self.assertEqual(self.status(new), ("done", ""))
        self.assertEqual(self.status(old), ("superseded", "Superseded by New Printing"))
        self.assertIn("crb.zap-gun", self.weapons())
        self.assertNotIn("crb.zip-gun", self.weapons())
        self.assertEqual(self.loaded_files(), {"CRB": _sha(NEW)})
        self.assertEqual(xmlio.read_import(old).get("source"), "CRB")  # still listed as the core rulebook

    def test_a_newer_printing_replaces_the_loaded_one(self):
        old = self.book("a-old", OLD, BOOK_MD.replace("Zap Gun", "Zip Gun"))
        new = self.book("b-new", NEW)
        run(old, self.custom, convert_pdf=False)
        self.assertIn("crb.zip-gun", self.weapons())
        run(new, self.custom, convert_pdf=False)
        self.assertEqual(self.status(old), ("superseded", "Superseded by New Printing"))
        self.assertEqual(self.status(new), ("done", ""))
        self.assertIn("crb.zap-gun", self.weapons())
        self.assertNotIn("crb.zip-gun", self.weapons())  # nothing of the older printing's left
        texts = Path(self.custom, "texts", "crb.xml").read_text(encoding="utf8")
        self.assertNotIn('id="crb.zip-gun"', texts)
        self.assertEqual(self.loaded_files(), {"CRB": _sha(NEW)})

    def test_removing_the_newest_loads_the_next_newest(self):
        old = self.book("a-old", OLD, BOOK_MD.replace("Zap Gun", "Zip Gun"))
        mid = self.book("b-mid", MID, BOOK_MD.replace("Zap Gun", "Zop Gun"))
        new = self.book("c-new", NEW)
        for d in (mid, new, old):
            run(d, self.custom, convert_pdf=False)
        self.assertEqual(self.status(old), ("superseded", "Superseded by New Printing"))
        remove(new, self.custom)
        self.assertEqual(self.status(new)[0], "removed")
        self.assertEqual(self.status(mid), ("done", ""))
        self.assertEqual(self.status(old), ("superseded", "Superseded by Middle Printing"))
        self.assertIn("crb.zop-gun", self.weapons())
        self.assertNotIn("crb.zap-gun", self.weapons())
        self.assertEqual(self.loaded_files(), {"CRB": _sha(MID)})
        remove(mid, self.custom, forget=True)
        self.assertEqual(self.status(old), ("done", ""))
        self.assertIn("crb.zip-gun", self.weapons())

    def test_removing_a_superseded_printing_keeps_the_loaded_one(self):
        old = self.book("a-old", OLD, BOOK_MD.replace("Zap Gun", "Zip Gun"))
        new = self.book("b-new", NEW)
        run(old, self.custom, convert_pdf=False)
        run(new, self.custom, convert_pdf=False)
        remove(old, self.custom)
        self.assertEqual(self.status(new), ("done", ""))
        self.assertIn("crb.zap-gun", self.weapons())
        self.assertTrue(os.path.isfile(os.path.join(self.custom, "texts", "crb.xml")))
        self.assertEqual(self.loaded_files(), {"CRB": _sha(NEW)})

    def test_reimports_keep_the_newest_loaded(self):
        old = self.book("a-old", OLD, BOOK_MD.replace("Zap Gun", "Zip Gun"))
        new = self.book("b-new", NEW)
        run(old, self.custom, convert_pdf=False)
        run(new, self.custom, convert_pdf=False)
        for d in (new, old):  # the server's re-import: remove, then run
            remove(d, self.custom)
            run(d, self.custom, convert_pdf=False)
        self.assertEqual(self.status(new), ("done", ""))
        self.assertEqual(self.status(old), ("superseded", "Superseded by New Printing"))
        self.assertIn("crb.zap-gun", self.weapons())
        self.assertNotIn("crb.zip-gun", self.weapons())

    def test_a_superseded_city_edition_still_loads_its_city_chapter(self):
        new = self.book("a-new", NEW)
        old = self.book("b-old", OLD, BOOK_MD + CITY_MD)
        with mock.patch.dict(crb_city.CITIES, {_sha(OLD): CITY[CITY_SHA]}, clear=True):
            run(new, self.custom, convert_pdf=False)
            run(old, self.custom, convert_pdf=False)
        self.assertEqual(self.status(old)[0], "superseded")
        self.assertTrue(os.path.isfile(os.path.join(self.custom, "imported", "crb-fz", "qualities.xml")))
        self.assertIn('href="crb-fz/qualities.xml"', Path(self.custom, "imported", "index.xml").read_text(encoding="utf8"))
        remove(old, self.custom)
        self.assertFalse(os.path.exists(os.path.join(self.custom, "imported", "crb-fz")))
        self.assertIn("crb.zap-gun", self.weapons())

    def test_the_same_printing_twice_stays_as_before(self):
        a, b = self.book("a", NEW), self.book("b", NEW)
        run(a, self.custom, convert_pdf=False)
        run(b, self.custom, convert_pdf=False)
        self.assertEqual((self.status(a)[0], self.status(b)[0]), ("done", "done"))



class SkippedTest(unittest.TestCase):
    def test_the_core_rulebook_printings_are_in_order(self):
        cats = [label.split("(")[1].split(",")[0].rstrip(")") for label in crb.PRINTINGS.values()]
        self.assertEqual(cats, ["CAT28000", "CAT28000B", "CAT28000S", "CAT28000H"])  # oldest first
        self.assertEqual(set(crb.PRINTINGS), set(crb.SHA256))

    def test_known_files_with_nothing_to_import(self):
        cases = [({"title": "Shadowrun: Gun Rack (Weapon Cards)"}, "", "card deck"),
                 ({"title": ""}, "Shadowrun 6e-Rides-Vehicle Cards-CAT28509.pdf", "card deck"),
                 ({"title": "about:blank"}, "Shadowrun 6e-Seattle Metroplex Map-Map-none.pdf", "map"),
                 ({"title": ""}, "Shadowrun 6e-Adversary-Enhanced Fiction-none.pdf", "fiction"),
                 ({"title": ""}, "Shadowrun 6e-Sixth World Gamemaster's Screen-Accessory-CAT28001.pdf", "images only"),
                 ({"title": "Firing Squad Errata & FAQ"}, "", "errata"),
                 ({"title": ""}, "SR6-Core-Rulebook-Errata-Feb-2020.pdf", "errata"),
                 ({"title": "Shadowrun Sixth World Record Sheet"}, "", "character sheet"),
                 ({"title": "", "sha256": "3abee49d736ac3f337e6e0ffdb47b5a360eb32e7ef16237237a788c731b5a6a5"}, "original.pdf", "errata")]
        for meta, name, why in cases:
            self.assertIn(why, skipped(meta, name) or "", (meta, name))
        for meta, name in (({"title": "Shadowrun, Sixth World Core Rulebook"}, "Shadowrun 6e-Sixth World Core Rulebook.pdf"),
                           ({"title": "Rides of the Sixth World"}, "made-up.pdf"), ({}, None)):
            self.assertIsNone(skipped(meta, name), (meta, name))

    def test_a_skipped_file_is_not_a_failure(self):
        tmp = tempfile.mkdtemp()
        book, custom = os.path.join(tmp, "library", "sr6", "x"), os.path.join(tmp, "custom", "sr6")
        os.makedirs(book)
        Path(book, "book.md").write_text(BOOK_MD, encoding="utf8")  # its words would match the core rulebook
        self.assertIsNone(run(book, custom, convert_pdf=False, file_name="SR6-Core-Rulebook-Errata-Feb-2020.pdf"))
        s = ET.parse(os.path.join(book, "status.xml")).getroot()
        self.assertEqual((s.get("state"), s.text), ("skipped", "Nothing to import: errata (applied with its book)"))
        self.assertEqual(xmlio.read_import(book).get("file"), "SR6-Core-Rulebook-Errata-Feb-2020.pdf")
        self.assertFalse(os.path.exists(os.path.join(custom, "imported")))
        remove(book, custom)
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "removed")


if __name__ == "__main__":
    unittest.main()
