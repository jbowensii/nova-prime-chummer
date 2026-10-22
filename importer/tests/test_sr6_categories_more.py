"""More of the category rules (importer/sr6/categories.py): a title's joining words, a table's verdict when its title is
split, names no category or mixes kinds, composed search names, and a first column headed by a class (`GRENADES`). Every
name, number and line is invented."""

import unittest

from importer.sr6 import categories as C

# pylint: disable=protected-access


class TitleTest(unittest.TestCase):
    def test_joining_words_at_either_end_are_dropped(self):
        self.assertEqual(C.category_name("The cyberlimb"), "Cyberlimb")
        self.assertEqual(C.category_name("cyberlimb and"), "Cyberlimb")
        self.assertIsNone(C.category_name("and for"))


class ClassifyTest(unittest.TestCase):
    def test_the_verdicts_that_are_not_a_clean_table(self):
        self.assertEqual(
            C.classify({"title": "gizmos", "section": "Gizmos"}, {"gear": 1, "weapons": 1}, {}),
            ("Gizmo", "high", "mixed rows"),
        )
        self.assertEqual(
            C.classify({"title": "gizmo and", "section": "Xs"}, {"gear": 2}, {}),
            ("Gizmo", "low", "title split across lines"),
        )
        self.assertEqual(
            C.classify({"title": "Table 4.2", "section": "Misc Glow"}, {"gear": 2}, {}),
            ("Misc glow", "low", "title isn't a category"),
        )  # (the section's words take its place)
        self.assertEqual(C.classify({"title": "", "section": ""}, {"gear": 1}, {}), (None, "low", "no title"))


class ComposedNamesTest(unittest.TestCase):
    def test_a_modifier_the_prose_prints_before_the_category_word(self):
        voc = C.Vocabulary(["Gel ammo is loaded. Ammo types vary."])
        self.assertEqual(voc.composed("gel", "ammo type"), ["gel ammo"])
        self.assertEqual(voc.composed("rod", "ammo type"), [])

    def test_aliases_with_and_without_a_variant(self):
        self.assertEqual(
            C._aliases("Cyberarm (synthetic)", ["cyberarm"]), ["Cyberarm", "Cyberarm (synthetic)", "Synthetic cyberarm"]
        )
        self.assertEqual(C._aliases("Arm", ["cyberarm"]), ["Cyberarm"])


class _Cat:
    """The parts of the book's catalog build() uses: its tables, its rows by kind and the category records it is
    given."""

    def __init__(self, tables, entries):
        self.tables, self.entries, self.added = tables, entries, []

    def add(self, kind, name, _page, attrs, kids, _text, cid=None):
        """Record the entry the builder adds."""
        self.added.append((kind, name, attrs, kids, cid))


def row(name, tab, category):
    """A catalog row with the given tab and category."""
    return {"name": name, "attrs": {"category": category}, "page": 1, "aliases": [], "children": [], "tab": tab}


class BuildTest(unittest.TestCase):
    def test_a_first_column_headed_by_a_class_makes_its_rows_parts_of_it(self):
        cat = _Cat(
            {
                0: {"title": "grenades", "section": "Zorpbombs", "header": ["GRENADES", "AVAIL"], "page": 1},
                1: {"title": "gadgets", "section": "Zorpbombs", "header": ["ITEM", "AVAIL"], "page": 1},
            },  # (no rows: no verdict)
            {"weapons": [row("Gas", 0, "grenades"), row("Smoke", 0, "grenades")], "gear": []},
        )
        verdicts, groups = C.build(cat, ["A gas grenade bursts and a smoke grenade hides."], ["weapons", "gear"])
        self.assertEqual([(v[1], v[2], v[3]) for v in verdicts], [("Grenade", "high", None)])
        self.assertEqual(
            [(e["name"], e["attrs"]["group"], conf, m, e["aliases"]) for e, _, _, conf, m in groups],
            [
                ("Gas", "Grenade", 1.0, ["gas grenade"], ["Gas grenade"]),
                ("Smoke", "Grenade", 1.0, ["smoke grenade"], ["Smoke grenade"]),
            ],
        )
        self.assertEqual(
            [(kind, name, cid) for kind, name, _, _, cid in cat.added], [("categories", "Grenade", "weapons.grenade")]
        )

    def test_a_row_with_no_category_name_makes_no_record(self):
        cat = _Cat({2: {"title": "", "section": "", "header": ["ITEM"], "page": 1}}, {"gear": [row("Widget", 2, "")]})
        verdicts, _groups = C.build(cat, [], ["gear"])
        self.assertEqual([(v[1], v[2], v[3]) for v in verdicts], [(None, "low", "no title")])
        self.assertEqual(cat.added, [])
        self.assertNotIn("group", cat.entries["gear"][0]["attrs"])

    def test_a_mod_category_priced_in_mod_slots_fits_vehicles(self):
        def slotted(name, tab, category, slots="1"):
            r = row(name, tab, category)
            r["attrs"]["slots"] = slots
            return r

        def table(section):
            return {"title": section.lower(), "section": section, "header": ["GEAR", "MOD SLOTS"], "page": 1}

        cat = _Cat(
            {
                i: table(sec)
                for i, sec in enumerate(["Zorp Mods", "Glow Mods", "Half Mods", "Blank Mods", "Quux Systems"])
            },
            {
                "gear": [
                    slotted("Zorp", 0, "zorp-mods"),
                    slotted("Blip", 0, "zorp-mods"),
                    row("Glim", 1, "glow-mods"),
                    slotted("Hi", 2, "half-mods"),
                    row("Ho", 2, "half-mods"),  # (exactly half: not a vehicle's)
                    slotted("Bl", 3, "blank-mods", ""),
                    slotted("Qu", 4, "quux-systems"),
                ]
            },
        )
        verdicts, _ = C.build(cat, [], ["gear"])
        fits = {n: (a["fits"], [k[2] for k in kids]) for _, n, a, kids, _ in cat.added}
        self.assertEqual(fits["Zorp mods"], ("Vehicle", []))  # (no host word, no missing-host issue)
        self.assertEqual(fits["Quux systems"], ("Vehicle", []))  # (a name that gives no host)
        self.assertEqual(fits["Glow mods"], (None, ["no glow category in the book"]))  # (unslotted: the name's word)
        self.assertEqual(fits["Half mods"], (None, ["no half category in the book"]))
        self.assertEqual(fits["Blank mods"], (None, ["no blank category in the book"]))  # (a blank slots is no slot)
        self.assertEqual({v[1]: v[3] for v in verdicts}["Zorp mods"], None)  # (no stale "no matching host")
        self.assertEqual({v[1]: v[3] for v in verdicts}["Glow mods"], "accessory table with no matching host")

    def test_a_host_the_name_gives_as_a_vehicle_or_drone_stays_and_a_kind_word_ends_a_host(self):
        def slotted(name, tab, category):
            r = row(name, tab, category)
            r["attrs"]["slots"] = "1"
            return r

        tabs = {
            i: {"title": "", "section": sec, "header": ["GEAR"], "page": 1}
            for i, sec in enumerate(["Drone Mods", "New Weapon Mods"])
        }
        cat = _Cat(tabs, {"gear": [slotted("Zip", 0, "drone-mods"), row("Zap", 1, "new-weapon-mods")]})
        C.build(cat, [], ["gear"])
        self.assertEqual(
            {n: a["fits"] for _, n, a, _, _ in cat.added}, {"Drone mods": "Drone", "New weapon mods": "Weapon"}
        )


if __name__ == "__main__":
    unittest.main()
