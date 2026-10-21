"""CRB recipe, core files: made-up tables in the converter's shape, and (gated) the answer key: with the owner's local
copies of the core files (public/data, gitignored) and the converted CRB present, the recipe's core files must equal
them, names and attributes; descriptions are the texts' (checked apart)."""

import contextlib
import io
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path
from unittest import mock

from importer import CORE_FILES, DATA_DIR
from importer.recipes import cg, crb, crb_core, dhsa
from importer.tests import LOCAL_CORE, ROOT

# Made-up book pages in the layout the converter gives the CRB's core tables (printed page = PDF page - 2; the GAME
# CONCEPTS margin tab's letters as lone lines or glued to a line's ends). Every name and number is invented.
MD = """<!-- page 52 -->
HUMANS
**Racial Quality:** none
ELVES
**Racial Quality:** glow sight
<!-- page 54 -->
Strength (STR/S) is made-up strength.
Agility (AGI/A) is made-up agility.
Willpower (WIL/W) is made-up will.
C Logic (LOG/L) is made-up logic.
Charisma (CHA/C) is made-up charm.
| **STRENGTH** | **AGILITY** | **WILLPOWER** | **LOGIC** | **CHARISMA** | **EDGE** |
|---|---|---|---|---|---|
O
C Human 1-3 1-3 1-3 1-3 1-3 5
| Elf | 1-3 | 1-4 | 1-3 | 1-3 | 1-5 | 2 |
|---|---|---|---|---|---|---|
**52**
<!-- page 55 -->
SNEAKING
**Linked Attribute:** Agility or Logic C
Sneaking is a made-up skill.
TINKERING
Logic
**Linked Attribute:**
Only characters with a cyberdeck can use this Skill.
<!-- page 56 -->
| SKILLS, SPECIALIZATIONS, |
|---|
| AND RELATED ATTRIBUTES |
| GENErAL SKILLS<br>**Sneaking:** hiding (+A), picking<br>locks (+A/L)<br>TEChNICAL SKILLS<br>**Tinkering:** gizmos B&R (+L) |
<!-- page 60 -->
AWAKENED
**Base rating 1**
• **Glow sight:** rating +1
• **Glow sight and flight:** rating +2
GIZMOWARE
**Base rating 2, Essence -0.7**
It requires the Awakened Amp with the Tinker option.
<!-- page 62 -->
PUNCHBAG
**Base rating 1**
Made-up amp type. Each has a front-facing weapon mount for any weapon.
• **Tiny drone:** Pilot 5, Body 1, Handling 8, Speed 1 (fly-
ing 3), Armor 0, no weapon mount, Advantage on Sneaking (hiding) Tests.
• **Big wagon:** Pilot 5, Body 9, Handling 1, Speed 2, Armor 1.
This list is made up.
<!-- page 85 -->
| CHARACTER COST CHEAT SHEET |  |
|---|---|
| **TYPE** | **COST** |
Attribute
11,000¥ per point (but the last)
22,000¥ for the last point
| Skill | 3,000¥ per point up to rating 4<br>6,000¥ per point for ratings 5 to 8 |
|---|---|
Specialization
3,500¥ M
| Knowledge Skill | 1,500¥ |
|---|---|
Shadow Amp
6,000¥ per point C
| Equipment | 2,000¥ |
|---|---|
Weapon (melee or simple ranged)
2,000¥
| Expert weapon | 4,000¥ |
|---|---|
Armor
1,500¥ per point
| Spell | 7,000¥ |
|---|---|
**83**
<!-- page 86 -->
LEVELS OF PLAY
Made-up intro.
<!-- page 87 -->
ROOKIE
• **Nuyen:** 200,000¥ to build the character
• **Attributes:** none at the max rating
• **Skills:** max rating 3
• **Risk Reduction:** max 1, including from stacking
LEGEND
• **Nuyen:** 600,000¥ to build the character
• **Attributes:** up to 3 Attributes at max rating
• **Skills:** max rating 7
• **Risk Reduction:** max 2 for Attributes and Skills, max 3 for specializations, including from stacking
POINT ALLOCATION
<!-- page 88 -->
| ROOKIE LEVEL | CHARACTER | CREATION |  |  |
|---|---|---|---|---|
| **OPTION** | **ATTRIBUTES** | **SKILLS** | **AMPS** | **OTHER** |
**Balanced** 10 (none at max) 20
12 1 commlink, 1 fake SIN, 1 armor (2),
2 standard weapons, 1 equipment
| **Magician** | 10 (none at max) | 20 | 8 | 1 commlink, 1 fake SIN, 1 armor (2),<br>1 standard weapon, 2 equipment, 3 spells |
|---|---|---|---|---|
| LEGEND | LEVEL | CHARACTER | CREATION |  |
|---|---|---|---|---|
**Fighter** 18 (3 at max) 45 (1 at rating 6)
**86**
30 1 commlink, 1 fake SIN, 1 armor (4),
5 standard weapons, 2 specialist weapons,
1 equipment
<!-- page 144 -->
| WEAPONS |
|---|
| Made-up intro text<br>RANGE<br>CLOSE SHORT MEDIUM LONG<br>WEAPONS DV (≤ 2 M) (3 TO 15 M)(16 TO 60 M) (> 60 M)<br>**Unarmed** STR OK – – –<br>**Short weapons** (spoon, fork, (STR+3) OK Dis� – –<br>ladle)<br>**Zap pistols** (Toy Zapper*) 4 OK OK Dis� –<br>d<br>L **Cannons**** (Big Bertha) 11 (Anti- – – Dis� OK<br>N vehicle 15)<br>**Gas jars*** depends on OK OK Dis� –<br>E toxins<br>u * These weapons use toxins, made up� |
<!-- page 150 -->
| ARMOR |
|---|
| Made-up armor rules�<br>ARMOR<br>ARMOR RATING<br>Padded clothes 1<br>d Quilted suit (pillow, duvet, 2<br>r<br>etc�)<br>A Tin shield +1<br>d<br>Armor costs made-up nuyen� |
<!-- page 168 -->
| LIFESTYLE |
|---|
| Made-up lifestyle rules�<br>**Nomad:** Lives in a made-up van� A nomad earns an extra 500 ¥ per run� They suffer a Disadvantage on made-up Tests�<br>**Plain:** A plain home� Plain lifestyle is the default level�<br>**Posh:** A made-up mansion� A posh character earns 4,000¥ less per run� |
"""


