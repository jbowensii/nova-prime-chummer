"""The importer follow-ups of 2026-10-31 (invented data, no jar): Commlink6 markers (tools/cl6check/markers.py), a
pick's `distr` kept, pack contents split, Shifter-only add-ons granted, Arrow Tap's option prices rebased."""

# pylint: disable=protected-access  # (the pack splitter's helpers, tested directly)
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import flags, sections
from tools.cl6check import familymap, markers, options


def rec(xml, **extra):
    """A reader record of the xml."""
    el = ET.fromstring(xml)
    return {"el": el, "attrs": dict(el.attrib), "variants": {}, "options": {}, "name": "", **extra}


class MarkersTest(unittest.TestCase):
    def test_marker_class_and_id(self):
        r = rec('<metaecho id="adaptive_coloration" type="DRACOGENESIS_POWER"/>')
        e = {"name": "Adaptive Coloration (Sea Drake only)", "attrs": {}}
        self.assertEqual(
            markers.marker({**r, "id": "adaptive_coloration"}, e, {"class", "cl6"}),
            {"class": "DRACOGENESIS_POWER", "cl6": "adaptive_coloration"},
        )
        self.assertEqual(
            markers.marker({**r, "id": "adaptive_coloration"}, {"name": "Adaptive Coloration", "attrs": {}}, {"cl6"}),
            {},
        )

    def test_variant_flags_split_and_common(self):
        xml = (
            '<item id="zz"><variant id="full_s"><valmod type="HOOK" ref="X" value="8"/><flags><flag>CYBERLIMB</flag>'
            '</flags></variant><variant id="fore_s"><valmod type="HOOK" ref="X" value="5"/></variant></item>'
        )
        r = rec(xml, variants={"full_s": "Full, synthetic", "fore_s": "Forearm, synthetic"})
        self.assertEqual(
            markers.variant_flags(r, {"name": "Arm (synthetic)", "attrs": {"capacity": "8"}}), ["CYBERLIMB"]
        )
        self.assertEqual(markers.variant_flags(r, {"name": "Forearm (synthetic)", "attrs": {"capacity": "5"}}), [])
        self.assertEqual(markers.variant_flags(r, {"name": "Zed", "attrs": {}}), [])  # (not every variant)

    def test_distr_kept_on_a_pick(self):
        r = rec(
            '<lifemod id="zz"><choices><choice uuid="u" type="SKILL" options="a,b" distr="1 1 1"/></choices></lifemod>'
        )
        r.update(tag="lifemod", name="Zed")
        self.assertIn(
            {"tag": "selection", "attrs": {"type": "SKILL", "options": "a,b", "distr": "1 1 1"}},
            familymap.structure(r)[1],
        )

    def test_option_prices_rebased_when_the_cheapest_is_the_price(self):
        r = rec(
            '<item id="zz" price="2000"><choices><choice type="SUBSELECT" ref="d"><subOption id="s" cost="2000"/>'
            '<subOption id="l" cost="3500"/></choice></choices></item>',
            tag="item",
        )
        self.assertEqual([k["attrs"].get("cost") for k in options.option_kids(r, "Zed")], [None, "1500"])


class ImporterTest(unittest.TestCase):
    def test_pack_items_keep_numbers_and_drop_glued_labels(self):
        self.assertEqual(
            sections._items(
                "1 month (or 2,000 nuyen), Cash 1,000 nuyen, kit (includes caps) **Fake Licenses (rating 4, two**"
            ),
            ["1 month (or 2,000 nuyen)", "Cash 1,000 nuyen", "kit (includes caps)"],
        )
        self.assertEqual(
            sections._whole(["Remington", "Remington Roomsweeper (w/ x)", "Ford"]),
            ["Remington Roomsweeper (w/ x)", "Ford"],
        )

    def test_drake_types_from_the_table_with_grants(self):
        from types import SimpleNamespace

        from importer.sr6.recipes import ll

        table = (
            "| TYPE | DRACOFORM ADJUSTMENT POINTS (6) | BASIC POWERS | SPECIAL POWER |\n|---|---|---|---|\n"
            "| Zed Drake | Body, Logic | Natural Armor, Dual Natured | Zap (Zed Drake) |\n"
        )
        rule = "you gain the downsides Memorable and Misshapen when in dracoform, and Most Wanted in both forms"
        bs = [SimpleNamespace(text=table, page=16), SimpleNamespace(text=rule, page=16)]
        cat = ll.drake_types(bs, [("armor", "Armor"), ("zap-zed-drake", "Zap (Zed Drake)")], [])
        e = cat.entries["qualities"][0]
        fx = [(c[1]["target"], c[1]["op"], c[1].get("when")) for c in e["children"] if c[0] == "effect"]
        self.assertEqual(e["attrs"]["dracoform"], "bod log")
        self.assertIn(("attr:bod", "dracoform", None), fx)
        self.assertIn(("critter-power:armor", "grant", None), fx)  # (Natural Armor: the book's Armor)
        self.assertIn(("critter-power:zap-zed-drake", "grant", None), fx)
        self.assertIn(("quality:misshapen", "grant", "dracoform"), fx)
        self.assertIn(("quality:most-wanted", "grant", None), fx)

    def test_shifter_only_add_on_granted(self):
        self.assertEqual(
            flags.specified("Natural weapon is only available when specified by the Shifter quality."),
            {"granted": "true"},
        )
        self.assertEqual(flags.specified("A quality."), {})


if __name__ == "__main__":
    unittest.main()
