# pylint: disable=line-too-long,missing-function-docstring,missing-class-docstring,dangerous-default-value,unnecessary-lambda-assignment,unnecessary-lambda  # (invented-data fixtures)
"""Stage 2 of the vehicle decomposition: the generator's rules (tools/cl6check/vehicleparts.py) and the importer's reader
(resolve.vehicle_parts), on invented data (no jar, no PDFs)."""

import os
import tempfile
import unittest

from lxml import etree

from importer.sr6 import resolve
from tools.cl6check import vehicleparts as vp

DEFS = {
    "mount": {"VEHICLE_HARDPOINT": "0.5"},
    "seat": {},
    "realistic": {"VEHICLE_CHASSIS": "$RATING"},
    "meta_adjust_pilot": {},
    "armor": {"VEHICLE_CF": "$$ARMOR*0.25"},
    "stinger": {"VEHICLE_HARDPOINT": "0.5"},  # a geardef child on the core printing of the drone
}
VARIANTS = {
    "seat": {"high": {"VEHICLE_CF": "2"}},
    "meta_adjust_pilot": {"driver_troll": {"VEHICLE_CF": "1"}, "passenger_troll": {}},
}


def emb(ref, into, **kw):
    return {"type": "GEAR", "ref": ref, "intoRef": into, "intoId": None, "id": None, "included": None,
            "variant": None, "rating": None, "count": None, **kw}  # fmt: skip


def rec(vid, embeds, geardef=()):
    return {"id": vid, "geardef": list(geardef), "embeds": embeds}


PARTS = {
    "mount": "x.mount",
    "seat": "x.seat",
    "realistic": "x.realistic",
    "meta_adjust_pilot": "x.pilot",
    "armor": "x.armor",
}


