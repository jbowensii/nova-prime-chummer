"""tools/cl6check/options.py: Commlink6 sub-options and variants as <option>/<variant> kids (invented, no jar)."""

import unittest
import xml.etree.ElementTree as ET

from tools.cl6check import options


def rec(xml, **extra):
    """A reader record of the xml."""
    el = ET.fromstring(xml)
    return {"el": el, "attrs": dict(el.attrib), "variants": {}, "options": {}, **extra}


class OptionsTest(unittest.TestCase):
    def test_suboptions_with_cost_and_effect(self):
        r = rec(
            '<quality id="zz"><choices><choice type="SUBSELECT" ref="tempo"><subOption id="slow"/>'
            '<subOption id="fast" cost="10"><modifications><checkmod type="SKILL" ref="con" value="-2" what="DICE"/>'
            "</modifications></subOption></choice></choices></quality>",
            options={"tempo.slow": "Slow", "tempo.fast": "Fast"},
        )
        kids = options.option_kids(r, "Zed")
        self.assertEqual(
            [k["attrs"] for k in kids if k["tag"] == "option"],
            [
                {"choice": "tempo", "id": "slow", "name": "Slow"},
                {"choice": "tempo", "id": "fast", "name": "Fast", "cost": "10"},
            ],
        )
        self.assertEqual(
            [k["attrs"] for k in kids if k["tag"] == "effect"],
            [{"target": "skill:con", "op": "add", "value": "-2", "option": "tempo.fast"}],
        )
        self.assertEqual(options.option_kids(r, "Zed (Fast)"), [])  # (a book's entry per option: none)

    def test_required_variants_priced_unless_split(self):
        r = rec(
            '<item id="zz" reqVariant="y"><variant id="full_synthetic"><usage mode="IMPLANTED" value="1.0"/>'
            '<attrdef id="PRICE" value="$RATING*10"/><attrdef id="AVAILABILITY" value="$RATING+3 L"/></variant></item>',
            variants={"full_synthetic": "Full, synthetic"},
        )
        self.assertEqual(
            options.variant_kids(r, "Zed", 2),
            [
                {
                    "tag": "variant",
                    "attrs": {
                        "name": "Full, synthetic",
                        "price": "20",
                        "essence": "1",
                        "avail": "5L",
                        "required": "true",
                    },
                }
            ],
        )
        self.assertIsNone(options.variant_kids(r, "Arm (synthetic)", None))

    def test_variant_carries_its_own_cf(self):
        r = rec(
            '<item id="zz" reqVariant="y"><variant id="a"><usage mode="EMBEDDED" slot="VEHICLE_CF" value="0"/>'
            '<attrdef id="PRICE" value="500"/></variant><variant id="b"><usage mode="EMBEDDED" slot="VEHICLE_CF" value="1"/>'
            '<attrdef id="PRICE" value="500"/></variant></item>',
            variants={"a": "Dwarf", "b": "Troll"},
        )
        self.assertEqual([k["attrs"].get("cf") for k in options.variant_kids(r, "Zed", None)], ["0", "1"])


class SplitTest(unittest.TestCase):
    def test_split_entry_gets_its_option_and_the_shared_data(self):
        r = rec(
            '<quality id="zz"><geardef><item id="zz_weapon" type="WEAPON_CLOSE_COMBAT"><weapon dmg="4P"/></item>'
            '</geardef><choices><choice type="SUBSELECT" ref="type"><subOption id="furry"><requires>'
            '<valuereq type="ATTRIBUTE" ref="BODY" value="3"/></requires><modifications>'
            '<itemmod type="CRITTER_POWER" ref="natural_weapon"/></modifications></subOption><subOption id="fins"/>'
            '</choice></choices><modifications><itemmod type="QUALITY" ref="shift"/></modifications></quality>',
            options={"type.furry": "Furry", "type.fins": "Fins"},
        )
        kids = options.split_kids(r, "Zed (Furry)")
        furry = {"split": "type.furry"}
        self.assertEqual(
            [k["attrs"] for k in kids],
            [
                {"kind": "itemmod", "type": "CRITTER_POWER", "ref": "natural_weapon", **furry},
                {"kind": "valuereq", "type": "ATTRIBUTE", "ref": "BODY", "value": "3", "apply": "CHARACTER", **furry},
                {"kind": "itemmod", "type": "QUALITY", "ref": "shift", "split": "shared"},
                {"kind": "geardef", "id": "zz_weapon", "type": "WEAPON_CLOSE_COMBAT", "dmg": "4P", "split": "shared"},
            ],
        )
        self.assertEqual(options.split_kids(r, "Zed"), [])  # (no single option named: nothing)
        row = {"kids": [{"tag": "modifier", "attrs": {"kind": "itemmod", "type": "QUALITY", "ref": "shift"}}]}
        placed = options._place_split(row, kids)  # pylint: disable=protected-access
        self.assertEqual(sum(1 for k in placed if k["attrs"].get("ref") == "shift"), 1)  # (the shared one once)


if __name__ == "__main__":
    unittest.main()
