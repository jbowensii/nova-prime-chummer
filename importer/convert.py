"""PDF -> Markdown for recipes. pdfplumber (MIT). Output only has to be consistent, not pretty. This module reads the
PDF page by page; importer/pdf/ holds the steps: lines.py (words into lines, headings by size), columns.py (two text
columns, reading order), tables.py (ruled tables' cells) and markdown.py (bold runs, tables as Markdown). The SR6
layout's own steps (importer/sr6/layout.py: rows by baseline, header-band tables, boxes) run only for sr6=True."""
import hashlib

import pdfplumber

from importer.pdf.columns import column_kind, find_gutter, reading_order, split_at
from importer.pdf.lines import cluster_lines, even_sizes, heading_level, line_extent, size_bands
from importer.pdf.markdown import line_text, table_md
from importer.pdf.tables import in_table, inside, table_cells

# The steps both games' conversions run (importer/pdf/: columns, lines, markdown, tables): a change to what they write
# ends both versions below, so --reuse re-converts every book of both games. On such a change set it to "+pdf2", then
# "+pdf3", … (empty: the steps as they were when the games' versions were last bumped alone).
PDF_STEPS_VERSION = ""
CONVERTER_VERSION = "6" + PDF_STEPS_VERSION  # convert(..., sr6=False); 2: bold runs wrapped in **…**; 3: table cells
# rebuilt on one column grid; 4: a word outside every grid cell goes to the nearest column (was: the last);
# 5: a cell set in two text columns (a boxed sidebar) is read column by column (was: line by line, interleaved);
#    a label/value list in one cell keeps its rows; 6: a slightly tilted line keeps its words (was: a letter a word)
SR6_CONVERTER_VERSION = "sr6-8" + PDF_STEPS_VERSION  # convert(..., sr6=True), importer/sr6/layout.py; 2: lines by
# baseline, columns split where the content stream jumps (a gutter narrower than a word space); 3: a second copy of a
# page's text layer dropped, words split after a ligature joined; 4: the bottom band drops only the running feet's
# faces (a table's last rows and body lines reaching into it stay); 5: a band's first cell marked indented (two no-break spaces) or
# bold among regular names (an en space): its row groups (layout._first_marks)
# 6: two stat tables side by side in two columns stay two, running heads dropped by their repetition, a heading under
# the other column titles the full-width table under it (feat/book-adventures, merged)
# 7: two boxes side by side whose band rows line up (or chain a little apart in height) are split at the boxes' edge
#    (or the gutter), and a header never stacks onto one whose column already has values on its line
#    (layout._column_parts; Double Clutch p. 130, Firing Squad p. 65, Deadly Arts' Combat MAID); a two-line header
#    cell's letters stay on their own lines (layout.words; Hack & Slash's cyberterminals); a
#    heading's small first letter (`xGUIDE`) stays in the heading
# 8: two text columns whose lines sit a few points apart (no row holds both) are found by their clear strip
#    (columns._rivers; Street Wyrd p. 29's rules box, read line by line before)


