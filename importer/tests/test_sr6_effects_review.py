"""SR6 effects reader, the complete effects review (owner-approved 2026-10-18): the reader's rules by the review's root-cause families, and the
marked gen="book" rows for what no rule says. Every sentence and name is invented, in the books' structure."""
import unittest

from importer.sr6 import effects, overrides


def fx(text, kind="qualities", name=None, cls=""):
    return [(a["target"], a["op"], a["value"], a.get("switch"), a.get("when"), a.get("spec"), a.get("affects")) for t, a, _ in effects.read(text, kind, name, cls) if t == "effect"]


def file(kind, tag, rows):
    return f'<sr6:data kind="{kind}">\n' + "".join(f'  <{tag} id="{i}" source="X" page="1"{a}><name>{n}</name>{k}</{tag}>\n' for i, a, n, k in rows) + "</sr6:data>\n"


class MissingConditionTest(unittest.TestCase):
    """Family 1: the words after a test's name limit the effect; family 2: a cut-off or flavor fragment is no condition."""

    def test_the_words_after_the_test_limit_it(self):
        self.assertEqual(fx("Perception tests made in your Territory gain an Edge.")[0][:5],
                         ("skill:perception", "edge", "1", "conditional", "in your territory"))
        self.assertEqual(fx("You gain +2 dice on Con (Disguise) tests to hide your origin and appear more local.")[0][:5],
                         ("skill:con", "add", "2", "conditional", "to hide your origin and appear more local"))
        self.assertEqual(fx("You may not gain or spend Edge on Influence tests to deal with this zapper.")[0][3:5], ("conditional", "to deal with this zapper"))
        self.assertEqual(fx("You may not gain or spend Edge on any action that would raise the Heat modifier.")[0][:5],
                         ("test:all", "no-edge-gain", "1", "conditional", "that would raise the heat modifier"))

    def test_a_specialization_named_by_related_to_is_no_limit(self):
        self.assertEqual(fx("Gain +1 Edge for all Athletics tests related to balance.")[0][3:6], (None, None, "Balance"))

    def test_a_resist_with_a_limit_is_a_condition(self):
        self.assertEqual(fx("You suffer a -2 dice pool penalty on rolls to resist heat-based attacks.")[0][:5], ("test:damage-resistance", "add", "-2", "conditional", "to resist heat-based attacks"))
        self.assertEqual(fx("Edge Boosts cost 1 less for tests to resist damage (not drain).")[0][3], None)  # (resisting damage is the test itself)

    def test_fragments_and_flavor_are_no_conditions(self):
        got = fx("**Ar:** +1 | Ever shoot a zapper at a drone, only for it to look at you with disdain?", "ammotypes")
        self.assertEqual([g[3] for g in got], [None] * len(got))
        got = fx("**Effect:** +1 Reaction, -1 Logic Zapzap is used across the world by zappers.", "gear")  # (a drug's story is no condition of its effect)
        self.assertEqual({g[4] for g in got}, {None})
        self.assertEqual(fx("Gain +1 Edge when you are jumped in.")[0][3], "conditional")  # (a particle at the end, `jumped in`, is no dangling word)
        self.assertEqual(fx("If you take this quality, you suffer a -1 dice pool penalty on Perception tests.")[0][3], None)  # (the entry itself)

    def test_a_threshold_cut_inside_a_parenthesis_is_whole_or_dropped(self):
        self.assertNotIn("(", fx("Gain +1 Edge while you are in a tense situation (only if somebody watches the zapper)")[0][4])


