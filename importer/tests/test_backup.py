import contextlib
import io
import os
import stat
import tempfile
import unittest
import unittest.mock
import zipfile
from pathlib import Path

from importer import backup
from importer.__main__ import main
from importer.tests.test_run import SCHEMA, XSD_CHECK, node


def state(root, extra=""):
    """Three made-up data folders under `root`; returns {folder: path}."""
    dirs = {f: os.path.join(root, f) for f in backup.FOLDERS}
    files = {
        "characters/runner-1.xml": f"<runner>Ghost{extra}</runner>",
        "characters/.trash/old.xml": "<runner>Gone</runner>",
        "custom/index.xml": "<overlays/>",
        "custom/edits/edits.xml": f"<edits>{extra}</edits>",
        "library/book-1/original.pdf": "%PDF-1.4 made up " * 100,
        "library/book-1/book.md": f"# Made-up book{extra}",
        "library/book-1/status.xml": '<status state="done"/>',
        "library/.config/ai-providers.xml": "<aiproviders/>",
        "library/.config/ai-keys.xml": f"<aikeys>secret{extra}</aikeys>",
        "library/.backups/19990101T000000_000000Z.zip": "not really",
        "custom/edits/edits.xml.tmp": "half written",
    }
    for name, text in files.items():
        p = os.path.join(root, *name.split("/"))
        os.makedirs(os.path.dirname(p), exist_ok=True)
        Path(p).write_text(text, encoding="utf8")
    return dirs


def tree(dirs):
    """{archive-style name: text} of every file, library/.backups excluded."""
    out = {}
    for f, d in dirs.items():
        for dp, ds, fs in os.walk(d):
            ds[:] = [x for x in ds if x != ".backups"]
            for n in fs:
                p = os.path.join(dp, n)
                out[f + "/" + os.path.relpath(p, d).replace(os.sep, "/")] = Path(p).read_text(encoding="utf8")
    return out


def bad_zip(entries, manifest=True, attrs=None):
    """A zip with `entries` ({name: bytes}); `attrs` {name: external_attr}; a matching manifest unless False."""
    p = os.path.join(tempfile.mkdtemp(), "bad.zip")
    with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in entries.items():
            info = zipfile.ZipInfo(name)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (attrs or {}).get(name, (stat.S_IFREG | 0o644) << 16)
            zf.writestr(info, data)
        if manifest:
            zf.writestr("backup.xml", manifest if isinstance(manifest, str) else
                        '<backup format="1" app="t" created="2026-01-01T00:00:00+00:00" keys="no" files="0" bytes="0">'
                        '<folder name="characters" files="0" bytes="0"/><folder name="custom" files="0" bytes="0"/>'
                        '<folder name="library" files="0" bytes="0"/></backup>')
    return p


