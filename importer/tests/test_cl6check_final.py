"""The final Commlink6 analysis (tools/cl6check/final_analysis.py) on invented data: every name, id and number is made
up. It checks the grouping of both lists, the justification classes and that --check fails on a changed count."""

import os
import tempfile
import types
import unittest
import zipfile

from tools.cl6check import final_analysis as fa
from tools.cl6check import reader


def result(cid, name, our_id="", kind="gear", how="exact", diffs=(), src="gz"):
    """One comparison result row."""
    return {
        "src": src,
        "kind": kind,
        "id": cid,
        "name": name,
        "page": "10",
        "our_id": our_id,
        "our_kind": kind,
        "our_page": "11",
        "how": how,
        "diffs": list(diffs),
    }


def diff(field, cl6, ours, cls="b", pdf="ours", why="differs"):
    """One field difference of a result."""
    return {"field": field, "cl6": cl6, "ours": ours, "class": cls, "pdf": pdf, "why": why}


def data():
    """Sample entries and results for the final analysis."""
    entries = [
        {"src": "gz", "kind": "gear", "id": "gz.widget", "name": "Widget", "found": {}, "found_at": {}},
        {
            "src": "gz",
            "kind": "gear",
            "id": "gz.gadget",
            "name": "Gadget",
            "found": {"cost": "errata"},
            "found_at": {"cost": "GZE p2"},
        },
    ]
    cl6 = [
        {"src": "gz", "kind": k, "id": i, "name": n, "cl6only": o}
        for k, i, n, o in [
            ("gear", "widget", "Widget", False),
            ("gear", "gadget", "Gadget", False),
            ("gear", "range_9", "9 km", True),
            ("gear", "bundle", "Bundle", False),
            ("ruleoptions", "std", "Standard", True),
        ]
    ]
    return {
        "listing": [
            {
                "book": "gizmo",
                "tag": "item",
                "id": "dup",
                "name": "Dup",
                "page": "",
                "why": "lang=de (German-rules duplicate)",
            },
            {
                "book": "gizmo",
                "tag": "lifemod",
                "id": "nameless",
                "name": "",
                "page": "",
                "why": "no English name in the jar",
            },
        ],
        "side": [
            {"book": "de_land", "tag": "item", "id": "wurst", "name": "Wurst", "page": "3", "product": "", "lang": ""},
            {
                "book": "other_us",
                "tag": "item",
                "id": "fan",
                "name": "Fan Thing",
                "page": "1",
                "product": "Forum",
                "lang": "",
            },
            {
                "book": "other_us",
                "tag": "item",
                "id": "widget2",
                "name": "Widget",
                "page": "1",
                "product": "X",
                "lang": "",
            },
        ],
        "cl6": cl6,
        "mine": {"gz": types.SimpleNamespace(entries=entries)},
        "results": [
            result(
                "widget",
                "Widget",
                "gz.widget",
                diffs=[
                    diff("avail", "3", "4"),
                    diff("cost", "5", "6"),
                    diff("rating", "1-6", "", pdf="neither", why="ours empty"),
                ],
            ),
            result("gadget", "Gadget", "gz.gadget", diffs=[diff("cost", "10", "20")]),
            result("range_9", "9 km", "gz.widget", how="relocated"),
            result("bundle", "Bundle", how="optional package"),
            result("std", "Standard", "preset.std", kind="ruleoptions", how="already have"),
        ],
        "keep": [
            ["gz", "gear", "gz.widget", "cost"],
            ["gz", "gear", "gz.widget", "variants"],
            ["gz", "gear", "gz.gadget", "avail"],
        ],
        "hold": [],
        "verdicts": [
            {
                "src": "gz",
                "kind": "gear",
                "cl6_id": "widget",
                "cl6_name": "Widget",
                "our_id": "gz.widget",
                "field": "avail",
                "cl6": "3",
                "ours": "4",
                "page": "GZ p11",
                "reason": "the table prints 4",
            }
        ],
        "optional": [{"src": "gz", "cl6_id": "bundle", "name": "Bundle", "reason": "a construct"}],
        "relocated": [{"src": "gz", "cl6_id": "range_9", "our_id": "gz.widget", "note": "a cell"}],
        "accept": [],
        "bookruled": [],
        "placeholder": [],
        "overrides": [],
        "keep_retired": [],
        "printings": {},
    }


class FinalAnalysis(unittest.TestCase):
    """The final analysis lists."""

    def test_lists(self):
        l1, l1b, l2, opened = fa.lists(data())
        groups = sorted((x["group"], x["id"]) for x in l1)
        self.assertEqual(
            groups,
            [
                ("Commlink6-invented or house content", "bundle"),
                ("Commlink6-invented or house content", "range_9"),
                ("German-only books", "wurst"),
                ("German-rules duplicates", "dup"),
                ("no English name", "nameless"),
                ("other", "fan"),
                ("rule options", "std"),
            ],
        )
        self.assertEqual([(x["field"], x["cl6"]) for x in l1b], [("rating", "1-6")])
        cls = {(x["our_id"], x["field"]): x["class"] for x in l2}
        self.assertEqual(cls[("gz.widget", "avail")], "owner ruling")  # (the verdict wins over the keep)
        self.assertEqual(cls[("gz.widget", "cost")], "book prints ours")
        self.assertEqual(cls[("gz.gadget", "cost")], "errata")
        self.assertEqual(cls[("gz.widget", "variants")], "owner ruling")
        self.assertNotIn(("gz.widget", "source/name"), cls)  # (both relocations are list 1's records)
        what = sorted((x["what"], x["id"]) for x in opened)
        self.assertEqual(
            what,
            [
                ("Misc. (US) record one of our books prints by name (not in list 1)", "widget2"),
                ("keep row with no difference left", "gz.gadget"),
            ],
        )

    def test_check_reconciles(self):
        g = data() | {"jar": "x.jar", "ours": "runs", "printings_from": ""}
        l1, l1b, l2, opened = fa.lists(g)
        t = fa.totals(l1, l1b, l2, opened)
        text = "head\n" + fa.render(g, l1, l1b, l2, opened, t) + "\ntail\n"
        self.assertEqual(fa.check(text, t), (True, ["counts reconcile: ok"]))
        ok, lines = fa.check(text.replace("| `list 1: total` | 7 |", "| `list 1: total` | 8 |"), t)
        self.assertFalse(ok)
        self.assertEqual(lines, ["list 1: total: doc 8, recomputed 7"])

    def test_named_jar_missing_fails(self):
        # an explicit --jar that does not exist must fail, not skip: a typo would otherwise pass --check
        self.assertEqual(fa.main(["--check", "--jar", os.path.join(tempfile.gettempdir(), "no-such-cl6.jar")]), 2)

    def test_side_records(self):
        fd, path = tempfile.mkstemp(suffix=".jar")
        os.close(fd)
        with zipfile.ZipFile(path, "w") as z:
            z.writestr(reader.ROOT + "de_land/data/gear.xml", '<items><item id="wurst"/></items>')
            z.writestr(reader.ROOT + "de_land/i18n/de_land.properties", "item.wurst=Wurst\nitem.wurst.page=3\n")
            z.writestr(reader.ROOT + "other_us/data/empty.xml", "")
            z.writestr(reader.ROOT + "core/data/gear.xml", '<items><item id="zorp"/></items>')
        try:
            got = fa.side_records(path)
        finally:
            os.remove(path)
        self.assertEqual(
            [(x["book"], x["id"], x["name"], x["page"]) for x in got], [("de_land", "wurst", "Wurst", "3")]
        )


if __name__ == "__main__":
    unittest.main()
