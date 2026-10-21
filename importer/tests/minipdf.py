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
BULLETS_INDENT_OPS = (
    "".join(f"BT /F1 10 Tf 72 {750 - 20 * i} Td (- Bullet {i}) Tj ET\n" for i in range(6))
    + """BT /F1 10 Tf 320 610 Td (Indented one) Tj ET
BT /F1 10 Tf 320 590 Td (Indented two) Tj ET
BT /F1 10 Tf 72 570 Td (After one) Tj ET
BT /F1 10 Tf 72 550 Td (After two) Tj ET
"""
)

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
    fonts = [b"Helvetica", b"Helvetica-Bold", b"Times-Roman", b"Courier"]  # F1..F4
    content_ids = list(range(font_id + len(fonts), font_id + len(fonts) + n_pages))

    objects = [
        b"<< /Type /Catalog /Pages %d 0 R >>" % pages_id,
        b"<< /Type /Pages /Kids [%s] /Count %d >>" % (b" ".join(b"%d 0 R" % pid for pid in page_ids), n_pages),
    ]
    for page_id, content_id in zip(page_ids, content_ids):
        objects.append(
            (
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 612 792] "
                b"/Resources << /Font << %s >> >> /Contents %d 0 R >>"
            )
            % (pages_id, b" ".join(b"/F%d %d 0 R" % (i + 1, font_id + i) for i in range(len(fonts))), content_id)
        )
    for name in fonts:
        objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /%s >>" % name)
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


# A 2-row ruled table with a small ruled box drawn inside its bottom-right cell (not touching the
# cell's rules, split by one line): pdfplumber finds the box as a second table nested in the first.
NESTED_TABLE_OPS = """72 660 m 372 660 l S
72 640 m 372 640 l S
72 590 m 372 590 l S
72 590 m 72 660 l S
222 590 m 222 660 l S
372 590 m 372 660 l S
230 630 m 360 630 l S
230 615 m 360 615 l S
230 600 m 360 600 l S
230 600 m 230 630 l S
360 600 m 360 630 l S
BT /F1 10 Tf 80 645 Td (Name) Tj ET
BT /F1 10 Tf 230 645 Td (Effect) Tj ET
BT /F2 10 Tf 80 620 Td (Made Up Rig) Tj ET
BT /F1 10 Tf 240 619 Td (Boxed) Tj ET
BT /F1 10 Tf 240 604 Td (Inner) Tj ET
"""


def nested_table_pdf() -> bytes:
    """One-page PDF: a table with a ruled box inside one of its cells."""
    return _build_pdf([NESTED_TABLE_OPS])


# A boxed sidebar: a ruled title row over one ruled body cell (72..472) whose text is set in two
# columns (x=80 and x=280), five lines each at matching heights. Read line by line, each row would mix
# "left" and "right" words.
_BOX_RULES = """72 700 m 472 700 l S
72 680 m 472 680 l S
72 560 m 472 560 l S
72 560 m 72 700 l S
472 560 m 472 700 l S
BT /F1 10 Tf 80 685 Td (MADE UP BOX) Tj ET
"""
BOXED_COLUMNS_OPS = _BOX_RULES + "".join(
    f"BT /F1 10 Tf {x} {665 - 15 * i} Td ({side} words on line {i}) Tj ET\n"
    for x, side in ((80, "left"), (280, "right"))
    for i in range(5)
)
# A box holding a label/value list: labels at x=80, one-word values at x=420, five rows. Nothing
# crosses the gap, but the values aren't running text: rows stay rows.
BOXED_LABELS_OPS = _BOX_RULES + "".join(
    f"BT /F1 10 Tf 80 {665 - 15 * i} Td (Made up label {i}) Tj ET\nBT /F1 10 Tf 420 {665 - 15 * i} Td ({i + 2}) Tj ET\n"
    for i in range(5)
)
# The same box with a table row under the text that runs across the gutter (1 line in 11, under the
# page-level 10% crossing allowance): rows stay rows.
BOXED_TABLE_OPS = (
    BOXED_COLUMNS_OPS + """BT /F1 10 Tf 80 575 Td (Row label that runs long enough to cross the middle) Tj ET
BT /F1 10 Tf 420 575 Td (7) Tj ET
"""
)


def boxed_columns_pdf() -> bytes:
    """One-page PDF: a one-cell box whose text is set in two columns."""
    return _build_pdf([BOXED_COLUMNS_OPS])


