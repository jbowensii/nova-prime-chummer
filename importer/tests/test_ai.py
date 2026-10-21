import contextlib
import io
import json
import os
import stat
import tempfile
import threading
import unittest
import unittest.mock
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from importer import xmlio
from importer.__main__ import main
from importer.ai import propose as P
from importer.ai import providers as AI
from importer.ai.schema import SCHEMA
from importer.tests.test_run import MINI, SCHEMA as XSD_DIR, XSD_CHECK, node

KEY = "sk-test-SECRET-123"
ANTHROPIC_MSG = {
    "id": "msg_1",
    "type": "message",
    "role": "assistant",
    "model": "claude-opus-5",
    "content": [{"type": "text", "text": '{"amps": []}'}],
    "stop_reason": "end_turn",
    "stop_sequence": None,
    "usage": {"input_tokens": 1, "output_tokens": 1},
}
WORKSPACES = {
    "workspaces": [
        {"id": 1, "name": "Shadowrun", "slug": "shadowrun", "openAiTemp": 0.7, "threads": []},
        {"id": 2, "name": "Anarchy Two Point Oh", "slug": "anarchy-two-point-oh", "threads": []},
    ]
}


class Stub:
    """A local HTTP server that records each POST or GET and answers with `reply(path) -> (code, dict[, headers])`."""

    def __init__(self, reply):
        self.requests = []
        stub = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                n = int(self.headers.get("Content-Length") or 0)
                body = json.loads(self.rfile.read(n)) if n else None
                stub.requests.append(
                    {
                        "method": self.command,
                        "path": self.path,
                        "headers": {k.lower(): v for k, v in self.headers.items()},
                        "body": body,
                    }
                )
                code, out, *extra = reply(self.path)
                data = json.dumps(out).encode()
                self.send_response(code)
                for k, v in (extra[0] if extra else {}).items():
                    self.send_header(k, v)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            do_GET = do_POST

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
        self.assertEqual(
            r["body"]["messages"], [{"role": "system", "content": "sys"}, {"role": "user", "content": "usr"}]
        )
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
        s = self.stub(lambda p: (200, WORKSPACES if p == "/api/v1/workspaces" else {"textResponse": "hello"}))
        out = AI.complete({"id": "anythingllm", "baseUrl": s.url, "workspace": "shadowrun"}, KEY, "sys", "usr")
        self.assertEqual(out, "hello")
        self.assertEqual(s.requests[0]["headers"]["authorization"], f"Bearer {KEY}")
        r = s.requests[1]
        self.assertEqual(r["path"], "/api/v1/workspace/shadowrun/chat")
        self.assertEqual(r["headers"]["authorization"], f"Bearer {KEY}")
        self.assertEqual(
            {k: v for k, v in r["body"].items() if k != "sessionId"}, {"message": "sys\n\nusr", "mode": "chat"}
        )
        # a fresh session per call: no earlier question's history (another user's) joins this one
        AI.complete({"id": "anythingllm", "baseUrl": s.url, "workspace": "shadowrun"}, KEY, "sys", "usr")
        ids = [q["body"]["sessionId"] for q in s.requests if q["path"].endswith("/chat")]
        self.assertEqual(len(set(ids)), 2)
        self.assertRegex(ids[0], r"^ca2-[0-9a-f]{32}$")

    def test_a_capped_call_leaves_room_for_thinking_and_is_not_retried(self):
        replies = {
            "/v1/chat/completions": {"choices": [{"message": {"content": "x"}}]},
            "/v1beta/models/g:generateContent": {"candidates": [{"content": {"parts": [{"text": "x"}]}}]},
        }
        s = self.stub(
            lambda p: (200, replies[p]) if p in replies else (500, {"error": {"type": "api_error", "message": "boom"}})
        )
        AI.complete({"id": "openai", "baseUrl": s.url + "/v1", "model": "m"}, KEY, "s", "u", max_tokens=800, timeout=5)
        AI.complete({"id": "gemini", "baseUrl": s.url, "model": "g"}, KEY, "s", "u", max_tokens=800, timeout=5)
        body = {r["path"]: r["body"] for r in s.requests}
        self.assertEqual(body["/v1/chat/completions"]["max_completion_tokens"], 800 * AI.OPENAI_CAP)
        self.assertNotIn("max_tokens", body["/v1/chat/completions"])
        gc = body["/v1beta/models/g:generateContent"]["generationConfig"]
        self.assertEqual(
            (gc["maxOutputTokens"], gc["thinkingConfig"]),
            (800 + 2 * AI.GEMINI_THINKING, {"thinkingBudget": AI.GEMINI_THINKING}),
        )
        with self.assertRaises(AI.ProviderError):  # Anthropic with a timeout: one request, no SDK retries
            AI.complete({"id": "anthropic", "baseUrl": s.url}, KEY, "s", "u", max_tokens=800, timeout=5)
        self.assertEqual(len([r for r in s.requests if r["path"].startswith("/v1/messages")]), 1)
        self.assertEqual(s.requests[-1]["body"]["max_tokens"], 800)

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
        self.assertEqual(b["system"], [{"type": "text", "text": "sys", "cache_control": {"type": "ephemeral"}}])
        self.assertEqual(b["messages"], [{"role": "user", "content": "usr"}])
        self.assertEqual(b["output_config"], {"format": {"type": "json_schema", "schema": SCHEMA}})

    def test_anthropic_refusal_is_an_error(self):
        s = self.stub(lambda p: (200, {**ANTHROPIC_MSG, "stop_reason": "refusal", "content": []}))
        with self.assertRaisesRegex(AI.ProviderError, "declined"):
            AI.complete({"id": "anthropic", "baseUrl": s.url}, KEY, "s", "u")

    def test_truncated_replies(self):
        replies = {
            "/v1/messages?beta=true": {**ANTHROPIC_MSG, "stop_reason": "max_tokens"},
            "/v1/chat/completions": {"choices": [{"message": {"content": '{"amps": ['}, "finish_reason": "length"}]},
            "/v1beta/models/g:generateContent": {
                "candidates": [{"content": {"parts": [{"text": "{"}]}, "finishReason": "MAX_TOKENS"}]
            },
        }
        s = self.stub(lambda p: (200, replies[p]))
        for p in (
            {"id": "anthropic", "baseUrl": s.url},
            {"id": "openai", "baseUrl": s.url + "/v1", "model": "m"},
            {"id": "gemini", "baseUrl": s.url, "model": "g"},
        ):
            with self.assertRaisesRegex(AI.TruncatedReply, "cut off", msg=p["id"]):
                AI.complete(p, KEY, "s", "u")

    def test_errors_never_show_the_key(self):
        for code in (401, 400):  # 400: a generic status error whose body echoes the key
            s = self.stub(lambda p: (code, {"error": {"type": "invalid_request_error", "message": f"bad key {KEY}"}}))
            for p in (
                {"id": "anthropic", "baseUrl": s.url},
                {"id": "openai", "baseUrl": s.url, "model": "m"},
                {"id": "gemini", "baseUrl": s.url, "model": "g"},
                {"id": "anythingllm", "baseUrl": s.url, "workspace": "w"},
            ):
                with self.assertRaises(AI.ProviderError) as cm:
                    AI.complete(p, KEY, "s", "u")
                self.assertNotIn(KEY, str(cm.exception), p["id"])
                if code == 400:  # the body is shown, redacted
                    self.assertIn("bad key [key]", str(cm.exception), p["id"])
        with self.assertRaises(AI.ProviderError) as cm:
            AI.complete({"id": "openai", "baseUrl": "http://127.0.0.1:1", "model": "m"}, KEY, "s", "u")
        self.assertIn("couldn’t reach", str(cm.exception))

    def test_a_redirect_never_carries_the_key_elsewhere(self):
        elsewhere = self.stub(lambda p: (200, {"data": [], "choices": [{"message": {"content": "x"}}]}))
        s = self.stub(lambda p: (302, {}, {"Location": elsewhere.url + p}))
        for call in (
            lambda: AI.complete({"id": "openai", "baseUrl": s.url + "/v1", "model": "m"}, KEY, "s", "u"),
            lambda: AI.complete({"id": "gemini", "baseUrl": s.url, "model": "g"}, KEY, "s", "u"),
        ):
            with self.assertRaisesRegex(AI.ProviderError, "redirected to another address"):
                call()
        self.assertEqual(len(s.requests), 2)
        self.assertEqual(elsewhere.requests, [])

    def test_anythingllm_workspace_name_resolves_to_its_slug_once_per_run(self):
        s = self.stub(lambda p: (200, WORKSPACES if p == "/api/v1/workspaces" else {"textResponse": "hi"}))
        p = {"id": "anythingllm", "baseUrl": s.url, "workspace": "  anarchy two POINT oh "}
        self.assertEqual([AI.complete(p, KEY, "s", "u") for _ in range(3)], ["hi"] * 3)
        self.assertEqual(
            [r["path"] for r in s.requests],
            ["/api/v1/workspaces"] + ["/api/v1/workspace/anarchy-two-point-oh/chat"] * 3,
        )

    def test_anythingllm_unknown_workspace_names_the_ones_there(self):
        s = self.stub(lambda p: (200, WORKSPACES))
        with self.assertRaises(AI.ProviderError) as cm:
            AI.complete({"id": "anythingllm", "baseUrl": s.url, "workspace": "Shadowrun Anarchy 2.0"}, KEY, "s", "u")
        self.assertEqual(
            str(cm.exception),
            "Workspace “Shadowrun Anarchy 2.0” isn’t on this AnythingLLM server. "
            "Its workspaces: Shadowrun, Anarchy Two Point Oh.",
        )
        self.assertEqual([r["path"] for r in s.requests], ["/api/v1/workspaces"])  # no chat to a guessed workspace

    def test_anythingllm_400_not_a_valid_workspace_reads_plainly(self):
        def reply(p):  # the workspace went away after the list was read
            if p == "/api/v1/workspaces":
                return 200, WORKSPACES
            return 400, {
                "id": "x",
                "type": "abort",
                "textResponse": None,
                "error": f"Workspace shadowrun is not a valid workspace. {KEY}",
            }

        s = self.stub(reply)
        with self.assertRaises(AI.ProviderError) as cm:
            AI.complete({"id": "anythingllm", "baseUrl": s.url, "workspace": "shadowrun"}, KEY, "s", "u")
        self.assertIn(
            "Workspace “shadowrun” isn’t on this AnythingLLM server. Its workspaces: Shadowrun,", str(cm.exception)
        )
        self.assertNotIn(KEY, str(cm.exception))

    def test_unknown_provider(self):
        with self.assertRaisesRegex(AI.ProviderError, "unknown provider"):
            AI.complete({"id": "nope"}, KEY, "s", "u")