class Generator(unittest.TestCase):
    def build(self, latest, others=None, vehicles=None, parts=PARTS):
        veh = vehicles or {v: [f"x.{v}"] for v in latest}
        return vp.build(latest, others or {}, DEFS, VARIANTS, parts, veh)

    def test_embed_to_row_parent_cost_and_body_hook(self):
        latest = {
            "van": rec(
                "van",
                [
                    emb("mount", "VEHICLE_HARDPOINT", id="m1", included="true"),
                    emb("seat", "VEHICLE_BODY", intoId="m1", variant="high"),  # nested, variant usage on another hook
                    emb("armor", "VEHICLE_CF"),
                    emb("realistic", "VEHICLE_CHASSIS", rating="3"),
                ],
            )
        }
        rows, un = self.build(latest)
        self.assertEqual(un, [])
        by = {r["ref"]: r for r in rows}
        self.assertEqual(
            (by["x.mount"]["hook"], by["x.mount"]["cost"], by["x.mount"]["id"]), ("vehicle-hardpoint", "0.5", "m1")
        )
        self.assertEqual(
            (by["x.seat"]["hook"], by["x.seat"]["parent"], by["x.seat"]["cost"]), ("vehicle-body", "m1", "2")
        )
        self.assertEqual(by["x.armor"]["cost"], "$$ARMOR*0.25")  # needs the host: kept as printed
        self.assertEqual((by["x.realistic"]["cost"], by["x.realistic"]["rating"]), ("3", "3"))
        self.assertTrue(all(r["origin"] == "cl6" and r["review"] == "none" for r in rows))

    def test_rules_override_and_unmatched(self):
        latest = {
            "bike": rec("bike", [emb("seat_high", "VEHICLE_CF"), emb("realistic2", "VEHICLE_CHASSIS")]),
            "harley-davidson_scorpion": rec("harley-davidson_scorpion", [emb("meta_adjust_pilot_troll", "VEHICLE_CF")]),
            "other": rec("other", [emb("meta_adjust_pilot_troll", "VEHICLE_CF"), emb("ghost", "VEHICLE_CF")]),
            "orphan": rec("orphan", [emb("mount", "VEHICLE_HARDPOINT")]),
        }
        rows, un = self.build(
            latest, vehicles={"bike": ["x.bike"], "harley-davidson_scorpion": ["x.s"], "other": ["x.o"]}
        )
        by = {(r["vehicle"], r["ref"]): r for r in rows}
        self.assertEqual(by["x.bike", "x.seat"]["variant"], "high")  # M4
        self.assertEqual(by["x.bike", "x.realistic"]["rating"], "2")  # M2
        d9 = by["x.s", "x.pilot"]  # the one ruled override
        self.assertEqual((d9["variant"], d9["hook"], d9.get("override")), ("driver_troll", "vehicle-cf", True))
        self.assertEqual(sum(1 for r in rows if r.get("override")), 1)
        why = {u["cl6"]: u["why"] for u in un}  # never dropped, never blank: listed, needs-owner
        self.assertIn(
            "ambiguous", why["other/meta_adjust_pilot_troll"]
        )  # the rules must not choose between the variants
        self.assertIn("no rule", why["other/ghost"])
        self.assertIn("vehicle not matched", why["orphan/mount"])
        self.assertTrue(all(u["review"] == "needs-owner" for u in un))

    def test_m7_sibling_inline_part_and_missing_catalog_entry(self):
        latest = {"hornet": rec("hornet", [emb("hornet_mount", "VEHICLE_BODY")])}
        others = {"hornet": [rec("hornet", [emb("stinger", "VEHICLE_HARDPOINT")], geardef=["stinger"])]}
        _, un = self.build(latest, others)  # the stinger is no entry of ours: reported, with its CL6 id
        self.assertEqual([(u["cl6"], u["hook"]) for u in un], [("hornet/hornet_mount", "vehicle-body")])
        self.assertIn("stinger", un[0]["why"])
        rows, un = self.build(latest, others, parts={**PARTS, "stinger": "x.stinger"})
        self.assertEqual(un, [])
        self.assertEqual(
            (rows[0]["ref"], rows[0]["hook"], rows[0]["cost"], rows[0]["review"]),
            ("x.stinger", "vehicle-body", "0.5", "needs-owner"),
        )

    def test_vehicle_copies_and_no_embeds(self):
        latest = {"v": rec("v", [emb("mount", "VEHICLE_HARDPOINT")]), "bare": rec("bare", [])}
        rows, un = self.build(latest, vehicles={"v": ["a.v", "b.v"], "bare": ["a.bare"]})
        self.assertEqual(([r["vehicle"] for r in rows], un), (["a.v", "b.v"], []))  # P5: nothing for a bare vehicle

    def test_gate(self):
        latest = {"v": rec("v", [emb("mount", "VEHICLE_HARDPOINT"), emb("ghost", "VEHICLE_CF")])}
        rows, un = self.build(latest)
        rows[0]["override"] = True
        data = {"rows": rows, "unmatched": un}
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "vehicles.xml"), "w", encoding="utf8") as f:
                f.write(
                    '<d><gear id="x.mount"/><vehicle id="x.v"><part ref="x.mount" hook="vehicle-hardpoint" cost="0.5"/></vehicle></d>'
                )
            lines, ok = vp.gate(d, data, latest)
            self.assertTrue(ok, lines)
            data["unmatched"] = []  # a placement lost from the table fails the gate
            self.assertFalse(vp.gate(d, data, latest)[1])


