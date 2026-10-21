"""Recipe registry. A recipe module has ID, NAME, PUBLISHER, CANON, match(meta, md_head) -> 0..1 and
extract(md, ctx=None) -> Result, where ctx = {"previous_dir": custom/imported/<source>/ as the previous
import left it}. identify() picks the best match at or above THRESHOLD."""

from importer.core import Result  # noqa: F401  (the recipes' result: importer/core.py, shared with the SR6 stages)

THRESHOLD = 0.6


from importer.recipes import cg, crb, dhsa, pregens, qref  # noqa: E402  (recipes import Result from here)

RECIPES = [qref, dhsa, pregens, crb, cg]


def identify(meta, md_head):
    best, score = max(((m, m.match(meta, md_head)) for m in RECIPES), key=lambda x: x[1])
    return (best, score) if score >= THRESHOLD else (None, score)
