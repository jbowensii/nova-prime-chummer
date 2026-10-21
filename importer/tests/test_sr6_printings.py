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
from importer.sr6.recipes import crb, crb_city, printing, skipped
from importer.sr6.run import older_extras, remove, run, same_ids
from importer.tests.test_sr6_crb import BOOK_MD
from importer.tests.test_sr6_crb_city import CITY, CITY_MD, SHA as CITY_SHA

OLD, MID, NEW = b"%PDF- old", b"%PDF- mid", b"%PDF- new"
# (listed out of order: a printing ranks by the month it was published, not by its place in the list)
PRINTINGS = {
    hashlib.sha256(b).hexdigest(): (month, label)
    for b, month, label in (
        (NEW, "2099-01", "New Printing"),
        (OLD, "2090-06", "Old Printing"),
        (MID, "2095-11", "Middle Printing"),
    )
}


def _sha(b):
    return hashlib.sha256(b).hexdigest()


def _data(kind, *rows):
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="%s">%s</sr6:data>\n'
        % (kind, "".join(rows))
    )


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

    def test_the_current_printing_outranks_a_later_dated_one(self):
        with mock.patch.object(crb, "CURRENT", (_sha(OLD),)):  # (the oldest by month, but the book's Current Printing)
            old = self.book("a-old", OLD)
            new = self.book("b-new", NEW, BOOK_MD.replace("Zap Gun", "Zip Gun"))
            run(old, self.custom, convert_pdf=False)
            run(new, self.custom, convert_pdf=False)
            self.assertEqual(self.status(old), ("done", ""))
            self.assertEqual(self.status(new), ("superseded", "Superseded by Old Printing"))
            self.assertIn("crb.zap-gun", self.weapons())
            self.assertNotIn("crb.zip-gun", self.weapons())

    def test_an_entry_only_an_older_printing_prints_is_added_to_the_loaded_one_in_either_order(self):
        # (made up: the old printing prints a Zap Cannon row and its text the new one leaves out, and a Zip Gun that is
        # the new one's Zap Gun renamed: the cannon is added, with its text, the renamed gun is not)
        old_md = (
            BOOK_MD.replace("Zap Gun", "Zip Gun")
            .replace("| Zapp Rifle |", "| Zap Cannon | 7P | SS | 5/9/—/— | 5(m) | 6 | 6(I) | 5,000¥ |\n| Zapp Rifle |")
            .replace("#### Zip Gun\n", "#### Zap Cannon\nA cannon that zaps a lot.\n#### Zip Gun\n")
        )
        for order in (("new", "old"), ("old", "new")):
            with self.subTest(order=order):
                self.setUp()
                ds = {"new": self.book("a-new", NEW), "old": self.book("b-old", OLD, old_md)}
                for k in order:
                    run(ds[k], self.custom, convert_pdf=False)
                w = {e.get("id"): e for e in ET.fromstring(self.weapons().encode("utf8"))}
                self.assertIn("crb.zap-gun", w)
                self.assertNotIn("crb.zip-gun", w)  # (renamed, not a gap)
                self.assertEqual((w["crb.zap-cannon"].get("dv"), w["crb.zap-cannon"].get("cost")), ("7P", "5000"))
                texts = Path(self.custom, "texts", "crb.xml").read_text(encoding="utf8")
                self.assertIn('id="crb.zap-cannon"', texts)
                self.assertIn("A cannon that zaps a lot.", texts)
                self.assertEqual(self.status(ds["new"]), ("done", ""))
                rep = [
                    r for r in xmlio.read_import(ds["new"]).findall("report/row") if r.get("kind") == "printing-extra"
                ]
                self.assertEqual([(r.get("id"), r.get("printing")) for r in rep], [("zap-cannon", "Old Printing")])

    def test_an_older_extra_is_not_added_when_the_loaded_printing_has_the_item_under_another_id(self):
        files = {
            "gear.xml": _data("gear", '<gear id="focus" page="5" category="foci" cost="1"><name>Ritual</name></gear>')
        }
        old = {
            "gear.xml": _data(
                "gear",
                '<gear id="foci.ritual" page="5" category="foci" cost="1"><name>Ritual</name></gear>'
                '<gear id="ritual" page="9" category="Formula" cost="2"><name>Ritual</name></gear>',
            )
        }
        olds = [("Old", old, "")]
        got, _ = same_ids(files, "", olds)  # (the older printing's id for the focus: its Formula row took the bare one)
        self.assertEqual([e.get("id") for e in ET.fromstring(got["gear.xml"].encode("utf8"))], ["foci.ritual"])
        got, _ = older_extras(got, "", olds)  # (the Formula is another item: added, under its own id)
        self.assertEqual(
            [e.get("id") for e in ET.fromstring(got["gear.xml"].encode("utf8"))], ["foci.ritual", "ritual"]
        )
        again, _ = older_extras(got, "", olds)
        self.assertEqual(again, got)  # (nothing more to add)

    def test_same_ids_moves_the_text_with_the_id_and_leaves_ambiguous_names_alone(self):
        files = {
            "gear.xml": _data(
                "gear",
                '<gear id="a" page="5" category="x"><name>Twin</name></gear>'
                '<gear id="a-2" page="6" category="x"><name>Twin</name></gear>'
                '<gear id="b" page="7" category="x"><name>Solo</name></gear>',
            )
        }
        old = {
            "gear.xml": _data(
                "gear",
                '<gear id="x.a" page="5" category="x"><name>Twin</name></gear>'
                '<gear id="x.b" page="7" category="x"><name>Solo</name></gear>',
            )
        }
        texts = '<sr6:data><text of="gear" id="a">one</text><text of="gear" id="b">two</text></sr6:data>'
        got, new_texts = same_ids(files, texts, [("Old", old, "")])
        self.assertEqual([e.get("id") for e in ET.fromstring(got["gear.xml"].encode("utf8"))], ["a", "a-2", "x.b"])
        self.assertEqual(
            new_texts, '<sr6:data><text of="gear" id="a">one</text><text of="gear" id="x.b">two</text></sr6:data>'
        )

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
        self.assertIn(
            'href="crb-fz/qualities.xml"', Path(self.custom, "imported", "index.xml").read_text(encoding="utf8")
        )
        remove(old, self.custom)
        self.assertFalse(os.path.exists(os.path.join(self.custom, "imported", "crb-fz")))
        self.assertIn("crb.zap-gun", self.weapons())

    def test_field_by_field_an_open_field_takes_the_newest_older_printing_valid_value_in_either_order(self):
        # (made up: the new printing prints the Zapp Rifle's cost as no value, `12x`; the middle and old ones print it,
        # and the old one another Zap Gun cost, which the new one's own valid value outranks)
        mid_md = BOOK_MD.replace("| 12x |", "| 1,100¥ |")
        old_md = BOOK_MD.replace("| 12x |", "| 1,200¥ |").replace("| 2 | 2 | 1,250¥ |", "| 2 | 2 | 999¥ |")
        for order in (("new", "old", "mid"), ("old", "mid", "new"), ("mid", "new", "old")):
            with self.subTest(order=order):
                self.setUp()
                ds = {
                    "new": self.book("a-new", NEW),
                    "mid": self.book("b-mid", MID, mid_md),
                    "old": self.book("c-old", OLD, old_md),
                }
                for k in order:
                    run(ds[k], self.custom, convert_pdf=False)
                w = {e.get("id"): e for e in ET.fromstring(self.weapons().encode("utf8"))}
                rifle = w["crb.zapp-rifle"]
                self.assertEqual(
                    rifle.get("cost"), "1100"
                )  # (the newest printing printing it: the middle one, not the old)
                self.assertEqual(
                    (rifle.find("found").get("how"), rifle.find("found").get("field"), rifle.find("found").text),
                    ("printing", "cost", "Middle Printing"),
                )
                self.assertIsNone(rifle.find("issue"))
                self.assertEqual(w["crb.zap-gun"].get("cost"), "1250")  # (its own valid value wins)
                self.assertEqual(self.status(ds["new"]), ("done", ""))

    def test_the_same_printing_twice_stays_as_before(self):
        a, b = self.book("a", NEW), self.book("b", NEW)
        run(a, self.custom, convert_pdf=False)
        run(b, self.custom, convert_pdf=False)
        self.assertEqual((self.status(a)[0], self.status(b)[0]), ("done", "done"))

    def sources(self):
        return {s.get("id"): s for s in ET.parse(os.path.join(self.custom, "imported", "sources.xml")).getroot()}

    def test_a_city_chapter_is_listed_in_sources_xml_like_its_book_also_from_a_superseded_printing(self):
        new = self.book("a-new", NEW)
        old = self.book("b-old", OLD, BOOK_MD + CITY_MD)
        with mock.patch.dict(crb_city.CITIES, {_sha(OLD): CITY[CITY_SHA]}, clear=True):
            run(new, self.custom, convert_pdf=False)
            run(old, self.custom, convert_pdf=False)
        self.assertEqual(self.status(old)[0], "superseded")
        city = self.sources().get("CRB-FZ")
        self.assertIsNotNone(city)
        self.assertEqual(city.find("name").text, "Made-Up Core Rulebook: City Edition Fizzburg")
        self.assertEqual(
            (city.get("publisher"), city.get("canon"), city.get("sha256")),
            (self.sources()["CRB"].get("publisher"), "true", _sha(OLD)),
        )
        self.assertEqual(city.get("texts"), "texts/crb-fz.xml")
        self.assertEqual(
            self.sources()["CRB"].get("sha256"), _sha(NEW)
        )  # the superseded printing's own source isn't listed
        remove(old, self.custom)
        self.assertNotIn("CRB-FZ", self.sources())

    def test_reimporting_a_superseded_printing_from_before_city_chapters_reads_its_chapter_and_stays_superseded(self):
        new = self.book("a-new", NEW)
        old = self.book("b-old", OLD, BOOK_MD.replace("Zap Gun", "Zip Gun") + CITY_MD)
        with mock.patch.dict(crb_city.CITIES, {}, clear=True):  # the city chapter code didn't exist yet
            run(new, self.custom, convert_pdf=False)
            run(old, self.custom, convert_pdf=False)
        self.assertIsNone(xmlio.read_import(old).get("extra"))
        with mock.patch.dict(crb_city.CITIES, {_sha(OLD): CITY[CITY_SHA]}, clear=True):
            xmlio.write_status(old, "queued")  # the server's Re-import: queued, remove, run
            remove(old, self.custom)
            run(old, self.custom, convert_pdf=False)
        self.assertEqual(self.status(old), ("superseded", "Superseded by New Printing"))
        self.assertEqual(self.status(new), ("done", ""))
        self.assertTrue(os.path.isfile(os.path.join(self.custom, "imported", "crb-fz", "qualities.xml")))
        self.assertIn("crb.zap-gun", self.weapons())
        self.assertNotIn("crb.zip-gun", self.weapons())
        self.assertEqual(self.loaded_files()["CRB"], _sha(NEW))
        self.assertIn("CRB-FZ", self.loaded_files())

    def test_removing_a_duplicate_city_edition_keeps_the_city_chapter_the_other_copy_loads(self):
        # the server's merge of one PDF uploaded twice: the duplicate is removed (with its folder), the copy kept stays whole
        a, b = self.book("a", OLD, BOOK_MD + CITY_MD), self.book("b", OLD, BOOK_MD + CITY_MD)
        with mock.patch.dict(crb_city.CITIES, {_sha(OLD): CITY[CITY_SHA]}, clear=True):
            run(a, self.custom, convert_pdf=False)
            run(b, self.custom, convert_pdf=False)
        remove(a, self.custom, forget=True)
        self.assertEqual(self.status(b), ("done", ""))
        self.assertTrue(os.path.isfile(os.path.join(self.custom, "imported", "crb-fz", "qualities.xml")))
        self.assertTrue(os.path.isfile(os.path.join(self.custom, "texts", "crb-fz.xml")))
        self.assertIn(
            'href="crb-fz/qualities.xml"', Path(self.custom, "imported", "index.xml").read_text(encoding="utf8")
        )
        self.assertIn("crb.zap-gun", self.weapons())
        remove(b, self.custom)  # the last copy: the city chapter goes with it
        self.assertFalse(os.path.exists(os.path.join(self.custom, "imported", "crb-fz")))