class WrongPartyTest(unittest.TestCase):
    """Family 3: opponents' bonuses and the defender's."""

    def test_edge_for_resisting_is_the_defenders(self):
        self.assertEqual(fx("Gain a bonus Edge when resisting Intimidation.")[0][:5], ("test:other", "edge", "1", "conditional", "intimidation"))
        self.assertEqual(fx("You gain 1 point of situational Edge for resisting Manipulation spells.")[0][0], "test:magic-resistance")
        self.assertEqual(fx("Users of the gizmo grant 2 Edge when resisting a Con (Seduction) test.", "gear")[0][0], "skill:con")  # (what others get against the user: theirs, kept)

    def test_the_opposition_that_gains_edge_is_others(self):
        self.assertEqual(fx("When you make an opposed Social test against anyone with a tell, they gain a point of Edge.")[0][6], "others")
        self.assertEqual(fx("The opposing individual gains a point of Edge on Con tests.")[0][6], "others")

    def test_a_test_to_hide_you_is_not_the_others(self):
        self.assertIsNone(fx("You gain +2 dice on Disguise tests to hide your metatype.")[0][6])

    def test_a_drug_effect_line_is_the_users_and_cut_before_its_story(self):
        got = fx("**Vector:** Slot\n**Effect:** +1 Charisma, -1 Willpower\nChill is a great BTL for those who suffer from anxiety.", "gear")
        self.assertEqual([(g[0], g[3], g[6]) for g in got], [("attr:cha", "activated", None), ("attr:wil", "activated", None)])


class VariantBleedTest(unittest.TestCase):
    """Family 4: a variant takes its own paragraph, not its siblings'; a table note is the model's it names; an ammo type's printed stats are its own."""

    def test_a_label_with_a_prefix_or_a_suffix_is_the_variants(self):
        text = ("The zap symbionts come in kinds.\n**Zap-Booster:** reduces any Fatigue status by two levels.\n**Zap-Mender:** The user gains +1 Body for the test.\n"
                "**Cyberware overdrive:** Gain +2 dice on a test made using the symbiont. One of these dice must be a wild die.")
        part = effects._variant_part(text, "Zapsymbionts (Booster)", ["Zapsymbionts (Booster)", "Zapsymbionts (Mender)"])
        self.assertIn("Fatigue", part)
        self.assertNotIn("Body", part)
        self.assertIn("overdrive", part)  # (after the last variant: every variant's)
        part = effects._variant_part(text, "Zapsymbionts (Mender)", ["Zapsymbionts (Booster)", "Zapsymbionts (Mender)"])
        self.assertIn("overdrive", part)
        self.assertNotIn("Fatigue", part)
        tails = "**Swimming tail:** a swimming tail grants +2 dice for Athletics (Swimming) tests.\n**Bite tail:** nothing.\n**Cyberware overdrive:** Gain +2 dice on a test.\n"
        self.assertIn("swimming tail", effects._variant_part(tails, "Tails (Swimming)", ["Tails (Swimming)", "Tails (Bite)"]))

    def test_a_wild_die_note_for_another_weapons_attacks_is_skipped(self):
        self.assertEqual(fx("Use the wild die on garrote attacks.", "weapons", "Zap Pistol"), [])
        self.assertEqual(fx("Use the wild die on garrote attacks.", "weapons", "Zap Garrote")[0][:3], ("test:combat", "wild-die", "1"))

    def test_an_ammo_types_printed_stats_are_its_effects_once(self):
        files = {"ammotypes.xml": '<sr6:data kind="ammotypes">\n  <ammotype id="za" source="X" page="1" ar="+2" dv="+1" class="ammotype"><name>Zap Shot</name></ammotype>\n</sr6:data>\n'}
        texts = '<sr6:data kind="texts">\n  <text of="ammotypes" id="za">**Ar:** +2 | **Dv:** +1 | A story.</text>\n</sr6:data>\n'
        out = effects.apply(files, texts)[0]["ammotypes.xml"]
        self.assertEqual(out.count('target="item:ar"'), 1)
        self.assertEqual(out.count('target="item:dv"'), 1)
        files["ammotypes.xml"] = files["ammotypes.xml"].replace('ar="+2"', 'ar="+2 (BF/FA Modes Only)"')
        out = effects.apply(files, texts)[0]["ammotypes.xml"]
        self.assertIn('value="2,2,2,2,2" switch="conditional" when="bf/fa modes only"', out)  # (the modes it is for)


