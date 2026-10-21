"""The rules the Firing Squad round added (general first, then the FS recipe's), each on made-up lines. Every name,
number and line here is invented."""

import os
import tempfile
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import catalog, formula, moved, regroup, sections
from importer.sr6 import shapes
from importer.sr6.recipes import crb, fs
from tools.cl6check import fields, match


def run_fs(md):
    regrouped, _ = regroup.regroup(md, fs.ALIASES, name_headers=fs.NAME_HEADERS, end_page=150)
    return fs.extract(regrouped)


def entries(res, kind):
    return {
        e.findtext("name"): (e.attrib, [(c.tag, dict(c.attrib), c.text) for c in e])
        for e in ET.fromstring(res.files[f"{kind}.xml"])
    }


BOOK_MD = """<!-- page 10 -->
# WEAPONS RACK
## Melee Weapons
### Exotic Melee Weapons
#### Bonk Stick
A made-up stick for bonking.
##### bonk stick
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Exotic | 3S | 6/—/—/—/— | 1 | 75¥ |
#### Qux Retro Line
Qux sells made-up retro weapons; a bonk stick or a flail, made to order.
##### retro line
| WEAPON | TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|---|
| Bonk Stick | Clubs | 2S | 7/—/—/—/— | 3(L) | 125¥ |
| Glim Flail | Clubs | 4S | 9/6*/—/—/— | 3(L) | 300¥ |
| This attack rating used meters † Max | is | when | thrown | maximum | range |
#### Snap Pole
A made-up pole that snaps into shapes.
##### snap pole
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Club | 4S | 8/—/—/—/— | 3(L) | 500¥ |
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Spike (Blade) | 4P | 8/—/—/—/— | — | — |
**Wireless Bonus:** Made-up glow.
### Machine Guns
#### Zorp Arms Puff, Huff
Two made-up guns.
##### puff
| TYPE | DV | MODE | ATTACK RATING | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| LMG | 4P | SA/BF* | 3/10/11/6/4 | 50(c) | 6(L) | 5,200¥ |
| *Wide | Burst | adds 1 DV |  |  |  |  |
**Note:** Made-up note.
##### huff
| TYPE | DV | MODE | ATTACK RATING | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Machine |  | SA/BF/ |  |  |  |  |
| Gun | 5P | FA | 2/10/10/8/5 | 50(c) | 6(L) | 6,000¥ |
**Note:** Made-up note.
<!-- page 40 -->
# SUIT UP
## Weapon Accessories
### Poke Blade
A made-up blade that pokes, fixed or folding.
##### poke blade
| WEAPON | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Fixed | 2P | 5/—/—/—/— | 3(I) | 75¥ |
| Folding | 2P | 5/—/—/—/— | 4(I) | 90¥ |
<!-- page 120 -->
# HONING YOUR EDGE
## New Edge Actions
### Glow Up
Glow in a made-up way. Cost: 1 Edge
#### Fade Out
Fade in a made-up way. Cost: 3 Edge
#### new quality: Shy (1-3)
You are shy in a made-up way.
##### Bonus
2 Karma per level
##### Game Effect
Made-up shyness.
"""


class FsRoundRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = run_fs(BOOK_MD)
        cls.w = entries(cls.res, "weapons")

    def test_a_brands_line_is_named_with_the_brand(self):
        """A table titled with its heading's words after a maker (`retro line` under `Qux Retro Line`): its rows are
        the brand's items, named `Qux Retro <row>`, searched as `Retro <row>` and `Qux <row>`, the brand their maker;
        the generic `Bonk Stick` of its own heading stays apart (its own id and stats)."""
        a, kids = self.w["Qux Retro Bonk Stick"]
        self.assertEqual(
            (a["id"], a["maker"], a["dv"], a["cost"]), ("qux-retro-bonk-stick", "Qux Retro Line", "2S", "125")
        )
        self.assertEqual([t for c, _, t in kids if c == "alias"], ["Retro Bonk Stick", "Qux Bonk Stick"])
        self.assertEqual((self.w["Bonk Stick"][0]["dv"], self.w["Bonk Stick"][0]["cost"]), ("3S", "75"))
        self.assertNotIn("This attack rating used meters † Max", " ".join(self.w))  # (a garbled footnote row)

    def test_generic_rows_titled_with_the_heading_are_its_variants(self):
        self.assertIn("Poke Blade (Fixed)", self.w)
        self.assertEqual(self.w["Poke Blade (Folding)"][0]["cost"], "90")

    def test_unpriced_rows_are_configurations_of_the_item(self):
        a, kids = self.w["Snap Pole (Spike configuration)"]
        self.assertEqual((a["configOf"], a["dv"], a["cost"], a["type"]), ("snap-pole", "4P", "—", "Blade"))
        self.assertIn(("alias", {}, "Spike (Blade)"), kids)
        self.assertEqual(self.w["Snap Pole"][0]["cost"], "500")

    def test_boxes_under_a_heading_naming_several_footnotes_and_wrapped_rows(self):
        a, kids = self.w["Puff"]
        self.assertEqual((a["modes"], a["cost"]), ("SA/BF", "5200"))  # (the mark's footnote is its note)
        self.assertIn(("note", {"field": "modes"}, "Wide Burst adds 1 DV"), kids)
        h = self.w["Huff"][0]
        self.assertEqual(
            (h["type"], h["modes"], h["dv"]), ("Machine Gun", "SA/BF/FA", "5P")
        )  # (a row set on two lines)

    def test_sections_a_sibling_set_too_deep_and_a_new_quality(self):
        acts = entries(self.res, "actions")
        self.assertEqual((acts["Fade Out"][0]["edge"], acts["Fade Out"][0]["category"]), ("3", "New Edge Actions"))
        q = entries(self.res, "qualities")["Shy"][0]
        self.assertEqual((q["kind"], q["karma"]), ("negative", "2"))


SUIT_MD = """<!-- page 40 -->
# SUIT UP
## Style Armor
### Glim House
The Glim House sells the made-up Sparkle line and the Dazzle coat (stats on p. 44).
## Weapon Modifications
### Under Rail
A made-up rail under the barrel that takes a made-up weapon.
##### Under Rail Mount
| AVAIL | COST |
|---|---|
| 3(I) | 500¥ |
| WEAPON | DV | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Zap Gun | 4P | SS | 6/10/5/—/— | 5(m) | 3(I) | 350¥ |
| WEAPON | DV | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Blip Gun | 3P | SS | 5/9/—/—/— | 2 | 3(I) | 800¥ |
<!-- page 45 -->
### Toughcloth
A made-up cloth.
##### armor
| ITEM | DR | SOCIAL | CAPACITY | AVAIL | COST |
|---|---|---|---|---|---|
| Armor Vest | +3 | –1 | 6 | 2 | 750¥ |
| Dazzle Coat | +3 | +5 | 6 | 4 | 4,500¥ |
"""


class FsRecipeHintsTest(unittest.TestCase):
    def test_stats_pointed_to_and_a_mounts_weapons(self):
        res = run_fs(SUIT_MD)
        armor = entries(res, "armor")
        self.assertEqual((armor["Dazzle Coat"][0]["group"], armor["Dazzle Coat"][0]["cost"]), ("Glim House", "4500"))
        self.assertNotIn("Armor Vest", armor)  # (the list's other rows: its text doesn't name them)
        w = entries(res, "weapons")
        self.assertEqual(
            (w["Under Rail Mount"][0]["cost"], w["Zap Gun"][0]["group"], w["Blip Gun"][0]["cost"]),
            ("500", "Under Rail Mount", "800"),
        )


