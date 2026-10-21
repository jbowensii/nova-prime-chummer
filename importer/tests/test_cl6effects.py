"""tools/cl6effects: the evaluator's pure parts on a tiny fixture (no jar, no books, no import runs)."""

import os
import tempfile
import unittest

from tools.cl6effects import __main__ as replay
from tools.cl6effects import evaluate


def row(mod, kids):
    """A pair row holding the given mod and its kids."""
    mod = {"_ctx": "", "_sel": False, **mod}
    return {
        "siblings": [],
        "cl6": {"src": "crb", "tag": "item", "id": "x", "name": "X", "kind": "gear", "class": "", "mods": [mod]},
        "our": {"src": "crb", "kind": "gear", "id": "crb.x", "name": "X", "kids": kids},
    }


def eff(**a):
    """An effect element with the given attributes."""
    return {"_tag": "effect", **a}


class Evaluate(unittest.TestCase):
    """Evaluating our effects against CL6 mods."""

    MOD = {"_tag": "checkmod", "type": "SKILL", "ref": "athletics", "what": "DICE", "value": "2"}

    def test_values(self):
        self.assertEqual(evaluate.vcmp("2", "2"), "eq")
        self.assertEqual(evaluate.vcmp("2", "3"), "differ")
        self.assertEqual(evaluate.vcmp("2", ""), "blank")

    def test_match_miss_and_tally(self):
        ev = evaluate.eval_all(
            [
                row(self.MOD, [eff(target="skill:athletics", op="add", value="2")]),
                row(self.MOD, [eff(target="skill:athletics", op="add", value="5")]),
                row(self.MOD, []),
            ],
            {},
        )
        self.assertEqual([e["status"] for e in ev], ["match", "miss-value-or-kind", "miss-entry-has-no-effects"])
        t = evaluate.tally(ev)
        self.assertEqual(
            (len(t["var"]), len(t["ok"]), len(t["open"])), (3, 1, 2)
        )  # (none is in the book-ruled or placeholder lists)
        self.assertIn("parity: 1/3", "\n".join(evaluate.lines(t)))


class Replay(unittest.TestCase):
    """Replaying evaluations between two runs."""

    def test_differing_reports_only_changed_rows(self):
        def mk(status):
            return {
                "pair": ("crb", "x", "item"),
                "sig": "s",
                "value": "1",
                "bucket": "feature",
                "status": status,
                "final": status,
            }

        keep = {
            "pair": ("crb", "y", "item"),
            "sig": "s",
            "value": "1",
            "bucket": "feature",
            "status": "match",
            "final": "match",
        }
        d = replay.differing([mk("match"), keep], [mk("miss-value-or-kind"), keep])
        self.assertEqual([k[0] for k, _, _ in d], [("crb", "x", "item")])

    def test_entry_effects_reads_the_rebuilt_output(self):
        with tempfile.TemporaryDirectory() as out:
            d = os.path.join(out, "run1", "custom", "sr6", "imported", "crb")
            os.makedirs(d)
            with open(os.path.join(d, "gear.xml"), "w", encoding="utf-8") as f:
                f.write(
                    '<sr6:data>\n  <item id="crb.x">\n    <effect target="skill:athletics" op="add" value="2"/>\n'
                    "  </item>\n</sr6:data>\n"
                )
            self.assertEqual(replay.entry_effects(out, "crb", "gear", "x"), {("skill:athletics", "add", "2")})
            self.assertIsNone(replay.entry_effects(out, "crb", "gear", "nope"))


if __name__ == "__main__":
    unittest.main()
