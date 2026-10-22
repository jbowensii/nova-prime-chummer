"""The CommLink6-only data module (tools/cl6check/module.py) from an invented jar: every name, id and number is made up.
It checks which records the module carries (list 1, less the Misc. (US) books we import), how they become catalog
entries under CommLink6-only sources, that the former gen="cl6only" rows are the module's and no book's, and that the
files pass their schemas."""

import io
import os
import shutil
import tempfile
import unittest
import xml.etree.ElementTree as ET
import zipfile
from contextlib import redirect_stdout

from importer.sr6 import overrides
from tools.cl6check import module, reader
from tools.cl6check import optional as package

FILES = {
    "gizmo/data/gear.xml": (
        "<items>"
        '<item id="gadget" lang="de" avail="4L" price="300" type="WEAPON_FIREARMS" subtype="PISTOLS_HEAVY">'
        '<weapon dmg="4P" attack="8,11,8,," mode="SS" ammo="2(b)" skill="firearms" spec="firearms/pistols_heavy"/>'
        "</item>"
        '<item id="widget" avail="2" price="50" type="TOOLS" subtype="TOOLS"/>'
        '<item id="pilot_3" avail="99" price="0" type="ACCESSORY" subtype="WEAPON_ACCESSORY"/>'
        '<lifemod id="Schule_X" type="ADULT"/>'
        '<quality id="gadget" lang="de" karma="3" pos="true"/>'
        '<metatype id="trollish"><modifications><valmod ref="BODY" type="ATTRIBUTE" value="9" set="MAX"/>'
        "</modifications></metatype>"
        '<metatype id="trollkin" lang="de" variantof="trollish"><modifications>'
        '<valmod ref="STRENGTH" type="ATTRIBUTE" value="8" set="MAX"/><itemmod type="QUALITY" ref="tough"/>'
        "</modifications></metatype>"
        '<metatype id="drakish" lang="de"/>'
        '<mentorspirit id="fox" lang="de"><modifications>'
        '<checkmod type="SKILL" ref="stealth" value="-1" what="EDGE_BOOST"/></modifications>'
        '<magician><checkmod type="SPELL" ref="ILLUSION" value="-1" what="EDGE_BOOST"/></magician>'
        '<adept><valmod type="ADEPT_POWER" ref="sense" value="1"/></adept></mentorspirit>'
        '<mentorspirit id="mute" lang="de"/>'
        "</items>"
    ),
    "gizmo/i18n/gizmo.properties": (
        "item.gadget=Gadget Gun\nitem.gadget.page=12\nitem.widget=Widget\nitem.pilot_3=Pilot 3\n"
        "quality.gadget=Gadgeteer\nquality.tough=Tough\nmetatype.trollish=Trollish\nmetatype.trollkin=Trollkin\n"
        "metatype.drakish=Drakish\nmentorspirit.fox=Fox\nmentorspirit.mute=Mute\nadeptpower.sense=Improved Sense\n"
    ),
    "gizmo/i18n/gizmo_de.properties": "lifemod.Schule_X=Schule X\n",
    "de_land/data/gear.xml": (
        '<items><item id="wurst" avail="1" price="9" type="ARMOR" subtype="ARMOR_SOCIAL"><armor rating="2" social="1"/>'
        "</item></items>"
    ),
    "de_land/i18n/de_land.properties": "item.wurst=Wurst\nitem.wurst.page=3\n",
    "other_us/data/gear.xml": (
        '<items><item id="kimchi" avail="2" price="5" type="TOOLS" subtype="TOOLS"/>'
        '<item id="forum_thing" avail="2" price="5" type="TOOLS" subtype="TOOLS"/></items>'
    ),
    "other_us/i18n/other_us.properties": (
        "item.kimchi=Kimchi\nitem.kimchi.prodname=Seoul Survivor\nitem.forum_thing=Forum Thing\n"
        "item.forum_thing.prodname=SR6 Forum\n"
    ),
}


class ModuleTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp()
        cls.jar = os.path.join(cls.dir, "commlink6-0-complete.jar")
        with zipfile.ZipFile(cls.jar, "w") as z:
            for n, t in FILES.items():
                z.writestr(reader.ROOT + n, t.encode("utf8"))
        cls.files, cls.summary = module.build(cls.jar)
        cls.by_tag = {
            (e.tag, e.get("id")): e
            for name, xml in cls.files.items()
            if name not in ("index.xml", "sources.xml")
            for e in ET.fromstring(xml.split("?>", 1)[1].encode("utf8"))
        }
        cls.entries = {i: e for (_, i), e in cls.by_tag.items()}

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir)

    def test_list_one_records_are_entries_and_the_rest_are_not(self):
        e = self.entries
        self.assertIn("cl6.gizmo.gadget", e)  # (a German edition's copy)
        self.assertIn("cl6.gizmo.pilot-3", e)  # (a table cell Commlink6 made a record of)
        self.assertIn("cl6.de-land.wurst", e)  # (a German-only book)
        self.assertIn("cl6.other-us.forum-thing", e)  # (Misc. (US), no book of ours)
        self.assertNotIn("cl6.gizmo.widget", e)  # (a book prints it: book data)
        self.assertNotIn("cl6.other-us.kimchi", e)  # (Seoul Survivor: a book we import)
        # (the weapon, the quality, a metatype, a mentor spirit; and the three German-named rows)
        self.assertEqual(self.summary["group"]["German-rules duplicates"], 4 + 3)

    def test_an_entry_carries_commlink6s_values_in_our_words_under_its_own_source(self):
        g = self.entries["cl6.gizmo.gadget"]
        self.assertEqual(g.tag, "weapon")
        self.assertEqual(
            {k: g.get(k) for k in ("source", "page", "cost", "avail", "dv", "ar", "skill", "spec", "class")},
            {
                "source": "CL6-GIZMO",
                "page": "12",
                "cost": "300",
                "avail": "4(L)",
                "dv": "4P",
                "ar": "8/11/8/—/—",
                "skill": "Firearms",
                "spec": "Pistols Heavy",
                "class": "WEAPON_FIREARMS/PISTOLS_HEAVY",
            },
        )
        self.assertEqual(g.findtext("name"), "Gadget Gun")
        w = self.entries["cl6.de-land.wurst"]
        self.assertEqual((w.tag, w.get("defense"), w.get("social"), w.findtext("name")), ("armor", "+2", "1", "Wurst"))

    def test_a_record_with_no_english_name_keeps_the_one_commlink6_prints_and_page_1(self):
        m = self.entries["cl6.gizmo.schule-x"]
        self.assertEqual(
            (m.tag, m.findtext("name"), m.get("page"), m.get("stage")), ("lifemodule", "Schule X", "1", "adult")
        )

    def test_the_former_cl6only_rows_are_the_modules_and_no_books(self):
        c = self.entries["cl6.da.crew-served-3"]
        self.assertEqual((c.get("source"), c.get("page"), c.get("avail"), c.get("cost")), ("CL6-DA", "153", "99", "0"))
        self.assertEqual(c.find("fits").get("slot"), "internal")  # (the structure row moved with it)
        h = self.entries["cl6.other-us.hitches-fifth-wheel"]  # (its id and its source name one book)
        self.assertEqual((h.get("source"), h.findtext("alias")), ("CL6-OTHER-US", "Hitches: Fith Wheel"))
        # (each keeps its old book id as an alias: a saved runner holding it finds the module's entry)
        self.assertEqual([a.get("id") for a in c.findall("alias")], ["da.crew-served-3"])
        self.assertIn("dc.hitches-fifth-wheel", [a.get("id") for a in h.findall("alias")])
        book = overrides.apply("da", {})
        self.assertNotIn("Crew Served (3)", "".join(book.values()))
        self.assertIn(("da", "crew_served_3"), package.load()[0])  # (counted matched, through the optional package)
        self.assertNotIn(("da", "crew_served_3"), package.load(with_module=False)[0])

    def test_sources_are_commlink6_only_and_not_canon_and_the_index_names_every_file(self):
        src = {s.get("id"): s for s in ET.fromstring(self.files["sources.xml"].split("?>", 1)[1].encode("utf8"))}
        self.assertEqual(src["CL6-DE-LAND"].findtext("name"), "CommLink6 only: de_land (German only)")
        self.assertTrue(all(s.get("canon") == "false" for s in src.values()))
        self.assertTrue({e.get("source") for e in self.entries.values()} <= set(src))
        index = [f.get("href") for f in ET.fromstring(self.files["index.xml"].split("?>", 1)[1].split("-->", 1)[1])]
        self.assertEqual(index[0], "sources.xml")
        self.assertEqual(set(index), set(self.files) - {"index.xml"})

    def test_one_id_in_two_kinds_keeps_it_in_each(self):
        self.assertIn(("weapon", "cl6.gizmo.gadget"), self.by_tag)
        self.assertIn(("quality", "cl6.gizmo.gadget"), self.by_tag)

    def test_a_metatype_has_its_ranges_and_traits_or_is_left_out(self):
        m = self.entries["cl6.gizmo.trollkin"]
        ranges = {r.get("attr"): (r.get("min"), r.get("max")) for r in m.findall("range")}
        self.assertEqual(
            (len(ranges), ranges["bod"], ranges["str"], ranges["agi"]), (9, ("1", "9"), ("1", "8"), ("1", "6"))
        )
        self.assertEqual([x.text for x in m.findall("trait")], ["Tough"])
        self.assertNotIn("cl6.gizmo.drakish", self.entries)  # (no maximums: an unusable metatype is left out)
        self.assertIn("gizmo/metatype/drakish", sum(self.summary["unmapped"].values(), []))

    def test_a_mentor_spirit_has_its_advantages_in_our_words_or_is_left_out(self):
        f = self.entries["cl6.gizmo.fox"]
        self.assertEqual(
            [dict(x.attrib) for x in f.findall("effect")],
            [
                {"target": "skill:stealth", "op": "edge-cost", "value": "-1"},
                {
                    "target": "test:spell-illusion",
                    "op": "edge-cost",
                    "value": "-1",
                    "switch": "conditional",
                    "when": "magician",
                },
            ],
        )
        self.assertEqual(
            [dict(x.attrib) for x in f.findall("link")],
            [{"rel": "grants", "name": "Improved Sense", "kind": "adeptpowers", "level": "1", "when": "adept"}],
        )
        self.assertNotIn("cl6.gizmo.mute", self.entries)

    def test_the_definition_rows_are_checked_and_their_order_does_not_matter(self):
        rows = package.load_module()
        bad = [r for r in rows if "add" in r][0]
        for broken in ({**bad, "cl6_book": ""}, {"src": "da", "kind": "gear", "id": "nothing-added", "gen": "family"}):
            with self.assertRaisesRegex(ValueError, "cl6only_module.json row"):
                module.check_rows([*rows, broken])
        got = {}

        def root(kind):
            return got.setdefault(kind, [])

        module._defined(list(reversed(rows)), root, lambda kind, i: i)  # pylint: disable=protected-access
        wheel = next(e for e in got["gear"] if e.findtext("name") == "Hitches: Fifth Wheel")
        self.assertEqual(wheel.findtext("alias"), "Hitches: Fith Wheel")  # (the name row ran after its add row)

    def test_a_failed_swap_leaves_the_live_module_and_drops_the_new_one(self):
        from unittest import mock

        out = os.path.join(self.dir, "swap")
        live = os.path.join(out, "custom", "sr6", "cl6only")
        os.makedirs(live)
        with open(os.path.join(live, "index.xml"), "w", encoding="utf8") as f:
            f.write("old")
        real = module._rename  # pylint: disable=protected-access

        def locked(src, dst):  # (the new module cannot take the live one's place: a server holds a file open)
            if src.endswith(".new"):
                raise PermissionError("locked")
            real(src, dst)

        with mock.patch.object(module, "_rename", side_effect=locked):
            with self.assertRaises(PermissionError):
                module.write(out, self.jar)
        with open(os.path.join(live, "index.xml"), encoding="utf8") as f:
            self.assertEqual(f.read(), "old")
        self.assertFalse(os.path.exists(live + ".new"))
        module.write(out, self.jar)  # (unlocked: swapped in, the old one under _to_delete)
        self.assertTrue(os.listdir(os.path.join(out, "_to_delete")))
        with open(os.path.join(live, "index.xml"), encoding="utf8") as f:
            self.assertIn("<overlays>", f.read())

    def test_ruleoptions_are_not_mapped(self):
        self.assertEqual(
            module.entry({**self.rec("interpretation", "houserules"), "attrs": {}})[0], None
        )  # (a rule setting)

    @staticmethod
    def rec(tag, iid):
        """A reader-shaped record of an invented element."""
        el = ET.fromstring(f'<{tag} id="{iid}"/>')
        return {"book": "gizmo", "file": "x", "tag": tag, "id": iid, "name": iid, "page": "", "variants": {}, "el": el}

    def test_the_command_writes_valid_files_or_skips_without_a_jar(self):
        out = os.path.join(self.dir, "out")
        with redirect_stdout(io.StringIO()) as s:
            self.assertEqual(module.main([out, "--jar", self.jar]), 0)
        self.assertRegex(s.getvalue(), r"module: \d+ entries, \d+ sources")
        self.assertTrue(os.path.isfile(os.path.join(out, "custom", "sr6", "cl6only", "index.xml")))
        with redirect_stdout(io.StringIO()) as s:
            self.assertEqual(module.main([out, "--jar", os.path.join(self.dir, "none.jar")]), 0)
        self.assertIn("skipped", s.getvalue())


if __name__ == "__main__":
    unittest.main()
