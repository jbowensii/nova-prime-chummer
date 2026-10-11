"""DHSA recipe: the row reader on made-up Markdown in the converter's shape, extract() on those rows,
and (gated) parity with the oracle captured before the importer existed."""
import re
import unittest
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

from importer.recipes import dhsa
from importer.tests import LOCAL_CORE, local_core

# Invented entries, laid out as the converter prints the DHSA tables: "#" sections, small-caps
# headers ("Q UALITIES"), bold names, wrapped cells as <br> or rows with empty cells, footnote "*"/"**".
MD = """<!-- page 5 -->
## S HADOWRUN
# QUALITIES
| Q UALITIES | T YPE | C OST | E FFECTS |
|---|---|---|---|
| **Made-up Knack** | Amp 2 | 10 000¥* | RR 1 Influence (Animals). |
| **Odd Habit** | Amp 0 | 0¥* | Gains an Edge point when the habit |
| Quirk |  |  | gets in the way.<br>Note: a note. |
## 5
<!-- page 6 -->
daegann.fr
# ARMORY – WEAPONS
Note to keep in mind: an invented note.
| P ISTOLS | T YPE | C OST | DV | R ANGE | A CCESSORIES / E FFECTS |
|---|---|---|---|---|---|
| **Zapper 3000**<br>(Heavy pistol) | Amp 2 | 12 500¥ | 5 | OK/Dis/Dis/- | Smartlink: RR 1 Ranged W. (Handguns) |
| **Buzz Mk I** |  |  |  |  |  |
# CONTACTS
| C ONTACTS | T YPE | C OST | E FFECTS |
|---|---|---|---|
| **Contact*** | Amp 2 | 10 000¥ | Knows a person or two.<br>RR 1 Network (domain of choice**) |
<!-- page 7 -->
# EVERYDAY LIFE
* These Amps are an alternative to the core rulebook's rules regarding lifestyles. Made-up: pay once,
earn the same as everyone.

Prose after the footnote.
"""


def row(page, section, sub, name, type_, cost, effects):
    return {"page": page, "section": section, "subsection": sub, "name": name, "type": type_, "cost": cost,
            "effects": effects, "added": None}


class RowsTest(unittest.TestCase):
    def test_rows(self):
        self.assertEqual(dhsa.rows(MD), [
            row(5, "QUALITIES", "QUALITIES", "Made-up Knack", "Amp 2", "10 000¥*", ["RR 1 Influence (Animals)."]),
            row(5, "QUALITIES", "QUALITIES", "Odd Habit Quirk", "Amp 0", "0¥*",
                ["Gains an Edge point when the habit gets in the way.", "Note: a note."]),
            # DV joins the cost and the range leads the effects, as the old PDF reader had them
            row(6, "ARMORY – WEAPONS", "PISTOLS", "Zapper 3000 (Heavy pistol)", "Amp 2", "12 500¥ 5",
                ["OK/Dis/Dis/-", "Smartlink: RR 1 Ranged W. (Handguns)"]),
            row(6, "ARMORY – WEAPONS", "PISTOLS", "Buzz Mk I", "", "", []),
            row(6, "CONTACTS", "CONTACTS", "Contact*", "Amp 2", "10 000¥",
                ["Knows a person or two.", "RR 1 Network (domain of choice**)"]),
        ])


