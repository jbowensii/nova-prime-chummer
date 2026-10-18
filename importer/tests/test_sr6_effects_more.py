"""More of the SR6 effects reader (importer/sr6/effects.py): the phrasings and branches test_sr6_effects.py leaves out.
Every sentence is invented; the expected values are what the reader's rules give for them."""
import unittest

from importer.sr6 import effects


def fx(text, kind=None):
    """[(target, op, value, switch, when)] of the effects read from `text`."""
    return [(a["target"], a["op"], a["value"], a.get("switch"), a.get("when")) for t, a, _ in effects.read(text, kind) if t == "effect"]


def attrs(text, kind=None):
    """The effects' whole attribute dicts."""
    return [a for t, a, _ in effects.read(text, kind) if t == "effect"]


class TargetsTest(unittest.TestCase):
    def test_tests_that_involve_attributes(self):
        self.assertEqual(effects.targets("tests that involve strength or agility"), [("test:attr-str", None), ("test:attr-agi", None)])
        self.assertEqual(effects.targets("tests which involve body, or willpower"), [("test:attr-bod", None), ("test:attr-wil", None)])

    def test_choices_and_named_actions(self):
        self.assertEqual(effects.targets("an attribute of your choice"), [("attr:choice", None)])
        self.assertEqual(effects.targets("knowledge skill tests"), [("skill:knowledge", None)])
        self.assertEqual(effects.targets("a Snoop action"), [("action:snoop", None)])
        self.assertEqual(effects.targets("using the Brute Force action"), [("action:brute-force", None)])
        self.assertEqual(effects.targets("lift/carry"), [("derived:lift", None)])

    def test_words_that_are_not_a_target(self):
        self.assertEqual(effects.targets("an allergic reaction"), [])  # (the word, not the attribute)
        self.assertEqual(effects.targets("Condition tests"), [])
        self.assertNotIn(("action:free", None), effects.targets("the free edge action"))
        self.assertEqual(effects.targets("using a free action"), [])  # (`free`: a cost word, not an action's name)


class LabelsAndSwitchesTest(unittest.TestCase):
    def test_a_label_names_the_target_of_a_bare_number(self):
        self.assertEqual(fx("**AR:** +2"), [("item:ar", "add", "2", None, None)])
        self.assertEqual(fx("**Body:** +1", "armor"), [("attr:bod", "add", "1", None, None)])

    def test_overdrive_and_once_activated(self):
        self.assertEqual(fx("**Overdrive:** +1 Agility"), [("attr:agi", "add", "1", "activated", "overdrive")])
        # (a sentence after `Once activated` is the activated thing's too)
        self.assertEqual(fx("Once activated, you gain +1 Agility. You also gain +1 Reaction."),
                         [("attr:agi", "add", "1", "activated", None), ("attr:rea", "add", "1", "activated", None)])

    def test_the_entry_itself_is_not_a_condition(self):
        self.assertEqual(fx("When this way is taken, you gain +1 Agility."), [("attr:agi", "add", "1", None, None)])

    def test_a_per_point_formula_is_shown_low(self):
        got = attrs("Gain +1 Agility for each point of Essence lost.")
        self.assertEqual(got, [{"target": "attr:agi", "op": "add", "value": "1", "confidence": "low", "switch": "conditional",
                                "when": "per point of essence lost"}])

    def test_the_tests_named_are_no_condition_but_a_condition_after_them_is(self):
        # (`When making Stealth tests while sneaking`: the tests it names are not the condition; `while sneaking` is)
        self.assertEqual(attrs("When making Stealth tests while sneaking, subtract its rating from the threshold."),
                         [{"target": "skill:stealth", "op": "threshold", "value": "-R", "switch": "conditional", "when": "while sneaking"}])
        self.assertEqual(attrs("When making Stealth tests, subtract its rating from the threshold."),
                         [{"target": "skill:stealth", "op": "threshold", "value": "-R"}])

    def test_the_same_effect_on_several_specializations_is_one(self):
        got = attrs("Gain +2 to climbing tests. Gain +2 to swimming tests.")
        self.assertEqual([(a["target"], a["value"], a["spec"]) for a in got], [("skill:athletics", "2", "Climbing, Swimming")])


