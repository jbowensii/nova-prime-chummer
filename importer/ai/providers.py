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
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
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
PING = "Reply with the single word OK."
GEMINI_THINKING = 512  # a capped call's thinking budget: 2.5 Pro needs at least 128, Flash-Lite 512 when it thinks
# a capped call's max_completion_tokens is this many times max_tokens: reasoning models count their thinking in it
OPENAI_CAP = 4
PING_TIMEOUT = 25  # a connection test: fail well inside the server's 30 s cap
# what a status means for a connection test (the provider's own words stay out: they may be long, or echo a header)
HTTP_SAYS = {
    401: "the provider didn’t accept the API key",
    403: "the provider didn’t accept the API key",
    404: "the address, model or workspace wasn’t found",
    429: "the provider is rate limiting this key; try again later",
}


class ProviderError(Exception):
    """A provider call that failed: unreachable, refused, or answered with an error."""


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
    """(root attributes, {id: attributes}) of an ai-providers.xml body, checked as aiproviders.xsd would; else
    SettingsError."""
    if re.search(r"<!DOCTYPE|<!ENTITY", text, re.I):
        raise SettingsError("a DTD isn’t allowed in the provider settings")
    try:
        root = ET.fromstring(text.encode("utf8"))
    except ET.ParseError as e:
        raise SettingsError(f"the provider settings aren’t well-formed XML ({e})") from None
    if root.tag != f"{{{NS}}}aiproviders":
        raise SettingsError("body is not a ca2:aiproviders document")
    if (
        set(root.attrib) - {"version", "use"}
        or not (root.get("version") or "").isdigit()
        or int(root.get("version")) < 1
    ):
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
            raise SettingsError(f'provider “{pid}” needs enabled="true" or "false"')
        if p.get("baseUrl") and not _web_url(p.get("baseUrl")):
            raise SettingsError(f"provider “{pid}”: the address is an http:// or https:// URL with a host")
        out[pid] = dict(p.attrib)
    return dict(root.attrib), out


def set_settings(config_dir, text):
    """Check and save ai-providers.xml. A key is only sent to the address it was entered for: a provider
    whose base URL differs from the saved one (missing = empty) has its key cleared first. The same parser
    that later reads the file for a call decides here. Returns the providers whose keys were cleared."""
    attrs, new = _parse_settings(text)
    path = os.path.join(config_dir, "ai-providers.xml")
    # saved settings that can't be read count as none: no key went anywhere by them, so any non-empty URL is a change
    cleared = clear_moved_keys(config_dir, saved_providers(config_dir) or {}, new)

    def q(v):
        return '"' + escape(v, {'"': "&quot;"}) + '"'

    root = "".join(f" {k}={q(v)}" for k, v in attrs.items())
    rows = "".join("  <provider" + "".join(f" {k}={q(v)}" for k, v in p.items()) + "/>\n" for p in new.values())
    xmlio.write_file(
        path,
        f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aiproviders xmlns:ca2="{NS}"{root}>\n{rows}</ca2:aiproviders>\n',
    )
    return cleared


def saved_providers(config_dir):
    """{id: attributes} from ai-providers.xml: {} when there is none, None when it can't be read."""
    if not os.path.exists(os.path.join(config_dir, "ai-providers.xml")):
        return {}
    try:
        return read_providers(config_dir)[1]
    except ET.ParseError:
        return None


def clear_moved_keys(config_dir, old, new):
    """A key is only sent to the address it was entered for: clear the key of each provider whose base URL differs
    between `old` and `new` ({id: attributes}; a missing provider or URL counts as empty; new=None, settings that
    can't be read, clears every key). Used when settings are saved and when a restore keeps this server's keys."""
    keys = _keys(config_dir)

    def url(ps, p):
        return (ps.get(p) or {}).get("baseUrl") or ""

    cleared = [p for p in PROVIDER_IDS if keys.get(p) and (new is None or url(old, p) != url(new, p))]
    for p in cleared:
        set_key(config_dir, p, "")
    return cleared