class Reader(unittest.TestCase):
    def entries(self):
        mk = lambda x: etree.fromstring(x)  # noqa: E731
        gb = mk('<vehicle id="crb.gb"><name>GB</name><builtin name="Armor" ref="x.a"/><builtin name="+4 chassis" slots="4"/>'
                '<note field="builtin">as printed</note><text>t</text></vehicle>')  # fmt: skip
        book = mk('<vehicle id="crb.book-only"><name>B</name><builtin name="Armor"/></vehicle>')
        mount = mk('<gear id="x.mount"><name>Mount</name></gear>')  # (the entry the rows' ref names)
        return (
            gb,
            book,
            [
                (None, "crb", "vehicles", gb, "f"),
                (None, "crb", "vehicles", book, "f"),
                (None, "crb", "gear", mount, "g"),
            ],
        )

    def test_parts_replace_builtins_where_cl6_has_parts(self):
        gb, book, entries = self.entries()
        rows = [{"vehicle": "crb.gb", "id": "p1", "ref": "x.mount", "hook": "vehicle-hardpoint", "cost": "0.5",
                 "origin": "cl6", "review": "none", "cl6": "gb/mount", "rule": "M1"}]  # fmt: skip
        changed = set()
        self.assertEqual(resolve.vehicle_parts(entries, changed, {"rows": rows}), 1)
        parts = gb.findall("part")
        self.assertEqual([dict(p.attrib) for p in parts], [{"id": "p1", "ref": "x.mount", "hook": "vehicle-hardpoint", "cost": "0.5", "origin": "cl6", "review": "none", "removable": "true"}])  # fmt: skip
        self.assertEqual([b.get("name") for b in gb.findall("builtin")], ["+4 chassis"])  # a slot grant is a budget
        self.assertEqual(len(gb.findall("note")), 1)
        self.assertEqual(gb[-1].tag, gb.find("text").tag)  # <text> stays last
        self.assertEqual(len(book.findall("builtin")), 1)  # book-only: unchanged (origin book)
        self.assertEqual(changed, {"f"})
        resolve.vehicle_parts(entries, changed, {"rows": rows})  # idempotent
        self.assertEqual(len(gb.findall("part")), 1)

    def test_a_vehicle_with_an_unkeyed_part_keeps_its_builtins(self):
        gb, _, entries = self.entries()
        rows = [
            {
                "vehicle": "crb.gb",
                "id": "p1",
                "ref": "x.mount",
                "hook": "vehicle-hardpoint",
                "origin": "cl6",
                "review": "none",
            }
        ]
        resolve.vehicle_parts(entries, set(), {"rows": rows, "unmatched": [{"vehicle": ["crb.gb"], "cl6": "gb/ghost"}]})
        self.assertEqual(len(gb.findall("part")), 1)
        self.assertEqual(len(gb.findall("builtin")), 2)  # never below today's factory fit

    def test_a_ref_only_the_optional_module_has_is_skipped_and_holds_the_vehicle(self):
        gb, _, entries = self.entries()
        rows = [
            {"vehicle": "crb.gb", "id": "p1", "ref": "x.mount", "hook": "h", "origin": "cl6", "review": "none"},
            {
                "vehicle": "crb.gb",
                "id": "p2",
                "ref": "da.mil-spec-weapon-mount",
                "hook": "h",
                "origin": "cl6",
                "review": "none",
            },
        ]
        resolve.vehicle_parts(entries, set(), {"rows": rows})
        self.assertEqual([p.get("ref") for p in gb.findall("part")], ["x.mount"])  # no dangling part
        self.assertEqual(len(gb.findall("builtin")), 2)  # held: factory fit kept
        entries.append((None, "da", "gear", etree.fromstring('<gear id="da.mil-spec-weapon-mount"/>'), "m"))
        resolve.vehicle_parts(entries, set(), {"rows": rows})  # the module present: resolves normally
        self.assertEqual(len(gb.findall("part")), 2)
        self.assertEqual([b.get("name") for b in gb.findall("builtin")], ["+4 chassis"])


