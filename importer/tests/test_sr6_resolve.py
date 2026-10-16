"""The widening search before an issue (importer/sr6/resolve.py): the book's tables and text, the corpus, the errata.
Invented books and values only."""
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET

from importer.sr6 import catalog, resolve, search, shapes
from importer.sr6.regroup import Block

NS = "urn:chummer-sr6:data:1"


def block(name, page=10, header=None, row=None, stats=(), text="", labels=None):
    return Block("item", name, "Gear", "Gizmos", "", page, header or [], row, list(stats), "", labels or {}, text, 4)


class BookCirclesTest(unittest.TestCase):
    def setUp(self):
        self.index = search.Index([
            block("Zorp Blade", 20, ["WEAPON", "DV", "AR"], {"WEAPON": "Zorp Blade", "DV": "3P", "AR": "7/—/—/—/—"}),
            block("Implants", 30, text="| ITEM | ESSENCE | AVAIL | COST |\n|---|---|---|---|\n"
                                       "| Zorp Blade | 0.2 | 4(I) | 2,500¥ |\n| Blink sensor | 0.3 | 4 | 9,000¥ |"),
            block("Gadgets list", 30, text="| ITEM | AVAIL | COST |\n|---|---|---|\n| Glim mic | 2 | Capacity x 50¥ |"),
            block("Wobble Lock", 40, text="Wobble locks come in ratings 1 to 6 and keep the door shut."),
            block("Gadgets", 41, text="A buyer may fit a Wobble Lock to any door. Twin values: costs 300¥."),
        ], 1, catalog.md_tables, shapes.RENAME)

    def test_a_table_elsewhere_in_the_book(self):
        e = {"name": "Zorp Blade", "page": 19, "attrs": {}}
        self.assertEqual(search.search_book(self.index, catalog.HEADERS, "weapons", e, "cost", ""), ("2500", "table", 29))
        self.assertEqual(search.search_book(self.index, catalog.HEADERS, "weapons", e, "avail", ""), ("4(I)", "table", 29))

    def test_a_shorter_printing_of_the_name(self):
        e = {"name": "Glim microphone", "page": 29, "attrs": {}}
        self.assertEqual(search.search_book(self.index, catalog.HEADERS, "gear", e, "cost", ""), ("Capacity x 50", "table", 29))

    def test_an_implant_row_prices_no_gear(self):
        e = {"name": "Blink", "aliases": ["Blink sensor"], "page": 29, "attrs": {}}
        self.assertIsNone(search.search_book(self.index, catalog.HEADERS, "gear", e, "cost", ""))

    def test_the_text(self):
        e = {"name": "Wobble Lock", "page": 39, "attrs": {}}
        self.assertEqual(search.search_book(self.index, catalog.HEADERS, "gear", e, "rating", ""), ("1–6", "text", 39))
        own = "This lock comes in a maximum rating of 4."
        self.assertEqual(search.search_book(self.index, catalog.HEADERS, "gear", e, "rating", own), ("1–4", "text", 39))

    def test_nothing_or_a_disagreement_is_no_value(self):
        e = {"name": "Nothing Here", "page": 5, "attrs": {}}
        self.assertIsNone(search.search_book(self.index, catalog.HEADERS, "gear", e, "avail", ""))
        self.assertEqual(search.text_values("cost", ["It costs 300¥, or costs 400¥ with a case."]), {"300", "400"})
        self.assertEqual(search.text_values("karma", ["You may buy it off for 9 Karma.", "Buy off your Zorp quality for 8 Karma.", "Gain 4 Karma, to spend."]), {"4"})

    def test_the_same_row_fills_the_other_gaps(self):
        table = "| ITEM | CAPACITY | AVAIL | COST |\n|---|---|---|---|\n| Glim mic | 1–6 | 2 | Capacity x 50¥ |"
        idx = search.Index([block("Glim Lists", 30, text=table)], 1, catalog.md_tables, shapes.RENAME)
        e = {"name": "Glim microphone", "page": 29, "attrs": {}}
        self.assertEqual(search.same_row(idx, catalog.HEADERS, "gear", e, "cost", "Capacity x 50"), {"capacity": "1–6", "avail": "2"})

    def test_names_item(self):
        self.assertTrue(search.names_item("Glim mic", "Glim microphone"))
        self.assertTrue(search.names_item("ZX-48", "Bloop ZX-48 Thunderer"))
        self.assertFalse(search.names_item("Blade", "Zorp Blade"))  # one word with no digit: too loose
        self.assertTrue(search.names_item("Z-ICE: Nope!", "Nope!"))  # a row printed with its line's name in front
        self.assertFalse(search.names_item("Z-ICE: Nope!", "Zing"))