# Invented entries printed with levels, the three ways the book prints a range, plus two it prints without a top.
LEVELS_MD = """<!-- page 8 -->
# MAGIC – ADEPT POWERS
| A DEPT POWERS | T YPE | C OST | E FFECTS |
|---|---|---|---|
| **Hop** | Amp 2 | 10 000¥ | Jump a little higher (can be taken up to level 6 for 30,000¥). |
| **Keen Nose** | Amp 3+ | 15 000¥ | Smell things.<br>Each additional rating (+5,000¥) adds a sense. |
<!-- page 9 -->
# EVERYDAY LIFE
| H IDEOUT | T YPE | C OST | E FFECTS |
|---|---|---|---|
| **Hidey Hole** | Amp 2 | 10 000¥ | A hole. Its threshold can be increased by 1 (max +2) for an additional Amp point.<br>Its lock can be<br>increased by 1 (max +1) for an extra Amp point (¥5,000). |
| **Strongbox** | Equipment | 2 500¥ | A box. Its lock can be increased by 1 (max<br>+2) for an additional Amp point (¥5,000). |
<!-- page 10 -->
# RIGGERS – VEHICLE MODS
| M ODS | T YPE | C OST | E FFECTS |
|---|---|---|---|
| **Turbo Kit** | Amp +1 | +5 000¥ | Improves speed, max +2. |
| **Identical additional drone** | Amp +3 | +15 000¥ | Max 4 identical drones. |
| **Bolt-on Plates** | Amp +1 | +5 000¥ | Improve vehicle armor by +1.<br>Max +Body of the vehicle. |
"""


class LevelsTest(unittest.TestCase):
    """An entry the book prints with several levels is one entry per level (owner, 2026-10-11), on made-up rows and the
    made-up core data (adept base 2, narrative +2, speed-plus +2 max 2, extra-drone +3 max 3)."""

    @classmethod
    def setUpClass(cls):
        cls.res = dhsa.extract(LEVELS_MD)
        cls.amps = {a.get("id"): a for a in ET.fromstring(cls.res.files["amps.xml"])}

    def got(self, family):
        return [(a.get("id"), a.find("name").text, a.get("level"), a.get("printedRating"), [e.get("ref") for e in a.iter("effect")])
                for a in self.amps.values() if a.get("family") == family]

    def test_level_range(self):
        self.assertEqual(dhsa.level_range("can be taken up to level 3", 1, False), (1, 3))
        self.assertEqual(dhsa.level_range("+1 Attack (max +5 for a maximum Attack attribute 5 at most)", 1, True, ["attack-plus"]), (1, 5))
        self.assertEqual(dhsa.level_range("Improves the Pilot. Max improvement +6 or up to a Pilot rating of 12.", 1, True), (1, 6))
        self.assertIsNone(dhsa.level_range("Improves handling.", 1, True, ["handling-plus"]))  # no max printed: one
        self.assertIsNone(dhsa.level_range("RR 1 Stealth", 2, False))
        self.assertEqual(dhsa.level_id("dhsa.hop", 2), "dhsa.hop-level-2")
        self.assertEqual(dhsa.level_id("dhsa.drag", -2), "dhsa.drag-level-minus-2")

    def test_up_to_level(self):
        # a level is a rating, printed (2) to the top (6); what a level adds over the printed rating is "Additional
        # narrative effect"s at the core's price (+2 in the made-up core: Hop 6 has two)
        self.assertEqual([(i, n, l, r) for i, n, l, r, _ in self.got("hop")],
                         [(f"hop-level-{n}", f"Hop {n}", str(n), str(n)) for n in range(2, 7)])
        self.assertEqual(self.got("hop")[-1][4], ["narrative", "narrative"])
        self.assertNotIn("hop", self.amps)  # the family id is no entry: old runners carry it (rescope maps it)

    def test_per_amp_point_sentences_add_up(self):
        self.assertEqual([(n, r) for _, n, _, r, _ in self.got("hidey-hole")], [(f"Hidey Hole {n}", str(n)) for n in range(2, 6)])
        # gear that becomes an Equipment amp by its levels: the item stays, its levels are amps bringing it
        box = self.got("strongbox")
        self.assertEqual([(n, r) for _, n, _, r, _ in box], [("Strongbox 1", "1"), ("Strongbox 2", "2")])
        self.assertEqual(self.amps["strongbox-level-2"].find("item").get("kind"), "gear")
        self.assertIn("gear-strongbox", {g.get("id") for g in ET.fromstring(self.res.files["gear.xml"])})

    def test_add_on_levels_are_it_taken_that_many_times(self):
        self.assertEqual(self.got("mod-turbo-kit"), [
            ("mod-turbo-kit-level-1", "Turbo Kit +1", "1", "1", ["speed-plus"]),  # "Improves speed": the rated effect
            ("mod-turbo-kit-level-2", "Turbo Kit +2", "2", "2", ["speed-plus", "speed-plus"])])
        # "Max 4 identical drones" has no "+N": the core table's max for its one effect
        self.assertEqual([(n, r) for _, n, _, r, _ in self.got("mod-identical-additional-drone")],
                         [("Identical additional drone +1", "3"), ("Identical additional drone +2", "6"), ("Identical additional drone +3", "9")])

    def test_a_range_without_its_top_stays_one_entry_and_is_reported(self):
        self.assertIn("keen-nose", self.amps)
        self.assertIn("mod-bolt-on-plates", self.amps)
        rows = {(r["id"], r["kind"]) for r in self.res.report if r["kind"].startswith("levels")}
        self.assertEqual(rows, {("hop", "levels"), ("keen-nose", "levels-open"), ("hidey-hole", "levels"), ("strongbox", "levels"),
                                ("mod-turbo-kit", "levels"), ("mod-identical-additional-drone", "levels"), ("mod-bolt-on-plates", "levels-open")})

    def test_each_level_has_the_description(self):
        texts = {t.get("id") for t in ET.fromstring(self.res.texts)}
        self.assertTrue({f"hop-level-{n}" for n in range(2, 7)} <= texts)


