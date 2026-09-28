"""Backup and restore of the three data folders (characters, custom, library) as one zip.

  backup   characters/…, custom/…, library/… plus a backup.xml manifest (backup.xsd). library/.backups and
           temp files are skipped; library/.config/ai-keys.xml only with keys=True.
  check    refuses anything unsafe to extract (paths, links, bombs, a bad manifest); returns the manifest.
  apply    check, a safety backup of the current state to library/.backups (newest 3 kept), then each folder's
           contents are swapped for the zip's.

The folders are Docker volume mount points: they can't be renamed and a sibling folder sits on another
filesystem, so the new contents are extracted into a temp folder inside each target and swapped in by renames there.
"""
import json
import os
import re
import shutil
import stat
import tempfile
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from xml.sax.saxutils import quoteattr

from importer import xmlio

FOLDERS = ("characters", "custom", "library")
KEYS = "library/.config/ai-keys.xml"
MAX_TOTAL = 20 * 1024 ** 3
MAX_RATIO, RATIO_FROM = 200, 1024 ** 2  # zip-bomb guard: files over 1 MB may not expand more than 200 times
MAX_MANIFEST = 1024 ** 2
KEEP = 3
STAMP = re.compile(r"\d{8}T\d{6}_\d{6}Z\.zip")  # safety backups; other files in .backups are left alone
TEMP = ".restore-"  # apply's temp folders inside each target; never backed up


class RestoreError(Exception):
    """A zip refused by check; the message says why in plain words."""


def app_version(version=None):
    if version:
        return version
    try:
        with open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "package.json"), encoding="utf8") as f:
            return json.load(f).get("version") or "unknown"
    except (OSError, ValueError):
        return "unknown"


def _files(folder, root, keys):
    """(path, archive name) of every regular file to back up under `root`, sorted."""
    for dirpath, dirs, files in os.walk(root):
        rel = os.path.relpath(dirpath, root).replace(os.sep, "/")
        rel = "" if rel == "." else rel + "/"
        if not rel:
            dirs[:] = [d for d in dirs if not d.startswith(TEMP) and not (folder == "library" and d == ".backups")]
        dirs.sort()
        for f in sorted(files):
            path, name = os.path.join(dirpath, f), f"{folder}/{rel}{f}"
            if f.endswith(".tmp") or os.path.islink(path) or (name == KEYS and not keys):
                continue
            yield path, name


def backup(dirs, out, keys=False, version=None):
    """Write the zip of `dirs` ({folder: path}) to `out` (atomically, mode 600). Returns the manifest text."""
    counts = {}
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(os.path.abspath(out)), prefix=".backup.", suffix=".tmp")  # mode 600
    os.close(fd)
    try:
        with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED, allowZip64=True, strict_timestamps=False) as zf:
            for folder in FOLDERS:
                n = size = 0
                for path, name in _files(folder, dirs[folder], keys):
                    zf.write(path, name, zipfile.ZIP_STORED if name.lower().endswith(".pdf") else None)  # streamed in chunks
                    n, size = n + 1, size + zf.getinfo(name).file_size
                counts[folder] = (n, size)
            rows = "".join(f'  <folder name="{f}" files="{n}" bytes="{b}"/>\n' for f, (n, b) in counts.items())
            manifest = (xmlio.HEAD + f'<backup format="1" app={quoteattr(app_version(version))} '
                        f'created="{datetime.now(timezone.utc).isoformat(timespec="seconds")}" keys="{"yes" if keys else "no"}" '
                        f'files="{sum(n for n, _ in counts.values())}" bytes="{sum(b for _, b in counts.values())}">\n{rows}</backup>\n')
            zf.writestr("backup.xml", manifest)
        os.chmod(tmp, 0o600)
        os.replace(tmp, out)
        return manifest
    except BaseException:
        os.unlink(tmp)
        raise


def _entry_problem(info):
    name = info.filename
    kind = stat.S_IFMT(info.external_attr >> 16)
    if kind == stat.S_IFLNK:
        return "has a symbolic link"
    if kind not in (0, stat.S_IFREG, stat.S_IFDIR):
        return "has a device or special file"
    if name.startswith("/") or "\\" in name or ":" in name or "\0" in name:
        return "has an absolute or Windows-style path"
    parts = name[:-1].split("/") if name.endswith("/") else name.split("/")
    if any(p in ("", ".", "..") for p in parts):
        return "has a path with .. or an empty part"
    if name != "backup.xml" and (parts[0] not in FOLDERS or (len(parts) == 1 and not name.endswith("/"))):
        return "has files outside characters/, custom/ and library/"
    if parts[:2] == ["library", ".backups"]:
        return "has library/.backups"
    if info.flag_bits & 1:
        return "has encrypted files"
    if info.file_size > RATIO_FROM and (info.compress_size == 0 or info.file_size / info.compress_size > MAX_RATIO):
        return "has a file that expands too much (a zip bomb?)"
    return None


