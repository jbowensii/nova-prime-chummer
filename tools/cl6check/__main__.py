"""cl6check: measure our SR6 imports against Commlink6 (docs/cl6check.md).

  python -m tools.cl6check --ours <dir> [--jar <jar>] [--out <dir>] [--save-baseline] [--baseline <json>] [--no-pdf]
                           [--fail-under completeness=99,accuracy=99]
      <dir>: a custom/sr6 folder, or a folder of `python -m importer sr6 check` runs. The jar: --jar, else $CL6_JAR,
      else the default Commlink6 install; none found → nothing to measure, exit 0. Reports: --out, else $CL6CHECK_OUT,
      else .extract/cl6check (gitignored). The baseline is <out>/baseline.json unless --baseline names one.
  python -m tools.cl6check import <books file> <out dir> [-j 10]
      a fresh `importer sr6 check` of every book in parallel; each line of the books file is `<run name>|<pdf path>`.
  python -m tools.cl6check trace --runs <dir> --out <dir> [--jar <jar>] [--verdicts <json>]
      the corpus of every import run, ordered by the PDFs' dates; every Commlink6 value traced to where it sits
      (trace.py): <out>/cl6-trace.csv (owner only) and <out>/cl6-trace.md.
"""
import argparse
import datetime
import json
import os
import subprocess
import sys
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

from tools.cl6check import arbitrate, canon, fields, match, modifiers, ours, patterns, reader, report

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def compare(cl6, mine, pdf=True):
    """(per-record results, our extras, matched (record, entry) pairs) for every canonical record against our
    sources."""
    by_src = defaultdict(list)
    for c in cl6:
        by_src[c["src"]].append(c)
    results, extras, pairs = [], [], []
    for src, recs in sorted(by_src.items()):
        s = mine.get(src)
        entries = s.entries if s else []
        book = arbitrate.Book(s.book_dir if s else None)
        bt = report.BookText(s.book_dir if s else None)
        matched = set()
        for c, hits, how in match.match(recs, entries):
            # several entries (a parent and its variant rows): compare the one that agrees most, nearest first on a tie
            o = min(hits, key=lambda h: len(fields.compare(c, h)[1])) if hits else None
            r = {k: c[k] for k in ("book", "src", "kind", "modelled", "tag", "id", "name", "page")} | {
                "matched": bool(hits), "how": how, "our_id": o["id"] if o else "", "our_name": o["name"] if o else "",
                "our_page": o["page"] if o else "", "our_kind": o["kind"] if o else "", "compared": [], "diffs": [],
                "families": {f: bool(o) and any(h["families"].get(f) == v for h in hits)
                             for f, v in c["families"].items()}, "cause": "", "excluded": None,
                "cl6only": bool(c.get("cl6only"))}
            if not c["page"]:
                r["excluded"] = "no page in this book"
            elif book.pages and c["page"].isdigit() and int(c["page"]) + book.offset > book.pages:
                r["excluded"] = "page beyond the owned PDF"
            if o:
                matched.update(id(h) for h in hits)
                pairs.append((c, o))
                r["compared"], r["diffs"] = fields.compare(c, o)
                for d in r["diffs"]:
                    d["class"], d["pdf"] = arbitrate.settle(book if pdf else None, o, c, d)
            else:
                r["cause"] = report.miss_cause(c, s, bt, book)
            results.append(r)
        book.close()
        extras += [e for e in entries if id(e) not in matched]
    return results, extras, pairs


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
        a = p.parse_args(argv[1:])
        return run_imports(a.books, a.out, a.j)
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
    results, extras, pairs = compare(cl6, mine, pdf=not a.no_pdf)
    when = datetime.datetime.now().isoformat(timespec="seconds")
    base_path = a.baseline or os.path.join(a.out, "baseline.json")
    base = json.load(open(base_path, encoding="utf8")) if os.path.exists(base_path) and not a.save_baseline else None
    meta = {"jar": jar.name, "ours": os.path.abspath(a.ours), "when": when, "pdf": not a.no_pdf}
    if base:
        meta["baseline_when"] = base["meta"]["when"]
    m = report.metrics(results, extras, excluded, meta)
    m["patterns"] = patterns.run(pairs, extras, mine)
    m["modifiers"] = modifiers.run(cl6, pairs, mine)
    report.write(a.out, m, results, extras, base)
    if a.save_baseline:
        with open(base_path, "w", encoding="utf8") as f:
            json.dump(m, f, indent=1, ensure_ascii=False)
    c, acc = m["completeness"], m["accuracy"]
    print(f"completeness {c['all']['matched']}/{c['all']['records']} = {c['all']['pct']}% "
          f"(modelled {c['modelled']['pct']}%, owned {c['owned']['pct']}%); accuracy {acc['pct']}% "
          f"({acc['pct_b_as_printed']}% with class b as printed); report {os.path.join(a.out, 'cl6-report.md')}"
          + ("; baseline saved" if a.save_baseline else ""))
    gate = dict(x.split("=") for x in a.fail_under.split(",") if "=" in x)
    low = [k for k, v in gate.items() if ({"completeness": c["all"]["pct"], "accuracy": acc["pct"]}.get(k) or 0) < float(v)]
    return 1 if low else 0


if __name__ == "__main__":
    sys.exit(main())