class ExtractTest(unittest.TestCase):
    def setUp(self):
        self.res = dhsa.extract(MD)
        self.amps = {a.get("id"): a for a in ET.fromstring(self.res.files["amps.xml"])}

    def test_match(self):
        self.assertGreaterEqual(dhsa.match({}, "Daegann\nShadow amps Base ....... 3"), 0.6)
        self.assertEqual(dhsa.match({}, "# Magic quick reference"), 0.0)

    def test_every_entry_cites_the_dhsa_page(self):
        self.assertEqual({(a.get("source"), a.get("page")) for a in self.amps.values()}, {("DHSA", "5"), ("DHSA", "6")})

    def test_amps(self):
        knack = self.amps["made-up-knack"]
        self.assertEqual([(e.get("ref"), e.get("param")) for e in knack.iter("effect")], [("rr-spec", "influence.animals")])
        zap = self.amps["zapper-3000-heavy-pistol-buzz-mk-i"]  # "Buzz Mk I" has no type or cost: a wrapped name
        self.assertEqual(zap.find("name").text, "Zapper 3000 (Heavy pistol) Buzz Mk I")
        self.assertEqual(zap.find("item").get("dv"), "5")
        self.assertIn(("rr-spec", "ranged-weapons.pistols"), [(e.get("ref"), e.get("param")) for e in zap.iter("effect")])
        contact = self.amps["contact-part-of-your-network"]
        self.assertEqual((contact.get("type"), contact.get("printedRating")), ("contact", "2"))

    def test_texts_are_private(self):
        self.assertEqual(self.amps["odd-habit-quirk"].find("narrative").text, None)
        texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}
        self.assertIn("gets in the way", texts["odd-habit-quirk"])

    def test_alternative_rule_seeds_the_table_rules(self):
        rules = ET.fromstring(self.res.files["rules-optional.xml"])
        self.assertEqual([(r.get("id"), r.get("sheet"), r.get("source"), r.get("page"), r.find("title").text, r.find("text").text) for r in rules],
                         [("optional-lifestyle-amps", "optional", "DHSA", "7", "Lifestyle Amps in place of the core lifestyle rules", None)])
        texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts["optional-lifestyle-amps"], "These Amps are an alternative to the core rulebook's rules regarding lifestyles. "
                                                          "Made-up: pay once, earn the same as everyone.")

    def test_skills_overlay_adds_the_dhsa_specs_to_shipped_skills(self):
        skills = {s.get("id"): s for s in ET.fromstring(self.res.files["skills.xml"])}
        self.assertEqual(skills["influence"].find("name").text, "Influence")
        self.assertIn("influence.animals", [s.get("id") for s in skills["influence"].iter("spec")])
        self.assertEqual(sum(1 for s in skills.values() for _ in s.iter("spec")), 6)


ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / ".extract/private/library/dhsa/book.md"
ORACLE = ROOT / ".extract/private/oracle"
# (file, type or kind, name) the old tool had and this recipe does not, or the other way. The old PDF reader
# appended the Contacts section's opening paragraph (the next page's first lines) to the last Everyday life row.
# Matched on the entry's own name as a prefix, so no book text is committed here.
KNOWN_MISSING_PREFIX = ("gear.xml", "gear", "Mage License ")
KNOWN_EXTRA = {("gear.xml", "gear", "Mage License"),
               # gear whose rating "can be increased by 1 (max +2) for an additional Amp point": its levels are amps (2026-10-11)
               ("amps.xml", "equipment", "Secure safe")}


