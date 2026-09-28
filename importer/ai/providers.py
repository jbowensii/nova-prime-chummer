"""AI providers for unknown books, and their settings files in library/.config:
  ai-providers.xml  the choices (use, enabled, baseUrl, model, workspace)
  ai-keys.xml       the API keys and nothing else (mode 600), read only at call time
Anthropic goes through the official SDK; the others are plain HTTP with urllib.
Errors raise ProviderError with a plain message that never contains a key."""
import contextlib
import json
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

import anthropic

from importer import xmlio

NS = "urn:chummer-anarchy2:config:1"
TIMEOUT = 120
LIST_TIMEOUT = 20  # model lists: fail well inside the server's 60 s cap
ANTHROPIC_TIMEOUT = 600  # a 16k-token structured reply can take minutes
DEFAULT_MODEL = {"anthropic": "claude-opus-5", "gemini": "gemini-2.5-pro"}
GEMINI_URL = "https://generativelanguage.googleapis.com"


class ProviderError(Exception):
    pass


class TruncatedReply(ProviderError):
    """The reply hit the output token limit; its JSON is incomplete."""


def read_providers(config_dir):
    """(use, {id: attributes}) from ai-providers.xml."""
    root = ET.parse(os.path.join(config_dir, "ai-providers.xml")).getroot()
    return root.get("use"), {p.get("id"): dict(p.attrib) for p in root.findall("provider")}


PROVIDER_IDS = ("anthropic", "openai", "gemini", "anythingllm")
PROVIDER_ATTRS = {"id", "enabled", "baseUrl", "model", "workspace"}


class SettingsError(ValueError):
    """The ai-providers.xml a client sent is not one this app writes."""


def _parse_settings(text):
    """(root attributes, {id: attributes}) of an ai-providers.xml body, checked as aiproviders.xsd would; else SettingsError."""
    if re.search(r"<!DOCTYPE|<!ENTITY", text, re.I):
        raise SettingsError("a DTD isn’t allowed in the provider settings")
    try:
        root = ET.fromstring(text.encode("utf8"))
    except ET.ParseError as e:
        raise SettingsError(f"the provider settings aren’t well-formed XML ({e})") from None
    if root.tag != f"{{{NS}}}aiproviders":
        raise SettingsError("body is not a ca2:aiproviders document")
    if set(root.attrib) - {"version", "use"} or not (root.get("version") or "").isdigit() or int(root.get("version")) < 1:
        raise SettingsError("aiproviders takes version (a positive number) and use only")
    if root.get("use") is not None and root.get("use") not in PROVIDER_IDS:
        raise SettingsError(f"use “{root.get('use')}” isn’t a known provider")
    if (root.text or "").strip():
        raise SettingsError("aiproviders holds provider elements only")
    out = {}
    for p in root:
        if p.tag == "key" or p.tag.endswith("}key"):
            raise SettingsError("provider settings only; keys go to /api/ai-keys")
        if p.tag != "provider" or len(p) or (p.text or "").strip() or (p.tail or "").strip():
            raise SettingsError("aiproviders holds empty provider elements only")
        if set(p.attrib) - PROVIDER_ATTRS:
            raise SettingsError(f"unknown provider attribute “{sorted(set(p.attrib) - PROVIDER_ATTRS)[0]}”")
        pid = p.get("id")
        if pid not in PROVIDER_IDS:
            raise SettingsError(f"“{pid}” isn’t a known provider")
        if pid in out:
            raise SettingsError(f"provider “{pid}” is listed twice")
        if p.get("enabled") not in ("true", "false", "1", "0"):
            raise SettingsError(f"provider “{pid}” needs enabled=\"true\" or \"false\"")
        out[pid] = dict(p.attrib)
    return dict(root.attrib), out


