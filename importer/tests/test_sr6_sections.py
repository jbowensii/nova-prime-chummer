"""The kinds a book prints as sections (importer/sr6/sections.py): headings under a section naming the kind, bold
run-ins, `Kind: Name` headings, a quality path's steps. Invented book only."""
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup
from importer.sr6.recipes import crb

MD = """<!-- page 40 -->
# GAME CONCEPTS
## Timing and Actions
#### actions
| MINOR ACTIONS | MAJOR ACTIONS |
|---|---|
| Zip Aside | Zap Hard |
### Minor Actions
Minor actions are quick.
#### Zip Aside (A)
You zip aside.
#### zip example
Zippy did it.
### Major Actions
#### Zap Hard (I)
You zap hard.
## Edge
### Spending Edge
#### 2-Edge Boosts
• **Glow Twice:** You glow
twice.
• **Use an Edge Action:** You can use one.
#### Edge Actions
• **Wobble Strike (Melee Attack):** You wobble. Cost: 3 Edge
## Matrix Actions
### Fizz Probe
##### (illegal) Hacking + Logic (Major)
##### Admin
Probe a thing.
## Mentor Spirits
### Mentor Spirit Archetypes
#### Glow Moth
##### Advantages
**All:** Moths glow.
## Data Structures
#### Types of Data Structures
**Zap Shell:** Gain dice to zap.
**Fizz Key:** Gain dice to fizz.
## Quality Paths
#### Quality Path: Long Road
The road is long.
##### Step 1: First Mile
Walk.
##### Step 2: Last Mile
Walk more.
"""


class SectionKindsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        text, _ = regroup.regroup(MD, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        cls.res = crb.extract(text)

    def kind(self, k):
        return {e.findtext("name"): e for e in ET.fromstring(self.res.files[f"{k}.xml"])}

    def test_actions(self):
        a = self.kind("actions")
        self.assertEqual({k: a["Zip Aside"].get(k) for k in ("type", "timing")}, {"type": "minor", "timing": "anytime"})
        self.assertEqual((a["Zap Hard"].get("type"), a["Zap Hard"].get("timing")), ("major", "initiative"))
        self.assertEqual((a["Glow Twice"].get("type"), a["Glow Twice"].get("edge")), ("boost", "2"))
        self.assertEqual((a["Wobble Strike"].get("edge"), a["Wobble Strike"].get("with")), ("3", "Melee Attack"))
        self.assertEqual(a["Fizz Probe"].get("type"), "major")  # its tag line's (Major)
        self.assertNotIn("Use an Edge Action", a)
        self.assertFalse([n for n in a if "example" in n.lower() or n.lower() in ("minor actions", "actions")])

    def test_mentors_structures_and_paths(self):
        self.assertEqual(list(self.kind("mentorspirits")), ["Glow Moth"])
        self.assertEqual(sorted(self.kind("datastructures")), ["Fizz Key", "Zap Shell"])
        p = self.kind("qualitypaths")["Long Road"]
        self.assertEqual([s.text for s in p.findall("step")], ["Step 1: First Mile", "Step 2: Last Mile"])

    def test_the_rule_sections_stay(self):
        rules = {e.findtext("name") for e in ET.fromstring(self.res.files["rules.xml"])}
        self.assertIn("Fizz Probe", rules)


if __name__ == "__main__":
    unittest.main()
