"""CRB recipe: spells from made-up boxes in the converter's shape, and (gated) parity with the oracle
captured before the importer existed."""
import unittest
from collections import Counter
import xml.etree.ElementTree as ET
from pathlib import Path

from importer.recipes import crb, identify

# Invented spells, laid out as the converter prints the CRB's spell boxes: a one-cell table titled
# "<FAMILY> SPELLS" whose lines are <br>-separated, two text columns interleaved, the chapter's margin
# tab letters as lone lines or glued to a line's ends, "�" for a period, names wrapping onto the
# second line, and grouped names ("A / B*") sharing one row. The printed page is the PDF page - 2.
MD = """<!-- page 12 -->
**SHADOWRUN**
Prose that names the Glimmer Sight spell in passing.
| DETECTION SPELLS |
|---|
| Made-up intro to the box� Left column text Right column text<br>SPELL TYPE THRESHOLD NOTES<br>Glimmer Sight Detection (analysis, I) 2 Invented notes for the spell�<br>A<br>Know Detection 4 Tells the caster tomorrow’s weather� N<br>Weather (enhancement, S) more notes here�<br>W<br>d Odd Hunch Detection 0 Hits determine nothing�<br>(enhancement, S)<br>**Area-based threshold:** 0 for a made-up rule� |
**10**
<!-- page 13 -->
| d COMBAT SPELLS |
|---|
| SPELL TYPE THRESHOLD OR NOTES<br>OPPOSING POOL<br>Frost Kiss / Combat Area-based On a hit, invented damage:<br>L<br>Ember Kiss* (direct, I) • **DV:** made up<br>r<br>Zap / Combat Athletics Invented notes<br>Big Zap / (indirect, I) more notes<br>E Small zap* Close Combat • **Zap:** a made-up effect<br>A * Frost Kiss, Ember Kiss, Zap, Big Zap and Small zap are different spells� |
| NOT A SPELL BOX |
|---|
| SPELL TYPE THRESHOLD NOTES<br>Fake Row Detection 3 Ignored� |
**11**
"""


class SpellsTest(unittest.TestCase):
    def setUp(self):
        self.res = crb.extract(MD)
        self.items = [(e.get("id"), e.get("kind"), e.get("category"), e.get("source"), e.get("page"), e.find("name").text)
                      for e in ET.fromstring(self.res.files["spells.xml"])]

    def test_spells(self):
        self.assertEqual(self.items, [
            ("spell-glimmer-sight", "spell", "detection", "CRB", "10", "Glimmer Sight"),
            ("spell-know-weather", "spell", "detection", "CRB", "10", "Know Weather"),
            ("spell-odd-hunch", "spell", "detection", "CRB", "10", "Odd Hunch"),
            ("spell-frost-kiss", "spell", "combat", "CRB", "11", "Frost Kiss"),
            ("spell-ember-kiss", "spell", "combat", "CRB", "11", "Ember Kiss"),
            ("spell-zap", "spell", "combat", "CRB", "11", "Zap"),
            ("spell-big-zap", "spell", "combat", "CRB", "11", "Big Zap"),
            ("spell-small-zap", "spell", "combat", "CRB", "11", "Small zap"),
        ])

    def test_overlay_keeps_texts_out(self):
        for e in ET.fromstring(self.res.files["spells.xml"]):
            self.assertEqual(e.find("text").text or "", "")

    def test_texts_hold_the_row_without_margin_letters(self):
        texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts["spell-know-weather"],
                         "Detection 4 Tells the caster tomorrow’s weather. (enhancement, S) more notes here.")
        self.assertEqual(texts["spell-odd-hunch"], "Detection 0 Hits determine nothing. (enhancement, S)")
        self.assertEqual(texts["spell-ember-kiss"], texts["spell-frost-kiss"])  # a group shares its row

    def test_source(self):
        self.assertEqual(self.res.source, {"id": "CRB", "name": crb.NAME, "publisher": "Catalyst Game Labs", "canon": True})


