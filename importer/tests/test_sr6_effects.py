"""The SR6 effects reader (importer/sr6/effects.py): general phrasings over made-up text, a table's modifier columns, the
import's pass over every entry, and the description fixes it relies on (regroup's part headings and page-break
continuations). All invented."""
import unittest

from importer.sr6 import effects, regroup


def fx(text, kind=None):
    """[(target, op, value, switch, when)] of the effects read from `text`."""
    return [(a["target"], a["op"], a["value"], a.get("switch"), a.get("when")) for t, a, _ in effects.read(text, kind) if t == "effect"]


class ReadTest(unittest.TestCase):
    def test_attributes_lists_and_levels(self):
        self.assertEqual(fx("You get a +1 to your Agility, Body, and Strength."),
                         [("attr:agi", "add", "1", None, None), ("attr:bod", "add", "1", None, None), ("attr:str", "add", "1", None, None)])
        self.assertEqual(fx("The zapgland increases both your Strength and Logic attributes by its rating."),
                         [("attr:str", "add", "R", None, None), ("attr:log", "add", "R", None, None)])
        self.assertEqual(fx("For each level of this power, add an Initiative Die and increase your Reaction by 1."),
                         [("derived:initiative-dice", "add", "R", None, None), ("attr:rea", "add", "R", None, None)])
        self.assertEqual(fx("Effect: -1 Reaction, +2 Logic", "gear"),  # a drug's effect line: while it acts
                         [("attr:rea", "add", "-1", "activated", None), ("attr:log", "add", "2", "activated", None)])

    def test_defense_monitors_actions(self):
        self.assertEqual(fx("It grants +3 Defense Rating."), [("derived:defense", "add", "3", None, None)])
        self.assertEqual(fx("You gain 1 level of natural Armor."), [("derived:defense", "add", "1", None, None)])
        self.assertEqual(fx("Each zaplimb adds one box to the character's Physical Condition Monitor."),
                         [("derived:physical-monitor", "add", "1", None, None)])
        self.assertEqual(fx("You have 1 less Stun Box for each level of this quality."), [("derived:stun-monitor", "add", "-R", None, None)])
        self.assertEqual(fx("You gain two additional Damage Overflow boxes."), [("derived:overflow", "add", "2", None, None)])
        self.assertEqual(fx("It grants an additional Minor Action."), [("derived:minor-actions", "add", "1", None, None)])
        self.assertEqual(fx("Crew served: 2 additional Major Actions required to reload this zapper."), [])  # a cost
        self.assertEqual(fx("It grants the Hardened Armor ability at rating 2."), [("derived:hardened-armor", "add", "2", None, None)])
        self.assertEqual(fx("Light zapsuits reduce incoming DV by 1."), [("derived:damage-reduction", "add", "1", None, None)])

    def test_test_types_and_specializations(self):
        self.assertEqual(fx("You gain a point of Edge on all Social tests."), [("test:social", "edge", "1", None, None)])
        self.assertEqual(fx("You cannot spend Edge on any test using Charisma."), [("test:attr-cha", "no-edge", "1", None, None)])
        self.assertEqual(fx("The user gains a +2 dice pool bonus to all climbing tests."), [("skill:athletics", "add", "2", None, None)])
        self.assertEqual(effects.read("The user gains a +2 dice pool bonus to all climbing tests.")[0][1]["spec"], "Climbing")
        self.assertEqual(fx("You gain a bonus Edge on all tests involving juggling.")[0][:3], ("test:other", "edge", "1"))
        self.assertEqual(fx("Gain +1 Edge on Toxin Resistance tests."), [("test:toxin-resistance", "edge", "1", None, None)])

    def test_edge_costs_and_roles(self):
        self.assertEqual(fx("**Magician:** Edge Boosts cost 1 less for Illusion spells"),
                         [("test:spell-illusion", "edge-cost", "-1", "conditional", "magician")])
        self.assertEqual(fx("**All:** Edge Boosts cost 1 less for tests to resist damage (not including drain)"),
                         [("test:damage-resistance", "edge-cost", "-1", None, None)])
        self.assertEqual(fx("Reduce the Edge cost of the Glow Kick Edge Action by 1."), [("action:glow-kick", "edge-cost", "-1", None, None)])
        self.assertEqual(fx("Swap in a wild die on any roll made for Firearms."), [("skill:firearms", "wild-die", "1", None, None)])

    def test_matrix_items_and_bands(self):
        self.assertEqual(fx("This module provides a Sleaze attribute equal to its rating.", "gear"), [("matrix:sleaze", "add", "R", None, None)])
        self.assertEqual(fx("When hacking, reduce OS by 1 for every illegal action.")[0][:3], ("matrix:overwatch", "add", "-1"))
        self.assertEqual(fx("Note: This mod alters the AR as follows: +2/–/–1/–2/–3.", "weapons"),
                         [("item:ar", "add", "2,0,-1,-2,-3", None, None)])
        self.assertEqual(fx("Increase Acceleration by 3, and Top Speed by 50.", "vehicledesign"),
                         [("item:acceleration", "add", "3", None, None), ("item:top-speed", "add", "50", None, None)])
        self.assertEqual(fx("Each rating of this mod adds a point to the vehicle's Body.", "gear"), [("item:body", "add", "R", None, None)])

    def test_maxima(self):
        self.assertEqual(fx("That attribute's maximum (but not current) rank increases by 1."), [("attr-max:choice", "add", "1", None, None)])
        self.assertEqual(fx("Their physical attribute maximums are reduced by 1."),
                         [(f"attr-max:{a}", "add", "-1", None, None) for a in ("bod", "agi", "rea", "str")])

    def test_what_is_no_effect_of_the_entry(self):
        self.assertEqual(fx("Those looking for you have -2 dice on their Perception tests."), [])  # others'
        self.assertEqual(fx("Additionally, other individuals get a +2 dice pool bonus on Memory tests."), [])
        self.assertEqual(fx("For every hit, increase the noise around your physical body by one."), [])  # no attribute
        self.assertEqual(fx("Their Glow is boosted by 2."), [])  # no vocabulary target

    def test_links(self):
        ln = lambda t: [a for _, a, _ in effects.links(t)]
        self.assertEqual(ln("Both forms gain the Tough Hide quality. See p. 70, SR6."),
                         [{"rel": "grants", "name": "Tough Hide", "kind": "qualities", "book": "crb"}])
        self.assertEqual(ln("**Adept:** 1 free level of Glow Step"),
                         [{"rel": "grants", "name": "Glow Step", "kind": "adeptpowers", "level": "1", "when": "adept"}])
        self.assertEqual(ln("It achieves the same result as a Comfy Grip."), [{"rel": "as", "name": "Comfy Grip"}])


