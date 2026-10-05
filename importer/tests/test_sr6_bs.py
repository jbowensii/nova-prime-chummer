"""SR6 Body Shop recipe (importer/sr6/recipes/bs.py) on a made-up book.md in the converter's sr6 shape (the book's:
descriptions under item headings, priced in a titled catalog table). Every name, number and line is invented."""
import os
import unittest
import xml.etree.ElementTree as ET

from lxml import etree

from importer import sr6
from importer.sr6 import regroup
from importer.sr6.recipes import bs, crb, identify

BOOK_MD = """<!-- page 1 -->
<!-- page 3 -->
# CONTENTS
Made-up contents ........ 9
<!-- page 8 -->
## Made-Up Essence
Essence, made up.
##### Negative Quality: Leaky Glow
**Bonus:** 4 Karma
**Game Effect:** You glow, made up.
<!-- page 30 -->
# CHROME LIFE
## Bodyware
#### Zap Tail
A made-up tail that zaps.
#### Hum Box
A made-up box that hums.
#### BODYWARE
| CYBERWARE | RATING | ESS | CAP | AVAIL | COST |
|---|---|---|---|---|---|
| Hum box | 1–3 | Rating x 0.1 | [1] | 2 | Rating x 500¥ |
| Zap tail |  |  |  |  |  |
| Short | — | 0.2 | — | 3 | 1,000¥ |
| Long | — | 0.4 | — | 4(L) | 2,000¥ |
<!-- page 60 -->
# CHANGING THE CODE
## Geneware
#### Glow Genes
Made-up genes that glow.
#### Therapeutic Geneware Table
| GENEWARE Made-Up Applications | TREATMENT TIME | ESS | AVAIL | COST |
|---|---|---|---|---|
| Glow Genes | 2 weeks | 0.1 | 4 | 9,000¥ |
## Made-Up Symbionts
#### Purr Leech
A made-up leech that purrs.
#### symbionts
| SYMBIONT | ESSENCE | AVAIL | COST |
|---|---|---|---|
| Purr Leech | 0.2 | 3 | 4,000¥ |
## Made-Up Transgenics
#### Fur Pack
Made-up fur.
#### transgenic infusions
| TYPE | ESS | AVAL | COST |
|---|---|---|---|
| Fur Pack | 0.3 | 5(L) | 7,000¥ |
## Made-Up Nanohives
#### Tiny Hive
A made-up hive.
#### nanohives & supports
| CYBERWARE | ESSENCE | AVAIL | COST |
|---|---|---|---|
| Tiny Hive | 0.5 | 6 | 8,000¥ |
#### colonies & nanites
| ITEM Cosmetic/Covert Nanites | COLONY AVAIL | TEMPLATES COST | PRE-BUILT AVAIL | NANITES COST |
|---|---|---|---|---|
| Fizz Swarm | 3(L) | 5,000¥ | 2(L) | 500¥ |
<!-- page 100 -->
# QUICK HITTERS
## Game Information
#### fizz
• **Vector:** Ingestion
• **Power:** 4
• **Availability:** 3
• **Cost:** 70¥
<!-- page 140 -->
# TAMING THE WILD
## Made-Up Critters
#### Puff Hound
A made-up hound, augmented.
##### puff hound
| B | A | R | S | W | L | I | C | ESS |
|---|---|---|---|---|---|---|---|---|
| 5 | 4 | 4 | 3 | 2 | 1 | 4 | 2 | 6 |
| I/ID | AC | CM | MOVE |
|---|---|---|---|
| 8/1 | A1, I2 | 11 | 10/20/+2 |
**Skills:** Athletics 4
<!-- page 170 -->
# EDGE OF ESSENCE
## New Qualities
#### Chrome Crush
You like chrome, made up.
• **Cost:** 6 Karma
• **Game Effect:** Made-up liking.
## Cyborgs
#### Made-Up Shells
A made-up shell.
#### Sleek
##### (Cost: 99,000, Availability: 5)
| BOD | STR | AGI | REA | ARM | CM | CAP |
|---|---|---|---|---|---|---|
| 5 | 4 | 4 | 4 | 8 | 15 | 80 |
<!-- page 180 -->
## A
Made-up index ....... p. 30
"""


