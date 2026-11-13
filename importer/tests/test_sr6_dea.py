"""SR6 Deus Ex Arcana recipe (importer/sr6/recipes/dea.py) on a made-up book.md in the converter's sr6 shape for this
book (tag lines and spell bands printed as body text, a being's title a plain line). Every name and number is invented.
"""

import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import dea, identify

BOOK_MD = """<!-- page 1 -->
# ARCANA UNLEASHED
## New Spells
#### Fizz Bolt
(Combat)
**Range Type Duration DV**
LOS (A) P 5 3
A made-up spell that fizzes.
#### Glow Hand
(Direct Combat)
**Range Type Duration DV Damage**
Touch M I 5 P, Special
A made-up spell that glows.
### Echo
(Detection)
**Range Type Duration DV**
Touch P S 4
LOS (A) P S 5
A made-up spell that echoes.
#### Bright Rite
(Anchored)
**Threshold:** 4
**Ritual Time:** 1 hour
A made-up ritual.
#### New Critter Powers
#### Zap
**Type Action Range Duration**
P Major LOS Sustained
A made-up power.
## Metagenic Qualities
#### Glow Skin
Cost: 4 Karma
A made-up quality.
"""


def run_recipe(md=BOOK_MD):
    """The DEA recipe's result for the book markdown `md`."""
    regrouped, _ = regroup.regroup(dea.prepare_md(md), dea.ALIASES, name_headers=dea.NAME_HEADERS)
    return dea.extract(regrouped)


def entries(res, kind):
    """{name: attributes} of the entries of `kind` in a recipe result."""
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class DeaRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def test_spell_bands_become_tables(self):
        md = dea.prepare_md(BOOK_MD)
        self.assertIn("| LOS (A) | P | S | 3 |", md)  # the digit 5 for S is the book's face
        self.assertIn("| DAMAGE |", md)

    def test_spells(self):
        s = entries(self.res, "spells")
        self.assertEqual(
            (s["Fizz Bolt"]["category"], s["Fizz Bolt"]["range"], s["Fizz Bolt"]["dv"]), ("combat", "LOS (A)", "3")
        )
        self.assertEqual(s["Fizz Bolt"]["duration"], "S")
        self.assertEqual(s["Glow Hand"]["category"], "combat")  # from its `Direct Combat` tag

    def test_a_band_row_per_range_is_a_spell_each(self):
        s = entries(self.res, "spells")
        self.assertEqual((s["Echo, Touch"]["dv"], s["Echo, LOS"]["dv"]), ("4", "5"))

    def test_rituals_powers_and_qualities(self):
        self.assertEqual(entries(self.res, "rituals")["Bright Rite"]["threshold"], "4")
        self.assertIn("Zap", entries(self.res, "critterpowers"))
        self.assertEqual(entries(self.res, "qualities")["Glow Skin"]["karma"], "4")

    def test_recipe_is_found_by_title(self):
        self.assertIs(identify({"title": "Shadowrun: Deus Ex Arcana"}, "")[0], dea)

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")
