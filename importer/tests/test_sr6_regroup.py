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
        # 3 of 5 rows pair (at least half): a catalog table even when GADGET is not a name header
        self.assertEqual(_items(regroup.regroup(MD)[0])["Zap Gun"].row["DV"], "3P")

    def test_alias(self):
        md = MD.replace("| Zap Gun | 3P", "| Zapp Gun | 3P")
        text, _ = regroup.regroup(md, aliases={"zapp gun": "zap gun"}, name_headers=frozenset({"GADGET"}))
        z = [b for b in blocks(text) if b.text.startswith("A zap gun")]
        self.assertEqual(z[0].name, "Zapp Gun")
        self.assertEqual(z[0].row["DV"], "3P")

    def test_round_trip(self):
        self.assertEqual("".join(render(b) for b in self.blocks), self.text[self.text.index("\n") + 1:])


MD2 = """<!-- page 20 -->
# WIDGETS
#### Blinkers
#### Blinkers
Blinkers blink.
#### blinker XI on a desk
#### Glowware
Glowware glows (the implant).
<!-- page 21 -->
#### Hum Box MK-2/MK-4
Hum boxes hum.
#### Sparkle Kit
Kits sparkle.
#### Glowware
Glowware glows (the gadget).
#### hand tools
| TOOL | AVAIL | COST |
|---|---|---|
| Glowware | 1 | 10 |
| Hum Box MK-2 | 2 | 20 |
| Hum Box MK-4 | 2 | 40 |
| Sparkle kit, small | 1 | 5 |
| Sparkle kit, large | 2 | 9 |
| Blinker 2 | 1 | 1 |
**Wireless bonus:** Tools hum along.
<!-- page 22 -->
#### implants
| IMPLANT | ESSENCE | CAPACITY | AVAIL | COST |
|---|---|---|---|---|
| Glowware | 0.1 | 1 | 2 | 100 |
| Eyes basic system |  |  |  |  |
| Rating 1 | 0.1 | 1 | 2 | 1,000 |
| Rating 2 | 0.2 | 4 | 2 | 3,000 |
| Coat | 0.2 | 1 | 1 | 50 |
| w/hood | 0.3 | 1 | 1 | 70 |
#### Coat
Coats coat.
#### Eyes
Eyes see.
"""


class RegroupRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text, cls.report = regroup.regroup(MD2, aliases={"eyes basic system": "eyes"})
        cls.blocks = blocks(cls.text)

    def rows(self, name):
        return [b for b in self.blocks if b.name == name]

    def test_repeated_heading_and_capitalised_caption(self):
        self.assertEqual([b.text for b in self.blocks if b.name.startswith("Blinker")], ["Blinkers blink."])
        self.assertFalse([r for r in self.report if r["kind"] == "duplicate" and r["name"] == "Blinkers"])

    def test_loose_keys(self):
        self.assertEqual(self.rows("Blinker 2")[0].text, "Blinkers blink.")  # number and plural s
        for n in ("Sparkle kit, small", "Sparkle kit, large"):
            self.assertEqual(self.rows(n)[0].text, "Kits sparkle.")
        for n in ("Hum Box MK-2", "Hum Box MK-4"):
            self.assertEqual(self.rows(n)[0].text, "Hum boxes hum.")

    def test_title_over_a_list_is_not_a_box(self):
        self.assertFalse([r for r in self.report if r["kind"] == "unpaired-box"])
        self.assertEqual(self.rows("Hum Box MK-2")[0].label, "hand tools")

    def test_same_name_in_two_tables_takes_the_nearest(self):
        g = {b.row["COST"]: b.text for b in self.rows("Glowware")}
        # the wider implant table chooses first and takes the nearer heading; both rows are reported
        self.assertEqual(g, {"100": "Glowware glows (the gadget).\n**Wireless bonus:** Tools hum along.",
                             "10": "Glowware glows (the implant)."})
        self.assertEqual([r["of"] for r in self.report if r["kind"] == "duplicate"], ["heading", "row"])

    def test_rating_and_variant_rows(self):
        self.assertEqual([b.name for b in self.blocks if b.text in ("Eyes see.", "Coats coat.")],
                         ["Coat", "Coat w/hood", "Eyes basic system (Rating 1)", "Eyes basic system (Rating 2)"])
        self.assertFalse(self.rows("Eyes basic system"))
        self.assertEqual(self.rows("Coat w/hood")[0].row["COST"], "70")


MD3 = """<!-- page 30 -->
# CRITTERS
### Pest Control
##### (Made Up, Tags)
**Threshold:** 3
**Untrained:** No
Pests are controlled.
### Hack the Gizmo
##### (legal) Gizmo + Logic (Major)
##### Outsider/User
Gizmos get hacked.
### Small Homes
##### Cost: 5 nuyen a month
Small homes are small.
##### mud rat
| B | A |
|---|---|
| 1 | 2 |
**Skills:** Biting 2
#### Mud Rat/Dust Rat
Rats of mud and dust.
##### dust rat
| B | A |
|---|---|
| 2 | 1 |
**Skills:** Biting 3
#### Sky Whale
##### SKY WHALE
| B | A |
|---|---|
| 9 | 1 |
**Skills:** Floating 5
#### Teacher
**Uses:** Lessons
Teachers teach.
##### teacher
| B | A |
|---|---|
| 1 | 1 |
"""


class RegroupSectionsAndBoxesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text, cls.report = regroup.regroup(MD3)
        cls.blocks = {b.name: b for b in blocks(cls.text)}

    def test_section_tag_lines_and_labels(self):
        p = self.blocks["Pest Control"]
        self.assertEqual((p.type, p.tags, p.labels, p.text),
                         ("section", "Made Up, Tags", {"Threshold": "3", "Untrained": "No"}, "Pests are controlled."))
        self.assertEqual(self.blocks["Hack the Gizmo"].tags, "(legal) Gizmo + Logic (Major); Outsider/User")
        self.assertEqual(self.blocks["Small Homes"].labels, {"Cost": "5 nuyen a month"})

    def test_boxes_sharing_a_description(self):
        for n, s in (("mud rat", {"B": "1", "A": "2"}), ("dust rat", {"B": "2", "A": "1"})):
            self.assertEqual((self.blocks[n].stats, self.blocks[n].text), ([s], "Rats of mud and dust."))
        self.assertNotIn("Mud Rat/Dust Rat", self.blocks)
        self.assertEqual([r["kind"] for r in self.report], ["shared-description"])

    def test_box_title_right_under_its_heading(self):
        self.assertEqual(self.blocks["Sky Whale"].labels, {"Skills": "Floating 5"})
        self.assertNotIn("SKY WHALE", self.blocks)

    def test_box_joins_a_description_with_labels(self):
        t = self.blocks["Teacher"]
        self.assertEqual((t.labels, t.stats, t.text), ({"Uses": "Lessons"}, [{"B": "1", "A": "1"}], "Teachers teach."))


class SideBySideTest(unittest.TestCase):
    def test_items_side_by_side_share_the_text(self):
        md = ("# SPELLS\n#### Glow Dart\n##### (Glow)\n| RANGE | DV |\n|---|---|\n| LOS | 2 |\n"
              "#### Glow Storm\n##### (Glow, Area)\n| RANGE | DV |\n|---|---|\n| LOS (A) | 3 |\n<!-- page 9 -->\n"
              "Dart hits one, storm hits all.\n#### Dim Ward\n##### (Dim)\n| RANGE | DV |\n|---|---|\n| T | 1 |\n"
              "#### Dim Veil\n**Cost:** 2 Karma\nVeils dim.\n")
        text, report = regroup.regroup(md)
        b = {b.name: b for b in blocks(text)}
        self.assertEqual([b["Glow Dart"].text, b["Glow Storm"].text], ["Dart hits one, storm hits all."] * 2)
        self.assertEqual(b["Dim Ward"].text, "")  # Dim Veil has no band: not side by side
        self.assertEqual([(r["kind"], r["rows"]) for r in report], [("shared-description", "Glow Dart; Glow Storm")])


MD4 = """<!-- page 40 -->
# TOYS
## Toy Shop
### Kites
#### Kites
Kites in general fly.
#### kites
| TOY | COST |
|---|---|
| Box Kite | 10 |
| Delta Kite | 20 |
#### Sky Decks
| TOY | COST |
|---|---|
| Cloud Deck | 300 |
| Storm Deck | 500 |
#### fuses
| FUSE | COST |
|---|---|
| Rating 1 | 5 |
| Rating 2 | 9 |
#### Box Kite
A kite like a box.
#### Glow Sense
**Cost:** 1 Toy Point
The toy senses glow.
#### Glow Sense
##### (Passive)
| RANGE | DV |
|---|---|
| T | 2 |
The spell senses glow.
#### Gadget Sprite
Sprites fix toys.
**Powers:** Zap, Fizz
Storm
## Toy Rules
#### Winding Up
Toys wind up.
<!-- page 41 -->
# INDEX
Box Kite, 40
"""


