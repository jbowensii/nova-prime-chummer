"""The PDF settles a difference: find the item's printed line (its name on our page, the next, the one before, or
Commlink6's page) and see which value it prints.

  class a: the PDF prints Commlink6's value (an importer error);
  class b: the PDF prints ours (a verified printed difference: Commlink6 follows errata or another printing);
  class c: not settled (the line isn't found, prints both or neither, or our value is a formula or text).

Reads the import's own copy of the book (library/sr6/<book>/original.pdf) with pypdfium2 and pdfplumber; without
them, or with --no-pdf, every difference is class c."""

import os
import re
import xml.etree.ElementTree as ET

from tools.cl6check.match import n1, n2


class Book:
    """One book's PDF and its page text, read lazily for the arbitration."""

    def __init__(self, book_dir):
        self.pdf_path = os.path.join(book_dir, "original.pdf") if book_dir else None
        self.offset, self.pages = 1, None
        self._text, self._plumber, self._pdfium, self._words = {}, None, None, {}
        if book_dir and os.path.exists(os.path.join(book_dir, "import.xml")):
            imp = ET.parse(os.path.join(book_dir, "import.xml")).getroot()
            self.pages = int(imp.get("pages") or 0) or None
            try:
                from importer.sr6 import recipes

                self.offset = next((r.PAGE_OFFSET for r in recipes.RECIPES if r.ID == imp.get("source")), 1)
            except ImportError:
                pass

    def page_text(self, printed):
        """Both text layers of a printed page ('' when unreadable)."""
        try:
            idx = int(printed) + self.offset - 1
        except (TypeError, ValueError):
            return ""
        if idx in self._text:
            return self._text[idx]
        t = ""
        if self.pdf_path and os.path.exists(self.pdf_path):
            try:
                import pdfplumber
                import pypdfium2

                self._pdfium = self._pdfium or pypdfium2.PdfDocument(self.pdf_path)
                self._plumber = self._plumber or pdfplumber.open(self.pdf_path)
                if 0 <= idx < len(self._pdfium):
                    t = self._pdfium[idx].get_textpage().get_text_bounded().replace("\r", "") + "\n"
                if 0 <= idx < len(self._plumber.pages):
                    t += self._plumber.pages[idx].extract_text() or ""
                    self._plumber.pages[idx].flush_cache()
            except Exception:  # pylint: disable=broad-exception-caught  # (a page that won't read settles nothing)
                t = t or ""
        self._text[idx] = t
        return t

    def words(self, printed):
        """pdfplumber's words of a printed page, each with its font size ([] when unreadable)."""
        try:
            idx = int(printed) + self.offset - 1
            if idx not in self._words:
                import pdfplumber

                self._plumber = self._plumber or pdfplumber.open(self.pdf_path)
                pg = self._plumber.pages[idx]
                self._words[idx] = pg.extract_words(extra_attrs=["size"]) + [
                    {"text": "|width", "x0": pg.width, "x1": pg.width, "top": 0, "size": 0}
                ]
                pg.flush_cache()
            return self._words[idx]
        except Exception:  # pylint: disable=broad-exception-caught  # (a page that won't read settles nothing)
            return []

    def close(self):
        """Close the PDF readers the book opened."""
        for d in (self._plumber, self._pdfium):
            try:
                d and d.close()
            except Exception:  # pylint: disable=broad-exception-caught
                pass


def norm_line(s):
    """A line of book text with curly quotes and dashes made plain and thousands separators dropped."""
    s = s.replace("’", "'").replace("–", "-").replace("—", "-").replace("¥", "")
    return re.sub(r"(?<=\d),(?=\d{3})", "", s)


def name_window(book, page, name, extra_pages=()):
    """The PDF text of an item's row: the line naming it that reads as a table row (two or more numbers after the
    name) on its page, the next, the one before, or another candidate page; else the name line and the 6 after it on
    its page (a stat block); None when the name is not found."""
    pages = []
    for q in (page, *extra_pages):
        try:
            q = int(q)
        except (TypeError, ValueError):
            continue
        pages += [q + d for d in (0, 1, -1) if q + d not in pages]
    key = n2(name)
    if not key or not pages:
        return None
    k = key[: max(6, min(len(key), 14))]
    fallback = None
    for p in pages:
        lines = book.page_text(p).splitlines()
        hits = [i for i, ln in enumerate(lines) if k in n1(ln)]
        for i in hits:
            if n1(lines[i]).find(k) <= 2 <= len(re.findall(r"\d+", lines[i])):
                return norm_line(lines[i])
        if hits and fallback is None and p == pages[0]:
            fallback = norm_line(" ".join(lines[hits[0] : hits[0] + 7]))
    return fallback


