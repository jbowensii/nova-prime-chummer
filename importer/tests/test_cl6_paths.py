"""importer/sr6/cl6_paths.py against the local Commlink6 1.15 jar (skipped if absent)."""

import os
import tempfile
import unittest

from importer.sr6 import cl6_paths as P

JAR = os.environ.get("CL6_JAR", r"C:\Users\johnb\CommLink6\app\stable\commlink6-1.15.0-complete.jar")
COUNTS = {
    "companion": (22, 29),
    "shadow_cast": (25, 17),
    "firing_squad": (12, 12),
    "dealers_of_death": (5, 7),
    "deus_ex_arcana": (6, 5),
    "hack_slash": (4, 3),
}


@unittest.skipUnless(os.path.exists(JAR), "CL6 jar not installed")
class PathsTest(unittest.TestCase):
    """Reader sanity."""

    def test_counts_and_write(self):
        """All 6 books parse, match step/next counts, and serialize."""
        for book, (steps, nexts) in COUNTS.items():
            paths = P.read_book_paths(book, JAR)
            self.assertEqual(sum(len(p["steps"]) for p in paths), steps, book)
            self.assertEqual(sum(len(s["nextSteps"]) for p in paths for s in p["steps"]), nexts, book)
            with tempfile.TemporaryDirectory() as d:
                P.write_canonical(book, paths, d)
                self.assertTrue(os.path.exists(os.path.join(d, book, "paths.json")))

    def test_mentor_spirit_loop(self):
        """first_interaction forks to accept/reject; reject loops back."""
        paths = P.read_book_paths("deus_ex_arcana", JAR)
        p = next(x for x in paths if x["id"] == "path_of_mentor_spirit")
        st = {s["id"]: s for s in p["steps"]}
        self.assertEqual(st["first_interaction"]["nextSteps"], ["accept", "reject"])
        self.assertIn("first_interaction", st["reject"]["nextSteps"])
        self.assertEqual(P.stats([p]), (1, 3, 1, 2))


if __name__ == "__main__":
    unittest.main()