class ListModelsTest(unittest.TestCase):
    """Model lists come from the saved address with the saved key; the request only names the provider."""

    def library(self, stub_url, key=KEY):
        lib = tempfile.mkdtemp()
        config = os.path.join(lib, ".config")
        xmlio.write_file(
            os.path.join(config, "ai-providers.xml"),
            '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">'
            f'<provider id="anthropic" enabled="true" baseUrl="{stub_url}"/>'
            f'<provider id="openai" enabled="true" baseUrl="{stub_url}/v1"/>'
            f'<provider id="gemini" enabled="true" baseUrl="{stub_url}"/>'
            f'<provider id="anythingllm" enabled="true" baseUrl="{stub_url}" workspace="w"/></ca2:aiproviders>',
        )
        for p in AI.PROVIDER_IDS:
            if key:
                AI.set_key(config, p, key)
        return lib

    def stub(self, reply):
        s = Stub(reply)
        self.addCleanup(s.close)
        return s

    def test_anythingllm_lists_workspaces_as_slug_tab_name(self):
        s = self.stub(lambda p: (200, WORKSPACES))
        self.assertEqual(
            AI.list_models("anythingllm", self.library(s.url)),
            ["anarchy-two-point-oh\tAnarchy Two Point Oh", "shadowrun\tShadowrun"],
        )
        r = s.requests[0]
        self.assertEqual((r["method"], r["path"]), ("GET", "/api/v1/workspaces"))
        self.assertEqual(r["headers"]["authorization"], f"Bearer {KEY}")

    def test_openai_lists_data_ids_with_the_bearer_key(self):
        s = self.stub(
            lambda p: (200, {"object": "list", "data": [{"id": "gpt-5"}, {"id": "gpt-4.1"}, {"id": "gpt-5"}]})
        )
        self.assertEqual(AI.list_models("openai", self.library(s.url)), ["gpt-4.1", "gpt-5"])
        r = s.requests[0]
        self.assertEqual((r["method"], r["path"]), ("GET", "/v1/models"))
        self.assertEqual(r["headers"]["authorization"], f"Bearer {KEY}")

    def test_openai_without_a_key_asks_anyway(self):  # Ollama, LM Studio
        s = self.stub(lambda p: (200, {"data": [{"id": "llama3.1"}]}))
        self.assertEqual(AI.list_models("openai", self.library(s.url, key="")), ["llama3.1"])
        self.assertNotIn("authorization", s.requests[0]["headers"])

    def test_gemini_keeps_generate_content_models_and_sends_the_key_in_a_header(self):
        s = self.stub(
            lambda p: (
                200,
                {
                    "models": [
                        {
                            "name": "models/gemini-2.5-pro",
                            "supportedGenerationMethods": ["generateContent", "countTokens"],
                        },
                        {"name": "models/text-embedding-004", "supportedGenerationMethods": ["embedContent"]},
                        {"name": "models/gemini-2.5-flash", "supportedGenerationMethods": ["generateContent"]},
                    ]
                },
            )
        )
        self.assertEqual(AI.list_models("gemini", self.library(s.url)), ["gemini-2.5-flash", "gemini-2.5-pro"])
        r = s.requests[0]
        self.assertEqual((r["method"], r["path"]), ("GET", "/v1beta/models?pageSize=1000"))
        self.assertEqual(r["headers"]["x-goog-api-key"], KEY)
        self.assertNotIn(KEY, r["path"])

    def test_anthropic_pages_through_the_sdk(self):
        pages = {
            "/v1/models": {
                "data": [
                    {
                        "id": "claude-opus-5",
                        "type": "model",
                        "display_name": "Opus",
                        "created_at": "2026-01-01T00:00:00Z",
                    }
                ],
                "has_more": True,
                "first_id": "claude-opus-5",
                "last_id": "claude-opus-5",
            },
            "/v1/models?after_id=claude-opus-5": {
                "data": [
                    {
                        "id": "claude-haiku-4-5",
                        "type": "model",
                        "display_name": "Haiku",
                        "created_at": "2025-01-01T00:00:00Z",
                    }
                ],
                "has_more": False,
                "first_id": "claude-haiku-4-5",
                "last_id": "claude-haiku-4-5",
            },
        }
        s = self.stub(lambda p: (200, pages[p]))
        self.assertEqual(AI.list_models("anthropic", self.library(s.url)), ["claude-haiku-4-5", "claude-opus-5"])
        self.assertEqual([r["headers"]["x-api-key"] for r in s.requests], [KEY, KEY])

    def test_a_redirected_list_is_refused(self):
        elsewhere = self.stub(lambda p: (200, {"data": [{"id": "x"}]}))
        s = self.stub(lambda p: (301, {}, {"Location": elsewhere.url + p}))
        for p in ("openai", "gemini", "anythingllm"):
            with self.assertRaisesRegex(AI.ProviderError, "redirected to another address"):
                AI.list_models(p, self.library(s.url))
        self.assertEqual(elsewhere.requests, [])

    def test_errors_never_show_the_key(self):
        s = self.stub(lambda p: (400, {"error": {"type": "invalid_request_error", "message": f"bad key {KEY}"}}))
        lib = self.library(s.url)
        for p in ("anthropic", "openai", "gemini", "anythingllm"):
            with self.assertRaises(AI.ProviderError) as cm:
                AI.list_models(p, lib)
            self.assertNotIn(KEY, str(cm.exception), p)
            self.assertIn("bad key [key]", str(cm.exception), p)

    def test_what_has_no_list_or_no_key_says_so(self):
        with self.assertRaisesRegex(AI.ProviderError, "no API key is set for anythingllm"):
            AI.list_models("anythingllm", tempfile.mkdtemp())
        with self.assertRaisesRegex(AI.ProviderError, "no API key is set for gemini"):
            AI.list_models("gemini", tempfile.mkdtemp())
        s = self.stub(lambda p: (200, {"data": "nope"}))
        with self.assertRaisesRegex(AI.ProviderError, "unexpected shape"):
            AI.list_models("openai", self.library(s.url))

    def test_cli_prints_one_id_per_line_or_the_reason(self):
        s = self.stub(lambda p: (200, {"data": [{"id": "b"}, {"id": "a"}]}))
        lib, out, err = self.library(s.url), io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(["list-models", "openai", "--library", lib]), 0)
        self.assertEqual(out.getvalue(), "a\nb\n")
        with contextlib.redirect_stderr(err):
            self.assertEqual(main(["list-models", "anythingllm", "--library", lib]), 3)
            self.assertEqual(main(["list-models", "evil", "--library", lib]), 2)
        self.assertIn("anythingllm sent a model list in an unexpected shape", err.getvalue())