def stat_box(book, page, name, extra_pages=()):
    """The text of the AVAIL / COST stat box that floats below an item's heading, in the heading's column (Firing
    Squad's accessories: the box can sit a long way under the heading, and the box above it in the column is the
    previous item's):
    "2 140" for a box printing 2 and 140¥; None when the heading or a box below it is not found. The heading is the
    largest print of the item's name on its page, the next or the one before."""
    toks = [t for t in (re.sub(r"[^a-z0-9]", "", x) for x in name.lower().split()) if t][
        :3
    ]  # (`Low-Light` is one word of the page; a long heading wraps: its first words)
    if not toks:
        return None
    for q in (page, *extra_pages):
        try:
            q = int(q)
        except (TypeError, ValueError):
            continue
        for pg in (q, q + 1, q - 1):
            ws = book.words(pg)
            if not ws:
                continue
            heads = []
            for w in ws:
                at, ok = w, re.sub(r"[^a-z0-9]", "", w["text"].lower()) == toks[0]
                for t in toks[1:] if ok else ():
                    nxt = [x for x in ws if abs(x["top"] - w["top"]) < 3 and 0 <= x["x0"] - at["x1"] < 12]
                    at = next((x for x in nxt if re.sub(r"[^a-z0-9]", "", x["text"].lower()) == t), None)
                    if at is None:
                        ok = False
                        break
                if ok:
                    heads.append(w)
            if not heads:
                continue
            h = max(heads, key=lambda x: x["size"])
            width = next(x["x0"] for x in ws if x["text"] == "|width")
            right = h["x0"] > width * 0.45

            def col(x, width=width, right=right):
                return (x["x0"] > width * 0.45) == right  # (two columns)

            labels = sorted(
                (x for x in ws if x["text"] == "AVAIL" and x["top"] > h["top"] and col(x)), key=lambda x: x["top"]
            )
            for a in labels:
                c = next(
                    (x for x in ws if x["text"] == "COST" and abs(x["top"] - a["top"]) < 3 and x["x0"] > a["x0"]), None
                )
                if c:
                    vals = [
                        x
                        for x in ws
                        if a["top"] + 3 < x["top"] < a["top"] + 25 and a["x0"] - 15 <= x["x0"] < c["x0"] + 90
                    ]
                    left = " ".join(x["text"] for x in sorted(vals, key=lambda x: x["x0"]) if x["x0"] < c["x0"] - 5)
                    rest = " ".join(x["text"] for x in sorted(vals, key=lambda x: x["x0"]) if x["x0"] >= c["x0"] - 5)
                    return norm_line(f"{left} {rest}")
    return None


def name_on_page(book, page, name):
    """Whether the start of an entry's name is printed on the book's page."""
    key = n2(name)
    return bool(key) and key[: max(6, min(len(key), 14))] in n1(book.page_text(page))


def _tok(x):
    x = re.sub(r"(\d+)\s*\(\s*([LRFIB])\s*\)", r"\1\2", x)
    return re.sub(r"\s*/\s*", "/", x).replace("(", " ").replace(")", " ")


def token_in(window, token):
    """Whether `token` is printed in `window`, standing alone; None when there is nothing to compare."""
    if window is None or token in (None, ""):
        return None
    t = _tok(norm_line(str(token))).strip()
    return re.search(r"(?<![0-9A-Za-z.])" + re.escape(t) + r"(?![0-9])", _tok(window)) is not None


def load_trace(path):
    """{(src, cl6 id, field): 'only' | 'demote'} from a trace run's cl6-trace.csv ({} without one): where the trace
    shows Commlink6's value is no book's ('Commlink6-only field': left out like the other Commlink6-only fields), or is
    not confirmed on the page (a weak link) or our value is the item's own printed row ('demote': never an importer
    error).
    """
    import csv

    if not path or not os.path.exists(path):
        return {}
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            if r["field"] and r["family"] == "Commlink6-only field":
                out[(r["src"], r["id"], r["field"])] = "only"
            elif r["field"] and (
                r["family"] == "own row" or r.get("verdict") == "weak link, not confirmed on the page"
            ):
                out[(r["src"], r["id"], r["field"])] = "demote"
            elif r["field"] not in ("", "rating") and r["family"] in (
                "description sentence",
                "not found",
                "another book",
            ):
                out[(r["src"], r["id"], r["field"])] = (
                    "unprinted"  # no row of this book prints it (rating ranges are modelled apart)
                )
    return out


def settle(book, entry, rec, diff):
    """(class, pdf) for a field difference: pdf is which value the printed line shows (ours/cl6/both/neither/'')."""
    if diff["why"].startswith("ours holds a price"):
        return "a", ""  # the availability column holds a price: columns shifted
    if diff["why"].startswith("ours empty (our cost"):
        return "a", ""  # a per-rating price stored with no rating range
    if book is None:
        return "c", ""
    w = name_window(book, entry["page"], entry["name"], (rec["page"],))
    pdf = ""
    if w is not None:
        a, b = bool(token_in(w, diff.get("ours_tok"))), bool(token_in(w, diff.get("cl6_tok")))
        pdf = {(True, False): "ours", (False, True): "cl6", (True, True): "both", (False, False): "neither"}[(a, b)]
    if pdf != "ours" and diff.get("field") in ("avail", "legality", "cost") and hasattr(book, "words"):
        # a stat box floating under the item's heading is the item's own; the row's window above may be a neighbour's
        box = stat_box(book, entry["page"], entry["name"], (rec["page"],))
        if box is not None and token_in(box, diff.get("ours_tok")) and not token_in(box, diff.get("cl6_tok")):
            return "b", "ours"
    if pdf == "cl6" and diff["why"].startswith("ours empty") and (diff.get("ours") or "").strip() in ("—", "–", "-"):
        return "b", "ours"  # the row prints a dash; Commlink6's value only matches a stray digit in the window
    if pdf == "cl6" and w is not None and re.search(r"[A-Za-z]", diff.get("ours") or "") and token_in(w, diff["ours"]):
        return (
            "b",
            "ours",
        )  # our formula ('Capacity x 50', 'Rating') is printed on the row; Commlink6 flattens it to one number
    if pdf == "cl6":
        return "a", pdf
    if pdf == "ours":
        return "b", pdf
    if diff["why"].startswith("ours empty") and pdf == "neither":
        return "b", pdf  # nothing printed on our side either
    return "c", pdf