def boxed_table_pdf() -> bytes:
    """One-page PDF: the two-column box with a table row across the gutter below the text."""
    return _build_pdf([BOXED_TABLE_OPS])


def boxed_labels_pdf() -> bytes:
    """One-page PDF: a one-cell box holding a label/value list."""
    return _build_pdf([BOXED_LABELS_OPS])


# A line set with a small rotation (about 1 degree) in its text matrix: its letters' measured sizes differ by
# a few hundredths of a point. Plus a small-caps style line: a bigger initial, which is a real size change.
TILTED_OPS = """BT /F1 11 Tf 0.9998 -0.0175 0.0175 0.9998 72 700 Tm (Made up tilted words) Tj ET
BT /F1 10.5 Tf 72 670 Td (M) Tj /F1 10 Tf (ADE UP) Tj ET
"""


def tilted_line_pdf() -> bytes:
    """One-page PDF: a slightly rotated line and a line with a bigger initial."""
    return _build_pdf([TILTED_OPS])


# The SR6 layout (convert(..., sr6=True)), all made up: F3 Times-Roman 10.5 body, F4 Courier display headings at
# 60/21/15/13/9, F1/F2 Helvetica 7 tables with a Helvetica-Bold header row and no rules. Each page has a margin tab
# letter at x=595 and a page number in the bottom band.
def _sr6_lines(x, y, words, n, size=10.5, font="F3", step=14):
    return "".join(f"BT /{font} {size} Tf {x} {y - step * i} Td ({words} {i}) Tj ET\n" for i in range(n))


SR6_CHAPTER_OPS = """BT /F4 60 Tf 72 650 Td (GADGETS) Tj ET
BT /F4 15 Tf 72 560 Td (Shop Rules) Tj ET
BT /F4 9 Tf 72 540 Td ((made up tags)) Tj ET
BT /F4 10 Tf 595 600 Td (G) Tj ET
BT /F3 10.5 Tf 300 20 Td (6) Tj ET
""" + _sr6_lines(72, 520, "Opening words of the chapter line", 6)

# A header band across both columns over three rows: the second row's cost wraps onto a second line, and the first
# column has a three-word name. Then a heading and two text columns.
SR6_SHOP_OPS = """BT /F4 21 Tf 72 740 Td (Gadget Shop) Tj ET
BT /F4 13 Tf 72 715 Td (zappers) Tj ET
BT /F2 7 Tf 80 700 Td (GADGET) Tj ET
BT /F2 7 Tf 300 700 Td (DV) Tj ET
BT /F2 7 Tf 420 700 Td (COST) Tj ET
BT /F1 7 Tf 72 690 Td (Zap Gun) Tj ET
BT /F1 7 Tf 300 690 Td (3P) Tj ET
BT /F1 7 Tf 420 690 Td (250) Tj ET
BT /F1 7 Tf 72 681 Td (Big Fizz Rifle) Tj ET
BT /F1 7 Tf 300 681 Td (5P) Tj ET
BT /F1 7 Tf 420 681 Td (1,200) Tj ET
BT /F1 7 Tf 420 672 Td ((each)) Tj ET
BT /F1 7 Tf 72 660 Td (Tiny Zapper) Tj ET
BT /F1 7 Tf 300 660 Td (2S) Tj ET
BT /F1 7 Tf 420 660 Td (100) Tj ET
BT /F4 13 Tf 72 620 Td (Zap Gun) Tj ET
BT /F4 10 Tf 595 500 Td (G) Tj ET
BT /F3 10.5 Tf 540 20 Td (7) Tj ET
""" + _sr6_lines(72, 604, "Left column text runs on and on", 4) + _sr6_lines(320, 620, "Right text", 4)

# Two side-by-side bands with the same two-column header, a bold stat-box label line under the left one, a band whose
# header shares its baseline with a label line in the right column, then two text columns.
SR6_BANDS_OPS = """BT /F2 7 Tf 72 700 Td (RANGE) Tj ET
BT /F2 7 Tf 130 700 Td (DV) Tj ET
BT /F2 7 Tf 330 700 Td (RANGE) Tj ET
BT /F2 7 Tf 388 700 Td (DV) Tj ET
BT /F1 7 Tf 72 691 Td (Touch) Tj ET
BT /F1 7 Tf 132 691 Td (2) Tj ET
BT /F1 7 Tf 330 691 Td (LOS) Tj ET
BT /F1 7 Tf 390 691 Td (4) Tj ET
BT /F2 7 Tf 72 680 Td (Skills:) Tj /F1 7 Tf ( Sneaking 3) Tj ET
BT /F2 7 Tf 72 664 Td (DR) Tj ET
BT /F2 7 Tf 100 664 Td (CM) Tj ET
BT /F2 7 Tf 330 664 Td (Powers:) Tj /F1 7 Tf ( Zip) Tj ET
BT /F1 7 Tf 72 655 Td (4) Tj ET
BT /F1 7 Tf 100 655 Td (9) Tj ET
""" + _sr6_lines(72, 630, "Lower left", 3) + _sr6_lines(320, 630, "Lower right", 3)


