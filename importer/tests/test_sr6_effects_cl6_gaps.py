"""SR6 effects reader, batch 3 (owner rulings 2026-10-17 evening): the CommLink6 gaps closed by the reader where the book states the
effect and by marked gen="cl6" override rows where it cannot. Every sentence and name is invented, in the books' structure.
"""

import json
import re
import unittest

from importer.sr6 import effects, overrides


def fx(text, kind="qualities", name=None, cls=""):
    return [
        (a["target"], a["op"], a["value"], a.get("switch"), a.get("when"), a.get("spec"))
        for t, a, _ in effects.read(text, kind, name, cls)
        if t == "effect"
    ]


def file(kind, tag, rows):
    return (
        f'<sr6:data kind="{kind}">\n'
        + "".join(f'  <{tag} id="{i}" source="X" page="1"{a}><name>{n}</name>{k}</{tag}>\n' for i, a, n, k in rows)
        + "</sr6:data>\n"
    )


class SectionCTest(unittest.TestCase):
    def test_a_skills_ranks_added_to_a_test_are_the_value_rank_skill(self):
        got = fx(
            "A zapper may add their ranks in Zap to their dice pool on a Composure test, but if they do, Edge boosts on that test cost one more."
        )
        self.assertIn(("derived:composure", "add", "rank:zap", "conditional", "if they do"), [g[:5] for g in got])
        got = fx(
            "A zapper may add their ranks in Zap to their dice pool on a Judge Intentions test—if they do, they replace one die with a Wild Die."
        )
        self.assertEqual(
            [(g[0], g[1], g[2]) for g in got],
            [("derived:judge-intentions", "add", "rank:zap"), ("derived:judge-intentions", "wild-die", "1")],
        )  # (no wild die on Con)

    def test_examples_of_a_known_activity_are_no_tests_or_conditions_but_examples_that_name_the_tests_stay(self):
        got = fx(
            "You receive one bonus die on tests involving balance, such as scaling, crossing a plank, landing after a jump.",
            "augmentations",
        )
        self.assertEqual(got, [("skill:athletics", "add", "1", None, None, "Balance")])
        got = fx(
            "While in use, lenses give bonus Edge to jobs involving very fine detail work such as surgery, repairing circuitry.",
            "augmentations",
        )
        self.assertEqual(
            [(g[0], g[4]) for g in got], [("skill:biotech", "surgery"), ("skill:engineering", "repairing")]
        )

    def test_a_threshold_the_entry_sets_and_an_edge_boost_cost_for_a_test(self):
        got = fx(
            "Users with these eyes reduce the threshold for Surprise tests to 2. If they wear no helmet, Edge boosts cost 1 less on Surprise tests.",
            "augmentations",
        )
        self.assertEqual(
            [(g[0], g[1], g[2], g[3]) for g in got],
            [("test:surprise", "threshold-set", "2", None), ("test:surprise", "edge-cost", "-1", "conditional")],
        )

    def test_two_entries_differing_by_external_and_internal_read_their_own_sentences(self):
        text = "An external zapper adds a point of Edge to every Perception test. An internal zapper adds a +1 dice pool bonus to Perception tests.\n**Wireless bonus:** +1 Minor Action."
        files = {
            "gear.xml": file("gear", "gear", [("ze", "", "Zap Cam External", ""), ("zi", "", "Zap Cam Internal", "")])
        }
        texts = f'<sr6:data kind="texts">\n  <text of="gear" id="ze">{text}</text>\n  <text of="gear" id="zi">{text}</text>\n</sr6:data>\n'
        out = effects.apply(files, texts)[0]["gear.xml"]
        ln = lambda i: next(x for x in out.splitlines() if f'id="{i}"' in x)  # noqa: E731
        self.assertIn('op="edge"', ln("ze"))
        self.assertNotIn('op="add" value="1" switch="conditional"', ln("ze"))
        self.assertIn('switch="wireless"', ln("ze"))  # (the wireless line stays whole)
        self.assertIn('target="skill:perception" op="add"', ln("zi"))
        self.assertNotIn('op="edge"', ln("zi"))


