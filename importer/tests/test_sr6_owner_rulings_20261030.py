"""Owner rulings 2026-10-30 that clear needs-review flags: Getaway Driver's Double Down at half cost rounds up,
Teen Diva's 2 Knowledge skills, the name-matched weapon factory parts accepted."""

import json
import math
import os
import unittest

from importer.sr6.resolve import ACCEPTED_GEARMODS

OV = os.path.join(os.path.dirname(__file__), "..", "sr6", "overrides")


def rows(book):
    """The override rows of one book file (`dc`, `dc.book`)."""
    with open(os.path.join(OV, f"{book}.json"), encoding="utf8") as f:
        return json.load(f)


class OwnerRulingsTest(unittest.TestCase):
    def test_double_down_half_rounds_up(self):
        r = next(r for r in rows("dc.book") if r.get("id") == "driving-style-getaway-driver")
        e = next(e for e in r["effects"] if e["target"] == "action:double-down")
        self.assertEqual(e["value"], "/".join(str(math.ceil(n / 2)) for n in (1, 2, 3)))  # 1/1/2
        self.assertNotIn("needs review", json.dumps(r))

    def test_teen_diva_two_knowledge_skills(self):
        r = next(r for r in rows("nf") if r.get("id") == "teen-diva" and r.get("gen") == "owner")
        self.assertEqual(r["kids"][0]["attrs"]["count"], "2")
        self.assertNotIn("needs review", r["note"])

    def test_accepted_weapon_parts(self):
        self.assertTrue({"personalized_grip_melee", "weapon_security_system"} <= ACCEPTED_GEARMODS)


if __name__ == "__main__":
    unittest.main()