def _sr6_cell(x, y, text, font="F1"):
    return f"BT /{font} 7 Tf {x} {y} Td ({text}) Tj ET\n"


# A shaded table: header cell rects (x 72/150/230/330) and row stripes. The header is three lines: UNIT over PRICE
# with THING and NOTES centred between them, and NOTES' values start left of its header's centre. Rows: a plain row,
# a striped row with a name wrapped around values set centred, a plain row, a striped labelled row, a plain row, a
# striped one-cell sub-heading and a last plain row. Then text in two columns, a full-width heading and a sidebar in
# two columns whose gutter sits 10 pt right of the body's (no one strip is clear in both).
_SR6_LEFT = "lorem lorem lorem lorem lorem lorem lorem "  # 7 x (2333 + 250) / 1000 x 10.5 = 189.84 pt, then 'aN'
SR6_GRID_OPS = (
    "0.9 g 72 690 78 16 re f 150 690 80 16 re f 230 690 100 16 re f\n"
    "72 660 78 16 re f 150 660 80 16 re f 230 660 100 16 re f\n"
    "72 630 258 15 re f 72 600 258 15 re f 0 g\n"
    + _sr6_cell(162, 701.5, "UNIT", "F2")
    + _sr6_cell(80, 697, "THING", "F2")
    + _sr6_cell(275, 697, "NOTES", "F2")
    + _sr6_cell(162, 692.5, "PRICE", "F2")
    + _sr6_cell(80, 681, "Widget")
    + _sr6_cell(170, 681, "5")
    + _sr6_cell(233, 681, "a small note")
    + _sr6_cell(80, 671, "Big Long")
    + _sr6_cell(80, 664, "Widget")
    + _sr6_cell(170, 667.5, "8")
    + _sr6_cell(233, 667.5, "a big note")
    + _sr6_cell(80, 651, "Gizmo")
    + _sr6_cell(170, 651, "7")
    + _sr6_cell(233, 651, "b note")
    + "BT /F2 7 Tf 80 635 Td (Extras:) Tj /F1 7 Tf ( spare parts) Tj ET\n"
    + _sr6_cell(80, 621, "Doohickey")
    + _sr6_cell(170, 621, "9")
    + _sr6_cell(233, 621, "c note")
    + _sr6_cell(80, 605, "Spare Kit", "F2")
    + _sr6_cell(80, 590, "Sprocket")
    + _sr6_cell(170, 590, "2")
    + _sr6_cell(233, 590, "d note")
    + "".join(
        f"BT /F3 10.5 Tf 90.16 {540 - 13 * i} Td ({_SR6_LEFT}a{i}) Tj ET\n"
        f"BT /F3 10.5 Tf 304 {540 - 13 * i} Td (b{i} lorem lorem lorem lorem) Tj ET\n"
        for i in range(4)
    )
    + "BT /F4 13 Tf 72 470 Td (A Sidebar Title Across The Two Text Columns) Tj ET\n"
    + "".join(
        f"BT /F3 10.5 Tf 100.16 {450 - 13 * i} Td ({_SR6_LEFT}c{i}) Tj ET\n"
        f"BT /F3 10.5 Tf 314 {450 - 13 * i} Td (d{i} lorem lorem lorem lorem) Tj ET\n"
        for i in range(4)
    )
)


