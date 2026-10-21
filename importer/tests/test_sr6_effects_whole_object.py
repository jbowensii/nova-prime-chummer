"""SR6 effects reader (importer/sr6/effects.py), the whole object (owner direction 2026-10-17): an entry's effects from
its own block, the links it holds (copy_links), the rules its section or variant states, and the pools the book names
apart. Every sentence and name is invented, in the books' structure."""

import unittest

from importer.sr6 import effects

# pylint: disable=protected-access


def attrs(text, kind=None):
    """The effect attributes read from `text`."""
    return [a for t, a, _ in effects.read(text, kind) if t == "effect"]


def file(kind, tag, rows):
    """A catalog file, one entry a line; rows: (id, attrs, name, kids)."""
    return (
        f'<sr6:data kind="{kind}">\n'
        + "".join(f'  <{tag} id="{i}" source="X" page="1"{a}><name>{n}</name>{k}</{tag}>\n' for i, a, n, k in rows)
        + "</sr6:data>\n"
    )


def line(xml, eid):
    """The line of `xml` holding entry `eid`."""
    return next(x for x in xml.splitlines() if f'id="{eid}"' in x)


FX = '<effect target="skill:athletics" op="add" value="2"/>'


class SiblingWordsTest(unittest.TestCase):
    def test_a_sentence_opening_with_another_categorys_variant_word_is_not_cut(self):
        # (`Symbiont (Gain)` of another category must not cut `Gain a +1 …` from a description it has nothing to do
        # with)
        files = {
            "augmentations.xml": file(
                "augmentations",
                "augmentation",
                [
                    ("tac", ' category="Senses"', "Zap Sense (Tactical)", ""),
                    ("sym", ' category="Symbiont"', "Zap Symbiont (Gain)", ""),
                ],
            )
        }
        texts = (
            '<sr6:data kind="texts">\n  <text of="augmentations" id="tac">**Tactical:** Gain a +1 dice pool bonus per '
            "rating on any defensive tests.</text>\n</sr6:data>\n"
        )
        out, _ = effects.apply(files, texts)
        self.assertIn('target="test:defense"', line(out["augmentations.xml"], "tac"))


class BlockProseTest(unittest.TestCase):
    REGROUPED = (
        '<!-- item {"name": "Zap Mentor", "chapter": "MAGIC", "section": "Mentors"} -->\n'
        "**All:** Edge Boosts cost 1 less for Climbing tests\n"
        "**Magician:** Edge Boosts cost 1 less for Detection spells\n"
        "**Similar Archetypes:** Alpha, Beta\n\n"
        "A made-up spirit of tall places, who dislikes ground-level thinking and says so loudly.\n"
        "**Disadvantages:**\nYou lose Edge boosts whenever the Zap Mentor is insulted.\n<!-- end -->\n"
    )

    def test_an_entry_with_no_description_reads_its_blocks_prose_up_to_similar_archetypes(self):
        files = {"mentorspirits.xml": file("mentorspirits", "mentorspirit", [("zm", "", "Zap Mentor", "")])}
        out, _ = effects.apply(files, "", self.REGROUPED)
        x = line(out["mentorspirits.xml"], "zm")
        self.assertIn('target="skill:athletics" op="edge-cost" value="-1"', x)
        self.assertIn('when="magician"', x)  # (the role label holds on its own line)
        self.assertNotIn("insulted", x)

    def test_a_label_cut_short_by_the_heading_is_dropped_for_its_whole_printing(self):
        t = effects._block_text(
            "**Disadvantage:** Cannot gain or spend Edge for\n\nA made-up paragraph of flavor.\n**Disadvantage:** "
            "Cannot gain or spend Edge for\nSnoop actions. More words follow here."
        )
        self.assertEqual(t.count("**Disadvantage:**"), 1)
        self.assertIn("Edge for Snoop actions.", t)

    def test_a_variant_row_still_reads_its_parents_prose_on_one_line(self):
        _, _, prose = effects._sections(
            '<!-- item {"name": "Zap Thing", "section": "S"} -->\nfirst line of a made-\nup para\nsecond\n<!-- end '
            "-->\n"
        )
        self.assertEqual(
            " ".join(prose["zap thing"].split()).replace("made- up", "madeup"), "first line of a madeup para second"
        )


class OverrideAddedEntriesTest(unittest.TestCase):
    def test_only_the_named_entries_are_read(self):
        files = {"gear.xml": file("gear", "gear", [("a", "", "Alpha", ""), ("b", "", "Beta", "")])}
        texts = (
            '<sr6:data kind="texts">\n  <text of="gear" id="a">+2 dice on Climbing tests.</text>\n  <text of="gear" '
            'id="b">+2 dice on Climbing tests.</text>\n</sr6:data>\n'
        )
        out, _ = effects.apply(files, texts, only={("gear", "b")})
        self.assertNotIn("<effect", line(out["gear.xml"], "a"))
        self.assertIn('target="skill:athletics"', line(out["gear.xml"], "b"))

    def test_an_entry_closing_the_root_on_its_own_line_is_read_and_keeps_the_root(self):
        files = {
            "gear.xml": '<sr6:data kind="gear">\n  <gear id="a" source="X" '
            'page="1"><name>Alpha</name></gear></sr6:data>'
        }
        texts = '<sr6:data kind="texts">\n  <text of="gear" id="a">+2 dice on Climbing tests.</text>\n</sr6:data>\n'
        out, _ = effects.apply(files, texts)
        self.assertTrue(out["gear.xml"].rstrip().endswith("</gear></sr6:data>"))
        self.assertIn('target="skill:athletics"', out["gear.xml"])

    def test_a_rigger_program_reads_the_rigger_blocks_line_not_the_decks(self):
        files = {
            "programs.xml": file(
                "programs",
                "program",
                [("e", ' type="rigger program"', "Zapcrypt", '<prerequisite kind="valuereq" value="RCC"/>')],
            )
        }
        regrouped = (
            '<!-- item {"name": "Basic", "section": "S"} -->\n**Zapcrypt:** +2 dice on Climbing tests.\n<!-- end -->\n'
            '<!-- item {"name": "Rigger Programs", "section": "S"} -->\n**Zapcrypt:** +1 to Firewall.\n<!-- end -->\n'
        )
        out, _ = effects.apply(files, "", regrouped)
        self.assertIn('target="matrix:firewall" op="add" value="1"', line(out["programs.xml"], "e"))


