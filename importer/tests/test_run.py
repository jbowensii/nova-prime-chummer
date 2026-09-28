import os
import subprocess
import tempfile
import unittest
from unittest import mock
import xml.etree.ElementTree as ET
from pathlib import Path

from importer import xmlio
from importer.__main__ import run
from importer.recipes import qref
from importer.tests.test_qref import MD

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SCHEMA = os.path.join(ROOT, "public", "data", "schema")
# validates one file against one XSD with the repo's xmllint-wasm (same engine as validate-data.mjs)
XSD_CHECK = """
import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';
const [xml, xsd, common] = process.argv.slice(1);
const r = await validateXML({ xml: { fileName: xml, contents: readFileSync(xml, 'utf8') },
  schema: { fileName: 'x.xsd', contents: readFileSync(xsd, 'utf8') },
  preload: [{ fileName: 'common.xsd', contents: readFileSync(common, 'utf8') }] });
if (r.errors.length) { console.error(r.errors.map(e => e.message).join('\\n')); process.exit(1); }
"""


def node(*args):
    return subprocess.run(["node", *args], cwd=ROOT, capture_output=True, text=True, encoding="utf8")


class XmlioTest(unittest.TestCase):
    def test_write_overlay_scopes_ids_and_internal_refs(self):
        d = os.path.join(tempfile.mkdtemp(), "DHSA")
        xml = ('<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="amps" version="1">'
               '<amp id="rush" type="equipment" source="DHSA" page="1"><effect ref="dv-plus"/></amp>'
               '<amp id="kit" linkedItem="rush" type="equipment" source="DHSA" page="2"/>'
               # same names as entries of the set, but these attributes point at base data: never scoped
               '<amp id="equipment" type="equipment" source="DHSA" page="3"><effect ref="rush"/></amp>'
               '<amp id="small-drone" type="vehicle" vehicle="small-drone" source="DHSA" page="4"/></ca2:data>')
        xmlio.write_overlay(d, "amps.xml", xml)
        out = Path(os.path.join(d, "amps.xml")).read_text(encoding="utf8")
        self.assertIn('<amp id="dhsa.rush"', out)
        self.assertIn('linkedItem="dhsa.rush"', out)
        self.assertIn('ref="dv-plus"', out)
        self.assertIn('<amp id="dhsa.equipment" type="equipment"', out)
        self.assertIn('<effect ref="rush"/>', out)
        self.assertIn('<amp id="dhsa.small-drone" type="vehicle" vehicle="small-drone"', out)
        self.assertIn('source="DHSA"', out)

    def test_skill_additions_keep_the_base_skill_id(self):
        d = os.path.join(tempfile.mkdtemp(), "DHSA")
        xml = ('<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="skills" version="1">'
               '<skill id="influence" attr="cha" source="DHSA" page="5"><name>Influence</name>'
               '<spec id="influence.made-up" attr="cha">Made up</spec></skill></ca2:data>')
        xmlio.write_overlay(d, "skills.xml", xml)
        self.assertIn('<skill id="influence"', Path(os.path.join(d, "skills.xml")).read_text(encoding="utf8"))

    def test_write_texts_merges_by_id(self):
        p = os.path.join(tempfile.mkdtemp(), "texts", "qref.xml")
        xmlio.write_texts(p, [("rules", "qref.a", "one"), ("rules", "qref.b", "two")])
        xmlio.write_texts(p, [("rules", "qref.b", "new")])
        got = {t.get("id"): t.text for t in ET.parse(p).getroot()}
        self.assertEqual(got, {"qref.a": "one", "qref.b": "new"})


class RunTest(unittest.TestCase):
    def test_run_end_to_end(self):
        tmp = tempfile.mkdtemp()
        book, custom = os.path.join(tmp, "library", "b1"), os.path.join(tmp, "custom")
        os.makedirs(book)
        Path(os.path.join(book, "book.md")).write_text(encoding="utf8", data=MD)
        run(book, custom, convert_pdf=False)

        imported = os.path.join(custom, "imported")
        for p in [os.path.join(imported, "qref", "rules-matrix.xml"), os.path.join(custom, "texts", "qref.xml"),
                  os.path.join(imported, "index.xml"), os.path.join(imported, "sources.xml")]:
            self.assertTrue(os.path.exists(p), p)
        rules = Path(os.path.join(imported, "qref", "rules-matrix.xml")).read_text(encoding="utf8")
        self.assertIn('id="qref.matrix-vr-hot-sim"', rules)
        self.assertIn('id="qref.matrix-bricking"', Path(os.path.join(custom, "texts", "qref.xml")).read_text(encoding="utf8"))
        self.assertIn('href="qref/rules-matrix.xml"', Path(os.path.join(imported, "index.xml")).read_text(encoding="utf8"))
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "done")

        r = node("tools/validate-data.mjs", imported, "--texts=" + os.path.join(custom, "texts", "qref.xml"))
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for f, xsd in [(os.path.join(imported, "sources.xml"), "sources.xsd"), (os.path.join(book, "import.xml"), "import.xsd"),
                       (os.path.join(book, "status.xml"), "status.xsd")]:
            r = node("--input-type=module", "-e", XSD_CHECK, f, os.path.join(SCHEMA, xsd), os.path.join(SCHEMA, "common.xsd"))
            self.assertEqual(r.returncode, 0, f"{f}: {r.stderr}")

    def _book(self):
        tmp = tempfile.mkdtemp()
        book = os.path.join(tmp, "library", "b1")
        os.makedirs(book)
        Path(os.path.join(book, "book.md")).write_text(encoding="utf8", data=MD)
        return book, os.path.join(tmp, "custom")

    def test_failed_extract_writes_failed_status_and_no_overlay(self):
        book, custom = self._book()
        with mock.patch.object(qref, "extract", side_effect=RuntimeError("boom")):
            with self.assertRaises(RuntimeError):
                run(book, custom, convert_pdf=False)
        st = ET.parse(os.path.join(book, "status.xml")).getroot()
        self.assertEqual((st.get("state"), st.text), ("failed", "RuntimeError: boom"))
        self.assertFalse(os.path.exists(os.path.join(custom, "imported")))

    def test_corrupt_texts_file_fails_before_any_overlay_is_written(self):
        book, custom = self._book()
        Path(custom, "texts").mkdir(parents=True)
        Path(custom, "texts", "qref.xml").write_text("<not xml", encoding="utf8")
        with self.assertRaises(ET.ParseError):
            run(book, custom, convert_pdf=False)
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "failed")
        self.assertFalse(os.path.exists(os.path.join(custom, "imported")))

    def test_unknown_book_needs_ai(self):
        tmp = tempfile.mkdtemp()
        book = os.path.join(tmp, "b2")
        os.makedirs(book)
        Path(os.path.join(book, "book.md")).write_text(encoding="utf8", data="<!-- page 1 -->\n# Something else\n")
        run(book, os.path.join(tmp, "custom"), convert_pdf=False)
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "needs-ai")
        self.assertFalse(os.path.exists(os.path.join(tmp, "custom", "imported", "qref")))


if __name__ == "__main__":
    unittest.main()