# Lookalikes that are no tables: a numbered list with bold run-in lead-ins, and a stat-box label alone in its column
# (prose beside it in the other). Then a table whose header is set a point smaller than its rows.
SR6_LOOKALIKE_OPS = (
    """BT /F2 8 Tf 72 700 Td (1.) Tj ET
BT /F2 8 Tf 90 700 Td (Easy thing to do for a made up person) Tj ET
BT /F2 8 Tf 90 690 Td (and talking.) Tj /F1 8 Tf ( More plain words) Tj ET
BT /F1 7 Tf 72 650 Td (Quick Step 2,) Tj ET
BT /F2 7 Tf 330 650 Td (Made Powers:) Tj ET
BT /F1 7 Tf 330 641 Td (Zip 3, Zap) Tj ET
BT /F4 13 Tf 72 540 Td (Sledge Ham-) Tj ET
BT /F4 13 Tf 72 527 Td (mer Time) Tj ET
BT /F2 7 Tf 72 500 Td (# OF ZAPS) Tj ET
BT /F2 7 Tf 150 500 Td (EFFECT) Tj ET
BT /F1 7 Tf 72 490 Td (1) Tj ET
BT /F1 7 Tf 150 490 Td (Tingle) Tj ET
BT /F2 6 Tf 72 600 Td (TONIC IS:) Tj ET
BT /F2 6 Tf 150 600 Td (AVAIL) Tj ET
BT /F2 6 Tf 220 600 Td (COST) Tj ET
"""
    + _sr6_cell(72, 590, "Fizz Pop")
    + _sr6_cell(150, 590, "2(L)")
    + _sr6_cell(220, 590, "20")
    + _sr6_cell(72, 580, "Glow Juice")
    + _sr6_cell(150, 580, "4")
    + _sr6_cell(220, 580, "75/")
    + _sr6_cell(220, 572, "80")
    + _sr6_cell(72, 562, "Zing-")
    + _sr6_cell(72, 555, "Zang")
    + _sr6_cell(150, 558.5, "1")
    + _sr6_cell(220, 558.5, "5")
)


# Two text columns 1.5 pt apart (less than a word space: no whitespace gutter), the left one written first in the
# content stream: 41 Times-Roman glyphs of width 500 at 10.5 pt end at 72 + 215.25. Under the left column, a line
# opening with a tiny glyph raised 4 pt, then a bold label set at 9 pt and its value at 10.5, 0.5 pt lower.
SR6_TIGHT_OPS = "".join(
    f"BT /F3 10.5 Tf 72 {700 - 14 * i} Td ({'o' * 40}{i}) Tj ET\n" for i in range(4)
) + "BT /F1 3.8 Tf 72 648 Td (\267) Tj ET\nBT /F2 9 Tf 80 644 Td (Points:) Tj ET\n" "BT /F3 10.5 Tf 118 643.5 Td (2) Tj ET\n" + "".join(
    f"BT /F3 10.5 Tf 288.75 {700 - 14 * i} Td (right{i} words) Tj ET\n" for i in range(4)
)


def sr6_layout_pdf() -> bytes:
    """Six-page PDF in the SR6 layout: a chapter opener, a shop page with a header-band table, side-by-side bands
    with a stat-box label, a shaded table over body text and an offset sidebar, table lookalikes, and two columns
    with no whitespace gutter."""
    return _build_pdf([SR6_CHAPTER_OPS, SR6_SHOP_OPS, SR6_BANDS_OPS, SR6_GRID_OPS, SR6_LOOKALIKE_OPS, SR6_TIGHT_OPS])


# A page whose whole text layer is drawn twice, as some PDFs do: the copy later in the content stream, 0.01 pt off,
# its heading and bold lead-in 2 pt off (more than a char dedupe's 1 pt), and a page number drawn once after it.
# Genuine double letters (Arrow, Kill) and a line whose words split after a ligature. Then a page drawn once with a
# faux-bold heading (drawn twice in a row, 0.3 pt apart). All made up.
def _doubled_layer(dx, dy, hd):
    return (
        f"BT /F4 13 Tf {72 + hd} {700 + hd} Td (Arrow Kill Drill) Tj ET\n"
        f"BT /F2 10.5 Tf {72 + hd} {682 - hd} Td (Bold Lead:) Tj /F3 10.5 Tf ( the fi rst offi ce was diffi cult) Tj ET\n"
        + _sr6_lines(72 + dx, 664 + dy, "Plain words for the doubled page, line", 5)
    )


SR6_DOUBLED_OPS = _doubled_layer(0, 0, 0) + _doubled_layer(0.01, -0.01, 2) + "BT /F3 10.5 Tf 300 20 Td (9) Tj ET\n"
SR6_FAUX_BOLD_OPS = (
    "BT /F4 13 Tf 72 700 Td (Faux Bold Heading) Tj ET\nBT /F4 13 Tf 72.3 700 Td (Faux Bold Heading) Tj ET\n"
    + _sr6_lines(72, 680, "Plain words for the single page, line", 5)
)


