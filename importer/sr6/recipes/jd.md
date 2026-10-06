# SR6 Johnson 'Dex (JD): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `jd.py`): 42 card pages (5 × 3 in, 360 × 216 pt), no page
numbers (`PAGE_OFFSET` 0: PDF pages); the back cover (`END_PAGE`) is left out. The converter keeps a card's text to its
edges (no margin furniture on a page under 6 in wide) and drops its sideways copyright line. Card titles in Njord at 16
pt (the guess reads them).

## Item shapes

- A Mr. Johnson is two cards: the front (`# NAME`, a `FEMALE DWARF` line, the bio, the deck's footer) and the back
  (`## NAME` or `# NAME` again, `Plot Hooks` labelled lines, `STATS`, `FAVORS` labelled lines, the metatype line again
  at the end). STATS is a bold line of headers (`B A R S W L I C EDG [M] ESS`) over a line of values (a value's `(6)`
  printed apart, two run together: `2(+4)3(7)`), then `Skills:` (or `Active Skills:`/`Knowledge Skills:`), `Gear
  Level:`, `Other:`. A `stats` heading set small runs into the plot hooks' box: the stat line is found in any box of
  the card.
- Each Johnson becomes a contact (archetype Mr. Johnson) and its stat block an NPC (group Contact), named by the card
  title (`HERA ‘LEGS’ ANDERSON` -> `Hera ‘Legs’ Anderson`, `M c SWEENEY` -> `McSweeney`); the bio, plot hooks, gear
  level, other gear and favors are its text.
- ABOUT THIS DECK (gear level, earning favors): rule sections.

## Formula styles and issues (importer v2)

- No formula styles: the book prints plain numbers. A field it leaves empty gets an `<issue>` (missing).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Johnson 'Dex-Runner Resource Book-CAT28508.pdf>" --out "%TEMP%\jd-check"
