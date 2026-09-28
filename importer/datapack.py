"""Data packs: the core files (custom/imported/core/) as one zip, to give another server this app's core data without
the book. A pack never holds descriptions (texts/), PDFs or keys: only the 12 core files.

  export  datapack.xml (datapack.xsd: app version, date, each file's name, size and SHA-256) plus core/<name>.xml for
          each core file present; the manifest lists which.
  check   refuses anything but datapack.xml and core/<core file>.xml, an unsafe or oversized entry, a manifest that
          doesn't match the files (list, sizes, hashes), and a core file its schema refuses; returns the manifest and bytes.
  import  check, then the pack's files replace custom/imported/core/'s in one swap (all or none); files the pack
          doesn't hold are kept.
"""
import functools
import hashlib
import os
import shutil
import tempfile
import zipfile
import zlib
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import quoteattr

from lxml import etree

from importer import CORE_FILES, DATA_DIR, xmlio
from importer.backup import TEMP, _swap, app_version, unsafe_entry

MANIFEST = "datapack.xml"
NAMES = {f"core/{n}.xml" for n in CORE_FILES}
MAX_FILE = 16 * 1024 ** 2  # a core file; the real ones are well under 1 MB
MAX_MANIFEST = 64 * 1024
ITEMS = ("weapons", "armor")  # kinds items.xsd holds (tools/validate-data.mjs schemaFor)
PARSER = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)


class PackError(Exception):
    """A pack refused; the message says why in plain words."""


def _core(custom):
    return os.path.join(custom, "imported", "core")


def export(custom, out, version=None):
    """Write the pack of `custom`'s core files to `out` (atomically). Returns the manifest text."""
    core = _core(custom)
    recover(core)
    names = [f"{n}.xml" for n in CORE_FILES if os.path.isfile(os.path.join(core, f"{n}.xml"))]
    if not names:
        raise PackError("there is no core data to put in a pack. Import the core rulebook first")
    data = {n: Path(core, n).read_bytes() for n in names}
    rows = "".join(f'  <file name="{n}" bytes="{len(b)}" sha256="{hashlib.sha256(b).hexdigest()}"/>\n' for n, b in data.items())
    manifest = (xmlio.HEAD + f'<datapack format="1" app={quoteattr(app_version(version))} '
                f'created="{datetime.now(timezone.utc).isoformat(timespec="seconds")}">\n{rows}</datapack>\n')
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(out)), prefix=".datapack.", suffix=".tmp")
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr(MANIFEST, manifest)
            for n, b in data.items():
                zf.writestr(f"core/{n}", b)
        os.replace(tmp, out)
        return manifest
    except BaseException:
        os.unlink(tmp)
        raise


@functools.cache
def _schema(name):
    return etree.XMLSchema(etree.parse(os.path.join(DATA_DIR, "schema", f"{name}.xsd")))


def _parse(name, b):
    """The root of `b`, which must be UTF-8 (the app reads core files as UTF-8) with no DOCTYPE (checked on the parsed
    document, so no encoding hides one)."""
    try:
        b.decode("utf-8")
    except UnicodeDecodeError:
        raise PackError(f"{name} isn’t UTF-8, which every file the app writes is")
    try:
        el = etree.fromstring(b, PARSER)
    except etree.XMLSyntaxError as e:
        raise PackError(f"{name} isn’t readable XML ({e})")
    info = el.getroottree().docinfo
    if (info.encoding or "UTF-8").upper() not in ("UTF-8", "UTF8"):
        raise PackError(f"{name} isn’t UTF-8, which every file the app writes is")
    if info.doctype or info.internalDTD is not None:
        raise PackError(f"{name} has a DOCTYPE, which a data pack never does")
    return el


def _valid(name, root, schema):
    if not _schema(schema).validate(root):
        e = _schema(schema).error_log.last_error
        raise PackError(f"{name} doesn’t match its schema (line {e.line}: {e.message})")


def check(path):
    """(manifest root, {zip name: bytes}) of a safe, whole, valid pack; PackError with the reason otherwise."""
    try:
        zf = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as e:
        raise PackError(f"this isn’t a readable zip file ({e})")
    with zf:
        seen = []
        for info in zf.infolist():
            name = info.filename
            if name == "core/":
                continue
            if name != MANIFEST and name not in NAMES:
                raise PackError(f"the pack has a file a data pack can’t hold: {name} (only datapack.xml and the core files in core/)")
            problem = unsafe_entry(info)
            if problem:
                raise PackError(f"the pack {problem}: {name}")
            if name in seen:
                raise PackError(f"the pack has the same name twice: {name}")
            seen.append(name)
            if info.file_size > (MAX_MANIFEST if name == MANIFEST else MAX_FILE):
                raise PackError(f"{name} is too large for a data pack")
        if MANIFEST not in seen:
            raise PackError("the pack has no datapack.xml: it isn’t a data pack from this app")
        try:
            data = {n: zf.read(n) for n in seen}
        except (OSError, zipfile.BadZipFile, zlib.error, EOFError) as e:
            raise PackError(f"the pack couldn’t be unpacked ({type(e).__name__}: {e})")
    root = _parse(MANIFEST, data[MANIFEST])
    if root.tag != "datapack":
        raise PackError("datapack.xml isn’t a data pack manifest")
    _valid(MANIFEST, root, "datapack")
    listed = {f"core/{f.get('name')}": f for f in root.iter("file")}
    if set(listed) != set(data) - {MANIFEST}:
        raise PackError("datapack.xml doesn’t match the files in the pack")
    for name, f in listed.items():
        b = data[name]
        if int(f.get("bytes")) != len(b) or hashlib.sha256(b).hexdigest() != f.get("sha256"):
            raise PackError(f"{name} doesn’t match its size or hash in datapack.xml: it was changed or damaged")
        kind = name[5:-4]
        el = _parse(name, b)
        if el.tag != f"{{{xmlio.NS}}}data" or el.get("kind") != kind:
            raise PackError(f"{name} isn’t the {kind} table")
        _valid(name, el, "items" if kind in ITEMS else kind)
    return root, data


def recover(core):
    """Finish what a killed import left in core/: a .restore-old-* folder holds files the swap had moved aside before it
    committed, so they go back (a pack file that replaced nothing may stay: it passed the check); .restore-new-* and
    .restore-done-* folders are deleted."""
    if not os.path.isdir(core):
        return
    for n in sorted(os.listdir(core)):
        if n.startswith(TEMP + "old-"):
            old = os.path.join(core, n)
            for f in os.listdir(old):
                os.replace(os.path.join(old, f), os.path.join(core, f))
            os.rmdir(old)
    for n in os.listdir(core):
        if n.startswith(TEMP):
            shutil.rmtree(os.path.join(core, n), ignore_errors=True)


def import_pack(path, custom):
    """Check `path`, then swap its files into custom/imported/core/. Returns the file names written."""
    _, data = check(path)
    files = {n[5:]: b for n, b in data.items() if n != MANIFEST}
    core = _core(custom)
    os.makedirs(core, exist_ok=True)
    recover(core)  # a killed import's leftovers
    new = tempfile.mkdtemp(dir=core, prefix=TEMP + "new-")
    try:
        for n, b in files.items():
            with open(os.path.join(new, n), "wb") as f:
                f.write(b)
        _swap(core, new, keep=[n for n in os.listdir(core) if n not in files])  # only the pack's files change
    except BaseException:
        shutil.rmtree(new, ignore_errors=True)
        raise
    return sorted(files)
