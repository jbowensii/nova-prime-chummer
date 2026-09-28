"""CRB recipe, core files: made-up tables in the converter's shape, and (gated) the answer key: with the owner's local
copies of the core files (public/data, gitignored) and the converted CRB present, the recipe's core files must equal
them, names and attributes; descriptions are the texts' (checked apart)."""
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
**Base rating 0**
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
| Made-up intro text<br>RANGE<br>CLOSE SHORT MEDIUM LONG<br>WEAPONS DV (≤ 2 M) (3 TO 15 M)(16 TO 60 M) (> 60 M)<br>**Unarmed** STR OK – – –<br>**Short weapons** (spoon, fork, (STR+1) OK – – –<br>ladle)<br>**Zap pistols** (Toy Zapper*) 4 OK OK Dis� –<br>d<br>L **Cannons**** (Big Bertha) 11 (Anti- – – Dis� OK<br>N vehicle 15)<br>**Gas jars*** depends on OK OK Dis� –<br>E toxins<br>u * These weapons use toxins, made up� |
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

    def test_attributes_and_metatypes(self):
        a = by_id(self.files["attributes.xml"])
        self.assertEqual([(i, e.get("abbr"), e.findtext("name"), e.get("page")) for i, e in a.items()],
                         [("str", "STR", "Strength", "52"), ("agi", "AGI", "Agility", "52"), ("wil", "WIL", "Willpower", "52"),
                          ("log", "LOG", "Logic", "52"), ("cha", "CHA", "Charisma", "52")])
        m = by_id(self.files["metatypes.xml"])
        self.assertEqual(m["human"].get("edge"), "5")
        self.assertEqual(m["human"].findtext("racialQuality"), "")
        self.assertEqual(m["elf"].findtext("racialQuality"), "Glow sight")
        self.assertEqual([(r.get("attr"), r.get("min"), r.get("max")) for r in m["elf"].iter("range")],
                         [("str", "1", "3"), ("agi", "1", "4"), ("wil", "1", "3"), ("log", "1", "3"), ("cha", "1", "5")])

    def test_skills(self):
        s = by_id(self.files["skills.xml"])
        self.assertEqual({i: (e.get("attr"), e.get("alt"), e.get("requires"), e.get("page")) for i, e in s.items()},
                         {"sneaking": ("agi", "log", None, "53"), "tinkering": ("log", None, "cyberdeck", "53")})
        self.assertEqual([(sp.get("id"), sp.get("attr"), sp.text) for sp in s["sneaking"].iter("spec")],
                         [("sneaking.hiding", "agi", "Hiding"), ("sneaking.picking-locks", "agi", "Picking locks")])
        self.assertEqual([sp.get("id") for sp in s["tinkering"].iter("spec")], ["tinkering.gizmos-br"])

    def test_amp_types_and_vehicles(self):
        t = by_id(self.files["amptypes.xml"])
        self.assertEqual({i: (e.get("base"), e.get("essence"), e.get("requires")) for i, e in t.items()},
                         {"awakened": ("0", "0", None), "gizmoware": ("2", "0.7", "awk-tinker"), "punchbag": ("1", "0", None)})
        v = by_id(self.files["vehicles.xml"])
        self.assertEqual({i: (e.get("pilot"), e.get("body"), e.get("handling"), e.get("speed"), e.get("flyingSpeed"), e.get("armor"), e.get("mount"))
                          for i, e in v.items()},
                         {"tiny-drone": ("5", "1", "8", "1", "3", "0", "none (Advantage on hiding)"),
                          "big-wagon": ("5", "9", "1", "2", None, "1", "any")})

    def test_pricing_with_the_defaults(self):
        p = ET.fromstring(self.files["pricing.xml"])[0]
        self.assertEqual({k: p.get(k) for k in ("attrPoint", "attrLastPoint", "skillLow", "skillLowMax", "skillHigh", "spec", "knowledge",
                                                "ampPoint", "equipment", "weaponStandard", "weaponSpecialist", "armorPoint", "spell",
                                                "complexForm", "refundEffectRemoval")},
                         {"attrPoint": "11000", "attrLastPoint": "22000", "skillLow": "3000", "skillLowMax": "4", "skillHigh": "6000",
                          "spec": "3500", "knowledge": "1500", "ampPoint": "6000", "equipment": "2000", "weaponStandard": "2000",
                          "weaponSpecialist": "4000", "armorPoint": "1500", "spell": "7000", "complexForm": "7000", "refundEffectRemoval": "false"})

    def test_levels_and_packages(self):
        lv = by_id(self.files["levels.xml"])
        self.assertEqual({i: (e.findtext("name"), e.get("nuyen"), e.get("attrAtMax"), e.get("skillCap"), e.get("rrAttr"), e.get("rrSkill"),
                              e.get("rrSpec"), e.get("page")) for i, e in lv.items()},
                         {"rookie": ("Rookie", "200000", "0", "3", "1", "1", "1", "85"), "legend": ("Legend", "600000", "3", "7", "2", "2", "3", "85")})
        pk = by_id(self.files["packages.xml"])
        keys = ("level", "attrPoints", "attrAtMax", "skillPoints", "skillsAtSix", "ampPoints", "armor", "standardWeapons", "specialistWeapons",
                "equipment", "spells")
        self.assertEqual({i: tuple(e.get(k) for k in keys) for i, e in pk.items()},
                         {"rookie-balanced": ("rookie", "10", "0", "20", "0", "12", "2", "2", "0", "1", "0"),
                          "rookie-magician": ("rookie", "10", "0", "20", "0", "8", "2", "1", "0", "2", "3"),
                          "legend-fighter": ("legend", "18", "3", "45", "1", "30", "4", "5", "2", "1", "0")})

    def test_weapons_armor_lifestyles_and_their_texts(self):
        w = by_id(self.files["weapons.xml"])
        self.assertNotIn("unarmed", w)
        self.assertEqual({i: (e.findtext("name"), e.get("dv"), e.get("ranges"), e.get("specialist")) for i, e in w.items() if i != "cannon"},
                         {"short-weapon": ("Short weapon", "STR+1", "OK/-/-/-", None), "zap-pistol": ("Zap pistol", "4", "OK/OK/Dis/-", None),
                          "gas-jar": ("Gas jar", "toxin", "OK/OK/Dis/-", None)})
        self.assertEqual((w["cannon"].get("dv"), w["cannon"].get("specialist")), ("11 (anti-vehicle 15)", "true"))
        a = by_id(self.files["armor.xml"])
        self.assertEqual({i: (e.findtext("name"), e.get("armor")) for i, e in a.items()},
                         {"padded-clothes": ("Padded clothes", "1"), "quilted-suit": ("Quilted suit", "2"), "tin-shield": ("Tin shield", "1")})
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
        self.assertIn({"kind": "core-unread", "file": "ampeffects.xml"}, [{k: r[k] for k in ("kind", "file")} for r in res.report if "file" in r])

    def test_a_book_adds_to_the_core_amp_effects_but_never_replaces_one(self):
        from importer.__main__ import _no_core_overrides
        head = '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="ampeffects" version="1">'
        files = {"ampeffects.xml": head + '<effect id="rr-attr" category="x" rating="1" types="quality" source="X" page="1"><name>Cheap</name></effect>'
                 '<effect id="made-up-grade" category="grade" rating="1" types="cyberware" source="X" page="1"><name>New</name></effect></ca2:data>',
                 "amps.xml": "<untouched/>"}
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
            with mock.patch.dict(os.environ, {"CA2_CORE_DIR": tmp, "CA2_CUSTOM_DIR": tmp}), mock.patch("importer.DATA_DIR", tmp):
                res = crb.extract(MD)
        self.assertEqual(set(res.core), {f"{n}.xml" for n in CORE_FILES} - {"ampeffects.xml"})
        skipped = [r for r in res.report if r["kind"] == "amps-skipped"]
        self.assertEqual(len(skipped), 1)
        self.assertIn("missing: ampeffects.xml", skipped[0]["problem"])

    def test_run_writes_the_core_files_unscoped_and_keeps_them_out_of_the_index(self):
        from importer.__main__ import run
        from importer.tests.test_run import SCHEMA, XSD_CHECK, node
        with tempfile.TemporaryDirectory() as tmp:
            book, custom = os.path.join(tmp, "library", "crb"), os.path.join(tmp, "custom")
            os.makedirs(book)
            Path(book, "book.md").write_text("<!-- page 1 -->\nShadowrun made-up Alternate Core Rulebook\n" + MD, encoding="utf8")
            run(book, custom, convert_pdf=False)
            core = Path(custom, "imported", "core")
            self.assertEqual(sorted(p.name for p in core.iterdir()), sorted(f"{n}.xml" for n in CORE_FILES if n != "ampeffects"))
            self.assertIn('<item id="short-weapon"', (core / "weapons.xml").read_text(encoding="utf8"))
            self.assertNotIn("core/", Path(custom, "imported", "index.xml").read_text(encoding="utf8"))
            texts = Path(custom, "texts", "crb.xml").read_text(encoding="utf8")
            self.assertIn('<text of="items" id="short-weapon">Spoon, fork, ladle.</text>', texts)
            self.assertIn('<text of="lifestyles" id="nomad">', texts)
            for f in [*core.iterdir(), Path(custom, "texts", "crb.xml")]:
                kind = ET.parse(f).getroot().get("kind")
                xsd = "items" if kind in ("weapons", "armor") else kind
                r = node("--input-type=module", "-e", XSD_CHECK, str(f), os.path.join(SCHEMA, f"{xsd}.xsd"), os.path.join(SCHEMA, "common.xsd"))
                self.assertEqual(r.returncode, 0, f"{f.name}: {r.stderr}")


