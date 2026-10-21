"""The gaps the live import of 2026-10-20 showed and the per-book runs did not
(docs/reviews/sr6-cl6-comparison-2026-10-20.md): the effects of the structure an override gives an existing entry, a
citation of another book linking to the entry itself, the cross-book fill's rating range and its same-name items of
another kind of thing, a renamed printing's override rows, an errata's life module that the book already has. Every name
and number is invented, in the books' structure."""

import os
import tempfile
import unittest

from importer.sr6 import NS, effects, resolve, run


def file(kind, tag, rows):
    """A catalog file, one entry a line; rows: (id, attrs, name, kids)."""
    return (
        f'<sr6:data xmlns:sr6="{NS}" kind="{kind}">\n'
        + "".join(f'  <{tag} id="{i}" source="ZZ" page="1"{a}><name>{n}</name>{k}</{tag}>\n' for i, a, n, k in rows)
        + "</sr6:data>\n"
    )


def line(xml, eid):
    """The line of `xml` that holds the entry `eid`."""
    return next(x for x in xml.splitlines() if f'id="{eid}"' in x)


class OverrideShapeIsReadTest(unittest.TestCase):
    """Fix 1: the effects are read on the structure the book's override rows give an entry (run.read_effects)."""

    TEXTS = '<sr6:data kind="texts">\n  <text of="gear" id="zl">**Dice pool effect:** +2</text>\n</sr6:data>\n'
    ROWS = [
        {"cl6": "Zap Lute", "kind": "gear", "id": "zl", "set": {"class": "ELECTRONICS/INSTRUMENT"}, "gen": "class"},
        {
            "cl6": "Zap Lute",
            "kind": "gear",
            "id": "zl",
            "gen": "book",
            "why": "an invented correction",
            "effects": [{"target": "skill:influence", "op": "add", "value": "1"}],
        },
        {
            "cl6": "Zap Drum",
            "kind": "gear",
            "add": {
                "page": 2,
                "kids": [{"tag": "effect", "attrs": {"target": "skill:con", "op": "add", "value": "3"}}],
            },
        },
    ]

    def test_a_class_an_override_gives_is_read_and_the_rows_own_effects_stay(self):
        files = {"gear.xml": file("gear", "gear", [("zl", "", "Zap Lute", "")])}
        out, _ = run.read_effects("zz", files, self.TEXTS, "", rows=self.ROWS)
        x = line(out["gear.xml"], "zl")
        self.assertIn('class="ELECTRONICS/INSTRUMENT"', x)
        self.assertIn(
            'target="skill:con" op="add" value="2"', x
        )  # (the instrument's dice pool: read on the class the row gave it)
        self.assertIn('target="skill:influence" op="add" value="1" gen="book"', x)  # (the book row's, after the read)
        self.assertIn(
            'target="skill:con" op="add" value="3"', line(out["gear.xml"], "zap-drum")
        )  # (an added entry keeps its row's effect)

    def test_a_variant_a_family_row_gives_is_read(self):
        reg = "| ROCKET | NOTES |\n|---|---|\n| Missile Variant | +2 to Attack Rating |\n"
        files = {"weapons.xml": file("weapons", "weapon", [("zr", ' rating="1-6"', "Zap Rocket", "")])}
        rows = [
            {
                "cl6": "Zap Rocket",
                "kind": "weapons",
                "id": "zr",
                "kids": [{"tag": "variant", "attrs": {"name": "Missile"}}],
                "gen": "family",
            }
        ]
        texts = '<sr6:data kind="texts">\n  <text of="weapons" id="zr">A made-up rocket.</text>\n</sr6:data>\n'
        x = line(run.read_effects("zz", files, texts, reg, rows=rows)[0]["weapons.xml"], "zr")
        self.assertIn('<variant name="Missile"/>', x)
        self.assertIn('when="Missile"', x)


