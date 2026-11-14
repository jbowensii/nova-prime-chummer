"""cl6_paths against a tiny invented jar, so the reader is covered where the real Commlink6 jar is absent (CI)."""

import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from importer.sr6 import cl6_paths

XML = """<qpaths>
 <qpath id="walk">
  <step id="start" level="1">
   <requires><datareq type="QUALITY" ref="x"/></requires>
   <modifications>
    <itemmod type="QUALITY" ref="gain"/>
    <itemmod type="QUALITY" ref="lose" remove="true"/>
    <valmod type="SKILL" ref="knowledge" value="1"/>
    <subOption id="extra"/>
   </modifications>
   <choices>
    <choice ref="pick" type="QUALITY" uuid="u1" options="a,b"/>
    <choice ref="kind" type="CRITTER" uuid="u2">
     <subOption id="dog"><modifications><valmod type="ATTR" ref="dependents" value="2"/></modifications></subOption>
    </choice>
   </choices>
   <nextSteps><next>accept</next><next>reject</next></nextSteps>
  </step>
  <step id="accept" level="2"/>
  <step id="reject" level="2"><nextSteps><next>start</next></nextSteps></step>
 </qpath>
</qpaths>"""

PROPS = "# comment\nqpath.walk=The Walk\nqpath.walk.step.start=First Step\n"


class FakeJarPaths(unittest.TestCase):
    """The reader walks an invented path graph."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()  # pylint: disable=consider-using-with
        self.jar = Path(self.tmp.name) / "fake.jar"
        base = "de/rpgframework/shadowrun6/data/demo/"
        with zipfile.ZipFile(self.jar, "w") as zf:
            zf.writestr(base + "data/quality_paths.xml", XML)
            zf.writestr(base + "i18n/demo.properties", PROPS)

    def tearDown(self):
        self.tmp.cleanup()

    def test_reads_graph(self):
        p = cl6_paths.read_book_paths("demo", self.jar)[0]
        self.assertEqual(p["name"], "The Walk")
        start = p["steps"][0]
        self.assertEqual((start["name"], start["level"]), ("First Step", 1))
        self.assertEqual(p["steps"][1]["name"], "accept")
        self.assertEqual(start["nextSteps"], ["accept", "reject"])
        self.assertIn('ref="x"', start["requires"][0])
        ops = [(m["op"], m["ref"]) for m in start["modifications"]]
        self.assertEqual(
            ops,
            [
                ("add", "quality:gain"),
                ("remove", "quality:lose"),
                ("valmod", "skill:knowledge"),
                ("choice", "pick"),
                ("choice", "kind"),
                ("subOption", "extra"),
            ],
        )
        self.assertEqual([o["ref"] for o in start["modifications"][3]["options"]], ["a", "b"])
        dog = start["modifications"][4]["options"][0]
        self.assertEqual(dog["modifications"][0]["value"], "2")
        self.assertEqual(cl6_paths.stats([p]), (1, 3, 1, 2))

    def test_no_i18n_and_write(self):
        with zipfile.ZipFile(self.jar, "w") as zf:
            zf.writestr("de/rpgframework/shadowrun6/data/demo/data/quality_paths.xml", XML)
        p = cl6_paths.read_book_paths("demo", self.jar)[0]
        self.assertEqual(p["name"], "walk")
        cl6_paths.write_canonical("demo", [p], self.tmp.name)
        out = json.loads((Path(self.tmp.name) / "demo" / "paths.json").read_text(encoding="utf-8"))
        self.assertEqual(out[0]["id"], "walk")


if __name__ == "__main__":
    unittest.main()
