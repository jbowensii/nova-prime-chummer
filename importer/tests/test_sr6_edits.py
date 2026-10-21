"""The SR6 edits layer (importer/sr6/edits.py) on a copy of the made-up fixture (tests/fixtures/sr6/custom)."""

import contextlib
import io
import os
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
from unittest import mock

from importer.__main__ import main
from importer.sr6 import NS, edits
from importer.sr6.__main__ import validate

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FIXTURE = os.path.join(ROOT, "tests", "fixtures", "sr6", "custom")
GUN = (
    '<weapon id="crb.zap-gun" source="CRB" page="250" category="zappers" dv="3P" modes="SS" ar="9/7/—/—/—" ammo="8(c)" '
    'avail="2" cost="{cost}"><name>Zap Gun</name><text/></weapon>'
)
LUCK = (
    '<quality id="crb.lucky-streak" source="CRB" page="70" kind="positive" karma="{karma}" perLevel="true" maxLevel="3">'
    "<name>Lucky Streak</name><text/></quality>"
)


def custom():
    """A copy of the made-up SR6 catalog, without the fixture's edits."""
    d = os.path.join(tempfile.mkdtemp(), "custom", "sr6")
    shutil.copytree(FIXTURE, d)
    shutil.rmtree(os.path.join(d, "edits"))
    return d


def read(d, name):
    return ET.parse(os.path.join(d, "edits", name)).getroot()


def edit(entry, desc=None):
    return f"<edit>{entry}{'' if desc is None else f'<description>{desc}</description>'}</edit>"