class ErrataTest(unittest.TestCase):
    def test_statements(self):
        md = "\n".join([
            "# Z ORP B OOK E RRATA", "### G EAR E RRATA :",
            "p. 12: Glimmer Pistol’s DV is **5S(e)**",
            "p. 14: Wobble Gun has ammo **8(cy)**",
            "p. 15: Thud Cannon’s Near AR is changed from 18 to **8.**",
            "p. 16: Kami are renamed **Kama**",
            "Spin Tops p. 20",
            "● Hardened: Availability 2",
            "● Fuzz Link: adds +1 Availability",
            "● Rating 3 Ziplenses / Zipears: Essence 0.3, Availability 4, Cost 9,000¥ / 8,500¥",
            "#### p. 30, Rifles table, Bonk M9", "Change the final Attack Rating from 4 to 1 and change the cost to 2,100¥."])
        got = resolve.errata(md)
        self.assertIn((12, "Glimmer Pistol", "dv", "5S(e)", None), got)
        self.assertIn((14, "Wobble Gun", "ammo", "8(cy)", None), got)
        self.assertIn((15, "Thud Cannon", "ar", "8", "near"), got)
        self.assertFalse([g for g in got if g[1] == "Kami"])  # a rename is a person's to read
        self.assertIn((20, "Hardened", "avail", "2", None), got)
        self.assertIn((20, "Fuzz Link", "avail", "+1", None), got)
        self.assertIn((20, "Rating 3 Zipears", "cost", "8500", None), got)
        self.assertIn((20, "Rating 3 Zipears", "avail", "4", None), got)
        self.assertIn((30, "Bonk M9", "cost", "2100", None), got)

    def test_targets_and_bands(self):
        ents = [{"name": "Spin Top (Hardened)", "page": 20}, {"name": "Roll Blades (Hardened)", "page": 21},
                {"name": "GloCam (1-12)", "page": 22}]
        self.assertEqual(resolve.errata_targets(ents, 20, "Hardened"), [ents[0]])
        self.assertEqual(resolve.errata_targets(ents, None, "Hardened"), [])  # two: none
        self.assertEqual(resolve.errata_targets(ents, 22, "Glo-Cam"), [ents[2]])
        self.assertEqual(resolve.patch_band("1/18/11/9/6", "near", "8"), "1/8/11/9/6")


def _write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf8") as f:
        f.write(text)


def _book(lib, name, state, why="", source="", bname="", file="", md="", entries=None, kind="gear", custom=None, sha=""):
    d = os.path.join(lib, name)
    _write(os.path.join(d, "status.xml"), f'<?xml version="1.0" encoding="UTF-8"?>\n<status state="{state}">{why}</status>\n')
    attrs = (f' source="{source}" name="{bname}"' if source else "") + (f' sha256="{sha}"' if sha else "")
    _write(os.path.join(d, "import.xml"), f'<?xml version="1.0" encoding="UTF-8"?>\n<import file="{file}"{attrs}><files/></import>\n')
    _write(os.path.join(d, "book.md"), md)
    if entries is not None:
        _write(os.path.join(custom, "imported", source.lower(), f"{kind}.xml"),
               f'<?xml version="1.0" encoding="UTF-8"?>\n<sr6:data xmlns:sr6="{NS}" kind="{kind}" version="1">\n'
               + "".join(f"  {e}\n" for e in entries) + "</sr6:data>\n")
    return d


