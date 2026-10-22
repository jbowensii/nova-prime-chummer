"""A stat block's labelled list wrapped inside an entry's name (regroup._goes_on): the next line goes on with the list,
whatever the label (Spells, Qualities, Complex Forms as Powers already did). Invented text only."""

import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup
from importer.sr6.recipes import general

# pylint: disable=protected-access  # tests reach into the module internals they cover

BOOK = next(b for b in general.RECIPES if b.ID == "THN")
MD = """<!-- page 1 -->
# CONTENTS & CREDITS
Made-up contents ........ 2
<!-- page 20 -->
# CAST OF FAKES
## Contacts
The fakes below are made up.
##### Glow Priest
Made-up troll
**Age:** 43 **Height/weight:** 2.2m/175kg
**Connection Rating:** 2
**Preferred Payment:** Nuyen or favors
The glow priest is a made-up street doc who hums
while working.
| B | A | R | S | W | L | I | C | EDG | M | ESS |
|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 2 | 3 | 6 | 4 | 5 | 5 | 2 | 4 | 6 | 6.0 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 11 | 8/1 | A1, I2 | 11/10 | 10/15/+1 |
**Skills:** Astral 4, Conjuring
4, Sorcery 5
**Spells:** Glow Ward, Hum Haze, Combat
Sense, Fizz Bolt, Increase Reflexes, Mend
Glow
**Gear:** Made-up armor
##### Hum Seller
Made-up elf
**Connection Rating:** 1
"""


class WrappedListTest(unittest.TestCase):
    def test_a_spells_line_wrapped_inside_a_name_reads_whole(self):
        text, _ = regroup.regroup(BOOK.prepare_md(MD), BOOK.ALIASES, name_headers=BOOK.NAME_HEADERS)
        npc = ET.fromstring(BOOK.extract(text).files["npcs.xml"]).find("npc")
        self.assertEqual(npc.findtext("gear"), "Made-up armor")
        self.assertEqual(
            npc.findtext("spells"),
            "Glow Ward, Hum Haze, Combat Sense, Fizz Bolt, Increase Reflexes, Mend Glow",
        )

    def test_any_list_label_goes_on_with_a_title_case_list(self):
        for key in ("Spells", "Qualities", "Complex Forms", "Gear"):
            label = ([{key: "Zap, Hum, Combat"}], key)
            self.assertTrue(regroup._goes_on(label, "Sense, Fizz Bolt, Mend Glow"), key)
            self.assertFalse(regroup._goes_on(label, "Zorp hums in packs, and glows"), key)  # (prose)
            self.assertFalse(regroup._goes_on(label, "Sense, Fizz Bolt, Mend Glow."), key)  # (a sentence)
            self.assertFalse(regroup._goes_on(([{key: "Zap, Hum (4)"}], key), "Sense, Fizz Bolt"), key)  # (whole)
            # a lone name's end goes on only when a labelled line follows it
            self.assertTrue(regroup._goes_on(label, "Sense", labelled_next=True), key)
            self.assertFalse(regroup._goes_on(label, "Sense", labelled_next=False), key)
            self.assertFalse(regroup._goes_on(label, "Glow Priest hums", labelled_next=True), key)


BACKGROUNDS = """<!-- page 20 -->
# CAST
## Backgrounds
### The Glow Doctor
The glow doctor heals with hums.
#### Additional recommendations
• **Skills:** Biotech 4
• **Knowledge skills:** Dive Bars, Friends in Low
Places, Poisons
### The Hum Seller
The hum seller sells hums and more hums.
#### Additional recommendations
• **Skills:** Con 6
Any hum seller picks a favourite hum.
"""


class LabelledHeadingTest(unittest.TestCase):
    def test_a_heading_over_labelled_lines_only_keeps_them(self):
        """Read whole, one background's labelled recommendations are not the next one's (regroup._merge_boxes)."""
        text, _ = regroup.regroup(BACKGROUNDS)
        doctor, seller = text.split('<!-- section {"name": "The Hum Seller"')
        self.assertIn("**Knowledge skills:** Dive Bars, Friends in Low Places, Poisons", doctor)
        self.assertIn("**Skills:** Biotech 4", doctor)
        self.assertNotIn("Biotech", seller)

    def test_a_lone_line_after_a_two_word_entry_goes_on_only_when_a_label_follows(self):
        value = "Drone Models, Matrix Hardware Protocols, Security Systems"
        label = ([{"Knowledge skills": value}], "Knowledge skills")
        self.assertTrue(regroup._goes_on(label, "Design", labelled_next=True))
        self.assertFalse(regroup._goes_on(label, "Design", labelled_next=False))
        self.assertFalse(regroup._goes_on(label, "Design Fans Hum", labelled_next=False))
        self.assertFalse(regroup._goes_on(label, "Design Fans Hum Loudly Now", labelled_next=True))  # (prose)
        self.assertFalse(regroup._goes_on(label, "Design.", labelled_next=True))  # (a sentence)
        self.assertFalse(regroup._goes_on(label, "Design, Fizz Bolt"))  # (a list line needs a one-word cut)

    def test_a_message_header_keeps_its_subject_and_sent_lines_after_a_wrapped_from(self):
        md = """<!-- page 1 -->
# CONTENTS & CREDITS
Made-up contents ........ 2
<!-- page 20 -->
# MADE-UP MESSAGES
##### Access File Zorp
**To:** Alex Fake, Chief Fizz, Zap Corp Delegate
**From:** Mo Fake, Zap Macro
Delegate
**Subject:** Schedule Change
**Sent:** 03-31-84/0631:42 **Greetings Alex,**

I saw the made-up schedule and I do not like it at all, so please change it before the vote.
"""
        text, _ = regroup.regroup(BOOK.prepare_md(md), BOOK.ALIASES, name_headers=BOOK.NAME_HEADERS)
        # (the header's labelled lines print again in the block's text, as they do when the From line is not wrapped)
        self.assertEqual(text.count("**Subject:** Schedule Change"), 2)
        self.assertEqual(text.count("**Sent:** 03-31-84/0631:42"), 2)
        self.assertNotIn("\nDelegate\n", text)  # (the wrap joined the From line)
