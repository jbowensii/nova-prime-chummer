"""The importer's modules share only public names: no `from importer… import _private` across modules (a private helper that another
module needs is made public in the module that owns it). A package that is one stage (importer/sr6/effects/) shares its private names
among its own modules by relative imports; the tests (white-box) are not checked."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGES = {ROOT, ROOT / "sr6"}  # (the directories whose modules are separate stages: a relative import there crosses stages)
# ponytail: imports only; `<module>._private` attribute reaches (xmlio._attrs, xmlio._root, regroup._pline) are not checked yet


def private_imports(src, where):
    """The imports of private names in `src`, a module in the directory `where`, that cross a stage."""
    out = []
    for n in ast.walk(ast.parse(src)):
        if isinstance(n, ast.ImportFrom) and ((n.module or "").split(".")[0] == "importer" or n.level > 1 or (n.level and where in STAGES)):
            out += [f"{n.lineno} from {'.' * n.level}{n.module or ''} import {a.name}" for a in n.names if a.name.startswith("_") and a.name != "__version__"]
    return out


class StageImports(unittest.TestCase):
    def test_no_private_names_cross_modules(self):
        bad = [f"{f.relative_to(ROOT)}:{r}" for f in sorted(ROOT.rglob("*.py")) if "tests" not in f.relative_to(ROOT).parts
               for r in private_imports(f.read_text(encoding="utf-8"), f.parent)]
        self.assertEqual(bad, [])

    def test_the_check_sees_each_form(self):  # (a check that finds nothing must still be able to find something)
        fx = ROOT / "sr6" / "effects"
        self.assertEqual(private_imports("from importer.backup import _x, y\n", ROOT), ["1 from importer.backup import _x"])
        self.assertEqual(private_imports("from .resolve import _z\n", ROOT / "sr6"), ["1 from .resolve import _z"])  # (a sibling stage's)
        self.assertEqual(private_imports("from .words import _slug\n", fx), [])  # (the package's own)
        self.assertEqual(private_imports("from ..resolve import _z\n", fx), ["1 from ..resolve import _z"])


if __name__ == "__main__":
    unittest.main()
