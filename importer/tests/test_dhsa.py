"""DHSA recipe: the row reader on made-up Markdown in the converter's shape, extract() on those rows,
and (gated) parity with the oracle captured before the importer existed."""
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
| **Zapper 3000**<br>(Heavy pistol) | Amp 2 | 12 500¥ | 5 | OK/OK/Dis/- | Smartlink: RR 1 Ranged W. (Handguns) |
| **Buzz Mk I** |  |  |  |  |  |
# CONTACTS
| C ONTACTS | T YPE | C OST | E FFECTS |
|---|---|---|---|
| **Contact*** | Amp 2 | 10 000¥ | Knows a person or two.<br>RR 1 Network (domain of choice**) |
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
                ["OK/OK/Dis/-", "Smartlink: RR 1 Ranged W. (Handguns)"]),
            row(6, "ARMORY – WEAPONS", "PISTOLS", "Buzz Mk I", "", "", []),
            row(6, "CONTACTS", "CONTACTS", "Contact*", "Amp 2", "10 000¥",
                ["Knows a person or two.", "RR 1 Network (domain of choice**)"]),
        ])


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
KNOWN_EXTRA = {("gear.xml", "gear", "Mage License")}


def entries(xml):
    return Counter((e.get("type") or e.get("kind"), e.find("name").text) for e in ET.fromstring(xml))


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
        self.assertEqual(got, (554, 84, 77, 31, 41))
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
