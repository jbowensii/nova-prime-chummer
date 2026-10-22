"""The final Commlink6 analysis (docs/reviews/sr6-cl6-final-analysis-2026-10-20.md), rebuilt from the source data:

  List 1: every Commlink6 record that is in none of our books (and, 1b, every Commlink6 field value no book prints);
  List 2: every change we made relative to Commlink6's data, each with the book page or owner ruling behind it.

  python -m tools.cl6check.final_analysis --ours <import> [--printings <per-book runs>] [--jar <jar>] [--doc <md>]
                                          [--no-pdf] [--check]

--ours is a production import (`python -m tools.cl6check import --library`, e.g. .extract/cl6check-runs28) or $CL6_OURS.
Without --check it rewrites the generated part of the doc (between the two markers); the hand-written parts stay.
--check recomputes every count and compares it with the doc's totals table: `counts reconcile: ok` (exit 0), else the
counts that differ (exit 1). No jar: nothing to measure, skipped (exit 0), as cl6check does."""

import argparse
import glob
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

from tools.cl6check import canon, fields, match, ours, reader, report
from tools.cl6check import optional as package

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOC = os.path.join(REPO, "docs", "reviews", "sr6-cl6-final-analysis-2026-10-20.md")
OVERRIDES = os.path.join(REPO, "importer", "sr6", "overrides")
EFFECTS = os.path.join(REPO, "tools", "cl6effects")
START, END = "<!-- final_analysis: generated from here -->", "<!-- final_analysis: generated up to here -->"
SIDE_BOOK = re.compile(r"(de_[^/]+|other_us)/")  # (books the reader skips: German-only ones and Misc. (US))
GERMAN_NAME = re.compile(r"Pfeile|Druckluftkartusche|Kalte Munition")  # (German words in a record of an English book)
CELL = (
    "kept as the pilot, sensor or range"  # (relocated.json's note for a missile table's cell: `3` is a sensor rating)
)

L1_GROUPS = (
    "German-only books",
    "German-rules duplicates",
    "no English name",
    "retired or legacy",
    "Commlink6-invented or house content",
    "rule options",
    "other",
)
L2_GROUPS = ("field values", "structure kept as ours", "effects", "classes", "relocations", "kept records")


def side_records(jar):
    """Every record of the jar's German-only books (de_*) and of its Misc. (US) dataset (other_us), which the reader
    skips: {book, file, tag, id, name, page, product, lang, el}. The English text wins, then the German."""
    out = []
    with zipfile.ZipFile(jar) as z:
        names = z.namelist()
        books = sorted(
            {m.group(1) for n in names if n.startswith(reader.ROOT) and (m := SIDE_BOOK.match(n[len(reader.ROOT) :]))}
        )
        for book in books:
            text = {}
            for n in sorted(
                x for x in names if x.startswith(f"{reader.ROOT}{book}/i18n/") and x.endswith(".properties")
            ):
                for k, v in reader.properties(reader.decode(z.read(n))).items():
                    for kk, vv in v.items():
                        text.setdefault(k, {}).setdefault(kk, vv)
            for n in sorted(x for x in names if x.startswith(f"{reader.ROOT}{book}/data/") and x.endswith(".xml")):
                try:
                    root = ET.fromstring(z.read(n))
                except ET.ParseError:
                    continue  # (an empty file in the jar)
                for el in root:
                    if not isinstance(el.tag, str) or not el.get("id"):
                        continue
                    keys = [(p, el.get("id").lower()) for p in reader.PREFIX.get(el.tag, (el.tag,))]
                    t = next((text[k] for k in keys if k in text), {})
                    out.append(
                        {
                            "book": book,
                            "file": n.rsplit("/", 1)[1][:-4],
                            "tag": el.tag,
                            "id": el.get("id"),
                            "name": t.get("name", ""),
                            "page": t.get("page", "").strip(),
                            "product": t.get("prodname", ""),
                            "lang": el.get("lang", ""),
                            "el": el,
                        }
                    )
    return out


