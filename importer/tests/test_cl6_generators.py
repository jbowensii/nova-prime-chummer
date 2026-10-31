"""tools/cl6check/options.py and markers.py end to end on an invented record, entry and book table (no jar): the rows
they write into the table."""

import json
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

from tools.cl6check import markers, options

XML = (
    '<quality id="zz_q" karma="2" type="METAGENIC"><choices><choice type="SUBSELECT" ref="tempo">'
    '<subOption id="slow"/><subOption id="fast" cost="10"/></choice></choices>'
    '<variant id="v1"><flags><flag>CYBERLIMB</flag></flags></variant></quality>'
)


def record():
    """A reader record of the invented quality (the core rulebook's)."""
    el = ET.fromstring(XML)
    return {
        "book": "core",
        "file": "qualities",
        "tag": "quality",
        "id": "zz_q",
        "name": "Zed Quality",
        "page": "1",
        "wifi": False,
        "variants": {"v1": "Only"},
        "options": {"tempo.slow": "Slow", "tempo.fast": "Fast"},
        "attrs": dict(el.attrib),
        "el": el,
    }


ENTRY = {"src": "crb", "kind": "qualities", "id": "crb.zed", "name": "Zed", "attrs": {}}
IDX = {("crb", "qualities", "crb.zed"): ENTRY}


class GeneratorsTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
        self.table = Path(self.dir.name) / "crb.json"
        self.table.write_text(
            '[\n  {"cl6": "Zed Quality", "kind": "qualities", "id": "zed", "kids": [], "gen": "family"}\n]\n'
        )

    def tearDown(self):
        self.dir.cleanup()

    def rows(self):
        return json.loads(self.table.read_text(encoding="utf8"))

    def test_options_writes_the_sub_options_and_variants(self):
        with (
            mock.patch.object(options, "OVERRIDES", Path(self.dir.name)),
            mock.patch.object(options.reader, "read", return_value=([record()], {})),
            mock.patch.object(options.reader, "find_jar", return_value="jar"),
            mock.patch.object(options.ours, "index", return_value=IDX),
            mock.patch.object(
                options, "matches", return_value={("crb", "qualities", "zz_q"): {("qualities", "crb.zed")}}
            ),
        ):
            options.main(["--runs", "x"])
        kids = self.rows()[0]["kids"]
        self.assertIn({"tag": "option", "attrs": {"choice": "tempo", "id": "fast", "name": "Fast", "cost": "10"}}, kids)
        self.assertIn({"tag": "variant", "attrs": {"name": "Only"}}, kids)

    def test_markers_writes_the_class_marker_id_and_flags(self):
        with (
            mock.patch.object(markers, "OVERRIDES", Path(self.dir.name)),
            mock.patch.object(markers.reader, "read", return_value=([record()], {})),
            mock.patch.object(markers.reader, "find_jar", return_value="jar"),
            mock.patch.object(markers.ours, "index", return_value=IDX),
            mock.patch.object(markers, "pairs", return_value=[(record(), ENTRY)]),
        ):
            markers.main(["--runs", "x"])
        rows = self.rows()
        self.assertIn(
            {
                "cl6": "Zed Quality",
                "kind": "qualities",
                "id": "zed",
                "set": {"class": "METAGENIC", "cl6": "zz_q"},
                "gen": "marker",
            },
            rows,
        )
        self.assertIn({"tag": "flag", "text": "CYBERLIMB"}, rows[0]["kids"])  # (the only variant's: every variant's)

    def test_book_split_pairs_a_shorter_book_name(self):
        rec = record()
        rec["name"] = "AV Zed"
        idx = {("crb", "qualities", "crb.zed-fast"): {**ENTRY, "id": "crb.zed-fast", "name": "Zed (fast)"}}
        self.assertEqual(options.book_split(rec, idx, "qualities"), [("crb", "qualities", "crb.zed-fast")])
        self.assertEqual(options.pick_names(rec), ["Only", "Slow", "Fast"])


if __name__ == "__main__":
    unittest.main()