def _keys(config_dir):
    p = os.path.join(config_dir, "ai-keys.xml")
    return (
        {k.get("provider"): (k.text or "").strip() for k in ET.parse(p).getroot().findall("key")}
        if os.path.exists(p)
        else {}
    )


def read_key(config_dir, provider):
    """The saved key of `provider` in `config_dir`, else None."""
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
            f.write(
                f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aikeys xmlns:ca2="{NS}" version="1">\n{body}</ca2:aikeys>\n'  # pylint: disable=line-too-long
            )
            f.flush()
            os.fsync(f.fileno())
        os.chmod(tmp, 0o600)  # on Windows this only clears read-only; the folder's ACL protects the file
        os.replace(tmp, path)
    except BaseException:
        os.unlink(tmp)
        raise


def call(config_dir, system, user, schema=None, max_tokens=None, timeout=None):
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
    return complete(p, key, system, user, schema, max_tokens, timeout)


def complete(provider, key, system, user, schema=None, max_tokens=None, timeout=None):
    """The model's text reply. `schema` (JSON Schema) is enforced where the provider supports it. `max_tokens` caps a
    short reply: Anthropic's max_tokens; Gemini's thinking gets a small budget of its own on top (its thinking counts in
    maxOutputTokens); OpenAI gets max_completion_tokens with room for a reasoning model's thinking; AnythingLLM has no
    cap (the prompt keeps it short). `timeout` in seconds replaces the defaults, and a call with one isn't retried."""
    pid, key = provider.get("id"), (key or "").strip()
    model = provider.get("model") or DEFAULT_MODEL.get(pid, "")
    try:
        if pid == "anthropic":
            return _anthropic(provider, key, model, system, user, schema, max_tokens or 16000, timeout)
        if pid == "openai":
            body = {
                "model": model,
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                "response_format": {"type": "json_object"},
                **({"max_completion_tokens": max_tokens * OPENAI_CAP} if max_tokens else {}),
            }  # servers without JSON mode ignore it; propose tolerates prose
            out = _request(
                provider["baseUrl"].rstrip("/") + "/chat/completions", _bearer(key), body, timeout=timeout or TIMEOUT
            )
            if out["choices"][0].get("finish_reason") == "length":
                raise TruncatedReply("the reply was cut off at the model’s output limit")
            return out["choices"][0]["message"]["content"]
        if pid == "gemini":
            url = f"{(provider.get('baseUrl') or GEMINI_URL).rstrip('/')}/v1beta/models/{urllib.parse.quote(model, safe='')}:generateContent"  # pylint: disable=line-too-long
            body = {
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    **(
                        {
                            "maxOutputTokens": max_tokens + 2 * GEMINI_THINKING,
                            "thinkingConfig": {"thinkingBudget": GEMINI_THINKING},
                        }
                        if max_tokens
                        else {}
                    ),
                },
            }
            out = _request(
                url, {"x-goog-api-key": key}, body, timeout=timeout or TIMEOUT
            )  # header, not ?key=: URLs end up in logs
            if out["candidates"][0].get("finishReason") == "MAX_TOKENS":
                raise TruncatedReply("the reply was cut off at the model’s output limit")
            return "".join(p.get("text", "") for p in out["candidates"][0]["content"]["parts"])
        if pid == "anythingllm":
            return _anythingllm_chat(provider, key, f"{system}\n\n{user}", timeout or TIMEOUT)["textResponse"]
    except ProviderError as e:
        raise type(e)(_redact(str(e), key)) from None
    except (KeyError, IndexError, TypeError) as e:
        raise ProviderError(f"{pid} sent an answer in an unexpected shape (missing {e})") from None
    raise ProviderError(f"unknown provider “{pid}”")


