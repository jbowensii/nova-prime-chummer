"""tools/cl6check/maxmap.py: a Commlink6 `max` becomes a maxLevel row only where the book printed none (invented names)."""

import unittest
import xml.etree.ElementTree as ET

from tools.cl6check import maxmap


def pair(cl6, name="Zap", oid="zz.zap", maxlevel=None, per=None, **o):
    """(Commlink6 record, our entry) with the given Commlink6 attributes."""
    attrs = {k: v for k, v in (("maxLevel", maxlevel), ("perLevel", per)) if v}
    return (
        {"name": cl6.pop("name", name), "el": ET.Element("item", cl6)},
        {"src": "zz", "kind": o.get("kind", "qualities"), "id": oid, "name": name, "attrs": attrs},
    )


class MaxMapTest(unittest.TestCase):
    def test_a_cap_becomes_a_maxlevel_row_and_perlevel_stays_the_books(self):
        rows, undecided, ambiguous, _ = maxmap.item_rows([pair({"id": "zap", "max": "3"})])
        self.assertEqual(
            rows["zz"],
            [{"cl6": "Zap", "cl6id": "zap", "kind": "qualities", "id": "zap", "set": {"maxLevel": "3"}, "gen": "max"}],
        )
        self.assertEqual(
            (undecided, ambiguous), ([], [("zz", "zz.zap", "Zap", 3, False)])
        )  # (no perLevel: owner rules)
        self.assertEqual(maxmap.item_rows([pair({"id": "zap", "max": "3"}, per="true")])[2], [])
        # (a kind whose schema has no maxLevel gets no row, it is listed)
        rows, _, _, none = maxmap.item_rows([pair({"id": "zap", "max": "3"}, kind="vehicledesign")])
        self.assertEqual((rows, none), ({}, [("zz", "zz.zap", 3)]))

    def test_no_cap_a_single_level_and_a_printed_max_make_no_row(self):
        for p in (
            pair({"id": "zap", "max": "99"}),
            pair({"id": "zap", "max": "1"}),
            pair({"id": "zap"}),
            pair({"id": "zap", "max": "3"}, maxlevel="2"),
        ):
            self.assertEqual(maxmap.item_rows([p])[0], {})
        # (a row of an earlier run is regenerated, not mistaken for the book's)
        rows = maxmap.item_rows([pair({"id": "zap", "max": "3"}, maxlevel="3")], {("zz", "qualities", "zz.zap")})[0]
        self.assertEqual(rows["zz"][0]["set"], {"maxLevel": "3"})

    def test_two_caps_take_the_record_named_as_the_entry_else_none(self):
        a, b = pair({"id": "a", "max": "3"}), pair({"id": "b", "max": "4", "name": "Other"})
        self.assertEqual(maxmap.item_rows([a, b])[0]["zz"][0]["set"], {"maxLevel": "3"})
        c = pair({"id": "c", "max": "4", "name": "Third"})
        c[1]["name"] = a[1]["name"] = "Neither"
        rows, undecided, _, _ = maxmap.item_rows([a, c])
        self.assertEqual((rows, len(undecided)), ({}, 1))


class RowsTest(unittest.TestCase):
    def test_the_generated_rows_carry_commlink6s_cap(self):
        from importer.sr6 import overrides

        def cap(src, oid):
            return next(r for r in overrides.table(src) if r.get("gen") == "max" and r["id"] == oid)

        self.assertEqual(cap("swc", "gear-acquisition-syndrome")["set"], {"maxLevel": "3"})  # (CL6 max 3)
        self.assertEqual(cap("crb", "improved-reflexes")["set"], {"maxLevel": "4"})
        rows = [r for p in overrides.DIR.glob("*.json") for r in overrides.table(p.stem) if r.get("gen") == "max"]
        self.assertGreater(len(rows), 30)
        self.assertTrue(
            all(list(r["set"]) == ["maxLevel"] and r["cl6id"] and 2 <= int(r["set"]["maxLevel"]) < 99 for r in rows)
        )


if __name__ == "__main__":
    unittest.main()
