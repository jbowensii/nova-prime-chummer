"""Anarchy's effects read as general rules (importer/effects.py, the Mapper's tests() and extended readings, item effects,
references): made-up sentences in the books' phrasing."""
import unittest

from importer import effects as fx
from importer.recipes import dhsa

SPECS = {("perception", "physical"): "perception.physical", ("influence", "intimidation"): "influence.intimidation",
         ("perception", "social"): "perception.social", ("athletics", "ranged defense"): "athletics.ranged-defense"}


def kinds(sentence, entry=""):
    return [(r, p, v, st) for r, p, v, _, st in dhsa.Mapper(SPECS).rules(sentence, entry)]


class RulesTest(unittest.TestCase):
    def test_advantage_on_a_test_and_for_edge(self):
        self.assertEqual(kinds("The subject gains an Advantage on Close Combat and Athletics (ranged defense) Tests."),
                         [("advantage", "close-combat", None, {}), ("advantage", "athletics.ranged-defense", None, {})])
        self.assertEqual(kinds("May gain an Advantage on Intimidation Tests in exchange for 1 Edge point when the moon is out."),
                         [("edge-advantage", "influence.intimidation", None, {"when": "when the moon is out", "switch": "conditional"})])
        self.assertEqual(kinds("Spend a point of Edge to gain an Advantage."), [("edge-advantage", "", None, {})])

    def test_disadvantage_on_the_character_or_inflicted(self):
        self.assertEqual(kinds("Disadvantage on Charisma- and Willpower-based Tests."),
                         [("disadvantage", "cha", None, {}), ("disadvantage", "wil", None, {})])
        self.assertEqual(kinds("Disadvantage on all their other Tests."), [("disadvantage", "", None, {})])
        self.assertEqual(kinds("Disadvantage on a social Test."), [("disadvantage", "custom:Social", None, {})])  # not Perception (social)
        self.assertEqual(kinds("Imposes a Disadvantage on anyone sniffing the glitter.")[0][0], "inflict-disadvantage")

    def test_negated_disadvantage_and_visions(self):
        self.assertEqual(kinds("Grants Low-Light Vision."), [("no-disadvantage", "Low-light vision", None, {})])
        self.assertNotIn("no-disadvantage", [k[0] for k in kinds("Thermal vision doesn’t negate this Disadvantage.")])
        self.assertEqual(kinds("Ignores the glare Disadvantage.")[0][:2], ("no-disadvantage", "Ignores the glare Disadvantage"))

    def test_rule_changing_kinds(self):
        self.assertEqual(kinds("Allows the user to ignore wound modifiers.")[0][:2], ("ignore-wounds", ""))
        self.assertEqual(kinds("Allows ignoring Light Wound penalties.")[0][:2], ("ignore-wounds", "light"))
        self.assertEqual(kinds("Must take a High or Extreme Risk for all of their actions.")[0][0], "forced-risk")
        self.assertEqual(kinds("6 risk dice minimum for attack Tests (or the whole pool if less than 6).")[0][:3], ("min-risk-dice", "", 6))
        self.assertEqual(kinds("Accustomed to banter; social armor 2.")[0][:3], ("social-armor", "", 2))
        self.assertEqual(kinds("Matrix Armor +1.")[0][:3], ("matrix-armor", "", 1))
        self.assertEqual(kinds("Allows maintaining an additional Complex form.")[0][0], "sustain-form")
        self.assertEqual(kinds("The last point of Essence counts double.")[0][0], "essence-implant")
        self.assertEqual(kinds("Lets a magician ignore the loss of one Essence point for spells.")[0][0], "essence-magic")
        self.assertEqual(kinds("Once the effects fade away, the character suffers a Serious Wound.")[0][:2], ("self-wound", "serious"))
        self.assertEqual(kinds("Immunity against inhaled glitter.")[0][:2], ("immunity", "inhaled glitter"))

    def test_edge_and_allows(self):
        self.assertEqual(kinds("Allows recovering 1 Edge point when the pipes rattle.")[0][0], "edge-gain")
        self.assertEqual(kinds("Ignite the target for 1 point of Edge.")[0][:2], ("edge-effect", "Ignite the target for 1 point of Edge"))
        self.assertEqual(kinds("Allows you to juggle three teacups."), [("allow-test", "juggle three teacups", None, {})])
        self.assertEqual(kinds("Requires one Edge point to activate its effects."), [])  # the switch, not an effect

    def test_state(self):
        self.assertEqual(fx.state("RR 1 on Willpower Tests.", "RR 1 on Willpower Tests. Duration: One scene"), {"switch": "activated"})
        self.assertEqual(fx.state("Increases the Armor by 1 per 3 hits."), {"confidence": "low"})
        self.assertEqual(fx.state("DV +1 (or +2 if rested)."), {})  # a parenthesis is an aside, not a condition
        self.assertEqual(fx.state("Disadvantage on all Tests during the following scene.")["when"], "during the following scene")


