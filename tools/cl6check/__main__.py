"""cl6check: measure our SR6 imports against Commlink6 (docs/cl6check.md).

  python -m tools.cl6check --ours <dir> [--jar <jar>] [--out <dir>] [--save-baseline] [--baseline <json>] [--no-pdf]
                           [--fail-under completeness=99,accuracy=99]
      <dir>: a custom/sr6 folder, or a folder of `python -m importer sr6 check` runs. The jar: --jar, else $CL6_JAR,
      else the default Commlink6 install; none found → nothing to measure, exit 0. Reports: --out, else $CL6CHECK_OUT,
      else .extract/cl6check (gitignored). The baseline is <out>/baseline.json unless --baseline names one.
  python -m tools.cl6check import <books file> <out dir> [-j 10]
      a fresh `importer sr6 check` of every book in parallel; each line of the books file is `<run name>|<pdf path>`.
  python -m tools.cl6check import --library <books file> <out dir> [--md-from <runs dir>]
      the production import: every book in one library (<out>/library/sr6/<run name>, one <out>/custom/sr6), one after
      the other in the file's order, as the server's upload and Re-import all run them (`importer sr6 run`), with the
      steps only a library has: the cross-book fill, the printings of a book, the errata, the links across books.
      --md-from: a folder of earlier runs whose book.md the import reuses when it was made from the same PDF by this converter.
  python -m tools.cl6check trace --runs <dir> --out <dir> [--jar <jar>] [--verdicts <json>]
      the corpus of every import run, ordered by the PDFs' dates; every Commlink6 value traced to where it sits
      (trace.py): <out>/cl6-trace.csv (owner only) and <out>/cl6-trace.md.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from tools.cl6check import arbitrate, canon, fields, match, modifiers, ours, patterns, reader, report
from tools.cl6check import optional as optional_package

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


LEVEL = re.compile(r"-(?:level-|rating-)?\d+$")  # (an id's level suffix: one entry per level)
RATED = re.compile(r"\s*\((?:Rating|Level)\s*\d+\)\s*$")


def _same(fam, cl, h, shared, keep=()):
    """Whether our entry h holds family `fam` as Commlink6's record does. variants: equal too when the entry's name carries
    one of Commlink6's variant names (one item per variant, the owner's rule). slots: when Commlink6 makes two records of
    the item (`shared`), each record's set is a part of ours."""
    mine = h["families"].get(fam)
    if mine == cl:
        return True
    if (h["src"], h["kind"], h["id"], fam) in keep:  # (the owner keeps ours: value_keep.json, field `variants` for an install/option tag, `social` for a printed `Rating`)
        return True
    if fam == "variants":  # (or the entry's name carries the variant)
        return ours.carries(h["name"], cl)
    return fam == "slots" and shared and isinstance(mine, (set, frozenset)) and set(cl) <= set(mine)


def _levels(c, hits, entries):
    """The entries a record is compared with: when it hits one level of an item (`Cybereyes (Rating 6)`), any level of
    that item, the one it agrees with most (Commlink6 and the book number advanced cyberware's levels differently; ties
    keep the entry matched by name)."""
    if not hits or not all(RATED.search(h["name"]) for h in hits):
        return hits
    base = {(h["kind"], RATED.sub("", h["name"]).casefold()) for h in hits}
    sib = [e for e in entries if (e["kind"], RATED.sub("", e["name"]).casefold()) in base and RATED.search(e["name"])]
    best = min(len(fields.compare(c, e)[1]) for e in sib)
    return hits if min(len(fields.compare(c, h)[1]) for h in hits) <= best else [min(sib, key=lambda e: len(fields.compare(c, e)[1]))]


