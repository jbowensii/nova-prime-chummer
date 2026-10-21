"""Importer core: what the Anarchy stages and the SR6 stages share (the recipes' Result, the CLI's flag reader and `ask`)."""

import os
import sys
from dataclasses import dataclass, field


@dataclass
class Result:
    files: dict  # overlay file name -> XML text (ids unscoped; xmlio scopes them on write)
    texts: str | None  # kind="texts" XML (same unscoped ids) or None
    samples: list = field(default_factory=list)  # {"file", "xml", "name", "role", "page"}: sample runners
    report: list = field(default_factory=list)  # dict rows: what didn't match
    source: dict = field(default_factory=dict)  # {"id","name","publisher","canon"}
    core: dict = field(default_factory=dict)  # core file name -> XML (custom/imported/core/, ids unscoped): the CRB's
    core_texts: list = field(default_factory=list)  # (of, id, text) for the core files' entries (unscoped)
    npcs: list = field(default_factory=list)  # {"file", "xml", "name", "kind", "tier", "page"}: the book's NPCs
    extra: list = field(default_factory=list)  # SR6: further sources the book holds, each a Result (a city chapter)


def flag(argv, name):
    """`name value` or `name=value` (the server passes free text as one `--name=…` argument)."""
    for a in argv:
        if a.startswith(name + "="):
            return a[len(name) + 1 :]
    return argv[argv.index(name) + 1] if name in argv[:-1] else None


def cmd_ask(argv, usage, game="ca2"):
    """A rules question from stdin, answered from the game's data (importer/ask.py) through the provider <library>/.config
    chooses (SR6: `importer sr6 ask`, with custom/sr6 and library/sr6). --scope rules: the rules only.
    Nothing is written or logged. Exit 3 with the reason on stderr (refused question, provider not set up or failing).
    "called": whether the provider was asked (the server counts those against the daily limit, whatever came back)."""
    library = flag(argv, "--library")
    if not library or not flag(argv, "--custom"):
        print(usage, file=sys.stderr)
        return 2
    import json
    from importer import ask, custom_dir

    called = False

    def ask_ai(system, user):
        nonlocal called
        from importer.ai import providers  # the AI SDK: only when a passage clears the floor

        called = True
        return providers.call(
            os.path.join(library, ".config"), system, user, max_tokens=ask.MAX_TOKENS, timeout=ask.TIMEOUT
        )

    try:
        out = ask.answer(
            sys.stdin.buffer.read(4 * ask.MAX_QUESTION + 4).decode("utf8", "replace"),
            custom_dir() if game == "ca2" else os.path.abspath(flag(argv, "--custom")),
            ask_ai,
            game=game,
            scope="rules" if flag(argv, "--scope") == "rules" else None,
        )
    except ValueError as e:
        print(e, file=sys.stderr)
        print(json.dumps({"called": called}))
        return 3
    except Exception as e:  # ProviderError (already redacted), TruncatedReply
        from importer.ai import providers

        if not isinstance(e, providers.ProviderError):
            raise
        truncated = isinstance(e, providers.TruncatedReply)
        print("the answer was too long; ask a narrower question" if truncated else e, file=sys.stderr)
        # provider: the reason is the admin's (the server logs it and tells the asker only that the provider failed)
        print(json.dumps({"called": called, **({} if truncated else {"provider": True})}))
        return 3
    print(json.dumps({**out, "called": called}, ensure_ascii=False))
    return 0