class SectionDEFTest(unittest.TestCase):
    def test_a_band_stated_for_one_range_is_that_band_and_only_is_no_condition(self):
        got = fx("**+2 AR at Close range only.", "ammotypes")
        self.assertEqual(got, [("item:ar", "add", "2,0,0,0,0", None, None, None)])

    def test_the_current_printings_base_damage_value_of_the_unarmed_attack(self):
        got = fx("Zap skin gives 1 level of natural Armor. Unarmed attacks have a base damage value of [(STR/2) + 1]P.")
        self.assertEqual(
            [(g[0], g[1], g[2]) for g in got],
            [
                ("derived:defense", "add", "1"),
                ("derived:unarmed-damage", "set", "P"),
                ("derived:unarmed-dv", "set", "str/2+1"),
            ],
        )  # (a formula: shown, never applied)

    def test_a_metamagic_that_raises_the_natural_weapon_raises_the_unarmed_attack(self):
        got = fx(
            "Add +1 to your natural weapon's Attack Rating per level, and +1 to its damage value for every two levels (round up).",
            "metamagics",
        )
        self.assertEqual([(g[0], g[2]) for g in got], [("derived:unarmed-ar", "R"), ("derived:unarmed-dv", "R/2 RU")])

    def test_a_modifier_to_tests_involving_a_physical_attribute_is_the_physical_tests(self):
        got = fx(
            "When exposed to zap gas, a character gets a -2 dice pool modifier on any test involving a physical attribute."
        )
        self.assertEqual([(g[0], g[2], g[3]) for g in got], [("test:physical", "-2", "conditional")])

    def test_gaining_access_to_a_network_is_a_cracking_test(self):
        got = fx("Zap Edge Boosts cost 1 less on any test to gain access to a network or device.", "mentorspirits")
        self.assertEqual([(g[0], g[1], g[2]) for g in got], [("skill:cracking", "edge-cost", "-1")])

    def test_ammunition_that_uses_the_wild_die_gives_it_to_the_shots_fired(self):
        self.assertEqual(
            [g[:3] for g in fx("**Note:** Zap rounds use the wild die.", "ammotypes")],
            [("skill:firearms", "wild-die", "1")],
        )

    def test_touch_based_perception_is_the_tactile_specialization(self):
        got = fx("Characters gain 1 point of situational Edge for any touchbased Perception tests.", "augmentations")
        self.assertEqual([(g[0], g[5]) for g in got], [("skill:perception", "Tactile")])

    def test_an_implanted_version_of_an_enhancement_works_as_it_but_a_differing_power_does_not(self):
        got = effects.links("An implanted version of the flare compensation enhancement (p. 275).", "augmentations")
        self.assertEqual([(a["rel"], a["name"].casefold()) for _, a, _ in got], [("as", "flare compensation")])
        self.assertEqual(
            effects.links(
                "This power works in the same way as Armor, except that it protects on the astral plane only.",
                "critterpowers",
            ),
            [],
        )

    def test_a_step_that_is_the_same_as_a_quality_of_its_own_name_reads_that_rule(self):
        files = {
            "qualities.xml": file("qualities", "quality", [("zq", ' kind="positive"', "Zap Step", "")]),
            "rules.xml": file("rules", "rule", [("zr", ' chapter="C" level="4"', "Zap Step", "")]),
        }
        texts = (
            '<sr6:data kind="texts">\n  <text of="qualities" id="zq">This is the same as the Zap Step quality in the path above.</text>\n'
            '  <text of="rules" id="zr">If the decker makes an attack test, they get one bonus Edge point to use on Cracking tests.</text>\n</sr6:data>\n'
        )
        out = effects.apply(files, texts)[0]["qualities.xml"]
        self.assertIn('target="skill:cracking" op="edge"', out)

    def test_each_severity_line_has_its_own_modifier(self):
        t = (
            "**Mild:** You get a -2 dice pool modifier on any test involving a Physical attribute while the zap affects you.\n"
            "**Severe:** You get a -4 dice pool modifier on any test involving a Physical attribute while the zap affects you."
        )
        got = [(g[0], g[2], g[4]) for g in fx(t)]
        self.assertEqual(
            got,
            [
                ("test:physical", "-2", "mild: while the zap affects you"),
                ("test:physical", "-4", "severe: while the zap affects you"),
            ],
        )


