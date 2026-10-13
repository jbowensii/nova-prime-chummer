"""Metrics, the cause table, baseline deltas and the written reports.

cl6-metrics.json holds counts only (no names), so it is the baseline format; cl6-diffs.csv lists every difference and
miss with names, for the owner's eyes (the report folder is never committed); cl6-report.md is the summary."""
import csv
import json
import os
import re
from collections import Counter, defaultdict

from tools.cl6check import canon
from tools.cl6check.match import words


def pct(n, d):
    return round(100.0 * n / d, 2) if d else None


# ---------- why a record is missing ----------
class BookText:
    """Where names sit in an import's converted text (book.md) and regroup output (regrouped.md)."""

    def __init__(self, book_dir):
        self.blocks, self.rows, self.heads, self.bold, self.rules = set(), set(), set(), set(), set()
        self.text = ""
        if not book_dir:
            return
        rg, bk = (os.path.join(book_dir, n) for n in ("regrouped.md", "book.md"))
        if os.path.exists(rg):
            for m in re.finditer(r"<!-- item (\{.*?\}) -->", open(rg, encoding="utf8").read()):
                try:
                    self.blocks.add(key(json.loads(m.group(1))["name"]))
                except (ValueError, KeyError):
                    pass
        if os.path.exists(bk):
            text = open(bk, encoding="utf8").read()
            for ln in text.split("\n"):
                if ln.startswith("|"):
                    self.rows.add(key(ln.strip("|").split("|")[0]))
                elif ln.startswith("#"):
                    self.heads.add(key(ln.lstrip("#")))
                self.bold.update(key(b.rstrip(":.")) for b in re.findall(r"\*\*([^*]{2,60})\*\*", ln))
            self.text = " " + key(text) + " "


def key(s):
    return " ".join(words(s))


PLACEHOLDER = re.compile(r"(?i)\bdepreciated\b|german rules only|:\s*$")


def miss_cause(rec, src, bt, book):
    """The cause bucket of a Commlink6 record nothing of ours matches (gap plan §0's buckets, computed)."""
    if not rec["modelled"]:
        return f"scope: no Chummer kind ({rec['kind']})"
    if PLACEHOLDER.search(rec["name"]):
        return "Commlink6 placeholder entry"
    if not rec["page"]:
        return "Commlink6 gives no page in this book (another book's entry)"
    if src is None:
        return "no import of this book"
    try:
        if book is not None and book.pages and int(rec["page"]) + book.offset > book.pages:
            return "page beyond the owned PDF"
    except ValueError:
        pass
    k = key(rec["name"])
    if k in bt.blocks:
        return "regroup block exists, not catalogued (kind classifier)"
    if k in bt.rows:
        return "table row in the converted text, dropped (regroup pairing / recipe)"
    if k in bt.heads:
        return "heading with no block (regroup unit rules)"
    if k in bt.bold:
        return "bold run-in name in prose (no heading or table)"
    if k and f" {k} " in bt.text:
        return "name only in running text"
    shorter = {key(a) for a in rec["aliases"]} | ({" ".join(k.split()[1:])} if len(k.split()) > 1 else set())
    shorter.discard("")
    if shorter & (bt.blocks | bt.rows | bt.heads | bt.bold):
        return "printed under a shorter or regrouped name (group/maker prefix, variant)"
    return "name not in our converted text (renamed, other printing, or a converter loss)"


# ---------- metrics ----------
def left_out(d):
    """True for a field diff the metrics leave out: Commlink6's own value, or one of ours the book never printed."""
    return bool(d.get("cl6only") or d["why"].startswith("ours empty") and d.get("pdf") == "neither")


