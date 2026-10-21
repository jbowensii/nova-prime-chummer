"""The importer's stages share only public names: no `from importer… import _private` across modules (the SR6 stages; a private helper that
another stage needs is made public in the stage that owns it)."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SR6 = ROOT / "sr6"  # ponytail: the Anarchy side (backup/datapack/edits) still has 4 such imports; widen to ROOT when they are fixed


class StageImports(unittest.TestCase):
    def test_no_private_names_cross_modules(self):
        bad = []
        for f in SR6.rglob("*.py"):
            for n in ast.walk(ast.parse(f.read_text(encoding="utf-8"))):
                if isinstance(n, ast.ImportFrom) and (n.module or "").split(".")[0] == "importer":
                    bad += [f"{f.relative_to(ROOT)}:{n.lineno} {n.module}.{a.name}" for a in n.names if a.name.startswith("_") and a.name != "__version__"]
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
