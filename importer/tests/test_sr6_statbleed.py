"""A stat block's last labelled line takes no text from outside the block (importer/sr6/regroup.py _foreign): the
paragraph after it, a page's other column, the back cover (Cutting Black p. 176: the blurb in ALPHA MERGE's attacks),
a footnote or the next entry's art title (Wild Life's `// **NAME** //`). tools/statbleed.py flags what still does.
The shapes are the books'; every name, number and line is invented."""
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup
from importer.sr6.recipes import general
from tools import statbleed

BOOK = next(b for b in general.RECIPES if b.ID == "THN")

BOOK_MD = """<!-- page 1 -->
# CAST OF FAKES
## Grunts
#### Fizz Swarm
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| F+3 | F+2 | F+2 | F+3 | F+1 | F | F+1 | F | F |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| F + 4 | (F x 2) + 3D6 | A1, I5 | (F/2)+7 | 5/10/+2 |
**Skills:** Astral, Athletics, Close Combat, Percep-
tion, Stealth
**Attacks:**
Made-up claw [DV [(Force/2) + 2]P,
Attack Ratings (F x 2) +4/—/—/—/—]
<!-- page 2 -->
**MADE-UP WORDS SCREAM.** Made-up voices drift
through the night and the noise grinds at your soul.
The made-up world is changing. Hold on, buckle up,
and try to survive the made-up campaign book.
$44.99
#### Glow Medic
| B | A | R | S | W | L | I | C | M | ESS |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 3 | 2 | 5 | 3 | 4 | 5 | 6 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 5 | 10/4 | A1, I5 | 10 | 10/15/+1 |
**Skills:** Conjuring 5 (Summoning +3), Sorcery 4
(Spellcasting +2)
**Spells*:** Made-up Bolt, Made-up Heal
**Weapons:**
Zap rod [Clubs, DV 4S, 8/—/—/—/—]
When the fighting starts, the medic uses non-lethal
methods on everything. She will also order spirits
to take fallen team members out of the fight.
#### Puff Eel
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 4 | 4 | 5 | 4 | 2 | 1 | 4 | 1 | 6 |
| DR | I/ID | AC | CM | MOVE |
|---|---|---|---|---|
| 6 | 9/1 | A1, I2 | 10 | 15/25/+2 |
**Augmentations:** The eel has made-up implants that raise its stats to the
numbers noted. It also gains a +2 dice pool bonus, and has the
following: made-up fin 2, made-up gill 3
**Weapons:**
Bite* [Close Combat, DV 4P, 12/—/—/—/—]
***Note:** Use Bite for made-up rams.
// **MUD SPRITE** //
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(BOOK.prepare_md(md), BOOK.ALIASES, name_headers=BOOK.NAME_HEADERS)
    return regrouped, BOOK.extract(regrouped)


class StatBlockBleedTest(unittest.TestCase):
    def test_npc_stat_block_bleed(self):
        regrouped, res = run_recipe()
        labels = {b.name: b.labels for b in regroup.blocks(regrouped)}
        # the back cover after a page break stays out of the last labelled line; the line's own wrap is kept
        self.assertEqual(labels["Fizz Swarm"]["Attacks"],
                         "Made-up claw [DV [(Force/2) + 2]P, Attack Ratings (F x 2) +4/—/—/—/—]")
        self.assertEqual(labels["Fizz Swarm"]["Skills"], "Astral, Athletics, Close Combat, Perception, Stealth")
        # the paragraph after the block is the block's text; a wrap at a space (`Sorcery 4` + `(Spellcasting +2)`)
        # is the value's; a label with a footnote mark is a label
        m = labels["Glow Medic"]
        self.assertEqual(m["Weapons"], "Zap rod [Clubs, DV 4S, 8/—/—/—/—]")
        self.assertEqual(m["Skills"], "Conjuring 5 (Summoning +3), Sorcery 4 (Spellcasting +2)")
        self.assertEqual(m["Spells"], "Made-up Bolt, Made-up Heal")
        # a value the book prints as prose goes on; a footnote and the next entry's art title stay out
        e = labels["Puff Eel"]
        self.assertTrue(e["Augmentations"].endswith("following: made-up fin 2, made-up gill 3"), e["Augmentations"])
        self.assertEqual(e["Weapons"], "Bite* [Close Combat, DV 4P, 12/—/—/—/—]")
        # what the readers write: no stat line of any being the scanner flags but the value the book prints as prose
        # (the scanner can't tell it from a bleed: it lists it)
        beings = [x for k in statbleed.KINDS if f"{k}.xml" in res.files for x in ET.fromstring(res.files[f"{k}.xml"])]
        self.assertEqual({x.findtext("name") for x in beings}, {"Fizz Swarm", "Glow Medic", "Puff Eel"})
        flagged = [(x.findtext("name"), c.tag) for x in beings for c in x
                   if c.tag not in statbleed.SKIP and statbleed.why(c.text)]
        self.assertEqual(flagged, [("Puff Eel", "augmentations")])

    def test_the_scanner_flags_bled_lines(self):
        self.assertEqual(statbleed.why("Natural weapon (claw/bite) [DV 2P, 8/—/—/—/—]"), "")
        self.assertEqual(statbleed.why("Astral 7 (Astral Signatures +2), Athletics 4 (Throwing +2), Stealth 5"), "")
        self.assertIn("bold", statbleed.why("Claw [DV 2P, 8/—/—/—/—] **VOICES SCREAM.** Made-up blurb."))
        self.assertIn("prose", statbleed.why("Staff [Clubs, DV 4S, 8/—/—/—/—] When the fighting starts, the medic "
                                             "uses non-lethal methods on everything. She will also order spirits to "
                                             "take fallen team members out of the fight."))


if __name__ == "__main__":
    unittest.main()
