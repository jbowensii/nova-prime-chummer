# Krime Katalog (KK): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `kk.py`): 41 pages, its page numbers the PDF's
(`PAGE_OFFSET` 0). No index or reprinted tables.

## Item shapes

- The running head (KRIME KATALOG, 43 pt) and the page number (26 pt) are page furniture the converter drops (importer
  v4: a top-band line repeated on most pages). Recipe hints: `HEADING_LEVELS` keeps the book's own sizes at the levels
  they had (27 pt level 2, 21 pt level 4, 15 pt level 5), and `prepare_md` puts the running head back as each page's
  chapter heading: each page is a chapter in regroup's output (its list tables pair within the page). A page's lead
  block continues the item before it (an item whose stats print on the next page).
- Weapons and vehicles: a level-2 heading per item, its text, then a caption naming the edition (`<item>: sr5 stats
  <item>: sr6 stats`, sometimes at the end of a comment line) over one table holding both editions' columns: the SR6
  half is the columns after the first COST. A caption naming SR6 alone (`<item>: sr6 stats`) is followed by its own
  tables (a vehicle's stats in two tables, joined; a NAME table: one row a vehicle). A caption naming SR5 alone ends
  the SR6 stats. An item with several SR6 captions (`krime soldier GL`, `krime PARTY (FRAG)`) is several entries,
  named by what the caption adds to the heading. `ATTACK` + `RATINGS …` (the header printed over two lines) is the
  attack ratings.
- A caption naming both editions over a vehicle's two bands (Krime Runner): the SR5 half prints its price in the first
  band (`DAM AP BLAST AVAIL COST`), the SR6 half's first band follows it on the same row and its second band is the
  next table printing a price of its own (`PILOT SENS SEAT AVAIL COST`); the SR5 half's second band (no price) is left
  out. A header cell the converter split one word off (`SPEED` | `INT.TOP SPEED`) is mended (`SPEED INT.` | `TOP
  SPEED`).
- Weapon accessories and ammunition: level-5 headings with their text, then one caption over both editions' list
  tables (accessories: two NAME tables, the second SR6; ammunition: one table, its SR6 half a TYPES list set in narrow
  columns: names over two rows, an attack rating over three, two items run into one row): joined back into one row an
  item, each taking its heading's text. Ammunition is gear (category ammo); its AR and DV modifiers go to the text, its
  cost is a multiplier (reported as a book value).
- Grenades: a caption over both editions' grenade tables (`DV GZ | DV CLOSE | DV NEAR | BLAST`); one with SR5 stats
  only stays a rule section.
- Weapon categories: the book names no weapon class in a heading or table: firearms, grenades, weapon-accessories.
  Vehicles: category vehicles.
- Not read, reported (missing-value): stats printed as text lines (the AKM-97 assault rifle, the Ditch shotgun) and the
  rows broken over the notes (Krime Carpet, Krime Runner).

## Formula styles and issues (importer v2)

- `x2`, `x3` (a multiple of the base item's price): an `ambiguous` issue stating the rule (`base*2`).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)
- Issues: a vehicle row read in part (no speed columns) gets `missing` per stat.

## Sections read as kinds (importer v3, sections.py)

- **Ammunition types:** the Krime ammunition rows priced `xN` (a multiple of the ammunition they replace).

## Commlink6 check (importer v4)

- Stat matching (cl6check): Commlink6 names three grenade rows as 'Grenade, <name>'; their stats find them (3 renames).

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Krime Katalog-Gear Catalog-none.pdf>" --out "%TEMP%\kk-check"

## Importer v5

- The converter now reads the two editions' boxes as tables of their own (no longer one wide table): an SR6 caption's
  subject is paired, in order, with the next run of tables in Sixth Edition columns (DV and attack ratings; a vehicle's
  speed interval), one-row bands joined until a price (`_sets_by_header`). Fifth Edition tables (`DAM`, `AP`, `ACC`,
  `RC`, a vehicle's single `SPEED`) are skipped. A grid of four boxes (both captions over the first two) pairs alike.
  `COST MULT.` is the ammunition list's `COST MULTIPLIER`.