class WirelessTest(unittest.TestCase):
    """Family 5: a bonus Minor Action handed back is conditional on what it refunds; a total is the difference."""

    def test_a_refunded_minor_action_is_conditional_on_its_trigger(self):
        got = fx("**Wireless bonus:** Gain a bonus Minor Action on any turn you extend the zap blades.", "augmentations")
        self.assertEqual(got[0][:5], ("derived:minor-actions", "add", "1", "wireless", "on any turn you extend the zap blades"))
        got = fx("When you spend a Minor Action to command a sprite, you gain a bonus Minor Action.", "echoes")
        self.assertEqual(got[0][3], "conditional")

    def test_a_wireless_total_is_the_difference_from_the_base(self):
        text = "This sight increases the weapon's Attack Rating by 1.\n**Wireless bonus:** The bonus to the Attack Rating increases to 2."
        files = {"weapons.xml": file("weapons", "weapon", [("zs", ' category="Weapon accessory"', "Zap Sight", "")])}
        texts = f'<sr6:data kind="texts">\n  <text of="weapons" id="zs">{text}</text>\n</sr6:data>\n'
        out = effects.apply(files, texts)[0]["weapons.xml"]
        self.assertIn('target="item:ar" op="add" value="1" switch="wireless"', out)
        self.assertNotIn("_total", out)


class ChooseOneTest(unittest.TestCase):
    """Family 6: pick one is a chosen skill, not every one listed."""

    def test_a_choice_of_one_skill_is_skill_choice(self):
        self.assertEqual(fx("Edge Boosts cost 1 less for Athletics or Stealth tests (choose one)")[0][:3], ("skill:choice", "edge-cost", "-1"))
        got = fx("Zappers may swap in a wild die on rolls made for Biotech, Cracking, or Piloting (the choice of one skill is permanent).")
        self.assertEqual([g[:3] for g in got], [("skill:choice", "wild-die", "1")])

    def test_the_choice_of_a_drain_attribute_names_no_test(self):
        got = fx("Zappers may resist adept drain with any physical attribute instead of Body, and swap in a wild die on Athletics rolls "
                 "(the choice of physical attribute for drain is permanent).")
        self.assertEqual([g[:3] for g in got], [("skill:athletics", "wild-die", "1"), ("derived:adept-drain-attribute", "set", "choice")])


class NumberTest(unittest.TestCase):
    """Family 7: percents, thresholds, formulas."""

    def test_a_percent_is_not_a_flat_number(self):
        self.assertEqual(fx("Increasing the Body by 50 percent.", "vehicles"), [("item:body", "add", "50%", None, None, None, None)])
        self.assertEqual(fx("Each rating point adds 20 percent to the base Top Speed number.", "gear")[0][2], "R*20%")

    def test_thresholds_read_as_a_threshold(self):
        self.assertEqual(fx("The wearer reduces the threshold for Escape Artist tests involving that hand by 1.")[0][:3], ("skill:athletics", "threshold", "-1"))
        self.assertEqual(fx("-1 to threshold for climbing tests.")[0][:3], ("skill:athletics", "threshold", "-1"))
        self.assertEqual(fx("Lowers the threshold by -2 for Perception tests to detect ambush.")[0][:5], ("skill:perception", "threshold", "-2", "conditional", "to detect ambush"))
        self.assertEqual(fx("Increases the threshold on Perception tests by 2.")[0][6], "others")  # (a higher threshold is the opposition's)
        self.assertEqual(fx("This increases the concealability threshold of a weapon by 1.", "weapons")[0][:3], ("item:concealability", "add", "1"))  # (the item's stat)

    def test_each_point_of_essence_loss_is_a_formula_shown(self):
        got = fx("Each point of your Essence loss (round up) gives a -1 dice pool penalty to tests that involve Charisma or Logic.")
        self.assertEqual([(g[0], g[2], g[3]) for g in got], [("test:attr-cha", "-(6-ess) RU", None), ("test:attr-log", "-(6-ess) RU", None)])

    def test_an_overdrive_point_of_volume_adds_per_point(self):
        got = fx("Overdrive: Each point of nanite volume put in overdrive adds +1 dice to skill tests linked to Intuition.", "gear")
        self.assertEqual(got[0][:5], ("test:attr-int", "add", "nanite-volume", "activated", "overdrive"))


