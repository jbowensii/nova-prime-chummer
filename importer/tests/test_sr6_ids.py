"""importer/sr6/ids.py slug: frozen output (an SR6 id must never move), and the same as amps.slug today."""

import unittest

from importer.recipes import amps
from importer.sr6.ids import slug

FROZEN = {
    "Zap Stick™": "zap-stick",
    "Gutter’s Café Crème": "gutters-cafe-creme",
    "Won't  Stop -- Hopping!": "wont-stop-hopping",
    "à la Carte (Rating 1–3)": "a-la-carte-rating-1-3",
    "Ünïcode Ñame": "n-code-ame",
    "  --leading and trailing--  ": "leading-and-trailing",
    "x" * 70: "x" * 60,
}


class SlugTest(unittest.TestCase):
    def test_frozen(self):
        self.assertEqual({k: slug(k) for k in FROZEN}, FROZEN)
        self.assertEqual({k: amps.slug(k) for k in FROZEN}, FROZEN)  # nothing moved when SR6 took its own copy