def overrides():
    """[(src, row)] of every override row (importer/sr6/overrides/<src>.json and <src>.book.json)."""
    out = []
    for f in sorted(glob.glob(os.path.join(OVERRIDES, "*.json"))):
        src = os.path.basename(f).split(".")[0]
        out += [(src, r) for r in json.loads(Path(f).read_text(encoding="utf8"))]
    return out


def older_printings(runs):
    """{source: {run name: {(kind, id): entry}}} of each older printing's own import of a book printed several times
    (the core rulebook's City Editions), from per-book runs (`cl6check import`): a library import keeps only the
    Current Printing, the older ones filling its gaps.
    ponytail: "older" is every run of the source but the one named current-printing; read the printing from the PDF
    (ours._printed) if a second multi-printing book appears."""
    out = defaultdict(dict)
    for d in sorted(glob.glob(os.path.join(runs, "*", "custom", "sr6", "imported", "*"))) if runs else ():
        run, src = d.split(os.sep)[-5], os.path.basename(d)
        if src == "crb" and "current-printing" not in run:
            out[src][run] = {
                (e["kind"], e["id"]): e
                for e in ours.load(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(d)))))[src].entries
            }
    return dict(out)


def gather(jar, ours_dir, pdf=True, printings=None):
    """Everything the lists are built from: the jar's records, our import compared with them (cl6check's compare), the
    owner's files."""
    from tools.cl6check.__main__ import compare

    listing = []
    recs, _ = reader.read(jar, listing)
    cl6 = [canon.canonical(r) for r in recs]
    mine = ours.load(ours_dir)
    results, _, _ = compare(cl6, mine, pdf=pdf)
    keep = json.loads(Path(package.KEEP).read_text(encoding="utf8"))
    return {
        "jar": jar.name,
        "ours": os.path.basename(os.path.normpath(ours_dir)),
        "listing": listing,
        "printings": older_printings(printings),
        "printings_from": os.path.basename(os.path.normpath(printings)) if printings else "",
        "side": side_records(jar),
        "cl6": cl6,
        "mine": mine,
        "results": results,
        "keep": keep["keep"],
        "hold": keep["hold"],
        "verdicts": keep["verdicts"],
        "optional": json.load(open(package.FILE, encoding="utf8"))["optional"],
        "relocated": json.load(open(package.HAVE, encoding="utf8"))["records"],
        "accept": json.load(open(package.ACCEPT, encoding="utf8"))["accept"],
        "bookruled": json.load(open(os.path.join(EFFECTS, "bookruled.json"), encoding="utf8")),
        "placeholder": json.load(open(os.path.join(EFFECTS, "cl6placeholder.json"), encoding="utf8")),
        "overrides": overrides(),
        "keep_retired": sorted(reader.KEEP_RETIRED),
    }


def classify(d, r, entry, verdict, kept, older_agrees, erratum=""):
    """(class, justification) of a field where ours differs from Commlink6 and the book prints ours. erratum: the
    override row (gen="errata") that set the field, if one did."""
    page = f"{r['src'].upper()} p{r['our_page'] or r['page']}"
    if verdict:
        return "owner ruling", f"{verdict['page']} (owner 2026-10-17): {verdict['reason']}"
    if (entry or {}).get("found", {}).get(d["field"]) == "errata":
        return "errata", f"errata {entry.get('found_at', {}).get(d['field'], '')}".strip()
    if erratum:
        return "errata", f"{erratum} (importer/sr6/overrides/{r['src']}.json, gen=\"errata\")"
    if older_agrees:
        return "latest printing", f"{page}: the Current Printing prints ours; {older_agrees} prints Commlink6's"
    if kept:
        return "book prints ours", f"{page}: the page's text prints ours (owner check 2026-10-14, value_keep.json)"
    return "book prints ours", f"{page}: the PDF prints ours (cl6check's PDF check)"