class FurnitureTest(unittest.TestCase):
    def test_real_words_survive(self):
        lines = ["Oracle of the made-up kind", "Lore about nothing", "A spell of invented use", "I made this up",
                 "Detection 4 An invented note", "Eerie hum"]
        self.assertEqual(crb._furniture(lines), lines)

    def test_tab_letters_go(self):
        self.assertEqual(crb._furniture(["W", "d Odd Hunch Detection 0", "A * Made-up footnote", "Some notes N"]),
                         ["Odd Hunch Detection 0", "* Made-up footnote", "Some notes"])


    def test_other_chapters_tabs(self):
        self.assertEqual(crb._furniture(["I Tests; more", "I made this", "v", "u **Name:** words"], "vIrTuALWOd"),
                         ["Tests; more", "I made this", "**Name:** words"])


# Invented Amps and gear, laid out as the converter (v5) prints the CRB's equipment boxes: a one-cell table
# per box, bold run-in names "**Name:** (paren) effects", lines <br>-separated, "�" for a period, words
# hyphenated at a line's end, the chapter's margin tab letters (MUNDANE / AWAKENED / VIRTUAL / MECHANICAL
# WORLD) as lone lines or glued to a line's start, and a paren the layout pushed before its name.
AMPS_MD = """<!-- page 140 -->
| MADE UP GEAR SELECTION |
|---|
| A few **examples** of made-up gear�<br>**Glow stick:** (Equipment, 2,500¥) makes a dim light�<br>**Zoom goggles:** (Rating 5 Equipment<br>M<br>Amp, 27,500¥) RR 1 on Perception (physical) and Stealth<br>u (physical) Tests; night vision� |
| ZAP GUN AMPS |
|---|
| **Zapper X:** (taser, Rating 5 Equipment Amp, 27,500¥) DV 6; range [OK/<br>OK/Dis�/–]; RR 1 on Ranged Weapons (pistols) Tests� N<br>**Buzz blade:** (short weapon, Rating 1 Equipment Amp, 7,500¥) DV (STR+1); range [OK/–/–/–]; glows� |
| PADDED WEAR AMPS |
|---|
| **Padded vest:** (Rating 2 Equipment Amp, 12,500¥) Armor 2, RR 1 on Influence (etiquette) Tests� |
| MADE UP TOXINS |
|---|
| Some prose� **Sleepdust** and **Nod** are always equipment that needs an Edge� |
**138**
<!-- page 157 -->
| MADE UP HEADWARE |
|---|
| **Brain box:** (Rating 11, Cyberware Amp, Essence -1, 55,000 ¥) RR 1 on all Logic-<br>based Tests�<br>**Jack plug:** (Rating 4 Cyberware Amp, Essence -1, 20,000¥) Direct neural interface; cold-<br>sim VR; allows the user to jump into vehicles� |
| MADE UP CONTACTS |
|---|
| **Fence:** (Rating 2 Contact Amp, 10,000¥) RR 1 on Network (street) Tests�<br>(Rating 4 Contact Amp, 20,000¥) RR 1<br>**Night clerk:**<br>on Network (street and criminal) Tests� |
**155**
<!-- page 176 -->
| FOLLOWING A MADE UP SPIRIT |
|---|
| **Owl:** (Rating 4 Quality Amp, 20,000¥) RR 1 on Perception (physical), Stealth (physical), or Sorcery (detection spells) Tests (choose 2 out of the 3)�<br>**Watchful (disposition):** Made up�<br>**Similar Archetypes:** Night, Wisdom<br>**Glow Fist:** (Rating 3 Adept power Amp, 15,000¥) DV +2 on unarmed attacks� |
**174**
<!-- page 212 -->
| CYBERDECKS AND MADE UP PROGRAMS |
|---|
| **Echo:** (narrative effect, Amp Rating +1) repeats things�<br>**Toy deck:** (Rating 6 Cyberdeck Amp, 30,000¥)<br>Firewall 2; Attack 2; RR 1 on Cracking (brute force)<br>I Tests� |
**210**
<!-- page 240 -->
| MADE UP VEHICLES |
|---|
| **Hover sled:** (Rating 4 Vehicle Amp, 20,000¥) Pilot 6, Body 5, Handling 2, Speed 5, Armor 2; flying�<br>**Sports Car:** (Rating 1 Vehicle Amp, 5,000¥) Pilot 6, Body 5, Handling 2, Speed 5, Armor 0�<br>**Big Van:** Pilot 6, Body 9, Handling 1, Speed 3, Armor 9�<br>**Nurse bot:** (Rating 3 Drone Amp, 15,000¥) Small drone, Pilot 8, stationary�<br>C<br>**Tiny Scout:** (Rating 1 Drone Amp, 5,000¥) Pilot 6, Body 0, Handling 10, Speed 0 (Flying 1), Armor 0; no weapon mount� |
**238**
"""


class AmpsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.res = crb.extract(AMPS_MD)
        cls.amps = {a.get("id"): a for a in ET.fromstring(cls.res.files["amps.xml"])}

    def fx(self, aid):
        return [f.get("ref") + (f":{f.get('param')}" if f.get("param") else "") + (f"={f.get('value')}" if f.get("value") else "")
                for f in self.amps[aid].findall("effect")]

    def test_entries(self):
        self.assertEqual([(i, a.get("type"), a.get("printedRating"), a.get("page"), a.find("name").text) for i, a in self.amps.items()], [
            ("zoom-goggles", "equipment", "5", "138", "Zoom goggles"),
            ("zapper-x-taser", "equipment", "5", "138", "Zapper X (Taser)"),
            ("buzz-blade", "equipment", "1", "138", "Buzz blade"),
            ("padded-vest", "equipment", "2", "138", "Padded vest"),
            ("brain-box", "cyberware", "11", "155", "Brain box"),
            ("jack-plug", "cyberware", "4", "155", "Jack plug"),
            ("fence", "contact", "2", "155", "Fence"),
            ("night-clerk", "contact", "4", "155", "Night clerk"),
            ("owl-mentor-spirit-night-wisdom", "quality", "4", "174", "Owl Mentor Spirit Night Wisdom"),
            ("glow-fist", "adept", "3", "174", "Glow Fist"),
            ("mod-echo", "cyberdeck", "1", "210", "Echo"),
            ("toy-deck", "cyberdeck", "6", "210", "Toy deck"),
            ("hover-sled", "vehicle", "4", "238", "Hover sled"),
            ("sports-car", "vehicle", "1", "238", "Sports Car"),
            ("nurse-bot", "vehicle", "3", "238", "Nurse bot"),
            ("tiny-scout", "vehicle", "1", "238", "Tiny Scout"),
        ])
        self.assertEqual(self.amps["mod-echo"].get("mod"), "true")

    def test_effects_reproduce_the_printed_rating(self):
        self.assertEqual({i: self.fx(i) for i in self.amps}, {
            "zoom-goggles": ["rr-spec:perception.physical", "rr-spec:stealth.physical-sneaking", "narrative"],
            "zapper-x-taser": ["dv-plus", "range-improve:OK/OK/-/- -> OK/OK/Dis/-", "rr-spec:ranged-weapons.pistols"],
            "buzz-blade": ["narrative"],
            "padded-vest": ["rr-spec:influence.etiquette"],
            "brain-box": ["rr-attr:log"],
            "jack-plug": ["vr-cold", "vcr"],
            "fence": ["rr-spec:network.street"],
            "night-clerk": ["rr-spec:network.street", "rr-spec:network.criminal"],
            "owl-mentor-spirit-night-wisdom": ["rr-spec", "rr-spec"],
            "glow-fist": ["dv-plus", "dv-plus"],
            "mod-echo": ["narrative"],
            "toy-deck": ["firewall-plus", "attack-plus", "attack-plus", "rr-spec:cracking.brute-force"],
            "hover-sled": ["vehicle-armor", "vehicle-armor", "flying"],
            "sports-car": [],
            "nurse-bot": ["pilot-plus", "pilot-plus"],
            "tiny-scout": [],
        })
        self.assertEqual([r for r in self.res.report if r["kind"] == "rating-mismatch"], [])

    def test_items_and_chassis(self):
        item = {i: dict(a.find("item").attrib) for i, a in self.amps.items() if a.find("item") is not None}
        self.assertEqual(item["zapper-x-taser"], {"kind": "weapon", "dv": "6", "ranges": "OK/OK/Dis/-"})
        self.assertEqual(item["buzz-blade"], {"kind": "weapon", "dv": "S+1", "ranges": "OK/-/-/-"})
        self.assertEqual(item["padded-vest"], {"kind": "armor", "armor": "2"})
        self.assertEqual(item["zoom-goggles"], {"kind": "gear"})
        self.assertEqual({i: a.get("vehicle") for i, a in self.amps.items() if a.get("vehicle")},
                         {"hover-sled": "chopper", "sports-car": "sports-car", "nurse-bot": "small-drone", "tiny-scout": "microdrone"})

    def test_gear(self):
        self.assertEqual([(g.get("id"), g.get("kind"), g.get("page"), g.find("name").text) for g in ET.fromstring(self.res.files["gear.xml"])], [
            ("gear-glow-stick", "gear", "138", "Glow stick"),
            ("gear-sleepdust", "gear", "138", "Sleepdust"),
            ("gear-nod", "gear", "138", "Nod"),
        ])

    def test_texts_hold_the_entry_without_furniture(self):
        texts = {t.get("id"): t.text for t in ET.fromstring(self.res.texts)}
        self.assertEqual(texts["zoom-goggles"], "RR 1 on Perception (physical) and Stealth (physical) Tests; night vision.")
        self.assertEqual(texts["jack-plug"], "Direct neural interface; cold-sim VR; allows the user to jump into vehicles.")
        self.assertEqual(texts["gear-glow-stick"], "makes a dim light.")
        for a in self.amps.values():
            self.assertEqual(a.find("narrative").text or "", "")


