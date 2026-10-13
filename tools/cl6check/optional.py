"""Commlink6 records the analysis counts as matched without a catalog entry (optional_package.json): `optional` ones
are differences we ship as an optional data package (docs/sr6-cl6-optional-package.md), `relocated` ones are in our
catalog under another source than Commlink6 cites."""
import json
from pathlib import Path

FILE = Path(__file__).with_name("optional_package.json")
ACCEPT = Path(__file__).with_name("class_accept.json")
HAVE = Path(__file__).with_name("relocated.json")


def load(path=FILE):
    d = json.loads(Path(path).read_text(encoding="utf8"))
    return ({(r["src"], r["cl6_id"]): r for r in d.get("optional", [])},
            {(r.get("src"), r["cl6_id"]): r for r in d.get("relocated", [])})


def load_accept(path=ACCEPT):
    """{(src, cl6_id): our_id} of the records whose class the owner accepts as ours (class_accept.json)."""
    d = json.loads(Path(path).read_text(encoding="utf8"))
    return {(r["src"], r["cl6_id"]): r["our_id"] for r in d.get("accept", [])}


def load_have(path=HAVE):
    """{(src, cl6_id): record} of the Commlink6 records we already have under another name or in another book
    (relocated.json: our_id is the catalog id, verified when the file was made). The owner counts them complete."""
    d = json.loads(Path(path).read_text(encoding="utf8"))
    return {(r["src"], r["cl6_id"]): r for r in d.get("records", [])}
