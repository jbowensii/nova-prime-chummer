"""Slots and fits (the accessory associations): Commlink6's variant-level hooks and usages, the graded subset, the
generator's per-level capacity, and the importer's class rule. Invented names and numbers only."""

import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import classes
from importer.tests.test_cl6check import entry, rec
from tools.cl6check import __main__ as cli
from tools.cl6check import canon, familymap, fields, ours

# pylint: disable=protected-access  # tests reach into the module internals they cover

EYES = (
    '<item id="zeyes" type="CYBERWARE" subtype="CYBER_EYEWARE"><modifications>'
    '<valmod type="HOOK" ref="ZEYE_IMPLANT" value="$RATING" table="1,4,8,12,16"/></modifications></item>'
)
LINK = (
    '<item id="zlink" type="ACCESSORY" subtype="VISION_ENHANCEMENT"><usage mode="EMBEDDED" slot="OPTICAL" value="1"/>'
    '<variant id="zeye"><usage mode="EMBEDDED" slot="ZEYE_IMPLANT" value="1"/></variant></item>'
)


def mine(xml, name="Zorp", kind="gear", **attrs):
    """An entry of ours built from an XML snippet (its slot and fits elements)."""
    out = entry(name, kind=kind, **attrs)
    out["families"] = ours.families(ET.fromstring(xml), kind)
    return out


class CanonVariantTest(unittest.TestCase):
    def test_a_variants_usage_and_hook_are_the_items_association(self):
        self.assertEqual(
            canon.canonical(rec(LINK))["families"]["slots"], {("fits", "optical"), ("fits", "zeye-implant")}
        )
        self.assertEqual(canon.canonical(rec(EYES))["families"]["slots"], {("slot", "zeye-implant")})

    def test_a_host_never_gets_a_fit_nor_an_accessory_a_slot(self):
        for xml, tag in ((EYES, "slot"), (LINK, "fits")):
            _, kids = familymap.structure(rec(xml))
            self.assertEqual({k["tag"] for k in kids if k["tag"] in ("slot", "fits")}, {tag})


class GeneratorTest(unittest.TestCase):
    def test_a_rated_hosts_slot_value_is_the_levels_own_capacity(self):
        c = rec(EYES)
        got = {r: familymap.structure(c, r)[1][0]["attrs"]["value"] for r in (1, 2, 3, 4, 5)}
        self.assertEqual(got, {1: "1", 2: "4", 3: "8", 4: "12", 5: "16"})  # (never `$RATING`)

    def test_the_first_capacity_a_slot_is_given_wins(self):
        x = (
            '<item id="zcase"><modifications><valmod type="HOOK" ref="MODS" value="2"/></modifications>'
            '<variant id="v"><modifications><valmod type="HOOK" ref="MODS" value="0"/></modifications></variant></item>'
        )
        kids = familymap.structure(rec(x))[1]
        self.assertEqual([k["attrs"] for k in kids if k["tag"] == "slot"], [{"id": "mods", "value": "2"}])

    def test_a_new_level_value_replaces_the_old_rows_rating_variable(self):
        def row(value):
            return {
                "cl6": "Z",
                "kind": "augmentations",
                "id": "z-5",
                "gen": "family",
                "kids": [{"tag": "slot", "attrs": {"id": "zeye-implant", "value": value}}],
            }

        idx = {("gz", "augmentations", "gz.z-5"): {"name": "Z (Rating 5)", "attrs": {}}}
        got = familymap.merge([row("$RATING")], [row("16")], idx, "gz")
        self.assertEqual(got[0]["kids"], row("16")["kids"])