class EdgeTest(unittest.TestCase):
    def test_edge_on_an_attributes_tests(self):
        self.assertEqual(fx("You gain 1 Edge on Logic."), [("test:attr-log", "edge", "1", None, None)])
        # (the word Edge is not the Edge attribute's tests: `a bonus Edge when making any Logic-based test`, reviewed 2026-10-18)
        self.assertEqual(fx("+1 to Edge, plus you gain a point of Edge."), [])
        self.assertEqual(fx("They gain a bonus Edge when making any Logic-based test."), [("test:attr-log", "edge", "1", None, None)])

    def test_edge_nobody_can_gain_or_spend(self):
        self.assertEqual(fx("You cannot gain Edge on Stealth tests."), [("skill:stealth", "no-edge-gain", "1", None, None)])
        self.assertEqual(fx("When your chase pool begins, you cannot gain edge on Stealth tests."),
                         [("skill:stealth", "no-edge-gain", "1", "conditional", "when your chase pool begins")])
        self.assertEqual(fx("You can never gain a bonus Edge on Stealth tests."), [])  # (a bonus Edge denied is no bonus)
        self.assertEqual(fx("You gain Edge on that test."), [])  # (`that test`: a pronoun, not an activity)

    def test_edge_that_has_no_test_to_be_on(self):
        self.assertEqual(fx("You gain a point of Edge."), [])
        self.assertEqual(fx("You gain a point of Edge on attack rating.", "weapons"), [])  # (an item's stat is not a test)

    def test_edge_costs(self):
        stealth = [("skill:stealth", "edge-cost", "-1", None, None)]
        self.assertEqual(fx("The cost of Edge boosts for Stealth tests is reduced by 1."), stealth)
        self.assertEqual(fx("Reduce the cost of Edge boosts for Stealth tests by 1."), stealth)
        self.assertEqual(fx("Edge costs are reduced by 1 for Stealth tests."), stealth)
        self.assertEqual(fx("Edge costs are increased by 2 on Stealth tests."), [("skill:stealth", "edge-cost", "2", None, None)])
        self.assertEqual(fx("You may spend two extra points of Edge on Edge boosts for Stealth tests."), [("skill:stealth", "edge-cost", "2", None, None)])
        got = attrs("Reduce the cost of Edge actions by 1 on tests like Stealth (Palming).")
        self.assertEqual([(a["target"], a["value"], a["spec"]) for a in got], [("skill:stealth", "-1", "Palming")])

    def test_an_edge_actions_printed_price(self):
        self.assertEqual(fx("Quick Slip (2 Edge) lets you duck. The edge cost is shown."), [("action:quick-slip", "edge-cost-set", "2", None, None)])

    def test_extra_hits(self):
        self.assertEqual(fx("You get 2 additional hits on Stealth tests."), [("skill:stealth", "hits", "2", None, None)])

    def test_a_chase_pools_edge_each_round(self):
        self.assertEqual(fx("In a chase, gain a point of Edge at the start of every round."),
                         [("pool:chase", "add", "1", None, "at the start of every round")])

    def test_a_maximum_is_not_a_cost(self):
        self.assertEqual(fx("Increase your maximum Strength by 1 and reduce the cost of Edge boosts by 1."), [("attr-max:str", "add", "1", None, None)])


class MaximaTest(unittest.TestCase):
    def test_a_maximum_raised_or_lowered(self):
        self.assertEqual(fx("Your maximum Body is decreased by 1."), [("attr-max:bod", "add", "-1", None, None)])
        self.assertEqual(fx("Increase your maximum Strength by 2."), [("attr-max:str", "add", "2", None, None)])
        self.assertEqual(fx("Increase your maximum Defense Rating by 1."), [])  # (not an attribute's maximum)