class PingTest(unittest.TestCase):
    """The AI settings' Test button: a tiny fixed prompt to the saved provider, answered plainly."""

    def library(self, url, key=KEY, model=' model="m-1"', workspace="shadowrun"):
        lib = tempfile.mkdtemp()
        config = os.path.join(lib, ".config")
        xmlio.write_file(
            os.path.join(config, "ai-providers.xml"),
            '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">'
            f'<provider id="anthropic" enabled="true" baseUrl="{url}"{model}/>'
            f'<provider id="openai" enabled="true" baseUrl="{url}/v1"{model}/>'
            f'<provider id="gemini" enabled="true" baseUrl="{url}"{model}/>'
            f'<provider id="anythingllm" enabled="true" baseUrl="{url}" workspace="{workspace}"/></ca2:aiproviders>',
        )
        for p in AI.PROVIDER_IDS:
            if key:
                AI.set_key(config, p, key)
        return lib

    def stub(self, reply):
        s = Stub(reply)
        self.addCleanup(s.close)
        return s

    def test_each_provider_gets_the_fixed_prompt_and_answers(self):
        replies = {
            "/v1/messages": ANTHROPIC_MSG | {"content": [{"type": "text", "text": "OK"}]},
            "/v1/chat/completions": {
                "choices": [{"message": {"role": "assistant", "content": "OK"}, "finish_reason": "stop"}]
            },
            "/v1beta/models/m-1:generateContent": {
                "candidates": [{"content": {"parts": [{"text": "OK"}]}, "finishReason": "STOP"}]
            },
            "/api/v1/workspaces": WORKSPACES,
            "/api/v1/workspace/shadowrun/chat": {
                "id": "c1",
                "type": "textResponse",
                "textResponse": "OK",
                "sources": [],
                "close": True,
                "error": None,
            },
        }
        s = self.stub(lambda p: (200, replies[p]))
        lib = self.library(s.url)
        got = {p: AI.ping(p, lib) for p in AI.PROVIDER_IDS}
        self.assertEqual(
            got,
            {
                "anthropic": ("m-1", "OK"),
                "openai": ("m-1", "OK"),
                "gemini": ("m-1", "OK"),
                "anythingllm": ("workspace shadowrun", "OK"),
            },
        )
        by = {r["path"]: r for r in s.requests}
        self.assertEqual(
            by["/v1/messages"]["body"],
            {"model": "m-1", "max_tokens": 16, "messages": [{"role": "user", "content": AI.PING}]},
        )
        self.assertEqual(by["/v1/messages"]["headers"]["x-api-key"], KEY)
        self.assertEqual(
            by["/v1/chat/completions"]["body"], {"model": "m-1", "messages": [{"role": "user", "content": AI.PING}]}
        )
        self.assertEqual(by["/v1/chat/completions"]["headers"]["authorization"], f"Bearer {KEY}")
        self.assertEqual(by["/v1beta/models/m-1:generateContent"]["headers"]["x-goog-api-key"], KEY)
        self.assertEqual(
            {k: v for k, v in by["/api/v1/workspace/shadowrun/chat"]["body"].items() if k != "sessionId"},
            {"message": AI.PING, "mode": "chat"},
        )
        self.assertEqual(by["/api/v1/workspace/shadowrun/chat"]["headers"]["authorization"], f"Bearer {KEY}")

    def test_common_failures_read_plainly_and_never_show_the_key(self):
        for code, why in (
            (401, "didn’t accept the API key"),
            (403, "didn’t accept the API key"),
            (404, "wasn’t found"),
            (429, "rate limiting"),
            (503, "had an error on its side"),
        ):
            s = self.stub(lambda p, code=code: (code, {"error": {"type": "x", "message": f"nope {KEY}"}}))
            lib = self.library(s.url)
            for p in AI.PROVIDER_IDS:
                with self.assertRaises(AI.ProviderError, msg=f"{p} {code}") as cm:
                    AI.ping(p, lib)
                self.assertNotIn(KEY, str(cm.exception), p)
                if not (p == "anthropic" and code == 503):  # the SDK's own words for a 5xx
                    self.assertIn(why, str(cm.exception), f"{p} {code}")
        with self.assertRaisesRegex(AI.ProviderError, "couldn’t reach 127.0.0.1:1"):
            AI.ping("openai", self.library("http://127.0.0.1:1"))

    def test_anythingllm_error_field_and_missing_settings(self):
        s = self.stub(
            lambda p: (
                200,
                WORKSPACES if p == "/api/v1/workspaces" else {"textResponse": None, "error": "No workspace found"},
            )
        )
        with self.assertRaisesRegex(AI.ProviderError, "AnythingLLM answered: No workspace found"):
            AI.ping("anythingllm", self.library(s.url))
        with self.assertRaisesRegex(AI.ProviderError, "save this provider’s settings first"):
            AI.ping("openai", tempfile.mkdtemp())
        with self.assertRaisesRegex(AI.ProviderError, "no API key is set for gemini"):
            AI.ping("gemini", self.library(s.url, key=""))
        with self.assertRaisesRegex(AI.ProviderError, "choose a model first"):
            AI.ping("openai", self.library(s.url, model=""))
        with self.assertRaisesRegex(AI.ProviderError, "save the workspace first"):
            AI.ping("anythingllm", self.library(s.url, workspace=""))

    def test_a_redirect_never_carries_the_key_elsewhere(self):
        elsewhere = self.stub(lambda p: (200, ANTHROPIC_MSG))
        s = self.stub(lambda p: (307, {}, {"Location": elsewhere.url + p}))
        lib = self.library(s.url)
        for p in AI.PROVIDER_IDS:
            with self.assertRaisesRegex(AI.ProviderError, "redirected to another address", msg=p):
                AI.ping(p, lib)
        with self.assertRaisesRegex(AI.ProviderError, "redirected to another address"):
            AI.list_models("anthropic", lib)
        with self.assertRaisesRegex(AI.ProviderError, "redirected to another address"):
            AI.complete({"id": "anthropic", "baseUrl": s.url}, KEY, "s", "u")
        self.assertEqual(elsewhere.requests, [])

    def test_model_and_workspace_stay_one_path_segment(self):
        s = self.stub(
            lambda p: (
                200,
                {
                    "candidates": [{"content": {"parts": [{"text": "OK"}]}}],
                    "textResponse": "OK",
                    "workspaces": [{"name": "Admin", "slug": "../admin"}],
                },
            )
        )
        AI.ping("gemini", self.library(s.url, model=' model="../../evil?x=1"'))
        AI.ping("anythingllm", self.library(s.url, workspace="Admin"))
        self.assertEqual(
            [r["path"] for r in s.requests],
            [
                "/v1beta/models/..%2F..%2Fevil%3Fx%3D1:generateContent",
                "/api/v1/workspaces",
                "/api/v1/workspace/..%2Fadmin/chat",
            ],
        )

    def test_cli_prints_json_or_the_reason(self):
        s = self.stub(lambda p: (200, {"choices": [{"message": {"content": "OK"}}]}))
        lib, out, err = self.library(s.url), io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out):
            self.assertEqual(main(["test-ai", "openai", "--library", lib]), 0)
        r = json.loads(out.getvalue())
        self.assertEqual((r["model"], r["reply"]), ("m-1", "OK"))
        self.assertIsInstance(r["ms"], int)
        with contextlib.redirect_stderr(err):
            self.assertEqual(main(["test-ai", "gemini", "--library", tempfile.mkdtemp()]), 3)
            self.assertEqual(main(["test-ai", "evil", "--library", lib]), 2)
        self.assertIn("save this provider’s settings first", err.getvalue())


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
        AI.set_key(config, "anthropic", f"  {KEY}\n")  # pasted with whitespace: stored stripped
        AI.set_key(config, "openai", "other")
        AI.set_key(config, "openai", None)  # clearing removes the element
        path = os.path.join(config, "ai-keys.xml")
        root = ET.parse(path).getroot()
        self.assertEqual(root.tag, "{urn:chummer-anarchy2:config:1}aikeys")
        self.assertEqual([(k.tag, k.get("provider"), k.text) for k in root], [("key", "anthropic", KEY)])
        self.assertEqual(AI.read_key(config, "anthropic"), KEY)
        self.assertIsNone(AI.read_key(config, "openai"))
        self.assertEqual(os.listdir(config), ["ai-keys.xml"])  # no temp file left behind
        if os.name == "posix":
            self.assertEqual(stat.S_IMODE(os.stat(path).st_mode), 0o600)
        r = node(
            "--input-type=module",
            "-e",
            XSD_CHECK,
            path,
            os.path.join(XSD_DIR, "aikeys.xsd"),
            os.path.join(XSD_DIR, "common.xsd"),
        )
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_providers_file_matches_xsd_and_reads(self):
        config = tempfile.mkdtemp()
        write_providers(config)
        use, providers = AI.read_providers(config)
        self.assertEqual(use, "openai")
        self.assertEqual(providers["anythingllm"]["workspace"], "shadowrun")
        r = node(
            "--input-type=module",
            "-e",
            XSD_CHECK,
            os.path.join(config, "ai-providers.xml"),
            os.path.join(XSD_DIR, "aiproviders.xsd"),
            os.path.join(XSD_DIR, "common.xsd"),
        )
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

    def test_set_settings_clears_the_key_when_the_address_changes(self):
        config = tempfile.mkdtemp()
        body = (
            '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" use="openai">{}</ca2:aiproviders>'
        )
        self.assertEqual(
            AI.set_settings(
                config, body.format('<provider id="openai" enabled="true" baseUrl="https://api.openai.com/v1"/>')
            ),
            [],
        )
        AI.set_key(config, "openai", KEY)
        AI.set_key(config, "anthropic", "a-key")
        same = '<provider id="openai" enabled="true" baseUrl="https://api.openai.com/v1"/><provider id="anthropic" enabled="false"/>'
        self.assertEqual(AI.set_settings(config, body.format(same)), [])
        self.assertEqual(AI.read_key(config, "openai"), KEY)
        # the parse differentials that fooled the old regex check: single quotes, a commented-out copy, a char reference
        for evil in [
            '<provider id="openai" enabled="true" baseUrl=\'https://evil.example\'/>'
            '<!-- <provider id="openai" baseUrl="https://api.openai.com/v1"/> -->',
            '<provider id="&#111;penai" enabled="true" baseUrl="https://evil.example"/>',
        ]:
            AI.set_settings(config, body.format(same))
            AI.set_key(config, "openai", KEY)
            self.assertEqual(AI.set_settings(config, body.format(evil)), ["openai"])
            self.assertIsNone(AI.read_key(config, "openai"))
            self.assertEqual(AI.read_providers(config)[1]["openai"]["baseUrl"], "https://evil.example")
        self.assertEqual(AI.read_key(config, "anthropic"), "a-key")
        AI.set_key(config, "openai", KEY)  # dropping the address (back to the default host) is a change too
        self.assertEqual(AI.set_settings(config, body.format('<provider id="openai" enabled="true"/>')), ["openai"])
        r = node(
            "--input-type=module",
            "-e",
            XSD_CHECK,
            os.path.join(config, "ai-providers.xml"),
            os.path.join(XSD_DIR, "aiproviders.xsd"),
            os.path.join(XSD_DIR, "common.xsd"),
        )
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_set_settings_refuses_what_the_app_never_writes(self):
        config = tempfile.mkdtemp()
        ok = '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"{}>{}</ca2:aiproviders>'
        for root, rows in [
            ("", '<provider id="openai" enabled="true"/><provider id="openai" enabled="true" baseUrl="https://x"/>'),
            ("", '<provider id="evil" enabled="true"/>'),
            ("", '<provider id="openai" enabled="yes"/>'),
            ("", '<provider id="openai" enabled="true" apiBase="https://x"/>'),
            ("", '<key provider="openai">k</key>'),
            ("", '<provider id="openai" enabled="true">text</provider>'),
            ("", '<provider id="openai" enabled="true" baseUrl="file:///etc/passwd"/>'),
            ("", '<provider id="openai" enabled="true" baseUrl="http:///no-host"/>'),
            (' use="evil"', ""),
            (' version="0"', ""),
        ]:
            with self.assertRaises(AI.SettingsError, msg=rows or root):
                AI.set_settings(config, ok.format(root, rows).replace('version="1" version="0"', 'version="0"'))
        for bad in [
            '<!DOCTYPE x [<!ENTITY a "b">]><ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"/>',
            '<aiproviders version="1"/>',
            "<not xml",
        ]:
            with self.assertRaises(AI.SettingsError, msg=bad):
                AI.set_settings(config, bad)
        self.assertFalse(os.path.exists(os.path.join(config, "ai-providers.xml")))
        # and a call never reads a file: or ftp: address saved by hand
        for url in ("file:///etc/passwd", "ftp://example.test/x"):
            with self.assertRaises(AI.ProviderError, msg=url):
                AI.complete({"id": "openai", "baseUrl": url, "model": "m"}, "", "s", "u")

    def test_cli_set_settings(self):
        lib = tempfile.mkdtemp()
        body = '<ca2:aiproviders xmlns:ca2="urn:chummer-anarchy2:config:1" version="1"><provider id="gemini" enabled="true"{}/></ca2:aiproviders>'
        out = io.StringIO()
        with unittest.mock.patch(
            "sys.stdin", io.TextIOWrapper(io.BytesIO(body.format("").encode()))
        ), contextlib.redirect_stdout(out):
            self.assertEqual(main(["set-settings", "--library", lib]), 0)
        AI.set_key(os.path.join(lib, ".config"), "gemini", KEY)
        with unittest.mock.patch(
            "sys.stdin", io.TextIOWrapper(io.BytesIO(body.format(' baseUrl="https://x"').encode()))
        ), contextlib.redirect_stdout(out):
            self.assertEqual(main(["set-settings", "--library", lib]), 0)
        self.assertIn('<result cleared="gemini" />', out.getvalue())
        err = io.StringIO()
        with unittest.mock.patch("sys.stdin", io.TextIOWrapper(io.BytesIO(b"<x/>"))), contextlib.redirect_stderr(err):
            self.assertEqual(main(["set-settings", "--library", lib]), 3)
        self.assertIn("aiproviders", err.getvalue())

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
        {
            "name": "Neural Spoon",
            "type": "cyberware",
            "printedRating": 2,
            "page": 2,
            "effects": [
                {"ref": "rr-spec", "param": "athletics.climbing", "value": None, "note": None},
                {"ref": "rr-spec", "param": "custom:stirring", "value": None, "note": None},
            ],
        },
        {
            "name": "Glitter Gland",
            "type": "bioware",
            "printedRating": None,
            "page": 3,
            "effects": [{"ref": "sparkle-boost", "param": None, "value": None, "note": None}],
        },
    ],
    "items": [
        {
            "name": "Tin Spoon",
            "kind": "gear",
            "category": "Kitchen",
            "page": 2,
            "dv": None,
            "armor": None,
            "ranges": None,
        }
    ],
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
        self.assertEqual(
            [(p.get("id"), p.get("kind"), p.get("state"), p.get("page")) for p in props],
            [
                ("amp.neural-spoon", "amp", "pending", "2"),
                ("amp.glitter-gland", "amp", "pending", "3"),
                ("gear.gear-tin-spoon", "gear", "pending", "2"),
                ("spell.spell-stir", "spell", "pending", "2"),
            ],
        )
        self.assertEqual(props[0].findall("note"), [])
        self.assertEqual([n.text for n in props[1].findall("note")], ['unknown effect ref "sparkle-boost"'])
        amp = props[0].find("amp")
        self.assertEqual(
            (amp.get("id"), amp.get("type"), amp.get("printedRating"), amp.get("source")),
            ("neural-spoon", "cyberware", "2", "MADE-UP"),
        )
        self.assertEqual([e.get("param") for e in amp.findall("effect")], ["athletics.climbing", "custom:stirring"])
        self.assertEqual(xmlio.ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "review")
        # review.xml matches its XSD; each proposed entry is valid data for its kind
        r = node(
            "--input-type=module",
            "-e",
            XSD_CHECK,
            path,
            os.path.join(XSD_DIR, "review.xsd"),
            os.path.join(XSD_DIR, "common.xsd"),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        for p, kind, xsd in (
            (props[0], "amps", "amps.xsd"),
            (props[2], "gear", "items.xsd"),
            (props[3], "spells", "items.xsd"),
        ):
            f = os.path.join(book, f"check-{kind}.xml")
            xmlio.write_file(
                f,
                f'<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="{kind}" version="1">'
                + ET.tostring(p[0], encoding="unicode")
                + "</ca2:data>",
            )
            r = node(
                "--input-type=module",
                "-e",
                XSD_CHECK,
                f,
                os.path.join(XSD_DIR, xsd),
                os.path.join(XSD_DIR, "common.xsd"),
            )
            self.assertEqual(r.returncode, 0, r.stderr)

    def test_validation_rules(self):
        m = P.mechanics()
        notes = P.amp_notes(
            {
                "type": "nope",
                "effects": [
                    {"ref": "rr-spec", "param": "athletics.nope"},
                    {"ref": "rr-skill", "param": "nope"},
                    {"ref": "rr-attr", "param": "nope"},
                    {"ref": "rr-attr", "param": "str"},
                    {"ref": "rr-spec", "param": None},
                ],
            },
            m,
        )
        self.assertEqual(
            notes,
            [
                'unknown amp type "nope"',
                'unknown specialization "athletics.nope" for rr-spec',
                'unknown skill "nope" for rr-skill',
                'unknown attribute "nope" for rr-attr',
            ],
        )

    def book(self, md=BOOK, name="b"):
        book = os.path.join(tempfile.mkdtemp(), name)
        xmlio.write_file(os.path.join(book, "book.md"), md)
        return book

    def review(self, book):
        path = os.path.join(book, "review.xml")
        r = node(
            "--input-type=module",
            "-e",
            XSD_CHECK,
            path,
            os.path.join(XSD_DIR, "review.xsd"),
            os.path.join(XSD_DIR, "common.xsd"),
        )
        self.assertEqual(r.returncode, 0, r.stderr)
        return ET.parse(path).getroot()

    def test_parse_needs_one_of_our_keys(self):
        self.assertIsNone(P.parse('{"note": {"amps": []}}'))  # no nested dict, no dict without our keys
        self.assertEqual(P.parse('Here: {"x": {"y": 1}} and {"spells": []}'), {"spells": []})

    def test_unusable_and_cut_off_replies_are_skipped_with_a_note(self):
        for ask, why in (
            (lambda s, u: '{"answer": "none"}', "no JSON with amps"),
            (lambda s, u: (_ for _ in ()).throw(AI.TruncatedReply("the reply was cut off")), "cut off"),
        ):
            book = self.book()
            P.propose(book, ask)
            root = self.review(book)
            self.assertEqual([(x.tag, x.get("part")) for x in root], [("skip", "1")])
            self.assertIn(why, root[0].text)
            self.assertEqual((root.get("parts"), root.get("done")), ("1", "1"))

    def test_hostile_model_values_stay_inert(self):
        hostile = {
            "items": [
                {"name": "R&D <kit>", "kind": 'gear" state="accepted', "category": "A&B", "page": 2},
                {"name": "Null kind", "kind": None, "page": 2},
                {"name": ["a", "list"], "kind": ["weapon"], "page": "7", "dv": {"x": 1}},
                {"name": "Ctl\x00\x1b chars\x08", "kind": "armor", "armor": True, "page": 2},
            ],
            "spells": [{"name": "Odd", "category": "cooking", "page": 2}],
            "complexForms": [{"name": "Hum", "category": "instant", "page": 2}],
            "amps": [
                {"name": "Bad shapes", "type": "cyberware", "printedRating": True, "page": 2, "effects": "rr-spec"},
                {
                    "name": "Mixed",
                    "type": "cyberware",
                    "printedRating": "3",
                    "page": 2,
                    "effects": [1, {"ref": ["rr-spec"], "param": {"p": 1}}, {"ref": "rr-attr", "param": 5}],
                },
            ],
        }
        book = self.book()
        P.propose(book, lambda s, u: json.dumps(hostile))
        root = self.review(book)
        props = {p.get("id"): p for p in root.findall("proposal")}
        self.assertEqual(
            sorted(props),
            [
                "amp.bad-shapes",
                "amp.mixed",
                "armor.ctl-chars",
                "complex-form.cf-hum",
                "gear.gear-null-kind",
                "gear.gear-r-d-kit",
                "gear.gear-unnamed",
                "spell.spell-odd",
            ],
        )
        self.assertTrue(all(p.get("state") == "pending" for p in props.values()))
        rd = props["gear.gear-r-d-kit"]
        self.assertEqual(
            (rd.get("kind"), rd[0].get("kind"), rd[0].findtext("name"), rd[0].get("category")),
            ("gear", "gear", "R&D <kit>", "A&B"),
        )
        self.assertEqual(
            [n.text for n in rd.findall("note")], ['unknown item kind "gear" state="accepted"; proposed as gear']
        )
        self.assertEqual(
            [n.text for n in props["gear.gear-null-kind"].findall("note")],
            ['unknown item kind "None"; proposed as gear'],
        )
        lst = props["gear.gear-unnamed"]
        self.assertEqual((lst.get("page"), lst[0].get("dv")), ("1", None))  # page "7" is text: the part's first page
        self.assertEqual(props["armor.ctl-chars"][0].findtext("name"), "Ctl chars")
        self.assertIsNone(props["armor.ctl-chars"][0].get("armor"))
        self.assertEqual(
            [n.text for n in props["spell.spell-odd"].findall("note")], ['unknown spell category "cooking"']
        )
        self.assertEqual(props["complex-form.cf-hum"].findall("note"), [])
        self.assertEqual(
            [n.text for n in props["amp.bad-shapes"].findall("note")],
            ["effects isn’t a list; dropped", 'printedRating "True" isn’t a whole number; dropped'],
        )
        self.assertEqual(
            [n.text for n in props["amp.mixed"].findall("note")],
            [
                "an effect isn’t an object; dropped",
                'printedRating "3" isn’t a whole number; dropped',
                'unknown effect ref "None"',
                'unknown attribute "5" for rr-attr',
            ],
        )

    def test_a_finished_review_is_kept_unless_fresh(self):
        book = self.book()
        P.propose(book, lambda s, u: json.dumps(TWO_AMPS))
        path = os.path.join(book, "review.xml")
        xmlio.write_file(path, Path(path).read_text(encoding="utf8").replace('state="pending"', 'state="accepted"', 1))
        asked = []
        self.assertEqual(P.propose(book, lambda s, u: asked.append(1) or '{"amps": []}'), 4)
        self.assertEqual(asked, [])  # nothing sent, the decision kept
        self.assertIn('state="accepted"', Path(path).read_text(encoding="utf8"))
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "review")
        self.assertEqual(P.propose(book, lambda s, u: asked.append(1) or '{"amps": []}', fresh=True), 0)
        self.assertEqual((asked, self.review(book).findall("proposal")), ([1], []))

    def test_checkpoints_and_resumes_after_a_failure(self):
        md = BOOK + "\n# Second part\n" + ("filler text " * 990) + "\n"
        self.assertEqual(len(P.chunks(md)), 2)
        book = self.book(md)
        self.assertEqual(P.count_chunks(os.path.join(book, "book.md")), 2)
        calls = []

        def flaky(s, u):
            calls.append(u)
            if len(calls) == 2:
                raise AI.ProviderError("rate limited")
            return json.dumps(TWO_AMPS)

        with self.assertRaises(AI.ProviderError):
            P.propose(book, flaky)
        root = self.review(book)
        self.assertEqual((root.get("parts"), root.get("done"), len(root.findall("proposal"))), ("2", "1", 4))
        calls.clear()
        P.propose(book, lambda s, u: calls.append(u) or json.dumps({"amps": [TWO_AMPS["amps"][0]]}))
        self.assertEqual(len(calls), 1)
        self.assertIn("filler", calls[0])  # only the unfinished part is asked again
        root = self.review(book)
        self.assertEqual(root.get("done"), "2")
        self.assertEqual([p.get("id") for p in root.findall("proposal")][-1], "amp.neural-spoon-2")
        # a finished review starts over only when asked to
        P.propose(book, lambda s, u: json.dumps({"amps": []}), fresh=True)
        self.assertEqual(len(self.review(book).findall("proposal")), 0)

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
            self.assertEqual(main(["propose", book, "--library", lib, "--dry-run"]), 0)
        self.assertEqual(out.getvalue().strip(), '<result parts="1" provider="openai" />')
        self.assertEqual(s.requests, [])  # a dry run asks nothing
        self.assertFalse(os.path.exists(os.path.join(book, "review.xml")))
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(main(["propose", book, "--library", lib]), 0)
        self.assertEqual(out.getvalue().strip(), '<result state="review" proposals="4" />')
        self.assertEqual(len(ET.parse(os.path.join(book, "review.xml")).getroot()), 4)
        self.assertEqual(ET.parse(os.path.join(book, "review.xml")).getroot().get("provider"), "openai")
        self.assertNotIn(KEY, Path(book, "review.xml").read_text(encoding="utf8"))


