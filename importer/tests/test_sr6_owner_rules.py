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


class AccuracyRoundTest(unittest.TestCase):
    def test_readers(self):
        from importer.sr6 import formula, sections
        self.assertEqual(formula.read("(Rating) x 500")[0], "R*500")  # (not a price off another item: `(Camera) x 2`)
        self.assertEqual(sections.quality_attrs("Zorp Rejection", ["Negative Qualities"], "• **Bonus:** 4 or 8 Karma"),
                         {"kind": "negative", "karma": "4", "karmaMax": "8"})
        md = "\n".join(["<!-- page 9 -->", "# MAGIC", "## Powers", "#### Zap Vanish", "(Ability/Critter Power)",
                        "**Type:** Physical **Action:** Minor", "**Range:** Self **Duration:** Immediate", "Beings vanish.",
                        "#### Lie Zap", "**Cost:** 0.25 PP per level", "**Activation: Passive**", "You spot liars.", ""])
        text, _ = regroup.regroup(md)
        labels = {b.name: b.labels for b in regroup.blocks(text)}
        self.assertEqual(labels["Zap Vanish"], {"Type": "Physical", "Action": "Minor", "Range": "Self", "Duration": "Immediate"})
        self.assertEqual(labels["Lie Zap"]["Activation"], "Passive")

    def test_a_verdict_holds_for_the_value_it_was_checked_on(self):
        from tools.cl6check import trace
        rows = [{"src": "zz", "id": "a", "field": "cost", "family": "not found", "winner": "100", "where": "", "cl6": "50"},
                {"src": "zz", "id": "b", "field": "cost", "family": "not found", "winner": "300", "where": "", "cl6": "50"}]
        v = {"zz|a|cost": {"family": "Commlink6-only field", "ours": "100"},
             "zz|b|cost": {"family": "Commlink6-only field", "ours": "200"}}
        trace.apply_verdicts(rows, v)
        self.assertEqual([r["family"] for r in rows], ["Commlink6-only field", "not found"])


class AccuracyRound2Test(unittest.TestCase):
    def test_back_matter_prices_unpriced_headings(self):
        md = "\n".join(["<!-- page 5 -->", "# COMBAT", "## Toxins", "Toxins hurt.", "#### Zorpject", "**Vector:** Injection",
                        "Puts you to sleep.", "#### Blumgas", "**Vector:** Inhalation", "Makes you blue.",
                        "<!-- page 9 -->", "# GEAR", "#### Zap gizmo", "A gizmo.", "| GEAR | AVAIL | COST |", "|---|---|---|",
                        "| Zap gizmo | 2 | 30¥ |", "<!-- page 20 -->", "### TABLES", "| TOXIN | AVAILABILITY | COST |",
                        "|---|---|---|", "| Zorpject | 4(L) | 50¥ |", "| Blumgas | 3(L) | 25¥ |",
                        "| GEAR | AVAIL | COST |", "|---|---|---|", "| Zap gizmo | 2 | 30¥ |", "| Zap toy | 1 | 5¥ |", ""])
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS, end_page=20)
        rows = {b.name: b.row for b in regroup.blocks(text) if b.row is not None}
        self.assertEqual(rows["Zorpject"]["COST"], "50¥")  # (priced only in the back matter: before its heading)
        self.assertEqual(rows["Blumgas"]["AVAILABILITY"], "3(L)")
        self.assertNotIn("Zap toy", rows)  # (a reprint of a table the chapter prints stays out)

    def test_a_dc_size_class_box_is_a_level_of_its_heading(self):
        self.assertTrue(dc._band_name("Size Class 2"))

    def test_a_see_text_cell_is_not_filled_from_another_row(self):
        md = "\n".join(["<!-- page 9 -->", "# GEAR", "## Gizmos", "#### gizmo table", "| GEAR | AVAIL | COST |", "|---|---|---|",
                        "| Metazorp cosmic gizmo | * | * |", "| Cosmic gizmo | 4 | 20¥ |", ""])
        e = extract(md)["gear"]["Metazorp cosmic gizmo"]
        self.assertEqual(e.get("cost"), "*")

    def test_a_path_step_is_one_quality_named_apart_when_its_name_is_taken(self):
        from importer.sr6.sections import Found
        cat = crb._Catalog()
        cat.add("qualities", "Zorped", 130, {"kind": "negative", "karma": 25})
        cat.add("qualities", "Obsession: Blorped", 140, {"kind": "negative", "karma": 15})
        cat.section(Found("qualities", "Blorped", 140, {"kind": "negative", "karma": "15", "_heading": "Obsession: Blorped"}))
        cat.section(Found("qualities", "Zorped", 140, {"kind": "negative", "_heading": "Obsession: Zorped"}))
        names = {e["name"]: e for e in cat.entries["qualities"]}
        self.assertEqual(sorted(names), ["Blorped", "Obsession: Zorped", "Zorped"])
        self.assertEqual(names["Blorped"]["aliases"], ["Obsession: Blorped"])

    def test_a_list_of_karma_prices(self):
        from importer.sr6 import sections
        self.assertEqual(sections.karma_list("3,6, or 9 Karma"), [3, 6, 9])
        self.assertEqual(sections.karma_list("5/8 Karma"), [5, 8])
        self.assertEqual(sections.quality_attrs("Zorp Pool", [], "• **Cost:** 3,6, or 9 Karma"),
                         {"kind": "positive", "karma": "3", "karmaMax": "9"})
        md = "\n".join(["<!-- page 9 -->", "# QUALITIES", "## Negative Qualities", "#### Zorpation I/II",
                        "**Bonus:** 5/8 Karma", "**Game Effect:** You zorp.", ""])
        q = extract(md).get("qualities", {})
        self.assertEqual({n: e.get("karma") for n, e in q.items() if n.startswith("Zorpation")},
                         {"Zorpation I": "5", "Zorpation II": "8"})


