"""SR6 effects reader, the final review of the 866-finding round (2026-10-18): Edge clauses with different owners, conditions that stay conditional, a book row
that replaces the reader's effect, a drug's story. Every sentence and name is invented, in the books' structure."""
import time
import unittest

from importer.sr6 import effects, overrides


def fx(text, kind="qualities", name=None, cls=""):
    return [(a["target"], a["op"], a["value"], a.get("switch"), a.get("when"), a.get("spec"), a.get("affects"), a.get("confidence")) for t, a, _ in effects.read(text, kind, name, cls) if t == "effect"]


class EdgeOwnerTest(unittest.TestCase):
    """HIGH 2: who the Edge is for is decided by the clause that holds its verb."""

    def test_the_opposition_and_the_owner_in_one_sentence(self):
        got = fx("Opponents gain a point of Edge against you, but you gain a point of Edge on Defense tests.")
        self.assertIn(("test:other", "edge", "1", "conditional", "against you", None, "others", None), got)
        self.assertIn(("test:defense", "edge", "1", None, None, None, None, None), got)  # (the owner's, not marked others)

    def test_an_imperative_edge_is_the_owners(self):
        got = fx("Gain a point of Edge when the magician defends against an attack.")
        self.assertEqual({g[6] for g in got}, {None})

    def test_an_opposition_edge_alone_is_others(self):
        self.assertEqual(fx("The opposing individual gains a point of Edge on tests against you.")[0][6], "others")

    def test_clauses_that_offer_an_edge_each_have_their_condition(self):
        got = fx("Wearing the lens in dim light grants a bonus Edge if foes can't see, grants a bonus Edge against targets who are hidden, and provides "
                 "the ability to relax by spending an extra Minor Action for movement.", "gear")
        self.assertEqual([g[0] for g in got], ["test:other", "test:other"])  # (two Edge effects, and the Minor Action it costs is no bonus)
        self.assertEqual(got[1][4], "vs. targets who are hidden")


class ConditionKeptTest(unittest.TestCase):
    """HIGH 3: a condition the reader cannot state keeps the effect conditional, never always on."""

    def test_a_whole_condition_ending_on_a_preposition_is_kept(self):
        got = fx("You gain +2 dice on Con tests only when you are tuned for.")
        self.assertEqual(got[0][3:5], ("conditional", "only when you are tuned for"))

    def test_a_cut_off_stub_is_conditional_with_no_words(self):
        got = fx("You gain +2 dice on Con tests if the.")
        self.assertEqual((got[0][3], got[0][4], got[0][7]), ("conditional", None, "low"))

    def test_used_to_is_a_condition(self):
        self.assertEqual(fx("Gain +2 dice on Perception tests used to discover the quality or authenticity of an item.")[0][3], "conditional")


class BareTestTest(unittest.TestCase):
    """MEDIUM 4 and 5: a bare test keeps its condition; each bonus of a sentence has its own."""

    def test_a_penalty_for_working_without_a_kit_is_conditional(self):
        got = fx("Any test made without a kit suffers a -2 dice pool modifier, and no Edge can be spent on the test.", "gear")
        self.assertEqual(got[0][:5], ("test:all", "add", "-2", "conditional", "without a kit"))

    def test_once_per_session_is_a_condition(self):
        got = fx("Once per game session you may add two dice to the pool for any test.")
        self.assertEqual(got[0][3], "conditional")
        self.assertTrue(got[0][4].startswith("once per game session"))

    def test_two_bonuses_two_conditions(self):
        got = fx("+2 dice for Firearms tests and +1 die on tests to spot snipers.")
        self.assertEqual((got[0][0], got[0][3]), ("skill:firearms", None))
        self.assertEqual((got[1][3], got[1][4]), ("conditional", "tests to spot snipers"))