def reusable(book_dir: str, version: str) -> bool:
    """book.md can stand in for original.pdf: the book's last import (import.xml, which a remove keeps) converted this same
    file with this converter version. A re-import then skips the conversion (Books → Re-import all: run --reuse)."""
    import os
    import xml.etree.ElementTree as ET
    pdf, md, imp = (os.path.join(book_dir, f) for f in ("original.pdf", "book.md", "import.xml"))
    if not (os.path.exists(pdf) and os.path.exists(md) and os.path.exists(imp)):
        return False
    try:
        rec = ET.parse(imp).getroot()
    except ET.ParseError:
        return False
    if rec.get("converter") != version or not rec.get("sha256"):
        return False
    with open(pdf, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest() == rec.get("sha256")


def convert(pdf_path: str, md_path: str, pages: tuple[int, int] | None = None, sr6: bool = False,
            levels: dict | None = None, heading: str | None = None) -> dict:
    """pages: optional 1-based inclusive (first, last) range to convert. sr6: the Shadowrun 6 layout
    (importer/sr6/layout.py: headings by font, header-band tables, margin furniture dropped). levels: the SR6 heading
    sizes -> levels, when a recipe knows them for this file (else layout.fonts guesses them); heading: the headings' font
    family, likewise."""
    if sr6:  # (imported here: the Anarchy conversion never loads the SR6 layout)
        from importer.sr6 import layout
    with open(pdf_path, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        fonts = layout.fonts(pdf) if sr6 else None
        if fonts and levels:
            fonts.levels = levels
        if fonts and heading:
            fonts.heading = heading
        big = None if sr6 else size_bands(pdf)[1]
        first, last = pages or (1, len(pdf.pages))
        for n, page in enumerate(pdf.pages[first - 1 : last], first):
            out.append(f"<!-- page {n} -->")
            # the SR6 layout's tables have no rules: the lattice finder only sees their striped row backgrounds
            found = [] if sr6 else page.find_tables()
            # a table nested in another is a fragment of it (its words are in the outer one's cells);
            # of two with the same box, the first is kept
            tables = [t for i, t in enumerate(found)
                      if not any(inside(t.bbox, o.bbox) and (o.bbox != t.bbox or j < i) for j, o in enumerate(found) if j != i)]
            # stream order (columns._jump); a second copy of the page's text layer dropped (layout.one_layer)
            chars = [{**c, "i": i} for i, c in enumerate(layout.one_layer(page.chars))] if sr6 else page.chars
            all_words = (layout.words if sr6 else pdfplumber.utils.extract_words)(
                even_sizes(chars), extra_attrs=["size"], keep_blank_chars=False, return_chars=True)
            bands = []
            if sr6:
                all_words = layout.furniture(page, all_words, fonts)
                for w in all_words:
                    w["base"] = -w["chars"][0]["matrix"][5]
                bands = layout.band_tables(all_words, fonts, page.rects, page.width)
            boxes = [t.bbox for t in tables]
            # a band table's own words leave the text (not its box: a long last cell can reach past the text column)
            banded = {id(w) for _, _, used in bands for w in used}
            words = [w for w in all_words if not in_table(w, boxes) and id(w) not in banded]
            rows = (layout.baseline_rows if sr6 else cluster_lines)(words)
            tol = layout.GUTTER_TOL if sr6 else 0
            mid = find_gutter(rows, page.width, tol=tol)
            lines = [part for row in rows for part in split_at(row, mid, tol)] if mid else rows

            blocks, geo, xs, spans = [], [], [], []
            for line in lines:
                size = round(max(w["size"] for w in line), 1)
                level = layout.heading_level(line, fonts) if sr6 else heading_level(size, big)
                # headings stay unmarked (their size already says it); bold only matters in body lines
                text = ("#" * level + " " + " ".join(w["text"] for w in line)) if level else line_text(line, sr6)
                x0, x1 = line_extent(line)
                blocks.append((min(w["top"] for w in line), column_kind(x0, x1, mid, tol), text))
                geo.append((level, max(w["bottom"] for w in line), size))
                xs.append(x0)
                spans.append((min(w["top"] for w in line), x0, x1, level))
            if sr6:
                marks = layout.sidebar_marks(spans, page.rects, [bbox for bbox, _, _ in bands], page.width,
                                             lambda a, b: column_kind(a, b, mid, tol))
                boxes = [bbox[1] for bbox, _, _ in bands if column_kind(bbox[0], bbox[2], mid, tol) == "band"]
                blocks = layout.join_headings(layout.box_titles(layout.box_margin(blocks, xs), geo, boxes), geo)
            for t in tables:
                md = table_md(table_cells(t, all_words))
                if md:
                    blocks.append((t.bbox[1], column_kind(t.bbox[0], t.bbox[2], mid), "\n".join(md)))
            for bbox, rows, _ in bands:
                blocks.append((bbox[1], column_kind(bbox[0], bbox[2], mid, tol), "\n".join(table_md(rows))))
            if sr6:
                blocks += marks

            out += reading_order(blocks, mid)
        title = (pdf.metadata or {}).get("Title", "") or ""
        pages = len(pdf.pages)
    text = "\n".join(out) + "\n"
    with open(md_path, "w", encoding="utf8", newline="\n") as f:
        f.write(layout.rejoin_ligatures(text) if sr6 else text)
    return {"pages": pages, "converter": SR6_CONVERTER_VERSION if sr6 else CONVERTER_VERSION, "sha256": sha,
            "title": title}
