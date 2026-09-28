"""Hand-built minimal PDF (1.4) for importer tests.

No content extracted from any real rulebook — every string here is invented
for the test. `two_page_pdf()` builds a two-page PDF with a 24pt heading,
10pt body text, and a 2-column x 3-row table drawn with ruling lines, so
pdfplumber's lattice table detector picks it up. `two_column_page_pdf()`
builds a one-page PDF with two side-by-side text columns at matching row
heights, to exercise column-aware reading order.
"""

PAGE1_OPS = """BT /F1 24 Tf 72 720 Td (Shadow Test) Tj ET
BT /F1 10 Tf 72 700 Td (This is invented body copy describing the shadow test scenario for size mode.) Tj ET
72 660 m 372 660 l S
72 640 m 372 640 l S
72 620 m 372 620 l S
72 600 m 372 600 l S
72 600 m 72 660 l S
222 600 m 222 660 l S
372 600 m 372 660 l S
BT /F1 10 Tf 80 645 Td (Name) Tj ET
BT /F1 10 Tf 230 645 Td (Rating) Tj ET
BT /F1 10 Tf 80 625 Td (Sam) Tj ET
BT /F1 10 Tf 230 625 Td (3) Tj ET
BT /F1 10 Tf 80 605 Td (Kai) Tj ET
BT /F1 10 Tf 230 605 Td (5) Tj ET
"""

PAGE2_OPS = """BT /F1 18 Tf 72 720 Td (Second Page) Tj ET
BT /F1 10 Tf 72 700 Td (More invented body copy for the second page of the test document.) Tj ET
"""

# Two columns, left at x=72 and right at x=340 (a >150pt gutter), each with
# two lines at the same heights so naive top-only grouping would merge
# "Alpha one" with "Beta one" into a single garbled row.
COLUMN_OPS = """BT /F1 10 Tf 72 700 Td (Alpha one) Tj ET
BT /F1 10 Tf 72 680 Td (Alpha two) Tj ET
BT /F1 10 Tf 340 700 Td (Beta one) Tj ET
BT /F1 10 Tf 340 680 Td (Beta two) Tj ET
"""


def _content_stream(ops: str) -> bytes:
    data = ops.encode("latin-1")
    return b"<< /Length %d >>\nstream\n" % len(data) + data + b"\nendstream"


def _build_pdf(pages_ops: list[str]) -> bytes:
    """Build a valid multi-page PDF from a list of content-stream op strings."""
    n_pages = len(pages_ops)
    catalog_id = 1
    pages_id = 2
    page_ids = list(range(3, 3 + n_pages))
    font_id = page_ids[-1] + 1
    content_ids = list(range(font_id + 1, font_id + 1 + n_pages))

    objects = [
        b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id,
        b"<< /Type /Pages /Kids [%s] /Count %d >>"
        % (b" ".join(b"%d 0 R" % pid for pid in page_ids), n_pages),
    ]
    for page_id, content_id in zip(page_ids, content_ids):
        objects.append(
            (
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>"
            )
            % (pages_id, font_id, content_id)
        )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    for ops in pages_ops:
        objects.append(_content_stream(ops))

    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i
        out += body
        out += b"\nendobj\n"

    xref_offset = len(out)
    n = len(objects) + 1
    out += b"xref\n0 %d\n" % n
    out += b"0000000000 65535 f \n"
    for off in offsets:
        out += b"%010d 00000 n \n" % off
    out += b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF" % (
        n,
        catalog_id,
        xref_offset,
    )
    return bytes(out)


def two_page_pdf() -> bytes:
    """Return the bytes of a valid two-page PDF for tests."""
    return _build_pdf([PAGE1_OPS, PAGE2_OPS])


def two_column_page_pdf() -> bytes:
    """Return the bytes of a valid one-page PDF with two text columns."""
    return _build_pdf([COLUMN_OPS])