class LinkWordsTest(unittest.TestCase):
    def test_a_text_that_only_points_to_another_entry_works_as_it(self):
        got = effects.see_links("Zapper Cost: 8 Karma See Magic Zap, p. 72, SR6", "qualities", "Zapper")
        self.assertEqual(got[0][1], {"rel": "as", "name": "Magic Zap", "kind": "qualities", "book": "crb"})
        self.assertEqual(
            effects.see_links("Zapper Bonus: 8 Karma per level See p. 76, SR6.", "qualities", "Zapper (Odd)")[0][1][
                "name"
            ],
            "Zapper",
        )
        self.assertEqual(
            effects.see_links(
                "Cost: 7 Karma. See Combat, p. 9 and a good many more words about something else.", "qualities", "X"
            ),
            [],
        )

    def test_phrases_that_name_an_entry_the_text_works_as(self):
        def names(t):
            return [a["name"] for _, a, _ in effects.links(t, "qualities")]

        self.assertEqual(names("This is the same as the Zap Hum quality in the path above."), ["Zap Hum"])
        self.assertEqual(
            names("It functions exactly like the Zap Hum quality (p. 72, SR6), with a twist."), ["Zap Hum"]
        )
        self.assertEqual(
            names("Characters with the Zap quality also have the Zap Gut benefits (see above)."), ["Zap Gut"]
        )

    def test_standard_addons_and_tires(self):
        self.assertEqual(
            [
                a["name"]
                for _, a, _ in effects.addon_links(
                    "It can function as a laser sight or as a smartgun system.", "weapons"
                )
            ],
            ["Laser sight", "Smartgun system"],
        )
        t = (
            "It can function like an off-road tire (with the same modifiers), and also just like a racing tire (again "
            "with the same modifiers)."
        )
        self.assertEqual([a["name"] for _, a, _ in effects.tire_links(t, "gear")], ["Off-Road Tires", "Racing Tires"])
        self.assertEqual(
            [
                a["name"]
                for _, a, _ in effects.tire_links(
                    "Works in exactly the same way as the zap suspension (static) system.", "gear"
                )
            ],
            ["Zap Suspension (Static)"],
        )