class FinalDecisionsTest(unittest.TestCase):
    """The owner's final decisions (importer v6): items the prose states, the core rulebook's vocabularies."""

    def test_prose_items(self):
        from importer.sr6.recipes.crb import _band_tier, _skill_choices
        md = "\n".join([
            "<!-- page 9 -->", "# MAGIC", "## Zorpcraft", "### Zorpspelling",
            "Zorpspelling comes in one of two forms: blue shield and unzorping.",
            "#### Blue Shield", "Characters take a Zorpspell Major Action and roll.",
            "#### Unzorping", "The character chooses the Zorpspell action and rolls.",
            "#### Zorp Overdrive", "The systems can be boosted. Spend a Minor Action to zorp a system.",
            "#### Zorp Magic", "The first use of zorp magic makes the character gain the Craving (Zorp, 1) negative "
            "quality without any Karma.",
            "#### Crafting with True Zorp",
            "The artificer can imbue one additional attribute into it, selected from the list below.",
            "**Bouncy.** The focus bounces.", "**Glowing.** The focus glows.",
            "#### Zorp Coating", "Any piece of armor can have a zorp coating applied to it for 100 nuyen. This "
            "coating does not use any capacity.",
            "## Adepts", "### Adept Powers", "#### Zorp Sense", "**Cost:** 0.25 PP", "**Activation:** Passive",
            "When this power is purchased, select a sense (sight, smell, or zorpvision). You get a bonus.", ""])
        es = extract(md)
        self.assertEqual({n: e.get("type") for n, e in es["actions"].items()},
                         {"Blue Shield": "major", "Unzorping": "major", "Zorp Overdrive": "minor"})
        self.assertEqual(sorted(es["senses"]), ["Sight", "Smell", "Zorpvision"])
        self.assertEqual(es["adeptpowers"]["Zorp Sense"].find("choice").get("kind"), "sense")
        q = es["qualities"]["Craving (Zorp)"]
        self.assertEqual((q.get("kind"), q.get("karma"), q.get("granted")), ("negative", "0", "true"))
        self.assertEqual({n: e.get("category") for n, e in es["trueelements"].items()},
                         {"Bouncy": "True Zorp crafting", "Glowing": "True Zorp crafting"})
        self.assertEqual(es["rules"]["Crafting with True Zorp"].find("choice").get("category"), "True Zorp crafting")
        a = es["armor"]["Zorp Coating"]
        self.assertEqual((a.get("category"), a.get("cost"), a.get("capacity")), ("Armor accessory", "100", "0"))
        self.assertEqual(sorted(es["magictypes"])[:2], ["Adept", "Aspected magician"])  # (the core vocabulary)
        self.assertEqual(_band_tier([["1–3", "Rating x 10¥"], ["4–6", "Rating x 1,000¥"]]),
                         ("tier(R; 1-3: R*10; 4-6: R*1000)", 1, 6))
        self.assertEqual([c[1]["kind"] for c in _skill_choices(
            "choose one from Zorping, Blooping, or Piloting and a Specialization in the chosen skill as well as an "
            "appropriate Knowledge Skill")], ["skill", "specialization", "knowledgeskill"])
