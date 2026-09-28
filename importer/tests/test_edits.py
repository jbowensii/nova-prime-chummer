import io
import os
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

from importer import edits
from importer.__main__ import main
from importer.tests.test_run import SCHEMA, XSD_CHECK, node

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MINI = os.path.join(ROOT, "tests", "fixtures", "mini", "custom")
AMP = ('<amp id="test.keen-eye" type="quality" printedRating="3" source="TEST" page="1"><name>Keen Eye</name>'
       '<effect ref="rr-spec" param="perception.physical"/><narrative></narrative></amp>')


def custom():
    """A copy of the made-up imported books, without the fixture's edits."""
    d = os.path.join(tempfile.mkdtemp(), "custom")
    shutil.copytree(MINI, d)
    shutil.rmtree(os.path.join(d, "edits"), ignore_errors=True)
    return d


def read(d, name):
    return ET.parse(os.path.join(d, "edits", name)).getroot()


class EditsTest(unittest.TestCase):
    def test_set_keeps_the_id_and_replaces_by_id(self):
        d = custom()
        edits.set_entry(d, "amps", "test.keen-eye", AMP)
        edits.set_entry(d, "amps", "test.keen-eye", f"<edit>{AMP.replace('printedRating=\"3\"', 'printedRating=\"4\"')}"
                        "<description>Sees &amp; knows.</description></edit>")
        amps = [e for e in read(d, "edits.xml") if e.get("id") == "test.keen-eye"]
        self.assertEqual([a.get("printedRating") for a in amps], ["4"])
        self.assertEqual([(t.get("of"), t.get("id"), t.text) for t in read(d, "texts.xml")],
                         [("amps", "test.keen-eye", "Sees & knows.")])
        for f, xsd in (("edits.xml", "edits.xsd"), ("texts.xml", "texts.xsd")):
            r = node("--input-type=module", "-e", XSD_CHECK, os.path.join(d, "edits", f), os.path.join(SCHEMA, xsd), os.path.join(SCHEMA, "common.xsd"))
            self.assertEqual(r.returncode, 0, r.stderr)
        # a set without a description drops the edited one (the book's shows again)
        edits.set_entry(d, "amps", "test.keen-eye", AMP)
        self.assertEqual(len(read(d, "texts.xml")), 0)

    def test_remove_drops_the_entry_and_its_description(self):
        d = custom()
        edits.set_entry(d, "items", "test.nano-tape", '<edit><item id="test.nano-tape" kind="gear" source="TEST" page="9">'
                        "<name>Nano Tape</name><text></text></item><description>Sticky.</description></edit>")
        edits.set_entry(d, "amps", "test.keen-eye", AMP)
        self.assertTrue(edits.remove_entry(d, "items", "test.nano-tape"))
        self.assertEqual([e.get("id") for e in read(d, "edits.xml")], ["test.keen-eye"])
        self.assertEqual(len(read(d, "texts.xml")), 0)
        self.assertFalse(edits.remove_entry(d, "items", "test.nano-tape"))

    def test_new_entry_needs_a_house_rule_source(self):
        d = custom()
        new = '<item id="house.lucky-charm" kind="gear" source="HOUSE" page="1"><name>Lucky Charm</name><text></text></item>'
        with self.assertRaisesRegex(edits.EditError, "house-rule source"):
            edits.set_entry(d, "items", "house.lucky-charm", new)
        edits.add_source(d, "HOUSE", "Our table")
        edits.set_entry(d, "items", "house.lucky-charm", new)
        self.assertEqual(read(d, "edits.xml")[0].get("id"), "house.lucky-charm")
        # the id names its source; an imported book's source can't take new entries
        with self.assertRaisesRegex(edits.EditError, "house-rule source"):
            edits.set_entry(d, "items", "test.lucky-charm", new.replace("house.", "test.").replace("HOUSE", "TEST"))
        with self.assertRaisesRegex(edits.EditError, "house.other"):
            edits.set_entry(d, "items", "house.other", new)

    def test_invalid_entries_are_refused_with_a_reason(self):
        d = custom()
        cases = [("amps", "test.keen-eye", "<amp", "well-formed"),
                 ("amps", "test.keen-eye", AMP.replace('ref="rr-spec"', 'ref="no-such"'), 'unknown effect ref "no-such"'),
                 ("amps", "test.keen-eye", AMP.replace('type="quality"', 'type="nope"'), 'unknown amp type "nope"'),
                 ("amps", "test.keen-eye", AMP.replace('page="1"', 'page="0"'), "page"),
                 ("amps", "test.keen-eye", AMP.replace("<narrative></narrative>", ""), "narrative"),
                 ("amps", "test.keen-eye", AMP.replace('source="TEST"', 'source="NOPE"'), 'source "NOPE"'),
                 ("items", "test.keen-eye", AMP, "<item>"),
                 ("items", "test.nano-tape", '<item id="test.nano-tape" kind="spell" category="loud" source="TEST" page="9">'
                  "<name>Nano Tape</name><text/></item>", 'unknown spell category "loud"'),
                 ("items", "test.nano-tape", '<item id="test.nano-tape" kind="armor" source="TEST" page="9">'
                  "<name>Nano Tape</name><text/></item>", "armor rating"),
                 ("rules", "test.gadget-basics", '<rule id="test.gadget-basics" sheet="test" effects="nope" source="TEST" page="11">'
                  "<title>Risk</title><text/></rule>", 'unknown effect "nope"'),
                 ("amps", "other", AMP, "id"),
                 ("amps", "test.keen-eye", AMP.replace("<name>", "junk<name>"), "text outside"),
                 ("amps", "test.keen-eye", AMP.replace("</name>", "</name>junk"), "text outside"),
                 ("amps", "test.keen-eye", AMP.replace("<name>", '<name x="1">'), "<name> takes no attributes"),
                 ("amps", "test.keen-eye", AMP.replace('param="perception.physical"/>', 'param="perception.physical"><x/></effect>'),
                  "<effect> holds no elements"),
                 ("amps", "test.keen-eye", AMP.replace("<narrative>", '<item kind="gear"><x/></item><narrative>'), "<item> holds no elements"),
                 ("amps", "test.keen-eye", f"<edit>{AMP}<description>a<b/></description></edit>", "<description> holds only text"),
                 ("amps", "test.keen-eye", '<!DOCTYPE amp [<!ENTITY x "y">]>' + AMP, "DOCTYPE"),
                 ("amps", "test.keen-eye", AMP.replace("<narrative>", "<narrative>" + "x" * edits.MAX_BODY), "too large")]
        for kind, i, body, reason in cases:
            with self.subTest(reason=reason):
                with self.assertRaisesRegex(edits.EditError, reason):
                    edits.set_entry(d, kind, i, body)
        self.assertFalse(os.path.exists(os.path.join(d, "edits", "edits.xml")))

    def test_written_file_passes_validate_data(self):
        d = custom()
        edits.add_source(d, "TABLE", "Our table")
        edits.set_entry(d, "amps", "test.keen-eye", f"<edit>{AMP}<description>Sharp.</description></edit>")
        edits.set_entry(d, "items", "table.charm", '<item id="table.charm" kind="gear" source="TABLE" page="1"><name>Charm</name><text/></item>')
        edits.set_entry(d, "rules", "test.gadget-basics", '<rule id="test.gadget-basics" sheet="test" effects="rr-spec" source="TEST" page="11">'
                        "<title>Risk</title><text/></rule>")
        r = node("tools/validate-data.mjs", d)
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)

    def test_house_rule_ids_are_edited_in_the_house_rules(self):
        d = custom()
        Path(d, "index.xml").write_text('<overlays><file href="house.xml"/></overlays>', encoding="utf8")
        Path(d, "house.xml").write_text(f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="amps" version="1">{AMP}</ca2:data>', encoding="utf8")
        with self.assertRaisesRegex(edits.EditError, "house rules"):
            edits.set_entry(d, "amps", "test.keen-eye", AMP)

    def test_add_source_checks_the_id(self):
        d = custom()
        edits.add_source(d, "HOUSE", "Our table")
        src = read(d, "sources.xml")[0]
        self.assertEqual((src.get("id"), src.get("canon"), src.findtext("name")), ("HOUSE", "false", "Our table"))
        r = node("--input-type=module", "-e", XSD_CHECK, os.path.join(d, "edits", "sources.xml"),
                 os.path.join(SCHEMA, "sources.xsd"), os.path.join(SCHEMA, "common.xsd"))
        self.assertEqual(r.returncode, 0, r.stderr)
        for bad in ("HOUSE", "TEST", "CRB", "lower", ""):
            with self.subTest(bad=bad), self.assertRaises(edits.EditError):
                edits.add_source(d, bad, "x")

    def test_cli(self):
        d = custom()
        with mock.patch("sys.stdin", io.TextIOWrapper(io.BytesIO(AMP.encode()))), mock.patch("sys.stdout", io.StringIO()):
            self.assertEqual(main(["edit", "set", "amps", "test.keen-eye", "--custom", d]), 0)
        with mock.patch("sys.stdin", io.TextIOWrapper(io.BytesIO(b"<amp"))), mock.patch("sys.stderr", io.StringIO()) as err:
            self.assertEqual(main(["edit", "set", "amps", "test.keen-eye", "--custom", d]), 3)
        self.assertIn("well-formed", err.getvalue())
        with mock.patch("sys.stdout", io.StringIO()):
            self.assertEqual(main(["edit", "add-source", "HOUSE", "--custom", d, "--name", "Our table"]), 0)
            self.assertEqual(main(["edit", "add-source", "DASH", "--custom", d, "--name=-leading dash"]), 0)
            self.assertEqual(main(["edit", "remove", "amps", "test.keen-eye", "--custom", d]), 0)
        self.assertEqual(len(read(d, "edits.xml")), 0)
        self.assertIn('id="HOUSE"', Path(d, "edits", "sources.xml").read_text(encoding="utf8"))
        self.assertIn("<name>-leading dash</name>", Path(d, "edits", "sources.xml").read_text(encoding="utf8"))


if __name__ == "__main__":
    unittest.main()