class DrugStoryTest(unittest.TestCase):
    """LOW 9: the story run into an Effect line ends it, whatever its name's shape."""

    def test_a_possessive_names_story_is_cut_and_a_spell_type_is_no_story(self):
        text = ("drugs & toxins\n• **Vector:** Ingestion\n• **Speed:** 2 combat rounds\n• **Duration:** 10 x 1D6 minutes\n• **Power:** 7\n"
                "• **Effect:** Gain situational Edge to resist Manipulation spells Zoe’s Zap was first brewed by a small lab. It is ingested for a period.")
        got = fx(text, "gear", "Zoe's Zap")
        self.assertEqual(got, [("test:magic-resistance", "edge", "1", "activated", "resisting manipulation spells", None, None, None)])


class SpeedTest(unittest.TestCase):
    def test_a_long_unpunctuated_text_is_read_in_a_blink(self):
        text = "the quick brown fox jumps over the lazy dog and keeps going without any stop " * 110
        for t in (text, "reduce the " + text + " threshold ", "threshold of " + text):
            t0 = time.perf_counter()
            effects.read(t, "qualities", "x", "")
            self.assertLess(time.perf_counter() - t0, 1.0)  # (the threshold pattern took 10 s on 8 KB)


class EdgeCostTest(unittest.TestCase):
    def test_only_an_edge_cost_is_an_edge_cost(self):
        self.assertEqual(fx("Reduce the cost of the item by 1000 nuyen."), [])
        self.assertEqual(fx("Reduce the cost of Edge Boosts by 1 Edge.")[0][1:3], ("edge-cost", "-1"))  # (every Edge Boost: test:all)


class UnderFireTest(unittest.TestCase):
    def test_a_wireless_bonus_with_no_target_takes_the_bases(self):
        text = "Gain +2 dice on Perception tests.\n**Wireless bonus:** The bonus increases to +3."
        got = [(a["target"], a["value"], a.get("switch")) for t, a, _ in effects.read(text, "gear", "Zap Lens", "") if t == "effect"]
        self.assertIn(("skill:perception", "3", "wireless"), got)

    def test_tests_made_in_a_place_gain_dice(self):
        self.assertEqual(fx("Tests made in your Territory gain +2 dice.")[0][:5], ("test:all", "add", "2", "conditional", "in your territory"))


class BanScopeTest(unittest.TestCase):
    """Architecture round: an Edge ban's own limit is its condition, whatever clause of the sentence a condition word is in."""

    def test_the_words_after_the_ban_are_its_condition(self):
        self.assertEqual(fx("You cannot spend Edge to resist the effects of a zap.")[0][:5], ("test:all", "no-edge", "1", "conditional", "resist the effects of a zap"))
        got = fx("They may not gain or spend Edge on social tests where they or their crew try to talk down a guard, and they must test whenever they see a zapper.")
        self.assertEqual((got[0][0], got[0][3]), ("test:social", "conditional"))
        self.assertTrue(got[0][4].startswith("where they or their crew"))  # (not the other clause's whenever)

    def test_an_exception_is_a_condition_and_anytime_is_a_condition_word(self):
        self.assertEqual(fx("You may not gain or spend Edge on any Composure tests except in a fight.")[0][3:5], ("conditional", "except in a fight"))
        self.assertEqual(fx("Anytime you are wearing zap armor, you may not gain or spend Edge.")[0][3], "conditional")

    def test_which_tests_is_not_a_limit_and_a_purpose_is_not_a_skill(self):
        self.assertEqual(fx("You cannot spend Edge on any test using Charisma.")[0][:5], ("test:attr-cha", "no-edge", "1", None, None))
        got = fx("You may not gain or spend Edge to influence a license check.")
        self.assertEqual((got[0][0], got[0][3]), ("test:other", "conditional"))  # (what it is for, not the Influence skill)

    def test_a_drugs_ban_stays_activated_with_its_limit(self):
        text = "drugs & toxins\n• **Vector:** Ingestion\n• **Effect:** You cannot gain or spend Edge on any skill tests except Perception. Zoe’s Zap was first brewed by a small lab."
        got = fx(text, "gear", "Zoe's Zap")
        self.assertEqual((got[0][3], got[0][4]), ("activated", "except perception"))


