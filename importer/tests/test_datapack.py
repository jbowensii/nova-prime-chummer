import contextlib
import hashlib
import io
import os
import shutil
import stat
import tempfile
import unittest
import unittest.mock
import zipfile
from pathlib import Path

from importer import datapack
from importer.__main__ import main
from importer.tests.test_run import MINI

CORE = os.path.join(MINI, "imported", "core")  # the made-up core files


def custom(names=None):
    """A custom folder holding the fixture's core files (`names`: only those)."""
    d = tempfile.mkdtemp()
    os.makedirs(os.path.join(d, "imported", "core"))
    for n in os.listdir(CORE) if names is None else names:
        shutil.copy(os.path.join(CORE, n), os.path.join(d, "imported", "core", n))
    return d


def pack(names=None):
    p = os.path.join(tempfile.mkdtemp(), "pack.zip")
    datapack.export(custom(names), p, version="9.9.9")
    return p


def rezip(src, change=None, extra=None, attrs=None):
    """A copy of pack `src` with entries changed ({name: bytes, or None to drop}), `extra` entries added and
    `attrs` ({name: external_attr}) set."""
    p = os.path.join(tempfile.mkdtemp(), "bad.zip")
    with zipfile.ZipFile(src) as zin, zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as zout:
        entries = {i.filename: zin.read(i) for i in zin.infolist()}
        entries.update(change or {})
        entries.update(extra or {})
        for name, data in entries.items():
            if data is None:
                continue
            info = zipfile.ZipInfo(name)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (attrs or {}).get(name, (stat.S_IFREG | 0o644) << 16)
            zout.writestr(info, data)
    return p


def manifest_for(files):
    """datapack.xml text listing `files` ({core name: bytes})."""
    rows = "".join(
        f'<file name="{n}" bytes="{len(b)}" sha256="{hashlib.sha256(b).hexdigest()}"/>' for n, b in files.items()
    )
    return f'<datapack format="1" app="t" created="2026-01-01T00:00:00+00:00">{rows}</datapack>'.encode()


def skills():
    return Path(CORE, "skills.xml").read_bytes()


