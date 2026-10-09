"""The metamagic and spell flags (importer/sr6/flags.py), alone and read by the core rulebook recipe from a made-up
book. Every name and line is invented."""
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import flags, regroup
from importer.sr6.recipes import crb

MD = """<!-- page 131 -->
# MAGIC
Magic intro.
## Spells
### Spell Descriptions
How made-up spells read.
### Combat Spells
#### Fizz Bolt
##### (Direct)
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | M | I | 3 |
A made-up bolt of fizz.
### Health Spells
#### Glow Mend
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| T | P | P | 3 |
Roll Sorcery + Magic (5 – Essence); each net hit mends a made-up box.
### Illusion Spells
#### Hum Haze
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | M | S | 2 |
The caster's Sorcery + Magic is opposed by the viewer's Willpower + Intuition.
#### Quiet Hum
| RANGE | TYPE | DURATION | DV |
|---|---|---|---|
| LOS | P | S | 2 |
A made-up hush, as opposed to a made-up roar.
## Metamagics
#### Glow Stance (Adepts Only)
A made-up stance.
#### Spark Point (Adepts Only)
Gain a made-up spark. You can take this as many times as you like.
#### Fizz Shield
A made-up shield.
<!-- page 140 -->
# STREET MOVES
## Made-Up Martial Arts Techniques
#### Zap Elbow
A made-up elbow, hummed. **Category:** Striking, the user must already
know Glow Jab. Requires a hum limb.
#### Zap Knee
A made-up knee. **Category:** Grappling
"""


def read(kind):
    text, _ = regroup.regroup(MD, crb.ALIASES, name_headers=crb.NAME_HEADERS)
    return {e.findtext("name"): e for e in ET.fromstring(crb.extract(text).files[f"{kind}.xml"])}


class FlagsTest(unittest.TestCase):
    def test_metamagic_user_from_the_name_note_or_the_section(self):
        self.assertEqual(flags.metamagic("Glow Stance (Adepts Only)"), ("Glow Stance", {"user": "adept"}))
        self.assertEqual(flags.metamagic("Fizz Craft (Magicians Only)"), ("Fizz Craft", {"user": "magician"}))
        self.assertEqual(flags.metamagic("Fizz Way", "", ["Force and Grace", "Adept Metamagics"]), ("Fizz Way", {"user": "adept"}))
        self.assertEqual(flags.metamagic("Hum Gift", "", ["(Adepts Only)"]), ("Hum Gift", {"user": "adept"}))
        self.assertEqual(flags.metamagic("Fizz Shield", "A made-up shield.", ["Metamagics"]), ("Fizz Shield", {}))

    def test_metamagic_taken_again(self):
        self.assertEqual(flags.metamagic("Spark", "You can take this as many times as you like.")[1], {"perLevel": "true"})
        self.assertEqual(flags.metamagic("Shift", "This metamagic can be taken multiple times, each a new way.")[1],
                         {"perLevel": "true"})
        self.assertEqual(flags.metamagic("Hop", "It may be selected up to three times.")[1], {"perLevel": "true", "maxLevel": "3"})
        # (another thing done more than once is no second taking)
        self.assertEqual(flags.metamagic("Loop", "The spell can be sustained multiple times.")[1], {})

    def test_spell_opposed_and_essence(self):
        self.assertEqual(flags.spell("combat", "A made-up bolt."), {"opposed": "true"})  # every Combat spell
        self.assertEqual(flags.spell("illusion", "Opposed by Willpower + Logic."), {"opposed": "true"})
        self.assertEqual(flags.spell("manipulation", "Roll Sorcery + Magic vs. Object Resistance."), {"opposed": "true"})
        self.assertEqual(flags.spell("detection", "The spell is resisted by Willpower."), {"opposed": "true"})
        self.assertEqual(flags.spell("detection", "Only sights there, as opposed to sights near them."), {})
        self.assertEqual(flags.spell("health", "Roll Sorcery + Magic (5 – Essence)."), {"essence": "true"})
        self.assertEqual(flags.spell("health", "Heals a made-up box."), {})

    def test_technique_prerequisites(self):
        r = flags.requires
        # a Restriction label line (shapes.martial): the kind word after the name, or `know`
        self.assertEqual(r("**Category:** Striking\n**Restriction:** Requires the Zap Hop technique\nHop."),
                         [("requires", {"kind": "technique"}, "Zap Hop")])
        self.assertEqual(r("**Restriction:** Requires the Glow Sense quality"), [("requires", {"kind": "quality"}, "Glow Sense")])
        # no kind word: the entry's own text names it with one (`the Fizz Hands power`), else other
        self.assertEqual(r("If the adept has the Fizz Hands power active, fizz.\n**Restriction:** Requires Fizz Hands"),
                         [("requires", {"kind": "adeptpower"}, "Fizz Hands")])
        # the closing line after the last sentence, wrapped and hyphenated, several prerequisites
        self.assertEqual(r("Hum a lot. **Category:** Mobility, the user\nmust already know Zap Hop. Requires a glow\nimplant or a hum lim-\nb."),
                         [("requires", {"kind": "technique"}, "Zap Hop"), ("requires", {"kind": "other"}, "glow implant or a hum limb")])
        self.assertEqual(r("x. **Category:** General, user must have at least 1.5 Essence in glow, user must know\none or both versions of zap hop."),
                         [("requires", {"kind": "other"}, "at least 1.5 Essence in glow"), ("requires", {"kind": "technique"}, "zap hop")])
        # a usage note, a prerequisite word outside the closing line: none
        self.assertEqual(r("This made-up move requires a Minor Action.\n**Category:** Weapon\n**Restriction:** May only be used with sticks"), [])
        self.assertEqual(flags.technique_category("Zap. **Category:** Grappling,\nrequires a hum limb."), "Grappling")
        self.assertIsNone(flags.technique_category("No closing line."))

    def test_the_recipe_writes_them(self):
        s = read("spells")
        self.assertEqual({n: (e.get("opposed"), e.get("essence")) for n, e in s.items()},
                         {"Fizz Bolt": ("true", None), "Glow Mend": (None, "true"), "Hum Haze": ("true", None),
                          "Quiet Hum": (None, None)})
        m = read("metamagics")
        self.assertEqual({n: (e.get("id"), e.get("user"), e.get("perLevel")) for n, e in m.items()},
                         {"Glow Stance": ("glow-stance", "adept", None), "Spark Point": ("spark-point", "adept", "true"),
                          "Fizz Shield": ("fizz-shield", None, None)})
        # a technique a section heading lists: its closing line's category and prerequisites
        t = read("martialtechniques")
        self.assertEqual({n: (e.get("category"), [(r.get("kind"), r.text) for r in e.iter("requires")]) for n, e in t.items()},
                         {"Zap Elbow": ("Striking", [("technique", "Glow Jab"), ("other", "hum limb")]),
                          "Zap Knee": ("Grappling", [])})
        # the printed name stays a search name
        self.assertEqual([a.text for a in m["Glow Stance"].iter("alias")], ["Glow Stance (Adepts Only)"])


if __name__ == "__main__":
    unittest.main()