class OtherPartyTest(unittest.TestCase):
    """Architecture round: a subject that is not the owner makes the Edge the others'."""

    def test_they_after_you_and_a_caster_of_that_spell(self):
        got = fx("When a person near you makes a Composure test, you may glare at them, so they can't gain or spend Edge on that test.")
        self.assertEqual({g[6] for g in got}, {"others"})
        self.assertEqual(fx("Also the caster of the spell cannot gain or spend Edge on their Sorcery roll.")[0][6], "others")
        self.assertEqual(fx("You may skip the roll, though if you do, any tests made against you gain a bonus Edge.")[0][6], "others")

    def test_a_leading_condition_holds_for_both_clauses(self):
        got = fx("If you join a Teamwork test to help a Social test, nobody can spend Edge, and the opposing character gains a point of Edge.")
        self.assertEqual(got[0][:7], ("test:social", "edge", "1", "conditional", "if you join a teamwork test to help a social test", None, "others"))


class ResistBonusTest(unittest.TestCase):
    def test_a_kind_of_harm_limits_the_bonus_and_damage_does_not(self):
        self.assertEqual(fx("You get a +1 dice pool bonus to resist zap damage.")[0][3:5], ("conditional", "to resist zap damage"))
        self.assertEqual(fx("You get a +1 dice pool bonus to resist damage.")[0][3], None)

    def test_only_the_resistance_the_object_names_is_limited(self):
        got = fx("Your Body counts as one point higher for soaking damage and for tests to resist magic where Body applies.", "gear")
        by = {g[0]: g[3] for g in got}
        self.assertEqual((by["test:damage-resistance"], by["test:magic-resistance"]), (None, "conditional"))


class WeaponModeTest(unittest.TestCase):
    def test_a_firing_modes_own_damage_value(self):
        self.assertEqual(fx("*Narrow Burst increases DV by 3. Zap makes a lot of noise.", "weapons")[0][:5], ("item:dv", "add", "3", "conditional", "narrow burst"))


class WirelessLineTest(unittest.TestCase):
    def test_concealability_rating_and_also_adds_its_bonus(self):
        self.assertEqual(fx("**Wireless bonus:** Sensors allow the holster to change color, increasing the Concealability threshold by an additional 1.", "gear")[0][:4],
                         ("item:concealability", "add", "1", "wireless"))
        got = fx("**Wireless bonus:** Add the booster's rating as a bonus to your taste-based Perception tests.", "gear", "Zap Booster")
        self.assertEqual(got[0][:4] + (got[0][5],), ("skill:perception", "add", "R", "wireless", "Taste"))
        text = "Gain +2 dice on Perception tests.\n**Wireless bonus:** The zap coprocessor also adds its bonus to Surprise tests."
        self.assertIn(("test:surprise", "add", "2", "wireless"), [g[:4] for g in fx(text, "gear", "Zap Coprocessor")])

    def test_the_rating_of_another_named_item_is_not_this_ones(self):
        text = "Add the false front's rating as a bonus to any Con (Disguise) tests to hide a user's look."
        self.assertEqual(len(fx(text, "augmentations", "False Front")), 1)
        self.assertEqual(fx(text, "augmentations", "Signal Drug (per dose)"), [])


class BtlSkillsTest(unittest.TestCase):
    def test_a_btl_effect_line_gives_its_skills(self):
        text = "**Vector:** Slot\n**Effect:** +2 Agility, -1 Charisma, Athletics 2, Engineering 1 (Locksmith +2)\nThe zap chip is loaded with memories."
        got = [(g[0], g[1], g[2], g[3], g[5]) for g in fx(text, "gear", "Zap Chip")]
        self.assertIn(("skill:athletics", "set", "2", "activated", None), got)
        self.assertIn(("skill:engineering", "add", "2", "activated", "Locksmith"), got)