class TableTest(unittest.TestCase):
    def test_maxima_and_modifier_columns(self):
        head = ["TYPE", "BASE", "BOD", "AGI", "REA", "STR", "WIL", "LOG", "INT", "CHA"]
        self.assertEqual([(a["target"], a["op"], a["value"]) for _, a, _ in effects.table(head, ["Glowghoul", "Human", "9", "6", "8", "7", "7", "5", "7", "4"], "qualities")][:2],
                         [("attr-max:bod", "set", "9"), ("attr-max:agi", "set", "6")])
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.table(["TYPES", "AR", "DV"], ["Fizz", "+2", "–1"], "ammotypes")],
                         [("item:ar", "2,2,2,2,2"), ("item:dv", "-1")])
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.table(["JACK", "MATRIX INIT BONUS"], ["Rating 1", "+1"], "augmentations")],
                         [("derived:matrix-initiative", "1")])
        self.assertEqual(effects.table(["WEAPON", "DV", "AR"], ["Zapper", "3P", "9/7/—/—/—"], "weapons"), [])  # its own stats


class ApplyTest(unittest.TestCase):
    def test_every_entry_from_its_text_tables_and_parent(self):
        files = {"qualities.xml": '<sr6:data kind="qualities">\n  <quality id="glow-skin" source="X" page="1"><name>Glow Skin</name></quality>\n'
                                  '  <quality id="glowghoul" source="X" page="2"><name>Glowghoul</name></quality>\n</sr6:data>\n',
                 "augmentations.xml": '<sr6:data kind="augmentations">\n  <augmentation id="gene-boost-zip" source="X" page="3"><name>Gene Boost (Zip)</name></augmentation>\n</sr6:data>\n',
                 "ammotypes.xml": '<sr6:data kind="ammotypes">\n  <ammotype id="fizz" source="X" page="4" ar="+1" dv="–1"><name>Fizz</name></ammotype>\n</sr6:data>\n',
                 "rules.xml": '<sr6:data kind="rules">\n  <rule id="r" source="X" page="1"><name>R</name></rule>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="qualities" id="glow-skin">It grants +2 Defense Rating.</text>\n'
                 '  <text of="augmentations" id="gene-boost-zip">**Treatment time:** 1 month</text>\n'
                 '  <text of="rules" id="r">It grants +9 Defense Rating.</text>\n</sr6:data>\n')
        regrouped = ('<!-- section {"name": "Gene Boost"} -->\n**Zip:** This boost provides a +1 increase to Reaction.\n\n<!-- end -->\n'
                     '| TYPE | BASE | BOD | AGI | REA | STR | WIL | LOG | INT | CHA |\n|---|---|---|---|---|---|---|---|---|---|\n'
                     '| Glowghoul | Human | 9 | 6 | 8 | 7 | 7 | 5 | 7 | 4 |\n')
        out, txt = effects.apply(files, texts, regrouped)
        self.assertIn('<effect target="derived:defense" op="add" value="2"/></quality>', out["qualities.xml"])
        self.assertIn('<effect target="attr-max:bod" op="set" value="9"/>', out["qualities.xml"])
        self.assertIn('<effect target="attr:rea" op="add" value="1"/>', out["augmentations.xml"])  # its run-in paragraph
        self.assertIn("This boost provides a +1 increase to Reaction.", txt)
        self.assertIn('<effect target="item:ar" op="add" value="1,1,1,1,1"/><effect target="item:dv" op="add" value="-1"/>', out["ammotypes.xml"])
        self.assertEqual(out["rules.xml"], files["rules.xml"])  # rules hold no effects

    def test_a_shared_description_is_split_by_name(self):
        t = ("Turbo engines go fast. Increase Acceleration by 3. Economy engines save money. Decrease Acceleration by 2.")
        self.assertEqual(effects._own_part(t, "Economy Engines", ["Turbo", "Economy Engines"]), "Economy engines save money. Decrease Acceleration by 2.")
        self.assertEqual(effects._own_part(t, "Other", ["Turbo", "Economy Engines"]), t)