class ValuesTest(unittest.TestCase):
    def test_a_penalty_per_level(self):
        self.assertEqual(fx("Gain -1 Agility per level of this power."), [("attr:agi", "add", "-R", None, None)])

    def test_rated_leaves_an_odd_value_alone(self):
        self.assertEqual(effects._rated("Add 1 per level", "mag"), "mag")
        self.assertEqual(effects._rated("Add 1 per level", "2/3"), "2/3")
        self.assertEqual(effects._rated("Add 2 per level", "2"), "R*2")
        self.assertEqual(effects._rated("Add 1 for every two levels", "2"), "2")  # (only a 1 is a per-two-levels rate)

    def test_boxes_actions_and_movement(self):
        self.assertEqual(fx("+2 physical condition monitor boxes"), [("derived:physical-monitor", "add", "2", None, None)])
        self.assertEqual(fx("You gain +1 Minor Action."), [("derived:minor-actions", "add", "1", None, None)])
        self.assertEqual(fx("It requires 2 additional Minor Actions to prepare."), [])  # (a cost)
        self.assertEqual(fx("You gain 2 extra boxes of damage overflow."), [("derived:overflow", "add", "2", None, None)])
        self.assertEqual(fx("It gives two extra boxes of overflow."), [("derived:overflow", "add", "2", None, None)])
        self.assertEqual(fx("Increases flying speed by 2/1/1."), [("derived:movement", "add", "2/1/1", None, "flying")])
        self.assertEqual(fx("Increases walking and running by +1/+0/+0."), [("derived:movement", "add", "1/0/0", None, None)])
        self.assertEqual(fx("It gives a number of boxes on your physical condition monitor equal to the rating."),
                         [("derived:physical-monitor", "add", "R", None, None)])

    def test_matrix_attribute_cumulative_with_other_devices(self):
        self.assertEqual(fx("Its firewall attribute is cumulative with other devices, firewall 2."), [("matrix:firewall", "add", "2", None, None)])
        # (a stat stated in the sentence before is the one it refers back to; another attribute is not)
        self.assertEqual(fx("Firewall 2. Its Data Processing attribute is cumulative with other devices."), [])

    def test_ammo_belts_senses_and_prices(self):
        self.assertEqual(fx("The gun holds a 100-round belt."), [])  # (only an item's)
        self.assertEqual(fx("The gun holds a 100-round belt.", "weapons"), [("item:ammo", "set", "100", None, None)])
        self.assertEqual(fx("It does not have low-light vision."), [])
        self.assertEqual(fx("It increases the cost of armor by several percent."), [])  # (no number to read)
        self.assertEqual(fx("The price is increased by 20 percent."), [])  # (read as a percent, not as a bonus)

    def test_levels_of_armor_are_not_a_vehicles(self):
        self.assertEqual(fx("It grants 2 levels of armor."), [("derived:defense", "add", "2", None, None)])
        self.assertEqual(fx("It grants 2 levels of armor.", "vehicles"), [])

    def test_only_an_items_or_characters_stat_is_lowered_or_scaled(self):
        self.assertEqual(fx("It decreases your Athletics by its rating."), [])  # (a skill is neither)
        self.assertEqual(fx("It subtracts its rating from the Athletics."), [])
        self.assertEqual(fx("It adds 20 percent to the Agility."), [])  # (a percent is an item stat's)

    def test_either_of_one_attribute_is_no_choice(self):
        self.assertEqual(fx("It may add to either Agility or luck."), [])

    def test_attribute_at_a_rating_names_attributes_and_skills_only(self):
        self.assertEqual(fx("The zap attribute at 3."), [])
        self.assertEqual(fx("The firewall attribute at 3."), [])  # (a Matrix attribute is not set this way)

    def test_a_bonus_in_the_other_order_or_with_the_target_first(self):
        self.assertEqual(fx("Agility +1"), [("attr:agi", "add", "1", None, None)])
        self.assertEqual(fx("Defense Rating +2"), [("derived:defense", "add", "2", None, None)])
        self.assertEqual(fx("Near (Magic + 2)"), [])  # (a formula, not a bonus)

    def test_damage_suffered_and_incoming_attacks(self):
        self.assertEqual(fx("Roll Body to resist 7P damage, with +1 DV per level", "weapons"), [])  # (damage suffered, no item's DV)
        self.assertEqual(fx("-1 to DV on every incoming attack", "armor"), [("derived:damage-reduction", "add", "1", None, None)])


