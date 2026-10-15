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
    def __init__(self, book_dir):
        self.pdf_path = os.path.join(book_dir, "original.pdf") if book_dir else None
        self.offset, self.pages = 1, None
        self._text, self._plumber, self._pdfium = {}, None, None
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
            except Exception:  # noqa: BLE001  (a page that won't read settles nothing)
                t = t or ""
        self._text[idx] = t
        return t

    def close(self):
        for d in (self._plumber, self._pdfium):
            try:
                d and d.close()
            except Exception:  # noqa: BLE001
                pass


def norm_line(s):
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
    fallback = None
    for p in pages:
        lines = book.page_text(p).splitlines()
        # (rows sharing a long prefix, `Bioamplifier Nanites (…)`: the row naming the whole item, else its first 14 letters)
        k = key[: min(len(key), 40)]
        hits = [i for i, ln in enumerate(lines) if k in n1(ln)]
        if not hits:
            k = key[: max(6, min(len(key), 14))]
            hits = [i for i, ln in enumerate(lines) if k in n1(ln)]
        for i in hits:
            if len(re.findall(r"\d+", lines[i])) >= 2 and n1(lines[i]).find(k) <= 2:
                return norm_line(lines[i])
        if hits and fallback is None and p == pages[0]:
            fallback = norm_line(" ".join(lines[hits[0]:hits[0] + 7]))
    return fallback


def name_on_page(book, page, name):
    key = n2(name)
    return bool(key) and key[: max(6, min(len(key), 14))] in n1(book.page_text(page))


def _tok(x):
    x = re.sub(r"(\d+)\s*\(\s*([LRFIB])\s*\)", r"\1\2", x)
    return re.sub(r"\s*/\s*", "/", x).replace("(", " ").replace(")", " ")


def token_in(window, token):
    if window is None or token in (None, ""):
        return None
    t = _tok(norm_line(str(token))).strip()
    return re.search(r"(?<![0-9A-Za-z.])" + re.escape(t) + r"(?![0-9])", _tok(window)) is not None


def load_trace(path):
    """{(src, cl6 id, field): 'only' | 'demote'} from a trace run's cl6-trace.csv ({} without one): where the trace shows
    Commlink6's value is no book's ('Commlink6-only field': left out like the other Commlink6-only fields), or is not
    confirmed on the page (a weak link) or our value is the item's own printed row ('demote': never an importer error)."""
    import csv
    if not path or not os.path.exists(path):
        return {}
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            if r["field"] and r["family"] == "Commlink6-only field":
                out[(r["src"], r["id"], r["field"])] = "only"
            elif r["field"] and (r["family"] == "own row" or r.get("verdict") == "weak link, not confirmed on the page"):
                out[(r["src"], r["id"], r["field"])] = "demote"
            elif r["field"] not in ("", "rating") and r["family"] in ("description sentence", "not found", "another book"):
                out[(r["src"], r["id"], r["field"])] = "unprinted"  # no row of this book prints it (rating ranges are modelled apart)
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
    if pdf == "cl6" and diff["why"].startswith("ours empty") and (diff.get("ours") or "").strip() in ("—", "–", "-"):
        return "b", "ours"  # the row prints a dash; Commlink6's value only matches a stray digit in the window
    if pdf == "cl6" and w is not None and re.search(r"[A-Za-z]", diff.get("ours") or "") and token_in(w, diff["ours"]):
        return "b", "ours"  # our formula ('Capacity x 50', 'Rating') is printed on the row; Commlink6 flattens it to one number
    if pdf == "cl6":
        return "a", pdf
    if pdf == "ours":
        return "b", pdf
    if diff["why"].startswith("ours empty") and pdf == "neither":
        return "b", pdf  # nothing printed on our side either
    return "c", pdf