def lists(g):
    """(list1, list1b, list2, open) from gather()'s data. Each row is a dict; list1/list2 rows carry a `group`."""
    by_key = {(c["src"], c["id"]): c for c in g["cl6"]}
    by_kind = {(c["src"], c["kind"], c["id"]): c for c in g["cl6"]}
    entry = {(s, e["kind"], e["id"]): e for s, src in g["mine"].items() for e in src.entries}
    names = defaultdict(list)
    for (s, _, i), e in entry.items():
        for n in dict.fromkeys(match.n1(x) for x in [e["name"], *e.get("aliases", ())]):  # (an alias: Commlink6's)
            names[n].append(f"{s}.{i}" if not i.startswith(f"{s}.") else i)
    optional = {(o["src"], o["cl6_id"]): o for o in g["optional"]}
    added = {(r["src"], r["kind"], r["cl6"]): r for r in package.load_module() if "add" in r}  # (the module's own)
    moved = {(x["src"], x["cl6_id"]): x["note"] for x in g["relocated"]}
    l1 = []

    def row1(group, src, kind, cid, name, page, why):
        l1.append({"group": group, "src": src, "kind": kind, "id": cid, "name": name, "page": page, "why": why})

    by_name = []  # (Misc. (US) records a book of ours prints by name or alias: not list 1's, for the owner to confirm)
    for x in g["side"]:  # (the German-only books and Misc. (US))
        if x["book"].startswith("de_"):
            row1(
                "German-only books",
                x["book"],
                x["tag"],
                x["id"],
                x["name"],
                x["page"],
                f"a German-only book ({x['book']}); no English edition among our books",
            )
        elif x["lang"] == "de":
            row1(
                "German-rules duplicates",
                x["book"],
                x["tag"],
                x["id"],
                x["name"],
                x["page"],
                "lang=de: the German edition's copy of a record",
            )
        elif not names.get(match.n1(x["name"])):
            row1(
                "other",
                x["book"],
                x["tag"],
                x["id"],
                x["name"],
                x["page"],
                f"Commlink6's Misc. (US) dataset, from {x['product'] or 'no product named'}; none of our books prints "
                "it",
            )
        else:
            by_name.append(
                {
                    "what": "Misc. (US) record one of our books prints by name (not in list 1)",
                    "src": x["book"],
                    "id": x["id"],
                    "field": "",
                    "note": f"{x['name']} ({x['product']}): ours " + ", ".join(sorted(names[match.n1(x["name"])])),
                    "live": False,
                }
            )
    group = {
        "lang=de (German-rules duplicate)": "German-rules duplicates",
        "no English name in the jar": "no English name",
        "retired by Commlink6 (Depreciated)": "retired or legacy",
    }
    for x in g["listing"]:
        src = canon.BOOK_SOURCE.get(x["book"], x["book"])
        why = {
            "German-rules duplicates": "lang=de: the German edition's copy of a record its English book has",
            "no English name": "no English name in the jar (no English book names it; a German-only text)",
            "retired or legacy": "Commlink6 marks it Depreciated (replaced by another record of its own)",
        }
        row1(
            group.get(x["why"], "other"),
            src,
            x["tag"],
            x["id"],
            x["name"],
            x["page"],
            why.get(group.get(x["why"]), x["why"]),
        )
    for r in g["results"]:
        c = by_kind.get((r["src"], r["kind"], r["id"]), {})
        add = added.get((r["src"], r["kind"], r["name"])) or added.get((r["src"], r.get("our_kind"), r["name"]))
        if r["kind"] == "ruleoptions":
            row1(
                "rule options",
                r["src"],
                r["kind"],
                r["id"],
                r["name"],
                r["page"],
                f"a rule setting of the app, no book item; ours is the rule preset {r['our_id'] or '(none)'}",
            )
        elif (r["src"], r["id"]) in optional:
            row1(
                "Commlink6-invented or house content",
                r["src"],
                r["kind"],
                r["id"],
                r["name"],
                r["page"],
                f"in the optional package: {optional[r['src'], r['id']]['reason']}",
            )
        elif add and GERMAN_NAME.search(r["name"]):
            row1(
                "German-rules duplicates",
                r["src"],
                r["kind"],
                r["id"],
                r["name"],
                r["page"],
                'named in German; no English book prints it (carried as a Commlink6-only entry of ours, gen="cl6only")',
            )
        elif add:
            row1(
                "Commlink6-invented or house content",
                r["src"],
                r["kind"],
                r["id"],
                r["name"],
                r["page"],
                "an option row Commlink6 prices at 0 or marks not for sale; no book prints it as an item (carried as a "
                'Commlink6-only entry of ours, gen="cl6only")',
            )
        elif c.get("cl6only") and (canon.PSEUDO.match(r["name"].strip()) or CELL in moved.get((r["src"], r["id"]), "")):
            row1(
                "Commlink6-invented or house content",
                r["src"],
                r["kind"],
                r["id"],
                r["name"],
                r["page"],
                f"a table cell Commlink6 made a record of; "
                f"the book prints it only in {r['our_id'] or 'a row'}'s column",
            )
    l1b = []
    for r in g["results"]:
        for d in r["diffs"]:
            if report.left_out(d):
                l1b.append(
                    {
                        "src": r["src"],
                        "kind": r["kind"],
                        "id": r["id"],
                        "name": r["name"],
                        "our_id": r["our_id"],
                        "field": d["field"],
                        "cl6": d["cl6"],
                        "page": r["page"],
                    }
                )

    errata = {
        (s, r["id"], f): r["cl6"] for s, r in g["overrides"] if r.get("gen") == "errata" for f in r.get("set", {})
    }
    verdicts = {tuple(v[k] for k in package.VERDICT): v for v in g["verdicts"]}
    keep = {tuple(k[:4]) for k in g["keep"]}
    l2, used_keep, used_verdict = [], set(), set()
    for r in g["results"]:
        for d in r["diffs"]:
            if report.left_out(d) or d["class"] != "b":
                continue
            v = next(
                (
                    verdicts[k]
                    for k in [
                        (r["src"], kd, r["id"], r["name"], r["our_id"], d["field"], d["cl6"], d["ours"])
                        for kd in (r["kind"], r["our_kind"])
                    ]
                    if k in verdicts
                ),
                None,
            )
            kk = [(r["src"], kd, r["our_id"], d["field"]) for kd in (r["kind"], r["our_kind"])]
            used_keep |= {k for k in kk if k in keep}
            if v:
                used_verdict.add(id(v))
            e = entry.get((r["src"], r["our_kind"], r["our_id"]))
            older, c = "", by_kind.get((r["src"], r["kind"], r["id"]))
            for run, es in sorted(g["printings"].get(r["src"], {}).items()) if c else ():
                o = es.get((r["our_kind"], r["our_id"]))
                if o and d["field"] not in {x["field"] for x in fields.compare(c, o)[1]}:
                    older = run
                    break
            cls, why = classify(
                d,
                r,
                e,
                v,
                any(k in keep for k in kk),
                older,
                errata.get((r["src"], r["our_id"].split(".", 1)[-1], d["field"]), ""),
            )
            l2.append(
                {
                    "group": "field values",
                    "src": r["src"],
                    "kind": r["our_kind"] or r["kind"],
                    "id": r["id"],
                    "name": r["name"],
                    "our_id": r["our_id"],
                    "field": d["field"],
                    "cl6": d["cl6"],
                    "ours": d["ours"],
                    "class": cls,
                    "why": why,
                }
            )
    fams = set(canon.FAMILIES)
    matched = {(r["src"], r["our_id"]) for r in g["results"] if r["our_id"]}
    rec_of = {(r["src"], r["our_id"]): r for r in g["results"] if r["our_id"]}
    why_fam = {
        "variants": (
            "owner ruling",
            "one item of ours where Commlink6 gives variant tags (an install option, a "
            "warhead option): the owner's one-item rule (value_keep.json `keep`)",
        ),
        "social": ("book prints ours", "the book prints the Social rating as `Rating` (value_keep.json `keep`)"),
        "requires": (
            "owner ruling",
            "an accepted structural difference: ours is the book's own prerequisite "
            "(value_keep.json `keep`, 2026-10-16; docs/cl6check.md)",
        ),
    }
    for k in sorted({tuple(k[:4]) for k in g["keep"] if k[3] in fams}):
        r = rec_of.get((k[0], k[2]), {})
        cls, why = why_fam.get(k[3], ("owner ruling", "the owner keeps ours (value_keep.json `keep`)"))
        l2.append(
            {
                "group": "structure kept as ours",
                "src": k[0],
                "kind": k[1],
                "id": r.get("id", ""),
                "name": r.get("name", ""),
                "our_id": k[2],
                "field": k[3],
                "cl6": "(Commlink6's structure)",
                "ours": "(ours)",
                "class": cls,
                "why": why,
            }
        )
    for x in g["bookruled"]:
        s, cid, tag = x["pair"]
        l2.append(
            {
                "group": "effects",
                "src": s,
                "kind": tag,
                "id": cid,
                "name": by_key.get((s, cid), {}).get("name", ""),
                "our_id": "",
                "field": x["sig"],
                "cl6": x["cl6"],
                "ours": "; ".join(x.get("ours") or []),
                "class": "owner ruling" if "owner" in x["why"] or "review" in x["why"] else "book prints ours",
                "why": x["why"],
            }
        )
    for x in g["placeholder"]:
        s, cid, tag = x["pair"]
        l2.append(
            {
                "group": "effects",
                "src": s,
                "kind": tag,
                "id": cid,
                "name": by_key.get((s, cid), {}).get("name", ""),
                "our_id": "",
                "field": x["sig"],
                "cl6": x["cl6"],
                "ours": "(no effect)",
                "class": "owner ruling",
                "why": x["why"],
            }
        )
    for x in g["accept"]:
        c = by_key.get((x["src"], x["cl6_id"]), {})
        l2.append(
            {
                "group": "classes",
                "src": x["src"],
                "kind": c.get("kind", ""),
                "id": x["cl6_id"],
                "name": c.get("name", ""),
                "our_id": x["our_id"],
                "field": "class",
                "cl6": c.get("cl6_class", ""),
                "ours": "(ours)",
                "class": "book prints ours",
                "why": x["note"],
            }
        )
    in_l1 = {(x["src"], x["id"]) for x in l1}
    for x in g["relocated"]:
        if (x["src"], x["cl6_id"]) in in_l1:
            continue  # (a table cell or a rule option: list 1's)
        c = by_key.get((x["src"], x["cl6_id"]), {})
        l2.append(
            {
                "group": "relocations",
                "src": x["src"],
                "kind": c.get("kind", ""),
                "id": x["cl6_id"],
                "name": c.get("name", ""),
                "our_id": x["our_id"],
                "field": "source/name",
                "cl6": f"{x['src']}: {c.get('name', '')}",
                "ours": x["our_id"],
                "class": "owner ruling" if "owner" in x["note"] else "book prints ours",
                "why": x["note"],
            }
        )
    for cid in g["keep_retired"]:
        c = next((c for c in g["cl6"] if c["id"] == cid), {})
        l2.append(
            {
                "group": "kept records",
                "src": c.get("src", ""),
                "kind": c.get("kind", ""),
                "id": cid,
                "name": c.get("name", ""),
                "our_id": "",
                "field": "retired",
                "cl6": "Depreciated",
                "ours": "kept",
                "class": "latest printing",
                "why": "the latest Firing Squad still prints it (owner 2026-10-14)",
            }
        )

    still = {(r["src"], r["our_id"], d["field"]) for r in g["results"] for d in r["diffs"]}
    opened = [
        {"what": "hold", "src": h[0], "id": h[2], "field": h[3], "note": h[4], "live": (h[0], h[2], h[3]) in still}
        for h in g["hold"]
    ]
    opened += [
        {
            "what": "keep row with no difference left",
            "src": k[0],
            "id": k[2],
            "field": k[3],
            "note": k[1],
            "live": False,
        }
        for k in g["keep"]
        if k[3] not in fams and tuple(k[:4]) not in used_keep and (k[0], k[2]) in matched
    ]
    opened += [
        {
            "what": "verdict with no difference left",
            "src": v["src"],
            "id": v["our_id"],
            "field": v["field"],
            "note": f"{v['page']}: Commlink6 {v['cl6']!r}, ours {v['ours']!r}",
            "live": False,
        }
        for v in g["verdicts"]
        if id(v) not in used_verdict
    ]
    return l1, l1b, l2, opened + by_name