def set_settings(config_dir, text):
    """Check and save ai-providers.xml. A key is only sent to the address it was entered for: a provider
    whose base URL differs from the saved one (missing = empty) has its key cleared first. The same parser
    that later reads the file for a call decides here. Returns the providers whose keys were cleared."""
    attrs, new = _parse_settings(text)
    path = os.path.join(config_dir, "ai-providers.xml")
    try:
        old = read_providers(config_dir)[1] if os.path.exists(path) else {}
    except ET.ParseError:
        old = {}  # unreadable, so no key went anywhere by it: any non-empty URL now counts as changed
    keys = _keys(config_dir)
    url = lambda ps, p: (ps.get(p) or {}).get("baseUrl") or ""  # noqa: E731
    cleared = [p for p in PROVIDER_IDS if url(old, p) != url(new, p) and keys.get(p)]
    for p in cleared:
        set_key(config_dir, p, "")
    q = lambda v: '"' + escape(v, {'"': "&quot;"}) + '"'  # noqa: E731
    root = "".join(f" {k}={q(v)}" for k, v in attrs.items())
    rows = "".join("  <provider" + "".join(f" {k}={q(v)}" for k, v in p.items()) + "/>\n" for p in new.values())
    xmlio.write_file(path, f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aiproviders xmlns:ca2="{NS}"{root}>\n{rows}</ca2:aiproviders>\n')
    return cleared


def _keys(config_dir):
    p = os.path.join(config_dir, "ai-keys.xml")
    return {k.get("provider"): (k.text or "").strip() for k in ET.parse(p).getroot().findall("key")} if os.path.exists(p) else {}


def read_key(config_dir, provider):
    return _keys(config_dir).get(provider) or None


def set_key(config_dir, provider, key):
    """Set (or with an empty key, remove) one provider's key; the file is rewritten atomically, mode 600."""
    keys = _keys(config_dir)
    keys.pop(provider, None)
    key = (key or "").strip()
    if key:
        keys[provider] = key
    body = "".join(f"  <key provider={quoteattr(p)}>{escape(k)}</key>\n" for p, k in sorted(keys.items()))
    os.makedirs(config_dir, exist_ok=True)
    path = os.path.join(config_dir, "ai-keys.xml")
    fd, tmp = tempfile.mkstemp(dir=config_dir, prefix=".ai-keys.", suffix=".tmp")  # O_EXCL, mode 600
    try:
        with os.fdopen(fd, "w", encoding="utf8", newline="\n") as f:
            f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aikeys xmlns:ca2="{NS}" version="1">\n{body}</ca2:aikeys>\n')
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)  # on Windows this only clears read-only; the folder's ACL protects the file
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


def call(config_dir, system, user, schema=None):
    """Ask the provider ai-providers.xml says to use; its key is read now, never cached."""
    if not os.path.exists(os.path.join(config_dir, "ai-providers.xml")):
        raise ProviderError("AI settings aren’t set up yet")
    use, providers = read_providers(config_dir)
    p = providers.get(use)
    if not p or p.get("enabled") != "true":
        raise ProviderError(f"the AI provider “{use}” isn’t enabled")
    key = read_key(config_dir, use) or ""
    if not key and use in ("anthropic", "gemini"):
        raise ProviderError(f"no API key is set for {use}")
    return complete(p, key, system, user, schema)


def complete(provider, key, system, user, schema=None):
    """The model's text reply. `schema` (JSON Schema) is enforced where the provider supports it."""
    pid, key = provider.get("id"), (key or "").strip()
    model = provider.get("model") or DEFAULT_MODEL.get(pid, "")
    try:
        if pid == "anthropic":
            return _anthropic(provider, key, model, system, user, schema)
        if pid == "openai":
            body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "response_format": {"type": "json_object"}}  # servers without JSON mode ignore it; propose tolerates prose
            out = _request(provider["baseUrl"].rstrip("/") + "/chat/completions", _bearer(key), body)
            if out["choices"][0].get("finish_reason") == "length":
                raise TruncatedReply("the reply was cut off at the model’s output limit")
            return out["choices"][0]["message"]["content"]
        if pid == "gemini":
            url = f"{(provider.get('baseUrl') or GEMINI_URL).rstrip('/')}/v1beta/models/{urllib.parse.quote(model)}:generateContent"
            body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}],
                    "generationConfig": {"responseMimeType": "application/json"}}
            out = _request(url, {"x-goog-api-key": key}, body)  # header, not ?key=: URLs end up in logs
            if out["candidates"][0].get("finishReason") == "MAX_TOKENS":
                raise TruncatedReply("the reply was cut off at the model’s output limit")
            return "".join(p.get("text", "") for p in out["candidates"][0]["content"]["parts"])
        if pid == "anythingllm":
            url = f"{provider['baseUrl'].rstrip('/')}/api/v1/workspace/{urllib.parse.quote(provider['workspace'])}/chat"
            return _request(url, _bearer(key), {"message": f"{system}\n\n{user}", "mode": "chat"})["textResponse"]
    except ProviderError as e:
        raise type(e)(_redact(str(e), key)) from None
    except (KeyError, IndexError, TypeError) as e:
        raise ProviderError(f"{pid} sent an answer in an unexpected shape (missing {e})") from None
    raise ProviderError(f"unknown provider “{pid}”")


