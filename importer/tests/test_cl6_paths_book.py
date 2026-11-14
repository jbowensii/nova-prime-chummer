"""cl6_paths.book_paths: printed paths Commlink6 lacks become linear book paths (invented data only)."""

import tempfile
import unittest
from pathlib import Path

from importer.sr6 import cl6_paths as P

QUALS = """<d>
<quality id="zz.alpha" group="Zed"><name>Step 1</name></quality>
<quality id="zz.beta" group="Zed"><name>Step 2</name></quality>
<quality id="zz.gamma"><name>Gamma</name><alias>Step One: Gamma</alias></quality>
<quality id="zz.delta"><name>Delta</name></quality>
<quality id="zz.zeta"><name>Zeta</name></quality>
</d>"""
PATHS = """<d>
<qualitypath id="zz.zed"><name>Zed</name><step>Step 1</step><step>Intro heading</step><step>Step 2</step></qualitypath>
<qualitypath id="zz.known"><name>Known Way</name><step>Step One: Gamma</step><step>Delta</step></qualitypath>
<qualitypath id="zz.far"><name>Far Off</name><step>Omega</step><step>Zeta</step></qualitypath>
<qualitypath id="zz.empty"><name>Empty</name><step>Nothing</step></qualitypath>
</d>"""


class BookPathsTest(unittest.TestCase):
    """The derivation."""

    def test_derives_linear_paths_and_skips_cl6_ones(self):
        """A path Commlink6 has (by steps) is skipped, an intro heading dropped, bare steps found by their group."""
        with tempfile.TemporaryDirectory() as d:
            src = Path(d, "imported", "zz")
            src.mkdir(parents=True)
            other = Path(d, "imported", "yy")
            other.mkdir()
            (other / "qualities.xml").write_text('<d><quality id="yy.omega"><name>Omega</name></quality></d>', "utf-8")
            (src / "qualities.xml").write_text(QUALS, encoding="utf-8")
            (src / "qualitypaths.xml").write_text(PATHS, encoding="utf-8")
            cl6 = {"b": [{"name": "Other Name", "steps": [{"name": "Gamma"}, {"name": "Delta"}]}]}
            got = P.book_paths(d, cl6)
            self.assertEqual([p["id"] for p in got], ["zz.zed", "zz.far"])
            self.assertEqual([s["id"] for s in got[1]["steps"]], ["yy.omega", "zz.zeta"])  # a step in another source
            p = got[0]
            self.assertEqual((p["origin"], p["bookKey"]), ("book", "zz"))
            self.assertEqual([s["id"] for s in p["steps"]], ["zz.alpha", "zz.beta"])
            self.assertEqual(p["steps"][0]["nextSteps"], ["zz.beta"])
            self.assertEqual(p["steps"][1]["nextSteps"], [])
            self.assertEqual(p["steps"][0]["modifications"], [{"op": "add", "ref": "quality:alpha"}])
            P.publish(d)
            self.assertTrue(Path(d, "paths", "book.json").is_file())


if __name__ == "__main__":
    unittest.main()
