"""The importer's tests read the made-up core files (tests/fixtures/mini/custom/imported/core) and what the made-up books
there add, never the owner's local copies in public/data: tests that need the real core data use `local_core()` and skip
without it (LOCAL_CORE)."""

import os
from pathlib import Path

from importer import CORE_FILES, DATA_DIR, use_core

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_CORE = ROOT / "tests" / "fixtures" / "mini" / "custom" / "imported" / "core"
os.environ["CA2_CORE_DIR"] = str(FIXTURE_CORE)
# what the made-up books add to the core (Tasking, Emerged, implant grades, a specialization), as a server's custom/ would
os.environ["CA2_CUSTOM_DIR"] = str(FIXTURE_CORE.parents[1])
# the owner's local copies of the core files: the answer key
LOCAL_CORE = all(Path(DATA_DIR, f"{n}.xml").exists() for n in CORE_FILES)


def local_core():
    """Read the owner's local core copies meanwhile (only in tests skipped without LOCAL_CORE)."""
    return use_core(DATA_DIR)
