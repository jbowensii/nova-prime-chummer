import contextlib
import io
import json
import os
import stat
import tempfile
import threading
import unittest
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from importer import xmlio
from importer.__main__ import main
from importer.ai import propose as P
from importer.ai import providers as AI
from importer.ai.schema import SCHEMA
from importer.tests.test_run import SCHEMA as XSD_DIR, XSD_CHECK, node

KEY = "sk-test-SECRET-123"
ANTHROPIC_MSG = {"id": "msg_1", "type": "message", "role": "assistant", "model": "claude-opus-5",
                 "content": [{"type": "text", "text": '{"amps": []}'}], "stop_reason": "end_turn",
                 "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}}


class Stub:
    """A local HTTP server that records each POST and answers with `reply(path) -> (code, dict)`."""

    def __init__(self, reply):
        self.requests = []
        stub = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                stub.requests.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": body})
                code, out = reply(self.path)
                data = json.dumps(out).encode()
                self.send_response(code)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class ProvidersTest(unittest.TestCase):
    def stub(self, reply):
        s = Stub(reply)
        self.addCleanup(s.close)
        return s

    def test_openai_request_and_json_mode(self):
        s = self.stub(lambda p: (200, {"choices": [{"message": {"content": '{"amps": []}'}}]}))
        out = AI.complete({"id": "openai", "baseUrl": s.url + "/v1", "model": "llama3.1"}, KEY, "sys", "usr")
        self.assertEqual(out, '{"amps": []}')
        r = s.requests[0]
        self.assertEqual(r["path"], "/v1/chat/completions")
        self.assertEqual(r["headers"]["authorization"], f"Bearer {KEY}")
        self.assertEqual(r["body"]["model"], "llama3.1")
        self.assertEqual(r["body"]["messages"], [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}])
        self.assertEqual(r["body"]["response_format"], {"type": "json_object"})

    def test_openai_without_key_sends_no_authorization(self):  # Ollama, LM Studio
        s = self.stub(lambda p: (200, {"choices": [{"message": {"content": "x"}}]}))
        AI.complete({"id": "openai", "baseUrl": s.url + "/v1", "model": "m"}, "", "s", "u")
        self.assertNotIn("authorization", s.requests[0]["headers"])

    def test_gemini_request(self):
        s = self.stub(lambda p: (200, {"candidates": [{"content": {"parts": [{"text": '{"a"'}, {"text": ": 1}"}]}}]}))
        out = AI.complete({"id": "gemini", "baseUrl": s.url, "model": "gemini-2.5-pro"}, KEY, "sys", "usr")
        self.assertEqual(out, '{"a": 1}')
        r = s.requests[0]
        self.assertEqual(r["path"], "/v1beta/models/gemini-2.5-pro:generateContent")  # the key is not in the URL
        self.assertEqual(r["headers"]["x-goog-api-key"], KEY)
        self.assertEqual(r["body"]["systemInstruction"], {"parts": [{"text": "sys"}]})
        self.assertEqual(r["body"]["contents"], [{"role": "user", "parts": [{"text": "usr"}]}])
        self.assertEqual(r["body"]["generationConfig"], {"responseMimeType": "application/json"})

    def test_anythingllm_request(self):
        s = self.stub(lambda p: (200, {"textResponse": "hello"}))
        out = AI.complete({"id": "anythingllm", "baseUrl": s.url, "workspace": "shadowrun"}, KEY, "sys", "usr")
        self.assertEqual(out, "hello")
        r = s.requests[0]
        self.assertEqual(r["path"], "/api/v1/workspace/shadowrun/chat")
        self.assertEqual(r["headers"]["authorization"], f"Bearer {KEY}")
        self.assertEqual(r["body"], {"message": "sys\n\nusr", "mode": "chat"})

    def test_anthropic_request_via_sdk(self):
        s = self.stub(lambda p: (200, ANTHROPIC_MSG))
        out = AI.complete({"id": "anthropic", "baseUrl": s.url}, KEY, "sys", "usr", schema=SCHEMA)
        self.assertEqual(out, '{"amps": []}')
        r = s.requests[0]
        self.assertEqual(r["path"], "/v1/messages?beta=true")
        self.assertEqual(r["headers"]["x-api-key"], KEY)
        self.assertIn("server-side-fallback-2026-07-01", r["headers"]["anthropic-beta"])
        b = r["body"]
        self.assertEqual(b["model"], "claude-opus-5")
        self.assertEqual(b["max_tokens"], 16000)
        self.assertEqual(b["fallbacks"], "default")
        self.assertEqual(b["system"], "sys")
        self.assertEqual(b["messages"], [{"role": "user", "content": "usr"}])
        self.assertEqual(b["output_config"], {"format": {"type": "json_schema", "schema": SCHEMA}})

    def test_anthropic_refusal_is_an_error(self):
        s = self.stub(lambda p: (200, {**ANTHROPIC_MSG, "stop_reason": "refusal", "content": []}))
        with self.assertRaisesRegex(AI.ProviderError, "declined"):
            AI.complete({"id": "anthropic", "baseUrl": s.url}, KEY, "s", "u")

    def test_errors_never_show_the_key(self):
        s = self.stub(lambda p: (401, {"error": {"type": "authentication_error", "message": f"bad key {KEY}"}}))
        for p in ({"id": "anthropic", "baseUrl": s.url}, {"id": "openai", "baseUrl": s.url, "model": "m"},
                  {"id": "gemini", "baseUrl": s.url, "model": "g"}, {"id": "anythingllm", "baseUrl": s.url, "workspace": "w"}):
            with self.assertRaises(AI.ProviderError) as cm:
                AI.complete(p, KEY, "s", "u")
            self.assertNotIn(KEY, str(cm.exception), p["id"])
        with self.assertRaises(AI.ProviderError) as cm:
            AI.complete({"id": "openai", "baseUrl": "http://127.0.0.1:1", "model": "m"}, KEY, "s", "u")
        self.assertIn("couldn’t reach", str(cm.exception))

    def test_unknown_provider(self):
        with self.assertRaisesRegex(AI.ProviderError, "unknown provider"):
            AI.complete({"id": "nope"}, KEY, "s", "u")


