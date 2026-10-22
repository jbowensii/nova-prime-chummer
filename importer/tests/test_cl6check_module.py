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
        "</items>"
    ),
    "gizmo/i18n/gizmo.properties": (
        "item.gadget=Gadget Gun\nitem.gadget.page=12\nitem.widget=Widget\nitem.pilot_3=Pilot 3\n"
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
        cls.entries = {
            e.get("id"): e
            for name, xml in cls.files.items()
            if name not in ("index.xml", "sources.xml")
            for e in ET.fromstring(xml.split("?>", 1)[1].encode("utf8"))
        }

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
        self.assertEqual(self.summary["group"]["German-rules duplicates"], 1 + 3)  # (and the three German-named rows)

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
        h = self.entries["cl6.dc.hitches-fifth-wheel"]
        self.assertEqual((h.get("source"), h.findtext("alias")), ("CL6-OTHER-US", "Hitches: Fith Wheel"))
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