class InlineParts(unittest.TestCase):
    def test_a_geardef_becomes_an_add_row_and_a_key(self):
        inline = {
            "stinger": {"vehicle": "hornet", "type": "WEAPON_CLOSE_COMBAT", "subtype": "BLADES", "name": "Hornet Injector",
                        "usage": {"VEHICLE_HARDPOINT": "0.5"}, "page": "299", "vname": "Hornet",
                        "weapon": {"dmg": "1P", "attack": "4,,,,", "skill": "close_combat", "spec": "close_combat/blades"}},
            "ghost": {"vehicle": "nowhere", "type": "MOD_HARD", "subtype": "X", "name": "G", "usage": {}, "page": "1", "vname": "N", "weapon": {}},
        }  # fmt: skip
        ids, rows = vp.inline_entries(inline, {}, {"hornet": ["crb.hornet"]})
        self.assertEqual(ids, {"stinger": "crb.hornet-injector"})  # no vehicle of ours: no entry
        r = rows["crb"][0]
        self.assertEqual(
            (r["kind"], r["add"]["page"], r["add"]["attrs"]["ar"], r["add"]["attrs"]["spec"]),
            ("weapons", 299, "4/—/—/—/—", "Blades"),
        )
        self.assertEqual(r["add"]["kids"], [{"tag": "fits", "attrs": {"slot": "vehicle-hardpoint"}}])

    def test_a_global_part_is_minted_under_its_fixed_name(self):
        inline = {"spurs": {"vehicle": "samurai", "type": "WEAPON_CLOSE_COMBAT", "subtype": "BLADES", "name": "Nissan Spurs",
                            "fixed": "Nissan Spurs", "usage": {"VEHICLE_HARDPOINT": "1"}, "page": "300", "vname": "Nissan Samurai",
                            "weapon": {"dmg": "3P", "attack": "6,,,,", "skill": "close_combat", "spec": "close_combat/blades"}}}  # fmt: skip
        ids, rows = vp.inline_entries(inline, {}, {"samurai": ["crb.samurai", "crb.oni"]})
        self.assertEqual(ids, {"spurs": "crb.nissan-spurs"})  # not "Nissan Samurai Nissan Spurs"
        self.assertEqual(rows["crb"][0]["add"]["attrs"]["dv"], "3P")

    def test_the_mil_spec_mount_and_the_fob_are_minted_as_book_parts_not_aliased(self):
        self.assertFalse(hasattr(vp, "ALIASES"))  # (an alias would dangle where the optional CL6-only module is absent)
        self.assertTrue({"weapon_mount_military", "mtoc_fob"} <= set(vp.GLOBAL_PARTS))
        inline = {
            "weapon_mount_military": {"vehicle": "v", "type": "MOD_HARD", "subtype": "MOD_MOUNT", "fixed": "Mil-Spec Weapon Mount (part)",
                                      "name": "Mil-Spec Weapon Mount (part)", "usage": {"VEHICLE_HARDPOINT": "5"}, "page": "151",
                                      "vname": "V", "weapon": {}, "avail": "99I", "hooks": {"VEHICLE_WEAPON_MILITARY": "1"}},
            "mtoc_fob": {"vehicle": "v", "type": "ELECTRONICS", "subtype": "TAC_NET", "fixed": "M-TOC Fob (part)",
                         "name": "M-TOC Fob (part)", "usage": {}, "page": "68", "vname": "V", "weapon": {}, "avail": "99I", "hooks": {}},
        }  # fmt: skip
        ids, rows = vp.inline_entries(inline, {}, {"v": ["da.v"]})
        self.assertEqual(
            ids, {"weapon_mount_military": "da.mil-spec-weapon-mount-part", "mtoc_fob": "da.m-toc-fob-part"}
        )  # clear of the module's da.mil-spec-weapon-mount and the rule da.m-toc-fob
        fob, mount = rows["da"]  # (sorted by CL6 id)
        self.assertEqual(mount["add"]["attrs"]["avail"], "99(I)")
        self.assertEqual(
            mount["add"]["kids"],
            [{"tag": "fits", "attrs": {"slot": "vehicle-hardpoint"}},
             {"tag": "slot", "attrs": {"id": "vehicle-weapon-military", "value": "1"}}],
        )  # fmt: skip
        self.assertEqual((fob["kind"], fob["add"]["attrs"]["class"]), ("electronics", "ELECTRONICS/TAC_NET"))