def compare(cl6, mine, pdf=True, trace=None, package=None, accept=None, sections=None, extra=None, keep=None,
            verdicts=None):
    """(per-record results, our extras, matched (record, entry) pairs) for every canonical record against our
    sources."""
    by_src = defaultdict(list)
    for c in cl6:
        by_src[c["src"]].append(c)
    results, extras, pairs = [], [], []
    keep = optional_package.load_keep() if keep is None else keep
    verdicts = optional_package.load_verdicts() if verdicts is None else verdicts
    optional, relocated, *h = package if package is not None else (*optional_package.load(), optional_package.load_have())
    where = {o["id"]: o for e in mine.values() for o in e.entries}  # (relocated records name an entry of another source)
    have = dict(h[0]) if h else {}  # (an entry of ours that isn't a loaded catalog entry, e.g. a rules section, is stood in for by its id)
    moved = {id(where[r["our_id"]]) for r in [*relocated.values(), *have.values()] if r["our_id"] in where}
    for src, recs in sorted(by_src.items()):
        s = mine.get(src)
        entries = s.entries if s else []
        book = arbitrate.Book(s.book_dir if s else None)
        bt = report.BookText(s.book_dir if s else None)
        matched = set()
        found = match.match([c for c in recs if (src, c["id"]) not in optional and (src, c["id"]) not in relocated
                              and (src, c["id"]) not in have], entries)
        found += [(c, [], "optional package") for c in recs if (src, c["id"]) in optional]
        found += [(c, [where[relocated[src, c["id"]]["our_id"]]] if relocated[src, c["id"]]["our_id"] in where else [], "relocated")
                  for c in recs if (src, c["id"]) in relocated]
        found += [(c, [where.get(have[src, c["id"]]["our_id"]) or {"id": have[src, c["id"]]["our_id"], "name": have[src, c["id"]]["our_id"], "src": src, "page": "", "kind": "rules", "families": {}, "attrs": {}, "kids": [], "effects": []}], "already have") for c in recs if (src, c["id"]) in have]
        stems = defaultdict(list)  # (the entries that are levels or tiers of one item: wired-reflexes-1, -2 …)
        for e in entries:
            stems[e["kind"], LEVEL.sub("", e["id"])].append(e)
        owners = defaultdict(int)  # (the Commlink6 records an entry answers: an item Commlink6 makes two records of)
        for _, hits, _ in found:
            for h in hits:
                owners[id(h)] += 1
        for c, hits, how in found:
            first, hits = hits, _levels(c, hits, entries)
            # several entries (a parent and its variant rows): compare the one that agrees most, nearest first on a tie
            sib = lambda h: stems[h["kind"], LEVEL.sub("", h["id"])] if len(stems[h["kind"], LEVEL.sub("", h["id"])]) > 1 else ()  # noqa: E731
            o = min(hits, key=lambda h: len(fields.compare(c, h, sib(h))[1])) if hits else None
            r = {k: c[k] for k in ("book", "src", "kind", "modelled", "tag", "id", "name", "page")} | {
                "matched": bool(hits) or how == "optional package", "how": how if hits or how == "optional package" else "", "our_id": o["id"] if o else "", "our_name": o["name"] if o else "",
                "our_page": o["page"] if o else "", "our_kind": o["kind"] if o else "", "compared": [], "diffs": [],
                "families": {f: bool(o) and any(_same(f, v, h, owners[id(h)] > 1, keep) for h in hits)
                             for f, v in c["families"].items() if f != "subtype"  # (subtype: the class family's now)
                             and not (f == "class" and o and o["kind"] not in canon.CLASS_KINDS)},  # (an entry of a kind with no class)
                "cl6_class": c.get("cl6_class", ""), "our_class": (o["attrs"].get("class", "") if o else ""),
                "cause": "", "excluded": None,
                "cl6only": bool(c.get("cl6only")) and not hits and how not in ("optional package", "relocated", "already have")}  # (one the package or our data holds is matched)
            if not c["page"]:
                r["excluded"] = "no page in this book"
            elif book.pages and c["page"].isdigit() and int(c["page"]) + book.offset > book.pages:
                r["excluded"] = "page beyond the owned PDF"
            if how == "optional package" and not hits:
                r["families"] = {}  # (not in the shipped data: no entry of ours to hold a family)
            if o and how == "already have":  # (the owner counts it complete; the entry is another item's: no fields, pairs or families)
                r["families"] = {}
                results.append(r)
                continue
            if o:
                matched.update(id(h) for h in [*first, *hits])
                pairs.append((c, o))
                r["compared"], r["diffs"] = fields.compare(c, o, sib(o))
                for d in r["diffs"]:
                    d["class"], d["pdf"] = arbitrate.settle(book if pdf else None, o, c, d)
                    t = (trace or {}).get((c["src"], c["id"], d["field"]))
                    if t == "unprinted" and not d["why"].startswith("ours empty"):
                        t = None  # an unprinted Commlink6 value only excuses an empty field of ours, not a different printed one
                    if t and d["class"] == "a":  # the trace says the book never printed Commlink6's value: not our error
                        d["class"], d["cl6only"] = "c", t == "only"
                    if d["class"] in ("a", "c") and any((c["src"], k, o["id"], d["field"]) in keep or (
                            c["src"], k, c["id"], c["name"], o["id"], d["field"], d["cl6"], d["ours"]) in verdicts
                                                        for k in (c["kind"], o["kind"])):
                        # (the owner keeps ours: value_keep.json, keyed by the csv's kind = Commlink6's, or ours; after the trace,
                        # which can make a row c; a `verdicts` row only while both values are the ones ruled on)
                        d["class"], d["pdf"] = "b", "ours"
                        d.pop("cl6only", None)
            elif how != "optional package":
                r["cause"] = report.miss_cause(c, s, bt, book)
            results.append(r)
        book.close()
        extras += [e for e in entries if id(e) not in matched and id(e) not in moved]
    _settle_classes(results, optional_package.load_accept() if accept is None else accept, sections, extra)
    return results, extras, pairs