class ReviewFixesTest(unittest.TestCase):
    """The consensus review of batch 3 (2026-10-17), invented sentences."""

    def test_a_band_is_the_numbers_own_clause_and_may_run_on_or_back(self):
        self.assertEqual(fx("Zap ammo gives +2 AR at Medium range and beyond.", "ammotypes")[0][2], "0,0,2,2,2")
        self.assertEqual(fx("Zap ammo gives +2 AR at Near range or closer.", "ammotypes")[0][2], "2,2,0,0,0")
        got = [g[:3] for g in fx("This gives +2 AR at Close range only and +1 DV.", "ammotypes")]
        self.assertEqual(
            got, [("item:ar", "add", "2,0,0,0,0"), ("item:dv", "add", "1")]
        )  # (the +1 is not the Close band's)

    def test_examples_stop_before_the_next_bonus(self):
        got = fx(
            "You receive one bonus die on tests involving balance, such as scaling, and +2 to Stealth tests.",
            "augmentations",
        )
        self.assertIn(("skill:stealth", "add", "2", None, None, None), got)
        self.assertNotIn("scaling", " ".join(str(g) for g in got))

    def test_an_implanted_version_works_as_the_gear_enhancement_by_its_whole_name(self):
        got = effects.links(
            "An implanted version of the thermographic vision enhancement (p. 275), with more words after.",
            "augmentations",
        )
        self.assertEqual([(a["name"].casefold(), a["kind"]) for _, a, _ in got], [("thermographic vision", "gear")])

    def test_ranks_added_to_a_named_dice_pool_and_for_a_two_word_skill(self):
        self.assertEqual(
            [g[:3] for g in fx("A zapper may add their ranks in Zap to a Composure dice pool.")],
            [("derived:composure", "add", "rank:zap")],
        )
        self.assertEqual(
            [
                g[2]
                for g in fx("A zapper may add their ranks in Exotic Weapons to their dice pool on a Composure test.")
            ],
            ["rank:exotic-weapons"],
        )

    def test_the_internal_entry_that_does_the_same_keeps_the_sentence_it_repeats(self):
        text = "An external zapper adds +2 dice to Perception tests. An internal zapper does the same and also adds +1 dice to Stealth tests."
        files = {
            "gear.xml": file("gear", "gear", [("ze", "", "Zap Cam External", ""), ("zi", "", "Zap Cam Internal", "")])
        }
        texts = f'<sr6:data kind="texts">\n  <text of="gear" id="ze">{text}</text>\n  <text of="gear" id="zi">{text}</text>\n</sr6:data>\n'
        out = effects.apply(files, texts)[0]["gear.xml"]
        ln = lambda i: next(x for x in out.splitlines() if f'id="{i}"' in x)  # noqa: E731
        self.assertIn('target="skill:perception" op="add" value="2"', ln("zi"))
        self.assertIn('target="skill:stealth"', ln("zi"))
        self.assertIn('target="skill:perception" op="add" value="2"', ln("ze"))
        self.assertNotIn('target="skill:stealth"', ln("ze"))

    def test_a_sentence_about_the_intuition_a_cyberware_adds_in_vr_is_no_second_bonus(self):
        self.assertEqual(
            fx(
                "Each rating of this cyberware adds to the user's Intuition, but only while in a VR Matrix User mode.",
                "augmentations",
            ),
            [],
        )


