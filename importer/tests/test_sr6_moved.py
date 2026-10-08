"""Old ids keep loading (importer/sr6/moved.py): a re-import's renamed, moved or re-kinded entries carry their old ids.
All names made up."""
import os
import tempfile
import unittest

from importer.sr6 import moved

HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n<!-- made up -->\n'


def data(kind, *entries):
    tag = kind[:-1] if kind.endswith("s") else kind
    body = "".join(f'<{tag} id="{i}"><name>{n}</name>{extra}<text/></{tag}>' for i, n, extra in entries)
    return f'{HEAD}<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="{kind}" version="1">{body}</sr6:data>\n'


class MovedTest(unittest.TestCase):
    def prev(self, files):
        d = tempfile.mkdtemp()
        for n, x in files.items():
            with open(os.path.join(d, n), "w", encoding="utf8") as f:
                f.write(x)
        return moved.previous(d)

    def test_words_and_tiers(self):
        self.assertEqual(moved.words("Zorp Gland (Rating 1-4)"), moved.words("Zorp glands"))
        self.assertTrue(moved._abbrev(moved.words("Omni-zap mic"), moved.words("Omnizap microphone")))
        self.assertFalse(moved._abbrev(moved.words("Zap mic"), moved.words("Zap microphone kit")))

    def test_renamed_moved_and_kept_ids(self):
        prev = self.prev({
            "gear.xml": data("gear", ("zz.fizz", "Fizz", ""), ("zz.zap-mic", "Zap mic", ""), ("zz.blip", "Blip", ""),
                             ("zz.kept", "Kept", '<alias id="zz.kept-old"/>')),
            "weapons.xml": data("weapons", ("zz.bonk-9", "Bonk 9", ""))})
        new = {"gear.xml": data("gear", ("zz.zap-microphone", "Zap microphone", ""), ("zz.kept", "Kept", ""),
                                ("zz.blop", "Blop", ""), ("zz.blap", "Blap", "")),
               "ammotypes.xml": data("ammotypes", ("zz.fizz", "Fizz", "")),
               "weapons.xml": data("weapons", ("zz.acme-bonk-9", "Acme Bonk 9", ""))}
        out, n = moved.carry(prev, new)
        self.assertEqual(n, 4)
        self.assertIn('<name>Fizz</name><alias id="zz.fizz" kind="gear"/><text/>', out["ammotypes.xml"])
        self.assertIn('<alias id="zz.zap-mic"/>', out["gear.xml"])
        self.assertIn('<alias id="zz.kept-old"/>', out["gear.xml"])  # an old alias goes on
        self.assertIn('<alias id="zz.bonk-9"/>', out["weapons.xml"])
        self.assertNotIn("zz.blip", out["gear.xml"])  # nothing new is named like it
        self.assertTrue(out["gear.xml"].startswith(HEAD))
        out2, n2 = moved.carry(self.prev(out), out)  # the next import keeps them, adds nothing
        self.assertEqual((n2, out2["ammotypes.xml"].count("<alias"), out2["gear.xml"].count("<alias")), (0, 1, 2))

    def test_two_candidates_are_no_match(self):
        prev = self.prev({"gear.xml": data("gear", ("zz.tag", "Tag", ""))})
        out, n = moved.carry(prev, {"gear.xml": data("gear", ("zz.red-tag", "Red Tag", ""), ("zz.blue-tag", "Blue Tag", ""))})
        self.assertEqual(n, 0)


if __name__ == "__main__":
    unittest.main()


class MoreTiersTest(unittest.TestCase):
    """Tiers 5-8 on made-up entries: a name printed whole, a row renamed with its values kept, a level renamed with its
    heading, an entry re-kinded to one the old import had too."""

    def test_more_tiers(self):
        d = tempfile.mkdtemp()
        old = {"gear.xml": data("gear", ("zz.zork", "Zork", ""),
                                ("zz.blip-lamp-level-1", "Blip Lamp (Level 1)", ""),
                                ("zz.glow-hood-version-2-zap-unit", "Glow Hood (Version 2 (Zap Unit))", "")),
               "actions.xml": data("actions", ("zz.bright-day", "Bright Day", ""))}
        old["gear.xml"] = old["gear.xml"].replace('<gear id="zz.blip-lamp-level-1">',
                                                  '<gear id="zz.blip-lamp-level-1" page="9" avail="4" cost="1000">')
        old["gear.xml"] = old["gear.xml"].replace('<gear id="zz.glow-hood-version-2-zap-unit">',
                                                  '<gear id="zz.glow-hood-version-2-zap-unit" page="9" avail="6">')
        for n, x in old.items():
            with open(os.path.join(d, n), "w", encoding="utf8") as f:
                f.write(x)
        prev = moved.previous(d)
        new = {"gear.xml": data("gear", ("zz.zork-field-kit", "Zork Field Kit", ""),
                                ("zz.dim-shade-level-1", "Dim Shade (Level 1)", ""),
                                ("zz.zap-shield-version-2-zap-unit", "Zap Shield (Version 2 (Zap Unit))", "")),
               "rules.xml": data("rules", ("zz.bright-day", "Bright Day", ""))}
        new["gear.xml"] = new["gear.xml"].replace('<gear id="zz.dim-shade-level-1">',
                                                  '<gear id="zz.dim-shade-level-1" page="9" avail="4" cost="1000">')
        new["gear.xml"] = new["gear.xml"].replace('<gear id="zz.zap-shield-version-2-zap-unit">',
                                                  '<gear id="zz.zap-shield-version-2-zap-unit" page="9" avail="5">')
        out, n = moved.carry(prev, new)
        self.assertIn('<alias id="zz.zork"/>', out["gear.xml"])
        self.assertIn('<alias id="zz.blip-lamp-level-1"/>', out["gear.xml"])
        self.assertIn('<alias id="zz.glow-hood-version-2-zap-unit"/>', out["gear.xml"])
        self.assertIn('<alias id="zz.bright-day" kind="actions"/>', out["rules.xml"])
        self.assertEqual(n, 4)


class SplitTest(MovedTest):
    def test_an_item_split_in_two_or_into_its_variants(self):
        prev = self.prev({"gear.xml": data("gear", ("zz.left-right-zorp", "Left/right zorp", ""),
                                           ("zz.glow-bullets", "Glow Bullets", ""))})
        new = {"gear.xml": data("gear", ("zz.left-zorp", "Left zorp", ""), ("zz.right-zorp", "Right zorp", "")),
               "ammotypes.xml": data("ammotypes", ("zz.glow-bullets-tin", "Glow Bullets (tin)", ""),
                                     ("zz.glow-bullets-gold", "Glow Bullets (gold)", ""))}
        out, n = moved.carry(prev, new)
        self.assertIn('<alias id="zz.left-right-zorp"/>', out["gear.xml"].split("zz.right-zorp")[0])
        self.assertIn('<alias id="zz.glow-bullets" kind="gear"/>', out["ammotypes.xml"])
        self.assertEqual(n, 2)


class MergedTest(MovedTest):
    def test_an_entry_read_twice_now_one(self):
        prev = self.prev({"qualities.xml": data("qualities", ("zz.zorped", "Zorped", ""),
                                                ("zz.path-zorped", "Path: Zorped", ""))})
        new = {"qualities.xml": data("qualities", ("zz.zorped", "Zorped", "<alias>Path: Zorped</alias>"))}
        out, n = moved.carry(prev, new)
        self.assertIn('<alias id="zz.path-zorped"/>', out["qualities.xml"])
        self.assertEqual(n, 1)