class DiceAndAttributeTest(unittest.TestCase):
    """Family 8: dice on tests using an attribute are not the attribute."""

    def test_tests_involving_an_attribute_are_the_attribute_tests(self):
        got = fx("Gain +4 dice to a test involving Agility or Reaction.")
        self.assertEqual([g[0] for g in got], ["test:attr-agi", "test:attr-rea"])
        self.assertEqual(fx("You suffer a -1 dice pool penalty on all actions that use Strength.")[0][0], "test:attr-str")

    def test_the_attributes_that_resist_are_not_raised(self):
        got = fx("Gain +2 Defense Rating against mana spells that are resisted by Willpower, Logic, Intuition, or Charisma.")
        self.assertEqual([g[0] for g in got], ["derived:defense"])

    def test_a_body_that_is_prose_is_not_the_attribute(self):
        got = fx("The camouflage gives a +1 dice pool bonus for Stealth tests if much of their body is exposed.")
        self.assertEqual([g[0] for g in got], ["skill:stealth"])


class MissingClauseTest(unittest.TestCase):
    """Family 9: the clauses the reader missed."""

    def test_a_dice_modifier_on_tests_with_no_target_is_test_other_and_its_words_the_condition(self):
        got = fx("This inflicts a -1 dice pool modifier to any fine manipulations using the webbed digits.")
        self.assertEqual(got[0][:5], ("test:other", "add", "-1", "conditional", "fine manipulations using the webbed digits"))
        got = fx("You take a -6 dice pool modifier to all actions while exposed to the allergen.")
        self.assertEqual(got[0][:5], ("test:all", "add", "-6", "conditional", "while exposed to the allergen"))

    def test_overdrive_dice_and_the_wild_die(self):
        got = fx("**Cyberware overdrive:** Gain +2 dice on a test made using the zaptail. One of these dice must be a wild die.", "augmentations")
        self.assertEqual([(g[0], g[1], g[3]) for g in got], [("test:other", "add", "activated"), ("test:other", "wild-die", "activated")])
        got = fx("**Cyberware overdrive:** Reduce the threshold for an Athletics (Swimming) test by 1. Convert one die to a wild die.", "augmentations")
        self.assertEqual([(g[0], g[1], g[5]) for g in got], [("skill:athletics", "threshold", "Swimming"), ("skill:athletics", "wild-die", "Swimming")])
        got = fx("**Cyberware overdrive:** Convert one die on the Sprinting test to a wild die.", "augmentations")
        self.assertEqual([(g[0], g[1]) for g in got], [("skill:athletics", "wild-die")])  # (not a bonus of one die)
        got = fx("**Overdrive:** Zap eyes grant +2 dice, one of which is a wild die, on a Defense test.", "augmentations")
        self.assertEqual({(g[0], g[1]) for g in got}, {("test:defense", "add"), ("test:defense", "wild-die")})

    def test_the_sentence_after_a_run_in_label_keeps_it(self):
        text = "A tail.\n**Thagomizer tail:** It does DV 4P.\n**Cyberware overdrive:** Gain +2 dice on a test\nmade using the tail. One of these dice must be a wild die."
        got = [(a["op"], a.get("switch")) for t, a, _ in effects.read(text, "augmentations", "Tails (Thagomizer)") if t == "effect" and a["op"] == "wild-die"]
        self.assertEqual(got, [("wild-die", "activated")])

    def test_prices_monthly_costs_boxes_and_a_formula_over_a_rating(self):
        self.assertEqual(fx("A user pays ten percent extra for any worn or fitted clothing.", "augmentations")[0][:3], ("pricemod:armor", "add", "0.1"))
        self.assertEqual(fx("Fitted gear costs five percent more per additional zaplimb.", "augmentations")[0][:5], ("pricemod:gear", "add", "0.05", "conditional", "fitted gear, per additional zaplimb"))
        self.assertEqual(fx("You must increase all Lifestyle costs by 500 nuyen per month.")[0][:3], ("derived:monthly-cost", "add", "500"))
        self.assertEqual(fx("The user gains four Physical Condition Monitor boxes.", "augmentations")[0][:3], ("derived:physical-monitor", "add", "4"))
        self.assertEqual(fx("Add your zapogenesis rating to all flying tests.", "augmentations")[0][:3], ("skill:athletics", "add", "zapogenesis"))

    def test_a_critters_gained_powers_line(self):
        got = fx("**Gained Powers:** Armor 2, Built Tough 1, +2 to base movement rates", "critters")
        self.assertEqual({(g[0], g[2]) for g in got}, {("derived:defense", "2"), ("derived:physical-monitor", "1"), ("derived:movement", "2/2/0")})

    def test_the_edge_cost_of_an_action_it_names_and_edge_for_a_result(self):
        got = fx("This implant reduces the Edge cost for Parry by 2 and Taunt by 1.", "augmentations")
        self.assertEqual([(g[0], g[2]) for g in got], [("action:parry", "-2"), ("action:taunt", "-1")])
        got = fx("If you completely resist all damage from a Zap Spike, you gain a point of Edge.")
        self.assertEqual([(g[0], g[3]) for g in got], [("test:damage-resistance", "conditional")])
        got = fx("You cannot earn Edge or spend Edge in any form while sick.")
        self.assertEqual([(g[0], g[1], g[3]) for g in got], [("test:all", "no-edge-gain", "conditional"), ("test:all", "no-edge", "conditional")])
        self.assertEqual(fx("**Magician:** Edge Boosts cost 1 less for spells and rituals in the Illusion category")[0][:3], ("test:spell-illusion", "edge-cost", "-1"))

    def test_edge_against_a_kind_of_target_is_test_other(self):
        self.assertEqual(fx("Zap ears give a bonus Edge vs. a target who has something interfering with their ears.", "augmentations")[0][:5],
                         ("test:other", "edge", "1", "conditional", "vs. a target who has something interfering with their ears"))

    def test_item_bonuses_for_a_kind_of_weapon_or_fire(self):
        self.assertEqual(fx("Grants +2 to AR for all linked smartgun weapons.", "gear")[0][3:5], ("conditional", "linked smartgun weapons"))
        self.assertEqual(fx("It offers a +3 Attack Rating for Full-Auto fire.", "weapons")[0][3:5], ("conditional", "full-auto fire"))

    def test_the_vehicle_operation_tests_and_a_link_that_only_checks(self):
        self.assertEqual(fx("When you are jumped in, you gain a bonus point of Edge on all tests involving the operation of a vehicle.", "augmentations")[0][:5],
                         ("test:vehicle", "edge", "1", "conditional", "when you are jumped in"))
        self.assertEqual(effects.links("If the spirit also has the Realistic Form power, it gains a +1 die.", "critterpowers"), [])
        self.assertEqual(effects.links("The critter gains the Zap Armor power.", "critterpowers")[0][1]["name"], "Zap Armor")