class BackupTest(unittest.TestCase):
    def test_a_swaps_temp_folders_never_travel_in_a_backup(self):
        """A backup made while a data pack swaps would carry core/.restore-old-*; restored, `recover` would put those stale
        tables back over the live ones. The backup skips them at any depth, and check refuses a zip that has them."""
        from importer import datapack
        root = tempfile.mkdtemp()
        dirs = state(root)
        core = os.path.join(dirs["custom"], "imported", "core")
        os.makedirs(os.path.join(core, ".restore-old-abc"))
        Path(core, "skills.xml").write_text("current")
        Path(core, ".restore-old-abc", "skills.xml").write_text("STALE")
        out = os.path.join(root, "b.zip")
        backup.backup(dirs, out)
        with zipfile.ZipFile(out) as zf:
            self.assertIn("custom/imported/core/skills.xml", zf.namelist())
            self.assertFalse([n for n in zf.namelist() if ".restore-" in n])
        backup.check(out)
        restored = {f: os.path.join(root, "restored", f) for f in backup.FOLDERS}
        backup.apply(out, restored)
        datapack.recover(os.path.join(restored["custom"], "imported", "core"))
        self.assertEqual(Path(restored["custom"], "imported", "core", "skills.xml").read_text(), "current")
        planted = bad_zip({"custom/imported/core/.restore-old-abc/skills.xml": b"STALE"})
        with self.assertRaises(backup.RestoreError) as e:
            backup.check(planted)
        self.assertIn(".restore-", str(e.exception))

    def test_contents_without_and_with_keys(self):
        root = tempfile.mkdtemp()
        dirs = state(root)
        for never in ("sessions.xml", "reset.xml"):  # session hashes and a recovery code's hash: never backed up
            Path(dirs["library"], ".config", never).write_text("<x/>", encoding="utf8")
        out = os.path.join(root, "b.zip")
        backup.backup(dirs, out, version="9.9.9")
        with zipfile.ZipFile(out) as zf:
            names = set(zf.namelist())
            self.assertIn("library/book-1/original.pdf", names)
            self.assertEqual(zf.getinfo("library/book-1/original.pdf").compress_type, zipfile.ZIP_STORED)
            self.assertIn("characters/.trash/old.xml", names)
            self.assertIn("library/.config/ai-providers.xml", names)
            self.assertNotIn(backup.KEYS, names)
            self.assertFalse(names & backup.NEVER)
            self.assertFalse([n for n in names if ".backups" in n or n.endswith(".tmp")])
        m = backup.check(out)
        self.assertEqual((m.get("app"), m.get("keys"), m.get("files")), ("9.9.9", "no", str(len(names) - 1)))
        r = node("--input-type=module", "-e", XSD_CHECK, self._manifest(out), os.path.join(SCHEMA, "backup.xsd"),
                 os.path.join(SCHEMA, "common.xsd"))
        self.assertEqual(r.returncode, 0, r.stderr)

        self.assertEqual(main(["backup", "--characters", dirs["characters"], "--custom", dirs["custom"],
                               "--library", dirs["library"], "--out", out, "--keys"]), 0)
        with zipfile.ZipFile(out) as zf:
            self.assertEqual(zf.read(backup.KEYS), b"<aikeys>secret</aikeys>")
        self.assertEqual(backup.check(out).get("keys"), "yes")
        self.assertEqual(backup.check(out).get("app"), backup.app_version())  # package.json's version
        self.assertEqual(os.listdir(root).count("b.zip"), 1)
        self.assertFalse([n for n in os.listdir(root) if n.endswith(".tmp")])

    def _manifest(self, zip_path):
        p = os.path.join(tempfile.mkdtemp(), "backup.xml")
        with zipfile.ZipFile(zip_path) as zf:
            Path(p).write_bytes(zf.read("backup.xml"))
        return p

    def test_unsafe_zips_are_refused(self):
        ok = bad_zip({})
        backup.check(ok)  # the empty, well-formed backup passes
        link = (stat.S_IFLNK | 0o777) << 16
        cases = {
            "absolute": bad_zip({"/etc/passwd": b"x"}),
            "drive": bad_zip({"C:/x.xml": b"x"}),
            "dotdot": bad_zip({"characters/../../x.xml": b"x"}),
            "backslash": bad_zip({"characters\\x.xml": b"x"}),
            "symlink": bad_zip({"characters/l": b"/etc/passwd"}, attrs={"characters/l": link}),
            "device": bad_zip({"characters/d": b""}, attrs={"characters/d": (stat.S_IFCHR | 0o644) << 16}),
            "outside": bad_zip({"other/x.xml": b"x"}),
            "top-file": bad_zip({"characters": b"x"}),
            "backups": bad_zip({"library/.backups/x.zip": b"x"}),
            "bomb": bad_zip({"custom/big.xml": b"\0" * (3 * 1024 * 1024)}),
            "no manifest": bad_zip({}, manifest=False),
            "bad manifest": bad_zip({}, manifest="<backup>"),
            "wrong manifest": bad_zip({}, manifest="<other/>"),
            "counts": bad_zip({"characters/x.xml": b"x"}),
            "not a zip": os.path.join(tempfile.mkdtemp(), "x.zip"),
            "file and folder": bad_zip({"characters/a": b"x", "characters/a/b": b"y"}),
            "folder entry and file": bad_zip({"characters/a/": b"", "characters/a/b": b"y", "characters/A": b"x"}),
            "case duplicate": bad_zip({"characters/A.xml": b"x", "characters/a.xml": b"y"}),
            "keys folder": bad_zip({backup.KEYS + "/": b""}),
            "keys under a file": bad_zip({"library/.config": b"x"}),
            "control character": bad_zip({"characters/a\nb.xml": b"x"}),
            "reserved name": bad_zip({"characters/con.xml": b"x"}),
            "trailing dot": bad_zip({"characters/.../x.xml": b"x"}),
            "trailing space": bad_zip({"characters/.. /x.xml": b"x"}),
            "forbidden character": bad_zip({"characters/a?.xml": b"x"}),
        }
        Path(cases["not a zip"]).write_text("hello")
        dup = bad_zip({"characters/x.xml": b"x"})
        with zipfile.ZipFile(dup, "a") as zf, self.assertWarns(UserWarning):
            zf.writestr("characters/x.xml", b"y")
        cases["duplicate"] = dup
        for why, p in cases.items():
            with self.subTest(why):
                with self.assertRaises(backup.RestoreError):
                    backup.check(p)
                err = io.StringIO()
                with contextlib.redirect_stderr(err), contextlib.redirect_stdout(io.StringIO()):
                    self.assertEqual(main(["restore", "--check", p]), 3)
                self.assertTrue(err.getvalue().strip())

    def test_entry_limit(self):
        with unittest.mock.patch("importer.backup.MAX_ENTRIES", 2), self.assertRaisesRegex(backup.RestoreError, "more than"):
            backup.check(bad_zip({"characters/a": b"x", "characters/b": b"y"}))

    def test_total_size_limit(self):
        with unittest.mock.patch("importer.backup.MAX_TOTAL", 1000), self.assertRaisesRegex(backup.RestoreError, "20 GB"):
            backup.check(bad_zip({"characters/x.xml": b"x" * 2000}))

    def test_check_prints_the_manifest(self):
        root = tempfile.mkdtemp()
        out = os.path.join(root, "b.zip")
        backup.backup(state(root), out, version="1.0")
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            self.assertEqual(main(["restore", "--check", out]), 0)
        self.assertIn('app="1.0"', buf.getvalue())
        self.assertIn('<folder name="library"', buf.getvalue())

    def test_apply_replaces_all_folders_writes_a_safety_backup_and_rolls_back(self):
        src_root, dst_root = tempfile.mkdtemp(), tempfile.mkdtemp()
        src, dst = state(src_root, " new"), state(dst_root, " old")
        Path(dst["characters"], "only-old.xml").write_text("<runner/>", encoding="utf8")
        before = tree(dst)
        new_zip = os.path.join(src_root, "new.zip")
        backup.backup(src, new_zip, keys=True)
        args = ["--characters", dst["characters"], "--custom", dst["custom"], "--library", dst["library"]]
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(main(["restore", "--apply", new_zip, *args]), 0)
        after = tree(dst)
        self.assertEqual(after, {k: v for k, v in tree(src).items() if not k.endswith(".tmp")})
        self.assertNotIn("characters/only-old.xml", after)
        self.assertFalse([n for d in dst.values() for n in os.listdir(d) if n.startswith(backup.TEMP)])
        if os.name != "nt":
            self.assertEqual(stat.S_IMODE(os.stat(os.path.join(dst["library"], ".config", "ai-keys.xml")).st_mode), 0o600)

        backups = os.path.join(dst["library"], ".backups")
        safety = sorted(n for n in os.listdir(backups) if backup.STAMP.fullmatch(n))[-1]
        self.assertEqual(backup.check(os.path.join(backups, safety)).get("keys"), "yes")
        # rollback: applying the safety backup brings the old state back (the .tmp file was never backed up)
        backup.apply(os.path.join(backups, safety), dst)
        self.assertEqual(tree(dst), {k: v for k, v in before.items() if not k.endswith(".tmp")})
        self.assertIn("19990101T000000_000000Z.zip", os.listdir(backups))

    def test_keys_kept_when_the_zip_has_none(self):
        src_root, dst_root = tempfile.mkdtemp(), tempfile.mkdtemp()
        src, dst = state(src_root, " new"), state(dst_root, " old")
        z = os.path.join(src_root, "nokeys.zip")
        backup.backup(src, z)
        backup.apply(z, dst)
        self.assertEqual(Path(dst["library"], ".config", "ai-keys.xml").read_text(encoding="utf8"), "<aikeys>secret old</aikeys>")
        self.assertEqual(Path(dst["library"], ".config", "ai-providers.xml").read_text(encoding="utf8"), "<aiproviders/>")
        self.assertEqual(Path(dst["characters"], "runner-1.xml").read_text(encoding="utf8"), "<runner>Ghost new</runner>")

    def test_kept_keys_never_follow_a_restored_address(self):
        """A keyless backup whose settings send a provider elsewhere: that provider's key is dropped, the others stay
        (the rule saving settings keeps: a key only goes to the address it was entered for)."""
        from importer.ai import providers
        src_root, dst_root = tempfile.mkdtemp(), tempfile.mkdtemp()
        src, dst = state(src_root), state(dst_root)
        row = lambda p, url: f'<provider id="{p}" enabled="true" baseUrl="{url}"/>'  # noqa: E731
        settings = lambda *rows: f'<ca2:aiproviders xmlns:ca2="{providers.NS}" version="1">{"".join(rows)}</ca2:aiproviders>'  # noqa: E731
        Path(src["library"], ".config", "ai-providers.xml").write_text(
            settings(row("openai", "https://evil.example/v1"), row("gemini", "https://g.example")), encoding="utf8")
        cfg = os.path.join(dst["library"], ".config")
        Path(cfg, "ai-providers.xml").write_text(
            settings(row("openai", "https://api.openai.com/v1"), row("gemini", "https://g.example")), encoding="utf8")
        os.remove(os.path.join(cfg, "ai-keys.xml"))
        for p, k in (("openai", "sk-openai-KEPT"), ("gemini", "gm-KEPT"), ("anthropic", "sk-ant-KEPT")):
            providers.set_key(cfg, p, k)
        z = os.path.join(src_root, "nokeys.zip")
        backup.backup(src, z)
        backup.apply(z, dst)
        self.assertIn("evil.example", providers.read_providers(cfg)[1]["openai"]["baseUrl"])
        self.assertIsNone(providers.read_key(cfg, "openai"))
        self.assertEqual((providers.read_key(cfg, "gemini"), providers.read_key(cfg, "anthropic")), ("gm-KEPT", "sk-ant-KEPT"))
        # settings that can't be read send nothing anywhere a key was entered for: every kept key goes
        Path(src["library"], ".config", "ai-providers.xml").write_text("<not closed", encoding="utf8")
        backup.backup(src, z)
        backup.apply(z, dst)
        self.assertEqual([p for p in providers.PROVIDER_IDS if providers.read_key(cfg, p)], [])

    def test_backups_pruned_to_three(self):
        src_root, dst_root = tempfile.mkdtemp(), tempfile.mkdtemp()
        src, dst = state(src_root), state(dst_root)
        z = os.path.join(src_root, "b.zip")
        backup.backup(src, z)
        for _ in range(5):
            backup.apply(z, dst)
        names = os.listdir(os.path.join(dst["library"], ".backups"))
        self.assertEqual(len([n for n in names if backup.STAMP.fullmatch(n)]), 3)

    def _corrupt_zip(self):
        """Passes check (the headers are fine) but its data fails the CRC when unpacked."""
        p = bad_zip({"characters/x.xml": b"hello"}, manifest=False)
        with zipfile.ZipFile(p, "a") as zf:
            zf.writestr("backup.xml", '<backup format="1" app="t" created="2026-01-01T00:00:00+00:00" keys="no" files="1" '
                        'bytes="5"><folder name="characters" files="1" bytes="5"/><folder name="custom" files="0" bytes="0"/>'
                        '<folder name="library" files="0" bytes="0"/></backup>')
        raw = bytearray(Path(p).read_bytes())
        raw[raw.find(b"PK") + 16] ^= 0xFF  # the first central-directory entry's CRC
        Path(p).write_bytes(raw)
        return p

    def test_unpack_failure_is_refused_and_changes_nothing(self):
        dst = state(tempfile.mkdtemp())
        before = tree(dst)
        p = self._corrupt_zip()
        backup.check(p)
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            self.assertEqual(main(["restore", "--apply", p, *[a for f in backup.FOLDERS for a in ("--" + f, dst[f])]]), 3)
        self.assertIn("nothing was changed", err.getvalue())
        self.assertEqual(tree(dst), before)
        self.assertFalse([n for d in dst.values() for n in os.listdir(d) if n.startswith(backup.TEMP)])

    def test_failed_applies_keep_at_most_three_safety_backups(self):
        dst = state(tempfile.mkdtemp())
        p = self._corrupt_zip()
        for _ in range(4):
            with self.assertRaises(backup.RestoreError):
                backup.apply(p, dst)
        self.assertEqual(len([n for n in os.listdir(os.path.join(dst["library"], ".backups")) if backup.STAMP.fullmatch(n)]), 3)

    def test_backups_folder_outside_library_is_ordinary(self):
        src_root, dst_root = tempfile.mkdtemp(), tempfile.mkdtemp()
        src, dst = state(src_root), state(dst_root)
        for d in (src, dst):
            os.makedirs(os.path.join(d["characters"], ".backups"))
        Path(src["characters"], ".backups", "new.xml").write_text("new", encoding="utf8")
        Path(dst["characters"], ".backups", "old.xml").write_text("old", encoding="utf8")
        z = os.path.join(src_root, "b.zip")
        backup.backup(src, z)
        backup.apply(z, dst)
        self.assertEqual(os.listdir(os.path.join(dst["characters"], ".backups")), ["new.xml"])

    @unittest.skipUnless(hasattr(os, "mkfifo"), "FIFOs are POSIX-only")
    def test_backup_skips_special_files(self):
        root = tempfile.mkdtemp()
        dirs = state(root)
        os.mkfifo(os.path.join(dirs["characters"], "pipe"))
        out = os.path.join(root, "b.zip")
        backup.backup(dirs, out)
        self.assertNotIn("characters/pipe", zipfile.ZipFile(out).namelist())

    def test_refused_zip_changes_nothing(self):
        root = tempfile.mkdtemp()
        dst = state(root)
        before = tree(dst)
        with self.assertRaises(backup.RestoreError):
            backup.apply(bad_zip({"characters/../x": b"x"}), dst)
        self.assertEqual(tree(dst), before)
        self.assertEqual(os.listdir(os.path.join(dst["library"], ".backups")), ["19990101T000000_000000Z.zip"])

    def test_failed_swap_puts_the_old_contents_back(self):
        root = tempfile.mkdtemp()
        dst = state(root)
        before = tree(dst)
        new = tempfile.mkdtemp(dir=dst["custom"], prefix=backup.TEMP + "new-")
        Path(new, "a.xml").write_text("new", encoding="utf8")
        Path(new, "b.xml").write_text("new", encoding="utf8")
        real = os.replace

        def flaky(a, b):
            if os.path.basename(a) == "b.xml":
                raise OSError("disk trouble")
            return real(a, b)
        with unittest.mock.patch("importer.backup.os.replace", flaky), self.assertRaises(OSError):
            backup._swap(dst["custom"], new)
        self.assertEqual({k: v for k, v in tree(dst).items() if backup.TEMP not in k}, before)


if __name__ == "__main__":
    unittest.main()