class MatchTest(unittest.TestCase):
    def test_known_file(self):
        self.assertEqual(crb.match({"sha256": crb.SHA256[0], "title": ""}, ""), 1.0)

    def test_markers(self):
        head = "<!-- page 2 -->\nThe new alternate core rulebook for the Shadowrun game, Anarchy 2.0.\n"
        self.assertEqual(identify({"sha256": "", "title": ""}, head)[0], crb)

    def test_other_books(self):
        self.assertEqual(crb.match({"sha256": "", "title": ""}, "daegann shadow amps base"), 0.0)


ROOT = Path(__file__).resolve().parents[2]
BOOK = ROOT / ".extract/private/library/crb/book.md"
ORACLE = ROOT / ".extract/private/oracle/spells.xml"
# Differences with the old catalog, each with its cause (ids only, no book text):
# - the old catalog cited a prose mention, not the spell box: Increase Reflexes (179), Heal and
#   Control Thoughts (184); the recipe cites the box (182, 182, 183);
# - the old catalog wrote "Magic fingers"; the box prints "Magic Fingers";
# - Elemental Aura is in the CRB v1.8 manipulation box; the old catalog listed it as DHSA only.
KNOWN_PAGES = {"spell-increase-reflexes": ("179", "182"), "spell-heal": ("184", "182"),
               "spell-control-thoughts": ("184", "183")}
KNOWN_NAMES = {"spell-magic-fingers": ("Magic fingers", "Magic Fingers")}
KNOWN_EXTRA = {"spell-elemental-aura"}


LIBRARY = ROOT / ".extract/private/library"
OWN = {"crb": "CRB", "dhsa": "DHSA", "pregens": "PREGENS"}  # qref-* -> QREF


