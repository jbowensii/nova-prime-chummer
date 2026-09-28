"""AI providers for unknown books, and their settings files in library/.config:
  ai-providers.xml  the choices (use, enabled, baseUrl, model, workspace)
  ai-keys.xml       the API keys and nothing else (mode 600), read only at call time
Anthropic goes through the official SDK; the others are plain HTTP with urllib.
Errors raise ProviderError with a plain message that never contains a key."""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from xml.sax.saxutils import escape, quoteattr

import anthropic

NS = "urn:chummer-anarchy2:config:1"
TIMEOUT = 120
DEFAULT_MODEL = {"anthropic": "claude-opus-5", "gemini": "gemini-2.5-pro"}
GEMINI_URL = "https://generativelanguage.googleapis.com"


class ProviderError(Exception):
    pass


def read_providers(config_dir):
    """(use, {id: attributes}) from ai-providers.xml."""
    root = ET.parse(os.path.join(config_dir, "ai-providers.xml")).getroot()
    return root.get("use"), {p.get("id"): dict(p.attrib) for p in root.findall("provider")}


def _keys(config_dir):
    p = os.path.join(config_dir, "ai-keys.xml")
    return {k.get("provider"): k.text or "" for k in ET.parse(p).getroot().findall("key")} if os.path.exists(p) else {}


def read_key(config_dir, provider):
    return _keys(config_dir).get(provider) or None


def set_key(config_dir, provider, key):
    """Set (or with an empty key, remove) one provider's key; the file is rewritten atomically, mode 600."""
    keys = _keys(config_dir)
    keys.pop(provider, None)
    if key:
        keys[provider] = key
    body = "".join(f"  <key provider={quoteattr(p)}>{escape(k)}</key>\n" for p, k in sorted(keys.items()))
    os.makedirs(config_dir, exist_ok=True)
    path = os.path.join(config_dir, "ai-keys.xml")
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf8", newline="\n") as f:
        f.write(f'<?xml version="1.0" encoding="UTF-8"?>\n<ca2:aikeys xmlns:ca2="{NS}" version="1">\n{body}</ca2:aikeys>\n')
    os.chmod(tmp, 0o600)  # on Windows this only clears read-only; the folder's ACL protects the file
    os.replace(tmp, path)


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
    pid = provider.get("id")
    model = provider.get("model") or DEFAULT_MODEL.get(pid, "")
    try:
        if pid == "anthropic":
            return _anthropic(provider, key, model, system, user, schema)
        if pid == "openai":
            body = {"model": model, "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                    "response_format": {"type": "json_object"}}  # servers without JSON mode ignore it; propose tolerates prose
            out = _post(provider["baseUrl"].rstrip("/") + "/chat/completions", _bearer(key), body)
            return out["choices"][0]["message"]["content"]
        if pid == "gemini":
            url = f"{(provider.get('baseUrl') or GEMINI_URL).rstrip('/')}/v1beta/models/{urllib.parse.quote(model)}:generateContent"
            body = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": user}]}],
                    "generationConfig": {"responseMimeType": "application/json"}}
            out = _post(url, {"x-goog-api-key": key}, body)  # header, not ?key=: URLs end up in logs
            return "".join(p.get("text", "") for p in out["candidates"][0]["content"]["parts"])
        if pid == "anythingllm":
            url = f"{provider['baseUrl'].rstrip('/')}/api/v1/workspace/{urllib.parse.quote(provider['workspace'])}/chat"
            return _post(url, _bearer(key), {"message": f"{system}\n\n{user}", "mode": "chat"})["textResponse"]
    except ProviderError as e:
        raise ProviderError(_redact(str(e), key)) from None
    except (KeyError, IndexError, TypeError) as e:
        raise ProviderError(f"{pid} sent an answer in an unexpected shape (missing {e})") from None
    raise ProviderError(f"unknown provider “{pid}”")


def _redact(text, key):
    return text.replace(key, "[key]") if key else text


def _bearer(key):
    return {"Authorization": f"Bearer {key}"} if key else {}


def _post(url, headers, body):
    host = urllib.parse.urlsplit(url).netloc
    req = urllib.request.Request(url, json.dumps(body).encode("utf8"), {"Content-Type": "application/json", **headers}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise ProviderError(f"{host} answered HTTP {e.code}: {e.read(500).decode('utf8', 'replace')}") from None
    except (urllib.error.URLError, OSError) as e:
        raise ProviderError(f"couldn’t reach {host}: {getattr(e, 'reason', e)}") from None
    except ValueError:
        raise ProviderError(f"{host} didn’t answer with JSON") from None


def _anthropic(provider, key, model, system, user, schema):
    client = anthropic.Anthropic(api_key=key, base_url=provider.get("baseUrl") or None, timeout=TIMEOUT)
    extra = {"output_config": {"format": {"type": "json_schema", "schema": schema}}} if schema else {}
    try:
        resp = client.beta.messages.create(
            model=model, max_tokens=16000, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=system, messages=[{"role": "user", "content": user}], **extra)
    except anthropic.AuthenticationError:
        raise ProviderError("Anthropic didn’t accept the API key") from None
    except anthropic.RateLimitError:
        raise ProviderError("Anthropic is rate limiting this key; try again later") from None
    except anthropic.APIStatusError as e:
        raise ProviderError(f"Anthropic answered HTTP {e.status_code}: {e.message}") from None
    except anthropic.APIConnectionError:
        raise ProviderError("couldn’t reach Anthropic") from None
    if resp.stop_reason == "refusal":
        raise ProviderError("declined: the model refused this part of the book")
    return next((b.text for b in resp.content if b.type == "text"), "")
