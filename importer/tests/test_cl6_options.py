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


if __name__ == "__main__":
    unittest.main()