@unittest.skipUnless(BOOK.exists(), "owner's converted books not present")
class IdentifyBooksTest(unittest.TestCase):
    """Every recipe's match() on each converted book's head: only the book's own recipe reaches the threshold."""

    def test_each_book_has_one_recipe(self):
        from importer.recipes import RECIPES, THRESHOLD
        books = sorted(p for p in LIBRARY.glob("*/book.md"))
        self.assertGreaterEqual(len(books), 3)
        for b in books:
            own = OWN.get(b.parent.name, "QREF" if b.parent.name.startswith("qref") else None)
            head = b.read_text(encoding="utf8")[:4000]
            scores = {r.ID: r.match({"sha256": "", "title": ""}, head) for r in RECIPES}
            self.assertEqual({i for i, s in scores.items() if s >= THRESHOLD}, {own}, (b.parent.name, scores))
            self.assertEqual(identify({"sha256": "", "title": ""}, head)[0].ID, own)


@unittest.skipUnless(BOOK.exists() and ORACLE.exists(), "owner's converted CRB book and oracle not present")
class ParityTest(unittest.TestCase):
    """The 33 source="CRB" spells of today's catalog: id, kind, category, page and name."""

    @classmethod
    def setUpClass(cls):
        res = crb.extract(BOOK.read_text(encoding="utf8"))
        cls.new = {e.get("id"): e for e in ET.fromstring(res.files["spells.xml"])}
        cls.old = {e.get("id"): e for e in ET.parse(ORACLE).getroot() if e.get("source") == "CRB"}

    def test_book_matches_without_its_hash(self):
        self.assertEqual(crb.match({"sha256": ""}, BOOK.read_text(encoding="utf8")[:4000]), 0.9)

    def test_ids(self):
        self.assertEqual(len(self.old), 33)
        self.assertEqual((set(self.old) - set(self.new), set(self.new) - set(self.old)), (set(), KNOWN_EXTRA))

    def test_fields(self):
        diffs = {}
        for i, o in self.old.items():
            n = self.new[i]
            for f in ("kind", "category", "source"):
                self.assertEqual(n.get(f), o.get(f), i)
            if n.get("page") != o.get("page"):
                diffs.setdefault("page", {})[i] = (o.get("page"), n.get("page"))
            if n.find("name").text != o.find("name").text:
                diffs.setdefault("name", {})[i] = (o.find("name").text, n.find("name").text)
        self.assertEqual(diffs, {"page": KNOWN_PAGES, "name": KNOWN_NAMES})


AMPS_ORACLE = ROOT / ".extract/private/oracle"
# The old catalog's CRB amps were DHSA rows that DHSA prints in black (core-book content), paged by a name
# search in an older core book. Differences with what the v1.8 boxes print, each with its cause (ids only):
# - renamed: DHSA added the model's type ("… (Combat Bike)", "… (Small drone - wheeled)", "(BTL)", the
#   underbarrel launcher) where v1.8 prints the model name alone, or named it differently (v1.8's paren:
#   sniper rifle, submachine gun, taser; the plural "recorders"; mentor archetypes in printed order;
#   "Muscle augmentation", "Medium drone", "Revolution Bike", the sword weapon focus, plural patches).
RENAMED = {
    "ares-alpha-mk-ii-assault-rifle-underbarrel-grenade-launcher": "ares-alpha-mk-ii-assault-rifle",
    "ares-docwagon-first-responder-medium-drone-tracked": "ares-docwagon-first-responder",
    "artemis-industries-nightwing-personal-glider-wing": "artemis-industries-nightwing",
    "barrett-model-122-anti-materiel-rifle": "barrett-model-122-sniper-rifle",
    "bear-mentor-spirit-strength-protection": "bear-mentor-spirit-protection-strength",
    "berserker-btl": "berserker", "casanova-btl": "casanova",
    "chrysler-nissan-pursuit-v-small-drone-wheeled": "chrysler-nissan-pursuit-v",
    "cyberspace-design-quadrotor-small-flying-drone-rotor": "cyberspace-design-quadrotor",
    "dragonslayer-mentor-spirit-heroism-adventure": "dragonslayer-mentor-spirit-adventure-heroism",
    "evo-reflexultra-reflex-recorder": "evo-reflexultra-reflex-recorders",
    "gm-nissan-doberman-medium-drone-tracked": "gm-nissan-doberman",
    "harley-davidson-centaur-combat-bike": "harley-davidson-centaur",
    "horizon-doble-revolution-monocycle": "horizon-doble-revolution-bike",
    "ingram-smartgun-smg": "ingram-smartgun-submachine-gun",
    "lockheed-optic-x2-small-flying-drone-winged": "lockheed-optic-x2",
    "mct-nissan-roto-drone-medium-flying-drone-rotor": "mct-nissan-roto-drone",
    "medium-drones": "medium-drone",
    "mitsubishi-nightsky-stretch-limousine": "mitsubishi-nightsky",
    "muscle-replacement-2": "muscle-augmentation",
    "rigid-inflatable-boat-boat": "rigid-inflatable-boat",
    "shiawase-kanmushi-microdrone-arthropod": "shiawase-kanmushi",
    "steel-lynx-large-drone-wheeled-on-legs": "steel-lynx",
    "weapon-focus-katana": "weapon-focus-sword",
    "yamaha-pulsar-tasers": "yamaha-pulsar-taser",
    "gear-stim-patch": "gear-stim-patches", "gear-trauma-patch": "gear-trauma-patches",
}
# - not in any v1.8 box: the Concealment adept power (only a pregen lists it), the flying variants of the
#   base drones (v1.8 prints "Speed N (Flying M)" on the base drone), cyberdeck Attack/Firewall add-ons and
#   the vehicle Flying add-on (v1.8's boxes list none).
UNREACHABLE = {"concealment", "flying-microdrone", "small-flying-drone", "medium-flying-drones",
               "mod-attack", "mod-firewall", "mod-flying"}
