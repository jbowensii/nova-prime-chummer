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
Sense, Fizz Bolt, Increase
Reflexes, Mend Glow
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
