"""SR6 catalog kinds and schemas (docs/sr6-data-format.md): KINDS matches the XSD folder, and every made-up fixture
file validates against its kind's XSD with lxml."""
import os
import unittest
from pathlib import Path

from lxml import etree

from importer import sr6

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "tests" / "fixtures" / "sr6" / "custom"


def _validate(path):
    doc = etree.parse(str(path))
    assert doc.getroot().tag == f"{{{sr6.NS}}}data", f"{path}: not an SR6 data file"
    return etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.getroot().get("kind") + ".xsd"))), doc


class Sr6KindsTest(unittest.TestCase):
    def test_kinds_match_the_schema_folder(self):
        xsds = {p.stem for p in Path(sr6.SCHEMA_DIR).glob("*.xsd")}
        self.assertEqual(xsds - {"common", "sources", "texts", "edits"}, set(sr6.KINDS))
        self.assertEqual(sr6.KINDS["electronics"], "device")
        self.assertEqual(list(sr6.KINDS)[0], "priorities")
        self.assertEqual(list(sr6.KINDS)[-1], "rules")

    def test_fixture_has_every_kind_and_validates(self):
        for kind in sr6.KINDS:
            self.assertTrue((FIXTURE / "imported" / "crb" / f"{kind}.xml").is_file(), kind)
        files = [p for p in FIXTURE.rglob("*.xml") if p.name != "index.xml"] + [ROOT / "public" / "data" / "sr6" / "sources.xml"]
        for path in files:
            schema, doc = _validate(path)
            self.assertTrue(schema.validate(doc), f"{path}: {schema.error_log.last_error}")

    def test_wrong_entry_is_refused(self):
        schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, "weapons.xsd")))
        doc = etree.fromstring(f'<sr6:data xmlns:sr6="{sr6.NS}" kind="weapons" version="1">'
                               '<weapon id="crb.x" source="CRB" page="2"><name>X</name></weapon></sr6:data>')
        self.assertFalse(schema.validate(doc))
        self.assertIn("category", str(schema.error_log.last_error))


if __name__ == "__main__":
    unittest.main()