# - page: the box, not a prose mention (Actioneer on p.149, bioware muscle on p.159, the patches on p.160;
#   every mentor spirit is in the p.174 box).
AMP_PAGES = {"actioneer-business-suit": ("148", "149"), "muscle-replacement-2": ("158", "159"),
             "gear-stim-patch": ("158", "160"), "gear-trauma-patch": ("158", "160"),
             **{f"{m}-mentor-spirit-{a}": ("175", "174") for m, a in (
                 ("coyote", "deceit-mischief"), ("dog", "friendship-loyalty"), ("raccoon", "cat-burglar"),
                 ("thunderbird", "anger-war"), ("wolf", "community-hunt"), ("dragonslayer", "heroism-adventure"))}}
# - v1.8 prints the autonomous medkits as Drone Amps (DHSA: equipment); their Pilot now explains the rating.
AMP_TYPES = {"crashcart-essential-autonomous-medkit": ("equipment", "vehicle"),
             "docwagon-pro-autonomous-medkit": ("equipment", "vehicle")}
# - effects (new effects pinned, as (ref, param, value)): the old reader missed the Red Dog's 5 vehicles
#   (read 3), counted "combat" as a club ("bat") for the lethal-toxin knife and couldn't map Novacoke's RRs;
#   DHSA gives the Ingram RR on pistols (v1.8: submachine guns); the medkits above (Pilot 6 and 9).
AMP_EFFECTS = {
    "ares-red-dog-series": [("firewall-plus", "", ""), ("firewall-plus", "", ""), ("rcc", "", "5"), ("rr-skill", "piloting", "")],
    "combat-knife-coated-with-a-lethal-toxin": [("dv-plus", "", ""), ("dv-plus", "", "")],
    "novacoke": [("negative", "", "2"), ("rr-attr", "cha", ""), ("rr-spec", "perception.social", "")],
    "ingram-smartgun-smg": [("narrative", "", ""), ("rr-spec", "ranged-weapons.submachine-guns", "")],
    "crashcart-essential-autonomous-medkit": [],
    "docwagon-pro-autonomous-medkit": [("pilot-plus", "", "")] * 3,
}
# - items (new descriptor pinned): the weapon foci were gear; v1.8 prints them as melee weapons with DV and
#   range. The medkits are vehicles now, with no item.
AMP_ITEMS = {
    "weapon-focus-knife": {"kind": "weapon", "dv": "S+1/CHA+1", "ranges": "OK/-/-/-"},
    "weapon-focus-katana": {"kind": "weapon", "dv": "S+2/CHA+2", "ranges": "OK/-/-/-"},
    "crashcart-essential-autonomous-medkit": None,
    "docwagon-pro-autonomous-medkit": None,
}
# v1.8 prints Amps DHSA doesn't reprint in black (contacts, vehicle control rigs, eyes and ears, bone lacing,
# base vehicles, more weapons, drugs and drones): counted by type, no names.
EXTRA_BY_TYPE = {"bioware": 1, "contact": 16, "cyberdeck": 1, "cyberware": 15, "equipment": 4, "quality": 1, "vehicle": 10}


