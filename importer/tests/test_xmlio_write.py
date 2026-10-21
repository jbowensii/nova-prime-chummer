"""xmlio.write_file survives Windows refusing the rename while the server is reading the destination (a status.xml poll)."""

import os
import tempfile
import unittest
from unittest import mock

from importer import xmlio


class WriteFileRetry(unittest.TestCase):
    def test_rename_refused_twice_then_works(self):
        real, calls = os.replace, []

        def flaky(a, b):
            calls.append(a)
            if len(calls) <= 2:
                raise PermissionError(5, "Access is denied")
            real(a, b)

        with (
            tempfile.TemporaryDirectory() as d,
            mock.patch.object(xmlio, "WINDOWS", True),
            mock.patch.object(xmlio.os, "replace", flaky),
        ):
            p = os.path.join(d, "status.xml")
            xmlio.write_file(p, "x")
            self.assertEqual(open(p, encoding="utf8").read(), "x")
        self.assertEqual(len(calls), 3)

    def test_other_systems_do_not_retry(self):
        with (
            tempfile.TemporaryDirectory() as d,
            mock.patch.object(xmlio, "WINDOWS", False),
            mock.patch.object(xmlio.os, "replace", side_effect=PermissionError),
        ):
            with self.assertRaises(PermissionError):
                xmlio.write_file(os.path.join(d, "a.xml"), "x")


if __name__ == "__main__":
    unittest.main()
