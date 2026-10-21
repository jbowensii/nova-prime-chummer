"""The importer reads a book the same way in every process: a table holding rows of several kinds gets its categories
in one order whatever Python's string hash seed (catalog.ROW_KINDS is ordered). Invented names only."""

import os
import subprocess
import sys
import unittest

SCRIPT = """
from importer.sr6 import catalog, categories
c = catalog.Catalog("X", "x", "x")
c.tables[0] = {"title": "Zorp-Spec", "section": "Zorp-Spec", "page": 1, "product": None, "header": ["NAME"]}
for kind, name in (("weapons", "Zorp Sprayer"), ("gear", "Zorp Fuel"), ("armor", "Zorp Plate"), ("electronics", "Zorp Comm")):
    c.add(kind, name, 1, {"category": "zorp-spec"}, (), "")["tab"] = 0
categories.build(c, ["Zorp."], catalog.ROW_KINDS)
print(" ".join(e["id"] for e in c.entries["categories"]))
"""


def categories_under(seed):
    """The categories a fresh interpreter lists under hash seed `seed`."""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    env = {**os.environ, "PYTHONHASHSEED": str(seed)}
    return subprocess.run(
        [sys.executable, "-c", SCRIPT], cwd=root, env=env, capture_output=True, text=True, check=True
    ).stdout.split()


class HashSeedTest(unittest.TestCase):
    def test_categories_same_under_any_hash_seed(self):
        # (seeds 0 and 3 put a set of these kinds in different orders)
        first = categories_under(0)
        self.assertEqual(first, ["weapons.zorp-spec", "armor.zorp-spec", "electronics.zorp-spec", "gear.zorp-spec"])
        self.assertEqual(categories_under(3), first)


if __name__ == "__main__":
    unittest.main()