def _settle_classes(results, accept, sections=None, extra=None):
    """Two records matching one entry can class it two ways: the one whose class is a type of the entry's kind is the one
    compared (a rocket launcher is `WEAPON_SPECIAL/LAUNCHERS`, not the `AMMUNITION/ROCKETS` of its rocket); a record the
    owner accepts (class_accept.json) counts equal."""
    by = defaultdict(list)
    for r in results:
        if r["matched"] and "class" in r["families"] and r["our_id"]:
            by[r["our_id"], r["our_kind"]].append(r)
    for (_, kind), rs in by.items():
        fits = [r for r in rs if canon.fits_kind(kind, r["cl6_class"])]
        if len(rs) > 1 and 0 < len(fits) < len(rs):
            for r in rs:
                if r not in fits:
                    del r["families"]["class"]
    from importer.sr6 import classes
    rules = classes.prefixes() if sections is None else sections
    extra = classes.extra() if extra is None else extra
    for r in results:
        if "class" in r["families"] and accept.get((r["src"], r["id"])) == r["our_id"]:
            r["families"]["class"] = True
        elif "class" in r["families"] and r.get("our_class") and any(
                classes.in_section(x, r["src"], r["our_kind"], r["our_page"]) and r["our_class"] == x["class"] for x in rules):
            # a section's deliberate extra class (CRITTERWARE/AUGMENTATION, not Commlink6's): accepted whatever Commlink6's is
            r["families"]["class"] = True
            r["class_via"] = "section class"
        elif "class" in r["families"] and r.get("our_class") in extra:  # (a deliberate extra class: Commlink6 has no such one)
            r["families"]["class"] = True
            r["class_via"] = "extra class"


