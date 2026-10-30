"""tools.cl6check.hookmap: one check per Commlink6 hook rule family, on invented records (no jar)."""

import unittest
import xml.etree.ElementTree as ET

from tools.cl6check import hookmap as h


def el(xml):
    """An invented Commlink6 record."""
    return ET.fromstring(xml)


class HookRules(unittest.TestCase):
    """One case per rule family."""

    def test_standard_hooks(self):  # Rule S
        self.assertEqual(h.standard_hooks("WEAPON_SPECIAL", "OTHER_SPECIAL"), {"FIREARMS_EXTERNAL": 99.0})
        self.assertEqual(h.standard_hooks("VEHICLES", "BOATS"), {})
        self.assertEqual(h.standard_hooks("VEHICLES", "VANS"), {"VEHICLE_TIRES": 1.0})
        self.assertEqual(h.standard_hooks("ELECTRONICS", "COMMLINK"), {"ELECTRONIC_ACCESSORY": 99.0})

    def test_software_is_concurrent_programs(self):  # SOFTWARE: the data's $CONCURRENT_PROGRAMS, the device's programs
        deck = el(
            '<item id="d" type="ELECTRONICS" subtype="CYBERDECK"><modifications>'
            '<valmod type="HOOK" ref="SOFTWARE" value="$CONCURRENT_PROGRAMS"/></modifications>'
            '<matrix programs="6"/></item>'
        )
        self.assertEqual(h.capacities(deck)["SOFTWARE"], 6.0)
        self.assertNotIn("SOFTWARE", h.capacities(el('<item id="c" type="ELECTRONICS" subtype="COMMLINK"/>')))

    def test_vehicle_hooks(self):  # Rule V
        caps, size = h.vehicle_hooks("VEHICLES", "TRUCKS", body=10, seats=3, pilot=3)
        self.assertEqual(
            caps,
            {
                "VEHICLE_CHASSIS": 10.0,
                "VEHICLE_ELECTRONICS": 10.0,
                "VEHICLE_POWERTRAIN": 10.0,
                "VEHICLE_ACCESSORY": 99.0,
                "SOFTWARE": 2.0,  # (Pilot 3 / 2 = 1.5, rounded half up)
                "VEHICLE_CF": 9.0,  # (3 seats x 1.5 = 4.5 -> 5, trucks + 4)
                "VEHICLE_HARDPOINT": 3.0,
            },
        )
        self.assertEqual(size, {})
        caps, size = h.vehicle_hooks("DRONE_SMALL", "GROUND", body=4, seats=0, pilot=0)
        self.assertEqual((caps["VEHICLE_HARDPOINT"], size), (0.5, {"VEHICLE_HARDPOINT": 0.5}))

    def test_fashion(self):  # Rule F
        self.assertEqual(h.fashion_hook("ARMOR", "ARMOR_BODY", -1), {"FASHION": 1.0})
        self.assertEqual(h.fashion_hook("ARMOR", "ARMOR_HELMET", 2), {})

    def test_size_and_mounts(self):  # Rules Z and W
        self.assertEqual(h.weapon_size("WEAPON_FIREARMS", "SHOTGUNS", None), "LARGE")
        self.assertEqual(
            [x for x, _ in h.synth_usages("WEAPON_FIREARMS", "SHOTGUNS", "LARGE", set()) if x.startswith("VEHICLE")],
            ["VEHICLE_WEAPON", "VEHICLE_WEAPON_LARGE"],
        )
        self.assertEqual(h.synth_usages("WEAPON_CLOSE_COMBAT", "BLADES", None, set()), [("VEHICLE_WEAPON_LARGE", "W")])

    def test_implant_usage(self):  # Rule I
        self.assertIn(("IMPLANT_SMG", "I"), h.synth_usages("WEAPON_SPECIAL", "OTHER_SPECIAL", "MEDIUM", set()))
        self.assertNotIn(
            ("IMPLANT_HOLDOUT", "I"), h.synth_usages("WEAPON_FIREARMS", "HOLDOUTS", "TINY", {"IMPLANT_HOLDOUT"})
        )

    def test_offered_data_variant_remove(self):  # data, variant capacity, remove
        boat = el(
            '<item type="VEHICLES" subtype="BOATS"><vehicle bod="4" pil="0" sea="2"/><modifications>'
            '<valmod type="HOOK" ref="VEHICLE_CHASSIS" value="-3"/>'
            '<itemmod type="HOOK" ref="VEHICLE_CF" remove="true"/>'
            '</modifications><variant id="v"><modifications><valmod type="HOOK" ref="OPTICAL" value="2"/>'
            "</modifications></variant></item>"
        )
        rows = h.offered(boat)
        self.assertIn({"hook": "VEHICLE_CHASSIS", "capacity": -3.0, "variant": None, "source": "data"}, rows)
        self.assertIn({"hook": "OPTICAL", "capacity": 2.0, "variant": "v", "source": "data"}, rows)
        self.assertNotIn("VEHICLE_CF", h.final_hooks(boat))

    def test_usages(self):  # cost and mode kept; CARRIED by default
        u = h.usages(el('<item type="ACCESSORY" subtype="X"><usage mode="EMBEDDED" slot="TOP" value="2"/></item>'))
        self.assertEqual(u, [{"hook": "TOP", "mode": "EMBEDDED", "cost": 2.0, "variant": None, "source": "data"}])
        self.assertEqual(h.usages(el('<item type="GEAR" subtype="X"/>'))[0]["mode"], "CARRIED")

    def test_requirement_groups(self):  # plain = group 0 (AND); each selreq its own OR group; negate kept
        rq = h.requirements(
            el(
                '<item type="A" subtype="B"><requires><datareq type="GEAR" ref="g" negate="true"/>'
                '<selreq><valuereq type="ITEM_ATTRIBUTE" ref="ITEMSUBTYPE" value="P"/>'
                '<valuereq type="ITEM_ATTRIBUTE" ref="ITEMSUBTYPE" value="Q"/></selreq></requires></item>'
            )
        )
        self.assertEqual([(r["group"], r["negate"]) for r in rq], [(0, True), (1, False), (1, False)])


if __name__ == "__main__":
    unittest.main()