def list_models(provider_id, library_dir):
    """The model ids a provider offers, sorted; for AnythingLLM its workspaces as "slug<TAB>name". Asked with the saved
    key at the saved address only: an address from a request could send the key anywhere. The providers file is read
    before the key, so a settings save that changes the address (it clears the key first) never pairs the new address
    with the old key."""
    config = os.path.join(library_dir, ".config")
    if provider_id not in PROVIDER_IDS:
        raise ProviderError(f"unknown provider “{provider_id}”")
    saved = read_providers(config)[1] if os.path.exists(os.path.join(config, "ai-providers.xml")) else {}
    p = saved.get(provider_id) or {}
    key = read_key(config, provider_id) or ""
    if not key and provider_id != "openai":  # a local OpenAI-compatible server may need none
        raise ProviderError(f"no API key is set for {provider_id}")
    try:
        if provider_id == "anthropic":
            client = _anthropic_client(key, p.get("baseUrl"), timeout=LIST_TIMEOUT, max_retries=0)
            with _anthropic_errors():
                ids = [m.id for m in client.models.list()]  # the SDK pages through all of them
        elif provider_id == "openai":
            if not p.get("baseUrl"):
                raise ProviderError("save the address first")
            ids = [
                m["id"]
                for m in _request(p["baseUrl"].rstrip("/") + "/models", _bearer(key), timeout=LIST_TIMEOUT)["data"]
            ]
        elif provider_id == "anythingllm":
            if not p.get("baseUrl"):
                raise ProviderError("save the address first")
            ids = [f"{slug}\t{name}" for name, slug in _workspaces(p["baseUrl"], key, LIST_TIMEOUT, fresh=True)]
        else:  # ponytail: one page of 1000; Gemini offers a few dozen models, follow nextPageToken if that changes
            out = _request(
                f"{(p.get('baseUrl') or GEMINI_URL).rstrip('/')}/v1beta/models?pageSize=1000",
                {"x-goog-api-key": key},
                timeout=LIST_TIMEOUT,
            )
            ids = [
                m["name"].removeprefix("models/")
                for m in out.get("models", [])
                if "generateContent" in m.get("supportedGenerationMethods", [])
            ]
    except ProviderError as e:
        raise ProviderError(_redact(str(e), key)) from None
    except (KeyError, IndexError, TypeError, AttributeError) as e:
        raise ProviderError(f"{provider_id} sent a model list in an unexpected shape (missing {e})") from None
    return sorted(set(ids))