class AttackRatingTest(unittest.TestCase):
    def test_a_modifier_per_range_band(self):
        self.assertEqual(fx("Attack Rating +2/-/-1/-2/-3"), [("item:ar", "add", "2,0,-1,-2,-3", None, None)])
        self.assertEqual(fx("Attack Rating -/-/+1/-/-"), [("item:ar", "add", "0,0,1,0,0", None, None)])

    def test_bands_without_a_sign_are_not_a_modifier(self):
        self.assertEqual(fx("Attack Rating 5/4/3/2/1"), [])  # (the weapon's own, not a change to it)

    def test_the_longest_band_removed(self):
        self.assertEqual(fx("Attack rating: +2/-/-1/-2/-3 removes the longest-range attack rating", "weapons"),
                         [("item:ar", "add", "2,0,-1,-2,x", None, None)])
        self.assertEqual(fx("It removes the longest range attack rating.", "weapons"), [("item:ar", "add", "0,0,0,0,x", None, None)])

    def test_bands_named_in_a_sentence(self):
        # (the bands only, not also a plain `increase … by 2` on every band)
        self.assertEqual(fx("Increase the close and near attack ratings by 2.", "weapons"), [("item:ar", "add", "2,2,0,0,0", None, None)])
        self.assertEqual(fx("Reduce the far attack rating by 1.", "weapons"), [("item:ar", "add", "0,0,0,-1,0", None, None)])
        self.assertEqual(fx("Its attack rating is increased by 2.", "weapons"), [("item:ar", "add", "2", None, None)])
        self.assertEqual(fx("Attack rating increases to 5.", "weapons"), [("item:ar", "add", "5", None, None)])


class BonusPhrasingsTest(unittest.TestCase):
    def test_two_attributes_one_up_one_down(self):
        self.assertEqual(fx("This power increases your Strength by 1 and decreases your Intuition by 1."),
                         [("attr:str", "add", "1", None, None), ("attr:int", "add", "-1", None, None)])
        self.assertEqual(fx("Reduces your Agility by 2."), [("attr:agi", "add", "-2", None, None)])

    def test_rating_added_to_an_attribute(self):
        for text in ("Adds the rating of the zapper to your Agility.", "Its rating is added to your Agility.",
                     "Your Agility gets a boost equal to the rating.", "Each rating point increases Agility.",
                     "Gives the user an Agility attribute equal to its rating."):
            self.assertEqual(fx(text), [("attr:agi", "add", "R", None, None)], text)

    def test_rating_as_dice(self):
        for text in ("Gain a dice pool bonus to Athletics tests equal to its rating", "A dice pool bonus for Athletics tests equal to its rating.",
                     "A bonus equal to its rating on Athletics tests."):
            self.assertEqual(fx(text), [("skill:athletics", "add", "R", None, None)], text)
        self.assertEqual(fx("Gives a Defense Rating bonus equal to its rating."), [("derived:defense", "add", "R", None, None)])
        got = attrs("You gain its rating as extra Agility when making climbing tests.")
        self.assertEqual([(a["target"], a["value"], a["spec"]) for a in got], [("skill:athletics", "R", "Climbing")])
        got = attrs("Gain a number of dice equal to the rating for climbing tests.")
        self.assertEqual([(a["target"], a["value"], a["spec"]) for a in got], [("skill:athletics", "R", "Climbing")])

    def test_dice_counted_in_words(self):
        self.assertEqual(fx("Grants two social dice."), [("test:social", "add", "2", None, None)])
        self.assertEqual(fx("Adds one die to Athletics tests."), [("skill:athletics", "add", "1", None, None)])
        self.assertEqual(fx("You gain 3 dice on Athletics tests."), [("skill:athletics", "add", "3", None, None)])
        self.assertEqual(fx("It counts as 2 points higher for Athletics tests."), [("skill:athletics", "add", "2", None, None)])

    def test_skills_lifestyle_and_hits(self):
        self.assertEqual(fx("Adds 2 to the rating of one skill."), [("skill:choice", "add", "2", None, None)])
        self.assertEqual(fx("+1 LP modifier to necessities"), [("lifestyle:necessities", "add", "1", None, None)])
        self.assertEqual(fx("Each net hit increases the noise rating by 2.", "spells"), [])  # (a noise rating: no target of ours)


