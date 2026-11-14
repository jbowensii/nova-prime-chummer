"""tools/cl6check/paths.py on invented paths."""

import unittest

from tools.cl6check import paths

BOOK = [
    {
        "id": "p",
        "steps": [
            {"nextSteps": ["b"], "modifications": [{"op": "add", "ref": "quality:Stone_Skin"}]},
            {
                "nextSteps": [],
                "modifications": [{"op": "remove", "ref": "quality:CHOICE"}, {"op": "add", "ref": "quality:gone"}],
            },
        ],
    }
]


class PathsCheck(unittest.TestCase):
    """counts, refs and the name-matching misses"""

    def test_counts(self):
        """paths, steps and nextSteps"""
        self.assertEqual(paths.counts(BOOK), (1, 2, 1))

    def test_misses(self):
        """a case/punctuation-insensitive hit resolves; an absent name is a miss; CHOICE is apart"""
        lost, choice = paths.misses({"x": BOOK}, {"stoneskin"})
        self.assertEqual(lost, {"gone": {"p"}})
        self.assertTrue(choice)


if __name__ == "__main__":
    unittest.main()
