"""A being's powers line (powerlist.power_list), the critter powers a book prints (sections.py: `New Critter
Power`, a plain name over its `**Type:**` lines), a label wrapped inside a bracket (regroup._goes_on) and the
powers a stat block names that a rules section describes (statpowers.py). Invented text only."""

import os
import tempfile
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup, statpowers
from importer.sr6.effects import emit
from importer.sr6.catalog import being_lists
from importer.sr6.powerlist import power_list
from importer.sr6.recipes import crb
from tools.cl6check import ours

# pylint: disable=protected-access  # tests reach into the module internals they cover

MD = """<!-- page 40 -->
# ODD BEINGS
## Glow Folk
#### New Critter Power
##### Hum Along
The critter hums along with others of its kind.
##### ZAPPER
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| F | F | F | F | F | F | F | F | F |
**Skills:** Astral
**Powers:** Hum Along, Sapience
##### New Critter Powers
Glow Away
**Type:** M **Action:** Auto
**Range:** Self **Duration:** Special
The critter glows away.
Blink Back (twice)
**Type:** P **Action:** Major
**Range:** LOS **Duration:** Instant
The critter blinks back.
"""


class PowerListTest(unittest.TestCase):
    def test_a_missing_comma_is_put_back(self):
        # ruling A: powers the book ran together are each a power (a period, a semicolon, a space after a bracket)
        self.assertEqual(power_list("Zap 2. Glow Form, Fizz"), ("Zap 2, Glow Form, Fizz", ""))
        self.assertEqual(power_list("Fizz (Self Only). Glow Form"), ("Fizz (Self Only), Glow Form", ""))
        self.assertEqual(power_list("Zap 2; Shield (Cold, Fire)"), ("Zap 2, Shield (Cold, Fire)", ""))
        self.assertEqual(power_list("Sense (Glow, Hum) Fizz"), ("Sense (Glow, Hum), Fizz", ""))

    def test_brackets_and_decimals_hold(self):
        text = "Zap 0.5, Venom [Vector: Spit; Speed: 1 round; Effect: Dazed, Glow (Magic)P], Hum"
        self.assertEqual(power_list(text), (text, ""))

    def test_a_sentence_after_the_powers_is_the_riders(self):
        # ruling B: it belongs to the power before it, and goes to the text, not the list
        powers, rider = power_list(
            "Hum, Zap, Sapience damage grows to 9P, a glitch makes it 10P, and a critical glitch 11P."
        )
        self.assertEqual(powers, "Hum, Zap")
        self.assertEqual(rider, "Sapience damage grows to 9P, a glitch makes it 10P, and a critical glitch 11P.")
        powers, rider = power_list(
            "Glow Form, Shift (Cat, Self) All stats stay the same, but the cat form has claws (DV 4P, AR 6/—/—/—/—)"
        )
        self.assertEqual(powers, "Glow Form, Shift (Cat, Self)")
        self.assertTrue(rider.startswith("All stats stay the same"))
        self.assertEqual(power_list("Choose any one fizz power. You may swap it for 1 task.")[0], "")

    def test_a_long_name_with_connectors_is_a_name(self):
        self.assertEqual(
            power_list("Resistance to Toxins and Pathogens, Zap"), ("Resistance to Toxins and Pathogens, Zap", "")
        )


class CritterPowerSectionsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        text, _ = regroup.regroup(MD, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        cls.res = crb.extract(text)

    def names(self, kind):
        """{name: entry} of the `kind` entries of the reading."""
        return {e.findtext("name"): e for e in ET.fromstring(self.res.files[f"{kind}.xml"])}

    def test_new_critter_power_heading_makes_the_power_not_the_creature_under_it(self):
        self.assertIn("Hum Along", self.names("critterpowers"))
        self.assertNotIn("ZAPPER", {n.upper() for n in self.names("critterpowers")})

    def test_a_plain_name_over_its_type_lines_is_a_power_with_its_fields(self):
        p = self.names("critterpowers")
        self.assertEqual(
            [p["Glow Away"].get(k) for k in ("type", "action", "range", "duration")], ["M", "Auto", "Self", "Special"]
        )
        self.assertEqual(
            [p["Blink Back (twice)"].get(k) for k in ("type", "action", "range", "duration")],
            ["P", "Major", "LOS", "Instant"],
        )
        self.assertNotIn("Type", p)


class WrappedLabelTest(unittest.TestCase):
    def test_a_capital_line_closing_an_open_bracket_goes_on_the_value(self):
        """A value cut inside a bracket takes the next line when that line closes it."""
        for value, line, goes_on in (
            ("Zap, Sense (Glow", "Hum, Fizz), Zap (4)", True),
            ("Zap, Sense (Glow)", "Hum, Fizz", False),
            ("Zap, Sense (Glow", "Hum, Fizz", False),
        ):
            self.assertEqual(regroup._goes_on(([{"Skills": value}], "Skills"), line), goes_on)

    def test_a_powers_line_cut_inside_a_name_goes_on_with_the_powers(self):
        """`Natural` / `Weapons (claws/bite), Sapience`: a bare last word, then a list of powers."""
        label = ([{"Powers": "Zap, Hum, Natural"}], "Powers")
        self.assertTrue(regroup._goes_on(label, "Weapons (claws/bite), Sapience"))
        self.assertFalse(regroup._goes_on(label, "Zorp hunts in packs, and glows"))  # (prose)
        self.assertFalse(regroup._goes_on(([{"Powers": "Zap, Hum (4)"}], "Powers"), "Weapons (claws/bite), Sapience"))
        self.assertFalse(regroup._goes_on(([{"Gear": "Zap, Natural"}], "Gear"), "Weapons (claws/bite), Sapience"))


class CutPowersLineTest(unittest.TestCase):
    """A powers line the page's columns cut is read whole from the stat block the text prints again."""

    def test_the_whole_line_comes_from_the_text(self):
        text = "\n".join(
            [
                "**Powers:** Zap 4, Hum, Natural",
                "Weapon (Bite, DV 6P), Natural Weapon (Gore*, DV 8P)",
                "*Gore needs a run-up.",
            ]
        )
        block = type("Block", (), {"labels": {"Powers": "Zap 4, Hum, Natural"}, "text": text})()
        lists, riders = being_lists(block)
        self.assertEqual(lists["powers"], "Zap 4, Hum, Natural Weapon (Bite, DV 6P), Natural Weapon (Gore*, DV 8P)")
        self.assertEqual(riders, ["**Power notes:** *Gore needs a run-up."])
        # a line the text does not go on with is left as it is
        block.text = "**Powers:** Zorp, Glow"
        self.assertEqual(being_lists(block)[0]["powers"], "Zap 4, Hum, Natural")


class SectionPowersTest(unittest.TestCase):
    """A power only a stat block names, described by a rules section of a book, becomes that source's critter power."""

    def source(self, root, src, kind, rows):
        """Write the source's `kind` file with these rows."""
        os.makedirs(os.path.join(root, "imported", src), exist_ok=True)
        with open(os.path.join(root, "imported", src, f"{kind}.xml"), "w", encoding="utf8") as f:
            f.write(f'<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="{kind}" version="1">{rows}</sr6:data>')

    def texts(self, root, src, rows):
        """Write the source's texts file with these (of, id, text) rows."""
        os.makedirs(os.path.join(root, "texts"), exist_ok=True)
        body = "".join(f'<text of="{of}" id="{i}">{t}</text>' for of, i, t in rows)
        with open(os.path.join(root, "texts", f"{src}.xml"), "w", encoding="utf8") as f:
            f.write(f'<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="texts" version="1">{body}</sr6:data>')

    def beast(self, root, src, powers):
        """A source with one critter printing these powers."""
        head = f'<critter id="{src}.beast" source="{src.upper()}" page="7">'
        row = f"{head}<name>Beast</name><powers>{powers}</powers></critter>"
        self.source(root, src, "critters", row)

    def made(self, root, src):
        """[(id, name, page)] of the source's section powers file; None when it has none."""
        path = os.path.join(root, "imported", src, statpowers.FILE)
        if not os.path.exists(path):
            return None
        return [(e.get("id"), e.findtext("name"), e.get("page")) for e in ET.parse(path).getroot()]

    def saved(self, root, src):
        """The (of, id) keys of the source's texts file."""
        return {(t.get("of"), t.get("id")) for t in ET.parse(os.path.join(root, "texts", f"{src}.xml")).getroot()}

    def test_a_section_a_stat_block_names_is_a_power_with_its_text(self):
        with tempfile.TemporaryDirectory() as root:
            self.source(
                root,
                "aa",
                "critterpowers",
                '<critterpower id="aa.zap" source="AA" page="1"><name>Zap</name></critterpower>',
            )
            self.source(
                root,
                "aa",
                "qualities",
                '<quality id="aa.tough" source="AA" page="1"><name>Built Tough</name></quality>',
            )
            fizz = '<rule id="bb.fizz" source="BB" page="9" chapter="THE BEASTS"><name>Fizz</name></rule>'
            self.source(
                root,
                "bb",
                "rules",
                fizz + '<rule id="bb.glows" source="BB" page="9" chapter="THE BEASTS"><name>Glows</name></rule>',
            )
            self.texts(root, "bb", [("rules", "bb.fizz", "Fizzing happens.")])
            self.beast(root, "cc", "Zap 2, Fizz (Cold), Built Tough 1, Gleam, Zork")
            self.source(root, "dd", "rules", fizz.replace("bb.", "dd.").replace("BB", "DD"))
            # (Fizz in both books that describe it, for the app to take the NPC's own, then the latest; Gleam and
            # Zork have no section)
            self.assertEqual(statpowers.section_powers(root), 2)
            self.assertEqual(self.made(root, "bb"), [("bb.section-fizz", "Fizz", "9")])
            self.assertIsNotNone(self.made(root, "dd"))
            self.assertIsNone(self.made(root, "cc"))
            texts = {
                (t.get("of"), t.get("id")): t.text for t in ET.parse(os.path.join(root, "texts", "bb.xml")).getroot()
            }
            self.assertEqual(texts[("critterpowers", "bb.section-fizz")], "Fizzing happens.")
            # a source that defines it later takes the section's power away
            self.source(
                root,
                "aa",
                "adeptpowers",
                '<adeptpower id="aa.fizz" source="AA" page="2"><name>Fizz</name></adeptpower>',
            )
            self.assertEqual(statpowers.section_powers(root), 0)
            self.assertIsNone(self.made(root, "bb"))
            self.assertNotIn(("critterpowers", "bb.section-fizz"), self.saved(root, "bb"))

    def test_a_real_power_with_the_same_name_keeps_its_text(self):
        with tempfile.TemporaryDirectory() as root:
            rule = '<rule id="bb.fizz" source="BB" page="9" chapter="THE BEASTS"><name>Fizz</name></rule>'
            self.source(root, "bb", "rules", rule)
            self.texts(root, "bb", [("rules", "bb.fizz", "Fizzing happens.")])
            self.beast(root, "bb", "Fizz")
            self.assertEqual(statpowers.section_powers(root), 1)
            # a later reading of the book defines Fizz itself, under the id the old pass used to take
            self.source(
                root,
                "bb",
                "critterpowers",
                '<critterpower id="bb.fizz" source="BB" page="9"><name>Fizz</name></critterpower>',
            )
            self.texts(
                root, "bb", [("rules", "bb.fizz", "Fizzing happens."), ("critterpowers", "bb.fizz", "The real text.")]
            )
            statpowers.section_powers(root)
            self.assertIn(("critterpowers", "bb.fizz"), self.saved(root, "bb"))
            self.assertIsNone(self.made(root, "bb"))

    def test_a_section_is_one_power_however_it_is_printed(self):
        with tempfile.TemporaryDirectory() as root:
            two = '<rule id="bb.fizzes" source="BB" page="9" chapter="BEASTS"><name>Fizzes</name></rule>'
            two += '<rule id="bb.fizzes-2" source="BB" page="10" chapter="BEASTS"><name>Fizzes</name></rule>'
            self.source(root, "bb", "rules", two)
            self.beast(root, "bb", "Fizz, Fizzes")
            self.assertEqual(statpowers.section_powers(root), 1)
            self.assertEqual(len(self.made(root, "bb")), 1)

    def test_a_generic_section_is_no_power(self):
        with tempfile.TemporaryDirectory() as root:
            self.source(
                root, "bb", "rules", '<rule id="bb.fizz" source="BB" page="9" chapter="GEAR"><name>Fizz</name></rule>'
            )
            self.beast(root, "cc", "Fizz")  # (another book prints it: no sign the section is a power's)
            self.assertEqual(statpowers.section_powers(root), 0)
            self.beast(root, "bb", "Fizz")  # (the book's own stat block prints it)
            self.assertEqual(statpowers.section_powers(root), 1)

    def test_a_corrupt_file_leaves_the_files_as_they_were(self):
        with tempfile.TemporaryDirectory() as root:
            self.source(
                root, "bb", "rules", '<rule id="bb.fizz" source="BB" page="9" chapter="BEASTS"><name>Fizz</name></rule>'
            )
            self.texts(root, "bb", [("rules", "bb.fizz", "Fizzing.")])
            self.beast(root, "bb", "Fizz")
            statpowers.section_powers(root)
            before = self.made(root, "bb")
            with open(os.path.join(root, "texts", "bb.xml"), "w", encoding="utf8") as f:
                f.write("<broken")
            with self.assertRaises(ET.ParseError):
                statpowers.section_powers(root)
            self.assertEqual(self.made(root, "bb"), before)

    def test_power_names_drop_ratings_marks_and_brackets(self):
        self.assertEqual(
            statpowers.power_names(
                "Zap 4, Hum*, Venom [Vector: Spit; Effect: Glow, Hum (Magic)P], Hardened Armor 0.5, Fizz† , 9"
            ),
            [
                ("Zap", "Zap"),
                ("Hum", "Hum"),
                ("Venom", "Venom [Vector: Spit; Effect: Glow, Hum (Magic)P]"),
                ("Hardened Armor", "Hardened Armor"),
                ("Fizz", "Fizz"),
            ],
        )


class FileKindTest(unittest.TestCase):
    """The CommLink6 tools and copy_links read a file's kind from its root: section-powers.xml holds critter powers."""

    def test_a_files_kind_is_its_roots(self):
        head = '<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="critterpowers" version="1">'
        self.assertEqual(emit._file_kind(statpowers.FILE, head), "critterpowers")
        self.assertEqual(emit._file_kind("gear.xml", ""), "gear")

    def test_ours_reads_the_section_powers_as_critter_powers(self):
        row = '<critterpower id="bb.section-fizz" source="BB" page="9"><name>Fizz</name></critterpower>'
        with tempfile.TemporaryDirectory() as root:
            with open(os.path.join(root, statpowers.FILE), "w", encoding="utf8") as f:
                f.write(
                    f'<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="critterpowers" version="1">{row}</sr6:data>'
                )
            self.assertEqual(
                [(e["kind"], e["id"]) for e in ours._entries(root, "bb")], [("critterpowers", "bb.section-fizz")]
            )


if __name__ == "__main__":
    unittest.main()
