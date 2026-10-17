"""SR6 effects reader (importer/sr6/effects.py): entries that carried effects their own book text does not state (nested
variant names, an unclaimed run-in label, a one-word name matching a longer rule, an example sentence, a price cell, the
party an Edge goes to). Every sentence and name is invented, in the books' structure."""
import re
import unittest

from importer.sr6 import effects


def attrs(text, kind=None):
    return [a for t, a, _ in effects.read(text, kind) if t == "effect"]


def entries(files, texts, tag, regrouped=""):
    """{id: the entry's xml line} after apply()."""
    out = effects.apply(files, texts, regrouped)[0]
    return {m.group(1): m.group(0) for m in re.finditer(rf'<{tag} id="([^"]+)".*', out["gear.xml" if tag == "gear" else f"{tag}s.xml"])}


def augs(rows):
    return {"augmentations.xml": '<sr6:data kind="augmentations">\n' + "".join(
        f'  <augmentation id="{i}" source="X" page="1"><name>{n}</name></augmentation>\n' for i, n in rows) + "</sr6:data>\n"}


def text_of(of, i, body):
    return f'  <text of="{of}" id="{i}">{body}</text>\n'


BLOCK = ("**Treatment time:** 1 month\n"
         "**Alpha:** This alteration provides a +1 increase to Reaction. A Logic + Willpower (rating +1) test avoids the danger.\n"
         "**Beta:** This alteration provides a +1 increase to Charisma.\n"
         "**Delta:** This alteration provides a +1 increase to Strength.\n")