PROVIDERS_XML = """<?xml version="1.0" encoding="UTF-8"?>
<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="{use}">
  <provider id="anthropic" enabled="true" model="claude-opus-5"/>
  <provider id="openai" enabled="{oe}" baseUrl="{url}" model="llama3.1"/>
  <provider id="gemini" enabled="false" model="gemini-2.5-pro"/>
  <provider id="anythingllm" enabled="false" baseUrl="http://tower05:3001" workspace="shadowrun"/>
</ca2:aiproviders>
"""


def write_providers(config, use="openai", url="http://127.0.0.1:1/v1", enabled="true"):
    xmlio.write_file(os.path.join(config, "ai-providers.xml"), PROVIDERS_XML.format(use=use, url=url, oe=enabled))


class SettingsTest(unittest.TestCase):
    def test_keys_file_holds_only_keys_and_is_private(self):
        config = tempfile.mkdtemp()
        AI.set_key(config, "anthropic", KEY)
        AI.set_key(config, "openai", "other")
        AI.set_key(config, "openai", None)  # clearing removes the element
        path = os.path.join(config, "ai-keys.xml")
        root = ET.parse(path).getroot()
        self.assertEqual(root.tag, "{urn:chummer-anarchy2:config:1}aikeys")
        self.assertEqual([(k.tag, k.get("provider"), k.text) for k in root], [("key", "anthropic", KEY)])
        self.assertEqual(AI.read_key(config, "anthropic"), KEY)
        self.assertIsNone(AI.read_key(config, "openai"))
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
        r = node("--input-type=module", "-e", XSD_CHECK, path, os.path.join(XSD_DIR, "aikeys.xsd"), os.path.join(XSD_DIR, "common.xsd"))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_providers_file_matches_xsd_and_reads(self):
        config = tempfile.mkdtemp()
        write_providers(config)
        use, providers = AI.read_providers(config)
        self.assertEqual(use, "openai")
        self.assertEqual(providers["anythingllm"]["workspace"], "shadowrun")
        r = node("--input-type=module", "-e", XSD_CHECK, os.path.join(config, "ai-providers.xml"),
                 os.path.join(XSD_DIR, "aiproviders.xsd"), os.path.join(XSD_DIR, "common.xsd"))
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_call_reads_the_key_at_call_time(self):
        s = Stub(lambda p: (200, {"choices": [{"message": {"content": "ok"}}]}))
        self.addCleanup(s.close)
        config = tempfile.mkdtemp()
        write_providers(config, url=s.url + "/v1")
        AI.set_key(config, "openai", "first")
        AI.call(config, "s", "u")
        AI.set_key(config, "openai", "second")
        AI.call(config, "s", "u")
        self.assertEqual([r["headers"]["authorization"] for r in s.requests], ["Bearer first", "Bearer second"])

    def test_call_refuses_a_disabled_provider(self):
        config = tempfile.mkdtemp()
        write_providers(config, enabled="false")
        with self.assertRaisesRegex(AI.ProviderError, "isn’t enabled"):
            AI.call(config, "s", "u")