ADDON_MD = """<!-- page 10 -->
# WEAPONS RACK
## Ranged Weapons
### Rifles
#### Zorp Zapper
A made-up rifle. Zorp sells a “steady grip-brace” for an additional 60 nuyen, and a glow scope (additional 30
nuyen) that mounts on top.
##### zorp zapper
| TYPE | DV | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Rifle | 4P | SA | 3/9/7/—/— | 12(c) | 4(L) | 900¥ |
**Note:** Grip-brace add-on increases the Medium and Far Attack Ratings by 2. Cells cost 40¥ each.
#### Fizz Sprayer
A made-up sprayer that can jettison its tank and glow lamp parts (replacement tanks and lamps are available
as spares for 20 nuyen each). It can be completely refilled for 15 nuyen. Nozzle sets are 5¥ each.
##### fizz sprayer
| TYPE | DV | MODE | ATTACK RATINGS | AMMO | AVAIL | COST |
|---|---|---|---|---|---|---|
| Rifle | 2S | SS | 3/—/—/—/— | 6(c) | 2 | 300¥ |
#### zorp lore
A made-up sidebar's gadget.
Availability 3, Cost 1,200¥
### Clubs
#### Bonk Mallet
A made-up mallet with heads.
##### Bonk Mallet
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Short | 2P | 8/—/—/—/— | 4 | 200¥ |
| Long | 4P | 9/—/—/—/— | 4 | 300¥ |
| Spike head | 3P | 8/—/—/—/— | 4 | additional 90¥ |
#### Glim Coat Sixx
A made-up name printed with a letter three times.
##### glim coat sixxx
| TYPE | DV | ATTACK RATINGS | AVAIL | COST |
|---|---|---|---|---|
| Exotic | 1S | 5/—/—/—/— | 2 | 50¥ |
"""


class AddOnsTest(unittest.TestCase):
    """Supplies and accessories an item's text prices (owner, 2026-10-08), and a letter printed three times."""

    @classmethod
    def setUpClass(cls):
        cls.res = run_fs(ADDON_MD)
        cls.w, cls.g = entries(cls.res, "weapons"), entries(cls.res, "gear")

    def test_a_supply(self):
        a, kids = self.g["Zorp Zapper cell"]
        self.assertEqual((a["supplyOf"], a["cost"], a["category"]), ("zorp-zapper", "40", "Supply"))
        self.assertIn(("alias", {}, "Cell for Zorp Zapper"), kids)
        self.assertTrue(any(c == "issue" and x["field"] == "avail" for c, x, _ in kids))

    def test_refills_replacement_parts_and_a_price_line(self):
        got = {n: (self.g[n][0]["cost"], self.g[n][0]["supplyOf"]) for n in self.g if n.startswith("Fizz Sprayer ")}
        self.assertEqual(
            got,
            {
                "Fizz Sprayer refill": ("15", "fizz-sprayer"),
                "Fizz Sprayer nozzle set": ("5", "fizz-sprayer"),
                "Fizz Sprayer replacement tank": ("20", "fizz-sprayer"),
                "Fizz Sprayer replacement glow lamp": ("20", "fizz-sprayer"),
            },
        )
        self.assertEqual((self.g["Zorp lore"][0]["avail"], self.g["Zorp lore"][0]["cost"]), ("3", "1200"))

    def test_accessories_and_their_effects(self):
        a, kids = self.w["Zorp Zapper steady grip-brace"]
        self.assertEqual((a["accessoryOf"], a["cost"], a["category"]), ("zorp-zapper", "60", "Weapon accessory"))
        self.assertEqual(
            [x for c, x, _ in kids if c == "effect"], [{"target": "item:ar", "op": "add", "value": "0,0,2,2,0"}]
        )
        self.assertEqual(self.w["Zorp Zapper glow scope"][0]["cost"], "30")

    def test_an_additional_price_is_an_accessory_of_its_box(self):
        a, kids = self.w["Bonk Mallet (Spike head)"]
        self.assertEqual((a["cost"], a["accessoryOf"]), ("90", "bonk-mallet-short bonk-mallet-long"))
        self.assertFalse(any(c == "issue" and x["field"] == "cost" for c, x, _ in kids))

    def test_a_letter_printed_three_times(self):
        cat = catalog.Catalog(crb.ID, "crb", crb.BOOK)
        e = cat.add("armor", "Glimmeeer Coat", 3, {"category": "Armor"})
        self.assertEqual((e["name"], e["aliases"]), ("Glimmeeer Coat", ["Glimmeer Coat"]))  # (never a rename)
        self.assertEqual(cat.add("armor", "Zap Mark III", 3, {"category": "Armor"})["aliases"], [])  # (a numeral)


