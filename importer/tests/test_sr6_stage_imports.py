"""The importer's modules share only public names: no `from importer… import _private` and no `<imported module>._private`
across modules (a private helper that another module needs is made public in the module that owns it). A package that is
one stage (importer/sr6/effects/, importer/sr6/overrides/) shares its private names among its own modules by relative
imports; the tests (white-box) are not checked."""
import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGES = {ROOT, ROOT / "sr6"}  # (the directories whose modules are separate stages: a relative import there crosses stages)


def crosses(n, where):
    """Whether the import node `n`, in a module of the directory `where`, reaches another stage's module."""
    if isinstance(n, ast.Import):
        return any(a.name.split(".")[0] == "importer" for a in n.names)
    return isinstance(n, ast.ImportFrom) and ((n.module or "").split(".")[0] == "importer" or n.level > 1 or bool(n.level and where in STAGES))


def private_imports(src, where):
    """The imports of private names, and the `<module>._private` reaches through a name such an import binds, in `src`, a
    module in the directory `where`, that cross a stage."""
    tree, out, names = ast.parse(src), [], set()
    for n in ast.walk(tree):
        if crosses(n, where):
            if isinstance(n, ast.ImportFrom):
                out += [f"{n.lineno} from {'.' * n.level}{n.module or ''} import {a.name}" for a in n.names if a.name.startswith("_") and a.name != "__version__"]
            names |= {a.asname or a.name.split(".")[0] for a in n.names}
    for n in ast.walk(tree):
        if isinstance(n, ast.Attribute) and n.attr.startswith("_") and not n.attr.startswith("__"):
            base = n.value
            while isinstance(base, ast.Attribute):
                base = base.value
            if isinstance(base, ast.Name) and base.id in names:
                out.append(f"{n.lineno} {ast.unparse(n)}")
    return sorted(out, key=lambda s: int(s.split()[0]))


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
        # (an attribute reach through an imported module: from-import, plain import, alias, a dotted chain, a function's own import)
        self.assertEqual(private_imports("from importer import xmlio\nxmlio._attrs({})\nxmlio.__name__\nxmlio.escape('')\n", ROOT / "ai"),
                         ["2 xmlio._attrs"])
        self.assertEqual(private_imports("import importer.xmlio\nimporter.xmlio._root('x')\n", ROOT), ["2 importer.xmlio._root"])
        self.assertEqual(private_imports("def f(b):\n    from importer.sr6 import regroup as rg\n    return rg._pline(b, 1)\n", ROOT / "sr6"),
                         ["3 rg._pline"])
        self.assertEqual(private_imports("from . import regroup\nregroup._pline('', 0)\n", ROOT / "sr6"), ["2 regroup._pline"])  # (a sibling stage's)
        self.assertEqual(private_imports("from . import words\nwords._slug('')\n", fx), [])  # (the package's own)
        self.assertEqual(private_imports("import re\nre._compile\nx = object()\nx._y\n", ROOT), [])  # (not the importer's modules)


if __name__ == "__main__":
    unittest.main()
