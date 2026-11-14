"""Read Commlink6 quality_paths.xml (graph of steps) into canonical per-book paths.json."""

import argparse
import copy
import json
import re
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

BOOKS = ("companion", "dealers_of_death", "deus_ex_arcana", "firing_squad", "hack_slash", "shadow_cast")
_BASE = "de/rpgframework/shadowrun6/data/"


def _props(zf, book):
    """The book's English i18n key=value lines ({} if absent)."""
    try:
        text = zf.read(f"{_BASE}{book}/i18n/{book}.properties").decode("utf-8")
    except KeyError:
        return {}
    out = {}
    for line in text.splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            k, v = line.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def _raw(el):
    """One requires child as a compact XML string (stray tail text dropped)."""
    el = copy.deepcopy(el)
    for e in el.iter():
        e.text = (e.text or "").strip() or None
        e.tail = (e.tail or "").strip() or None
    el.tail = None
    return ET.tostring(el, encoding="unicode")


def _valmod(m):
    """A valmod element as a modification entry (raw `what` kept as attr)."""
    ref = f"{m.get('type', '').lower()}:{m.get('ref')}"
    return {"op": "valmod", "ref": ref, "value": m.get("value"), "attr": m.get("what", "")}


def _choice(c):
    """A choice element: options from its `options` attribute or its subOption children."""
    opts = [{"ref": o, "label": o} for o in filter(None, c.get("options", "").split(","))]
    for so in c.findall("subOption"):
        opt = {"ref": so.get("id"), "label": so.get("id")}
        vals = [_valmod(v) for v in so.findall("modifications/valmod")]
        if vals:
            opt["modifications"] = vals  # per-option effect; beyond the spec'd schema, kept so nothing is lost
        opts.append(opt)
    return {"op": "choice", "ref": c.get("ref"), "type": c.get("type"), "id": c.get("uuid"), "options": opts}


def read_book_paths(book, jar_path):
    """Parse the book's quality_paths.xml into a list of path dicts."""
    with zipfile.ZipFile(jar_path) as zf:
        root = ET.fromstring(zf.read(f"{_BASE}{book}/data/quality_paths.xml"))
        props = _props(zf, book)
    paths = []
    for qp in root.iter("qpath"):
        pid = qp.get("id")
        steps = []
        for st in qp.iter("step"):
            sid = st.get("id")
            key = f"qpath.{pid}.step.{sid}"
            mods = [
                {
                    "op": "remove" if m.get("remove") == "true" else "add",
                    "ref": f"{m.get('type', '').lower()}:{m.get('ref')}",
                }
                for m in st.findall("modifications/itemmod")
            ]
            mods += [_valmod(m) for m in st.findall("modifications/valmod")]
            mods += [_choice(c) for c in st.findall("choices/choice")]  # CL6 puts <choices> beside <modifications>
            mods += [
                {"op": "subOption", "ref": so.get("id"), "label": so.get("id")}
                for so in st.findall("modifications/subOption")
            ]
            steps.append(
                {
                    "id": sid,
                    "level": int(st.get("level", 0)),
                    "name": props.get(key, sid),
                    "body": props.get(f"{key}.desc", ""),  # CL6 ships no step prose today
                    "requires": [_raw(r) for r in st.findall("requires/*")],
                    "modifications": mods,
                    "nextSteps": [(n.text or "").strip() for n in st.findall("nextSteps/next")],
                }
            )
        paths.append({"id": pid, "name": props.get(f"qpath.{pid}", pid), "steps": steps})
    return paths