class CopyLinksTest(unittest.TestCase):
    def srcs(self):
        """The catalog files of the test's sources, as {source: {file name: xml}}."""
        return {
            "a": {
                "qualities.xml": file(
                    "qualities",
                    "quality",
                    [
                        ("a.base", "", "Zap Base", FX + '<effect target="attr:str" op="add" value="R"/>'),
                        (
                            "a.mine",
                            "",
                            "Zap Mine",
                            '<effect target="skill:athletics" op="add" value="1"/><link rel="grants" name="Zap Base" '
                            'kind="qualities" ref="a.base" when="adept"/>',
                        ),
                        ("a.cross", "", "Zap Cross", '<link rel="as" name="Far Zap" kind="qualities"/>'),
                    ],
                )
            },
            "b": {
                "qualities.xml": file(
                    "qualities", "quality", [("b.far", "", "Far Zap", '<effect target="attr:agi" op="add" value="1"/>')]
                )
            },
        }

    def test_a_link_copies_the_linked_effects_unless_the_entry_has_its_own_for_the_target(self):
        got = effects.copy_links(self.srcs())
        x = line(got[("a", "qualities.xml")], "a.mine")
        self.assertIn('<link rel="grants" name="Zap Base" kind="qualities" ref="a.base" when="adept" copied="yes"/>', x)
        self.assertIn('<effect target="skill:athletics" op="add" value="1"/>', x)  # (its own stays)
        self.assertNotIn('value="2"', x)  # (the linked entry's for the same target: not copied)
        self.assertIn(
            '<effect target="attr:str" op="add" value="1" when="adept" switch="conditional" from="a.base"/>', x
        )  # (R at level 1; the link's condition)

    def test_a_link_to_another_book_is_found_by_name_and_kind(self):
        got = effects.copy_links(self.srcs())
        self.assertIn(
            '<effect target="attr:agi" op="add" value="1" from="b.far"/>', line(got[("a", "qualities.xml")], "a.cross")
        )
        self.assertNotIn(("b", "qualities.xml"), got)

    def test_run_again_it_starts_from_the_entries_own_effects(self):
        once = effects.copy_links(self.srcs())
        again = effects.copy_links(
            {s: {f: once.get((s, f), x) for f, x in fs.items()} for s, fs in self.srcs().items()}
        )
        self.assertEqual(again.get(("a", "qualities.xml")), None)  # (nothing changes: the same copies)

    def test_a_granted_level_counts_per_rating_at_that_level(self):
        self.assertEqual(
            [effects._at_level(v, 2) for v in ("R", "-R", "R*4", "2*R", "R-1", "R[1,1,3]", "5", "edg/2")],
            ["2", "-2", "8", "4", "1", "1", "5", "edg/2"],
        )
        self.assertEqual(effects._at_level("R[1,1,3]", 9), "3")
        s = self.srcs()
        s["a"]["qualities.xml"] = file(
            "qualities",
            "quality",
            [
                ("a.base", "", "Zap Base", '<effect target="attr:str" op="add" value="R*2"/>'),
                (
                    "a.mine",
                    "",
                    "Zap Mine",
                    '<link rel="grants" name="Zap Base" kind="qualities" ref="a.base" level="3"/>',
                ),
            ],
        )
        self.assertIn('value="6" from="a.base"', line(effects.copy_links(s)[("a", "qualities.xml")], "a.mine"))

    def test_two_links_giving_the_same_road_pair_give_the_better_of_each_side(self):
        s = {
            "a": {
                "gear.xml": file(
                    "gear",
                    "gear",
                    [
                        (
                            "a.off",
                            "",
                            "Zap Off-Road Tires",
                            '<effect target="item:acceleration" op="add" value="-5/5"/>',
                        ),
                        (
                            "a.race",
                            "",
                            "Zap Racing Tires",
                            '<effect target="item:acceleration" op="add" value="5/-5"/>',
                        ),
                        (
                            "a.smart",
                            "",
                            "Zap Smart Tires",
                            '<link rel="as" name="Zap Off-Road Tires" kind="gear"/><link rel="as" name="Zap Racing '
                            'Tires" kind="gear"/>',
                        ),
                    ],
                )
            }
        }
        self.assertIn(
            '<effect target="item:acceleration" op="add" value="5/5" from="a.off"/>',
            line(effects.copy_links(s)[("a", "gear.xml")], "a.smart"),
        )

    def test_a_class_rule_goes_to_the_same_class_in_another_book_unless_it_has_its_own(self):
        rule = '<effect target="limb-attr:agi" op="set" value="2" rule="Zap Limbs"/>'
        cls = ' class="CYBERWARE/CYBER_LIMBS"'
        s = {
            "a": {"augmentations.xml": file("augmentations", "augmentation", [("a.arm", cls, "Zap Arm", rule)])},
            "b": {
                "augmentations.xml": file(
                    "augmentations",
                    "augmentation",
                    [
                        ("b.arm", cls, "Zap Extra Arm", ""),
                        ("b.own", cls, "Zap Own Arm", '<effect target="limb-attr:agi" op="set" value="3"/>'),
                        ("b.hand", cls, "Zap Hand (synthetic)", ""),
                        ("b.talk", cls, "Zap Talking Arm", ""),
                        ("b.other", ' class="OTHER/THING"', "Zap Gear", ""),
                    ],
                )
            },
        }
        texts = {"b": {("augmentations", "b.talk"): "Its attributes are printed here, three apiece."}}
        got = effects.copy_links(s, texts)[("b", "augmentations.xml")]
        self.assertIn(
            '<effect target="limb-attr:agi" op="set" value="2" from="a:Zap Limbs"/>', line(got, "b.arm")
        )  # (from names the rule)
        self.assertNotIn('value="2"', line(got, "b.own"))
        self.assertNotIn("<effect", line(got, "b.hand"))  # (a partial limb gets no box)
        self.assertNotIn("<effect", line(got, "b.talk"))  # (its text speaks of its attributes)
        self.assertNotIn("<effect", line(got, "b.other"))  # (not a class the rules are verified for)

    def test_a_link_to_the_same_name_in_another_kind_takes_the_entry_of_its_own_kind_first(self):
        s = {
            "a": {
                "critterpowers.xml": file(
                    "critterpowers",
                    "critterpower",
                    [
                        ("a.zap", "", "Zap", '<effect target="derived:defense" op="add" value="R"/>'),
                        ("a.mystic", "", "Zap Mystic", '<link rel="as" name="Zap" kind="critterpowers"/>'),
                    ],
                ),
                "programs.xml": file(
                    "programs",
                    "program",
                    [("a.prog", "", "Zap", '<effect target="derived:matrix-defense" op="add" value="2"/>')],
                ),
            }
        }
        x = line(effects.copy_links(s)[("a", "critterpowers.xml")], "a.mystic")
        self.assertIn('target="derived:defense"', x)
        self.assertNotIn("matrix-defense", x)
        k = {"rel": "as", "name": "Zap"}
        s["a"]["critterpowers.xml"] = file(
            "critterpowers", "critterpower", [("a.mystic", "", "Zap Mystic", effects._tag("link", k))]
        )
        s["a"]["programs.xml"] = file(
            "programs",
            "program",
            [("a.prog", "", "Zap", '<effect target="derived:matrix-defense" op="add" value="2"/>')],
        )
        self.assertIn(
            "matrix-defense", line(effects.copy_links(s)[("a", "critterpowers.xml")], "a.mystic")
        )  # (no better entry: the one there is)

    def test_a_granted_level_that_cannot_be_given_leaves_the_link_unmarked_and_copies_nothing(self):
        s = {
            "a": {
                "qualities.xml": file(
                    "qualities",
                    "quality",
                    [
                        (
                            "a.base",
                            "",
                            "Zap Base",
                            '<effect target="attr:str" op="add" value="R"/><effect target="attr:agi" op="add" '
                            'value="R^2"/>',
                        ),
                        (
                            "a.mine",
                            "",
                            "Zap Mine",
                            '<link rel="grants" name="Zap Base" kind="qualities" ref="a.base" level="2"/>',
                        ),
                    ],
                )
            }
        }
        self.assertNotIn(("a", "qualities.xml"), effects.copy_links(s))

    def test_levels_in_the_forms_the_app_reads_and_each_side_of_a_pair(self):
        got = {v: effects._at_level(v, 3) for v in ("R/-R", "2*R", "R*2-2", "-R", "R-1", "5/-5", "bod/2 RU", "R^2")}
        self.assertEqual(
            got,
            {
                "R/-R": "3/-3",
                "2*R": "6",
                "R*2-2": "4",
                "-R": "-3",
                "R-1": "2",
                "5/-5": "5/-5",
                "bod/2 RU": "bod/2 RU",
                "R^2": None,
            },
        )

    def test_a_copied_effect_through_a_link_carries_no_class_rule_and_the_tag_always_double_quotes(self):
        s = {
            "a": {
                "qualities.xml": file(
                    "qualities",
                    "quality",
                    [
                        (
                            "a.base",
                            "",
                            "Zap Base",
                            '<effect target="attr:str" op="add" value="1" when="say &quot;hi&quot;" rule="Zap Limbs"/>',
                        ),
                        ("a.mine", "", "Zap Mine", '<link rel="as" name="Zap Base" kind="qualities"/>'),
                    ],
                )
            }
        }
        once = effects.copy_links(s)
        x = line(once[("a", "qualities.xml")], "a.mine")
        self.assertIn('when="say &quot;hi&quot;" from="a.base"/>', x)
        self.assertNotIn("rule=", x)
        s["a"]["qualities.xml"] = once[("a", "qualities.xml")]
        self.assertNotIn(("a", "qualities.xml"), effects.copy_links(s))  # (a second pass keeps the quoted words)


class SectionAndVariantRulesTest(unittest.TestCase):
    def test_basic_limbs_rule_is_the_limbs_own_attributes_and_a_class_rule(self):
        files = {
            "augmentations.xml": file("augmentations", "augmentation", [("zl", ' type="cyberware"', "Zap Limb", "")])
        }
        regrouped = (
            '<!-- section {"name": "Cyberlimbs", "section": "Cyberlimbs"} -->\nBasic limbs are installed with all '
            "Physical attributes at 2. "
            "Each cyberlimb adds one box to the character's Physical Condition Monitor.\n<!-- end -->\n"
            '<!-- item {"name": "Zap Limb", "section": "Cyberlimbs"} -->\n<!-- end -->\n'
        )
        x = line(effects.apply(files, "", regrouped)[0]["augmentations.xml"], "zl")
        for a in ("bod", "agi", "rea", "str"):
            self.assertIn(f'<effect target="limb-attr:{a}" op="set" value="2" rule="Cyberlimbs"/>', x)
        self.assertIn('<effect target="derived:physical-monitor" op="add" value="1" rule="Cyberlimbs"/>', x)

    def test_a_variants_table_row_and_the_sections_sentence_about_it(self):
        files = {
            "weapons.xml": file(
                "weapons",
                "weapon",
                [("zr", ' class="ROCKETS"', "Zap Rocket", '<variant name="Base"/><variant name="Missile"/>')],
            )
        }
        regrouped = (
            '<!-- section {"name": "Rockets and Missiles", "section": "Rockets and Missiles"} -->\n'
            "Missiles are rockets that carry guidance, with sensor packages adding their rating to the attack roll "
            "(also reflected in their Attack Rating).\n<!-- end -->\n"
            '<!-- item {"name": "Zap Rocket", "section": "Rockets and Missiles"} -->\n<!-- end -->\n'
            '<!-- item {"name": "Missile Variant", "section": "Rockets and Missiles"} -->\n| WEAPON | NOTES |\n|---|'
            "---|\n| Missile Variant | +2 to Attack Rating |\n<!-- end -->\n"
        )
        x = line(effects.apply(files, "", regrouped)[0]["weapons.xml"], "zr")
        self.assertIn(
            'target="item:ar" op="add" value="2" switch="conditional" when="Missile" rule="Missile variant"', x
        )
        self.assertIn(
            'target="test:combat" op="add" value="R" switch="conditional" when="Missile" rule="Missile variant"', x
        )
        self.assertNotIn('target="item:ar" op="add" value="R"', x)  # (the parenthesis only says the number again)