def _fx(e):
    return sorted((f.get("ref"), f.get("param") or "", f.get("value") or "") for f in e.findall("effect"))


@unittest.skipUnless(BOOK.exists() and (AMPS_ORACLE / "amps.xml").exists(), "owner's converted CRB book and oracle not present")
class AmpsParityTest(unittest.TestCase):
    """The 148 source="CRB" amps and 13 gear items of today's catalog: type, printed rating, effects, page."""

    @classmethod
    def setUpClass(cls):
        res = crb.extract(BOOK.read_text(encoding="utf8"))
        cls.new = {e.get("id"): e for f in ("amps.xml", "gear.xml") for e in ET.fromstring(res.files[f])}
        cls.old = {e.get("id"): e for f in ("amps.xml", "gear.xml") for e in ET.parse(AMPS_ORACLE / f).getroot()
                   if e.get("source") == "CRB"}
        cls.report = res.report

    def test_every_oracle_entry_is_found(self):
        self.assertEqual(len(self.old), 161)
        missing = set(self.old) - set(self.new) - set(RENAMED) - UNREACHABLE
        self.assertEqual((missing, set(RENAMED.values()) - set(self.new), UNREACHABLE & set(self.new)), (set(), set(), set()))

    def test_fields(self):
        diffs = {}
        for i, o in self.old.items():
            if i in UNREACHABLE:
                continue
            n = self.new[RENAMED.get(i, i)]
            self.assertEqual((n.tag, n.get("printedRating"), n.get("mod"), n.get("source")),
                             (o.tag, o.get("printedRating"), o.get("mod"), "CRB"), i)
            self.assertEqual(n.find("name").text.casefold() == o.find("name").text.casefold(), i not in RENAMED, i)
            for f, known in (("page", AMP_PAGES), ("type", AMP_TYPES)):
                if n.get(f) != o.get(f):
                    diffs.setdefault(f, {})[i] = (o.get(f), n.get(f))
            if _fx(n) != _fx(o):
                diffs.setdefault("effects", {})[i] = _fx(n)
            item = [None if e.find("item") is None else dict(e.find("item").attrib) for e in (o, n)]
            if item[0] != item[1]:
                diffs.setdefault("items", {})[i] = item[1]
        self.assertEqual(diffs, {"page": AMP_PAGES, "type": AMP_TYPES, "effects": AMP_EFFECTS, "items": AMP_ITEMS})

    def test_extras(self):
        extra = Counter(e.get("type") or e.get("kind") for i, e in self.new.items()
                        if i not in self.old and i not in RENAMED.values())
        self.assertEqual(dict(extra), EXTRA_BY_TYPE)

    def test_report(self):
        # the whip's printed rating is 1 for DV 7 (+2 over the base): the old catalog listed it as a book
        # discrepancy too; the jet-ski has no boat chassis. The RCC's "choose 1 specialization" stays open.
        self.assertEqual(sorted((r["kind"], r.get("id") or r.get("spec")) for r in self.report),
                         [("rating-mismatch", "jet-ski"), ("rating-mismatch", "monofilament-whip"),
                          ("unresolved-spec", "piloting (choose 1 specialization)")])


if __name__ == "__main__":
    unittest.main()
