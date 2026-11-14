"""cl6_paths.publish: every library paths.json lands in <custom>/paths/<book>.json."""

import json
import tempfile
import unittest
from pathlib import Path

from importer.sr6 import cl6_paths as P


class PublishTest(unittest.TestCase):
    """The published side-files."""

    def test_every_book_published(self):
        """All 6 books are copied byte-for-byte and parse as a list of paths."""
        with tempfile.TemporaryDirectory() as d:
            P.publish(d)
            for book in P.BOOKS:
                out = Path(d, "paths", f"{book}.json")
                src = Path(P.__file__).parent / "library" / book / "paths.json"
                self.assertEqual(out.read_bytes(), src.read_bytes(), book)
                self.assertIsInstance(json.loads(out.read_text(encoding="utf-8")), list)


if __name__ == "__main__":
    unittest.main()
