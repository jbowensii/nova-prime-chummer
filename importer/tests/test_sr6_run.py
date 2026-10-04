"""SR6 import run, remove and CLI (importer/sr6/run.py, importer/sr6/__main__.py) on the made-up book.md of
test_sr6_crb, with --md (no PDF)."""
import contextlib
import io
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from importer import xmlio
from importer.__main__ import main
from importer.sr6 import NS
from importer.sr6.__main__ import validate
from importer.sr6.run import remove, run
from importer.tests.test_sr6_crb import BOOK_MD


def _read(*p):
    return Path(*p).read_text(encoding="utf8")


class Sr6RunTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        self.lib, self.custom = os.path.join(tmp, "library", "sr6"), os.path.join(tmp, "custom", "sr6")
        self.book = self.new_book("book1")

    def new_book(self, name, md=BOOK_MD):
        d = os.path.join(self.lib, name)
        os.makedirs(d)
        Path(d, "book.md").write_text(md, encoding="utf8")
        return d

    def cli(self, *args):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(["sr6", *args])
        return code, out.getvalue()

    def state(self, book):
        return ET.parse(os.path.join(book, "status.xml")).getroot()

    def test_run_writes_the_catalog_under_the_sr6_root(self):
        code, out = self.cli("run", self.book, "--custom", self.custom, "--md")
        self.assertEqual(code, 0)
        self.assertIn('state="done" source="CRB"', out)
        crb = os.path.join(self.custom, "imported", "crb")
        weapons = _read(crb, "weapons.xml")
        self.assertIn(f'<sr6:data xmlns:sr6="{NS}" kind="weapons"', weapons)
        self.assertIn('<weapon id="crb.zap-gun"', weapons)
        self.assertIn('<skill id="crb.tinkering"', _read(crb, "skills.xml"))  # Anarchy leaves <skill> ids unscoped
        self.assertIn('parent="crb.making-trouble"', _read(crb, "rules.xml"))
        texts = ET.parse(os.path.join(self.custom, "texts", "crb.xml")).getroot()
        self.assertEqual(texts.tag, f"{{{NS}}}data")
        self.assertIn(("weapons", "crb.zap-gun"), {(t.get("of"), t.get("id")) for t in texts})
        self.assertIn('<file href="crb/weapons.xml"/>', _read(self.custom, "imported", "index.xml"))
        src = ET.parse(os.path.join(self.custom, "imported", "sources.xml")).getroot()
        self.assertEqual((src.tag, src[0].get("id"), src[0].get("texts")), (f"{{{NS}}}data", "CRB", "texts/crb.xml"))
        self.assertEqual(validate(self.custom), [])  # the sample runners and their list too
        lst = ET.parse(os.path.join(self.custom, "imported", "samples.xml")).getroot()
        self.assertEqual([(x.get("source"), x.get("href"), x.get("name"), x.get("role")) for x in lst],
                         [("CRB", "crb/samples/crb.glow-runner.xml", "Glow Runner", "Archetype"),
                          ("CRB", "crb/samples/crb.bit-whisperer.xml", "Bit Whisperer", "Archetype")])
        self.assertIn('metatype="crb.glimmerkin"', _read(crb, "samples", "crb.glow-runner.xml"))
        self.assertNotIn("samples", _read(self.custom, "imported", "index.xml"))  # never a catalog file
        self.assertTrue(os.path.isfile(os.path.join(self.book, "regrouped.md")))
        imp = xmlio.read_import(self.book)
        self.assertEqual((imp.get("recipe"), imp.get("source"), imp.get("converter")), ("crb", "CRB", "sr6-1"))
        rows = {(r.get("kind"), r.get("name")): r.attrib for r in imp.iter("row")}
        self.assertEqual(rows[("unpaired-row", "Lost Blaster")]["page"], "250")  # regroup's report, printed pages
        self.assertIn("unknown-column", {k for k, _ in rows})  # and the recipe's
        self.assertEqual({f.get("name"): f.get("entries") for f in imp.iter("file")}["weapons.xml"], "5")

    def test_anarchy_texts_keep_their_root(self):
        self.assertIn('<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="texts"',
                      xmlio.merged_texts(os.path.join(self.custom, "none.xml"), [("spells", "x", "t")]))

    def test_no_recipe_fails(self):
        other = self.new_book("other", "<!-- page 1 -->\n# Some Other Game\nText.\n")
        self.assertIsNone(run(other, self.custom, convert_pdf=False))
        self.assertEqual((self.state(other).get("state"), self.state(other).text), ("failed", "no SR6 recipe matched this book"))
        self.assertFalse(os.path.exists(os.path.join(self.custom, "imported")))

    def test_remove_keeps_another_book_of_the_source(self):
        second = self.new_book("book2")
        run(self.book, self.custom, convert_pdf=False)
        run(second, self.custom, convert_pdf=False)
        remove(self.book, self.custom)
        crb = os.path.join(self.custom, "imported", "crb")
        self.assertTrue(os.path.isfile(os.path.join(crb, "weapons.xml")))
        self.assertTrue(os.path.isfile(os.path.join(self.custom, "texts", "crb.xml")))
        self.assertEqual(self.state(self.book).get("state"), "removed")
        self.assertEqual(self.cli("remove", second, "--custom", self.custom)[0], 0)
        self.assertFalse(os.path.exists(crb))
        self.assertFalse(os.path.exists(os.path.join(self.custom, "texts", "crb.xml")))
        self.assertNotIn("crb/", _read(self.custom, "imported", "index.xml"))
        self.assertEqual(len(ET.parse(os.path.join(self.custom, "imported", "samples.xml")).getroot()), 0)
        src = ET.parse(os.path.join(self.custom, "imported", "sources.xml")).getroot()
        self.assertEqual((src.tag, len(src)), (f"{{{NS}}}data", 0))

    def test_summary_prints_counts_and_report(self):
        run(self.book, self.custom, convert_pdf=False)
        code, out = self.cli("summary", self.book)
        self.assertEqual(code, 0)
        self.assertIn("state: done", out)
        self.assertRegex(out, r"weapons\.xml\s+5")
        self.assertIn("unpaired-row: 13", out)  # rows with no description of their own (the made-up alias isn't the book's)
        self.assertIn("name=Lost Blaster", out)

    def test_check_command_on_a_made_up_pdf(self):
        from importer.tests.minipdf import sr6_layout_pdf
        pdf = os.path.join(self.lib, "made-up.pdf")
        Path(pdf).write_bytes(sr6_layout_pdf())
        scratch = os.path.join(self.lib, "scratch")
        code, out = self.cli("check", pdf, "--out", scratch)
        self.assertEqual(code, 0)
        self.assertIn("state: failed no SR6 recipe matched this book", out)  # the made-up PDF isn't the rulebook
        self.assertIn("xsd: all valid", out)
        self.assertTrue(os.path.isfile(os.path.join(scratch, "library", "sr6", "book1", "book.md")))

    def test_regroup_command(self):
        out_md = os.path.join(self.book, "re.md")
        code, out = self.cli("regroup", os.path.join(self.book, "book.md"), out_md)
        self.assertEqual(code, 0)
        self.assertIn("unpaired-row=13", out)
        self.assertTrue(_read(out_md).startswith("<!-- regrouped v1 -->"))


if __name__ == "__main__":
    unittest.main()
