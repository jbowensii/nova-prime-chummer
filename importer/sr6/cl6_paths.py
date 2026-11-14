"""Read Commlink6 quality_paths.xml (graph of steps) into canonical per-book paths.json."""

import argparse
import copy
import json
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