def sr6_doubled_pdf() -> bytes:
    """Two-page PDF in the SR6 layout: a page with its text layer drawn twice, then a page drawn once."""
    return _build_pdf([SR6_DOUBLED_OPS, SR6_FAUX_BOLD_OPS])


# A magazine-style book (all made up): every page opens with a running head and a page number in the display face
# (30 pt and 20 pt, top band), which take no heading level. Page 2: a `Game Information` heading, then two text
# columns sharing their baselines (the left one first in the content stream), a kind heading and an item heading in
# the left one, an item heading in the right one, and under both a full-width box whose title sits at the box's margin,
# left of the left column. Page 3 sets a kicker (`Kicker Part:`) over its heading: two headings. Page 4: two header
# bands in the two text columns, 8 pt apart: two tables. Page 5: a title at the foot of the left column over a
# full-width table under both columns.
def _magazine_head(n):
    return f"BT /F4 30 Tf 150 750 Td (MADE UP TITLE) Tj ET\nBT /F4 20 Tf 540 752 Td ({n}) Tj ET\n"


def _box(y):
    line = "box words run across both of the columns on this page " * 2
    return "BT /F4 13 Tf 60 470 Td (Box Title) Tj ET\n" + "".join(
        f"BT /F3 10.5 Tf 60 {y - 14 * i} Td ({line}{i}) Tj ET\n" for i in range(6)
    )


SR6_MAGAZINE_OPS = [
    _magazine_head(1)
    + "BT /F4 40 Tf 72 650 Td (CHAPTER ONE) Tj ET\n"
    + _sr6_lines(72, 620, "Opening words of the book", 6),
    _magazine_head(2)
    + "BT /F4 21 Tf 90 690 Td (Game Information) Tj ET\n"
    + _sr6_lines(90, 670, "Left words", 2)
    + "BT /F4 15 Tf 90 642 Td (POSITIVE QUALITIES) Tj ET\n"
    + "BT /F4 13 Tf 90 628 Td (Cool Thing) Tj ET\n"
    + _sr6_lines(90, 614, "Cool words", 3)
    + "BT /F4 13 Tf 330 663 Td (Other Thing) Tj ET\n"
    + _sr6_lines(330, 642, "Right words", 6)
    + _box(450),
    _magazine_head(3)
    + "BT /F4 9 Tf 72 704 Td (Kicker Part:) Tj ET\nBT /F4 13 Tf 72 690 Td (Third Thing) Tj ET\n"
    + _sr6_lines(72, 670, "Third words", 4),
    _magazine_head(4)
    + "BT /F4 13 Tf 72 690 Td (Fourth Thing) Tj ET\n"
    + _sr6_lines(72, 670, "Fourth words", 4)
    + "".join(_sr6_cell(x, 600, t, "F2") for x, t in ((140, "HAND"), (180, "ACCEL"), (220, "BOD"), (250, "COST")))
    + "".join(_sr6_cell(x, 590, t) for x, t in ((140, "3/4"), (180, "9"), (220, "6"), (250, "900")))
    + "".join(_sr6_cell(x, 608, t, "F2") for x, t in ((320, "PILOT"), (360, "SEAT"), (400, "AVAIL"), (440, "COST")))
    + "".join(_sr6_cell(x, 598, t) for x, t in ((320, "2"), (360, "1"), (400, "3"), (440, "700"))),
    _magazine_head(5)
    + "".join(
        f"BT /F3 10.5 Tf 90 {690 - 14 * i} Td (Fifth left words {i}) Tj ET\n"
        f"BT /F3 10.5 Tf 330 {690 - 14 * i} Td (Fifth right words {i}) Tj ET\n"
        for i in range(5)
    )
    + "BT /F4 13 Tf 90 600 Td (Boxed Gadget) Tj ET\n"
    + "".join(_sr6_cell(x, 585, t, "F2") for x, t in ((90, "SIZE"), (200, "MODE"), (330, "AVAIL"), (450, "COST")))
    + "".join(_sr6_cell(x, 575, t) for x, t in ((90, "1-6"), (200, "SA"), (330, "4"), (450, "900"))),
]


def sr6_magazine_pdf() -> bytes:
    return _build_pdf(SR6_MAGAZINE_OPS)