class AiFallbackTest(unittest.TestCase):
    """A core table the recipe can't read: the AI reads only its pages and proposes only its rows; the accepted ones become
    the core file, and the import report stops listing the table."""

    def test_propose_and_apply_an_unread_weapons_table(self):
        import json
        from importer import xmlio
        from importer.__main__ import apply_core_review
        from importer.ai import propose as P
        from importer.tests.test_run import SCHEMA, XSD_CHECK, node
        with tempfile.TemporaryDirectory() as tmp:
            book, custom = os.path.join(tmp, "library", "crb"), os.path.join(tmp, "custom")
            md = "<!-- page 1 -->\n# Intro\nMade up.\n\n" + "".join(f"<!-- page {n} -->\n# Page {n}\n" + "Filler text. " * 900 + "\n\n" for n in range(2, 6))
            xmlio.write_file(os.path.join(book, "book.md"), md)
            xmlio.write_import(book, report=[{"kind": "core-unread", "file": "weapons.xml", "page": 2, "mdPages": "4-4", "problem": "made up"},
                                             {"kind": "core-unread", "file": "levels.xml", "page": 1, "mdPages": "3-3", "problem": "made up"}],
                               files={"spells.xml": 3}, file="crb.pdf", sha256="00", converter="6", pages=5, score="1.00", recipe="crb",
                               source="CRB", name="Made-up core", publisher="P", canon="true", imported="2026-09-28T00:00:00+00:00")
            reply = {"amps": [], "spells": [], "complexForms": [],
                     "items": [{"name": "Pea shooter", "kind": "weapon", "category": "Pistols", "page": 2, "dv": "2", "armor": None, "ranges": "OK/OK/-/-"},
                               {"name": "Tin spoon", "kind": "gear", "category": None, "page": 2, "dv": None, "armor": None, "ranges": None}]}
            asked = []
            P.propose(book, lambda s, u: asked.append(u) or json.dumps(reply), core=True)
            self.assertTrue(asked and all("<!-- page 4 -->" in u for u in asked))  # only the weapons table's pages
            root = ET.parse(os.path.join(book, "review.xml")).getroot()
            self.assertEqual((root.get("core"), root.get("source")), ("true", "CRB"))
            props = root.findall("proposal")
            self.assertEqual({p.get("kind") for p in props}, {"weapon"})  # no gear: only the table's rows
            for p in props:
                p.set("state", "accepted")
            ET.ElementTree(root).write(os.path.join(book, "review.xml"), encoding="unicode")
            r = node("--input-type=module", "-e", XSD_CHECK, os.path.join(book, "review.xml"), os.path.join(SCHEMA, "review.xsd"),
                     os.path.join(SCHEMA, "common.xsd"))
            self.assertEqual(r.returncode, 0, r.stderr)

            apply_core_review(book, custom)
            weapons = Path(custom, "imported", "core", "weapons.xml")
            self.assertIn('<item id="pea-shooter" kind="weapon"', weapons.read_text(encoding="utf8"))
            self.assertIn('source="CRB"', weapons.read_text(encoding="utf8"))
            r = node("--input-type=module", "-e", XSD_CHECK, str(weapons), os.path.join(SCHEMA, "items.xsd"), os.path.join(SCHEMA, "common.xsd"))
            self.assertEqual(r.returncode, 0, r.stderr)
            self.assertEqual([r.get("file") for r in xmlio.read_import(book).iter("row") if r.get("kind") == "core-unread"], ["levels.xml"])
            self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "done")


