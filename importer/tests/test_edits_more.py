"""More of Anarchy's edits layer (importer/edits.py): ids and numbers it refuses, an unknown kind, a broken file in the
catalog. Made-up entries, on a copy of the made-up fixture."""

import os
import unittest
from pathlib import Path

from importer import edits
from importer.tests.test_edits import AMP, custom


class RefusalsMoreTest(unittest.TestCase):
    def test_more_invalid_entries_are_refused_with_a_reason(self):
        d = custom()
        cases = [
            ("amps", "Test.Keen-Eye", AMP.replace("test.keen-eye", "Test.Keen-Eye"), 'id "Test.Keen-Eye" isn’t an id'),
            (
                "amps",
                "test.keen-eye",
                AMP.replace('printedRating="3"', 'printedRating="x"'),
                'printedRating "x" isn’t a whole number',
            ),
            (
                "items",
                "test.nano-tape",
                '<item id="test.nano-tape" kind="potion" source="TEST" page="9"><name>Nano Tape</name><text/></item>',
                'item kind "potion" isn’t one of',
            ),
            (
                "amps",
                "test.keen-eye",
                AMP.replace("<narrative>", '<item kind="spell"/><narrative>'),
                "<item> kind must be gear, weapon or armor",
            ),
            ("amps", "test.keen-eye", AMP.replace('ref="rr-spec" ', ""), "an <effect> has no ref id"),
            (
                "amps",
                "test.keen-eye",
                AMP.replace('param="perception.physical"', 'param="perception.physical" value="0"'),
                'effect value "0" isn’t a whole number above 0',
            ),
            ("amps", "test.keen-eye", AMP.replace("<narrative>", "<x/><narrative>"), "its elements must be"),
            (
                "amps",
                "test.keen-eye",
                AMP.replace("<effect", '<effect bogus="1"', 1),
                'unknown attribute "bogus" on <effect>',
            ),
        ]
        for kind, i, body, reason in cases:
            with self.subTest(reason=reason), self.assertRaises(edits.EditError) as e:
                edits.set_entry(d, kind, i, body)
            self.assertIn(reason, str(e.exception))
        self.assertFalse(os.path.exists(os.path.join(d, "edits", "edits.xml")))

    def test_an_unknown_kind_is_refused_by_set_and_remove(self):
        d = custom()
        with self.assertRaisesRegex(edits.EditError, 'unknown kind "spells"'):
            edits.set_entry(d, "spells", "test.keen-eye", AMP)
        with self.assertRaisesRegex(edits.EditError, 'unknown kind "widgets"'):
            edits.remove_entry(d, "widgets", "test.keen-eye")


class CatalogIdsTest(unittest.TestCase):
    def test_a_missing_or_broken_catalog_file_is_skipped(self):
        d = custom()
        before = edits.catalog_ids(d, "amp")
        self.assertTrue(before)
        imported = os.path.join(d, "imported")
        with open(os.path.join(imported, "broken.xml"), "w", encoding="utf8") as f:
            f.write("<not closed")
        index = os.path.join(imported, "index.xml")
        text = Path(index).read_text(encoding="utf8")
        with open(index, "w", encoding="utf8") as f:
            f.write(text.replace("<overlays>", '<overlays>\n  <file href="gone.xml"/>\n  <file href="broken.xml"/>'))
        self.assertEqual(edits.catalog_ids(d, "amp"), before)  # (the loader reports them; the id check goes on)


if __name__ == "__main__":
    unittest.main()
