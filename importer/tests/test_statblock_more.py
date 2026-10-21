"""More of the stat-block reader (importer/statblock.py): the shorthand lines of an amp, what a printed type or chassis
makes of it, and the report rows for what the page prints that the rules can't take. A made-up runner and made-up lines,
on the fixture core data."""

import unittest

from importer import statblock
from importer.tests.test_statblock import STAT

# pylint: disable=protected-access


class LineEffectsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = statblock.load_rules()
        cls.mapper = statblock.Mapper({**cls.rules["specs"], **statblock.SPEC_NAMES})

    def refs(self, line, atype="quality"):
        """The ids of the effects a line maps to, or None when it maps to none."""
        got = statblock._line_effects(line, atype, self.mapper)
        return got if got is None else [f[0] for f in got]

    def test_the_booklets_shorthands(self):
        self.assertEqual(self.refs("VR cold-sim"), ["vr-cold"])
        self.assertEqual(self.refs("VR hot-sim"), ["vr-hot"])
        self.assertEqual(self.refs("Attack 2"), ["attack-plus"] * 2)
        self.assertEqual(self.refs("Delta grade"), ["grade-delta"])
        self.assertEqual(self.refs("Omega Grade"), ["grade-omega"])
        self.assertEqual(self.refs("Weapon (DV) +2"), ["dv-plus"] * 2)
        self.assertEqual(self.refs("Sustain up to 2 additional spells"), ["sustain-spell"] * 2)
        self.assertEqual(self.refs("+1 action per narration"), ["init-2"])
        self.assertEqual(self.refs("+1 attack per narration, jump in VR"), ["init-2", "init-realm"])  # (jumped in: VR)

    def test_a_weapon_profile_or_a_situational_bonus(self):
        self.assertEqual(self.refs("Zap pistol VD 5 (OK)"), [])  # (a profile: consumed, no effect)
        self.assertIsNone(self.refs("DV bonus against robots"))  # (not DV +1)

    def test_a_vehicles_lines(self):
        self.assertEqual(self.refs("Flying", "vehicle"), ["flying"])
        self.assertEqual(self.refs("Safety override", "vehicle"), ["safety-override"])
        self.assertEqual(self.refs("+2 armor", "vehicle"), ["vehicle-armor"] * 2)
        self.assertEqual(
            statblock._line_effects("Integrated zap gun", "vehicle", self.mapper),
            [("weapon-mount", "Integrated zap gun", None, None)],
        )
        self.assertEqual(
            self.refs("Pilot 5, Body 2, Handling 8, Speed 3 (Flying 2), Armor 0", "vehicle"), ["flying"]
        )  # (the stat line, priced against the chassis)
        self.assertEqual(self.refs("Pilot 5, Body 2, Handling 8, Speed 3, Armor 0", "vehicle"), [])

    def test_awakened_lines(self):
        self.assertEqual(
            statblock._awakened("Adept, astral projection"),
            [("awk-adept", None, None, None), ("awk-astral-projection", None, None, None)],
        )
        self.assertEqual(statblock._awakened("Astral perception"), [("awk-astral-perception", None, None, None)])
        self.assertIsNone(statblock._awakened("nothing"))


class SizesAndChassisTest(unittest.TestCase):
    def test_weapon_sizes(self):
        self.assertEqual(
            [statblock._weapon_size(t) for t in ("none", "pistols", "up to SMGs", "rifles", "any")], [0, 1, 2, 3, 9]
        )

    def test_chassis(self):
        rules = statblock.load_rules()
        self.assertEqual(
            statblock._chassis({"type": "Vehicle - Race-Motorbike", "lines": []}, rules), "race-motorbike"
        )  # (named by its type)
        self.assertEqual(
            statblock._chassis({"type": "Vehicle - car", "lines": []}, rules), None
        )  # (a type with no chassis of that name, and nothing to size it by)
        self.assertEqual(statblock._chassis({"type": "Drone", "lines": ["Large drone"]}, rules), "large-drone")
        self.assertEqual(
            statblock._chassis({"type": "Drone", "lines": ["Body 2, Handling 8, Speed 3"]}, rules), "small-drone"
        )  # (the nearest to its numbers)
        self.assertIsNone(statblock._chassis({"type": "Drone", "lines": ["Nothing"]}, rules))


class MapAmpMoreTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.rules = statblock.load_rules()
        cls.mapper = statblock.Mapper({**cls.rules["specs"], **statblock.SPEC_NAMES})

    def amp(self, name, atype, rating, lines):
        """A Shadow Amp row of the given type and rating."""
        return {"name": name, "type": atype, "rating": rating, "count": 1, "lines": lines}

    def test_a_hot_sim_line_brings_the_cold_one_it_builds_on(self):
        got = statblock.map_amp(self.amp("Hot", "Quality", 2, ["VR hot-sim"]), self.rules, self.mapper, True)
        self.assertEqual([f[0] for f in got[1]], ["vr-cold", "vr-hot"])

    def test_an_awakened_amp_naming_no_effect_is_an_adepts_by_its_name(self):
        got = statblock.map_amp(self.amp("Adept thing", "Awakened", 3, ["Mumble"]), self.rules, self.mapper, True)
        self.assertEqual(([f[0] for f in got[1]], got[2]), (["awk-adept"], ["Mumble"]))

    def test_a_catalog_quality_that_prices_as_equipment(self):
        # (sustain-spell: 1 over the type's base; a later Quality starts at 2, Equipment at 1: the printed rating 2 is
        # Equipment's)
        sust = self.amp("Sust", "Quality", 2, ["Sustain up to 1 additional spells"])
        self.assertEqual(statblock.map_amp(sust, self.rules, self.mapper, True, catalog=True)[0], "quality")
        self.assertEqual(statblock.map_amp(sust, self.rules, self.mapper, False, catalog=True)[0], "equipment")

    def test_a_catalog_awakened_amp_priced_one_lower_has_perception_only(self):
        seer = self.amp("Seer", "Awakened", 3, ["Astral projection"])
        self.assertEqual(
            [f[0] for f in statblock.map_amp(seer, self.rules, self.mapper, True, catalog=True)[1]],
            ["awk-astral-perception"],
        )
        self.assertEqual(
            [f[0] for f in statblock.map_amp(seer, self.rules, self.mapper, True)[1]], ["awk-astral-projection"]
        )  # (a runner's stays as printed)


class ReportTest(unittest.TestCase):
    def test_what_the_rules_cannot_take_is_reported(self):
        stat = (
            STAT.replace("(Contact)", "(Mystery)")
            .replace("**Close combat 1 AGI 4**", "**Basket weaving 2 STR 4**\n**Close combat 1 AGI 4**")
            .replace("**Unarmed** 2", "**Zork gizmo** (Mystery thing) 4 [OK/–/–/–]\n**Unarmed** 2")
            .replace("**Mental** 3 6 9", "**Weird row** 3 6 9\n**Mental** 3 6 9")
            .replace("EQUIPMENT\n", "SPELLS\n**Test Spell**\nCOMPLEX FORMS\n**Test Form**\nEQUIPMENT\n")
        )
        ch, rows = statblock.to_character(
            statblock.parse_statblock(stat),
            statblock.load_rules(),
            sid="x",
            name="X",
            role="",
            origin="PREGENS",
            background="",
            updated="",
            page=5,
            spell_ids={},
        )
        odd = [
            r
            for r in rows
            if r.get("status") in ("unmatched", "untested") or r["kind"] in ("amp-type", "unknown-skill")
        ]
        self.assertEqual(
            odd,
            [
                {"kind": "amp-type", "sample": "x", "name": "Old Friend", "printed": "Mystery"},  # (the amp left out)
                {"kind": "unknown-skill", "sample": "x", "name": "Basket weaving"},
                {
                    "kind": "unmatched-item",
                    "sample": "x",
                    "item": "weapon",
                    "name": "Zork gizmo",
                    "printed": "Mystery thing",
                    "status": "unmatched",
                },
                {"kind": "unmatched-item", "sample": "x", "item": "spell", "name": "Test Spell", "status": "unmatched"},
                {"kind": "threshold", "sample": "x", "name": "Weird row", "printed": 3, "status": "untested"},
            ],
        )
        self.assertNotIn("Old Friend", [a["name"] for a in ch["build"]["amps"]])
        self.assertEqual(
            [
                (i["kind"], i["name"], i.get("catalogId"))
                for i in ch["build"]["items"]
                if i["kind"] in ("spell", "complex-form")
            ],
            [("spell", "Test Spell", None), ("complex-form", "Test Form", None)],
        )


if __name__ == "__main__":
    unittest.main()