# entries the old tool didn't split by level: one per family, by its name without the level ("Freefall 2" → "Freefall")
def entries(xml):
    out = Counter()
    for e in ET.fromstring(xml):
        name, fam = e.find("name").text, e.get("family")
        if fam:
            if fam in {k[2] for k in out if len(k) > 2}:
                continue
            name = re.sub(r"\s+[+-]?\d+$", "", name)
        out[(e.get("type") or e.get("kind"), name, *((fam,) if fam else ()))] += 1
    return Counter({k[:2]: n for k, n in out.items()})


@unittest.skipUnless(BOOK.exists(), "owner's converted DHSA book not present")
class AlternativeRulesBookTest(unittest.TestCase):
    def test_lifestyle_amps_found_on_its_page(self):
        rules = dhsa.alternative_rules(BOOK.read_text(encoding="utf8"))
        self.assertEqual([(r[0], r[2]) for r in rules], [("optional-lifestyle-amps", 16)])
        self.assertGreater(len(rules[0][3]), 100)


@unittest.skipUnless(LOCAL_CORE and BOOK.exists() and ORACLE.exists(), "owner's core copies, converted DHSA book and oracle not present")
class ParityTest(unittest.TestCase):
    """Entries by (type, name) against the catalogs the old tools/dhsa_to_xml.py wrote from a PDF row dump, priced with the
    owner's real core data."""

    @classmethod
    def setUpClass(cls):
        with local_core():
            cls.res = dhsa.extract(BOOK.read_text(encoding="utf8"))

    def test_counts(self):
        amps = ET.fromstring(self.res.files["amps.xml"])
        got = (len(amps), sum(a.get("mod") == "true" for a in amps),
               *(len(ET.fromstring(self.res.files[f])) for f in ("spells.xml", "complexforms.xml", "gear.xml")))
        self.assertEqual(got, (579, 101, 77, 31, 41))  # 554 and 84 before levels: 8 families became 33 levels
        kinds = Counter(r["kind"] for r in self.res.report)
        self.assertEqual((kinds["rating-mismatch"], kinds["unresolved-spec"]), (21, 12))

    def test_entries(self):
        missing, extra = set(), set()
        for f in ("amps.xml", "spells.xml", "complexforms.xml", "gear.xml"):
            old, new = entries((ORACLE / f).read_text(encoding="utf8")), entries(self.res.files[f])
            missing |= {(f, t, n) for t, n in old - new if (f, t) != KNOWN_MISSING_PREFIX[:2] or not n.startswith(KNOWN_MISSING_PREFIX[2])}
            extra |= {(f, *k) for k in new - old}
        self.assertEqual((missing, extra - KNOWN_EXTRA), (set(), set()))

    def test_every_entry_is_dhsa(self):
        for f in ("amps.xml", "spells.xml", "complexforms.xml", "gear.xml"):
            self.assertEqual({e.get("source") for e in ET.fromstring(self.res.files[f])}, {"DHSA"})


if __name__ == "__main__":
    unittest.main()