def by_id(xml):
    return {e.get("id"): e for e in ET.fromstring(xml)}


class CoreTablesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files, cls.texts, cls.report = crb_core.build(MD)

    def test_unreadable_tables_are_reported_not_written(self):
        # the made-up pages have no SHADOW AMP EFFECTS table
        self.assertNotIn("ampeffects.xml", self.files)
        self.assertEqual([(r["kind"], r["file"]) for r in self.report], [("core-unread", "ampeffects.xml")])

    def test_owner_decisions_on_two_effects(self):
        # owner, 2026-10-10: weapon focus has no max (the table prints none); mental armor isn't a general effect, only the
        # Astral Armor adept power and a cyberdeck's Biofeedback filter carry it
        fx = {e[0]: e[3] for e in crb_core.EFFECTS}
        self.assertNotIn("once", fx["weapon-focus"])
        self.assertEqual(fx["mental-armor"]["types"], "adept cyberdeck")

    def test_a_shamanic_mask_is_read_where_the_book_says_it(self):
        # a made-up box page: the sentence wrapped and hyphenated across <br> lines
        page = {
            170: "| Made-up text. A shamanic mask is con-<br>sidered a negative effect and reduces the rating of the<br>"
            "Awakened Amp by 2 (made up). |"
        }
        self.assertEqual(crb_core.shamanic_mask(page), (170, 2))
        self.assertIsNone(crb_core.shamanic_mask({170: "A shamanic mask glows."}))

    def test_attributes_and_metatypes(self):
        a = by_id(self.files["attributes.xml"])
        self.assertEqual(
            [(i, e.get("abbr"), e.findtext("name"), e.get("page")) for i, e in a.items()],
            [
                ("str", "STR", "Strength", "52"),
                ("agi", "AGI", "Agility", "52"),
                ("wil", "WIL", "Willpower", "52"),
                ("log", "LOG", "Logic", "52"),
                ("cha", "CHA", "Charisma", "52"),
            ],
        )
        m = by_id(self.files["metatypes.xml"])
        self.assertEqual(m["human"].get("edge"), "5")
        self.assertEqual(m["human"].findtext("racialQuality"), "")
        self.assertEqual(m["elf"].findtext("racialQuality"), "Glow sight")
        self.assertEqual(
            [(r.get("attr"), r.get("min"), r.get("max")) for r in m["elf"].iter("range")],
            [("str", "1", "3"), ("agi", "1", "4"), ("wil", "1", "3"), ("log", "1", "3"), ("cha", "1", "5")],
        )

    def test_skills(self):
        s = by_id(self.files["skills.xml"])
        self.assertEqual(
            {i: (e.get("attr"), e.get("alt"), e.get("requires"), e.get("page")) for i, e in s.items()},
            {"sneaking": ("agi", "log", None, "53"), "tinkering": ("log", None, "cyberdeck", "53")},
        )
        self.assertEqual(
            [(sp.get("id"), sp.get("attr"), sp.text) for sp in s["sneaking"].iter("spec")],
            [("sneaking.hiding", "agi", "Hiding"), ("sneaking.picking-locks", "agi", "Picking locks")],
        )
        self.assertEqual([sp.get("id") for sp in s["tinkering"].iter("spec")], ["tinkering.gizmos-br"])

    def test_amp_types_and_vehicles(self):
        t = by_id(self.files["amptypes.xml"])
        self.assertEqual(
            {i: (e.get("base"), e.get("essence"), e.get("requires")) for i, e in t.items()},
            {"awakened": ("1", "0", None), "gizmoware": ("2", "0.7", "awk-tinker"), "punchbag": ("1", "0", None)},
        )
        v = by_id(self.files["vehicles.xml"])
        self.assertEqual(
            {
                i: (
                    e.get("pilot"),
                    e.get("body"),
                    e.get("handling"),
                    e.get("speed"),
                    e.get("flyingSpeed"),
                    e.get("armor"),
                    e.get("mount"),
                )
                for i, e in v.items()
            },
            {
                "tiny-drone": ("5", "1", "8", "1", "3", "0", "none (Advantage on hiding)"),
                "big-wagon": ("5", "9", "1", "2", None, "1", "any"),
            },
        )

    def test_pricing_with_the_defaults(self):
        p = ET.fromstring(self.files["pricing.xml"])[0]
        self.assertEqual(
            {
                k: p.get(k)
                for k in (
                    "attrPoint",
                    "attrLastPoint",
                    "skillLow",
                    "skillLowMax",
                    "skillHigh",
                    "spec",
                    "knowledge",
                    "ampPoint",
                    "equipment",
                    "weaponStandard",
                    "weaponSpecialist",
                    "armorPoint",
                    "spell",
                    "complexForm",
                    "refundEffectRemoval",
                )
            },
            {
                "attrPoint": "11000",
                "attrLastPoint": "22000",
                "skillLow": "3000",
                "skillLowMax": "4",
                "skillHigh": "6000",
                "spec": "3500",
                "knowledge": "1500",
                "ampPoint": "6000",
                "equipment": "2000",
                "weaponStandard": "2000",
                "weaponSpecialist": "4000",
                "armorPoint": "1500",
                "spell": "7000",
                "complexForm": "7000",
                "refundEffectRemoval": "false",
            },
        )

    def test_levels_and_packages(self):
        lv = by_id(self.files["levels.xml"])
        self.assertEqual(
            {
                i: (
                    e.findtext("name"),
                    e.get("nuyen"),
                    e.get("attrAtMax"),
                    e.get("skillCap"),
                    e.get("rrAttr"),
                    e.get("rrSkill"),
                    e.get("rrSpec"),
                    e.get("page"),
                )
                for i, e in lv.items()
            },
            {
                "rookie": ("Rookie", "200000", "0", "3", "1", "1", "1", "85"),
                "legend": ("Legend", "600000", "3", "7", "2", "2", "3", "85"),
            },
        )
        pk = by_id(self.files["packages.xml"])
        keys = (
            "level",
            "attrPoints",
            "attrAtMax",
            "skillPoints",
            "skillsAtSix",
            "ampPoints",
            "armor",
            "standardWeapons",
            "specialistWeapons",
            "equipment",
            "spells",
        )
        self.assertEqual(
            {i: tuple(e.get(k) for k in keys) for i, e in pk.items()},
            {
                "rookie-balanced": ("rookie", "10", "0", "20", "0", "12", "2", "2", "0", "1", "0"),
                "rookie-magician": ("rookie", "10", "0", "20", "0", "8", "2", "1", "0", "2", "3"),
                "legend-fighter": ("legend", "18", "3", "45", "1", "30", "4", "5", "2", "1", "0"),
            },
        )

    def test_weapons_armor_lifestyles_and_their_texts(self):
        w = by_id(self.files["weapons.xml"])
        self.assertNotIn("unarmed", w)
        self.assertEqual(
            {
                i: (e.findtext("name"), e.get("dv"), e.get("ranges"), e.get("specialist"))
                for i, e in w.items()
                if i != "cannon"
            },
            {
                "short-weapon": ("Short weapon", "STR+3", "OK/Dis/-/-", None),
                "zap-pistol": ("Zap pistol", "4", "OK/OK/Dis/-", None),
                "gas-jar": ("Gas jar", "toxin", "OK/OK/Dis/-", None),
            },
        )
        self.assertEqual((w["cannon"].get("dv"), w["cannon"].get("specialist")), ("11 (anti-vehicle 15)", "true"))
        a = by_id(self.files["armor.xml"])
        self.assertEqual(
            {i: (e.findtext("name"), e.get("armor")) for i, e in a.items()},
            {
                "padded-clothes": ("Padded clothes", "1"),
                "quilted-suit": ("Quilted suit", "2"),
                "tin-shield": ("Tin shield", "1"),
            },
        )
        life = by_id(self.files["lifestyles.xml"])
        self.assertEqual({i: e.get("perRun") for i, e in life.items()}, {"nomad": "500", "plain": "0", "posh": "-4000"})
        texts = {(of, i): t for of, i, t in self.texts}
        self.assertEqual(texts[("items", "short-weapon")], "Spoon, fork, ladle.")
        self.assertEqual(texts[("items", "cannon")], "Big Bertha. Specialist weapon.")
        self.assertEqual(texts[("items", "quilted-suit")], "Pillow, duvet, etc.")
        self.assertIn("Disadvantage", texts[("lifestyles", "nomad")])
        # the core files carry no descriptions
        for xml in self.files.values():
            self.assertFalse([e for e in ET.fromstring(xml).iter("text") if e.text])