def run_imports(books_file, out, jobs):
    """`python -m importer sr6 check` for every `<run>|<pdf>` line, in parallel, into <out>/<run>."""
    lines = [ln.strip().split("|", 1) for ln in open(books_file, encoding="utf8") if "|" in ln]

    def one(item):
        name, pdf = item
        with open(os.path.join(out, f"{name}.log"), "w", encoding="utf8") as log:
            rc = subprocess.call([sys.executable, "-m", "importer", "sr6", "check", pdf, "--out", os.path.join(out, name)],
                                 cwd=REPO, stdout=log, stderr=subprocess.STDOUT)
        print(f"{name}: exit {rc}", flush=True)
        return rc
    os.makedirs(out, exist_ok=True)
    with ThreadPoolExecutor(jobs) as ex:
        return max(ex.map(one, lines), default=0)


def run_library(books_file, out, md_from=None):
    """Every `<run>|<pdf>` line imported into ONE library, in order, with `python -m importer sr6 run` (the server's
    upload and Re-import all): <out>/library/sr6/<run>, <out>/custom/sr6, the log in <out>/import.log. A fresh library
    each time. md_from: earlier runs (`import`'s) whose library/sr6/book1 book.md and import.xml are copied beside the
    PDF, so `run --reuse` skips a conversion of the same PDF by the same converter."""
    import shutil
    lines = [ln.strip().split("|", 1) for ln in open(books_file, encoding="utf8") if "|" in ln]
    lib, custom = os.path.join(out, "library", "sr6"), os.path.join(out, "custom", "sr6")
    # only ever clear a folder this command made: new/empty, or with its own import.log (never an app's data folder)
    if os.path.isdir(out) and os.listdir(out) and not os.path.isfile(os.path.join(out, "import.log")):
        sys.exit(f"{out}: not empty and not an earlier `import --library` output; refusing to clear it")
    for d in (os.path.join(out, "library"), os.path.join(out, "custom")):  # (only inside the scratch dir)
        shutil.rmtree(d, ignore_errors=True)
    os.makedirs(lib)
    rc = 0
    with open(os.path.join(out, "import.log"), "w", encoding="utf8") as log:
        for name, pdf in lines:
            d = os.path.join(lib, name)
            os.makedirs(d)
            shutil.copyfile(pdf, os.path.join(d, "original.pdf"))
            old = os.path.join(md_from, name, "library", "sr6", "book1") if md_from else ""
            for f in ("book.md", "import.xml"):
                if old and os.path.isfile(os.path.join(old, f)):
                    shutil.copyfile(os.path.join(old, f), os.path.join(d, f))
            log.write(f"== {name}\n")
            log.flush()
            r = subprocess.call([sys.executable, "-m", "importer", "sr6", "run", d, "--custom", custom, "--reuse",
                                 "--file", os.path.basename(pdf)], cwd=REPO, stdout=log, stderr=subprocess.STDOUT)
            print(f"{name}: exit {r}", flush=True)
            rc = max(rc, r)
    return rc


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv[:1] == ["trace"]:
        from tools.cl6check import corpus, trace
        p = argparse.ArgumentParser(prog="cl6check trace")
        p.add_argument("--runs", required=True)
        p.add_argument("--out", required=True)
        p.add_argument("--jar")
        p.add_argument("--verdicts", help="the owner's page verdicts (JSON, outside the repo)")
        a = p.parse_args(argv[1:])
        jar = reader.find_jar(a.jar)
        if jar is None:
            print("cl6check: no Commlink6 jar (--jar or $CL6_JAR): nothing to trace, skipped.")
            return 0
        recs, _ = reader.read(jar)
        c = corpus.load(a.runs, os.path.join(REPO, "public", "data", "sr6", "sources.xml"))
        verdicts = json.load(open(a.verdicts, encoding="utf8")) if a.verdicts else None
        rows, n = trace.run(c, [canon.canonical(r) for r in recs], verdicts)
        trace.write(a.out, rows, n, c)
        with open(os.path.join(a.out, "cl6-trace.md"), "w", encoding="utf8") as f:
            f.write(trace.markdown(rows, n, c))
        print(f"traced {n['records']} records: {n['fields compared']} fields compared, {n['fields equal']} equal; "
              f"{os.path.join(a.out, 'cl6-trace.md')}")
        return 0
    if argv[:1] == ["import"]:
        p = argparse.ArgumentParser(prog="cl6check import")
        p.add_argument("books")
        p.add_argument("out")
        p.add_argument("-j", type=int, default=10)
        p.add_argument("--library", action="store_true", help="one library, in order, as production imports (run_library)")
        p.add_argument("--md-from", help="with --library: earlier runs whose book.md to reuse")
        a = p.parse_args(argv[1:])
        return run_library(a.books, a.out, a.md_from) if a.library else run_imports(a.books, a.out, a.j)
    p = argparse.ArgumentParser(prog="cl6check", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--jar")
    p.add_argument("--ours", default=os.environ.get("CL6_OURS"))
    p.add_argument("--out", default=os.environ.get("CL6CHECK_OUT") or os.path.join(REPO, ".extract", "cl6check"))
    p.add_argument("--baseline")
    p.add_argument("--save-baseline", action="store_true")
    p.add_argument("--no-pdf", action="store_true")
    p.add_argument("--fail-under", default="")
    a = p.parse_args(argv)
    jar = reader.find_jar(a.jar)
    if jar is None:
        print("cl6check: no Commlink6 jar (--jar or $CL6_JAR): nothing to measure, skipped.")
        return 0
    if not a.ours or not os.path.isdir(a.ours):
        print("cl6check: --ours (or $CL6_OURS) must name a custom/sr6 folder or a folder of import runs.", file=sys.stderr)
        return 2
    recs, excluded = reader.read(jar)
    cl6 = [canon.canonical(r) for r in recs]
    mine = ours.load(a.ours)
    results, extras, pairs = compare(cl6, mine, pdf=not a.no_pdf, trace=arbitrate.load_trace(os.path.join(a.out, "cl6-trace.csv")))
    when = datetime.datetime.now().isoformat(timespec="seconds")
    base_path = a.baseline or os.path.join(a.out, "baseline.json")
    base = json.load(open(base_path, encoding="utf8")) if os.path.exists(base_path) and not a.save_baseline else None
    meta = {"jar": jar.name, "ours": os.path.abspath(a.ours), "when": when, "pdf": not a.no_pdf}
    if base:
        meta["baseline_when"] = base["meta"]["when"]
    m = report.metrics(results, extras, excluded, meta)
    m["patterns"] = patterns.run(pairs, extras, mine)
    m["modifiers"] = modifiers.run(cl6, pairs, mine)
    m["per_effect"] = modifiers.per_effect(pairs)
    report.write(a.out, m, results, extras, base)
    if a.save_baseline:
        with open(base_path, "w", encoding="utf8") as f:
            json.dump(m, f, indent=1, ensure_ascii=False)
    c, acc = m["completeness"], m["accuracy"]
    print(f"completeness {c['all']['matched']}/{c['all']['records']} = {c['all']['pct']}% "
          f"(modelled {c['modelled']['pct']}%, owned {c['owned']['pct']}%); accuracy {acc['pct']}% "
          f"({acc['pct_b_as_printed']}% with class b as printed); report {os.path.join(a.out, 'cl6-report.md')}"
          + ("; baseline saved" if a.save_baseline else ""))
    pe = m["per_effect"]
    print(f"per-effect: reproduced {pe['reproduced']} / {pe['of']} CommLink6 modifiers = {pe['pct']}%")
    gate = dict(x.split("=") for x in a.fail_under.split(",") if "=" in x)
    low = [k for k, v in gate.items() if ({"completeness": c["all"]["pct"], "accuracy": acc["pct"]}.get(k) or 0) < float(v)]
    return 1 if low else 0


if __name__ == "__main__":
    sys.exit(main())
