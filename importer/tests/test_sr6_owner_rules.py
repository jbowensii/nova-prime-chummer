"""The owner's general rules of 2026-10-08 (importer v5): two items on one row or heading, search names a description
prints, items its table leaves out, optional rules bought as qualities, material add-ons, device settings, sentence
prices in words, an FAQ's Karma statement. Invented books and values only."""
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup, resolve
from importer.sr6.recipes import crb, dc


def extract(md):
    text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
    res = crb.extract(text)
    return {k[:-4]: {e.findtext("name"): e for e in ET.fromstring(v)} for k, v in res.files.items()}


class NamesTest(unittest.TestCase):
    def test_slash_options(self):
        # (`A/B` offered as a choice in the text is two entries; one thing printed two ways stays one)
        self.assertEqual(crb.slash_options("Widening/Narrowing Zorp Bay (CF Mod)", "This mod widens or narrows the bay."),
                         ["Widening Zorp Bay (CF Mod)", "Narrowing Zorp Bay (CF Mod)"])
        self.assertEqual(crb.slash_options("Easy Zorp/Unzorp", "Zorps come apart and back together."), [])

    def test_known_as_and_versions(self):
        self.assertEqual(crb.known_as("Zap Systems Glow-One", "One of many, the Glow-One (also known as the G1) glows."), ["G1"])
        self.assertEqual(crb.known_as("Zorp Van", "A rocker out of Ohio known as Zappy V drove one."), [])
        self.assertEqual(crb.known_as("Zorp Van IV", "The licensed variants are simply known as the Zorp IV+."), ["Zorp IV+"])
        t = "Zapboards can be found in both hardened and bladed versions, while glow skates only come in bladed."
        self.assertEqual(crb.version_names("Rolling Zaps (Bladed)", t), ["Zapboard (bladed)", "Glow skate (bladed)"])

    def test_words(self):
        self.assertEqual(crb.number_words("one thousand"), 1000)
        self.assertEqual(crb.number_words("two hundred fifty"), 250)
        self.assertEqual(crb.word_stems("webbed hands and feet"), crb.word_stems("Hand and foot webbing"))

    def test_second_box_after_a_sentence(self):
        nl = "\n"
        t = nl.join(["Desc.", "| MOD SLOTS | COST |", "|---|---|", "| 1 | 100 |",
                     "Glow lining on a zorp bay (may be taken twice).", "| MOD SLOTS | COST |", "|---|---|", "| — | 50 |"])
        runs = dc._box_runs(t)
        self.assertEqual([r[0] for r in runs], [None, "Glow lining"])


class CatalogTest(unittest.TestCase):
    def test_material_add_ons(self):
        cost = "x2 for tin or other common materials, x5 for glowstone or other rare materials."
        b = regroup.Block("item", "Glow Bullets", "Gear", "Ammo", "glow bullets", 30, ["DV", "COST"],
                          {"DV": "As weapon", "COST": cost})
        self.assertTrue(crb.ammo_type(b))  # (priced as a multiple of the ammunition: an ammunition type)
        got = dict(crb._Catalog.variants("Glow Bullets", {"cost": cost, "avail": "2(L)"}))
        self.assertEqual(got["Glow Bullets (tin)"]["_formula:cost"], "H*2")
        self.assertEqual(got["Glow Bullets (glowstone)"]["category"], crb.MATERIAL_ADD_ON)

    def test_an_item_its_table_leaves_out(self):
        body = "It grows and glows, and it is quite a thing to see when the light is low and the night is long. " * 2
        md = "\n".join([
            "<!-- page 40 -->", "# BIOWARE", "## Glow Bioware", "#### Glow Gland", body, "#### Zorp Tongue", body,
            "#### Fizz Lung", body, "#### glow bioware", "| BIOWARE | ESSENCE | AVAIL | COST |", "|---|---|---|---|",
            "| Glow Gland | 0.1 | 2 | 1,000¥ |", "| Fizz Lung | 0.2 | 3 | 2,000¥ |", ""])
        g = extract(md)["augmentations"]["Zorp Tongue"]
        self.assertEqual(sorted(i.get("field") for i in g.findall("issue")), ["avail", "cost", "essence"])


class ErrataTest(unittest.TestCase):
    def test_a_karma_statement_under_a_question(self):
        md = "\n".join(["H OW DOES Z ORP G LOW WORK ? ( P . 12)", "● It only ever gives a bonus of 0 Karma."])
        self.assertIn((12, "Zorp Glow", "karma", "0", None), resolve.errata(md))


if __name__ == "__main__":
    unittest.main()


class PageBreakTest(unittest.TestCase):
    def test_a_line_keeps_its_page(self):
        md = "\n".join(["<!-- page 10 -->", "# GEAR", "#### Zorp Things", "Line one.", "Line two.", "<!-- page 11 -->",
                        "Line three.", "**Glow:** a later entry.", ""])
        text, _ = regroup.regroup(md)
        b = next(b for b in regroup.blocks(text) if b.name == "Zorp Things")
        self.assertEqual((b.page, regroup.text_page(b, "Line one"), regroup.text_page(b, "**Glow:**")), (10, 10, 11))


class UnworkedBooksTest(unittest.TestCase):
    def test_a_row_continued_on_the_next_line(self):
        h = ["TYPE", "MODE", "DV", "ATTACK RATINGS", "AMMO", "AVAIL", "COST"]
        rows = regroup._wrapped_rows(h, [regroup._Row(["Zap", "SS", "As drug", "10/6/–", "1 barrel", "4L", "400¥ +"]),
                                         regroup._Row(["Pistol", "", "", "/–/–", "", "", "drug"])])
        self.assertEqual(rows, [["Zap Pistol", "SS", "As drug", "10/6/–/–/–", "1 barrel", "4L", "400¥ + drug"]])
        foot = [regroup._Row(["Exotic", "6S", "SS", "10/12/8/—/—", "*", "5(L)", "6,000¥"]),
                regroup._Row(["*See weapon", "", "description for", "ammunition rules.", "", "", ""])]
        self.assertEqual(len(regroup._wrapped_rows(h, foot)), 2)  # (a footnote spread over the cells)

    def test_an_item_a_note_prices(self):
        t = "DV is the net hits. Glowmarket fizz spray in a 10-dose can can be purchased for 150¥ and has an availability of 6(I)."
        self.assertEqual([m.groups() for m in crb._PURCHASED.finditer(t)], [("Glowmarket fizz spray", "150", "6(I)")])
        self.assertEqual(list(crb._PURCHASED.finditer("Zorp eggs can be purchased for 500 nuyen x the Body.")), [])

    def test_abilities_each_entry_grants(self):
        md = "\n".join([
            "<!-- page 70 -->", "# FORCE", "## Zorp Ways and Their Benefits", "##### (20 Karma)",
            "Adepts follow a way by selecting it as a quality, which gives them the Glow Knack and Fizz Focus abilities.",
            "### Glow Knack", "Once per scene, glow.", "### Fizz Focus", "Fizz instead.", "### Fizzer's Way",
            "A way of fizzing.", ""])
        q = extract(md)["qualities"]
        self.assertEqual({k: q["Glow Knack"].get(k) for k in ("kind", "karma", "granted", "category")},
                         {"kind": "positive", "karma": "0", "granted": "true", "category": "Way ability"})
        self.assertIn("Fizz Focus", q)