class ApplyReviewTest(unittest.TestCase):
    def _reviewed(self):
        lib = tempfile.mkdtemp()
        book, custom = os.path.join(lib, "made-up"), os.path.join(tempfile.mkdtemp(), "custom")
        xmlio.write_file(os.path.join(book, "book.md"), BOOK)
        xmlio.write_import(book, file="made-up.pdf", sha256="ab" * 32, converter="6", pages=1, score="0.00")
        P.propose(book, lambda s, u: json.dumps(TWO_AMPS))
        path = os.path.join(book, "review.xml")
        tree = ET.parse(path)
        states = {"amp.neural-spoon": "accepted", "amp.glitter-gland": "dropped", "gear.gear-tin-spoon": "edited"}
        for p in tree.getroot().findall("proposal"):
            p.set("state", states.get(p.get("id"), "pending"))
            if p.get("id") == "gear.gear-tin-spoon":
                p.find("item/name").text = "Tin Spoon (edited)"
        tree.write(path, encoding="utf8")
        return lib, book, custom, path

    def _apply(self, book, custom, source="MADE"):
        with contextlib.redirect_stdout(io.StringIO()):
            return main(
                [
                    "apply-review",
                    book,
                    "--custom",
                    custom,
                    "--source",
                    source,
                    "--name",
                    "Made-up Gear",
                    "--canon",
                    "false",
                ]
            )

    def test_accepted_and_edited_proposals_become_the_overlay(self):
        lib, book, custom, path = self._reviewed()
        self.assertEqual(self._apply(book, custom), 0)
        imported = os.path.join(custom, "imported")
        amps = Path(imported, "made", "amps.xml").read_text(encoding="utf8")
        self.assertIn('<amp id="made.neural-spoon"', amps)
        self.assertIn('source="MADE"', amps)
        self.assertNotIn("glitter", amps)
        self.assertIn("Tin Spoon (edited)", Path(imported, "made", "gear.xml").read_text(encoding="utf8"))
        self.assertFalse(os.path.exists(os.path.join(imported, "made", "spells.xml")))  # still pending
        self.assertIn("made/amps.xml", Path(imported, "index.xml").read_text(encoding="utf8"))
        src = ET.parse(os.path.join(imported, "sources.xml")).getroot()[0]
        self.assertEqual(
            (src.get("id"), src.get("canon"), src.findtext("name"), src.get("file")),
            ("MADE", "false", "Made-up Gear", "made-up.pdf"),
        )
        imp = ET.parse(os.path.join(book, "import.xml")).getroot()
        self.assertEqual((imp.get("recipe"), imp.get("source")), ("ai", "MADE"))
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "done")
        r = node("tools/validate-data.mjs", MINI, imported)  # the made-up core files, then the overlay
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        for f, xsd in [
            (os.path.join(imported, "sources.xml"), "sources.xsd"),
            (os.path.join(book, "import.xml"), "import.xsd"),
        ]:
            r = node(
                "--input-type=module",
                "-e",
                XSD_CHECK,
                f,
                os.path.join(XSD_DIR, xsd),
                os.path.join(XSD_DIR, "common.xsd"),
            )
            self.assertEqual(r.returncode, 0, f"{f}: {r.stderr}")

        # a second apply replaces the first: the gear dropped now, its file goes
        tree = ET.parse(path)
        tree.getroot().find("proposal[@id='gear.gear-tin-spoon']").set("state", "dropped")
        tree.write(path, encoding="utf8")
        self.assertEqual(self._apply(book, custom), 0)
        self.assertFalse(os.path.exists(os.path.join(imported, "made", "gear.xml")))
        self.assertTrue(os.path.exists(os.path.join(imported, "made", "amps.xml")))

    def test_a_second_apply_never_shows_removed_midway(self):
        lib, book, custom, _ = self._reviewed()
        self.assertEqual(self._apply(book, custom), 0)
        seen, write = [], xmlio.write_status
        with unittest.mock.patch.object(xmlio, "write_status", lambda d, s, m="": seen.append(s) or write(d, s, m)):
            self.assertEqual(self._apply(book, custom), 0)
        self.assertEqual(seen, ["applying", "done"])

    def test_a_source_id_another_book_uses_is_refused(self):
        lib, book, custom, _ = self._reviewed()
        xmlio.write_import(
            os.path.join(lib, "other"), file="o.pdf", sha256="cd", converter="6", pages=1, score="1.00", source="CRB"
        )
        with self.assertRaises(ValueError):
            self._apply(book, custom, "CRB")
        self.assertEqual(ET.parse(os.path.join(book, "status.xml")).getroot().get("state"), "failed")
        self.assertFalse(os.path.exists(os.path.join(custom, "imported", "crb")))
        with self.assertRaises(ValueError):
            self._apply(book, custom, "../x")

    def test_entries_failing_the_checks_are_skipped_and_reported(self):
        lib, book, custom, path = self._reviewed()
        tree = ET.parse(path)
        root = tree.getroot()
        root.find("proposal[@id='amp.glitter-gland']").set("state", "accepted")  # unknown effect ref "sparkle-boost"
        spell = root.find("proposal[@id='spell.spell-stir']")
        spell.set("state", "edited")
        spell.find("item").set("category", "cooking")
        tree.write(path, encoding="utf8")
        self.assertEqual(self._apply(book, custom), 0)
        amps = Path(custom, "imported", "made", "amps.xml").read_text(encoding="utf8")
        self.assertIn("made.neural-spoon", amps)
        self.assertNotIn("glitter", amps)
        self.assertFalse(os.path.exists(os.path.join(custom, "imported", "made", "spells.xml")))
        rows = {
            r.get("proposal"): r.get("problem")
            for r in ET.parse(os.path.join(book, "import.xml")).getroot().iter("row")
        }
        self.assertEqual(
            rows,
            {
                "amp.glitter-gland": 'unknown effect ref "sparkle-boost"',
                "spell.spell-stir": 'unknown spell category "cooking"',
            },
        )
        self.assertIn("2 skipped", ET.parse(os.path.join(book, "status.xml")).getroot().text)

    def test_a_source_id_in_the_users_own_sources_is_refused(self):
        lib, book, custom, _ = self._reviewed()
        xmlio.write_file(
            os.path.join(custom, "sources.xml"),
            '<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="sources" version="1">'
            '<source id="HOUSE" publisher="Me" canon="false"><name>House rules</name></source></ca2:data>',
        )
        with self.assertRaises(ValueError):
            self._apply(book, custom, "HOUSE")

    def test_cli_set_key_reads_the_key_from_stdin(self):
        lib = tempfile.mkdtemp()
        with unittest.mock.patch("sys.stdin", io.StringIO(KEY + "\n")):
            self.assertEqual(main(["set-key", lib, "anthropic"]), 0)
        self.assertEqual(AI.read_key(os.path.join(lib, ".config"), "anthropic"), KEY)
        with unittest.mock.patch("sys.stdin", io.StringIO("")):
            self.assertEqual(main(["set-key", lib, "anthropic"]), 0)
        self.assertIsNone(AI.read_key(os.path.join(lib, ".config"), "anthropic"))
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main(["set-key", lib, "evil"]), 2)


if __name__ == "__main__":
    unittest.main()