class RealBookShapesTest(unittest.TestCase):
    """Shapes the real core rulebook prints (all made up here)."""

    @classmethod
    def setUpClass(cls):
        cls.text, cls.report = regroup.regroup(MD4, name_headers=frozenset({"TOY", "FUSE"}), end_page=41)
        cls.blocks = blocks(cls.text)

    def items(self, name):
        return [b for b in self.blocks if b.name == name and b.type == "item"]

    def test_title_over_a_list_named_like_a_heading(self):
        self.assertEqual(self.items("Delta Kite")[0].label, "kites")  # not a box although `#### Kites` exists

    def test_catalog_under_an_item_heading_takes_its_title(self):
        self.assertEqual(self.items("Storm Deck")[0].label, "Sky Decks")

    def test_rating_rows_with_no_group_row_take_the_first_header(self):
        self.assertEqual([b.name for b in self.blocks if b.label == "fuses"], ["Fuse (Rating 1)", "Fuse (Rating 2)"])

    def test_an_item_with_its_own_band_and_text_is_whole(self):
        g = self.items("Glow Sense")
        self.assertEqual([(b.stats, b.text) for b in g], [([], "The toy senses glow."),
                                                         ([{"RANGE": "T", "DV": "2"}], "The spell senses glow.")])

    def test_a_last_line_before_a_heading_ends_a_label(self):
        self.assertEqual(self.items("Gadget Sprite")[0].labels["Powers"], "Zap, Fizz Storm")

    def test_unpaired_description_only_in_a_section_with_a_catalog(self):
        self.assertEqual([r["name"] for r in self.report if r["kind"] == "unpaired-description"], ["Sky Decks", "Gadget Sprite"])
        self.assertNotIn("Winding Up", [r["name"] for r in self.report])

    def test_end_page_leaves_out_the_back_matter(self):
        self.assertNotIn("INDEX", self.text)
        self.assertEqual(self.blocks[-1].name, "Winding Up")


STACKED = """<!-- page 5 -->
# BLASTERS
## Blaster Shop
#### Zorp Cannon
A zorp cannon zorps.
| NAME | TYPE | DV | MODE | ATTACK |
|---|---|---|---|---|
|  |  |  |  | RATINGS |
| Zorp Cannon | Launcher | 4P | SS | —/5/6/7/8 |
| AMMO | AVAIL | COST |
|---|---|---|
| 2(c) | 6(I) | 9,000¥ |
#### Fizz Charges
Fizzy.
| PRODUCT | EFFECT |
|---|---|
| Fizz Charges | fizzy |
| NAME | AVAIL | COST |
|---|---|---|
| Fizz Charges | 2 | 30¥ |
##### Blasters
| NAME | DV | AVAIL | COST |
|---|---|---|---|
| Blip Gun | 2P | 2 | 100¥ |
**Note:** a blip gun blips.
The note goes on over a line or two of plain text.
| NAME | DV | AVAIL | COST |
|---|---|---|---|
| Blop Gun | 3P | 3 | 200¥ |
"""


class StackedTablesTest(unittest.TestCase):
    """Invented: a row set as two stacked bands, a header cell on two lines, a box's next row after a note."""

    @classmethod
    def setUpClass(cls):
        cls.items = _items(regroup.regroup(STACKED)[0])

    def test_second_band_joins_the_row(self):
        r = self.items["Zorp Cannon"].row
        self.assertEqual((r["ATTACK RATINGS"], r["AMMO"], r["AVAIL"], r["COST"]), ("—/5/6/7/8", "2(c)", "6(I)", "9,000¥"))

    def test_a_second_table_of_the_names_stays_apart(self):
        tables = regroup._elements(STACKED)
        heads = [t.header for k, _, t in tables if k == "t"]
        self.assertIn(["PRODUCT", "EFFECT"], heads)
        self.assertIn(["NAME", "AVAIL", "COST"], heads)

    def test_a_box_row_after_a_note_stays_in_the_box(self):
        stats = self.items["Blasters"].stats
        self.assertEqual([s["NAME"] for s in stats], ["Blip Gun", "Blop Gun"])


class RepairRowTest(unittest.TestCase):
    """Invented rows with two cells run together by the converter."""
    H = ["NAME", "DV", "MODE", "ATTACK RATINGS", "AMMO", "AVAIL", "COST"]

    def test_mode_and_attack_ratings_run_together(self):
        row = ["Zorp", "9P", "SA(2)—/4/6/8/9(3km)", "Energy", "5(I)", "1,000¥", "2,000¥"]
        self.assertEqual(regroup._repair_row(self.H, row),
                         ["Zorp", "9P", "SA(2)", "—/4/6/8/9(3km)", "Energy", "5(I)", "1,000¥"])

    def test_attack_ratings_and_ammo_run_together(self):
        h = self.H[:5] + ["TYPE"] + self.H[5:]
        row = ["Blarg", "8P", "SS (1)", "—/—/7/9/9 (5km) 10(br) + Energy", "Z1", "6(I)", "900¥", "50¥"]
        self.assertEqual(regroup._repair_row(h, row),
                         ["Blarg", "8P", "SS (1)", "—/—/7/9/9 (5km)", "10(br) + Energy", "Z1", "6(I)", "900¥"])

    def test_a_row_that_reads_stays(self):
        row = ["Quux", "4P", "SA", "8/8/6/—/—", "12(c)", "3(L)", "450¥"]
        self.assertIs(regroup._repair_row(self.H, row), row)

    def test_no_split_that_fits_leaves_the_row_as_printed(self):
        row = ["Quux", "4P", "weird", "8/8/6/—/—", "12(c)", "3(L)", "450¥"]
        self.assertEqual(regroup._repair_row(self.H, row), row)
