# SR6 Wild Life (WL): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `wl.py`, the latest copy): 194 pages, 612 × 765 pt, every
page's text drawn twice (the converter keeps the first layer), printed page = PDF page − 1 (`PAGE_OFFSET`). The
converter's guessed heading sizes are right (60, 21, 15, 13, 9). No index or reprinted tables at the back.

## Item shapes

- Critters (the ten habitat chapters, GRASSLANDS AND PLAINS … URBAN ENVIRONMENTS): a level-3 section with the
  description, then one or more boxes: a level-5 lower-case title, the `B A R S W L I C (M) ESS` and `DR I/ID AC CM
  MOVE` bands and the labels (`Skills:`, `Powers:`, `Weakness:`/`Weaknesses:`, `Weapons:` over one weapon a line,
  `Qualities:`, `Note:`). The habitat is the category. A box takes the text of the section of its name (some print
  before their section, or inside the one before) else the one it sits in; a section whose box title read as a table
  title (bands followed by prose, not labels) holds the bands in its text: it is the critter. Sidebars and art captions
  (`// NAME //`) cut into a few boxes. One box's bands run into another column's prose, its labels after the next
  box's garbled band (the trojan rat): prepare() makes its title an item heading, so it keeps its bands and labels
  (its text: its section's, and that prose).
- A few boxes add a Matrix or astral band (`MATRIX DR`, `M DR`, `ASTRAL AC`): unknown columns, their values in the text.
- Critter powers (ON THE CARE AND FEEDING OF CRITTERS, after Critter Gear; the "Critter Powers & Rules" title prints
  as body text): level-3 sections with a `TYPE ACTION RANGE DURATION` band. The book prints no weaknesses section:
  a power the stat blocks list under `Weakness(es):` (Fragile, Carrier) is marked `weakness="true"`.
- Critter gear: a `GEAR DEFENSE RATING CAPACITY AVAIL COST` table (its items described by labelled lines above it),
  gear category critter-gear; prices are formulas of the critter's Body (book-value).
- Critter companion qualities (positive and negative, `Cost:`/`Bonus: N Karma`) are for critters, not characters:
  rules, with the edge actions, commands, training and statuses.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Wild Life-Core Critter Book-CAT28008.pdf>" --out "%TEMP%\wl-check"