class IncompatibleAndLinksTest(unittest.TestCase):
    def test_a_denial_is_not_an_incompatibility(self):
        self.assertEqual(effects.incompatibilities("It is never incompatible with Glow Eye.", "Zap"), [])

    def test_one_at_a_time_needs_a_name(self):
        self.assertEqual(effects.incompatibilities("You can only have one installed at a time.", ""), [])

    def test_said_twice_is_listed_once(self):
        got = effects.incompatibilities("Incompatible with Glow Eye. Incompatible with Glow Eye.", "Zap")
        self.assertEqual(got, [("incompatible", {"names": "Glow Eye"}, None)])

    def test_links(self):
        self.assertEqual(effects.links("The user gains the Edge quality."), [])  # (Edge: an attribute, not an entry)
        self.assertEqual(effects.links("The user gains the Zap Sense quality. The user gains the Zap Sense quality."),
                         [("link", {"rel": "grants", "name": "Zap Sense", "kind": "qualities"}, None)])
        self.assertEqual(effects.links("You gain the Zap Sense quality (p. 12, SR6)."),
                         [("link", {"rel": "grants", "name": "Zap Sense", "kind": "qualities", "book": "crb"}, None)])


class TablesTest(unittest.TestCase):
    def test_a_range_band_cell(self):
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in effects.table(["NAME", "AR"], ["Zap", "+2/-/-1/-2/-3"], "weapons")],
                         [("item:ar", "2,0,-1,-2,-3")])

    def test_an_attribute_table_skips_a_blank_or_unnumbered_cell(self):
        header = ["BOD", "AGI", "REA", "STR", "WIL", "LOG", "INT", "CHA", "EDG"]
        got = effects.table(header, ["7", "8", "", "6", "x", "5", "6", "7", "3"], "qualities")
        self.assertEqual([(a["target"], a["op"], a["value"]) for _, a, _ in got],
                         [("attr-max:bod", "set", "7"), ("attr-max:agi", "set", "8"), ("attr-max:str", "set", "6"), ("attr-max:log", "set", "5"),
                          ("attr-max:int", "set", "6"), ("attr-max:cha", "set", "7"), ("attr-max:edg", "set", "3")])

    def test_a_rating_table_that_is_not_one(self):
        for header, rows in ((["RATING"], [["1"]]), (["TYPE", "DV"], [["a", "+1"]]), (["RATING", "DV"], []),
                             (["RATING", "DV"], [["x", "+1"]]), (["RATING", "DV"], [["1", "+1"], ["3", "+2"]])):
            self.assertEqual(effects.rating_table(header, rows, "augmentations"), [], (header, rows))

    def test_a_rating_table_reads_the_stat_columns_it_can(self):
        got = effects.rating_table(["RATING", "DV", "COLOR"], [["1", "+1", "red"], ["2", "+2", "blue"]], "gear")
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in got], [("item:dv", "R[1,2]")])
        got = effects.rating_table(["RATING", "DV", "AR"], [["1", "+1", "?"], ["2", "+1", "+1"]], "augmentations")
        self.assertEqual([(a["target"], a["value"]) for _, a, _ in got], [("derived:unarmed-dv", "R[1,1]")])  # (a column with a cell it can't read is left)