def metrics(results, extras, excluded, meta):
    """The metrics dict (counts only) from the per-record results."""
    m = {"meta": meta}
    tot = len(results)
    # Commlink6's own records and fields (no book prints them) are left out of both measures, on a line of their own
    only = [r for r in results if r.get("cl6only")]
    nf, kept = 0, []
    for r in results:
        if r.get("cl6only"):
            continue
        gone = {d["field"] for d in r["diffs"] if left_out(d)}
        nf += len(gone)
        kept.append(r | {"compared": [f for f in r["compared"] if f not in gone],
                         "diffs": [d for d in r["diffs"] if d["field"] not in gone]})
    results = kept
    m["cl6_only"] = {"records": len(only), "fields": nf}
    m["already_have"] = sum(1 for r in results if r["how"] == "already have")  # (matched, another item's fields: not compared)
    m["optional_package"] = sum(1 for r in results if r["how"] == "optional package")  # (matched, not in the shipped data)
    owned = [r for r in results if r.get("excluded") is None]
    matched = [r for r in results if r["matched"] and r["how"] not in ("optional package", "already have")]  # (no entry of ours to compare)

    def cov(rows):
        return {"records": len(rows), "matched": sum(r["matched"] for r in rows),
                "pct": pct(sum(r["matched"] for r in rows), len(rows))}

    cm = [r for r in matched if "class" in r["families"]]  # (matched records of the kinds that carry a class)
    byk = group(cm, "kind")
    from importer.sr6 import classes as ours_classes
    ex = ours_classes.extra()
    m["deliberate_extra_classes"] = sum(1 for r in cm if r.get("class_via")) + sum(1 for e in extras if e["attrs"].get("class") in ex)
    m["class_match"] = {"via_section_class": sum(1 for r in cm if r.get("class_via")), "matched": len(cm), "equal": sum(1 for r in cm if r["families"]["class"]),
                        "pct": pct(sum(1 for r in cm if r["families"]["class"]), len(cm)),
                        "by_kind": {k: {"matched": len(rs), "equal": sum(1 for r in rs if r["families"]["class"]),
                                        "pct": pct(sum(1 for r in rs if r["families"]["class"]), len(rs))}
                                    for k, rs in sorted(byk.items())}}
    m["completeness"] = {
        "all": cov(results), "modelled": cov([r for r in results if r["modelled"]]), "owned": cov(owned),
        "excluded_from_owned": dict(Counter(r["excluded"] for r in results if r.get("excluded"))),
        "by_book": {b: cov(rs) for b, rs in sorted(group(results, "book").items())},
        "by_kind": {k: cov(rs) | {"modelled": rs[0]["modelled"]} for k, rs in sorted(group(results, "kind").items())},
        "by_family": {}}
    for fam in canon.FAMILIES:
        has = [r for r in results if fam in r["families"]]
        eq = sum(1 for r in has if r["families"][fam])
        m["completeness"]["by_family"][fam] = {"records": len(has), "equal": eq, "pct": pct(eq, len(has))}

    def acc(rows):
        exact = sum(1 for r in rows if not r["diffs"])
        no_ac = sum(1 for r in rows if not any(d["class"] in "ac" for d in r["diffs"]))
        return {"matched": len(rows), "exact": exact, "pct": pct(exact, len(rows)), "exact_but_b": no_ac,
                "pct_b_as_printed": pct(no_ac, len(rows)),
                "with_class_a": sum(1 for r in rows if any(d["class"] == "a" for d in r["diffs"]))}

    by_field = {}
    for f in sorted({f for r in matched for f in r["compared"]}):
        ds = [d for r in matched for d in r["diffs"] if d["field"] == f]
        n = sum(1 for r in matched if f in r["compared"])
        c = Counter(d["class"] for d in ds)
        by_field[f] = {"compared": n, "equal": n - len(ds), "pct": pct(n - len(ds), n), "a": c["a"], "b": c["b"],
                       "c": c["c"], "pct_b_as_printed": pct(n - c["a"] - c["c"], n)}
    m["accuracy"] = acc(matched) | {"by_field": by_field,
                                    "by_kind": {k: acc(rs) for k, rs in sorted(group(matched, "kind").items())},
                                    "by_book": {b: acc(rs) for b, rs in sorted(group(matched, "book").items())}}
    causes = Counter(("record", r["cause"]) for r in results if not r["matched"])
    causes.update(("field", f"{d['field']}: {d['why']} (class {d['class']})") for r in matched for d in r["diffs"])
    m["causes"] = [{"type": t, "cause": c, "n": n} for (t, c), n in causes.most_common()]
    m["fidelity"] = {
        "name_exact": sum(1 for r in matched if r["how"] == "exact"),
        "match_stage": dict(Counter(r["how"].split()[0] for r in matched)),
        "page_compared": sum(1 for r in matched if r["page"] and r["our_page"]),
        "page_equal": sum(1 for r in matched if r["page"] and r["page"] == r["our_page"]),
        "extra_in_ours": dict(Counter(e["src"] for e in extras)), "extra_total": len(extras)}
    m["excluded_reader"] = {f"{b}|{t}|{w}": n for (b, t, w), n in sorted(excluded.items())}
    m["records_total"] = tot
    return m