class MapperTest(unittest.TestCase):
    def setUp(self):
        self.m = dhsa.Mapper(SPECS)

    def test_tests(self):
        self.assertEqual(self.m.tests("Survival (first aid) + Logic"), ["custom:Survival (first aid) + Logic"])  # no such spec here
        self.assertEqual(self.m.tests("Perception (physical)"), ["perception.physical"])
        self.assertEqual(self.m.tests("Strengthand Agility"), ["str", "agi"])
        self.assertEqual(self.m.tests("Willpower- based"), ["wil"])
        self.assertEqual(self.m.tests("all"), [""])

    def test_extended_readings(self):
        e = self.m.effects
        self.assertEqual(e("DV+1 on unarmed attacks"), [("dv-plus", None, None, None)])
        self.assertEqual([f[0] for f in e("+2 Edge point per VR scene")], ["init-1", "init-2", "init-3", "init-realm", "init-realm", "init-realm"])
        self.assertEqual(e("+1 action per VR narration"), [("init-2", None, None, None), ("init-realm", "vr", None, None)])
        self.assertEqual(e("Sets the range of glitter guns to [Dis/OK/OK/OK]."), [("range-improve", "Dis/OK/OK/OK", None, None)])
        self.assertEqual(e("+1 Mental armor"), [("mental-armor", None, None, None)])
        self.assertEqual(e("DNI and Cold-sim"), [("vr-cold", None, None, None)])
        self.assertEqual([f[0] for f in e("RR 1 on all Perception (Physical) Tests")], ["rr-spec"])
        self.m.extended = False
        self.assertIsNone(e("DV+1 on unarmed attacks"))

    def test_read_amp_keeps_the_printed_rating(self):
        calls = []

        def read():
            calls.append(self.m.extended)
            return ([], [], 3 if self.m.extended else 1)
        self.assertEqual(dhsa.read_amp(self.m, read, 1)[2], 1)  # the extended reading overshot: read again without it
        self.assertEqual(calls, [True, False])
        self.assertTrue(self.m.extended)

    def test_one_init(self):
        f = lambda r, p=None: (r, p, None, None)  # noqa: E731
        self.assertEqual(dhsa.one_init([f("init-1"), f("init-realm", "vr"), f("init-1"), f("init-realm", "vr")]), [f("init-1"), f("init-realm", "vr")])


class ItemsAndReferencesTest(unittest.TestCase):
    def test_item_effects(self):
        m = dhsa.Mapper(SPECS)
        got = dhsa.item_effects(m, "Increases the Armor Rating applicable to both physical and magical attacks by 1 per 4 hits.", sustained=True)
        self.assertEqual([(f[0], f[4]) for f in got], [("armor-plus", {"confidence": "low", "switch": "sustained"}),
                                                      ("mental-armor", {"confidence": "low", "switch": "sustained"})])
        got = dhsa.item_effects(m, "The effect is identical to the Initiative Enhancement Amps. • 3 hits: +1 Edge per action scene.")
        self.assertEqual(sorted({f[0] for f in got}), ["init-1", "init-2", "init-3"])
        self.assertTrue(all(f[4].get("confidence") == "low" for f in got))

    def test_references(self):
        lines = ['  <amp id="cat-sight" type="quality"><name>Cat sight</name><narrative></narrative></amp>',
                 '  <item id="spell-glow" kind="spell"><name>Glow</name><effect ref="advantage" param="influence"/><text></text></item>',
                 '  <item id="spell-glimmer" kind="spell"><name>Glimmer</name><text></text></item>',
                 '  <amp id="puppet" type="quality"><name>Puppet</name><narrative></narrative></amp>']
        texts = {"cat-sight": "Sees in the dark like a gnome.", "spell-glimmer": "Acts exactly the same way as a glow.",
                 "puppet": "Moves like a glow."}
        dhsa.link_references(lines, texts, "MADE", [("gnome", "Gnome", '<effect ref="no-disadvantage" param="Dusk sight"/>')])
        self.assertIn('<effect ref="no-disadvantage" param="Dusk sight" from="gnome"/>', lines[0])
        self.assertIn('<effect ref="advantage" param="influence" from="made.spell-glow"/>', lines[2])
        self.assertNotIn("from=", lines[3])  # "like" names a metatype, never an entry


if __name__ == "__main__":
    unittest.main()
