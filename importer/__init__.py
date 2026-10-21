import contextlib
import os
import xml.etree.ElementTree as ET

# the shipped data (sources.xml, schema/): public/data in the repo, CA2_DATA_DIR in the image. In development it also
# holds the owner's local copies of the core files (gitignored).
DATA_DIR = os.environ.get("CA2_DATA_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "..", "public", "data"
)
# the rules engine's core files, built by the CRB import (custom/imported/core/) or loaded from a data pack
CORE_FILES = (
    "ampeffects",
    "amptypes",
    "armor",
    "attributes",
    "levels",
    "lifestyles",
    "metatypes",
    "packages",
    "pricing",
    "skills",
    "vehicles",
    "weapons",
)
_override, _custom = [], []


class NoCoreData(RuntimeError):
    pass


@contextlib.contextmanager
def use_core(path):
    """Read the core files from `path` meanwhile (the CRB recipe reads the ones it has just built)."""
    _override.append(path)
    try:
        yield
    finally:
        _override.pop()


@contextlib.contextmanager
def use_custom(path):
    """Take `path` as the custom folder meanwhile (the CLI's --custom)."""
    _custom.append(path)
    try:
        yield
    finally:
        _custom.pop()


def custom_dir():
    """The custom folder: use_custom's (the CLI's --custom), else CA2_CUSTOM_DIR (the server sets it), else None."""
    return (_custom[-1:] or [os.environ.get("CA2_CUSTOM_DIR")])[0] or None


def core_dir():
    """The folder with the core files: use_core's, else CA2_CORE_DIR, else <custom>/imported/core (loaded after
    public/data, so it wins), else DATA_DIR (the owner's local copies in development)."""
    custom = custom_dir()
    for d in (
        *_override[-1:],
        os.environ.get("CA2_CORE_DIR"),
        custom and os.path.join(custom, "imported", "core"),
        DATA_DIR,
    ):
        if d and os.path.isfile(os.path.join(d, "skills.xml")):
            return d
    raise NoCoreData("There is no core data yet: import the core rulebook first, or upload a data pack.")


def find_core_file(name):
    """`name` from the first core folder that has it (use_core's, CA2_CORE_DIR, <custom>/imported/core, DATA_DIR), or None."""
    custom = custom_dir()
    for d in (
        *_override[-1:],
        os.environ.get("CA2_CORE_DIR"),
        custom and os.path.join(custom, "imported", "core"),
        DATA_DIR,
    ):
        if d and os.path.isfile(os.path.join(d, name)):
            return os.path.join(d, name)
    return None


def core_file(name):
    return os.path.join(core_dir(), name)


def mechanics_roots(name):
    """The parsed core file `name` (skills.xml, amptypes.xml or ampeffects.xml), then the same kind from each imported
    book (custom/imported/<source>/<name>) in source order: what the books add to the core."""
    roots = [ET.parse(core_file(name)).getroot()]
    custom = custom_dir()
    base = custom and os.path.join(custom, "imported")
    if base and os.path.isdir(base) and not _override:
        for src in sorted(os.listdir(base)):
            path = os.path.join(base, src, name)
            if src != "core" and os.path.isfile(path):
                roots.append(ET.parse(path).getroot())
    return roots