class NestedVariantTest(unittest.TestCase):
    def test_a_variant_ending_in_its_own_parenthesis_gets_its_labels_paragraph(self):
        # (`Genotype Enhancement (Fear Response Dampener (basic))`: both versions print under `**Fear Response Dampener:**`)
        rows = [("a-basic", "Zap Boost (Alpha (basic))"), ("a-enh", "Zap Boost (Alpha (enhanced))"), ("b", "Zap Boost (Beta)")]
        got = entries(augs(rows), '<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, BLOCK) for i, _ in rows) + "</sr6:data>\n", "augmentation")
        for i in ("a-basic", "a-enh"):
            self.assertIn('target="attr:rea"', got[i])
            self.assertNotIn('target="attr:cha"', got[i])  # (Beta's)
            self.assertNotIn('target="attr:str"', got[i])  # (Delta's)
        self.assertIn('target="attr:cha"', got["b"])
        self.assertNotIn('target="attr:rea"', got["b"])

    def test_an_unclaimed_label_is_the_paragraph_of_the_entry_without_one(self):
        # (`Genotype Enhancement (NDI)`: the book prints its paragraph under `**NDE:**`; `**Treatment time:**` is no paragraph)
        rows = [("a", "Zap Boost (Alpha)"), ("b", "Zap Boost (Beta)"), ("g", "Zap Boost (Gamma)")]
        got = entries(augs(rows), '<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, BLOCK) for i, _ in rows) + "</sr6:data>\n", "augmentation")
        self.assertIn('target="attr:str"', got["g"])  # (Delta, the one label no entry names)
        self.assertNotIn('target="attr:rea"', got["g"])
        self.assertNotIn('target="attr:cha"', got["g"])
        self.assertNotIn('target="attr:str"', got["a"])

    def test_two_unclaimed_labels_leave_the_whole_text(self):
        # (nothing says which is its own: the whole text, as before)
        rows = [("a", "Zap Boost (Alpha)"), ("g", "Zap Boost (Gamma)")]
        got = entries(augs(rows), '<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, BLOCK) for i, _ in rows) + "</sr6:data>\n", "augmentation")
        self.assertIn('target="attr:cha"', got["g"])
        self.assertIn('target="attr:str"', got["g"])

    def test_a_rating_in_a_roll_is_no_bonus(self):
        # (`a Logic + Willpower (rating +1) test`: the test to pass, never a +1 to an attribute)
        self.assertEqual(attrs("Spotting the hazard needs a Logic + Willpower (rating +1) test.", "augmentations"), [])
        self.assertEqual(attrs("Roll Logic + Willpower (threshold +1) to avoid it.", "augmentations"), [])


class LifeModuleRuleTest(unittest.TestCase):
    FILES = {"gear.xml": '<sr6:data kind="gear">\n  <gear id="vet" source="X" page="1"><name>Veteran</name></gear>\n</sr6:data>\n',
             "rules.xml": '<sr6:data kind="rules">\n  <rule id="lm" source="X" page="1"><name>Life Modules</name></rule>\n'
                          '  <rule id="rl" source="X" page="2" parent="lm"><name>Real Life</name></rule>\n'
                          '  <rule id="vs" source="X" page="3" parent="rl"><name>Veteran Soldier</name></rule>\n</sr6:data>\n'}
    TEXTS = '<sr6:data kind="texts">\n' + text_of("rules", "vs", "Hard work grants +2 Influence.") + "</sr6:data>\n"

    def test_a_life_module_rule_describes_no_item(self):
        # (the instrument `Professional` took the life module `Professional Athlete`'s text and ten effects)
        self.assertNotIn("<effect", entries(self.FILES, self.TEXTS, "gear")["vet"])

    def test_the_same_rule_printed_elsewhere_still_describes_it(self):
        files = {**self.FILES, "rules.xml": self.FILES["rules.xml"].replace(' parent="rl"', "")}
        self.assertIn('target="skill:influence"', entries(files, self.TEXTS, "gear")["vet"])


class ExampleSentenceTest(unittest.TestCase):
    def test_an_example_states_no_effect_of_its_own(self):
        # (`For example, the −1 modifier for filling 3 boxes of the condition monitor can be removed`)
        for lead in ("For example, ", "For instance, ", "e.g. ", "Such as "):
            self.assertEqual(attrs(f"{lead}a hero with 3 boxes of the physical monitor marked can ignore the penalty."), [], lead)
        self.assertEqual([(a["target"], a["value"]) for a in attrs("It adds 3 boxes to the physical condition monitor.")],
                         [("derived:physical-monitor", "3")])
        self.assertEqual([(a["target"], a["value"]) for a in attrs("For example, a mage. It adds 3 boxes to the physical monitor.")],
                         [("derived:physical-monitor", "3")])  # (the sentence after it is read)


class PriceCellTest(unittest.TestCase):
    def test_a_vehicle_mod_that_changes_a_stat_does_not_set_it_to_its_rating(self):
        # (`Reduce Cargo Space`, rating `1` for `1 per 2 CF`; `Improved Pilot` still becomes its rating)
        rows = [("red", "Reduce Cargo Space"), ("inc", "Increasing Cargo Space (CF Mod)"), ("liv", "Living Space (CF Mod)"),
                ("pil", "Improved Pilot")]
        files = {"gear.xml": '<sr6:data kind="gear">\n' + "".join(
            f'  <gear id="{i}" source="X" page="1" category="Vehicle mod" rating="1-6"><name>{n}</name></gear>\n' for i, n in rows) + "</sr6:data>\n"}
        got = entries(files, "", "gear")
        for i in ("red", "inc", "liv"):
            self.assertNotIn("<effect", got[i], i)
        self.assertIn('<effect target="item:pilot" op="set" value="R"/>', got["pil"])


class EdgeGoesToTest(unittest.TestCase):
    def test_a_pronoun_after_a_target_sentence_is_the_target(self):
        # (`Antipathy`: the target resists with Edge; `they cannot gain or spend Edge` is the target's too)
        got = attrs("The spell makes a target shy. A target gains Edge when resisting a Social test. "
                    "The shyness also means they cannot gain or spend Edge when starting a Social test.", "spells")
        self.assertEqual({a["affects"] for a in got if a["op"] in ("no-edge", "no-edge-gain")}, {"target"})
        self.assertTrue(got)

    def test_the_one_who_gains_the_edge_is_the_subject_of_the_gain(self):
        got = attrs("Near an area affected by this spell, the caster gains 1 Edge on Sorcery tests.", "spells")
        self.assertEqual([a["affects"] for a in got if a["op"] == "edge"], ["caster"])
        got = attrs("When this form is used on a willing target, you gain a point of Edge for the roll.", "complexforms")
        self.assertEqual([a["affects"] for a in got if a["op"] == "edge"], ["caster"])
        got = attrs("The subject gains 1 point of Edge on Athletics tests.", "spells")
        self.assertEqual([a["affects"] for a in got if a["op"] == "edge"], ["target"])

    def test_a_pronoun_before_the_verb_is_the_clause_before_it(self):
        # (`If the subject resists your spell, they gain 1 Edge`: `your` is in an earlier clause; `they` are the subject)
        got = attrs("If the subject resists your spell, they gain 1 Edge.", "spells")
        self.assertEqual([a["affects"] for a in got if a["op"] == "edge"], ["target"])
        got = attrs("While the device is under your control, it gains 1 Edge.", "complexforms")
        self.assertEqual([a["affects"] for a in got if a["op"] == "edge"], ["target"])


class VariantPartTest(unittest.TestCase):
    def test_a_hyphenated_variant_keeps_its_own_sentence(self):
        names = ["Plate Mod (Semi-Rigid)", "Plate Mod (Full-Body)"]
        text = "These plates protect the wearer. Semi-rigid plates add +1 to Defense Rating. Full-body plates add +2 to Defense Rating."
        got = effects._own_part(text, names[0], names)
        self.assertIn("+1", got)
        self.assertNotIn("+2", got)

    def test_two_entries_without_a_label_leave_the_whole_text(self):
        text = "Intro for all.\n**Alpha:** Alpha grants plus one Agility always.\n**Beta:** Beta grants plus one Body always.\n**Delta variant:** Delta grants plus one Strength always.\n"
        names = ["Thing (Alpha)", "Thing (Beta)", "Thing (Gamma)", "Thing (Delta)"]
        self.assertEqual(effects._variant_part(text, names[2], names), text)


class RoundTwoReaderTest(unittest.TestCase):
    def test_a_rise_in_the_spells_own_drain_is_a_cost_not_an_effect(self):
        for t in ("Each additional person increases the spell's Drain by 1.", "The ritual's Drain Value is also increased by +2 for a larger area.",
                  "Hits may be shared between two foes, at a price of +1 Drain per extra foe.", "All Healing spells incur +1 Drain Value on the caster."):
            self.assertEqual(attrs(t, "spells"), [], t)
        # (a bonus to resisting Drain, and a Minor Action paid, are read as before / not at all)
        self.assertEqual([a["target"] for a in attrs("It adds +2 dice to Drain Resistance tests.", "spells")], ["test:drain-resistance"])
        self.assertEqual(attrs("Mages must spend an additional Minor Action to veil the glow."), [])
        self.assertEqual([a["target"] for a in attrs("Gain +1 Edge on Con tests and +2 Drain.", "spells")], ["skill:con"])

    def test_who_a_sentence_is_about(self):
        # (what pursuers suffer is others'; a bonus when interacting with your target is yours; a spell's net hits on its target)
        self.assertEqual([a.get("affects") for a in attrs("Any ground vehicles in pursuit suffer +3 to their Handling.", "gear")], ["others"])
        got = attrs("On a job, you may gain +2 dice on a social test when speaking with your target.", "qualities")
        self.assertEqual([(a["target"], a.get("affects")) for a in got], [("test:social", None)])
        self.assertEqual([a.get("affects") for a in attrs("Your targets suffer -2 dice on social tests.", "qualities")], ["others"])
        got = attrs("The caster rolls a test. They split their net hits on the target, raising its Reaction and Initiative Dice, "
                    "at a rate of 1 Initiative Die per net hit.", "spells")
        self.assertEqual({a["affects"] for a in got if a["target"] == "derived:initiative-dice"}, {"target"})
        got = attrs("Roll Hacking + Resonance in an opposed test against Logic. Each net hit reduces (attribute) by 1.", "complexforms")
        self.assertEqual([(a["target"], a["affects"]) for a in got], [("matrix:choice", "target")])

    def test_a_concealability_threshold_is_the_items_not_the_tests_dice(self):
        got = attrs("A pattern on the Zap raises the concealability threshold by 1 against visual Perception tests.", "weapons")
        self.assertEqual([(a["target"], a["op"], a["value"]) for a in got], [("item:concealability", "add", "1")])
        self.assertIn("visual perception", got[0]["when"])
        self.assertEqual([a["target"] for a in attrs("It adds 2 dice for visual Perception tests.", "weapons")], ["skill:perception"])

    def test_the_two_matrix_actions_the_data_knows(self):
        self.assertEqual([(a["target"], a["op"]) for a in attrs("It gives 1 Edge on a Matrix search about a person.", "gear")],
                         [("action:matrix-search", "edge")])
        self.assertEqual([a["target"] for a in attrs("This provides +2 dice for normal Matrix Perception checks.", "gear")], ["action:matrix-perception"])
        self.assertEqual([a["target"] for a in attrs("This provides +2 dice for Matrix tests.", "gear")], ["test:matrix"])

    def test_a_table_of_modifiers_by_situation_is_the_gamemasters(self):
        t = ("It helps.\n| NATURE OF ITEM | DICE POOL MODIFIER |\n|---|---|\n| Many traces in the same place | –1 for each |\n"
             "| Traces were erased long ago | –1 |\n")
        self.assertEqual(attrs(t, "metamagics"), [])

    def test_a_cyberlimb_s_name_is_no_body_attribute(self):
        got = attrs("The lower body replacement gains +2 Strength and +2 Agility.", "augmentations")
        self.assertEqual([a["target"] for a in got], ["attr:str", "attr:agi"])
        self.assertEqual([a["target"] for a in attrs("It grants a +1 bonus to your Body.", "augmentations")], ["attr:bod"])

    def test_buying_it_twice_is_not_a_second_effect(self):
        self.assertEqual([(a["target"], a["value"]) for a in attrs("+1 DV with claws. May be bought twice, for a total of +2.", "critterpowers")],
                         [("derived:unarmed-dv", "1")])  # (claws: the natural weapon, a critter power's DV is the unarmed one)

    def test_the_sentences_about_the_other_version_are_not_this_ones(self):
        files = augs([("g", "Zap Resist (Alpha Resistance (general))"), ("s", "Zap Resist (Alpha Resistance (specific))")])
        body = ("**Alpha Resistance:** There are two versions. The general version gives 1 Edge on Toxin Resistance tests. "
                "The other version gives immunity to one specific fizz.")
        got = entries(files, '<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, body) for i in ("g", "s")) + "</sr6:data>\n", "augmentation")
        self.assertIn('target="test:toxin-resistance"', got["g"])
        self.assertNotIn("<effect", got["s"])

    def test_a_nested_name_and_a_misprinted_label_get_their_own_paragraph_as_description(self):
        # (Genotype Enhancement (Fear Response Dampener (basic)) kept the whole block's text; (NDI) too, the book printing `**NDE:**`)
        rows = [("a1", "Zap Boost (Alpha (basic))"), ("a2", "Zap Boost (Alpha (enhanced))"), ("b", "Zap Boost (Beta)"), ("g", "Zap Boost (Gamma)")]
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n' + "".join(
            f'  <augmentation id="{i}" source="X" page="1"><name>{n}</name></augmentation>\n' for i, n in rows)
            + "</sr6:data>\n",
            "rules.xml": '<sr6:data kind="rules">\n  <rule id="r" source="X" page="1"><name>Zap Boost</name></rule>\n</sr6:data>\n'}
        whole = "Alpha text grants a bonus. Beta text grants a bonus. Delta text grants a bonus."
        texts = ('<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, "**Treatment time:** 1 month") for i, _ in rows)
                 + text_of("rules", "r", whole) + "</sr6:data>\n")
        regrouped = ('<!-- section {"name": "Zap Boost"} -->\n**Alpha:** This Alpha text gives a +1 increase to the Reaction attribute.\n**Beta:** This Beta text gives a +1 increase to the Charisma attribute.\n'
                     '**Delta:** This Delta text gives a +1 increase to the Strength attribute.\n\n')
        out, txt = effects.apply(files, texts, regrouped)
        body = {m.group(1): m.group(2) for m in re.finditer(r'<text of="augmentations" id="([^"]+)">(.*?)</text>', txt, re.S)}
        for i in ("a1", "a2"):
            self.assertIn("Alpha text", body[i])
            self.assertNotIn("Beta text", body[i])
            self.assertNotIn("Delta text", body[i])
        self.assertIn("Beta text", body["b"])
        self.assertIn("Delta text", body["g"])
        self.assertNotIn("Alpha text", body["g"])


class RoundThreeTest(unittest.TestCase):
    def test_a_drain_rise_takes_only_its_amount_not_the_rest_of_the_clause(self):
        self.assertEqual([a["target"] for a in attrs("The Drain is increased by 1 and the subject gains +2 Reaction.", "spells")], ["attr:rea"])
        self.assertEqual([a["target"] for a in attrs("Drain Value is increased by 2 and the target suffers a -2 penalty to Agility.", "spells")], ["attr:agi"])
        self.assertEqual([a["target"] for a in attrs("Your Drain is increased by 1 but you gain +1 Magic.", "qualities")], ["attr:mag"])

    def test_a_drain_resistance_bonus_is_not_a_drain_cost(self):
        for t in ("The dice pool to resist Drain increases by 2.", "Your dice pool to resist Drain is increased by 2.",
                  "The wearer's pool for resisting Drain is raised by 1.", "Grants +2 Drain-resistance dice.", "Increases the Drain-Resistance pool by 2."):
            self.assertEqual([a["target"] for a in attrs(t, "qualities")], ["test:drain-resistance"], t)
        for t in ("Each extra target increases its Drain by 1.", "Each extra target increases your Drain by 1."):
            self.assertEqual(attrs(t, "spells"), [], t)

    def test_a_dice_pool_modifier_table_is_dropped_only_when_it_lists_situations(self):
        self.assertEqual([a["target"] for a in attrs("| MODE | EFFECT |\n|---|---|\n| Smart | +2 dice pool modifier to Firearms tests |\n", "gear")], ["skill:firearms"])
        self.assertEqual([a["target"] for a in attrs("| MODE | DICE POOL MODIFIER |\n|---|---|\n| Smart | +2 dice to Perception tests |\n", "gear")], ["skill:perception"])
        self.assertEqual(attrs("| TIME SINCE | DICE POOL MODIFIER |\n|---|---|\n| 1 week | +2 dice to Perception tests |\n", "gear"), [])  # (a situation column)

    def test_the_per_purchase_effect_is_kept_when_only_that_sentence_states_it(self):
        got = attrs("It can be purchased up to three times, each adding +1 Agility, to a total of +3.", "qualities")
        self.assertEqual([(a["target"], a["value"]) for a in got], [("attr:agi", "1")])

    def test_a_label_of_an_unrelated_block_is_not_taken_through_an_alias(self):
        rows = [("a", "Zap Boost (Alpha)"), ("g", "Zap Boost (Gamma)")]
        files = {"augmentations.xml": '<sr6:data kind="augmentations">\n' + "".join(
            f'  <augmentation id="{i}" source="X" page="1"><name>{n}</name>{"<alias>Sling Grip</alias>" if i == "g" else ""}</augmentation>\n' for i, n in rows)
            + "</sr6:data>\n"}
        texts = '<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, "**Treatment time:** 1 month") for i, _ in rows) + "</sr6:data>\n"
        regrouped = '<!-- section {"name": "Rope Rig"} -->\n**Sling Grip:** This grip gives +2 dice to Athletics tests when hanging.\n\n'
        self.assertNotIn("skill:athletics", entries(files, texts, "augmentation", regrouped)["g"])

    def test_the_opposed_test_rule_leaves_an_inherited_caster_alone(self):
        got = attrs("Use an opposed test. The magician gets -2 dice; it reduces Agility by 2.", "spells")
        self.assertEqual({a["affects"] for a in got}, {"caster"})
        got = attrs("Opposed test. Sustaining this spell lowers Initiative by 2.", "spells")
        self.assertEqual({a["affects"] for a in got}, {"caster"})

    def test_a_pursuit_is_the_others_only_when_it_is_the_pursuers(self):
        self.assertEqual([a.get("affects") for a in attrs("Your vehicle in pursuit gains +1 Handling.", "gear")], [None])
        self.assertEqual([a.get("affects") for a in attrs("A drone in pursuit of a target gets +2 dice on Piloting tests.", "gear")], [None])

    def test_in_general_is_not_the_general_version(self):
        files = augs([("g", "Zap Resist (Alpha Resistance (general))"), ("s", "Zap Resist (Alpha Resistance (specific))")])
        body = "**Alpha Resistance:** In general, the treatment gives +1 Body. The general version gives 1 Edge on Toxin Resistance tests."
        got = entries(files, '<sr6:data kind="texts">\n' + "".join(text_of("augmentations", i, body) for i in ("g", "s")) + "</sr6:data>\n", "augmentation")
        self.assertIn('target="attr:bod"', got["s"])
        self.assertNotIn('target="test:toxin-resistance"', got["s"])
        self.assertIn('target="test:toxin-resistance"', got["g"])

    def test_edge_to_anyone_is_the_others_and_a_critters_own_oppose_dice_are_its(self):
        self.assertEqual([a.get("affects") for a in attrs("The record gives an extra point of Edge to anyone conducting a Matrix search for you.", "qualities")], ["others"])
        self.assertEqual([a.get("affects") for a in attrs("Bearers get +3 dice to resist any Hacking tests to find them.", "critterpowers")], [None])


if __name__ == "__main__":
    unittest.main()