def totals(l1, l1b, l2, opened):
    """The counts of each list by group and class, and of the open items."""
    t = {f"list 1: {k}": n for k, n in Counter(x["group"] for x in l1).items()}
    t["list 1: total"] = len(l1)
    t["list 1b: total"] = len(l1b)
    t |= {f"list 2: {k}": n for k, n in Counter(x["group"] for x in l2).items()}
    t |= {f"list 2 by class: {k}": n for k, n in Counter(x["class"] for x in l2).items()}
    t["list 2: total"] = len(l2)
    t["open items"] = len(opened)
    return dict(sorted(t.items()))


TOTAL_ROW = re.compile(r"^\| `([^`]+)` \| ([\d,]+) \|$", re.M)


def doc_totals(text):
    """{name: count} of the totals table in the doc."""
    return {k: int(v.replace(",", "")) for k, v in TOTAL_ROW.findall(text)}


def check(text, t):
    """(ok, lines): the doc's totals against the recomputed ones."""
    have = doc_totals(text)
    bad = [
        f"{k}: doc {have.get(k)}, recomputed {t.get(k)}" for k in sorted(set(have) | set(t)) if have.get(k) != t.get(k)
    ]
    return not bad, bad or ["counts reconcile: ok"]


def _cell(v):
    return str(v if v not in (None, "") else "–").replace("|", "\\|").replace("\n", " ")


