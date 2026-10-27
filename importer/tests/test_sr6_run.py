"""SR6 import run, remove and CLI (importer/sr6/run.py, importer/sr6/__main__.py) on the made-up book.md of
test_sr6_crb, with --md (no PDF)."""

import contextlib
import io
import os
import tempfile
import unittest
import unittest.mock
import xml.etree.ElementTree as ET
from pathlib import Path

from importer import xmlio
from importer.__main__ import main
from importer.sr6 import NS, overrides
from importer.sr6.__main__ import validate
from importer.sr6.run import remove, run
from importer.tests.test_sr6_crb import BOOK_MD


def _read(*p):
    return Path(*p).read_text(encoding="utf8")


class Sr6RunTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.mkdtemp()
        patch = unittest.mock.patch.object(
            overrides, "DIR", Path(tmp, "no-overrides")
        )  # (the real tables add entries to invented books)
        patch.start()
        self.addCleanup(patch.stop)
        self.lib, self.custom = os.path.join(tmp, "library", "sr6"), os.path.join(tmp, "custom", "sr6")
        self.book = self.new_book("book1")

    def new_book(self, name, md=BOOK_MD):
        """A book folder named `name` in the test library, holding `md`."""
        d = os.path.join(self.lib, name)
        os.makedirs(d)
        Path(d, "book.md").write_text(md, encoding="utf8")
        return d

    def cli(self, *args):
        """Run the sr6 command; (exit code, printed output)."""
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = main(["sr6", *args])
        return code, out.getvalue()

    def state(self, book):
        """The status.xml root of a book folder."""
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
        self.assertEqual(
            [(x.get("source"), x.get("href"), x.get("name"), x.get("role")) for x in lst],
            [
                ("CRB", "crb/samples/crb.glow-runner.xml", "Glow Runner", "Archetype"),
                ("CRB", "crb/samples/crb.bit-whisperer.xml", "Bit Whisperer", "Archetype"),
            ],
        )
        self.assertIn('metatype="crb.glimmerkin"', _read(crb, "samples", "crb.glow-runner.xml"))
        self.assertNotIn("samples", _read(self.custom, "imported", "index.xml"))  # never a catalog file
        self.assertTrue(os.path.isfile(os.path.join(self.book, "regrouped.md")))
        imp = xmlio.read_import(self.book)
        self.assertEqual((imp.get("recipe"), imp.get("source"), imp.get("converter")), ("crb", "CRB", "sr6-8"))
        rows = {(r.get("kind"), r.get("name")): r.attrib for r in imp.iter("row")}
        self.assertEqual(rows[("unpaired-row", "Lost Blaster")]["page"], "250")  # regroup's report, printed pages
        self.assertIn("unknown-column", {k for k, _ in rows})  # and the recipe's
        self.assertEqual({f.get("name"): f.get("entries") for f in imp.iter("file")}["weapons.xml"], "5")

    def test_a_book_read_again_drops_what_this_reading_no_longer_finds(self):
        self.assertEqual(self.cli("run", self.book, "--custom", self.custom, "--md")[0], 0)
        crb = os.path.join(self.custom, "imported", "crb")

        def wrote(book, name):  # (the book's import record lists a file its last reading wrote)
            p = Path(book, "import.xml")
            p.write_text(
                p.read_text(encoding="utf8").replace("<files>", f'<files>\n    <file name="{name}" entries="1"/>'),
                encoding="utf8",
            )

        # a kind file and a sample runner the last reading wrote that this one does not: they go
        Path(crb, "lifemodules.xml").write_text("<old/>", encoding="utf8")
        wrote(self.book, "lifemodules.xml")
        Path(crb, "samples", "crb.gone-runner.xml").write_text("<old/>", encoding="utf8")
        self.assertEqual(self.cli("run", self.book, "--custom", self.custom, "--md")[0], 0)
        self.assertFalse(os.path.exists(os.path.join(crb, "lifemodules.xml")))
        self.assertFalse(os.path.exists(os.path.join(crb, "samples", "crb.gone-runner.xml")))
        self.assertTrue(os.path.isfile(os.path.join(crb, "weapons.xml")))
        self.assertTrue(os.path.isfile(os.path.join(crb, "samples", "crb.glow-runner.xml")))
        self.assertEqual(validate(self.custom), [])
        # a file this book never wrote, and one another book of the same source writes, stay (a booklet that reads
        # as its box's adventure writes into the same folder: the adventure's NPCs are not its to remove)
        Path(crb, "spirits.xml").write_text("<theirs/>", encoding="utf8")
        Path(crb, "lifemodules.xml").write_text("<theirs/>", encoding="utf8")
        other = self.new_book("book2")
        xmlio.write_import(
            other, files={"lifemodules.xml": 1}, source="CRB", file="booklet.pdf", sha256="0" * 64, name="Booklet"
        )
        wrote(self.book, "lifemodules.xml")
        self.assertEqual(self.cli("run", self.book, "--custom", self.custom, "--md")[0], 0)
        self.assertTrue(os.path.isfile(os.path.join(crb, "spirits.xml")))
        self.assertTrue(os.path.isfile(os.path.join(crb, "lifemodules.xml")))

    def test_texts_are_reflowed_into_paragraphs(self):
        md = BOOK_MD.replace(
            "Trouble rules text.\n",
            "Trouble rules text for the gamemas-\nter and every non-\nplayer, in a\n"
            "narrow column.\n\n**Bold** stays.\n",
        )
        self.assertNotEqual(md, BOOK_MD)
        self.cli("run", self.new_book("book2", md), "--custom", self.custom, "--md")
        texts = {t.get("id"): t.text for t in ET.parse(os.path.join(self.custom, "texts", "crb.xml")).getroot()}
        self.assertTrue(
            texts["crb.making-trouble"].startswith(
                "Trouble rules text for the gamemaster and every non-player, in a narrow column.\n\n**Bold** stays."
            ),
            texts["crb.making-trouble"],
        )

    def test_anarchy_texts_keep_their_root(self):
        self.assertIn(
            '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="texts"',
            xmlio.merged_texts(os.path.join(self.custom, "none.xml"), [("spells", "x", "t")]),
        )

    def test_no_recipe_fails(self):
        other = self.new_book("other", "<!-- page 1 -->\n# Some Other Game\nText.\n")
        self.assertIsNone(run(other, self.custom, convert_pdf=False))
        self.assertEqual(
            (self.state(other).get("state"), self.state(other).text), ("failed", "no SR6 recipe matched this book")
        )
        self.assertFalse(os.path.exists(os.path.join(self.custom, "imported")))

    def test_a_recipe_finding_nothing_fails(self):
        # a booklet the core rulebook's loose match takes (its words), with nothing in the rulebook's shape
        thin = self.new_book("thin", "<!-- page 1 -->\nMade-up Sixth World core rulebook words, no headings.\n")
        self.assertIsNone(run(thin, self.custom, convert_pdf=False))
        self.assertEqual(self.state(thin).get("state"), "failed")
        self.assertIn("nothing in this book", self.state(thin).text)
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
        self.assertIn(
            "unpaired-row: 14", out
        )  # rows with no description of their own (the made-up alias isn't the book's)
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
        self.assertIn("unpaired-row=14", out)
        self.assertTrue(_read(out_md).startswith("<!-- regrouped v1 -->"))

    def test_a_book_whose_samples_cite_this_import_is_read_again(self):
        """A done book whose sample runner notes `Glim Charm` and `2 x Zap Lamp (w/ hum)` not in the catalog: an import
        bringing either reads it again; one bringing neither, or the book itself, doesn't (made-up names)."""
        from types import SimpleNamespace
        from importer.sr6.run import _cited

        xmlio.write_import(self.book, source="NB")
        xmlio.write_status(self.book, "done")
        Path(self.custom, "imported", "nb", "samples").mkdir(parents=True)
        Path(self.custom, "imported", "nb", "samples", "nb.tester.xml").write_text(
            "<c><notes>Qualities not in the catalog: Glim Charm; Hum Ward. Gear not in the catalog: 2 x Zap Lamp (w/ "
            "hum).</notes></c>",
            encoding="utf8",
        )
        other = self.new_book("book2")

        def has(*names):
            return SimpleNamespace(extra=[], files={"x.xml": "".join(f"<e><name>{n}</name></e>" for n in names)})

        self.assertEqual(_cited(other, self.custom, has("Glim Charm")), [self.book])
        self.assertEqual(_cited(other, self.custom, has("Zap Lamp (Deluxe)")), [self.book])
        self.assertEqual(_cited(other, self.custom, has("Charming", "Lamp Post")), [])
        self.assertEqual(_cited(self.book, self.custom, has("Glim Charm")), [])