class OverrideRowsTest(unittest.TestCase):
    DIR = overrides.DIR

    def rows(self):
        return [
            (f.stem, r)
            for f in sorted(self.DIR.glob("*.json"))
            for r in json.loads(f.read_text(encoding="utf8"))
            if r.get("gen") == "cl6"
        ]

    def test_every_commlink6_row_passes_the_check_and_says_why_in_one_line(self):
        for book, r in self.rows():
            overrides.check([r])
            self.assertTrue(r["why"].strip() and "\n" not in r["why"], (book, r["id"]))
            self.assertTrue(all(a.get("target") and a.get("op") for a in r["effects"]), (book, r["id"]))

    def test_the_defense_pool_splits_are_one_effect_per_pool(self):
        got = {(b, r["id"]): [(a["target"], a["op"]) for a in r["effects"]] for b, r in self.rows()}
        pools = ["test:defense-spell-direct", "test:defense-spell-indirect", "test:defense-astral"]
        self.assertEqual(got["bs", "awareness-tactical"], [(t, "add") for t in pools])
        self.assertEqual(got["bs", "cognitive-shield"], [(t, "add") for t in pools])
        self.assertEqual(got["crb", "magic-resistance"], [(t, "edge") for t in pools])
        self.assertEqual(got["crb", "combat-sense"], [("test:defense-spell-indirect", "add")])
        self.assertEqual(got["swc", "blubber"], [("test:defense", "edge"), ("test:defense-spell-indirect", "edge")])
        self.assertEqual(got["swc", "dragon"], [("test:defense", "edge"), ("test:defense-spell-indirect", "edge")])

    def test_no_row_writes_a_commlink6_placeholder(self):
        for book, r in self.rows():
            for a in r["effects"]:
                self.assertNotIn(a["value"].strip(), ("0", "-98", "-99", ""), (book, r["id"], a))

    def test_the_cyberjack_levels_give_the_rating_in_matrix_initiative_dice_in_place_of_the_score(self):
        rows = {r["id"]: r for b, r in self.rows() if b == "crb" and r["id"].startswith("cyberjack-rating-")}
        self.assertEqual(sorted(rows), [f"cyberjack-rating-{n}" for n in range(1, 7)])
        for n, dice in zip(range(1, 7), (1, 1, 1, 2, 2, 3)):  # (Commlink6's table: the dice by rating)
            a = rows[f"cyberjack-rating-{n}"]["effects"][0]
            self.assertEqual(
                (a["target"], a["op"], a["value"], a["replaces"]),
                ("derived:matrix-initiative-dice", "add", str(dice), "derived:matrix-initiative"),
            )
        from importer.sr6 import NS

        gear = file(
            "augmentations",
            "augmentation",
            [
                (
                    "cyberjack-rating-2",
                    "",
                    "Zap Jack 2",
                    '<effect target="derived:matrix-initiative" op="add" value="1"/>',
                )
            ],
        )
        files = {"augmentations.xml": gear.replace("<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1)}
        row = {**rows["cyberjack-rating-2"], "id": "cyberjack-rating-2"}
        out = overrides.apply("x", files, [row])["augmentations.xml"]
        self.assertNotIn('derived:matrix-initiative"', out)
        self.assertIn('target="derived:matrix-initiative-dice" op="add" value="1"', out)

    def test_the_frag_warheads_multiplier_is_a_shown_value(self):
        row = next(r for b, r in self.rows() if b == "da" and r["id"] == "frag")
        self.assertEqual([(a["target"], a["op"], a["value"]) for a in row["effects"]], [("item:dv", "set", "x0.75")])

    def test_the_laser_sight_the_book_prints_without_a_heading_is_added_with_the_ranges_it_works_at(self):
        from importer.sr6 import NS

        table = json.loads((self.DIR / "fs.json").read_text(encoding="utf8"))
        add = next(r for r in table if r.get("add", {}).get("id") == "laser-sight-standard")
        eff = next(r for r in table if r.get("id") == "laser-sight-standard" and r.get("gen") == "cl6")
        self.assertEqual(eff["effects"], [{"target": "item:ar", "op": "add", "value": "1,1,1,0,0"}])
        base = file("weapons", "weapon", [("lp", "", "Laser Sight, Low Power", "")]).replace(
            "<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1
        )
        out = overrides.apply("fs", {"weapons.xml": base}, [add, eff])["weapons.xml"]
        self.assertIn('id="laser-sight-standard"', out)
        self.assertIn('target="item:ar" op="add" value="1,1,1,0,0" gen="cl6"', out)

    def test_a_row_may_replace_the_effect_of_another_target(self):
        from importer.sr6 import NS

        gear = file(
            "gear",
            "gear",
            [
                (
                    "zg",
                    "",
                    "Zap Gear",
                    '<effect target="test:other" op="edge" value="1" switch="conditional" when="if it is dark"/>',
                )
            ],
        )
        files = {"gear.xml": gear.replace("<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1)}
        row = {
            "cl6": "Zap Gear",
            "kind": "gear",
            "id": "zg",
            "gen": "cl6",
            "why": "the book names no test; Commlink6 names Perception",
            "effects": [
                {
                    "target": "skill:perception",
                    "op": "edge",
                    "value": "1",
                    "replaces": "test:other",
                    "switch": "conditional",
                    "when": "if it is dark",
                }
            ],
        }
        out = overrides.apply("x", files, [row])["gear.xml"]
        self.assertNotIn("test:other", out)
        self.assertIn(
            'target="skill:perception" op="edge" value="1" switch="conditional" when="if it is dark" gen="cl6"', out
        )
        self.assertNotIn("replaces", out)
        again = overrides.apply("x", {"gear.xml": out}, [row])["gear.xml"]
        self.assertEqual(again.count('target="skill:perception"'), 1)  # (applied twice: still one)
        gone = overrides.apply("x", {"gear.xml": files["gear.xml"].replace("test:other", "test:social")}, [row])[
            "gear.xml"
        ]
        self.assertEqual(
            gone.count('target="skill:perception"'), 1
        )  # (the replaced target absent: the effect is added once)
        self.assertIn("test:social", gone)

    def test_a_row_with_an_unknown_operation_or_a_bad_replaces_is_refused(self):
        row = {
            "cl6": "Zap",
            "kind": "gear",
            "id": "zg",
            "gen": "cl6",
            "why": "x",
            "effects": [{"target": "test:other", "op": "edge", "value": "1"}],
        }
        overrides.check([row])
        for bad in ({"op": "boost"}, {"replaces": "any thing"}, {"replaces": 3}):
            with self.assertRaises(ValueError):
                overrides.check([{**row, "effects": [{**row["effects"][0], **bad}]}])

    def test_the_magic_resistance_edge_is_on_the_pools_and_no_longer_on_the_one_test(self):
        rows = {r["id"]: r for b, r in self.rows() if b == "crb" and r["kind"] == "qualities"}
        self.assertEqual(rows["magic-resistance"]["effects"][0].get("replaces"), "test:magic-resistance")
        self.assertNotIn(
            ("sw", "countermagic"), [(b, r["id"]) for b, r in self.rows()]
        )  # (the book's die per level stands alone)
        self.assertNotIn(("crb", "sustaining"), [(b, r["id"]) for b, r in self.rows()])


if __name__ == "__main__":
    unittest.main()