def check(path):
    """The manifest root of a safe backup zip; RestoreError with the reason otherwise."""
    try:
        zf = zipfile.ZipFile(path)
    except (OSError, zipfile.BadZipFile) as e:
        raise RestoreError(f"this isn’t a readable zip file ({e})")
    with zf:
        infos, names, total = zf.infolist(), set(), 0
        counts = {f: [0, 0] for f in FOLDERS}
        for info in infos:
            problem = _entry_problem(info)
            if problem:
                raise RestoreError(f"the zip {problem}: {info.filename}")
            if info.filename in names:
                raise RestoreError(f"the zip has the same file twice: {info.filename}")
            names.add(info.filename)
            total += info.file_size
            if not info.is_dir() and info.filename != "backup.xml":
                c = counts[info.filename.split("/", 1)[0]]
                c[0], c[1] = c[0] + 1, c[1] + info.file_size
        if total > MAX_TOTAL:
            raise RestoreError("the zip unpacks to more than 20 GB")
        if "backup.xml" not in names:
            raise RestoreError("the zip has no backup.xml: it isn’t a backup from this app")
        info = zf.getinfo("backup.xml")
        if info.file_size > MAX_MANIFEST:
            raise RestoreError("backup.xml is too large")
        try:
            root = ET.fromstring(zf.read(info))
        except (ET.ParseError, zipfile.BadZipFile, ValueError) as e:
            raise RestoreError(f"backup.xml can’t be read ({e})")
        _check_manifest(root, counts, KEYS in names)
    return root


def _check_manifest(root, counts, has_keys):
    bad = RestoreError("backup.xml isn’t a valid backup manifest")
    if root.tag != "backup" or root.get("format") != "1" or not root.get("app") or root.get("keys") not in ("yes", "no"):
        raise bad
    try:
        datetime.fromisoformat(root.get("created") or "")
        got = {f.get("name"): [int(f.get("files")), int(f.get("bytes"))] for f in root.findall("folder")}
        int(root.get("files")), int(root.get("bytes"))
    except (TypeError, ValueError):
        raise bad
    if len(root) != 3 or got != counts:
        raise RestoreError("backup.xml doesn’t match the files in the zip")
    if has_keys and root.get("keys") != "yes":
        raise RestoreError("the zip has API keys its backup.xml doesn’t list")


def _swap(target, new):
    """Move `target`'s contents aside, `new`'s in, then delete the old ones; on a failure put the old ones back.
    library/.backups and `new` itself stay."""
    old = tempfile.mkdtemp(dir=target, prefix=TEMP + "old-")
    stay = {os.path.basename(old), os.path.basename(new), ".backups"}
    moved, came = [], []
    try:
        for n in os.listdir(target):
            if n not in stay:
                os.replace(os.path.join(target, n), os.path.join(old, n))
                moved.append(n)
        for n in os.listdir(new):
            os.replace(os.path.join(new, n), os.path.join(target, n))
            came.append(n)
    except BaseException:
        for n in reversed(came):  # what came in from new goes back, then the old contents return
            os.replace(os.path.join(target, n), os.path.join(new, n))
        for n in reversed(moved):
            os.replace(os.path.join(old, n), os.path.join(target, n))
        os.rmdir(old)
        raise
    os.rmdir(new)
    shutil.rmtree(old, ignore_errors=True)


def apply(path, dirs, version=None):
    """Restore `path` over `dirs` ({folder: path}); returns the safety backup's path."""
    check(path)
    backups = os.path.join(dirs["library"], ".backups")
    os.makedirs(backups, exist_ok=True)
    safety = os.path.join(backups, datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S_%fZ") + ".zip")
    backup(dirs, safety, keys=True, version=version)  # never leaves the server, so keys included
    news = {}
    try:
        with zipfile.ZipFile(path) as zf:
            has_keys = KEYS in zf.namelist()
            for folder in FOLDERS:
                os.makedirs(dirs[folder], exist_ok=True)
                news[folder] = new = tempfile.mkdtemp(dir=dirs[folder], prefix=TEMP + "new-")
                for info in zf.infolist():
                    if not info.filename.startswith(folder + "/"):
                        continue
                    dst = os.path.join(new, *info.filename[len(folder) + 1:].split("/"))
                    if info.is_dir():
                        os.makedirs(dst, exist_ok=True)
                        continue
                    os.makedirs(os.path.dirname(dst), exist_ok=True)
                    with zf.open(info) as src, open(dst, "wb") as out:
                        shutil.copyfileobj(src, out, 1024 * 1024)
        keys = os.path.join(news["library"], ".config", "ai-keys.xml")
        old_keys = os.path.join(dirs["library"], ".config", "ai-keys.xml")
        if not has_keys and os.path.exists(old_keys):  # a backup without keys keeps the server's keys
            os.makedirs(os.path.dirname(keys), exist_ok=True)
            shutil.copy2(old_keys, keys)
        if os.path.exists(keys):
            os.chmod(keys, 0o600)
        # ponytail: the zip is closed before the swap (Windows can't move a folder holding an open file, and the
        # applied zip may itself sit in library/.backups); a killed process can leave a folder half swapped
        # (its old files in .restore-old-*); the safety backup covers that.
        for folder in FOLDERS:
            _swap(dirs[folder], news.pop(folder))
    finally:
        for new in news.values():
            shutil.rmtree(new, ignore_errors=True)
    for old in sorted(n for n in os.listdir(backups) if STAMP.fullmatch(n))[:-KEEP]:
        os.remove(os.path.join(backups, old))
    return safety