def _table(head, rows):
    return "\n".join(
        ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)]
        + ["| " + " | ".join(_cell(c) for c in r) + " |" for r in rows]
    )


def render(g, l1, l1b, l2, opened, t):
    """The generated section of the analysis document, from the lists and totals."""
    out = [
        START,
        "",
        f"Generated by `python -m tools.cl6check.final_analysis` from `{g['jar']}` and the import "
        f"`{g['ours']}`"
        + (f", the older core rulebook printings from `{g['printings_from']}`" if g["printings_from"] else "")
        + ". Do not edit by hand: re-run it.",
        "",
        "### Totals",
        "",
        "| count | n |",
        "|---|---:|",
    ] + [f"| `{k}` | {n:,} |" for k, n in t.items()]
    out += ["", "### List 1: Commlink6 records in none of our books", ""]
    for grp in L1_GROUPS:
        rows = [x for x in l1 if x["group"] == grp]
        if not rows:
            continue
        out += [
            f"#### {grp} ({len(rows):,})",
            "",
            _table(
                ["Commlink6 source", "type", "id", "name", "page", "why it is not in our books"],
                [
                    (x["src"], x["kind"], f"`{x['id']}`", x["name"], x["page"], x["why"])
                    for x in sorted(rows, key=lambda x: (x["src"], x["kind"], x["id"]))
                ],
            ),
            "",
        ]
    out += [
        f"### List 1b: Commlink6 field values no book prints ({len(l1b):,})",
        "",
        "Commlink6 has the value; our entry's book prints neither it nor another one (cl6check leaves these out of "
        "accuracy).",
        "",
    ]
    for fld, n in Counter(x["field"] for x in l1b).most_common():
        rows = sorted((x for x in l1b if x["field"] == fld), key=lambda x: (x["src"], x["id"]))
        out += [
            f"#### {fld} ({n:,})",
            "",
            _table(
                ["book", "id", "name", "our entry", "Commlink6's value", "page"],
                [(x["src"], f"`{x['id']}`", x["name"], x["our_id"], x["cl6"], x["page"]) for x in rows],
            ),
            "",
        ]
    out += ["### List 2: every change we made relative to Commlink6", ""]
    for grp in L2_GROUPS:
        rows = [x for x in l2 if x["group"] == grp]
        if not rows:
            continue
        out += [
            f"#### {grp} ({len(rows):,})",
            "",
            "By book: " + ", ".join(f"{s} {n}" for s, n in sorted(Counter(x["src"] for x in rows).items())) + ".",
            "",
            "By class: " + ", ".join(f"{c} {n}" for c, n in sorted(Counter(x["class"] for x in rows).items())) + ".",
            "",
        ]
        for src in sorted({x["src"] for x in rows}):
            out += [
                f"##### {grp}: {src}",
                "",
                _table(
                    ["kind", "Commlink6 id", "name", "our entry", "field", "Commlink6", "ours", "class", "why"],
                    [
                        (
                            x["kind"],
                            f"`{x['id']}`" if x["id"] else "",
                            x["name"],
                            x["our_id"],
                            x["field"],
                            x["cl6"],
                            x["ours"],
                            x["class"],
                            x["why"],
                        )
                        for x in sorted(
                            (x for x in rows if x["src"] == src),
                            key=lambda x: (x["kind"], x["id"], x["our_id"], x["field"]),
                        )
                    ],
                ),
                "",
            ]
    gens = Counter(r.get("gen", "(none)") for _, r in g["overrides"])
    what = {
        "(none)": "structure fixes of our reader: renames, aliases, splits, kinds, removals, entries it missed",
        "book": "effect corrections the book's text rules (those that differ from Commlink6: `effects` above)",
        "cl6": "effects taken from Commlink6",
        "cl6only": "Commlink6-only entries (list 1)",
        "class": "Commlink6's TYPE/SUBTYPE given to our entry",
        "errata": "errata values (those that still differ " "from Commlink6: list 2)",
        "family": "Commlink6's structure (skill, slots, variants, ...) given to our entry",
        "owner": "Commlink6's value where the book prints none, owner-accepted",
        "value": "Commlink6's value where " "the book prints it (an importer fix)",
    }
    out += [
        "### Override rows by kind",
        "",
        "The override rows mostly bring our entries to Commlink6's data. The ones that make ours differ from it are "
        "in the lists above.",
        "",
        _table(["gen", "rows", "what they do"], [(k, n, what.get(k, "")) for k, n in sorted(gens.items())]),
        "",
        f"### Open items for the owner ({len(opened):,})",
        "",
        _table(
            ["what", "book", "our entry", "field", "note", "still a difference"],
            [(x["what"], x["src"], x["id"], x["field"], x["note"], "yes" if x["live"] else "no") for x in opened],
        ),
        "",
        END,
    ]
    return "\n".join(out)


