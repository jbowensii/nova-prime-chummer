"""Recipe registry. A recipe module has ID, NAME, PUBLISHER, CANON, match(meta, md_head) -> 0..1 and
extract(md, ctx=None) -> Result, where ctx = {"previous_dir": custom/imported/<source>/ as the previous
import left it}. identify() picks the best match at or above THRESHOLD."""
from dataclasses import dataclass, field

THRESHOLD = 0.6


@dataclass
class Result:
    files: dict            # overlay file name -> XML text (ids unscoped; xmlio scopes them on write)
    texts: str | None      # kind="texts" XML (same unscoped ids) or None
    samples: list = field(default_factory=list)   # {"file", "xml", "name", "role", "page"}: sample runners
    report: list = field(default_factory=list)    # dict rows: what didn't match
    source: dict = field(default_factory=dict)    # {"id","name","publisher","canon"}
    core: dict = field(default_factory=dict)      # core file name -> XML (custom/imported/core/, ids unscoped): the CRB's
    core_texts: list = field(default_factory=list)  # (of, id, text) for the core files' entries (unscoped)
    npcs: list = field(default_factory=list)      # {"file", "xml", "name", "kind", "tier", "page"}: the book's NPCs


from importer.recipes import cg, crb, dhsa, pregens, qref  # noqa: E402  (recipes import Result from here)

RECIPES = [qref, dhsa, pregens, crb, cg]


def identify(meta, md_head):
    best, score = max(((m, m.match(meta, md_head)) for m in RECIPES), key=lambda x: x[1])
    return (best, score) if score >= THRESHOLD else (None, score)