class WeakDomainsTest(unittest.TestCase):
    def test_defense_pools_the_book_names(self):
        self.assertEqual(
            attrs("Gain +2 dice on defense tests against astral attacks.")[0]["target"], "test:defense-astral"
        )
        self.assertEqual(
            [a["target"] for a in attrs("Gain +2 dice on defense tests against astral attacks.")],
            ["test:defense-astral"],
        )
        self.assertEqual(
            [a["target"] for a in attrs("You gain +1 die on defense tests against direct combat spells.")],
            ["test:defense-spell-direct"],
        )
        self.assertEqual(
            [a["target"] for a in attrs("You gain +1 die to defend against indirect combat spells.")],
            ["test:defense-spell-indirect"],
        )
        self.assertEqual(
            [a["target"] for a in attrs("Gain a +1 dice pool bonus per rating on any defensive tests.")],
            ["test:defense"],
        )

    def test_matrix_defense_rating_and_a_programs_defense_rating(self):
        self.assertEqual(attrs("+1 to your Matrix Defense Rating.")[0]["target"], "derived:matrix-defense")
        files = {"programs.xml": file("programs", "program", [("zp", ' type="hacking"', "Zap Shield", "")])}
        texts = '<sr6:data kind="texts">\n  <text of="programs" id="zp">+2 to Defense Rating.</text>\n</sr6:data>\n'
        self.assertIn(
            'target="derived:matrix-defense" op="add" value="2"',
            line(effects.apply(files, texts)[0]["programs.xml"], "zp"),
        )

    def test_an_adept_power_also_active_on_the_astral_plane_has_the_astral_defense_rating_too(self):
        got = {
            a["target"]
            for a in attrs(
                "Gain 1 point of Armor for each level, which also increases your Defense Rating. Zap Armor is also "
                "active on the astral plane."
            )
        }
        self.assertEqual(got, {"derived:defense", "derived:defense-astral"})

    def test_tires_that_give_on_the_road_and_take_off_it_are_the_on_off_pair(self):
        off = (
            "Fitted for dirt, a zap tire adds +4 Acceleration and +8 Speed Interval off-road. On pavement the same "
            "figures turn into penalties (–4 Acceleration, –8 Speed Interval)."
        )
        self.assertEqual(effects._road_pairs(off), {"acceleration": "-4/4", "speed-interval": "-8/8"})
        race = (
            "A zap racing tire gives +4 Acceleration and +8 Speed Interval on-road. Off-road it costs –4 Acceleration "
            "and –8 Speed Interval."
        )
        got = {a["target"]: a["value"] for a in attrs(race, "gear")}
        self.assertEqual(got, {"item:acceleration": "4/-4", "item:speed-interval": "8/-8"})
        self.assertEqual(effects._road_pairs("These tires give +5 Acceleration on the road."), {})

    def test_shredders_add_the_vehicles_body(self):
        got = attrs(
            "Zap treads add the vehicle’s Body to the Attack Rating when ramming small targets, one-half Body if it’s "
            "an attack made against a vehicle.",
            "gear",
        )
        self.assertEqual(
            [(a["value"], a["when"]) for a in got],
            [("bod", "ramming small targets"), ("bod/2 RU", "it's an attack made against a vehicle")],
        )


class ReviewFixesTest(unittest.TestCase):
    def test_an_override_added_entry_keeps_its_own_effects_and_links_and_gains_the_texts_other_targets(self):
        kids = (
            '<effect target="derived:defense" op="add" value="3"/><link rel="as" kind="augmentations" name="Zap Base" '
            'ref="zb"/>'
        )
        files = {
            "augmentations.xml": file(
                "augmentations", "augmentation", [("zb", "", "Zap Base", ""), ("zt", "", "Transgenic Zap", kids)]
            )
        }
        texts = (
            '<sr6:data kind="texts">\n  <text of="augmentations" id="zt">+9 to Defense Rating. You gain +2 dice on '
            "Climbing tests.</text>\n</sr6:data>\n"
        )
        out, _ = effects.apply(files, texts, only={("augmentations", "zt")})
        x = line(out["augmentations.xml"], "zt")
        self.assertIn('<effect target="derived:defense" op="add" value="3"/>', x)  # (the override's word for it)
        self.assertNotIn('value="9"', x)
        self.assertEqual(x.count("<link "), 1)
        self.assertIn('target="skill:athletics" op="add" value="2"', x)

    def test_defense_tests_against_astral_attacks_keep_the_plain_pool_unless_the_number_went_to_the_specific_one(self):
        def t(s):
            return [(a["target"], a["value"]) for a in attrs(s)]

        self.assertEqual(t("Gain +1 die on defense tests vs. astral attacks."), [("test:defense-astral", "1")])
        self.assertEqual(
            t("Gain +2 dice on defense tests and +1 die on defense tests against astral attacks."),
            [("test:defense", "2"), ("test:defense-astral", "1")],
        )

    def test_a_see_link_naming_a_whole_book_writes_no_ref(self):
        files = {"qualities.xml": file("qualities", "quality", [("zq", "", "Zapper", "")])}
        texts = (
            '<sr6:data kind="texts">\n  <text of="qualities" id="zq">Zapper Cost: 8 Karma See Zap Gut, p. 72, Sixth '
            "World Zapbook</text>\n</sr6:data>\n"
        )
        x = line(effects.apply(files, texts)[0]["qualities.xml"], "zq")
        self.assertIn('name="Zap Gut"', x)
        self.assertNotIn("ref=", x)

    def test_reader_faults_behind_junk_copies(self):
        # (a grant on a condition keeps it; a required companion is no grant; `boosts and actions` names no action
        # `and`)
        got = effects.links("Users who reach level five of the Zap quality also gain the Uncouth quality.", "gear")
        self.assertEqual(got[0][1]["when"], "who reach level five of the Zap quality")
        self.assertEqual(
            effects.links("You must also take the Overprotective quality at the same time.", "qualities"), []
        )
        self.assertEqual(
            [
                a["target"]
                for a in attrs("They can reduce the cost of Edge boosts and actions by 1 on tests using Athletics.")
            ],
            ["skill:athletics"],
        )

    def test_a_last_use_it_clause_keeps_the_test_it_names(self):
        got = [
            (a["target"], a["op"], a.get("spec"))
            for a in attrs(
                "You gain +1 die for any Perception (Hearing) tests. You additionally gain a bonus point of Edge that "
                "must be spent on that test; otherwise it is lost."
            )
        ]
        self.assertEqual(got, [("skill:perception", "add", "Hearing"), ("skill:perception", "edge", "Hearing")])

    def test_natural_weapons_and_the_magic_pool_and_stunt_driver_lists(self):
        self.assertEqual(
            attrs("In Close Combat, they increase AR by +1.", "augmentations")[0]["target"], "derived:unarmed-ar"
        )
        self.assertEqual(
            attrs("Half-sword attacks gain +2 AR with swords.", "martialtechniques")[0]["target"], "item:ar"
        )
        self.assertEqual(
            attrs("This causes a -1 dice pool penalty to all tests that include Magic.", "augmentations")[0]["target"],
            "test:attr-mag",
        )
        got = attrs(
            "You only pay half the required Edge cost for the following:\n• Bootleg Turn (1 Karma)\n• Escape! (2 Edge)"
            "\n• Double Down (1,2, or 3 Edge only on Zap [Gunnery] tests)",
            "qualities",
        )
        self.assertEqual(
            [(a["target"], a["value"]) for a in got],
            [("action:bootleg-turn", "1"), ("action:escape", "2"), ("action:double-down", "1")],
        )