def main(argv=None):
    """Write (or with --check, verify) the final analysis document; the exit code."""
    p = argparse.ArgumentParser(
        prog="cl6check.final_analysis", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    p.add_argument("--ours", default=os.environ.get("CL6_OURS"))
    p.add_argument("--jar")
    p.add_argument("--doc", default=DOC)
    p.add_argument("--no-pdf", action="store_true")
    p.add_argument(
        "--printings", default=os.environ.get("CL6_RUNS"), help="per-book runs holding each core rulebook printing"
    )
    p.add_argument("--check", action="store_true")
    a = p.parse_args(argv)
    jar = reader.find_jar(a.jar)
    if jar is None:
        if a.jar or os.environ.get("CL6_JAR"):  # named but missing: a typo must not pass --check
            print(f"final_analysis: Commlink6 jar not found: {a.jar or os.environ['CL6_JAR']}", file=sys.stderr)
            return 2
        print("final_analysis: no Commlink6 jar (--jar or $CL6_JAR): nothing to measure, skipped.")
        return 0
    if not a.ours or not os.path.isdir(a.ours):
        print("final_analysis: --ours (or $CL6_OURS) must name an import (cl6check import --library).", file=sys.stderr)
        return 2
    g = gather(jar, a.ours, pdf=not a.no_pdf, printings=a.printings)
    l1, l1b, l2, opened = lists(g)
    t = totals(l1, l1b, l2, opened)
    text = Path(a.doc).read_text(encoding="utf8") if os.path.exists(a.doc) else f"{START}\n{END}\n"
    if a.check:
        ok, lines = check(text, t)
        print("\n".join(lines))
        return 0 if ok else 1
    if START not in text or END not in text:
        print(f"final_analysis: {a.doc} has no generated-section markers", file=sys.stderr)
        return 2
    head, rest = text.split(START, 1)
    with open(a.doc, "w", encoding="utf8", newline="\n") as f:
        f.write(head + render(g, l1, l1b, l2, opened, t) + rest.split(END, 1)[1])
    print("\n".join(f"{k}: {n}" for k, n in t.items()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