class SkippedTest(unittest.TestCase):
    def test_the_core_rulebook_printings_rank_by_date(self):
        ranked = [label.split("(")[1].split(",")[0] for _, label in sorted(printing(s) for s in crb.SHA256)]
        # Seattle 2021, Berlin 2023, Hong Kong 2025, then the Current Printing (2019: the owner's newest, 2026-10-15)
        self.assertEqual(ranked, ["CAT28000S", "CAT28000B", "CAT28000H", "CAT28000"])
        self.assertEqual(crb.CURRENT, (crb.SHA256[0],))
        self.assertTrue(all(len(month) == 7 and month[4] == "-" for month, _ in crb.PRINTINGS.values()))
        self.assertEqual(set(crb.PRINTINGS), set(crb.SHA256))

    def test_known_files_with_nothing_to_import(self):
        cases = [
            ({"title": "Shadowrun: Gun Rack (Weapon Cards)"}, "", "card deck"),
            ({"title": ""}, "Shadowrun 6e-Rides-Vehicle Cards-CAT28509.pdf", "card deck"),
            ({"title": "about:blank"}, "Shadowrun 6e-Seattle Metroplex Map-Map-none.pdf", "map"),
            ({"title": ""}, "Shadowrun 6e-Adversary-Enhanced Fiction-none.pdf", "fiction"),
            ({"title": ""}, "Shadowrun 6e-Sixth World Gamemaster's Screen-Accessory-CAT28001.pdf", "images only"),
            ({"title": "Firing Squad Errata & FAQ"}, "", "errata"),
            ({"title": ""}, "SR6-Core-Rulebook-Errata-Feb-2020.pdf", "errata"),
            ({"title": "Shadowrun Sixth World Record Sheet"}, "", "character sheet"),
            (
                {"title": "", "sha256": "3abee49d736ac3f337e6e0ffdb47b5a360eb32e7ef16237237a788c731b5a6a5"},
                "original.pdf",
                "errata",
            ),
        ]
        for meta, name, why in cases:
            self.assertIn(why, skipped(meta, name) or "", (meta, name))
        for meta, name in (
            ({"title": "Shadowrun, Sixth World Core Rulebook"}, "Shadowrun 6e-Sixth World Core Rulebook.pdf"),
            ({"title": "Rides of the Sixth World"}, "made-up.pdf"),
            ({}, None),
        ):
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


class OlderCatalogTest(unittest.TestCase):
    def test_an_older_printing_with_no_book_md_or_that_no_longer_reads_gives_nothing(self):
        from importer.sr6.run import _catalog

        class Broken:
            ID = "zz"

            def extract(self, text, opts):
                raise ValueError("made-up reader failure")

        with tempfile.TemporaryDirectory() as d:
            self.assertEqual(_catalog(Broken(), d, d), ({}, ""))
            Path(d, "book.md").write_text("<!-- page 1 -->\n# MADE-UP\n", encoding="utf8")
            self.assertEqual(_catalog(Broken(), d, d), ({}, ""))


if __name__ == "__main__":
    unittest.main()
