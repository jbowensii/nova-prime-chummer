"""SR6 regroup (importer/sr6/regroup.py): table rows and stat boxes paired with their descriptions. All made up,
in the shape the converter's sr6 layout writes."""
import unittest

from importer.sr6 import regroup
from importer.sr6.regroup import blocks, keys, norm, render

MD = """<!-- page 10 -->
# GADGETS
Gadgets are made-up things.
## Gadget Shop
Shop text.
#### zappers
| GADGET | DV | COST |
|---|---|---|
| Zap Gun | 3P | 100 |
| Fizz Rifle 70 | 4P | 200 |
| Fizz Rifle 75 | 5P | 250 |
| Lost Row | 1S | 10 |
| Zap Gun | 9P | 999 |
#### Zap Gun
A zap gun zaps
#### zap gun in action
things very hard.
#### Fizz Rifle 70/75
Fizz rifles fizz.
<!-- page 11 -->
#### Orphan Gadget (Rating 1–3)
Nobody sells this one.
#### Glow Ward
##### (Indirect Glow, Area)
| RANGE | DV |
|---|---|
| LOS | 3 |
A ward that glows.
• **Cost:** 4 Karma
#### Fuzzbeast
A fuzzy beast roams.
##### fuzzbeast
| B | A | R |
|---|---|---|
| 3 | 4 | 5 |
**Skills:** Sneaking 3, Running
2, Hiding 1
**Weapons:**
Claws [DV 2P]
##### Delta Grunt
##### and Helper (Made Up)
| B | A |
|---|---|
| 1 | 2 |
**Gear:** Stick
## Making Trouble
Trouble rules.
| ROLL | RESULT |
|---|---|
| 1 | Nothing |
| 2 | Sparks |
More trouble text.
# LORE
#### Old Story
Once upon a time.
"""


def _items(text):
    return {b.name: b for b in blocks(text) if b.type == "item"}


class NormTest(unittest.TestCase):
    def test_norm(self):
        self.assertEqual(norm("The Zäp-Gun’s “Best” & Co."), "zap guns best and co")
        self.assertEqual(norm("Zapp Gun", {"zapp gun": "zap gun"}), "zap gun")

    def test_keys(self):
        self.assertEqual(keys("Orphan Gadget (Rating 1–3)"), ["orphan gadget rating 1 3", "orphan gadget"])
        self.assertEqual(keys("Zap Gun"), ["zap gun"])


class RegroupTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text, cls.report = regroup.regroup(MD, name_headers=frozenset({"GADGET"}))
        cls.items = _items(cls.text)
        cls.blocks = blocks(cls.text)

    def rep(self, kind):
        return [r for r in self.report if r["kind"] == kind]

    def test_head(self):
        self.assertEqual(self.text.splitlines()[0], "<!-- regrouped v1 -->")

    def test_pairs_row_and_description(self):
        z = sorted((b for b in self.blocks if b.name == "Zap Gun"), key=lambda b: b.row["COST"])
        self.assertEqual(len(z), 2)
        self.assertEqual(z[0].row, {"GADGET": "Zap Gun", "DV": "3P", "COST": "100"})
        self.assertEqual(z[0].header, ["GADGET", "DV", "COST"])
        self.assertEqual(z[0].label, "zappers")
        self.assertEqual(z[0].text, "A zap gun zaps\nthings very hard.")  # the caption is dropped
        self.assertEqual(z[1].row["COST"], "999")
        self.assertEqual(z[1].text, "")
        self.assertEqual([(r["name"], r["page"]) for r in self.rep("duplicate")], [("Zap Gun", 10)])

    def test_shared_description(self):
        for n in ("Fizz Rifle 70", "Fizz Rifle 75"):
            self.assertEqual(self.items[n].text, "Fizz rifles fizz.")
        self.assertEqual([r["name"] for r in self.rep("shared-description")], ["Fizz Rifle 70/75"])

    def test_unpaired(self):
        self.assertEqual([(r["name"], r["page"], r["table"]) for r in self.rep("unpaired-row")],
                         [("Lost Row", 10, "zappers")])
        self.assertEqual(self.items["Lost Row"].page, 10)
        self.assertEqual(self.items["Lost Row"].text, "")
        # Old Story is in a chapter without catalog tables: not reported
        self.assertEqual([(r["name"], r["page"]) for r in self.rep("unpaired-description")],
                         [("Orphan Gadget (Rating 1–3)", 11)])
        self.assertEqual(self.items["Orphan Gadget (Rating 1–3)"].page, 11)
        self.assertIsNone(self.items["Orphan Gadget (Rating 1–3)"].row)
        self.assertEqual(self.items["Old Story"].chapter, "LORE")

    def test_box_under_heading(self):
        g = self.items["Glow Ward"]
        self.assertEqual(g.tags, "Indirect Glow, Area")
        self.assertEqual(g.stats, [{"RANGE": "LOS", "DV": "3"}])
        self.assertEqual(g.labels, {"Cost": "4 Karma"})
        self.assertEqual(g.text, "A ward that glows.\n• **Cost:** 4 Karma")
        self.assertEqual((g.section, g.level, g.page), ("Gadget Shop", 4, 11))

    def test_titled_box_pairs_case_blind(self):
        f = self.items["Fuzzbeast"]
        self.assertEqual(f.stats, [{"B": "3", "A": "4", "R": "5"}])
        self.assertEqual(f.labels, {"Skills": "Sneaking 3, Running 2, Hiding 1", "Weapons": "Claws [DV 2P]"})
        self.assertEqual(f.text, "A fuzzy beast roams.")
        self.assertNotIn("fuzzbeast", self.items)

    def test_wrapped_box_title(self):
        d = self.items["Delta Grunt and Helper (Made Up)"]
        self.assertEqual((d.stats, d.labels, d.level), ([{"B": "1", "A": "2"}], {"Gear": "Stick"}, 5))

    def test_rule_table_stays_in_section(self):
        s = [b for b in self.blocks if b.type == "section" and b.name == "Making Trouble"][0]
        self.assertEqual(s.text, "Trouble rules.\n| ROLL | RESULT |\n|---|---|\n| 1 | Nothing |\n| 2 | Sparks |\n"
                                 "More trouble text.")
        self.assertEqual((s.chapter, s.section, s.level), ("GADGETS", "Making Trouble", 2))
        self.assertEqual([b.name for b in self.blocks if b.type == "section"],
                         ["GADGETS", "Gadget Shop", "Making Trouble", "LORE"])

    def test_catalog_without_name_header(self):
        # 3 of 5 rows pair: a catalog table even when GADGET isn't a name header
        self.assertEqual(_items(regroup.regroup(MD)[0])["Zap Gun"].row["DV"], "3P")

    def test_alias(self):
        md = MD.replace("| Zap Gun | 3P", "| Zapp Gun | 3P")
        text, _ = regroup.regroup(md, aliases={"zapp gun": "zap gun"}, name_headers=frozenset({"GADGET"}))
        z = [b for b in blocks(text) if b.text.startswith("A zap gun")]
        self.assertEqual(z[0].name, "Zapp Gun")
        self.assertEqual(z[0].row["DV"], "3P")

    def test_round_trip(self):
        self.assertEqual("".join(render(b) for b in self.blocks), self.text[self.text.index("\n") + 1:])
