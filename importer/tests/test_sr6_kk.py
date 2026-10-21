"""SR6 Krime Katalog recipe (importer/sr6/recipes/kk.py) on a made-up book.md in the converter's sr6 shape (the book's:
an item a page, its Fifth and Sixth Edition stats side by side under one caption, the running head read as a chapter
heading on every page). Every name, number and line is invented."""

import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import crb, identify, kk

BOOK_MD = """<!-- page 1 -->
<!-- page 2 -->
# KRIME KATALOG
**Corporate Slogan:** Made up!
A made-up company.
<!-- page 3 -->
# KRIME KATALOG
## Krime Popper
A made-up pistol that pops.
krime popper: sr5 stats krime popper: sr6 stats
| ACC | DAM | AP | MODE | RC | AMMO | AVAIL | COST | DV | MODES | ATTACK | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | 7P | — | SA | — | 9(c) | 6R | 150¥ | 3P | SA | RATINGS 7/7/—/—/— | 9(c) | 2(L) | 150¥ |
<!-- page 4 -->
# KRIME KATALOG
## Krime Twin
A made-up gun with a launcher.
> Made up, says a made-up poster krime twin: sr6 stats
| DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|
| 4P | SA/BF | 8/8/5/—/— | 20(c) | 4(L) | 900¥ |
krime twin GL: sr6 stats
| DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|
| As Grenade | SS | 4/9/5/—/— | 3(m) | — | — |
<!-- page 5 -->
# KRIME KATALOG
## AMMUNITION
##### Krime Fizz Rounds
Made-up rounds that fizz.
##### Krime Glow Slugs Extra Bright
Made-up slugs that glow.
ammo, per 10 rounds: sr5 stats ammo, per 10 rounds: sr6 stats
| NAME | DAM MOD | AP MOD | AVAIL | COST | TYPES | AR | DV | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|
| Krime Fizz Rounds | — | — | 3R | 75¥ | Krime Fizz Rounds | — | — | 3(L) | x2 |
|  |  |  |  |  | Krime Glow Slugs | +2 | +1 | 6(I) | x3 |
|  |  |  |  |  | Extra Bright |  |  |  |  |
<!-- page 6 -->
# KRIME KATALOG
## Krime Putter Car
A made-up car that putters.
krime putter: sr5 stats
| HAND | SPEED | ACCEL | BOD | ARM | PILOT | SENS | SEATS | AVAIL | COST |
|---|---|---|---|---|---|---|---|---|---|
| 3/1 | 3 | 1 | 8 | 4 | 1 | 1 | 2 | 4 | 9,000¥ |
<!-- page 7 -->
# KRIME KATALOG
krime putter: sr6 stats
| HAND | ACCEL | SPEED INT | TOP SPEED | BODY | ARMOR |
|---|---|---|---|---|---|
| 2/4 | 4 | 10 | 60 | 4 | 2 |
| PILOT | SENSOR | SEAT | AVAIL | COST |
|---|---|---|---|---|
| 1 | 1 | 2 | 2 | 9,000¥ |
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, kk.ALIASES, name_headers=kk.NAME_HEADERS)
    return kk.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class KkRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def test_weapons_read_from_the_sr6_half(self):
        w = entries(self.res, "weapons")
        self.assertEqual(
            w["Krime Popper"],
            {
                "id": "krime-popper",
                "source": "KK",
                "page": "3",
                "category": "Firearms",
                "dv": "3P",
                "modes": "SA",
                "ar": "7/7/—/—/—",
                "ammo": "9(c)",
                "avail": "2(L)",
                "cost": "150",
            },
        )
        self.assertEqual((w["Krime Twin"]["cost"], w["Krime Twin (GL)"]["dv"]), ("900", "As Grenade"))

    def test_ammo_rows_joined_and_vehicle_across_pages(self):
        g = entries(self.res, "ammotypes")  # (priced as a multiple of the ammunition: catalog.ammo_type)
        self.assertEqual((g["Krime Fizz Rounds"]["category"], g["Krime Fizz Rounds"]["avail"]), ("Ammo", "3(L)"))
        self.assertEqual(g["Krime Glow Slugs Extra Bright"]["cost"], "x3")
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("slugs that glow", texts[("ammotypes", "krime-glow-slugs-extra-bright")])
        self.assertTrue(
            g["Krime Glow Slugs Extra Bright"].get("ar") == "+2"
            or "**Ar:** +2" in texts[("ammotypes", "krime-glow-slugs-extra-bright")]
        )
        v = entries(self.res, "vehicles")["Krime Putter Car"]  # the SR5 table on its page, the SR6 one on the next
        self.assertEqual(
            (v["handling"], v["interval"], v["armor"], v["seats"], v["cost"]), ("2/4", "10", "2", "2", "9000")
        )

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(kk.match({"sha256": kk.SHA256[0]}, ""), 1.0)
        self.assertEqual(kk.match({"sha256": "x", "title": "Krime Katalog"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": ""}, BOOK_MD[:4000])[0], kk)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()


SPLIT_MD = """<!-- page 3 -->
# KRIME KATALOG
## Krime Zapper
A made-up pistol whose two editions' boxes read as tables of their own.
krime zapper: sr5 stats krime zapper: sr6 stats
| ACC | DAM | AP | MODE | RC | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|
| 4 | 7P | — | SA | — | 9(c) | 6R | 150¥ |
| DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|
| 3P | SA | 7/7/—/—/— | 9(c) | 2(L) | 160¥ |
<!-- page 4 -->
# KRIME KATALOG
## Krime Buzzer
A made-up rifle whose captions print on two lines.
krime buzzer: sr5 stats
krime buzzer: sr6 stats
| ACC | DAM | AP | MODE | RC | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|---|
| 5 | 9P | –1 | SA | — | 20(c) | 8R | 900¥ |
| DV | MODES | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|
| 4P | SA | 3/9/7/—/— | 20(c) | 3(L) | 950¥ |
"""


class SplitBoxesTest(unittest.TestCase):
    def test_the_sr6_box_after_the_sr5_box(self):
        w = entries(run_recipe(SPLIT_MD), "weapons")
        self.assertEqual(
            {n: (w[n]["dv"], w[n]["cost"]) for n in w}, {"Krime Zapper": ("3P", "160"), "Krime Buzzer": ("4P", "950")}
        )