class Powerplants(unittest.TestCase):
    def veh(self, vid, name, **a):
        return {"id": vid, "name": name, "page": "12", "attrs": {"body": "16", "accel": "10", "topSpeed": "100", **a}}

    def test_one_per_self_propelled_vehicle_and_none_for_a_static_one(self):
        rows, add = vp.powerplants(
            [self.veh("crb.bulldog", "GMC Bulldog"), self.veh("crb.trailer", "Trailer", accel="\u2014", topSpeed="")]
        )
        self.assertEqual([r["vehicle"] for r in rows], ["crb.bulldog"])
        r = rows[0]
        self.assertEqual(
            (r["ref"], r["hook"], r["cost"], r["origin"], r["review"]),
            ("crb.bulldog-powerplant", "vehicle-powertrain", "5", "synth", "needs-owner"),
        )
        self.assertNotIn("cl6", r)  # (never claims a Commlink6 source)
        e = add["crb"][0]
        self.assertEqual((e["cl6"], e["kind"], e["add"]["attrs"]["cost"]), ("GMC Bulldog Powerplant", "gear", "0"))
        self.assertEqual(e["add"]["kids"][0], {"tag": "fits", "attrs": {"slot": "vehicle-powertrain"}})
        self.assertIn("Powerplant: Speed 100, Acceleration 10", e["add"]["kids"][1]["text"])

    def test_size_is_max_half_round_body_over_three(self):
        size = lambda body: vp.powerplants([self.veh("x.v", "V", body=str(body))])[0][0]["cost"]  # noqa: E731
        self.assertEqual([size(b) for b in (0, 1, 2, 4, 5, 6, 16)], ["0.5", "0.5", "1", "1", "2", "2", "5"])

    def test_a_name_clash_is_refused_not_silently_merged(self):
        with self.assertRaises(ValueError):
            vp.powerplants([self.veh("a.v", "V")], taken={"a.v-powerplant"})

    def test_the_gate_leaves_synthesized_rows_out_of_the_oracle_and_counts_them(self):
        latest = {"v": rec("v", [emb("mount", "VEHICLE_HARDPOINT")])}
        rows, un = vp.build(latest, {}, DEFS, VARIANTS, PARTS, {"v": ["x.v"]})
        rows[0]["override"] = True
        pp, _ = vp.powerplants([{"id": "x.v", "name": "V", "page": "1", "attrs": {"body": "6", "accel": "1"}}])
        data = {"rows": rows + pp, "unmatched": un}
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "v.xml"), "w", encoding="utf8") as f:
                f.write(
                    '<d><gear id="x.mount"/><gear id="x.v-powerplant"/><vehicle id="x.v">'
                    '<part ref="x.mount" hook="vehicle-hardpoint" cost="0.5"/>'
                    '<part ref="x.v-powerplant" hook="vehicle-powertrain" cost="2"/></vehicle></d>'
                )
            lines, ok = vp.gate(d, data, latest)
        self.assertTrue(ok, lines)
        self.assertIn("1 powerplants on 1 vehicles", lines[-1])

    def test_only_a_synthesized_part_keeps_the_box_text_builtins(self):
        gb, _, entries = Reader.entries(self)
        resolve.vehicle_parts(
            entries,
            set(),
            {
                "rows": [
                    {
                        "vehicle": "crb.gb",
                        "id": "pp",
                        "ref": "x.mount",
                        "hook": "vehicle-powertrain",
                        "origin": "synth",
                        "review": "needs-owner",
                    }
                ]
            },
        )
        self.assertEqual(len(gb.findall("part")), 1)
        self.assertEqual(len(gb.findall("builtin")), 2)  # nothing replaced them


if __name__ == "__main__":
    unittest.main()