class DecisionsTest(unittest.TestCase):
    """The owner's decisions of 2026-10-10, second round: activities as skills, specializations, condition words,
    whom a spell affects, section-wide statements, a variant's base item, a variant's own paragraph."""

    def test_activities_specializations_and_conditions(self):
        self.assertEqual(fx("You gain a bonus Edge on all tests involving grappling, escaping bonds, or juggling."),
                         [("skill:close-combat", "edge", "1", "conditional", "grappling"), ("skill:athletics", "edge", "1", "conditional", "escaping bonds")])
        r = effects.read("Gain +2 dice on all climbing tests.")[0][1]
        self.assertEqual((r["target"], r.get("spec"), r.get("switch"), r.get("confidence")), ("skill:athletics", "Climbing", None, None))
        r = effects.read("Gain +1 die on Zapping tests while in the Matrix.")
        self.assertEqual(r, [])  # (no vocabulary target: nothing)
        r = effects.read("Gain +1 Perception while in the Matrix.")[0][1]
        self.assertEqual((r["switch"], r["when"], r.get("confidence")), ("conditional", "while in the matrix", None))
        self.assertEqual(fx("They suffer a -2 dice pool penalty to all tests involving one of the four physical attributes."),
                         [("test:physical", "add", "-2", None, None)])

    def test_spells_affect_their_target_or_caster(self):
        a = effects.read("The subject's Agility increases by 1 for each net hit.", "spells")[0][1]
        self.assertEqual((a["target"], a["value"], a["switch"], a["affects"]), ("attr:agi", "hits", "sustained", "target"))
        a = effects.read("You gain +2 Defense Rating.", "spells")[0][1]
        self.assertEqual((a["affects"], a["switch"]), ("caster", "sustained"))
        got = effects.read("Gain +1 Logic. The target gains +2 Charisma. They also gain +1 Willpower.", "spells")
        self.assertEqual([x[1]["affects"] for x in got], ["caster", "target", "target"])  # (no one named: the caster)

    def test_new_phrasings(self):
        self.assertEqual(sorted(fx("Strength and Agility are increased by 2.")), [("attr:agi", "add", "2", None, None), ("attr:str", "add", "2", None, None)])
        self.assertEqual(fx("It subtracts its rating from the threshold of Toxin Resistance tests."),
                         [("test:toxin-resistance", "threshold", "-R", None, None)])
        self.assertEqual(fx("You gain a Power Point."), [("derived:power-points", "add", "1", None, None)])
        self.assertEqual(fx("They receive the Magic attribute at 3."), [("attr:mag", "set", "3", None, None)])
        self.assertEqual(fx("The rating of the artificial skill equals the zapware rating."), [("skill:choice", "set", "R", None, None)])
        self.assertEqual(fx("Its claw gains +1 to its Damage Value and +2 to its Attack Rating.", "weapons"),
                         [("item:dv", "add", "1", None, None), ("item:ar", "add", "2", None, None)])
        self.assertEqual(fx("Reduce the Handling of the vehicle by the system's rating.", "gear"), [("item:handling", "add", "-R", None, None)])
        self.assertEqual(fx("Hearing tests to listen for your passage cannot gain or spend Edge."), [])  # (others' tests)
        self.assertEqual(fx("Edge Boosts cost 1 less in cybercombat.")[0][:3], ("skill:cracking", "edge-cost", "-1"))

    def test_section_statements_base_items_and_variant_paragraphs(self):
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n'
                 '  <augmentation id="zap-arm" source="X" page="1" type="cyberware"><name>Zap Arm</name></augmentation>\n'
                 '  <augmentation id="zap-foot" source="X" page="1" type="cyberware"><name>Zap Foot</name></augmentation>\n'
                 '  <augmentation id="gills" source="X" page="2" type="bioware"><name>Gills</name></augmentation>\n'
                 '  <augmentation id="tg-gills" source="X" page="3" type="bioware" essence="fifty percent more Essence than the base item"><name>Transgenic gills</name></augmentation>\n'
                 '  <augmentation id="glow-a" source="X" page="4" type="bioware"><name>Glowbugs (Amber)</name></augmentation>\n'
                 '  <augmentation id="glow-b" source="X" page="4" type="bioware"><name>Glowbugs (Blue)</name></augmentation>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="augmentations" id="gills">You gain +1 Athletics.</text>\n'
                 '  <text of="augmentations" id="zap-foot">This zap foot does not add a box to the Physical Condition Monitor.</text>\n'
                 '  <text of="augmentations" id="glow-a">Glowbugs live in you.\n**Amber:** You gain +1 Charisma.\n**Blue:** You gain +1 Logic.</text>\n</sr6:data>\n')
        regrouped = ('<!-- section {"name": "Zap Limbs", "section": "Zap Limbs"} -->\nEach zap limb adds one box to the character\'s Physical '
                     'Condition Monitor.\n<!-- end -->\n<!-- item {"name": "Zap Arm", "section": "Zap Limbs"} -->\n<!-- end -->\n'
                     '<!-- item {"name": "Zap Foot", "section": "Zap Limbs"} -->\n<!-- end -->\n')
        out, _ = effects.apply(files, texts, regrouped)
        x = out["augmentations.xml"]
        self.assertIn('<name>Zap Arm</name><effect target="derived:physical-monitor" op="add" value="1"/>', x)
        self.assertNotIn('<name>Zap Foot</name><effect', x)  # (its own text excepts it)
        self.assertIn('<name>Transgenic gills</name><link rel="as" kind="augmentations" name="gills" ref="gills"/>', x)
        self.assertIn('<name>Glowbugs (Amber)</name><effect target="attr:cha" op="add" value="1"/></augmentation>', x)

    def test_an_item_described_under_a_rule_named_for_it(self):
        files = {"gear.xml": '<sr6:data kind="gear">\n  <gear id="zaplink" source="X" page="1"><name>Zaplink</name></gear>\n'
                             '  <gear id="tails" source="X" page="2"><name>Zap-by-wire system (Rating 2)</name></gear>\n</sr6:data>\n',
                 "rules.xml": '<sr6:data kind="rules">\n  <rule id="r1" source="X" page="1"><name>Zaplink Upgrade</name></rule>\n'
                              '  <rule id="r2" source="X" page="2"><name>Zap-By-Wire (Rating 1-2)</name></rule>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="rules" id="r1">The Firewall is increased by the rating.</text>\n'
                 '  <text of="rules" id="r2">Each rating point adds +1 Reaction.</text>\n</sr6:data>\n')
        out, _ = effects.apply(files, texts, "")
        self.assertIn('<name>Zaplink</name><effect target="matrix:firewall" op="add" value="R"/>', out["gear.xml"])
        self.assertIn('<name>Zap-by-wire system (Rating 2)</name><effect target="attr:rea" op="add" value="R"/>', out["gear.xml"])

    def test_an_autosoft_named_for_a_skill_and_a_makers_standard_add_on(self):
        files = {"programs.xml": '<sr6:data kind="programs">\n  <program id="p1" source="X" page="1" type="autosoft"><name>Close Combat</name></program>\n</sr6:data>\n',
                 "weapons.xml": '<sr6:data kind="weapons">\n  <weapon id="w1" source="X" page="2"><name>Zapco proprietary laser sight</name></weapon>\n</sr6:data>\n'}
        out, _ = effects.apply(files, "", "")
        self.assertIn('<effect target="skill:close-combat" op="set" value="R"/>', out["programs.xml"])
        self.assertIn('<link rel="as" kind="weapons" name="Laser sight"/>', out["weapons.xml"])

    def test_tests_linked_to_an_attribute_and_two_bonuses_in_a_sentence(self):
        self.assertEqual(fx("It grants a +1 dice pool modifier to skill tests that are linked to Reaction as well as a +1 dice pool modifier to all Defense tests."),
                         [("test:attr-rea", "add", "1", None, None), ("test:defense", "add", "1", None, None)])

    def test_a_listed_labels_remainder_is_its_own(self):
        regrouped = ('<!-- section {"name": "Zaps"} -->\n**Alpha Zap:** First lines of alpha.\n**Beta Zap:** First lines of beta.\n\n'
                     'The rest of alpha: +1 Logic.\n• **Overdrive:** +1 more.\n**Beta Zap:** First lines of beta, again.\n<!-- end -->\n')
        alpha = max((p for _, p in effects._runins(regrouped)["alpha zap"]), key=len)
        self.assertIn("The rest of alpha: +1 Logic. Overdrive: +1 more.", alpha)

