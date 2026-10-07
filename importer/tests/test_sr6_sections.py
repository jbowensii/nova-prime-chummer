"""The kinds a book prints as sections (importer/sr6/sections.py): headings under a section naming the kind, bold
run-ins, `Kind: Name` headings, a quality path's steps. Invented book only."""
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import regroup, sections
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
**Cost:** 4 Karma
##### Step 2: Last Mile
Walk more.
**Cost:** 6 Karma
"""

PATHS = """<!-- page 76 -->
# GLOW DECKER
## Quality Paths
### Glow Shield
A made-up path.
#### Bright Wall
A made-up step.
**Cost:** 5 Karma
#### Brighter Wall
**Cost:** 8 Karma
### Roleplaying
Made-up advice on playing a glow decker.
### Strategies
Made-up strategies.
#### Combat
Made-up combat advice.
# FIZZ ADEPT
## Quality Paths
### Roleplaying
Made-up advice.
### Strategies
Made-up strategies.
# ZORP RIGGER
### Roleplaying
Made-up advice.
### Strategies
Made-up strategies.
"""


PACKS = """<!-- page 50 -->
# SUIT UP
#### Starter Zorp PACK
(2,500 nuyen)
Everything to start with.
**Gear:** Glow stick (rating 2), fizz tape (10)
## Weapons PACKs
#### Zappers
Zappers zap.
**Zap Pistol** (w/ zap sight, 10 zap darts):
**1,175 nuyen**
**Big Zapper** (w/ zap sight, zap scope): **2,015**
**nuyen**
## Gizmo PACKs
#### Gizmo PACK A
(10,500 nuyen)
For gizmo users.
**Essence Cost:** 0.5
**Recommended Skills:** Tinkering
#### Glow Autosofts
Autosofts for glowing drones.
Pilot Rating 2: 2,000 nuyen
Glowing rating 2
Pilot Rating 3: 4,500 nuyen
Glowing rating 3
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


    def test_packs(self):
        text, _ = regroup.regroup(PACKS, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        p = {e.findtext("name"): e for e in ET.fromstring(crb.extract(text).files["packs.xml"])}
        self.assertEqual((p["Starter Zorp"].get("cost"), [i.text for i in p["Starter Zorp"].findall("item")]),
                         ("2500", ["Glow stick (rating 2)", "fizz tape (10)"]))
        self.assertEqual((p["Zap Pistol"].get("cost"), p["Zap Pistol"].get("category")), ("1175", "Zappers"))
        self.assertEqual([i.text for i in p["Zap Pistol"].findall("item")], ["zap sight", "10 zap darts"])
        self.assertEqual(p["Big Zapper"].get("cost"), "2015")
        self.assertEqual((p["Gizmo Pack A"].get("cost"), p["Gizmo Pack A"].get("essence")), ("10500", "0.5"))
        self.assertEqual(p["Gizmo Pack A"].findall("item"), [])  # (recommended skills are no contents)
        self.assertEqual((p["Glow Autosofts 2"].get("cost"), p["Glow Autosofts 3"].get("cost")), ("2000", "4500"))

    def test_vehicle_design_and_ammunition_types(self):
        md = """<!-- page 150 -->
# GEAR
## Build It
#### frame type table
| FRAME TYPE | BOD | BUILD POINTS |
|---|---|---|
| Zoom Frame | 4 | 3 |
### Design Modifications
#### Heavy Hull/Light Hull
Hulls.
#### Glow Comms (I, II)
Comms.
#### Scrap Frame (x0.5 BP)
Cheap.
## Ammunition
#### zap ammo types
| TYPES | AR | DV | COST MULTIPLIER |
|---|---|---|---|
| Fizz Rounds | +1 | -1 | x2 |
#### Fizz Rounds
Fizz rounds fizz.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        res = crb.extract(text)
        d = {e.findtext("name"): e.attrib for e in ET.fromstring(res.files["vehicledesign.xml"])}
        self.assertEqual((d["Zoom Frame"]["category"], d["Zoom Frame"]["bp"]), ("frame type", "3"))
        self.assertTrue({"Heavy Hull", "Light Hull", "Glow Comms I", "Glow Comms II"} <= set(d))
        self.assertEqual(d["Scrap Frame"]["bp"], "x0.5")
        a = {e.findtext("name"): e.attrib for e in ET.fromstring(res.files["ammotypes.xml"])}
        self.assertEqual({k: a["Fizz Rounds"][k] for k in ("ar", "dv", "cost")}, {"ar": "+1", "dv": "-1", "cost": "x2"})

    def test_sets_keywords_and_matrix_test_lines(self):
        md = """<!-- page 117 -->
# MAGIC
## Rituals
Some rituals have keywords, with rules of their own.
**Glowing:** A glowing ritual glows.
**Humming:** A humming ritual hums.
## Collectives
#### zorp changelings
| TYPE | KARMA | METATYPE | POSITIVE METAGENIC QUALITIES | NEGATIVE METAGENIC QUALITIES |
|---|---|---|---|---|
| Zorpling | 12 | Elf, human | Glow Skin, Fizz Ears (Long) | Odd Hair |
## Movie Hacks
#### Zap Worm
##### (Illegal) Hacking + Logic vs. Firewall (Major) Admin
A worm that zaps.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        res = crb.extract(text)
        q = {e.findtext("name"): e for e in ET.fromstring(res.files["qualitysets.xml"])}["Zorpling"]
        self.assertEqual((q.get("karma"), q.get("metatypes"), [x.text for x in q.findall("quality")]),
                         ("12", "Elf, human", ["Glow Skin", "Fizz Ears (Long)", "Odd Hair"]))
        f = [e.findtext("name") for e in ET.fromstring(res.files["spellfeatures.xml"])]
        self.assertEqual(f, ["Glowing", "Humming"])
        a = {e.findtext("name"): e for e in ET.fromstring(res.files["actions.xml"])}
        self.assertEqual(a["Zap Worm"].get("type"), "major")

    def test_qualities_from_sections(self):
        md = """<!-- page 104 -->
# CHANGING THE CODE
### New Positive and Negative Qualities
#### Positive Qualities
**Glow Fan:** You love glowing things.
• **Cost:** 2 Karma
• **Game effect:** +1 Edge near glow.
**Fizz Soul:** Your soul fizzes.
• **Cost:** 10 Karma
#### Negative Qualities
**Zap Nose:** Zaps make you sneeze.
• **Bonus:** 4 Karma
## Quality Paths
### Long Road
#### Starting point
Begin here.
#### Step 1: Sore Feet
This negative quality hurts.
• **Bonus:** 5 Karma
#### Step 2: Blisters or Calluses
Choose one.
#### Glow Fan
The step grants a quality printed above.
#### Step 3
Walk on.
#### Step 4: Glow Fan
You gain the Glow Fan quality at half its cost.
#### Long Road: Rest Stop
**Cost:** 2,000 nuyen
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        res = ET.fromstring(crb.extract(text).files["qualities.xml"])
        q = {e.findtext("name"): e.attrib for e in res}
        self.assertEqual({n: (q[n]["kind"], q[n].get("karma")) for n in ("Glow Fan", "Fizz Soul", "Zap Nose", "Sore Feet")},
                         {"Glow Fan": ("positive", "2"), "Fizz Soul": ("positive", "10"), "Zap Nose": ("negative", "4"),
                          "Sore Feet": ("negative", "5")})
        self.assertNotIn("Starting point", q)
        # unpriced steps: named as steps they are qualities (a nuyen Cost line: positive; nothing: negative, an
        # issue saying so); a bare heading (a quality the step grants) is not; a bare `Step 3` is the path's quality
        # under its printed name, the path its group (owner decision 2026-10-07)
        self.assertEqual({n: q[n]["kind"] for n in ("Blisters", "Calluses", "Rest Stop")},
                         {"Blisters": "negative", "Calluses": "negative", "Rest Stop": "positive"})
        issues = {e.findtext("name"): [i.get("field") for i in e.iter("issue")] for e in res}
        self.assertIn("kind", issues["Blisters"])
        self.assertNotIn("kind", issues["Rest Stop"])
        self.assertEqual((q["Step 3"]["group"], q["Step 3"]["id"]), ("Long Road", "long-road-step-3"))
        self.assertEqual(sum(e.findtext("name") == "Glow Fan" for e in res), 1)

    def test_headings_bought_as_a_quality_at_the_sections_price(self):
        md = """<!-- page 70 -->
# GLOW AND GRACE
## Zorp Paths and Their Gifts
##### (15 Karma)
Zorps begin a path by selecting it as a quality.
### Inner Hum
Every path hums.
### Glower's Path
Followers glow.
### Fizzing Path
Followers fizz.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        q = {e.findtext("name"): e.attrib for e in ET.fromstring(crb.extract(text).files["qualities.xml"])}
        self.assertEqual({n: (a["kind"], a["karma"]) for n, a in q.items()},
                         {"Glower's Path": ("positive", "15"), "Fizzing Path": ("positive", "15")})

    def test_items_a_section_derives_by_a_rule(self):
        md = """<!-- page 90 -->
# GEAR
## Biotech
#### bioware
| BODYWARE | ESSENCE | AVAILABILITY | COST |
|---|---|---|---|
| Glow gland | 0.2 | 4 | 1,000¥ |
| Fizz fins | 0.4 | 6 | 3,000¥ |
## Zorpgenics
### Zorpgenics As Bioware
Zorpgenics cost fifty percent more Essence than their bioware equivalent, but cost thirty percent less nuyen.
The following bioware can be imitated through zorpgenic infusions. Each counts as one.
Bioware: glow glands (bright ones), fizz fins, wobble ears.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        aug = {e.findtext("name"): e for e in ET.fromstring(crb.extract(text).files["augmentations.xml"])}
        g = aug["Zorpgenic glow glands"]
        self.assertEqual({f.get("field"): f.text for f in g.findall("formula")},
                         {"essence": "ref(augmentations:crb.glow-gland, essence)*1.5", "cost": "ref(augmentations:crb.glow-gland, cost)*0.7"})
        self.assertEqual((g.get("avail"), g.get("type")), ("4", "bioware"))
        w = aug["Zorpgenic wobble ears"]  # no base item printed: the rule, as an ambiguous issue
        self.assertEqual({(i.get("field"), i.get("code")) for i in w.findall("issue")}, {("essence", "ambiguous"), ("cost", "ambiguous"), ("avail", "missing")})
        # `A and B` of two-word halves is two items; a parenthetical listing several adds them; a comma set inside the
        # closing parenthesis is the list's; `webbed hands and feet` stays one
        self.assertEqual(sections._listed("glow glands and fizz spray (zap spit and fangs,) hum venoms, webbed hands and feet."),
                         ["glow glands", "fizz spray", "hum venoms", "webbed hands and feet", "zap spit", "fangs"])

    def test_kinds_of_a_class_priced_by_its_row(self):
        md = """<!-- page 155 -->
# MAGIC
## Foci
#### Glow Foci
**Bright focus:** A bright focus glows.
**Dim focus:** A dim focus barely glows.
#### Odd Foci
**Odd focus:** No row prices it.
# GEAR
#### foci
| ITEM | AVAIL | COST |
|---|---|---|
| Glow focus | (Force) L | Force x 500¥ |
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        g = {e.findtext("name"): e.attrib for e in ET.fromstring(crb.extract(text).files["gear.xml"])}
        self.assertEqual((g["Bright focus"]["cost"], g["Dim focus"]["avail"]), ("Force x 500", "(Force) L"))
        self.assertNotIn("Odd focus", g)

    def test_inherent_qualities_metamagics_and_sprite_types(self):
        """A being's inherent qualities are its powers; `Adept Metamagics` and `New Metamagic: X` name metamagics;
        `New Sprite Types` names sprites."""
        md = """<!-- page 110 -->
# ZORP LIFE
## Inherent Zorp Form Qualities
### Glow Shift
The zorp glows at will.
## Adept Metamagics
### Fizz Way
An adept fizzes.
## Game Information
### New Metamagic: Hum Gift
A gift of humming.
## New Sprite Types
### Wobble Sprite
**Skills:** Electronics
**Powers:** Shield
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        files = crb.extract(text).files
        names = lambda k: sorted(e.findtext("name") for e in ET.fromstring(files[f"{k}.xml"]))  # noqa: E731
        self.assertEqual((names("critterpowers"), names("metamagics"), names("sprites")),
                         (["Glow Shift"], ["Fizz Way", "Hum Gift"], ["Wobble Sprite"]))

    def test_runins_under_a_parent_naming_the_kind_and_edge_actions_anywhere(self):
        """A heading's run-ins are its parent's kind when the parent names one (and the heading is no entry); a
        run-in naming the kind itself introduces it; a program's own words give its type; `N Edge: X` is an Edge
        action wherever it is printed."""
        md = """<!-- page 140 -->
# MAKING IT ZORP
### Autosofts and E-Softs
#### Core Zorp Mods
**Zorp Programs:** Zorp programs are a hybrid of things.
**Glow Jack:** This e-soft opens glowing locks.
**Fizz Pilot:** It flies fizzily.
#### Zorp Rules
**Rules:** A made-up rule.
## Positive Qualities
### The Zorp Pool
#### Fix It
**2 Edge: Lucky Spanner**
Spend 2 Edge to fix a zorp.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        files = crb.extract(text).files
        p = {e.findtext("name"): e.attrib for e in ET.fromstring(files["programs.xml"])}
        self.assertEqual(sorted(p), ["Fizz Pilot", "Glow Jack"])
        self.assertEqual((p["Glow Jack"]["type"], p["Fizz Pilot"]["type"]), ("e-soft", "core zorp mods"))
        a = {e.findtext("name"): e.attrib for e in ET.fromstring(files["actions.xml"])}
        self.assertEqual((a["Lucky Spanner"]["type"], a["Lucky Spanner"]["edge"]), ("edge", "2"))

    def test_new_fire_actions_and_sprite_commands(self):
        """`New Fire Actions …` lists actions as run-ins (`New Edge Action: X` names one; `New Status: X` is none);
        a sprite's commands under `New Sprite Commands` are its powers."""
        md = """<!-- page 150 -->
# ZORP MAYHEM
#### New Fire Actions and Statuses
**Called Shot: Glow Fire**
Fire a glowing shot.
**New Edge Action: Called Shot: Zap Point**
Zap a point. Cost 2 Edge.
**New Status: Glowing**
You glow.
# POINTS OF ZORP
## New Sprite Commands
### Fizz Sprite
**Fizz Ken:** Your fizz sprite helps.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        files = crb.extract(text).files
        names = lambda k: sorted(e.findtext("name") for e in ET.fromstring(files[f"{k}.xml"]))  # noqa: E731
        self.assertEqual((names("actions"), names("critterpowers")),
                         (["Called Shot: Glow Fire", "Called Shot: Zap Point"], ["Fizz Ken"]))

    def test_a_title_that_only_mentions_a_kind_names_none(self):
        """The kind's words must head the heading: `New Echoes` lists echoes; a book or group titled `Echoes of …`
        doesn't, and a `Program Slots` heading lists no programs."""
        md = """<!-- page 60 -->
# Echoes of a Glowing Fizz
**Scenario Overview:** The runners chase a glow.
**GM Note:** Keep it moving.
# TECHNO TOOLS
## Zorp Clan
### Echoes of the Zorp
**Posted by:** a zorp.
### New Echoes
**Fizz Link:** You link to the fizz.
**Glow Mind:** Your mind glows.
### Active Program Slots
**Core Slots:** Two of them.
### Glow Autosofts and E-Softs
**Glow Pilot:** It pilots glowing things.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        files = crb.extract(text).files
        names = lambda k: sorted(e.findtext("name") for e in ET.fromstring(files[f"{k}.xml"]))  # noqa: E731
        self.assertEqual(names("echoes"), ["Fizz Link", "Glow Mind"])
        self.assertEqual(names("programs"), ["Glow Pilot"])

    def test_techniques_under_a_section_naming_them(self):
        md = """<!-- page 33 -->
# CHROME LIFE
## Chrome Fighting
### Zapware Martial Arts Techniques
Made-up techniques for made-up limbs.
#### Glow Grip
Grip with a glowing hand.
#### Spin Kick
Kick while spinning.
#### ZAPWARE OVERDRIVE BONUSES
Made-up bonuses.
"""
        text, _ = regroup.regroup(md, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        files = crb.extract(text).files
        self.assertEqual(sorted(e.findtext("name") for e in ET.fromstring(files["martialtechniques.xml"])),
                         ["Glow Grip", "Spin Kick"])

    def test_a_path_needs_steps_and_a_name_of_its_own(self):
        """A heading under a Quality Paths section is a path only with steps under it and a name of its own: the
        `Roleplaying` and `Strategies` advice every chapter prints (one with steps under it too) is none."""
        text, _ = regroup.regroup(PATHS, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        p = {e.findtext("name"): e for e in ET.fromstring(crb.extract(text).files["qualitypaths.xml"])}
        self.assertEqual(list(p), ["Glow Shield"])
        self.assertEqual([s.text for s in p["Glow Shield"].findall("step")], ["Bright Wall", "Brighter Wall"])

    def test_the_rule_sections_stay(self):
        rules = {e.findtext("name") for e in ET.fromstring(self.res.files["rules.xml"])}
        self.assertIn("Fizz Probe", rules)


if __name__ == "__main__":
    unittest.main()


class FormsAndReprintsTest(unittest.TestCase):
    """A heading the section above names as one of its forms is an action (owner, 2026-10-07); a run-in list that
    points to the page where its entries are defined reprints them (no second entry). Invented book."""
    MD = """<!-- page 41 -->
# MATRIX
## Programs
### Programs
#### Hacking
• **Zap:** Zaps a made-up icon.
• **Fizz:** Fizzes it.
# MAGIC
## Spells
### Glowspelling
Glowspelling dims a glow, and it comes in one of two forms: glow guard and unglowing.
#### Glow Guard
To use it, take a Glowspell Major Action and roll.
#### Unglowing
The caster chooses the Glowspell action and rolls.
#### Glow Trick
Spend a Minor Action to glow.
# RIGGING
## Rigs
#### Rigger Programs
Riggers can use some programs. See the **Programs** section (p. 40) for more detail.
**Zap:** +1 to a made-up drone.
**Wobble:** +2 to another.
"""

    @classmethod
    def setUpClass(cls):
        text, _ = regroup.regroup(cls.MD, crb.ALIASES, name_headers=crb.NAME_HEADERS)
        cls.res = crb.extract(text)

    def kind(self, k):
        return [(e.findtext("name"), e.get("type"), e.get("page")) for e in ET.fromstring(self.res.files[f"{k}.xml"])]

    def test_a_heading_named_as_one_of_its_sections_forms_is_an_action(self):
        got = {n: t for n, t, _ in self.kind("actions")}
        self.assertEqual({n: got.get(n) for n in ("Glow Guard", "Unglowing")}, {"Glow Guard": "major", "Unglowing": None})
        self.assertNotIn("Glow Trick", got)  # (an action word, but no form of its section)

    def test_a_list_pointing_to_its_entries_page_reprints_them(self):
        got = self.kind("programs")
        self.assertEqual([n for n, _, _ in got].count("Zap"), 1)
        self.assertIn("Wobble", [n for n, _, _ in got])  # (a program the cited page doesn't define: its own entry)
