"""Hand-built minimal PDF (1.4) for importer tests.

No content extracted from any real rulebook — every string here is invented
for the test.

- `two_page_pdf()`: two-page PDF, 24pt heading, 10pt body text, a 2x3 table
  drawn with ruling lines so pdfplumber's lattice table detector finds it.
- `two_column_page_pdf()`: one page, two side-by-side text columns (3 lines
  each) at matching row heights, to exercise column-aware reading order.
- `single_column_with_outlier_pdf()`: one page, a normal left-aligned body
  plus one centered/indented line — should NOT be mistaken for two columns
  (only one line would fall on the "other side").
- `two_columns_with_band_pdf()`: one page, two real columns with a
  full-width line (a heading/note spanning both) partway down.
- `two_columns_uneven_sidebar_pdf()`: one page, a long left column (5
  lines) next to a short right sidebar/callout (2 lines) — a real gutter
  even though the columns are very unequal in length.
- `bullets_then_indented_block_pdf()`: one page, 6 short bullet lines at
  x=72 followed BELOW them by a 2-line indented block at x=320 — a single
  column (nothing sits side by side), not a two-column page. Body text
  resumes at x=72 after the block.
- `bold_label_pdf()`: one page, lines opening with a bold run-in label (F2 =
  Helvetica-Bold) followed by regular text, plus one plain line.
- `justified_paragraph_pdf()`: one page, a single justified paragraph whose
  word gaps are wide (15-30pt, i.e. > 1 em) and fall at different x on
  each line, except that three consecutive lines happen to share a wide
  gap near x=232. One column; every line must come out intact.
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

# Two columns, left at x=72 and right at x=340 (a >150pt gutter), three
# lines each at matching heights so naive top-only grouping would merge
# "Alpha one" with "Beta one" into a single garbled row, and there are
# enough lines per side to clear the gutter-detection line-count threshold.
COLUMN_OPS = """BT /F1 10 Tf 72 700 Td (Alpha one) Tj ET
BT /F1 10 Tf 72 680 Td (Alpha two) Tj ET
BT /F1 10 Tf 72 660 Td (Alpha three) Tj ET
BT /F1 10 Tf 340 700 Td (Beta one) Tj ET
BT /F1 10 Tf 340 680 Td (Beta two) Tj ET
BT /F1 10 Tf 340 660 Td (Beta three) Tj ET
"""

# A normal single-column body (left-aligned at x=72) plus one centered line
# ("Special Note") indented to x=260. Only one line sits on the "other
# side" of any candidate gutter, so this must NOT be split into columns.
OUTLIER_OPS = """BT /F1 10 Tf 72 700 Td (Intro one.) Tj ET
BT /F1 10 Tf 72 685 Td (Intro two.) Tj ET
BT /F1 10 Tf 260 670 Td (Special Note) Tj ET
BT /F1 10 Tf 72 655 Td (Intro three.) Tj ET
BT /F1 10 Tf 72 640 Td (Intro four.) Tj ET
"""

# Two real columns (left x=72, right x=340), 3 lines each above a
# full-width line that starts in the left column's space and runs past the
# gutter into the right column's space, then 2 more lines each column
# below it. The full-width line must come out between the two column
# blocks, not filed under one column.
BAND_OPS = """BT /F1 10 Tf 72 750 Td (Left one) Tj ET
BT /F1 10 Tf 72 730 Td (Left two) Tj ET
BT /F1 10 Tf 72 710 Td (Left three) Tj ET
BT /F1 10 Tf 340 750 Td (Right one) Tj ET
BT /F1 10 Tf 340 730 Td (Right two) Tj ET
BT /F1 10 Tf 340 710 Td (Right three) Tj ET
BT /F1 10 Tf 100 690 Td (Full width heading spans both columns right here now) Tj ET
BT /F1 10 Tf 72 670 Td (Left four) Tj ET
BT /F1 10 Tf 72 650 Td (Left five) Tj ET
BT /F1 10 Tf 340 670 Td (Right four) Tj ET
BT /F1 10 Tf 340 650 Td (Right five) Tj ET
"""


# A long left column (5 lines, x=72) next to a short right sidebar/callout
# (2 lines, x=340), with the sidebar's two lines at the same heights as the
# left column's first two lines. A real gutter, just an uneven one.
SIDEBAR_OPS = """BT /F1 10 Tf 72 750 Td (Left0) Tj ET
BT /F1 10 Tf 72 730 Td (Left1) Tj ET
BT /F1 10 Tf 72 710 Td (Left2) Tj ET
BT /F1 10 Tf 72 690 Td (Left3) Tj ET
BT /F1 10 Tf 72 670 Td (Left4) Tj ET
BT /F1 10 Tf 340 750 Td (Side0) Tj ET
BT /F1 10 Tf 340 730 Td (Side1) Tj ET
"""

# Six short bullet lines (x=72) and, entirely below them, a 2-line block
# indented to x=320. Clean x-gap and 2+ lines per side, but the two sides
# never share a vertical band, so it is one column read top to bottom.
# Two body lines follow the block so a false split would reorder them.
BULLETS_INDENT_OPS = "".join(
    f"BT /F1 10 Tf 72 {750 - 20 * i} Td (- Bullet {i}) Tj ET\n" for i in range(6)
) + """BT /F1 10 Tf 320 610 Td (Indented one) Tj ET
BT /F1 10 Tf 320 590 Td (Indented two) Tj ET
BT /F1 10 Tf 72 570 Td (After one) Tj ET
BT /F1 10 Tf 72 550 Td (After two) Tj ET
"""

# Word x positions per line (10pt Helvetica, 4-letter words ~22pt wide).
# Lines 0-2 share a 30pt gap at x~217..247; lines 3-7 have a word over it.
_JUSTIFIED_XS = [
    [72, 112, 152, 192, 247, 287, 327],
    [72, 110, 150, 192, 247, 290, 330],
    [72, 114, 155, 192, 247, 285, 328],
    [72, 108, 145, 215, 258, 300, 340],
    [72, 120, 170, 222, 262, 305, 342],
    [72, 105, 160, 205, 250, 292, 335],
    [72, 118, 158, 226, 270, 310, 345],
    [72, 111, 149, 210, 255, 298, 338],
]
JUSTIFIED_WORDS = [[f"w{i}{j}ab" for j in range(len(xs))] for i, xs in enumerate(_JUSTIFIED_XS)]
JUSTIFIED_OPS = "".join(
    f"BT /F1 10 Tf {x} {750 - 14 * i} Td ({word}) Tj ET\n"
    for i, xs in enumerate(_JUSTIFIED_XS)
    for x, word in zip(xs, JUSTIFIED_WORDS[i])
)


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
    content_ids = list(range(font_id + 2, font_id + 2 + n_pages))  # F1 then F2 (bold)

    objects = [
        b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id,
        b"<< /Type /Pages /Kids [%s] /Count %d >>"
        % (b" ".join(b"%d 0 R" % pid for pid in page_ids), n_pages),
    ]
    for page_id, content_id in zip(page_ids, content_ids):
        objects.append(
            (
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] "
                b"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>"
            )
            % (pages_id, font_id, font_id + 1, content_id)
        )
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
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


def single_column_with_outlier_pdf() -> bytes:
    """One-page PDF: single column body plus one centered/indented line."""
    return _build_pdf([OUTLIER_OPS])


def two_columns_with_band_pdf() -> bytes:
    """One-page PDF: two columns with a full-width line partway down."""
    return _build_pdf([BAND_OPS])


def two_columns_uneven_sidebar_pdf() -> bytes:
    """One-page PDF: a long left column next to a short right sidebar."""
    return _build_pdf([SIDEBAR_OPS])


def bullets_then_indented_block_pdf() -> bytes:
    """One-page PDF: short bullets, then an indented block below them."""
    return _build_pdf([BULLETS_INDENT_OPS])


def justified_paragraph_pdf() -> bytes:
    """One-page PDF: one justified paragraph with wide, shifting word gaps."""
    return _build_pdf([JUSTIFIED_OPS])


BOLD_OPS = """BT /F2 10 Tf 72 700 Td (Made Up Label:) Tj /F1 10 Tf ( some regular words.) Tj ET
BT /F1 10 Tf 72 680 Td (A plain line with no label.) Tj ET
BT /F1 10 Tf 72 660 Td (x ) Tj /F2 10 Tf (Solo:) Tj /F1 10 Tf ( more words.) Tj ET
BT /F2 10 Tf 72 640 Td (Note) Tj /F1 10 Tf ( - ) Tj /F2 10 Tf (Topic:) Tj /F1 10 Tf ( words.) Tj ET
"""


def bold_label_pdf() -> bytes:
    """One-page PDF: bold run-in labels (Helvetica-Bold) followed by regular text."""
    return _build_pdf([BOLD_OPS])


# A 3-row ruled table whose middle row has no column rule (a striped row): pdfplumber's lattice
# finder returns it as one merged cell. Names are bold (F2); a wrapped effect line in row 3.
STRIPED_TABLE_OPS = """72 660 m 372 660 l S
72 640 m 372 640 l S
72 620 m 372 620 l S
72 590 m 372 590 l S
72 590 m 72 660 l S
372 590 m 372 660 l S
222 640 m 222 660 l S
222 590 m 222 620 l S
BT /F1 10 Tf 80 645 Td (Name) Tj ET
BT /F1 10 Tf 230 645 Td (Effect) Tj ET
BT /F2 10 Tf 80 625 Td (Made Up Rig) Tj ET
BT /F1 10 Tf 230 625 Td (Plus one) Tj ET
BT /F2 10 Tf 80 607 Td (Toy Kit) Tj ET
BT /F1 10 Tf 230 607 Td (Line one) Tj ET
BT /F1 10 Tf 230 595 Td (line two) Tj ET
"""


def striped_table_pdf() -> bytes:
    """One-page PDF: a table with a merged (unruled) middle row."""
    return _build_pdf([STRIPED_TABLE_OPS])