def ping(provider_id, library_dir):
    """(model, reply) for a tiny fixed prompt: is the provider connected? Like list_models, only the saved address,
    model and key are used (the providers file is read before the key); the request only names the provider."""
    config = os.path.join(library_dir, ".config")
    if provider_id not in PROVIDER_IDS:
        raise ProviderError(f"unknown provider “{provider_id}”")
    p = (read_providers(config)[1] if os.path.exists(os.path.join(config, "ai-providers.xml")) else {}).get(provider_id)
    if not p:
        raise ProviderError("save this provider’s settings first")
    key = read_key(config, provider_id) or ""
    if not key and provider_id in ("anthropic", "gemini"):
        raise ProviderError(f"no API key is set for {provider_id}")
    model = p.get("model") or DEFAULT_MODEL.get(provider_id, "")
    try:
        if provider_id == "anthropic":
            client = _anthropic_client(key, p.get("baseUrl"), timeout=PING_TIMEOUT, max_retries=0)
            with _anthropic_errors():
                resp = client.messages.create(model=model, max_tokens=16, messages=[{"role": "user", "content": PING}])
            return model, next((b.text for b in resp.content if b.type == "text"), "")
        if not p.get("baseUrl") and provider_id != "gemini":
            raise ProviderError("save the address first")
        if provider_id == "openai":
            if not model:
                raise ProviderError("choose a model first")
            # ponytail: no output cap: OpenAI's reasoning models refuse max_tokens and spend a small cap on thinking;
            # the prompt keeps it short
            out = _request(
                p["baseUrl"].rstrip("/") + "/chat/completions",
                _bearer(key),
                {"model": model, "messages": [{"role": "user", "content": PING}]},
                timeout=PING_TIMEOUT,
            )
            return model, out["choices"][0]["message"].get("content") or ""
        if provider_id == "gemini":
            url = f"{(p.get('baseUrl') or GEMINI_URL).rstrip('/')}/v1beta/models/{urllib.parse.quote(model, safe='')}:generateContent"  # pylint: disable=line-too-long
            out = _request(
                url,
                {"x-goog-api-key": key},
                {"contents": [{"role": "user", "parts": [{"text": PING}]}]},
                timeout=PING_TIMEOUT,
            )
            return model, "".join(x.get("text", "") for x in out["candidates"][0].get("content", {}).get("parts", []))
        if not p.get("workspace"):
            raise ProviderError("save the workspace first")
        out = _anythingllm_chat(p, key, PING, PING_TIMEOUT)
        if out.get("error"):
            raise ProviderError(f"AnythingLLM answered: {out['error']}")
        return f"workspace {p['workspace']}", out["textResponse"] or ""
    except ProviderError as e:
        status = getattr(e, "status", None)
        why = HTTP_SAYS.get(status) or ("the provider had an error on its side" if status and status >= 500 else None)
        raise ProviderError(f"{why} (HTTP {status})" if why else _redact(str(e), key)) from None
    except (KeyError, IndexError, TypeError, AttributeError) as e:
        raise ProviderError(f"{provider_id} sent an answer in an unexpected shape (missing {e})") from None


WORKSPACES_TTL = 60
_WORKSPACES = {}  # (baseUrl, key) -> (when, [(name, slug)]): one list per run, not one per chunk


def _workspaces(base_url, key, timeout, fresh=False):
    """AnythingLLM's workspaces as [(name, slug)], cached for a minute."""
    base = base_url.rstrip("/")
    hit = _WORKSPACES.get((base, key))
    if fresh or not hit or time.monotonic() - hit[0] > WORKSPACES_TTL:
        out = _request(base + "/api/v1/workspaces", _bearer(key), timeout=timeout)
        hit = _WORKSPACES[(base, key)] = (time.monotonic(), [(w["name"], w["slug"]) for w in out["workspaces"]])
    return hit[1]


def _no_workspace(workspace, spaces):
    return ProviderError(
        f"Workspace “{workspace}” isn’t on this AnythingLLM server. "
        f"Its workspaces: {', '.join(n for n, _ in spaces) or 'none'}."
    )


def _anythingllm_chat(p, key, message, timeout):
    """POST to the saved workspace's chat. AnythingLLM wants the slug; the saved text may be the display name."""
    base, ws = p["baseUrl"].rstrip("/"), p["workspace"].strip()
    spaces = _workspaces(base, key, timeout)
    slug = next((s for _, s in spaces if s == ws), None) or next(
        (s for n, s in spaces if n.strip().casefold() == ws.casefold()), None
    )
    if slug is None:
        raise _no_workspace(ws, spaces)
    try:
        return _request(
            f"{base}/api/v1/workspace/{urllib.parse.quote(slug, safe='')}/chat",
            _bearer(key),
            # a session of its own: no earlier question's history (another user's) is added to this one
            {"message": message, "mode": "chat", "sessionId": f"ca2-{uuid.uuid4().hex}"},
            timeout=timeout,
        )
    except ProviderError as e:
        if getattr(e, "status", None) == 400 and "not a valid workspace" in str(e):  # removed since the list was read
            raise _no_workspace(ws, _workspaces(base, key, timeout, fresh=True)) from None
        raise


def _redact(text, key):
    return text.replace(key, "[key]") if key else text