class ExtractTest(unittest.TestCase):
    def test_core_files_in_the_result_and_texts_apart(self):
        res = crb.extract(MD)
        self.assertEqual(set(res.core), {f"{n}.xml" for n in CORE_FILES} - {"ampeffects.xml"})
        self.assertIn(("items", "short-weapon", "Spoon, fork, ladle."), res.core_texts)
        self.assertIn(
            {"kind": "core-unread", "file": "ampeffects.xml"},
            [{k: r[k] for k in ("kind", "file")} for r in res.report if "file" in r],
        )

    def test_a_book_adds_to_the_core_amp_effects_but_never_replaces_one(self):
        from importer.__main__ import _no_core_overrides

        head = '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="ampeffects" version="1">'
        files = {
            "ampeffects.xml": head
            + '<effect id="rr-attr" category="x" rating="1" types="quality" source="X" page="1"><name>Cheap</name></effect>'
            '<effect id="made-up-grade" category="grade" rating="1" types="cyberware" source="X" page="1"><name>New</name></effect></ca2:data>',
            "amps.xml": "<untouched/>",
        }
        out, rows = _no_core_overrides(files)
        self.assertEqual([e.get("id") for e in ET.fromstring(out["ampeffects.xml"])], ["made-up-grade"])
        self.assertEqual(out["amps.xml"], "<untouched/>")
        self.assertEqual([(r["kind"], r["id"]) for r in rows], [("core-override", "rr-attr")])

    def test_a_table_neither_the_book_nor_the_core_has_imports_spells_only(self):
        # the core in place lacks ampeffects.xml, and the made-up pages have no effects table either
        import shutil
        from importer.tests import FIXTURE_CORE

        with tempfile.TemporaryDirectory() as tmp:
            for f in FIXTURE_CORE.iterdir():
                if f.name != "ampeffects.xml":
                    shutil.copy(f, tmp)
            with (
                mock.patch.dict(os.environ, {"CA2_CORE_DIR": tmp, "CA2_CUSTOM_DIR": tmp}),
                mock.patch("importer.DATA_DIR", tmp),
            ):
                res = crb.extract(MD)
        self.assertEqual(set(res.core), {f"{n}.xml" for n in CORE_FILES} - {"ampeffects.xml"})
        skipped = [r for r in res.report if r.get("kind") == "amps-skipped"]
        self.assertEqual(len(skipped), 1)
        self.assertIn("missing: ampeffects.xml", skipped[0]["problem"])

    def test_run_writes_the_core_files_unscoped_and_keeps_them_out_of_the_index(self):
        from importer.__main__ import run
        from importer.tests.test_run import SCHEMA, XSD_CHECK, node

        with tempfile.TemporaryDirectory() as tmp:
            book, custom = os.path.join(tmp, "library", "crb"), os.path.join(tmp, "custom")
            os.makedirs(book)
            Path(book, "book.md").write_text(
                "<!-- page 1 -->\nShadowrun made-up Alternate Core Rulebook\n" + MD, encoding="utf8"
            )
            run(book, custom, convert_pdf=False)
            core = Path(custom, "imported", "core")
            self.assertEqual(
                sorted(p.name for p in core.iterdir()), sorted(f"{n}.xml" for n in CORE_FILES if n != "ampeffects")
            )
            self.assertIn('<item id="short-weapon"', (core / "weapons.xml").read_text(encoding="utf8"))
            self.assertNotIn("core/", Path(custom, "imported", "index.xml").read_text(encoding="utf8"))
            texts = Path(custom, "texts", "crb.xml").read_text(encoding="utf8")
            self.assertIn('<text of="items" id="short-weapon">Spoon, fork, ladle.</text>', texts)
            self.assertIn('<text of="lifestyles" id="nomad">', texts)
            for f in [*core.iterdir(), Path(custom, "texts", "crb.xml")]:
                kind = ET.parse(f).getroot().get("kind")
                xsd = "items" if kind in ("weapons", "armor") else kind
                r = node(
                    "--input-type=module",
                    "-e",
                    XSD_CHECK,
                    str(f),
                    os.path.join(SCHEMA, f"{xsd}.xsd"),
                    os.path.join(SCHEMA, "common.xsd"),
                )
                self.assertEqual(r.returncode, 0, f"{f.name}: {r.stderr}")


