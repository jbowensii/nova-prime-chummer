# pylint: disable=missing-class-docstring,missing-function-docstring,unnecessary-lambda-assignment,line-too-long  # (invented-data fixtures)
"""embedmap's placement classes and undefined-ref rules, on invented data (no jar)."""

import unittest

from tools.cl6check import embedmap

DEFS = {
    "mount": {"VEHICLE_HARDPOINT"},  # defined, usage on the embed hook
    "amenities": {"VEHICLE_CHASSIS"},
    "microdeck": {"VEHICLE_ELECTRONICS"},  # defined, usage elsewhere
    "link": set(),  # defined, no usage
    "stinger": {"VEHICLE_HARDPOINT"},  # a geardef child (inline)
    "rated": set(),
    "pilot": set(),
}
VARIANTS = {"amenities": {"high", "low"}, "pilot": {"driver_troll", "passenger_troll"}}


class EmbedMap(unittest.TestCase):
    def test_classes(self):
        c = embedmap.classify
        self.assertEqual(c("mount", "VEHICLE_HARDPOINT", DEFS), "usage-match")
        self.assertEqual(c("microdeck", "VEHICLE_CF", DEFS), "other-usage")
        self.assertEqual(c("link", "VEHICLE_CF", DEFS), "no-usage")
        self.assertEqual(c("ghost", "VEHICLE_CF", DEFS), "undefined")

    def test_measure_inline_and_dedup(self):
        emb = lambda ref, hook: {"ref": ref, "intoRef": hook, "included": "true"}  # noqa: E731
        recs = [
            {"id": "v", "geardef": ["stinger"], "embeds": [emb("stinger", "VEHICLE_HARDPOINT"), emb("ghost", "X")]},
            {"id": "v", "geardef": [], "embeds": [emb("stinger", "VEHICLE_HARDPOINT")]},  # same placement, other record
            {"id": "bare", "geardef": [], "embeds": []},
        ]
        m = embedmap.measure(recs, DEFS, VARIANTS)
        self.assertEqual((m["vehicle records"], m["with embeds"], m["without"]), (2, 1, 1))
        self.assertEqual((m["distinct placements"], m["usage-match"], m["undefined"]), (2, 1, 1))
        self.assertEqual((m["inline parts"], m["inline placements"], m["included placements"]), (1, 1, 2))

    def test_resolve(self):
        r = embedmap.resolve
        self.assertEqual(r("rated2", DEFS, VARIANTS)[0], "R-a rating")
        self.assertEqual(r("amenities_high", DEFS, VARIANTS), ("R-b", "amenities/high"))
        self.assertEqual(r("pilot_troll", DEFS, VARIANTS)[0], "R-b ambiguous")
        self.assertEqual(r("zzz_qqq", DEFS, VARIANTS)[0], "unresolved")


if __name__ == "__main__":
    unittest.main()