class CitedBookLinkTest(unittest.TestCase):
    """Fix 2: `See X, p. NN, SR6.` in a book that has an entry of that name links to the core rulebook's, never to
    itself."""

    def test_a_citation_of_another_book_wins_over_the_books_own_id(self):
        files = {"qualities.xml": file("qualities", "quality", [("zap-skin", ' karma="7"', "Zap Skin", "")])}
        texts = '<sr6:data kind="texts">\n  <text of="qualities" id="zap-skin">Cost: 7 Karma\nSee Zap Skin, p. 71, SR6.</text>\n</sr6:data>\n'  # pylint: disable=line-too-long
        x = line(effects.apply(files, texts)[0]["qualities.xml"], "zap-skin")
        self.assertIn('ref="crb.zap-skin"', x)

    def test_a_citation_of_the_books_own_source_stays_local(self):
        files = {
            "qualities.xml": file(
                "qualities",
                "quality",
                [("zap-hide", "", "Zap Hide", ""), ("zap-skin", ' source="CRB"', "Zap Skin", "")],
            ).replace(' source="ZZ" page="1" source="CRB"', ' source="CRB" page="1"')
        }
        texts = '<sr6:data kind="texts">\n  <text of="qualities" id="zap-skin">Cost: 7 Karma\nSee Zap Hide, p. 71, SR6.</text>\n</sr6:data>\n'  # pylint: disable=line-too-long
        x = line(effects.apply(files, texts)[0]["qualities.xml"], "zap-skin")
        self.assertIn('ref="zap-hide"', x)


def _book(lib, custom, name, src, entries, _date):
    """A done import of `src` in library `lib`: its catalog files (entries: {file: xml}) and its import record."""
    from importer import xmlio

    d = os.path.join(lib, name)
    os.makedirs(d)
    xmlio.write_import(d, source=src.upper(), name=f"Shadowrun: {name}", file=f"{name}.pdf", sha256="0" * 64)
    xmlio.write_status(d, "done")
    for f, xml in entries.items():
        os.makedirs(os.path.join(custom, "imported", src), exist_ok=True)
        with open(os.path.join(custom, "imported", src, f), "w", encoding="utf8") as h:
            h.write(xml)
    return d