class BatchTwoTest(unittest.TestCase):
    def fx(self, text, kind="qualities"):
        """[(target, op, value)] of the effects read from `text`."""
        return [(a["target"], a["op"], a["value"]) for a in attrs(text, kind)]

    def test_edge_reading(self):
        # (a bonus Edge named for the test before it; the next clause's grant; a ban worded `will not be able to gain
        # any`)
        self.assertIn(
            ("skill:perception", "edge", "1"),
            self.fx(
                "Zap eyes give +1 die on Perception tests. They also gain a bonus point of Edge that must be spent on "
                "that test; otherwise it is lost."
            ),
        )
        self.assertEqual(
            self.fx("While disguised, you will not be able to gain any Edge on social tests against Zap staff."),
            [("test:social", "no-edge-gain", "1")],
        )
        self.assertEqual(
            self.fx(
                "If an adept wins an Opposed Social test, grant the adept Edge on that roll (to be used only on that "
                "roll, else it vanishes).",
                "adeptpowers",
            ),
            [("test:social", "edge", "1")],
        )
        self.assertEqual(self.fx("It gives +1 die in addition to the bonus Edge."), [])
        self.assertEqual(
            self.fx("In addition to the 2 points of situational Edge for performance tests, it opens doors."),
            [("skill:con", "edge", "2")],
        )

    def test_edge_cost_lists(self):
        got = attrs(
            "You pay half the Edge cost for:\n• Zap Turn (1 Karma)\n• Escape! (2 Edge)\n• Double Down only on Piloting "
            "tests (1,2, or 3 Edge)",
            "qualities",
        )
        self.assertEqual(
            [(a["target"], a["value"], a.get("when")) for a in got],
            [
                ("action:zap-turn", "1", None),
                ("action:escape", "2", None),
                ("action:double-down", "1", "only on Piloting tests"),
            ],
        )

    def test_target_words(self):
        self.assertEqual(
            self.fx("This causes a -1 dice pool penalty to all tests that include Magic.", "augmentations"),
            [("test:attr-mag", "add", "-1")],
        )
        self.assertEqual(
            self.fx("Gain bonus dice on a Zap Spike Matrix Action or Zap Spike complex form.", "datastructures"),
            [("action:zap-spike", "add", "R"), ("complex-form:zap-spike", "add", "R")],
        )
        self.assertEqual(
            self.fx("Gain bonus dice on a test to compile or register a sprite.", "datastructures"),
            [("action:compile-sprite", "add", "R"), ("action:register-sprite", "add", "R")],
        )
        self.assertEqual(
            self.fx("It grants a zapper a gear bonus of +2 dice to vehicle tests.", "gear"),
            [("test:vehicle", "add", "2")],
        )
        self.assertEqual(
            self.fx("First social encounters with strangers are done with a -1 dice pool modifier."),
            [("test:social", "add", "-1")],
        )
        self.assertEqual(
            self.fx(
                "The user gains one bonus hit when resisting an attack that does 9 or more damage.", "augmentations"
            ),
            [("test:damage-resistance", "hits", "1")],
        )

    def test_natural_weapons_are_the_unarmed_attack(self):
        self.assertEqual(self.fx("Their claws gain +2 AR.", "augmentations"), [("derived:unarmed-ar", "add", "2")])
        self.assertEqual(
            self.fx("Zap-sword attacks gain +2 AR with swords.", "martialtechniques"), [("item:ar", "add", "2")]
        )
        self.assertEqual(self.fx("A hit with the fists gains +1 AR per hit.", "spells")[0][0], "derived:unarmed-ar")

    def test_creation_rules_prices_and_essence(self):
        self.assertEqual(
            self.fx("Zappers may have up to two attributes at their maximum."),
            [("resource:maxed-out-attributes", "set", "2")],
        )
        self.assertEqual(
            self.fx("You may not start with any skills at their maximum starting rank."),
            [("resource:maxed-out-skills", "set", "0")],
        )
        self.assertEqual(
            self.fx("Gain +3 Hardened Armor, per the table.", "critterpowers"), [("derived:hardened-armor", "add", "3")]
        )
        self.assertEqual(
            self.fx("Lifestyle costs are lowered by twenty percent, and more."), [("pricemod:lifestyle", "add", "-0.2")]
        )
        self.assertEqual(
            self.fx(
                "Armor and clothing can be made for you and purchased at a thirty percent increase to the base cost."
            ),
            [("pricemod:armor", "add", "0.3")],
        )
        self.assertEqual(
            self.fx("Zap owners increase the cost of any fitted gear (p. 9, SR6) by ten percent per level."),
            [("pricemod:armor", "add", "R*0.1")],
        )
        self.assertEqual(
            self.fx("Your starting Essence is reduced by the level of the quality."), [("attr:ess", "add", "-R")]
        )
        self.assertEqual(
            self.fx("A zapper gains or expands an Essence hole by 1.0 Essence with each grade."),
            [("derived:essence-hole", "add", "R")],
        )

    def test_a_power_focus_adds_its_force_to_magic_tests(self):
        self.assertEqual(
            self.fx(
                "Foci that temporarily increase your effective Magic rating add to your Sorcery dice pools whenever "
                "you use that skill.",
                "gear",
            ),
            [("test:attr-mag", "add", "R")],
        )  # (one effect: the Sorcery pool is among the tests where Magic is involved)

    def test_a_foundation_armor_costs_acceleration_and_top_speed(self):
        s = (
            "Every two points of zap armor added over the original armor rating reduces the vehicle’s Acceleration by "
            "one meter per combat round."
        )
        self.assertEqual(effects._armor_performance(s, "zap armor")[1]["value"], "-R*0.5")
        self.assertEqual(
            effects._armor_performance(
                s.replace("Acceleration", "top speed").replace("one meter", "ten meters"), "zap armor"
            )[1]["target"],
            "item:top-speed",
        )
        self.assertIsNone(effects._armor_performance(s, "other armor"))

    def test_the_add_ons_effect_is_not_the_hosts(self):
        t = (
            "**Note:** Zap-brace add-on increases the Near and Medium Attack Ratings by 1. The brace is an "
            "after-market part."
        )
        self.assertEqual(effects.less_accessory(t, "Zap Gun zap-brace"), "The brace is an after-market part.")
        files = {
            "weapons.xml": file(
                "weapons", "weapon", [("zg", "", "Zap Gun", ""), ("zb", ' accessoryOf="zg"', "Zap Gun zap-brace", "")]
            )
        }
        texts = '<sr6:data kind="texts">\n  <text of="weapons" id="zg">' + t + "</text>\n</sr6:data>\n"
        self.assertNotIn("<effect", line(effects.apply(files, texts)[0]["weapons.xml"], "zg"))

    def test_an_ammo_type_printing_a_damage_value_sets_it_and_an_instrument_dice_pool_effect_is_con(self):
        files = {
            "weapons.xml": file(
                "weapons",
                "weapon",
                [
                    ("zb", ' class="ammotype" dv="9P"', "Zap Bolt", ""),
                    ("zq", ' class="ammotype" dv="+1"', "Zap Rounds", ""),
                ],
            ),
            "gear.xml": file("gear", "gear", [("zi", ' class="ELECTRONICS/INSTRUMENT"', "Zap Lute", "")]),
        }
        texts = '<sr6:data kind="texts">\n  <text of="gear" id="zi">**Dice pool effect:** –1</text>\n</sr6:data>\n'
        out = effects.apply(files, texts)[0]
        self.assertIn('target="item:dv" op="set" value="9P"', line(out["weapons.xml"], "zb"))
        self.assertNotIn("item:dv", line(out["weapons.xml"], "zq"))
        self.assertIn('target="skill:con" op="add" value="-1"', line(out["gear.xml"], "zi"))

    def test_a_laser_sight_works_at_the_ranges_the_book_gives(self):
        files = {
            "weapons.xml": file(
                "weapons",
                "weapon",
                [("ll", "", "Laser Sight, Low Power", ""), ("lh", "", "Laser Sight, High Power", "")],
            )
        }
        texts = (
            '<sr6:data kind="texts">\n  <text of="weapons" id="ll">This accessory can only be used at | Close and Near '
            "ranges; hidden.</text>\n"
            '  <text of="weapons" id="lh">This laser operates across all ranges but needs '
            "magnification.</text>\n</sr6:data>\n"
        )
        out = effects.apply(files, texts)[0]["weapons.xml"]
        self.assertIn('value="1,1,0,0,0"', line(out, "ll"))
        self.assertIn('value="1,1,1,1,1"', line(out, "lh"))

    def test_a_section_note_of_two_versions_gives_each_item_its_own(self):
        files = {
            "weapons.xml": file(
                "weapons",
                "weapon",
                [
                    ("zs", ' class="ACC"', "Zap Gun Blast Shield (small)", ""),
                    ("zl", ' class="ACC"', "Zap Gun Blast Shield (large)", ""),
                ],
            )
        }
        regrouped = (
            '<!-- section {"name": "Zap Gun Blast Shields", "section": "Zap Gun Blast Shields"} -->\n**Notes:** Small '
            "blast shields provide +1 to Defense Rating "
            "for each shield (max +2). Large blast shields provide +2 (max +4) for each shield.\n<!-- end -->\n"
        )
        out = effects.apply(files, "", regrouped)[0]["weapons.xml"]
        self.assertIn('target="derived:defense" op="add" value="1"', line(out, "zs"))
        self.assertIn('target="derived:defense" op="add" value="2"', line(out, "zl"))
        self.assertNotIn('value="1"', line(out, "zl"))

    def test_a_sentence_ends_after_a_parenthesis_and_a_defense_pool_needs_no_condition(self):
        self.assertEqual(
            effects.sentences("It senses (smell, fear, etc.) This grants a bonus."),
            ["It senses (smell, fear, etc.)", "This grants a bonus."],
        )
        self.assertEqual(attrs("Gain +2 dice on defense tests against astral attacks.")[0].get("switch"), None)

    def test_a_commlink6_override_row_replaces_the_effect_of_its_target_and_says_why(self):
        from importer.sr6 import NS, overrides

        files = {
            "gear.xml": file(
                "gear", "gear", [("zg", "", "Zap Gear", '<effect target="item:concealability" op="add" value="9"/>')]
            ).replace("<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1)
        }
        row = {
            "cl6": "Zap Gear",
            "kind": "gear",
            "id": "zg",
            "gen": "cl6",
            "why": "only Commlink6 has it",
            "effects": [{"target": "item:concealability", "op": "add", "value": "1"}],
        }
        out = overrides.apply("x", files, [row])["gear.xml"]
        self.assertIn('<effect target="item:concealability" op="add" value="1" gen="cl6"/>', out)
        self.assertNotIn('value="9"', out)
        with self.assertRaises(ValueError):
            overrides.check([{k: v for k, v in row.items() if k != "why"}])


class ReviewFollowUpsTest(unittest.TestCase):
    """The second review's findings (2026-10-17), each a sentence invented in the books' shape."""

    def fx(self, text, kind="qualities"):
        """[(target, op, value)] of the effects read from `text`."""
        return [(a["target"], a["op"], a["value"]) for a in attrs(text, kind)]

    def test_natural_weapon_words_are_read_per_sentence_and_a_wielded_weapon_is_not_natural(self):
        self.assertEqual(
            self.fx("Choose one option: gain +2 AR with a favoured weapon. Or your claws gain +1 DV."),
            [("item:ar", "add", "2"), ("derived:unarmed-dv", "add", "1")],
        )
        self.assertEqual(
            self.fx("Your tusks gain +2 AR, including when wielding a weapon."),
            [("derived:unarmed-ar", "add", "2"), ("item:ar", "add", "2")],
        )  # (both)
        self.assertEqual(
            self.fx("Your tusks gain +2 AR. Their weapon's AR is unchanged."), [("derived:unarmed-ar", "add", "2")]
        )

    def test_a_requirement_is_no_grant_and_the_benefits_of_a_quality_are(self):
        def names(t):
            return [a["name"] for _, a, _ in effects.links(t, "qualities")]

        self.assertEqual(names("If you do not already have the Zap Hood quality, you cannot take this."), [])
        self.assertEqual(names("Karma 5 if you already have the Zap Home quality."), [])
        self.assertEqual(names("You must have the Zap Hood quality."), [])
        self.assertEqual(
            names(
                "If you already have the Zap Home quality, pay 5 Karma. You gain the benefits of the Zap Home quality."
            ),
            ["Zap Home"],
        )

    def test_a_clause_that_lifts_a_penalty_is_no_edge_grant(self):
        self.assertEqual(self.fx("The penalty does not apply when having a lower Social Rating grants Edge."), [])

    def test_edge_bans_name_the_activity_or_test_and_the_kind_of_user(self):
        self.assertEqual(
            [
                (a["target"], a["op"], a.get("spec"))
                for a in attrs("You cannot use any Edge for the purposes of sneaking.", "qualities")
            ],
            [("skill:stealth", "no-edge", "Sneaking")],
        )
        got = attrs("Technomancers cannot use Edge on Resonance actions.", "qualities")
        self.assertEqual([(a["target"], a.get("when")) for a in got], [("test:resonance", "technomancer")])

    def test_two_links_giving_one_effect_copy_it_once(self):
        s = {
            "a": {
                "qualities.xml": file(
                    "qualities",
                    "quality",
                    [
                        ("a.base", "", "Zap Base", '<effect target="attr:str" op="add" value="1"/>'),
                        ("a.twin", "", "Zap Twin", '<link rel="as" name="Zap Base" kind="qualities" ref="a.base"/>'),
                        (
                            "a.mine",
                            "",
                            "Zap Mine",
                            '<link rel="as" name="Zap Base" kind="qualities" ref="a.base"/><link rel="as" name="Zap '
                            'Twin" kind="qualities" ref="a.twin"/>',
                        ),
                    ],
                )
            }
        }
        x = line(effects.copy_links(s)[("a", "qualities.xml")], "a.mine")
        self.assertEqual(x.count('target="attr:str"'), 1)

    def test_a_long_run_of_words_before_an_ending_is_read_in_linear_time(self):
        import time

        t0 = time.perf_counter()
        effects.read("You gain a bonus point of Edge that must be used on " + "x" * 200 + "-", "qualities")
        effects.read(
            "You gain a bonus point of Edge that must be used on tests of " + " ".join(["word"] * 100) + " -",
            "qualities",
        )
        self.assertLess(time.perf_counter() - t0, 0.5)  # (the old pattern took tens of seconds on a hundred letters)

    def test_a_linked_entrys_effects_of_one_target_under_different_conditions_are_all_copied(self):
        s = {
            "a": {
                "qualities.xml": file(
                    "qualities",
                    "quality",
                    [
                        (
                            "a.base",
                            "",
                            "Zap Base",
                            '<effect target="item:ar" op="add" value="1" switch="conditional" when="on a firearm"/>'
                            '<effect target="item:ar" op="add" value="2" switch="conditional" when="on a blade"/>'
                            '<effect target="item:ar" op="add" value="3" switch="wireless"/><effect target="item:ar" '
                            'op="add" value="4"/>',
                        ),
                        ("a.mine", "", "Zap Mine", '<link rel="as" name="Zap Base" kind="qualities" ref="a.base"/>'),
                    ],
                )
            }
        }
        x = line(effects.copy_links(s)[("a", "qualities.xml")], "a.mine")
        self.assertIn('value="1" switch="conditional" when="on a firearm"', x)
        self.assertIn('value="2" switch="conditional" when="on a blade"', x)
        self.assertIn('value="3" switch="wireless"', x)
        self.assertIn(
            '<effect target="item:ar" op="add" value="4" from="a.base"/>', x
        )  # (a wireless one and a plain one)

    def test_a_condition_that_runs_on_to_the_tests_it_applies_to_is_still_a_condition(self):
        # (14 words of clause now end in `tests`: `when they use the zap metamagic on Drain Resistance tests` is not
        # just which test)
        a = attrs(
            "A zap focus adds its Force to the initiate grade when they use the zap metamagic on Drain Resistance "
            "tests.",
            "gear",
        )
        self.assertEqual(
            [(x["target"], x.get("switch"), x.get("when")) for x in a],
            [("test:drain-resistance", "conditional", "when they use the zap metamagic on drain resistance tests")],
        )
        self.assertEqual(
            attrs("You gain +2 dice when performing a Perception test.", "qualities")[0].get("switch"), None
        )  # (which test: no condition)

    def test_an_edge_ban_that_comes_with_failure_holds_only_on_failure(self):
        a = attrs(
            "Failure means they flee, or they suffer a penalty: not being able to earn or spend Edge.", "augmentations"
        )
        self.assertEqual(
            [(x["op"], x.get("switch"), x.get("when")) for x in a],
            [("no-edge-gain", "conditional", "on failure"), ("no-edge", "conditional", "on failure")],
        )

    def test_an_entry_that_is_a_natural_weapon_gives_the_unarmed_attack_its_ar_and_dv(self):
        def fx(text, kind, name, cls=""):
            return [
                (x["target"], x.get("switch"))
                for t, x, _ in effects.read(text, kind, name, cls)
                if t == "effect" and x["target"][-2:] in ("ar", "dv")
            ]

        horns = (
            "These zap horns hit as DV 3P, AR 7/-/-/-/-. If the bearer's Strength is 6 or better, increase the AR by 2."
        )
        self.assertEqual(
            fx(horns, "augmentations", "Zap Spur", "BIOWARE/BIOWARE_WEAPON"), [("derived:unarmed-ar", "conditional")]
        )  # (by class)
        self.assertEqual(fx(horns, "qualities", "Zap Horns"), [("derived:unarmed-ar", "conditional")])  # (by name)
        self.assertEqual(
            fx(
                "Choose a natural weapon. That weapon gains +1 damage and +2 Attack Rating.",
                "critterpowers",
                "Zap Edge",
            ),
            [("derived:unarmed-ar", None)],
        )  # (the text says it is the natural weapon's)
        self.assertEqual(
            fx("It adds 2 to the AR of your wielded sword.", "qualities", "Zap Horns"), []
        )  # (a sword is another item)

    def test_an_entry_that_is_no_natural_weapon_keeps_the_sentence_reading(self):
        fav = "Your favored weapon gains +2 AR. This weapon's AR counts only when you hold it."
        self.assertEqual([x["target"] for x in attrs(fav, "qualities")], ["item:ar"])
        self.assertEqual([x["target"] for x in attrs("Their claws gain +2 AR.", "qualities")], ["derived:unarmed-ar"])

    def test_a_penalty_that_covers_wielded_weapons_too_is_both_the_unarmed_attack_and_the_item(self):
        got = [
            (x["target"], x["value"])
            for x in attrs(
                "In Close Combat, short zap arms bring a -1 dice pool penalty to every AR, wielding weapons or not.",
                "qualities",
            )
        ]
        self.assertEqual(got, [("derived:unarmed-ar", "-1"), ("item:ar", "-1")])

    def test_a_condition_is_not_cut_inside_a_parenthesis_and_does_not_swallow_the_penalty_after_it(self):
        a = attrs(
            "They gain a point of situational Edge when they try to calm a crowd or defuse a standoff (a single point "
            "per attempt, whatever happens next).",
            "qualities",
        )
        self.assertEqual(a[0]["when"], "when they try to calm a crowd or defuse a standoff")
        a = attrs(
            "While moving faster than their zap speed and suffer a -1 dice pool penalty to Athletics tests.",
            "qualities",
        )
        self.assertEqual(a[0]["when"], "while moving faster than their zap speed")

    def test_a_distinct_clause_is_never_dropped_as_a_repeat(self):
        t = (
            "Zap Counterspelling foci add their Force to a Counterspelling attempt, as long as the countered spell "
            "shares the focus category. "
            "Zap Spellcasting foci add their Force to your Spellcasting pool as long as the spell shares the focus "
            "category."
        )
        a = [x for x in attrs(t, "gear") if x["target"] == "skill:sorcery"]
        self.assertEqual(
            a[0]["when"],
            "as long as the countered spell shares the focus category, as long as the spell shares the focus category",
        )

    def test_a_list_of_tests_before_a_bonus_edge_keeps_every_test_of_the_list(self):
        t = (
            "When used as part of a Zap (Etiquette) test, users make one of these: a Con (Disguise) test to look "
            "different, a Stealth (Sneaking) test to avoid scanners, or a Con (Impersonation) test to pose as someone, "
            "gain a point of Edge."
        )
        self.assertEqual(
            sorted((x["target"], x.get("spec")) for x in attrs(t, "gear")),
            [("skill:con", "Disguise, Impersonation"), ("skill:influence", "Etiquette"), ("skill:stealth", "Sneaking")],
        )
        self.assertEqual(
            [x["target"] for x in attrs("On those Con (Disguise) tests, gain a point of Edge.", "gear")], ["skill:con"]
        )

    def test_a_condition_naming_a_specialization_or_a_weapon_use_is_still_a_condition(self):
        a = attrs("Gain a point of Edge when you use the Zapping specialization of the Outdoors skill.", "qualities")
        self.assertEqual((a[0]["target"], a[0].get("switch")), ("skill:outdoors", "conditional"))
        a = attrs("Gain a point of Edge when you use this zapper for a Block action.", "qualities")
        self.assertEqual((a[0]["target"], a[0].get("switch")), ("action:block", "conditional"))
        self.assertEqual(
            attrs(
                "When making this test, the program grants a virtual Attack attribute equal to its rating.", "programs"
            )[0].get("switch"),
            None,
        )  # (which test: no condition)

    def test_a_bonus_to_a_thing_the_reader_does_not_know_takes_no_attribute_from_further_on(self):
        # (Harvester: `+2 to base movement rates … -1 Logic …` read as +2 Logic, Charisma, Sorcery and the unarmed AR)
        t = (
            "Gained Powers: Sapience, +1 initiative die, +2 to base movement rates Weaknesses: Allergy (Silver), -1 "
            "Logic, -1 Charisma Attack: Claws 5P, Attack Rating 10 Notes: a zapper may use (Charisma + 1) x 2 in place "
            "of Sorcery + Magic for that spell."
        )
        self.assertEqual(
            self.fx(t), [("derived:initiative-dice", "add", "1"), ("attr:log", "add", "-1"), ("attr:cha", "add", "-1")]
        )
        self.assertEqual(
            self.fx("You gain +2 to dice pools and +1 Edge when making Influence tests."),
            [("skill:influence", "edge", "1"), ("skill:influence", "add", "2")],
        )

    def test_melee_attacks_are_the_unarmed_attack_and_the_weapon_and_a_blade_is_an_item(self):
        self.assertEqual(
            self.fx("This treatment increases AR by one point for melee attacks.", "augmentations"),
            [("derived:unarmed-ar", "add", "1"), ("item:ar", "add", "1")],
        )
        self.assertEqual(self.fx("Your blades gain +2 AR.", "qualities"), [("item:ar", "add", "2")])
        self.assertEqual(
            [
                x["target"]
                for x in attrs("Unlike its natural weapons, this power gives +2 AR with its knife.", "critterpowers")
            ],
            ["item:ar"],
        )

    def test_a_cl6_override_row_replaces_the_effect_of_its_target_and_op_only(self):
        from importer.sr6 import NS, overrides

        kids = '<effect target="item:size" op="set" value="3"/><effect target="item:size" op="add" value="9"/>'
        files = {
            "gear.xml": file("gear", "gear", [("zg", "", "Zap Gear", kids)]).replace(
                "<sr6:data ", f'<sr6:data xmlns:sr6="{NS}" ', 1
            )
        }
        row = {
            "cl6": "Zap Gear",
            "kind": "gear",
            "id": "zg",
            "gen": "cl6",
            "why": "only Commlink6 has it",
            "effects": [{"target": "item:size", "op": "add", "value": "1"}],
        }
        out = overrides.apply("x", files, [row])["gear.xml"]
        self.assertIn('op="set" value="3"', out)
        self.assertNotIn('value="9"', out)
        self.assertIn('op="add" value="1" gen="cl6"', out)


if __name__ == "__main__":
    unittest.main()