class ActivityTest(unittest.TestCase):
    def test_a_phrase_repeated_is_named_once(self):
        self.assertEqual(effects._activity("tests involving climbing, climbing"), [("skill:athletics", "climbing", "climbing")])


class VariantAndSectionTest(unittest.TestCase):
    def test_variant_sentences(self):
        text = "Zaps fly. Zaps are hot."
        self.assertEqual(effects._variant_sentences(text, ["Firewall"], ["Sleaze"]), text)  # (no sentence names a variant)
        self.assertEqual(effects._variant_sentences("A Firewall zap does X. A Sleaze zap does Y. All zaps glow.", ["Firewall"], ["Sleaze"]),
                         "A Firewall zap does X. All zaps glow.")

    def test_resolving_a_variants_choice(self):
        found = [("effect", {"target": t, "op": "add", "value": "1"}, None)
                 for t in ("skill:athletics", "attr:choice", "skill:choice", "attr-max:agi", "derived:defense")]
        got = lambda words: [a["target"] for _, a, _ in effects._resolve_variant(found, words)]
        self.assertEqual(got(["Agility"]), ["skill:athletics", "attr:agi", "skill:choice", "attr-max:agi", "derived:defense"])
        # (a variant named for a family keeps that family's effects, and what is not in a family)
        self.assertEqual(got(["Skill"]), ["skill:athletics", "skill:choice", "derived:defense"])
        self.assertEqual(got(["Attribute"]), ["attr:choice", "attr-max:agi", "derived:defense"])

    def test_a_section_rule_the_item_excepts(self):
        intro = "Each zap arm adds one box to the Physical Condition Monitor."
        self.assertEqual([a["target"] for _, a, _ in effects.section_effects(intro, "", "Zap Arm", "augmentations", "Zap Arms")],
                         ["derived:physical-monitor"])
        self.assertEqual(effects.section_effects(intro, "This arm does not add a physical box.", "Zap Arm", "augmentations", "Zap Arms"), [])

    def test_a_section_sentence_that_is_a_test_is_no_effect(self):
        self.assertEqual(effects.section_effects("Each zap arm lets you make an Electronics + Logic (3) test.", "", "Zap Arm", "augmentations", "Zap Arms"), [])


