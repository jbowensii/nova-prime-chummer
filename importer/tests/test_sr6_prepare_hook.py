"""run.py calls a recipe's prepare_md(markdown) before regroup; recipes that tidy their regrouped blocks keep a
different, private step. A recipe's prepare_md must take and return the book's markdown text (a mix-up crashed six
real imports in 0.9.2)."""

import inspect
import unittest

from importer.sr6.recipes import RECIPES


class PrepareHookTest(unittest.TestCase):
    def test_every_prepare_md_takes_and_returns_markdown(self):
        md = "# HEADING\n\nSome text.\n"
        for r in RECIPES:
            if hasattr(r, "prepare_md"):
                out = r.prepare_md(md)
                self.assertIsInstance(out, str, getattr(r, "ID", r))

    def test_no_recipe_exposes_a_bare_prepare_to_run(self):
        # run.py only looks for prepare_md; a module-level prepare() is a recipe's own block step
        src = inspect.getsource(__import__("importer.sr6.run", fromlist=["run"]))
        self.assertNotIn("recipe.prepare(", src)


if __name__ == "__main__":
    unittest.main()