def write_canonical(book, paths, out_dir):
    """Write <out_dir>/<book>/paths.json."""
    d = Path(out_dir) / book
    d.mkdir(parents=True, exist_ok=True)
    (d / "paths.json").write_text(json.dumps(paths, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def _norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def book_paths(custom_dir, cl6=None):
    """The paths the books print that Commlink6 lacks, as linear paths (`origin: book`): each
    imported/<src>/qualitypaths.xml entry, its steps the qualities (its source's first, then any other's) named so
    (the quality's name or its printed `alias`, else a bare `Step 1` of the group of the path's name), in printed order,
    a heading that is no quality (an intro) dropped. A path
    Commlink6 has (cl6: {book: [its paths]}) is skipped: the same name, or at least half its steps named as one of its
    steps. Path ids are the entry ids; step ids their quality ids; bookKey the source id lowercased."""
    cl6 = (
        {b: json.loads((Path(__file__).parent / "library" / b / "paths.json").read_text("utf-8")) for b in BOOKS}
        if cl6 is None
        else cl6
    )
    have = {_norm(p["name"]): {_norm(s["name"]) for s in p["steps"]} for ps in cl6.values() for p in ps}
    out = []
    imported = Path(custom_dir) / "imported"
    dirs = sorted(imported.iterdir()) if imported.is_dir() else []
    quals = {}  # source dir -> {normalised name / alias / (group, name) -> (id, name)}
    for d in dirs:
        if (d / "qualities.xml").is_file():
            q_by = quals[d.name] = {}
            for q in ET.parse(d / "qualities.xml").getroot().iter("quality"):
                names = [q.findtext("name", "")] + [a.text or "" for a in q.findall("alias")]
                for n in names:
                    q_by.setdefault(_norm(n), (q.get("id"), names[0]))
                if q.get("group"):
                    q_by[(q.get("group"), _norm(names[0]))] = (q.get("id"), names[0])
    for d in dirs:
        if not (d / "qualitypaths.xml").is_file():
            continue
        order = [d.name] + [k for k in quals if k != d.name]  # (its own book's qualities first, then any other's)
        for qp in ET.parse(d / "qualitypaths.xml").getroot().iter("qualitypath"):
            name = qp.findtext("name", "")
            hits = [
                next((h for k in order if (h := quals[k].get((name, _norm(t))) or quals[k].get(_norm(t)))), None)
                for t in (s.text or "" for s in qp.findall("step"))
            ]
            steps = [h for h in hits if h]
            if len(steps) < 2:
                continue
            ours = {_norm(n) for _, n in steps}
            if any(_norm(name) == n or len(ours & ss) * 2 >= len(ours) for n, ss in have.items()):
                continue
            ids = [i for i, _ in steps]
            out.append(
                {
                    "id": qp.get("id"),
                    "name": name,
                    "bookKey": d.name,
                    "origin": "book",
                    "steps": [
                        {
                            "id": i,
                            "level": n,
                            "name": nm,
                            "body": "",
                            "requires": [],
                            "modifications": [{"op": "add", "ref": f"quality:{i.split('.', 1)[-1]}"}],
                            "nextSteps": ids[n + 1 : n + 2],
                        }
                        for n, (i, nm) in enumerate(steps)
                    ],
                }
            )
    return out


def publish(custom_dir):
    """Copy each book's library/<book>/paths.json to <custom_dir>/paths/<book>.json (served at /custom/sr6/paths/), and
    write the book-printed paths Commlink6 lacks (book_paths) to <custom_dir>/paths/book.json."""
    out = Path(custom_dir) / "paths"
    for book in BOOKS:
        src = Path(__file__).parent / "library" / book / "paths.json"
        if src.is_file():
            out.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, out / f"{book}.json")
    mine = book_paths(custom_dir)
    out.mkdir(parents=True, exist_ok=True)
    (out / "book.json").write_text(json.dumps(mine, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def stats(paths):
    """(paths, steps, forks, loops) for one book."""
    steps = forks = loops = 0
    for p in paths:
        nxt = {s["id"]: s["nextSteps"] for s in p["steps"]}
        for sid, ns in nxt.items():
            steps += 1
            forks += len(ns) > 1
            seen, todo = set(), list(ns)
            while todo:
                cur = todo.pop()
                if cur not in seen:
                    seen.add(cur)
                    todo.extend(nxt.get(cur, []))
            loops += sid in seen
    return len(paths), steps, forks, loops


def main(argv=None):
    """CLI: run all books, print the summary table."""
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--jar", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    print(f"{'book':18}{'paths':>6}{'steps':>6}{'forks':>6}{'loops':>6}")
    for book in BOOKS:
        paths = read_book_paths(book, a.jar)
        write_canonical(book, paths, a.out)
        print(f"{book:18}" + "".join(f"{n:>6}" for n in stats(paths)))


if __name__ == "__main__":
    main()