BOOK = """<!-- page 1 -->
# Made-up gear book

Some intro.

## Neural spoon
<!-- page 2 -->
A spoon that stirs your thoughts.
"""

TWO_AMPS = {
    "amps": [
        {"name": "Neural Spoon", "type": "cyberware", "printedRating": 2, "page": 2,
         "effects": [{"ref": "rr-spec", "param": "athletics.climbing", "value": None, "note": None},
                     {"ref": "rr-spec", "param": "custom:stirring", "value": None, "note": None}]},
        {"name": "Glitter Gland", "type": "bioware", "printedRating": None, "page": 3,
         "effects": [{"ref": "sparkle-boost", "param": None, "value": None, "note": None}]},
    ],
    "items": [{"name": "Tin Spoon", "kind": "gear", "category": "Kitchen", "page": 2, "dv": None, "armor": None, "ranges": None}],
    "spells": [{"name": "Stir", "category": "manipulation", "page": 2}],
    "complexForms": [],
}


class ProposeTest(unittest.TestCase):
    def test_chunks_split_on_headings_and_stay_under_the_limit(self):
        md = "# A\n" + "x\n" * 10 + "## B\n" + ("para " * 30 + "\n\n") * 200 + "# C\ny\n"
        chunks = P.chunks(md, limit=2000)
        self.assertTrue(all(len(c) <= 2000 for c in chunks))
        self.assertEqual("".join(c for c in chunks).replace("\n", ""), md.replace("\n", ""))
        self.assertGreater(len(chunks), 3)
        self.assertTrue(chunks[0].startswith("# A"))
        self.assertTrue(all(c.endswith("\n") for c in chunks))  # cuts fall between paragraphs or sections

    def test_chunks_carry_the_current_page(self):
        md = "<!-- page 7 -->\n# A\n" + "x " * 600 + "\n## B\ny\n"
        chunks = P.chunks(md, limit=1000)
        self.assertEqual(len(chunks), 2)
        self.assertTrue(chunks[0].startswith("<!-- page 7 -->\n# A"))
        self.assertTrue(chunks[1].startswith("<!-- page 7 -->\n"), chunks[1][:40])

    def test_two_amps_one_with_an_unknown_effect(self):
        book = os.path.join(tempfile.mkdtemp(), "made-up")
        xmlio.write_file(os.path.join(book, "book.md"), BOOK)
        asked = []
        P.propose(book, lambda system, user: asked.append((system, user)) or "Sure! " + json.dumps(TWO_AMPS))
        self.assertEqual(len(asked), 1)
        self.assertIn("rr-spec", asked[0][0])  # the prompt lists the legal effects
        self.assertIn("Neural spoon", asked[0][1])
        path = os.path.join(book, "review.xml")
        root = ET.parse(path).getroot()
        props = root.findall("proposal")
        self.assertEqual([(p.get("id"), p.get("kind"), p.get("state"), p.get("page")) for p in props],
                         [("amp.neural-spoon", "amp", "pending", "2"), ("amp.glitter-gland", "amp", "pending", "3"),
                          ("gear.gear-tin-spoon", "gear", "pending", "2"), ("spell.spell-stir", "spell", "pending", "2")])
        self.assertEqual(props[0].findall("note"), [])
        self.assertEqual([n.text for n in props[1].findall("note")], ['unknown effect ref "sparkle-boost"'])
        amp = props[0].find("amp")
        self.assertEqual((amp.get("id"), amp.get("type"), amp.get("printedRating"), amp.get("source")),
                         ("neural-spoon", "cyberware", "2", "MADE-UP"))
        self.assertEqual([e.get("param") for e in amp.findall("effect")], ["athletics.climbing", "custom:stirring"])
        self.assertEqual(xmlio.ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "review")
        # review.xml matches its XSD; each proposed entry is valid data for its kind
        r = node("--input-type=module", "-e", XSD_CHECK, path, os.path.join(XSD_DIR, "review.xsd"), os.path.join(XSD_DIR, "common.xsd"))
        self.assertEqual(r.returncode, 0, r.stderr)
        for p, kind, xsd in ((props[0], "amps", "amps.xsd"), (props[2], "gear", "items.xsd"), (props[3], "spells", "items.xsd")):
            f = os.path.join(book, f"check-{kind}.xml")
            xmlio.write_file(f, f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">'
                             + ET.tostring(p[0], encoding="unicode") + "</ca2:data>")
            r = node("--input-type=module", "-e", XSD_CHECK, f, os.path.join(XSD_DIR, xsd), os.path.join(XSD_DIR, "common.xsd"))
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_validation_rules(self):
        m = P.mechanics(P.DATA)
        notes = P.amp_notes({"type": "nope", "effects": [
            {"ref": "rr-spec", "param": "athletics.nope"}, {"ref": "rr-skill", "param": "nope"},
            {"ref": "rr-attr", "param": "nope"}, {"ref": "rr-attr", "param": "str"}, {"ref": "rr-spec", "param": None}]}, m)
        self.assertEqual(notes, ['unknown amp type "nope"', 'unknown specialization "athletics.nope" for rr-spec',
                                 'unknown skill "nope" for rr-skill', 'unknown attribute "nope" for rr-attr'])

    def test_unparsable_chunk_is_skipped_and_counted(self):
        book = os.path.join(tempfile.mkdtemp(), "b")
        xmlio.write_file(os.path.join(book, "book.md"), BOOK)
        P.propose(book, lambda s, u: "no json here")
        root = ET.parse(os.path.join(book, "review.xml")).getroot()
        self.assertEqual((root.get("skipped"), len(root)), ("1", 0))

    def test_provider_error_fails_the_book(self):
        book = os.path.join(tempfile.mkdtemp(), "b")
        xmlio.write_file(os.path.join(book, "book.md"), BOOK)

        def ask(s, u):
            raise AI.ProviderError("rate limited")
        with self.assertRaises(AI.ProviderError):
            P.propose(book, ask)
        st = ET.parse(os.path.join(book, "status.xml")).getroot()
        self.assertEqual((st.get("state"), st.text), ("failed", "rate limited"))

    def test_cli_propose_through_the_configured_provider(self):
        s = Stub(lambda p: (200, {"choices": [{"message": {"content": json.dumps(TWO_AMPS)}}]}))
        self.addCleanup(s.close)
        lib = tempfile.mkdtemp()
        write_providers(os.path.join(lib, ".config"), url=s.url + "/v1")
        AI.set_key(os.path.join(lib, ".config"), "openai", KEY)
        book = os.path.join(lib, "made-up")
        xmlio.write_file(os.path.join(book, "book.md"), BOOK)
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(main(["propose", book, "--library", lib]), 0)
        self.assertEqual(out.getvalue().strip(), '<result state="review" proposals="4" />')
        self.assertEqual(len(ET.parse(os.path.join(book, "review.xml")).getroot()), 4)
        self.assertEqual(ET.parse(os.path.join(book, "review.xml")).getroot().get("provider"), "openai")
        self.assertNotIn(KEY, Path(book, "review.xml").read_text(encoding="utf8"))


if __name__ == "__main__":
    unittest.main()
