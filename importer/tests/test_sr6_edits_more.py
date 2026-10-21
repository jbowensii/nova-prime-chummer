"""More of the SR6 edits layer (importer/sr6/edits.py): a sample or catalog file that is missing or broken. Made-up
entries, on a copy of the made-up fixture."""

import os
import unittest
from pathlib import Path

from importer.sr6 import edits
from importer.tests.test_sr6_edits import custom


class MissingOrBrokenFilesTest(unittest.TestCase):
    def test_a_sample_whose_file_is_broken_or_gone_is_not_a_sample(self):
        d = custom()
        imported = os.path.join(d, "imported")
        os.makedirs(os.path.join(imported, "crb", "samples"))
        with open(os.path.join(imported, "samples.xml"), "w", encoding="utf8") as f:
            f.write(
                '<samples><sample source="CRB" name="Broken" href="crb/samples/crb.broken.xml"/>'
                '<sample source="CRB" name="Gone" href="crb/samples/crb.gone.xml"/>'
                '<sample source="CRB" name="Plain" href="crb/samples/crb.plain.xml"/></samples>'
            )
        with open(os.path.join(imported, "crb", "samples", "crb.broken.xml"), "w", encoding="utf8") as f:
            f.write("<not closed")
        with open(os.path.join(imported, "crb", "samples", "crb.plain.xml"), "w", encoding="utf8") as f:
            f.write("<sr6:character xmlns:sr6='urn:chummer-sr6:character:1'><build/></sr6:character>")
        self.assertIsNone(edits._sample(d, "crb.broken"))
        self.assertIsNone(edits._sample(d, "crb.gone"))
        self.assertIsNone(edits._sample(d, "crb.nobody"))
        # (a sample printing nothing: the samples list's source, page 1)
        got = edits._sample(d, "crb.plain")
        self.assertEqual((got.tag, got.get("source"), got.get("page")), ("samplefix", "CRB", "1"))

    def test_a_catalog_file_that_is_broken_or_gone_is_skipped(self):
        d = custom()
        imported = os.path.join(d, "imported")
        want = edits._imported(d, "weapon", "crb.zap-gun")
        self.assertIsNotNone(want)
        index = os.path.join(imported, "index.xml")
        text = Path(index).read_text(encoding="utf8")
        with open(os.path.join(imported, "broken.xml"), "w", encoding="utf8") as f:
            f.write("<not closed")
        with open(index, "w", encoding="utf8") as f:
            f.write(text.replace("<overlays>", '<overlays>\n  <file href="gone.xml"/>\n  <file href="broken.xml"/>'))
        got = edits._imported(d, "weapon", "crb.zap-gun")
        self.assertEqual(got.attrib, want.attrib)  # (the entry is still found past them)
        self.assertIsNone(edits._imported(d, "weapon", "crb.nope"))


if __name__ == "__main__":
    unittest.main()
