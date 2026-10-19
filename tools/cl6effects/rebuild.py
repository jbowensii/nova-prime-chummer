"""rebuild.py <importer tree> <saved runs dir> <out dir>: a copy of the saved import runs whose imported/<src>/*.xml and texts/<src>.xml are
re-written by <tree>'s importer (effects.apply, the overrides, the classes, the "cl6"/"book" correction rows, effects.copy_links), the way
importer/sr6/run.py _read does it. library/ dirs are links to the saved runs'. Run as a script (its own process per tree): it imports <tree>'s
`importer` package and nothing from tools/, so a tree older than this tool works. The overrides' stderr warnings stay on stderr."""
import glob
import os
import re
import shutil
import subprocess
import sys

ITEMFX = re.compile(r'<effect [^>]*target="item:[^"]*"[^>]*/>')
TEXT = re.compile(r'<text of="([^"]+)" id="([^"]+)">(.*?)</text>', re.S)


def link(src, dst):
    if sys.platform == "win32":
        # (a junction needs no privilege; mklink wants backslashes)
        p = subprocess.run(["cmd", "/c", "mklink", "/J", os.path.normpath(dst), os.path.normpath(src)], capture_output=True, text=True)
        if p.returncode:
            sys.exit(f"mklink failed for {dst}: {p.stdout}{p.stderr}")
    else:
        os.symlink(src, dst)


def fix_runs(runs, out):
    from importer.sr6 import classes, effects, overrides
    from importer.sr6.ids import slug
    os.makedirs(out, exist_ok=True)
    for run in sorted(glob.glob(runs + "/*/")):
        name = os.path.basename(run.rstrip("/\\"))
        dst = os.path.join(out, name)
        if os.path.exists(dst):
            try:
                os.rmdir(os.path.join(dst, "library"))  # (the link only, never the saved run it points at)
            except OSError:
                pass
            shutil.rmtree(dst, ignore_errors=True)
        if not os.path.isdir(os.path.join(run, "custom")):
            continue
        shutil.copytree(os.path.join(run, "custom"), os.path.join(dst, "custom"))
        lib = os.path.join(run, "library")
        if os.path.isdir(lib):
            link(lib, os.path.join(dst, "library"))
        reg_p = os.path.join(lib, "sr6", "book1", "regrouped.md")
        if not os.path.exists(reg_p):
            continue
        reg = open(reg_p, encoding="utf-8").read()
        base = os.path.join(dst, "custom", "sr6")
        for d in glob.glob(os.path.join(base, "imported", "*")):
            src = os.path.basename(d)
            # (apply keeps the item: effects of its input: strip them so removals show; an add-on's item: effects come from its host's text, catalog.add_ons, not from apply: they stay)
            files = {os.path.basename(f): "".join(l if " accessoryOf=" in l else ITEMFX.sub("", l) for l in open(f, encoding="utf-8").read().splitlines(keepends=True)) for f in glob.glob(d + "/*.xml")}
            tp = os.path.join(base, "texts", src + ".xml")
            texts = open(tp, encoding="utf-8").read() if os.path.exists(tp) else ""
            tx = {(m.group(1), m.group(2)): m.group(3) for m in TEXT.finditer(texts)}
            rt = [t for (k, i), t in tx.items() if k == "rules" and len(t) >= 60]

            def unadd(m):  # (undo the rule texts the saved run wrote into other entries, so the rule-name fallback runs again)
                t = m.group(3)
                if m.group(1) != "rules":
                    for r in rt:
                        if r in t:
                            t = t.replace(chr(10) + r, "").replace(r, "")
                return f'<text of="{m.group(1)}" id="{m.group(2)}">{t}</text>'
            texts = TEXT.sub(unadd, texts)
            # (the real _read order, run.py _read: apply() over every entry, then the overrides, the classes and the override texts, then
            # apply(only=added) for the entries an override added; the saved output has them already, so they are taken out first)
            added = set()
            for r in overrides.table(src):
                if "add" in r:
                    added.add((r["kind"], f"{src}." + (r["add"].get("id") or slug(r["add"].get("name", r["cl6"])))))
            addrows = [dict(r, add=dict(r["add"], id=f"{src}." + (r["add"].get("id") or slug(r["add"].get("name", r["cl6"]))))) for r in overrides.table(src) if "add" in r]
            kept = {}  # (an entry an override added, as saved: its family kids and prerequisites stay, its effects are read again below)
            for kind, eid in sorted(added):
                fn = kind + ".xml"
                if fn in files:
                    mm = re.search(r'[ \t]*<(\w+) id="' + re.escape(eid) + r'".*?</\1>\n?', files[fn], flags=re.S)
                    if mm:
                        kept.setdefault(fn, []).append(re.sub(r"<effect [^>]*/>", "", mm.group(0)).strip())
                        files[fn] = files[fn].replace(mm.group(0), "")
            o, t2 = effects.apply(files, texts, reg)
            have = {(fn[:-4], i) for fn, x in o.items() for i in re.findall(r'^\s*<\w+ id="([^"]+)"', x or "", re.M)}
            for fn, add in kept.items():
                o[fn] = o[fn].replace("</sr6:data>", "".join(chr(10) + "  " + x for x in add) + chr(10) + "</sr6:data>")  # (each on a line of its own: the id scan reads line starts)
            o = overrides.apply(src, o, rows=addrows)  # (an entry an override adds that the saved output lacks is created here; one it has is left as is)
            o = classes.apply(o, src=src)
            t2 = overrides.texts(src, o, t2, rows=addrows)
            now = {(fn[:-4], i) for fn, x in o.items() for i in re.findall(r'^\s*<\w+ id="([^"]+)"', x or "", re.M)}
            if now - have:
                o, t2 = effects.apply(o, t2, reg, only=now - have)
            for fn, x in o.items():
                open(os.path.join(d, fn), "w", encoding="utf-8", newline="").write(x)
            if os.path.exists(tp):
                open(tp, "w", encoding="utf-8", newline="").write(t2)