class ApplyMoreTest(unittest.TestCase):
    def test_a_transgenic_priced_from_the_base_its_formula_cites(self):
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n'
                 '  <augmentation id="zh" source="X" page="1" type="bioware"><name>Zap hand webbing</name></augmentation>\n'
                 '  <augmentation id="tzh" source="X" page="2" type="bioware" essence="fifty percent more Essence than the base item">'
                 '<name>Transgenic zap hands and feet</name><cost><formula>ref(augmentations:zh)</formula></cost></augmentation>\n</sr6:data>\n'}
        out, _ = effects.apply(files, "", "")
        x = out["augmentations.xml"]
        self.assertIn('<alias>Transgenic zap hand webbing</alias>', x)  # (the book's own words for the version)
        self.assertIn('<link rel="as" kind="augmentations" name="zap hands and feet" ref="zh"/>', x)

    def test_a_grant_cited_to_the_core_book_refers_to_it(self):
        files = {"qualities.xml": '<sr6:data kind="qualities">\n  <quality id="q1" source="X" page="4"><name>Zap Fan</name></quality>\n</sr6:data>\n'}
        texts = '<sr6:data kind="texts">\n  <text of="qualities" id="q1">You gain the Zap Sense quality (p. 12, SR6).</text>\n</sr6:data>\n'
        out, _ = effects.apply(files, texts, "")
        self.assertIn('<name>Zap Fan</name><link rel="grants" name="Zap Sense" kind="qualities" ref="crb.zap-sense"/>', out["qualities.xml"])

    def test_a_version_named_picks_its_own_group_member(self):
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n'
                 '  <augmentation id="zz-basic" source="X" page="1" type="bioware" group="Zapsense"><name>Basic</name></augmentation>\n'
                 '  <augmentation id="zz-tactical" source="X" page="1" type="bioware" group="Zapsense"><name>Tactical</name></augmentation>\n'
                 '  <augmentation id="tg" source="X" page="2" type="bioware" essence="fifty percent more Essence than the base item">'
                 '<name>Transgenic zapsense (Basic)</name></augmentation>\n</sr6:data>\n'}
        out, _ = effects.apply(files, "", "")
        x = out["augmentations.xml"]
        self.assertIn('name="Zapsense: Basic" ref="zz-basic"/>', x)
        self.assertNotIn("Zapsense: Tactical", x)

    def test_functions_like_a_sibling_only_when_one_is_named(self):
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n'
                 '  <augmentation id="zt-a" source="X" page="3"><name>Zap Tail (Alpha)</name></augmentation>\n'
                 '  <augmentation id="zt-b" source="X" page="3"><name>Zap Tail (Beta)</name></augmentation>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="augmentations" id="zt-a">This functions like the beta tail.</text>\n'
                 '  <text of="augmentations" id="zt-b">This functions like the delta tail.</text>\n</sr6:data>\n')
        out, _ = effects.apply(files, texts, "")
        x = out["augmentations.xml"]
        self.assertIn('<name>Zap Tail (Alpha)</name><link rel="as" kind="augmentations" name="Zap Tail (Beta)" ref="zt-b"/>', x)
        self.assertIn('<name>Zap Tail (Beta)</name></augmentation>', x)  # (no sibling named delta: nothing linked)

    def test_a_variant_row_given_its_rule_keeps_the_variants_words(self):
        # (the parent prints only a label line; the rule named for the base item is the description of both)
        files = {"gear.xml": '<sr6:data kind="gear">\n  <gear id="zb" source="X" page="1"><name>Zap Booster</name></gear>\n'
                             '  <gear id="zb-f" source="X" page="2" rating="1"><name>Zap Booster (Firewall)</name></gear>\n</sr6:data>\n',
                 "rules.xml": '<sr6:data kind="rules">\n  <rule id="r1" source="X" page="1"><name>Zap Booster</name></rule>\n</sr6:data>\n'}
        texts = ('<sr6:data kind="texts">\n  <text of="gear" id="zb">**Cost:** 5</text>\n'
                 '  <text of="rules" id="r1">The Firewall is increased by the rating.</text>\n</sr6:data>\n')
        out, txt = effects.apply(files, texts, "")
        self.assertIn('<name>Zap Booster (Firewall)</name><effect target="matrix:firewall" op="add" value="R"/>', out["gear.xml"])
        self.assertIn('<text of="gear" id="zb-f">**Cost:** 5\nThe Firewall is increased by the rating.</text>', txt)  # (kept as the row's text)

    def test_a_table_row_with_no_name_is_skipped(self):
        files = {"ammotypes.xml": '<sr6:data kind="ammotypes">\n  <ammotype id="zap" source="X" page="5"><name>Zap Slug</name></ammotype>\n</sr6:data>\n'}
        regrouped = "| NAME | AR |\n|---|---|\n|  | +1 |\n| Zap Slug | +2 |\n"
        out, _ = effects.apply(files, "", regrouped)
        self.assertIn('<name>Zap Slug</name><effect target="item:ar" op="add" value="2,2,2,2,2"/>', out["ammotypes.xml"])


if __name__ == "__main__":
    unittest.main()
