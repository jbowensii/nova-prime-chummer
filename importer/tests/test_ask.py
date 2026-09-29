"""Ask the rules (importer/ask.py, `python -m importer ask`) on invented texts; the provider is a local fake HTTP server."""
import contextlib
import io
import json
import os
import tempfile
import unittest
import unittest.mock

from importer import ask, use_custom, xmlio
from importer.__main__ import main
from importer.ai import providers as AI
from importer.tests.test_ai import KEY, Stub, write_providers

D = '<?xml version="1.0" encoding="UTF-8"?>\n<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{}" version="1">\n{}\n</ca2:data>\n'
# every name, rule and number here is invented
FILES = {
    "imported/core/skills.xml": D.format("skills", '<skill id="tinkering" attr="log" source="CORE" page="20"><name>Tinkering</name>'
                                         '<spec id="tinkering.clocks" attr="log">Clockwork</spec></skill>'),
    "imported/zz/rules.xml": D.format("rules", '<rule id="zz.puddle-jumping" sheet="base" section="Moving" source="ZZ" page="61"><title>Puddle jumping</title><text></text></rule>\n'
                                      '<rule id="zz.optional-kettle" sheet="optional" section="Optional" source="ZZ" page="80"><title>Kettle breaks</title><text></text></rule>'),
    "imported/zz/amps.xml": D.format("amps", '<amp id="zz.glow-skin" type="quality" source="ZZ" page="12"><name>Glow Skin</name><narrative></narrative></amp>'),
    "imported/zz/items.xml": D.format("gear", '<item id="zz.teacup" kind="gear" source="ZZ" page="9"><name>Teacup</name><text></text></item>'),
    "index.xml": '<overlays><file href="house.xml"/></overlays>',  # a house rule removes an amp
    "house.xml": D.format("amps", '<remove id="zz.glow-skin"/>'),
    "imported/index.xml": '<overlays><file href="zz/rules.xml"/><file href="zz/amps.xml"/><file href="zz/items.xml"/><file href="../../outside.xml"/></overlays>',
    "texts/zz.xml": D.format("texts", '<text of="rules" id="zz.puddle-jumping">A runner leaps a puddle with Athletics; a miss means wet boots and minus one to the next test.</text>\n'
                                      '<text of="amps" id="zz.glow-skin">The skin glows softly in darkness.</text>'),
    "edits/texts.xml": D.format("texts", '<text of="items" id="zz.teacup">A porcelain teacup that never spills.</text>'),
    "table-rules.xml": '<ca2:tablerules xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">'
                       '<rule id="zz.optional-kettle" on="true"/>'
                       '<rule id="house-1" on="true"><name>Biscuit rule</name><text>Every session opens with biscuits for the whole team.</text></rule>'
                       '<rule id="house-2" on="false"><name>Muffin rule</name><text>Muffins are banned.</text></rule></ca2:tablerules>',
}


def custom(test):
    """A custom folder of FILES; its core files are the ones read (not the test package's CA2_CORE_DIR)."""
    d = tempfile.mkdtemp()
    for rel, text in FILES.items():
        xmlio.write_file(os.path.join(d, *rel.split("/")), text)
    patch = unittest.mock.patch.dict(os.environ, {"CA2_CORE_DIR": os.path.join(d, "imported", "core")})
    patch.start()
    test.addCleanup(patch.stop)
    return d


def run(argv, question):
    out, err = io.StringIO(), io.StringIO()
    with unittest.mock.patch("sys.stdin", io.TextIOWrapper(io.BytesIO(question.encode()))), \
            contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = main(argv)
    return code, out.getvalue(), err.getvalue()


class RetrievalTest(unittest.TestCase):
    def setUp(self):
        self.custom = custom(self)

    def docs(self):
        with use_custom(self.custom):
            return ask.passages(self.custom)

    def test_passages_carry_source_page_title_and_the_private_text(self):
        by = {p["title"]: p for p in self.docs()}
        self.assertEqual({k: by["Puddle jumping"][k] for k in ("source", "page")}, {"source": "ZZ", "page": "61"})
        self.assertIn("wet boots", by["Puddle jumping"]["text"])
        self.assertIn("never spills", by["Teacup"]["text"])  # the edits layer's description
        self.assertIn("Clockwork", by["Tinkering"]["text"])  # a core entry's names
        self.assertIn("switched on", by["Kettle breaks"]["text"])  # an optional rule the table plays with
        self.assertIn("Biscuit rule", by)  # a house rule that is on
        self.assertNotIn("Muffin rule", by)  # off
        self.assertEqual(by["Biscuit rule"]["source"], "House rule")
        self.assertFalse(any("outside" in p["text"] for p in self.docs()))
        self.assertNotIn("Glow Skin", by)  # removed by a house rule

    def test_best_match_first_and_nothing_below_the_floor(self):
        docs = self.docs()
        self.assertEqual(ask.retrieve("What happens when I jump over a puddle?", docs)[0]["title"], "Puddle jumping")
        self.assertEqual(ask.retrieve("do biscuits count?", docs)[0]["title"], "Biscuit rule")
        self.assertEqual(ask.retrieve("How does the orbital laser cannon work?", docs), [])
        self.assertEqual(ask.retrieve("what is the?", docs), [])  # stop words only
        self.assertEqual(ask.tokens("Glowing Amps, glass"), ["glowing", "amp", "glass"])