class AiFallbackTest(unittest.TestCase):
    """Any core table the recipe can't read: the AI reads only those tables' pages and proposes only their rows, each
    checked against its table's schema; the accepted ones become the core files, and the import report lists each table
    as read by AI instead of unread. The fake provider answers with invented rows; no core data is needed."""

    # invented rows, by the page the chunk starts on (page 3: levels, 4: weapons, 5: pricing)
    REPLIES = {
        "3": {
            "levels": [
                {
                    "id": "street",
                    "name": "Street <b>",
                    "page": 3,
                    "nuyen": 111000,
                    "attrAtMax": 1,
                    "skillCap": 5,
                    "rrAttr": 1,
                    "rrSkill": 1,
                    "rrSpec": 2,
                    "onload": "alert(1)",
                },
                {
                    "id": "Big Time!",
                    "name": "Big time",
                    "page": 3,
                    "nuyen": "lots",
                    "attrAtMax": 2,
                    "skillCap": 6,
                    "rrAttr": 1,
                    "rrSkill": 1,
                    "rrSpec": 2,
                },
            ],
            "items": [
                {
                    "name": "Stray spoon",
                    "kind": "weapon",
                    "category": None,
                    "page": 3,
                    "dv": "1",
                    "armor": None,
                    "ranges": None,
                }
            ],
        },
        "4": {
            "items": [
                {
                    "name": "Pea shooter",
                    "kind": "weapon",
                    "category": "Pistols",
                    "page": 4,
                    "dv": "2",
                    "armor": None,
                    "ranges": "OK/OK/-/-",
                },
                {
                    "name": "Tin spoon",
                    "kind": "gear",
                    "category": None,
                    "page": 4,
                    "dv": None,
                    "armor": None,
                    "ranges": None,
                },
            ]
        },
        "5": {
            "pricing": [
                {
                    "page": 5,
                    "attrPoint": 1100,
                    "attrLastPoint": 2200,
                    "skillLow": 330,
                    "skillLowMax": 4,
                    "skillHigh": 660,
                    "spec": 440,
                    "knowledge": 220,
                    "ampPoint": 550,
                    "equipment": 330,
                    "weaponStandard": 350,
                    "weaponSpecialist": 700,
                    "armorPoint": 300,
                    "spell": 650,
                    "complexForm": None,
                }
            ]
        },
    }

    def _book(self, tmp, unread):
        from importer import xmlio

        book = os.path.join(tmp, "library", "crb")
        md = "<!-- page 1 -->\n# Intro\nMade up.\n\n" + "".join(
            f"<!-- page {n} -->\n# Page {n}\n" + "Filler text. " * 900 + "\n\n" for n in range(2, 7)
        )
        xmlio.write_file(os.path.join(book, "book.md"), md)
        rows = [
            {"kind": "core-unread", "file": f, "page": p, "mdPages": f"{p}-{p}", "problem": "made up"}
            for f, p in unread
        ]
        xmlio.write_import(
            book,
            report=rows + [{"kind": "unresolved-spec", "spec": "made-up"}],
            files={"spells.xml": 3},
            file="crb.pdf",
            sha256="00",
            converter="6",
            pages=6,
            score="1.00",
            recipe="crb",
            source="CRB",
            name="Made-up core",
            publisher="P",
            canon="true",
            imported="2026-09-28T00:00:00+00:00",
        )
        return book

    def _ask(self, asked):
        import json
        import re

        def ask(system, user):
            asked.append((system, user))
            got = [
                self.REPLIES.get(n, {}) for n in re.findall(r"^# Page (\d+)$", user, re.M)
            ]  # the pages this chunk holds
            return json.dumps(
                {k: [r for g in got for r in g.get(k, [])] for k in {k for g in got for k in g} | {"items"}}
            )

        return ask

    def _valid(self, path, xsd):
        from importer.tests.test_run import SCHEMA, XSD_CHECK, node

        r = node(
            "--input-type=module",
            "-e",
            XSD_CHECK,
            str(path),
            os.path.join(SCHEMA, xsd),
            os.path.join(SCHEMA, "common.xsd"),
        )
        self.assertEqual(r.returncode, 0, f"{path}: {r.stderr}")

    def test_every_unread_table_is_proposed_checked_and_applied(self):
        from importer import xmlio
        from importer.__main__ import apply_core_review
        from importer.ai import propose as P

        with tempfile.TemporaryDirectory() as tmp:
            book, custom = self._book(tmp, [("levels.xml", 3), ("weapons.xml", 4), ("pricing.xml", 5)]), os.path.join(
                tmp, "custom"
            )
            asked = []
            with mock.patch.object(P, "mechanics", side_effect=AssertionError("a core review needs no core data")):
                P.propose(book, self._ask(asked), provider="made-up", core=True)
            sent = " ".join(u for _, u in asked)
            self.assertTrue(all(f"# Page {n}\n" in sent for n in (3, 4, 5)))
            self.assertNotIn("# Page 6", sent)  # only the chunks holding the unread tables' pages
            self.assertIn("levels and pricing and weapons tables", asked[0][0])
            self.assertIn('"levels"', asked[0][0])  # the JSON shape of each table
            root = ET.parse(os.path.join(book, "review.xml")).getroot()
            self.assertEqual((root.get("core"), root.get("source")), ("true", "CRB"))
            props = {p.get("id"): p for p in root.findall("proposal")}
            # only the unread tables' rows: the weapon on the levels page too, never the gear
            self.assertEqual(
                set(props),
                {"level.street", "level.big-time", "weapon.stray-spoon", "weapon.pea-shooter", "pricing.core"},
            )
            street = props["level.street"].find("level")
            self.assertEqual(street.findtext("name"), "Street <b>")  # escaped text, not markup
            self.assertIsNone(street.get("onload"))  # only the schema's properties become attributes
            self.assertEqual(props["level.street"].findall("note"), [])
            self.assertIn("doesn’t fit the levels table", props["level.big-time"].findtext("note"))
            price = props["pricing.core"].find("pricing")
            self.assertEqual(
                (price.get("complexForm"), price.get("refundEffectRemoval"), price.get("source")),
                ("650", "false", "CRB"),
            )
            self._valid(os.path.join(book, "review.xml"), "review.xsd")

            for p in root.findall("proposal"):
                p.set("state", "accepted")
            ET.ElementTree(root).write(os.path.join(book, "review.xml"), encoding="unicode")
            apply_core_review(book, custom)
            core = Path(custom, "imported", "core")
            self.assertEqual(sorted(f.name for f in core.iterdir()), ["levels.xml", "pricing.xml", "weapons.xml"])
            for f, xsd in (("levels.xml", "levels.xsd"), ("pricing.xml", "pricing.xsd"), ("weapons.xml", "items.xsd")):
                self._valid(core / f, xsd)
            self.assertEqual([e.get("id") for e in ET.parse(core / "levels.xml").getroot()], ["street"])
            self.assertEqual(
                [e.get("id") for e in ET.parse(core / "weapons.xml").getroot()], ["stray-spoon", "pea-shooter"]
            )
            rows = [r.attrib for r in xmlio.read_import(book).iter("row")]
            self.assertFalse([r for r in rows if r.get("kind") == "core-unread"])
            self.assertEqual(
                {r["file"]: r["entries"] for r in rows if r.get("kind") == "core-ai"},
                {"levels.xml": "1", "pricing.xml": "1", "weapons.xml": "2"},
            )  # read by AI: the report says so
            skipped = [r for r in rows if r.get("proposal")]
            self.assertEqual([r["proposal"] for r in skipped], ["level.big-time"])
            self.assertIn({"kind": "unresolved-spec", "spec": "made-up"}, rows)
            self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "done")
            # a Re-import starts with remove, which writes the record afresh: no table is still listed as read by AI (the
            # recipe's run then reports only what it couldn't read this time)
            from importer import xmlio
            from importer.__main__ import remove

            remove(book, custom, status=False, root=xmlio.CA2)
            self.assertEqual([r.get("kind") for r in xmlio.read_import(book).iter("row")], [])

    def test_an_edit_that_breaks_a_row_or_a_second_pricing_row_stays_out(self):
        from importer import xmlio
        from importer.__main__ import apply_core_review
        from importer.ai import propose as P

        with tempfile.TemporaryDirectory() as tmp:
            book, custom = self._book(tmp, [("levels.xml", 3), ("pricing.xml", 5)]), os.path.join(tmp, "custom")
            self.REPLIES = {**self.REPLIES, "5": {"pricing": self.REPLIES["5"]["pricing"] * 2}}
            P.propose(book, self._ask([]), core=True)
            root = ET.parse(os.path.join(book, "review.xml")).getroot()
            for p in root.findall("proposal"):
                p.set("state", "edited" if p.get("id") == "level.street" else "accepted")
            root.find("proposal[@id='level.street']/level").set("skillCap", "-1")  # the user's edit breaks the row
            ET.ElementTree(root).write(os.path.join(book, "review.xml"), encoding="unicode")
            apply_core_review(book, custom)
            self.assertFalse(Path(custom, "imported", "core", "levels.xml").exists())
            self.assertEqual(len(ET.parse(Path(custom, "imported", "core", "pricing.xml")).getroot()), 1)
            rows = [r.attrib for r in xmlio.read_import(book).iter("row")]
            self.assertEqual(
                sorted(r["proposal"] for r in rows if r.get("proposal")),
                ["level.big-time", "level.street", "pricing.core-2"],
            )
            self.assertEqual(
                [r["file"] for r in rows if r.get("kind") == "core-unread"], ["levels.xml"]
            )  # still unread
            self.assertEqual([r["file"] for r in rows if r.get("kind") == "core-ai"], ["pricing.xml"])

    def _round_trip(self, core_dir):
        """Every entry of the core files in `core_dir`, as the model would send it, comes back as the same entry: the JSON
        shapes hold every attribute the tables use."""
        from importer import use_core
        from importer.ai import propose as P
        from importer.ai.schema import CORE

        for table in CORE:
            for el in ET.parse(os.path.join(core_dir, f"{table}.xml")).getroot():
                if (
                    el.get("source") != "CRB"
                ):  # the owner's copies still hold DHSA's implant grades, which its import adds
                    continue
                raw = {
                    **el.attrib,
                    "page": int(el.get("page")),
                    "name": el.findtext("name"),
                    "racialQuality": el.findtext("racialQuality"),
                    "ranges": [r.attrib for r in el.iter("range")],
                    "specs": [{**s.attrib, "name": s.text} for s in el.iter("spec")],
                }
                with use_core(str(core_dir)):  # the ids it names resolve against the same core files
                    kind, i, _, xml, notes = P.core_entry(table, raw, el.get("source"), 1, set())
                back = ET.fromstring(xml)
                self.assertEqual((notes, back.tag, back.attrib), ([], el.tag, el.attrib), f"{table} {i}")
                self.assertEqual(
                    [(c.tag, c.attrib, (c.text or "").strip()) for c in back],
                    [(c.tag, c.attrib, (c.text or "").strip()) for c in el if c.tag != "text"]
                    + ([("text", {}, "")] if table == "lifestyles" else []),
                )

    def test_every_core_table_round_trips_through_its_json_shape(self):
        self._round_trip(ROOT / "tests/fixtures/mini/custom/imported/core")

    @unittest.skipUnless(LOCAL_CORE, "the owner's local core files aren't present")
    def test_the_answer_key_round_trips_too(self):
        self._round_trip(DATA_DIR)

    def test_ids_a_row_names_are_checked_on_propose_and_enforced_on_apply(self):
        """The schema can't check the ids a row names: the review notes them, and apply leaves such a row out, including
        one the user's edit broke. Invented rows; the made-up core files are in place (a levels table not being replaced).
        """
        from importer import xmlio
        from importer.__main__ import apply_core_review
        from importer.ai import propose as P

        spec = lambda a: [{"id": "sneak.quiet", "attr": a, "name": "Quiet"}]  # noqa: E731
        ranges = [{"attr": a, "min": 1, "max": 6} for a in ("str", "agi", "wil", "log", "cha")]
        self.REPLIES = {
            "3": {
                "skills": [
                    {
                        "id": "sneak",
                        "name": "Sneak",
                        "page": 3,
                        "attr": "agi",
                        "alt": None,
                        "requires": None,
                        "specs": spec("agi"),
                    },
                    {
                        "id": "bash",
                        "name": "Bash",
                        "page": 3,
                        "attr": "strength",
                        "alt": "wil",
                        "requires": None,
                        "specs": spec("brawn"),
                    },
                ],
                "metatypes": [
                    {"id": "gnome", "name": "Gnome", "page": 3, "edge": 1, "racialQuality": "Small", "ranges": ranges},
                    {
                        "id": "blob",
                        "name": "Blob",
                        "page": 3,
                        "edge": 1,
                        "racialQuality": "Round",
                        "ranges": ranges[:4] + [{"attr": "luck", "min": 1, "max": 6}],
                    },
                ],
            },
            "4": {
                "packages": [
                    {
                        "id": "runner-x",
                        "name": "X",
                        "page": 4,
                        "level": "runner",
                        "archetype": "x",
                        **dict.fromkeys(
                            (
                                "attrPoints",
                                "attrAtMax",
                                "skillPoints",
                                "skillsAtSix",
                                "ampPoints",
                                "armor",
                                "standardWeapons",
                                "specialistWeapons",
                                "equipment",
                                "spells",
                            ),
                            1,
                        ),
                    },
                    {
                        "id": "mythic-x",
                        "name": "Y",
                        "page": 4,
                        "level": "mythic",
                        "archetype": "y",
                        **dict.fromkeys(
                            (
                                "attrPoints",
                                "attrAtMax",
                                "skillPoints",
                                "skillsAtSix",
                                "ampPoints",
                                "armor",
                                "standardWeapons",
                                "specialistWeapons",
                                "equipment",
                                "spells",
                            ),
                            1,
                        ),
                    },
                ],
                "attributes": [{"id": "str", "name": "Brawn", "page": 4, "abbr": "B"}],
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            book, custom = self._book(
                tmp, [("skills.xml", 3), ("metatypes.xml", 3), ("packages.xml", 4), ("attributes.xml", 4)]
            ), os.path.join(tmp, "custom")
            P.propose(book, self._ask([]), core=True)
            root = ET.parse(os.path.join(book, "review.xml")).getroot()
            notes = {p.get("id"): [n.text for n in p.findall("note")] for p in root.findall("proposal")}
            expect = {
                "skill.bash": [
                    'attribute attr "strength" isn’t a known id',
                    'attribute of sneak.quiet "brawn" isn’t a known id',
                ],
                "metatype.blob": ['range attribute "luck" isn’t a known id', "needs one range for each attribute"],
                "package.mythic-x": ['level "mythic" isn’t a known id'],
            }  # (the schema's attribute enum notes the first two too)
            self.assertEqual({k for k, v in notes.items() if v}, set(expect))
            for k, want in expect.items():
                self.assertTrue(set(want) <= set(notes[k]), notes[k])
            for p in root.findall("proposal"):
                p.set("state", "accepted")
            root.find("proposal[@id='attribute.str']").set("state", "edited")
            root.find("proposal[@id='attribute.str']/attribute").set(
                "id", "brawn"
            )  # the edit renames an attribute the engine names
            ET.ElementTree(root).write(os.path.join(book, "review.xml"), encoding="unicode")
            apply_core_review(book, custom)
            core = Path(custom, "imported", "core")
            self.assertEqual(sorted(f.name for f in core.iterdir()), ["metatypes.xml", "packages.xml", "skills.xml"])
            self.assertEqual([e.get("id") for e in ET.parse(core / "skills.xml").getroot()], ["sneak"])
            self.assertEqual([e.get("id") for e in ET.parse(core / "metatypes.xml").getroot()], ["gnome"])
            self.assertEqual([e.get("id") for e in ET.parse(core / "packages.xml").getroot()], ["runner-x"])
            refused = {
                r.get("proposal"): r.get("problem") for r in xmlio.read_import(book).iter("row") if r.get("proposal")
            }
            self.assertEqual(set(refused), {"skill.bash", "metatype.blob", "package.mythic-x", "attribute.str"})
            self.assertIn('id "brawn" isn’t one the app uses for attributes', refused["attribute.str"])

    def test_nested_rows_edited_on_the_review_screen_are_checked_on_propose_and_apply(self):
        """A metatype's ranges and a skill's specializations: what the schema can't say (a minimum above its maximum, a
        specialization id used twice) is noted on propose; the review screen's edits of them land, and a broken edit is
        refused on apply like any other. Invented rows."""
        from importer import xmlio
        from importer.__main__ import apply_core_review
        from importer.ai import propose as P

        ranges = [{"attr": a, "min": 1, "max": 6} for a in ("str", "agi", "wil", "log", "cha")]
        quiet = {"id": "sneak.quiet", "attr": "agi", "name": "Quiet"}
        self.REPLIES = {
            "3": {
                "skills": [
                    {
                        "id": "sneak",
                        "name": "Sneak",
                        "page": 3,
                        "attr": "agi",
                        "alt": None,
                        "requires": None,
                        "specs": [quiet, quiet],
                    },
                    {
                        "id": "haggle",
                        "name": "Haggle",
                        "page": 3,
                        "attr": "cha",
                        "alt": None,
                        "requires": None,
                        "specs": [],
                    },
                ],
                "metatypes": [
                    {
                        "id": "gnome",
                        "name": "Gnome",
                        "page": 3,
                        "edge": 1,
                        "racialQuality": "Small",
                        "ranges": [{"attr": "str", "min": 4, "max": 2}, *ranges[1:]],
                    },
                    {"id": "sprite", "name": "Sprite", "page": 3, "edge": 2, "racialQuality": "Tiny", "ranges": ranges},
                ],
            }
        }
        with tempfile.TemporaryDirectory() as tmp:
            book, custom = self._book(tmp, [("skills.xml", 3), ("metatypes.xml", 3)]), os.path.join(tmp, "custom")
            P.propose(book, self._ask([]), core=True)
            path = os.path.join(book, "review.xml")
            root = ET.parse(path).getroot()
            notes = {p.get("id"): [n.text for n in p.findall("note")] for p in root.findall("proposal")}
            self.assertEqual(
                notes,
                {
                    "skill.sneak": ['two specializations have the id "sneak.quiet"'],
                    "skill.haggle": [],
                    "metatype.gnome": ["the str range’s minimum is above its maximum"],
                    "metatype.sprite": [],
                },
            )
            # the review screen's edits: the ranges and specs fixed, a spec added; the sprite's range and haggle's spec broken
            edit = lambda i: next(e for e in root.find(f"proposal[@id='{i}']") if e.tag != "note")  # noqa: E731
            for p in root.findall("proposal"):
                p.set("state", "edited")
            edit("metatype.gnome").find("range[@attr='str']").attrib.update(min="1", max="3")
            sneak = edit("skill.sneak")
            sneak.remove(sneak.findall("spec")[1])
            ET.SubElement(sneak, "spec", id="sneak.soft-steps", attr="wil").text = "Soft steps"
            edit("metatype.sprite").find("range[@attr='cha']").attrib.update(min="5", max="2")
            ET.SubElement(edit("skill.haggle"), "spec", id="haggle.loud", attr="luck").text = "Loud"
            ET.ElementTree(root).write(path, encoding="unicode")
            apply_core_review(book, custom)
            core = Path(custom, "imported", "core")
            for f in ("skills.xml", "metatypes.xml"):
                self._valid(core / f, f.replace(".xml", ".xsd"))
            skills = ET.parse(core / "skills.xml").getroot()
            self.assertEqual(
                [(s.get("id"), s.get("attr"), s.text) for s in skills.iter("spec")],
                [("sneak.quiet", "agi", "Quiet"), ("sneak.soft-steps", "wil", "Soft steps")],
            )
            self.assertEqual([e.get("id") for e in skills], ["sneak"])
            metas = ET.parse(core / "metatypes.xml").getroot()
            self.assertEqual([e.get("id") for e in metas], ["gnome"])
            self.assertEqual(metas.find("metatype/range[@attr='str']").attrib, {"attr": "str", "min": "1", "max": "3"})
            refused = {
                r.get("proposal"): r.get("problem") for r in xmlio.read_import(book).iter("row") if r.get("proposal")
            }
            self.assertEqual(set(refused), {"metatype.sprite", "skill.haggle"})
            self.assertIn("the cha range’s minimum is above its maximum", refused["metatype.sprite"])
            self.assertIn("luck", refused["skill.haggle"])

    def test_nested_row_checks_cover_blank_names_bad_ids_and_non_ascii_digits(self):
        from importer.ai import propose as P

        ranges = "".join(f'<range attr="{a}" min="1" max="6"/>' for a in ("str", "agi", "wil", "log"))
        meta = ET.fromstring(
            f'<metatype id="gnome"><name>G</name>{ranges}<range attr="cha" min="²" max="1"/></metatype>'
        )
        self.assertEqual(
            P.ref_notes("metatypes", meta, {}), []
        )  # "²" is a digit but not decimal: no crash (the schema refuses it)
        skill = ET.fromstring(
            '<skill id="sneak" attr="agi"><name>Sneak</name><spec id="sneak.quiet" attr="agi"> </spec>'
            '<spec id="sneak." attr="agi">!!</spec></skill>'
        )
        self.assertEqual(
            P.ref_notes("skills", skill, {}),
            [
                'specialization "sneak.quiet" has no name',
                'specialization id "sneak." must start and end with a letter or digit',
            ],
        )

    def test_a_row_may_name_a_row_of_the_same_review_and_a_replaced_table_counts_only_its_rows(self):
        from importer.ai import propose as P

        refs = P.core_refs(["level.mythic", "amptype.spirit"], replacing={"levels"})
        self.assertEqual(refs["levels"], {"mythic"})  # the core's levels are being replaced
        self.assertIn("quality", refs["amptypes"])  # still in place
        self.assertIn("spirit", refs["amptypes"])
        self.assertIn("emerged", refs["amptypes"])  # a made-up book's addition
        el = ET.fromstring(
            '<effect id="fx" category="c" rating="1" types="spirit ghost" requires="fx-2" source="CRB" page="1"><name>F</name></effect>'
        )
        self.assertEqual(
            P.ref_notes("ampeffects", el, refs),
            ['amp type "ghost" isn’t a known id', 'requires effect "fx-2" isn’t a known id'],
        )

    def test_cli_asks_the_provider_for_the_unread_tables_shape(self):
        from importer.__main__ import main
        from importer.ai import providers

        with tempfile.TemporaryDirectory() as tmp:
            book = self._book(tmp, [("vehicles.xml", 3), ("armor.xml", 4)])
            shapes = []
            with (
                mock.patch.object(
                    providers, "call", side_effect=lambda c, s, u, schema: shapes.append(schema) or '{"vehicles": []}'
                ),
                contextlib.redirect_stdout(io.StringIO()),
            ):
                self.assertEqual(main(["propose", book, "--library", os.path.join(tmp, "library"), "--core"]), 0)
            self.assertTrue(shapes)
            self.assertEqual(set(shapes[0]["properties"]), {"vehicles", "items"})


# ---------------------------------------------------------------- the answer key

BOOK = ROOT / ".extract/private/library/crb/book.md"
# Where CRB v1.8 and the owner's copies differ, and why (ids only, no book text). The recipe cites the page the entry
# is printed on; the owner's copies cite an earlier page for these:
KNOWN = {
    ("levels.xml", "ganger", "page"): ("84", "85"),
    ("levels.xml", "runner", "page"): ("84", "85"),  # the levels start on p.85
    ("packages.xml", "runner-balanced", "page"): ("85", "86"),
    ("packages.xml", "runner-magician", "page"): ("85", "86"),
    ("packages.xml", "runner-fighter", "page"): ("85", "86"),  # all three package tables are on p.86
    ("lifestyles.xml", "squatter", "page"): ("165", "166"),
    ("lifestyles.xml", "low", "page"): ("165", "166"),  # the box is on p.166
    ("skills.xml", "electronics", "page"): ("55", "54"),
    ("skills.xml", "network", "page"): ("55", "56"),  # the Skills' headings
    # the recipe cites the Astral Armor power it prices mental armor from; the owner's copy cites the rules on p.190
    ("ampeffects.xml", "mental-armor", "page"): ("190", "191"),
    # the owner's copy shortens the row's wording; the recipe keeps the row as printed (compared by length, so no book
    # wording is committed here)
    ("ampeffects.xml", "init-1", "name"): "row as printed",
    # owner decisions (2026-10-10) the local copies predate: no max on weapon focus (none printed); mental armor only on what
    # the book prints with it, the Astral Armor power and a deck's Biofeedback filter
    ("ampeffects.xml", "weapon-focus", "max"): ("1", None),
    ("ampeffects.xml", "mental-armor", "types"): (
        "quality cyberware bioware adept equipment cyberdeck",
        "adept cyberdeck",
    ),
    ("ampeffects.xml", "mental-armor", "name"): (
        "Armor +1 against mental damage (spells, astral, biofeedback)",
        "Mental armor +1: Astral Armor (adept power) or Biofeedback filter (cyberdeck)",
    ),
    # the Awakened amp's shamanic mask (p.169), read since the local copies were made
    **{
        ("ampeffects.xml", "awk-shamanic-mask", k): (None, v)
        for k, v in {
            "tag": "effect",
            "id": "awk-shamanic-mask",
            "category": "awakened",
            "rating": "-1",
            "types": "awakened",
            "max": "1",
            "source": "CRB",
            "page": "169",
            "name": "Shamanic mask",
        }.items()
    },
}


def entry(e):
    """An entry's names and attributes: its own, its name, and its children's (specs, ranges, racial quality)."""
    d = {"tag": e.tag, **e.attrib, "name": e.findtext("name")}
    for c in e:
        if c.tag == "spec":
            d[f"spec {c.get('id')}"] = (c.get("attr"), c.text)
        elif c.tag == "range":
            d[f"range {c.get('attr')}"] = (c.get("min"), c.get("max"))
        elif c.tag == "racialQuality":
            d["racialQuality"] = c.text or ""
    return d


def differences(files, source="CRB"):
    """{(file, id, key): (local copy, recipe)} over the local copies' entries citing `source`, plus entries only one has."""
    out = {}
    for name, xml in files.items():
        local = {i: e for i, e in by_id(Path(DATA_DIR, name).read_bytes()).items() if e.get("source") == source}
        got = by_id(xml)
        for i in local.keys() | got.keys():
            a, b = (entry(local[i]) if i in local else {}), (entry(got[i]) if i in got else {})
            for k in a.keys() | b.keys():
                if a.get(k) != b.get(k):
                    out[(name, i, k)] = (a.get(k), b.get(k))
    return out


def known(diff):
    """`differences` with the init-1 name difference as KNOWN writes it: the recipe's printed row is the longer one."""
    k = ("ampeffects.xml", "init-1", "name")
    if k in diff and len(diff[k][1]) > len(diff[k][0]):
        diff[k] = "row as printed"
    return diff


@unittest.skipUnless(LOCAL_CORE and BOOK.exists(), "the owner's local core copies and converted CRB are not present")
class AnswerKeyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files, cls.texts, cls.report = crb_core.build(BOOK.read_text(encoding="utf8"))

    def test_every_core_file_is_read(self):
        self.assertEqual(self.report, [])
        self.assertEqual(set(self.files), {f"{n}.xml" for n in CORE_FILES})

    def test_names_and_attributes_equal_the_local_copies(self):
        self.assertEqual(known(differences(self.files)), KNOWN)

    def test_texts_describe_core_entries_only(self):
        ids = {i for xml in self.files.values() for i in by_id(xml)}
        self.assertTrue(self.texts)
        self.assertEqual([(of, i) for of, i, t in self.texts if i not in ids or not t.strip()], [])
        local = {
            (n, i)
            for n in ("weapons.xml", "armor.xml", "lifestyles.xml")
            for i, e in by_id(Path(DATA_DIR, n).read_bytes()).items()
            if (e.findtext("text") or "").strip()
        }
        have = {i for _, i, _ in self.texts}
        # the owner's copies describe every weapon, armor and lifestyle; the book prints no examples for a few
        self.assertEqual(
            sorted(i for _, i in local if i not in have),
            [
                "armored-clothes",
                "armored-clothes-coat",
                "ballistic-shield",
                "bow",
                "crossbow",
                "gas-grenade",
                "grenade",
                "military-armor",
            ],
        )


CG_BOOK, DHSA_BOOK = ROOT / ".extract/private/library/cg/book.md", ROOT / ".extract/private/library/dhsa/book.md"


@unittest.skipUnless(
    LOCAL_CORE and CG_BOOK.exists() and DHSA_BOOK.exists(),
    "the owner's local core copies and converted CG/DHSA are not present",
)
class BookMechanicsAnswerKeyTest(unittest.TestCase):
    """The owner's copies also hold the CG's Tasking and Emerged and DHSA's implant grades: those books' recipes add them."""

    def test_cg_and_dhsa_add_their_entries(self):
        c, d = cg.extract(CG_BOOK.read_text(encoding="utf8")), dhsa.extract(DHSA_BOOK.read_text(encoding="utf8"))
        diff = {
            **differences({"skills.xml": c.files["skills.xml"], "amptypes.xml": c.files["amptypes.xml"]}, "CG"),
            **differences({"ampeffects.xml": d.files["ampeffects.xml"]}, "DHSA"),
        }
        self.assertEqual(diff, {("skills.xml", "tasking", "page"): ("5", "6")})  # the TASKING heading is on p.6


@unittest.skipUnless(
    os.environ.get("CRB_PDF") and Path(os.environ.get("CRB_PDF", "")).exists(), "set CRB_PDF to the CRB v1.8 PDF"
)
class FromThePdfTest(unittest.TestCase):
    """The answer key from a fresh conversion of the PDF (about 30 s): CRB_PDF=<path to the PDF>."""

    @unittest.skipUnless(LOCAL_CORE, "the owner's local core copies are not present")
    def test_fresh_conversion(self):
        from importer.convert import convert

        with tempfile.TemporaryDirectory() as tmp:
            md = os.path.join(tmp, "book.md")
            convert(os.environ["CRB_PDF"], md)
            files, _, report = crb_core.build(Path(md).read_text(encoding="utf8"))
        self.assertEqual(report, [])
        self.assertEqual(known(differences(files)), KNOWN)


class TwoItemRowTest(unittest.TestCase):
    def test_a_row_printing_two_items(self):
        # (owner, 2026-10-08: `A/B` with two prices is two items, each cell's first or second value, a cell without a
        # slash shared; handling's on/off-road slash and seats stay whole)
        from importer.sr6.catalog import Catalog

        got = dict(
            Catalog.variants(
                "Zorp Aero Glider/Skyhook X",
                {
                    "cost": "1000/2000",
                    "avail": "2/4",
                    "interval": "60/80",
                    "handling": "3/4",
                    "seats": "2/10",
                    "body": "16",
                },
            )
        )
        self.assertEqual(
            got["Zorp Aero Glider"],
            {"cost": "1000", "avail": "2", "interval": "60", "handling": "3/4", "seats": "2/10", "body": "16"},
        )
        self.assertEqual(got["Zorp Aero Skyhook X"]["interval"], "80")