class QuantityAndPoolTest(unittest.TestCase):
    """Architecture round: a count, a cap or a size is no bonus; a pool's attribute is part of the skill's pool."""

    def test_a_count_a_cap_and_a_radius_are_no_bonus(self):
        self.assertEqual(fx("The zap tank can carry a number of additional doses of a toxin equal to its rating.", "augmentations"), [])
        self.assertEqual(fx("Zap guards the skin from dust for a number of hours equal to its rating x 2.", "gear"), [])
        self.assertEqual(fx("This power cannot exceed your augmented Reaction maximum or +5D6 initiative."), [])
        self.assertEqual(fx("The radius of this zone in meters is equal to the Essence + 1 of the individual."), [])
        self.assertEqual(fx("It gives a number of boxes on your physical condition monitor equal to the rating.")[0][:3], ("derived:physical-monitor", "add", "R"))  # (boxes are a bonus)

    def test_a_skill_plus_attribute_pool_is_the_skill(self):
        got = fx("The user gains a point of Edge on their Perception + Intuition test for hearing.", "augmentations")
        self.assertEqual([g[0] for g in got], ["skill:perception"])
        self.assertEqual(got[0][5], "Hearing")

    def test_linked_skill_tests_are_the_tests_not_the_attribute(self):
        self.assertEqual([g[0] for g in fx("The user receives a +1 modifier to all Logic-linked skill tests.", "augmentations")], ["test:attr-log"])


class GunStatsTest(unittest.TestCase):
    def test_a_rate_per_barrel_a_limit_and_a_wild_die_with_no_article(self):
        got = fx("**Notes:** Includes a loader; use wild die when firing two or more barrels The gun makes a lot of noise.", "weapons")
        self.assertEqual(got[0][:5], ("test:combat", "wild-die", "1", "conditional", "when firing two or more barrels"))
        self.assertEqual(fx("*Increase DV by +1 for every additional barrel fired", "weapons"), [("item:dv", "add", "1", "conditional", "per additional barrel fired", None, None, None)])
        self.assertEqual(fx("Zapkote increases the Attack Rating of a weapon by 1, but it is limited to blades and similar items.", "gear")[0][3], "conditional")


class LateRulesTest(unittest.TestCase):
    """Architecture round, the last rules: who a bonus is for, a stat named before its condition, a word that is not a skill, a use-it-or-lose-it clause."""

    def test_you_gain_is_the_owners_even_with_tests_to_read_your_emotions(self):
        got = fx("When you are resisting Social tests and tests to read your emotions, you gain an Edge point.")
        self.assertEqual({g[6] for g in got}, {None})
        self.assertEqual(fx("You can skip it, though then any tests made against you gain a bonus Edge.")[0][6], "others")  # (against you: the other party)

    def test_a_bonus_to_a_stat_names_the_stat_not_the_test_of_its_condition(self):
        self.assertEqual(fx("+1 to DV when defending against melee attacks", "weapons"), [("item:dv", "add", "1", "conditional", "when defending against melee attacks", None, None, None)])

    def test_running_silent_and_the_run_are_not_athletics(self):
        got = fx("While running silent, gain a point of Edge whenever somebody makes a Matrix Perception attempt on you.")
        self.assertNotIn("skill:athletics", [g[0] for g in got])
        self.assertEqual(fx("Gain +1 die on Running tests.")[0][:2], ("skill:athletics", "add"))

    def test_use_it_or_lose_it_with_the_edge_named(self):
        got = fx("You get a bonus Edge on Perception tests to find a sound's source, but if you do not spend the Edge at once, it goes away.", "gear")
        self.assertEqual(got[0][:5], ("skill:perception", "edge", "1", "conditional", "to find a sound's source"))

    def test_the_word_edge_is_not_the_edge_attribute(self):
        self.assertEqual([g[0] for g in fx("They gain a bonus Edge when making any Logic-based test.")], ["test:attr-log"])
        self.assertEqual(fx("Reduce the cost of Edge Boosts by 1 Edge.")[0][:3], ("test:all", "edge-cost", "-1"))