class AnswerTest(unittest.TestCase):
    def setUp(self):
        self.custom, self.lib = custom(self), tempfile.mkdtemp()

    def stub(self, content):
        s = Stub(lambda p: (200, {"choices": [{"message": {"content": content}}]}))
        self.addCleanup(s.close)
        write_providers(os.path.join(self.lib, ".config"), url=s.url + "/v1")
        AI.set_key(os.path.join(self.lib, ".config"), "openai", KEY)
        return s

    def argv(self):
        return ["ask", "--custom", self.custom, "--library", self.lib]

    def test_not_covered_asks_no_one(self):
        s = self.stub('{"answer": "should never be asked"}')
        code, out, _ = run(self.argv(), "How does the orbital laser cannon work?")
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out), {"answer": ask.NOT_COVERED, "sources": [], "covered": False, "called": False})
        self.assertEqual(s.requests, [])
        # not even the provider settings are needed
        code, out, _ = run(["ask", "--custom", self.custom, "--library", tempfile.mkdtemp()], "orbital laser?")
        self.assertEqual((code, json.loads(out)["covered"]), (0, False))

    def test_the_provider_answers_from_the_passages_with_citations(self):
        s = self.stub(json.dumps({"answer": "You leap it with Athletics; a miss means wet boots [ZZ p.61]."}))
        code, out, _ = run(self.argv(), "What happens when I jump over a puddle?")
        self.assertEqual(code, 0)
        r = json.loads(out)
        self.assertEqual(r["answer"], "You leap it with Athletics; a miss means wet boots [ZZ p.61].")
        self.assertEqual(r["sources"], [{"source": "ZZ", "page": "61", "title": "Puddle jumping"}])  # the cited one
        self.assertTrue(r["covered"] and r["called"])
        body = s.requests[0]["body"]
        system, user = body["messages"][0]["content"], body["messages"][1]["content"]
        self.assertIn("Use only the numbered passages", system)
        self.assertIn("[CRB p.61]", system)
        self.assertIn("Question: What happens when I jump over a puddle?", user)
        self.assertIn("[1] [ZZ p.61] Puddle jumping", user)
        self.assertIn("wet boots", user)
        self.assertNotIn(KEY, json.dumps(body))

    def test_prose_and_the_model_saying_not_covered(self):
        self.stub("Plain prose [House rule] about biscuits.")
        r = json.loads(run(self.argv(), "biscuits?")[1])
        self.assertEqual((r["answer"], r["sources"][0]["title"]), ("Plain prose [House rule] about biscuits.", "Biscuit rule"))
        self.stub(json.dumps({"answer": ask.NOT_COVERED}))
        # the model saying not covered was still a call: it counts
        self.assertEqual(json.loads(run(self.argv(), "biscuits?")[1]), {"answer": ask.NOT_COVERED, "sources": [], "covered": False, "called": True})

    def test_refusals_and_provider_errors_never_show_the_key(self):
        self.assertEqual(run(self.argv(), "puddle " * 80)[:2], (3, '{"called": false}\n'))  # over 500 characters
        self.assertEqual(run(self.argv(), "   ")[0], 3)
        s = Stub(lambda p: (400, {"error": f"bad key {KEY}"}))
        self.addCleanup(s.close)
        write_providers(os.path.join(self.lib, ".config"), url=s.url + "/v1")
        AI.set_key(os.path.join(self.lib, ".config"), "openai", KEY)
        code, out, err = run(self.argv(), "puddle jumping?")
        self.assertEqual((code, json.loads(out)), (3, {"called": True}))  # the request went out: it counts
        self.assertIn("bad key [key]", err)
        self.assertNotIn(KEY, err)
        write_providers(os.path.join(self.lib, ".config"), enabled="false")
        code, _, err = run(self.argv(), "puddle jumping?")
        self.assertEqual(code, 3)
        self.assertIn("isn’t enabled", err)


if __name__ == "__main__":
    unittest.main()