class SmallRulesTest(unittest.TestCase):
    def test_prices(self):
        self.assertEqual(formula.read("75¥ (per individual zap)]"), ("Q*75", {"unit": "individual zap", "each": True}))
        self.assertEqual(formula.read("additional 100¥"), ("B + 100", {}))
        kids = formula.children("weapons", {"cost": "75 (per individual zap)"}, 3)
        self.assertIn(
            (
                "issue",
                {"field": "qty", "code": "missing", "page": 3},
                "the most one buys (individual zap) isn't printed",
            ),
            kids,
        )
        self.assertTrue(catalog._MULTIPLE.match("x2¥"))

    def test_group_names_keep_their_capitals(self):
        self.assertEqual(catalog.group_name("Qux Retro Line"), "Qux Retro Line")
        self.assertEqual(catalog.group_name("Zap patches"), "Zap patch")

    def test_a_style_heading_naming_two(self):
        b = regroup.Block(
            "item",
            "Zap Fu and Blip Fu",
            "HONING YOUR EDGE",
            "Martial Arts",
            "",
            9,
            labels={"Signature Technique": "Zip Kick (Blip Fu)/Zap Punch (Zap Fu)"},
        )
        self.assertEqual(
            [(x.name, x.labels["Signature Technique"]) for x in shapes.martial_pair(b)],
            [("Zap Fu", "Zap Punch"), ("Blip Fu", "Zip Kick")],
        )

    def test_a_step_granting_a_quality_described_under_it(self):
        r, out = sections.Reader(), []
        md = [("## Quality Paths", 2), ("### Made Path", 3), ("#### Step 1: Glum or Perky", 4), ("##### Glum", 5)]
        for name, lv in md:
            text = "Receive the Glum quality." if lv == 4 else "Made-up glumness."
            out += r.feed(
                regroup.Block(
                    "section" if lv < 4 else "item", name.lstrip("# "), "VIOLENT ENDS", "", "", 9, text=text, level=lv
                ),
                9,
            )
        self.assertEqual(sorted(f.name for f in out if f.kind == "qualities"), ["Glum", "Perky"])

    def test_cl6check(self):
        self.assertEqual(fields.bands("10/9/3†/—/—"), fields.bands("10,9,3,,"))
        self.assertIn(
            "ZQ Glow Coat", match.initials({"name": "Glow Coat", "aliases": [], "attrs": {"group": "Zip Quux"}})
        )
        ours = [
            {"name": "Glow Coat", "aliases": [], "attrs": {}, "kind": "armor", "page": 3},
            {"name": "Qux Retro Glow Coat", "aliases": [], "attrs": {}, "kind": "armor", "page": 4},
        ]
        hit = match.match(
            [{"name": "Glow Coat (Qux Retro)", "aliases": [], "page": 3, "kind": "armor", "pool": ("armor",)}], ours
        )
        self.assertEqual([o["name"] for o in hit[0][1]], ["Qux Retro Glow Coat"])

    def test_old_ids_of_a_split_heading_and_a_qualifier_read_as_a_field(self):
        head = '<?xml version="1.0" encoding="UTF-8"?>\n'

        def data(kind, *es):
            body = "".join(f'<{kind[:-1]} id="{i}"><name>{n}</name></{kind[:-1]}>' for i, n in es)
            return f'{head}<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="{kind}" version="1">{body}</sr6:data>\n'

        d = tempfile.mkdtemp()
        with open(os.path.join(d, "weapons.xml"), "w", encoding="utf8") as f:
            f.write(data("weapons", ("zz.zap-and-blip", "Zap and Blip"), ("zz.bonk-gun-cannon", "Bonk Gun (Cannon)")))
        out, n = moved.carry(
            moved.previous(d),
            {"weapons.xml": data("weapons", ("zz.zap", "Zap"), ("zz.blip", "Blip"), ("zz.bonk-gun", "Bonk Gun"))},
        )
        self.assertEqual(n, 2)
        self.assertIn('<name>Zap</name><alias id="zz.zap-and-blip"/>', out["weapons.xml"])
        self.assertIn('<name>Bonk Gun</name><alias id="zz.bonk-gun-cannon"/>', out["weapons.xml"])


if __name__ == "__main__":
    unittest.main()