def group(rows, k):
    out = defaultdict(list)
    for r in rows:
        out[r[k]].append(r)
    return out


# ---------- baseline ----------
def deltas(cur, base):
    """{path: (base, now)} for every percentage that moved."""
    out = {}

    def walk(a, b, path):
        if isinstance(a, dict) and isinstance(b, dict):
            for k in a.keys() | b.keys():
                walk(a.get(k), b.get(k), f"{path}.{k}" if path else k)
        elif path.endswith("pct") or path.endswith("pct_b_as_printed"):
            if a != b:
                out[path] = (b, a)
    walk({k: v for k, v in cur.items() if k in ("completeness", "accuracy")},
         {k: v for k, v in base.items() if k in ("completeness", "accuracy")}, "")
    return dict(sorted(out.items()))


# ---------- writing ----------
def write(out_dir, m, results, extras, base=None):
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "cl6-metrics.json"), "w", encoding="utf8") as f:
        json.dump(m, f, indent=1, ensure_ascii=False)
    cols = ["src", "kind", "row", "field", "class", "pdf", "why", "name_cl6", "name_ours", "cl6", "ours", "page_cl6",
            "page_ours", "how", "cl6_id", "our_id", "status"]
    with open(os.path.join(out_dir, "cl6-diffs.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for r in results:
            base_row = {"src": r["src"], "kind": r["kind"], "name_cl6": r["name"], "name_ours": r["our_name"],
                        "page_cl6": r["page"], "page_ours": r["our_page"], "how": r["how"], "cl6_id": r["id"],
                        "our_id": r["our_id"]}
            # status: what the metrics do with the row. counted; cl6_only (a Commlink6-only record or field, left out);
            # unmatched (the record has no entry of ours: its family rows repeat the `missing` row)
            st = "cl6_only" if r.get("cl6only") else "counted" if r["matched"] else "unmatched"
            base_row["status"] = st
            if not r["matched"]:
                w.writerow(base_row | {"row": "missing", "why": r["cause"], "class": ""})
            for d in r["diffs"]:
                w.writerow(base_row | {"row": "field", "field": d["field"], "class": d["class"], "pdf": d["pdf"],
                                       "why": d["why"], "cl6": d["cl6"], "ours": d["ours"],
                                       "status": "cl6_only" if left_out(d) else st})
            for fam, eq in r["families"].items():
                if fam == "class" and not eq:
                    w.writerow(base_row | {"row": "field", "field": "class", "class": "", "why": "class differs or ours has none",
                                           "cl6": r.get("cl6_class", ""), "ours": r.get("our_class", ""), "status": st})
                elif not eq:
                    w.writerow(base_row | {"row": "family", "field": fam, "why": "ours lacks or differs"})
        for e in extras:
            w.writerow({"src": e["src"], "kind": e["kind"], "row": "extra", "name_ours": e["name"],
                        "page_ours": e["page"], "our_id": e["id"],
                        "status": "extra"})
    with open(os.path.join(out_dir, "cl6-report.md"), "w", encoding="utf8") as f:
        f.write(markdown(m, deltas(m, base) if base else None))


def _d(path, dl):
    if not dl or path not in dl:
        return ""
    b, n = dl[path]
    return "" if b is None or n is None else f" ({n - b:+.2f})"


def markdown(m, dl=None):
    c, a = m["completeness"], m["accuracy"]
    L = [f"# cl6check: our SR6 imports against Commlink6", "",
         f"Jar `{m['meta']['jar']}`; ours `{m['meta']['ours']}`; {m['meta']['when']}."
         + (f" Deltas against the baseline of {m['meta'].get('baseline_when', '?')}." if dl is not None else ""), "",
         "## Headline", "", "| measure | value |", "|---|---|",
         f"| completeness, all {c['all']['records']:,} English records | {c['all']['matched']:,} = **{c['all']['pct']}%**{_d('completeness.all.pct', dl)} |",
         f"| completeness, kinds we model ({c['modelled']['records']:,}) | {c['modelled']['matched']:,} = {c['modelled']['pct']}%{_d('completeness.modelled.pct', dl)} |",
         f"| completeness, owned pages ({c['owned']['records']:,}) | {c['owned']['matched']:,} = {c['owned']['pct']}%{_d('completeness.owned.pct', dl)} |",
         f"| accuracy: matched records with every compared field equal | {a['exact']:,} / {a['matched']:,} = **{a['pct']}%**{_d('accuracy.pct', dl)} |",
         f"| Commlink6-only, left out of both: records no book prints as an item / fields no book prints | "
         f"{m.get('cl6_only', {}).get('records', 0):,} / {m.get('cl6_only', {}).get('fields', 0):,} |",
         f"| accuracy, verified printed differences (class b) as printed | {a['exact_but_b']:,} = {a['pct_b_as_printed']}%{_d('accuracy.pct_b_as_printed', dl)} |",
         f"| matched via optional package (docs/sr6-cl6-optional-package.md; counted in the matches above) | {m.get('optional_package', 0):,} |",
         f"| class match (ours `class` = Commlink6's TYPE/SUBTYPE, case-insensitive): matched records of kinds that carry one | {m.get('class_match', {}).get('equal', 0):,} / {m.get('class_match', {}).get('matched', 0):,} = {m.get('class_match', {}).get('pct', 0)}% (of which {m.get('class_match', {}).get('via_section_class', 0):,} entries in a section with a deliberate extra class, CRITTERWARE/AUGMENTATION, accepted whatever Commlink6's class is) |",
         f"| deliberate extra classes (ours, not Commlink6's; accepted, entries with no Commlink6 match too) | {m.get('deliberate_extra_classes', 0):,} |",
         f"| matched as already in our data (relocated.json; counted in the matches above) | {m.get('already_have', 0):,} |",
         f"| matched records with a class-a (importer) error | {a['with_class_a']:,} |", "",
         "Excluded from the owned denominator: " + (", ".join(f"{k} {v}" for k, v in c["excluded_from_owned"].items())
                                                   or "none") + ".", "",
         "## Completeness by book", "", "| book | records | matched | % |", "|---|---:|---:|---:|"]
    L += [f"| {b} | {v['records']} | {v['matched']} | {v['pct']}{_d(f'completeness.by_book.{b}.pct', dl)} |"
          for b, v in c["by_book"].items()]
    L += ["", "## Completeness by kind", "", "| kind | modelled | records | matched | % |", "|---|---|---:|---:|---:|"]
    L += [f"| {k} | {'yes' if v['modelled'] else '**no**'} | {v['records']} | {v['matched']} | {v['pct']}"
          f"{_d(f'completeness.by_kind.{k}.pct', dl)} |" for k, v in sorted(c["by_kind"].items(), key=lambda x: -x[1]["records"])]
    cmk = m.get("class_match", {}).get("by_kind", {})
    if cmk:
        L += ["", "## Class match by kind", "", "| kind | matched | equal | % |", "|---|---:|---:|---:|"]
        L += [f"| {k} | {v['matched']} | {v['equal']} | {v['pct']} |" for k, v in cmk.items()]
    L += ["", "## Field families", "", "Records where Commlink6 has the datum, and those where ours is equal.", "",
          "| family | records | equal | % |", "|---|---:|---:|---:|"]
    L += [f"| {k} | {v['records']} | {v['equal']} | {v['pct']}{_d(f'completeness.by_family.{k}.pct', dl)} |"
          for k, v in c["by_family"].items()]
    L += ["", "## Accuracy by field", "", "class a: the PDF prints Commlink6's value; b: it prints ours; c: not settled.",
          "", "| field | compared | equal | % | a | b | c | % (b as printed) |", "|---|---:|---:|---:|---:|---:|---:|---:|"]
    L += [f"| {k} | {v['compared']} | {v['equal']} | {v['pct']}{_d(f'accuracy.by_field.{k}.pct', dl)} | {v['a']} | {v['b']} | "
          f"{v['c']} | {v['pct_b_as_printed']} |" for k, v in sorted(a["by_field"].items(), key=lambda x: -x[1]["compared"])]
    L += ["", "## Accuracy by kind", "", "| kind | matched | exact | % | % (b as printed) | with class a |",
          "|---|---:|---:|---:|---:|---:|"]
    L += [f"| {k} | {v['matched']} | {v['exact']} | {v['pct']} | {v['pct_b_as_printed']} | {v['with_class_a']} |"
          for k, v in a["by_kind"].items()]
    L += ["", "## Causes (every miss and every field difference)", "", "| # | type | cause | n |", "|---:|---|---|---:|"]
    L += [f"| {i} | {x['type']} | {x['cause']} | {x['n']} |" for i, x in enumerate(m["causes"], 1)]
    fi = m["fidelity"]
    L += ["", "## Fidelity (informational)", "",
          f"- names matched exactly: {fi['name_exact']:,}; by stage: "
          + ", ".join(f"{k} {v}" for k, v in sorted(fi["match_stage"].items(), key=lambda x: -x[1])),
          f"- pages equal: {fi['page_equal']:,} of {fi['page_compared']:,} compared",
          f"- entries of ours with no Commlink6 record (books Commlink6 covers): {fi['extra_total']:,}", ""]
    if m.get("patterns"):
        L += ["## Patterns: general rules for Commlink6's UI tags", "",
              "Over the matched records: each tag's best single rules (feature → tag) scored against Commlink6's own "
              "tagging, then a greedy set of precise rules (precision ≥ 0.75, at most 4, OR-ed). 'extras' counts our "
              "entries with no Commlink6 record that the set would tag.", "",
              "| tag | tagged | rule set | precision | recall | F1 | extras | best single rules (precision / recall) |",
              "|---|---:|---|---:|---:|---:|---:|---|"]
        for tag, v in m["patterns"].items():
            s = v["set"]
            singles = "; ".join(f"`{c['rule']}` {c['precision']:.2f}/{c['recall']:.2f}" for c in v["top"][:3])
            L.append(f"| {tag} | {v['positives']} | {' OR '.join(f'`{r}`' for r in s['rules']) or '—'} | "
                     f"{s['precision']:.2f} | {s['recall']:.2f} | {s['f1']:.2f} | {s['tags_extras']} | {singles} |")
        L.append("")
    pe = m.get("per_effect")
    if pe:
        L += ["## Per-effect", "", f"Per-effect: reproduced {pe['reproduced']} / {pe['of']} CommLink6 modifiers = "
              f"{pe['pct']}% (matched records; (target, value) level, informational; the whole-entry effects family "
              "above is unchanged).", ""]
    md = m.get("modifiers")
    if md:
        cv = md["coverage"]
        L += ["## Modifier patterns (phase 6 grammar input)", "",
              f"Commlink6 has {md['modifiers_total']:,} modifiers (pre-installed gear, decisions and UI tags left out). "
              f"Matched records carry {md['on_matched']:,} that state an effect (slots and includes are the slots "
              f"family); {md['on_matched_with_text']:,} sit on an entry with a description of ours, and "
              f"{md['aligned']:,} = {md['aligned_pct']}% of those align with a sentence naming the target and its value. "
              f"The top 20 templates reproduce {cv['top20']['reproduced']} ({cv['top20']['pct_matched']}% of the "
              f"described, {cv['top20']['pct_all']}% of all), the top 50 {cv['top50']['reproduced']} "
              f"({cv['top50']['pct_matched']}%, {cv['top50']['pct_all']}%).", "",
              "### Alignment by path family", "", "| path family | modifiers (described) | aligned | % |",
              "|---|---:|---:|---:|"]
        L += [f"| {f} | {v['modifiers']} | {v['aligned']} | {v['pct']} |" for f, v in md["by_family"].items()]
        L += ["", "### Templates", "",
              "{T}: a target from the family's vocabulary; {N}: the value; {R}: Rating/level; {#}: another number; "
              "*: other words. Seeds: aligned statements it came from; fires: matches in our descriptions; precision: "
              "fires that reproduce a modifier of that item; recall: share of the family's described modifiers "
              "reproduced.", "", "| # | path family | template | seeds | fires | precision | recall | reproduced |",
              "|---:|---|---|---:|---:|---:|---:|---:|"]
        L += [f"| {i} | {t['family']} | `{t['template']}` | {t['seeds']} | {t['fires']} | {t['precision']:.2f} | "
              f"{t['recall']:.2f} | {t['reproduced']} |" for i, t in enumerate(md["templates"][:50], 1)]
        L += ["", "### Path vocabulary (character / item / host → part → specific)", "",
              "| path | modifiers | most frequent specifics |", "|---|---:|---|"]
        L += [f"| {p} | {v['n']} | " + ", ".join(f"{k or '(the part itself)'} {n}" for k, n in v["specific"].items())
              + " |" for p, v in md["vocabulary"].items()]
        L.append("")
    if dl:
        L += ["## Every percentage that moved since the baseline", "", "| measure | baseline | now |", "|---|---:|---:|"]
        L += [f"| {k} | {b} | {n} |" for k, (b, n) in dl.items()]
        L.append("")
    return "\n".join(L)