class NewTargetsTest(unittest.TestCase):
    """The rule changes the vocabulary had no word for (shown, never applied)."""

    def test_adept_drain_attribute_wound_penalty_and_wound_threshold(self):
        self.assertEqual(fx("Followers may resist adept drain with Logic instead of Willpower.")[0][:3], ("derived:adept-drain-attribute", "set", "log"))
        self.assertEqual(fx("Followers may resist adept drain with their tradition attribute instead of Willpower.")[0][2], "tradition")
        self.assertEqual(fx("As long as you are acting directly in service to your ideal, ignore one die of wound penalties.")[0][:3], ("derived:wound-penalty", "add", "-1"))
        self.assertEqual(fx("For each level, the modifiers from damage start one box farther down the Condition Monitor.",
                            "adeptpowers")[0][:3], ("derived:wound-threshold", "add", "R"))


class BookRowTest(unittest.TestCase):
    """A gen="book" row: drops name exactly the effects they take out; effects are not added twice; a link kid is allowed."""

    def apply(self, rows, xml):
        from importer.sr6 import NS
        import contextlib
        import io
        xml = xml if "xmlns:sr6" in xml else xml.replace("<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1)
        self.err = io.StringIO()
        with contextlib.redirect_stderr(self.err):
            return overrides.apply("x", {"qualities.xml": xml}, rows)["qualities.xml"]

    def test_a_drop_is_exact_and_an_effect_is_added_once(self):
        xml = file("qualities", "quality", [("zq", "", "Zap Quality",
                                             '<effect target="test:all" op="no-edge" value="1"/><effect target="test:all" op="no-edge" value="1" switch="conditional" when="while zapped"/>')])
        row = {"cl6": "Zap Quality", "kind": "qualities", "id": "zq", "gen": "book", "why": "the ban binds only while zapped",
               "drops": [{"target": "test:all", "op": "no-edge", "value": "1"}],
               "effects": [{"target": "test:all", "op": "no-edge", "value": "1", "switch": "conditional", "when": "while zapped"}]}
        out = self.apply([row], xml)
        self.assertEqual(out.count('target="test:all"'), 1)  # (the unconditional one dropped, the conditional one already there: once)
        self.assertIn('when="while zapped"', out)
        out2 = self.apply([row], out)
        self.assertEqual(out2.count('target="test:all"'), 1)  # (applied again: the same)

    def test_a_book_effect_replaces_the_readers_of_the_same_target_and_operation(self):
        reader = '<effect target="test:magic-resistance" op="add" value="R" switch="conditional" when="to resist spells"/><effect target="skill:con" op="edge" value="1"/>'
        xml = file("qualities", "quality", [("zq", "", "Zap Quality", reader + '<effect target="test:defense" op="add" value="1" gen="cl6"/>')])
        row = {"cl6": "Zap Quality", "kind": "qualities", "id": "zq", "gen": "book", "why": "a minor action turns it on",
               "effects": [{"target": "test:magic-resistance", "op": "add", "value": "R", "switch": "activated"},
                           {"target": "test:defense", "op": "add", "value": "2"}]}
        out = self.apply([row], xml)
        self.assertEqual(out.count('target="test:magic-resistance"'), 1)  # (not twice: the reader's, uncorrected, and the row's)
        self.assertIn('target="test:magic-resistance" op="add" value="R" switch="activated" gen="book"', out)
        self.assertIn('target="skill:con"', out)  # (another target: untouched)
        self.assertEqual(out.count('target="test:defense"'), 2)  # (a Commlink6 row's effect stays beside it)
        keep = self.apply([{**row, "keep": True}], xml)
        self.assertEqual(keep.count('target="test:magic-resistance"'), 2)  # (`keep`: it only adds)
        self.assertEqual(self.apply([row], out).count('target="test:magic-resistance"'), 1)

    def test_a_drop_that_matches_nothing_is_reported(self):
        xml = file("qualities", "quality", [("zq", "", "Zap Quality", '<effect target="skill:con" op="edge" value="1"/>')])
        row = {"cl6": "Zap Quality", "kind": "qualities", "id": "zq", "gen": "book", "why": "x", "drops": [{"target": "skill:con", "op": "edge", "value": "2"}]}
        overrides.UNMATCHED_DROPS.clear()
        out = self.apply([row], xml)
        self.assertIn("matches no effect", self.err.getvalue())
        self.assertEqual(len(overrides.UNMATCHED_DROPS), 1)
        self.assertIn('target="skill:con"', out)
        overrides.UNMATCHED_DROPS.clear()

    def test_a_book_row_needs_its_why_and_knows_its_drops(self):
        with self.assertRaises(ValueError):
            overrides.check([{"cl6": "Z", "kind": "qualities", "id": "z", "gen": "book", "drops": [{"op": "add"}], "why": "x"}])
        with self.assertRaises(ValueError):
            overrides.check([{"cl6": "Z", "kind": "qualities", "id": "z", "gen": "book", "effects": [{"target": "a:b", "op": "add", "value": "1"}]}])
        overrides.check([{"cl6": "Z", "kind": "qualities", "id": "z", "gen": "book", "why": "x", "kids": [{"tag": "link", "attrs": {"rel": "grants", "name": "Zap"}}]}])


if __name__ == "__main__":
    unittest.main()
