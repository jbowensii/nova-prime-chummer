"""SR6 recipe registry. A recipe module has ID, NAME, PUBLISHER, CANON, ALIASES, NAME_HEADERS, match(meta, md_head) -> 0..1
and extract(regrouped, ctx=None) -> importer.recipes.Result (files: <kind>.xml -> XML, ids unscoped; texts). identify()
picks the best match at or above THRESHOLD; a book none matches fails."""
from importer.recipes import Result  # noqa: F401  (the SR6 recipes return Anarchy's Result)
from importer.sr6.recipes import bn, crb, fs, swc, wl

THRESHOLD = 0.6
RECIPES = [crb, swc, fs, wl, bn]


def identify(meta, md_head):
    best, score = max(((m, m.match(meta, md_head)) for m in RECIPES), key=lambda x: x[1])
    return (best, score) if score >= THRESHOLD else (None, score)
