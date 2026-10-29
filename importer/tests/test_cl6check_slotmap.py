"""tools/cl6check/slotmap.py: a Commlink6 HOOK becomes a `<slot value>` kid, a usage a `<fits cost mode>`, a
requirement a grouped `<prerequisite>` (invented data, no jar)."""

import unittest
from collections import Counter
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
    def test_a_hook_value_and_a_usage_become_slot_and_fits_with_cost_and_mode(self):
        rows = slotmap.rows_of([pair(hooks=[("VEHICLE_CHASSIS", "7"), ("VEHICLE_CF", None)])])
        self.assertEqual(
            rows["zz"],
            [
                {
                    "cl6": "Zap Van",
                    "cl6id": "van",
                    "kind": "vehicles",
                    "id": "van",
                    "set": {"usage": "carried"},  # (an item with no usage: Commlink6 carries it, never fits it)
                    "kids": [
                        {"tag": "slot", "attrs": {"id": "vehicle-chassis", "value": "7"}},
                        {"tag": "slot", "attrs": {"id": "vehicle-cf"}},
                    ],
                    "gen": "slot",
                }
            ],
        )
        c, o = pair(kind="augmentations", oid="zz.gun")
        ET.SubElement(c["el"], "usage", {"mode": "IMPLANTED", "slot": "CYBERLIMB_IMPLANT", "value": "2"})
        self.assertEqual(
            slotmap.rows_of([(c, o)])["zz"][0]["kids"],
            [{"tag": "fits", "attrs": {"slot": "cyberlimb-implant", "cost": "2", "mode": "implanted"}}],
        )

    def test_any_hook_and_kind_and_a_removal(self):
        c, o = pair(hooks=[("CYBEREYE_IMPLANT", "4")], kind="augmentations", oid="zz.eye")
        ET.SubElement(c["el"].find("modifications"), "itemmod", {"type": "HOOK", "ref": "VEHICLE_CF", "remove": "true"})
        self.assertEqual(
            slotmap.rows_of([(c, o)])["zz"][0]["kids"],
            [
                {"tag": "slot", "attrs": {"id": "cybereye-implant", "value": "4"}},
                {"tag": "slot", "attrs": {"id": "vehicle-cf", "remove": "true"}},
            ],
        )
        self.assertEqual(slotmap.rows_of([pair(hooks=[("VEHICLE_CF", "2")], oid="other.van")]), {})

    def test_a_variant_capacity_is_the_one_the_entry_prints(self):
        c, o = pair(kind="augmentations", oid="zz.arm", name="Arm (obvious)")
        o["attrs"]["capacity"] = "15"
        for vid, val in (("fullarm_synthetic", "8"), ("fullarm_obvious", "15")):
            v = ET.SubElement(c["el"], "variant", {"id": vid})
            ET.SubElement(v, "valmod", {"type": "HOOK", "ref": "CYBERLIMB_IMPLANT", "value": val})
        report = Counter()
        kids = slotmap.rows_of([(c, o)], report)["zz"][0]["kids"]
        self.assertEqual(kids, [{"tag": "slot", "attrs": {"id": "cyberlimb-implant", "value": "15"}}])
        self.assertEqual(report["variant.matched"], 1)

    def test_requirements_keep_their_selreq_groups(self):
        c, o = pair(kind="weapons", oid="zz.holster")
        rq = ET.SubElement(c["el"], "requires")
        sel = ET.SubElement(rq, "selreq")
        for size in ("TINY", "SMALL"):
            ET.SubElement(sel, "valuereq", {"type": "ITEM_ATTRIBUTE", "ref": "WEAPON_SIZE", "value": size})
        ET.SubElement(rq, "datareq", {"type": "ITEMTYPE", "ref": "WEAPON_FIREARMS", "apply": "DATA_ITEM"})
        kids = slotmap.rows_of([(c, o)])["zz"][0]["kids"]
        self.assertEqual(
            [k["attrs"] for k in kids],
            [
                {"kind": "valuereq", "type": "ITEM_ATTRIBUTE", "ref": "WEAPON_SIZE", "value": "TINY", "group": "1"},
                {"kind": "valuereq", "type": "ITEM_ATTRIBUTE", "ref": "WEAPON_SIZE", "value": "SMALL", "group": "1"},
                {"kind": "datareq", "type": "ITEMTYPE", "ref": "WEAPON_FIREARMS", "apply": "DATA_ITEM"},
            ],
        )

    def test_family_rows_lose_the_kids_this_generator_now_gives(self):
        new = [
            {
                "kind": "weapons",
                "id": "s",
                "kids": [{"tag": "prerequisite", "attrs": {"kind": "valuereq", "type": "T", "ref": "R", "group": "1"}}],
            }
        ]
        old = [
            {
                "kind": "weapons",
                "id": "s",
                "gen": "family",
                "kids": [
                    {"tag": "fits", "attrs": {"slot": "barrel"}},
                    {"tag": "prerequisite", "attrs": {"kind": "valuereq", "type": "T", "ref": "R"}},
                    {"tag": "prerequisite", "attrs": {"kind": "valuereq", "type": "WEAPON_TYPE", "ref": "revolvers"}},
                ],
            },
            {"kind": "weapons", "id": "x", "gen": "family", "kids": [{"tag": "fits", "attrs": {"slot": "top"}}]},
        ]
        got = slotmap._strip_family(old, new)  # pylint: disable=protected-access
        self.assertEqual(got[0]["kids"], [old[0]["kids"][2]])  # (the owner's own prerequisite stays)
        self.assertEqual(got[1], old[1])  # (an entry the generator has no row for is left)

    def test_an_item_enhancement_and_a_usage_with_a_hook(self):
        c, o = pair(kind="weapons", oid="zz.rail")
        c["el"].tag = "itemenhancement"
        self.assertEqual(slotmap.usage_of(c["el"]), "enhancement")
        c, o = pair(kind="weapons", oid="zz.scope", embeds=["TOP"])
        self.assertIsNone(slotmap.usage_of(c["el"]))


class RowsTest(unittest.TestCase):
    def test_the_generated_rows_carry_commlink6s_hooks(self):
        from importer.sr6 import overrides

        rows = [r for p in overrides.DIR.glob("*.json") for r in overrides.table(p.stem) if r.get("gen") == "slot"]
        self.assertGreater(len(rows), 100)
        for r in rows:
            self.assertTrue(r["cl6id"])
            for k in r.get("kids", []):
                self.assertIn(k["tag"], ("slot", "fits", "prerequisite"))


if __name__ == "__main__":
    unittest.main()
