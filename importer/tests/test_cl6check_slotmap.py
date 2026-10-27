"""tools/cl6check/slotmap.py: a Commlink6 vehicle-* HOOK becomes a per-vehicle `<slot value>` row and an EMBEDDED
usage a `<fits>`; non-vehicle associations and non-vehicle kinds are left out (invented data, no jar)."""

import unittest
import xml.etree.ElementTree as ET

from tools.cl6check import slotmap


def pair(hooks=(), embeds=(), kind="vehicles", oid="zz.van", name="Zap Van", src="zz"):
    """(canonical Commlink6 record, our entry): `hooks` are (ref, value) HOOK mods, `embeds` EMBEDDED usage slots."""
    el = ET.Element("item", {"id": "van"})
    mods = ET.SubElement(el, "modifications")
    for ref, val in hooks:
        ET.SubElement(mods, "valmod", {"type": "HOOK", "ref": ref, **({"value": val} if val else {})})
    for slot in embeds:
        ET.SubElement(el, "usage", {"mode": "EMBEDDED", "slot": slot})
    c = {"name": name, "el": el, "src": src, "kind": kind, "id": oid}
    o = {"src": src, "kind": kind, "id": oid, "name": name, "attrs": {}}
    return (c, o)


class SlotMapTest(unittest.TestCase):
    def test_a_vehicle_hook_value_and_an_embedded_usage_become_slot_and_fits(self):
        rows = slotmap.rows_of([pair(hooks=[("VEHICLE_CHASSIS", "7"), ("VEHICLE_CF", None)])])
        self.assertEqual(
            rows["zz"],
            [
                {
                    "cl6": "Zap Van",
                    "cl6id": "van",
                    "kind": "vehicles",
                    "id": "van",
                    "kids": [
                        {"tag": "slot", "attrs": {"id": "vehicle-chassis", "value": "7"}},
                        {"tag": "slot", "attrs": {"id": "vehicle-cf"}},
                    ],
                    "gen": "slot",
                }
            ],
        )

    def test_the_exact_hook_is_kept_including_the_bare_vehicle_weapon(self):
        kids = slotmap.rows_of([pair(hooks=[("VEHICLE_WEAPON", None), ("VEHICLE_WEAPON_LARGE", None)])])["zz"][0][
            "kids"
        ]
        self.assertEqual({k["attrs"]["id"] for k in kids}, {"vehicle-weapon", "vehicle-weapon-large"})

    def test_a_mods_embedded_vehicle_slot_is_a_fits(self):
        kids = slotmap.rows_of([pair(embeds=["VEHICLE_ELECTRONICS"], kind="gear", oid="zz.rig")])["zz"][0]["kids"]
        self.assertEqual(kids, [{"tag": "fits", "attrs": {"slot": "vehicle-electronics"}}])

    def test_non_vehicle_associations_and_kinds_are_left_out(self):
        # a non-vehicle HOOK/fits on a vehicle: no vehicle-* kid, so no row
        self.assertEqual(slotmap.rows_of([pair(hooks=[("CYBEREYE_IMPLANT", "4")], embeds=["WEAPON_TOP"])]), {})
        # a kind the generator does not cover (armor): no row even with a vehicle hook
        self.assertEqual(slotmap.rows_of([pair(hooks=[("VEHICLE_CF", "2")], kind="armor", oid="zz.vest")]), {})
        # an id not under its source prefix: skipped
        self.assertEqual(slotmap.rows_of([pair(hooks=[("VEHICLE_CF", "2")], oid="other.van")]), {})


class RowsTest(unittest.TestCase):
    def test_the_generated_rows_carry_commlink6s_vehicle_slots(self):
        from importer.sr6 import overrides

        rows = [r for p in overrides.DIR.glob("*.json") for r in overrides.table(p.stem) if r.get("gen") == "slot"]
        self.assertGreater(len(rows), 100)  # Double Clutch alone gives ~124
        for r in rows:
            self.assertTrue(r["cl6id"] and r["kind"] in ("vehicles", "gear", "weapons"))
            for k in r["kids"]:
                self.assertIn(k["tag"], ("slot", "fits"))
                self.assertTrue((k["attrs"].get("id") or k["attrs"].get("slot", "")).startswith("vehicle-"))


if __name__ == "__main__":
    unittest.main()