class CorpusFillTest(unittest.TestCase):
    """Fixes 3 and 4: the cross-book fill (resolve.corpus)."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with  # cleaned up in tearDown
        self.lib, self.custom = os.path.join(self.tmp.name, "library"), os.path.join(self.tmp.name, "custom")

    def tearDown(self):
        self.tmp.cleanup()

    def _corpus(self, mine, theirs):
        a = _book(self.lib, self.custom, "aa", "aa", mine, "")
        b = _book(self.lib, self.custom, "bb", "bb", theirs, "")
        resolve.corpus(
            [(a, self.custom), (b, self.custom)], sources={"AA": "2021-01", "BB": "2019-01"}, apply_errata=False
        )
        return open(os.path.join(self.custom, "imported", "aa", next(iter(mine))), encoding="utf8").read()

    def test_a_per_rating_price_comes_with_its_rating_range(self):
        mine = {
            "programs.xml": f'<sr6:data xmlns:sr6="{NS}" kind="programs">\n  <program id="aa.zap-soft" source="AA" page="9" type="e-soft"><name>Zap Soft</name>'  # pylint: disable=line-too-long
            '<issue field="cost" code="missing" page="9">no price printed</issue></program>\n</sr6:data>\n'
        }
        theirs = {
            "gear.xml": f'<sr6:data xmlns:sr6="{NS}" kind="gear">\n  <gear id="bb.autosoft" source="BB" page="5" category="Software" cost="Rating x 500" rating="1–9">'  # pylint: disable=line-too-long
            '<name>Autosoft</name><formula field="cost">R*500</formula></gear>\n</sr6:data>\n'
        }
        x = self._corpus(mine, theirs)
        self.assertIn('cost="Rating x 500"', x)
        self.assertIn('rating="1–9"', x)
        self.assertIn('<found field="rating" how="corpus" source="BB" page="5"/>', x)

    def test_a_same_name_item_of_another_kind_of_thing_fills_nothing(self):
        mine = {
            "gear.xml": f'<sr6:data xmlns:sr6="{NS}" kind="gear">\n  <gear id="aa.zap-gear" source="AA" page="9" category="Preparation" class="MAGICAL/ALCHEMICAL">'  # pylint: disable=line-too-long
            '<name>Zap Gear</name><issue field="avail" code="missing" page="9">no availability printed</issue></gear>\n</sr6:data>\n'  # pylint: disable=line-too-long
        }
        theirs = {
            "gear.xml": f'<sr6:data xmlns:sr6="{NS}" kind="gear">\n  <gear id="bb.zap-gear" source="BB" page="5" category="Survival gear" avail="1" class="SURVIVAL/SURVIVAL_GEAR">'  # pylint: disable=line-too-long
            "<name>Zap gear</name></gear>\n</sr6:data>\n"
        }
        x = self._corpus(mine, theirs)
        self.assertNotIn('avail="1"', x)
        self.assertIn('<issue field="avail"', x)

    def test_a_same_name_item_of_the_same_class_still_fills(self):
        mine = {
            "gear.xml": f'<sr6:data xmlns:sr6="{NS}" kind="gear">\n  <gear id="aa.zap-gear" source="AA" page="9" category="Tools" class="SURVIVAL/OTHER">'  # pylint: disable=line-too-long
            '<name>Zap Gear</name><issue field="avail" code="missing" page="9">no availability printed</issue></gear>\n</sr6:data>\n'  # pylint: disable=line-too-long
        }
        theirs = {
            "gear.xml": f'<sr6:data xmlns:sr6="{NS}" kind="gear">\n  <gear id="bb.zap-gear" source="BB" page="5" category="Survival gear" avail="1" class="SURVIVAL/SURVIVAL_GEAR">'  # pylint: disable=line-too-long
            "<name>Zap gear</name></gear>\n</sr6:data>\n"
        }
        self.assertIn('avail="1"', self._corpus(mine, theirs))


class CurrentPrintingRowsTest(unittest.TestCase):
    """Fix 5: the core rulebook's Current Printing files the Uzi as `uzi-iv` (the City Editions' `Uzi V`, `uzi-v`): its
    family row is keyed to that id too, so a library that loads only the Current Printing gives it its skill,
    specialization and slots."""

    def test_the_current_printings_uzi_takes_its_family_row(self):
        from importer.sr6 import overrides

        files = {"weapons.xml": file("weapons", "weapon", [("uzi-iv", "", "Uzi IV", "")])}
        x = line(overrides.apply("crb", files)["weapons.xml"], "uzi-iv")
        self.assertIn('skill="Firearms"', x)
        self.assertIn('spec="Submachine Guns"', x)
        self.assertIn('<slot id="barrel"/>', x)


class ErrataModuleTest(unittest.TestCase):
    """Fix 6: an errata's life module the book's catalog already has under its name less the `Event:` kicker is not
    added again."""

    def test_an_event_kicker_is_no_second_module(self):
        from importer.tests.test_sr6_resolve import _book as rbook

        md = "\n".join(
            [
                "**New Event Life Modules**",
                "Event: You had a Zap Week",
                "It was a good week.",
                "• Resources: +5,000",
                "• Contact Points: 2",
            ]
        )
        with tempfile.TemporaryDirectory() as tmp:
            lib, custom = os.path.join(tmp, "library"), os.path.join(tmp, "custom")
            rbook(
                lib,
                "a",
                "done",
                source="ZZA",
                bname="Shadowrun: Zorp Alpha",
                custom=custom,
                kind="lifemodules",
                entries=[
                    '<lifemodule id="zza.you-had-a-zap-week" source="ZZA" page="3" stage="adult"><name>You had a Zap Week</name></lifemodule>'  # pylint: disable=line-too-long
                ],
            )
            rbook(
                lib,
                "e",
                "skipped",
                why="Nothing to import: errata (applied with its book)",
                file="Zorp-Alpha-Errata.pdf",
                md=md,
            )
            orig = resolve.pdf_date
            resolve.pdf_date = lambda pdf, md="": "2023-05-05" if os.sep + "e" + os.sep in pdf else ""
            try:
                resolve.corpus([(os.path.join(lib, d), custom) for d in ("a", "e")], sources={"ZZA": "2020-01"})
            finally:
                resolve.pdf_date = orig
            with open(os.path.join(custom, "imported", "zza", "lifemodules.xml"), encoding="utf8") as f:
                self.assertEqual(f.read().count("<lifemodule "), 1)


if __name__ == "__main__":
    unittest.main()