class DataPackTest(unittest.TestCase):
    def assertRefused(self, path, why):
        with self.assertRaises(datapack.PackError) as e:
            datapack.check(path)
        self.assertIn(why, str(e.exception))

    def test_export_holds_the_manifest_and_the_core_files_only(self):
        p = pack()
        with zipfile.ZipFile(p) as zf:
            self.assertEqual(sorted(zf.namelist()), sorted(["datapack.xml"] + [f"core/{n}" for n in os.listdir(CORE)]))
        root, data = datapack.check(p)
        self.assertEqual((root.get("app"), len(root.findall("file"))), ("9.9.9", 12))
        self.assertEqual(data["core/skills.xml"], skills())

    def test_export_takes_only_the_core_files_present_and_refuses_none(self):
        d = custom(["skills.xml", "levels.xml"])
        Path(d, "imported", "core", "notes.xml").write_text("<notes/>")  # not a core file: never packed
        os.makedirs(os.path.join(d, "texts"))
        Path(d, "texts", "crb.xml").write_text("<texts>book text</texts>")
        p = os.path.join(d, "p.zip")
        datapack.export(d, p)
        with zipfile.ZipFile(p) as zf:
            self.assertEqual(sorted(zf.namelist()), ["core/levels.xml", "core/skills.xml", "datapack.xml"])
        self.assertEqual([f.get("name") for f in datapack.check(p)[0].iter("file")], ["levels.xml", "skills.xml"])
        with self.assertRaises(datapack.PackError):
            datapack.export(custom([]), p)

    def test_import_replaces_the_packs_files_and_keeps_the_rest(self):
        p = pack(["skills.xml", "levels.xml"])  # a partial pack
        d = custom()
        Path(d, "imported", "core", "skills.xml").write_text("old skills")
        Path(d, "imported", "core", "lifestyles.xml").write_text("kept lifestyles")
        os.makedirs(os.path.join(d, "texts"))
        Path(d, "texts", "crb.xml").write_text("descriptions")
        self.assertEqual(datapack.import_pack(p, d), ["levels.xml", "skills.xml"])
        core = os.path.join(d, "imported", "core")
        self.assertEqual(Path(core, "skills.xml").read_bytes(), skills())
        self.assertEqual(Path(core, "lifestyles.xml").read_text(), "kept lifestyles")
        self.assertEqual(Path(d, "texts", "crb.xml").read_text(), "descriptions")
        self.assertEqual(sorted(os.listdir(core)), sorted(os.listdir(CORE)))  # no temp folders left

    def test_import_into_a_server_without_core_data(self):
        d = tempfile.mkdtemp()
        datapack.import_pack(pack(), d)
        self.assertEqual(sorted(os.listdir(os.path.join(d, "imported", "core"))), sorted(os.listdir(CORE)))

    def test_import_is_all_or_nothing(self):
        d = custom()
        core = os.path.join(d, "imported", "core")
        before = {n: Path(core, n).read_bytes() for n in os.listdir(core)}
        Path(core, "skills.xml").write_text("old skills")
        before["skills.xml"] = b"old skills"
        real, calls = os.replace, []

        def flaky(a, b):
            calls.append(a)
            if len(calls) == 20:  # mid-way through moving the new files in
                raise OSError("disk trouble")
            return real(a, b)

        with unittest.mock.patch("importer.backup.os.replace", flaky), self.assertRaises(OSError):
            datapack.import_pack(pack(), d)
        self.assertEqual({n: Path(core, n).read_bytes() for n in os.listdir(core)}, before)

    def test_a_refused_pack_changes_nothing(self):
        d = custom()
        Path(d, "imported", "core", "skills.xml").write_text("old skills")
        with self.assertRaises(datapack.PackError):
            datapack.import_pack(rezip(pack(), extra={"core/../evil.xml": b"x"}), d)
        self.assertEqual(Path(d, "imported", "core", "skills.xml").read_text(), "old skills")

    def test_unsafe_names_are_refused(self):
        p = pack()
        for name in (
            "core/../skills.xml",
            "../core/skills.xml",
            "/core/skills.xml",
            "//server/share/core/skills.xml",
            "core\\skills.xml",
            "C:/core/skills.xml",
            "core/CON.xml",
            "CON",
            "core/skills.xml.",
            "Core/Skills.xml",
            "core/notes.xml",
            "texts/crb.xml",
            "library/book/original.pdf",
            "library/.config/ai-keys.xml",
            "core/sub/",
        ):
            with self.subTest(name=name):
                # Windows' zipfile reads a backslash as "/": then it's core/skills.xml twice
                self.assertRefused(
                    rezip(p, extra={name: b"<x/>"}),
                    "" if "\\" in name and os.sep == "\\" else "a file a data pack can’t hold",
                )

    def test_links_devices_encryption_and_bombs_are_refused(self):
        p = pack()
        self.assertRefused(rezip(p, attrs={"core/skills.xml": (stat.S_IFLNK | 0o777) << 16}), "symbolic link")
        self.assertRefused(rezip(p, attrs={"core/skills.xml": (stat.S_IFCHR | 0o600) << 16}), "device")
        bomb = rezip(p, change={"core/skills.xml": b"<a/>" + b" " * (3 * 1024**2)})
        self.assertRefused(bomb, "expands too much")
        enc = rezip(p)
        with zipfile.ZipFile(enc) as zf:
            offset = zf.getinfo("core/skills.xml").header_offset
        raw = bytearray(Path(enc).read_bytes())
        raw[offset + 6] |= 1  # the local header's flag bit, then the central directory's
        central = raw.rfind(b"PK\x01\x02", 0, raw.rfind(b"core/skills.xml"))
        raw[central + 8] |= 1
        Path(enc).write_bytes(raw)
        self.assertRefused(enc, "encrypted")

    def test_duplicates_sizes_and_bad_zips_are_refused(self):
        p = pack()
        dup = rezip(p)
        with zipfile.ZipFile(dup, "a") as zf, contextlib.redirect_stderr(io.StringIO()), unittest.mock.patch(
            "warnings.warn"
        ):
            zf.writestr("core/skills.xml", skills())
        self.assertRefused(dup, "the same name twice")
        big = b"<a>" + os.urandom(9 * 1024**2).hex().encode() + b"</a>"  # 18 MB that doesn't compress
        self.assertRefused(rezip(p, change={"core/skills.xml": big}), "too large")
        notzip = os.path.join(tempfile.mkdtemp(), "x.zip")
        Path(notzip).write_bytes(b"PK\x03\x04 not really")
        self.assertRefused(notzip, "isn’t a readable zip file")

    def test_manifest_problems_are_refused(self):
        p = pack(["skills.xml"])
        self.assertRefused(rezip(p, change={"datapack.xml": None}), "no datapack.xml")
        self.assertRefused(rezip(p, change={"datapack.xml": b"<backup/>"}), "isn’t a data pack manifest")
        self.assertRefused(rezip(p, change={"datapack.xml": b"<datapack format='1'"}), "isn’t readable XML")
        self.assertRefused(
            rezip(p, change={"datapack.xml": manifest_for({"skills.xml": skills()}).replace(b'format="1" ', b"")}),
            "doesn’t match its schema",
        )
        doctype = b'<!DOCTYPE d [<!ENTITY e "x">]>' + manifest_for({"skills.xml": skills()})
        self.assertRefused(rezip(p, change={"datapack.xml": doctype}), "DOCTYPE")
        # the list: a file it doesn't name, a file it names that isn't there
        self.assertRefused(
            rezip(p, extra={"core/levels.xml": Path(CORE, "levels.xml").read_bytes()}), "doesn’t match the files"
        )
        self.assertRefused(rezip(p, change={"core/skills.xml": None}), "doesn’t match the files")

    def test_hash_or_size_mismatch_is_refused(self):
        p = pack(["skills.xml"])
        changed = skills().replace(b"</ca2:data>", b"<!-- edited --></ca2:data>")
        self.assertRefused(rezip(p, change={"core/skills.xml": changed}), "doesn’t match its size or hash")
        same_size = skills().replace(b'version="1"', b'version="2"', 1)
        self.assertEqual(len(same_size), len(skills()))
        self.assertRefused(rezip(p, change={"core/skills.xml": same_size}), "doesn’t match its size or hash")

    def test_each_file_is_checked_against_its_schema(self):
        p = pack(["skills.xml"])

        def with_skills(b):
            return rezip(p, change={"core/skills.xml": b, "datapack.xml": manifest_for({"skills.xml": b})})

        self.assertIsNotNone(datapack.check(with_skills(skills()))[0])  # the helper itself makes a good pack
        bad = skills().replace(b"<skill ", b'<skill bogus="1" ', 1)
        self.assertRefused(with_skills(bad), "core/skills.xml doesn’t match its schema")
        other = Path(CORE, "levels.xml").read_bytes()
        self.assertRefused(with_skills(other), "core/skills.xml isn’t the skills table")
        self.assertRefused(with_skills(b"<ca2:data"), "isn’t readable XML")
        weapons = Path(CORE, "weapons.xml").read_bytes()  # items.xsd, as validate-data.mjs picks it
        good = rezip(
            p,
            change={
                "core/skills.xml": None,
                "core/weapons.xml": weapons,
                "datapack.xml": manifest_for({"weapons.xml": weapons}),
            },
        )
        self.assertEqual(datapack.check(good)[0].find("file").get("name"), "weapons.xml")

    def test_only_utf8_without_a_doctype(self):
        p = pack(["skills.xml"])

        def with_skills(b):
            return rezip(p, change={"core/skills.xml": b, "datapack.xml": manifest_for({"skills.xml": b})})

        body = skills().split(b"?>", 1)[1]
        utf16 = (
            '<?xml version="1.0" encoding="UTF-16"?>\n<!DOCTYPE x [<!ENTITY e "made up">]>' + body.decode("utf8")
        ).encode(
            "utf-16"
        )  # a BOM: no "<!DOCTYPE" in the raw bytes
        self.assertRefused(with_skills(utf16), "core/skills.xml isn’t UTF-8")
        self.assertRefused(
            with_skills(('<?xml version="1.0" encoding="UTF-16"?>' + body.decode("utf8")).encode("utf-16")),
            "isn’t UTF-8",
        )
        latin = b'<?xml version="1.0" encoding="ISO-8859-1"?>' + body  # ASCII bytes, but declared otherwise
        self.assertRefused(with_skills(latin), "isn’t UTF-8")
        self.assertRefused(with_skills(b'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE x>' + body), "has a DOCTYPE")
        m = manifest_for({"skills.xml": skills()})
        self.assertRefused(rezip(p, change={"datapack.xml": m.decode().encode("utf-16")}), "datapack.xml isn’t UTF-8")

    def test_a_killed_import_is_recovered_not_lost(self):
        d = custom()
        core = os.path.join(d, "imported", "core")
        originals = {n: Path(core, n).read_bytes() for n in os.listdir(core)}
        # killed mid-swap: two originals moved aside, one new file already in, the rest still staged
        old, new = os.path.join(core, ".restore-old-x"), os.path.join(core, ".restore-new-y")
        os.makedirs(old), os.makedirs(new)
        os.replace(os.path.join(core, "skills.xml"), os.path.join(old, "skills.xml"))
        os.replace(os.path.join(core, "levels.xml"), os.path.join(old, "levels.xml"))
        Path(core, "skills.xml").write_text("half-swapped new skills")
        Path(new, "levels.xml").write_text("staged")
        datapack.recover(core)  # as the next import, export or server start does
        self.assertEqual({n: Path(core, n).read_bytes() for n in os.listdir(core)}, originals)
        # killed after the commit, while deleting the old files: nothing is rolled back
        os.makedirs(os.path.join(core, ".restore-done-z"))
        Path(core, ".restore-done-z", "skills.xml").write_text("old, being deleted")
        self.assertEqual(main(["datapack", "recover", "--custom", d]), 0)
        self.assertEqual({n: Path(core, n).read_bytes() for n in os.listdir(core)}, originals)

    def test_cli(self):
        p, d = os.path.join(tempfile.mkdtemp(), "cli.zip"), custom()
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.assertEqual(main(["datapack", "export", "--custom", d, "--out", p, "--version", "1.2.3"]), 0)
            self.assertEqual(main(["datapack", "check", p]), 0)
            self.assertEqual(main(["datapack", "import", p, "--custom", tempfile.mkdtemp()]), 0)
            self.assertEqual(main(["datapack", "check", rezip(p, extra={"notes.txt": b"hi"})]), 3)
            self.assertEqual(main(["datapack", "export", "--custom", tempfile.mkdtemp(), "--out", p]), 3)
            self.assertEqual(main(["datapack", "import", p]), 2)
        self.assertIn('app="1.2.3"', out.getvalue())
        self.assertIn('<result state="imported" files="ampeffects.xml', out.getvalue())
        self.assertIn("a file a data pack can’t hold: notes.txt", err.getvalue())
        self.assertIn("no core data", err.getvalue())


if __name__ == "__main__":
    unittest.main()
