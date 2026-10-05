# Krime Katalog (KK): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `kk.py`): 41 pages, its page numbers the PDF's
(`PAGE_OFFSET` 0). No index or reprinted tables.

## Item shapes

- The running head (KRIME KATALOG) reads as a level-1 heading on every page and the page number as a level-2 one:
  each page is a chapter in regroup's output. A page's lead block continues the item before it (an item whose stats
  print on the next page).
- Weapons and vehicles: a level-2 heading per item, its text, then a caption naming the edition (`<item>: sr5 stats
  <item>: sr6 stats`, sometimes at the end of a comment line) over one table holding both editions' columns: the SR6
  half is the columns after the first COST. A caption naming SR6 alone (`<item>: sr6 stats`) is followed by its own
  tables (a vehicle's stats in two tables, joined; a NAME table: one row a vehicle). A caption naming SR5 alone ends
  the SR6 stats. An item with several SR6 captions (`krime soldier GL`, `krime PARTY (FRAG)`) is several entries,
  named by what the caption adds to the heading. `ATTACK` + `RATINGS …` (the header printed over two lines) is the
  attack ratings.
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

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Krime Katalog-Gear Catalog-none.pdf>" --out "%TEMP%\kk-check"