class GradedSubsetTest(unittest.TestCase):
    def setUp(self):
        self.c = canon.canonical(rec(LINK))

    def test_every_association_commlink6_gives_must_be_ours_and_extras_are_fine(self):
        full = mine('<gear><fits slot="optical"/><fits slot="zeye-implant"/><fits slot="more"/></gear>')
        short = mine('<gear><fits slot="optical"/></gear>')
        self.assertTrue(cli._same("slots", self.c["families"]["slots"], full, False))
        self.assertFalse(cli._same("slots", self.c["families"]["slots"], short, False))
        self.assertEqual(fields.compare(self.c, full)[1], [])
        d = fields.compare(self.c, short)[1]
        self.assertEqual([x["field"] for x in d], ["slots"])
        self.assertIn("fits zeye-implant", d[0]["cl6"])

    def test_each_rated_level_of_a_host_must_hold_it(self):
        c = canon.canonical(rec(EYES))
        lv = [
            mine('<aug><slot id="zeye-implant" value="1"/></aug>', "Zeyes (Rating 1)"),
            mine("<aug/>", "Zeyes (Rating 2)"),
        ]
        self.assertEqual([x["field"] for x in fields.compare(c, lv[0], lv)[1]], ["slots"])  # (level 2 has none)
        self.assertEqual(fields.compare(c, lv[0], lv[:1])[1], [])
        # (a model number is no level: only a printed `(Rating N)` shares the item's structure)
        self.assertEqual(len(fields.level_entries(mine("<aug/>", "Zeyes 71"), [mine("<aug/>", "Zeyes 83")])), 1)


class ClassRuleTest(unittest.TestCase):
    @staticmethod
    def run_rule(xml, kind="augmentations"):
        """[(tag, attributes)] of the entry's children after the rule."""
        doc = f'<?xml version="1.0"?>\n<sr6:data xmlns:sr6="u">\n  {xml}\n</sr6:data>\n'
        out = classes.associations({f"{kind}.xml": doc})[f"{kind}.xml"]
        return [(c.tag, dict(c.attrib)) for c in ET.fromstring(out.split("?>", 1)[1])[0]]

    def test_a_rated_eyeware_or_earware_host_gets_its_slot_at_its_capacity(self):
        eyes = '<augmentation id="a" class="CYBERWARE/CYBER_EYEWARE" capacity="8"><name>E</name></augmentation>'
        self.assertIn(("slot", {"id": "cybereye-implant", "value": "8"}), self.run_rule(eyes))
        ears = eyes.replace("EYEWARE", "EARWARE")
        self.assertIn(("slot", {"id": "cyberear-implant", "value": "8"}), self.run_rule(ears))

    def test_an_accessory_gets_no_slot_and_a_host_no_fit(self):
        acc = '<augmentation id="a" class="CYBERWARE/CYBER_EYEWARE" capacity="[2]"><name>A</name></augmentation>'
        self.assertEqual([t for t, _ in self.run_rule(acc)], ["name"])
        self.assertEqual([t for t, _ in self.run_rule(acc.replace("[2]", "—"))], ["name"])
        host = '<augmentation id="a" class="CYBERWARE/CYBER_EYEWARE" capacity="4"><name>A</name></augmentation>'
        self.assertNotIn("fits", [t for t, _ in self.run_rule(host)])

    def test_a_weapon_accessory_fits_each_mount_it_prints_and_nothing_else(self):
        w = '<weapon id="a" class="ACCESSORY/WEAPON_ACCESSORY" mount="%s"><name>A</name></weapon>'
        got = self.run_rule(w % "Top or Under", "weapons")
        self.assertEqual([a["slot"] for t, a in got if t == "fits"], ["top", "under"])
        self.assertNotIn("slot", [t for t, _ in got])
        side = self.run_rule(w % "Side", "weapons")
        self.assertEqual([a["slot"] for t, a in side if t == "fits"], ["side-l", "side-r"])
        self.assertEqual([t for t, _ in self.run_rule(w % "—", "weapons")], ["name"])

    def test_it_is_idempotent_and_leaves_a_slot_a_row_gave(self):
        eyes = (
            '<augmentation id="a" class="CYBERWARE/CYBER_EYEWARE" capacity="8"><name>E</name>'
            '<slot id="cybereye-implant" value="3"/></augmentation>'
        )
        got = self.run_rule(eyes)
        self.assertEqual(got.count(("slot", {"id": "cybereye-implant", "value": "3"})), 1)
        self.assertEqual([t for t, _ in got].count("slot"), 1)
        w = (
            '<weapon id="a" class="ACCESSORY/WEAPON_ACCESSORY" mount="Under">'
            '<name>A</name><fits slot="under"/></weapon>'
        )
        self.assertEqual([t for t, _ in self.run_rule(w, "weapons")].count("fits"), 1)


if __name__ == "__main__":
    unittest.main()