class Sr6EditsTest(unittest.TestCase):
    def test_a_weapon_with_a_new_cost_is_stored_with_by(self):
        d = custom()
        edits.set_entry(d, "weapons", "crb.zap-gun", edit(GUN.format(cost="275"), "Zaps &amp; fizzes."), by="kim")
        root = read(d, "edits.xml")
        self.assertEqual((root.tag, root.get("kind")), (f"{{{NS}}}data", "edits"))
        self.assertEqual([(e.tag, e.get("cost"), e.get("by")) for e in root], [("weapon", "275", "kim")])
        self.assertEqual(
            [(t.get("of"), t.get("id"), t.text) for t in read(d, "texts.xml")],
            [("weapons", "crb.zap-gun", "Zaps & fizzes.")],
        )
        self.assertEqual(validate(os.path.join(d, "edits")), [])
        # the same id again replaces it; a body's own by= never counts
        edits.set_entry(
            d,
            "weapons",
            "crb.zap-gun",
            edit(GUN.format(cost="280").replace('cost="280"', 'cost="280" by="mallory"')),
            by="kim",
        )
        self.assertEqual([(e.get("cost"), e.get("by")) for e in read(d, "edits.xml")], [("280", "kim")])

    def test_a_sample_runners_printed_line_corrected(self):
        """A <samplefix> corrects an imported sample runner's line (the owner's override file): stored with by, checked
        against the sample's printed page, refused for a sample that isn't imported (made-up sample)."""
        d = custom()
        os.makedirs(os.path.join(d, "imported", "crb", "samples"))
        with open(os.path.join(d, "imported", "crb", "samples", "crb.tester.xml"), "w", encoding="utf8") as f:
            f.write(
                '<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="crb.tester">'
                '<printed source="CRB" page="9"><value key="dr" value="5"/></printed><build method="priority" magic="mundane"/></sr6:character>'
            )
        with open(os.path.join(d, "imported", "samples.xml"), "w", encoding="utf8") as f:
            f.write('<samples><sample source="CRB" name="Tester" href="crb/samples/crb.tester.xml"/></samples>')
        fix = (
            '<samplefix id="crb.tester" source="CRB" page="{page}"><name>Tester</name>'
            '<correct item="crb.glow-eyes" field="rating" from="4" to="3" note="owner&apos;s correction"/><text/></samplefix>'
        )
        edits.set_entry(
            d, "samplefixes", "crb.tester", edit(fix.format(page="9"), "Owner&apos;s correction."), by="kim"
        )
        self.assertEqual(
            [(e.tag, e.get("id"), e.get("by"), e.find("correct").get("to")) for e in read(d, "edits.xml")],
            [("samplefix", "crb.tester", "kim", "3")],
        )
        self.assertEqual(validate(os.path.join(d, "edits")), [])
        with self.assertRaisesRegex(edits.EditError, "page"):
            edits.set_entry(d, "samplefixes", "crb.tester", edit(fix.format(page="10")))
        with self.assertRaisesRegex(edits.EditError, "sample runner"):
            edits.set_entry(
                d, "samplefixes", "crb.nobody", edit(fix.format(page="9").replace("crb.tester", "crb.nobody"))
            )
        self.assertTrue(edits.remove_entry(d, "samplefixes", "crb.tester"))

    def test_refusals_say_why(self):
        d = custom()
        cases = [
            ("spells2", "crb.zap-gun", edit(GUN.format(cost="1")), 'unknown kind "spells2"'),
            ("weapons", "crb.zap-gun", edit(LUCK.format(karma="4")), "needs one <weapon>"),
            (
                "weapons",
                "crb.nope",
                edit(GUN.format(cost="1").replace("crb.zap-gun", "crb.nope")),
                '"crb.nope" isn’t in the catalog',
            ),
            ("weapons", "crb.zap-gun", edit(GUN.format(cost="1")).replace('source="CRB"', 'source="XYZ"'), "source"),
            ("weapons", "crb.zap-gun", edit(GUN.format(cost="1")).replace('page="250"', 'page="9"'), "page"),
            ("qualities", "crb.lucky-streak", edit(LUCK.format(karma="x")), "karma"),
            ("weapons", "crb.zap-gun", '<!DOCTYPE edit [<!ENTITY a "b">]>' + edit(GUN.format(cost="&a;")), "DOCTYPE"),
            (
                "weapons",
                "crb.zap-gun",
                edit(GUN.format(cost="1")).replace("<text/>", "<text>prose</text>"),
                "<description>",
            ),
            ("weapons", "crb.zap-gun", "<edit><weapon", "well-formed"),
        ]
        for kind, id, body, why in cases:
            with self.subTest(why=why), self.assertRaises(edits.EditError) as e:
                edits.set_entry(d, kind, id, body)
            self.assertIn(why, str(e.exception))
        with self.assertRaisesRegex(edits.EditError, "username"):
            edits.set_entry(d, "weapons", "crb.zap-gun", edit(GUN.format(cost="1")), by="Bad User")
        self.assertFalse(os.path.exists(os.path.join(d, "edits", "edits.xml")))

    def test_an_empty_description_removes_the_edited_text(self):
        d = custom()
        edits.set_entry(d, "weapons", "crb.zap-gun", edit(GUN.format(cost="1"), "Mine."))
        edits.set_entry(d, "weapons", "crb.zap-gun", edit(GUN.format(cost="1"), "  "))
        self.assertEqual(len(read(d, "texts.xml")), 0)
        self.assertEqual(len(read(d, "edits.xml")), 1)

    def test_remove_entry_drops_both(self):
        d = custom()
        edits.set_entry(d, "weapons", "crb.zap-gun", edit(GUN.format(cost="1"), "Mine."))
        edits.set_entry(d, "qualities", "crb.lucky-streak", edit(LUCK.format(karma="5")))
        self.assertTrue(edits.remove_entry(d, "weapons", "crb.zap-gun"))
        self.assertEqual([e.get("id") for e in read(d, "edits.xml")], ["crb.lucky-streak"])
        self.assertEqual(len(read(d, "texts.xml")), 0)
        self.assertFalse(edits.remove_entry(d, "weapons", "crb.zap-gun"))
        with self.assertRaises(edits.EditError):
            edits.remove_entry(d, "nope", "crb.zap-gun")

    def test_cli(self):
        d = custom()

        def cli(*args, stdin=b""):
            out, err = io.StringIO(), io.StringIO()
            with (
                contextlib.redirect_stdout(out),
                contextlib.redirect_stderr(err),
                mock.patch("sys.stdin", io.TextIOWrapper(io.BytesIO(stdin))),
            ):
                return main(["sr6", "edit", *args]), out.getvalue(), err.getvalue()

        code, out, _ = cli(
            "set", "weapons", "crb.zap-gun", "--by", "kim", "--custom", d, stdin=edit(GUN.format(cost="2")).encode()
        )
        self.assertEqual((code, out.strip()), (0, '<result state="saved" />'))
        code, _, err = cli("set", "weapons", "crb.zap-gun", "--custom", d, stdin=edit(LUCK.format(karma="1")).encode())
        self.assertEqual(code, 3)
        self.assertIn("<weapon>", err)
        self.assertEqual(cli("remove", "weapons", "crb.zap-gun", "--custom", d)[:2], (0, '<result removed="true" />\n'))
        self.assertEqual(cli("remove", "weapons", "crb.zap-gun")[0], 2)


if __name__ == "__main__":
    unittest.main()
