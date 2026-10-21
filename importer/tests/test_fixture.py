"""The made-up core fixture (tests/fixtures/mini/custom/imported/core) must stay made up: with the owner's local copies
present, no fixture file may share more than a small fraction of its (entry, attribute, value) triples with the real one.
Not counted: ids, sources, item kinds, a package's level and archetype, an effect's prerequisites, exclusions and params
(the app's vocabulary and structure), a range's attribute, and the value "0" and a range minimum of 1 (the absence of a
value and the scale's floor)."""

import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

from importer import CORE_FILES, DATA_DIR
from importer.tests import FIXTURE_CORE, LOCAL_CORE

MAX_SHARED = 0.2  # the fraction of a fixture file's triples that may equal the real file's
SKIP = ("id", "source", "kind", "level", "archetype", "requires", "excludes", "param", "gmApproval")


def triples(path):
    """{(entry id, key, value)}: every attribute but id and source, the name, and each child's attributes and text."""
    out = set()
    for e in ET.parse(path).getroot():
        i = e.get("id")
        out |= {(i, k, v) for k, v in e.attrib.items() if k not in SKIP and v != "0"}
        for c in e:
            if c.tag == "text":
                continue
            key = c.get("id") or c.get("attr") or c.tag
            out |= {
                (i, f"{c.tag} {key} {k}", v)
                for k, v in c.attrib.items()
                if k != "id" and v != "0" and not (c.tag == "range" and (k == "attr" or k == "min" and v == "1"))
            }
            if (c.text or "").strip():
                out.add((i, f"{c.tag} {key}", c.text.strip()))
    return out


@unittest.skipUnless(LOCAL_CORE, "the owner's local core copies are not present")
class FixtureIsMadeUpTest(unittest.TestCase):
    def test_no_fixture_file_reproduces_the_real_one(self):
        shares = {}
        for n in CORE_FILES:
            mine, real = triples(FIXTURE_CORE / f"{n}.xml"), triples(Path(DATA_DIR, f"{n}.xml"))
            shares[n] = round(len(mine & real) / len(mine), 3)
        self.assertEqual({n: s for n, s in shares.items() if s > MAX_SHARED}, {}, shares)


if __name__ == "__main__":
    unittest.main()