class CorpusTest(unittest.TestCase):
    def test_corpus_and_errata(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, entries=[
                '<gear id="zza.glim" source="ZZA" page="3" category="x" cost="100"><name>Glim</name>'
                '<issue field="avail" code="missing" page="3" searched="book">no availability printed</issue></gear>',
                '<gear id="zza.cyberprogram-basic" source="ZZA" page="9" category="software" avail="1" cost="60">'
                '<name>Cyberprogram, basic</name></gear>',
                '<gear id="zza.wobble" source="ZZA" page="20" category="x" avail="8" cost="50"><name>Spin Top (Hardened)</name></gear>'])
            _book(lib, "b", "done", source="ZZB", bname="Shadowrun: Zorp Beta", custom=custom, entries=[
                '<gear id="zzb.glim" source="ZZB" page="7" category="x" avail="3(L)" cost="100"><name>Glim</name></gear>',
                # (a newer book's row named like a program type, in no software table: no program's class row)
                '<gear id="zzb.basic" source="ZZB" page="9" category="Subscription tier" avail="3" cost="200"><name>Basic</name></gear>'])
            _write(os.path.join(custom, "imported", "zzb", "programs.xml"),
                   f'<?xml version="1.0" encoding="UTF-8"?>\n<sr6:data xmlns:sr6="{NS}" kind="programs" version="1">\n'
                   '  <program id="zzb.peek" source="ZZB" page="8" type="basic"><name>Peek</name>'
                   '<issue field="cost" code="missing" page="8" searched="book">no price printed</issue>'
                   '<issue field="avail" code="missing" page="8" searched="book">no availability printed</issue></program>\n'
                   '  <program id="zzb.void" source="ZZB" page="8" type="weird"><name>Void</name>'
                   '<issue field="cost" code="missing" page="8" searched="book">no price printed</issue></program>\n</sr6:data>\n')
            _book(lib, "e", "skipped", why="Nothing to import: errata (applied with its book)",
                  file="Zorp-Alpha-Errata.pdf", md="# Z ORP A LPHA E RRATA\nSpin Tops p. 20\n● Hardened: Availability 2\n")
            n = resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "b", "e")],
                               sources={"ZZA": "2020-01", "ZZB": "2021-01"})
            # the errata PDF has no date here (no PDF): nothing applied
            self.assertEqual(n["errata"], 0)
            g = {e.get("id"): e for e in ET.parse(os.path.join(custom, "imported", "zza", "gear.xml")).getroot()}
            self.assertEqual(g["zza.glim"].get("avail"), "3(L)")
            self.assertEqual(g["zza.glim"].find("found").attrib, {"field": "avail", "how": "corpus", "source": "ZZB", "page": "7"})
            self.assertIsNone(g["zza.glim"].find("issue"))
            p = {e.get("id"): e for e in ET.parse(os.path.join(custom, "imported", "zzb", "programs.xml")).getroot()}
            self.assertEqual((p["zzb.peek"].get("cost"), p["zzb.peek"].get("avail")), ("60", "1"))  # its class row
            self.assertEqual(p["zzb.void"].find("issue").get("searched"), "book,corpus")

            # dated: the errata is newer than its book (`Zorp Alpha`, not `Zorp Beta`)
            orig = resolve.pdf_date
            resolve.pdf_date = lambda pdf, md="": "2023-05-05" if os.sep + "e" + os.sep in pdf else ""
            try:
                n = resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "b", "e")],
                                   sources={"ZZA": "2020-01", "ZZB": "2021-01"})
            finally:
                resolve.pdf_date = orig
            self.assertEqual(n["errata"], 1)
            g = {e.get("id"): e for e in ET.parse(os.path.join(custom, "imported", "zza", "gear.xml")).getroot()}
            self.assertEqual(g["zza.wobble"].get("avail"), "2")
            self.assertEqual((g["zza.wobble"].find("found").get("how"), g["zza.wobble"].find("found").text), ("errata", "8"))

    def test_an_errata_older_than_a_known_printing_with_no_pdf_date_is_not_applied(self):
        # (a City Edition's PDF carries no date: the printing's own month dates it, not its source's first printing)
        from unittest import mock

        from importer.sr6.recipes import crb
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(crb.PRINTINGS, {"f" * 64: ("2025-03", "Made-Up Fifth Printing")}):
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, sha="f" * 64, entries=[
                '<gear id="zza.wobble" source="ZZA" page="20" category="x" avail="8" cost="50"><name>Spin Top (Hardened)</name></gear>'])
            _book(lib, "e", "skipped", why="Nothing to import: errata (applied with its book)",
                  file="Zorp-Alpha-Errata.pdf", md="# Z ORP A LPHA E RRATA\nSpin Tops p. 20\n● Hardened: Availability 2\n")
            with mock.patch.object(resolve, "pdf_date", lambda pdf, md="": "2020-02-22" if os.sep + "e" + os.sep in pdf else ""):
                n = resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "e")], sources={"ZZA": "2019-08"})
                self.assertEqual(n["errata"], 0)  # (dated 2019-08 by its source, the errata would apply)
                with mock.patch.dict(crb.PRINTINGS, clear=True):
                    self.assertEqual(resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "e")],
                                                    sources={"ZZA": "2019-08"})["errata"], 1)

    def test_an_errata_never_overrides_the_current_printing_but_fills_what_it_leaves_open(self):
        # (made up: the printing is its book's Current Printing, which incorporates its errata, so it keeps the value it
        # prints, though the errata is newer than its PDF; an erratum fills a field it leaves open)
        from unittest import mock

        from importer.sr6.recipes import crb
        sha = "e" * 64
        with tempfile.TemporaryDirectory() as tmp, \
                mock.patch.dict(crb.PRINTINGS, {sha: ("2019-08", "Made-Up Current Printing")}), \
                mock.patch.object(crb, "CURRENT", (sha,)):
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, sha=sha, entries=[
                '<gear id="zza.wobble" source="ZZA" page="20" category="x" avail="8" cost="50"><name>Spin Top (Hardened)</name></gear>',
                '<gear id="zza.sleek" source="ZZA" page="20" category="x" cost="50"><name>Spin Top (Sleek)</name>'
                '<issue field="avail" code="missing" page="20" searched="book">no availability printed</issue></gear>'])
            _book(lib, "e", "skipped", why="Nothing to import: errata (applied with its book)",
                  file="Zorp-Alpha-Errata.pdf",
                  md="# Z ORP A LPHA E RRATA\nSpin Tops p. 20\n● Hardened: Availability 2\n● Sleek: Availability 3\n")
            books = [(os.path.join(lib, d), custom) for d in ("a", "e")]
            with mock.patch.object(resolve, "pdf_date", lambda pdf, md="": "2020-02-22" if os.sep + "e" + os.sep in pdf else "2019-08-25"):
                n = resolve.corpus(books, sources={"ZZA": "2019-08"})
                g = {e.get("id"): e for e in ET.parse(os.path.join(custom, "imported", "zza", "gear.xml")).getroot()}
                self.assertEqual(n["errata"], 1)
                self.assertEqual(g["zza.wobble"].get("avail"), "8")  # (printed: the erratum yields)
                self.assertIsNone(g["zza.wobble"].find("found"))
                self.assertEqual((g["zza.sleek"].get("avail"), g["zza.sleek"].find("found").get("how")), ("3", "errata"))  # (open: filled)
                with mock.patch.object(crb, "CURRENT", ()):  # (a book with no Current Printing flag: the newer errata overrides)
                    _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, sha=sha, entries=[
                        '<gear id="zza.wobble" source="ZZA" page="20" category="x" avail="8" cost="50"><name>Spin Top (Hardened)</name></gear>'])
                    resolve.corpus(books, sources={"ZZA": "2019-08"})
                    g = {e.get("id"): e for e in ET.parse(os.path.join(custom, "imported", "zza", "gear.xml")).getroot()}
                    self.assertEqual(g["zza.wobble"].get("avail"), "2")

    def test_an_errata_renumbering_unrating_and_reprinting_life_modules(self):
        md = "\n".join([
            "# Z ORP A LPHA E RRATA",
            "W HAT ARE ZIPLENSES ? ( P . 40)",
            "Rather than being rating 2 and 3 cyberware as printed in Zorp Alpha, these are instead rating 3 and 4",
            "ziplenses and zipears. Their stats are as follows:",
            "● Rating 3 Ziplenses / Zipears: Essence 0.3, Availability 4, Cost 900¥ / 850¥",
            "● Rating 4 Ziplenses / Zipears: Essence 0.4, Availability 5, Cost 1,200¥ / 1,100¥",
            "H OW DO HUMMERS WORK ? ( P . 41)",
            "Hummers no longer have ratings, and their price and Availability are always calculated as if they",
            "were rating 1.",
            "C AN I USE THE LIFE MODULES ? ( P . 42)",
            "**Adult Life Modules:**",
            "Glow Kid: Use Glower (p. 3, Zorp Beta)",
            "<!-- page 3 -->",
            "**Fizz Star**",
            "You fizzed and everyone watched.",
            "• Choose one: +1 to Agility or Charisma",
            "• Contact Points: 4",
            "• Contact Types: Corporate, Media",
            "**New Event Life Modules**",
            "Event: A Glowing Week of Fame",
            "It was a good week.",
            "• Resources: +5,000",
            "• Contact Points: 2"])
        got = resolve.errata(md)
        self.assertIn((None, "ziplenses", "_renumber", (2, 3), None), got)
        self.assertIn((None, "Hummers", "_unrated", 1, None), got)
        with tempfile.TemporaryDirectory() as tmp:
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, kind="augmentations",
                  entries=[
                      '<augmentation id="zza.ziplenses-rating-2" source="ZZA" page="40" essence="0.3" avail="9" cost="900">'
                      '<name>Ziplenses (Rating 2)</name><formula field="cost">tier(R; 2: 900; 3: 1200)</formula></augmentation>',
                      '<augmentation id="zza.ziplenses-rating-3" source="ZZA" page="40" essence="0.4" avail="12" cost="1200">'
                      '<name>Ziplenses (Rating 3)</name></augmentation>',
                      '<augmentation id="zza.hummer" source="ZZA" page="41" rating="1-3" avail="Rating x 2" cost="Rating x 500">'
                      '<name>Hummer</name><formula field="cost">R*500</formula><formula field="avail">R*2</formula></augmentation>'])
            _book(lib, "e", "skipped", why="Nothing to import: errata (applied with its book)",
                  file="Zorp-Alpha-Errata.pdf", md=md)
            orig = resolve.pdf_date
            resolve.pdf_date = lambda pdf, md="": "2023-05-05" if os.sep + "e" + os.sep in pdf else ""
            try:
                for _ in range(2):  # (the corpus pass runs again after each import: the same result)
                    resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "e")], sources={"ZZA": "2020-01"})
            finally:
                resolve.pdf_date = orig
            a = {e.get("id"): e for e in ET.parse(os.path.join(custom, "imported", "zza", "augmentations.xml")).getroot()}
            two, three = a["zza.ziplenses-rating-2"], a["zza.ziplenses-rating-3"]  # (ids kept: characters load them)
            self.assertEqual((two.findtext("name"), two.get("avail")), ("Ziplenses (Rating 3)", "4"))
            self.assertEqual((three.findtext("name"), three.get("avail"), three.get("cost")), ("Ziplenses (Rating 4)", "5", "1200"))
            self.assertEqual(two.find("formula").text, "tier(R; 3: 900; 4: 1200)")
            h = a["zza.hummer"]
            self.assertEqual((h.get("cost"), h.get("avail"), h.get("rating"), h.findall("formula")), ("500", "2", None, []))
            m = {e.findtext("name"): e for e in ET.parse(os.path.join(custom, "imported", "zza", "lifemodules.xml")).getroot()}
            self.assertEqual(sorted(m), ["Event: A Glowing Week of Fame", "Fizz Star"])
            self.assertEqual((m["Fizz Star"].get("id"), m["Fizz Star"].get("page"), m["Fizz Star"].get("contactTypes")),
                             ("zza.fizz-star", "3", "corporate media"))
            self.assertEqual(m["Event: A Glowing Week of Fame"].get("nuyen"), "5000")
            with open(os.path.join(custom, "imported", "index.xml"), encoding="utf8") as f:
                self.assertIn('href="zza/lifemodules.xml"', f.read())

    def test_a_renumbering_an_override_row_already_made_is_not_made_again(self):
        md = "\n".join(["W HAT ARE ZIPLENSES ? ( P . 40)",
                       "Rather than being rating 2 and 3 cyberware as printed in Zorp Alpha, these are instead rating 3 and 4",
                       "ziplenses and zipears."])
        with tempfile.TemporaryDirectory() as tmp:
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, kind="augmentations",
                  entries=['<augmentation id="zza.ziplenses-rating-2" source="ZZA" page="40" avail="4"><name>Ziplenses (Rating 3)</name></augmentation>',
                           '<augmentation id="zza.ziplenses-rating-3" source="ZZA" page="40" avail="5"><name>Ziplenses (Rating 4)</name></augmentation>'])
            _book(lib, "e", "skipped", why="Nothing to import: errata (applied with its book)", file="Zorp-Alpha-Errata.pdf", md=md)
            orig = resolve.pdf_date
            resolve.pdf_date = lambda pdf, md="": "2023-05-05" if os.sep + "e" + os.sep in pdf else ""
            try:
                resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "e")], sources={"ZZA": "2020-01"})
            finally:
                resolve.pdf_date = orig
            a = {e.get("id"): e.findtext("name") for e in ET.parse(os.path.join(custom, "imported", "zza", "augmentations.xml")).getroot()}
            self.assertEqual(a, {"zza.ziplenses-rating-2": "Ziplenses (Rating 3)", "zza.ziplenses-rating-3": "Ziplenses (Rating 4)"})

    def test_a_grouped_row_named_by_its_run_in(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            md = "\n".join(["<!-- page 11 -->", "**Glo-Mender:** It mends.", "**ZQE:** Zorp quick enhancement.", "**Alpha Zap:** Zaps."])
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom, md=md,
                  kind="augmentations", entries=[
                      '<augmentation id="zza.glowsymbionts-mender" source="ZZA" page="10" cost="10"><name>Glowsymbionts (Mender)</name></augmentation>',
                      '<augmentation id="zza.zorp-zqi" source="ZZA" page="10" cost="20"><name>Zorp Enhancement (ZQI)</name></augmentation>',
                      '<augmentation id="zza.zorp-alpha-zap" source="ZZA" page="10" cost="30"><name>Zorp Enhancement (Alpha Zap)</name></augmentation>'])
            n = resolve.corpus([(os.path.join(lib, "a"), custom)], sources={"ZZA": "2020-01"})
            a = {e.get("id"): [x.text for x in e.findall("alias")]
                 for e in ET.parse(os.path.join(custom, "imported", "zza", "augmentations.xml")).getroot()}
            self.assertEqual(n["run-ins"], 2)
            self.assertEqual(a, {"zza.glowsymbionts-mender": ["Glo-Mender"], "zza.zorp-zqi": ["ZQE"], "zza.zorp-alpha-zap": []})

    def test_an_abbreviation_the_library_spells_out(self):
        with tempfile.TemporaryDirectory() as tmp:
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            _book(lib, "a", "done", source="ZZA", bname="Shadowrun: Zorp Alpha", custom=custom,
                  md="Use glowing zap consoles (GZCs) to glow.", entries=[])
            _book(lib, "b", "done", source="ZZB", bname="Shadowrun: Zorp Beta", custom=custom, kind="augmentations", entries=[
                '<augmentation id="zzb.gzc" source="ZZB" page="5" category="Headware" avail="3" cost="10">'
                '<name>GZC</name></augmentation>'])
            n = resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "b")], sources={"ZZA": "2020-01", "ZZB": "2021-01"})
            self.assertEqual(n["abbreviations"], 1)
            e = ET.parse(os.path.join(custom, "imported", "zzb", "augmentations.xml")).getroot()[0]
            self.assertEqual([a.text for a in e.findall("alias")], ["Glowing zap console"])

    def test_cards(self):
        md = "## zorp predator X\n#### heavy pistol\n**DV:** 3P **Mode:** SA/BF\n**Availability:** 2(L) **Cost:** 750¥\n"
        self.assertEqual(resolve.cards(md), {"zorp predator x": {"dv": "3P", "modes": "SA/BF", "avail": "2(L)", "cost": "750"}})


if __name__ == "__main__":
    unittest.main()