def list_models(provider_id, library_dir):
    """The model ids a provider offers, sorted. Asked with the saved key at the saved address only: an address
    from a request could send the key anywhere. The providers file is read before the key, so a settings save
    that changes the address (it clears the key first) never pairs the new address with the old key."""
    config = os.path.join(library_dir, ".config")
    if provider_id == "anythingllm":
        raise ProviderError("this provider has no model list")
    if provider_id not in PROVIDER_IDS:
        raise ProviderError(f"unknown provider “{provider_id}”")
    saved = read_providers(config)[1] if os.path.exists(os.path.join(config, "ai-providers.xml")) else {}
    p = saved.get(provider_id) or {}
    key = read_key(config, provider_id) or ""
    if not key and provider_id != "openai":  # a local OpenAI-compatible server may need none
        raise ProviderError(f"no API key is set for {provider_id}")
    try:
        if provider_id == "anthropic":
            client = anthropic.Anthropic(api_key=key, base_url=p.get("baseUrl") or None, timeout=LIST_TIMEOUT, max_retries=0)
            with _anthropic_errors():
                ids = [m.id for m in client.models.list()]  # the SDK pages through all of them
        elif provider_id == "openai":
            if not p.get("baseUrl"):
                raise ProviderError("save the address first")
            ids = [m["id"] for m in _request(p["baseUrl"].rstrip("/") + "/models", _bearer(key), timeout=LIST_TIMEOUT)["data"]]
        else:  # ponytail: one page of 1000; Gemini offers a few dozen models, follow nextPageToken if that changes
            out = _request(f"{(p.get('baseUrl') or GEMINI_URL).rstrip('/')}/v1beta/models?pageSize=1000", {"x-goog-api-key": key}, timeout=LIST_TIMEOUT)
            ids = [m["name"].removeprefix("models/") for m in out.get("models", [])
                   if "generateContent" in m.get("supportedGenerationMethods", [])]
    except ProviderError as e:
        raise ProviderError(_redact(str(e), key)) from None
    except (KeyError, IndexError, TypeError, AttributeError) as e:
        raise ProviderError(f"{provider_id} sent a model list in an unexpected shape (missing {e})") from None
    return sorted(set(ids))


def _redact(text, key):
    return text.replace(key, "[key]") if key else text


def _bearer(key):
    return {"Authorization": f"Bearer {key}"} if key else {}


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    """urllib would resend the key headers to whatever host a 30x names (even over plain http)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProviderError("the provider redirected to another address; check the address")


_OPENER = urllib.request.build_opener(_NoRedirects)


def _request(url, headers, body=None, timeout=TIMEOUT):
    """POST `body` as JSON (without one: GET) and return the JSON reply. Redirects are refused."""
    host = urllib.parse.urlsplit(url).netloc
    data = None if body is None else json.dumps(body).encode("utf8")
    req = urllib.request.Request(url, data, {"Content-Type": "application/json", **headers}, method="GET" if data is None else "POST")
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise ProviderError(f"{host} answered HTTP {e.code}: {e.read(500).decode('utf8', 'replace')}") from None
    except (urllib.error.URLError, OSError) as e:
        raise ProviderError(f"couldn’t reach {host}: {getattr(e, 'reason', e)}") from None
    except ValueError:
        raise ProviderError(f"{host} didn’t answer with JSON") from None


@contextlib.contextmanager
def _anthropic_errors():
    try:
        yield
    except anthropic.AuthenticationError:
        raise ProviderError("Anthropic didn’t accept the API key") from None
    except anthropic.RateLimitError:
        raise ProviderError("Anthropic is rate limiting this key; try again later") from None
    except anthropic.APIStatusError as e:
        raise ProviderError(f"Anthropic answered HTTP {e.status_code}: {e.message}") from None
    except anthropic.APIConnectionError:
        raise ProviderError("couldn’t reach Anthropic") from None


def _anthropic(provider, key, model, system, user, schema):
    client = anthropic.Anthropic(api_key=key, base_url=provider.get("baseUrl") or None, timeout=ANTHROPIC_TIMEOUT)
    extra = {"output_config": {"format": {"type": "json_schema", "schema": schema}}} if schema else {}
    with _anthropic_errors():
        resp = client.beta.messages.create(
            model=model, max_tokens=16000, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],  # same for every chunk
            messages=[{"role": "user", "content": user}], **extra)
    if resp.stop_reason == "refusal":
        raise ProviderError("declined: the model refused this part of the book")
    if resp.stop_reason == "max_tokens":
        raise TruncatedReply("the reply was cut off at the model’s output limit")
    return next((b.text for b in resp.content if b.type == "text"), "")