class BookRowReplaceTest(unittest.TestCase):
    """HIGH 1: a book row's effect replaces the reader's of the same target and operation; a drop that finds nothing is reported."""

    def apply(self, rows, xml):
        from importer.sr6 import NS
        import contextlib
        import io
        xml = xml.replace("<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1)
        with contextlib.redirect_stderr(io.StringIO()):
            return overrides.apply("x", {"qualities.xml": xml}, rows)["qualities.xml"]

    def test_the_readers_conditional_copy_is_not_left_beside_the_books(self):
        xml = ('<sr6:data kind="qualities">\n  <quality id="zq" source="X" page="1"><name>Zap</name>'
               '<effect target="test:magic-resistance" op="edge" value="1" switch="conditional" when="to resist spells"/></quality>\n</sr6:data>\n')
        row = {"cl6": "Zap", "kind": "qualities", "id": "zq", "gen": "book", "why": "turned on with a Minor Action",
               "effects": [{"target": "test:magic-resistance", "op": "edge", "value": "1", "switch": "activated"}]}
        out = self.apply([row], xml)
        self.assertEqual(out.count('target="test:magic-resistance"'), 1)
        self.assertIn('switch="activated"', out)
        self.assertNotIn("to resist spells", out)

    def test_an_added_effect_goes_after_the_kinds_own_children_and_before_the_text(self):
        xml = ('<sr6:data kind="qualities">\n  <quality id="zq" source="X" page="1"><name>Zap</name><infected strain="III" base="Elf"/>'
               '<modifier kind="valmod" type="ATTRIBUTE" ref="BODY" value="10" set="MAX"/><text/></quality>\n</sr6:data>\n')
        row = {"cl6": "Zap", "kind": "qualities", "id": "zq", "gen": "book", "why": "a bonus the book states",
               "effects": [{"target": "derived:defense", "op": "add", "value": "1"}]}
        out = self.apply([row], xml)
        self.assertLess(out.index("<modifier"), out.index("<effect"))  # (the schema: the kind's children, then the tail group)
        self.assertLess(out.index("<effect"), out.index("<text"))

    def test_every_drop_of_a_shipped_row_names_its_effect(self):
        import glob
        import json
        import os
        for f in glob.glob(os.path.join(os.path.dirname(overrides.__file__), "overrides", "*.book.json")):
            for r in json.load(open(f, encoding="utf8")):
                for d in r.get("drops", []):
                    self.assertTrue(d.get("target") and d.get("op"), (f, r.get("id")))


def links(text, kind="qualities"):
    return [a for t, a, _ in effects.links(text, kind)]


class BookCorrectionPatternsTest(unittest.TestCase):
    """The book corrections that were reader mistakes (docs/reviews/sr6-book-corrections-patterns-2026-10-19.md, Tier 1), now rules."""

    def test_initiative_dice_written_nd6_and_one_removed(self):
        self.assertEqual(fx("A zapbot's base initiative is Reaction + Pilot, with 3D6 Initiative Dice.", "augmentations")[0][:3], ("derived:initiative-dice", "set", "3"))
        got = fx("When swallowed, the drug lowers the target's Reaction by 1 and removes one Initiative Die.", "gear")
        self.assertIn(("derived:initiative-dice", "add", "-1"), [g[:3] for g in got])
        self.assertEqual(fx("You can never have more than 5D6 Initiative Dice.", "rules"), [])  # (a cap)

    def test_damage_the_wearer_takes_is_damage_reduction_not_a_weapons_dv(self):
        self.assertEqual(fx("The zap plate reduces the Damage Value of any attack by 1 point.", "armor")[0][:3], ("derived:damage-reduction", "add", "1"))
        self.assertEqual(fx("It reduces incoming DV by its rating.", "armor")[0][:3], ("derived:damage-reduction", "add", "R"))
        self.assertEqual(fx("This zap reduces incoming Damage Value (DV) by 2 times its rating.", "armor")[0][:3], ("derived:damage-reduction", "add", "R*2"))

    def test_the_owners_own_bonus_is_not_someone_elses(self):
        self.assertIsNone(fx("+2 to Athletics for those with Flight specialization.", "vehicles")[0][6])
        self.assertIsNone(fx("You don't gain Edge when making social tests to sell zap you have found.")[0][6])

    def test_an_attribute_word_in_another_noun_is_no_attribute_test(self):
        got = fx("You may use Strength or Agility for any grappling test, and you gain a bonus point of Edge on any grappling test.")
        self.assertEqual([g[:2] for g in got], [("skill:close-combat", "edge")])
        self.assertNotIn("test:attr-mag", [g[0] for g in fx("It gives a point of situational Edge on a zap test against attacks of toxic magic.")])
        self.assertEqual(fx("Any tests made here that include the Magic attribute gain a point of Edge.")[0][:2], ("test:attr-mag", "edge"))  # (kept)
        self.assertIn(("test:attr-agi", "no-edge"), [g[:2] for g in fx("The zapper may not spend Edge on any action linked to a Physical Attribute (Agility, Body).")])

    def test_an_honorific_ends_no_sentence(self):
        got = fx("Gain a bonus point of Edge when making Negotiation tests with fixers and Mr. Johnsons.")
        self.assertEqual(got[0][4], "when making negotiation tests with fixers and mr. johnsons")

    def test_a_specialization_by_another_word_takes_its_own_name(self):
        self.assertEqual(fx("Gain a bonus point of Edge to use on Sprint or Swimming tests.")[0][5], "Sprinting, Swimming")
        self.assertEqual(fx("Gain a point of Edge on tests to disguise oneself, or to impersonate someone.", "augmentations")[0][5], "Disguise, Impersonation")

    def test_the_cost_of_an_edge_boost_on_an_activity(self):
        got = fx("Reduce the cost of an Edge boost by 1 used during a grapple test.", "augmentations")
        self.assertEqual(got[0][:3], ("skill:close-combat", "edge-cost", "-1"))

    def test_grants_named_after_their_kind_with_a_list_in_brackets_and_in_a_drugs_effect(self):
        self.assertEqual(links("Zappers gain the critter power Immunity (Pathogens, Toxins) with a rating of 2."),
                         [{"rel": "grants", "name": "Immunity", "kind": "critterpowers", "level": "2", "when": "Pathogens, Toxins"}])
        self.assertEqual(links("**Adept:** Free Zap Control power", "mentorspirits"), [{"rel": "grants", "name": "Zap Control", "kind": "adeptpowers", "when": "adept"}])
        self.assertEqual(links("You get the Allergy (zaps, mild) quality."), [{"rel": "grants", "name": "Allergy", "kind": "qualities", "when": "zaps, mild"}])
        self.assertEqual(links("**Effect:** -1 Logic, High Zap Tolerance (p. 72, SR6), Confused 2", "gear"), [{"rel": "grants", "name": "High Zap Tolerance", "book": "crb"}])
        self.assertEqual(links("See the Zap quality (p. 72)."), [])  # (a cross-reference: see_links reads it)

    def test_threshold_wordings_and_no_test_description(self):
        self.assertEqual(fx("Useful for climbing tests, reducing thresholds by 1 for each zap.", "augmentations")[0][:3], ("skill:athletics", "threshold", "-1"))
        self.assertEqual(fx("All tactile Perception tests you make have their threshold increased by 1.", "augmentations")[0][:4], ("skill:perception", "threshold", "1", None))
        self.assertEqual(fx("Note: -1 for all repair test thresholds", "vehicles")[0][:3], ("skill:engineering", "threshold", "-1"))
        self.assertEqual(fx("Their threshold for Surprise tests is 1.")[0][:3], ("test:surprise", "threshold-set", "1"))
        self.assertEqual(fx("Make a Perception (3) test to spot the zap; a threshold of 2 to notice it.", "gear"), [])


class BookCorrectionPatternsTier2Test(unittest.TestCase):
    """The book corrections that were reader mistakes, Tier 2 (docs/reviews/sr6-reader-tier2-2026-10-19.md), now rules."""

    def test_an_activation_sentence_carries_to_the_rest_of_its_paragraph(self):
        got = fx("This zapware requires a Minor Action to activate the coil. When attempting a Zap test (Athletics + Strength), you jump 2 meters per hit. "
                 "They also get +1 die on Jumping tests per level.\n\nThe coil gives +1 die on Perception tests.", "augmentations")
        self.assertEqual([g[:4] for g in got], [("skill:athletics", "add", "R", "activated"), ("skill:perception", "add", "1", None)])  # (the next paragraph: not)
        got = fx("**Activation:** Major Action\nThe adept gains +1 die per level to all Zap (Leadership) tests. The adept always gets +1 die on Perception tests.", "adeptpowers")
        self.assertEqual([g[3] for g in got], ["activated", None])  # (`always`: not)
        self.assertEqual(fx("With a Minor Action, a secondary zap can be activated. Unarmed damage becomes physical.", "gear")[0][:4], ("derived:unarmed-damage", "set", "P", "activated"))

    def test_an_action_spent_is_the_switch_and_the_sentence_keeps_its_condition(self):
        self.assertEqual(fx("When making a zap attack, gain +1 DV by spending a Minor Action.")[0][3:5], ("activated", "when making a zap attack"))
        self.assertEqual(fx("Investing a Minor Action, the zapper gains one Edge on Sorcery tests.")[0][3:5], ("activated", None))

    def test_a_value_per_something_not_the_rating_is_a_shown_condition(self):
        self.assertEqual(fx("The zapper gains +1 Willpower for each pair of cyberlimbs they have."), [("attr:wil", "add", "1", "conditional", "per pair of cyberlimbs", None, None, "low")])
        self.assertEqual(fx("For every 5 crew who are unable to assist, increase Handling by 1.", "vehicles")[0][2:5], ("1", "conditional", "per 5 crew"))
        self.assertEqual(fx("All attacks by this zap gain +1 DV for each level of wound penalty it is suffering.", "critterpowers")[0][2:5], ("1", "conditional", "per level of wound penalty"))  # (no rating: not R)
        self.assertEqual(fx("Gain +1 die on Perception tests per round.")[0][3], None)  # (a time unit: no condition)

    def test_a_wild_die_on_every_test_is_on_all_tests(self):
        self.assertEqual(fx("When this zap is active, the user adds a wild die to every test they make while in the Matrix.", "gear"), [("test:all", "wild-die", "1", "activated", "while in the matrix", None, None, None)])
        self.assertNotIn("test:all", [g[0] for g in fx("Whenever this critter makes a skill test near Perception, add a wild die to its dice pool.")])  # (a skill named: its)

    def test_a_sentence_that_only_limits_the_bonus_before_adds_none(self):
        self.assertEqual(fx("Each level adds +1 die to Zap tests. This bonus only applies while the user is jumped-in.", "augmentations"),
                         [("test:other", "add", "1", "conditional", "zap tests, while the user is jumped-in", None, None, None)])
        self.assertEqual(fx("Whenever you are zapped, reduce the cost of any Edge boosts by 1. This only applies to Matrix actions.")[0][:3], ("test:matrix", "edge-cost", "-1"))

    def test_edge_on_this_test_after_one_skill_test_is_that_skills(self):
        got = fx("They go unnoticed with a successful Influence (Etiquette) + Charisma (2) test. You gain an Edge on this test if you are dressed for it.", "gear")
        self.assertEqual(got, [("skill:influence", "edge", "1", "conditional", "if you are dressed for it", "Etiquette", None, None)])

    def test_a_third_party_mid_sentence_and_at_least_one_net_hit(self):
        self.assertEqual(fx("This zap makes spotting the user easier, so any observers get a +1 dice pool bonus on Perception tests.")[0][6], "others")
        self.assertIsNone(fx("If you zap them, any observers get a +1 dice pool bonus on Perception tests.")[0][6])  # (a condition first: untouched)
        self.assertEqual(fx("Gain a point of Edge whenever you score at least one net hit on a zap test.", "datastructures")[0][2], "1")


if __name__ == "__main__":
    unittest.main()