# ---------------------------------------------------------------- the answer key

BOOK = ROOT / ".extract/private/library/crb/book.md"
# Where CRB v1.8 and the owner's copies differ, and why (ids only, no book text). The recipe cites the page the entry
# is printed on; the owner's copies cite an earlier page for these:
KNOWN = {
    ("levels.xml", "ganger", "page"): ("84", "85"), ("levels.xml", "runner", "page"): ("84", "85"),  # the levels start on p.85
    ("packages.xml", "runner-balanced", "page"): ("85", "86"), ("packages.xml", "runner-magician", "page"): ("85", "86"),
    ("packages.xml", "runner-fighter", "page"): ("85", "86"),  # all three package tables are on p.86
    ("lifestyles.xml", "squatter", "page"): ("165", "166"), ("lifestyles.xml", "low", "page"): ("165", "166"),  # the box is on p.166
    ("skills.xml", "electronics", "page"): ("55", "54"), ("skills.xml", "network", "page"): ("55", "56"),  # the Skills' headings
    # the recipe cites the Astral Armor power it prices mental armor from; the owner's copy cites the rules on p.190
    ("ampeffects.xml", "mental-armor", "page"): ("190", "191"),
    # the owner's copy shortens the row's wording; the recipe keeps the row as printed
    ("ampeffects.xml", "init-1", "name"): ("Initiative: +1 Edge per action scene, additional actions for 1 Edge each",
                                          "Initiative: +1 Edge per action scene, unlimited additional actions for one Edge each"),
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


@unittest.skipUnless(LOCAL_CORE and BOOK.exists(), "the owner's local core copies and converted CRB are not present")
class AnswerKeyTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.files, cls.texts, cls.report = crb_core.build(BOOK.read_text(encoding="utf8"))

    def test_every_core_file_is_read(self):
        self.assertEqual(self.report, [])
        self.assertEqual(set(self.files), {f"{n}.xml" for n in CORE_FILES})

    def test_names_and_attributes_equal_the_local_copies(self):
        self.assertEqual(differences(self.files), KNOWN)

    def test_texts_describe_core_entries_only(self):
        ids = {i for xml in self.files.values() for i in by_id(xml)}
        self.assertTrue(self.texts)
        self.assertEqual([(of, i) for of, i, t in self.texts if i not in ids or not t.strip()], [])
        local = {(n, i) for n in ("weapons.xml", "armor.xml", "lifestyles.xml") for i, e in by_id(Path(DATA_DIR, n).read_bytes()).items()
                 if (e.findtext("text") or "").strip()}
        have = {i for _, i, _ in self.texts}
        # the owner's copies describe every weapon, armor and lifestyle; the book prints no examples for a few
        self.assertEqual(sorted(i for _, i in local if i not in have),
                         ["armored-clothes", "armored-clothes-coat", "ballistic-shield", "bow", "crossbow", "gas-grenade", "grenade",
                          "military-armor"])


CG_BOOK, DHSA_BOOK = ROOT / ".extract/private/library/cg/book.md", ROOT / ".extract/private/library/dhsa/book.md"


@unittest.skipUnless(LOCAL_CORE and CG_BOOK.exists() and DHSA_BOOK.exists(), "the owner's local core copies and converted CG/DHSA are not present")
class BookMechanicsAnswerKeyTest(unittest.TestCase):
    """The owner's copies also hold the CG's Tasking and Emerged and DHSA's implant grades: those books' recipes add them."""

    def test_cg_and_dhsa_add_their_entries(self):
        c, d = cg.extract(CG_BOOK.read_text(encoding="utf8")), dhsa.extract(DHSA_BOOK.read_text(encoding="utf8"))
        diff = {**differences({"skills.xml": c.files["skills.xml"], "amptypes.xml": c.files["amptypes.xml"]}, "CG"),
                **differences({"ampeffects.xml": d.files["ampeffects.xml"]}, "DHSA")}
        self.assertEqual(diff, {("skills.xml", "tasking", "page"): ("5", "6")})  # the TASKING heading is on p.6


@unittest.skipUnless(os.environ.get("CRB_PDF") and Path(os.environ.get("CRB_PDF", "")).exists(), "set CRB_PDF to the CRB v1.8 PDF")
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
        self.assertEqual(differences(files), KNOWN)