def sources(run):
    return [d for d in glob.glob(os.path.join(run, "custom", "sr6", "imported", "*")) if os.path.isdir(d)]


def cl6_rows(out):
    """Apply the hand-written "gen": "cl6" / "book" override rows (ids scoped as on disk) to the fixed runs."""
    from importer.sr6 import overrides
    n = 0
    for d in glob.glob(os.path.join(out, "*", "custom", "sr6", "imported", "*")):
        src = os.path.basename(d)
        if not os.path.isdir(d) or src == "samples":
            continue
        rows = [dict(r, id=f"{src}.{r['id']}") for r in overrides.table(src) if r.get("gen") in ("cl6", "book")]
        if not rows:
            continue
        files = {os.path.basename(f): open(f, encoding="utf-8").read() for f in glob.glob(d + "/*.xml")}
        for name, xml in overrides.apply(src, files, rows).items():
            if xml != files.get(name):
                open(os.path.join(d, name), "w", encoding="utf-8", newline="").write(xml)
                n += 1
    print("cl6 rows: files changed", n)


def link_pass(out):
    """effects.copy_links over the fixed runs (each run's own sources over the others')."""
    from importer.sr6 import effects

    def load_texts(run, srcs):
        res = {}
        for src in srcs:
            p = os.path.join(run, "custom", "sr6", "texts", src + ".xml")
            if os.path.exists(p):
                res[src] = {(m.group(1), m.group(2)): m.group(3) for m in TEXT.finditer(open(p, encoding="utf-8").read())}
        return res

    def load(run):
        return {os.path.basename(d): {os.path.basename(f): open(f, encoding="utf-8").read() for f in glob.glob(d + "/*.xml")}
                for d in sources(run) if os.path.basename(d) != "samples"}
    allruns = sorted(glob.glob(out + "/*/"))
    canon = {}
    for r in allruns:
        for src, files in load(r).items():
            if src not in canon or "current-printing" in r:
                canon[src] = files
    n = 0
    for r in allruns:
        mine = load(r)
        if not mine:
            continue
        for (src, fn), xml in effects.copy_links({**canon, **mine}, load_texts(r, mine)).items():
            if src in mine:
                open(os.path.join(r, "custom", "sr6", "imported", src, fn), "w", encoding="utf-8", newline="").write(xml)
                n += 1
    print("linkpass: files changed", n)


if __name__ == "__main__":
    tree, runs, out = sys.argv[1:4]
    sys.path.insert(0, tree)
    fix_runs(runs, out)
    cl6_rows(out)
    link_pass(out)
