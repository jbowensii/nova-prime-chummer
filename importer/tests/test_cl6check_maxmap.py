"""tools/cl6check/maxmap.py: a Commlink6 `max` becomes a maxLevel row only where the book printed none."""

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
    def test_a_capped_quality_is_perlevel_a_capped_augmentation_is_listed(self):
        # owner ruling 2026-10-27: a capped quality (or metamagic) scales per level, so the row sets perLevel too
        rows, undecided, ambiguous, _ = maxmap.item_rows([pair({"id": "zap", "max": "3"})])
        self.assertEqual(
            rows["zz"],
            [
                {
                    "cl6": "Zap",
                    "cl6id": "zap",
                    "kind": "qualities",
                    "id": "zap",
                    "set": {"maxLevel": "3", "perLevel": "true"},
                    "gen": "max",
                }
            ],
        )
        self.assertEqual((undecided, ambiguous), ([], []))  # (a quality: auto-perLevel, not listed)
        # a metamagic too (Fury pattern: taken again up to the cap)
        self.assertEqual(
            maxmap.item_rows([pair({"id": "z", "max": "4"}, kind="metamagics")])[0]["zz"][0]["set"],
            {"maxLevel": "4", "perLevel": "true"},
        )
        # a quality already perLevel: maxLevel only, nothing to list
        self.assertEqual(maxmap.item_rows([pair({"id": "zap", "max": "3"}, per="true")])[2], [])
        # a capped item of another leveled kind (an adept power): maxLevel only, listed for the owner
        rows, _, amb, _ = maxmap.item_rows([pair({"id": "zap", "max": "2"}, kind="adeptpowers")])
        self.assertEqual(rows["zz"][0]["set"], {"maxLevel": "2"})
        self.assertEqual(amb, [("zz", "zz.zap", "Zap", 2, False)])
        # (a kind whose schema has no maxLevel gets no row, it is listed)
        rows, _, _, none = maxmap.item_rows([pair({"id": "zap", "max": "3"}, kind="augmentations")])
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
        self.assertEqual(rows["zz"][0]["set"], {"maxLevel": "3", "perLevel": "true"})

    def test_two_caps_take_the_record_named_as_the_entry_else_none(self):
        a, b = pair({"id": "a", "max": "3"}), pair({"id": "b", "max": "4", "name": "Other"})
        self.assertEqual(maxmap.item_rows([a, b])[0]["zz"][0]["set"], {"maxLevel": "3", "perLevel": "true"})
        c = pair({"id": "c", "max": "4", "name": "Third"})
        c[1]["name"] = a[1]["name"] = "Neither"
        rows, undecided, _, _ = maxmap.item_rows([a, c])
        self.assertEqual((rows, len(undecided)), ({}, 1))


class RowsTest(unittest.TestCase):
    def test_the_generated_rows_carry_commlink6s_cap(self):
        from importer.sr6 import overrides

        def cap(src, oid):
            return next(r for r in overrides.table(src) if r.get("gen") == "max" and r["id"] == oid)

        # GAS is a capped quality: perLevel too (owner ruling); 1/2/3 at 5/10/15 karma (karma 5 per level)
        self.assertEqual(cap("swc", "gear-acquisition-syndrome")["set"], {"maxLevel": "3", "perLevel": "true"})
        self.assertEqual(cap("bn", "fury")["set"], {"maxLevel": "10", "perLevel": "true"})  # a capped metamagic
        self.assertEqual(cap("crb", "improved-reflexes")["set"], {"maxLevel": "4"})  # already perLevel in the book
        rows = [r for p in overrides.DIR.glob("*.json") for r in overrides.table(p.stem) if r.get("gen") == "max"]
        self.assertGreater(len(rows), 30)
        self.assertTrue(
            all(
                set(r["set"]) <= {"maxLevel", "perLevel"}
                and "maxLevel" in r["set"]
                and r["cl6id"]
                and 2 <= int(r["set"]["maxLevel"]) < 99
                and r["set"].get("perLevel", "true") == "true"
                for r in rows
            )
        )


if __name__ == "__main__":
    unittest.main()
