"""PDF -> Markdown for recipes. pdfplumber (MIT). Output only has to be consistent, not pretty."""
import hashlib
import statistics

import pdfplumber

CONVERTER_VERSION = "1"


def _bands(pdf):
    sizes = [round(c["size"], 1) for p in pdf.pages[:40] for c in p.chars]
    if not sizes:
        return 10, []
    body = statistics.mode(sizes)
    big = sorted({s for s in sizes if s >= body * 1.25}, reverse=True)[:3]
    return body, big  # big[0] -> '#', big[1] -> '##', big[2] -> '###'


def _lines(page, big, table_boxes):
    words = page.extract_words(extra_attrs=["size", "fontname"], keep_blank_chars=False)
    rows, cur, top = [], [], None
    for w in words:
        if any(b[0] <= w["x0"] <= b[2] and b[1] <= w["top"] <= b[3] for b in table_boxes):
            continue
        if top is not None and abs(w["top"] - top) > 2:
            rows.append(cur)
            cur = []
        cur.append(w)
        top = w["top"]
    if cur:
        rows.append(cur)
    out = []
    for r in rows:
        text = " ".join(w["text"] for w in r)
        size = round(max(w["size"] for w in r), 1)
        level = next((i + 1 for i, s in enumerate(big) if abs(size - s) < 0.6), 0)
        out.append((r[0]["top"], ("#" * level + " " + text) if level else text))
    return out


def _table_md(rows):
    rows = [[(c or "").replace("\n", "<br>").strip() for c in r] for r in rows if any(r)]
    if not rows:
        return []
    head, *body = rows
    return ["| " + " | ".join(head) + " |", "|" + "---|" * len(head)] + [
        "| " + " | ".join(r) + " |" for r in body
    ]


def convert(pdf_path: str, md_path: str) -> dict:
    with open(pdf_path, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        _, big = _bands(pdf)
        for n, page in enumerate(pdf.pages, 1):
            out.append(f"<!-- page {n} -->")
            tables = page.find_tables()
            boxes = [t.bbox for t in tables]
            items = _lines(page, big, boxes)
            for t in tables:
                md = _table_md(t.extract())
                if md:
                    items.append((t.bbox[1], "\n".join(md)))
            out += [text for _, text in sorted(items, key=lambda x: x[0]) if text]
        title = (pdf.metadata or {}).get("Title", "") or ""
        pages = len(pdf.pages)
    with open(md_path, "w", encoding="utf8", newline="\n") as f:
        f.write("\n".join(out) + "\n")
    return {"pages": pages, "converter": CONVERTER_VERSION, "sha256": sha, "title": title}