def run_recipe(md=BOOK_MD):
    regrouped, _ = regroup.regroup(md, bs.ALIASES, name_headers=bs.NAME_HEADERS, end_page=180, variants=bs.VARIANT_ROWS)
    return bs.extract(regrouped)


def entries(res, kind):
    return {e.findtext("name"): e.attrib for e in ET.fromstring(res.files[f"{kind}.xml"])}


class BsRecipeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_recipe()

    def test_cyberware_variant_rows_named_by_their_group(self):
        a = entries(self.res, "augmentations")
        self.assertEqual(a["Hum box"], {"id": "hum-box", "source": "BS", "page": "29", "type": "cyberware",
                                        "category": "bodyware", "rating": "1–3", "essence": "Rating x 0.1",
                                        "capacity": "[1]", "avail": "2", "cost": "Rating x 500"})
        self.assertEqual((a["Zap tail (Short)"]["essence"], a["Zap tail (Long)"]["cost"]), ("0.2", "2000"))
        self.assertNotIn("Zap tail", a)  # the group row itself is no entry
        texts = {(t.get("of"), t.get("id")): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("tail that zaps", texts[("augmentations", "zap-tail-long")])

    def test_geneware_shells_and_nanites(self):
        a = entries(self.res, "augmentations")
        self.assertEqual((a["Glow Genes"]["type"], a["Glow Genes"]["category"], a["Glow Genes"]["essence"]),
                         ("geneware", "therapeutic-geneware", "0.1"))
        # each with its book's type: symbionts, transgenic infusions, nanohives (nanoware)
        self.assertEqual([(a[n]["type"], a[n]["category"]) for n in ("Purr Leech", "Fur Pack", "Tiny Hive")],
                         [("symbionts", "symbionts"), ("transgenics", "transgenic-infusions"), ("nanoware", "nanohives-supports")])
        s = a["Made-Up Shells (Sleek)"]
        self.assertEqual((s["type"], s["cost"], s["avail"]), ("cyberware", "99000", "5"))
        g = entries(self.res, "gear")
        self.assertEqual((g["Fizz Swarm (colony template)"]["cost"], g["Fizz Swarm (pre-built)"]["avail"]), ("5000", "2(L)"))
        self.assertEqual((g["Fizz"]["category"], g["Fizz"]["cost"], g["Fizz"]["avail"]), ("drugs", "70", "3"))

    def test_qualities_critters_and_rules(self):
        q = entries(self.res, "qualities")
        self.assertEqual((q["Leaky Glow"]["kind"], q["Leaky Glow"]["karma"]), ("negative", "4"))
        self.assertEqual((q["Chrome Crush"]["kind"], q["Chrome Crush"]["karma"]), ("positive", "6"))
        c = entries(self.res, "critters")["Puff Hound"]
        self.assertEqual((c["category"], c["bod"], c["ess"]), ("augmented critter", "5", "6"))
        r = entries(self.res, "rules")
        self.assertEqual(r["Made-Up Essence"]["chapter"], bs.FIRST_CHAPTER)
        self.assertNotIn("A", r)  # the index is left out

    def test_files_validate(self):
        for name, xml in list(self.res.files.items()) + [("texts", self.res.texts)]:
            doc = etree.fromstring(xml.encode("utf8"))
            schema = etree.XMLSchema(etree.parse(os.path.join(sr6.SCHEMA_DIR, doc.get("kind") + ".xsd")))
            self.assertTrue(schema.validate(doc), f"{name}: {schema.error_log.last_error}")

    def test_match(self):
        self.assertEqual(bs.match({"sha256": bs.SHA256[0]}, ""), 1.0)
        self.assertEqual(bs.match({"sha256": "x", "title": "Shadowrun: Body Shop"}, ""), 0.9)
        self.assertIs(identify({"sha256": "x", "title": "Body Shop"}, BOOK_MD[:4000])[0], bs)
        self.assertEqual(crb.match({"sha256": "x"}, BOOK_MD[:4000]), 0.0)


if __name__ == "__main__":
    unittest.main()