class RegroupTest(unittest.TestCase):
    def test_part_headings_and_page_break_continuations(self):
        md = """<!-- page 10 -->
# MAGIC
## Mentor Spirits
#### Glow Owl
The glow owl watches.
##### Advantages
**All:** Edge Boosts cost 1 less for Perception tests
##### Disadvantages
You hoot.
#### Glow Cat
The glow cat naps.
##### Advantages
**All:** a bonus
##### Disadvantages
You nap.
#### Glow Bat
The glow bat flaps.
##### Advantages
**All:** a bonus
##### Disadvantages
You flap.
# GEAR
## Gizmos
| GIZMO | COST |
|---|---|
| Zap Jack | 100 |
#### Zap Jack
A zap jack boosts your gear, and it is built into a
<!-- page 11 -->
#### Critical Gizmo Parts
| PART | COST |
|---|---|
| Core | 5 |
commlink case. A zap jack adds its rating to your Firewall.
"""
        text, _ = regroup.regroup(md)
        b = {x.name: x for x in regroup.blocks(text)}
        self.assertNotIn("Advantages", b)  # part of the mentor spirit
        self.assertIn("Edge Boosts cost 1 less for Perception tests", b["Glow Owl"].text + str(b["Glow Owl"].labels))
        self.assertIn("You hoot.", b["Glow Owl"].text)
        self.assertIn("A zap jack adds its rating to your Firewall.", b["Zap Jack"].text)
        self.assertNotIn("zap jack adds", b["Critical Gizmo Parts"].text)


if __name__ == "__main__":
    unittest.main()