def _bearer(key):
    return {"Authorization": f"Bearer {key}"} if key else {}


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    """urllib would resend the key headers to whatever host a 30x names (even over plain http)."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ProviderError("the provider redirected to another address; check the address")


def _web_url(url):
    """An http(s) URL naming a host: nothing else is ever asked (no file:, ftp: or data: reads)."""
    try:
        u = urllib.parse.urlsplit(url)
        return u.scheme in ("http", "https") and bool(u.hostname)
    except ValueError:
        return False


# http and https only: build_opener would add file:, ftp: and data: handlers too
_OPENER = urllib.request.OpenerDirector()
for _h in (
    urllib.request.ProxyHandler(),
    urllib.request.HTTPHandler(),
    urllib.request.HTTPSHandler(),
    urllib.request.HTTPDefaultErrorHandler(),
    _NoRedirects(),
    urllib.request.HTTPErrorProcessor(),
):
    _OPENER.add_handler(_h)


def _request(url, headers, body=None, timeout=TIMEOUT):
    """POST `body` as JSON (without one: GET) and return the JSON reply. Redirects are refused."""
    if not _web_url(url):
        raise ProviderError("the provider’s address isn’t an http:// or https:// URL with a host")
    host = urllib.parse.urlsplit(url).netloc
    data = None if body is None else json.dumps(body).encode("utf8")
    req = urllib.request.Request(
        url, data, {"Content-Type": "application/json", **headers}, method="GET" if data is None else "POST"
    )
    try:
        with _OPENER.open(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        err = ProviderError(f"{host} answered HTTP {e.code}: {e.read(500).decode('utf8', 'replace')}")
        err.status = e.code  # pylint: disable=attribute-defined-outside-init  # only set on an HTTP reply
        raise err from None
    except (urllib.error.URLError, OSError) as e:
        raise ProviderError(f"couldn’t reach {host}: {getattr(e, 'reason', e)}") from None
    except ValueError:
        raise ProviderError(f"{host} didn’t answer with JSON") from None


def _anthropic_client(key, base_url, **kw):
    """The SDK's client without redirects: httpx would otherwise resend the key header to whatever host a 30x names."""
    return anthropic.Anthropic(
        api_key=key, base_url=base_url or None, http_client=anthropic.DefaultHttpxClient(follow_redirects=False), **kw
    )


@contextlib.contextmanager
def _anthropic_errors():
    try:
        yield
    except (anthropic.AuthenticationError, anthropic.PermissionDeniedError):
        raise ProviderError("Anthropic didn’t accept the API key") from None
    except anthropic.NotFoundError:
        raise ProviderError("the address, model or workspace wasn’t found (HTTP 404)") from None
    except anthropic.RateLimitError:
        raise ProviderError("Anthropic is rate limiting this key; try again later") from None
    except anthropic.APIStatusError as e:
        if 300 <= e.status_code < 400:
            raise ProviderError("the provider redirected to another address; check the address") from None
        raise ProviderError(f"Anthropic answered HTTP {e.status_code}: {e.message}") from None
    except anthropic.APIConnectionError:
        raise ProviderError("couldn’t reach Anthropic") from None


def _anthropic(provider, key, model, system, user, schema, max_tokens, timeout):
    # a bounded call (Ask the rules) isn't retried: the server stops it at 60 s, the provider's own error reads better
    client = _anthropic_client(
        key, provider.get("baseUrl"), timeout=timeout or ANTHROPIC_TIMEOUT, **({"max_retries": 0} if timeout else {})
    )
    extra = {"output_config": {"format": {"type": "json_schema", "schema": schema}}} if schema else {}
    with _anthropic_errors():
        resp = client.beta.messages.create(
            model=model,
            max_tokens=max_tokens,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],  # same for every chunk
            messages=[{"role": "user", "content": user}],
            **extra,
        )
    if resp.stop_reason == "refusal":
        raise ProviderError("declined: the model refused this part of the book")
    if resp.stop_reason == "max_tokens":
        raise TruncatedReply("the reply was cut off at the model’s output limit")
    return next((b.text for b in resp.content if b.type == "text"), "")