class UnnestCarryTest(unittest.TestCase):
    """_unnest_carry: a carry accessory (fits only a firearms/ranged-external slot) is moved out of its weapon host to
    a standalone purchase; a real-mount accessory stays."""

    CATALOG = (
        '<?xml version="1.0"?>\n<sr6:data xmlns:sr6="urn:chummer-sr6:data:1">\n'
        '  <weapon id="crb.sling"><name>Sling</name>'
        '<fits slot="firearms-external"/><fits slot="ranged-external"/></weapon>\n'
        '  <weapon id="crb.scope"><name>Scope</name><fits slot="top"/></weapon>\n'
        "</sr6:data>\n"
    )
    SAMPLE = (
        '<?xml version="1.0"?>\n<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" id="crb.s"><build>\n'
        '  <purchase uid="g1" kind="weapons" id="crb.gun" name="Gun" qty="1">'
        '<purchase uid="g1a1" kind="weapons" id="crb.scope" name="Scope" qty="1"/>'
        '<purchase uid="g1a2" kind="weapons" id="crb.sling" name="Sling" qty="1"/></purchase>\n'
        "</build></sr6:character>\n"
    )

    def test_carry_accessory_is_unnested_and_a_real_mount_stays(self):
        from importer.sr6.run import _unnest_carry

        tmp = tempfile.mkdtemp()
        base = os.path.join(tmp, "imported", "crb")
        os.makedirs(os.path.join(base, "samples"))
        Path(base, "weapons.xml").write_text(self.CATALOG, encoding="utf8")
        sample = os.path.join(base, "samples", "crb.s.xml")
        Path(sample).write_text(self.SAMPLE, encoding="utf8")
        _unnest_carry(tmp)
        root = ET.fromstring(_read(sample).split("?>", 1)[1])
        build = root[0]
        gun = next(e for e in build if e.get("id") == "crb.gun")
        nested = [e.get("id") for e in gun]
        top = [e.get("id") for e in build]
        self.assertEqual(nested, ["crb.scope"])  # the real mount stays fitted
        self.assertIn("crb.sling", top)  # the sling is now a standalone purchase
        self.assertIn("crb.gun", top)


if __name__ == "__main__":
    unittest.main()
